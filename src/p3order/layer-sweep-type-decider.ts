/**
 * LayerSweepTypeDecider (对应 ELK p3order.LayerSweepTypeDecider).
 * 现代 TS 纯函数: 由路径统计 (random vs hierarchical influence) 决定是否 bottom-up sweep.
 * 去掉了 ELK/ggn 的 IInitializable 遍历模式 — nodeInfo 在函数内直接按 currentNodeOrder 构建.
 */
import type { LNode } from '../graph/lnode.js'
import type { LPort } from '../graph/lport.js'
import type { LEdge } from '../graph/ledge.js'
import { PortSide, NodeType, PortConstraints } from '../graph/enums.js'
import { PORT_DUMMY, ORIGIN } from '../options/internal-properties.js'
import { PORT_CONSTRAINTS } from '../options/layered-options.js'
import { CROSSING_MINIMIZATION_HIERARCHICAL_SWEEPINESS } from '../options/internal-properties.js'
import type { GraphInfoHolder } from './graph-info-holder.js'

type NodeInfo = { connectedEdges: number; hierarchicalInfluence: number; randomInfluence: number }
const newNodeInfo = (): NodeInfo => ({ connectedEdges: 0, hierarchicalInfluence: 0, randomInfluence: 0 })

function transfer(target: NodeInfo, src: NodeInfo): void {
  target.hierarchicalInfluence += src.hierarchicalInfluence
  target.randomInfluence += src.randomInfluence
  target.connectedEdges += src.connectedEdges
}

export function decideUseBottomUp(graphData: GraphInfoHolder): boolean {
  const boundary = graphData.lGraph.getProperty<number>(CROSSING_MINIMIZATION_HIERARCHICAL_SWEEPINESS)
  if (bottomUpForced(boundary) || !graphData.hasParent || fixedPortOrder(graphData)
    || fewerThanTwoInOutEdges(graphData)) {
    return true
  }
  if (graphData.crossMinDeterministic) return false

  const nodeInfo: NodeInfo[][] = graphData.currentNodeOrder.map(layer => layer.map(() => newNodeInfo()))
  const infoOf = (n: LNode): NodeInfo => nodeInfo[n.getLayer()!.getIndex()]![n.id]!

  let pathsToRandom = 0
  let pathsToHierarchical = 0
  const nsPortDummies: LNode[] = []

  for (const layer of graphData.currentNodeOrder) {
    for (const node of layer) {
      if (node.getType() === NodeType.NORTH_SOUTH_PORT) {
        nsPortDummies.push(node)
        continue
      }
      const current = infoOf(node)
      if (node.getType() === NodeType.EXTERNAL_PORT) {
        current.hierarchicalInfluence = 1
        if (isEasternDummy(node)) pathsToHierarchical += current.connectedEdges
      } else if (hasNoWesternPorts(node)) {
        current.randomInfluence = 1
      } else if (hasNoEasternPorts(node)) {
        pathsToRandom += current.connectedEdges
      }
      for (const edge of node.getOutgoingEdges()) {
        pathsToRandom += current.randomInfluence
        pathsToHierarchical += current.hierarchicalInfluence
        transferToTarget(infoOf, current, edge)
      }
      for (const port of [...node.getPortSideView(PortSide.NORTH), ...node.getPortSideView(PortSide.SOUTH)]) {
        const nsDummy = port.getProperty<LNode | null>(PORT_DUMMY)
        if (nsDummy !== null && nsDummy !== undefined) {
          pathsToRandom += current.randomInfluence
          pathsToHierarchical += current.hierarchicalInfluence
          const target = infoOf(nsDummy)
          transfer(target, current)
          target.connectedEdges++
        }
      }
    }
    for (const node of nsPortDummies) {
      const current = infoOf(node)
      for (const edge of node.getOutgoingEdges()) {
        pathsToRandom += current.randomInfluence
        pathsToHierarchical += current.hierarchicalInfluence
        transferToTarget(infoOf, current, edge)
      }
    }
    nsPortDummies.length = 0
  }

  const allPaths = pathsToRandom + pathsToHierarchical
  const normalized = allPaths === 0 ? Number.POSITIVE_INFINITY : (pathsToRandom - pathsToHierarchical) / allPaths
  return normalized >= boundary
}

function transferToTarget(infoOf: (n: LNode) => NodeInfo, current: NodeInfo, edge: LEdge): void {
  const target = infoOf(edge.getTarget()!.getNode()!)
  transfer(target, current)
  target.connectedEdges++
}

function fixedPortOrder(g: GraphInfoHolder): boolean {
  return PortConstraints.isOrderFixed(g.parent!.getProperty<PortConstraints>(PORT_CONSTRAINTS))
}
function fewerThanTwoInOutEdges(g: GraphInfoHolder): boolean {
  return g.parent!.getPortSideView(PortSide.EAST).length < 2
    && g.parent!.getPortSideView(PortSide.WEST).length < 2
}
function bottomUpForced(boundary: number): boolean {
  return boundary < -1
}
function hasNoEasternPorts(node: LNode): boolean {
  const east = node.getPortSideView(PortSide.EAST)
  return east.length === 0 || !east.some(p => p.getConnectedEdges().length > 0)
}
function hasNoWesternPorts(node: LNode): boolean {
  const west = node.getPortSideView(PortSide.WEST)
  return west.length === 0 || !west.some(p => p.getConnectedEdges().length > 0)
}
function isEasternDummy(node: LNode): boolean {
  return (node.getProperty(ORIGIN) as LPort).getSide() === PortSide.EAST
}
