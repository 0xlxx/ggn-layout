#!/usr/bin/env bun
/**
 * 边路由 E2E 快照扫描器 — 生成当前 ggn vs ELK Java jar 的边弯点一致率注册表.
 *
 * 范围 (用例正交: 每张图 × 每个方向 = 一个独立用例):
 *   - 正交路由 (ORTHOGONAL/UNDEFINED), 平坦图 (无嵌套), 非交互
 *   - 含自环图单独标记 (selfloop)
 *   - 排除 SPLINES/POLYLINE (非正交) 与层级图 (父偏移坐标语义未收敛)
 *
 * 用法:
 *   bun scripts/scan-edge-e2e.mjs            # 只打印汇总
 *   bun scripts/scan-edge-e2e.mjs --write    # 写入 test-resources/edge-e2e-registry.json
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { compareSafe, collectCases, loadOracle, registryPath, oracleHash, summarize, ROOT } from './edge-e2e-lib.mjs'

const write = process.argv.includes('--write')
const oracle = loadOracle()
const cases = collectCases(oracle)

const registry = { version: 2, eps: 2, oracleHash: oracleHash(), generatedAt: new Date().toISOString(), cases: {} }
const passCount = { flat: 0, selfloop: 0, hier: 0 }
const failCount = { flat: 0, selfloop: 0, hier: 0 }
for (const c of cases) {
  const r = compareSafe(c.rel, c.dir)
  const ok = !r.crashed && r.fails.length === 0
  if (ok) passCount[c.cat] = (passCount[c.cat] ?? 0) + 1
  else failCount[c.cat] = (failCount[c.cat] ?? 0) + 1
  registry.cases[c.key] = {
    cat: c.cat,
    ok,
    nodesOk: (r.nodeDiffs ?? []).length === 0,
    nodeDiffs: (r.nodeDiffs ?? []).slice(0, 8),
    nEdges: r.nEdges,
    matched: r.matched,
    fails: r.fails.slice(0, 5),
    reason: ok ? '' : (r.crashed ? `崩溃: ${r.crashed}` : classifyFail(r)),
  }
}

if (write) {
  writeFileSync(registryPath(), JSON.stringify(registry, null, 2))
  console.log(`[scan-edge-e2e] 注册表 → ${join(ROOT, 'test-resources/edge-e2e-registry.json')} (oracleHash=${registry.oracleHash})`)
}

/** 失败分类: 节点位置差 (696 域) vs 纯边路由差 (边路由域). */
function classifyFail(r) {
  const nodeBad = (r.nodeDiffs ?? []).length > 0
  const edgeBad = r.fails.length > 0
  if (nodeBad && edgeBad) return `节点位置差 (${r.nodeDiffs.length}) + 边弯点差 (${r.fails.length})`
  if (nodeBad) return `节点位置差 (${r.nodeDiffs.length})`
  return summarize(r)
}

const total = cases.length
const passed = Object.values(passCount).reduce((a, b) => a + b, 0)
console.log(`[scan-edge-e2e] 正交路由用例 ${total} (图×方向)`)
console.log(`  平坦: ${passCount.flat} 通过 / ${failCount.flat} 失败`)
console.log(`  自环: ${passCount.selfloop} 通过 / ${failCount.selfloop} 失败`)
console.log(`  层级: ${passCount.hier} 通过 / ${failCount.hier} 失败`)
console.log(`  总通过率: ${(100 * passed / total).toFixed(1)}%`)
