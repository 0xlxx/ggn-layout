/*
 * Copyright (c) 2026 GGN contributors.
 * Portions derived from the Eclipse Layout Kernel (ELK), Copyright (c) Kiel University and others.
 *
 * This file is part of ggn-layout, a TypeScript port of ELK v0.12.0.
 * Upstream attribution and source range: see THIRD_PARTY_NOTICES.md.
 *
 * SPDX-License-Identifier: EPL-2.0
 * License text: LICENSES/EPL-2.0.txt.
 */
/**
 * 高层布局 API: layoutElkJson — 等价 elkjs 的图布局服务.
 *
 * 输入/输出均为 ELK 标准 JSON (ElkGraphJson 形态):
 *   - 输入: 嵌套 ElkNode 树 (children/ports/edges + layoutOptions), 边用 sources/targets 引用.
 *   - 输出: 同结构 + 节点 x/y/width/height, 边 sections[].{startPoint,endPoint,bendPoints}.
 *
 * 对比 elkjs: elkjs 输出自带完整路由 section (黑盒), 消费方零组装;
 * 本 API 把 LGraph 布局结果组装成相同形态 — 端口锚点/坐标系投影/端点拼装在库内完成,
 * 消费方不再需要自己处理 (避免 demo-vite 曾因"端口位置 vs 锚点"渲染斜线).
 */
import { LGraph } from '../graph/lgraph.js'
import { LNode } from '../graph/lnode.js'
import { LPort } from '../graph/lport.js'
import { LEdge } from '../graph/ledge.js'
import { LayeredLayoutProvider } from '../layered-layout-provider.js'
import { getEdgeEndpoints } from '../graph/lgraph-util.js'
import { DIRECTION, HIERARCHY_HANDLING } from '../options/layered-options.js'
import { getAlg } from './registry.js'
import { buildLGraphFromParsed, elkJsonToParsed, shortOptKeys, type ParsedGraph } from '../../shared/elkgraph-builder.js'
import { assertValidLayoutInput } from './validate.js'
import { LayoutError, LayoutErrorCode } from './errors.js'
import type { LayoutControl, LayoutPhase } from './control.js'

declare const process: { env: Record<string, string | undefined> }

// ── 类型 ──

export interface ElkPoint {
  x: number
  y: number
}

export interface ElkEdgeSection {
  startPoint: ElkPoint
  endPoint: ElkPoint
  bendPoints?: ElkPoint[]
}

export interface ElkPort {
  id: string
  x?: number
  y?: number
  width?: number
  height?: number
  layoutOptions?: Record<string, unknown>
  properties?: Record<string, unknown>
}

export interface ElkEdge {
  id?: string
  sources: string[]
  targets: string[]
  sections?: ElkEdgeSection[]
  layoutOptions?: Record<string, unknown>
  [k: string]: unknown
}

export interface ElkNode {
  id: string
  x?: number
  y?: number
  width?: number
  height?: number
  layoutOptions?: Record<string, unknown>
  properties?: Record<string, unknown>
  ports?: ElkPort[]
  /** 节点标签 (ELK JSON: [{text, x?, y?, width?, height?}]). */
  labels?: { text: string; x?: number; y?: number; width?: number; height?: number }[]
  children?: ElkNode[]
  edges?: ElkEdge[]
  [k: string]: unknown
}

export interface ElkLayoutOptions {
  /** 布局方向: RIGHT | LEFT | DOWN | UP (默认 RIGHT). */
  direction?: 'RIGHT' | 'LEFT' | 'DOWN' | 'UP'
  /** 随机种子 (默认 1, 与 elkjs 一致). */
  randomSeed?: number
  /** 层级处理 (默认 OFF; 有 children 时自动 INCLUDE_CHILDREN). */
  hierarchyHandling?: 'INCLUDE_CHILDREN' | 'SEPARATE' | 'OFF'
  /** 额外图级 layoutOptions (完整 ELK 属性 id), 直接 setProperty. */
  layoutOptions?: Record<string, unknown>
  /** 输出形态: full (默认), concise (只保留布局几何), summary (扁平摘要). */
  responseFormat?: 'full' | 'concise' | 'summary'
  /** full 输出中额外保留的节点字段；id 与布局几何字段始终保留。仅作用于 full；concise/summary 已固定裁剪，忽略 pick。 */
  pick?: readonly string[]
  /** 同步布局的阶段进度与合作式取消控制。 */
  control?: LayoutControl
  /** black-box（非 layered provider 子树）布局完成后回调——每个 black-box 节点布局完立即同步调用
   *（深度优先，子先于父），可在父 provider 布局前就地调整该节点容器尺寸/布局选项（如黑盒 group
   * 标题 padding 预留）——父内部边因此锚定调整后的边界，且避免整图二次布局。
   * 返回 true 时该节点按调整后选项重跑一次 provider（子节点重排，如对称 padding 后内容居中）。
   * 可选：缺省时行为与无回调完全一致。 */
  onBlackBoxLaidOut?: (node: ElkNode) => boolean | void
}

/** 布局 API 接受的开放 ELK JSON 图形态。 */
export interface LayoutInput {
  id: string
  x?: number
  y?: number
  width?: number
  height?: number
  layoutOptions?: Record<string, unknown>
  properties?: Record<string, unknown>
  ports?: ElkPort[]
  labels?: { text: string; x?: number; y?: number; width?: number; height?: number }[]
  children?: LayoutInput[]
  edges?: ElkEdge[]
  [k: string]: unknown
}

/** 输出边：保留输入自定义字段（full 保真），sections 仅当边已路由时存在。 */
export interface LayoutOutputEdge {
  id?: string
  sources: string[]
  targets: string[]
  sections?: ElkEdgeSection[]
  layoutOptions?: Record<string, unknown>
  properties?: Record<string, unknown>
  labels?: { text: string; x?: number; y?: number; width?: number; height?: number }[]
  [k: string]: unknown
}

/** full/concise 输出的同构图形态；节点布局几何字段为必填。
 * full 保真保留输入扩展字段（自定义字段经 `[k: string]: unknown` 可访问）；
 * concise 只保留固定几何字段。
 */
export interface LayoutOutput {
  id: string
  x: number
  y: number
  width: number
  height: number
  layoutOptions?: Record<string, unknown>
  properties?: Record<string, unknown>
  ports?: ElkPort[]
  labels?: { text: string; x?: number; y?: number; width?: number; height?: number }[]
  children?: LayoutOutput[]
  edges?: LayoutOutputEdge[]
  [k: string]: unknown
}

/** 面向 agent/消费方的扁平布局摘要；坐标保持输出中的相对坐标语义。
 * 约定：不包含 root 节点自身（只含其 children 子树节点）；只包含**已路由**的
 * 单源单目标边（无 sections 的边不进入摘要）。
 */
export interface LayoutSummary {
  nodes: Array<{ id: string; x: number; y: number; width: number; height: number }>
  edges: Array<{
    id?: string
    sources: [string]
    targets: [string]
    startPoint: ElkPoint
    endPoint: ElkPoint
  }>
  width?: number
  height?: number
}

/**
 * 复制纯 JSON 输入，确保 provider 和坐标投影只能修改本次调用的工作副本。
 * 输入契约是 JSON 数据（普通对象、数组和 JSON 基本值），因此不复制原型或实例状态。
 */
function cloneJsonValue<T>(value: T, seen?: WeakMap<object, unknown>): T {
  if (Array.isArray(value)) {
    const copy: unknown[] = []
    if (seen) seen.set(value, copy)
    for (const item of value) copy.push(cloneJsonValue(item, seen))
    return copy as T
  }
  if (value !== null && typeof value === 'object') {
    const existing = seen?.get(value)
    if (existing !== undefined) return existing as T
    const copy: Record<string, unknown> = {}
    if (seen) seen.set(value, copy)
    // defineProperty 避免 "__proto__" 等键触发原型 setter。
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      Object.defineProperty(copy, key, { value: cloneJsonValue(child, seen), enumerable: true, writable: true, configurable: true })
    }
    return copy as T
  }
  return value
}

/**
 * Enter one synchronous pipeline phase. Cancellation is deliberately checked
 * only here: inner layout loops are not instrumented for immediate abort.
 */
function enterPhase(control: LayoutControl | undefined, phase: LayoutPhase, completed: number, graphId?: string): void {
  if (control?.signal?.aborted) {
    throw new LayoutError(LayoutErrorCode.ABORTED, 'root', `布局在 ${phase} 阶段被取消`, { phase })
  }
  control?.onProgress?.({ phase, completed, ...(graphId === undefined ? {} : { graphId }) })
  // 回调内可能触发 abort → 立即复查，下一阶段前生效。
  if (control?.signal?.aborted) {
    throw new LayoutError(LayoutErrorCode.ABORTED, 'root', `布局在 ${phase} 阶段回调后被取消`, { phase })
  }
}

// ── build: ElkGraph JSON → LGraph ──

export interface BuiltGraph {
  graph: LGraph
  /** 节点 id → LNode. */
  nodeOf: Map<string, LNode>
  /** 端口引用 "nodeId.portId" → LPort. */
  portOf: Map<string, LPort>
  /** LNode → 输入 id (extract 用). */
  nodeRef: Map<LNode, string>
  /** LPort → 引用 "nodeId.portId" (extract 用). */
  portRef: Map<LPort, string>
  /** 原始边 (构建时创建; 布局产生的 dummy 边不输出). */
  edgeSet: Set<LEdge>
  /** 容器图 → 对应输出节点 id (extract 用). */
  graphToNodeId: Map<LGraph, string>
  /** 根输入节点 (输出结构重建用). */
  root: ElkNode
}

export function buildGraph(root: ElkNode, options?: ElkLayoutOptions, blackBoxIds?: Set<string>): BuiltGraph {
  // 与已验证的共享 builder (buildLGraphFromParsed) 对齐 — 单一 JSON→LGraph 实现, 消除
  // 第 4 份简化导入的不一致 (verify-elkg-java-layout 全量 348 实测 api 路径 156 模型分歧).
  // elkJsonToParsed 默认剥 'N' 前缀 (elktToElkJson 契约); 公开 API 接受任意 ELK JSON,
  // id 必须原样保留 → stripNPrefix: false (节点 id 含点/以 N 开头均不被破坏).
  const opts: Record<string, unknown> = { ...(options?.layoutOptions ?? {}), ...(root.layoutOptions ?? {}) }
  const parsed = elkJsonToParsed(root, { stripNPrefix: false, blackBoxIds }) as unknown as ParsedGraph
  // api options → graphProps (覆盖 JSON): direction/randomSeed/hierarchyHandling/layoutOptions
  Object.assign(parsed.graphProps, shortOptKeys(options?.layoutOptions ?? {}))
  if (options?.direction) parsed.graphProps.direction = options.direction
  if (options?.randomSeed !== undefined) parsed.graphProps.randomSeed = String(options.randomSeed)
  if (options?.hierarchyHandling) parsed.graphProps.hierarchyHandling = options.hierarchyHandling
  // 默认值 (旧 buildGraph 语义): direction RIGHT / randomSeed 1 / 有嵌套子图 → INCLUDE_CHILDREN
  if (parsed.graphProps.direction === undefined) {
    parsed.graphProps.direction = opts['org.eclipse.elk.direction'] ?? opts['elk.direction'] ?? 'RIGHT'
  }
  if (parsed.graphProps.randomSeed === undefined) parsed.graphProps.randomSeed = '1'
  if (parsed.graphProps.hierarchyHandling === undefined) {
    const hasNested = (root.children ?? []).some((c) => (c.children?.length ?? 0) > 0)
    parsed.graphProps.hierarchyHandling = hasNested ? 'INCLUDE_CHILDREN' : 'OFF'
  }

  const built = buildLGraphFromParsed(parsed, root.id)

  // ── 组装 BuiltGraph 映射 (extract 用): nodeRef/portRef/edgeSet/graphToNodeId ──
  const nodeRef = new Map<LNode, string>()
  const nodeOf = new Map<string, LNode>()
  for (const [i, n] of built.nodeOf) {
    const id = parsed.nodes[i]
    nodeRef.set(n, id)
    nodeOf.set(id, n)
    // R49: 有子的 black-box 节点标记 SEPARATE_CHILDREN (对齐 Java RecursiveGraphLayoutEngine L208),
    // P3 排序据此排层尾; leaf 带算法节点不标记 (普通节点).
    if (blackBoxIds?.has(id)) n.setProperty(HIERARCHY_HANDLING, 'SEPARATE_CHILDREN')
  }
  const portOf = new Map<string, LPort>()
  const portRef = new Map<LPort, string>()
  for (const [i, n] of built.nodeOf) {
    const nodeId = parsed.nodes[i]
    const ports = parsed.nodeProps.get(nodeId)?.ports ?? []
    const lports = n.getPorts()
    for (let pi = 0; pi < ports.length && pi < lports.length; pi++) {
      const ref = `${nodeId}.${ports[pi].id}`
      portOf.set(ref, lports[pi])
      portRef.set(lports[pi], ref)
    }
  }
  const graphToNodeId = new Map<LGraph, string>()
  graphToNodeId.set(built.graph, root.id)
  const walkNested = (g: LGraph): void => {
    for (const n of g.getAllNodes()) {
      const ng = n.getNestedGraph()
      if (ng) {
        const id = nodeRef.get(n)
        if (id !== undefined) graphToNodeId.set(ng, id)
        walkNested(ng)
      }
    }
  }
  walkNested(built.graph)
  // 原始边集合 (布局前图中全部边均为原始边; 布局产生的 dummy 边不输出)
  const edgeSet = new Set<LEdge>()
  const walkEdges = (g: LGraph): void => {
    for (const n of g.getAllNodes()) {
      for (const p of n.getPorts()) {
        for (const e of p.getOutgoingEdges()) edgeSet.add(e)
      }
      const ng = n.getNestedGraph()
      if (ng) walkEdges(ng)
    }
  }
  walkEdges(built.graph)

  return { graph: built.graph, nodeOf, portOf, nodeRef, portRef, edgeSet, graphToNodeId, root }
}

// ── extract: LGraph → ElkGraph JSON (对齐 elkjs 输出) ──

/** 边挂载容器节点 (LCA): 两端端口所属节点的最深公共祖先节点; null = root 容器.
 * ELK 语义: 边挂在 LCA 容器节点的 edges, sections 坐标相对该容器内容 (elkjs 对照确认:
 * N4.P8→N4.N6.P13 挂 N4.edges (坐标相对 N4 内容), N4.P7→N15.P32 挂 root.edges).
 * 自环例外 (srcNode === tgtNode): 边端点端口在节点边界, 边位于**节点所在图** (父容器) —
 * elkjs/jar 实证 298 N1.P2→N1.P5 挂 root.edges 而非 N1.edges (fixedSide/free/label/south 等
 * 普通自环 32+58+... 边差异同根因). 故自环挂在源节点所在图的父节点 (root → null). */
function lcaNode(edge: LEdge): LNode | null {
  const srcNode = edge.getSource()?.getNode()
  const tgtNode = edge.getTarget()?.getNode()
  if (!srcNode || !tgtNode) return null
  if (srcNode === tgtNode) {
    return srcNode.getGraph()?.getParentNode() ?? null
  }
  const ancestors = new Set<LNode>()
  let n: LNode | null = srcNode
  while (n) { ancestors.add(n); n = n.getGraph()?.getParentNode() ?? null }
  n = tgtNode
  while (n) { if (ancestors.has(n)) return n; n = n.getGraph()?.getParentNode() ?? null }
  return null
}

export function extractGraph(graph: LGraph, built: BuiltGraph): ElkNode {
  const out: ElkNode = { ...built.root }
  // 根节点同样保留输入元数据；children/edges 随后由 extract 按现有挂载语义重建。
  delete out.children
  delete out.edges
  const nodeIdToElk = new Map<string, ElkNode>()
  const inputNodes = new Map<string, ElkNode>()
  const inputParents = new Map<string, string | null>()
  type InputEdgeRecord = { edge: ElkEdge; consumed: boolean }
  const inputEdgesByKey = new Map<string, InputEdgeRecord[]>()

  const edgeKey = (containerId: string, source: string, target: string): string =>
    JSON.stringify([containerId, source, target])
  const nodeIdOfRef = (ref: string): string | null => {
    if (inputNodes.has(ref)) return ref
    const dot = ref.lastIndexOf('.')
    const nodeId = dot === -1 ? ref : ref.slice(0, dot)
    return inputNodes.has(nodeId) ? nodeId : null
  }
  const inferredContainerId = (sources: string[], targets: string[]): string => {
    const sourceId = nodeIdOfRef(String(sources[0] ?? ''))
    const targetId = nodeIdOfRef(String(targets[0] ?? ''))
    if (sourceId === null || targetId === null || sourceId === targetId) {
      return sourceId === null ? out.id : (inputParents.get(sourceId) ?? out.id)
    }
    const ancestors = new Set<string>()
    let current: string | null = sourceId
    while (current !== null) {
      ancestors.add(current)
      current = inputParents.get(current) ?? null
    }
    current = targetId
    while (current !== null && !ancestors.has(current)) current = inputParents.get(current) ?? null
    return current ?? out.id
  }
  const indexNodes = (node: ElkNode, parentId: string | null): void => {
    inputNodes.set(node.id, node)
    inputParents.set(node.id, parentId)
    for (const child of node.children ?? []) indexNodes(child, node.id)
  }
  const indexEdges = (node: ElkNode): void => {
    for (const edge of node.edges ?? []) {
      const record: InputEdgeRecord = { edge, consumed: false }
      const add = (containerId: string): void => {
        const key = edgeKey(containerId, String(edge.sources?.[0] ?? ''), String(edge.targets?.[0] ?? ''))
        const queue = inputEdgesByKey.get(key) ?? []
        if (!queue.includes(record)) queue.push(record)
        inputEdgesByKey.set(key, queue)
      }
      add(node.id)
      const inferred = inferredContainerId(edge.sources ?? [], edge.targets ?? [])
      if (inferred !== node.id) add(inferred)
    }
    for (const child of node.children ?? []) indexEdges(child)
  }
  indexNodes(built.root, null)
  indexEdges(built.root)

  const takeInputEdge = (containerId: string, sources: string[], targets: string[]): ElkEdge | undefined => {
    const queue = inputEdgesByKey.get(edgeKey(containerId, String(sources[0] ?? ''), String(targets[0] ?? '')))
    while (queue && queue.length > 0) {
      const record = queue.shift()!
      if (!record.consumed) {
        record.consumed = true
        return record.edge
      }
    }
    return undefined
  }

  // 递归输出节点 (position 相对父, 与 elkjs 一致)
  function emit(g: LGraph, container: ElkNode): void {
    const nodes: ElkNode[] = []
    container.children = nodes
    for (const n of g.getAllNodes()) {
      const nid = built.nodeRef.get(n)
      if (nid === undefined) continue // 布局产生的 dummy 不输出
      const source = inputNodes.get(nid)
      const en: ElkNode = source
        ? { ...source, x: n.position.x, y: n.position.y, width: n.size.x, height: n.size.y }
        : { id: nid, x: n.position.x, y: n.position.y, width: n.size.x, height: n.size.y }
      // children/edges 的结构位置和挂载语义由本函数重建，不能沿用输入引用。
      delete en.children
      delete en.edges
      nodeIdToElk.set(en.id, en)
      nodes.push(en)
      const nested = n.getNestedGraph()
      if (nested) emit(nested, en)
    }
  }
  emit(graph, out)
  // 边: 收集所有边, 按 LCA 容器节点挂载
  const seen = new Set<LEdge>()
  const edgesByLca = new Map<LNode | null, ElkEdge[]>()
  function collectEdges(g: LGraph): void {
    for (const n of g.getAllNodes()) {
      for (const p of n.getPorts()) {
        for (const e of p.getOutgoingEdges()) {
          if (seen.has(e)) continue
          if (!built.edgeSet.has(e)) continue // 布局产生的 dummy 边不输出
          seen.add(e)
          const lca = lcaNode(e)
          const arr = edgesByLca.get(lca) ?? []
          edgesByLca.set(lca, arr)
          const { source, target } = getEdgeEndpoints(e)
          const sources = [refOf(e.getSource()!, built)]
          const targets = [refOf(e.getTarget()!, built)]
          const bends = e.getBendPoints().map((b) => ({ x: b.x, y: b.y }))
          const section: ElkEdgeSection = { startPoint: source, endPoint: target }
          if (bends.length > 0) section.bendPoints = bends
          const containerId = lca === null ? out.id : (built.nodeRef.get(lca) ?? out.id)
          const matched = takeInputEdge(containerId, sources, targets)
          arr.push(matched
            ? { ...matched, sources, targets, sections: [section], container: containerId }
            : { sources, targets, sections: [section], container: containerId })
        }
      }
      const nested = n.getNestedGraph()
      if (nested) collectEdges(nested)
    }
  }
  collectEdges(graph)
  if (process.env.GGN_API_DBG) {
    for (const [lca, eds] of edgesByLca) {
      console.error(`[API] LCA ${lca ? built.nodeRef.get(lca) ?? '?' : 'ROOT'} 边数=${eds.length}`)
    }
  }
  // 边挂 LCA 容器节点 (null → root)
  const rootEdges = edgesByLca.get(null)
  if (rootEdges && rootEdges.length > 0) out.edges = rootEdges
  for (const [lca, eds] of edgesByLca) {
    if (lca === null) continue
    const id = built.nodeRef.get(lca)
    if (id === undefined) continue
    const elk = nodeIdToElk.get(id)
    if (elk) elk.edges = eds
  }
  return out
}

/** 端口/节点引用 (输出用): "nodeId.portId" 或 "nodeId". */
function refOf(port: LPort, built: BuiltGraph): string {
  return built.portRef.get(port) ?? (port.getNode() ? built.nodeRef.get(port.getNode()!) ?? String(port.getNode()!.id) : '?')
}

// ── 主入口 ──

// 已移植算法注册表（单一事实来源，validate 与 dispatch 共用）见 ./algorithms.js.
import {
  LAYERED_ALG_IDS, CORE_ALG_IDS, FORCE_ALG_IDS, RECTPACKING_ALG_IDS, TOPDOWN_ALG_IDS,
  SPORE_ALG_IDS, RADIAL_ALG_IDS, VERTIFLEX_ALG_IDS, DISCO_ALG_IDS, MRTREE_ALG_IDS,
  normalizeAlgorithm as normAlg,
} from './algorithms.js'

/**
 * 收集节点显式算法 (含 options 层), 返回 id → 规范化算法.
 *
 * 根节点: 不读其自身 layoutOptions 的算法 — 对齐验证 harness (LayoutJsonMain
 * `root.setProperty(ALGORITHM, layered)` 强制 root=layered, JSON 根算法无效);
 * options 级算法 (API 调用者显式指定) 仍优先. 非根节点正常读 layoutOptions
 * (box/fixed/random/stress/rectpacking 子树作为黑盒).
 */
function explicitAlgorithms(node: ElkNode, options?: ElkLayoutOptions, out: Map<string, string> = new Map(), _isRoot = true): Map<string, string> {
  // root 算法: API options 优先, fallback input.layoutOptions (对齐 Java: root 的 algorithm 从 JSON 读,
  // 如 demo root 直接指定 org.eclipse.elk.force). 此前只读 options → root 非 layered 算法不生效 (R61).
  const a = (options?.layoutOptions?.['org.eclipse.elk.algorithm'] ?? options?.layoutOptions?.['elk.algorithm'])
    ?? (node.layoutOptions?.['org.eclipse.elk.algorithm'] ?? node.layoutOptions?.['elk.algorithm'])
  if (a !== undefined && String(a).trim() !== '') out.set(node.id, normAlg(String(a)))
  for (const c of node.children ?? []) explicitAlgorithms(c, undefined, out, false)
  return out
}

/** 运行 core provider (自底向上: 子先父后, ELK RecursiveGraphLayoutEngine 语义). */
function runCoreProviders(
  input: ElkNode,
  algs: Map<string, string>,
  onBlackBoxLaidOut?: (node: ElkNode) => boolean | void,
): void {
  const nodes = new Map<string, ElkNode>()
  const collect = (n: ElkNode) => { nodes.set(n.id, n); for (const c of n.children ?? []) collect(c) }
  collect(input)
  // 深度排序 (子先): 节点层级越深越先.
  const depth = new Map<string, number>()
  const depthOf = (n: ElkNode, d: number): void => { depth.set(n.id, d); for (const c of n.children ?? []) depthOf(c, d + 1) }
  depthOf(input, 0)
  const sorted = [...algs.entries()].filter(([, a]) => CORE_ALG_IDS.has(a) || FORCE_ALG_IDS.has(a) || RECTPACKING_ALG_IDS.has(a) || TOPDOWN_ALG_IDS.has(a) || SPORE_ALG_IDS.has(a) || RADIAL_ALG_IDS.has(a) || VERTIFLEX_ALG_IDS.has(a) || DISCO_ALG_IDS.has(a) || MRTREE_ALG_IDS.has(a)).sort((a, b) => (depth.get(b[0]) ?? 0) - (depth.get(a[0]) ?? 0))
  for (const [id, alg] of sorted) {
    const node = nodes.get(id)
    if (node === undefined) continue
    // Java RecursiveGraphLayoutEngine L151: 只有 hasChildren || hasInsideSelfLoops 才调用算法.
    // leaf 节点 (无子节点) 无内部元素 → 无内部自环 → 跳过 (由父图 layered 布局, elkjs 实证:
    // leaf+box/stress 均保持输入尺寸, 不调用 provider; 空图 force/stress 会因 recombine 丢 ORIGIN 崩溃).
    if ((node.children?.length ?? 0) === 0) continue
    const provider = getAlg(alg)
    if (provider === undefined) {
      throw new Error(`[layout] 布局算法 '${alg}' 未注册 (本入口未包含该算法; 非 layered 算法请用完整入口 src/index.ts)`)
    }
    provider(node)
    // 可选钩子：每个 black-box 布局完成后立即回调（深度优先：子先于父）。消费方可就地调整该
    // 节点容器尺寸/选项（如标题 padding 预留）——父 provider 随后布局时使用调整后的子容器，
    // 父内部边正确锚定新边界（在「全部布局后」回调会因父内部边已路由而错位，2026-08-16 实证）。
    // 返回 true = 需要按调整后选项重跑 provider（如 padding 对称使子节点重排居中）；重跑后不再回调。
    if (onBlackBoxLaidOut?.(node) === true) {
      provider(node)
    }
  }
}


/**
 * 把「两端都在同一 black-box 子树内」的边从任意位置重挂载到该 black-box 节点 (Java LCA 语义).
 * elktToElkJson 把嵌套边提升到 root.edges (全路径引用), 直接操作 JSON 子图的 provider
 * (stress/force) 看不到边 → 布局失真 (665 实证: 2 节点 1 边被拆成 2 个单节点分量);
 * 不读边的 provider (topdownpacking/box/rectpacking) 也要求内部边不进 layered 图
 * (否则被解析成黑盒节点自环, 902 实证: 3 内部边 → 3 自环 → 容器 y+30),
 * 输出时由 mergeBlackBoxSubtrees 原样合并回节点 edges (jar 同: 内部边无 sections).
 * 嵌套 black-box 时挂到最深的匹配节点 (边 LCA = 最内层容器).
 */
function attachSubtreeEdges(root: ElkNode, nodeIds: Set<string>): void {
  if (nodeIds.size === 0) return
  const find = (n: ElkNode, id: string): ElkNode | null =>
    n.id === id ? n : (n.children ?? []).map((c) => find(c, id)).find(Boolean) ?? null
  const held: { e: ElkEdge; holder: ElkNode }[] = []
  const collect = (n: ElkNode): void => {
    for (const e of n.edges ?? []) held.push({ e, holder: n })
    for (const c of n.children ?? []) collect(c)
  }
  collect(root)
  // 最深优先: 边 LCA 是最内层 black-box 容器.
  // 匹配不依赖 id 前缀 (API 路径 stripN=false 直接子节点引用是 'b1' 而非 'box.b1'):
  // 对每个 black-box 容器收集其子树全部节点 id 集合, 两端都 ∈ 集合 → 内部边挂该容器.
  const descendants = new Map<string, Set<string>>()
  for (const nid of nodeIds) {
    const node = find(root, nid)
    if (node === null) continue
    const ids = new Set<string>()
    const collectIds = (n: ElkNode): void => { ids.add(n.id); for (const c of n.children ?? []) collectIds(c) }
    collectIds(node)
    descendants.set(nid, ids)
  }
  const sorted = [...descendants.entries()].sort((a, b) => b[0].length - a[0].length)
  /** 引用 → 节点 id (剥端口段; 完整 id 命中优先). */
  const nodeIdOf = (ref: string): string | null => {
    if (descRefs.has(ref)) return ref
    const dot = ref.lastIndexOf('.')
    return dot !== -1 && descRefs.has(ref.slice(0, dot)) ? ref.slice(0, dot) : null
  }
  const descRefs = new Set<string>()
  for (const ids of descendants.values()) for (const id of ids) descRefs.add(id)
  for (const { e, holder } of held) {
    const src = String(e.sources?.[0] ?? '')
    const tgt = String(e.targets?.[0] ?? '')
    const srcId = nodeIdOf(src)
    const tgtId = nodeIdOf(tgt)
    if (srcId === null || tgtId === null) continue
    for (const [nid, ids] of sorted) {
      if (!ids.has(srcId) || !ids.has(tgtId)) continue
      const node = find(root, nid)
      if (node !== null) {
        node.edges ??= []
        node.edges.push(e)
        const idx = (holder.edges ?? []).indexOf(e)
        if (idx !== -1) (holder.edges as ElkEdge[]).splice(idx, 1)
      }
      break
    }
  }
}

/** 输入树中节点是否有子节点 (black-box 判定: 有子的非 layered 算法节点才需跳过子图). */
function hasChildrenIn(root: ElkNode, id: string): boolean {
  const find = (n: ElkNode): ElkNode | null => (n.id === id ? n : (n.children ?? []).map(find).find(Boolean) ?? null)
  return (find(root)?.children?.length ?? 0) > 0
}

export function layoutElkJson(input: LayoutInput, options: ElkLayoutOptions & { responseFormat: 'summary' }): LayoutSummary
export function layoutElkJson(input: LayoutInput, options?: ElkLayoutOptions & { responseFormat?: 'full' | 'concise' }): LayoutOutput
export function layoutElkJson(input: LayoutInput, options?: ElkLayoutOptions): LayoutOutput | LayoutSummary
export function layoutElkJson(input: LayoutInput, options?: ElkLayoutOptions): LayoutOutput | LayoutSummary {
  // 契约：先校验（非法输入抛结构化 LayoutError，不再静默丢弃），再深拷贝。
  // 校验只读 input；之后所有 provider、black-box 合并和坐标投影只操作工作副本，
  // 调用方传入的 input 在任何算法路径上均保持不变（纯函数）。
  const control = options?.control
  const graphId = typeof input?.id === 'string' ? input.id : undefined
  enterPhase(control, 'validate', 1, graphId)
  assertValidLayoutInput(input)
  enterPhase(control, 'clone', 2, graphId)
  const workingInput = cloneJsonValue(input)
  enterPhase(control, 'dispatch', 3, graphId)
  // 算法分派 (对齐 Java RecursiveGraphLayoutEngine 递归读各节点 org.eclipse.elk.algorithm):
  // 非 layered 子树 (box/fixed/random) 自底向上先由 core provider 布局 (节点位置/尺寸定型),
  // 再作为黑盒交给 layered (builder 跳过其嵌套图); 未移植算法 (rectpacking/stress/...) 抛明确错误.
  const algs = explicitAlgorithms(workingInput, options)
  for (const [nodeId, alg] of algs) {
    if (!CORE_ALG_IDS.has(alg) && !LAYERED_ALG_IDS.has(alg) && !FORCE_ALG_IDS.has(alg) && !RECTPACKING_ALG_IDS.has(alg) && !TOPDOWN_ALG_IDS.has(alg) && !SPORE_ALG_IDS.has(alg) && !RADIAL_ALG_IDS.has(alg) && !VERTIFLEX_ALG_IDS.has(alg) && !DISCO_ALG_IDS.has(alg) && !MRTREE_ALG_IDS.has(alg)) {
      throw new LayoutError(LayoutErrorCode.UNSUPPORTED_ALGORITHM, `nodes.${nodeId}`, `布局算法 '${alg}' 尚未移植 (节点 ${nodeId}); 移植清单见 docs/NON-LAYERED-PORTING.md`, { phase: 'dispatch' })
    }
  }
  // 只含有子节点的非 layered 算法节点进 black-box (Java RecursiveGraphLayoutEngine 只对
  // hasChildren||hasInsideSelfLoops 的节点做 SEPARATE_CHILDREN 递归; leaf 带算法节点 Java 当普通
  // layered 节点, R50 已跳过 provider, 无需跳过子图 → 不标记 → P3 不排层尾 (R49 P1-2 修正).
  const blackBoxIds = new Set([...algs.entries()].filter(([, a]) => CORE_ALG_IDS.has(a) || FORCE_ALG_IDS.has(a) || RECTPACKING_ALG_IDS.has(a) || TOPDOWN_ALG_IDS.has(a) || SPORE_ALG_IDS.has(a) || RADIAL_ALG_IDS.has(a) || VERTIFLEX_ALG_IDS.has(a) || DISCO_ALG_IDS.has(a) || MRTREE_ALG_IDS.has(a)).map(([id]) => id).filter((id) => hasChildrenIn(workingInput, id)))
  if (blackBoxIds.size > 0) {
    // 直接操作 JSON 子图的 provider 需要子图内边挂在本容器 (Java LCA 语义); 其余
    // black-box 的内部边也必须排除出 layered 图 (否则被路由成黑盒自环, 902 实证).
    attachSubtreeEdges(workingInput, blackBoxIds)
    runCoreProviders(workingInput, algs, options?.onBlackBoxLaidOut)
  }
  // ★ root 算法非 layered → 整图用该 provider 布局 (Java RecursiveGraphLayoutEngine: root 的
  // RESOLVED_ALGORITHM 决定 root 布局, 不走 layered). blackBoxIds 已含 root (有子+非 layered),
  // runCoreProviders 深度排序 root 最后已布局; 排除 root 后布局其余 black-box 子树, 再兜底布局 root.
  const rootAlg = algs.get(workingInput.id)
  if (rootAlg !== undefined && !LAYERED_ALG_IDS.has(rootAlg)) {
    const subBlackBoxIds = new Set([...blackBoxIds].filter((id) => id !== workingInput.id))
    if (subBlackBoxIds.size > 0) {
      attachSubtreeEdges(workingInput, subBlackBoxIds)
      runCoreProviders(
        workingInput,
        new Map([...algs.entries()].filter(([id]) => id !== workingInput.id)),
        options?.onBlackBoxLaidOut,
      )
    }
    runCoreProviders(workingInput, new Map([[workingInput.id, rootAlg]]), options?.onBlackBoxLaidOut)
    applyCoordsModes(workingInput, readCoordsModes(workingInput, options), workingInput)
    ensureRootGeometry(workingInput)
    enterPhase(control, 'extract', 4, graphId)
    enterPhase(control, 'format', 5, graphId)
    return formatLayoutOutput(workingInput as LayoutOutput, options)
  }
  const built = buildGraph(workingInput, options, blackBoxIds)
  if (process.env.GGN_API_DBG) {
    const dumpG = (g2: LGraph, depth: number) => {
      console.error(`[API] layout前 graph=${built.graphToNodeId.get(g2) ?? 'ROOT'} dir=${g2.getProperty(DIRECTION)} hh=${g2.getProperty(HIERARCHY_HANDLING)} nodes=${g2.getAllNodes().map(n => `${built.nodeRef.get(n) ?? 'd'+n.id}[ports=${n.getPorts().length}]`).join(',')}`)
      for (const n of g2.getAllNodes()) { const ng = n.getNestedGraph(); if (ng) dumpG(ng, depth + 1) }
    }
    dumpG(built.graph, 0)
  }
  new LayeredLayoutProvider().layout(built.graph)
  if (process.env.GGN_API_DBG) {
    const dumpG2 = (g2: LGraph, depth: number) => {
      console.error(`[API] layout后 graph=${built.graphToNodeId.get(g2) ?? 'ROOT'} nodes=${g2.getAllNodes().map(n => `${built.nodeRef.get(n) ?? 'd'+n.id}(${n.position.x.toFixed(0)},${n.position.y.toFixed(0)},${n.size.x.toFixed(0)}x${n.size.y.toFixed(0)})`).join(',')}`)
      for (const n of g2.getAllNodes()) { const ng = n.getNestedGraph(); if (ng) dumpG2(ng, depth + 1) }
    }
    dumpG2(built.graph, 0)
  }
  if (process.env.GGN_API_DBG) {
    // dump 所有原始边: 端口所在节点/图 + 边是否有 bendPoints
    const seen = new Set<LEdge>()
    const scanG = (g2: LGraph, path: string) => {
      for (const n of g2.getAllNodes()) {
        const nm = built.nodeRef.get(n) ?? 'd' + n.id
        for (const p of n.getPorts()) {
          for (const e of p.getOutgoingEdges()) {
            if (!built.edgeSet.has(e) || seen.has(e)) continue
            seen.add(e)
            const src = built.portRef.get(e.getSource()!) ?? '?'
            const tgt = built.portRef.get(e.getTarget()!) ?? '?'
            console.error(`[API] edge ${src}->${tgt} portOn=${path}${nm} bends=${e.getBendPoints().length}`)
          }
        }
        const ng = n.getNestedGraph()
        if (ng) scanG(ng, path + nm + '/')
      }
    }
    scanG(built.graph, '')
    console.error(`[API] 可达原始边: ${seen.size}/${built.edgeSet.size}`)
  }
  enterPhase(control, 'extract', 4, graphId)
  const out = extractGraph(built.graph, built)
  ensureRootGeometry(out, built.graph)
  // 黑盒子树 (core provider 已布局) 从输入合并回输出: 子节点/内部边不进 layered 图,
  // 但最终输出必须包含 (ELK RecursiveGraphLayoutEngine 结果含全部原始元素).
  if (blackBoxIds.size > 0) mergeBlackBoxSubtrees(out, workingInput, blackBoxIds)
  // 坐标模式投影 (shapeCoords/edgeCoords; 默认 = elkjs 默认, 仅 ROOT 触发投影).
  applyCoordsModes(out, readCoordsModes(workingInput, options), workingInput)
  enterPhase(control, 'format', 5, graphId)
  return formatLayoutOutput(out as LayoutOutput, options)
}

function ensureRootGeometry(output: ElkNode, graph?: LGraph): void {
  output.x ??= 0
  output.y ??= 0
  if (output.width === undefined) output.width = graph?.getActualSize().x ?? 0
  if (output.height === undefined) output.height = graph?.getActualSize().y ?? 0
}

/** 按 responseFormat 选择完整图、紧凑图或扁平摘要。 */
function formatLayoutOutput(output: LayoutOutput, options?: ElkLayoutOptions): LayoutOutput | LayoutSummary {
  const responseFormat = options?.responseFormat ?? 'full'
  if (responseFormat === 'summary') return summarizeLayout(output)
  if (responseFormat === 'concise') return toConciseOutput(output)
  return options?.pick === undefined ? output : pickOutputFields(output, options.pick)
}

function toConciseOutput(node: LayoutOutput): LayoutOutput {
  const concise: LayoutOutput = {
    id: node.id,
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
  }
  if (node.children !== undefined) concise.children = node.children.map(toConciseOutput)
  if (node.edges !== undefined) {
    concise.edges = node.edges.flatMap((edge) => {
      // 已路由边保留 startPoint/endPoint（去掉 bendPoints/ports/labels/properties/layoutOptions）；
      // 未路由边（无 sections）保留结构，不静默丢弃。
      const section = edge.sections?.[0]
      const shortEdge: LayoutOutputEdge = {
        ...(edge.id === undefined ? {} : { id: edge.id }),
        sources: [...edge.sources],
        targets: [...edge.targets],
      }
      if (section !== undefined) {
        shortEdge.sections = [{
          startPoint: { ...section.startPoint },
          endPoint: { ...section.endPoint },
        }]
      }
      return [shortEdge]
    })
  }
  return concise
}

function pickOutputFields(node: LayoutOutput, pick: readonly string[]): LayoutOutput {
  const picked: Record<string, unknown> = {
    id: node.id,
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
  }
  for (const key of pick) {
    if (key in node && key !== 'children' && key !== 'edges' && key !== 'id' && key !== 'x' && key !== 'y' && key !== 'width' && key !== 'height') {
      picked[key] = (node as unknown as Record<string, unknown>)[key]
    }
  }
  if (node.children !== undefined) picked.children = node.children.map((child) => pickOutputFields(child, pick))
  if (node.edges !== undefined) picked.edges = node.edges
  return picked as unknown as LayoutOutput
}

function summarizeLayout(output: LayoutOutput): LayoutSummary {
  const nodes: LayoutSummary['nodes'] = []
  const edges: LayoutSummary['edges'] = []
  const visit = (node: LayoutOutput, includeNode: boolean): void => {
    if (includeNode) nodes.push({ id: node.id, x: node.x, y: node.y, width: node.width, height: node.height })
    for (const edge of node.edges ?? []) {
      const section = edge.sections?.[0]
      const source = edge.sources[0]
      const target = edge.targets[0]
      if (section === undefined || source === undefined || target === undefined) continue
      edges.push({
        ...(edge.id === undefined ? {} : { id: edge.id }),
        sources: [source],
        targets: [target],
        startPoint: { ...section.startPoint },
        endPoint: { ...section.endPoint },
      })
    }
    for (const child of node.children ?? []) visit(child, true)
  }
  visit(output, false)
  const summary: LayoutSummary = { nodes, edges }
  if (typeof output.width === 'number') summary.width = output.width
  if (typeof output.height === 'number') summary.height = output.height
  return summary
}


// ── 坐标模式 (org.eclipse.elk.json.shapeCoords / edgeCoords) ──
// SSOT: ELK Java 0.12.0 (JsonImporter.recordCoordinateModes / transferLayout) + elkjs 0.12.0 实测.
//   ShapeCoords: INHERIT | PARENT | ROOT   (根默认 PARENT)
//   EdgeCoords:  INHERIT | CONTAINER | PARENT | ROOT  (根默认 CONTAINER)
// layout 默认输出 = 节点相对父 (PARENT) + 边相对 LCA 容器 (CONTAINER, 边挂 LCA) —
// 即根默认模式, 与 elkjs 默认一致.
// 继承语义 (elkjs elk-worker.js 反编译 + elkjs/jar 逐模型实测, R44):
//   坐标模式**按元素继承**: 每个节点的有效模式 = 自身 layoutOptions 设置值,
//   否则继承 JSON 父节点 (显式 INHERIT 同未设置), 根默认 PARENT / CONTAINER.
//   shapeCoords: 节点 N 的有效模式决定其**子节点**输出坐标参照系:
//     ROOT → 子节点 x/y 为全局坐标; PARENT → 相对 N. (不作用于 N 自身坐标, 只向下传播.)
//   edgeCoords: 边在输入 JSON 的**声明父节点** N 的有效模式决定该边输出:
//     CONTAINER → 坐标相对 proper container (LCA), 输出 container 字段.
//     PARENT    → 相对声明父 N (globalX(containing) − globalX(N)); 不输出 container.
//     ROOT      → 相对 root (全局); 不输出 container.
//   影响范围: 只向下传播 (子树), 不向上/不横向; 子树显式设置覆盖继承值.
// 注: layout 输出边挂 LCA, 故投影 = 相对LCA + LCA全局 − 声明父全局 (声明父 null = root, 全局=0).
// 注: jar 的 ElkGraphJson.forGraph(root).toJson() 独立导出路径不触发坐标模式投影
//     (未调用 transferLayout); 与 elkjs 对齐须走 JsonImporter.transferLayout
//     (jar CoordsProbe 实测与 elkjs 逐点一致, 见 agent-remarks R44).

type ShapeCoordsMode = 'INHERIT' | 'PARENT' | 'ROOT'
type EdgeCoordsMode = 'INHERIT' | 'CONTAINER' | 'PARENT' | 'ROOT'
type ResolvedShape = Exclude<ShapeCoordsMode, 'INHERIT'> // 'PARENT' | 'ROOT'
type ResolvedEdge = Exclude<EdgeCoordsMode, 'INHERIT'>   // 'CONTAINER' | 'PARENT' | 'ROOT'

/** 每个节点解析后的有效坐标模式 (继承已解析, 无 INHERIT). */
interface CoordModeState {
  /** 根有效 shapeCoords (options 覆盖 input 后解析). */
  rootShape: ResolvedShape
  /** 根有效 edgeCoords (options 覆盖 input 后解析). */
  rootEdge: ResolvedEdge
  /** 非根节点 id → 有效 shapeCoords. */
  nodeShape: Map<string, ResolvedShape>
  /** 非根节点 id → 有效 edgeCoords. */
  nodeEdge: Map<string, ResolvedEdge>
}

/** 键归一化: 坐标模式键收窄到 elkjs 实测接受集 (elkjs 0.12.0 逐键实测):
 *   生效: 裸名 edgeCoords/shapeCoords + 含 json. 段 (json.x / elk.json.x / org.eclipse.elk.json.x)
 *   忽略: org.eclipse.elk.edgeCoords / elk.edgeCoords / my.custom.* (无 json. 段, elkjs 不识别)
 * 其余键 短名 "elk.x" → "org.eclipse.elk.x". */
function normOptionKey(k: string): string {
  if (k === 'shapeCoords' || k.endsWith('json.shapeCoords')) return 'org.eclipse.elk.json.shapeCoords'
  if (k === 'edgeCoords' || k.endsWith('json.edgeCoords')) return 'org.eclipse.elk.json.edgeCoords'
  return k.startsWith('org.eclipse.elk.') ? k : k.replace(/^elk\./, 'org.eclipse.elk.')
}

/** 读取坐标模式 (按元素继承, R44). 根合并顺序 options 覆盖 input (对齐 buildGraph Object.assign
 * 与 elkjs 实测). 大小写敏感 (对齐 elkjs/Java 枚举解析, 小写值忽略). 未设置/INHERIT = 继承父 / 根默认. */
function readCoordsModes(input: ElkNode, options?: ElkLayoutOptions): CoordModeState {
  const normalized = (lo: Record<string, unknown> | undefined): Record<string, unknown> => {
    const m: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(lo ?? {})) m[normOptionKey(k)] = v
    return m
  }
  const rootMerged = normalized(input.layoutOptions)
  for (const [k, v] of Object.entries(normalized(options?.layoutOptions))) rootMerged[k] = v // options 覆盖 input

  const ownShape = (lo: Record<string, unknown> | undefined): ShapeCoordsMode | undefined => {
    const v = normalized(lo)['org.eclipse.elk.json.shapeCoords']
    return v === 'ROOT' || v === 'PARENT' || v === 'INHERIT' ? v : undefined
  }
  const ownEdge = (lo: Record<string, unknown> | undefined): EdgeCoordsMode | undefined => {
    const v = normalized(lo)['org.eclipse.elk.json.edgeCoords']
    return v === 'ROOT' || v === 'PARENT' || v === 'CONTAINER' || v === 'INHERIT' ? v : undefined
  }

  const rootShapeV = rootMerged['org.eclipse.elk.json.shapeCoords']
  const rootEdgeV = rootMerged['org.eclipse.elk.json.edgeCoords']
  const rootShape: ResolvedShape = rootShapeV === 'ROOT' || rootShapeV === 'PARENT' ? rootShapeV : 'PARENT'
  const rootEdge: ResolvedEdge = rootEdgeV === 'ROOT' || rootEdgeV === 'PARENT' || rootEdgeV === 'CONTAINER' ? rootEdgeV : 'CONTAINER'

  const nodeShape = new Map<string, ResolvedShape>()
  const nodeEdge = new Map<string, ResolvedEdge>()
  // inheritedShape = 父节点有效模式 (未设置/INHERIT 时继承); root 用合并后 rootShape/rootEdge.
  const walk = (node: ElkNode, inheritedShape: ResolvedShape, inheritedEdge: ResolvedEdge, isRoot: boolean): void => {
    const s = ownShape(node.layoutOptions)
    const e = ownEdge(node.layoutOptions)
    const selfShape: ResolvedShape = s === undefined || s === 'INHERIT' ? inheritedShape : s
    const selfEdge: ResolvedEdge = e === undefined || e === 'INHERIT' ? inheritedEdge : e
    if (!isRoot) {
      nodeShape.set(node.id, selfShape)
      nodeEdge.set(node.id, selfEdge)
    }
    for (const c of node.children ?? []) walk(c, selfShape, selfEdge, false)
  }
  walk(input, rootShape, rootEdge, true)
  return { rootShape, rootEdge, nodeShape, nodeEdge }
}

/** 按坐标模式投影输出树 (节点/边坐标, per-node 继承). 原地修改, 在 mergeBlackBoxSubtrees 之后调用. */
function applyCoordsModes(out: ElkNode, modes: CoordModeState, input: ElkNode): void {
  // 1. 全局位置 map (基于投影前的相对坐标; 同 elkjs recordGlobalCoords 语义).
  const globalPos = new Map<string, { x: number; y: number }>()
  const compute = (node: ElkNode, px: number, py: number): void => {
    const x = px + (node.x ?? 0), y = py + (node.y ?? 0)
    globalPos.set(node.id, { x, y })
    for (const c of node.children ?? []) compute(c, x, y)
  }
  compute(out, 0, 0)
  // 2. shapeCoords 投影 (per-node): 节点 x/y 参照系 = 其 JSON 父节点的有效模式.
  //    ROOT → 输出全局坐标; PARENT → 相对父 (默认, 不动). root 本身无坐标, 跳过.
  const shapeOf = (node: ElkNode): ResolvedShape =>
    node.id === out.id ? modes.rootShape : (modes.nodeShape.get(node.id) ?? 'PARENT')
  const applyShape = (node: ElkNode, parentShape: ResolvedShape): void => {
    if (node.id !== out.id && parentShape === 'ROOT') {
      const p = globalPos.get(node.id)
      if (p) { node.x = p.x; node.y = p.y }
    }
    const selfShape = shapeOf(node)
    for (const c of node.children ?? []) applyShape(c, selfShape)
  }
  applyShape(out, modes.rootShape)
  // 3. 边投影 (per-node): 每条边按输入 JSON 声明父节点的有效 edgeCoords 模式.
  //    边挂载容器 C = LCA; 偏移:
  //      ROOT      → globalPos[C]                  (相对 LCA → 全局)
  //      PARENT    → globalPos[C] − globalPos[P]   (P = 输入声明父, null = root, 全局=0)
  //      CONTAINER → 默认 (相对 LCA, 输出 container 字段, 不动)
  //    同端点多条边仅按 key 匹配 (声明父 map 限制, 文档记录).
  const declParent = new Map<string, string | null>()
  const collectDecl = (node: ElkNode, containerId: string | null): void => {
    for (const e of node.edges ?? []) {
      const key = `${String(e.sources?.[0] ?? '')}|${String(e.targets?.[0] ?? '')}`
      if (!declParent.has(key)) declParent.set(key, containerId)
    }
    for (const c of node.children ?? []) collectDecl(c, c.id)
  }
  collectDecl(input, null)
  const edgeModeOf = (key: string): ResolvedEdge => {
    const dp = declParent.get(key)
    if (dp === null) return modes.rootEdge
    return dp === undefined ? 'CONTAINER' : (modes.nodeEdge.get(dp) ?? 'CONTAINER')
  }
  const shift = (pt: ElkPoint | undefined, off: { x: number; y: number }): void => {
    if (pt) { pt.x += off.x; pt.y += off.y }
  }
  const containerOffset = (node: ElkNode): { x: number; y: number } =>
    node.id === out.id ? { x: 0, y: 0 } : (globalPos.get(node.id) ?? { x: 0, y: 0 })
  const applyEdge = (node: ElkNode): void => {
    const cOff = containerOffset(node)
    for (const e of node.edges ?? []) {
      const key = `${String(e.sources?.[0] ?? '')}|${String(e.targets?.[0] ?? '')}`
      const mode = edgeModeOf(key)
      let off: { x: number; y: number } | null = null
      if (mode === 'ROOT') {
        off = cOff
      } else if (mode === 'PARENT') {
        const dp = declParent.get(key)
        const pOff = dp == null ? { x: 0, y: 0 } : (globalPos.get(dp) ?? { x: 0, y: 0 })
        off = { x: cOff.x - pOff.x, y: cOff.y - pOff.y }
      }
      if (off !== null) {
        for (const s of e.sections ?? []) {
          shift(s.startPoint, off)
          shift(s.endPoint, off)
          for (const b of s.bendPoints ?? []) shift(b, off)
        }
        // elkjs: PARENT/ROOT 不输出 container (仅 CONTAINER/默认).
        delete (e as Record<string, unknown>).container
      }
    }
    for (const c of node.children ?? []) applyEdge(c)
  }
  applyEdge(out)
}

/** 把黑盒子树的 children/edges 从输入 JSON 合并到输出 (provider 已布局, 位置相对黑盒节点). */
function mergeBlackBoxSubtrees(out: ElkNode, input: ElkNode, blackBoxIds: Set<string>): void {
  const findIn = (n: ElkNode, id: string): ElkNode | null => {
    if (n.id === id) return n
    for (const c of n.children ?? []) { const r = findIn(c, id); if (r !== null) return r }
    return null
  }
  const merge = (node: ElkNode): void => {
    if (blackBoxIds.has(node.id)) {
      const src = findIn(input, node.id)
      if (src !== null) {
        node.children = src.children
        node.edges = src.edges
        // R47: black-box 子树内部边补 container (LCA 容器 id = 本黑盒节点), 与 elkjs 0.12.0
        // 输出一致 (elkjs 对黑盒内部边输出 container=<黑盒 id>); jar 同值由嵌套在
        // container.edges 表达 (无显式字段, R47 实证 box/rectpacking/nested-box). 这些边已由
        // attachSubtreeEdges 保证两端都在本子树内 (LCA = 本节点), 故统一覆盖为 node.id.
        for (const e of node.edges ?? []) (e as ElkEdge).container = node.id
        // 递归处理嵌套黑盒 (box 内含 fixed 等).
        for (const c of node.children ?? []) merge(c)
        return
      }
    }
    for (const c of node.children ?? []) merge(c)
  }
  merge(out)
}
