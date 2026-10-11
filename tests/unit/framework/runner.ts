/**
 * ELK LayoutTestRunner 移植运行时 (对应 Java alg.test.framework).
 *
 * 原仓库 91 个测试分两类:
 *   1) 纯代码构造 (TestGraphCreator 直接调处理器) — 已移植为直接 .test.ts
 *   2) LayoutTestRunner 框架测试 — @GraphResourceProvider 加载图资源 + @ConfiguratorProvider
 *      设置选项 + @TestBeforeProcessor/@TestAfterProcessor 在指定处理器前后断言不变量.
 *
 * 本 runner 提供第二类的移植底座:
 *   - resolveModels(): Java ModelResourcePath glob → ggn test-resources/elk-models 下 elkt
 *     (原仓库用 .elkg; ggn 每图有等价 .elkt, 见 realworld/ptolemy 550 对).
 *   - runLayout(): 加载 elkt → 构建 LGraph → (可选 configure 设选项) → 跑完整布局,
 *     在指定模块 before/after 触发断言回调, 收集问题列表.
 *
 * 语义对齐: ELK LayoutTestRunner 对每个图 × 每个 configurator 跑完整布局, 断言不满足 → 测试失败.
 * 图资源量很大 (realworld 550 / tests 193 / tickets 110), 可用环境变量 GGN_FRAMEWORK_LIMIT 限制
 * 每测试的图数 (默认全量; 设 0 表示全量).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { globSync } from 'glob'
import { parseElkt } from '../../../scripts/elkt2test.mjs'
import { buildLGraphFromParsed } from '../../../shared/elkgraph-builder.ts'
import { LayeredLayoutProvider } from '../../../src/index.js'
import type { LGraph } from '../../../src/index.js'

export const MODEL_ROOT = 'test-resources/elk-models'

export type AssertionWhen = 'before' | 'after' | 'layout'

export interface Assertion {
  /** ggn runModule 名 (与 Java 处理器类名一致, 如 'PortSideProcessor'); when='layout' 时忽略. */
  module: string
  when: AssertionWhen
  /** 返回问题列表; 空 = 通过. 抛错视为该断言崩溃 (问题记入). */
  check: (graph: LGraph) => string[]
}

export interface CaseResult {
  rel: string
  problems: string[]
  /** 布局/加载抛错 (视为崩溃). */
  error?: string
}

/** 解析 Java ModelResourcePath 模式 → ggn elkt 相对路径列表.
 *  Java 模式如 "realworld/ptolemy/.../" 或 "tests/.../" (glob 双星号). */

export function resolveModels(pattern: string): string[] {
  let p = pattern.replace(/\\/g, '/')
  const hasExt = /\.\w+$/.test(p)
  if (!hasExt) {
    p = p.endsWith('**') ? p + '/*.elkt' : p.endsWith('/') ? p + '**/*.elkt' : p + '/**/*.elkt'
  }
  const files = globSync(join(MODEL_ROOT, p)).map(f => f.replace(/\\/g, '/'))
  // 返回相对 MODEL_ROOT 的路径; elkg → elkt 兜底 (资源只有 elkg 时用同名 elkt)
  return files
    .filter(f => f.endsWith('.elkt') || f.endsWith('.elkg'))
    .map(f => f.replace(/^\.?\/?test-resources\/elk-models\//, '').replace(/\.elkg$/, '.elkt'))
}

/** 每测试图数上限 (环境变量 GGN_FRAMEWORK_LIMIT; 默认全量). */
export function limitModels(models: string[]): string[] {
  const raw = process.env.GGN_FRAMEWORK_LIMIT
  if (raw === undefined || raw === '0' || raw === '') return models
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return models
  return models.slice(0, n)
}

/** 安全执行断言回调, 抛错转为问题串. */
function safeCheck(check: Assertion['check'], graph: LGraph, rel: string, module: string, when: string): string[] {
  try {
    return check(graph)
  } catch (e) {
    return [`${rel}: ${when} ${module} 断言崩溃: ${String((e as Error)?.message ?? e).slice(0, 200)}`]
  }
}

/**
 * 对单个图跑完整布局, 在指定模块 before/after 收集断言问题.
 * @param rel elkt 相对路径 (相对 test-resources/elk-models)
 * @param assertions 处理器阶段断言
 * @param configure 可选: 布局前设置图选项 (对应 @ConfiguratorProvider)
 * @returns 问题列表 (空 = 全通过)
 */
export function runLayout(rel: string, assertions: Assertion[], configure?: (g: LGraph) => void): string[] {
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
    beforeModule(name) {
      for (const a of before.get(name) ?? []) {
        problems.push(...safeCheck(a.check, graph, rel, name, 'before'))
      }
    },
    afterModule(name) {
      for (const a of after.get(name) ?? []) {
        problems.push(...safeCheck(a.check, graph, rel, name, 'after'))
      }
    },
  })
  provider.layout(graph)
  // 布局后断言 (对应 Java @Test(ElkNode) 方法, 对最终输出检查).
  for (const a of layoutAsserts) {
    problems.push(...safeCheck(a.check, graph, rel, 'layout', 'layout'))
  }
  return problems
}

/** 跑一批图 (limitModels 应用后), 汇总结果. */
export function runAll(rels: string[], assertions: Assertion[], configure?: (g: LGraph) => void): CaseResult[] {
  const out: CaseResult[] = []
  for (const rel of rels) {
    try {
      const problems = runLayout(rel, assertions, configure)
      out.push({ rel, problems })
    } catch (e) {
      out.push({ rel, problems: [], error: String((e as Error)?.message ?? e).slice(0, 300) })
    }
  }
  return out
}

/** 汇总结果为 vitest 友好的失败信息. */
export function summarizeFailures(results: CaseResult[], label: string): string {
  const failed = results.filter(r => r.problems.length > 0 || r.error)
  if (failed.length === 0) return ''
  const lines = failed.slice(0, 20).map(r => {
    const head = r.error ? `${r.rel}: 崩溃 ${r.error}` : r.rel
    const details = (r.error ? [] : r.problems).slice(0, 3).join('\n    ')
    return details ? `${head}\n    ${details}` : head
  })
  return `${label}: ${failed.length}/${results.length} 图失败:\n${lines.join('\n')}`
}
