#!/usr/bin/env bun
/**
 * layout 布局渲染预览 (阶段 0 附属工具).
 *
 * 从 elkt 图 → layout LGraph → LayeredLayoutProvider.layout()
 * → 世界坐标投影 → SVG → playwright 截图 PNG (可直接在对话/浏览器查看效果).
 *
 * 用法:
 *   bun scripts/render-elk.mjs --scale small [--out dir]
 *   bun scripts/render-elk.mjs --graph test-resources/elk-models/realworld/ptolemy/flattened/xxx.elkt
 *   bun scripts/render-elk.mjs --name ptolemy/hierarchical/de_clockdrift_ClockDriftHierarchy
 *
 * 输出: <out>/<name>.png (默认 bench-results/render/)
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { LayeredLayoutProvider } from '../src/index.ts'
// 投影不再使用 lgraph-util 的 changeCoordSystem/coordSystemOffset (其含 padding 双重偏移).
import { parseElktCached, scanRealworld, loadRealworldSource } from './elkt-build.mjs'
import { buildLGraphFromParsed } from '../shared/elkgraph-builder.ts'

const OUT_DIR = join(import.meta.dirname, '../bench-results/render')
const CACHE_DIR = join(import.meta.dirname, '../bench-results/cache')

// ── 参数 ──

function parseArgs(argv) {
  const opts = { graph: null, scale: null, name: null, out: OUT_DIR, pad: 48 }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--graph') opts.graph = argv[++i] ?? null
    else if (a === '--scale') opts.scale = argv[++i] ?? null
    else if (a === '--name') opts.name = argv[++i] ?? null
    else if (a === '--out') opts.out = argv[++i] ?? null
    else if (a === '--pad') opts.pad = Number(argv[++i] ?? 48)
  }
  return opts
}

// ── 图选择 ──

function pickMeta(opts) {
  if (opts.graph) return { path: opts.graph, name: opts.graph.replace(/\.elkt$/, ''), nodeCount: null }
  if (opts.name) return { path: join(import.meta.dirname, '../test-resources/elk-models/realworld', opts.name + '.elkt'), name: opts.name, nodeCount: null }
  const scaleRanges = { small: [1, 49], medium: [50, 199], large: [200, Infinity] }
  const [min, max] = opts.scale ? (scaleRanges[opts.scale] ?? [0, Infinity]) : [0, Infinity]
  const candidates = scanRealworld({ min, max })
  if (candidates.length === 0) throw new Error(`scale ${opts.scale} 无匹配图`)
  // 该规模取中等大小图 (渲染可读性)
  return candidates[Math.floor(candidates.length / 2)]
}

// ── 布局 + 坐标提取 ──

function collectNodes(graph, out = []) {
  for (const n of graph.getLayerlessNodes()) {
    out.push(n)
    if (n.getNestedGraph()) collectNodes(n.getNestedGraph(), out)
  }
  for (const layer of graph.getLayers()) {
    for (const n of layer.getNodes()) {
      out.push(n)
      if (n.getNestedGraph()) collectNodes(n.getNestedGraph(), out)
    }
  }
  return out
}

function worldOf(n, rootGraph) {
  // ELK 布局后子图节点 position 已含父 padding 偏移 (与生成测试 walkGgn 一致):
  // 世界坐标 = 累加祖先节点 position, 不额外加 padding, 否则会双重偏移.
  let wx = n.position.x, wy = n.position.y
  let g = n.getGraph()
  while (g !== null && g !== rootGraph) {
    const parent = g.getParentNode()
    if (parent === null) break
    wx += parent.position.x
    wy += parent.position.y
    g = parent.getGraph()
  }
  return { x: wx, y: wy }
}

function layoutGraph(meta) {
  const source = readFileSync(meta.path, 'utf8')
  const parsed = parseElktCached(source, meta.name, CACHE_DIR)
  const { graph } = buildLGraphFromParsed(parsed, meta.name)
  new LayeredLayoutProvider().layout(graph)
  return graph
}

function extract(graph) {
  const root = graph
  const nodes = collectNodes(graph).filter((n) => n.size.x > 0 && n.size.y > 0)
  const nodeRects = nodes.map((n) => {
    const w = worldOf(n, root)
    return { id: n.id, x: w.x, y: w.y, width: n.size.x, height: n.size.y, isCompound: n.getNestedGraph() !== null }
  })

  // 收集所有边 (去重: 每条边只从 source 端收集一次)
  const seen = new Set()
  const edges = []
  for (const n of nodes) {
    for (const p of n.getPorts()) {
      for (const e of p.getOutgoingEdges()) {
        const src = e.getSource(), tgt = e.getTarget()
        if (!src || !tgt) continue
        const key = e.id
        if (seen.has(key)) continue
        seen.add(key)
        const srcNode = src.getNode(), tgtNode = tgt.getNode()
        const srcW = worldOf(srcNode, root), tgtW = worldOf(tgtNode, root)
        const start = { x: srcW.x + src.getPosition().x, y: srcW.y + src.getPosition().y }
        const end = { x: tgtW.x + tgt.getPosition().x, y: tgtW.y + tgt.getPosition().y }
        // bendPoints 投影到根坐标系 (坐标系 = source 节点所在图): 累加祖先 position, 不加 padding.
        const edgeGraph = srcNode.getGraph()
        let ox = 0, oy = 0
        let eg = edgeGraph
        while (eg !== null && eg !== root) {
          const parent = eg.getParentNode()
          if (parent === null) break
          ox += parent.position.x
          oy += parent.position.y
          eg = parent.getGraph()
        }
        const points = e.getBendPoints().map((bp) => ({ x: bp.x + ox, y: bp.y + oy }))
        edges.push({ id: key, start, end, points })
      }
    }
  }
  return { nodes: nodeRects, edges }
}

// ── SVG 生成 ──

function toSvg(data, pad = 48) {
  const PAD = pad
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const n of data.nodes) {
    minX = Math.min(minX, n.x); minY = Math.min(minY, n.y)
    maxX = Math.max(maxX, n.x + n.width); maxY = Math.max(maxY, n.y + n.height)
  }
  for (const e of data.edges) {
    for (const pt of [e.start, e.end, ...e.points]) {
      minX = Math.min(minX, pt.x); minY = Math.min(minY, pt.y)
      maxX = Math.max(maxX, pt.x); maxY = Math.max(maxY, pt.y)
    }
  }
  const W = maxX - minX + PAD * 2, H = maxY - minY + PAD * 2
  const tx = (x) => x - minX + PAD, ty = (y) => y - minY + PAD

  const parts = []
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="system-ui, sans-serif">`)
  parts.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff"/>`)
  // 边
  for (const e of data.edges) {
    const pts = [e.start, ...e.points, e.end].map((p) => `${tx(p.x).toFixed(1)},${ty(p.y).toFixed(1)}`).join(' ')
    parts.push(`<polyline points="${pts}" fill="none" stroke="#4a90d9" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>`)
    // 简单箭头 (末端短线段)
    const last = e.points.length > 0 ? e.points[e.points.length - 1] : e.start
    const ang = Math.atan2(e.end.y - last.y, e.end.x - last.x)
    const L = 8, a = 0.5
    const ax = tx(e.end.x), ay = ty(e.end.y)
    parts.push(`<polyline points="${(ax - L * Math.cos(ang - a)).toFixed(1)},${(ay - L * Math.sin(ang - a)).toFixed(1)} ${ax.toFixed(1)},${ay.toFixed(1)} ${(ax - L * Math.cos(ang + a)).toFixed(1)},${(ay - L * Math.sin(ang + a)).toFixed(1)}" fill="none" stroke="#4a90d9" stroke-width="1.5" stroke-linecap="round"/>`)
  }
  // 节点
  for (const n of data.nodes) {
    const x = tx(n.x), y = ty(n.y)
    const fill = n.isCompound ? '#fef3c7' : '#e8f4fd'
    const stroke = n.isCompound ? '#d97706' : '#4a90d9'
    parts.push(`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${n.width.toFixed(1)}" height="${n.height.toFixed(1)}" fill="${fill}" stroke="${stroke}" stroke-width="1"/>`)
    const label = String(n.id)
    parts.push(`<text x="${(x + n.width / 2).toFixed(1)}" y="${(y + n.height / 2 + 3).toFixed(1)}" text-anchor="middle" font-size="9" fill="#333">${label}</text>`)
  }
  parts.push('</svg>')
  return parts.join('\n')
}

// ── 主流程 ──

const opts = parseArgs(process.argv.slice(2))
const meta = pickMeta(opts)
const graph = layoutGraph(meta)
const data = extract(graph)
const svg = toSvg(data, opts.pad)

mkdirSync(opts.out, { recursive: true })
const safeName = meta.name.replace(/[^A-Za-z0-9_-]/g, '_')
const svgPath = join(opts.out, `${safeName}.svg`)
const pngPath = join(opts.out, `${safeName}.png`)
writeFileSync(svgPath, svg, 'utf8')

const browser = await chromium.launch()
try {
  const page = await browser.newPage()
  const html = `<!doctype html><html><body style="margin:0">${svg}</body></html>`
  await page.setContent(html)
  const box = await page.locator('svg').boundingBox()
  await page.setViewportSize({ width: Math.ceil(box.width), height: Math.ceil(box.height) })
  await page.screenshot({ path: pngPath })
} finally {
  await browser.close()
}
console.log(`已生成: ${pngPath} (${data.nodes.length} 节点 / ${data.edges.length} 边)`)
console.log(`SVG: ${svgPath}`)
