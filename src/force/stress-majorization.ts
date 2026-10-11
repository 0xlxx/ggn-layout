/**
 * StressMajorization — ELK alg.force.stress.StressMajorization 0.12.0.
 * Gansner/Koren/North stress majorization: 全对最短路径 + 加权迭代收敛.
 */
import { FGraph, FNode, FEdge } from './graph.js'
import { KVector } from './kvector.js'
import { STRESS_FIXED, STRESS_DESIRED_EDGE_LENGTH, STRESS_DIMENSION, STRESS_EPSILON, STRESS_ITERATION_LIMIT, Dimension, optOf, DEFAULTS } from './options.js'

export class StressMajorization {
  private graph!: FGraph
  private apsp: number[][] = []
  private w: number[][] = []
  private desiredEdgeLength = DEFAULTS[STRESS_DESIRED_EDGE_LENGTH]
  private dim: Dimension = Dimension.XY
  private epsilon = DEFAULTS[STRESS_EPSILON]
  private iterationLimit = DEFAULTS[STRESS_ITERATION_LIMIT]
  private connectedEdges = new Map<FNode, FEdge[]>()

  initialize(fgraph: FGraph): void {
    if (fgraph.getNodes().length <= 1) return
    this.graph = fgraph

    this.dim = optOf(fgraph, STRESS_DIMENSION, DEFAULTS[STRESS_DIMENSION]) as Dimension
    this.iterationLimit = optOf(fgraph, STRESS_ITERATION_LIMIT, DEFAULTS[STRESS_ITERATION_LIMIT])
    this.epsilon = optOf(fgraph, STRESS_EPSILON, DEFAULTS[STRESS_EPSILON])
    this.desiredEdgeLength = optOf(fgraph, STRESS_DESIRED_EDGE_LENGTH, DEFAULTS[STRESS_DESIRED_EDGE_LENGTH])

    this.connectedEdges.clear()
    for (const edge of fgraph.getEdges()) {
      const s = edge.getSource()
      const t = edge.getTarget()
      if (!this.connectedEdges.has(s)) this.connectedEdges.set(s, [])
      if (!this.connectedEdges.has(t)) this.connectedEdges.set(t, [])
      this.connectedEdges.get(s)!.push(edge)
      this.connectedEdges.get(t)!.push(edge)
    }

    const n = fgraph.getNodes().length
    this.apsp = Array.from({ length: n }, () => new Array<number>(n).fill(0))
    for (const source of fgraph.getNodes()) {
      this.dijkstra(source, this.apsp[source.id])
    }

    this.w = Array.from({ length: n }, () => new Array<number>(n).fill(0))
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const dij = this.apsp[i][j]
        this.w[i][j] = 1 / (dij * dij)
      }
    }
  }

  execute(): void {
    if (this.graph.getNodes().length <= 1) return
    let count = 0
    let prevStress = this.computeStress()
    let curStress = Number.POSITIVE_INFINITY
    do {
      if (count > 0) prevStress = curStress
      for (const u of this.graph.getNodes()) {
        if (optOf(u, STRESS_FIXED, DEFAULTS[STRESS_FIXED])) continue
        const newPos = this.computeNewPosition(u)
        u.getPosition().reset().add(newPos)
      }
      curStress = this.computeStress()
    } while (!this.done(count++, prevStress, curStress))
  }

  private dijkstra(source: FNode, dist: number[]): void {
    const nodes = new Set<FNode>()
    const marked = new Set<FNode>()
    dist[source.id] = 0
    for (const n of this.graph.getNodes()) {
      if (n.id !== source.id) dist[n.id] = Number.MAX_SAFE_INTEGER
      nodes.add(n)
    }
    while (nodes.size > 0) {
      let u: FNode | null = null
      let best = Infinity
      for (const n of nodes) {
        if (dist[n.id] < best) {
          best = dist[n.id]
          u = n
        }
      }
      if (u === null) break
      nodes.delete(u)
      marked.add(u)
      for (const e of this.connectedEdges.get(u) ?? []) {
        const v = this.getOther(e, u)
        if (marked.has(v)) continue
        const el = e.hasProperty(STRESS_DESIRED_EDGE_LENGTH)
          ? e.getProperty<number>(STRESS_DESIRED_EDGE_LENGTH)
          : this.desiredEdgeLength
        const d = dist[u.id] + el
        if (d < dist[v.id]) dist[v.id] = d
      }
    }
  }

  private done(count: number, prevStress: number, curStress: number): boolean {
    return prevStress === 0 || (prevStress - curStress) / prevStress < this.epsilon || count >= this.iterationLimit
  }

  private computeStress(): number {
    let stress = 0
    const nodes = this.graph.getNodes()
    for (let i = 0; i < nodes.length; i++) {
      const u = nodes[i]
      for (let j = i + 1; j < nodes.length; j++) {
        const v = nodes[j]
        const eucDist = u.getPosition().distance(v.getPosition())
        const eucDisplacement = eucDist - this.apsp[u.id][v.id]
        stress += this.w[u.id][v.id] * eucDisplacement * eucDisplacement
      }
    }
    return stress
  }

  private computeNewPosition(u: FNode): KVector {
    let weightSum = 0
    let xDisp = 0
    let yDisp = 0
    for (const v of this.graph.getNodes()) {
      if (u === v) continue
      const wij = this.w[u.id][v.id]
      weightSum += wij
      const eucDist = u.getPosition().distance(v.getPosition())
      if (eucDist > 0 && this.dim !== Dimension.Y) {
        xDisp += wij * (v.getPosition().x + (this.apsp[u.id][v.id] * (u.getPosition().x - v.getPosition().x)) / eucDist)
      }
      if (eucDist > 0 && this.dim !== Dimension.X) {
        yDisp += wij * (v.getPosition().y + (this.apsp[u.id][v.id] * (u.getPosition().y - v.getPosition().y)) / eucDist)
      }
    }
    switch (this.dim) {
      case Dimension.X:
        return new KVector(xDisp / weightSum, u.getPosition().y)
      case Dimension.Y:
        return new KVector(u.getPosition().x, yDisp / weightSum)
      default:
        return new KVector(xDisp / weightSum, yDisp / weightSum)
    }
  }

  private getOther(edge: FEdge, one: FNode): FNode {
    if (edge.getSource() === one) return edge.getTarget()
    if (edge.getTarget() === one) return edge.getSource()
    throw new Error("Node 'one' must be either source or target of edge 'edge'.")
  }
}
