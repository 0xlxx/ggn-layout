/**
 * GroupModelOrderCalculator (ggn 移植) 单元测试.
 *
 * SSOT: ELK Java 0.12.0
 *   plugins/org.eclipse.elk.alg.layered/src/org/eclipse/elk/alg/layered/p1cycles/
 *     GroupModelOrderCalculator.java
 *
 * 语义: 约束 model order 满足 FIRST_SEPARATE < FIRST < NORMAL < LAST < LAST_SEPARATE,
 * 同约束节点按出现顺序递增; 分组约束 (computeConstraintGroupModelOrder) 额外叠加
 * groupId * smallOffset + MODEL_ORDER.
 *
 * 注意 (ggn 实现差异, 报告): ELK 的 LAYERING_LAYER_CONSTRAINT 为节点属性, ggn 用
 * node.setLayerConstraint() 字段存储, 而本计算器读 node.getProperty(LAYERING_LAYER_CONSTRAINT);
 * 测试显式 setProperty 以覆盖计算器语义.
 */
import { describe, expect, it } from 'vitest'
import { LGraph, LNode, LayerConstraint } from '../../src/index.js'
import { GroupModelOrderCalculator } from '../../src/p1cycles/group-model-order-calculator.js'
import { MODEL_ORDER } from '../../src/options/internal-properties.js'
import {
  LAYERING_LAYER_CONSTRAINT, CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CYCLE_BREAKING_ID,
} from '../../src/options/layered-options.js'

function makeNode(g: LGraph, lc: LayerConstraint | null, modelOrder?: number, groupId = 0): LNode {
  const n = new LNode(g)
  if (lc !== null) n.setProperty(LAYERING_LAYER_CONSTRAINT, lc)
  if (modelOrder !== undefined) n.setProperty(MODEL_ORDER, modelOrder)
  if (groupId !== 0) n.setProperty(CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CYCLE_BREAKING_ID, groupId)
  return n
}

describe('GroupModelOrderCalculator (ELK Java 0.12.0 移植)', () => {
  describe('computeConstraintModelOrder', () => {
    it('约束顺序: FIRST_SEPARATE < FIRST < NORMAL < LAST < LAST_SEPARATE; 同约束递增', () => {
      const g = new LGraph()
      const calc = new GroupModelOrderCalculator()
      const offset = 10
      const fs1 = makeNode(g, LayerConstraint.FIRST_SEPARATE)
      const fs2 = makeNode(g, LayerConstraint.FIRST_SEPARATE)
      const first = makeNode(g, LayerConstraint.FIRST)
      const normal = makeNode(g, null)
      const last = makeNode(g, LayerConstraint.LAST)
      const ls1 = makeNode(g, LayerConstraint.LAST_SEPARATE)
      const ls2 = makeNode(g, LayerConstraint.LAST_SEPARATE)

      const vFs1 = calc.computeConstraintModelOrder(fs1, offset)
      const vFs2 = calc.computeConstraintModelOrder(fs2, offset)
      const vFirst = calc.computeConstraintModelOrder(first, offset)
      const vNormal = calc.computeConstraintModelOrder(normal, offset)
      const vLast = calc.computeConstraintModelOrder(last, offset)
      const vLs1 = calc.computeConstraintModelOrder(ls1, offset)
      const vLs2 = calc.computeConstraintModelOrder(ls2, offset)

      // 手算 (offset=10): FS1=-20, FS2=-19, FIRST=-10, NORMAL=0, LAST=10, LS1=20, LS2=21
      expect(vFs1).toBe(-20)
      expect(vFs2).toBe(-19)
      expect(vFirst).toBe(-10)
      expect(vNormal).toBe(0)
      expect(vLast).toBe(10)
      expect(vLs1).toBe(20)
      expect(vLs2).toBe(21)

      // 不变量: 顺序严格单调
      const order = [vFs1, vFs2, vFirst, vNormal, vLast, vLs1, vLs2]
      for (let i = 1; i < order.length; i++) expect(order[i]!).toBeGreaterThan(order[i - 1]!)
    })

    it('带 MODEL_ORDER: 叠加 MODEL_ORDER; NONE 约束也可叠加', () => {
      const g = new LGraph()
      const calc = new GroupModelOrderCalculator()
      const offset = 10
      const firstMo = makeNode(g, LayerConstraint.FIRST, 5)
      const normalMo = makeNode(g, null, 3)
      expect(calc.computeConstraintModelOrder(firstMo, offset)).toBe(-10 + 5)
      expect(calc.computeConstraintModelOrder(normalMo, offset)).toBe(0 + 3)
    })
  })

  describe('computeConstraintGroupModelOrder', () => {
    it('叠加 groupId * smallOffset + MODEL_ORDER; 约束基底同 computeConstraintModelOrder', () => {
      const g = new LGraph()
      const calc = new GroupModelOrderCalculator()
      const offset = 10
      const smallOffset = 3
      // FIRST + groupId=2 + MODEL_ORDER=5 → -10 + 2*3 + 5 = 1
      const first = makeNode(g, LayerConstraint.FIRST, 5, 2)
      expect(calc.computeConstraintGroupModelOrder(first, offset, smallOffset)).toBe(1)
      // NORMAL + groupId=1 + MODEL_ORDER=0 → 0 + 1*3 + 0 = 3
      const normal = makeNode(g, null, 0, 1)
      expect(calc.computeConstraintGroupModelOrder(normal, offset, smallOffset)).toBe(3)
      // LAST_SEPARATE (第 1 个) → 2*10 + 0 + (groupId=0)*3 + MODEL_ORDER=0 = 20
      const ls = makeNode(g, LayerConstraint.LAST_SEPARATE, 0, 0)
      expect(calc.computeConstraintGroupModelOrder(ls, offset, smallOffset)).toBe(20)
      // FIRST_SEPARATE (第 1 个) → 2*-10 + 0 + 0 = -20 (覆盖 group 变体的 FS/LAST 分支)
      const fs = makeNode(g, LayerConstraint.FIRST_SEPARATE, 0, 0)
      expect(calc.computeConstraintGroupModelOrder(fs, offset, smallOffset)).toBe(-20)
      const last = makeNode(g, LayerConstraint.LAST, 1, 1)
      expect(calc.computeConstraintGroupModelOrder(last, offset, smallOffset)).toBe(10 + 1 * 3 + 1)
    })
  })

  describe('resetInternalCounters', () => {
    it('重置 first/last separate 计数器', () => {
      const g = new LGraph()
      const calc = new GroupModelOrderCalculator()
      const offset = 10
      const a = makeNode(g, LayerConstraint.FIRST_SEPARATE)
      const b = makeNode(g, LayerConstraint.FIRST_SEPARATE)
      const c = makeNode(g, LayerConstraint.LAST_SEPARATE)
      expect(calc.computeConstraintModelOrder(a, offset)).toBe(-20)
      expect(calc.computeConstraintModelOrder(b, offset)).toBe(-19)
      expect(calc.computeConstraintModelOrder(c, offset)).toBe(20)

      calc.resetInternalCounters()
      const a2 = makeNode(g, LayerConstraint.FIRST_SEPARATE)
      const c2 = makeNode(g, LayerConstraint.LAST_SEPARATE)
      expect(calc.computeConstraintModelOrder(a2, offset)).toBe(-20)
      expect(calc.computeConstraintModelOrder(c2, offset)).toBe(20)
    })
  })
})

/**
 * ─── T4X2 补测: 组序变体计数器 (first/last separate 多次) + ELK null-cbId 复刻 ───
 */
describe('GroupModelOrderCalculator (T4X2 补充)', () => {
  describe('computeConstraintGroupModelOrder 计数器', () => {
    it('多个 FIRST_SEPARATE: 2*offset + 序号 (第 1 个 -20, 第 2 个 -19)', () => {
      const g = new LGraph()
      const calc = new GroupModelOrderCalculator()
      const offset = 10
      const smallOffset = 3
      const fs1 = makeNode(g, LayerConstraint.FIRST_SEPARATE, 0, 0)
      const fs2 = makeNode(g, LayerConstraint.FIRST_SEPARATE, 0, 0)
      expect(calc.computeConstraintGroupModelOrder(fs1, offset, smallOffset)).toBe(-20)
      expect(calc.computeConstraintGroupModelOrder(fs2, offset, smallOffset)).toBe(-19)
    })

    it('多个 LAST_SEPARATE: 2*offset + 序号 (第 1 个 20, 第 2 个 21)', () => {
      const g = new LGraph()
      const calc = new GroupModelOrderCalculator()
      const offset = 10
      const smallOffset = 3
      const ls1 = makeNode(g, LayerConstraint.LAST_SEPARATE, 0, 0)
      const ls2 = makeNode(g, LayerConstraint.LAST_SEPARATE, 0, 0)
      expect(calc.computeConstraintGroupModelOrder(ls1, offset, smallOffset)).toBe(20)
      expect(calc.computeConstraintGroupModelOrder(ls2, offset, smallOffset)).toBe(21)
    })

    it('resetInternalCounters 后 FIRST/LAST_SEPARATE 重新从 0 计数 (组变体)', () => {
      const g = new LGraph()
      const calc = new GroupModelOrderCalculator()
      const offset = 10
      const smallOffset = 3
      expect(calc.computeConstraintGroupModelOrder(makeNode(g, LayerConstraint.FIRST_SEPARATE, 0, 0), offset, smallOffset)).toBe(-20)
      expect(calc.computeConstraintGroupModelOrder(makeNode(g, LayerConstraint.LAST_SEPARATE, 0, 0), offset, smallOffset)).toBe(20)
      calc.resetInternalCounters()
      expect(calc.computeConstraintGroupModelOrder(makeNode(g, LayerConstraint.FIRST_SEPARATE, 0, 0), offset, smallOffset)).toBe(-20)
      expect(calc.computeConstraintGroupModelOrder(makeNode(g, LayerConstraint.LAST_SEPARATE, 0, 0), offset, smallOffset)).toBe(20)
    })
  })

  describe('computeConstraintGroupModelOrder 空 cbId 复刻', () => {
    it('MODEL_ORDER 存在但 CB_ID 为 null: 抛 ELK 同源 TypeError', () => {
      const g = new LGraph()
      const calc = new GroupModelOrderCalculator()
      const n = makeNode(g, null, 5, 0)  // groupId=0 → 不写 CB_ID 属性 (默认 0)
      // 强制把 CB_ID 置 null (ELK getProperty 未设时返回 null; ggn 默认 0, 白盒模拟 ELK 语义)
      const propKey = (n as unknown as { getAllProperties(): Map<string, unknown> }).getAllProperties()
      const holder = n as unknown as { propertyMap?: Map<string, unknown> }
      // 直接往底层 map 塞 null (绕过 setProperty 的删除语义)
      if (!holder.propertyMap) (holder as { propertyMap: Map<string, unknown> }).propertyMap = new Map()
      holder.propertyMap!.set(CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CYCLE_BREAKING_ID.getId(), null as unknown)
      expect(() => calc.computeConstraintGroupModelOrder(n, 10, 3)).toThrow(/Cannot invoke/)
      void propKey
    })
  })
})
