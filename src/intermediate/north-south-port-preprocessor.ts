/**
 * NorthSouthPortPreprocessor (对应 ELK intermediate.NorthSouthPortPreprocessor).
 * P3 前置: 为 NORTH/SOUTH 端口创建 NS dummy 节点 (边重连 + 层内布局单元 + successor 约束).
 *
 * 现代 TS: 模块级函数 + 数组方法; 跳过 model order / ALLOW_NON_FLOW 分支 (默认关闭).
 */
import type { LGraph } from '../graph/lgraph.js'
import { LNode } from '../graph/lnode.js'
import { LPort } from '../graph/lport.js'
import { NodeType, PortSide, PortConstraints } from '../graph/enums.js'
import { ORIGIN, PORT_DUMMY, IN_LAYER_LAYOUT_UNIT, IN_LAYER_SUCCESSOR_CONSTRAINTS, BARYCENTER_ASSOCIATES, CROSSING_HINT, PORT_IS_OUTPUT } from '../options/internal-properties.js'
import { PORT_CONSTRAINTS as PCC, ALLOW_NON_FLOW_PORTS_TO_SWITCH_SIDES, CONSIDER_MODEL_ORDER_STRATEGY, OrderingStrategy } from '../options/layered-options.js'
import { GRAPH_PROPERTIES, GraphProperties } from '../options/internal-properties.js'

/**
 * 排序端口列表: in 左 / inOut 中 / out 右 (N 升序, S 降序, E/W 保持).
 * 对应 ELK NorthSouthPortPreprocessor.sortPortList (非 order-fixed 且 considerModelOrder=NONE).
 * 注意: 直接重排 node.getPorts() 数组 — 边持对象引用, 重排只影响 getPorts(side) 迭代序.
 */
function sortPortList(node: LNode): void {
  const ports = node.getPorts()
  const total = ports.length
  let inPorts = 0
  let inOutPorts = total
  let outPorts = 2 * total
  const id = new Map<LPort, number>()

  for (const port of ports) {
    switch (port.getSide()) {
      case PortSide.EAST:
      case PortSide.WEST:
        id.set(port, -1)
        break
      case PortSide.NORTH:
      case PortSide.SOUTH: {
        const incoming = port.getIncomingEdges().length
        const outgoing = port.getOutgoingEdges().length
        if (incoming > 0 && outgoing > 0) id.set(port, inOutPorts++)
        else if (incoming > 0) id.set(port, inPorts++)
        else if (outgoing > 0) id.set(port, outPorts++)
        else id.set(port, inPorts++) // 未连接端口视为 in
        break
      }
      default:
        id.set(port, -1)
    }
  }

  ports.sort((p1, p2) => {
    const side1 = p1.getSide()
    const side2 = p2.getSide()
    if (side1 !== side2) {
      // ELK PortSide ordinal: UNDEFINED=0, NORTH=1, EAST=2, SOUTH=3, WEST=4
      return PortSideOrder[side1] - PortSideOrder[side2]
    }
    const id1 = id.get(p1)!, id2 = id.get(p2)!
    if (id1 === id2) return 0
    if (side1 === PortSide.NORTH) return id1 - id2
    return id2 - id1
  })
}

/** ELK PortSide.ordinal (字符串枚举无内置 ordinal). */
const PortSideOrder: Record<PortSide, number> = {
  [PortSide.UNDEFINED]: 0,
  [PortSide.NORTH]: 1,
  [PortSide.EAST]: 2,
  [PortSide.SOUTH]: 3,
  [PortSide.WEST]: 4,
}

/** 创建 NS dummy 节点 (ELK createDummyNode). */
function createDummyNode(graph: LGraph, inPort: LPort | null, outPort: LPort | null, dummyNodes: LNode[]): LNode {
  const dummy = new LNode(graph)
  dummy.setType(NodeType.NORTH_SOUTH_PORT)
  if (process.env.GGN_NS_DBG) console.error(`[NS] createDummyNode dummy=${dummy.id} origin=${(outPort ?? inPort)?.getNode()?.id ?? '?'} graphParent=${graph.getParentNode() ? 'nested' : 'root'}`)
  dummy.setProperty(PCC, PortConstraints.FIXED_POS)

  let crossingHint = 0

  if (inPort !== null) {
    const dummyInput = new LPort()
    dummyInput.setProperty(ORIGIN, inPort)
    dummy.setProperty(ORIGIN, inPort.getNode()!)
    dummyInput.setSide(PortSide.WEST)
    dummyInput.setNode(dummy)
    for (const edge of [...inPort.getIncomingEdges()]) edge.setTarget(dummyInput)
    inPort.setProperty(PORT_DUMMY, dummy)
    inPort.setProperty(PORT_IS_OUTPUT, false)
    crossingHint++
  }
  if (outPort !== null) {
    const dummyOutput = new LPort()
    dummy.setProperty(ORIGIN, outPort.getNode()!)
    dummyOutput.setProperty(ORIGIN, outPort)
    dummyOutput.setSide(PortSide.EAST)
    dummyOutput.setNode(dummy)
    for (const edge of [...outPort.getOutgoingEdges()]) edge.setSource(dummyOutput)
    outPort.setProperty(PORT_DUMMY, dummy)
    outPort.setProperty(PORT_IS_OUTPUT, true)
    crossingHint++
  }

  dummy.setProperty(CROSSING_HINT, crossingHint)
  dummyNodes.push(dummy)
  return dummy
}

/** 端口分类 + dummy 创建 (ELK createDummyNodes; 自环分支由 SelfLoop 处理器处理, 此处跳过). */
function createDummyNodes(graph: LGraph, ports: LPort[], dummyNodes: LNode[], barycenterAssociates: LNode[]): void {
  const [inPorts, outPorts, inOutPorts] = ports.reduce(
    (acc, port) => {
      const in_ = port.getIncomingEdges().length > 0
      const out = port.getOutgoingEdges().length > 0
      if (in_ && out) acc[2]!.push(port)
      else if (in_) acc[0]!.push(port)
      else if (out) acc[1]!.push(port)
      return acc
    },
    [[] as LPort[], [] as LPort[], [] as LPort[]],
  )

  for (const p of inPorts) barycenterAssociates.push(createDummyNode(graph, p, null, dummyNodes))
  for (const p of outPorts) barycenterAssociates.push(createDummyNode(graph, null, p, dummyNodes))
  for (const p of inOutPorts) barycenterAssociates.push(createDummyNode(graph, p, p, dummyNodes))
}

export function processNorthSouthPorts(layeredGraph: LGraph): void {
    if (process.env.GGN_NS_DBG) console.error(`[NS] processNorthSouthPorts graph=${layeredGraph.getParentNode() ? 'nested' : 'root'} layers=${layeredGraph.getLayers().length} nonFree=${layeredGraph.getProperty(GRAPH_PROPERTIES).has(GraphProperties.NON_FREE_PORTS)} ns=${layeredGraph.getProperty(GRAPH_PROPERTIES).has(GraphProperties.NORTH_SOUTH_PORTS)}`)
    for (const layer of layeredGraph.getLayers()) {
      let pointer = -1

      for (const node of [...layer.getNodes()]) {
        pointer++

        if (!(node.getType() === NodeType.NORMAL && PortConstraints.isSideFixed(node.getProperty(PCC)))) {
          continue
        }

        // ELK: 非 order-fixed 且 considerModelOrder=NONE 时排序端口列表 (in 左 / inOut 中 / out 右)
        if (!PortConstraints.isOrderFixed(node.getProperty(PCC))
            && layeredGraph.getProperty(CONSIDER_MODEL_ORDER_STRATEGY) === OrderingStrategy.NONE) {
          sortPortList(node)
        }

        node.setProperty(IN_LAYER_LAYOUT_UNIT, node)
        const northDummyNodes: LNode[] = []
        const southDummyNodes: LNode[] = []
        const barycenterAssociates: LNode[] = []

        // NORTH 侧: sortPortList 后按 id 升序 (model order 分支跳过)
        createDummyNodes(layeredGraph, node.getPorts(PortSide.NORTH), northDummyNodes, barycenterAssociates)

        // 北方 dummy 插入 node 之前
        let insertPoint = pointer
        const successor = node
        for (const dummy of northDummyNodes) {
          dummy.setLayerAt(insertPoint, layer)
          if (process.env.GGN_NS_DBG) console.error(`[NS] setLayerAt north dummy=${dummy.id} layerIdx=${layer.getIndex()} insert=${insertPoint} origin=${(dummy.getProperty(ORIGIN) as { id?: string } | null)?.id ?? '?'}`)
          pointer++
          dummy.setProperty(IN_LAYER_LAYOUT_UNIT, node)
          // ALLOW_NON_FLOW_PORTS_TO_SWITCH_SIDES: 不施加 successor 约束, dummy 位置由 barycenter 决定 (可换侧).
          const originPort = dummy.getPorts()[0]!.getProperty(ORIGIN) as LPort | null
          if (!originPort?.getProperty(ALLOW_NON_FLOW_PORTS_TO_SWITCH_SIDES)) {
            if (!dummy.hasProperty(IN_LAYER_SUCCESSOR_CONSTRAINTS)) dummy.setProperty(IN_LAYER_SUCCESSOR_CONSTRAINTS, [])
            dummy.getProperty(IN_LAYER_SUCCESSOR_CONSTRAINTS).push(successor)
          }
        }

        // SOUTH 侧: ELK 恒逆序 (addFirst) — 端口在图中自右向左列出.
        const southPorts = [...node.getPorts(PortSide.SOUTH)].reverse()
        createDummyNodes(layeredGraph, southPorts, southDummyNodes, barycenterAssociates)

        const predecessor = node
        for (const dummy of southDummyNodes) {
          dummy.setLayerAt(++pointer, layer)
          if (process.env.GGN_NS_DBG) console.error(`[NS] setLayerAt south dummy=${dummy.id} layerIdx=${layer.getIndex()} insert=${pointer} origin=${(dummy.getProperty(ORIGIN) as { id?: string } | null)?.id ?? '?'}`)
          dummy.setProperty(IN_LAYER_LAYOUT_UNIT, node)
          const originPort = dummy.getPorts()[0]!.getProperty(ORIGIN) as LPort | null
          if (!originPort?.getProperty(ALLOW_NON_FLOW_PORTS_TO_SWITCH_SIDES)) {
            if (!predecessor.hasProperty(IN_LAYER_SUCCESSOR_CONSTRAINTS)) predecessor.setProperty(IN_LAYER_SUCCESSOR_CONSTRAINTS, [])
            predecessor.getProperty(IN_LAYER_SUCCESSOR_CONSTRAINTS).push(dummy)
          }
        }

        if (barycenterAssociates.length > 0) {
          node.setProperty(BARYCENTER_ASSOCIATES, barycenterAssociates)
        }
      }
    }
  }
