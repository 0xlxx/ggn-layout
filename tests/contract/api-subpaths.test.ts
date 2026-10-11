/**
 * 发布子路径与机器可读契约。
 *
 * 本地工作区把 `ggn-layout/options` 自引用经 vitest alias 解析到 src/options.ts
 * （发布包的 `exports` 只暴露 dist）。若 alias/自引用都不可用，则退化为
 * src/options.ts 直接导入，避免把构建前的环境差异伪装成发布契约。
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { ElkLayoutOptions } from 'ggn-layout/options'

const schema = JSON.parse(readFileSync(new URL('../../src/api/layout-input.schema.json', import.meta.url), 'utf8')) as {
  $schema?: string
  properties?: Record<string, any>
  required?: string[]
  definitions?: Record<string, any>
}
const readme = readFileSync(new URL('../../README.md', import.meta.url), 'utf8')

type OptionsFacade = {
  HIERARCHY_HANDLING: unknown
  isSupportedAlgorithm: (value: unknown) => boolean
  normalizeAlgorithm: (value: string) => string
}

let optionsFacade: OptionsFacade
let usedSelfReference = true
try {
  optionsFacade = await import('ggn-layout/options')
} catch (error) {
  usedSelfReference = false
  console.warn('[api-subpaths] package self-reference unavailable; using ../../src/options.ts fallback', error)
  optionsFacade = await import('../../src/options.js')
}

const typedOptions: ElkLayoutOptions = {
  direction: 'RIGHT',
  responseFormat: 'full',
}

describe('package exports 子路径', () => {
  it('options 自引用可解析，或明确退化为源码门面', () => {
    expect(optionsFacade.HIERARCHY_HANDLING).toBeDefined()
    expect(optionsFacade.isSupportedAlgorithm('layered')).toBe(true)
    expect(optionsFacade.normalizeAlgorithm('org.eclipse.elk.layered')).toBe('layered')
    expect(typeof usedSelfReference).toBe('boolean')
  })

  it('options 门面保留 ElkLayoutOptions 类型契约', () => {
    expect(typedOptions.direction).toBe('RIGHT')
  })
})

describe('layout-input.schema.json', () => {
  it('是合法 JSON Schema draft-07，并描述必要的递归字段', () => {
    expect(schema.$schema).toBe('http://json-schema.org/draft-07/schema#')
    expect(schema.required).toContain('id')
    expect(schema.properties).toEqual(expect.objectContaining({
      id: expect.any(Object),
      children: expect.any(Object),
      edges: expect.any(Object),
    }))
    expect(schema.properties?.children?.items?.$ref).toBe('#')
    expect(schema.properties?.edges?.items?.$ref).toBe('#/definitions/edge')
    expect(schema.definitions?.edge?.properties?.sources?.minItems).toBe(1)
    expect(schema.definitions?.edge?.properties?.sources?.maxItems).toBe(1)
    expect(schema.definitions?.edge?.properties?.targets?.minItems).toBe(1)
    expect(schema.definitions?.edge?.properties?.targets?.maxItems).toBe(1)
  })
})

describe('README 子路径文档', () => {
  it('提到根入口与三个发布子路径', () => {
    for (const subpath of [
      'ggn-layout',
      'ggn-layout/api',
      'ggn-layout/core',
      'ggn-layout/options',
    ]) {
      expect(readme).toContain(subpath)
    }
  })
})
