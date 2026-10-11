#!/usr/bin/env node
/**
 * elk-layout 正确性对比验证工具.
 *
 * 同一 elkt 图 → elk-layout 布局 + elkjs (oracle) 布局 → 逐节点坐标差异报告
 * + 叠加对比 SVG/PNG (elk-layout 蓝实线 / elkjs 红虚线 / 偏差>容差节点高亮).
 *
 * 用法:
 *   node scripts/compare-layout.mjs --graph test-resources/elk-models/examples/hierarchy/hierarchicalEdges.elkt
 *   node scripts/compare-layout.mjs --name examples/hierarchy/hierarchicalEdges
 *   node scripts/compare-layout.mjs --scale small            # realworld 按规模选图
 *   node scripts/compare-layout.mjs --all examples           # 批量: 输出通过率 + 最大偏差 TOP
 *   node scripts/compare-layout.mjs --tolerance 2 ...
 *
 * 输出: 差异报告 (stdout) + bench-results/compare/<name>.svg|png
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'
import ELK from 'elkjs/lib/elk.bundled.js'
import { LayeredLayoutProvider } from '../src/index.ts'
import { parseElktCached, scanRealworld, loadRealworldSource } from './elkt-build.mjs'
import { buildLGraphFromParsed } from '../shared/elkgraph-builder.ts'
import { parseElkt } from './elkt2test.mjs'

const OUT_DIR = join(import.meta.dirname, '../bench-results/compare')
const CACHE_DIR = join(import.meta.dirname, '../bench-results/cache')
const EXAMPLES_DIR = join(import.meta.dirname, '../test-resources/elk-models/examples')

// ── 参数 ──
function parseArgs(argv) {
  const opts = { graph: null, name: null, scale: null, all: null, tolerance: 1, png: true }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--graph') opts.graph = argv[++i]
    else if (a === '--name') opts.name = argv[++i]
    else if (a === '--scale') opts.scale = argv[++i]
    else if (a === '--all') opts.all = argv[++i]
    else if (a === '--tolerance') opts.tolerance = Number(argv[++i])
    else if (a === '--no-png') opts.png = false
  }
  return opts
}

// ── elkjs 输入构建 (与 elk-layout 侧完全一致, elkt2test 教训) ──
function buildElkJson(parsed) {
  const { nodes, edges, hierarchy, graphProps, nodeProps } = parsed
  function buildNode(id) {
    const p = nodeProps.get(id) ?? {}
    const n = { id, width: p.width ?? 60, height: p.height ?? 30 }
    const ports = p.ports ?? []
    if (ports.length) {
      n.ports = ports.map((pt) => ({
        id: id + '.' + pt.id, width: pt.w ?? 8, height: pt.h ?? 8, x: pt.x ?? 0, y: pt.y ?? 0,
        properties: { 'port.side': pt.side ?? 'UNDEFINED', 'port.index': String(pt.index ?? 0) },
      }))
    }
    const kids = hierarchy.get(id) ?? []
    if (kids.length) n.children = kids.map(buildNode)
    return n
  }
  const childIds = new Set([...hierarchy.values()].flat())
  const elkEdges = edges.map(([s, sp, t, tp], i) => ({
    id: 'e' + i, sources: [sp ? s + '.' + sp : s], targets: [tp ? t + '.' + tp : t],
  }))
  return {
    children: nodes.filter((id) => !childIds.has(id)).map(buildNode),
    edges: elkEdges,
    direction: (graphProps.direction ?? 'RIGHT').toUpperCase(),
    hasHierarchy: hierarchy.size > 0,
  }
}

// ── 两引擎布局 + 世界坐标 ──
function layoutBoth(parsed, name) {
  // elk-layout
  const { graph } = buildLGraphFromParsed(parsed, name)
  new LayeredLayoutProvider().layout(graph)
  const ggnWorld = new Map()
  const worldOf = (n) => {
    let wx = n.position.x, wy = n.position.y
    let g = n.getGraph()
    while (g !== null && g !== graph) {
      const parent = g.getParentNode()
      if (parent === null) break
      wx += parent.position.x; wy += parent.position.y
      g = parent.getGraph()
    }
    return { x: wx, y: wy }
  }
  const ggnNodes = []
  const collectGgn = (g) => {
    for (const n of g.getAllNodes()) {
      if (n.size.x <= 0 || n.size.y <= 0) continue
      const w = worldOf(n)
      ggnNodes.push({ id: n.id, x: w.x, y: w.y, width: n.size.x, height: n.size.y })
      if (n.getNestedGraph()) collectGgn(n.getNestedGraph())
    }
  }
  collectGgn(graph)

  return { ggnNodes }
}

function layoutElkjs(parsed) {
  return new Promise(async (resolve, reject) => {
    try {
      const json = buildElkJson(parsed)
      const elk = new ELK()
      const opts = {
        'elk.algorithm': 'layered',
        'elk.direction': json.direction,
        'elk.randomSeed': '1',
      }
      if (json.hasHierarchy) opts['elk.hierarchyHandling'] = 'INCLUDE_CHILDREN'
      const res = await elk.layout({ id: 'root', layoutOptions: opts, children: json.children, edges: json.edges })
      const out = []
      const walk = (list, px, py) => {
        for (const c of list) {
          const wx = px + c.x, wy = py + c.y
          out.push({ id: c.id, x: wx, y: wy, width: c.width, height: c.height })
          if (c.children) walk(c.children, wx, wy)
        }
      }
      walk(res.children ?? [], 0, 0)
      resolve(out)
    } catch (e) { reject(e) }
  })
}

// ── 差异计算 ──
function diff(ggnNodes, elkNodes, tolerance) {
  const elkById = new Map(elkNodes.map((n) => [n.id, n]))
  const rows = []
  for (const g of ggnNodes) {
    const e = elkById.get(String(g.id))
    if (!e) continue
    const dx = g.x - e.x, dy = g.y - e.y
    const dist = Math.hypot(dx, dy)
    rows.push({ id: g.id, gx: g.x, gy: g.y, ex: e.x, ey: e.y, dx, dy, dist, pass: dist <= tolerance })
  }
  rows.sort((a, b) => b.dist - a.dist)
  const passed = rows.filter((r) => r.pass).length
  return { rows, passed, total: rows.length, maxDist: rows[0]?.dist ?? 0 }
}

// ── 叠加 SVG ──
function overlaySvg(ggnNodes, elkNodes, rows, tolerance) {
  const all = [...ggnNodes, ...elkNodes]
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const n of all) {
    minX = Math.min(minX, n.x); minY = Math.min(minY, n.y)
    maxX = Math.max(maxX, n.x + n.width); maxY = Math.max(maxY, n.y + n.height)
  }
  const PAD = 40
  const W = maxX - minX + PAD * 2, H = maxY - minY + PAD * 2
  const tx = (x) => x - minX + PAD, ty = (y) => y - minY + PAD
  const bad = new Set(rows.filter((r) => !r.pass).map((r) => r.id))
  const parts = []
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="system-ui, sans-serif">`)
  parts.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="#0d1422"/>`)
  parts.push(`<text x="${PAD}" y="${PAD - 16}" fill="#e5e7eb" font-size="13">elk-layout (蓝实线)  vs  elkjs (红虚线)   ·  差异 > ${tolerance}px 高亮</text>`)
  // elkjs 红虚线
  for (const n of elkNodes) {
    parts.push(`<rect x="${tx(n.x).toFixed(1)}" y="${ty(n.y).toFixed(1)}" width="${n.width.toFixed(1)}" height="${n.height.toFixed(1)}" fill="none" stroke="#ef4444" stroke-width="1.5" stroke-dasharray="5,4"/>`)
  }
  // elk-layout 蓝实线
  for (const n of ggnNodes) {
    const isBad = bad.has(String(n.id))
    const sw = isBad ? 3 : 1.5
    const stroke = isBad ? '#f59e0b' : '#38bdf8'
    parts.push(`<rect x="${tx(n.x).toFixed(1)}" y="${ty(n.y).toFixed(1)}" width="${n.width.toFixed(1)}" height="${n.height.toFixed(1)}" fill="rgba(56,189,248,0.08)" stroke="${stroke}" stroke-width="${sw}"/>`)
  }
  // 差异标签
  for (const r of rows) {
    if (r.pass) continue
    parts.push(`<text x="${tx((r.gx + r.ex) / 2).toFixed(1)}" y="${ty(Math.max(r.gy, r.ey) - 6).toFixed(1)}" fill="#f59e0b" font-size="10" text-anchor="middle">Δ${r.dist.toFixed(1)}</text>`)
  }
  parts.push('</svg>')
  return parts.join('\n')
}

// ── 主流程 ──

async function compareOne(name, path, tolerance, png) {
  const source = readFileSync(path, 'utf8')
  const parsed = parseElktCached(source, name, CACHE_DIR)
  const { ggnNodes } = layoutBoth(parsed, name)
  const elkNodes = await layoutElkjs(parsed)
  const d = diff(ggnNodes, elkNodes, tolerance)
  return { name, d, ggnNodes, elkNodes }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  mkdirSync(OUT_DIR, { recursive: true })

  // 批量模式
  if (opts.all) {
    const dir = opts.all === 'examples' ? EXAMPLES_DIR : join(import.meta.dirname, '../test-resources/elk-models/' + opts.all)
    const { readdirSync } = await import('node:fs')
    const files = []
    const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) { const f = join(d, e.name); if (e.isDirectory()) walk(f); else if (e.name.endsWith('.elkt')) files.push(f) } }
    walk(dir)
    const results = []
    for (const f of files) {
      const name = f.replace(EXAMPLES_DIR + '/', '').replace(/\.elkt$/, '')
      try {
        const r = await compareOne(name, f, opts.tolerance, false)
        results.push(r)
      } catch (e) { results.push({ name, error: e.message }) }
    }
    const ok = results.filter((r) => !r.error && r.d.total > 0 && r.d.passed === r.d.total)
    const fail = results.filter((r) => r.error || (r.d && r.d.passed < r.d.total))
    console.log(`批量对比: ${results.length} 图 | 通过 ${ok.length} | 失败 ${fail.length}`)
    if (fail.length) {
      console.log('\n失败明细 (偏差 > ' + opts.tolerance + 'px):')
      fail.sort((a, b) => ((b.d?.maxDist ?? 0) - (a.d?.maxDist ?? 0)))
      for (const f of fail.slice(0, 20)) {
        if (f.error) console.log(`  ✗ ${f.name}  error: ${f.error}`)
        else console.log(`  ✗ ${f.name}  ${f.d.passed}/${f.d.total} 通过, 最大偏差 ${f.d.maxDist.toFixed(2)}px`)
      }
    }
    return
  }

  // 单图模式
  let name, path
  if (opts.graph) { name = opts.graph.replace(/\.elkt$/, ''); path = opts.graph }
  else if (opts.name) { name = opts.name; path = join(import.meta.dirname, '../test-resources/elk-models/' + opts.name + '.elkt') }
  else if (opts.scale) {
    const ranges = { small: [1, 49], medium: [50, 199], large: [200, Infinity] }
    const [min, max] = ranges[opts.scale] ?? [0, Infinity]
    const cands = scanRealworld({ min, max })
    const meta = cands[Math.floor(cands.length / 2)]
    name = meta.name; path = meta.path
  } else {
    name = 'examples/hierarchy/hierarchicalEdges'
    path = join(EXAMPLES_DIR, 'hierarchy/hierarchicalEdges.elkt')
  }

  const { d, ggnNodes, elkNodes } = await compareOne(name, path, opts.tolerance, opts.png)
  const lines = []
  lines.push(`对比: ${name}`)
  lines.push(`节点: ${d.total} | 通过: ${d.passed} (${(d.passed / d.total * 100).toFixed(1)}%) | 容差: ${opts.tolerance}px | 最大偏差: ${d.maxDist.toFixed(2)}px`)
  lines.push('')
  lines.push('偏差 TOP (dx, dy 为 elk-layout - elkjs):')
  lines.push(`${'节点'.padEnd(28)} ${'ggn'.padStart(18)} ${'elkjs'.padStart(18)} ${'Δ'.padStart(8)}`)
  for (const r of d.rows.slice(0, 10)) {
    const flag = r.pass ? ' ' : '✗'
    const g = `(${r.gx.toFixed(1)},${r.gy.toFixed(1)})`.padStart(18)
    const e = `(${r.ex.toFixed(1)},${r.ey.toFixed(1)})`.padStart(18)
    lines.push(`${flag} ${String(r.id).padEnd(26)} ${g} ${e} ${r.dist.toFixed(2).padStart(6)}`)
  }
  const text = lines.join('\n')
  console.log(text)

  const safe = name.replace(/[^A-Za-z0-9_-]/g, '_')
  const svg = overlaySvg(ggnNodes, elkNodes, d.rows, opts.tolerance)
  const svgPath = join(OUT_DIR, safe + '.svg')
  writeFileSync(svgPath, svg, 'utf8')
  console.log(`\n叠加对比: ${svgPath}`)
  if (opts.png) {
    const browser = await chromium.launch()
    try {
      const page = await browser.newPage()
      await page.setContent(`<!doctype html><body style="margin:0;background:#0d1422">${svg}</body>`)
      const box = await page.locator('svg').boundingBox()
      await page.setViewportSize({ width: Math.ceil(box.width), height: Math.ceil(box.height) })
      const pngPath = join(OUT_DIR, safe + '.png')
      await page.screenshot({ path: pngPath })
      console.log(`PNG: ${pngPath}`)
    } finally { await browser.close() }
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
