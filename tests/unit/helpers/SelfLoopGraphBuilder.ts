/**
 * 自环测试图构造辅助 (ggn 版).
 * 对应 ELK SelfLoopTestGraphCreator 的简化: 建图/节点/端口/自环边/标签/holder.
 */
import { LGraph, LNode, LPort, LEdge, PortSide, Direction, NodeType, PortConstraints } from '../../../src/index.js'
import { Layer } from '../../../src/graph/layer.js'
import { SelfLoopHolder } from '../../../src/intermediate/loops/self-loop-holder.js'
import type { SelfHyperLoop } from '../../../src/intermediate/loops/self-hyper-loop.js'
import type { SelfLoopPort } from '../../../src/intermediate/loops/self-loop-port.js'
import {
  DIRECTION, SELF_LOOP_DISTRIBUTION, SELF_LOOP_ORDERING, EDGE_ROUTING,
  SPACING_LABEL_LABEL, SPACING_EDGE_EDGE, SPACING_EDGE_LABEL, SPACING_NODE_SELF_LOOP,
} from '../../../src/options/layered-options.js'
import { RANDOM } from '../../../src/options/internal-properties.js'
import { MockRandom } from './MockRandom.js'
import type { JavaRandom } from '../../../src/util/java-random.js'

export interface GraphOpts {
  direction?: Direction
  distribution?: 'NORTH' | 'NORTH_SOUTH' | 'EQUALLY' | string
  ordering?: 'SEQUENCED' | 'STACKED' | 'REVERSE_STACKED' | string
  edgeRouting?: string
  labelLabelSpacing?: number
  edgeEdgeSpacing?: number
  edgeLabelSpacing?: number
  nodeSelfLoopSpacing?: number
}

export function makeGraph(opts: GraphOpts = {}): LGraph {
  const graph = new LGraph()
  graph.setProperty(DIRECTION, opts.direction ?? Direction.RIGHT)
  graph.setProperty(SELF_LOOP_DISTRIBUTION, opts.distribution ?? 'NORTH')
  graph.setProperty(SELF_LOOP_ORDERING, opts.ordering ?? 'STACKED')
  graph.setProperty(EDGE_ROUTING, opts.edgeRouting ?? 'ORTHOGONAL')
  graph.setProperty(SPACING_LABEL_LABEL, opts.labelLabelSpacing ?? 0)
  graph.setProperty(SPACING_EDGE_EDGE, opts.edgeEdgeSpacing ?? 10)
  graph.setProperty(SPACING_EDGE_LABEL, opts.edgeLabelSpacing ?? 2)
  graph.setProperty(SPACING_NODE_SELF_LOOP, opts.nodeSelfLoopSpacing ?? 10)
  graph.setProperty(RANDOM, new MockRandom() as unknown as JavaRandom)
  return graph
}

export function makeLayer(graph: LGraph): Layer {
  const layer = new Layer(graph)
  graph.getLayers().push(layer)
  return layer
}

export function makeNode(graph: LGraph, layer: Layer | null = null, size: { x: number; y: number } = { x: 50, y: 50 }): LNode {
  const node = new LNode(graph)
  node.setType(NodeType.NORMAL)
  if (layer !== null) node.setLayer(layer)
  node.size = { ...size }
  return node
}

/** 按 N/E/S/W 顺序添加端口 (对应 ELK SelfLoopTestGraphCreator.ports). */
export function makePorts(node: LNode, north = 0, east = 0, south = 0, west = 0): LPort[] {
  const out: LPort[] = []
  const add = (side: PortSide, n: number) => {
    for (let i = 0; i < n; i++) {
      const p = new LPort()
      p.setNode(node)
      p.setSide(side)
      out.push(p)
    }
  }
  add(PortSide.NORTH, north)
  add(PortSide.EAST, east)
  add(PortSide.SOUTH, south)
  add(PortSide.WEST, west)
  return out
}

export function makeEdge(src: LPort, tgt: LPort): LEdge {
  const e = new LEdge()
  e.setSource(src)
  e.setTarget(tgt)
  return e
}

export function addLabel(edge: LEdge, text: string, size: { x: number; y: number }): void {
  edge.getLabels().push({ text, position: { x: 0, y: 0 }, size })
}

/** 安装 holder (节点必须含至少一条自环边). */
export function installHolder(node: LNode): SelfLoopHolder {
  return SelfLoopHolder.install(node)
}

/** 按 ELK SelfLoopPreProcessor.hidePorts 语义隐藏纯自环端口. */
export function hideSelfLoopPorts(holder: SelfLoopHolder, portsToHide: LPort[]): void {
  for (const lPort of portsToHide) {
    lPort.setNode(null)
    for (const slPort of holder.getSLPortMap().values()) {
      if (slPort.getLPort() === lPort) slPort.setHidden(true)
    }
  }
  holder.setPortsHidden(true)
}

export type { SelfLoopPort, SelfHyperLoop }
export { PortConstraints }
