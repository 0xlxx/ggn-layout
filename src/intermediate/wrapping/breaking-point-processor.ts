/**
 * BreakingPointProcessor (对应 ELK wrapping.BreakingPointProcessor) — 断点处理器三件套之二.
 *
 * 前/后两个处理器负责插入/移除断点 dummy, 本处理器执行真正的 'wrapping': 定位断点
 * start dummy, 把其后的层移回之前的 (已存在的) 层. 由于交叉最小化已完成, 层内节点
 * 顺序必须仔细维持.
 *
 * 改进步骤 (可选) 内部用节点在层内的索引定位 (Java 复用 LGraphElement.id 字段),
 * 本移植以局部 Map<LNode, number> 复刻同一套索引维护 (assign / updateIndexesAfter /
 * 插入后显式赋值), 保证与 Java 逐点一致.
 *
 * 前置条件: 已执行交叉最小化, 断点 dummy 已插入; 插槽: P3 之后.
 *
 * 来源: org.eclipse.elk.alg.layered.intermediate.wrapping.BreakingPointProcessor
 */
import type { LGraph } from '../../graph/lgraph.js'
import type { LNode } from '../../graph/lnode.js'
import { Layer } from '../../graph/layer.js'
import { NodeType } from '../../graph/enums.js'
import { BREAKING_POINT_INFO, CYCLIC } from '../../options/internal-properties.js'
import { WRAPPING_MULTI_EDGE_IMPROVE_WRAPPED_EDGES } from '../../options/layered-options.js'
import { joinAt } from '../long-edge-joiner.js'
import { BPInfo } from './bp-info.js'
import { insertDummies } from './cutting-utils.js'

/** 执行 wrapping 的入口 (对应 BreakingPointProcessor.process). */
export function processBreakingPoints(graph: LGraph): void {
  // #1 执行初始 wrapping
  performWrapping(graph)

  // #2 可选: 改进边长度
  if (graph.getProperty(WRAPPING_MULTI_EDGE_IMPROVE_WRAPPED_EDGES)) {
    // 给节点赋索引, 使节点索引 = 其在层内的位置
    const indexes = new Map<LNode, number>()
    for (const l of graph.getLayers()) {
      let index = 0
      for (const n of l.getNodes()) {
        indexes.set(n, index++)
      }
    }

    improveMultiCutIndexEdges(graph, indexes)
    improveUnneccesarilyLongEdges(graph, indexes, true)
    improveUnneccesarilyLongEdges(graph, indexes, false)
  }
}

/**
 * 主要 wrapping 过程: 把确定的 chunk 一个放在另一个下面.
 */
function performWrapping(graph: LGraph): void {
  const layers = graph.getLayers()

  // 添加初始空层以容纳断点 start dummy
  layers.unshift(new Layer(graph))

  // 从左到右迭代层:
  //  一遇到含 BREAKING POINT start dummy 的层, 下一层的节点应移到最开始的层
  //  从而 'wrap' 图
  let reverse = false
  let idx = 1
  let pos = 1

  while (pos < layers.length) {
    const layer = layers[pos]!
    const newLayer = layers[idx]!
    const nodesToMove = [...layer.getNodes()]

    // 记住用于稍后添加 in-layer dummy 的偏移
    const offset = nodesToMove.length

    // 把节点移到新层
    for (const n of nodesToMove) {
      n.setLayer(newLayer)
    }

    if (reverse) {
      // 长边 dummy 链必须以逆序引入
      for (const n of [...nodesToMove].reverse()) {
        for (const e of [...n.getIncomingEdges()]) {
          // 反转边
          e.reverse(graph, true)
          graph.setProperty(CYCLIC, true)

          // 为新产生的长边插入合适的 dummy 节点
          const dummyEdges = insertDummies(graph, e, offset)

          // 改善断点信息
          const bpi = n.getProperty(BREAKING_POINT_INFO)!
          const startInLayerEdge = dummyEdges[dummyEdges.length - 1]!
          bpi.startInLayerDummy = startInLayerEdge.getSource()!.getNode()!
          bpi.startInLayerEdge = startInLayerEdge
          bpi.endInLayerDummy = e.getTarget()!.getNode()!
          bpi.endInLayerEdge = e
        }
      }
      reverse = false
    } else {
      if (nodesToMove.length > 0) {
        const aNode = nodesToMove[0]!
        if (aNode.getType() === NodeType.BREAKING_POINT) {
          // 下一层应被移动 (它包含断点 end dummy)
          reverse = true
          // 开始把节点移到最开始的层
          idx = -1
        }
      }
    }

    idx++
    pos++
  }

  // 移除现在为空的旧层
  for (let i = layers.length - 1; i >= 0; i--) {
    if (layers[i]!.getNodes().length === 0) {
      layers.splice(i, 1)
    }
  }
}

/**
 * 改进步骤: 缩短跨越多个切割索引的边的总长度.
 */
function improveMultiCutIndexEdges(graph: LGraph, indexes: Map<LNode, number>): void {
  for (const l of graph.getLayers()) {
    for (const n of [...l.getNodes()]) {
      if (BPInfo.isStart(n)) {
        const info = n.getProperty(BREAKING_POINT_INFO)!

        if (info.prev === null && info.next !== null) {
          let current: BPInfo = info
          let next: BPInfo | null = info.next

          while (next !== null) {
            // 丢弃 dummy 链
            dropDummies(indexes, next.start, next.startInLayerDummy!, false, true)

            // 更新后续节点的 in-layer 索引
            updateIndexesAfter(indexes, current.end!)
            updateIndexesAfter(indexes, next.start)
            updateIndexesAfter(indexes, next.startInLayerDummy!)
            updateIndexesAfter(indexes, next.endInLayerDummy!)

            // 重连边
            next.endInLayerEdge!.setTarget(current.endInLayerEdge!.getTarget()!)
            current.endInLayerEdge!.setTarget(null)

            // 丢掉所有多余的
            current.end!.setLayer(null)
            next.start.setLayer(null)
            next.startInLayerDummy!.setLayer(null)
            next.endInLayerDummy!.setLayer(null)

            // 更新 BPInfo
            const newInfo = new BPInfo(current.start, next.end, current.nodeStartEdge,
              next.startEndEdge, next.originalEdge)
            newInfo.startInLayerDummy = current.startInLayerDummy
            newInfo.startInLayerEdge = current.startInLayerEdge
            newInfo.endInLayerDummy = current.endInLayerDummy
            newInfo.endInLayerEdge = next.endInLayerEdge
            newInfo.prev = current.prev
            newInfo.next = next.next

            current.start.setProperty(BREAKING_POINT_INFO, newInfo)
            next.end.setProperty(BREAKING_POINT_INFO, newInfo)

            next = next.next
            // 用新组装的 BPInfo 继续 (_不_用 'next')
            current = newInfo
          }
        }
      }
    }
  }
}

/**
 * 改进步骤: 缩短被 wrap 回的边的长度.
 */
function improveUnneccesarilyLongEdges(graph: LGraph, indexes: Map<LNode, number>, forwards: boolean): void {
  const check = forwards ? BPInfo.isEnd : BPInfo.isStart

  let didsome = false
  do {
    didsome = false

    const layers = forwards ? [...graph.getLayers()].reverse() : graph.getLayers()
    for (const layer of layers) {
      const nodes = [...layer.getNodes()]
      if (!forwards) {
        nodes.reverse()
      }

      for (const n of nodes) {
        if (check(n)) {
          const bpNode = n
          const bpInfo = n.getProperty(BREAKING_POINT_INFO)!
          const dummy = forwards ? bpInfo.endInLayerDummy! : bpInfo.startInLayerDummy!

          // 注意: 直接赋值 (与 Java 一致) — 若最后一次调用返回 false 会提前终止外层循环
          didsome = dropDummies(indexes, bpNode, dummy, forwards, false)
        }
      }
    }
  } while (didsome)
}

/**
 * 丢弃如下场景中的 dummy 节点:
 * <pre>
 *  ... -- d1 -- d2 -- startBP
 *                        |
 *  ... -- d4 -- d3 -- inLayer
 * </pre>
 * 从右到左迭代层, 识别 {@code startBP} 与 {@code inLayer} dummy 后, 成对移除
 * long edge dummy {@code (d2, d3)} 与 {@code (d1, d4)} (条件是 {@code force}
 * 为 true, 或该对 dummy 在层内相邻). {@code forwards} 为 true 时处理对称情形.
 *
 * @return 是否移除了任何 dummy.
 */
function dropDummies(indexes: Map<LNode, number>, bpNode: LNode, inLayerDummy: LNode,
  forwards: boolean, force: boolean): boolean {
  // 取相邻的 long edge dummy (若有)
  let predOne = nextLongEdgeDummy(bpNode, forwards)
  let predTwo = nextLongEdgeDummy(inLayerDummy, forwards)

  // predOne 和 predTwo 保证是 LONG_EDGE
  let didsome = false
  while (predOne !== null && predTwo !== null) {
    if (force || isAdjacentOrSeparatedByBreakingpoints(indexes, predOne, predTwo, forwards)) {
      const nextOne = nextLongEdgeDummy(predOne, forwards)
      const nextTwo = nextLongEdgeDummy(predTwo, forwards)

      updateIndexesAfter(indexes, inLayerDummy)
      updateIndexesAfter(indexes, bpNode)

      // 两个 dummy 在同一层
      const newLayer = predOne.getLayer()!
      const predTwoIdx = indexes.get(predTwo)!
      const predOneIdx = indexes.get(predOne)!

      joinAt(predOne, false)
      joinAt(predTwo, false)

      if (forwards) {
        inLayerDummy.setLayerAt(predTwoIdx, newLayer)
        indexes.set(inLayerDummy, predTwoIdx)
        bpNode.setLayerAt(predOneIdx + 1, newLayer)
        indexes.set(bpNode, predOneIdx)
      } else {
        bpNode.setLayerAt(predOneIdx, newLayer)
        indexes.set(bpNode, predOneIdx)
        inLayerDummy.setLayerAt(predTwoIdx + 1, newLayer)
        indexes.set(inLayerDummy, predTwoIdx)
      }

      predOne.setLayer(null)
      predTwo.setLayer(null)

      predOne = nextOne
      predTwo = nextTwo

      didsome = true
    } else {
      break
    }
  }
  return didsome
}

/**
 * 两个 dummy 之间只允许有 BREAKING_POINT 或 in-layer dummy, 否则判定不相邻.
 */
function isAdjacentOrSeparatedByBreakingpoints(indexes: Map<LNode, number>, dummy1: LNode, dummy2: LNode,
  forwards: boolean): boolean {
  // d1 是与 bp dummy 同排的那个
  const layer = dummy1.getLayer()!
  const start = forwards ? dummy2 : dummy1
  const end = forwards ? dummy1 : dummy2

  const startIdx = indexes.get(start)!
  const endIdx = indexes.get(end)!
  for (let i = startIdx + 1; i < endIdx; ++i) {
    // 已知 nodes 是数组, 可直接按下标查询
    const node = layer.getNodes()[i]!
    if (node.getType() !== NodeType.BREAKING_POINT && !isInLayerDummy(node)) {
      return false
    }
  }

  return true
}

/**
 * 沿 forwarding 方向找相邻的 long edge dummy (可能跨层).
 */
function nextLongEdgeDummy(start: LNode, forwards: boolean): LNode | null {
  const edges = forwards ? start.getOutgoingEdges() : start.getIncomingEdges()

  // 通常 long edge dummy 之间恰好连一条边.
  // 然而允许 'start' 节点是 in-layer dummy,
  // 于是它可能有两条入边, 其中一条是 in-layer 边.
  for (const e of edges) {
    const other = e.getOtherNode(start)
    if (other !== null && other.getType() === NodeType.LONG_EDGE
      && other.getLayer() !== start.getLayer()) {
      return other
    }
  }
  return null
}

/** 是否 in-layer dummy: LONG_EDGE 节点且连接了同层非自环边. */
function isInLayerDummy(node: LNode): boolean {
  if (node.getType() === NodeType.LONG_EDGE) {
    for (const e of node.getConnectedEdges()) {
      if (!e.isSelfLoop() && node.getLayer() === e.getOtherNode(node)?.getLayer()) {
        return true
      }
    }
  }
  return false
}

/** 把节点之后所有节点的索引减一 (Java 维护 id 字段的对应操作). */
function updateIndexesAfter(indexes: Map<LNode, number>, node: LNode): void {
  const nodeIdx = indexes.get(node)!
  const nodes = node.getLayer()!.getNodes()
  for (let i = nodeIdx + 1; i < nodes.length; ++i) {
    const n = nodes[i]!
    indexes.set(n, indexes.get(n)! - 1)
  }
}
