/*
 * Copyright (c) 2010, 2015 Kiel University and others.
 * Copyright (c) 2026 GGN contributors.
 *
 * This file is part of ggn-layout, a TypeScript port of the Eclipse Layout
 * Kernel (ELK, https://github.com/eclipse/elk). It is derived from ELK and is
 * made available under the terms of the Eclipse Public License 2.0.
 *
 * SPDX-License-Identifier: EPL-2.0
 * License text: LICENSES/EPL-2.0.txt — see also THIRD_PARTY_NOTICES.md.
 */
/**
 * NetworkSimplex (对应 ELK networksimplex.NetworkSimplex) — 1:1 移植.
 *
 * Gansner/Koutsofios/North/Vo 1993 "A technique for drawing directed graphs".
 * 变量名与 Java 源码一致: poID/lowestPoID/cutvalue/treeEdges/sources/edgeVisited...
 *
 * 性能注记 (p2-network-simplex 簇, 保序优化):
 * - 工作数组 (poID/lowestPoID/cutvalue/edgeVisited/sources/edges) 只增复用, 跨分量/跨调用不重复分配;
 * - cutvalues() 的 per-node unknownCutvalues 原地清空复用, 不每迭代新建数组;
 * - 队列用头指针代替 shift(), 子树栈用平行数组代替 Pair 对象;
 * - 所有遍历/求和/选择顺序与 ELK Java 逐位一致 (ORDERED, 输出敏感).
 */
import type { NGraph } from './ngraph.js'
import type { NNode } from './nnode.js'
import type { NEdge } from './nedge.js'
import type { IElkProgressMonitor } from '../layered-layout-provider.js'

/** 小值, 用于判断 cut value 是否小于零 (double 精度). */
const FUZZY_ST_ZERO = -1e-10

/** 经验阈值: 超过此节点数时移除子树. */
const REMOVE_SUBTREES_THRESH = 40

export class NetworkSimplex {
  private graph!: NGraph
  private edges: NEdge[] = []
  private treeEdges = new Set<NEdge>()
  private sources: NNode[] = []
  private edgeVisited = new Uint8Array(0)
  private postOrder = 0
  private poID: number[] = []
  private lowestPoID: number[] = []
  private cutvalue: number[] = []
  /** cutvalues() 的叶子队列 (原地复用, 只增). */
  private cutvalueLeafs: NNode[] = []
  /** removeSubtrees 的子树栈 (平行数组, 免 Pair 对象). */
  private subtreeNodes: NNode[] = []
  private subtreeEdges: NEdge[] = []
  /** layeringTopologicalNumbering 的入度计数与拓扑根队列 (只增复用). */
  private incidentCounts: number[] = []
  private topologicalRoots: NNode[] = []
  /** minimalSpan 的结果槽位 (免 Pair 对象). */
  private spanIn = 0
  private spanOut = 0

  private previousLayeringNodeCounts: number[] | null = null
  private doBalance = false
  private iterationLimit = Number.MAX_SAFE_INTEGER

  private constructor() {}

  static forGraph(graph: NGraph): NetworkSimplex {
    const ns = new NetworkSimplex()
    ns.graph = graph
    return ns
  }

  /** (复用) 绑定图 — 与 forGraph 等价, 供 layerer 跨连通分量复用同一实例与工作数组. */
  prepare(graph: NGraph): NetworkSimplex {
    this.graph = graph
    return this
  }

  withBalancing(doBalance: boolean): NetworkSimplex {
    this.doBalance = doBalance
    return this
  }

  withPreviousLayering(considerPreviousLayering: number[] | null): NetworkSimplex {
    this.previousLayeringNodeCounts = considerPreviousLayering
    return this
  }

  withIterationLimit(limit: number): NetworkSimplex {
    this.iterationLimit = limit
    return this
  }

  execute(): void {
    this.executeInternal(null)
  }

  executeWithMonitor(monitor: IElkProgressMonitor): void {
    monitor.begin('Network simplex', 1)
    this.executeInternal(monitor)
    monitor.done()
  }

  private executeInternal(monitor: IElkProgressMonitor | null): void {
    if (this.graph.nodes.length < 1) return

    // reset any old layering
    for (const node of this.graph.nodes) {
      node.layer = 0
    }

    // remove leafs
    const removeSubtrees = this.graph.nodes.length >= REMOVE_SUBTREES_THRESH
    if (removeSubtrees) {
      this.removeSubtrees()
    }

    // init all the data structures we use
    this.initialize()
    // determine an initial feasible layering
    this.feasibleTree()
    if (process.env.GGN_NS_DBG) console.error(`GGN_NS feasible: ${this.graph.nodes.map(n => {
      const origin = n.origin as { getLabels?: () => Array<{ text?: string }>; id?: string } | null
      return (origin?.getLabels?.()?.[0]?.text ?? origin?.id ?? n.id) + ":" + n.layer
    }).join(" ")}`)
    // improve the initial layering until it is optimal
    let e = this.leaveEdge()
    let iter = 0
    while (e !== null && iter < this.iterationLimit) {
      // current layering is not optimal
      this.exchange(e, this.enterEdge(e))
      e = this.leaveEdge()
      iter++
    }

    // re-attach leafs
    if (removeSubtrees) {
      this.reattachSubtrees()
    }

    if (process.env.GGN_NS_DBG) console.error(`GGN_NS preBalance: ${this.graph.nodes.map(n => {
      const origin = n.origin as { getLabels?: () => Array<{ text?: string }>; id?: string } | null
      return (origin?.getLabels?.()?.[0]?.text ?? origin?.id ?? n.id) + ":" + n.layer
    }).join(" ")}`)
    // normalize and, if desired, balance
    if (this.doBalance) {
      this.balance(this.normalize())
    } else {
      this.normalize()
    }

    void monitor
  }

  /** Recursively removes subtrees. In other words, removes leafs from the graph until no more leafs are present. */
  private removeSubtrees(): void {
    this.subtreeNodes.length = 0
    this.subtreeEdges.length = 0

    // find initial leafs
    const leafs: NNode[] = []
    for (const node of this.graph.nodes) {
      if (node.getConnectedEdges().length === 1) {
        leafs.push(node)
      }
    }

    // remove them from the graph like there's no tomorrow
    let leafIdx = 0
    while (leafIdx < leafs.length) {
      const node = leafs[leafIdx++]!
      // was the edge already removed?
      if (node.getConnectedEdges().length === 0) continue
      const edge = node.getConnectedEdges()[0]!
      const isOutEdge = node.getOutgoingEdges().length > 0

      const other = edge.getOther(node)
      if (isOutEdge) {
        const idx = other.getIncomingEdges().indexOf(edge)
        if (idx !== -1) other.getIncomingEdges().splice(idx, 1)
      } else {
        const idx = other.getOutgoingEdges().indexOf(edge)
        if (idx !== -1) other.getOutgoingEdges().splice(idx, 1)
      }
      other.invalidateConnectedEdges()

      if (other.getConnectedEdges().length === 1) {
        leafs.push(other)
      }

      this.subtreeNodes.push(node)
      this.subtreeEdges.push(edge)
      // remove the node from the graph's nodes
      const nIdx = this.graph.nodes.indexOf(node)
      if (nIdx !== -1) this.graph.nodes.splice(nIdx, 1)
    }
  }

  /** Re-attaches the previously removed tree nodes (opposite order of removal). */
  private reattachSubtrees(): void {
    while (this.subtreeNodes.length > 0) {
      const node = this.subtreeNodes.pop()!
      const edge = this.subtreeEdges.pop()!

      const placed = edge.getOther(node)

      if (edge.target === node) {
        placed.getOutgoingEdges().push(edge)
        node.layer = placed.layer + edge.delta
      } else {
        placed.getIncomingEdges().push(edge)
        node.layer = placed.layer - edge.delta
      }
      placed.invalidateConnectedEdges()

      this.graph.nodes.push(node)
    }
  }

  private initialize(): void {
    // initialize node attributes
    const numNodes = this.graph.nodes.length
    for (const n of this.graph.nodes) {
      n.treeNode = false
    }
    if (this.poID.length < numNodes) {
      this.poID = new Array(numNodes).fill(0)
    } else {
      this.poID.fill(0)
    }
    if (this.lowestPoID.length < numNodes) {
      this.lowestPoID = new Array(numNodes).fill(0)
    } else {
      this.lowestPoID.fill(0)
    }
    this.sources.length = 0

    // determine edges and re-index nodes
    let index = 0
    this.edges.length = 0
    for (const node of this.graph.nodes) {
      node.internalId = index++
      // add node to sources
      if (node.getIncomingEdges().length === 0) {
        this.sources.push(node)
      }
      const outEdges = node.getOutgoingEdges()
      for (let i = 0; i < outEdges.length; i++) {
        this.edges.push(outEdges[i]!)
      }
    }
    // re-index edges
    let counter = 0
    for (const edge of this.edges) {
      edge.internalId = counter++
      edge.treeEdge = false
    }
    // initialize edge attributes
    const numEdges = this.edges.length
    if (this.cutvalue.length < numEdges) {
      this.cutvalue = new Array(numEdges).fill(0)
    }
    if (this.edgeVisited.length < numEdges) {
      this.edgeVisited = new Uint8Array(numEdges)
    }
    this.edgeVisited.fill(0)
    // we iterate over this set, thus we have to use a linked hash set
    // to get a deterministic iteration order
    this.treeEdges = new Set()
    this.postOrder = 1
  }

  /** Determines an initial feasible spanning tree of the graph. */
  private feasibleTree(): void {
    // determine initial layering
    this.layeringTopologicalNumbering(this.sources)

    if (this.edges.length > 0) {
      this.edgeVisited.fill(0)
      while (this.tightTreeDFS(this.graph.nodes[0]!) < this.graph.nodes.length) {
        // some nodes are still not part of the tree
        const e = this.minimalSlack()
        let slack = e.getTarget().layer - e.getSource().layer - e.delta
        if (e.getTarget().treeNode) {
          slack = -slack
        }

        // update tree
        for (const node of this.graph.nodes) {
          if (node.treeNode) {
            node.layer += slack
          }
        }
        this.edgeVisited.fill(0)
      }
      // update tree-related attributes
      this.edgeVisited.fill(0)
      this.postorderTraversal(this.graph.nodes[0]!)
      this.cutvalues()
    }
  }

  /** Determines an (initial) feasible layering by a minimal topological numbering. */
  private layeringTopologicalNumbering(initialRootNodes: NNode[]): void {
    // initialize the number of incident edges for each node (只增复用)
    const numNodes = this.graph.nodes.length
    if (this.incidentCounts.length < numNodes) {
      this.incidentCounts = new Array(numNodes).fill(0)
    } else {
      this.incidentCounts.fill(0)
    }
    const incident = this.incidentCounts
    for (const node of this.graph.nodes) {
      incident[node.internalId] += node.getIncomingEdges().length
    }

    this.topologicalRoots.length = 0
    const roots = this.topologicalRoots
    for (let i = 0; i < initialRootNodes.length; i++) roots.push(initialRootNodes[i]!)
    let rootIdx = 0
    while (rootIdx < roots.length) {
      const node = roots[rootIdx++]!

      for (const edge of node.getOutgoingEdges()) {
        const target = edge.getTarget()
        target.layer = Math.max(target.layer, node.layer + edge.delta)
        incident[target.internalId]--
        if (incident[target.internalId] === 0) {
          roots.push(target)
        }
      }
    }
  }

  /** Determines the length of the currently shortest incoming or outgoing edge of the input node. */
  private minimalSpan(node: NNode): void {
    let minSpanOut = Number.MAX_SAFE_INTEGER
    let minSpanIn = Number.MAX_SAFE_INTEGER
    let currentSpan: number

    const inEdges = node.getIncomingEdges()
    for (let i = 0; i < inEdges.length; i++) {
      const edge = inEdges[i]!
      currentSpan = edge.getTarget().layer - edge.getSource().layer
      if (edge.getTarget() === node && currentSpan < minSpanIn) {
        minSpanIn = currentSpan
      } else if (currentSpan < minSpanOut) {
        minSpanOut = currentSpan
      }
    }
    const outEdges = node.getOutgoingEdges()
    for (let i = 0; i < outEdges.length; i++) {
      const edge = outEdges[i]!
      currentSpan = edge.getTarget().layer - edge.getSource().layer
      if (edge.getTarget() === node && currentSpan < minSpanIn) {
        minSpanIn = currentSpan
      } else if (currentSpan < minSpanOut) {
        minSpanOut = currentSpan
      }
    }

    this.spanIn = minSpanIn === Number.MAX_SAFE_INTEGER ? -1 : minSpanIn
    this.spanOut = minSpanOut === Number.MAX_SAFE_INTEGER ? -1 : minSpanOut
  }

  /** Determines a DFS-subtree of the graph by traversing tight edges only. */
  private tightTreeDFS(node: NNode): number {
    let nodeCount = 1
    node.treeNode = true
    // 直接迭代 incoming+outgoing (与 getConnectedEdges 缓存同序), 免合并数组
    const inEdges = node.getIncomingEdges()
    for (let i = 0; i < inEdges.length; i++) {
      const edge = inEdges[i]!
      if (!this.edgeVisited[edge.internalId]) {
        this.edgeVisited[edge.internalId] = 1
        const opposite = edge.getOther(node)
        if (edge.treeEdge) {
          // edge is a tree edge already: follow this path
          nodeCount += this.tightTreeDFS(opposite)
        } else if (!opposite.treeNode
          && edge.delta === edge.getTarget().layer - edge.getSource().layer) {
          // edge is a tight non-tree edge
          edge.treeEdge = true
          this.treeEdges.add(edge)
          nodeCount += this.tightTreeDFS(opposite)
        }
      }
    }
    const outEdges = node.getOutgoingEdges()
    for (let i = 0; i < outEdges.length; i++) {
      const edge = outEdges[i]!
      if (!this.edgeVisited[edge.internalId]) {
        this.edgeVisited[edge.internalId] = 1
        const opposite = edge.getOther(node)
        if (edge.treeEdge) {
          // edge is a tree edge already: follow this path
          nodeCount += this.tightTreeDFS(opposite)
        } else if (!opposite.treeNode
          && edge.delta === edge.getTarget().layer - edge.getSource().layer) {
          // edge is a tight non-tree edge
          edge.treeEdge = true
          this.treeEdges.add(edge)
          nodeCount += this.tightTreeDFS(opposite)
        }
      }
    }
    return nodeCount
  }

  /** Returns the non-tree edge incident on the tree with a minimal amount of slack. */
  private minimalSlack(): NEdge {
    let minSlack = Number.MAX_SAFE_INTEGER
    let minSlackEdge: NEdge | null = null
    let curSlack: number
    for (const edge of this.edges) {
      if (edge.getSource().treeNode !== edge.getTarget().treeNode) {
        // edge is non-tree edge and incident on the tree
        curSlack = edge.getTarget().layer - edge.getSource().layer - edge.delta
        if (curSlack < minSlack) {
          minSlack = curSlack
          minSlackEdge = edge
        }
      }
    }
    return minSlackEdge!
  }

  /** Performs a postorder DFS-traversal of the graph beginning with the input node. */
  private postorderTraversal(node: NNode): number {
    let lowest = Number.MAX_SAFE_INTEGER
    // 直接迭代 incoming+outgoing (与 getConnectedEdges 缓存同序), 免合并数组
    const inEdges = node.getIncomingEdges()
    for (let i = 0; i < inEdges.length; i++) {
      const edge = inEdges[i]!
      if (edge.treeEdge && !this.edgeVisited[edge.internalId]) {
        this.edgeVisited[edge.internalId] = 1
        const sub = this.postorderTraversal(edge.getOther(node))
        if (sub < lowest) lowest = sub
      }
    }
    const outEdges = node.getOutgoingEdges()
    for (let i = 0; i < outEdges.length; i++) {
      const edge = outEdges[i]!
      if (edge.treeEdge && !this.edgeVisited[edge.internalId]) {
        this.edgeVisited[edge.internalId] = 1
        const sub = this.postorderTraversal(edge.getOther(node))
        if (sub < lowest) lowest = sub
      }
    }
    this.poID[node.internalId] = this.postOrder
    const po = this.postOrder
    this.lowestPoID[node.internalId] = lowest < po ? lowest : po
    this.postOrder = po + 1
    return this.lowestPoID[node.internalId]
  }

  /** Determines, whether a node is part of the head component of the given edge. */
  private isInHead(node: NNode, edge: NEdge): boolean {
    const source = edge.getSource()
    const target = edge.getTarget()

    if (this.lowestPoID[source.internalId] <= this.poID[node.internalId]
      && this.poID[node.internalId] <= this.poID[source.internalId]
      && this.lowestPoID[target.internalId] <= this.poID[node.internalId]
      && this.poID[node.internalId] <= this.poID[target.internalId]) {
      // node is in a descending path in the DFS-Tree
      if (this.poID[source.internalId] < this.poID[target.internalId]) {
        // root is in the head component
        return false
      }
      return true
    }
    if (this.poID[source.internalId] < this.poID[target.internalId]) {
      // root is in the head component
      return true
    }
    return false
  }

  /** Determines the cut value of each tree edge. */
  private cutvalues(): void {
    // determine incident tree edges for each node (叶子队列原地复用)
    const leafs = this.cutvalueLeafs
    leafs.length = 0
    let treeEdgeCount: number
    for (const node of this.graph.nodes) {
      treeEdgeCount = 0
      const ucv = node.unknownCutvalues
      ucv.length = 0
      const inEdges = node.getIncomingEdges()
      for (let i = 0; i < inEdges.length; i++) {
        const edge = inEdges[i]!
        if (edge.treeEdge) {
          ucv.push(edge)
          treeEdgeCount++
        }
      }
      const outEdges = node.getOutgoingEdges()
      for (let i = 0; i < outEdges.length; i++) {
        const edge = outEdges[i]!
        if (edge.treeEdge) {
          ucv.push(edge)
          treeEdgeCount++
        }
      }
      if (treeEdgeCount === 1) {
        leafs.push(node)
      }
    }

    // determine cut values
    let toDetermine: NEdge
    let source: NNode
    let target: NNode
    for (let leafIdx = 0; leafIdx < leafs.length; leafIdx++) {
      let node = leafs[leafIdx]!
      while (node.unknownCutvalues.length === 1) {
        // one tree edge with undetermined cut value is incident
        toDetermine = node.unknownCutvalues[0]!
        this.cutvalue[toDetermine.internalId] = toDetermine.weight
        source = toDetermine.getSource()
        target = toDetermine.getTarget()
        const nodeInEdges = node.getIncomingEdges()
        const nodeOutEdges = node.getOutgoingEdges()
        for (let i = 0; i < nodeInEdges.length; i++) {
          const edge = nodeInEdges[i]!
          if (edge !== toDetermine) {
            if (edge.treeEdge) {
              // edge is tree edge
              if (source === edge.getSource() || target === edge.getTarget()) {
                // edge has not the same direction as toDetermine
                this.cutvalue[toDetermine.internalId] -= this.cutvalue[edge.internalId] - edge.weight
              } else {
                this.cutvalue[toDetermine.internalId] += this.cutvalue[edge.internalId] - edge.weight
              }
            } else {
              // edge is non-tree edge
              if (node === source) {
                if (edge.getSource() === node) {
                  this.cutvalue[toDetermine.internalId] += edge.weight
                } else {
                  this.cutvalue[toDetermine.internalId] -= edge.weight
                }
              } else {
                if (edge.getSource() === node) {
                  this.cutvalue[toDetermine.internalId] -= edge.weight
                } else {
                  this.cutvalue[toDetermine.internalId] += edge.weight
                }
              }
            }
          }

        }
        for (let i = 0; i < nodeOutEdges.length; i++) {
          const edge = nodeOutEdges[i]!
          if (edge !== toDetermine) {
            if (edge.treeEdge) {
              // edge is tree edge
              if (source === edge.getSource() || target === edge.getTarget()) {
                // edge has not the same direction as toDetermine
                this.cutvalue[toDetermine.internalId] -= this.cutvalue[edge.internalId] - edge.weight
              } else {
                this.cutvalue[toDetermine.internalId] += this.cutvalue[edge.internalId] - edge.weight
              }
            } else {
              // edge is non-tree edge
              if (node === source) {
                if (edge.getSource() === node) {
                  this.cutvalue[toDetermine.internalId] += edge.weight
                } else {
                  this.cutvalue[toDetermine.internalId] -= edge.weight
                }
              } else {
                if (edge.getSource() === node) {
                  this.cutvalue[toDetermine.internalId] -= edge.weight
                } else {
                  this.cutvalue[toDetermine.internalId] += edge.weight
                }
              }
            }
          }

        }
        // remove edge from 'unknownCutvalues' (swap-remove: 列表只读 length/[0], 顺序不影响结果)
        const sList = source.unknownCutvalues
        const sIdx = sList.indexOf(toDetermine)
        if (sIdx !== -1) {
          const sLast = sList.length - 1
          sList[sIdx] = sList[sLast]!
          sList.pop()
        }
        const tList = target.unknownCutvalues
        const tIdx = tList.indexOf(toDetermine)
        if (tIdx !== -1) {
          const tLast = tList.length - 1
          tList[tIdx] = tList[tLast]!
          tList.pop()
        }

        // proceed with next node
        if (source === node) {
          node = toDetermine.getTarget()
        } else {
          node = toDetermine.getSource()
        }
      }
    }
  }

  /** Returns a tree edge with a negative cut value or null, if no such edge exists. */
  private leaveEdge(): NEdge | null {
    for (const edge of this.treeEdges) {
      if (edge.treeEdge && this.cutvalue[edge.internalId] < FUZZY_ST_ZERO) {
        return edge
      }
    }
    return null
  }

  /** Determines a non-tree edge to replace the given tree edge in the spanning tree. */
  private enterEdge(leave: NEdge): NEdge {
    if (!leave.treeEdge) {
      throw new Error('The input edge is not a tree edge.')
    }

    let replace: NEdge | null = null
    let repSlack = Number.MAX_SAFE_INTEGER
    let slack: number
    for (const edge of this.edges) {
      const source = edge.getSource()
      const target = edge.getTarget()
      if (this.isInHead(source, leave) && !this.isInHead(target, leave)) {
        // edge is to consider
        slack = target.layer - source.layer - edge.delta
        if (slack < repSlack) {
          repSlack = slack
          replace = edge
        }
      }
    }
    return replace!
  }

  /** Exchanges the tree-edge leave by the non-tree edge enter and updates all values. */
  private exchange(leave: NEdge, enter: NEdge): void {
    if (!leave.treeEdge) {
      throw new Error('Given leave edge is no tree edge.')
    }
    if (enter.treeEdge) {
      throw new Error('Given enter edge is a tree edge already.')
    }

    // update tree
    leave.treeEdge = false
    this.treeEdges.delete(leave)
    enter.treeEdge = true
    this.treeEdges.add(enter)
    let delta = enter.getTarget().layer - enter.getSource().layer - enter.delta
    if (!this.isInHead(enter.getTarget(), leave)) {
      delta = -delta
    }
    for (const node of this.graph.nodes) {
      if (!this.isInHead(node, leave)) {
        node.layer += delta
      }
    }

    // update tree-based values
    this.postOrder = 1
    this.edgeVisited.fill(0)
    this.postorderTraversal(this.graph.nodes[0]!)
    this.cutvalues()
  }

  /** Normalizes the layering: the lowest layer assigned to a node will be zeroth. */
  private normalize(): number[] {
    // determine lowest assigned layer and layer count
    let highest = Number.MIN_SAFE_INTEGER
    let lowest = Number.MAX_SAFE_INTEGER
    for (const node of this.graph.nodes) {
      lowest = Math.min(lowest, node.layer)
      highest = Math.max(highest, node.layer)
    }
    // normalize and determine layer filling
    const filling = new Array(highest - lowest + 1).fill(0)
    for (const node of this.graph.nodes) {
      node.layer -= lowest
      filling[node.layer]++
    }

    // also consider nodes of already layered connected components
    let layerID = 0
    if (this.previousLayeringNodeCounts !== null) {
      for (const nodeCntInLayer of this.previousLayeringNodeCounts) {
        filling[layerID] += nodeCntInLayer
        layerID++
        if (filling.length === layerID) break
      }
    }
    return filling
  }

  /** Balances the layering concerning its width. */
  private balance(filling: number[]): void {
    // determine possible layers
    let newLayer: number
    for (const node of this.graph.nodes) {
      if (node.getIncomingEdges().length === node.getOutgoingEdges().length) {
        // node might get shifted
        newLayer = node.layer
        this.minimalSpan(node)
        for (let i = node.layer - this.spanIn + 1; i < node.layer + this.spanOut; i++) {
          if (filling[i] < filling[newLayer]) {
            newLayer = i
          }
        }
        // assign new layer
        if (filling[newLayer] < filling[node.layer]) {
          filling[node.layer]--
          filling[newLayer]++
          node.layer = newLayer
        }
      }
    }
  }
}
