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
 * HyperEdgeCycleDetector (对应 ELK p5edges.orthogonal.HyperEdgeCycleDetector, 自环路由所需子集).
 */
import type { JavaRandom } from '../../util/java-random.js'
import { DependencyType, type HyperEdgeSegmentDependency } from './hyper-edge-segment-dependency.js'
import type { HyperEdgeSegment } from './hyper-edge-segment.js'

export class HyperEdgeCycleDetector {
  /** 找出反转/移除后可让依赖图无环的依赖集合 (criticalOnly 只看 critical 依赖). */
  static detectCycles(segments: HyperEdgeSegment[], criticalOnly: boolean, random: JavaRandom): HyperEdgeSegmentDependency[] {
    const result: HyperEdgeSegmentDependency[] = []
    const sources: HyperEdgeSegment[] = []
    const sinks: HyperEdgeSegment[] = []

    initialize(segments, sources, sinks, criticalOnly)
    computeLinearOrderingMarks(segments, sources, sinks, criticalOnly, random)

    for (const source of segments) {
      for (const outDependency of source.getOutgoingSegmentDependencies()) {
        if (!criticalOnly || outDependency.getType() === DependencyType.CRITICAL) {
          if (source.mark > outDependency.getTarget()!.mark) {
            result.push(outDependency)
          }
        }
      }
    }
    return result
  }
}

function initialize(segments: HyperEdgeSegment[], sources: HyperEdgeSegment[], sinks: HyperEdgeSegment[], criticalOnly: boolean): void {
  let nextMark = -1
  for (const segment of segments) {
    segment.mark = nextMark--

    let criticalInWeight = 0
    for (const dep of segment.getIncomingSegmentDependencies()) {
      if (dep.getType() === DependencyType.CRITICAL) criticalInWeight += dep.getWeight()
    }
    let criticalOutWeight = 0
    for (const dep of segment.getOutgoingSegmentDependencies()) {
      if (dep.getType() === DependencyType.CRITICAL) criticalOutWeight += dep.getWeight()
    }

    let inWeight = criticalInWeight
    let outWeight = criticalOutWeight
    if (!criticalOnly) {
      inWeight = 0
      for (const dep of segment.getIncomingSegmentDependencies()) inWeight += dep.getWeight()
      outWeight = 0
      for (const dep of segment.getOutgoingSegmentDependencies()) outWeight += dep.getWeight()
    }

    segment.setInWeight(inWeight)
    segment.setCriticalInWeight(criticalInWeight)
    segment.setOutWeight(outWeight)
    segment.setCriticalOutWeight(criticalOutWeight)

    if (outWeight === 0) {
      sinks.push(segment)
    } else if (inWeight === 0) {
      sources.push(segment)
    }
  }
}

function computeLinearOrderingMarks(
  segments: HyperEdgeSegment[], sources: HyperEdgeSegment[], sinks: HyperEdgeSegment[],
  criticalOnly: boolean, random: JavaRandom,
): void {
  // 免分配: unprocessed 不再用 Set (initialize 后 mark 为 -1,-2,... 严格降序; 处理过的段 mark ≥ 0),
  // 每轮用 ordered 复用数组按「mark 升序 = 段逆序」过滤, 与 ELK TreeSet (mark 升序) 迭代序一致.
  const ordered: HyperEdgeSegment[] = []
  const maxSegments: HyperEdgeSegment[] = []

  const markBase = segments.length
  let nextSinkMark = markBase - 1
  let nextSourceMark = markBase + 1

  for (;;) {
    // 队列用头指针 (FIFO 语义与 shift 一致, 免 O(n) 平移).
    let sinkIdx = 0
    while (sinkIdx < sinks.length) {
      const sink = sinks[sinkIdx++]!
      sink.mark = nextSinkMark--
      updateNeighbors(sink, sources, sinks, criticalOnly)
    }
    sinks.length = 0
    let sourceIdx = 0
    while (sourceIdx < sources.length) {
      const source = sources[sourceIdx++]!
      source.mark = nextSourceMark++
      updateNeighbors(source, sources, sinks, criticalOnly)
    }
    sources.length = 0

    ordered.length = 0
    for (let i = segments.length - 1; i >= 0; i--) {
      const segment = segments[i]!
      if (segment.mark < 0) ordered.push(segment)
    }
    if (ordered.length === 0) break

    let maxOutflow = Number.MIN_SAFE_INTEGER
    maxSegments.length = 0
    // ELK unprocessed 是 TreeSet (按 mark 升序); mark 严格升序 = 段逆序 (initialize 赋 mark -1,-2,...).
    for (const segment of ordered) {
      if (!criticalOnly && segment.getCriticalOutWeight() > 0 && segment.getCriticalInWeight() <= 0) {
        maxSegments.length = 0
        maxSegments.push(segment)
        break
      }
      const outflow = segment.getOutWeight() - segment.getInWeight()
      if (outflow >= maxOutflow) {
        if (outflow > maxOutflow) {
          maxSegments.length = 0
          maxOutflow = outflow
        }
        maxSegments.push(segment)
      }
    }

    if (maxSegments.length > 0) {
      const maxNode = maxSegments[random.nextInt(maxSegments.length)]!
      maxNode.mark = nextSourceMark++
      updateNeighbors(maxNode, sources, sinks, criticalOnly)
    }
  }

  const shiftBase = segments.length + 1
  for (const node of segments) {
    if (node.mark < markBase) {
      node.mark += shiftBase
    }
  }
}

function updateNeighbors(
  node: HyperEdgeSegment, sources: HyperEdgeSegment[], sinks: HyperEdgeSegment[], criticalOnly: boolean,
): void {
  for (const dep of node.getOutgoingSegmentDependencies()) {
    if (!criticalOnly || dep.getType() === DependencyType.CRITICAL) {
      const target = dep.getTarget()!
      if (target.mark < 0 && dep.getWeight() > 0) {
        target.setInWeight(target.getInWeight() - dep.getWeight())
        if (dep.getType() === DependencyType.CRITICAL) {
          target.setCriticalInWeight(target.getCriticalInWeight() - dep.getWeight())
        }
        if (target.getInWeight() <= 0 && target.getOutWeight() > 0) {
          sources.push(target)
        }
      }
    }
  }

  for (const dep of node.getIncomingSegmentDependencies()) {
    if (!criticalOnly || dep.getType() === DependencyType.CRITICAL) {
      const source = dep.getSource()!
      if (source.mark < 0 && dep.getWeight() > 0) {
        source.setOutWeight(source.getOutWeight() - dep.getWeight())
        if (dep.getType() === DependencyType.CRITICAL) {
          source.setCriticalOutWeight(source.getCriticalOutWeight() - dep.getWeight())
        }
        if (source.getOutWeight() <= 0 && source.getInWeight() > 0) {
          sinks.push(source)
        }
      }
    }
  }
}
