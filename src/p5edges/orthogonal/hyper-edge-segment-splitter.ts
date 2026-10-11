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
 * HyperEdgeSegmentSplitter (对应 ELK p5edges.orthogonal.HyperEdgeSegmentSplitter).
 * 拆分 critical 依赖环中的 hyperedge segment, 消除重叠 (S 形弯点).
 *
 * 现代 TS: 模块级纯函数 + 类字段, 无 Java 样板. 仅依赖 HyperEdgeSegment / Dependency / countCrossings.
 */
import type { HyperEdgeSegment } from './hyper-edge-segment.js'
import { HyperEdgeSegmentDependency } from './hyper-edge-segment-dependency.js'
import { countCrossings } from './orthogonal-routing-generator.js'

/** 两个水平段之间的可用空隙 (可容纳新的水平连接段). */
class FreeArea {
  readonly startPosition: number
  readonly endPosition: number
  readonly size: number
  constructor(start: number, end: number) {
    this.startPosition = start
    this.endPosition = end
    this.size = end - start
  }
}

/** 用某 area 连接 split 两段会产生的依赖/交叉数. */
class AreaRating {
  dependencies = 0
  crossings = 0
}

/**
 * 收集所有相邻连接坐标之间足够大的空隙 (≥2×criticalConflictThreshold).
 * 对应 ELK findFreeAreas.
 */
function findFreeAreas(segments: HyperEdgeSegment[], criticalConflictThreshold: number): FreeArea[] {
  const coords: number[] = []
  for (const s of segments) {
    coords.push(...s.getIncomingConnectionCoordinates(), ...s.getOutgoingConnectionCoordinates())
  }
  coords.sort((a, b) => a - b)
  const freeAreas: FreeArea[] = []
  for (let i = 1; i < coords.length; i++) {
    if (coords[i]! - coords[i - 1]! >= 2 * criticalConflictThreshold) {
      freeAreas.push(new FreeArea(coords[i - 1]! + criticalConflictThreshold, coords[i]! - criticalConflictThreshold))
    }
  }
  return freeAreas
}

/**
 * 决定每个依赖拆哪个段 (ELK decideWhichSegmentsToSplit): 偏好拆普通边, 保留超边.
 */
function decideWhichSegmentsToSplit(dependencies: HyperEdgeSegmentDependency[]): Set<HyperEdgeSegment> {
  const segmentsToSplit = new Set<HyperEdgeSegment>()
  for (const dependency of dependencies) {
    const source = dependency.getSource()
    const target = dependency.getTarget()
    if (source === null || target === null) continue
    if (segmentsToSplit.has(source) || segmentsToSplit.has(target)) continue
    let segmentToSplit = source
    let segmentCausingSplit = target
    if (source.representsHyperedge() && !target.representsHyperedge()) {
      segmentToSplit = target
      segmentCausingSplit = source
    }
    segmentsToSplit.add(segmentToSplit)
    segmentToSplit.setSplitBy(segmentCausingSplit)
  }
  return segmentsToSplit
}

/** 拆分段并更新依赖 (ELK split + updateDependencies). */
function split(segment: HyperEdgeSegment, segments: HyperEdgeSegment[], freeAreas: FreeArea[],
  criticalConflictThreshold: number): void {
  const splitPosition = computePositionToSplitAndUpdateFreeAreas(segment, freeAreas, criticalConflictThreshold)
  segments.push(segment.splitAt(splitPosition))
  updateDependencies(segment, segments)
}

/** ELK updateDependencies: segment → split-causing → split partner, 再补与其他段的依赖. */
function updateDependencies(segment: HyperEdgeSegment, segments: HyperEdgeSegment[]): void {
  const splitCausing = segment.getSplitBy()
  const splitPartner = segment.getSplitPartner()
  if (splitCausing === null || splitPartner === null) return
  HyperEdgeSegmentDependency.createAndAddCritical(segment, splitCausing)
  HyperEdgeSegmentDependency.createAndAddCritical(splitCausing, splitPartner)
  for (const other of segments) {
    if (other !== splitCausing && other !== segment && other !== splitPartner) {
      // 与 createDependencyIfNecessary 相同的依赖生成 (源/目标段互换两个方向).
      createDependency(other, segment)
      createDependency(other, splitPartner)
    }
  }
}

/** 生成两段间的依赖 (若需要). 简化: 仅当段非直线且范围有重叠才建 regular 依赖. */
function createDependency(he1: HyperEdgeSegment, he2: HyperEdgeSegment): void {
  if (Math.abs(he1.getStartCoordinate() - he1.getEndCoordinate()) < 1e-3
    || Math.abs(he2.getStartCoordinate() - he2.getEndCoordinate()) < 1e-3) return
  // 复用 countCrossings 判定重叠 (ELK createDependencyIfNecessary 的简化: 仅当存在交叉才依赖).
  const c1 = countCrossings(he1.getOutgoingConnectionCoordinates(), he2.getStartCoordinate(), he2.getEndCoordinate())
    + countCrossings(he2.getIncomingConnectionCoordinates(), he1.getStartCoordinate(), he1.getEndCoordinate())
  const c2 = countCrossings(he2.getOutgoingConnectionCoordinates(), he1.getStartCoordinate(), he1.getEndCoordinate())
    + countCrossings(he1.getIncomingConnectionCoordinates(), he2.getStartCoordinate(), he2.getEndCoordinate())
  if (c1 > 0 || c2 > 0) {
    if (c1 <= c2) HyperEdgeSegmentDependency.createAndAddCritical(he1, he2)
    else HyperEdgeSegmentDependency.createAndAddCritical(he2, he1)
  }
}

/** ELK computePositionToSplitAndUpdateFreeAreas. */
function computePositionToSplitAndUpdateFreeAreas(segment: HyperEdgeSegment, freeAreas: FreeArea[],
  criticalConflictThreshold: number): number {
  let firstPossible = -1
  let lastPossible = -1
  for (let i = 0; i < freeAreas.length; i++) {
    const area = freeAreas[i]!
    if (area.startPosition > segment.getEndCoordinate()) break
    if (area.endPosition >= segment.getStartCoordinate()) {
      if (firstPossible < 0) firstPossible = i
      lastPossible = i
    }
  }
  let splitPosition = centerOfSegment(segment)
  if (firstPossible >= 0) {
    const best = chooseBestAreaIndex(segment, freeAreas, firstPossible, lastPossible)
    splitPosition = centerOfArea(freeAreas[best]!)
    useArea(freeAreas, best, criticalConflictThreshold)
  }
  return splitPosition
}

/** ELK chooseBestAreaIndex: 多 area 时按 rating 选最优. */
function chooseBestAreaIndex(segment: HyperEdgeSegment, freeAreas: FreeArea[], from: number, to: number): number {
  let best = from
  if (from < to) {
    const [splitSegment, splitPartner] = segment.simulateSplit()
    let bestArea = freeAreas[best]!
    let bestRating = rateArea(segment, splitSegment, splitPartner, bestArea)
    for (let i = from + 1; i <= to; i++) {
      const area = freeAreas[i]!
      const rating = rateArea(segment, splitSegment, splitPartner, area)
      if (isBetter(area, rating, bestArea, bestRating)) {
        bestArea = area
        bestRating = rating
        best = i
      }
    }
  }
  return best
}

/** ELK rateArea: 评估用该 area 连接 split 两段的依赖/交叉数. */
function rateArea(segment: HyperEdgeSegment, splitSegment: HyperEdgeSegment, splitPartner: HyperEdgeSegment,
  area: FreeArea): AreaRating {
  const areaCentre = centerOfArea(area)
  splitSegment.getOutgoingConnectionCoordinates().length = 0
  splitSegment.getOutgoingConnectionCoordinates().push(areaCentre)
  splitPartner.getIncomingConnectionCoordinates().length = 0
  splitPartner.getIncomingConnectionCoordinates().push(areaCentre)
  const rating = new AreaRating()
  for (const dep of segment.getIncomingSegmentDependencies()) {
    const other = dep.getSource()
    if (other === null) continue
    updateConsideringBothOrderings(rating, splitSegment, other)
    updateConsideringBothOrderings(rating, splitPartner, other)
  }
  for (const dep of segment.getOutgoingSegmentDependencies()) {
    const other = dep.getTarget()
    if (other === null) continue
    updateConsideringBothOrderings(rating, splitSegment, other)
    updateConsideringBothOrderings(rating, splitPartner, other)
  }
  rating.dependencies += 2
  const splitBy = segment.getSplitBy()
  if (splitBy !== null) {
    rating.crossings += countCrossingsForSingleOrdering(splitSegment, splitBy)
    rating.crossings += countCrossingsForSingleOrdering(splitBy, splitPartner)
  }
  return rating
}

/** ELK updateConsideringBothOrderings. */
function updateConsideringBothOrderings(rating: AreaRating, s1: HyperEdgeSegment, s2: HyperEdgeSegment): void {
  const c1 = countCrossingsForSingleOrdering(s1, s2)
  const c2 = countCrossingsForSingleOrdering(s2, s1)
  if (c1 === c2) {
    if (c1 > 0) {
      rating.dependencies += 2
      rating.crossings += c1
    }
  } else {
    rating.dependencies += 1
    rating.crossings += Math.min(c1, c2)
  }
}

/** ELK countCrossingsForSingleOrdering. */
function countCrossingsForSingleOrdering(left: HyperEdgeSegment, right: HyperEdgeSegment): number {
  return countCrossings(left.getOutgoingConnectionCoordinates(), right.getStartCoordinate(), right.getEndCoordinate())
    + countCrossings(right.getIncomingConnectionCoordinates(), left.getStartCoordinate(), left.getEndCoordinate())
}

/** ELK isBetter: 交叉数 → 依赖数 → area 大小. */
function isBetter(currArea: FreeArea, currRating: AreaRating, bestArea: FreeArea, bestRating: AreaRating): boolean {
  if (currRating.crossings < bestRating.crossings) return true
  if (currRating.crossings === bestRating.crossings) {
    if (currRating.dependencies < bestRating.dependencies) return true
    if (currRating.dependencies === bestRating.dependencies && currArea.size > bestArea.size) return true
  }
  return false
}

/** ELK useArea: 使用后 area 分成两半 (仍可用则保留). */
function useArea(freeAreas: FreeArea[], index: number, criticalConflictThreshold: number): void {
  const old = freeAreas[index]!
  freeAreas.splice(index, 1)
  if (old.size / 2 >= criticalConflictThreshold) {
    let insertIndex = index
    const centre = centerOfArea(old)
    const newEnd1 = centre - criticalConflictThreshold
    if (old.startPosition <= newEnd1) {
      freeAreas.splice(insertIndex++, 0, new FreeArea(old.startPosition, newEnd1))
    }
    const newStart2 = centre + criticalConflictThreshold
    if (newStart2 <= old.endPosition) {
      freeAreas.splice(insertIndex, 0, new FreeArea(newStart2, old.endPosition))
    }
  }
}

function centerPair(p1: number, p2: number): number { return (p1 + p2) / 2 }
function centerOfSegment(s: HyperEdgeSegment): number { return centerPair(s.getStartCoordinate(), s.getEndCoordinate()) }
function centerOfArea(a: FreeArea): number { return centerPair(a.startPosition, a.endPosition) }

/**
 * 入口: 拆分 critical 依赖环涉及的段 (ELK HyperEdgeSegmentSplitter.splitSegments).
 * @param dependenciesToResolve critical 环依赖 (HyperEdgeCycleDetector.detectCycles(..., true) 结果)
 * @param segments 全部 edge segment (会原位 push split partner)
 */
export function splitSegments(dependenciesToResolve: HyperEdgeSegmentDependency[], segments: HyperEdgeSegment[],
  criticalConflictThreshold: number): void {
  if (dependenciesToResolve.length === 0) return
  const freeAreas = findFreeAreas(segments, criticalConflictThreshold)
  if (process.env.GGN_SPLIT_DBG) console.error(`[SPLIT] deps=${dependenciesToResolve.length} segs=${segments.length}`)
  const segmentsToSplit = decideWhichSegmentsToSplit(dependenciesToResolve)
  if (process.env.GGN_SPLIT_DBG) console.error(`[SPLIT] toSplit=${[...segmentsToSplit].map(s => `len${s.getLength().toFixed(1)}`).join(',')} freeAreas=${freeAreas.length}`)
  // 按段长度从小到大拆 (小段先拆, 选择更少).
  const ordered = [...segmentsToSplit].sort((a, b) => a.getLength() - b.getLength())
  for (const segment of ordered) {
    if (process.env.GGN_SPLIT_DBG) console.error(`[SPLIT] splitting len=${segment.getLength().toFixed(1)} start=${segment.getStartCoordinate().toFixed(1)} end=${segment.getEndCoordinate().toFixed(1)}`)
    split(segment, segments, freeAreas, criticalConflictThreshold)
  }
}
