/**
 * force 布局模型 (ELK alg.force.model 0.12.0).
 * AbstractForceModel + EadesModel + FruchtermanReingoldModel.
 */
import { FGraph, FNode, FEdge, FLabel, FBendpoint, FParticle } from './graph.js'
import { KVector } from './kvector.js'
import { FORCE_ITERATIONS, FORCE_REPULSIVE_POWER, FORCE_TEMPERATURE, FORCE_REPULSION, SPACING_NODE_NODE, INTERACTIVE, PRIORITY, ForceModelStrategy, optOf, DEFAULTS } from './options.js'
import { RANDOM } from './internal-properties.js'
import type { JavaRandom } from '../util/java-random.js'

const DISP_BOUND_FACTOR = 16

/** 力模型基类: 随机初始坐标 + 迭代位移. */
export abstract class AbstractForceModel {
  protected random!: JavaRandom
  protected graph!: FGraph
  private dispBound = 0

  protected initialize(fgraph: FGraph): void {
    this.graph = fgraph
    this.random = fgraph.getProperty<JavaRandom>(RANDOM)

    fgraph.calcAdjacency()

    this.dispBound = Math.max(
      fgraph.getNodes().length * DISP_BOUND_FACTOR + fgraph.getEdges().length,
      DISP_BOUND_FACTOR * DISP_BOUND_FACTOR,
    )

    if (!optOf(fgraph, INTERACTIVE, DEFAULTS[INTERACTIVE])) {
      const posScale = fgraph.getNodes().length
      for (const node of fgraph.getNodes()) {
        const pos = node.getPosition()
        pos.x = this.random.nextDouble() * posScale
        pos.y = this.random.nextDouble() * posScale
      }
    }

    const bends = fgraph.getBendpoints()
    for (const edge of fgraph.getEdges()) {
      const count = optOf(edge, FORCE_REPULSIVE_POWER, DEFAULTS[FORCE_REPULSIVE_POWER])
      if (count > 0) {
        for (let i = 0; i < count; i++) bends.push(new FBendpoint(edge))
        edge.distributeBendpoints()
      }
    }
  }

  getGraph(): FGraph {
    return this.graph
  }

  protected getRandom(): JavaRandom {
    return this.random
  }

  layout(fgraph: FGraph): void {
    this.initialize(fgraph)
    let iterations = 0
    while (this.moreIterations(iterations)) {
      this.iterationDone()
      for (const v of fgraph.getParticles()) {
        for (const u of fgraph.getParticles()) {
          if (u !== v) {
            const displacement = this.calcDisplacement(u, v)
            if (displacement !== null) v.getDisplacement().add(displacement)
          }
        }
      }
      for (const v of fgraph.getParticles()) {
        const d = v.getDisplacement()
        d.bound(-this.dispBound, -this.dispBound, this.dispBound, this.dispBound)
        v.getPosition().add(d)
        d.reset()
      }
      iterations++
    }
  }

  protected iterationDone(): void {
    for (const edge of this.graph.getEdges()) {
      for (const label of edge.getLabels()) label.refreshPosition()
      edge.distributeBendpoints()
    }
  }

  protected abstract moreIterations(count: number): boolean
  protected abstract calcDisplacement(forcer: FParticle, forcee: FParticle): KVector | null

  static avoidSamePosition(random: JavaRandom, u: FParticle, v: FParticle): void {
    const pu = u.getPosition()
    const pv = v.getPosition()
    while (pu.x - pv.x === 0 && pu.y - pv.y === 0) {
      if (u instanceof FBendpoint && v instanceof FBendpoint) {
        const uE = (u as FBendpoint).getEdge()
        const uVector = uE.getTargetPoint().clone().sub(uE.getSourcePoint())
        const length = 2
        const orthogonaluV = new KVector((uVector.x / uVector.length()) * length, (-uVector.y / uVector.length()) * length)
        pu.add(orthogonaluV)
        const vE = (v as FBendpoint).getEdge()
        const vVector = vE.getTargetPoint().clone().sub(vE.getSourcePoint())
        const len2 = uVector === vVector ? -2 : 2
        const orthogonalvV = new KVector((vVector.x / vVector.length()) * len2, (-vVector.y / vVector.length()) * len2)
        pu.add(orthogonalvV)
      } else {
        pu.wiggle(random, 1)
        pv.wiggle(random, 1)
      }
    }
  }
}

/** Eades 模型. */
export class EadesModel extends AbstractForceModel {
  private static readonly ZERO_FACTOR = 100

  private maxIterations = DEFAULTS[FORCE_ITERATIONS]
  private springLength = DEFAULTS[SPACING_NODE_NODE]
  private repulsionFactor = DEFAULTS[FORCE_REPULSION]

  protected override initialize(graph: FGraph): void {
    super.initialize(graph)
    this.maxIterations = optOf(graph, FORCE_ITERATIONS, DEFAULTS[FORCE_ITERATIONS])
    this.springLength = optOf(graph, SPACING_NODE_NODE, DEFAULTS[SPACING_NODE_NODE])
    this.repulsionFactor = optOf(graph, FORCE_REPULSION, DEFAULTS[FORCE_REPULSION])
  }

  protected moreIterations(count: number): boolean {
    return count < this.maxIterations
  }

  protected calcDisplacement(forcer: FParticle, forcee: FParticle): KVector {
    AbstractForceModel.avoidSamePosition(this.getRandom(), forcer, forcee)
    const displacement = forcee.getPosition().clone().sub(forcer.getPosition())
    const length = displacement.length()
    const d = Math.max(0, length - forcer.getRadius() - forcee.getRadius())
    let force: number
    const connection = this.getGraph().getConnection(forcer, forcee)
    if (connection > 0) {
      force = -EadesModel.attractive(d, this.springLength) * connection
    } else {
      force = EadesModel.repulsive(d, this.repulsionFactor) * optOf(forcer, PRIORITY, DEFAULTS[PRIORITY])
    }
    displacement.scale(force / length)
    return displacement
  }

  private static repulsive(d: number, r: number): number {
    return d > 0 ? r / (d * d) : r * EadesModel.ZERO_FACTOR
  }

  static attractive(d: number, s: number): number {
    return d > 0 ? Math.log(d / s) : -EadesModel.ZERO_FACTOR
  }
}

/** Fruchterman-Reingold 模型. */
export class FruchtermanReingoldModel extends AbstractForceModel {
  private static readonly SPACING_FACTOR = 0.01
  private static readonly ZERO_FACTOR = 100

  private temperature = DEFAULTS[FORCE_TEMPERATURE]
  private threshold = 0
  private k = 0

  protected override initialize(graph: FGraph): void {
    super.initialize(graph)
    this.temperature = optOf(graph, FORCE_TEMPERATURE, DEFAULTS[FORCE_TEMPERATURE])
    this.threshold = this.temperature / optOf(graph, FORCE_ITERATIONS, DEFAULTS[FORCE_ITERATIONS])
    const n = graph.getNodes().length
    let totalWidth = 0
    let totalHeight = 0
    for (const v of graph.getNodes()) {
      totalWidth += v.getSize().x
      totalHeight += v.getSize().y
    }
    const area = totalWidth * totalHeight
    const c = optOf(graph, SPACING_NODE_NODE, DEFAULTS[SPACING_NODE_NODE]) * FruchtermanReingoldModel.SPACING_FACTOR
    this.k = Math.sqrt(area / (2 * n)) * c
  }

  protected moreIterations(): boolean {
    return this.temperature > 0
  }

  protected calcDisplacement(forcer: FParticle, forcee: FParticle): KVector {
    AbstractForceModel.avoidSamePosition(this.getRandom(), forcer, forcee)
    const displacement = forcee.getPosition().clone().sub(forcer.getPosition())
    const length = displacement.length()
    const d = Math.max(0, length - forcer.getRadius() - forcee.getRadius())
    let force = FruchtermanReingoldModel.repulsive(d, this.k) * optOf(forcer, PRIORITY, DEFAULTS[PRIORITY])
    const connection = this.getGraph().getConnection(forcer, forcee)
    if (connection > 0) {
      force -= FruchtermanReingoldModel.attractive(d, this.k) * connection
    }
    displacement.scale((force * this.temperature) / length)
    return displacement
  }

  protected override iterationDone(): void {
    super.iterationDone()
    this.temperature -= this.threshold
  }

  private static repulsive(d: number, k: number): number {
    return d > 0 ? (k * k) / d : k * k * FruchtermanReingoldModel.ZERO_FACTOR
  }

  static attractive(d: number, k: number): number {
    return (d * d) / k
  }
}

/** 按策略创建力模型 (ELK ForceLayoutProvider.updateModel). */
export function createForceModel(strategy: ForceModelStrategy): AbstractForceModel {
  switch (strategy) {
    case ForceModelStrategy.EADES:
      return new EadesModel()
    case ForceModelStrategy.FRUCHTERMAN_REINGOLD:
    default:
      return new FruchtermanReingoldModel()
  }
}

export type { FNode, FEdge, FLabel }
