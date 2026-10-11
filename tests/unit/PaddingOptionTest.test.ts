/**
 * PaddingOptionTest — root / compound 节点 padding 选项（org.eclipse.elk.padding）解析与布局生效。
 * 2026-08-15 修复两个遗留：
 *  A) root（graph）padding 经 graphProps 只 setProperty、从不进 LGraph.setPadding → 布局全失效
 *     （「ggn root padding [top=N] 未生效」：entry y=12 vs elkjs y=32，差 20 = padding[top=20]）。
 *  B) 部分 padding（"[top=20]" / {top:20}）未指定边为 undefined → configPad.bottom+0 = NaN 污染
 *     → 回落默认；修复 = 部分 padding 未指定边 = 0（ELK Java oracle 语义，审阅 P1-1 对齐）；
 *     仅选项完全缺省 = 默认 12。
 */
import { describe, expect, it } from 'vitest'
import { layoutElkJson } from '../../src/api/elk-json.js'
import { buildLGraphFromParsed, elkJsonToParsed } from '../../shared/elkgraph-builder.js'

/** JSON 路径（layoutElkJson）：root padding → 子节点起始 y（布局后全局坐标）。 */
function childYAfterLayout(padding: unknown): number {
  const input = {
    id: 'root',
    layoutOptions: { 'org.eclipse.elk.padding': padding },
    children: [
      { id: 'a', width: 40, height: 20 },
      { id: 'b', width: 40, height: 20 },
    ],
    edges: [],
  }
  const out = layoutElkJson(JSON.parse(JSON.stringify(input)), {
    layoutOptions: { 'org.eclipse.elk.algorithm': 'layered' },
  }) as unknown as { children?: Array<{ id: string; y?: number }> }
  const a = out.children?.find((n) => n.id === 'a')
  if (a === undefined || a.y === undefined) throw new Error('missing child a')
  return a.y
}

/** LGraph 路径：root padding 解析后 getPadding() 值（未布局，纯解析断言）。 */
function graphPadding(padding: unknown): { left: number; top: number; right: number; bottom: number } {
  const parsed = elkJsonToParsed(
    {
      id: 'root',
      layoutOptions: { 'org.eclipse.elk.padding': padding },
      children: [{ id: 'a', width: 40, height: 20 }],
      edges: [],
    },
    { stripNPrefix: false },
  ) as unknown as Parameters<typeof buildLGraphFromParsed>[0]
  const { graph } = buildLGraphFromParsed(parsed, 'pad')
  return graph.getPadding()
}

describe('root padding（org.eclipse.elk.padding，graphProps 路径）', () => {
  it('字符串 "[top=20]" → 子节点起始 y=20（修复 A：此前恒 12）', () => {
    expect(childYAfterLayout('[top=20]')).toBe(20)
  })
  it('对象 { top: 20 } → 子节点起始 y=20', () => {
    expect(childYAfterLayout({ top: 20 })).toBe(20)
  })
  it('完整 "[top=5,left=5,right=5,bottom=5]" → 子节点 y=5', () => {
    expect(childYAfterLayout('[top=5,left=5,right=5,bottom=5]')).toBe(5)
  })
  it('部分 padding 未指定边 = 0（ELK Java oracle 语义，审阅 P1-1；无 NaN）', () => {
    const p = graphPadding('[top=20]')
    expect(p).toEqual({ left: 0, top: 20, right: 0, bottom: 0 })
  })
  it('无效 padding 形态（标量 "20" / 向量 "(20,20)"）→ B4 不设置 → 默认 12', () => {
    expect(graphPadding('20')).toEqual({ left: 12, top: 12, right: 12, bottom: 12 })
    expect(graphPadding('(20,20)')).toEqual({ left: 12, top: 12, right: 12, bottom: 12 })
  })
  it('缺省 padding（无该键）→ 默认 12（四边）', () => {
    const parsed = elkJsonToParsed(
      {
        id: 'root',
        children: [{ id: 'a', width: 40, height: 20 }],
        edges: [],
      },
      { stripNPrefix: false },
    ) as unknown as Parameters<typeof buildLGraphFromParsed>[0]
    const { graph } = buildLGraphFromParsed(parsed, 'pad')
    expect(graph.getPadding()).toEqual({ left: 12, top: 12, right: 12, bottom: 12 })
  })
})

describe('compound 节点部分 padding（nodeProps 路径 configPad）', () => {
  it('部分 padding 不 NaN 污染：top 覆盖、其余默认（修复 B）', () => {
    const parsed = elkJsonToParsed(
      {
        id: 'root',
        children: [
          {
            id: 'g1',
            layoutOptions: { 'org.eclipse.elk.padding': '[top=20]' },
            children: [{ id: 'a', width: 40, height: 20 }],
          },
        ],
        edges: [],
      },
      { stripNPrefix: false },
    ) as unknown as Parameters<typeof buildLGraphFromParsed>[0]
    const { nodeOf } = buildLGraphFromParsed(parsed, 'pad')
    const g1 = nodeOf.get(0) // elkJsonToParsed 的 nodes 不含 root：root=graphProps，g1 为 index 0
    expect(g1).toBeDefined()
    const nested = g1?.getNestedGraph()
    if (nested === undefined || nested === null) throw new Error('missing nested graph for g1')
    expect(nested.getPadding().top).toBe(20)
    expect(nested.getPadding().left).toBe(0) // 未指定边 = 0（oracle 语义）
    expect(Number.isNaN(nested.getPadding().bottom)).toBe(false)
  })
})
