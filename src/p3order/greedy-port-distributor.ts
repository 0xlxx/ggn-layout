/** GreedyPortDistributor (对应 ELK p3order.GreedyPortDistributor). */
import type { LNode } from '../graph/lnode.js'
import type { LPort } from '../graph/lport.js'
import { PortConstraints, PortSide } from '../graph/enums.js'
import { PORT_CONSTRAINTS } from '../options/layered-options.js'
import { PORT_DUMMY } from '../options/internal-properties.js'
import { CrossingsCounter } from './counting.js'
import { BetweenLayerEdgeTwoNodeCrossingsCounter } from '../intermediate/greedyswitch/greedy-switch-heuristic.js'
import type { IInitializable } from './all-crossings-counter.js'

export class GreedyPortDistributor implements IInitializable {
  readonly skipInitAtLayerLevel = true
  readonly skipInitAtPortLevel = true
  readonly skipInitAtEdgeLevel = true
  private crossingsCounter!: CrossingsCounter
  private hierarchicalCrossingsCounter!: BetweenLayerEdgeTwoNodeCrossingsCounter
  private nPorts = 0
  private portPositions: number[] = []
  distributePortsWhileSweeping(order: LNode[][], freeLayerIndex: number, isForwardSweep: boolean): boolean {
    const side = isForwardSweep ? PortSide.WEST : PortSide.EAST
    if (isForwardSweep && freeLayerIndex > 0) this.crossingsCounter.initForCountingBetween(order[freeLayerIndex - 1]!, order[freeLayerIndex]!)
    else if (!isForwardSweep && freeLayerIndex < order.length - 1) this.crossingsCounter.initForCountingBetween(order[freeLayerIndex]!, order[freeLayerIndex + 1]!)
    else this.crossingsCounter.initPortPositionsForInLayerCrossings(order[freeLayerIndex]!, side)
    let improved = false
    for (const node of order[freeLayerIndex]!) {
      const pc = node.getProperty<PortConstraints>(PORT_CONSTRAINTS)
      if (PortConstraints.isOrderFixed(pc)) continue
      // ELK: compound 节点 (有嵌套图 + 非空端口视图) 用 hierarchical crossing counter.
      const nestedGraph = node.getNestedGraph()
      const useHierarchical = node.getPortSideView(side).length > 0 && nestedGraph !== null
      if (useHierarchical) {
        const inner = nestedGraph!.toNodeArray()
        if (process.env.GGN_GPD_DBG) console.error('GPD inner layers:', inner.length, inner.map(l => l.length).join(','))
        this.hierarchicalCrossingsCounter = new BetweenLayerEdgeTwoNodeCrossingsCounter(inner, isForwardSweep ? 0 : inner.length - 1)
      }
      improved = this.distributePortsOnNode(node, side, useHierarchical) || improved
    }
    return improved
  }
  initAtLayerLevel(): void {}
  // ELK 原版: 只累计端口数; 端口 id 由 AllCrossingsCounter (同遍历) 重排, 不在此赋值.
  initAtNodeLevel(l: number, n: number, nodeOrder: LNode[][]): void {
    this.nPorts += nodeOrder[l]![n]!.getPorts().length
  }
  initAtPortLevel(): void {}
  initAtEdgeLevel(): void {}
  initAfterTraversal(): void {
    this.portPositions = new Array<number>(this.nPorts)
    this.crossingsCounter = new CrossingsCounter(this.portPositions)
  }
  private distributePortsOnNode(node: LNode, side: PortSide, useHierarchical: boolean): boolean {
    let ports = node.getPortSideView(side)
    if (side === PortSide.SOUTH || side === PortSide.WEST) ports = [...ports].reverse()
    let improved = false
    let switched: boolean
    do {
      switched = false
      for (let index = 0; index < ports.length - 1; index++) {
        const upper = ports[index]!
        const lower = ports[index + 1]!
        if (this.switchingDecreasesCrossings(upper, lower, useHierarchical)) {
          this.crossingsCounter.switchPorts(upper, lower)
          ports[index] = lower
          ports[index + 1] = upper
          const nodePorts = node.getPorts()
          const upperPosition = nodePorts.indexOf(upper)
          const lowerPosition = nodePorts.indexOf(lower)
          if (upperPosition >= 0 && lowerPosition >= 0) {
            nodePorts[upperPosition] = lower
            nodePorts[lowerPosition] = upper
          }
          improved = true
          switched = true
        }
      }
    } while (switched)
    return improved
  }

  private switchingDecreasesCrossings(upper: LPort, lower: LPort, useHierarchical: boolean): boolean {
    const pair = this.crossingsCounter.countCrossingsBetweenPortsInBothOrders(upper, lower)
    let upperLower = pair.first
    let lowerUpper = pair.second
    if (useHierarchical) {
      const upperNode = upper.getProperty<LNode | null>(PORT_DUMMY)
      const lowerNode = lower.getProperty<LNode | null>(PORT_DUMMY)
      if (upperNode !== null && upperNode !== undefined && lowerNode !== null && lowerNode !== undefined) {
        this.hierarchicalCrossingsCounter.countBothSideCrossings(upperNode, lowerNode)
        upperLower += this.hierarchicalCrossingsCounter.getUpperLowerCrossings()
        lowerUpper += this.hierarchicalCrossingsCounter.getLowerUpperCrossings()
      }
    }
    return upperLower > lowerUpper
  }
}
