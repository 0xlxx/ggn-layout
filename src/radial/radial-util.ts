/**
 * RadialUtil — ELK alg.radial.RadialUtil + ElkGraphUtil 图遍历的 TS 移植.
 *
 * Java 的 ElkNode 自带 parent/边引用; TS JSON 里边挂在布局图容器的 edges 数组,
 * 父子关系通过引用 id 反查. 所有函数以布局图 graph (radial 的目标容器) 为第一参数.
 *
 * 端点引用解析: ELK JSON 的节点 id 是祖先路径点号连接 (如 "Ngroup.r"),
 * 端口 id 是父节点 id + "." + 端口名. Java ElkGraphImporter 先按完整 id 匹配节点,
 * 未命中才拆分为 node.port — 此处同语义 (不能只看字符串是否含点).
 */
import type { ElkNode, ElkEdge } from '../api/elk-json.js'

/** 常量 2*PI. */
export const TWO_PI = 2 * Math.PI
/** 模糊比较容差 (Java DoubleMath.fuzzyCompare EPSILON). */
const EPSILON = 1e-10

/** 模糊比较 (Java DoubleMath.fuzzyCompare(a, b, EPSILON)). */
export function fuzzyCompare(a: number, b: number): number {
  const diff = a - b
  if (Math.abs(diff) <= EPSILON * Math.max(1, Math.abs(a), Math.abs(b))) return 0
  return diff < 0 ? -1 : 1
}

/** 模糊等于 (Java DoubleMath.fuzzyEquals(a, b, EPSILON)). */
export function fuzzyEquals(a: number, b: number): boolean {
  return Math.abs(a - b) <= EPSILON * Math.max(1, Math.abs(a), Math.abs(b))
}

/** 在 graph 的整棵子树内按 id 找节点 (递归). */
export function findNodeById(graph: ElkNode, id: string): ElkNode | undefined {
  if (graph.id === id) return graph
  for (const c of graph.children ?? []) {
    const hit = findNodeById(c, id)
    if (hit !== undefined) return hit
  }
  return undefined
}

/**
 * 端点引用 → 代表节点 id (Java ElkGraphUtil.connectableShapeToNode):
 * 完整 id 命中节点 → 节点; 否则拆分 "node.port" 取节点段; 仍找不到 → 原样.
 */
export function nodeIdOfRef(graph: ElkNode, ref: string | undefined): string | undefined {
  if (ref === undefined) return undefined
  if (findNodeById(graph, ref) !== undefined) return ref
  if (ref.includes('.')) {
    const base = ref.slice(0, ref.lastIndexOf('.'))
    if (findNodeById(graph, base) !== undefined) return base
  }
  return ref
}

/** 端点是否为端口引用 (Java: source instanceof ElkPort; 完整 id 无同名节点时拆分的引用视为端口). */
export function isPortRef(graph: ElkNode, ref: string | undefined): boolean {
  if (ref === undefined) return false
  if (findNodeById(graph, ref) !== undefined) return false
  if (!ref.includes('.')) return false
  const base = ref.slice(0, ref.lastIndexOf('.'))
  return findNodeById(graph, base) !== undefined
}

/** 布局图内所有出边 (Java ElkGraphUtil.allOutgoingEdges: source 代表节点为 node 的边). */
export function allOutgoingEdges(graph: ElkNode, node: ElkNode): ElkEdge[] {
  return (graph.edges ?? []).filter((e) => {
    const src = nodeIdOfRef(graph, String(e.sources?.[0] ?? ''))
    return src === node.id
  })
}

/** 布局图内所有入边 (Java ElkGraphUtil.allIncomingEdges: target 代表节点为 node 的边). */
export function allIncomingEdges(graph: ElkNode, node: ElkNode): ElkEdge[] {
  return (graph.edges ?? []).filter((e) => {
    const tgt = nodeIdOfRef(graph, String(e.targets?.[0] ?? ''))
    return tgt === node.id
  })
}

/** node 自身的出边 (Java ElkNode.getOutgoingEdges, 含端口边). */
export function outgoingEdges(graph: ElkNode, node: ElkNode): ElkEdge[] {
  return (graph.edges ?? []).filter((e) => {
    return nodeIdOfRef(graph, String(e.sources?.[0] ?? '')) === node.id
  })
}

/** 边是否为层级边 (Java ElkEdge.isHierarchical: 两端代表节点的父不同 → 跨层级). */
export function isHierarchicalEdge(graph: ElkNode, e: ElkEdge): boolean {
  const srcId = nodeIdOfRef(graph, String(e.sources?.[0] ?? ''))
  const tgtId = nodeIdOfRef(graph, String(e.targets?.[0] ?? ''))
  if (srcId === undefined || tgtId === undefined) return true
  const src = findNodeById(graph, srcId)
  const tgt = findNodeById(graph, tgtId)
  if (src === undefined || tgt === undefined) return true
  return parentOf(graph, src) !== parentOf(graph, tgt)
}

/** 在布局图中找 node 的父容器 (递归; graph 自身无父 → undefined). */
export function parentOf(graph: ElkNode, node: ElkNode): ElkNode | undefined {
  const find = (n: ElkNode): ElkNode | undefined => {
    for (const c of n.children ?? []) {
      if (c === node) return n
      const hit = find(c)
      if (hit !== undefined) return hit
    }
    return undefined
  }
  return find(graph)
}

/**
 * 树中节点 node 的后继 (Java RadialUtil.getSuccessors): 出边 target 中
 * 不属于 node 自身 children 的节点.
 */
export function getSuccessors(graph: ElkNode, node: ElkNode): ElkNode[] {
  const successors: ElkNode[] = []
  const children = new Set(node.children ?? [])
  for (const outgoingEdge of allOutgoingEdges(graph, node)) {
    if (!isPortRef(graph, String(outgoingEdge.sources?.[0] ?? ''))) {
      const targetId = nodeIdOfRef(graph, String(outgoingEdge.targets?.[0] ?? ''))
      const target = targetId === undefined ? undefined : findNodeById(graph, targetId)
      if (target !== undefined && !children.has(target)) {
        successors.push(target)
      }
    }
  }
  return successors
}

/** 后继集合 (Java RadialUtil.getSuccessorSet). */
export function getSuccessorSet(graph: ElkNode, node: ElkNode): Set<ElkNode> {
  return new Set(getSuccessors(graph, node))
}

/**
 * 找树的根: 第一个无入边的直接子节点 (Java RadialUtil.findRoot).
 * 无 → null.
 */
export function findRoot(graph: ElkNode): ElkNode | null {
  for (const child of graph.children ?? []) {
    if (allIncomingEdges(graph, child).length === 0) {
      return child
    }
  }
  return null
}

/** 找 node 所在树的根 (Java RadialUtil.findRootOfNode). */
export function findRootOfNode(graph: ElkNode, elkNode: ElkNode): ElkNode {
  const parent = getTreeParent(graph, elkNode)
  if (parent === null) {
    return elkNode
  }
  return findRootOfNode(graph, parent)
}

/** 节点叶数 (Java RadialUtil.getNumberOfLeaves). */
export function getNumberOfLeaves(graph: ElkNode, node: ElkNode): number {
  const successors = getSuccessors(graph, node)
  if (successors.length === 0) {
    return 1
  }
  let leafs = 0
  for (const child of successors) {
    leafs += getNumberOfLeaves(graph, child)
  }
  return leafs
}

/**
 * 极坐标排序比较器 (Java RadialUtil.createPolarComparator): offset 使排序从
 * 0-2π 的任意角度开始; 0 从节点右侧中部开始顺时针.
 */
export function createPolarComparator(radialOffset: number, nodeOffsetY: number): (n1: ElkNode, n2: ElkNode) => number {
  return (node1, node2) => {
    let arc1 = Math.atan2((node1.y ?? 0) + nodeOffsetY, node1.x ?? 0)
    if (arc1 < 0) arc1 += TWO_PI
    arc1 += radialOffset
    if (arc1 > TWO_PI) arc1 -= TWO_PI

    let arc2 = Math.atan2((node2.y ?? 0) + nodeOffsetY, node2.x ?? 0)
    if (arc2 < 0) arc2 += TWO_PI
    arc2 += radialOffset
    if (arc2 > TWO_PI) arc2 -= TWO_PI

    return fuzzyCompare(arc1, arc2)
  }
}

/** 图中最大节点直径 (Java RadialUtil.findLargestNodeInGraph, 递归). */
export function findLargestNodeInGraph(graph: ElkNode): number {
  let largestChildSize = 0
  for (const child of graph.children ?? []) {
    const width = child.width ?? 0
    const height = child.height ?? 0
    const diameter = Math.sqrt(width * width + height * height)
    largestChildSize = Math.max(diameter, largestChildSize)

    const largestChild = findLargestNodeInGraph(child)
    largestChildSize = Math.max(largestChild, largestChildSize)
  }
  return largestChildSize
}

/** 下一层节点列表 (Java RadialUtil.getNextLevelNodes). */
export function getNextLevelNodes(graph: ElkNode, nodes: ElkNode[]): ElkNode[] {
  const successors: ElkNode[] = []
  for (const node of nodes) {
    successors.push(...getSuccessors(graph, node))
  }
  return successors
}

/** 下一层节点集合 (Java RadialUtil.getNextLevelNodeSet). */
export function getNextLevelNodeSet(graph: ElkNode, nodes: ElkNode[]): Set<ElkNode> {
  const successors = new Set<ElkNode>()
  for (const node of nodes) {
    for (const s of getSuccessorSet(graph, node)) successors.add(s)
  }
  return successors
}

/** 上一层节点列表 (Java RadialUtil.getLastLevelNodes). */
export function getLastLevelNodes(graph: ElkNode, nodes: ElkNode[]): ElkNode[] {
  const parents: ElkNode[] = []
  for (const node of nodes) {
    const parent = getTreeParent(graph, node)
    parents.push(parent!)
  }
  return parents
}

/** 移动节点使其中心位于 (xPos, yPos) (Java RadialUtil.centerNodesOnRadi). */
export function centerNodesOnRadi(node: ElkNode, xPos: number, yPos: number): void {
  node.x = xPos - (node.width ?? 0) / 2
  node.y = yPos - (node.height ?? 0) / 2
}

/** 移动节点使最靠近父节点的边最靠近 (Java RadialUtil.shiftClosestEdgeToRadi). */
export function shiftClosestEdgeToRadi(node: ElkNode, xPos: number, yPos: number): void {
  // center root
  if (fuzzyEquals(xPos, 0) && fuzzyEquals(yPos, 0)) {
    node.x = xPos - (node.width ?? 0) / 2
    node.y = yPos - (node.height ?? 0) / 2
  } else {
    if (xPos < 0) {
      if (yPos < 0) {
        // lower left rectangle
        node.x = xPos - (node.width ?? 0)
        node.y = yPos
      } else {
        // upper left rectangle
        node.x = xPos - (node.width ?? 0)
        node.y = yPos + (node.height ?? 0)
      }
    } else {
      if (yPos < 0) {
        // lower right rectangle
        node.x = xPos
        node.y = yPos
      } else {
        // upper right rectangle
        node.x = xPos
        node.y = yPos + (node.height ?? 0)
      }
    }
  }
}

/** 树前驱: 第一条入边的 source 节点, 无 → null (Java RadialUtil.getTreeParent). */
export function getTreeParent(graph: ElkNode, node: ElkNode): ElkNode | null {
  const iterator = allIncomingEdges(graph, node)
  if (iterator.length > 0) {
    const edgeFromParent = iterator[0]!
    const srcId = nodeIdOfRef(graph, String(edgeFromParent.sources?.[0] ?? ''))
    return (srcId === undefined ? null : findNodeById(graph, srcId)) ?? null
  }
  return null
}
