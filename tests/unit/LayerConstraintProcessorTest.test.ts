/**
 * LayerConstraintProcessorTest — ELK Java v0.12.0 移植 (LayoutTestRunner 框架).
 * 原文件: test/org.eclipse.elk.alg.layered.test/.../intermediate/LayerConstraintProcessorTest.java
 * 资源: tests/layered/layer_constraints/**
 * 断言 (@TestAfterProcessor(LayerConstraintPostprocessor)):
 *   1) testLayerConstraints: FIRST_SEPARATE 只出现在首层且该层无 NONE 节点, FIRST 节点在下一层;
 *      LAST_SEPARATE 只出现在末层且该层无 NONE 节点, LAST 节点在上一层; 无 SEPARATE 时 FIRST/LAST 在首/末层.
 *   2) noEmptyLayers: 无空层.
 *
 * 注: ggn 的 elkt 导入器 (scripts/elkt-build.mjs) 不应用节点级 layerConstraint 属性
 * (仅 portConstraints 等少数属性), 与 ELK Java 导入器不同. 为忠实移植 (Java 图约束必须生效),
 * configure 回调把 elkt 解析出的 layerConstraint 按节点顺序写回 LNode 字段.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { MODEL_ROOT, resolveModels, limitModels, runAll, summarizeFailures } from './framework/runner.js'
import { parseElkt } from '../../scripts/elkt2test.mjs'
import type { LGraph } from '../../src/index.js'
import { LayerConstraint } from '../../src/index.js'

const MODELS = limitModels(resolveModels('tests/layered/layer_constraints/**/'))

// ggn elkt 导入器不应用节点级 layerConstraint → 这里在 configure 时按解析顺序写回字段
// (buildLGraphFromParsed 与 parseElkt 的节点顺序一致; runAll 顺序处理各图, 索引一一对应).
const PARSED_CONSTRAINTS = MODELS.map(rel => {
  const parsed = parseElkt(readFileSync(join(MODEL_ROOT, rel), 'utf8'))
  return [...parsed.nodeProps.values()].map(p => (p as { layerConstraint?: string }).layerConstraint ?? null)
})
let parsedIdx = 0
function configureLayerConstraints(g: LGraph): void {
  const constraints = PARSED_CONSTRAINTS[parsedIdx++]!
  const nodes = g.getLayerlessNodes()
  constraints.forEach((lc, i) => {
    if (lc !== null && nodes[i] !== undefined) {
      nodes[i]!.setLayerConstraint(lc as LayerConstraint)
    }
  })
}

const AFTER_POST = [
  {
    module: 'LayerConstraintPostprocessor',
    when: 'after' as const,
    check: (g: LGraph): string[] => {
      const problems: string[] = []
      // Java testLayerConstraints: constraint → 出现的层 id 集合 (multimap 语义).
      const constraintMap = new Map<LayerConstraint, Set<number>>()
      g.getLayers().forEach((layer, i) => {
        for (const node of layer.getNodes()) {
          const lc = node.getLayerConstraint() ?? LayerConstraint.NONE
          const set = constraintMap.get(lc) ?? new Set<number>()
          set.add(i)
          constraintMap.set(lc, set)
        }
      })
      const lastLayer = g.getLayers().length - 1
      const firstSep = constraintMap.get(LayerConstraint.FIRST_SEPARATE)
      if (firstSep !== undefined && firstSep.size > 0) {
        if (!(firstSep.size === 1 && firstSep.has(0))) {
          problems.push(`FIRST_SEPARATE 层集合 [${[...firstSep]}] 应恰为 {0}`)
        }
        if (constraintMap.get(LayerConstraint.NONE)?.has(0)) {
          problems.push('首层 (FIRST_SEPARATE) 含 NONE 节点')
        }
        const first = constraintMap.get(LayerConstraint.FIRST)
        if (first !== undefined && first.size > 0) {
          if (!(first.size === 1 && first.has(1))) {
            problems.push(`FIRST 层集合 [${[...first]}] 应恰为 {1}`)
          }
        }
      } else {
        const first = constraintMap.get(LayerConstraint.FIRST)
        if (first !== undefined && first.size > 0) {
          if (!(first.size === 1 && first.has(0))) {
            problems.push(`FIRST 层集合 [${[...first]}] 应恰为 {0}`)
          }
        }
      }
      const lastSep = constraintMap.get(LayerConstraint.LAST_SEPARATE)
      if (lastSep !== undefined && lastSep.size > 0) {
        if (!(lastSep.size === 1 && lastSep.has(lastLayer))) {
          problems.push(`LAST_SEPARATE 层集合 [${[...lastSep]}] 应恰为 {${lastLayer}}`)
        }
        if (constraintMap.get(LayerConstraint.NONE)?.has(lastLayer)) {
          problems.push('末层 (LAST_SEPARATE) 含 NONE 节点')
        }
        const last = constraintMap.get(LayerConstraint.LAST)
        if (last !== undefined && last.size > 0) {
          if (!(last.size === 1 && last.has(lastLayer - 1))) {
            problems.push(`LAST 层集合 [${[...last]}] 应恰为 {${lastLayer - 1}}`)
          }
        }
      } else {
        const last = constraintMap.get(LayerConstraint.LAST)
        if (last !== undefined && last.size > 0) {
          if (!(last.size === 1 && last.has(lastLayer))) {
            problems.push(`LAST 层集合 [${[...last]}] 应恰为 {${lastLayer}}`)
          }
        }
      }
      return problems
    },
  },
  {
    module: 'LayerConstraintPostprocessor',
    when: 'after' as const,
    check: (g: LGraph): string[] => {
      const problems: string[] = []
      for (const layer of g.getLayers()) {
        if (layer.getNodes().length === 0) {
          problems.push(`层 ${layer.getIndex()} 为空`)
        }
      }
      return problems
    },
  },
]

describe('LayerConstraintProcessorTest (ELK Java 移植, tests/layered/layer_constraints)', () => {
  it(`LayerConstraintPostprocessor 后置: 全部 ${MODELS.length} 图约束层位正确且无空层`, () => {
    const results = runAll(MODELS, AFTER_POST, configureLayerConstraints)
    const failed = results.filter(r => r.problems.length > 0 || r.error)
    const msg = summarizeFailures(results, 'LayerConstraintPostprocessor 后置断言')
    expect(failed.length, msg).toBe(0)
  })
})
