/**
 * 对应 ELK TestGraphCreator (ggn 版).
 * 构造分层测试图 + 端口/边 helper + 预置图.
 */
import { LGraph, LNode, LPort, LEdge, PortSide, PortConstraints, NodeType, Property, Direction } from '../../../src/index.js'
import { Layer } from '../../../src/graph/layer.js'
import {
  IN_LAYER_LAYOUT_UNIT, ORIGIN, PORT_DUMMY, BARYCENTER_ASSOCIATES, RANDOM,
  EXT_PORT_SIDE, INSIDE_CONNECTIONS, GRAPH_PROPERTIES, IN_LAYER_SUCCESSOR_CONSTRAINTS,
} from '../../../src/options/internal-properties.js'
import { GraphProperties } from '../../../src/options/internal-properties.js'
import { HIERARCHY_HANDLING } from '../../../src/options/layered-options.js'
import { PORT_CONSTRAINTS, DIRECTION } from '../../../src/options/layered-options.js'
import { MockRandom } from './MockRandom.js'
import type { JavaRandom } from '../../../src/util/java-random.js'

export function makeLayer(graph: LGraph): Layer {
  const layer = new Layer(graph)
  graph.getLayers().push(layer)
  return layer
}

export function addNodeToLayer(graph: LGraph, layer: Layer): LNode {
  // ELK: LNode 属于 layer 的图 (嵌套图的内层节点属于 inner 图).
  const node = new LNode(layer.getGraph() ?? graph)
  node.setType(NodeType.NORMAL)
  node.setProperty(IN_LAYER_LAYOUT_UNIT, node)
  node.setLayer(layer)
  return node
}

export function addNodesToLayer(graph: LGraph, n: number, layer: Layer): LNode[] {
  const out: LNode[] = []
  for (let i = 0; i < n; i++) out.push(addNodeToLayer(graph, layer))
  return out
}

export function addPortOnSide(node: LNode, side: PortSide): LPort {
  const p = new LPort()
  p.setNode(node)
  p.setSide(side)
  return p
}

export function addEdgeBetweenPorts(from: LPort, to: LPort): LEdge {
  const e = new LEdge()
  e.setSource(from)
  e.setTarget(to)
  return e
}

export function eastWestEdgeFromTo(left: LNode | LPort, right: LNode | LPort): void {
  const lp = left instanceof LPort ? left : addPortOnSide(left, PortSide.EAST)
  const rp = right instanceof LPort ? right : addPortOnSide(right, PortSide.WEST)
  addEdgeBetweenPorts(lp, rp)
}

export function addInLayerEdge(n1: LNode, n2: LNode, side: PortSide): void {
  const p1 = addPortOnSide(n1, side)
  const p2 = addPortOnSide(n2, side)
  addEdgeBetweenPorts(p1, p2)
}

export function addNorthSouthEdge(side: PortSide, nodeWithNSPorts: LNode, northSouthDummy: LNode,
  nodeWithEWPorts: LNode, origin: boolean): void {
  const normalNodeEast = nodeWithEWPorts.getLayer()!.getIndex() < nodeWithNSPorts.getLayer()!.getIndex()
  const direction = normalNodeEast ? PortSide.WEST : PortSide.EAST
  const targetSide = direction === PortSide.WEST ? PortSide.EAST : PortSide.WEST
  const normalPort = addPortOnSide(nodeWithEWPorts, targetSide)
  const dummyPort = addPortOnSide(northSouthDummy, direction)
  if (origin) addEdgeBetweenPorts(normalPort, dummyPort)
  else addEdgeBetweenPorts(dummyPort, normalPort)
  northSouthDummy.setProperty(IN_LAYER_LAYOUT_UNIT, nodeWithNSPorts)
  northSouthDummy.setProperty(ORIGIN, nodeWithNSPorts)
  northSouthDummy.setType(NodeType.NORTH_SOUTH_PORT)
  const originPort = addPortOnSide(nodeWithNSPorts, side)
  dummyPort.setProperty(ORIGIN, originPort)
  originPort.setProperty(PORT_DUMMY, northSouthDummy)
  const baryAssoc = [northSouthDummy]
  const other = nodeWithNSPorts.getProperty<LNode[] | null>(BARYCENTER_ASSOCIATES)
  if (other === null || other === undefined) nodeWithNSPorts.setProperty(BARYCENTER_ASSOCIATES, baryAssoc)
  else other.push(...baryAssoc)
  // ELK TestGraphCreator: NS dummy 与 NS 端口节点之间的层内后继约束.
  if (side === PortSide.NORTH) {
    if (!northSouthDummy.hasProperty(IN_LAYER_SUCCESSOR_CONSTRAINTS)) northSouthDummy.setProperty(IN_LAYER_SUCCESSOR_CONSTRAINTS, [])
    northSouthDummy.getProperty(IN_LAYER_SUCCESSOR_CONSTRAINTS).push(nodeWithNSPorts)
  } else {
    if (!nodeWithNSPorts.hasProperty(IN_LAYER_SUCCESSOR_CONSTRAINTS)) nodeWithNSPorts.setProperty(IN_LAYER_SUCCESSOR_CONSTRAINTS, [])
    nodeWithNSPorts.getProperty(IN_LAYER_SUCCESSOR_CONSTRAINTS).push(northSouthDummy)
  }
}

export function setUpIds(graph: LGraph): void {
  let l = 0
  for (const layer of graph.getLayers()) {
    layer.id = l++
    let i = 0
    for (const node of layer.getNodes()) node.id = i++
  }
}

export function copyPortsInIndexOrder(node: LNode, ...indices: number[]): LPort[] {
  return indices.map(i => node.getPorts()[i]!)
}

export function switchOrderInArray(i: number, j: number, arr: LNode[]): LNode[] {
  const out = [...arr]
  ;[out[i]!, out[j]!] = [out[j]!, out[i]!]
  return out
}

export function setInLayerOrderConstraint(upper: LNode, lower: LNode): void {
  // ggn: in-layer order 约束通过 IN_LAYER_SUCCESSOR_CONSTRAINT 属性表达 (见 InLayerConstraintProcessor).
  const { IN_LAYER_SUCCESSOR_CONSTRAINT } = requireInternal()
  let list = upper.getProperty<LNode[] | null>(IN_LAYER_SUCCESSOR_CONSTRAINT)
  if (list === null || list === undefined) { list = []; upper.setProperty(IN_LAYER_SUCCESSOR_CONSTRAINT, list) }
  list.push(lower)
}

import { IN_LAYER_SUCCESSOR_CONSTRAINTS as _INSC } from '../../../src/options/internal-properties.js'
function requireInternal() { return { IN_LAYER_SUCCESSOR_CONSTRAINT: _INSC } }

export function setFixedOrderConstraint(node: LNode): void {
  node.setProperty(PORT_CONSTRAINTS, PortConstraints.FIXED_ORDER)
}

export function setAsLongEdgeDummy(node: LNode): void {
  node.setType(NodeType.LONG_EDGE)
}

export function setPortOrderFixed(node: LNode): void {
  node.setProperty(PORT_CONSTRAINTS, PortConstraints.FIXED_ORDER)
}

// ── 预置图 (对应 ELK TestGraphCreator) ──

export class TestGraphCreator {
  protected graph = new LGraph()
  protected nodeId = 0
  protected edgeId = 0
  protected random = new MockRandom()

  constructor() {
    this.graph.setProperty(DIRECTION, Direction.RIGHT)
    this.graph.setProperty('org.eclipse.elk.edgeRouting' as any, 'ORTHOGONAL')
    this.graph.setProperty(RANDOM, this.random as unknown as JavaRandom)
    // ELK TestGraphCreator.setUpGraph: 默认 HIERARCHY_HANDLING=INCLUDE_CHILDREN
    this.graph.setProperty(HIERARCHY_HANDLING, 'INCLUDE_CHILDREN')
  }

  getGraph(): LGraph { return this.graph }

  makeLayer(g?: LGraph): Layer { return g ? makeLayer(g) : makeLayer(this.graph) }
  addNodeToLayer(layer: Layer): LNode { return addNodeToLayer(this.graph, layer) }
  addNodesToLayer(n: number, layer: Layer): LNode[] { return addNodesToLayer(this.graph, n, layer) }
  addPortOnSide(node: LNode, side: PortSide): LPort { return addPortOnSide(node, side) }
  addEdgeBetweenPorts(from: LPort, to: LPort): LEdge { return addEdgeBetweenPorts(from, to) }
  eastWestEdgeFromTo(left: LNode | LPort, right: LNode | LPort): void { eastWestEdgeFromTo(left, right) }
  addInLayerEdge(n1: LNode, n2: LNode, side: PortSide): void { addInLayerEdge(n1, n2, side) }
  addNorthSouthEdge(side: PortSide, nsp: LNode, dummy: LNode, ew: LNode, origin: boolean): void {
    addNorthSouthEdge(side, nsp, dummy, ew, origin)
  }
  setUpIds(): void { setUpIds(this.graph) }
  copyPortsInIndexOrder(node: LNode, ...idx: number[]): LPort[] { return copyPortsInIndexOrder(node, ...idx) }
  switchOrderInArray(i: number, j: number, arr: LNode[]): LNode[] { return switchOrderInArray(i, j, arr) }
  getListCopyInIndexOrder<T>(li: T[], ...indices: number[]): T[] {
    return indices.map(i => li[i]!)
  }
  copyOfNodesInLayer(layerIndex: number): LNode[] {
    return [...this.graph.getLayers()[layerIndex]!.getNodes()]
  }
  getCopyWithSwitchedOrder(nodeOne: number, nodeTwo: number, layer: LNode[]): LNode[] {
    const firstNode = layer[nodeOne]!
    const secondNode = layer[nodeTwo]!
    const switched = [...layer]
    switched[nodeOne] = secondNode
    switched[nodeTwo] = firstNode
    return switched
  }
  switchOrderOfNodesInLayer(nodeOne: number, nodeTwo: number, layer: Layer): LNode[] {
    const nodes = layer.getNodes()
    const firstNode = nodes[nodeOne]!
    const secondNode = nodes[nodeTwo]!
    const switched = [...nodes]
    switched[nodeOne] = secondNode
    switched[nodeTwo] = firstNode
    return switched
  }
  copyOfSwitchOrderOfNodesInLayer(nodeOne: number, nodeTwo: number, layerIndex: number): LNode[] {
    return this.getCopyWithSwitchedOrder(nodeOne, nodeTwo, this.copyOfNodesInLayer(layerIndex))
  }
  setInLayerOrderConstraint(upper: LNode, lower: LNode): void { setInLayerOrderConstraint(upper, lower) }
  setFixedOrderConstraint(node: LNode): void { setFixedOrderConstraint(node) }
  setAsLongEdgeDummy(node: LNode): void { setAsLongEdgeDummy(node) }
  setPortOrderFixed(node: LNode): void { setPortOrderFixed(node) }
  get randomMock(): MockRandom { return this.random }

  getCrossFormedGraph(): LGraph {
    const leftLayer = this.makeLayer()
    const rightLayer = this.makeLayer()
    const topLeft = this.addNodeToLayer(leftLayer)
    const bottomLeft = this.addNodeToLayer(leftLayer)
    const topRight = this.addNodeToLayer(rightLayer)
    const bottomRight = this.addNodeToLayer(rightLayer)
    this.eastWestEdgeFromTo(topLeft, bottomRight)
    this.eastWestEdgeFromTo(bottomLeft, topRight)
    this.setUpIds()
    return this.graph
  }

  getInLayerEdgesGraph(): LGraph {
    const leftLayer = this.makeLayer()
    const middleLayer = this.makeLayer()
    const rightLayer = this.makeLayer()
    const leftNode = this.addNodeToLayer(leftLayer)
    const middleNodes = this.addNodesToLayer(3, middleLayer)
    const rightNode = this.addNodeToLayer(rightLayer)
    this.eastWestEdgeFromTo(middleNodes[1]!, rightNode)
    this.eastWestEdgeFromTo(leftNode, middleNodes[1]!)
    this.addInLayerEdge(middleNodes[0]!, middleNodes[2]!, PortSide.WEST)
    this.setUpIds()
    return this.graph
  }

  getCurrentOrder(graph: LGraph): LNode[][] {
    return graph.toNodeArray()
  }

  addPortsOnSide(n: number, node: LNode, side: PortSide): LPort[] {
    const out: LPort[] = []
    for (let i = 0; i < n; i++) out.push(this.addPortOnSide(node, side))
    return out
  }

  selfLoopOn(node: LNode, side: PortSide): void {
    this.addEdgeBetweenPorts(this.addPortOnSide(node, side), this.addPortOnSide(node, side))
  }

  getNumPorts(currentOrder: LNode[][]): number {
    let n = 0
    for (const layer of currentOrder) for (const node of layer) n += node.getPorts().length
    return n
  }

  multipleEdgesAndSingleEdge(): LGraph {
    const leftLayer = this.makeLayer(); const rightLayer = this.makeLayer()
    const topLeft = this.addNodeToLayer(leftLayer); const bottomLeft = this.addNodeToLayer(leftLayer)
    const bottomRight = this.addNodeToLayer(rightLayer)
    this.eastWestEdgeFromTo(topLeft, bottomRight)
    this.eastWestEdgeFromTo(topLeft, bottomRight)
    this.eastWestEdgeFromTo(bottomLeft, bottomRight)
    this.setUpIds(); return this.graph
  }

  getCrossWithExtraEdgeInBetweenGraph(): LGraph {
    const leftLayer = this.makeLayer(); const rightLayer = this.makeLayer()
    const left = this.addNodesToLayer(3, leftLayer); const right = this.addNodesToLayer(3, rightLayer)
    this.eastWestEdgeFromTo(left[0]!, right[2]!)
    this.eastWestEdgeFromTo(left[1]!, right[1]!)
    this.eastWestEdgeFromTo(left[2]!, right[0]!)
    this.setUpIds(); return this.graph
  }

  getCrossWithManySelfLoopsGraph(): LGraph {
    const g = this.getCrossFormedGraph()
    for (const layer of g.getLayers()) {
      for (const node of layer.getNodes()) {
        this.selfLoopOn(node, PortSide.EAST); this.selfLoopOn(node, PortSide.EAST); this.selfLoopOn(node, PortSide.EAST)
        this.selfLoopOn(node, PortSide.WEST); this.selfLoopOn(node, PortSide.WEST); this.selfLoopOn(node, PortSide.WEST)
      }
    }
    return g
  }

  getMoreComplexThreeLayerGraph(): LGraph {
    const leftLayer = this.makeLayer(); const middleLayer = this.makeLayer(); const rightLayer = this.makeLayer()
    const left = this.addNodesToLayer(3, leftLayer); const middle = this.addNodesToLayer(2, middleLayer)
    const right = this.addNodesToLayer(3, rightLayer)
    // 端口顺序敏感: 先显式加端口 (顺时针), 再连边 (对应 ELK 精确端口序)
    const leftMiddleNodePort = this.addPortOnSide(left[1]!, PortSide.EAST)
    const middleLowerNodePortEast = this.addPortOnSide(middle[1]!, PortSide.EAST)
    const middleUpperNodePortEast = this.addPortOnSide(middle[0]!, PortSide.EAST)
    const rightUpperNodePort = this.addPortOnSide(right[0]!, PortSide.WEST)
    const rightMiddleNodePort = this.addPortOnSide(right[1]!, PortSide.WEST)
    this.setUpIds()
    this.addEdgeBetweenPorts(middleUpperNodePortEast, rightUpperNodePort)
    this.addEdgeBetweenPorts(middleUpperNodePortEast, rightMiddleNodePort)
    this.addEdgeBetweenPorts(middleUpperNodePortEast, rightMiddleNodePort)
    this.eastWestEdgeFromTo(middleLowerNodePortEast, right[2]!)
    this.eastWestEdgeFromTo(leftMiddleNodePort, middle[0]!)
    this.eastWestEdgeFromTo(middle[1]!, rightUpperNodePort)
    this.eastWestEdgeFromTo(leftMiddleNodePort, middle[1]!)
    this.eastWestEdgeFromTo(left[2]!, middle[0]!)
    this.eastWestEdgeFromTo(left[0]!, middle[0]!)
    this.setUpIds(); return this.graph
  }

  getFixedPortOrderGraph(): LGraph {
    const leftLayer = this.makeLayer(); const rightLayer = this.makeLayer()
    const leftNode = this.addNodeToLayer(leftLayer)
    this.setFixedOrderConstraint(leftNode)
    const rightTop = this.addNodeToLayer(rightLayer); const rightBottom = this.addNodeToLayer(rightLayer)
    this.eastWestEdgeFromTo(leftNode, rightBottom); this.eastWestEdgeFromTo(leftNode, rightTop)
    this.setUpIds(); return this.graph
  }

  getTwoNodesNoConnectionGraph(): LGraph {
    const layer = this.makeLayer()
    this.addNodeToLayer(layer); this.addNodeToLayer(layer)
    this.setUpIds(); return this.graph
  }

  getOneNodeGraph(): LGraph {
    const layer = this.makeLayer()
    this.addNodeToLayer(layer)
    this.setUpIds(); return this.graph
  }

  getMultipleEdgesBetweenSameNodesGraph(): LGraph {
    const leftLayer = this.makeLayer(); const rightLayer = this.makeLayer()
    const topLeft = this.addNodeToLayer(leftLayer); const bottomLeft = this.addNodeToLayer(leftLayer)
    const topRight = this.addNodeToLayer(rightLayer); const bottomRight = this.addNodeToLayer(rightLayer)
    this.eastWestEdgeFromTo(topLeft, bottomRight); this.eastWestEdgeFromTo(topLeft, bottomRight)
    this.eastWestEdgeFromTo(bottomLeft, topRight); this.eastWestEdgeFromTo(bottomLeft, topRight)
    this.setUpIds(); return this.graph
  }

  twoEdgesIntoSamePort(): LGraph {
    const leftLayer = this.makeLayer(); const rightLayer = this.makeLayer()
    const topLeft = this.addNodeToLayer(leftLayer); const bottomLeft = this.addNodeToLayer(leftLayer)
    const topRight = this.addNodeToLayer(rightLayer); const bottomRight = this.addNodeToLayer(rightLayer)
    this.eastWestEdgeFromTo(topLeft, bottomRight)
    const bottomLeftFirst = this.addPortOnSide(bottomLeft, PortSide.EAST)
    const bottomLeftSecond = this.addPortOnSide(bottomLeft, PortSide.EAST)
    const topRightFirst = this.addPortOnSide(topRight, PortSide.WEST)
    const topRightSecond = this.addPortOnSide(topRight, PortSide.WEST)
    this.addEdgeBetweenPorts(bottomLeftFirst, topRightFirst)
    this.addEdgeBetweenPorts(bottomLeftSecond, topRightSecond)
    this.setUpIds(); return this.graph
  }

  twoEdgesIntoSamePortCrossesWhenSwitched(): LGraph {
    const leftLayer = this.makeLayer(); const rightLayer = this.makeLayer()
    const topLeft = this.addNodeToLayer(leftLayer); const bottomLeft = this.addNodeToLayer(leftLayer)
    const topRight = this.addNodeToLayer(rightLayer); const bottomRight = this.addNodeToLayer(rightLayer)
    const topRightPort = this.addPortOnSide(topRight, PortSide.WEST)
    const bottomLeftPort = this.addPortOnSide(bottomLeft, PortSide.EAST)
    this.addEdgeBetweenPorts(bottomLeftPort, topRightPort)
    const topLeftPort = this.addPortOnSide(topLeft, PortSide.EAST)
    this.addEdgeBetweenPorts(topLeftPort, topRightPort)
    this.eastWestEdgeFromTo(bottomLeft, bottomRight)
    this.setUpIds(); return this.graph
  }

  twoEdgesIntoSamePortResolvesCrossingWhenSwitched(): LGraph {
    const leftLayer = this.makeLayer(); const rightLayer = this.makeLayer()
    const topLeft = this.addNodeToLayer(leftLayer); const bottomLeft = this.addNodeToLayer(leftLayer)
    const topRight = this.addNodeToLayer(rightLayer); const bottomRight = this.addNodeToLayer(rightLayer)
    const topLeftPort = this.addPortOnSide(topLeft, PortSide.EAST)
    const bottomLeftPort = this.addPortOnSide(bottomLeft, PortSide.EAST)
    const bottomRightPort = this.addPortOnSide(bottomRight, PortSide.WEST)
    this.addEdgeBetweenPorts(topLeftPort, bottomRightPort)
    this.addEdgeBetweenPorts(bottomLeftPort, bottomRightPort)
    this.eastWestEdgeFromTo(bottomLeft, topRight)
    this.setUpIds(); return this.graph
  }

  twoEdgesIntoSamePortFromEastWithFixedPortOrder(): LGraph {
    const leftLayer = this.makeLayer(); const rightLayer = this.makeLayer()
    const topLeft = this.addNodeToLayer(leftLayer); const bottomLeft = this.addNodeToLayer(leftLayer)
    const topRight = this.addNodeToLayer(rightLayer); const bottomRight = this.addNodeToLayer(rightLayer)
    this.setFixedOrderConstraint(bottomLeft); this.setFixedOrderConstraint(topRight)
    const topLeftPort = this.addPortOnSide(topLeft, PortSide.EAST)
    const bottomLeftPort = this.addPortOnSide(bottomLeft, PortSide.EAST)
    const topRightPort = this.addPortOnSide(topRight, PortSide.WEST)
    const bottomRightPort = this.addPortOnSide(bottomRight, PortSide.WEST)
    this.addEdgeBetweenPorts(bottomLeftPort, bottomRightPort)
    this.addEdgeBetweenPorts(bottomLeftPort, topRightPort)
    this.addEdgeBetweenPorts(topLeftPort, topRightPort)
    this.setUpIds(); return this.graph
  }

  getCrossFormedGraphWithConstraintsInSecondLayer(): LGraph {
    this.getCrossFormedGraph()
    const layerOne = this.graph.getLayers()[1]!
    const topNode = layerOne.getNodes()[0]!
    const secondNode = layerOne.getNodes()[1]!
    this.setInLayerOrderConstraint(topNode, secondNode)
    this.setUpIds(); return this.graph
  }

  getCrossFormedGraphConstraintsPreventAnySwitch(): LGraph {
    const leftLayer = this.makeLayer(); const rightLayer = this.makeLayer()
    const topLeft = this.addNodeToLayer(leftLayer); const bottomLeft = this.addNodeToLayer(leftLayer)
    const topRight = this.addNodeToLayer(rightLayer); const bottomRight = this.addNodeToLayer(rightLayer)
    this.eastWestEdgeFromTo(topLeft, bottomRight); this.eastWestEdgeFromTo(bottomLeft, topRight)
    this.setInLayerOrderConstraint(topRight, bottomRight)
    this.setInLayerOrderConstraint(topLeft, bottomLeft)
    this.setUpIds(); return this.graph
  }

  getInLayerEdgesGraphWhichResultsInCrossingsWhenSwitched(): LGraph {
    const leftLayer = this.makeLayer(); const rightLayer = this.makeLayer()
    const leftNode = this.addNodeToLayer(leftLayer)
    const rightNodes = this.addNodesToLayer(3, rightLayer)
    this.addInLayerEdge(rightNodes[0]!, rightNodes[1]!, PortSide.WEST)
    this.eastWestEdgeFromTo(leftNode, rightNodes[2]!)
    this.setUpIds(); return this.graph
  }

  getGraphNoCrossingsDueToPortOrderNotFixed(): LGraph {
    const leftLayer = this.makeLayer(); const rightLayer = this.makeLayer()
    const leftNode = this.addNodeToLayer(leftLayer)
    const rightTop = this.addNodeToLayer(rightLayer); const rightBottom = this.addNodeToLayer(rightLayer)
    this.eastWestEdgeFromTo(leftNode, rightBottom); this.eastWestEdgeFromTo(leftNode, rightTop)
    this.setUpIds(); return this.graph
  }

  getSwitchOnlyOneSided(): LGraph {
    const layers = this.makeLayers(3)
    const left = this.addNodesToLayer(2, layers[0]!)
    const middle = this.addNodesToLayer(2, layers[1]!)
    const right = this.addNodesToLayer(2, layers[2]!)
    this.eastWestEdgeFromTo(middle[0]!, right[0]!)
    this.eastWestEdgeFromTo(middle[1]!, right[1]!)
    this.eastWestEdgeFromTo(left[0]!, middle[1]!)
    this.eastWestEdgeFromTo(left[1]!, middle[0]!)
    this.setUpIds(); return this.graph
  }

  getSwitchOnlyEastOneSided(): LGraph {
    const layers = this.makeLayers(3)
    const left = this.addNodesToLayer(2, layers[0]!)
    const middle = this.addNodesToLayer(2, layers[1]!)
    const right = this.addNodesToLayer(2, layers[2]!)
    this.eastWestEdgeFromTo(left[0]!, middle[0]!)
    this.eastWestEdgeFromTo(left[1]!, middle[1]!)
    this.eastWestEdgeFromTo(middle[0]!, right[1]!)
    this.eastWestEdgeFromTo(middle[1]!, right[0]!)
    this.setUpIds(); return this.graph
  }

  getFixedPortOrderInLayerEdgesDontCrossEachOther(): LGraph {
    const layer = this.makeLayer()
    const nodes = this.addNodesToLayer(2, layer)
    this.setFixedOrderConstraint(nodes[0]!); this.setFixedOrderConstraint(nodes[1]!)
    const upperPortUpperNode = this.addPortOnSide(nodes[0]!, PortSide.EAST)
    const lowerPortUpperNode = this.addPortOnSide(nodes[0]!, PortSide.EAST)
    const upperPortLowerNode = this.addPortOnSide(nodes[1]!, PortSide.EAST)
    const lowerPortLowerNode = this.addPortOnSide(nodes[1]!, PortSide.EAST)
    this.addEdgeBetweenPorts(upperPortUpperNode, lowerPortLowerNode)
    this.addEdgeBetweenPorts(lowerPortUpperNode, upperPortLowerNode)
    this.setUpIds(); return this.graph
  }

  getFixedPortOrderInLayerEdgesWithCrossings(): LGraph {
    const layer = this.makeLayer()
    const nodes = this.addNodesToLayer(2, layer)
    this.setFixedOrderConstraint(nodes[0]!); this.setFixedOrderConstraint(nodes[1]!)
    this.addInLayerEdge(nodes[0]!, nodes[1]!, PortSide.EAST)
    this.addInLayerEdge(nodes[0]!, nodes[1]!, PortSide.EAST)
    this.setUpIds(); return this.graph
  }

  // ── InLayerEdgeTestGraphCreator (ELK intermediate/greedyswitch) ──
  getInLayerEdgesGraphWithCrossingsToBetweenLayerEdgeWithFixedPortOrder(): LGraph {
    const layers = this.makeLayers(2)
    const leftNode = this.addNodeToLayer(layers[0]!)
    const rightNodes = this.addNodesToLayer(2, layers[1]!)
    this.setPortOrderFixed(rightNodes[0]!)
    this.eastWestEdgeFromTo(leftNode, rightNodes[0]!)
    this.addInLayerEdge(rightNodes[0]!, rightNodes[1]!, PortSide.WEST)
    this.eastWestEdgeFromTo(leftNode, rightNodes[0]!)
    this.eastWestEdgeFromTo(leftNode, rightNodes[0]!)
    return this.getGraph()
  }

  getInLayerEdgesWithFixedPortOrderAndNormalEdgeCrossings(): LGraph {
    const layer = this.makeLayers(2)
    const leftNode = this.addNodeToLayer(layer[0]!)
    const rightNodes = this.addNodesToLayer(3, layer[1]!)
    this.setFixedOrderConstraint(rightNodes[0]!)
    this.eastWestEdgeFromTo(leftNode, rightNodes[0]!)
    this.addInLayerEdge(rightNodes[0]!, rightNodes[2]!, PortSide.WEST)
    this.eastWestEdgeFromTo(leftNode, rightNodes[1]!)
    return this.getGraph()
  }

  getInLayerEdgesCrossingsButNoFixedOrder(): LGraph {
    const layer = this.makeLayers(2)
    const leftNodes = this.addNodesToLayer(2, layer[0]!)
    const rightNodes = this.addNodesToLayer(2, layer[1]!)
    this.eastWestEdgeFromTo(leftNodes[0]!, rightNodes[0]!)
    this.addInLayerEdge(rightNodes[0]!, rightNodes[1]!, PortSide.WEST)
    this.eastWestEdgeFromTo(leftNodes[1]!, rightNodes[1]!)
    return this.getGraph()
  }

  getInLayerEdgesCrossingsNoFixedOrderNoEdgeBetweenUpperAndLower(): LGraph {
    const layer = this.makeLayers(2)
    const leftNodes = this.addNodesToLayer(2, layer[0]!)
    const rightNodes = this.addNodesToLayer(3, layer[1]!)
    this.eastWestEdgeFromTo(leftNodes[1]!, rightNodes[1]!)
    this.addInLayerEdge(rightNodes[0]!, rightNodes[2]!, PortSide.WEST)
    this.addInLayerEdge(rightNodes[0]!, rightNodes[2]!, PortSide.WEST)
    this.eastWestEdgeFromTo(leftNodes[1]!, rightNodes[2]!)
    return this.getGraph()
  }

  getInLayerEdgesCrossingsNoFixedOrderNoEdgeBetweenUpperAndLowerUpsideDown(): LGraph {
    const layer = this.makeLayers(2)
    const leftNodes = this.addNodesToLayer(2, layer[0]!)
    const rightNodes = this.addNodesToLayer(4, layer[1]!)
    this.eastWestEdgeFromTo(leftNodes[0]!, rightNodes[1]!)
    this.addInLayerEdge(rightNodes[0]!, rightNodes[1]!, PortSide.WEST)
    this.addInLayerEdge(rightNodes[1]!, rightNodes[3]!, PortSide.WEST)
    this.addInLayerEdge(rightNodes[1]!, rightNodes[3]!, PortSide.WEST)
    this.eastWestEdgeFromTo(leftNodes[1]!, rightNodes[2]!)
    return this.getGraph()
  }

  getInLayerCrossingsOnBothSides(): LGraph {
    const layers = this.makeLayers(3)
    const leftNode = this.addNodeToLayer(layers[0]!)
    const middleNodes = this.addNodesToLayer(3, layers[1]!)
    const rightNode = this.addNodeToLayer(layers[2]!)
    this.addInLayerEdge(middleNodes[0]!, middleNodes[2]!, PortSide.EAST)
    this.addInLayerEdge(middleNodes[0]!, middleNodes[2]!, PortSide.WEST)
    this.eastWestEdgeFromTo(middleNodes[1]!, rightNode)
    this.eastWestEdgeFromTo(leftNode, middleNodes[1]!)
    return this.getGraph()
  }

  getInLayerEdgesFixedPortOrderInLayerAndInBetweenLayerCrossing(): LGraph {
    const layers = this.makeLayers(2)
    const leftNode = this.addNodeToLayer(layers[0]!)
    const rightNodes = this.addNodesToLayer(3, layers[1]!)
    this.setFixedOrderConstraint(rightNodes[1]!)
    this.eastWestEdgeFromTo(leftNode, rightNodes[1]!)
    this.addInLayerEdge(rightNodes[0]!, rightNodes[1]!, PortSide.WEST)
    this.addInLayerEdge(rightNodes[1]!, rightNodes[2]!, PortSide.WEST)
    return this.getGraph()
  }

  getInLayerEdgesFixedPortOrderInLayerCrossing(): LGraph {
    const nodes = this.addNodesToLayer(3, this.makeLayer())
    this.setFixedOrderConstraint(nodes[1]!)
    this.addInLayerEdge(nodes[0]!, nodes[1]!, PortSide.WEST)
    this.addInLayerEdge(nodes[1]!, nodes[2]!, PortSide.WEST)
    return this.getGraph()
  }

  getFixedPortOrderTwoInLayerEdgesCrossEachOther(): LGraph {
    const nodes = this.addNodesToLayer(3, this.makeLayer())
    this.setFixedOrderConstraint(nodes[0]!)
    this.addInLayerEdge(nodes[0]!, nodes[2]!, PortSide.WEST)
    this.addInLayerEdge(nodes[0]!, nodes[1]!, PortSide.WEST)
    return this.getGraph()
  }

  getInLayerEdgesDownwardGraphNoFixedOrder(): LGraph {
    const layers = this.makeLayers(2)
    const leftNode = this.addNodeToLayer(layers[0]!)
    const rightNodes = this.addNodesToLayer(3, layers[1]!)
    this.eastWestEdgeFromTo(leftNode, rightNodes[1]!)
    this.addInLayerEdge(rightNodes[0]!, rightNodes[1]!, PortSide.WEST)
    this.addInLayerEdge(rightNodes[1]!, rightNodes[2]!, PortSide.WEST)
    return this.getGraph()
  }

  getInLayerEdgesMultipleEdgesIntoSinglePort(): LGraph {
    const layerTwo = this.makeLayer()
    const leftNode = this.addNodeToLayer(layerTwo)
    const layerOne = this.makeLayer()
    const rightNodes = this.addNodesToLayer(4, layerOne)
    this.addInLayerEdge(rightNodes[1]!, rightNodes[3]!, PortSide.WEST)
    const leftPort = this.addPortOnSide(leftNode, PortSide.EAST)
    const rightTopPort = this.addPortOnSide(rightNodes[0]!, PortSide.WEST)
    const rightMiddlePort = this.addPortOnSide(rightNodes[2]!, PortSide.WEST)
    this.addEdgeBetweenPorts(leftPort, rightMiddlePort)
    this.addEdgeBetweenPorts(rightTopPort, rightMiddlePort)
    return this.getGraph()
  }

  getOneLayerWithInLayerCrossings(): LGraph {
    const layer = this.makeLayer()
    const nodes = this.addNodesToLayer(4, layer)
    this.addInLayerEdge(nodes[0]!, nodes[2]!, PortSide.WEST)
    this.addInLayerEdge(nodes[1]!, nodes[3]!, PortSide.WEST)
    return this.getGraph()
  }

  getInLayerOneLayerNoCrossings(): LGraph {
    const layer = this.makeLayer()
    const nodes = this.addNodesToLayer(4, layer)
    this.addInLayerEdge(nodes[0]!, nodes[3]!, PortSide.WEST)
    this.addInLayerEdge(nodes[1]!, nodes[2]!, PortSide.WEST)
    return this.getGraph()
  }

  getMoreComplexInLayerGraph(): LGraph {
    const layers = this.makeLayers(3)
    const leftNodes = this.addNodesToLayer(4, layers[0]!)
    const middleNodes = this.addNodesToLayer(3, layers[1]!)
    const rightNode = this.addNodeToLayer(layers[2]!)
    this.setFixedOrderConstraint(middleNodes[0]!)
    this.setFixedOrderConstraint(middleNodes[1]!)
    this.eastWestEdgeFromTo(leftNodes[1]!, middleNodes[0]!)
    this.eastWestEdgeFromTo(leftNodes[3]!, middleNodes[1]!)
    this.eastWestEdgeFromTo(leftNodes[2]!, middleNodes[1]!)
    this.addInLayerEdge(middleNodes[0]!, middleNodes[1]!, PortSide.WEST)
    this.eastWestEdgeFromTo(leftNodes[0]!, middleNodes[0]!)
    this.addInLayerEdge(middleNodes[0]!, middleNodes[2]!, PortSide.WEST)
    this.addInLayerEdge(middleNodes[0]!, middleNodes[1]!, PortSide.EAST)
    this.eastWestEdgeFromTo(middleNodes[0]!, rightNode)
    this.setUpIds()
    return this.graph
  }

  multipleInBetweenLayerEdgesIntoNodeWithNoFixedPortOrder(): LGraph {
    const leftLayer = this.makeLayer()
    const leftNodes = this.addNodesToLayer(2, leftLayer)
    const rightLayer = this.makeLayer()
    const rightNodes = this.addNodesToLayer(2, rightLayer)
    this.addInLayerEdge(rightNodes[0]!, rightNodes[1]!, PortSide.WEST)
    this.eastWestEdgeFromTo(leftNodes[0]!, rightNodes[1]!)
    this.eastWestEdgeFromTo(leftNodes[0]!, rightNodes[1]!)
    this.setUpIds()
    return this.graph
  }

  multipleInBetweenLayerEdgesIntoNodeWithNoFixedPortOrderCauseCrossings(): LGraph {
    const leftLayer = this.makeLayer()
    const leftNodes = this.addNodesToLayer(2, leftLayer)
    const rightLayer = this.makeLayer()
    const rightNodes = this.addNodesToLayer(3, rightLayer)
    this.addInLayerEdge(rightNodes[0]!, rightNodes[2]!, PortSide.WEST)
    this.eastWestEdgeFromTo(leftNodes[0]!, rightNodes[1]!)
    this.eastWestEdgeFromTo(leftNodes[0]!, rightNodes[1]!)
    this.setUpIds()
    return this.graph
  }

  getSwitchedProblemGraph(): LGraph {
    const leftNodes = this.addNodesToLayer(2, this.makeLayer())
    const rightNodes = this.addNodesToLayer(4, this.makeLayer())
    this.eastWestEdgeFromTo(leftNodes[1]!, rightNodes[2]!)
    this.eastWestEdgeFromTo(leftNodes[1]!, rightNodes[3]!)
    this.eastWestEdgeFromTo(leftNodes[0]!, rightNodes[0]!)
    this.eastWestEdgeFromTo(leftNodes[0]!, rightNodes[1]!)
    this.eastWestEdgeFromTo(leftNodes[0]!, rightNodes[2]!)
    this.setUpIds()
    return this.graph
  }

  multipleEdgesIntoOnePortAndFreePortOrder(): LGraph {
    const nodes = this.addNodesToLayer(3, this.makeLayer())
    this.addInLayerEdge(nodes[0]!, nodes[2]!, PortSide.WEST)
    const portUpperNode = this.addPortOnSide(nodes[0]!, PortSide.WEST)
    this.addEdgeBetweenPorts(portUpperNode, this.addPortOnSide(nodes[2]!, PortSide.WEST))
    this.addEdgeBetweenPorts(portUpperNode, this.addPortOnSide(nodes[1]!, PortSide.WEST))
    this.setUpIds()
    return this.graph
  }

  getOnlyCorrectlyImprovedByBestOfForwardAndBackwardSweepsInSingleLayer(): LGraph {
    const leftNode = this.addNodeToLayer(this.makeLayer())
    this.setFixedOrderConstraint(leftNode)
    const rightNodes = this.addNodesToLayer(3, this.makeLayer())
    this.eastWestEdgeFromTo(leftNode, rightNodes[2]!)
    this.eastWestEdgeFromTo(leftNode, rightNodes[2]!)
    this.eastWestEdgeFromTo(leftNode, rightNodes[1]!)
    this.addInLayerEdge(rightNodes[0]!, rightNodes[2]!, PortSide.WEST)
    this.setUpIds()
    return this.graph
  }

  getGraphWhichCouldBeWorsenedBySwitch(): LGraph {
    const layers = this.makeLayers(3)
    const leftNodes = this.addNodesToLayer(2, layers[0]!)
    const middleNodes = this.addNodesToLayer(2, layers[1]!)
    const rightNodes = this.addNodesToLayer(2, layers[2]!)
    this.setInLayerOrderConstraint(leftNodes[0]!, leftNodes[1]!)
    this.setInLayerOrderConstraint(rightNodes[0]!, rightNodes[1]!)
    this.eastWestEdgeFromTo(middleNodes[0]!, rightNodes[1]!)
    this.eastWestEdgeFromTo(middleNodes[1]!, rightNodes[0]!)
    this.eastWestEdgeFromTo(leftNodes[0]!, middleNodes[0]!)
    this.eastWestEdgeFromTo(leftNodes[0]!, middleNodes[0]!)
    this.eastWestEdgeFromTo(leftNodes[1]!, middleNodes[1]!)
    this.eastWestEdgeFromTo(leftNodes[1]!, middleNodes[1]!)
    this.setUpIds()
    return this.graph
  }

  getNodesInDifferentLayoutUnitsPreventSwitch(): LGraph {
    const layers = this.makeLayers(2)
    const leftNodes = this.addNodesToLayer(2, layers[0]!)
    const rightNodes = this.addNodesToLayer(3, layers[1]!)
    this.eastWestEdgeFromTo(leftNodes[1]!, rightNodes[0]!)
    this.addNorthSouthEdge(PortSide.EAST, rightNodes[2]!, rightNodes[1]!, leftNodes[0]!, true)
    rightNodes[1]!.setProperty(IN_LAYER_LAYOUT_UNIT, rightNodes[2]!)
    rightNodes[2]!.setProperty(IN_LAYER_LAYOUT_UNIT, rightNodes[2]!)
    this.setUpIds()
    return this.graph
  }

  makeLayers(amount: number, g?: LGraph): Layer[] {
    const layers: Layer[] = []
    for (let i = 0; i < amount; i++) layers.push(g ? makeLayer(g) : makeLayer(this.graph))
    return layers
  }

  nestedGraph(node: LNode): LGraph {
    let nested = node.getNestedGraph()
    if (nested === null || nested === undefined) {
      nested = new LGraph()
      nested.setParentNode(node)
      node.setNestedGraph(nested)
    }
    // 嵌套图继承父图 RANDOM (ELK GraphConfigurator: 子图共享/各自 RANDOM; 测试需要 nextBoolean)
    if (nested.getProperty(RANDOM) === undefined || nested.getProperty(RANDOM) === null) {
      nested.setProperty(RANDOM, this.graph.getProperty(RANDOM))
    }
    return nested
  }

  addExternalPortDummyNodeToLayer(layer: Layer, port: LPort): LNode {
    const node = this.addNodeToLayer(layer)
    node.setProperty(ORIGIN, port)
    node.setType(NodeType.EXTERNAL_PORT)
    node.setProperty(EXT_PORT_SIDE, port.getSide())
    port.setProperty(PORT_DUMMY, node)
    port.setProperty(INSIDE_CONNECTIONS, true)
    const g = node.getGraph()
    const props = g!.getProperty<Set<string>>(GRAPH_PROPERTIES)
    props.add(GraphProperties.EXTERNAL_PORTS)
    return node
  }

  addExternalPortDummiesToLayer(layer: Layer, ports: LPort[]): LNode[] {
    const nodes: LNode[] = []
    const side = ports[0]!.getSide()
    for (let i = 0; i < ports.length; i++) {
      const portIndex = side === PortSide.EAST ? i : ports.length - 1 - i
      nodes.push(this.addExternalPortDummyNodeToLayer(layer, ports[portIndex]!))
    }
    return nodes
  }

  setOnAllGraphs<T>(prop: Property<T>, val: T, g: LGraph): void {
    g.setProperty(prop, val)
    for (const node of g.getAllNodes()) {
      const nested = node.getNestedGraph()
      if (nested !== null && nested !== undefined) this.setOnAllGraphs(prop, val, nested)
    }
  }
}


/** 对应 ELK intermediate/greedyswitch/NorthSouthEdgeTestGraphCreator (全部 30 图). */
export class NorthSouthEdgeTestGraphCreator extends TestGraphCreator {
  getNorthSouthDownwardCrossingGraph(): LGraph {
    const left = this.addNodesToLayer(3, this.makeLayer()); const right = this.addNodesToLayer(2, this.makeLayer())
    this.addNorthSouthEdge(PortSide.SOUTH, left[0]!, left[2]!, right[1]!, false)
    this.addNorthSouthEdge(PortSide.SOUTH, left[0]!, left[1]!, right[0]!, false)
    this.setFixedOrderConstraint(left[0]!); return this.graph
  }
  getNorthSouthDownwardMultipleCrossingGraph(): LGraph {
    const left = this.addNodesToLayer(4, this.makeLayer()); const right = this.addNodesToLayer(3, this.makeLayer())
    this.addNorthSouthEdge(PortSide.SOUTH, left[0]!, left[3]!, right[2]!, false)
    this.addNorthSouthEdge(PortSide.SOUTH, left[0]!, left[2]!, right[1]!, false)
    this.addNorthSouthEdge(PortSide.SOUTH, left[0]!, left[1]!, right[0]!, false)
    this.setFixedOrderConstraint(left[0]!); return this.graph
  }
  getNorthSouthUpwardCrossingGraph(): LGraph {
    const left = this.addNodesToLayer(3, this.makeLayer()); const right = this.addNodesToLayer(2, this.makeLayer())
    this.addNorthSouthEdge(PortSide.NORTH, left[2]!, left[1]!, right[1]!, false)
    this.addNorthSouthEdge(PortSide.NORTH, left[2]!, left[0]!, right[0]!, false)
    this.setFixedOrderConstraint(left[2]!); return this.graph
  }
  getNorthSouthUpwardMultipleCrossingGraph(): LGraph {
    const left = this.addNodesToLayer(4, this.makeLayer()); const right = this.addNodesToLayer(3, this.makeLayer())
    this.addNorthSouthEdge(PortSide.NORTH, left[3]!, left[2]!, right[2]!, false)
    this.addNorthSouthEdge(PortSide.NORTH, left[3]!, left[1]!, right[1]!, false)
    this.addNorthSouthEdge(PortSide.NORTH, left[3]!, left[0]!, right[0]!, false)
    this.setFixedOrderConstraint(left[3]!); return this.graph
  }
  getThreeLayerNorthSouthCrossingGraph(): LGraph {
    const leftNode = this.addNodeToLayer(this.makeLayer()); const middle = this.addNodesToLayer(3, this.makeLayer())
    const rightNode = this.addNodeToLayer(this.makeLayer())
    this.setFixedOrderConstraint(middle[0]!); this.setFixedOrderConstraint(rightNode)
    this.addNorthSouthEdge(PortSide.SOUTH, middle[0]!, middle[2]!, rightNode, false)
    this.addNorthSouthEdge(PortSide.SOUTH, middle[0]!, middle[1]!, rightNode, false)
    this.eastWestEdgeFromTo(leftNode, middle[0]!); return this.graph
  }
  getThreeLayerNorthSouthCrossingShouldSwitchGraph(): LGraph {
    this.addNodeToLayer(this.makeLayer())
    const middle = this.addNodesToLayer(3, this.makeLayer()); const right = this.addNodesToLayer(2, this.makeLayer())
    this.setFixedOrderConstraint(middle[0]!)
    middle[1]!.setType(NodeType.NORTH_SOUTH_PORT); middle[2]!.setType(NodeType.NORTH_SOUTH_PORT)
    middle[2]!.setProperty(ORIGIN, middle[0]!); middle[1]!.setProperty(ORIGIN, middle[0]!)
    const leftBottomRight = this.addPortOnSide(middle[2]!, PortSide.EAST)
    const rightBottom = this.addPortOnSide(right[1]!, PortSide.WEST)
    this.addEdgeBetweenPorts(leftBottomRight, rightBottom)
    const leftTopSouth = this.addPortOnSide(middle[0]!, PortSide.SOUTH)
    leftBottomRight.setProperty(ORIGIN, leftTopSouth)
    const leftMiddleRight = this.addPortOnSide(middle[1]!, PortSide.EAST)
    const rightTop = this.addPortOnSide(right[0]!, PortSide.WEST)
    this.addEdgeBetweenPorts(leftMiddleRight, rightTop)
    const leftTopSouth2 = this.addPortOnSide(middle[0]!, PortSide.SOUTH)
    leftMiddleRight.setProperty(ORIGIN, leftTopSouth2)
    return this.graph
  }
  getSouthernNorthSouthDummyEdgeCrossingGraph(): LGraph {
    const leftNode = this.addNodeToLayer(this.makeLayer()); const middle = this.addNodesToLayer(3, this.makeLayer())
    const right = this.addNodesToLayer(2, this.makeLayer())
    this.eastWestEdgeFromTo(leftNode, middle[1]!); this.eastWestEdgeFromTo(middle[1]!, right[0]!)
    this.setAsLongEdgeDummy(middle[1]!)
    this.addNorthSouthEdge(PortSide.SOUTH, middle[0]!, middle[2]!, right[1]!, true)
    return this.graph
  }
  getSouthernNorthSouthDummyEdgeTwoCrossingGraph(): LGraph {
    const leftNode = this.addNodeToLayer(this.makeLayer()); const middle = this.addNodesToLayer(4, this.makeLayer())
    const right = this.addNodesToLayer(3, this.makeLayer())
    this.eastWestEdgeFromTo(leftNode, middle[1]!); this.eastWestEdgeFromTo(middle[1]!, right[0]!)
    this.setAsLongEdgeDummy(middle[1]!)
    this.addNorthSouthEdge(PortSide.SOUTH, middle[0]!, middle[2]!, right[1]!, true)
    this.addNorthSouthEdge(PortSide.SOUTH, middle[0]!, middle[3]!, right[2]!, true)
    return this.graph
  }
  getSouthernTwoDummyEdgeAndNorthSouthCrossingGraph(): LGraph {
    const left = this.addNodesToLayer(2, this.makeLayer()); const middle = this.addNodesToLayer(5, this.makeLayer())
    const right = this.addNodesToLayer(4, this.makeLayer())
    this.eastWestEdgeFromTo(left[0]!, middle[1]!); this.eastWestEdgeFromTo(middle[1]!, right[0]!)
    this.setAsLongEdgeDummy(middle[1]!)
    this.eastWestEdgeFromTo(left[1]!, middle[3]!); this.eastWestEdgeFromTo(middle[3]!, right[2]!)
    this.setAsLongEdgeDummy(middle[3]!)
    this.setFixedOrderConstraint(middle[0]!)
    this.addNorthSouthEdge(PortSide.SOUTH, middle[0]!, middle[4]!, right[3]!, true)
    this.addNorthSouthEdge(PortSide.SOUTH, middle[0]!, middle[2]!, right[1]!, true)
    return this.graph
  }
  getNorthernNorthSouthDummyEdgeCrossingGraph(): LGraph {
    const leftNode = this.addNodeToLayer(this.makeLayer()); const middle = this.addNodesToLayer(3, this.makeLayer())
    const right = this.addNodesToLayer(2, this.makeLayer())
    this.eastWestEdgeFromTo(leftNode, middle[1]!); this.eastWestEdgeFromTo(middle[1]!, right[1]!)
    this.setAsLongEdgeDummy(middle[1]!)
    this.addNorthSouthEdge(PortSide.NORTH, middle[2]!, middle[0]!, right[0]!, true)
    return this.graph
  }
  getSouthPortOnNormalNodeBelowLongEdgeDummy(): LGraph {
    const leftNode = this.addNodeToLayer(this.makeLayer()); const middle = this.addNodesToLayer(3, this.makeLayer())
    const right = this.addNodesToLayer(2, this.makeLayer())
    this.eastWestEdgeFromTo(leftNode, middle[0]!); this.eastWestEdgeFromTo(middle[0]!, right[0]!)
    middle[0]!.setType(NodeType.LONG_EDGE)
    this.addNorthSouthEdge(PortSide.SOUTH, middle[1]!, middle[2]!, right[1]!, false)
    return this.graph
  }
  getNorthPortOndNormalNodeAboveLongEdgeDummy(): LGraph {
    const leftNode = this.addNodeToLayer(this.makeLayer()); const middle = this.addNodesToLayer(3, this.makeLayer())
    const right = this.addNodesToLayer(2, this.makeLayer())
    this.eastWestEdgeFromTo(leftNode, middle[2]!); this.eastWestEdgeFromTo(middle[2]!, right[1]!)
    middle[2]!.setType(NodeType.LONG_EDGE)
    this.addNorthSouthEdge(PortSide.NORTH, middle[1]!, middle[0]!, right[0]!, false)
    return this.graph
  }
  getLongEdgeDummyAndNormalNodeWithUnusedPortsOnSouthernSide(): LGraph {
    const leftNode = this.addNodeToLayer(this.makeLayer()); const middle = this.addNodesToLayer(2, this.makeLayer())
    const rightNode = this.addNodeToLayer(this.makeLayer())
    this.setFixedOrderConstraint(middle[0]!)
    this.eastWestEdgeFromTo(leftNode, middle[1]!); this.eastWestEdgeFromTo(middle[1]!, rightNode)
    this.setAsLongEdgeDummy(middle[1]!)
    this.addPortOnSide(middle[0]!, PortSide.SOUTH); this.addPortOnSide(middle[0]!, PortSide.SOUTH)
    return this.graph
  }
  getLongEdgeDummyAndNormalNodeWithUnusedPortsOnNorthernSide(): LGraph {
    const leftNode = this.addNodeToLayer(this.makeLayer()); const middle = this.addNodesToLayer(2, this.makeLayer())
    const rightNode = this.addNodeToLayer(this.makeLayer())
    this.eastWestEdgeFromTo(leftNode, middle[0]!); this.eastWestEdgeFromTo(middle[0]!, rightNode)
    middle[0]!.setType(NodeType.LONG_EDGE)
    this.addPortOnSide(middle[1]!, PortSide.NORTH); this.addPortOnSide(middle[1]!, PortSide.NORTH)
    return this.graph
  }
  getMultipleNorthSouthAndLongEdgeDummiesOnBothSides(): LGraph {
    const left = this.addNodesToLayer(2, this.makeLayer()); const middle = this.addNodesToLayer(7, this.makeLayer())
    const right = this.addNodesToLayer(6, this.makeLayer())
    this.eastWestEdgeFromTo(left[0]!, middle[2]!); this.eastWestEdgeFromTo(middle[2]!, right[2]!)
    this.eastWestEdgeFromTo(left[1]!, middle[4]!); this.eastWestEdgeFromTo(middle[4]!, right[4]!)
    this.setAsLongEdgeDummy(middle[2]!); this.setAsLongEdgeDummy(middle[4]!)
    this.addNorthSouthEdge(PortSide.NORTH, middle[3]!, middle[0]!, right[0]!, false)
    this.addNorthSouthEdge(PortSide.NORTH, middle[3]!, middle[1]!, right[1]!, false)
    this.addNorthSouthEdge(PortSide.SOUTH, middle[3]!, middle[5]!, right[4]!, false)
    this.addNorthSouthEdge(PortSide.SOUTH, middle[3]!, middle[6]!, right[5]!, false)
    return this.graph
  }
  getSouthernNorthSouthGraphEdgesFromEastAndWestNoCrossings(): LGraph {
    const leftNode = this.addNodeToLayer(this.makeLayer()); const middle = this.addNodesToLayer(3, this.makeLayer())
    const rightNode = this.addNodeToLayer(this.makeLayer())
    this.setFixedOrderConstraint(middle[0]!)
    this.addNorthSouthEdge(PortSide.SOUTH, middle[0]!, middle[1]!, rightNode, false)
    this.addNorthSouthEdge(PortSide.SOUTH, middle[0]!, middle[2]!, leftNode, true)
    return this.graph
  }
  getNorthernNorthSouthGraphEdgesFromEastAndWestNoCrossings(): LGraph {
    const leftNode = this.addNodeToLayer(this.makeLayer()); const middle = this.addNodesToLayer(3, this.makeLayer())
    const rightNode = this.addNodeToLayer(this.makeLayer())
    this.setFixedOrderConstraint(middle[2]!)
    this.addNorthSouthEdge(PortSide.NORTH, middle[2]!, middle[0]!, leftNode, true)
    this.addNorthSouthEdge(PortSide.NORTH, middle[2]!, middle[1]!, rightNode, false)
    return this.graph
  }
  getNorthernNorthSouthGraphEdgesFromEastAndWestNoCrossingsUpperEdgeEast(): LGraph {
    const leftNode = this.addNodeToLayer(this.makeLayer()); const middle = this.addNodesToLayer(3, this.makeLayer())
    const rightNode = this.addNodeToLayer(this.makeLayer())
    this.setFixedOrderConstraint(middle[2]!)
    this.addNorthSouthEdge(PortSide.NORTH, middle[2]!, middle[1]!, leftNode, true)
    this.addNorthSouthEdge(PortSide.NORTH, middle[2]!, middle[0]!, rightNode, false)
    return this.graph
  }
  getNorthSouthEdgesFromEastAndWestAndCross(): LGraph {
    const leftNode = this.addNodeToLayer(this.makeLayer()); const middle = this.addNodesToLayer(3, this.makeLayer())
    const rightNode = this.addNodeToLayer(this.makeLayer())
    this.setFixedOrderConstraint(middle[0]!)
    this.addNorthSouthEdge(PortSide.SOUTH, middle[0]!, middle[1]!, leftNode, true)
    this.addNorthSouthEdge(PortSide.SOUTH, middle[0]!, middle[2]!, rightNode, false)
    return this.graph
  }
  getSouthernNorthSouthEdgesBothToEast(): LGraph {
    const middle = this.addNodesToLayer(3, this.makeLayer()); const right = this.addNodesToLayer(2, this.makeLayer())
    this.setFixedOrderConstraint(middle[0]!)
    this.addNorthSouthEdge(PortSide.SOUTH, middle[0]!, middle[1]!, right[0]!, false)
    this.addNorthSouthEdge(PortSide.SOUTH, middle[0]!, middle[2]!, right[1]!, false)
    return this.graph
  }
  getNorthSouthSouthernTwoWesternEdges(): LGraph {
    const left = this.addNodesToLayer(2, this.makeLayer()); const middle = this.addNodesToLayer(3, this.makeLayer())
    this.setFixedOrderConstraint(middle[0]!)
    this.addNorthSouthEdge(PortSide.SOUTH, middle[0]!, middle[1]!, left[0]!, true)
    this.addNorthSouthEdge(PortSide.SOUTH, middle[0]!, middle[2]!, left[1]!, true)
    return this.graph
  }
  getNorthSouthSouthernThreeWesternEdges(): LGraph {
    const left = this.addNodesToLayer(3, this.makeLayer()); const middle = this.addNodesToLayer(4, this.makeLayer())
    this.setFixedOrderConstraint(middle[0]!)
    this.addNorthSouthEdge(PortSide.SOUTH, middle[0]!, middle[1]!, left[0]!, true)
    this.addNorthSouthEdge(PortSide.SOUTH, middle[0]!, middle[2]!, left[1]!, true)
    this.addNorthSouthEdge(PortSide.SOUTH, middle[0]!, middle[3]!, left[2]!, true)
    return this.graph
  }
  getNorthSouthNorthernWesternEdges(): LGraph {
    const left = this.addNodesToLayer(2, this.makeLayer()); const middle = this.addNodesToLayer(3, this.makeLayer())
    this.setFixedOrderConstraint(middle[2]!)
    this.addNorthSouthEdge(PortSide.NORTH, middle[2]!, middle[1]!, left[1]!, true)
    this.addNorthSouthEdge(PortSide.NORTH, middle[2]!, middle[0]!, left[0]!, true)
    return this.graph
  }
  getNorthSouthNorthernEasternPortToWestWesternPortToEast(): LGraph {
    const leftNode = this.addNodeToLayer(this.makeLayer()); const middle = this.addNodesToLayer(3, this.makeLayer())
    const rightNode = this.addNodeToLayer(this.makeLayer())
    this.setFixedOrderConstraint(middle[2]!)
    this.addNorthSouthEdge(PortSide.NORTH, middle[2]!, middle[1]!, rightNode, false)
    this.addNorthSouthEdge(PortSide.NORTH, middle[2]!, middle[0]!, leftNode, true)
    return this.graph
  }
  getNorthSouthAllSidesMultipleCrossings(): LGraph {
    const leftNode = this.addNodeToLayer(this.makeLayer()); const middle = this.addNodesToLayer(7, this.makeLayer())
    const right = this.addNodesToLayer(5, this.makeLayer())
    this.setFixedOrderConstraint(middle[3]!)
    this.addNorthSouthEdge(PortSide.NORTH, middle[3]!, middle[1]!, right[1]!, false)
    this.addNorthSouthEdge(PortSide.NORTH, middle[3]!, middle[2]!, leftNode, true)
    this.addNorthSouthEdge(PortSide.NORTH, middle[3]!, middle[0]!, right[0]!, false)
    this.addNorthSouthEdge(PortSide.SOUTH, middle[3]!, middle[6]!, right[4]!, false)
    this.addNorthSouthEdge(PortSide.SOUTH, middle[3]!, middle[4]!, right[2]!, false)
    this.addNorthSouthEdge(PortSide.SOUTH, middle[3]!, middle[5]!, right[3]!, false)
    return this.graph
  }
  getNorthSouthSouthernWesternPortToEastAndEasternPortToWest(): LGraph {
    const leftNode = this.addNodeToLayer(this.makeLayer()); const middle = this.addNodesToLayer(3, this.makeLayer())
    const rightNode = this.addNodeToLayer(this.makeLayer())
    this.setFixedOrderConstraint(middle[0]!)
    this.addNorthSouthEdge(PortSide.SOUTH, middle[0]!, middle[2]!, leftNode, true)
    this.addNorthSouthEdge(PortSide.SOUTH, middle[0]!, middle[1]!, rightNode, false)
    return this.graph
  }
  getGraphWhereLayoutUnitPreventsSwitch(): LGraph {
    const left = this.addNodesToLayer(4, this.makeLayer()); const right = this.addNodesToLayer(2, this.makeLayer())
    this.setFixedOrderConstraint(left[0]!); this.setFixedOrderConstraint(left[3]!)
    this.addNorthSouthEdge(PortSide.SOUTH, left[0]!, left[1]!, right[1]!, false)
    this.addNorthSouthEdge(PortSide.NORTH, left[3]!, left[2]!, right[0]!, false)
    return this.graph
  }
  getGraphLayoutUnitPreventsSwitchWithNodeWithNodeWithNorthernEdges(): LGraph {
    const left = this.addNodesToLayer(3, this.makeLayer()); const right = this.addNodesToLayer(3, this.makeLayer())
    this.addNorthSouthEdge(PortSide.NORTH, left[1]!, left[0]!, right[0]!, false)
    this.eastWestEdgeFromTo(left[1]!, right[2]!); this.eastWestEdgeFromTo(left[2]!, right[1]!)
    return this.graph
  }
  getGraphLayoutUnitPreventsSwitchWithNodeWithNodeWithSouthernEdges(): LGraph {
    const left = this.addNodesToLayer(4, this.makeLayer()); const right = this.addNodesToLayer(3, this.makeLayer())
    this.eastWestEdgeFromTo(left[0]!, right[1]!); this.eastWestEdgeFromTo(left[1]!, right[0]!)
    this.addNorthSouthEdge(PortSide.SOUTH, left[1]!, left[2]!, right[2]!, false)
    return this.graph
  }
  getGraphLayoutUnitDoesNotPreventSwitchWithLongEdgeDummy(): LGraph {
    const leftNode = this.addNodeToLayer(this.makeLayer()); const middle = this.addNodesToLayer(4, this.makeLayer())
    const right = this.addNodesToLayer(3, this.makeLayer())
    this.setAsLongEdgeDummy(middle[0]!)
    this.eastWestEdgeFromTo(leftNode, middle[0]!); this.eastWestEdgeFromTo(middle[0]!, right[1]!)
    this.eastWestEdgeFromTo(middle[1]!, right[0]!); this.eastWestEdgeFromTo(middle[1]!, right[0]!)
    this.addNorthSouthEdge(PortSide.SOUTH, middle[1]!, middle[2]!, right[2]!, false)
    return this.graph
  }
}
