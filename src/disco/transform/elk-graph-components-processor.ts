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
 * ElkGraphComponentsProcessor — alg.disco.transform.ElkGraphComponentsProcessor (0.12.0).
 * 用简单 DFS 把 ElkNode 拆成连通分量列表.
 *
 * 输入形态: 本节点 (disco 黑盒) 子树的 ElkNode JSON — children 树 + 挂在子树各层的 edges
 * (attachSubtreeEdges 已把 LCA 为本节点的边挂到本节点; 嵌套 black-box 时子孙也有 edges).
 * 边引用为路径式 id ("Ngroup.g1" 或 "Ngroup.g1.p1").
 */
import type { ElkEdge, ElkNode, ElkPort } from '../../api/elk-json.js'

/**
 * 解析边端点引用 → 节点 id.
 * 节点 id 为路径式 ("Ngroup.g1"); 引用 "Ngroup.g1" 是节点, "Ngroup.g1.p1" 是端口.
 * 规则: 先按完整引用查节点, 查不到则剥最后一段 (父节点 + 端口段).
 */
export function nodeIdOf(ref: string, graph: ElkNode): string {
  if (findNodeById(graph, ref) !== null) return ref
  const dot = ref.lastIndexOf('.')
  return dot === -1 ? ref : ref.slice(0, dot)
}

/** 解析边端点引用 → 端口 id (无端口 → undefined; 完整引用即节点时无端口). */
export function portIdOf(ref: string, graph: ElkNode): string | undefined {
  if (findNodeById(graph, ref) !== null) return undefined
  const dot = ref.lastIndexOf('.')
  return dot === -1 ? undefined : ref.slice(dot + 1)
}

/** 收集子树内全部边 (本节点 edges + 递归 children edges). */
function collectEdges(node: ElkNode): ElkEdge[] {
  const out: ElkEdge[] = []
  const walk = (n: ElkNode) => {
    for (const e of n.edges ?? []) out.push(e)
    for (const c of n.children ?? []) walk(c)
  }
  walk(node)
  return out
}

/** 在子树内按 id 查找节点. */
export function findNodeById(root: ElkNode, id: string): ElkNode | null {
  if (root.id === id) return root
  for (const c of root.children ?? []) {
    const r = findNodeById(c, id)
    if (r !== null) return r
  }
  return null
}

/**
 * 把 ElkNode 拆成连通分量 (深度优先搜索).
 */
export namespace ElkGraphComponentsProcessor {
  export function split(graph: ElkNode): ElkNode[][] {
    const visited = new Set<ElkNode>()
    const incidenceMap = new Map<ElkNode, Set<ElkNode>>()
    const components: ElkNode[][] = []
    const children = graph.children ?? []

    computeIncidences(children, graph, incidenceMap)

    for (const node of children) {
      if (!visited.has(node)) {
        const component: ElkNode[] = []
        components.push(component)
        dfs(node, component, visited, incidenceMap)
      }
    }

    return components
  }

  /** 计算各节点间的邻接关系 (与边方向无关). */
  function computeIncidences(nodes: ElkNode[], graph: ElkNode, incidenceMap: Map<ElkNode, Set<ElkNode>>): void {
    const allEdges = collectEdges(graph)
    const adjacentAndInsideParent = new Map<ElkPort, Set<ElkNode>>()

    for (const node of nodes) {
      const adjacentNodes = new Set<ElkNode>()
      incidenceMap.set(node, adjacentNodes)

      // 入射边: 源端是 node 的边 (incoming); 出射边: 目标端是 node 的边 (outgoing)
      // 同层判定: 两端节点同属一个 parent
      const sameHierarchyLevel = (a: ElkNode, b: ElkNode): boolean => parentIdOf(a) === parentIdOf(b)

      const incomingEdges = allEdges.filter((e) => nodeIdOf(String(e.targets?.[0] ?? ''), graph) === node.id)
      const sameLevelIncoming = incomingEdges.filter((e) => {
        const src = findNodeById(graph, nodeIdOf(String(e.sources?.[0] ?? ''), graph))
        return src !== null && sameHierarchyLevel(src, node)
      })
      addNodesToIncidenceSet(adjacentNodes, sameLevelIncoming, (e) => {
        const src = findNodeById(graph, nodeIdOf(String(e.sources?.[0] ?? ''), graph))
        return src!
      })

      // Filter because edges might also go one level down instead of up
      const connectedToParentPort = incomingEdges.filter((e) => {
        const src = findNodeById(graph, nodeIdOf(String(e.sources?.[0] ?? ''), graph))
        return src !== null && src.id === parentIdOf(node)
      })

      for (const incomingEdge of connectedToParentPort) {
        const portRef = String(incomingEdge.sources?.[0] ?? '')
        const port = findPort(graph, portRef)
        if (port !== undefined) {
          let nodesAtPort = adjacentAndInsideParent.get(port)
          if (nodesAtPort === undefined) {
            nodesAtPort = getInnerNeighborsOfPort(portRef, port, graph, allEdges)
            adjacentAndInsideParent.set(port, nodesAtPort)
          }
          for (const n of nodesAtPort) adjacentNodes.add(n)
        }
      }

      const outgoingEdges = allEdges.filter((e) => nodeIdOf(String(e.sources?.[0] ?? ''), graph) === node.id)
      const sameLevelOutgoing = outgoingEdges.filter((e) => {
        const tgt = findNodeById(graph, nodeIdOf(String(e.targets?.[0] ?? ''), graph))
        return tgt !== null && sameHierarchyLevel(node, tgt)
      })
      addNodesToIncidenceSet(adjacentNodes, sameLevelOutgoing, (e) => {
        const tgt = findNodeById(graph, nodeIdOf(String(e.targets?.[0] ?? ''), graph))
        return tgt!
      })

      // Filter because edges might also go one level down instead of up
      const outgoingToParentPort = outgoingEdges.filter((e) => {
        const tgt = findNodeById(graph, nodeIdOf(String(e.targets?.[0] ?? ''), graph))
        return tgt !== null && tgt.id === parentIdOf(node)
      })

      for (const outgoingEdge of outgoingToParentPort) {
        const portRef = String(outgoingEdge.targets?.[0] ?? '')
        const port = findPort(graph, portRef)
        if (port !== undefined) {
          let nodesAtPort = adjacentAndInsideParent.get(port)
          if (nodesAtPort === undefined) {
            nodesAtPort = getInnerNeighborsOfPort(portRef, port, graph, allEdges)
            adjacentAndInsideParent.set(port, nodesAtPort)
          }
          for (const n of nodesAtPort) adjacentNodes.add(n)
        }
      }
    }
  }

  /** 节点 id 的父 id (路径式 id 去掉最后一段; 顶层 → ''). */
  function parentIdOf(node: ElkNode): string {
    const dot = node.id.lastIndexOf('.')
    return dot === -1 ? '' : node.id.slice(0, dot)
  }

  /** 按全引用找端口 ("Ngroup.g1.p1" → ElkPort). */
  function findPort(graph: ElkNode, ref: string): ElkPort | undefined {
    const node = findNodeById(graph, nodeIdOf(ref, graph))
    const portId = portIdOf(ref, graph)
    if (node === null || portId === undefined) return undefined
    return (node.ports ?? []).find((p) => p.id === portId)
  }

  /** 与端口相连且指向其父节点内部的边所连接的节点. */
  function getInnerNeighborsOfPort(portRef: string, port: ElkPort, graph: ElkNode, allEdges: ElkEdge[]): Set<ElkNode> {
    const portParent = findNodeById(graph, nodeIdOf(portRef, graph))
    const inwardsPredicate = (edge: ElkEdge): boolean => {
      const src = findNodeById(graph, nodeIdOf(String(edge.sources?.[0] ?? ''), graph))
      const tgt = findNodeById(graph, nodeIdOf(String(edge.targets?.[0] ?? ''), graph))
      return portParent !== null && ((src !== null && portParent.id === src.id) || (tgt !== null && portParent.id === tgt.id))
    }
    const nodeMapper = (edge: ElkEdge): ElkNode => {
      const src = findNodeById(graph, nodeIdOf(String(edge.sources?.[0] ?? ''), graph))
      const tgt = findNodeById(graph, nodeIdOf(String(edge.targets?.[0] ?? ''), graph))
      return src !== null && portParent !== null && src.id === portParent.id ? tgt! : src!
    }
    const portEdges = allEdges.filter((e) => {
      const src = String(e.sources?.[0] ?? '')
      const tgt = String(e.targets?.[0] ?? '')
      return src === portRef || tgt === portRef
    })
    return new Set(portEdges.filter(inwardsPredicate).map(nodeMapper))
  }

  function addNodesToIncidenceSet(incidentNodes: Set<ElkNode>, edges: ElkEdge[], chooseNode: (e: ElkEdge) => ElkNode): void {
    for (const edge of edges) {
      incidentNodes.add(chooseNode(edge))
    }
  }

  function dfs(start: ElkNode, component: ElkNode[], visited: Set<ElkNode>, incidenceMap: Map<ElkNode, Set<ElkNode>>): void {
    visited.add(start)
    component.push(start)
    const adjacentNodes = incidenceMap.get(start)
    if (adjacentNodes !== undefined) {
      for (const node of adjacentNodes) {
        if (!visited.has(node)) {
          dfs(node, component, visited, incidenceMap)
        }
      }
    }
  }
}
