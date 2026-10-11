/**
 * ICrossingMinimizationHeuristic (对应 ELK p3order.ICrossingMinimizationHeuristic).
 */
import type { LNode } from '../graph/lnode.js'
import type { IInitializable } from './all-crossings-counter.js'

export interface ICrossingMinimizationHeuristic extends IInitializable {
  alwaysImproves(): boolean
  setFirstLayerOrder(order: LNode[][], forwardSweep: boolean): boolean
  minimizeCrossings(order: LNode[][], freeLayerIndex: number, forwardSweep: boolean, isFirstSweep: boolean): boolean
  isDeterministic(): boolean
}
