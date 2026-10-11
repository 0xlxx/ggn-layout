/**
 * R47 回归: black-box 子树内部边输出 container 字段 (LCA 容器 id).
 *
 * SSOT 实证 (ELK Java 0.12.0 jar + elkjs 0.12.0, scripts/elk-java-debug/LayoutJsonMain):
 *   - jar: 黑盒内部边嵌套在 black-box 节点的 `edges` 数组下 (无显式 container 字段,
 *     容器由嵌套位置表达; 嵌套 box 实证 e 落在其 LCA 容器的 edges). 证据: 带内部边的
 *     box / rectpacking 模型跑 LayoutJsonMain, 边出现在 box.edges / rp.edges.
 *   - elkjs (elk.bundled 0.12.0): 边留在 root.edges, 但每条边带显式 `container` = LCA
 *     容器 id (box 内部边 container="box", rectpacking 内部边 container="rp").
 *   - ggn layoutElkJson: 边嵌套在 black-box 节点 edges (jar 式); layered 边已带 container
 *     (extractGraph LCA 语义), 但黑盒内部边此前缺 container (R47 bug) → mergeBlackBoxSubtrees
 *     补上, 值 = 黑盒节点 id (LCA), 与 elkjs 的 container 值一致.
 */
import { describe, expect, it } from 'vitest'
import ELK from 'elkjs/lib/elk.bundled.js'
import { layoutElkJson, type ElkNode } from '../../src/api/elk-json.js'
import '../../src/api/register-all.js' // 非 layered provider 注册 (测试需全部算法)

const deepCopy = <T,>(o: T): T => JSON.parse(JSON.stringify(o)) as T

/** elkjs 独立实例 per 调用 (共享 ELK worker 并发串扰 → 间歇失败). */
function elkLayout(input: ElkNode): Promise<any> {
  return new ELK().layout(deepCopy(input) as any)
}

/** box 黑盒 (3 子节点) + 2 条内部边 + 1 个外部孤立节点 x. */
function boxInput(): ElkNode {
  return {
    id: 'root',
    layoutOptions: { 'org.eclipse.elk.randomSeed': '1', 'org.eclipse.elk.hierarchyHandling': 'INCLUDE_CHILDREN' },
    children: [
      {
        id: 'box',
        layoutOptions: { 'org.eclipse.elk.algorithm': 'org.eclipse.elk.box' },
        children: [
          { id: 'box.a', width: 30, height: 30 },
          { id: 'box.b', width: 30, height: 30 },
          { id: 'box.c', width: 30, height: 30 },
        ],
      },
      { id: 'x', width: 30, height: 30 },
    ],
    edges: [
      { id: 'e1', sources: ['box.a'], targets: ['box.b'] },
      { id: 'e2', sources: ['box.b'], targets: ['box.c'] },
    ],
  }
}

/** rectpacking 黑盒 (3 子节点) + 2 条内部边. */
function rectInput(): ElkNode {
  return {
    id: 'root',
    layoutOptions: { 'org.eclipse.elk.randomSeed': '1', 'org.eclipse.elk.hierarchyHandling': 'INCLUDE_CHILDREN' },
    children: [
      {
        id: 'rp',
        layoutOptions: { 'org.eclipse.elk.algorithm': 'org.eclipse.elk.rectpacking' },
        children: [
          { id: 'rp.a', width: 40, height: 40 },
          { id: 'rp.b', width: 40, height: 40 },
          { id: 'rp.c', width: 40, height: 40 },
        ],
      },
    ],
    edges: [
      { id: 'e1', sources: ['rp.a'], targets: ['rp.b'] },
      { id: 'e2', sources: ['rp.b'], targets: ['rp.c'] },
    ],
  }
}

/** 全树边收集: id → 边对象 (含 container). */
function edgesOf(node: ElkNode): Map<string, Record<string, unknown>> {
  const out = new Map<string, Record<string, unknown>>()
  const walk = (n: ElkNode): void => {
    for (const e of n.edges ?? []) out.set(String(e.id), e as unknown as Record<string, unknown>)
    for (const c of n.children ?? []) walk(c)
  }
  walk(node)
  return out
}

describe('R47 black-box 子树内部边 container (LCA 容器 id)', () => {
  it('box 黑盒内部边: 输出含 container=box, 边嵌套在 box.edges (jar 式)', () => {
    const out = layoutElkJson(deepCopy(boxInput()))
    const box = out.children!.find((c) => c.id === 'box')!
    expect(box.edges?.length).toBe(2)
    for (const e of box.edges!) {
      expect(e.container, `边 ${e.id} container`).toBe('box')
      expect(e.sources?.[0]).toBeDefined()
      expect(e.targets?.[0]).toBeDefined()
    }
    // 内部边不泄漏到 root (jar 嵌套语义, 与 layered 根边区分)
    expect(out.edges).toBeUndefined()
  })

  it('rectpacking 黑盒内部边: 输出含 container=rp', () => {
    const out = layoutElkJson(deepCopy(rectInput()))
    const rp = out.children!.find((c) => c.id === 'rp')!
    expect(rp.edges?.length).toBe(2)
    for (const e of rp.edges!) {
      expect(e.container, `边 ${e.id} container`).toBe('rp')
    }
  })

  it('与 elkjs 0.12.0 逐边对拍: container 值一致 (box + rectpacking)', async () => {
    for (const mk of [boxInput, rectInput]) {
      const ggn = layoutElkJson(deepCopy(mk()))
      const elk = await elkLayout(mk())
      const ggnEdges = edgesOf(ggn)
      const elkEdges = edgesOf(elk)
      expect(ggnEdges.size, `ggn 边数 (${mk.name})`).toBe(elkEdges.size)
      for (const [id, ee] of elkEdges) {
        expect(ggnEdges.has(id), `ggn 缺边 ${id}`).toBe(true)
        expect(ggnEdges.get(id)!.container, `边 ${id} container 与 elkjs 一致`).toBe(ee.container)
      }
    }
  })

  it('输入边自带旧 container (elkjs 输出复用为输入) → 覆盖为黑盒 LCA id', () => {
    const input = boxInput()
    input.edges![0]!.container = 'root' // 旧/错误 container
    const out = layoutElkJson(deepCopy(input))
    const box = out.children!.find((c) => c.id === 'box')!
    expect(box.edges![0]!.id).toBe('e1')
    expect(box.edges![0]!.container).toBe('box')
  })
})
