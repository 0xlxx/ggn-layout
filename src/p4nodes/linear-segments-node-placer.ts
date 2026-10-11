/**
 * LinearSegmentsNodePlacer (对应 ELK p4nodes.LinearSegmentsNodePlacer).
 *
 * 来源: org.eclipse.elk.alg.layered.p4nodes.LinearSegmentsNodePlacer (ELK 0.12.0)
 * 语义 (Sander 1996 §4): 把「单个普通节点 / 一条长边的全部 dummy」归为一个线性段,
 *   - sortLinearSegments: 对段排序图做拓扑排序 (遇环在当层分裂段);
 *   - createUnbalancedPlacement: 按拓扑序贪心堆放 (层高 = 最大占位);
 *   - balancePlacement: 力导向平衡 — 先摆锤 (只考虑入/出边之一) 后橡皮 (双向),
 *     段间重叠合并成 region (按权重加权平均偏转), 直到收敛;
 *   - postProcess: 段整体平移拉直一条入边/出边 (不越界).
 *
 * 接口与 simple-node-placer.ts / bk-node-placer.ts 对齐: 顶层导出 process 函数, 直接改
 * layeredGraph 各层节点 y 与层高。内部用 Map<LNode, number> 记录「节点 → 段 id」,
 * 代替 Java 复用 node.id 的做法 (ggn 的 LGraphElement.id 是全局唯一 id, 不能污染)。
 */
import type { LGraph } from '../graph/lgraph.js'
import type { LNode } from '../graph/lnode.js'
import { NodeType } from '../graph/enums.js'
import { Property } from '../graph/properties.js'
import { SPACINGS } from '../options/internal-properties.js'
import {
  SPACING_EDGE_EDGE,
  SPACING_NODE_NODE,
  THOROUGHNESS,
  PRIORITY_STRAIGHTNESS,
} from '../options/layered-options.js'
import type { Spacings } from './spacings.js'

/** 线性段偏转阻尼 (ELK LayeredOptions.NODE_PLACEMENT_LINEAR_SEGMENTS_DEFLECTION_DAMPENING, 默认 0.3). */
const NODE_PLACEMENT_LINEAR_SEGMENTS_DEFLECTION_DAMPENING = new Property<number>(
  'org.eclipse.elk.layered.nodePlacement.linearSegments.deflectionDampening',
  0.3,
)

/** 段重叠检测阈值因子 (对应 Java OVERLAP_DETECT, 与 NodePlacerTest 的 ε 配套). */
const OVERLAP_DETECT = 0.0001
/** 摆锤模式收敛阈值因子 (对应 Java THRESHOLD_FACTOR). */
const THRESHOLD_FACTOR = 20.0
/** 摆锤模式最小迭代数 (对应 Java PENDULUM_ITERS). */
const PENDULUM_ITERS = 4
/** 橡皮模式收敛后额外迭代数 (对应 Java FINAL_ITERS). */
const FINAL_ITERS = 3

/** 每个节点的入/出边最大拉直优先级 (对应 Java INPUT_PRIO / OUTPUT_PRIO). */
interface NodePriorities {
  input: number
  output: number
}

/** 平衡模式 (对应 Java Mode). */
type BalanceMode = 'FORW_PENDULUM' | 'BACKW_PENDULUM' | 'RUBBER'

/**
 * 线性段: 单个普通节点, 或一条长边的全部 dummy 节点 (含 NORTH_SOUTH_PORT 共享段).
 * 对应 Java LinearSegmentsNodePlacer.LinearSegment.
 */
class LinearSegment {
  /** 段内节点, 按层序排列. */
  nodes: LNode[] = []
  /** 段 id = 在 segments 数组中的下标. */
  id: number
  /** 在上一层中的下标 (段排序图建边用, 环检测). */
  indexInLastLayer = -1
  /** 发现该段节点的最后层下标 (环检测). */
  lastLayer = -1
  /** 累积偏转力. */
  deflection = 0
  /** 当前权重 (参与偏转的节点数). */
  weight = 0
  /** 已被合并到的 region 代表段 (region() 沿链回溯). */
  refSegment: LinearSegment | null = null
  /** 段内节点类型 (段构建时记录). */
  nodeType: NodeType = NodeType.NORMAL

  constructor(id: number) {
    this.id = id
  }

  /** 所在 region 的根段 (沿 refSegment 链回溯). */
  region(): LinearSegment {
    let seg: LinearSegment = this
    while (seg.refSegment !== null) seg = seg.refSegment
    return seg
  }

  /**
   * 在给定节点处分裂本段: 从 node 起的节点移入新段 (id = newId), 并更新 segmentIdOf.
   * 对应 Java LinearSegment.split.
   */
  split(node: LNode, newId: number, segmentIdOf: Map<LNode, number>): LinearSegment {
    const nodeIndex = this.nodes.indexOf(node)
    const newSegment = new LinearSegment(newId)
    const moved = this.nodes.splice(nodeIndex)
    newSegment.nodes.push(...moved)
    for (const movedNode of moved) segmentIdOf.set(movedNode, newId)
    return newSegment
  }
}

/**
 * 主入口: 线性段节点放置 (对应 Java LinearSegmentsNodePlacer.process).
 * 前置: 图已完成 proper layering + 节点排序 + 端口摆放; 后置: 各层节点无重叠,
 * 层高 = 最大层高, 长边 dummy 段竖直对齐。
 */
export function processLinearSegmentsNodePlace(layeredGraph: LGraph): void {
  const spacings = layeredGraph.getProperty(SPACINGS)
  const priorities = computeNodePriorities(layeredGraph)
  const segmentIdOf = new Map<LNode, number>()

  const linearSegments = sortLinearSegments(layeredGraph, segmentIdOf)
  createUnbalancedPlacement(layeredGraph, linearSegments, spacings)
  balancePlacement(layeredGraph, linearSegments, spacings, priorities, segmentIdOf)
  postProcess(layeredGraph, linearSegments, spacings)
}

/**
 * 纯内省: 收集放置所用的最终线性段 (Java sortLinearSegments 全流程, 含环分裂), 不放置节点。
 * 供测试断言「段对齐」: 同一段内所有节点 y 相等 (长边拉直)。环分裂后段独立移动,
 * 故必须以「排序+分裂后」的段为准 (原始 fillSegment 分组在分裂场景会误报未对齐)。
 */
export function collectLinearSegments(layeredGraph: LGraph): LNode[][] {
  const segmentIdOf = new Map<LNode, number>()
  return sortLinearSegments(layeredGraph, segmentIdOf).map(segment => segment.nodes)
}

/** 计算每节点入/出边最大拉直优先级 (对应 Java sortLinearSegments 第一步). */
function computeNodePriorities(layeredGraph: LGraph): Map<LNode, NodePriorities> {
  const priorities = new Map<LNode, NodePriorities>()
  for (const layer of layeredGraph.getLayers()) {
    for (const node of layer.getNodes()) {
      let input = Number.MIN_SAFE_INTEGER
      let output = Number.MIN_SAFE_INTEGER
      for (const port of node.getPorts()) {
        for (const edge of port.getIncomingEdges()) {
          input = Math.max(input, edge.getProperty(PRIORITY_STRAIGHTNESS))
        }
        for (const edge of port.getOutgoingEdges()) {
          output = Math.max(output, edge.getProperty(PRIORITY_STRAIGHTNESS))
        }
      }
      priorities.set(node, { input, output })
    }
  }
  return priorities
}

/**
 * 收集线性段并对段排序图做拓扑排序, 返回按拓扑序排列的段数组 (段 id 重排为 rank)。
 * 对应 Java sortLinearSegments。
 */
function sortLinearSegments(
  layeredGraph: LGraph,
  segmentIdOf: Map<LNode, number>,
): LinearSegment[] {
  // 建段: 忽略奇偶端口侧 dummy, 长边/N-S dummy 只与下一个同类型 dummy 共享段.
  const segmentList: LinearSegment[] = []
  let nextLinearSegmentID = 0
  for (const layer of layeredGraph.getLayers()) {
    for (const node of layer.getNodes()) {
      if (!segmentIdOf.has(node)) {
        const segment = new LinearSegment(nextLinearSegmentID++)
        fillSegment(node, segment, segmentIdOf)
        segmentList.push(segment)
      }
    }
  }

  // 段排序图初始化.
  const outgoingList: LinearSegment[][] = segmentList.map(() => [])
  const incomingCountList: number[] = segmentList.map(() => 0)

  // 建边 (遇环分裂段).
  createDependencyGraphEdges(layeredGraph, segmentList, outgoingList, incomingCountList, segmentIdOf)

  // 拓扑排序.
  const noIncoming: LinearSegment[] = []
  for (let i = 0; i < segmentList.length; i++) {
    if (incomingCountList[i] === 0) noIncoming.push(segmentList[i]!)
  }
  const newRanks = new Array<number>(segmentList.length)
  let nextRank = 0
  while (noIncoming.length > 0) {
    const segment = noIncoming.shift()!
    newRanks[segment.id] = nextRank++

    while (outgoingList[segment.id]!.length > 0) {
      const target = outgoingList[segment.id]!.shift()!
      incomingCountList[target.id]!--
      if (incomingCountList[target.id] === 0) noIncoming.push(target)
    }
  }

  // 按新排序重排段数组, 段 id = rank, 节点 → 段 id 同步更新.
  const linearSegments = new Array<LinearSegment>(segmentList.length)
  for (let i = 0; i < segmentList.length; i++) {
    const ls = segmentList[i]!
    const rank = newRanks[i]!
    linearSegments[rank] = ls
    ls.id = rank
    for (const node of ls.nodes) segmentIdOf.set(node, rank)
  }
  return linearSegments
}

/**
 * 把节点放入段, 并顺链并入长边/N-S 后继 dummy (最多一个)。
 * 对应 Java fillSegment。
 */
function fillSegment(node: LNode, segment: LinearSegment, segmentIdOf: Map<LNode, number>): boolean {
  const nodeType = node.getType()
  if (segmentIdOf.has(node)) {
    // 已在别的段中
    return false
  }
  segmentIdOf.set(node, segment.id)
  segment.nodes.push(node)
  segment.nodeType = nodeType

  if (nodeType === NodeType.LONG_EDGE || nodeType === NodeType.NORTH_SOUTH_PORT) {
    // 长边/N-S dummy: 若后继也是同类 dummy 且不在同一层, 并入本段 (只并入一个).
    for (const sourcePort of node.getPorts()) {
      for (const targetPort of sourcePort.getSuccessorPorts()) {
        const targetNode = targetPort.getNode()!
        const targetNodeType = targetNode.getType()
        if (node.getLayer() !== targetNode.getLayer()
          && (targetNodeType === NodeType.LONG_EDGE || targetNodeType === NodeType.NORTH_SOUTH_PORT)) {
          if (fillSegment(targetNode, segment, segmentIdOf)) return true
        }
      }
    }
  }
  return true
}

/**
 * 为段排序图建依赖边; 若依赖会引入环, 把该段在当层分裂成两段。
 * 对应 Java createDependencyGraphEdges。
 */
function createDependencyGraphEdges(
  layeredGraph: LGraph,
  segmentList: LinearSegment[],
  outgoingList: LinearSegment[][],
  incomingCountList: number[],
  segmentIdOf: Map<LNode, number>,
): void {
  let nextLinearSegmentID = segmentList.length
  let layerIndex = 0
  for (const layer of layeredGraph.getLayers()) {
    const nodes = layer.getNodes()
    if (nodes.length === 0) {
      // 忽略空层
      continue
    }

    let indexInLayer = 0
    let previousNode: LNode | null = null
    let currentNode: LNode | null = nodes[0]!
    let currentSegment: LinearSegment | null = null

    while (currentNode !== null) {
      // 取当前节点的段
      currentSegment = segmentList[segmentIdOf.get(currentNode)!]!

      /*
       * 环检测: 当前段也在上一层出现, 且上一层里有「本层排在本段之后、却在上一层排在本段之前」
       * 的段 → 会成环 → 把当前段在当层分裂 (x2 从当层开始), 绕开环。
       */
      if (currentSegment.indexInLastLayer >= 0) {
        let cycleSegment: LinearSegment | null = null
        for (let i = indexInLayer + 1; i < nodes.length; i++) {
          const cycleNode = nodes[i]!
          const candidate = segmentList[segmentIdOf.get(cycleNode)!]!
          if (candidate.lastLayer === currentSegment.lastLayer
            && candidate.indexInLastLayer < currentSegment.indexInLastLayer) {
            cycleSegment = candidate
            break
          }
        }

        if (cycleSegment !== null) {
          // 分裂前先撤掉 previous → current 的依赖
          if (previousNode !== null) {
            const previousSegment = segmentList[segmentIdOf.get(previousNode)!]!
            incomingCountList[currentSegment.id]!--
            const prevOutgoing = outgoingList[previousSegment.id]!
            const idx = prevOutgoing.indexOf(currentSegment)
            if (idx !== -1) prevOutgoing.splice(idx, 1)
          }

          currentSegment = currentSegment.split(currentNode, nextLinearSegmentID++, segmentIdOf)
          segmentList.push(currentSegment)
          outgoingList.push([])

          if (previousNode !== null) {
            outgoingList[segmentIdOf.get(previousNode)!]!.push(currentSegment)
            incomingCountList.push(1)
          } else {
            incomingCountList.push(0)
          }
        }
      }

      // 若还有下一个节点, 建立 current → next 的依赖
      let nextNode: LNode | null = null
      if (indexInLayer + 1 < nodes.length) {
        nextNode = nodes[indexInLayer + 1]!
        const nextSegment = segmentList[segmentIdOf.get(nextNode)!]!
        outgoingList[currentSegment.id]!.push(nextSegment)
        incomingCountList[nextSegment.id]++
      }

      // 更新段的层信息
      currentSegment.lastLayer = layerIndex
      currentSegment.indexInLastLayer = indexInLayer++

      previousNode = currentNode
      currentNode = nextNode
    }

    layerIndex++
  }
}

/** 创建非平衡放置: 按拓扑序贪心堆放 (对应 Java createUnbalancedPlacement). */
function createUnbalancedPlacement(
  layeredGraph: LGraph,
  linearSegments: LinearSegment[],
  spacings: Spacings,
): void {
  // 各层当前已放节点数 / 最近放置的节点
  const layerCount = layeredGraph.getLayers().length
  const nodeCount = new Array<number>(layerCount).fill(0)
  const recentNode = new Array<LNode | null>(layerCount).fill(null)

  for (const segment of linearSegments) {
    // 确定段的最上放置位置
    let uppermostPlace = 0
    for (const node of segment.nodes) {
      const layerIndex = node.getLayer()!.getIndex()
      nodeCount[layerIndex]++

      let spacing = layeredGraph.getProperty(SPACING_EDGE_EDGE)
      if (nodeCount[layerIndex] > 0 && recentNode[layerIndex] !== null) {
        spacing = spacings.getVerticalSpacing(recentNode[layerIndex]!, node)
      }
      uppermostPlace = Math.max(uppermostPlace, node.getLayer()!.getSize().y + spacing)
    }

    // 应用到段内所有节点并更新层高
    for (const node of segment.nodes) {
      node.getPosition().y = uppermostPlace + node.getMargin().top
      const layer = node.getLayer()!
      layer.getSize().y = uppermostPlace + node.getMargin().top + node.getSize().y + node.getMargin().bottom
      recentNode[layer.getIndex()] = node
    }
  }
}

/**
 * 力导向平衡放置 (对应 Java balancePlacement): 摆锤 (单向边) + 橡皮 (双向边),
 * 段合并成 region 加权平均偏转, 直到收敛。
 */
function balancePlacement(
  layeredGraph: LGraph,
  linearSegments: LinearSegment[],
  spacings: Spacings,
  priorities: Map<LNode, NodePriorities>,
  segmentIdOf: Map<LNode, number>,
): void {
  const deflectionDampening = layeredGraph.getProperty(NODE_PLACEMENT_LINEAR_SEGMENTS_DEFLECTION_DAMPENING)
  const thoroughness = layeredGraph.getProperty(THOROUGHNESS)

  let pendulumIters = PENDULUM_ITERS
  let finalIters = FINAL_ITERS
  const threshold = THRESHOLD_FACTOR / thoroughness

  let ready = false
  let mode: BalanceMode = 'FORW_PENDULUM'
  let lastTotalDeflection = Number.MAX_SAFE_INTEGER
  do {
    // 计算每个线性段的力
    const incoming = mode !== 'BACKW_PENDULUM'
    const outgoing = mode !== 'FORW_PENDULUM'
    let totalDeflection = 0
    for (const segment of linearSegments) {
      segment.refSegment = null
      calcDeflection(segment, linearSegments, incoming, outgoing, deflectionDampening, priorities, segmentIdOf)
      totalDeflection += Math.abs(segment.deflection)
    }

    // 合并相互触碰的段成 region
    let merged: boolean
    do {
      merged = mergeRegions(layeredGraph, linearSegments, spacings, segmentIdOf)
    } while (merged)

    // 按 region 的偏转移动节点
    for (const segment of linearSegments) {
      const deflection = segment.region().deflection
      if (deflection !== 0) {
        for (const node of segment.nodes) node.getPosition().y += deflection
      }
    }

    // 更新平衡模式
    if (mode === 'FORW_PENDULUM' || mode === 'BACKW_PENDULUM') {
      pendulumIters--
      if (pendulumIters <= 0 && (totalDeflection < lastTotalDeflection || -pendulumIters > thoroughness)) {
        mode = 'RUBBER'
        lastTotalDeflection = Number.MAX_SAFE_INTEGER
      } else if (mode === 'FORW_PENDULUM') {
        mode = 'BACKW_PENDULUM'
        lastTotalDeflection = totalDeflection
      } else {
        mode = 'FORW_PENDULUM'
        lastTotalDeflection = totalDeflection
      }
    } else {
      ready = totalDeflection >= lastTotalDeflection
        || lastTotalDeflection - totalDeflection < threshold
      lastTotalDeflection = totalDeflection
      if (ready) finalIters--
    }
  } while (!(ready && finalIters <= 0))
}

/**
 * 计算段的偏转力 (对应 Java calcDeflection): 仅考虑优先级不低于两端 minPrio 的边,
 * 偏转 = 各节点「对端端口绝对锚点 − 本端口绝对锚点」均值 × 阻尼。
 */
function calcDeflection(
  segment: LinearSegment,
  linearSegments: LinearSegment[],
  incoming: boolean,
  outgoing: boolean,
  deflectionDampening: number,
  priorities: Map<LNode, NodePriorities>,
  segmentIdOf: Map<LNode, number>,
): void {
  let segmentDeflection = 0
  let nodeWeightSum = 0

  for (const node of segment.nodes) {
    let nodeDeflection = 0
    let edgeWeightSum = 0
    const nodePrios = priorities.get(node)!
    const inputPrio = incoming ? nodePrios.input : Number.MIN_SAFE_INTEGER
    const outputPrio = outgoing ? nodePrios.output : Number.MIN_SAFE_INTEGER
    const minPrio = Math.max(inputPrio, outputPrio)

    for (const port of node.getPorts()) {
      const portpos = node.getPosition().y + port.getPosition().y + port.getAnchor().y

      if (outgoing) {
        for (const edge of port.getOutgoingEdges()) {
          const otherPort = edge.getTarget()!
          const otherNode = otherPort.getNode()!
          if (segment !== linearSegments[segmentIdOf.get(otherNode)!]!) {
            const otherPrios = priorities.get(otherNode)!
            const otherPrio = Math.max(otherPrios.input, otherPrios.output)
            const prio = edge.getProperty(PRIORITY_STRAIGHTNESS)
            if (prio >= minPrio && prio >= otherPrio) {
              nodeDeflection += otherNode.getPosition().y + otherPort.getPosition().y + otherPort.getAnchor().y - portpos
              edgeWeightSum++
            }
          }
        }
      }

      if (incoming) {
        for (const edge of port.getIncomingEdges()) {
          const otherPort = edge.getSource()!
          const otherNode = otherPort.getNode()!
          if (segment !== linearSegments[segmentIdOf.get(otherNode)!]!) {
            const otherPrios = priorities.get(otherNode)!
            const otherPrio = Math.max(otherPrios.input, otherPrios.output)
            const prio = edge.getProperty(PRIORITY_STRAIGHTNESS)
            if (prio >= minPrio && prio >= otherPrio) {
              nodeDeflection += otherNode.getPosition().y + otherPort.getPosition().y + otherPort.getAnchor().y - portpos
              edgeWeightSum++
            }
          }
        }
      }
    }

    // 避免除零
    if (edgeWeightSum > 0) {
      segmentDeflection += nodeDeflection / edgeWeightSum
      nodeWeightSum++
    }
  }

  if (nodeWeightSum > 0) {
    segment.deflection = deflectionDampening * segmentDeflection / nodeWeightSum
    segment.weight = nodeWeightSum
  } else {
    segment.deflection = 0
    segment.weight = 0
  }
}

/**
 * 合并会重叠的 region (对应 Java mergeRegions): 相邻节点应用偏转后若重叠, 把上面 region
 * 并入下面 region, 按权重加权平均偏转。
 */
function mergeRegions(
  layeredGraph: LGraph,
  linearSegments: LinearSegment[],
  spacings: Spacings,
  segmentIdOf: Map<LNode, number>,
): boolean {
  let changed = false
  const nodeSpacing = layeredGraph.getProperty(SPACING_NODE_NODE)
  const threshold = OVERLAP_DETECT * nodeSpacing

  for (const layer of layeredGraph.getLayers()) {
    const nodes = layer.getNodes()
    if (nodes.length === 0) continue

    let node1 = nodes[0]!
    let region1 = linearSegments[segmentIdOf.get(node1)!]!.region()
    for (let i = 1; i < nodes.length; i++) {
      const node2 = nodes[i]!
      const region2 = linearSegments[segmentIdOf.get(node2)!]!.region()

      if (region1 !== region2) {
        // 计算两节点间允许的间距
        const spacing = spacings.getVerticalSpacing(node1, node2)

        const node1Extent = node1.getPosition().y + node1.getSize().y
          + node1.getMargin().bottom + region1.deflection + spacing
        const node2Extent = node2.getPosition().y - node2.getMargin().top + region2.deflection

        // 偏转后是否重叠
        if (node1Extent > node2Extent + threshold) {
          // 把上面的 region 并入下面的 region (加权平均偏转)
          const weightSum = region1.weight + region2.weight
          if (weightSum > 0) {
            region2.deflection = (region2.weight * region2.deflection
              + region1.weight * region1.deflection) / weightSum
            region2.weight = weightSum
            region1.refSegment = region2
            changed = true
          }
        }
      }

      node1 = node2
      region1 = region2
    }
  }
  return changed
}

/** 后处理: 段整体平移拉直一条入边或出边 (对应 Java postProcess). */
function postProcess(
  layeredGraph: LGraph,
  linearSegments: LinearSegment[],
  spacings: Spacings,
): void {
  for (const segment of linearSegments) {
    let minRoomAbove = Number.MAX_SAFE_INTEGER
    let minRoomBelow = Number.MAX_SAFE_INTEGER

    for (const node of segment.nodes) {
      const index = node.getIndex()
      const nodes = node.getLayer()!.getNodes()
      let roomAbove: number
      let roomBelow: number

      // 段可上移量 (不重叠)
      if (index > 0) {
        const neighbor = nodes[index - 1]!
        const spacing = spacings.getVerticalSpacing(node, neighbor)
        roomAbove = node.getPosition().y - node.getMargin().top
          - (neighbor.getPosition().y + neighbor.getSize().y + neighbor.getMargin().bottom + spacing)
      } else {
        roomAbove = node.getPosition().y - node.getMargin().top
      }
      minRoomAbove = Math.min(roomAbove, minRoomAbove)

      // 段可下移量 (不重叠)
      if (index < nodes.length - 1) {
        const neighbor = nodes[index + 1]!
        const spacing = spacings.getVerticalSpacing(node, neighbor)
        roomBelow = neighbor.getPosition().y - neighbor.getMargin().top
          - (node.getPosition().y + node.getSize().y + node.getMargin().bottom + spacing)
      } else {
        roomBelow = 2 * node.getPosition().y
      }
      minRoomBelow = Math.min(roomBelow, minRoomBelow)
    }

    let minDisplacement = Number.MAX_SAFE_INTEGER
    let foundPlace = false

    // 使一条入边拉直的最小位移 (看段首节点的入边)
    const firstNode = segment.nodes[0]!
    for (const target of firstNode.getPorts()) {
      const pos = firstNode.getPosition().y + target.getPosition().y + target.getAnchor().y
      for (const edge of target.getIncomingEdges()) {
        const source = edge.getSource()!
        const d = source.getNode()!.getPosition().y + source.getPosition().y + source.getAnchor().y - pos
        if (Math.abs(d) < Math.abs(minDisplacement)
          && Math.abs(d) < (d < 0 ? minRoomAbove : minRoomBelow)) {
          minDisplacement = d
          foundPlace = true
        }
      }
    }

    // 使一条出边拉直的最小位移 (看段末节点的出边)
    const lastNode = segment.nodes[segment.nodes.length - 1]!
    for (const source of lastNode.getPorts()) {
      const pos = lastNode.getPosition().y + source.getPosition().y + source.getAnchor().y
      for (const edge of source.getOutgoingEdges()) {
        const target = edge.getTarget()!
        const d = target.getNode()!.getPosition().y + target.getPosition().y + target.getAnchor().y - pos
        if (Math.abs(d) < Math.abs(minDisplacement)
          && Math.abs(d) < (d < 0 ? minRoomAbove : minRoomBelow)) {
          minDisplacement = d
          foundPlace = true
        }
      }
    }

    // 找到位移就整体平移该段
    if (foundPlace && minDisplacement !== 0) {
      for (const node of segment.nodes) node.getPosition().y += minDisplacement
    }
  }
}
