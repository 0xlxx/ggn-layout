import { describe, expectTypeOf, it } from 'vitest'
import { layoutElkJson, type ElkLayoutOptions, type LayoutInput, type LayoutOutput, type LayoutSummary } from '../../src/api/index.js'

describe('layout API 类型契约', () => {
  it('默认与 summary 返回类型分别收紧为 LayoutOutput/LayoutSummary', () => {
    const input: LayoutInput = {
      id: 'root',
      extension: { source: 'fixture' },
      children: [{ id: 'A', width: 10, height: 10 }],
    }
    const output = layoutElkJson(input)
    const summary = layoutElkJson(input, { responseFormat: 'summary' })

    expectTypeOf(output).toEqualTypeOf<LayoutOutput>()
    expectTypeOf(summary).toEqualTypeOf<LayoutSummary>()
    type OutputNode = NonNullable<LayoutOutput['children']>[number]
    expectTypeOf<OutputNode['x']>().toEqualTypeOf<number>()
    expectTypeOf<OutputNode['y']>().toEqualTypeOf<number>()
    expectTypeOf<OutputNode['width']>().toEqualTypeOf<number>()
    expectTypeOf<OutputNode['height']>().toEqualTypeOf<number>()
  })

  it('direction 只接受四个字面量，options 支持 readonly pick', () => {
    const ok: ElkLayoutOptions = {
      direction: 'RIGHT',
      randomSeed: 7,
      hierarchyHandling: 'INCLUDE_CHILDREN',
      layoutOptions: { 'org.eclipse.elk.direction': 'RIGHT' },
      responseFormat: 'concise',
      pick: ['properties'] as const,
    }
    expectTypeOf(ok.direction).toEqualTypeOf<'RIGHT' | 'LEFT' | 'DOWN' | 'UP' | undefined>()

    // @ts-expect-error 非法方向必须在类型层拒绝
    const invalid: ElkLayoutOptions = { direction: 'DIAG' }
    void invalid
    // @ts-expect-error 非法方向必须在 layoutElkJson 调用点拒绝
    layoutElkJson({ id: 'root' }, { direction: 'DIAG' })
  })
})
