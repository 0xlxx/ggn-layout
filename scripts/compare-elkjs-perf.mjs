#!/usr/bin/env bun
/**
 * compare-elkjs-perf — elkjs(官方 wasm) vs elk-layout(本仓库 TS 移植) 性能对比摸底.
 *
 * 用法:
 *   bun scripts/compare-elkjs-perf.mjs [--iter 10] [--scale small|medium|large] [--graph <elkt>]
 *   bun scripts/compare-elkjs-perf.mjs                # 三个规模各 10 次
 *
 * 公平性:
 *   - 同一运行时 (bun/JSC) 双跑; 同一输入图.
 *   - 双方各预热 1 次 (wasm 初始化 / JIT) 后再采样.
 *   - elkjs 侧: json 构建计时单独列 (parse+json), layout 只算 elk.layout(json).
 *   - elk-layout 侧: 复用 perf-run 三段 (parse/build/layout), layout 是内核布局.
 *   - 对比主指标 = layout 均值 (不含各自输入转换), 端到端另列.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import ELK from 'elkjs/lib/elk-api.js'
import { LayeredLayoutProvider } from '../src/index.ts'
import { scanRealworld, loadRealworldSource, parseElktCached } from './elkt-build.mjs'
import { buildLGraphFromParsed } from '../shared/elkgraph-builder.ts'
import { parseElkt } from './elkt2test.mjs'

const CACHE_DIR = join(import.meta.dirname, '../bench-results/cache')

// elkjs 0.12.0: elk-api.js 需要 workerUrl (bun 支持 file:// Worker; bundled worker 版在 bun 下不可用)
// 用 import.meta.resolve 精确定位包内文件, 避免手算相对路径错位
const ELKJS_WORKER_URL = import.meta.resolve('elkjs/lib/elk-worker.js')

// ── 参数 ──
function parseArgs(argv) {
  const opts = { iter: 10, scales: ['small', 'medium', 'large'], graph: null }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--iter') opts.iter = Number(argv[++i] ?? 10)
    else if (a === '--scale') opts.scales = [argv[++i]]
    else if (a === '--graph') opts.graph = argv[++i]
    else if (a === '--all') opts.scales = ['small', 'medium', 'large']
  }
  return opts
}

// ── elkt → elkjs JSON (与 render-elkjs.mjs 同源, 未导出故内联) ──
function buildElkJson(parsed) {
  const { nodes, edges, hierarchy, nodeProps, graphProps } = parsed
  const childIds = new Set([...hierarchy.values()].flat())
  function buildNode(id) {
    const p = nodeProps.get(id) ?? {}
    const n = { id, width: p.width ?? 60, height: p.height ?? 30 }
    const ports = p.ports ?? []
    if (ports.length) {
      n.ports = ports.map(pt => ({
        id: id + '.' + pt.id, width: pt.w ?? 8, height: pt.h ?? 8, x: pt.x ?? 0, y: pt.y ?? 0,
        properties: { 'port.side': pt.side ?? 'UNDEFINED', 'port.index': String(pt.index ?? 0) },
      }))
    }
    const kids = hierarchy.get(id) ?? []
    if (kids.length) n.children = kids.map(buildNode)
    return n
  }
  const elkEdges = edges.map((e, i) => ({
    id: 'e' + i, sources: [e[1] ? e[0] + '.' + e[1] : e[0]], targets: [e[3] ? e[2] + '.' + e[3] : e[2]],
  }))
  return {
    children: nodes.filter(id => !childIds.has(id)).map(buildNode),
    edges: elkEdges,
    direction: (graphProps.direction ?? 'RIGHT').toUpperCase(),
    hasHierarchy: hierarchy.size > 0,
  }
}

// ── 统计 (与 perf-run.mjs 一致) ──
function stat(arr) {
  const sorted = [...arr].sort((a, b) => a - b)
  const mean = sorted.reduce((s, v) => s + v, 0) / sorted.length
  const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]
  return { mean, min: sorted[0], max: sorted[sorted.length - 1], p95 }
}
const fmt = (s) => `${s.mean.toFixed(2)}ms  [min=${s.min.toFixed(2)} max=${s.max.toFixed(2)} p95=${s.p95.toFixed(2)}]`

// ── 单图对比 ──
async function compareOne(meta, n) {
  const source = loadRealworldSource(meta.name)

  // elkjs 侧
  const elk = new ELK({ workerUrl: ELKJS_WORKER_URL })
  const baseJson = buildElkJson(parseElkt(source))
  const opts = {
    'elk.algorithm': 'layered',
    'elk.direction': baseJson.direction,
    'elk.randomSeed': '1',
  }
  if (baseJson.hasHierarchy) opts['elk.hierarchyHandling'] = 'INCLUDE_CHILDREN'
  const makeReq = (parsed) => ({
    id: 'root',
    layoutOptions: opts,
    children: buildElkJson(parsed).children,
    edges: buildElkJson(parsed).edges,
  })
  // 预热 (wasm 初始化 + JIT)
  await elk.layout(makeReq(parseElktCached(source, meta.name, CACHE_DIR)))
  const elkJsonSamples = []
  const elkLayoutSamples = []
  for (let i = 0; i < n; i++) {
    const tJ = performance.now()
    const parsed = parseElktCached(source, meta.name, CACHE_DIR)
    const req = makeReq(parsed)
    const tJson = performance.now() - tJ
    const tL = performance.now()
    await elk.layout(req)
    const tLayout = performance.now() - tL
    elkJsonSamples.push(tJson)
    elkLayoutSamples.push(tLayout)
  }

  elk.terminateWorker()

  // elk-layout 侧
  const provider = new LayeredLayoutProvider()
  {
    const g = buildLGraphFromParsed(parseElktCached(source, meta.name, CACHE_DIR), meta.name).graph
    provider.layout(g)
  }
  const lkParse = []
  const lkBuild = []
  const lkLayout = []
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
    lkParse.push(tParse); lkBuild.push(tBuild); lkLayout.push(tLayout)
  }

  const sElkJson = stat(elkJsonSamples)
  const sElkLayout = stat(elkLayoutSamples)
  const sLkParse = stat(lkParse)
  const sLkBuild = stat(lkBuild)
  const sLkLayout = stat(lkLayout)

  const elkEnd2end = { mean: sElkJson.mean + sElkLayout.mean, min: sElkJson.min + sElkLayout.min, max: sElkJson.max + sElkLayout.max, p95: sElkJson.p95 + sElkLayout.p95 }
  const lkEnd2end = { mean: sLkParse.mean + sLkBuild.mean + sLkLayout.mean, min: sLkParse.min + sLkBuild.min + sLkLayout.min, max: sLkParse.max + sLkBuild.max + sLkLayout.max, p95: sLkParse.p95 + sLkBuild.p95 + sLkLayout.p95 }

  return {
    name: meta.name,
    nodeCount: meta.nodeCount,
    hasHierarchy: baseJson.hasHierarchy,
    elkjs: { 'parse+json': sElkJson, layout: sElkLayout, end2end: elkEnd2end },
    'elk-layout': { parse: sLkParse, build: sLkBuild, layout: sLkLayout, end2end: lkEnd2end },
  }
}

// ── 主流程 ──
const opts = parseArgs(process.argv.slice(2))
const scaleRanges = { small: [1, 49], medium: [50, 199], large: [200, Infinity] }
const metas = opts.graph
  ? [{ path: opts.graph, name: opts.graph, nodeCount: null }]
  : opts.scales.map(s => {
      const [min, max] = scaleRanges[s] ?? [0, Infinity]
      const all = scanRealworld({ min, max })
      if (!all.length) throw new Error(`scale ${s} 无图`)
      return all[all.length - 1]
    })

const rows = []
for (const meta of metas) {
  const r = await compareOne(meta, opts.iter)
  rows.push(r)
  const hier = r.hasHierarchy ? '层级' : '平面'
  const ratioLayout = r.elkjs.layout.mean / r['elk-layout'].layout.mean
  const ratioE2E = r.elkjs.end2end.mean / r['elk-layout'].end2end.mean
  console.log('')
  console.log(`═══ ${r.name} (${r.nodeCount} 节点, ${hier}) ═══`)
  console.log(`  elkjs:      parse+json ${fmt(r.elkjs['parse+json'])}`)
  console.log(`              layout   ${fmt(r.elkjs.layout)}   (纯布局, wasm)`)
  console.log(`              end2end  ${fmt(r.elkjs.end2end)}  (json构建+layout)`)
  console.log(`  elk-layout: parse    ${fmt(r['elk-layout'].parse)}`)
  console.log(`              build    ${fmt(r['elk-layout'].build)}`)
  console.log(`              layout   ${fmt(r['elk-layout'].layout)}   (纯布局, TS)`)
  console.log(`              end2end  ${fmt(r['elk-layout'].end2end)}  (parse+build+layout)`)
  console.log(`  加速比 layout:  elkjs/elk-layout = ${ratioLayout.toFixed(2)}x  (${ratioLayout > 1 ? 'elk-layout 快' : 'elkjs 快'})`)
  console.log(`  加速比 end2end: elkjs/elk-layout = ${ratioE2E.toFixed(2)}x  (${ratioE2E > 1 ? 'elk-layout 快' : 'elkjs 快'})`)
}
