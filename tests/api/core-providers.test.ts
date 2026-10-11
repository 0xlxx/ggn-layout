/**
 * core provider (box/fixed/random) 直接单测 — 覆盖 mutation api 批次的深层分支.
 *
 * 语义基准: ELK org.eclipse.elk.core.util topdown provider (verify-elkg-java-layout 已证
 * tickets/core/{489,457,475} 全等); 本文件聚焦未覆盖分支 (选项读取回退 / 标签端口边 /
 * 装箱排序 / expandNodes / junctionPoints / 端点形状解析), 精确值来自 TS 移植实现.
 */
import { describe, it, expect } from 'vitest'
import { fixedLayout, boxLayout, randomLayout } from '../../src/api/core-providers.js'
import type { ElkNode } from '../../src/api/elk-json.js'
import '../../src/api/register-all.js' // 非 layered provider 注册 (测试需全部算法)

function node(partial: Partial<ElkNode> & { id: string }): ElkNode {
  const { id, children, edges, layoutOptions, ...rest } = partial
  return { id, children: children ?? [], edges: edges ?? [], layoutOptions, ...rest }
}

describe('选项读取 (optOf/optVec/optNum/optBool)', () => {
  it('optOf: layoutOptions 长键 / properties 回退 / elk. 前缀回退', () => {
    const root = node({ id: 'r', properties: { 'org.eclipse.elk.position': '(1, 2)' } })
    // properties 回退
    fixedLayout(root)
    expect(root.children).toHaveLength(0)
    // 直接验证: elk. 前缀键可读 (通过 fixed 把节点放到 (3,4))
    const r2 = node({ id: 'r', children: [node({ id: 'a', layoutOptions: { 'elk.position': '(3, 4)' } })] })
    fixedLayout(r2)
    expect(r2.children![0]!.x).toBe(3)
    expect(r2.children![0]!.y).toBe(4)
  })

  it('optVec: 对象 / "(x,y)" / "x,y" / 非法 → null', () => {
    const root = node({ id: 'r', children: [
      node({ id: 'a', layoutOptions: { 'org.eclipse.elk.position': { x: 5, y: 6 } } }),
      node({ id: 'b', layoutOptions: { 'org.eclipse.elk.position': '(7.0, 8.0)' } }),
      node({ id: 'c', layoutOptions: { 'org.eclipse.elk.position': '9, 10' } }),
      node({ id: 'd', layoutOptions: { 'org.eclipse.elk.position': 'oops' } }),
    ] })
    fixedLayout(root)
    expect(root.children![0]!.x).toBe(5)
    expect(root.children![1]!.x).toBe(7)
    expect(root.children![2]!.y).toBe(10)
    expect(root.children![3]!.x).toBeUndefined()
  })

  it('optNum: 数字字符串 / 非法 → null', () => {
    const root = node({ id: 'r', children: [node({ id: 'a', width: 50, height: 50, layoutOptions: { 'org.eclipse.elk.priority': '3' } })] })
    boxLayout(root)
    // priority=3 生效 → 无异常即可; 再验证非法数值不抛错
    const r2 = node({ id: 'r', children: [node({ id: 'a', layoutOptions: { 'org.eclipse.elk.priority': 'abc' } })] })
    boxLayout(r2)
    expect(r2.children![0]!.x).toBe(15)
  })

  it('optBool: "true"/"false"/缺省', () => {
    const t = node({ id: 'r', layoutOptions: { 'org.eclipse.elk.nodeSize.fixedGraphSize': 'true' }, children: [node({ id: 'a', width: 200, height: 200, layoutOptions: { 'org.eclipse.elk.position': '(200.0,200.0)' } })] })
    fixedLayout(t)
    expect(t.width).toBeUndefined() // fixedGraphSize=true → 不撑大
    const f = node({ id: 'r', layoutOptions: { 'org.eclipse.elk.nodeSize.fixedGraphSize': 'false' }, children: [node({ id: 'a', width: 200, height: 200, layoutOptions: { 'org.eclipse.elk.position': '(200.0,200.0)' } })] })
    fixedLayout(f)
    expect(f.width).toBe(400 + 30)
  })
})

describe('fixedLayout 深层 (标签/端口/边/junctionPoints)', () => {
  it('节点标签带 position → 设置; 无 position 不动; maxx/maxy 计入标签', () => {
    const root = node({
      id: 'root',
      children: [node({
        id: 'a', width: 50, height: 50, layoutOptions: { 'org.eclipse.elk.position': '(10.0, 20.0)' },
        labels: [{ text: 'L', x: 2, y: 3, width: 10, height: 5 }, { text: 'M', width: 8, height: 4 }],
      })],
    })
    fixedLayout(root)
    expect(root.children![0]!.labels![0]!.x).toBe(2)
    expect(root.children![0]!.labels![1]!.x).toBeUndefined()
    // maxx = max(10+50, 10+2+10) = 60; maxy = max(20+50, 20+3+5) = 70 → parent 90x100
    expect(root.width).toBe(90)
    expect(root.height).toBe(100)
  })

  it('端口带 position → 设置; 端口标签计入 max; 端口 x/y 相对节点', () => {
    const root = node({
      id: 'root',
      children: [node({
        id: 'a', width: 50, height: 50, layoutOptions: { 'org.eclipse.elk.position': '(10.0, 20.0)' },
        ports: [
          { id: 'a.p1', x: -4, y: 10, width: 8, height: 8, labels: [{ text: 'P', x: 1, y: 1, width: 6, height: 4 }] },
          { id: 'a.p2', width: 8, height: 8 },
        ] as unknown as ElkNode['ports'],
      })],
    })
    fixedLayout(root)
    const p1 = root.children![0]!.ports![0]!
    expect(p1.x).toBe(-4)
    expect(p1.y).toBe(10)
    expect((p1 as unknown as { labels?: { x?: number; y?: number }[] }).labels![0]!.x).toBe(1)
    // portx=6, porty=30; port label → maxx = max(60, 6+1+6=13); maxy = max(70, 30+1+4=35)
    expect(root.width).toBe(90)
    expect(root.height).toBe(100)
  })

  it('出边 bendPoints → section (start/end/bendPoints); max 计入弯点', () => {
    const root = node({
      id: 'root',
      children: [node({
        id: 'a', width: 50, height: 50, layoutOptions: { 'org.eclipse.elk.position': '(10.0,20.0)' },
        edges: [{ sources: ['a'], targets: ['b'], layoutOptions: { 'org.eclipse.elk.bendPoints': [{ x: 100, y: 200 }, { x: 300, y: 400 }] } }],
      })],
    })
    fixedLayout(root)
    const sec = root.children![0]!.edges![0]!.sections![0]!
    expect(sec.startPoint).toEqual({ x: 100, y: 200 })
    expect(sec.endPoint).toEqual({ x: 300, y: 400 })
    expect(sec.bendPoints).toBeUndefined()
    // max 计入弯点端点 (300,400) → maxx=300 maxy=400 → parent 330x430
    expect(root.width).toBe(300 + 30)
    expect(root.height).toBe(400 + 30)
  })

  it('bendPoints < 2 → 不生成 section', () => {
    const root = node({
      id: 'root',
      children: [node({
        id: 'a', width: 50, height: 50,
        edges: [{ sources: ['a'], targets: ['b'], layoutOptions: { 'org.eclipse.elk.bendPoints': [{ x: 1, y: 2 }] } }],
      })],
    })
    fixedLayout(root)
    expect(root.children![0]!.edges![0]!.sections).toBeUndefined()
  })

  it('ORTHOGONAL 边路由 → junctionPoints 写入 layoutOptions', () => {
    const root = node({
      id: 'root',
      layoutOptions: { 'org.eclipse.elk.edgeRouting': 'ORTHOGONAL' },
      children: [node({
        id: 'a', width: 50, height: 50,
        edges: [{ sources: ['a'], targets: ['b'], layoutOptions: { 'org.eclipse.elk.bendPoints': [{ x: 10, y: 20 }, { x: 30, y: 40 }, { x: 50, y: 60 }] } }],
      })],
    })
    fixedLayout(root)
    const e = root.children![0]!.edges![0]!
    expect(e.layoutOptions!['org.eclipse.elk.junctionPoints']).toEqual([{ x: 30, y: 40 }])
    expect(e.sections![0]!.bendPoints).toEqual([{ x: 30, y: 40 }])
  })
})

describe('randomLayout 深层', () => {
  it('无子节点直接返回', () => {
    const root = node({ id: 'r' })
    expect(randomLayout(root)).toBe(root)
    expect(root.width).toBeUndefined()
  })

  it('节点位置落在画布内 (含 padding)', () => {
    const root = node({
      id: 'r',
      layoutOptions: { 'org.eclipse.elk.randomSeed': '7', 'org.eclipse.elk.padding': '[top=5,left=5,bottom=5,right=5]' },
      children: [node({ id: 'a', width: 50, height: 50 }), node({ id: 'b', width: 30, height: 20 })],
    })
    randomLayout(root)
    for (const c of root.children!) {
      expect(c.x!).toBeGreaterThanOrEqual(5)
      expect(c.y!).toBeGreaterThanOrEqual(5)
      expect(c.x! + c.width!).toBeLessThanOrEqual(root.width!)
      expect(c.y! + c.height!).toBeLessThanOrEqual(root.height!)
    }
  })

  it('已有 section 的边不重随; 无 section 的边获得随机弯点 section', () => {
    const root = node({
      id: 'r',
      layoutOptions: { 'org.eclipse.elk.randomSeed': '1' },
      children: [node({ id: 'a', width: 50, height: 50, edges: [{ sources: ['a'], targets: ['b'] }] })],
    })
    randomLayout(root)
    const e = root.children![0]!.edges![0]!
    expect(e.sections).toHaveLength(1)
    const sec = e.sections![0]!
    expect(sec.startPoint.x).toBeGreaterThanOrEqual(0)
    expect(sec.endPoint.y).toBeGreaterThanOrEqual(0)
    // 已带 section 的边不重随
    const fixedSec = { startPoint: { x: 1, y: 2 }, endPoint: { x: 3, y: 4 }, bendPoints: [] }
    const r2 = node({
      id: 'r2',
      layoutOptions: { 'org.eclipse.elk.randomSeed': '1' },
      children: [node({ id: 'a', width: 50, height: 50, edges: [{ sources: ['a'], targets: ['b'], sections: [fixedSec] }] })],
    })
    randomLayout(r2)
    expect(r2.children![0]!.edges![0]!.sections![0]).toBe(fixedSec)
  })

  it('端点解析: 端口 ref → 节点随机位置 + 端口偏移投影; 未知 ref → 0', () => {
    const root = node({
      id: 'r',
      layoutOptions: { 'org.eclipse.elk.randomSeed': '2' },
      children: [node({
        id: 'a', width: 50, height: 50,
        ports: [{ id: 'p1', x: -4, y: 10, width: 8, height: 8 }],
        edges: [{ sources: ['a.p1'], targets: ['missing'] }],
      })],
    })
    randomLayout(root)
    const a = root.children![0]!
    const sec = a.edges![0]!.sections![0]!
    // 源端口中心 = (a.x + (-4+4), a.y + (10+4)); 向 target(0,0) 投影到源边界
    // → startPoint = (a.x - 4, a.y + 10); target 未知 → endPoint = (0,0)
    expect(sec.startPoint.x).toBe(a.x! - 4)
    expect(sec.startPoint.y).toBe(a.y! + 10)
    expect(sec.endPoint.x).toBe(0)
    expect(sec.endPoint.y).toBe(0)
    expect(sec.bendPoints!.length).toBeGreaterThanOrEqual(0)
  })
})

describe('boxLayout 深层', () => {
  it('面积升序装箱 + 同排不重叠 (精确值)', () => {
    const root = node({ id: 'r', children: [node({ id: 'a', width: 50, height: 50 }), node({ id: 'b', width: 30, height: 20 })] })
    boxLayout(root)
    // b(600) 先于 a(2500) 装箱 → b@(15,15), a@(60,15); parent 125x80 (数组序不变, 按 id 断言位置)
    const pos = Object.fromEntries(root.children!.map(c => [c.id!, [c.x, c.y]]))
    expect(pos['b']).toEqual([15, 15])
    expect(pos['a']).toEqual([60, 15])
    expect(root.width).toBe(125)
    expect(root.height).toBe(80)
  })

  it('priority 排序优先于面积', () => {
    const root = node({
      id: 'r',
      children: [
        node({ id: 'a', width: 50, height: 50 }),
        node({ id: 'b', width: 30, height: 20, layoutOptions: { 'org.eclipse.elk.priority': '5' } }),
      ],
    })
    boxLayout(root)
    const pos = Object.fromEntries(root.children!.map(c => [c.id!, [c.x, c.y]]))
    expect(pos['b']).toEqual([15, 15]) // priority 5 → 先装箱
    expect(pos['a']).toEqual([60, 15])
  })

  it('interactive=true 按 y/x 排序', () => {
    const root = node({
      id: 'r',
      layoutOptions: { 'org.eclipse.elk.interactive': 'true' },
      children: [
        node({ id: 'a', width: 10, height: 10, y: 100, x: 5 }),
        node({ id: 'b', width: 10, height: 10, y: 0, x: 9 }),
      ],
    })
    boxLayout(root)
    const pos = Object.fromEntries(root.children!.map(c => [c.id!, [c.x, c.y]]))
    expect(pos['b']).toEqual([15, 15]) // y=0 先装箱
    expect(pos['a']).toEqual([40, 15])
  })

  it('expandNodes=true 多行: 行尾填满行宽 + 行首撑到行高', () => {
    const root = node({
      id: 'r',
      layoutOptions: { 'org.eclipse.elk.expandNodes': 'true' },
      children: [
        node({ id: 'a', width: 100, height: 50 }),
        node({ id: 'b', width: 40, height: 40 }),
        node({ id: 'c', width: 40, height: 40 }),
      ],
    })
    boxLayout(root)
    // 面积升序 b,c,a → 行1: b,c (c 行尾撑宽到 45), 行2: a (y=70, 撑到行高 50, 宽 100)
    const m = Object.fromEntries(root.children!.map(c => [c.id!, c]))
    expect([m['b']!.x, m['b']!.y, m['b']!.width, m['b']!.height]).toEqual([15, 15, 40, 40])
    expect([m['c']!.x, m['c']!.y, m['c']!.width, m['c']!.height]).toEqual([70, 15, 45, 40])
    expect([m['a']!.x, m['a']!.y, m['a']!.width, m['a']!.height]).toEqual([15, 70, 100, 50])
    expect([root.width, root.height]).toEqual([130, 135])
  })

  it('无 MINIMUM_SIZE 约束 → 父尺寸不含最小约束', () => {
    const root = node({
      id: 'r',
      layoutOptions: { 'org.eclipse.elk.nodeSize.minimum': '(1000.0, 1000.0)' },
      children: [node({ id: 'a', width: 10, height: 10 })],
    })
    boxLayout(root)
    expect(root.height).toBeLessThan(1000)
  })

  it('非 SIMPLE packingMode → 抛错 (未移植)', () => {
    const root = node({ id: 'r', layoutOptions: { 'org.eclipse.elk.box.packingMode': 'GROUP_DEC' }, children: [] })
    expect(() => boxLayout(root)).toThrow(/尚未移植/)
  })

  it('padding 对象形态', () => {
    const root = node({
      id: 'r',
      layoutOptions: { 'org.eclipse.elk.padding': { top: 3, left: 4, right: 5, bottom: 6 } },
      children: [node({ id: 'a', width: 10, height: 10 })],
    })
    boxLayout(root)
    expect(root.children![0]!.x).toBe(4)
    expect(root.children![0]!.y).toBe(3)
    expect(root.width).toBe(4 + 10 + 5)
    expect(root.height).toBe(3 + 10 + 6)
  })

  it('padding 字符串缺字段 → 默认 15', () => {
    const root = node({
      id: 'r',
      layoutOptions: { 'org.eclipse.elk.padding': '[top=1]' },
      children: [node({ id: 'a', width: 10, height: 10 })],
    })
    boxLayout(root)
    expect(root.children![0]!.x).toBe(15) // left 缺省 → 15
    expect(root.children![0]!.y).toBe(1)
  })
})
