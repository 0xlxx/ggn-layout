/**
 * 公共 API 类型级导出契约（expectTypeOf）。
 *
 * 断言 public.ts 的类型导出（类型在运行时被擦除，必须用类型级测试锁定）。
 */
import { describe, expectTypeOf, it } from 'vitest'
import type {
  ElkEdge, ElkEdgeSection, ElkLayoutOptions, ElkNode, ElkPoint, ElkPort,
  LayoutInput, LayoutOutput, LayoutOutputEdge, LayoutSummary,
} from '../../src/public.js'
import { layoutElkJson } from '../../src/public.js'

describe('public.ts 类型导出', () => {
  it('LayoutInput / LayoutOutput / LayoutSummary 可引用', () => {
    expectTypeOf<LayoutInput>().toMatchTypeOf<{ id: string }>()
    expectTypeOf<LayoutOutput>().toMatchTypeOf<{ id: string; x: number; y: number; width: number; height: number }>()
    expectTypeOf<LayoutSummary['nodes'][number]>().toMatchTypeOf<{ id: string; x: number; y: number; width: number; height: number }>()
  })

  it('LayoutOutput 允许读取自定义字段（full 保真）', () => {
    expectTypeOf<LayoutOutput>().toHaveProperty('customField').toEqualTypeOf<unknown>()
    expectTypeOf<LayoutOutputEdge>().toHaveProperty('customField').toEqualTypeOf<unknown>()
  })

  it('既有 Elk* 兼容类型仍可引用', () => {
    expectTypeOf<ElkNode>().toMatchTypeOf<{ id: string }>()
    expectTypeOf<ElkEdge>().toMatchTypeOf<{ sources: string[]; targets: string[] }>()
    expectTypeOf<ElkPoint>().toMatchTypeOf<{ x: number; y: number }>()
    expectTypeOf<ElkEdgeSection>().toMatchTypeOf<{ startPoint: ElkPoint; endPoint: ElkPoint }>()
    expectTypeOf<ElkPort>().toMatchTypeOf<{ id: string }>()
  })

  it('layoutElkJson 默认返回 LayoutOutput；summary 返回 LayoutSummary', () => {
    const input: LayoutInput = { id: 'root' }
    expectTypeOf(layoutElkJson(input)).toEqualTypeOf<LayoutOutput>()
    expectTypeOf(layoutElkJson(input, { responseFormat: 'summary' })).toEqualTypeOf<LayoutSummary>()
  })

  it('direction 为字面量联合，非法值类型报错', () => {
    expectTypeOf<NonNullable<ElkLayoutOptions['direction']>>().toEqualTypeOf<'RIGHT' | 'LEFT' | 'DOWN' | 'UP'>()
    // @ts-expect-error 非法方向
    const bad: ElkLayoutOptions = { direction: 'DIAGONAL' }
    void bad
  })
})
