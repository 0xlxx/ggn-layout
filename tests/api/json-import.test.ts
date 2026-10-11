/**
 * JSON 导入对齐测试 (回归: api buildGraph 委托共享 builder = 单一 JSON→LGraph 源).
 *
 * 背景 (verify-elkg-java-layout 全量 348 实测): api 路径此前是第 4 份简化 JSON→LGraph
 * 实现, 156 模型与 Java 布局输出分歧; 委托 shared/elkgraph-builder (buildLGraphFromParsed)
 * 后 267/348 全等 (节点差异 119→5). 本文件锁住转换语义不变量:
 *   - stripNPrefix:false → 任意 ELK JSON 的 id 原样保留 (公开 API 契约);
 *   - 递归收集容器边 (任意 JSON 边可挂在嵌套容器, 不要求 elktToElkJson 的 root 提升);
 *   - layoutElkJson 输出 id/端点与输入一致, 与 elkjs 对齐.
 */
import { describe, expect, it } from 'vitest'
import ELK from 'elkjs/lib/elk.bundled.js'
import { buildGraph, layoutElkJson, type ElkNode } from '../../src/api/index.js'
import { elkJsonToParsed } from '../../shared/elkgraph-builder.js'

const elk = new ELK()

describe('elkJsonToParsed stripNPrefix (任意 ELK JSON id 保真)', () => {
  it('stripNPrefix:false 保留以 N 开头与含点的 id (公开 API 任意 JSON 契约)', () => {
    const parsed = elkJsonToParsed(
      { id: 'root', children: [{ id: 'Network' }, { id: 'a.b' }] },
      { stripNPrefix: false },
    )
    expect(parsed.nodes).toEqual(['Network', 'a.b'])
  })

  it('默认 (stripNPrefix:true) 保持 elktToElkJson 的 N 前缀剥离契约', () => {
    const parsed = elkJsonToParsed({ id: 'root', children: [{ id: 'N1' }, { id: 'N2' }] })
    expect(parsed.nodes).toEqual(['1', '2'])
  })
})

describe('elkJsonToParsed 递归收集容器边', () => {
  it('嵌套容器 edges 被收集 (任意 JSON 边可挂在容器, 不依赖 root 提升)', () => {
    const parsed = elkJsonToParsed({
      id: 'root',
      children: [{
        id: 'P',
        children: [{ id: 'X' }, { id: 'Y' }],
        edges: [{ sources: ['X'], targets: ['Y'] }],
      }],
    }, { stripNPrefix: false })
    expect(parsed.edges).toHaveLength(1)
    expect(parsed.edges[0]!.slice(0, 4)).toEqual(['X', null, 'Y', null])
  })
})

describe('buildGraph 委托共享 builder (单一 JSON→LGraph 源)', () => {
  it('layoutElkJson 输出 id 与输入一致 (含 N 开头节点 + 隐式边)', () => {
    const input: ElkNode = {
      id: 'root',
      layoutOptions: { 'org.eclipse.elk.direction': 'RIGHT' },
      children: [
        { id: 'Network', width: 40, height: 20 },
        { id: 'N2', width: 40, height: 20 },
      ],
      edges: [{ id: 'e0', sources: ['Network'], targets: ['N2'] }],
    }
    const out = layoutElkJson(input)
    expect(out.children!.map((c) => c.id)).toEqual(['Network', 'N2'])
    expect(out.edges![0]!.sources[0]).toBe('Network')
    expect(out.edges![0]!.targets[0]).toBe('N2')
  })

  it('buildGraph nodeRef/nodeOf 保留输入 id', () => {
    const built = buildGraph({ id: 'root', children: [{ id: 'N1' }, { id: 'N2' }] } as ElkNode)
    expect([...built.nodeRef.values()].sort()).toEqual(['N1', 'N2'])
    expect([...built.nodeOf.keys()].sort()).toEqual(['N1', 'N2'])
  })

  it('容器内边 (arbitrary JSON) 布局结果对齐 elkjs', async () => {
    const input: ElkNode = {
      id: 'root',
      layoutOptions: { 'org.eclipse.elk.direction': 'RIGHT', 'org.eclipse.elk.hierarchyHandling': 'INCLUDE_CHILDREN' },
      children: [{
        id: 'P', width: 120, height: 80,
        children: [
          { id: 'X', width: 30, height: 20 },
          { id: 'Y', width: 30, height: 20 },
        ],
        edges: [{ id: 'e0', sources: ['X'], targets: ['Y'] }],
      }],
    }
    const ggn = layoutElkJson(input)
    const elkjs = await elk.layout(JSON.parse(JSON.stringify(input)) as Parameters<typeof elk.layout>[0])
    const gKids = ggn.children![0]!.children!.map((c) => [c.id, c.x, c.y])
    const eKids = elkjs.children![0]!.children!.map((c) => [c.id, c.x, c.y])
    expect(gKids).toEqual(eKids)
    // 边 e0 挂容器 P (两端同容器 → LCA = P)
    expect(ggn.children![0]!.edges?.[0]?.sources[0]).toBe('X')
    expect(elkjs.children![0]!.edges?.[0]?.sources[0]).toBe('X')
  })
})

describe('layoutElkJson 算法分派 (非 layered: box/fixed/random 已移植, 其余明确报错)', () => {
  it('algorithm=box → 运行 box provider (黑盒, 不再静默跑 layered)', () => {
    const input: ElkNode = {
      id: 'root',
      children: [{
        id: 'N1',
        layoutOptions: { 'org.eclipse.elk.algorithm': 'org.eclipse.elk.box' },
        children: [{ id: 'N2', width: 50, height: 50 }],
      }],
    }
    const out = layoutElkJson(input)
    // box: N1 撑开装下 N2 + padding 15, 子节点合并回输出.
    expect(out.children![0]!.width).toBe(80)
    expect(out.children![0]!.children![0]!.x).toBe(15)
  })

  it('algorithm=stress (leaf, 无子节点) → 不调用 provider, 由 layered 布局 (Java RecursiveGraphLayoutEngine 语义)', () => {
    // elkjs 实测: leaf+stress N1 x=12 y=12 width=0 (不调用 stress, 空图 force 会崩).
    const input: ElkNode = {
      id: 'root',
      children: [{ id: 'N1', layoutOptions: { 'org.eclipse.elk.algorithm': 'org.eclipse.elk.stress' } }],
    }
    const out = layoutElkJson(input)
    expect(out.children![0]!.x).toBe(12)
    expect(out.children![0]!.y).toBe(12)
  })

  it('algorithm=stress (有子节点) → 调用 stress provider 布局子树', () => {
    const input: ElkNode = {
      id: 'root',
      children: [{ id: 'N1', layoutOptions: { 'org.eclipse.elk.algorithm': 'org.eclipse.elk.stress' }, children: [{ id: 'X', width: 30, height: 30 }] }],
    }
    const out = layoutElkJson(input)
    // elkjs 实测: X 被 stress 布局到非默认位置 (leaf layered 会在左侧).
    expect(out.children![0]!.children![0]!.x).not.toBe(12)
  })

  it('默认/layered → 正常布局', () => {
    const input: ElkNode = { id: 'root', children: [{ id: 'A', width: 40, height: 20 }] }
    const out = layoutElkJson(input)
    expect(out.children![0]!.x).toBe(12)
  })
})
