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
 * force/stress 图结构 (ELK alg.force.graph 0.12.0).
 * FGraph/FNode/FEdge/FLabel/FBendpoint/FParticle 逐符号移植.
 */
import { MapPropertyHolder } from '../graph/properties.js'
import { KVector, clipVector } from './kvector.js'
import { PRIORITY, SPACING_EDGE_LABEL, EDGE_LABELS_INLINE, optOf, DEFAULTS } from './options.js'
import type { JavaRandom } from '../util/java-random.js'

/** 粒子 (节点/标签/弯点共用): 位置/尺寸/位移. */
export class FParticle extends MapPropertyHolder {
  displacement = new KVector()
  position = new KVector()
  size = new KVector()

  getPosition(): KVector {
    return this.position
  }

  getSize(): KVector {
    return this.size
  }

  getRadius(): number {
    return this.size.length() / 2
  }

  getDisplacement(): KVector {
    return this.displacement
  }
}

/** 力导向节点. */
export class FNode extends FParticle {
  id = 0
  private label: string
  private parent: FNode | null
  private children: FNode[] | null = null

  constructor(label = '', parent: FNode | null = null) {
    super()
    this.label = label
    this.parent = parent
  }

  isCompound(): boolean {
    return this.children !== null && this.children.length > 0
  }

  getLabel(): string {
    return this.label
  }

  getParent(): FNode | null {
    return this.parent
  }

  getChildren(): FNode[] {
    if (this.children === null) this.children = []
    return this.children
  }

  getDepth(): number {
    return this.parent === null ? 0 : this.parent.getDepth() + 1
  }
}

/** 力导向边. */
export class FEdge extends MapPropertyHolder {
  bendpoints: FBendpoint[] = []
  labels: FLabel[] = []
  source: FNode | null = null
  target: FNode | null = null

  getSource(): FNode {
    return this.source!
  }

  getTarget(): FNode {
    return this.target!
  }

  setSource(n: FNode): void {
    this.source = n
  }

  setTarget(n: FNode): void {
    this.target = n
  }

  getBendpoints(): FBendpoint[] {
    return this.bendpoints
  }

  getLabels(): FLabel[] {
    return this.labels
  }

  /** 源边界锚点 (目标方向向量裁剪到源节点尺寸内). */
  getSourcePoint(): KVector {
    const v = this.getTarget().getPosition().clone().sub(this.getSource().getPosition())
    clipVector(v, this.getSource().getSize().x, this.getSource().getSize().y)
    return v.add(this.getSource().getPosition())
  }

  /** 目标边界锚点. */
  getTargetPoint(): KVector {
    const v = this.getSource().getPosition().clone().sub(this.getTarget().getPosition())
    clipVector(v, this.getTarget().getSize().x, this.getTarget().getSize().y)
    return v.add(this.getTarget().getPosition())
  }

  /** 弯点等距分布 (ELK distributeBendpoints). */
  distributeBendpoints(): void {
    const count = this.bendpoints.length
    if (count > 0) {
      const sourcePos = this.getSource().getPosition()
      const targetPos = this.getTarget().getPosition()
      const incr = targetPos.clone().sub(sourcePos).scale(1 / (count + 1))
      const pos = sourcePos.clone()
      for (const bp of this.bendpoints) {
        bp.getPosition().x = pos.x + incr.x
        bp.getPosition().y = pos.y + incr.y
        pos.add(incr)
      }
    }
  }
}

/** 边标签. */
export class FLabel extends FParticle {
  edge: FEdge
  text: string

  constructor(fedge: FEdge, text: string) {
    super()
    this.edge = fedge
    this.text = text
    fedge.getLabels().push(this)
  }

  getText(): string {
    return this.text
  }

  getEdge(): FEdge {
    return this.edge
  }

  /** ELK FLabel.refreshPosition: 边标签居中/偏置放置. */
  refreshPosition(): void {
    const placeInline = optOf(this, EDGE_LABELS_INLINE, DEFAULTS[EDGE_LABELS_INLINE])
    const src = this.edge.getSource().getPosition()
    const tgt = this.edge.getTarget().getPosition()
    if (placeInline) {
      const srcToTgt = tgt.clone().sub(src).scale(0.5)
      const toLabelCenter = this.getSize().clone().scale(0.5)
      const newLabelPosition = src.clone().add(srcToTgt).sub(toLabelCenter)
      this.getPosition().set(newLabelPosition)
    } else {
      const spacing = optOf(this.edge, SPACING_EDGE_LABEL, DEFAULTS[SPACING_EDGE_LABEL])
      const pos = this.getPosition()
      if (src.x >= tgt.x) {
        if (src.y >= tgt.y) {
          pos.x = tgt.x + (src.x - tgt.x) / 2 + spacing
          pos.y = tgt.y + (src.y - tgt.y) / 2 - spacing - this.getSize().y
        } else {
          pos.x = tgt.x + (src.x - tgt.x) / 2 + spacing
          pos.y = src.y + (tgt.y - src.y) / 2 + spacing
        }
      } else {
        if (src.y >= tgt.y) {
          pos.x = src.x + (tgt.x - src.x) / 2 + spacing
          pos.y = tgt.y + (src.y - tgt.y) / 2 + spacing
        } else {
          pos.x = src.x + (tgt.x - src.x) / 2 + spacing
          pos.y = src.y + (tgt.y - src.y) / 2 - spacing - this.getSize().y
        }
      }
    }
  }
}

/** 边弯点. */
export class FBendpoint extends FParticle {
  edge: FEdge

  constructor(edge: FEdge) {
    super()
    this.edge = edge
    edge.getBendpoints().push(this)
  }

  getEdge(): FEdge {
    return this.edge
  }
}

/** 力导向图. */
export class FGraph extends MapPropertyHolder {
  nodes: FNode[] = []
  edges: FEdge[] = []
  labels: FLabel[] = []
  bendpoints: FBendpoint[] = []
  adjacency: number[][] | null = null

  getNodes(): FNode[] {
    return this.nodes
  }

  getEdges(): FEdge[] {
    return this.edges
  }

  getLabels(): FLabel[] {
    return this.labels
  }

  getBendpoints(): FBendpoint[] {
    return this.bendpoints
  }

  getParticles(): FParticle[] {
    return [...this.nodes, ...this.labels, ...this.bendpoints]
  }

  /** 两粒子连接强度 (考虑 edge priority). */
  getConnection(p1: FParticle, p2: FParticle): number {
    if (p1 instanceof FNode && p2 instanceof FNode) {
      const n1 = p1 as FNode
      const n2 = p2 as FNode
      return (this.adjacency?.[n1.id]?.[n2.id] ?? 0) + (this.adjacency?.[n2.id]?.[n1.id] ?? 0)
    } else if (p1 instanceof FBendpoint && p2 instanceof FBendpoint) {
      const b1 = p1 as FBendpoint
      const b2 = p2 as FBendpoint
      if (b1.getEdge() === b2.getEdge()) {
        return optOf(b2.getEdge(), PRIORITY, DEFAULTS[PRIORITY])
      }
    }
    return 0
  }

  /** 邻接矩阵 (edge priority 累计). */
  calcAdjacency(): void {
    const n = this.nodes.length
    this.adjacency = Array.from({ length: n }, () => new Array<number>(n).fill(0))
    for (const edge of this.edges) {
      this.adjacency[edge.getSource().id][edge.getTarget().id] += optOf(edge, PRIORITY, DEFAULTS[PRIORITY])
    }
  }
}

export type { JavaRandom }
