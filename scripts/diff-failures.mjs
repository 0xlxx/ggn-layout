/**
 * 失败测试集合对比 (移植调试用).
 *
 * 用法:
 *   node scripts/diff-failures.mjs collect <file> [env] [--out <path>]
 *       跑指定 batch 测试, 提取失败测试 fullName, 存 JSON (默认 /tmp/failures-<file>-<env>.json)
 *       例: node scripts/diff-failures.mjs collect realworld "PPDBG_SPLIT=1"
 *   node scripts/diff-failures.mjs diff <baseline.json> <current.json>
 *       输出 current 新增失败 / 修复 (按测试 fullName), 按图名归类
 *   node scripts/diff-failures.mjs collect-all [out]  (examples+tests+tickets 合并失败集)
 *   node scripts/diff-failures.mjs check <failures.json> [--registry <path>]
 *       失败硬门禁 (M3-B): 失败图集合 vs triage-registry.json, 有未分类失败 → 退出码 1 (阻断);
 *       登记册内 bug/tooling 仍失败 → 放行; 已修复(不在当前失败) → 提示可移除.
 *       默认 registry: <pkg>/triage-registry.json
 *
 * 环境变量经 vitest 传给被测代码 (PPDBG_* 开关), 与 shell 前缀等价.
 */
import { execSync } from 'node:child_process'
import { writeFileSync, existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const BATCHES = {
  examples: 'tests/oracle/generated/examples_batch.test.ts',
  tests: 'tests/oracle/generated/tests_batch.test.ts',
  tickets: 'tests/oracle/generated/tickets_batch.test.ts',
  realworld: 'tests/oracle/generated/realworld_batch.test.ts',
}

function collect(file, env) {
  const batch = BATCHES[file]
  if (!batch) throw new Error(`未知 batch: ${file} (可选: ${Object.keys(BATCHES).join(', ')})`)
  const cmd = `${env ? env + ' ' : ''}./node_modules/.bin/vitest run ${batch} --reporter=json`
  let out
  try {
    out = execSync(cmd, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  } catch (e) {
    // vitest 有失败测试时退出码 1, 但 JSON 在 stdout.
    out = e.stdout ?? ''
  }
  const d = JSON.parse(out.slice(out.indexOf('{')))
  const failed = []
  for (const tr of d.testResults ?? []) {
    for (const t of tr.assertionResults ?? []) {
      if (t.status === 'failed') failed.push(t.fullName)
    }
  }
  return failed
}

const [cmd, ...rest] = process.argv.slice(2)

if (cmd === 'collect') {
  // 允许 `--out` 出现在任意位置: 位置参数中剔除 flag 及其值,
  // 避免把 `--out` / outPath 误当 env (旧实现 collect <file> --out <path> 会拼出非法命令).
  const outIdx = rest.indexOf('--out')
  const outPath = outIdx >= 0 ? rest[outIdx + 1] : null
  const positional = rest.filter((a, i) => {
    if (outIdx >= 0 && (i === outIdx || i === outIdx + 1)) return false
    return !a.startsWith('--')
  })
  const file = positional[0]
  const env = positional[1] ?? ''
  const finalOut = outPath ?? `/tmp/failures-${file}${env ? '-' + env.replace(/[^A-Za-z0-9]/g, '') : ''}.json`
  const failed = collect(file, env)
  writeFileSync(finalOut, JSON.stringify(failed, null, 1) + '\n')
  console.log(`[collect] ${file}${env ? ` (${env})` : ''}: ${failed.length} 失败 → ${finalOut}`)
} else if (cmd === 'diff') {
  const [base, curr] = rest
  if (!base || !curr || !existsSync(base) || !existsSync(curr)) {
    console.error('用法: node scripts/diff-failures.mjs diff <baseline.json> <current.json>')
    process.exit(1)
  }
  const a = new Set(JSON.parse(readFileSync(base, 'utf8')))
  const b = new Set(JSON.parse(readFileSync(curr, 'utf8')))
  const added = [...b].filter(x => !a.has(x))
  const fixed = [...a].filter(x => !b.has(x))
  const graph = (name) => name.split(' 坐标级差分')[0].split(' 布局完成')[0].split(' 环图')[0]
  const byGraph = (list) => {
    const m = new Map()
    for (const x of list) {
      const g = graph(x)
      m.set(g, (m.get(g) ?? 0) + 1)
    }
    return [...m.entries()].sort((x, y) => y[1] - x[1])
  }
  console.log(`=== 新增失败 ${added.length} (${byGraph(added).length} 图) ===`)
  for (const [g, n] of byGraph(added)) console.log(`  ${n}× ${g}`)
  console.log(`=== 修复 ${fixed.length} (${byGraph(fixed).length} 图) ===`)
  for (const [g, n] of byGraph(fixed)) console.log(`  ${n}× ${g}`)
} else if (cmd === 'collect-all') {
  // 一键采集 examples+tests+tickets (不含 realworld, 由验收单独跑), 合并写一个 JSON.
  const positional = rest.filter(a => !a.startsWith('--'))
  const outPath = positional[0] ?? '/tmp/failures-696.json'
  const all = []
  for (const name of ['examples', 'tests', 'tickets']) {
    all.push(...collect(name, ''))
  }
  writeFileSync(outPath, JSON.stringify(all, null, 1) + '\n')
  console.log(`[collect-all] ${all.length} 失败 → ${outPath}`)
} else if (cmd === 'check') {
  const graphName = (fullName) =>
    fullName.split(' 坐标级差分')[0].split(' 布局完成')[0].split(' 环图')[0]
      .split(' 复刻 jar 报错')[0].replace(/^elkt 生成: /, '')
  const positional = rest.filter(a => !a.startsWith('--'))
  const failuresPath = positional[0]
  const regIdx = rest.indexOf('--registry')
  const regPath = regIdx >= 0 ? rest[regIdx + 1]
    : join(dirname(fileURLToPath(import.meta.url)), '..', 'triage-registry.json')
  if (!failuresPath || !existsSync(failuresPath)) {
    console.error('用法: node scripts/diff-failures.mjs check <failures.json> [--registry <path>]')
    process.exit(1)
  }
  if (!existsSync(regPath)) {
    console.error(`[check] registry 不存在: ${regPath}`)
    process.exit(1)
  }
  const reg = JSON.parse(readFileSync(regPath, 'utf8'))
  const byGraph = new Map((reg.entries ?? []).map(e => [e.graph, e]))
  const failures = JSON.parse(readFileSync(failuresPath, 'utf8'))
  const failedGraphs = [...new Set(failures.map(graphName))]
  const counts = { accepted: 0, bug: 0, tooling: 0 }
  const unclassified = []
  const fixedSuggest = []
  for (const g of failedGraphs) {
    const e = byGraph.get(g)
    if (!e) { unclassified.push(g); continue }
    counts[e.verdict] = (counts[e.verdict] ?? 0) + 1
  }
  for (const [g, e] of byGraph) {
    if (!failedGraphs.includes(g)) fixedSuggest.push({ graph: g, verdict: e.verdict, reason: e.reason })
  }
  const total = failures.length
  console.log(`=== 失败硬门禁 check: ${failuresPath} ===`)
  console.log(`失败测试 ${total} (唯一图 ${failedGraphs.length}) | accepted ${counts.accepted} / bug ${counts.bug} / tooling ${counts.tooling} / 未分类 ${unclassified.length}`)
  if (fixedSuggest.length) {
    console.log(`--- 登记册内已通过 (可移除, 不阻断) ${fixedSuggest.length} ---`)
    for (const f of fixedSuggest) console.log(`  [${f.verdict}] ${f.graph}`)
  }
  if (unclassified.length) {
    console.log(`--- 未分类失败 (阻断) ${unclassified.length} ---`)
    for (const g of unclassified) console.log(`  ? ${g}`)
    console.error('[check] FAIL: 存在未分类失败, 需先在 triage-registry.json 登记 (accepted/bug/tooling)')
    process.exit(1)
  }
  console.log('[check] PASS: 全部失败均有归因')
} else {
  console.error(`用法:
  node scripts/diff-failures.mjs collect <examples|tests|tickets|realworld> [env] [--out <path>]
  node scripts/diff-failures.mjs collect-all [out]  (examples+tests+tickets 合并)
  node scripts/diff-failures.mjs diff <baseline.json> <current.json>
  node scripts/diff-failures.mjs check <failures.json> [--registry <path>]`)
  process.exit(1)
}
