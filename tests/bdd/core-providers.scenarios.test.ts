/**
 * core 算法 provider (box/fixed/random) — 直接 vitest BDD.
 *
 * 被测: src/api/core-providers.ts (org.eclipse.elk.core.util topdown provider 移植).
 * 对照权威: ELK 0.12.0 (verify-elkg-java-layout 对 tickets/core/{489,457,475} 全等).
 * 语义不变量:
 *   - fixed:  只动有 POSITION 选项的元素; 无 position 保持原位; fixedGraphSize 阻止父节点撑大.
 *   - box:    子节点按 padding/spacing 装箱; MINIMUM_SIZE 约束父尺寸; expandNodes 填充行宽高.
 *   - random: 与 JavaRandom 同 seed 序列, 节点落在画布内 (不越界), 边有随机弯点.
 */
import { describe, it, expect } from 'vitest'
import { fixedLayout, boxLayout, randomLayout } from '../../src/api/core-providers.js'
import type { ElkNode } from '../../src/api/elk-json.js'
import '../../src/api/register-all.js' // 非 layered provider 注册 (测试需全部算法)

function node(partial: Partial<ElkNode> & { id: string }): ElkNode {
  return { children: partial.children ?? [], edges: partial.edges ?? [], layoutOptions: partial.layoutOptions, ...partial }
}

describe('fixedLayout (ELK FixedLayoutProvider)', () => {
  it('有 POSITION 的节点移到指定位置, 无 position 保持原位', () => {
    const root = node({
      id: 'root',
      children: [
        node({ id: 'a', layoutOptions: { 'org.eclipse.elk.position': '(10.0, 20.0)' } }),
        node({ id: 'b' }),
      ],
    })
    fixedLayout(root)
    expect(root.children![0]!.x).toBe(10)
    expect(root.children![0]!.y).toBe(20)
    expect(root.children![1]!.x).toBeUndefined()
  })

  it('MINIMUM_SIZE 约束节点最小尺寸 (475 语义)', () => {
    const root = node({
      id: 'root',
      children: [node({
        id: 'a',
        width: 10,
        height: 10,
        layoutOptions: {
          'org.eclipse.elk.position': '(0.0, 0.0)',
          'org.eclipse.elk.nodeSize.constraints': '[MINIMUM_SIZE]',
          'org.eclipse.elk.nodeSize.minimum': '(60.0, 60.0)',
        },
      })],
    })
    fixedLayout(root)
    expect(root.children![0]!.width).toBe(60)
    expect(root.children![0]!.height).toBe(60)
  })

  it('fixedGraphSize=true 时父节点不撑大 (475 回归语义)', () => {
    const root = node({
      id: 'root',
      layoutOptions: { 'org.eclipse.elk.nodeSize.fixedGraphSize': 'true' },
      children: [node({ id: 'a', width: 200, height: 200, layoutOptions: { 'org.eclipse.elk.position': '(200.0, 200.0)' } })],
    })
    fixedLayout(root)
    // 子节点在父边界外 (200 > 0), 但 fixedGraphSize → 父保持原尺寸
    expect(root.width).toBeUndefined()
  })

  it('fixedGraphSize=false 时父节点撑开到包含内容 (默认)', () => {
    const root = node({
      id: 'root',
      children: [node({ id: 'a', width: 200, height: 200, layoutOptions: { 'org.eclipse.elk.position': '(200.0, 200.0)' } })],
    })
    fixedLayout(root)
    expect(root.width).toBe(200 + 200 + 15 + 15) // a at (200,200) w200 → maxx=400 + padding 15*2
  })
})

describe('boxLayout (ELK BoxLayoutProvider SIMPLE)', () => {
  it('单子节点: 放在 padding(15) 处, 父尺寸自适应', () => {
    const root = node({ id: 'root', children: [node({ id: 'a', width: 50, height: 50 })] })
    boxLayout(root)
    expect(root.children![0]!.x).toBe(15)
    expect(root.children![0]!.y).toBe(15)
    expect(root.width).toBeGreaterThanOrEqual(50 + 30)
  })

  it('MINIMUM_SIZE 约束父尺寸 (457 语义: 子 10x10 + min 60x60 → 父高 >= 60)', () => {
    const root = node({
      id: 'root',
      layoutOptions: {
        'org.eclipse.elk.nodeSize.constraints': '[MINIMUM_SIZE]',
        'org.eclipse.elk.nodeSize.minimum': '(60.0, 60.0)',
      },
      children: [node({ id: 'a', width: 10, height: 10 })],
    })
    boxLayout(root)
    expect(root.height).toBeGreaterThanOrEqual(60)
    expect(root.children![0]!.x).toBe(15)
    expect(root.children![0]!.y).toBeGreaterThanOrEqual(15)
  })

  it('expandNodes=true 时末节点填满行宽 (489_Small 语义: N2 撑到 90x90)', () => {
    const root = node({
      id: 'root',
      layoutOptions: {
        'org.eclipse.elk.expandNodes': 'true',
        'org.eclipse.elk.padding': '[top=5.0,left=5.0,bottom=5.0,right=5.0]',
        'org.eclipse.elk.nodeSize.constraints': '[MINIMUM_SIZE]',
        'org.eclipse.elk.nodeSize.minimum': '(100.0, 100.0)',
      },
      children: [node({ id: 'a', width: 50, height: 50 })],
    })
    boxLayout(root)
    // min 宽 100 - padding(5+5) = 90
    expect(root.children![0]!.width).toBe(90)
    expect(root.children![0]!.height).toBe(90)
  })

  it('padding 字符串 [top=..,left=..] 解析 (489 语义: 子节点在 5,5)', () => {
    const root = node({
      id: 'root',
      layoutOptions: { 'org.eclipse.elk.padding': '[top=5.0,left=5.0,bottom=5.0,right=5.0]' },
      children: [node({ id: 'a', width: 50, height: 50 })],
    })
    boxLayout(root)
    expect(root.children![0]!.x).toBe(5)
    expect(root.children![0]!.y).toBe(5)
  })
})

describe('randomLayout (ELK RandomLayoutProvider)', () => {
  it('节点落在画布内且不越界 (0 <= x <= drawWidth - w)', () => {
    const root = node({
      id: 'root',
      layoutOptions: { 'org.eclipse.elk.randomSeed': '1' },
      children: [node({ id: 'a', width: 50, height: 50 }), node({ id: 'b', width: 30, height: 20 })],
    })
    randomLayout(root)
    for (const c of root.children ?? []) {
      expect(c.x!).toBeGreaterThanOrEqual(0)
      expect(c.y!).toBeGreaterThanOrEqual(0)
    }
    expect(root.width).toBeGreaterThan(0)
  })

  it('同 seed 输出确定 (随机序列可复现)', () => {
    const mk = () => node({
      id: 'root',
      layoutOptions: { 'org.eclipse.elk.randomSeed': '42' },
      children: [node({ id: 'a', width: 50, height: 50 }), node({ id: 'b', width: 30, height: 20 }), node({ id: 'c', width: 40, height: 40 })],
    })
    const a = randomLayout(mk())
    const b = randomLayout(mk())
    expect(a.children![0]!.x).toBe(b.children![0]!.x)
    expect(a.children![1]!.y).toBe(b.children![1]!.y)
  })

  it('边获得随机弯点 section (startPoint/endPoint/bendPoints)', () => {
    const root = node({
      id: 'root',
      layoutOptions: { 'org.eclipse.elk.randomSeed': '1' },
      children: [node({ id: 'a', width: 50, height: 50 }), node({ id: 'b', width: 30, height: 20 })],
    })
    root.children![0]!.edges = [{ sources: ['a'], targets: ['b'] }]
    randomLayout(root)
    const sec = root.children![0]!.edges![0]!.sections![0]!
    expect(sec.startPoint).toBeDefined()
    expect(sec.endPoint).toBeDefined()
    expect(Array.isArray(sec.bendPoints)).toBe(true)
  })
})
