/**
 * GraphInfoHolder (对应 ELK p3order.GraphInfoHolder).
 */
import type { LGraph } from '../graph/lgraph.js'
import type { LNode } from '../graph/lnode.js'
import { GRAPH_PROPERTIES, RANDOM } from '../options/internal-properties.js'
import { GraphProperties } from '../options/internal-properties.js'
import type { SweepCopy } from './sweep-copy.js'
import type { ICrossingMinimizationHeuristic } from './interfaces.js'
import type { ISweepPortDistributor } from './port-distributors.js'
import { createPortDistributor, CrossMinType, type AbstractBarycenterPortDistributor } from './port-distributors.js'
import { AllCrossingsCounter, initInitializables, type IInitializable } from './all-crossings-counter.js'
import { decideUseBottomUp } from './layer-sweep-type-decider.js'
import { BarycenterHeuristic } from './barycenter-heuristic.js'
import { ModelOrderBarycenterHeuristic } from './ModelOrderBarycenterHeuristic.js'
import { MedianHeuristic } from './MedianHeuristic.js'
import { ForsterConstraintResolver } from './forster-constraint-resolver.js'
import { CROSSING_MINIMIZATION_FORCE_NODE_MODEL_ORDER } from '../options/internal-properties.js'
import { GreedySwitchHeuristic } from '../intermediate/greedyswitch/greedy-switch-heuristic.js'

export class GraphInfoHolder implements IInitializable {
  readonly skipInitAtLayerLevel = true
  readonly skipInitAtEdgeLevel = true
  private _lGraph: LGraph
  private _currentNodeOrder: LNode[][]
  private _currentlyBestNodeAndPortOrder: SweepCopy | null = null
  private _bestNodeAndPortOrder: SweepCopy | null = null
  private _portPositions: number[] = []

  private _useBottomUp = false

  private _childGraphs: LGraph[] = []
  private _hasExternalPorts = false
  private _hasParent = false
  private _parentGraphData: GraphInfoHolder | null = null
  private _parent: LNode | null = null

  private _crossMinimizer!: ICrossingMinimizationHeuristic
  private _portDistributor!: ISweepPortDistributor
  private _crossingsCounter!: AllCrossingsCounter
  private _nPorts = 0

  constructor(graph: LGraph, crossMinType: CrossMinType, graphs: GraphInfoHolder[]) {
    this._lGraph = graph
    this._currentNodeOrder = graph.toNodeArray()

    this._parent = this._lGraph.getParentNode()
    this._hasParent = this._parent !== null
    this._parentGraphData = this._hasParent ? graphs[this._parent!.getGraph()!.id] : null
    const graphProperties = this._lGraph.getProperty<Set<string>>(GRAPH_PROPERTIES)
    this._hasExternalPorts = graphProperties.has(GraphProperties.EXTERNAL_PORTS)

    this._crossingsCounter = new AllCrossingsCounter(this._currentNodeOrder)
    const random = this._lGraph.getProperty(RANDOM) as unknown as { nextBoolean(): boolean; nextDouble(): number; nextFloat(): number }
    this._portDistributor = createPortDistributor(crossMinType, random, this._currentNodeOrder)
    const initializables: IInitializable[] = [this, this._crossingsCounter, this._portDistributor]

    const forceNodeModelOrder = graph.getProperty<boolean>(CROSSING_MINIMIZATION_FORCE_NODE_MODEL_ORDER)
    if (crossMinType === CrossMinType.BARYCENTER && !forceNodeModelOrder) {
      const constraintResolver = new ForsterConstraintResolver(this._currentNodeOrder)
      initializables.push(constraintResolver)
      this._crossMinimizer = new BarycenterHeuristic(constraintResolver, random,
        this._portDistributor as AbstractBarycenterPortDistributor, this._currentNodeOrder)
    } else if (crossMinType === CrossMinType.BARYCENTER && forceNodeModelOrder) {
      const constraintResolver = new ForsterConstraintResolver(this._currentNodeOrder)
      initializables.push(constraintResolver)
      this._crossMinimizer = new ModelOrderBarycenterHeuristic(constraintResolver, random,
        this._portDistributor as AbstractBarycenterPortDistributor, this._currentNodeOrder)
    } else if (crossMinType === CrossMinType.MEDIAN) {
      this._crossMinimizer = new MedianHeuristic(random)
    } else if (crossMinType === CrossMinType.ONE_SIDED_GREEDY_SWITCH
      || crossMinType === CrossMinType.TWO_SIDED_GREEDY_SWITCH) {
      this._crossMinimizer = new GreedySwitchHeuristic(crossMinType, this)
    } else {
      throw new Error(`CrossMinType ${crossMinType} 未实现`)
    }
    initializables.push(this._crossMinimizer)

    initInitializables(initializables, this._currentNodeOrder)
    if (process.env.GGN_P3_DBG) {
      console.error('GGN GIH edges:')
      for (const la of graph.getLayers()) {
        for (const nn of la.getNodes()) {
          const sb = nn.getPorts().map(pp => {
            const inc = pp.getIncomingEdges().map(ee => ee.getSource()!.getNode()!.id).join(',')
            return `${pp.id}<-${inc}`
          }).join(' ')
          console.error(`GGN GIH layer=${la.getIndex()} node=${nn.id} inPorts=[${sb}]`)
        }
      }
    }

    this._useBottomUp = decideUseBottomUp(this)
  }

  dontSweepInto(): boolean {
    return this._useBottomUp
  }

  get lGraph(): LGraph {
    return this._lGraph
  }

  get currentNodeOrder(): LNode[][] {
    return this._currentNodeOrder
  }

  get currentlyBestNodeAndPortOrder(): SweepCopy | null {
    return this._currentlyBestNodeAndPortOrder
  }

  setCurrentlyBestNodeAndPortOrder(v: SweepCopy | null): void {
    this._currentlyBestNodeAndPortOrder = v
  }

  get bestNodeNPortOrder(): SweepCopy | null {
    return this._bestNodeAndPortOrder
  }

  setBestNodeNPortOrder(v: SweepCopy | null): void {
    this._bestNodeAndPortOrder = v
  }

  get crossCounter(): AllCrossingsCounter {
    return this._crossingsCounter
  }

  get crossMinimizer(): ICrossingMinimizationHeuristic {
    return this._crossMinimizer
  }

  get portDistributor(): ISweepPortDistributor {
    return this._portDistributor
  }

  get parent(): LNode | null {
    return this._parent
  }

  get hasParent(): boolean {
    return this._hasParent
  }

  get childGraphs(): LGraph[] {
    return this._childGraphs
  }

  get hasExternalPorts(): boolean {
    return this._hasExternalPorts
  }

  get parentGraphData(): GraphInfoHolder | null {
    return this._parentGraphData
  }

  get crossMinDeterministic(): boolean {
    return this._crossMinimizer.isDeterministic()
  }

  get crossMinAlwaysImproves(): boolean {
    return this._crossMinimizer.alwaysImproves()
  }

  get getBestSweep(): SweepCopy | null {
    return this._crossMinimizer.isDeterministic() ? this._currentlyBestNodeAndPortOrder : this._bestNodeAndPortOrder
  }

  get portPositions(): number[] {
    return this._portPositions
  }

  initAtLayerLevel(): void {}

  initAtNodeLevel(l: number, n: number, nodeOrder: LNode[][]): void {
    const node = nodeOrder[l]![n]!
    const nestedGraph = node.getNestedGraph()
    if (nestedGraph !== null) this._childGraphs.push(nestedGraph)
  }

  initAtPortLevel(): void {
    this._nPorts++
  }

  initAtEdgeLevel(): void {}

  initAfterTraversal(): void {
    this._portPositions = new Array<number>(this._nPorts)
  }
}
