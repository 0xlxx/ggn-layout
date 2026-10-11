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
 * NetworkSimplexLayerer (对应 ELK p2layers.NetworkSimplexLayerer) — 1:1 移植.
 */
import type { LGraph } from '../graph/lgraph.js'
import type { LNode } from '../graph/lnode.js'
import type { LEdge } from '../graph/ledge.js'
import { Layer } from '../graph/layer.js'
import { NGraph } from '../networksimplex/ngraph.js'
import type { NNode } from '../networksimplex/nnode.js'
import { NetworkSimplex } from '../networksimplex/network-simplex.js'
import { PRIORITY_SHORTNESS, THOROUGHNESS } from '../options/layered-options.js'
import type { IElkProgressMonitor } from '../layered-layout-provider.js'

export class NetworkSimplexLayerer {
  private layeredGraph: LGraph | null = null
  private componentNodes: LNode[] = []
  private nodeVisited: boolean[] = []
  /** LNode -> layerless 列表下标 (connectedComponentsDFS 免 O(n) indexOf). */
  private componentIndex: Map<LNode, number> | null = null

  /** factor by which the maximal number of iterations is multiplied. */
  private static readonly ITER_LIMIT_FACTOR = 4

  process(theLayeredGraph: LGraph, monitor: IElkProgressMonitor): void {
    monitor.begin('Network simplex layering', 1)

    this.layeredGraph = theLayeredGraph
    const thoroughness = theLayeredGraph.getProperty(THOROUGHNESS) * NetworkSimplexLayerer.ITER_LIMIT_FACTOR

    const theNodes = theLayeredGraph.getLayerlessNodes()
    if (theNodes.length < 1) {
      monitor.done()
      return
    }

    // layer graph, each connected component separately
    const connectedComponents = this.connectedComponents(theNodes)
    let previousLayeringNodeCounts: number[] | null = null
    // 复用同一 NetworkSimplex 实例 (工作数组只增复用, 跨分量不重复分配); prepare 与 forGraph 等价.
    let netSimplex: NetworkSimplex | null = null
    for (const connComp of connectedComponents) {
      // 孤立节点 (0 度): elkjs 实测 = 全部放 layer 0 (NetworkSimplex 对单节点分量 layer=0),
      // 层内顺序由 P3 barycenter 的 randomizeBarycenters 决定 (无边节点随机 barycenter 排序).
      // 之前错误地递增放层 (第 0,1,2,...), 导致与 elkjs 顺序不一致.
      if (connComp.length === 1 && connComp[0]!.getConnectedEdges().length === 0) {
        const layers = theLayeredGraph.getLayers()
        while (layers.length <= 0) {
          layers.push(new Layer(theLayeredGraph))
        }
        connComp[0]!.setLayer(layers[0]!)
        continue
      }
      // determine a limit on the number of iterations
      const iterLimit = thoroughness * Math.floor(Math.sqrt(connComp.length))

      const graph = this.initialize(connComp)

      // execute the network simplex algorithm on the (sub-)graph
      netSimplex = netSimplex === null ? NetworkSimplex.forGraph(graph) : netSimplex.prepare(graph)
      netSimplex
        .withIterationLimit(iterLimit)
        .withPreviousLayering(previousLayeringNodeCounts)
        .withBalancing(true)
        .executeWithMonitor(monitor)

      // the layers are stored in the NNode's layer field.
      const layers = theLayeredGraph.getLayers()
      for (const nNode of graph.nodes) {
        // add additional layers to match required number
        while (layers.length <= nNode.layer) {
          layers.push(new Layer(theLayeredGraph))
        }
        const lNode = nNode.origin as LNode
        lNode.setLayer(layers[nNode.layer]!)
      }

      if (connectedComponents.length > 1) {
        previousLayeringNodeCounts = new Array(theLayeredGraph.getLayers().length).fill(0)
        let layerIdx = 0
        for (const l of theLayeredGraph.getLayers()) {
          previousLayeringNodeCounts[layerIdx++] = l.getNodes().length
        }
      }
    }

    // empty the list of unlayered nodes
    theNodes.length = 0

    this.dispose()
    monitor.done()
  }

  /** Splits the given nodes into connected components. */
  private connectedComponents(theNodes: LNode[]): LNode[][] {
    const components: LNode[][] = []
    this.nodeVisited = new Array(theNodes.length).fill(false)
    this.componentNodes = []
    const componentIndex = new Map<LNode, number>()
    for (let i = 0; i < theNodes.length; i++) {
      componentIndex.set(theNodes[i]!, i)
    }
    this.componentIndex = componentIndex
    for (const node of theNodes) {
      this.componentNodes = []
      this.connectedComponentsDFS(node)
      if (this.componentNodes.length > 0) {
        // ELK connectedComponents: 大分量先 (addFirst) — 保证属性实例复用 (compound05 实证:
        // N2 链分量 5 节点 > N1 链 4 节点 → ELK 先处理 N2 链; ggn 原 push 顺序 → N1 链先 → 层序颠倒).
        if (components.length === 0 || components[0]!.length < this.componentNodes.length) {
          components.unshift(this.componentNodes)
        } else {
          components.push(this.componentNodes)
        }
      }
    }
    return components
  }

  private connectedComponentsDFS(node: LNode): void {
    const index = this.componentIndex!.get(node)
    if (index === undefined || this.nodeVisited[index]) return
    this.nodeVisited[index] = true
    this.componentNodes.push(node)
    // 直接迭代 incoming+outgoing (与 getConnectedEdges 同序), 免 LPort 合并数组分配
    for (const port of node.getPorts()) {
      for (const edge of port.getIncomingEdges()) {
        this.connectedComponentsDFS(this.getOpposite(port, edge).getNode()!)
      }
      for (const edge of port.getOutgoingEdges()) {
        this.connectedComponentsDFS(this.getOpposite(port, edge).getNode()!)
      }
    }
  }

  /** Transforms the layered graph into a network simplex graph. */
  private initialize(theNodes: LNode[]): NGraph {
    const nodeMap = new Map<LNode, NNode>()

    // transform nodes (addNode/addEdge 直接构造, 免 nn()/ne() builder 对象分配)
    const graph = new NGraph()
    for (const lNode of theNodes) {
      const nNode = graph.addNode(lNode)
      nodeMap.set(lNode, nNode)
    }

    // transform edges (直接按端口迭代, 免 LNode.getOutgoingEdges 合并数组分配; 顺序一致)
    for (const lNode of theNodes) {
      for (const port of lNode.getPorts()) {
        for (const lEdge of port.getOutgoingEdges()) {
          // ignore self-loops
          if (lEdge.isSelfLoop()) continue
          // ignore hidden edges (LayerConstraintPreprocessor 断开的边)
          if (lEdge.getSource() === null || lEdge.getTarget() === null) continue

          graph.addEdge(
            lEdge,
            1 * Math.max(1, lEdge.getProperty(PRIORITY_SHORTNESS)),
            1,
            nodeMap.get(lEdge.getSource()!.getNode()!)!,
            nodeMap.get(lEdge.getTarget()!.getNode()!)!,
          )
        }
      }
    }

    return graph
  }

  private dispose(): void {
    this.componentNodes = []
    this.layeredGraph = null
    this.nodeVisited = []
    this.componentIndex = null
  }

  /** Returns the port connected to the opposite side of the specified edge. */
  private getOpposite(port: { getNode(): LNode | null }, edge: LEdge): { getNode(): LNode | null } {
    if (edge.getSource() === port) return edge.getTarget()!
    if (edge.getTarget() === port) return edge.getSource()!
    throw new Error('Input edge is not connected to the input port.')
  }
}
