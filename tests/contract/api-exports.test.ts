/**
 * 公共 API 导出契约（运行时）。
 *
 * 断言：
 *   1. public.ts（消费方入口）只含高层 API，不含低层原语（buildGraph/extractGraph/LGraph...）；
 *   2. internal.ts（引擎入口）含内部模型与低层组装原语；
 *   3. index.ts（历史兼容入口）保留 520db4d 旧根入口的全部值导出。
 */
import { describe, expect, it } from 'vitest'
import * as publicApi from '../../src/public.js'
import * as internalApi from '../../src/internal.js'
import * as rootApi from '../../src/index.js'

const keys = (m: object): string[] => Object.keys(m).filter((k) => k !== 'default').sort()

/** 520db4d 旧根入口的全部运行时值导出（含 P0/P1 新增）。 */
const LEGACY_ROOT_VALUES = [
  'Property', 'MapPropertyHolder', 'LShape', 'LGraphElement', 'LGraph', 'LNode', 'LPort', 'LEdge', 'Layer',
  'NodeType', 'PortSide', 'PortType', 'Direction', 'PortConstraints', 'LayerConstraint', 'InLayerConstraint', 'EdgeConstraint',
  'SIDES_NORTH', 'SIDES_EAST', 'SIDES_SOUTH', 'SIDES_WEST', 'SIDES_EAST_WEST', 'SIDES_NORTH_SOUTH',
  'SIDES_NORTH_EAST', 'SIDES_EAST_SOUTH', 'SIDES_SOUTH_WEST', 'SIDES_NORTH_WEST', 'SIDES_NORTH_EAST_SOUTH',
  'SIDES_EAST_SOUTH_WEST', 'SIDES_SOUTH_WEST_NORTH', 'SIDES_WEST_NORTH_EAST', 'SIDES_NORTH_EAST_SOUTH_WEST',
  'createMergedPort', 'provideCollectorPort', 'getEdgeEndpoints', 'LayeredLayoutProvider',
  'doCompoundLayout', 'doSimpleLayout', 'ComponentsProcessor', 'computeComponentSize', 'NullProgressMonitor',
  'GraphProperties', 'HIERARCHY_HANDLING', 'layoutElkJson', 'buildGraph',
  'LayoutError', 'LayoutErrorCode', 'validateLayoutInput', 'assertValidLayoutInput',
]

describe('public.ts（消费方入口）', () => {
  it('只含高层 API，不含低层原语', () => {
    expect(keys(publicApi)).toEqual(['LayoutError', 'LayoutErrorCode', 'assertValidLayoutInput', 'diffLayout', 'layoutElkJson', 'layoutJsonBatch', 'layoutJsonDiff', 'validateLayoutInput'])
  })

  it('没有 buildGraph/extractGraph/LGraph/LNode/Property', () => {
    for (const low of ['buildGraph', 'extractGraph', 'LGraph', 'LNode', 'Property', 'LayeredLayoutProvider']) {
      expect(publicApi).not.toHaveProperty(low)
    }
  })
})

describe('internal.ts（引擎入口）', () => {
  it('含内部模型与低层组装原语', () => {
    const internalKeys = keys(internalApi)
    for (const symbol of ['LGraph', 'LNode', 'LPort', 'LEdge', 'Property', 'LayeredLayoutProvider', 'buildGraph', 'extractGraph']) {
      expect(internalKeys).toContain(symbol)
    }
  })
})

describe('index.ts（历史兼容入口）', () => {
  it('保留旧根入口全部值导出', () => {
    const rootKeys = keys(rootApi)
    const missing = LEGACY_ROOT_VALUES.filter((s) => !rootKeys.includes(s))
    expect(missing).toEqual([])
  })

  it('同时含公共 API 与内部模型', () => {
    expect(rootApi).toHaveProperty('layoutElkJson')
    expect(rootApi).toHaveProperty('LGraph')
  })
})
