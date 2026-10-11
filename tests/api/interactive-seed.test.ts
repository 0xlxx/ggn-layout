/**
 * 输入节点 x/y 种子 LNode 位置 (ELK ElkGraphImporter.transformNode 0.12.0:913-914).
 *
 * 语义: JSON API 输入节点 x/y → LNode.position, INTERACTIVE 系列策略读它:
 *   - InteractiveLayerer (P2) 按 position.x 分层
 *   - InteractiveCycleBreaker (P1) 按 position 判定反馈边
 *   - InteractiveCrossingMinimizer (P3) 按 position 定序
 * 缺种子时输入伪坐标全部丢失 (层号退化, 增量布局失效).
 *
 * 断言口径 (可观察行为): INTERACTIVE layering 下输出 x 顺序 = 输入 x 顺序
 * (合法拓扑序时), 与未种子 (x 全 0) 的 BFS 层序可区分; 非 INTERACTIVE 策略
 * 不受种子影响 (输出与无 x/y 输入一致).
 */
import { describe, expect, it } from 'vitest'
import { layoutElkJson } from '../../src/public.js'
import type { ElkNode } from '../../src/public.js'

const INTERACTIVE = {
  'org.eclipse.elk.layered.layering.strategy': 'INTERACTIVE',
}

/** 菱形图: a→b, a→c, b→d, c→d (单连通分量). xs = [a,b,c,d] 输入 x. */
function diamond(xs: [number, number, number, number], extraOpts: Record<string, string> = {}): ElkNode {
  return {
    id: 'root',
    children: ['a', 'b', 'c', 'd'].map((id, i) => ({ id, width: 30, height: 30, x: xs[i], y: 0 })),
    edges: [
      { id: 'e1', sources: ['a'], targets: ['b'] },
      { id: 'e2', sources: ['a'], targets: ['c'] },
      { id: 'e3', sources: ['b'], targets: ['d'] },
      { id: 'e4', sources: ['c'], targets: ['d'] },
    ],
    layoutOptions: { ...INTERACTIVE, ...extraOpts },
  }
}

function xOrder(out: ElkNode): string[] {
  return [...(out.children ?? [])].sort((p, q) => (p.x ?? 0) - (q.x ?? 0)).map((c) => c.id)
}

describe('输入 x/y 种子 (ElkGraphImporter.transformNode)', () => {
  it('INTERACTIVE layering: 输入 x 顺序 (合法拓扑序) 决定输出层序', () => {
    // x: a=0, c=50, b=200, d=400 — 拓扑合法且与 BFS 层序 (a,b,c,d) 不同.
    const out = layoutElkJson(diamond([0, 200, 50, 400]))
    const at = (id: string) => out.children!.find((c) => c.id === id)!
    expect(xOrder(out)).toEqual(['a', 'c', 'b', 'd'])
    // b/c 处于不同层 (x 不同) — 种子分层生效的直接证据.
    expect(at('b').x).not.toBe(at('c').x)
  })

  it('未种子 (x 全 0) 退化为拓扑修正层序: b/c 同层, 与种子输出可区分', () => {
    const out = layoutElkJson(diamond([0, 0, 0, 0]))
    const at = (id: string) => out.children!.find((c) => c.id === id)!
    // 全 0 种子 → 单 span → 拓扑修正 → b/c 同层 (x 相同); 种子时 b/c 不同层.
    expect(at('b').x).toBe(at('c').x)
    expect(xOrder(out)).toEqual(['a', 'c', 'b', 'd'])
  })

  it('反向边: 拓扑修正把目标移到下一层 (种子不破坏层序不变量)', () => {
    // a@400 是 b@0 的目标 (反向), 修正后 b 在 a 右侧.
    const out = layoutElkJson({
      id: 'root',
      children: [
        { id: 'a', width: 30, height: 30, x: 400, y: 0 },
        { id: 'b', width: 30, height: 30, x: 0, y: 0 },
      ],
      edges: [{ id: 'e1', sources: ['a'], targets: ['b'] }],
      layoutOptions: INTERACTIVE,
    })
    expect(xOrder(out)).toEqual(['a', 'b'])
  })

  it('默认策略 (NETWORK_SIMPLEX) 不受种子影响: 输出与无 x/y 一致', () => {
    const seeded = layoutElkJson(diamond([0, 200, 50, 400], { 'org.eclipse.elk.layered.layering.strategy': '' }))
    const plain = layoutElkJson({
      id: 'root',
      children: ['a', 'b', 'c', 'd'].map((id) => ({ id, width: 30, height: 30 })),
      edges: [
        { id: 'e1', sources: ['a'], targets: ['b'] },
        { id: 'e2', sources: ['a'], targets: ['c'] },
        { id: 'e3', sources: ['b'], targets: ['d'] },
        { id: 'e4', sources: ['c'], targets: ['d'] },
      ],
    })
    const s = seeded.children!.map((c) => `${c.id}@${c.x}`)
    const p = plain.children!.map((c) => `${c.id}@${c.x}`)
    expect(s).toEqual(p)
  })
})
