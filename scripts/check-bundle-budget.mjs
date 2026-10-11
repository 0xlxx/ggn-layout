#!/usr/bin/env bun
/**
 * bundle 字节预算门禁（2026-09-13，批次 15）。
 *
 * 背景：`check:bench` 只管速度，**bundle 没有任何回归门禁** —— 批次 14 的性能优化
 * （缓存 / 预计算邻接）把 core chunk 从 506,686 涨到 510,167 字节（+3.5KB）没人拦。
 * 本门禁只做一件事：产物字节**只许不涨**（超阈值即失败），防止「优化跑得更快、包更大」悄悄发生。
 *
 * 口径：**tsdown 产物**（带 define；bun build 不加 define 会多出全部 debug 分支，
 * 实测同一入口 581KB vs 510KB，不要用那个口径）。所以本脚本先要求 dist 存在，
 * 由 `bun run check:bundle`（= bunx tsdown && 本脚本）保证顺序。
 *
 * 度量：
 *   - core   = dist/elk-json-*.js（layered 内核主体）
 *   - api    = dist/api-*.js
 *   - algs   = dist/algorithms-*.js（非 layered，子入口 tree-shake 后应保持小）
 *   - total  = dist 下全部 .js 之和
 * 判定：raw 或 gzip 超过「基线 ×(1+阈值) 且 超出绝对下限」→ 失败（默认阈值 2% / 下限 2KB）。
 *
 * 用法:
 *   bun run check:bundle              # 构建 + 对比基线（CI/合入前）
 *   node scripts/check-bundle-budget.mjs --update   # 重新采样基线（必须在审查过的尺寸上）
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(ROOT, 'dist')
const BASELINE = join(ROOT, 'bench-results', 'baseline-bundle.json')
const argv = process.argv.slice(2)
const UPDATE = argv.includes('--update')
const PCT = argv.includes('--pct') ? Number(argv[argv.indexOf('--pct') + 1]) : 0.02
const ABS = argv.includes('--abs') ? Number(argv[argv.indexOf('--abs') + 1]) : 2048

if (!existsSync(DIST)) {
  console.error('[bundlegate] 找不到 dist/ —— 先 `bunx tsdown`（或用 `bun run check:bundle`）')
  process.exit(1)
}
const files = readdirSync(DIST).filter((f) => f.endsWith('.js'))
const sizeOf = (f) => { const b = readFileSync(join(DIST, f)); return { raw: b.length, gzip: gzipSync(b).length } }
const pick = (prefix) => files.find((f) => f.startsWith(prefix))
const sum = (list) => list.reduce((acc, f) => { const s = sizeOf(f); return { raw: acc.raw + s.raw, gzip: acc.gzip + s.gzip } }, { raw: 0, gzip: 0 })

const core = pick('elk-json-')
const api = pick('api-')
const algs = pick('algorithms-')
const cur = {
  updated: new Date().toISOString().slice(0, 10),
  files: files.length,
  core: core ? sizeOf(core) : { raw: 0, gzip: 0 },
  api: api ? sizeOf(api) : { raw: 0, gzip: 0 },
  algorithms: algs ? sizeOf(algs) : { raw: 0, gzip: 0 },
  total: sum(files),
}

if (UPDATE || !existsSync(BASELINE)) {
  writeFileSync(BASELINE, JSON.stringify(cur, null, 2) + '\n')
  console.log('[bundlegate] 基线已写: ' + BASELINE)
  console.log(JSON.stringify(cur, null, 2))
  process.exit(0)
}

const base = JSON.parse(readFileSync(BASELINE, 'utf8'))
const fmt = (n) => String(n).padStart(9)
const row = (name, b, c) => {
  const dRaw = c.raw - b.raw, dGz = c.gzip - b.gzip
  const pctRaw = b.raw ? (100 * dRaw) / b.raw : 0
  return `  ${name.padEnd(11)} raw ${fmt(b.raw)} → ${fmt(c.raw)} (${dRaw >= 0 ? '+' : ''}${dRaw}, ${pctRaw >= 0 ? '+' : ''}${pctRaw.toFixed(2)}%)   gzip ${fmt(b.gzip)} → ${fmt(c.gzip)} (${dGz >= 0 ? '+' : ''}${dGz})`
}
console.log('[bundlegate] 产物字节对比（dist/*.js, tsdown 口径）')
const targets = ['core', 'api', 'algorithms', 'total']
for (const t of targets) console.log(row(t, base[t], cur[t]))

const failures = []
for (const t of targets) {
  for (const unit of ['raw', 'gzip']) {
    const b = base[t][unit], c = cur[t][unit]
    const overPct = b > 0 && c > b * (1 + PCT)
    const overAbs = c - b > ABS
    if (overPct && overAbs) failures.push({ target: t, unit, base: b, cur: c, delta: c - b })
  }
}
if (failures.length === 0) {
  console.log(`\n[bundlegate] 通过: 无预算超支（阈值 +${(PCT * 100).toFixed(1)}% 且 >${ABS} 字节）`)
  process.exit(0)
}
console.log(`\n[bundlegate] 失败 ${failures.length} 项（阈值 +${(PCT * 100).toFixed(1)}% 且 >${ABS} 字节）:`)
for (const f of failures) console.log(`  ${f.target}.${f.unit}: ${f.base} → ${f.cur} (+${f.delta})`)
console.log('  若是**有意的**尺寸增长：先确认收益，再 `node scripts/check-bundle-budget.mjs --update`。')
process.exit(1)
