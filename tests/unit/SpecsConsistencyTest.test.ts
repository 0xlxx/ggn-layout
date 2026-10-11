/**
 * SpecsConsistencyTest — layout 参数 SSOT（src/options/specs.ts）一致性校验。
 *
 * 2026-08-15 SSOT 化：所有布局参数集中定义（id/短键/类型/默认/值域），各算法 options.ts
 * 常量 = spec.id（消除 core 重复定义，此前 padding 定义 14 次）。本测试防两处不一致：
 *  1) specs ↔ OPT_MAP（shared/opt-map.ts）：同一短键的 id/type 必须全等（OPT_MAP 是 elkt
 *     转换层的权威映射，specs 是参数定义层——两侧分裂会让 elkt 输入与代码读取不一致）；
 *  2) specs.id 唯一（同一 id 不重复定义，跨 CORE/算法也不允许——core 参数必须从 CORE 引用）。
 */
import { describe, expect, it } from 'vitest'
import { OPT_MAP } from '../../shared/opt-map.js'
import { ALL_SPECS } from '../../src/options/specs.js'

describe('specs ↔ OPT_MAP 一致性（SSOT 防不一致）', () => {
  it('每个 spec：shortKey 在 OPT_MAP 收录时，id/type 必须全等（防 elkt 转换层与参数定义层分裂）', () => {
    // OPT_MAP（shared/opt-map.ts）是 elkt 短键→长键的转换权威，但只收录部分参数
    //（layered/core/topdownpacking/vertiflex/spore；radial/force/mrtree/rectpacking/disco 的
    // 专属参数走 JSON 全 id，不经 elkt 短键 → OPT_MAP 未收录属合法）。校验方向：
    // OPT_MAP **有**的必须与 specs 全等；没有的允许（未收录）。
    let checked = 0
    for (const spec of ALL_SPECS) {
      if (spec.shortKey === undefined) continue
      const meta = OPT_MAP[spec.shortKey]
      if (meta === undefined) continue
      expect(meta.ggn, `${spec.shortKey} id`).toBe(spec.id)
      expect(meta.type, `${spec.shortKey} type`).toBe(spec.type)
      checked++
    }
    // 至少覆盖到核心参数（padding/spacing.nodeNode 等 OPT_MAP 收录的）
    expect(checked).toBeGreaterThan(20)
  })

  it('specs.id 全局唯一（core 参数不跨算法重复定义）', () => {
    const seen = new Map<string, string>()
    for (const spec of ALL_SPECS) {
      const prev = seen.get(spec.id)
      expect(prev, `重复 id: ${spec.id}（先见于 ${prev ?? ''}）`).toBeUndefined()
      seen.set(spec.id, spec.shortKey ?? spec.id)
    }
  })

  it('core 参数必须从 CORE 单一定义——CORE 覆盖 12 个核心参数（padding/spacing.nodeNode 等）', () => {
    // 校验 specs 里 core 归属的参数 id（padding/spacing.nodeNode 等核心参数必须在 CORE 单一定义）
    const coreIds = ALL_SPECS.filter((s) => s.algorithm === 'core').map((s) => s.id)
    for (const id of [
      'org.eclipse.elk.padding',
      'org.eclipse.elk.spacing.nodeNode',
      'org.eclipse.elk.spacing.edgeNode',
      'org.eclipse.elk.spacing.edgeEdge',
      'org.eclipse.elk.spacing.edgeLabel',
      'org.eclipse.elk.aspectRatio',
      'org.eclipse.elk.omitNodeMicroLayout',
      'org.eclipse.elk.nodeSize.fixedGraphSize',
      'org.eclipse.elk.separateConnectedComponents',
      'org.eclipse.elk.margins',
      'org.eclipse.elk.direction',
      'org.eclipse.elk.position',
    ]) {
      expect(coreIds).toContain(id)
    }
  })

  it('values 合理性：字符串 default 且在 values 中 → default ∈ values；values 无重复（2026-08-15 审阅 P1 值域错误回归）', () => {
    for (const spec of ALL_SPECS) {
      if (spec.values === undefined) continue
      expect(new Set(spec.values).size, `values 重复: ${spec.id}`).toBe(spec.values.length)
      if (typeof spec.default === 'string') {
        // str/enumset 默认值必须在值域内（enumset 默认可能是空数组——default 为 string 时才查）
        expect(spec.values, `default 不在 values: ${spec.id} (default=${spec.default})`).toContain(spec.default)
      }
    }
    // 回归：审阅发现的 4 处值域/默认错误
    const byId = new Map(ALL_SPECS.map((s) => [s.id, s]))
    const weighting = byId.get('org.eclipse.elk.mrtree.weighting')
    expect(weighting?.values).toEqual(['MODEL_ORDER', 'DESCENDANTS', 'FAN', 'CONSTRAINT'])
    const layoutStrategy = byId.get('org.eclipse.elk.vertiflex.layoutStrategy')
    expect(layoutStrategy?.default).toBe('STRAIGHT')
    expect(layoutStrategy?.values).toEqual(['STRAIGHT', 'BEND'])
    const considerOrder = byId.get('org.eclipse.elk.vertiflex.considerNodeModelOrder')
    expect(considerOrder?.default).toBe(true)
    const lowLevel = byId.get('org.eclipse.elk.alg.common.compaction.polyomino.lowLevelSort')
    expect(lowLevel?.values).toEqual(['BY_SIZE', 'BY_SIZE_AND_SHAPE'])
  })
})
