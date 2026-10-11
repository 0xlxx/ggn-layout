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
 * HyperEdgeSegmentDependency (对应 ELK p5edges.orthogonal.HyperEdgeSegmentDependency).
 */
import type { HyperEdgeSegment } from './hyper-edge-segment.js'

export enum DependencyType { REGULAR, CRITICAL }

export class HyperEdgeSegmentDependency {
  static readonly CRITICAL_DEPENDENCY_WEIGHT = 1
  private readonly type: DependencyType
  private source: HyperEdgeSegment | null = null
  private target: HyperEdgeSegment | null = null
  private readonly weight: number

  private constructor(type: DependencyType, source: HyperEdgeSegment, target: HyperEdgeSegment, weight: number) {
    this.type = type
    this.weight = weight
    this.setSource(source)
    this.setTarget(target)
  }

  static createAndAddRegular(source: HyperEdgeSegment, target: HyperEdgeSegment, weight: number): HyperEdgeSegmentDependency {
    return new HyperEdgeSegmentDependency(DependencyType.REGULAR, source, target, weight)
  }

  static createAndAddCritical(source: HyperEdgeSegment, target: HyperEdgeSegment): HyperEdgeSegmentDependency {
    return new HyperEdgeSegmentDependency(DependencyType.CRITICAL, source, target, HyperEdgeSegmentDependency.CRITICAL_DEPENDENCY_WEIGHT)
  }

  remove(): void {
    this.setSource(null)
    this.setTarget(null)
  }

  reverse(): void {
    const oldSource = this.source
    const oldTarget = this.target
    this.setSource(oldTarget)
    this.setTarget(oldSource)
  }

  getType(): DependencyType { return this.type }
  getSource(): HyperEdgeSegment | null { return this.source }
  getTarget(): HyperEdgeSegment | null { return this.target }
  getWeight(): number { return this.weight }

  private setSource(newSource: HyperEdgeSegment | null): void {
    if (this.source !== null) {
      const list = this.source.getOutgoingSegmentDependencies()
      const idx = list.indexOf(this)
      if (idx !== -1) list.splice(idx, 1)
    }
    this.source = newSource
    if (this.source !== null) this.source.getOutgoingSegmentDependencies().push(this)
  }

  private setTarget(newTarget: HyperEdgeSegment | null): void {
    if (this.target !== null) {
      const list = this.target.getIncomingSegmentDependencies()
      const idx = list.indexOf(this)
      if (idx !== -1) list.splice(idx, 1)
    }
    this.target = newTarget
    if (this.target !== null) this.target.getIncomingSegmentDependencies().push(this)
  }
}
