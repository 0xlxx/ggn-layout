/**
 * CMGroupModelOrderCalculator 移植单测 (ELK preserveorder.CMGroupModelOrderCalculator).
 * 覆盖: 无 MODEL_ORDER → -1 / MODEL_ORDER 策略 → 原值 / ENFORCED 命中组 → offset+order / ENFORCED 未命中 → 原值.
 */
import { describe, expect, it } from 'vitest'
import { LGraph, LNode, LPort } from '../../src/index.js'
import { calculateModelOrderOrGroupModelOrder } from '../../src/intermediate/preserveorder/cm-group-model-order.js'
import { MODEL_ORDER } from '../../src/options/internal-properties.js'
import {
  CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CM_GROUP_ORDER_STRATEGY,
  CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CM_ENFORCED_GROUP_ORDERS,
  CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CROSSING_MINIMIZATION_ID,
  GroupOrderStrategy,
} from '../../src/options/layered-options.js'

const G1 = 1
const G2 = 2

describe('CMGroupModelOrderCalculator (ELK Java 移植)', () => {
  it('无 MODEL_ORDER → -1', () => {
    const graph = new LGraph()
    const n = new LNode(graph)
    expect(calculateModelOrderOrGroupModelOrder(n, n, graph, 5)).toBe(-1)
  })

  it('MODEL_ORDER 策略 (默认): 返回原值', () => {
    const graph = new LGraph()
    const n = new LNode(graph)
    n.setProperty(MODEL_ORDER, 7)
    expect(calculateModelOrderOrGroupModelOrder(n, n, graph, 5)).toBe(7)
  })

  it('ENFORCED 且两个元素都在强制组: offset * groupId + modelOrder (Java 公式)', () => {
    const graph = new LGraph()
    graph.setProperty(CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CM_GROUP_ORDER_STRATEGY, GroupOrderStrategy.ENFORCED)
    graph.setProperty(CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CM_ENFORCED_GROUP_ORDERS, [G1, G2])
    const n = new LNode(graph)
    n.setProperty(MODEL_ORDER, 3)
    n.setProperty(CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CROSSING_MINIMIZATION_ID, G1)
    const m = new LNode(graph)
    m.setProperty(MODEL_ORDER, 4)
    m.setProperty(CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CROSSING_MINIMIZATION_ID, G2)
    // Java: offset * element.crossingMinimizationId + element.modelOrder
    expect(calculateModelOrderOrGroupModelOrder(n, m, graph, 10)).toBe(13)  // 10*1 + 3
    expect(calculateModelOrderOrGroupModelOrder(m, n, graph, 10)).toBe(24)  // 10*2 + 4
  })

  it('ENFORCED 但元素不在强制组: 返回原 modelOrder', () => {
    const graph = new LGraph()
    graph.setProperty(CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CM_GROUP_ORDER_STRATEGY, GroupOrderStrategy.ENFORCED)
    graph.setProperty(CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CM_ENFORCED_GROUP_ORDERS, [G1])
    const n = new LNode(graph)
    n.setProperty(MODEL_ORDER, 3)
    n.setProperty(CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CROSSING_MINIMIZATION_ID, G2)  // 不在强制组
    const m = new LNode(graph)
    m.setProperty(MODEL_ORDER, 4)
    m.setProperty(CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CROSSING_MINIMIZATION_ID, G1)
    expect(calculateModelOrderOrGroupModelOrder(n, m, graph, 10)).toBe(3)
  })

  it('ENFORCED 且无 CROSSING_MINIMIZATION_ID 属性: 返回原值', () => {
    const graph = new LGraph()
    graph.setProperty(CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CM_GROUP_ORDER_STRATEGY, GroupOrderStrategy.ENFORCED)
    graph.setProperty(CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CM_ENFORCED_GROUP_ORDERS, [G1])
    const p = new LPort()
    p.setProperty(MODEL_ORDER, 9)
    const q = new LPort()
    q.setProperty(MODEL_ORDER, 1)
    expect(calculateModelOrderOrGroupModelOrder(p, q, graph, 2)).toBe(9)
  })
})

// T4X3 补测: 精确分支 (MODEL_ORDER 策略但 enforcedOrders 存在 → 仍返回原值; ENFORCED 未命中 → 原值)
describe('CMGroupModelOrderCalculator T4X3 补测', () => {
  it('MODEL_ORDER 策略 + enforcedOrders 已设: 仍返回原 modelOrder (不进 ENFORCED 分支)', () => {
    const graph = new LGraph()
    graph.setProperty(CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CM_ENFORCED_GROUP_ORDERS, [G1, G2])
    const n = new LNode(graph)
    n.setProperty(MODEL_ORDER, 3)
    n.setProperty(CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CROSSING_MINIMIZATION_ID, G1)
    const m = new LNode(graph)
    m.setProperty(MODEL_ORDER, 4)
    m.setProperty(CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CROSSING_MINIMIZATION_ID, G2)
    // 策略未设 (MODEL_ORDER) → 走 else 分支返回 3, 不是 10+3
    expect(calculateModelOrderOrGroupModelOrder(n, m, graph, 10)).toBe(3)
  })

  it('ENFORCED 命中: offset * gid + modelOrder (Java 公式, gid 为数字)', () => {
    const graph = new LGraph()
    graph.setProperty(CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CM_GROUP_ORDER_STRATEGY, GroupOrderStrategy.ENFORCED)
    graph.setProperty(CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CM_ENFORCED_GROUP_ORDERS, [G1, G2])
    const n = new LNode(graph)
    n.setProperty(MODEL_ORDER, 3)
    n.setProperty(CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CROSSING_MINIMIZATION_ID, G1)
    const m = new LNode(graph)
    m.setProperty(MODEL_ORDER, 4)
    m.setProperty(CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CROSSING_MINIMIZATION_ID, G2)
    expect(calculateModelOrderOrGroupModelOrder(n, m, graph, 10)).toBe(13)  // 10*1 + 3
    expect(calculateModelOrderOrGroupModelOrder(m, n, graph, 10)).toBe(24)  // 10*2 + 4
  })
})

describe('CMGroupModelOrderCalculator T4X3 补测二', () => {
  it('ENFORCED 且 element 在组但 other 不在: 走 fallthrough 返回原值 (line 23)', () => {
    const graph = new LGraph()
    graph.setProperty(CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CM_GROUP_ORDER_STRATEGY, GroupOrderStrategy.ENFORCED)
    graph.setProperty(CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CM_ENFORCED_GROUP_ORDERS, [G1])
    const n = new LNode(graph)
    n.setProperty(MODEL_ORDER, 6)
    n.setProperty(CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CROSSING_MINIMIZATION_ID, G1) // 在组
    const m = new LNode(graph)
    m.setProperty(MODEL_ORDER, 4)
    m.setProperty(CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CROSSING_MINIMIZATION_ID, G2) // 不在组
    expect(calculateModelOrderOrGroupModelOrder(n, m, graph, 10)).toBe(6)
    expect(calculateModelOrderOrGroupModelOrder(m, n, graph, 10)).toBe(4)
  })
})
