/**
 * GroupModelOrderCalculator (对应 ELK p1cycles.GroupModelOrderCalculator).
 * 计算带层约束 (FIRST/LAST 等) 的 model order, 使约束顺序与组内节点顺序同时成立.
 */
import type { LNode } from '../graph/lnode.js'
import { LayerConstraint } from '../graph/enums.js'
import { LAYERING_LAYER_CONSTRAINT } from '../options/layered-options.js'
import {
  CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CYCLE_BREAKING_ID,
} from '../options/layered-options.js'
import { MODEL_ORDER } from '../options/internal-properties.js'

export class GroupModelOrderCalculator {
  private firstSeparateNodes = 0
  private lastSeparateNodes = 0

  /** 约束 model order: FIRST_SEPARATE < FIRST < NORMAL < LAST < LAST_SEPARATE. */
  computeConstraintModelOrder(node: LNode, offset: number): number {
    let modelOrder = 0
    switch (node.getProperty(LAYERING_LAYER_CONSTRAINT)) {
      case LayerConstraint.FIRST_SEPARATE:
        modelOrder = 2 * -offset + this.firstSeparateNodes
        this.firstSeparateNodes++
        break
      case LayerConstraint.FIRST:
        modelOrder = -offset
        break
      case LayerConstraint.LAST:
        modelOrder = offset
        break
      case LayerConstraint.LAST_SEPARATE:
        modelOrder = 2 * offset + this.lastSeparateNodes
        this.lastSeparateNodes++
        break
      default:
        break
    }
    if (node.hasProperty(MODEL_ORDER)) {
      modelOrder += node.getProperty<number>(MODEL_ORDER)
    }
    return modelOrder
  }

  /** 分组约束 model order (ENFORCED 组序). */
  computeConstraintGroupModelOrder(node: LNode, offset: number, smallOffset: number): number {
    let modelOrder = 0
    switch (node.getProperty(LAYERING_LAYER_CONSTRAINT)) {
      case LayerConstraint.FIRST_SEPARATE:
        modelOrder = 2 * -offset + this.firstSeparateNodes
        this.firstSeparateNodes++
        break
      case LayerConstraint.FIRST:
        modelOrder = -offset
        break
      case LayerConstraint.LAST:
        modelOrder = offset
        break
      case LayerConstraint.LAST_SEPARATE:
        modelOrder = 2 * offset + this.lastSeparateNodes
        this.lastSeparateNodes++
        break
      default:
        break
    }
    if (node.hasProperty(MODEL_ORDER)) {
      // ELK 0.12.0 bug 复刻 (modelOrderCycleBreaking): 节点有 MODEL_ORDER 但无 CB_ID 属性时,
      // ELK GroupModelOrderCalculator.java:104 `node.getProperty(CB_ID)` 返回 null → Integer.intValue NPE.
      // ggn TS 的 undefined * n = NaN 不抛错 → 显式复刻 (oracle err: Cannot invoke Integer.intValue ... is null).
      const cbId = node.getProperty<number>(CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CYCLE_BREAKING_ID)
      if (cbId === null || cbId === undefined) {
        throw new TypeError('Cannot invoke "java.lang.Integer.intValue()" because the return value of "org.eclipse.elk.alg.layered.graph.LGraph.getProperty(org.eclipse.elk.graph.properties.IProperty)" is null')
      }
      modelOrder += cbId * smallOffset + node.getProperty<number>(MODEL_ORDER)
    }
    return modelOrder
  }

  resetInternalCounters(): void {
    this.firstSeparateNodes = 0
    this.lastSeparateNodes = 0
  }
}
