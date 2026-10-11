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
 * BreakingPointInserter (对应 ELK wrapping.BreakingPointInserter) — 计算切割点并插入断点.
 *
 * 目标: 改善"很宽很窄"的图 (层多而每层节点少). 切割发生在相邻层对之间, 跨越切割点的边被拆分:
 * <pre>
 *  u --nodeStartEdge--> startMarker --startEndEdge--> endMarker --e--> v
 * </pre>
 * 原边被推向"右"侧, 从而可能被再次拆分 (多 cut 链).
 * 后续 BreakingPointProcessor 会把 startEndEdge 从图形最右端重新路由回最左端,
 * 用一串 LONG_EDGE dummy 替换.
 *
 * 前置条件: 无 LONG_EDGE dummy 的分层图; 插槽: P2 之后, LongEdgeSplitter 之前.
 *
 * 来源: org.eclipse.elk.alg.layered.intermediate.wrapping.BreakingPointInserter
 */
import type { LGraph } from '../../graph/lgraph.js'
import { LNode } from '../../graph/lnode.js'
import { LPort } from '../../graph/lport.js'
import { LEdge } from '../../graph/ledge.js'
import { Layer } from '../../graph/layer.js'
import { NodeType, PortConstraints, PortSide } from '../../graph/enums.js'
import { BREAKING_POINT_INFO, MODEL_ORDER } from '../../options/internal-properties.js'
import {
  WRAPPING_CUTTING_STRATEGY, WRAPPING_MULTI_EDGE_IMPROVE_CUTS, WRAPPING_VALIDIFY_STRATEGY,
  WRAPPING_MULTI_EDGE_DISTANCE_PENALTY, PORT_CONSTRAINTS, CuttingStrategy, ValidifyStrategy,
} from '../../options/layered-options.js'
import { BPInfo } from './bp-info.js'
import { GraphStats } from './graph-stats.js'
import type { ICutIndexCalculator } from './cut-index-calculator.js'
import { ARDCutIndexHeuristic, MSDCutIndexHeuristic, ManualCutIndexCalculator } from './cut-index-calculator.js'
import { validifyIndexesGreedily, validifyIndexesLookingBack } from './single-edge-graph-wrapper.js'

/** 执行断点插入的入口 (对应 BreakingPointInserter.process). */
export function processBreakingPointInsertion(graph: LGraph): void {
  const gs = new GraphStats(graph)

  // #1 确定切割点
  const icic: ICutIndexCalculator = selectCutIndexCalculator(graph)
  let cuts = icic.getCutIndexes(graph, gs)

  // #2 改进切割点
  if (graph.getProperty(WRAPPING_MULTI_EDGE_IMPROVE_CUTS)) {
    cuts = improveCuts(graph, cuts)
  }

  // #3 若不保证合法, 使其合法
  if (!icic.guaranteeValid() && graph.hasProperty(WRAPPING_VALIDIFY_STRATEGY)) {
    switch (graph.getProperty(WRAPPING_VALIDIFY_STRATEGY)) {
      case ValidifyStrategy.LOOK_BACK:
        cuts = validifyIndexesLookingBack(gs, cuts)
        break
      case ValidifyStrategy.GREEDY:
        cuts = validifyIndexesGreedily(gs, cuts)
        break
      default:
        // 保持切割点不变
        break
    }
  }

  if (cuts.length === 0) {
    return
  }

  // #4 插入断点
  applyCuts(graph, cuts)
}

/** 按 WRAPPING_CUTTING_STRATEGY 选择切割策略 (与 Java switch 一致, 默认 MSD). */
export function selectCutIndexCalculator(graph: LGraph): ICutIndexCalculator {
  switch (graph.getProperty(WRAPPING_CUTTING_STRATEGY)) {
    case CuttingStrategy.MANUAL:
      return new ManualCutIndexCalculator()
    case CuttingStrategy.ARD:
      return new ARDCutIndexHeuristic()
    default:
      return new MSDCutIndexHeuristic()
  }
}

/** 在每个切割点插入两个新层 + 断点 dummy. */
function applyCuts(graph: LGraph, cuts: number[]): number {
  const layers = graph.getLayers()

  let idx = 0
  let cutIdx = 0
  let cut = cuts[0]!
  let noSplitEdges = 0

  const alreadySplit = new Set<LEdge>()
  // 记录"开放"边 (源已处理、目标未处理的边)
  const openEdges = new Set<LEdge>()

  let layerPos = 0
  while (layerPos < layers.length) {
    const layer = layers[layerPos]!

    // 'open' 边记账
    for (const n of layer.getNodes()) {
      for (const e of n.getOutgoingEdges()) {
        openEdges.add(e)
      }
      for (const e of n.getIncomingEdges()) {
        openEdges.delete(e)
      }
    }

    // 在每个切割索引处插入两个新层 + 断点 dummy
    if (idx + 1 === cut) {
      // 插入两个新层 (idx 与实际位置解耦, 原 cut 值无需偏移)
      const bpLayer1 = new Layer(graph)
      layers.splice(layerPos + 1, 0, bpLayer1)
      const bpLayer2 = new Layer(graph)
      layers.splice(layerPos + 2, 0, bpLayer2)

      // 拆分边 'e' 形如:
      //      node --nodeStartEdge--> startMarker --startEndEdge--> endMarker --e--> node
      // 原边被推向"右"侧, 从而可能被再次拆分
      for (const originalEdge of openEdges) {
        if (!alreadySplit.has(originalEdge)) {
          noSplitEdges++
          alreadySplit.add(originalEdge)
        }

        // start dummy
        const bpStartMarker = new LNode(graph)
        bpStartMarker.setProperty(PORT_CONSTRAINTS, PortConstraints.FIXED_SIDE)
        bpStartMarker.setLayer(bpLayer1)
        bpStartMarker.setType(NodeType.BREAKING_POINT)
        const inPortBp1 = new LPort()
        inPortBp1.setNode(bpStartMarker)
        inPortBp1.setSide(PortSide.WEST)
        const outPortBp1 = new LPort()
        outPortBp1.setNode(bpStartMarker)
        outPortBp1.setSide(PortSide.EAST)

        // end dummy
        const bpEndMarker = new LNode(graph)
        bpEndMarker.setProperty(PORT_CONSTRAINTS, PortConstraints.FIXED_SIDE)
        bpEndMarker.setLayer(bpLayer2)
        bpEndMarker.setType(NodeType.BREAKING_POINT)
        const inPortBp2 = new LPort()
        inPortBp2.setNode(bpEndMarker)
        inPortBp2.setSide(PortSide.WEST)
        const outPortBp2 = new LPort()
        outPortBp2.setNode(bpEndMarker)
        outPortBp2.setSide(PortSide.EAST)

        // 第一条 dummy 边
        const nodeStartEdge = new LEdge()
        nodeStartEdge.setSource(originalEdge.getSource())
        nodeStartEdge.setTarget(inPortBp1)
        nodeStartEdge.setProperty(MODEL_ORDER, originalEdge.getProperty(MODEL_ORDER))

        // 第二条 dummy 边
        const startEndEdge = new LEdge()
        startEndEdge.setSource(outPortBp1)
        startEndEdge.setTarget(inPortBp2)
        startEndEdge.setProperty(MODEL_ORDER, originalEdge.getProperty(MODEL_ORDER))

        // 重定向原边
        originalEdge.setSource(outPortBp2)

        // 把信息挂到 dummy 上
        const bpi = new BPInfo(bpStartMarker, bpEndMarker, nodeStartEdge, startEndEdge, originalEdge)
        bpStartMarker.setProperty(BREAKING_POINT_INFO, bpi)
        bpEndMarker.setProperty(BREAKING_POINT_INFO, bpi)

        // 可能把断点 dummy 链起来
        const prevNode = nodeStartEdge.getSource()!.getNode()!
        if (prevNode.getType() === NodeType.BREAKING_POINT) {
          const bpiPrev = prevNode.getProperty(BREAKING_POINT_INFO)!
          bpiPrev.next = bpi
          bpi.prev = bpiPrev
        }
      }

      // 跳过刚插入的两个 bp 层 (Java listIterator: add 后游标已越过它们, 不再访问)
      layerPos += 2

      cutIdx++
      if (cutIdx < cuts.length) {
        cut = cuts[cutIdx]!
      } else {
        break
      }
    }

    idx++
    layerPos++
  }

  return noSplitEdges
}

/**
 * 改进切割点: 对每条候选边, 权衡"均匀分布"与"被切边数" (稠密图切割点容易聚拢).
 */
function improveCuts(graph: LGraph, cuts: number[]): number[] {
  const improvedCuts: number[] = []

  // 转换成 cut 对象
  const ccuts: Cut[] = []
  let lastCut: Cut | null = null
  for (const cutIdx of cuts) {
    const cut = new Cut(cutIdx)
    ccuts.push(cut)
    if (lastCut !== null) {
      cut.prev = lastCut
      lastCut.suc = cut
    }
    lastCut = cut
  }

  // 计算边跨度
  const spans = computeEdgeSpans(graph)

  // 迭代寻找最优切割点
  for (let i = 0; i < ccuts.length; ++i) {
    let lCut: Cut | null = null
    let rCut: Cut | null = ccuts[0]!.selfOrNext()

    let bestCut: Cut | null = null
    let bestScore = Infinity

    for (let idx = 1; idx < graph.getLayers().length; ++idx) {
      const rDist = rCut !== null ? Math.abs(rCut.index - idx) : Math.abs(idx - lCut!.index) + 1
      const lDist = lCut !== null ? Math.abs(idx - lCut.index) : rDist + 1
      let hit: Cut | null
      let dist: number
      if (lDist < rDist) {
        hit = lCut
        dist = lDist
      } else {
        hit = rCut
        dist = rDist
      }

      const score = computeScore(graph, idx, spans[idx]!, dist)
      if (score < bestScore) {
        bestScore = score
        bestCut = hit
        bestCut!.newIndex = idx
      }

      if (rCut !== null && idx === rCut.index) {
        lCut = rCut
        rCut = rCut.next()
      }
    }

    // 记录
    if (bestCut !== null) {
      improvedCuts.push(bestCut.newIndex)
      bestCut.assigned = true

      // 尽可能传播偏移
      bestCut.offset()
    }
  }

  improvedCuts.sort((a, b) => a - b)
  return improvedCuts
}

/**
 * 分数: spans + dist^penalty. 若 dist 权重太小, 高连通图的切割点会聚拢.
 */
function computeScore(graph: LGraph, index: number, spans: number, dist: number): number {
  void index
  const distancePenalty = graph.getProperty(WRAPPING_MULTI_EDGE_DISTANCE_PENALTY)
  return spans + Math.pow(dist, distancePenalty)
}

/**
 * @return 数组 {@code spans}, {@code spans[i]} 是层 {@code L_{i-1}} 与 {@code L_i} 之间跨越的边数.
 */
function computeEdgeSpans(graph: LGraph): number[] {
  const spans = new Array<number>(graph.getLayers().length + 1)

  const open = new Set<LEdge>()
  let i = 0
  for (const l of graph.getLayers()) {
    spans[i++] = open.size

    for (const n of l.getNodes()) {
      for (const e of n.getOutgoingEdges()) {
        open.add(e)
      }
    }

    for (const n of l.getNodes()) {
      for (const e of n.getIncomingEdges()) {
        open.delete(e)
      }
    }
  }

  return spans
}

/**
 * 'cut' 的内部表示: 原切割点 + 改进建议 + 前后邻居 (数值上最近的切割点).
 */
class Cut {
  /** 原切割点. */
  index: number
  /** 改进建议 (中间值). */
  newIndex = 0
  /** 数值上最近的较小切割点. */
  prev: Cut | null = null
  /** 数值上最近的较大切割点. */
  suc: Cut | null = null
  /** {@link #newIndex} 是否最终确定. */
  assigned = false

  constructor(index: number) {
    this.index = index
  }

  selfOrNext(): Cut | null {
    if (!this.assigned) {
      return this
    }
    if (this.suc !== null) {
      return this.suc.selfOrNext()
    }
    return null
  }

  next(): Cut | null {
    if (this.suc !== null) {
      return this.suc.selfOrNext()
    }
    return null
  }

  offset(): void {
    if (!this.assigned) {
      throw new Error('Cannot offset an unassigned cut.')
    }
    const offset = this.newIndex - this.index
    this.applyOffset(offset)
    this.offsetPrev(offset)
    this.offsetSuc(offset)
  }

  private applyOffset(offset: number): void {
    this.index += offset
  }

  private offsetPrev(offset: number): void {
    if (this.prev !== null && !this.prev.assigned) {
      this.prev.applyOffset(offset)
      this.prev.offsetPrev(offset)
    }
  }

  private offsetSuc(offset: number): void {
    if (this.suc !== null && !this.suc.assigned) {
      this.suc.applyOffset(offset)
      this.suc.offsetSuc(offset)
    }
  }
}

