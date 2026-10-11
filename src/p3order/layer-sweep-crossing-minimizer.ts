/*
 * Copyright (c) 2026 GGN contributors.
 * Portions derived from the Eclipse Layout Kernel (ELK), Copyright (c) Kiel University and others.
 *
 * This file is part of ggn-layout, a TypeScript port of ELK v0.12.0.
 * Upstream attribution and source range: see THIRD_PARTY_NOTICES.md.
 *
 * SPDX-License-Identifier: EPL-2.0
 * License text: LICENSES/EPL-2.0.txt.
 */
/**
 * LayerSweepCrossingMinimizer (对应 ELK p3order.LayerSweepCrossingMinimizer).
 * 默认配置路径 (BARYCENTER, 无 model order / compound).
 */
import type { LGraph } from '../graph/lgraph.js'
import type { LNode } from '../graph/lnode.js'
import { PortSide, NodeType, PortConstraints } from '../graph/enums.js'
import { RANDOM } from '../options/internal-properties.js'
import { JavaRandom } from '../util/java-random.js'
import { THOROUGHNESS, HIERARCHY_HANDLING, RANDOM_SEED, PORT_CONSTRAINTS } from '../options/layered-options.js'
import type { IElkProgressMonitor } from '../layered-layout-provider.js'
import { GraphInfoHolder } from './graph-info-holder.js'
import { CrossMinType } from './port-distributors.js'
import { SweepCopy } from './sweep-copy.js'
import { ORIGIN, INSIDE_CONNECTIONS, PORT_DUMMY } from '../options/internal-properties.js'

export enum HierarchyHandling {
  INCLUDE_CHILDREN = 'INCLUDE_CHILDREN',
}

export class LayerSweepCrossingMinimizer {
  private graphInfoHolders: GraphInfoHolder[] = []
  private graphsWhoseNodeOrderChanged = new Set<GraphInfoHolder>()
  private random!: JavaRandom
  private randomSeed = 1
  private crossMinType: CrossMinType

  constructor(cT: CrossMinType) {
    this.crossMinType = cT
  }

  process(layeredGraph: LGraph, progressMonitor: IElkProgressMonitor): void {
    progressMonitor.begin(`Minimize Crossings ${this.crossMinType}`, 1)
    if (process.env.GGN_SWEEP_WHO) console.error(`GGN_SWEEP_WHO parent=${layeredGraph.getParentNode()?.id ?? "root"} layers=${layeredGraph.getLayers().length} type=${this.crossMinType}`)

    const emptyGraph = layeredGraph.getLayers().length === 0
      || layeredGraph.getLayers().every(layer => layer.getNodes().length === 0)
    const singleNode = layeredGraph.getLayers().length === 1
      && layeredGraph.getLayers()[0]!.getNodes().length === 1
    const hierarchicalLayout =
      layeredGraph.getProperty(HIERARCHY_HANDLING) === HierarchyHandling.INCLUDE_CHILDREN

    if (emptyGraph || (singleNode && !hierarchicalLayout)) {
      progressMonitor.done()
      return
    }

    const graphsToSweepOn = this.initialize(layeredGraph)
    const minimizingMethod = this.chooseMinimizingMethod(graphsToSweepOn)

    for (const gData of graphsToSweepOn) {
      if (process.env.GGN_P3_DBG) console.error(`GGN sweep graph=${gData.lGraph.getParentNode()?.id ?? 'root'} layers=${gData.currentNodeOrder.length}`)
      if (gData.currentNodeOrder.length > 0) {
        minimizingMethod(gData)
        if (gData.hasParent) {
          this.setPortOrderOnParentGraph(gData)
        }
      }
    }

    this.transferNodeAndPortOrdersToGraph()

    progressMonitor.done()
  }

  private chooseMinimizingMethod(graphsToSweepOn: GraphInfoHolder[]): (gData: GraphInfoHolder) => void {
    if (graphsToSweepOn.length === 0) {
      // 防御: 无 dontSweepInto 图时列表为空 (ELK 会全加; ggn 目前只加 dontSweepInto, 保持历史行为)
      return () => {}
    }
    const parent = graphsToSweepOn[0]!
    if (!parent.crossMinDeterministic) {
      return (gData) => this.compareDifferentRandomizedLayouts(gData)
    } else if (parent.crossMinAlwaysImproves) {
      return (gData) => this.minimizeCrossingsNoCounter(gData)
    } else {
      return (gData) => this.minimizeCrossingsWithCounter(gData)
    }
  }

  private minimizeCrossingsNoCounter(gData: GraphInfoHolder): void {
    let isForwardSweep = this.random.nextBoolean()
    if (process.env.GGN_P3_DBG) console.error(`GGN sweep noCounter type=${this.crossMinType} firstForward=${isForwardSweep}`)
    let improved = true
    while (improved) {
      improved = false
      improved = gData.crossMinimizer.setFirstLayerOrder(gData.currentNodeOrder, isForwardSweep)
      improved = this.sweepReducingCrossings(gData, isForwardSweep, false) || improved
      isForwardSweep = !isForwardSweep
    }
    this.setCurrentlyBestNodeOrders()
  }

  private compareDifferentRandomizedLayouts(gData: GraphInfoHolder): void {
    // ELK: 重置种子, 否则层级图中不同父节点下的副本布局不一致.
    this.random.setSeed(this.randomSeed)
    this.graphsWhoseNodeOrderChanged.clear()

    let bestCrossings = Number.MAX_SAFE_INTEGER
    const thouroughness = gData.lGraph.getProperty<number>(THOROUGHNESS)
    for (let i = 0; i < thouroughness; i++) {
      const crossings = this.minimizeCrossingsWithCounter(gData)
      if (crossings < bestCrossings) {
        bestCrossings = crossings
        this.saveAllNodeOrdersOfChangedGraphs()
        if (bestCrossings === 0) break
      }
    }
  }

  private minimizeCrossingsWithCounter(gData: GraphInfoHolder): number {
    let isForwardSweep = this.random.nextBoolean()
    if (process.env.GGN_P3_DBG) console.error(`GGN sweep withCounter type=${this.crossMinType} firstForward=${isForwardSweep}`)

    // ELK: 仅 FIRST_TRY_WITH_INITIAL_ORDER (model order) 时 0 交叉早退;
    // 常规图即使 0 交叉也跑 sweep (端口重排会影响后续放置).
    // 先调用一次: CrossingsCounter 的端口位置缓存有副作用, 结果值本身不用 (对齐 Java 的预热调用).
    this.countCurrentNumberOfCrossings(gData)

    gData.crossMinimizer.setFirstLayerOrder(gData.currentNodeOrder, isForwardSweep)
    this.sweepReducingCrossings(gData, isForwardSweep, true)

    let crossingsInGraph = this.countCurrentNumberOfCrossings(gData)
    let oldNumberOfCrossings: number
    let round = 2
    do {
      round++
      this.setCurrentlyBestNodeOrders()

      if (crossingsInGraph === 0) {
        return 0
      }

      isForwardSweep = !isForwardSweep
      oldNumberOfCrossings = crossingsInGraph
      this.sweepReducingCrossings(gData, isForwardSweep, false)
      crossingsInGraph = this.countCurrentNumberOfCrossings(gData)
    } while (oldNumberOfCrossings > crossingsInGraph)

    return oldNumberOfCrossings
  }

  private countCurrentNumberOfCrossings(currentGraph: GraphInfoHolder): number {
    let totalCrossings = 0
    const countCrossingsIn: GraphInfoHolder[] = [currentGraph]
    while (countCrossingsIn.length > 0) {
      const gD = countCrossingsIn.pop()!
      totalCrossings += gD.crossCounter.countAllCrossings(gD.currentNodeOrder)
      for (const childLGraph of gD.childGraphs) {
        const child = this.graphInfoHolders[childLGraph.id]
        if (child && !child.dontSweepInto()) {
          totalCrossings += this.countCurrentNumberOfCrossings(child)
        }
      }
    }
    return totalCrossings
  }

  private sweepReducingCrossings(graph: GraphInfoHolder, forward: boolean, firstSweep: boolean): boolean {
    const nodes = graph.currentNodeOrder
    const length = nodes.length

    let improved = graph.portDistributor.distributePortsWhileSweeping(nodes, this.firstIndex(forward, length), forward)
    const firstLayer = nodes[this.firstIndex(forward, length)]!
    improved = this.sweepInHierarchicalNodes(firstLayer, forward, firstSweep) || improved
    for (let i = this.firstFree(forward, length); this.isNotEnd(length, i, forward); i += this.next(forward)) {
      improved = graph.crossMinimizer.minimizeCrossings(nodes, i, forward, firstSweep) || improved
      improved = graph.portDistributor.distributePortsWhileSweeping(nodes, i, forward) || improved
      improved = this.sweepInHierarchicalNodes(nodes[i]!, forward, firstSweep) || improved
    }

    this.graphsWhoseNodeOrderChanged.add(graph)
    return improved
  }

  private sweepInHierarchicalNodes(layer: LNode[], isForwardSweep: boolean, isFirstSweep: boolean): boolean {
    let improved = false
    for (const node of layer) {
      if (this.hasNestedGraph(node) && !this.graphInfoHolders[node.getNestedGraph()!.id].dontSweepInto()) {
        improved = this.sweepInHierarchicalNode(isForwardSweep, node, isFirstSweep) || improved
      }
    }
    return improved
  }

  private sweepInHierarchicalNode(isForwardSweep: boolean, node: LNode, isFirstSweep: boolean): boolean {
    const nestedLGraph = node.getNestedGraph()!
    const nestedGraph = this.graphInfoHolders[nestedLGraph.id]
    const nestedGraphNodeOrder = nestedGraph.currentNodeOrder
    const startIndex = this.firstIndex(isForwardSweep, nestedGraphNodeOrder.length)
    const firstNode = nestedGraphNodeOrder[startIndex]![0]!

    if (this.isExternalPortDummy(firstNode)) {
      nestedGraphNodeOrder[startIndex] = this.sortPortDummiesByPortPositions(node,
        nestedGraphNodeOrder[startIndex]!, this.sideOpposedSweepDirection(isForwardSweep))
    } else {
      nestedGraph.crossMinimizer.setFirstLayerOrder(nestedGraphNodeOrder, isForwardSweep)
    }

    const improved = this.sweepReducingCrossings(nestedGraph, isForwardSweep, isFirstSweep)
    this.sortPortsByDummyPositionsInLastLayer(nestedGraph.currentNodeOrder, nestedGraph.parent!, isForwardSweep)

    return improved
  }

  private sortPortsByDummyPositionsInLastLayer(nodeOrder: LNode[][], parent: LNode, onRightMostLayer: boolean): void {
    const endIndex = this.endIndex(onRightMostLayer, nodeOrder.length)
    const lastLayer = nodeOrder[endIndex]!
    let j = this.firstIndex(onRightMostLayer, lastLayer.length)
    if (!this.isExternalPortDummy(lastLayer[j]!)) {
      return
    }

    // 只取 ORIGIN 是 LPort 的外部端口 dummy (自环 LONG_EDGE dummy 的 ORIGIN 是 LEdge,
    // 不能写回父端口列表). 按 sweep 方向收集.
    const extDummies: LNode[] = []
    for (let k = 0; k < lastLayer.length; k++) {
      const d = lastLayer[k]!
      if (this.isExternalPortDummy(d)) {
        const o = this.originPort(d)
        if (o !== null && o !== undefined && typeof o.getSide === 'function') extDummies.push(d)
      }
    }
    if (process.env.GGN_SL_DBG) console.error(`GGN sortDummyDetail parent=${parent.id} onRight=${onRightMostLayer} endIdx=${endIndex} lastLayer=[${lastLayer.map(n => n.getType() + '#' + n.id).join(',')}] extDummies=[${extDummies.map(d => this.originPort(d)?.id + ':' + this.originPort(d)?.getSide()).join(',')}]`)
    const ports = parent.getPorts()
    if (process.env.GGN_SL_DBG) {
      console.error(`GGN sortDummy parent=${parent.id} onRight=${onRightMostLayer} before=[${ports.map(p => `${p.id}:${p.getSide()}@${p.getPosition().y}`).join(',')}] extDummies=${extDummies.length}`)
    }
    // ELK 用 j = firstIndex(onRightMostLayer) 并按 next(onRightMostLayer) 方向推进;
    // backward sweep (onRightMostLayer=false) 时从末尾向前取 dummy.
    let e = onRightMostLayer ? 0 : extDummies.length - 1
    const step = onRightMostLayer ? 1 : -1
    for (let i = 0; i < ports.length; i++) {
      const port = ports[i]!
      if (this.isOnEndOfSweepSide(port, onRightMostLayer) && this.isHierarchical(port)) {
        if (e >= 0 && e < extDummies.length) {
          ports[i] = this.originPort(extDummies[e]!)
          e += step
        }
      }
    }
    if (process.env.GGN_SL_DBG) {
      console.error(`GGN sortDummy after=[${ports.map(p => `${p.id}:${p.getSide()}`).join(',')}]`)
    }
  }

  private sortPortDummiesByPortPositions(parentNode: LNode, layerCloseToNodeEdge: LNode[], side: PortSide): LNode[] {
    // 内联 inNorthSouthEastWestOrder: SOUTH/WEST 逆序遍历免 [...].reverse() 拷贝 (顺序逐位一致).
    const view = parentNode.getPortSideView(side)
    const sortedDummies = new Array<LNode>(layerCloseToNodeEdge.length)
    let i = 0
    const forward = side === PortSide.EAST || side === PortSide.NORTH
    if (forward) {
      for (let k = 0; k < view.length; k++) {
        const port = view[k]!
        if (this.isHierarchical(port)) sortedDummies[i++] = this.dummyNodeFor(port)!
      }
    } else {
      for (let k = view.length - 1; k >= 0; k--) {
        const port = view[k]!
        if (this.isHierarchical(port)) sortedDummies[i++] = this.dummyNodeFor(port)!
      }
    }
    if (i < layerCloseToNodeEdge.length) {
      throw new Error(`IllegalStateException: Expected ${layerCloseToNodeEdge.length} hierarchical ports, but found only ${i}.`)
    }
    return sortedDummies
  }

  private setPortOrderOnParentGraph(gData: GraphInfoHolder): void {
    if (process.env.GGN_SL_DBG) console.error(`GGN setPortOrder gd=${gData.lGraph.id} parent=${gData.parent?.id} bestSweep=${gData.getBestSweep !== null}`)
    if (gData.hasExternalPorts && gData.getBestSweep !== null) {
      const bestSweep = gData.getBestSweep!
      this.sortPortsByDummyPositionsInLastLayer(bestSweep.nodes()!, gData.parent!, true)
      this.sortPortsByDummyPositionsInLastLayer(bestSweep.nodes()!, gData.parent!, false)
      // ELK LayerSweepCrossingMinimizer#setPortOrderOnParentGraph: 子图 sweep 后把父节点端口约束
      // 升级为 FIXED_ORDER (端口序已由子图外部端口 dummy 决定), 否则父节点端口在 P3 会被
      // AbstractBarycenterPortDistributor.sortPorts 按 barycenter 重排 → N-S 计数/层序分歧.
      gData.parent!.setProperty(PORT_CONSTRAINTS, PortConstraints.FIXED_ORDER)
    }
  }

  private saveAllNodeOrdersOfChangedGraphs(): void {
    for (const graph of this.graphsWhoseNodeOrderChanged) {
      graph.setBestNodeNPortOrder(new SweepCopy(graph.currentlyBestNodeAndPortOrder!))
    }
  }

  private setCurrentlyBestNodeOrders(): void {
    for (const graph of this.graphsWhoseNodeOrderChanged) {
      graph.setCurrentlyBestNodeAndPortOrder(new SweepCopy(graph.currentNodeOrder))
    }
  }

  private firstIndex(isForwardSweep: boolean, length: number): number {
    return isForwardSweep ? 0 : length - 1
  }

  private endIndex(isForwardSweep: boolean, length: number): number {
    return isForwardSweep ? length - 1 : 0
  }

  private firstFree(isForwardSweep: boolean, length: number): number {
    return isForwardSweep ? 1 : length - 2
  }

  private next(isForwardSweep: boolean): number {
    return isForwardSweep ? 1 : -1
  }

  private isNotEnd(length: number, freeLayerIndex: number, isForwardSweep: boolean): boolean {
    return isForwardSweep ? freeLayerIndex < length : freeLayerIndex >= 0
  }

  private hasNestedGraph(node: LNode): boolean {
    return node.getNestedGraph() !== null
  }

  private sideOpposedSweepDirection(isForwardSweep: boolean): PortSide {
    return isForwardSweep ? PortSide.WEST : PortSide.EAST
  }

  private isExternalPortDummy(node: LNode): boolean {
    return node.getType() === NodeType.EXTERNAL_PORT
  }

  private originPort(node: LNode): import('../graph/lport.js').LPort {
    return node.getProperty(ORIGIN) as import('../graph/lport.js').LPort
  }

  private isHierarchical(port: import('../graph/lport.js').LPort): boolean {
    return port.getProperty<boolean>(INSIDE_CONNECTIONS)
  }

  private dummyNodeFor(port: import('../graph/lport.js').LPort): LNode | null {
    return port.getProperty<LNode | null>(PORT_DUMMY)
  }

  private isOnEndOfSweepSide(port: import('../graph/lport.js').LPort, isForwardSweep: boolean): boolean {
    return isForwardSweep ? port.getSide() === PortSide.EAST : port.getSide() === PortSide.WEST
  }

  private initialize(rootGraph: LGraph): GraphInfoHolder[] {
    this.graphInfoHolders = []
    let rootRandom = rootGraph.getProperty(RANDOM)
    if (rootRandom === undefined) {
      // 防御: 未设置 RANDOM 的图 (子图直接调用等).
      rootRandom = new JavaRandom(rootGraph.getProperty(RANDOM_SEED))
      rootGraph.setProperty(RANDOM, rootRandom)
    }
    this.random = rootRandom
    // ELK Java LayerSweepCrossingMinimizer#initialize: randomSeed = random.nextLong()
    // (ELK Java 617 行, elkjs 同) — 每个图 setSeed 到该随机种子.
    this.randomSeed = this.random.nextLong()
    if (process.env.GGN_P3_DBG) console.error(`GGN sweep init type=${this.crossMinType} randomSeed=${this.randomSeed}`)
    const graphsToSweepOn: GraphInfoHolder[] = []
    const graphs: LGraph[] = [rootGraph]
    let i = 0
    while (i < graphs.length) {
      const graph = graphs[i]!
      graph.id = i++
      // 子图 (compound) 未设置 RANDOM 时沿用根的随机数生成器.
      if (graph.getProperty(RANDOM) === undefined) {
        graph.setProperty(RANDOM, rootRandom)
      }
      const gData = new GraphInfoHolder(graph, this.crossMinType, this.graphInfoHolders)
      graphs.push(...gData.childGraphs)
      this.graphInfoHolders.push(gData)
      if (gData.dontSweepInto()) {
        graphsToSweepOn.unshift(gData)
      }
    }

    this.graphsWhoseNodeOrderChanged = new Set()
    if (process.env.GGN_INIT_ORDER) {
      for (const gd of this.graphInfoHolders) {
        const g = gd.lGraph
        const desc = gd.currentNodeOrder.map((l, li) => "L" + li + ":" + l.map(n => { const t = n.getType().toString(); const label = (t === "NORMAL" ? (n.getLabels()[0]?.text ?? n.id) : n.id); const ports = n.getPorts().map(pp => { const inc = pp.getIncomingEdges().map(ee => { const src = ee.getSource()!.getNode()!; return (src.getType().toString() === "NORMAL" ? (src.getLabels()[0]?.text ?? src.id) : src.id) + "@" + src.getLayer()?.getIndex() }).join("+"); const out = pp.getOutgoingEdges().map(ee => { const tgt = ee.getTarget()!.getNode()!; return (tgt.getType().toString() === "NORMAL" ? (tgt.getLabels()[0]?.text ?? tgt.id) : tgt.id) + "@" + tgt.getLayer()?.getIndex() }).join("+"); return pp.id + "<" + inc + ">" + out }).join(";"); return label + "[" + ports + "]" }).join(",")).join(" | ")
        console.error(`GGN_INIT parent=${g.getParentNode()?.id ?? "root"} (#layers=${gd.currentNodeOrder.length}): ${desc}`)
      }
    }
    return graphsToSweepOn
  }

  private transferNodeAndPortOrdersToGraph(): void {
    for (const gD of this.graphInfoHolders) {
      const bestSweep = gD.getBestSweep
      if (bestSweep !== null) {
        bestSweep.transferNodeAndPortOrdersToGraph(gD.lGraph, true)
      }
    }
  }

  getGraphData(): GraphInfoHolder[] {
    return this.graphInfoHolders
  }
}
