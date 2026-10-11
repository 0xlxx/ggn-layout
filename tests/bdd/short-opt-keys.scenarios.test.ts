/**
 * R55 回归: shortOptKeys 对 elkjs 短键 (elk.*) 的映射.
 *
 * 背景: shortOptKeys 只匹配 OPT_MAP 的 ggn 全键 (org.eclipse.elk.*),
 * `elk.randomSeed` (elkjs 短键风格) 不命中 → fallback 原样输出 `elk.randomSeed`
 * → 消费端 parsed.graphProps.randomSeed 读不到 → RANDOM_SEED 恒为默认 1.
 * 测试曾因此假绿 (永远 seed=1).
 *
 * 规格:
 *   - shortOptKeys 把 elkjs 短键 `elk.randomSeed` → 短键 `randomSeed` (与 ggn 全键同);
 *   - 布局级: elk.randomSeed=N 与 org.eclipse.elk.randomSeed=N 输出坐标一致 (短键生效且值正确传入);
 *   - 值确实传入: seed=2 输出 ≠ seed=1 输出 (防"两键都塌成默认"假绿);
 *   - 短键与全键混用时行为合理 (互不干扰).
 */
import { describe, expect, it } from 'vitest'
import ELK from 'elkjs/lib/elk.bundled.js'
import { layoutElkJson } from '../../src/api/index.js'
import { shortOptKeys } from '../../shared/elkgraph-builder.js'

const elk = new ELK()

/** 递归收集节点世界坐标. */
function collectNodes(root: { children?: any[] }, px = 0, py = 0): Map<string, { x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>()
  const walk = (list: any[] | undefined, ax: number, ay: number): void => {
    for (const c of list ?? []) {
      const wx = ax + (c.x ?? 0), wy = ay + (c.y ?? 0)
      out.set(c.id, { x: wx, y: wy })
      if (c.children) walk(c.children, wx, wy)
    }
  }
  walk(root.children, px, py)
  return out
}

/** 种子敏感的 8 节点分层图 (elkjs 实测 seed=1 与 seed=2 8/8 节点坐标不同). */
function seedGraph(seed: string | number, extra?: Record<string, unknown>): any {
  const children = []
  for (let i = 0; i < 8; i++) children.push({ id: 'n' + i, width: 40, height: 20 })
  const edges = [
    { id: 'e0', sources: ['n0'], targets: ['n4'] },
    { id: 'e1', sources: ['n1'], targets: ['n4'] },
    { id: 'e2', sources: ['n1'], targets: ['n5'] },
    { id: 'e3', sources: ['n2'], targets: ['n5'] },
    { id: 'e4', sources: ['n2'], targets: ['n6'] },
    { id: 'e5', sources: ['n3'], targets: ['n6'] },
    { id: 'e6', sources: ['n3'], targets: ['n7'] },
    { id: 'e7', sources: ['n0'], targets: ['n7'] },
    { id: 'e8', sources: ['n4'], targets: ['n5'] },
    { id: 'e9', sources: ['n5'], targets: ['n6'] },
    { id: 'e10', sources: ['n6'], targets: ['n7'] },
  ]
  return { id: 'root', layoutOptions: { 'elk.algorithm': 'org.eclipse.elk.layered', ...extra }, children, edges }
}

function posMap(o: Map<string, { x: number; y: number }>): Record<string, { x: number; y: number }> {
  return Object.fromEntries([...o.entries()].sort(([a], [b]) => a.localeCompare(b)))
}

describe('R55: shortOptKeys elkjs 短键映射', () => {
  it('shortOptKeys: elk.* 短键 → OPT_MAP 短键 (与 ggn 全键同)', () => {
    const k: Record<string, unknown> = shortOptKeys({ 'elk.randomSeed': 2, 'org.eclipse.elk.randomSeed': 5, 'elk.direction': 'DOWN', foo: 1 })
    expect(k['randomSeed']).toBe(5) // 全键最后写入覆盖 elk 短键 (Object.entries 序)
    expect(k.foo).toBe(1)
    expect(Object.keys(k)).not.toContain('elk.randomSeed')
  })

  it('shortOptKeys: 仅 elk 短键时映射为 randomSeed', () => {
    const k: Record<string, unknown> = shortOptKeys({ 'elk.randomSeed': 2 })
    expect(k['randomSeed']).toBe(2)
    expect(Object.keys(k)).not.toContain('elk.randomSeed')
  })

  it('布局: elk.randomSeed=2 与 org.eclipse.elk.randomSeed=2 坐标一致', () => {
    const a = posMap(collectNodes(layoutElkJson(seedGraph(2, { 'elk.randomSeed': 2 }))))
    const b = posMap(collectNodes(layoutElkJson(seedGraph(2, { 'org.eclipse.elk.randomSeed': 2 }))))
    expect(a).toEqual(b)
  })

  it('布局: elk.randomSeed=5 与 org.eclipse.elk.randomSeed=5 坐标一致', () => {
    const a = posMap(collectNodes(layoutElkJson(seedGraph(5, { 'elk.randomSeed': 5 }))))
    const b = posMap(collectNodes(layoutElkJson(seedGraph(5, { 'org.eclipse.elk.randomSeed': 5 }))))
    expect(a).toEqual(b)
  })

  it('布局: 值确实传入 (elk.randomSeed=2 输出 ≠ seed=1 默认输出)', () => {
    const s1 = posMap(collectNodes(layoutElkJson(seedGraph(1, { 'elk.randomSeed': 1 }))))
    const s2 = posMap(collectNodes(layoutElkJson(seedGraph(2, { 'elk.randomSeed': 2 }))))
    expect(s2).not.toEqual(s1)
  })

  it('布局: 短键与全键混用 (elk.randomSeed + org...direction) 行为一致', () => {
    const mix = posMap(collectNodes(layoutElkJson(seedGraph(2, {
      'elk.randomSeed': 2, 'org.eclipse.elk.direction': 'DOWN',
    }))))
    const full = posMap(collectNodes(layoutElkJson(seedGraph(2, {
      'org.eclipse.elk.randomSeed': 2, 'org.eclipse.elk.direction': 'DOWN',
    }))))
    expect(mix).toEqual(full)
  })

  it('elkjs 交叉验证: elkjs 自身两键等价, 且 ggn elk 短键输出与 elkjs 一致', async () => {
    const eShort = posMap(collectNodes(await elk.layout(seedGraph(2, { 'elk.randomSeed': 2 }))))
    const eFull = posMap(collectNodes(await elk.layout(seedGraph(2, { 'org.eclipse.elk.randomSeed': 2 }))))
    expect(eShort).toEqual(eFull)
    const gShort = posMap(collectNodes(layoutElkJson(seedGraph(2, { 'elk.randomSeed': 2 }))))
    expect(gShort).toEqual(eShort)
  })
})
