/**
 * p3order / graph 性质测试共享工具 (writer C).
 *
 * 提供:
 *  1. 固定种子 (JavaRandom) 随机分层图构造器 — 只生成层间 EAST→WEST 边 (可选层内边),
 *     端口每边新建 (无 hyperedge / 无 NS dummy / 无自环), 保证计数语义简单可手算;
 *  2. 与 ELK Java 0.12.0 完全同索引的「暴力交叉计数 oracle」:
 *     用普通数组复刻 CrossingsCounter 的 BIT 扫描逻辑 (左层 EAST 自上而下、右层 WEST 自下而上),
 *     用于校验 BinaryIndexedTree 实现 (而非算法本身);
 *  3. AllCrossingsCounter 的手算和 = 首层 WEST 层内 + 末层 EAST 层内 + Σ 相邻层层间.
 */
import { LGraph, LNode, Layer as GLayer, LPort, LEdge, PortSide } from '../../../src/index.js'
import { JavaRandom } from '../../../src/util/java-random.js'
import { inNorthSouthEastWestOrder } from '../../../src/p3order/counting.js'

// ── 基础构造 ──

export function makeLayer(graph: LGraph): GLayer {
  const layer = new GLayer(graph)
  graph.getLayers().push(layer)
  return layer
}

export function addNodeToLayer(graph: LGraph, layer: GLayer): LNode {
  const node = new LNode(graph)
  node.setLayer(layer)
  return node
}

export function addNodesToLayer(graph: LGraph, n: number, layer: GLayer): LNode[] {
  const out: LNode[] = []
  for (let i = 0; i < n; i++) out.push(addNodeToLayer(graph, layer))
  return out
}

export function addPortOnSide(node: LNode, side: PortSide): LPort {
  const port = new LPort()
  port.setNode(node)
  port.setSide(side)
  return port
}

export function addEdgeBetweenPorts(from: LPort, to: LPort): LEdge {
  const edge = new LEdge()
  edge.setSource(from)
  edge.setTarget(to)
  return edge
}

export function eastWestEdge(left: LNode, right: LNode): void {
  addEdgeBetweenPorts(addPortOnSide(left, PortSide.EAST), addPortOnSide(right, PortSide.WEST))
}

/** 层 id / 节点层内 id 归一化 (0..n-1), 对应 ELK setUpIds. */
export function setUpLayerNodeIds(graph: LGraph): void {
  let l = 0
  for (const layer of graph.getLayers()) {
    layer.id = l++
    let i = 0
    for (const node of layer.getNodes()) node.id = i++
  }
}

/** 端口 id 归一化 (0..nPorts-1), 供独立 CrossingsCounter 使用. */
export function indexPortIds(graph: LGraph): void {
  graph.getAllNodes().flatMap(n => n.getPorts()).forEach((p, i) => { p.id = i })
}

export function countPorts(graph: LGraph): number {
  return graph.getAllNodes().reduce((sum, n) => sum + n.getPorts().length, 0)
}

// ── 随机分层图 ──

export interface RandomGraphOptions {
  numLayers: number
  nodesPerLayer: number
  /** 每个源节点生成的边数: min..max (含), 默认 1..2. */
  minEdges?: number
  maxEdges?: number
  /** 每层随机加 1 条层内边 (EAST 或 WEST 侧, 同一侧双端口). */
  inLayer?: boolean
}

export interface RandomGraphResult {
  graph: LGraph
  layers: LNode[][]
}

/** 固定种子随机分层图: 仅层间 EAST→WEST 边 (每边新建端口) + 可选层内边. */
export function randomLayeredGraph(seed: number, opts: RandomGraphOptions): RandomGraphResult {
  const r = new JavaRandom(seed)
  const minEdges = opts.minEdges ?? 1
  const maxEdges = opts.maxEdges ?? 2
  const graph = new LGraph()
  const layers: LNode[][] = []
  for (let i = 0; i < opts.numLayers; i++) {
    const layer = makeLayer(graph)
    layers.push(addNodesToLayer(graph, opts.nodesPerLayer, layer))
  }
  for (let i = 0; i < opts.numLayers - 1; i++) {
    for (const left of layers[i]!) {
      const numEdges = minEdges + r.nextInt(maxEdges - minEdges + 1)
      for (let e = 0; e < numEdges; e++) {
        const right = layers[i + 1]![r.nextInt(opts.nodesPerLayer)]!
        addEdgeBetweenPorts(addPortOnSide(left, PortSide.EAST), addPortOnSide(right, PortSide.WEST))
      }
    }
  }
  if (opts.inLayer) {
    for (let i = 0; i < opts.numLayers; i++) {
      const side = r.nextBoolean() ? PortSide.EAST : PortSide.WEST
      const a = layers[i]![r.nextInt(opts.nodesPerLayer)]!
      const b = layers[i]![r.nextInt(opts.nodesPerLayer)]!
      if (a !== b) addEdgeBetweenPorts(addPortOnSide(a, side), addPortOnSide(b, side))
    }
  }
  setUpLayerNodeIds(graph)
  return { graph, layers }
}

// ── 暴力计数 oracle (复刻 CrossingsCounter 的索引与扫描, 用普通数组代替 BIT) ──

/** 层间交叉暴力: 左层 EAST 自上而下 + 右层 WEST 自下而上 (ELK initPortPositionsCounterClockwise). */
export function bruteCrossingsBetweenLayers(left: LNode[], right: LNode[]): number {
  const pos = new Map<LPort, number>()
  const ports: LPort[] = []
  let n = 0
  for (const node of left) for (const p of node.getPortSideView(PortSide.EAST)) { pos.set(p, n++); ports.push(p) }
  for (let i = right.length - 1; i >= 0; i--) for (const p of right[i]!.getPortSideView(PortSide.WEST)) { pos.set(p, n++); ports.push(p) }
  const tree: number[] = []
  let crossings = 0
  for (const port of ports) {
    const pp = pos.get(port)!
    for (let i = tree.length - 1; i >= 0; i--) if (tree[i] === pp) tree.splice(i, 1)
    for (const edge of port.getConnectedEdges()) {
      const other = edge.getSource() === port ? edge.getTarget()! : edge.getSource()!
      const end = pos.get(other)!
      if (end > pp) {
        crossings += tree.filter(x => x < end).length
        tree.push(end)
      }
    }
  }
  return crossings
}

/** 层内交叉暴力: 同侧端口按 inNorthSouthEastWestOrder 编号 (ELK initPositionsForInLayerCrossings). */
export function bruteInLayerCrossings(nodes: LNode[], side: PortSide): number {
  const pos = new Map<LPort, number>()
  const ports: LPort[] = []
  let n = 0
  for (const node of nodes) for (const p of inNorthSouthEastWestOrder(node, side)) { pos.set(p, n++); ports.push(p) }
  const tree: number[] = []
  let crossings = 0
  const isInLayer = (e: LEdge) => e.getSource()!.getNode()!.getLayer() === e.getTarget()!.getNode()!.getLayer()
  for (const port of ports) {
    const pp = pos.get(port)!
    for (let i = tree.length - 1; i >= 0; i--) if (tree[i] === pp) tree.splice(i, 1)
    let numBetween = 0
    for (const edge of port.getConnectedEdges()) {
      const other = edge.getSource() === port ? edge.getTarget()! : edge.getSource()!
      const end = pos.get(other) ?? 0
      if (isInLayer(edge)) {
        if (end > pp) { crossings += tree.filter(x => x < end).length; tree.push(end) }
      } else {
        numBetween++
      }
    }
    crossings += tree.length * numBetween
  }
  return crossings
}

/**
 * AllCrossingsCounter 的手算和:
 * 首层 WEST 层内 + 末层 EAST 层内 + Σ 相邻层层间 (无 NS dummy / 无 hyperedge 时成立).
 */
export function manualAllCrossings(order: LNode[][]): number {
  if (order.length === 0) return 0
  let total = bruteInLayerCrossings(order[0]!, PortSide.WEST)
  total += bruteInLayerCrossings(order[order.length - 1]!, PortSide.EAST)
  for (let i = 0; i < order.length - 1; i++) total += bruteCrossingsBetweenLayers(order[i]!, order[i + 1]!)
  return total
}
