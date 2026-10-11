#!/usr/bin/env node
/**
 * compare-elkjs-perf-v8 — elkjs vs elk-layout 在 Node(V8) 下的性能对比 (真实 web 目标运行时).
 *
 * 与 bun 版 (compare-elkjs-perf.mjs) 对齐: 同一 JSON 输入, 双方预热后采样.
 * 输入: bench-results/compare-input/<scale>.json (由 bun 预生成, 含 elkt→JSON 转换).
 *
 * 用法:
 *   node scripts/compare-elkjs-perf-v8.mjs [--iter 10]
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import ELK from 'elkjs/lib/main.js'
import { buildGraph } from '../dist/api/index.js'
import { LayeredLayoutProvider } from '../dist/core.js'

const here = dirname(fileURLToPath(import.meta.url))
const INPUT_DIR = join(here, '../bench-results/compare-input')

function parseArgs(argv) {
  const opts = { iter: 10, scales: ['small', 'medium', 'large'] }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--iter') opts.iter = Number(argv[++i] ?? 10)
    else if (argv[i] === '--scale') opts.scales = [argv[++i]]
  }
  return opts
}

function stat(arr) {
  const sorted = [...arr].sort((a, b) => a - b)
  const mean = sorted.reduce((s, v) => s + v, 0) / sorted.length
  const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]
  return { mean, min: sorted[0], max: sorted[sorted.length - 1], p95 }
}
const fmt = (s) => `${s.mean.toFixed(2)}ms  [min=${s.min.toFixed(2)} max=${s.max.toFixed(2)} p95=${s.p95.toFixed(2)}]`

async function compareOne(meta, n) {
  const json = meta.json
  const opts = {
    'elk.algorithm': 'layered',
    'elk.direction': json.direction,
    'elk.randomSeed': '1',
  }
  if (json.hasHierarchy) opts['elk.hierarchyHandling'] = 'INCLUDE_CHILDREN'
  const req = () => ({ id: 'root', layoutOptions: opts, children: json.children, edges: json.edges })

  // elkjs (worker + wasm)
  const elk = new ELK()
  await elk.layout(req()) // 预热: worker + wasm 初始化
  const elkSamples = []
  for (let i = 0; i < n; i++) {
    const t = performance.now()
    await elk.layout(req())
    elkSamples.push(performance.now() - t)
  }
  // main.js 内置 fake worker (主线程模拟), 无 terminate; 无需清理

  // elk-layout (dist, V8): buildGraph (JSON→LGraph) + provider.layout
  const provider = new LayeredLayoutProvider()
  {
    const built = buildGraph(json, { algorithm: 'layered' })
    provider.layout(built.graph)
  }
  const lkBuildSamples = []
  const lkLayoutSamples = []
  for (let i = 0; i < n; i++) {
    const tB = performance.now()
    const built = buildGraph(json, { algorithm: 'layered' })
    const tBuild = performance.now() - tB
    const tL = performance.now()
    provider.layout(built.graph)
    const tLayout = performance.now() - tL
    lkBuildSamples.push(tBuild)
    lkLayoutSamples.push(tLayout)
  }

  const sElk = stat(elkSamples)
  const sLkBuild = stat(lkBuildSamples)
  const sLkLayout = stat(lkLayoutSamples)
  const elkE2E = sElk
  const lkE2E = { mean: sLkBuild.mean + sLkLayout.mean, min: sLkBuild.min + sLkLayout.min, max: sLkBuild.max + sLkLayout.max, p95: sLkBuild.p95 + sLkLayout.p95 }

  return {
    name: meta.name,
    nodeCount: meta.nodeCount,
    hasHierarchy: json.hasHierarchy,
    elkjs: { layout: sElk, end2end: elkE2E },
    'elk-layout': { build: sLkBuild, layout: sLkLayout, end2end: lkE2E },
  }
}

const opts = parseArgs(process.argv.slice(2))
const metas = opts.scales.map(s => {
  const raw = JSON.parse(readFileSync(join(INPUT_DIR, s + '.json'), 'utf8'))
  return { name: raw.name, nodeCount: raw.nodeCount, json: raw.json }
})

for (const meta of metas) {
  const r = await compareOne(meta, opts.iter)
  const hier = r.hasHierarchy ? '层级' : '平面'
  const ratioLayout = r.elkjs.layout.mean / r['elk-layout'].layout.mean
  const ratioE2E = r.elkjs.end2end.mean / r['elk-layout'].end2end.mean
  console.log('')
  console.log(`═══ ${r.name} (${r.nodeCount} 节点, ${hier}) · Node/V8 ═══`)
  console.log(`  elkjs:      layout   ${fmt(r.elkjs.layout)}   (纯布局, wasm in worker)`)
  console.log(`  elk-layout: build    ${fmt(r['elk-layout'].build)}   (JSON→LGraph)`)
  console.log(`              layout   ${fmt(r['elk-layout'].layout)}   (纯布局, TS/V8)`)
  console.log(`  加速比 layout:  elkjs/elk-layout = ${ratioLayout.toFixed(2)}x  (${ratioLayout > 1 ? 'elk-layout 快' : 'elkjs 快'})`)
  console.log(`  加速比 end2end: elkjs/elk-layout = ${ratioE2E.toFixed(2)}x  (${ratioE2E > 1 ? 'elk-layout 快' : 'elkjs 快'})`)
}
