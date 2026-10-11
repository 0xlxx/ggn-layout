#!/usr/bin/env bun
/**
 * layout 内核性能工具 (阶段 0, 基准与 profiling 设施).
 *
 * 三种模式:
 *   --bench <n>  对指定图跑 n 次, 分三段计时: parse (elkt 解析) / build (LGraph 构建) / layout (布局).
 *   --phase      注入 LayoutPhaseHooks 逐模块计时, 输出耗时排序表 (定位热点模块).
 *   --cpu        单次 layout (build 用缓存解析结果), 配合
 *                `bun --cpu-prof --cpu-prof-md scripts/perf-run.mjs --cpu ...` 生成 CPU profile.
 *
 * 图选择:
 *   --graph <path.elkt>   指定单个 elkt 文件
 *   --scale small|medium|large   从 realworld 图集按节点数选图 (small <50 / medium 50-500 / large 500+)
 *   (默认)               realworld 中节点数最多的图
 *
 * 输出: stdout 文本; --out <path> 额外写 JSON 到 bench-results/.
 *
 * 用法示例:
 *   bun scripts/perf-run.mjs --phase
 *   bun scripts/perf-run.mjs --phase --scale large
 *   bun scripts/perf-run.mjs --bench 30 --scale medium --out baseline-medium.json
 *   bun --cpu-prof --cpu-prof-md scripts/perf-run.mjs --cpu --scale medium
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, isAbsolute, dirname } from 'node:path'
import { LayeredLayoutProvider } from '../src/index.ts'
import { buildLGraphFromElkt, parseElktCached, scanRealworld } from './elkt-build.mjs'
import { buildLGraphFromParsed } from '../shared/elkgraph-builder.ts'

const CACHE_DIR = join(import.meta.dirname, '../bench-results/cache')

// ── 参数解析 ──

function parseArgs(argv) {
  const opts = { mode: null, graph: null, scale: null, n: 10, out: null }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--bench') opts.mode = 'bench'
    else if (a === '--phase') opts.mode = 'phase'
    else if (a === '--cpu') opts.mode = 'cpu'
    else if (a === '--graph') opts.graph = argv[++i] ?? null
    else if (a === '--scale') opts.scale = argv[++i] ?? null
    else if (a === '--out') opts.out = argv[++i] ?? null
    else if (/^\d+$/.test(a) && opts.mode === 'bench') opts.n = Number(a)
  }
  return opts
}

// ── 图选择 ──

function pickMeta(opts) {
  if (opts.graph) return { path: opts.graph, name: opts.graph, nodeCount: null }
  const scaleRanges = { small: [1, 49], medium: [50, 199], large: [200, Infinity] }
  let meta
  if (opts.scale) {
    const [min, max] = scaleRanges[opts.scale] ?? [0, Infinity]
    const candidates = scanRealworld({ min, max })
    if (candidates.length === 0) throw new Error(`scale ${opts.scale} 无匹配图 (min=${min}, max=${max})`)
    meta = candidates[candidates.length - 1] // 该规模内最大图 (热点显著)
  } else {
    const all = scanRealworld()
    meta = all[all.length - 1] // 全量最大图
  }
  return meta
}

// ── 模式实现 ──

function runPhase(graph, meta) {
  const moduleMs = new Map()
  const moduleStart = new Map()
  const provider = new LayeredLayoutProvider()
  provider.setHooks({
    beforeModule(name) { moduleStart.set(name, performance.now()) },
    afterModule(name) {
      const s = moduleStart.get(name)
      if (s !== undefined) moduleMs.set(name, (moduleMs.get(name) ?? 0) + (performance.now() - s))
    },
  })
  const t0 = performance.now()
  provider.layout(graph)
  const total = performance.now() - t0
  provider.setHooks(undefined)

  const rows = [...moduleMs.entries()].sort((a, b) => b[1] - a[1])
  const lines = []
  lines.push(`图: ${meta.name} (${meta.nodeCount ?? '?'} 节点)`)
  lines.push(`layout 总耗时: ${total.toFixed(2)} ms`)
  lines.push('')
  lines.push('模块耗时排序:')
  lines.push(`${'模块'.padEnd(42)} ${'耗时(ms)'.padStart(10)} ${'占比'.padStart(7)}`)
  for (const [name, ms] of rows) {
    lines.push(`${name.padEnd(42)} ${ms.toFixed(2).padStart(10)} ${((ms / total) * 100).toFixed(1).padStart(6)}%`)
  }
  const text = lines.join('\n')
  console.log(text)
  return { total, modules: rows, text }
}

function runBench(meta, n) {
  const source = readFileSync(meta.path, 'utf8')
  const provider = new LayeredLayoutProvider()
  const samples = []
  // warmup 1 次
  {
    const g = buildLGraphFromParsed(parseElktCached(source, meta.name, CACHE_DIR), meta.name).graph
    provider.layout(g)
  }
  for (let i = 0; i < n; i++) {
    const tP = performance.now()
    const parsed = parseElktCached(source, meta.name, CACHE_DIR)
    const tParse = performance.now() - tP
    const tB = performance.now()
    const g = buildLGraphFromParsed(parsed, meta.name).graph
    const tBuild = performance.now() - tB
    const tL = performance.now()
    provider.layout(g)
    const tLayout = performance.now() - tL
    samples.push({ parse: tParse, build: tBuild, layout: tLayout, total: tParse + tBuild + tLayout })
  }
  const stat = (arr) => {
    const sorted = [...arr].sort((a, b) => a - b)
    const mean = sorted.reduce((s, v) => s + v, 0) / sorted.length
    const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]
    return { mean, min: sorted[0], max: sorted[sorted.length - 1], p95 }
  }
  const fmt = (s) => `mean=${s.mean.toFixed(2)}ms min=${s.min.toFixed(2)}ms max=${s.max.toFixed(2)}ms p95=${s.p95.toFixed(2)}ms`
  const parts = {
    parse: stat(samples.map(s => s.parse)),
    build: stat(samples.map(s => s.build)),
    layout: stat(samples.map(s => s.layout)),
    total: stat(samples.map(s => s.total)),
  }
  const text = [
    `图: ${meta.name} (${meta.nodeCount ?? '?'} 节点)`,
    `迭代: ${n} 次 (每次重建 LGraph)`,
    `parse:  ${fmt(parts.parse)}`,
    `build:  ${fmt(parts.build)}`,
    `layout: ${fmt(parts.layout)}`,
    `total:  ${fmt(parts.total)}`,
  ].join('\n')
  console.log(text)
  return { parts, text }
}

function runCpu(meta) {
  const source = readFileSync(meta.path, 'utf8')
  const provider = new LayeredLayoutProvider()
  // 缓存解析结果: CPU profile 主体 = build + layout (内核侧), 不被 elkt 解析噪声污染.
  const parsed = parseElktCached(source, meta.name, CACHE_DIR)
  const g = buildLGraphFromParsed(parsed, meta.name).graph
  const t0 = performance.now()
  provider.layout(g)
  const ms = performance.now() - t0
  console.log(`图: ${meta.name} (${meta.nodeCount ?? '?'} 节点) — 单次 layout: ${ms.toFixed(2)}ms (配合 bun --cpu-prof --cpu-prof-md 生成 CPU profile)`)
  return { totalMs: ms }
}

// ── 主流程 ──

const opts = parseArgs(process.argv.slice(2))
if (!opts.mode) {
  console.error('用法: bun scripts/perf-run.mjs --bench <n> | --phase | --cpu [--graph <path>|--scale small|medium|large] [--out <path>]')
  process.exit(1)
}

const meta = pickMeta(opts)
let result
if (opts.mode === 'phase') {
  const { graph } = buildLGraphFromParsed(parseElktCached(readFileSync(meta.path, 'utf8'), meta.name, CACHE_DIR), meta.name)
  result = runPhase(graph, meta)
} else if (opts.mode === 'bench') {
  result = runBench(meta, opts.n)
} else {
  result = runCpu(meta)
}

if (opts.out) {
  const outPath = isAbsolute(opts.out) ? opts.out : join(import.meta.dirname, '../bench-results', opts.out)
  mkdirSync(dirname(outPath), { recursive: true })
  const payload = opts.mode === 'bench'
    ? { mode: 'bench', graph: meta.name, nodeCount: meta.nodeCount, iterations: opts.n, ...result.parts }
    : opts.mode === 'phase'
      ? { mode: 'phase', graph: meta.name, nodeCount: meta.nodeCount, totalMs: result.total, modules: result.modules.map(([name, ms]) => ({ name, ms })) }
      : { mode: 'cpu', graph: meta.name, nodeCount: meta.nodeCount, totalMs: result.totalMs }
  writeFileSync(outPath, JSON.stringify(payload, null, 2) + '\n')
  console.log(`\n已写入 ${outPath}`)
}
