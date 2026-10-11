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
 * SingleEdgeGraphWrapper (对应 ELK wrapping.SingleEdgeGraphWrapper) — 路径型图的断行处理器.
 *
 * 把路径型图切成多个子路径以改善整体纵横比. 仅适用于分支很少的路径型图,
 * 且只与 LongestPathLayerer 配合. 分层与交叉最小化完成后:
 *  1. 计算要切成的 "行" 数;
 *  2. 把第 n+1 层的节点移到第 1 层, 第 n+2 层移到第 2 层...;
 *  3. 移动时保证层内顺序正确, 为横跨的边插入 dummy, 并特殊处理反转端口.
 *
 * 来源: org.eclipse.elk.alg.layered.intermediate.wrapping.SingleEdgeGraphWrapper
 */
import type { LGraph } from '../../graph/lgraph.js'
import { CYCLIC } from '../../options/internal-properties.js'
import { WRAPPING_CUTTING_STRATEGY, WRAPPING_VALIDIFY_STRATEGY } from '../../options/layered-options.js'
import { CuttingStrategy, ValidifyStrategy } from '../../options/layered-options.js'
import { GraphStats } from './graph-stats.js'
import type { ICutIndexCalculator } from './cut-index-calculator.js'
import { ARDCutIndexHeuristic, MSDCutIndexHeuristic, ManualCutIndexCalculator } from './cut-index-calculator.js'
import { insertDummies } from './cutting-utils.js'

/** 执行路径型图 wrapping 的入口 (对应 SingleEdgeGraphWrapper.process). */
export function processSingleEdgeWrapping(graph: LGraph): void {
  if (graph.getLayers().length === 0) {
    return
  }

  // 初始化
  const gs = new GraphStats(graph)

  // 若无事可做则提前返回
  const sumWidth = gs.getMaxWidth() * gs.longestPath
  const currentAR = sumWidth / gs.getMaxWidth()
  if (gs.dar > currentAR) {
    // 与我们无关
    return
  }

  // 获取切割索引
  let icic: ICutIndexCalculator
  switch (graph.getProperty(WRAPPING_CUTTING_STRATEGY)) {
    case CuttingStrategy.MANUAL:
      icic = new ManualCutIndexCalculator()
      break
    case CuttingStrategy.ARD:
      icic = new ARDCutIndexHeuristic()
      break
    default:
      icic = new MSDCutIndexHeuristic()
  }
  let cuts = icic.getCutIndexes(graph, gs)

  // 若不保证合法, 使其合法
  if (!icic.guaranteeValid()) {
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

  // 重建分层
  performCuts(graph, gs, cuts)
}

/**
 * 合法化 {@code desiredCuts}: 把每个被禁止的索引 (及其后继) 向后增加直到合法.
 */
export function validifyIndexesGreedily(gs: GraphStats, cuts: number[]): number[] {
  const validCuts: number[] = []
  let offset = 0

  let cutIdx = 0
  while (cutIdx < cuts.length) {
    let cut = cuts[cutIdx]! + offset
    while (cut < gs.longestPath && !gs.isCutAllowed(cut)) {
      cut++
      offset++
    }
    if (cut >= gs.longestPath) {
      // 无法再执行该切割, 丢弃它 (后续切割只会更大, 一并丢弃)
      break
    }
    validCuts.push(cut)
    cutIdx++
  }

  return validCuts
}

/**
 * 合法化 {@code desiredCuts}: 找最近的合法切割点.
 */
export function validifyIndexesLookingBack(gs: GraphStats, desiredCuts: number[]): number[] {
  if (desiredCuts.length === 0) {
    return []
  }

  // 用合法切割点初始化数组
  const validCuts: number[] = [Number.MIN_SAFE_INTEGER] // -inf
  for (let i = 1; i < gs.longestPath; ++i) {
    if (gs.isCutAllowed(i)) {
      validCuts.push(i)
    }
  }
  if (validCuts.length === 1) {
    return []
  }
  validCuts.push(Number.MAX_SAFE_INTEGER) // +inf

  return validifyIndexesLookingBackInner(desiredCuts, validCuts)
}

/**
 * 合法化 {@code desiredCuts}, 使结果切割点全部来自 {@code validCuts}.
 * 约定 {@code validCuts} 首元素为 -inf, 末元素为 +inf (对应 Java 的
 * Integer.MIN_VALUE / Integer.MAX_VALUE 哨兵).
 */
function validifyIndexesLookingBackInner(desiredCuts: number[], validCuts: number[]): number[] {
  // 把切割点转为合法切割点
  const finalCuts: number[] = []
  let iIdx = 0
  let cIdx = 0
  let offset = 0

  while (iIdx < validCuts.length - 1 && cIdx < desiredCuts.length) {
    const current = desiredCuts[cIdx]! + offset

    while (validCuts[iIdx + 1]! < current) {
      iIdx++
    }

    // 不变量: validCuts[iIdx] <= current <= validCuts[iIdx + 1]
    let select = 0
    const distLower = current - validCuts[iIdx]!
    const distHigher = validCuts[iIdx + 1]! - current
    if (distLower > distHigher) {
      select++
    }

    finalCuts.push(validCuts[iIdx + select]!)
    offset += validCuts[iIdx + select]! - current
    cIdx++
    while (cIdx < desiredCuts.length && desiredCuts[cIdx]! + offset <= validCuts[iIdx + select]!) {
      cIdx++
    }
    iIdx += 1 + select
  }

  return finalCuts
}

/**
 * 执行切割.
 *
 * 前置条件:
 *  - 所有切割点都合法;
 *  - 没有切割点大于层数;
 *  - 切割点严格递增.
 */
function performCuts(graph: LGraph, gs: GraphStats, cuts: number[]): void {
  if (cuts.length === 0) {
    return
  }

  // 旧分层中的索引
  let index = 0
  // 新分层中的索引
  let newIndex = 0

  let cutIdx = 0
  let nextCut = cuts[0]! // 保证存在

  // 迭代所有原始层
  while (index < gs.longestPath) {
    if (index === nextCut) {
      // 开始新 "行"
      newIndex = 0
      cutIdx++
      if (cutIdx < cuts.length) {
        nextCut = cuts[cutIdx]!
      } else {
        // 没有更多切割要应用
        nextCut = gs.longestPath + 1
      }
    }

    // 一旦开始切割就必须移动节点
    if (index !== newIndex) {
      const oldLayer = graph.getLayers()[index]!
      const newLayer = graph.getLayers()[newIndex]!

      const nodesToMove = [...oldLayer.getNodes()]
      for (const n of nodesToMove) {
        // 先移动原节点, 以便为反转边创建 dummy 节点
        n.setLayerAt(newLayer.getNodes().length, newLayer)

        // 在切割点处边必须重新路由
        if (newIndex === 0) {
          const incEdges = [...n.getIncomingEdges()]
          for (const e of incEdges) {
            e.reverse(graph, true)
            graph.setProperty(CYCLIC, true)

            // 为新产生的长边插入合适的 dummy 节点
            insertDummies(graph, e, 1)
          }
        }
      }
    }

    // 移到下一层
    newIndex++
    index++
  }

  // 移除旧层
  const layers = graph.getLayers()
  for (let i = layers.length - 1; i >= 0; i--) {
    if (layers[i]!.getNodes().length === 0) {
      layers.splice(i, 1)
    }
  }
}

