/**
 * rectpacking 布局算法 (ELK alg.rectpacking 0.12.0 移植) — 直接 vitest BDD.
 *
 * 被测: src/rectpacking/ (RectPackingLayoutProvider + p1/p2/p3 管线).
 * 对照权威: ELK 0.12.0 (verify-elkg-java-layout 对 interactiveRectpacking_* 3 模型全等).
 * 语义不变量 (与 Java 一致):
 *   - 子节点不重叠, 且都落在父节点内容区 (padding 内);
 *   - 父节点尺寸 = 内容尺寸 + padding (fixedGraphSize=false 默认);
 *   - TRYBOX=true 且存在可堆叠三连 → 降级 box 布局 (设递减 PRIORITY);
 *   - TRYBOX=false (默认) 走 p1 宽度近似 + p2 装箱 + p3 空白消除.
 */
import { describe, it, expect } from 'vitest'
import { rectPackingLayout } from '../../src/rectpacking/rect-packing-layout.js'
import { boxLayout } from '../../src/api/core-providers.js'
import { layoutElkJson } from '../../src/api/elk-json.js'
import '../../src/api/register-all.js' // 非 layered provider 注册 (测试需全部算法)
import type { ElkNode } from '../../src/api/elk-json.js'

function node(partial: Partial<ElkNode> & { id: string }): ElkNode {
  return { children: partial.children ?? [], edges: partial.edges ?? [], layoutOptions: partial.layoutOptions, ...partial }
}

/** 断言所有子节点两两不重叠 (轴对齐矩形). */
function expectNoOverlap(children: ElkNode[]): void {
  for (let i = 0; i < children.length; i++) {
    for (let j = i + 1; j < children.length; j++) {
      const a = children[i]!
      const b = children[j]!
      const ax = a.x ?? 0, ay = a.y ?? 0, aw = a.width ?? 0, ah = a.height ?? 0
      const bx = b.x ?? 0, by = b.y ?? 0, bw = b.width ?? 0, bh = b.height ?? 0
      const overlapX = ax < bx + bw && bx < ax + aw
      const overlapY = ay < by + bh && by < ay + ah
      expect(overlapX && overlapY, `${a.id} 与 ${b.id} 重叠`).toBe(false)
    }
  }
}

/** 断言所有子节点在父节点内容区内 (padding=15 默认, 贴合边界). */
function expectWithinBounds(parent: ElkNode, pad = 15): void {
  for (const c of parent.children ?? []) {
    const cx = c.x ?? 0, cy = c.y ?? 0, cw = c.width ?? 0, ch = c.height ?? 0
    expect(cx).toBeGreaterThanOrEqual(pad - 1e-9)
    expect(cy).toBeGreaterThanOrEqual(pad - 1e-9)
    expect(cx + cw).toBeLessThanOrEqual((parent.width ?? 0) - pad + 1e-9)
    expect(cy + ch).toBeLessThanOrEqual((parent.height ?? 0) - pad + 1e-9)
  }
}

describe('rectPackingLayout (ELK RectPackingLayoutProvider)', () => {
  it('两个 60x30 子节点: 垂直堆叠 + padding 15, 父节点尺寸 = 内容 + padding (hierarchy n2 语义)', () => {
    const root = node({
      id: 'root',
      children: [
        node({ id: 'a', width: 60, height: 30 }),
        node({ id: 'b', width: 60, height: 30 }),
      ],
    })
    rectPackingLayout(root)
    // 与 jar oracle (interactiveRectpacking_hierarchy Nn2) 全等: (15,15) / (15,60), 父 90x105.
    expect(root.children![0]!.x).toBe(15)
    expect(root.children![0]!.y).toBe(15)
    expect(root.children![1]!.x).toBe(15)
    expect(root.children![1]!.y).toBe(60)
    expect(root.width).toBe(90)
    expect(root.height).toBe(105)
  })

  it('子节点不重叠 (任意尺寸集)', () => {
    const root = node({
      id: 'root',
      children: [
        node({ id: 'a', width: 40, height: 60 }),
        node({ id: 'b', width: 90, height: 105 }),
        node({ id: 'c', width: 20, height: 20 }),
        node({ id: 'd', width: 60, height: 30 }),
        node({ id: 'e', width: 30, height: 90 }),
      ],
    })
    rectPackingLayout(root)
    expectNoOverlap(root.children ?? [])
    expectWithinBounds(root)
  })

  it('父节点尺寸贴合内容 (固定 padding 15, 不越界)', () => {
    const root = node({
      id: 'root',
      children: [
        node({ id: 'a', width: 100, height: 40 }),
        node({ id: 'b', width: 50, height: 70 }),
        node({ id: 'c', width: 80, height: 30 }),
      ],
    })
    rectPackingLayout(root)
    expect(root.width).toBeGreaterThan(0)
    expect(root.height).toBeGreaterThan(0)
    expectWithinBounds(root)
  })

  it('TRYBOX=true 且不可堆叠 (等高) → 降级 box 布局 (结果与 boxLayout 一致)', () => {
    // Java: 等高节点不可堆叠 (30 < 30+30+15) → box layout 表现更好 → 降级.
    const mk = () => node({
      id: 'root',
      layoutOptions: { 'org.eclipse.elk.rectpacking.trybox': 'true' },
      children: [
        node({ id: 'a', width: 60, height: 30 }),
        node({ id: 'b', width: 60, height: 30 }),
        node({ id: 'c', width: 60, height: 30 }),
      ],
    })
    const rp = rectPackingLayout(mk())
    const bx = boxLayout(mk())
    // 降级 box: 子节点按 PRIORITY (递减) 装箱 — 位置/尺寸与 boxLayout 一致.
    for (let i = 0; i < (rp.children ?? []).length; i++) {
      expect(rp.children![i]!.x).toBe(bx.children![i]!.x)
      expect(rp.children![i]!.y).toBe(bx.children![i]!.y)
      expect(rp.children![i]!.width).toBe(bx.children![i]!.width)
      expect(rp.children![i]!.height).toBe(bx.children![i]!.height)
    }
    expect(rp.width).toBe(bx.width)
    expect(rp.height).toBe(bx.height)
    expectNoOverlap(rp.children ?? [])
  })

  it('TRYBOX=true 且可堆叠 (一高两矮) → 仍走 rectpacking 管线 (不重叠 + 贴合边界)', () => {
    // 100 ≥ 20+20+15 → 可堆叠 → rectpacking 3 阶段管线 (非 box).
    const root = node({
      id: 'root',
      layoutOptions: { 'org.eclipse.elk.rectpacking.trybox': 'true' },
      children: [
        node({ id: 'a', width: 100, height: 100 }),
        node({ id: 'b', width: 20, height: 20 }),
        node({ id: 'c', width: 20, height: 20 }),
      ],
    })
    rectPackingLayout(root)
    expectNoOverlap(root.children ?? [])
    expectWithinBounds(root)
    expect(root.width).toBeGreaterThan(0)
  })

  it('layoutElkJson 分派: 嵌套 rectpacking 子树作为黑盒 (rectpacking 布局子节点, layered 布局父图)', () => {
    const input: ElkNode = {
      id: 'root',
      children: [
        { id: 'Nn1', width: 60, height: 30 },
        {
          id: 'Nn2',
          width: 60,
          height: 30,
          layoutOptions: { 'org.eclipse.elk.algorithm': 'rectpacking' },
          children: [
            { id: 'Nn2.a', width: 60, height: 30 },
            { id: 'Nn2.b', width: 60, height: 30 },
          ],
        },
      ],
    }
    const out = layoutElkJson(input)
    const n2 = out.children!.find(c => c.id === 'Nn2')!
    // rectpacking 布局 Nn2 的子节点 (padding 15): 与 jar oracle Nn2 内容全等.
    expect(n2.width).toBe(90)
    expect(n2.height).toBe(105)
    const a = n2.children!.find(c => c.id === 'Nn2.a')!
    const b = n2.children!.find(c => c.id === 'Nn2.b')!
    expect(a.x).toBe(15)
    expect(a.y).toBe(15)
    expect(b.x).toBe(15)
    expect(b.y).toBe(60)
  })
})
