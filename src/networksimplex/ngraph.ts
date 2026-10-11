/**
 * NGraph (对应 ELK networksimplex.NGraph).
 */
import { NNode, nn } from './nnode.js'
import { NEdge } from './nedge.js'
import { ne } from './nedge.js'

export class NGraph {
  nodes: NNode[] = []

  /** 直接构造节点 (免 nn() builder 对象分配) — 语义与 nn().origin(origin).create(this) 等价. */
  addNode(origin: unknown): NNode {
    const node = new NNode()
    node.origin = origin
    this.nodes.push(node)
    return node
  }

  /** 直接构造边 (免 ne() builder 对象分配) — 语义与 ne().origin(o).weight(w).delta(d).source(s).target(t).create() 等价. */
  addEdge(origin: unknown, weight: number, delta: number, source: NNode, target: NNode): NEdge {
    if (source === target) {
      throw new Error('Network simplex does not support self-loops')
    }
    const edge = new NEdge()
    edge.origin = origin
    edge.weight = weight
    edge.delta = delta
    edge.source = source
    edge.target = target
    edge.source.getOutgoingEdges().push(edge)
    edge.target.getIncomingEdges().push(edge)
    edge.source.invalidateConnectedEdges()
    edge.target.invalidateConnectedEdges()
    return edge
  }

  /** Creates and returns a new NNode and connects the passed nodes to the new node with zero-weight, zero-delta edges. */
  private createArtificialRootAndConnect(nodesToConnect: NNode[]): NNode {
    const root = nn().create(this)
    for (const src of nodesToConnect) {
      ne().delta(0).weight(0).source(root).target(src).create()
    }
    return root
  }

  /** Identifies and returns one representative NNode per connected component. */
  private findConCompRepresentatives(): NNode[] {
    const ccRep: NNode[] = []
    const mark = new Array(this.nodes.length).fill(false)
    for (const node of this.nodes) {
      if (!mark[node.internalId]) {
        ccRep.push(node)
        this.dfs(node, mark)
      }
    }
    return ccRep
  }

  private dfs(node: NNode, mark: boolean[]): void {
    if (mark[node.internalId]) return
    mark[node.internalId] = true
    for (const edge of node.getConnectedEdges()) {
      this.dfs(edge.getOther(node), mark)
    }
  }

  /** 连接所有连通分量到一个人工根 (对应 ELK NGraph.makeConnected), 返回根或 null. */
  makeConnected(): NNode | null {
    let id = 0
    for (const n of this.nodes) n.internalId = id++
    const ccRep = this.findConCompRepresentatives()
    let root: NNode | null = null
    if (ccRep.length > 1) {
      root = this.createArtificialRootAndConnect(ccRep)
    }
    return root
  }

  /** Creates a topological ordering and checks for back edges. */
  isAcyclic(): boolean {
    let id = 0
    for (const n of this.nodes) n.internalId = id++

    const incident = new Array(this.nodes.length).fill(0)
    const layer = new Array(this.nodes.length).fill(0)
    for (const node of this.nodes) {
      incident[node.internalId] += node.getIncomingEdges().length
    }

    const roots: NNode[] = []
    for (const node of this.nodes) {
      if (node.getIncomingEdges().length === 0) roots.push(node)
    }
    if (roots.length === 0 && this.nodes.length > 0) return false
    while (roots.length > 0) {
      const node = roots.shift()!
      for (const edge of node.getOutgoingEdges()) {
        const target = edge.getTarget()
        layer[target.internalId] = Math.max(layer[target.internalId], layer[node.internalId] + 1)
        incident[target.internalId]--
        if (incident[target.internalId] === 0) roots.push(target)
      }
    }

    // check for backward edges
    for (const node of this.nodes) {
      for (const edge of node.getOutgoingEdges()) {
        if (layer[edge.target.internalId] <= layer[edge.source.internalId]) return false
      }
    }
    return true
  }
}
