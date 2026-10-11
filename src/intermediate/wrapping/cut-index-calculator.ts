/**
 * ICutIndexCalculator 与全部切割策略实现 (对应 ELK wrapping.ICutIndexCalculator /
 * ARDCutIndexHeuristic / MSDCutIndexHeuristic / ManualCutIndexCalculator).
 *
 * 计算把分层图切成多个 chunk 的切割点索引; 切割点索引语义为"在该层之前切".
 *
 * 来源: org.eclipse.elk.alg.layered.intermediate.wrapping.{ICutIndexCalculator, ARDCutIndexHeuristic, MSDCutIndexHeuristic}
 */
import type { LGraph } from '../../graph/lgraph.js'
import { WRAPPING_CUTTING_CUTS, WRAPPING_CUTTING_MSD_FREEDOM } from '../../options/layered-options.js'
import type { GraphStats } from './graph-stats.js'

/** 切割点计算器 (对应 ELK ICutIndexCalculator). */
export interface ICutIndexCalculator {
  /** @return 分层图应被切分的索引列表. */
  getCutIndexes(graph: LGraph, gs: GraphStats): number[]
  /** @return 是否保证所有切割点都合法. */
  guaranteeValid(): boolean
}

/** 手动切割点计算器: 直接读取 WRAPPING_CUTTING_CUTS 选项. */
export class ManualCutIndexCalculator implements ICutIndexCalculator {
  getCutIndexes(graph: LGraph, gs: GraphStats): number[] {
    void gs
    const cuts = graph.getProperty(WRAPPING_CUTTING_CUTS)
    return cuts !== null ? cuts : []
  }

  guaranteeValid(): boolean {
    return false
  }
}

/**
 * 基于期望纵横比的切割点计算器: 先算期望 chunk 数, 再取等距切割点.
 *
 * 给定宽度/高度估计, 寻找 chunk 数使得:
 * <pre>
 * desiredAr = ((longestPath / chunks) * maxWidth) / (chunks * maxHeight)
 * </pre>
 */
export class ARDCutIndexHeuristic implements ICutIndexCalculator {
  getCutIndexes(graph: LGraph, gs: GraphStats): number[] {
    void graph
    const rows = ARDCutIndexHeuristic.getChunkCount(gs)

    // 切割数比 chunk 行数少一
    const cuts: number[] = []
    const step = gs.longestPath / rows
    for (let idx = 1; idx < rows; ++idx) {
      cuts.push(Math.round(idx * step))
    }
    return cuts
  }

  /** @return 图应被切成的 chunk 数 (结果切割数因此少一). */
  static getChunkCount(gs: GraphStats): number {
    const rowsd = Math.sqrt(gs.getSumWidth() / (gs.dar * gs.getMaxHeight()))
    let rows = Math.round(rowsd)
    rows = Math.min(rows, gs.longestPath)
    return rows
  }

  guaranteeValid(): boolean {
    return false
  }
}

/**
 * 最大化缩放值驱动的切割策略: 对固定切割数, 找到最小化 max scale 的"宽度部分"的切割点,
 * 并允许通过 WRAPPING_CUTTING_MSD_FREEDOM 微调切割数 (代价是更多迭代).
 */
export class MSDCutIndexHeuristic implements ICutIndexCalculator {
  guaranteeValid(): boolean {
    return false
  }

  getCutIndexes(graph: LGraph, gs: GraphStats): number[] {
    // 最小化各 chunk 宽度和的最大值
    const widths = gs.getWidths()
    const heights = gs.getHeights()

    // 记录原始分层每个索引处的累计宽度
    const widthAtIndex = new Array<number>(widths.length)
    widthAtIndex[0] = widths[0]!
    let total = widths[0]!
    for (let i = 1; i < widths.length; i++) {
      widthAtIndex[i] = widthAtIndex[i - 1]! + widths[i]!
      total += widths[i]!
    }

    // 初始切割数猜测
    const cutCnt = ARDCutIndexHeuristic.getChunkCount(gs) - 1
    const freedom = graph.getProperty(WRAPPING_CUTTING_MSD_FREEDOM)

    let bestMaxScale = -Infinity
    let bestCuts: number[] = []

    // 搜索最优切割点集合
    for (let m = Math.max(0, cutCnt - freedom); m <= Math.min(gs.longestPath - 1, cutCnt + freedom); m++) {
      // 计算切割点
      const rowSum = total / (m + 1)
      let sumSoFar = 0
      let index = 1
      const cuts: number[] = []

      // 任意行的最大宽度
      let width = -Infinity
      let lastCutWidth = 0
      // 各行最大高度之和
      let height = 0
      let rowHeightMax = heights[0]!

      if (m === 0) {
        width = total
        height = gs.getMaxHeight()
      } else {
        while (index < gs.longestPath) {
          if (widthAtIndex[index - 1]! - sumSoFar >= rowSum) {
            // 在 index 之前切割
            cuts.push(index)

            // 更新状态
            width = Math.max(width, widthAtIndex[index - 1]! - lastCutWidth)
            height += rowHeightMax

            sumSoFar += widthAtIndex[index - 1]! - sumSoFar
            lastCutWidth = widthAtIndex[index - 1]!
            rowHeightMax = heights[index]!
          }

          rowHeightMax = Math.max(rowHeightMax, heights[index]!)
          index++
        }

        // 加上最后一行的高度
        height += rowHeightMax
      }

      // 是否更好?
      const maxScale = Math.min(1 / width, (1 / gs.dar) / height)
      if (maxScale > bestMaxScale) {
        bestMaxScale = maxScale
        bestCuts = cuts
      }
    }

    return bestCuts
  }
}
