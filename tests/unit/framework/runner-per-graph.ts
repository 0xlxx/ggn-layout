/**
 * runAllPerGraph — 与 framework/runner.ts 的 runLayout/runAll 等价, 但 before/after 断言
 * 收到「模块实际处理的 LGraph」(每个分量/每个子图), 而不是 runner.ts 里恒为根图.
 *
 * 对应 Java LayoutTestRunner whitebox 语义: @TestAfterProcessor(X) 在每次执行处理器 X 时触发,
 * 参数是当时被处理的 LGraph (分量图 / 子图). runner.ts 的钩子闭包固定检查根图, 在
 * 层级图 (INCLUDE_CHILDREN) 或分量图下会在根图中间态上误报 (例: LayerSizeAndGraphHeightCalculator
 * 在子图 post-P3 时根图 size 尚未计算). 本 helper 供需要逐图断言的移植测试使用.
 *
 * when='layout' 断言仍检查根图 (Java @Test(ElkNode) 接收整个 ElkNode 图).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseElkt } from '../../../scripts/elkt2test.mjs'
import { buildLGraphFromParsed } from '../../../shared/elkgraph-builder.ts'
import { LayeredLayoutProvider } from '../../../src/index.js'
import { MODEL_ROOT } from './runner.js'
import type { Assertion, CaseResult } from './runner.js'

function safeCheck(check: Assertion['check'], graph: import('../../../src/index.js').LGraph,
  rel: string, module: string, when: string): string[] {
  try {
    return check(graph)
  } catch (e) {
    return [`${rel}: ${when} ${module} 断言崩溃: ${String((e as Error)?.message ?? e).slice(0, 200)}`]
  }
}

/** 单图完整布局, before/after 断言收到模块实际处理的图 (分量/子图). */
export function runLayoutPerGraph(
  rel: string, assertions: Assertion[], configure?: (g: import('../../../src/index.js').LGraph) => void,
): string[] {
  const src = readFileSync(join(MODEL_ROOT, rel), 'utf8')
  const parsed = parseElkt(src)
  const { graph } = buildLGraphFromParsed(parsed, rel)
  configure?.(graph)

  const provider = new LayeredLayoutProvider()
  const problems: string[] = []
  const before = new Map<string, Assertion[]>()
  const after = new Map<string, Assertion[]>()
  const layoutAsserts: Assertion[] = []
  for (const a of assertions) {
    if (a.when === 'layout') {
      layoutAsserts.push(a)
      continue
    }
    const map = a.when === 'before' ? before : after
    const arr = map.get(a.module) ?? []
    arr.push(a)
    map.set(a.module, arr)
  }
  provider.setHooks({
    beforeModule(name, g) {
      for (const a of before.get(name) ?? []) {
        problems.push(...safeCheck(a.check, g, rel, name, 'before'))
      }
    },
    afterModule(name, g) {
      for (const a of after.get(name) ?? []) {
        problems.push(...safeCheck(a.check, g, rel, name, 'after'))
      }
    },
  })
  provider.layout(graph)
  for (const a of layoutAsserts) {
    problems.push(...safeCheck(a.check, graph, rel, 'layout', 'layout'))
  }
  return problems
}

/** 跑一批图 (limitModels 应用后), 逐图断言, 汇总结果. */
export function runAllPerGraph(
  rels: string[], assertions: Assertion[], configure?: (g: import('../../../src/index.js').LGraph) => void,
): CaseResult[] {
  const out: CaseResult[] = []
  for (const rel of rels) {
    try {
      const problems = runLayoutPerGraph(rel, assertions, configure)
      out.push({ rel, problems })
    } catch (e) {
      out.push({ rel, problems: [], error: String((e as Error)?.message ?? e).slice(0, 300) })
    }
  }
  return out
}
