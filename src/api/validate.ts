/*
 * Copyright (c) 2026 GGN contributors.
 *
 * This file is part of ggn-layout. It is original work of the GGN project and
 * is made available under the terms of the MIT License.
 *
 * SPDX-License-Identifier: MIT
 * License text: LICENSE.
 */
import { LayoutError, LayoutErrorCode } from './errors.js'
import type { LayoutIssue } from './errors.js'
import { isSupportedAlgorithm } from './algorithms.js'

interface InputObject {
  [key: string]: unknown
}

interface EndpointIndex {
  readonly nodeIds: Set<string>
  readonly portRefs: Set<string>
}

function isPlainObject(value: unknown): value is InputObject {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function joinPath(parent: string, child: string): string {
  return parent ? `${parent}.${child}` : child
}

function childPath(parent: string, field: string, index: number): string {
  return `${parent ? `${parent}.` : ''}${field}[${index}]`
}

function addIssue(issues: LayoutIssue[], code: LayoutErrorCode, path: string, message: string): void {
  issues.push({
    code,
    path,
    message: `${code} at ${path || 'root'}: ${message}`,
    retryable: false,
  })
}

function validateSize(value: unknown, path: string, issues: LayoutIssue[]): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    addIssue(issues, LayoutErrorCode.NON_FINITE_SIZE, path, 'size must be a finite number')
  } else if (value < 0) {
    addIssue(issues, LayoutErrorCode.NEGATIVE_SIZE, path, 'size must be greater than or equal to zero')
  }
}

function validateDimensions(value: InputObject, path: string, issues: LayoutIssue[]): void {
  for (const dimension of ['width', 'height'] as const) {
    if (dimension in value) validateSize(value[dimension], joinPath(path, dimension), issues)
  }
}

function validateAlgorithm(value: InputObject, path: string, nodeId: string | undefined, issues: LayoutIssue[]): void {
  const options = value.layoutOptions
  if (!isPlainObject(options)) return

  for (const key of ['org.eclipse.elk.algorithm', 'elk.algorithm']) {
    if (!(key in options)) continue
    const raw = options[key]
    // 空字符串 = 未指定算法（默认 layered），不是错误（与 dispatch 语义一致）。
    if (typeof raw === 'string' && raw.trim() === '') continue
    if (!isSupportedAlgorithm(raw)) {
      addIssue(
        issues,
        LayoutErrorCode.UNSUPPORTED_ALGORITHM,
        joinPath(path, `layoutOptions.${key}`),
        `algorithm ${JSON.stringify(raw)} on node ${JSON.stringify(nodeId ?? 'root')} is not supported`,
      )
    }
  }
}

function collectNodeAndPortIds(
  value: unknown,
  path: string,
  issues: LayoutIssue[],
  endpointIndex: EndpointIndex,
  seenObjects: WeakSet<object>,
  isRoot: boolean,
): void {
  if (!isPlainObject(value)) {
    addIssue(
      issues,
      isRoot ? LayoutErrorCode.INVALID_INPUT : LayoutErrorCode.MISSING_ID,
      path || 'root',
      isRoot ? 'root input must be a plain object' : 'child node must be a plain object with a non-empty string id',
    )
    return
  }

  if (seenObjects.has(value)) {
    addIssue(issues, LayoutErrorCode.CYCLIC_REFERENCE, path || 'root', 'object is referenced more than once in the input tree (cycle or shared reference)')
    return
  }
  seenObjects.add(value)

  const id = value.id
  const validId = typeof id === 'string' && id.trim().length > 0
  if (!validId) {
    addIssue(
      issues,
      isRoot ? LayoutErrorCode.INVALID_INPUT : LayoutErrorCode.MISSING_ID,
      isRoot ? 'root' : path,
      isRoot ? 'root input must have a non-empty string id' : 'child node must have a non-empty string id',
    )
  } else if (endpointIndex.nodeIds.has(id)) {
    addIssue(issues, LayoutErrorCode.DUPLICATE_ID, path || 'root', `node id ${JSON.stringify(id)} is duplicated`)
  } else {
    endpointIndex.nodeIds.add(id)
  }

  validateDimensions(value, path, issues)
  validateAlgorithm(value, path, validId ? (id as string) : undefined, issues)

  const nodeId = validId ? (id as string) : undefined
  const ports = value.ports
  if (Array.isArray(ports)) {
    for (let index = 0; index < ports.length; index += 1) {
      const port = ports[index]
      const portPath = childPath(path, 'ports', index)
      if (!isPlainObject(port)) continue
      validateDimensions(port, portPath, issues)
      const portId = port.id
      if (nodeId !== undefined && typeof portId === 'string' && portId.trim().length > 0) {
        endpointIndex.portRefs.add(`${nodeId}.${portId}`)
        endpointIndex.portRefs.add(portId)
      }
    }
  }

  const children = value.children
  if (Array.isArray(children)) {
    for (let index = 0; index < children.length; index += 1) {
      collectNodeAndPortIds(
        children[index],
        childPath(path, 'children', index),
        issues,
        endpointIndex,
        seenObjects,
        false,
      )
    }
  }
}

/** 端点解析规则镜像 shared/elkgraph-builder.resolveRef：
 * ref 是节点 id，或最后一个点号前缀是节点 id（"group.g1" → 前缀 "group" 是节点即通过）。
 * 端口存在性 builder 不校验，此处同样不校验，避免误伤合法输入。
 */
function endpointExists(reference: string, endpointIndex: EndpointIndex): boolean {
  if (endpointIndex.nodeIds.has(reference)) return true
  const dot = reference.lastIndexOf('.')
  return dot !== -1 && endpointIndex.nodeIds.has(reference.slice(0, dot))
}

function validateEdges(value: unknown, path: string, issues: LayoutIssue[], endpointIndex: EndpointIndex): void {
  if (!isPlainObject(value)) return
  const edges = value.edges
  if (!Array.isArray(edges)) return

  for (let edgeIndex = 0; edgeIndex < edges.length; edgeIndex += 1) {
    const edge = edges[edgeIndex]
    const edgePath = childPath(path, 'edges', edgeIndex)
    if (!isPlainObject(edge)) {
      addIssue(issues, LayoutErrorCode.EMPTY_ENDPOINTS, edgePath, 'edge must contain non-empty sources and targets arrays')
      continue
    }

    for (const side of ['sources', 'targets'] as const) {
      const endpoints = edge[side]
      const endpointPath = joinPath(edgePath, side)
      if (
        !Array.isArray(endpoints) ||
        endpoints.length === 0 ||
        endpoints.some((endpoint) => typeof endpoint !== 'string')
      ) {
        addIssue(issues, LayoutErrorCode.EMPTY_ENDPOINTS, endpointPath, `${side} must be a non-empty string array`)
        continue
      }
      // P0 只支持单源单目标；hyperedge 显式拒绝，避免静默截断造成错误关联。
      if (endpoints.length > 1) {
        addIssue(issues, LayoutErrorCode.MULTI_ENDPOINTS, endpointPath, `${side} must contain exactly one endpoint (hyperedge not supported in P0)`)
        continue
      }

      const reference = endpoints[0]
      if (!endpointExists(reference, endpointIndex)) {
        addIssue(
          issues,
          LayoutErrorCode.DANGLING_ENDPOINT,
          `${endpointPath}[0]`,
          `endpoint reference ${JSON.stringify(reference)} does not resolve to a node or port`,
        )
      }
    }
  }

  const children = value.children
  if (Array.isArray(children)) {
    for (let index = 0; index < children.length; index += 1) {
      validateEdges(children[index], childPath(path, 'children', index), issues, endpointIndex)
    }
  }
}

/**
 * 校验布局图输入（只读，不触发布局、不修改输入）。
 * 返回全部问题，便于调用方一次修复多个路径；校验问题一律 retryable=false。
 */
export function validateLayoutInput(input: unknown): LayoutIssue[] {
  const issues: LayoutIssue[] = []
  if (!isPlainObject(input)) {
    addIssue(issues, LayoutErrorCode.INVALID_INPUT, 'root', 'root input must be a plain object')
    return issues
  }

  const endpointIndex: EndpointIndex = { nodeIds: new Set(), portRefs: new Set() }
  collectNodeAndPortIds(input, '', issues, endpointIndex, new WeakSet(), true)
  validateEdges(input, '', issues, endpointIndex)
  return issues
}

/** 首个问题即抛结构化 LayoutError（phase='validate'）。 */
export function assertValidLayoutInput(input: unknown): void {
  const issues = validateLayoutInput(input)
  const first = issues[0]
  if (first === undefined) return

  throw new LayoutError(first.code, first.path, first.message, {
    phase: 'validate',
    details: { issues },
  })
}
