#!/usr/bin/env bun
/**
 * vis — layout 快速视觉验证 CLI (cac).
 *
 * 纯本地生成 SVG (不依赖浏览器/playwright); PNG 用 macOS sips 转换.
 *
 * 用法:
 *   bun scripts/vis.mjs render <elkt> [--direction RIGHT|LEFT|DOWN|UP] [--out dir]
 *       跑 ggn 布局 → 节点+边 SVG (边含弯点, 可直观发现斜线/绕行/重叠)
 *   bun scripts/vis.mjs compare <elkt> [--direction ...] [--out dir]
 *       ggn vs ELK jar 两张 SVG (并排叠加标注)
 *   bun scripts/vis.mjs models <glob>   # 列出匹配模型
 */
import { cac } from 'cac'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { globSync } from 'glob'
import { parseElktCached } from './elkt-build.mjs'
import { buildLGraphFromParsed } from '../shared/elkgraph-builder.ts'
import { parseElkt } from './elkt2test.mjs'
import { LayeredLayoutProvider } from '../src/index.ts'
import { DIRECTION } from '../src/options/layered-options.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_OUT = join(ROOT, 'bench-results/vis')

// ── 布局 + 坐标提取 (复用 render-elk.mjs 语义) ──

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

function extract(graph) {
  const root = graph
  const nodes = collectNodes(graph).filter((n) => n.size.x > 0 && n.size.y > 0)
  const nodeRects = nodes.map((n) => {
    const w = worldOf(n, root)
    return { id: n.id, x: w.x, y: w.y, width: n.size.x, height: n.size.y, isCompound: n.getNestedGraph() !== null }
  })
  const seen = new Set()
  const edges = []
  for (const n of nodes) {
    for (const p of n.getPorts()) {
      for (const e of p.getOutgoingEdges()) {
        const src = e.getSource(), tgt = e.getTarget()
        if (!src || !tgt) continue
        if (seen.has(e.id)) continue
        seen.add(e.id)
        const srcNode = src.getNode(), tgtNode = tgt.getNode()
        const srcW = worldOf(srcNode, root), tgtW = worldOf(tgtNode, root)
        // 端点用端口锚点 (position + anchor) — 只用 position 是端口左上角, 对 WEST/EAST 端口 y 偏半个端口高 → 假斜线.
        const start = { x: srcW.x + src.getPosition().x + src.getAnchor().x, y: srcW.y + src.getPosition().y + src.getAnchor().y }
        const end = { x: tgtW.x + tgt.getPosition().x + tgt.getAnchor().x, y: tgtW.y + tgt.getPosition().y + tgt.getAnchor().y }
        // 弯点坐标 = owner 节点局部坐标 (ELK 边 sections 相对 LCA 节点):
        // 跨层级边 (如 outer.pN→inner1) 的弯点在嵌套图坐标系, 偏移 = LCA 节点世界位置.
        // 只按 srcNode 所在图取偏移会把嵌套弯点当根坐标 → 假斜线 (tmp-ns-port e0 实证).
        const ancestors = (n) => { const out = []; let c = n; while (c !== null) { out.push(c); c = c.getGraph()?.getParentNode() ?? null } return out }
        const aSet = new Set(ancestors(srcNode))
        let owner = null
        let cur = tgtNode
        while (cur !== null) { if (aSet.has(cur)) { owner = cur; break } cur = cur.getGraph()?.getParentNode() ?? null }
        const ow = owner !== null && owner !== root ? worldOf(owner, root) : { x: 0, y: 0 }
        // 自环边 (src.node === tgt.node): SelfLoopPostProcessor 已把弯点偏移到图局部 (加节点位置),
        // 再加 LCA 偏移会重复 → 端口到弯点成斜线 (inside_outside 外环实证: 弯点 y 多 padding.top).
        const isSelfLoop = srcNode === tgtNode
        const points = e.getBendPoints().map((bp) => ({ x: bp.x + (isSelfLoop ? 0 : ow.x), y: bp.y + (isSelfLoop ? 0 : ow.y) }))
        edges.push({ id: e.id, start, end, points })
      }
    }
  }
  return { nodes: nodeRects, edges }
}

function toSvg(data, pad = 48, edgeColor = '#4a90d9') {
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
  // 节点矩形先画(垫底), 边+箭头后画(在上层): 避免不透明节点填充盖住边/箭头 (jar root 矩形曾盖住整个外环)
  for (const n of data.nodes) {
    const x = tx(n.x), y = ty(n.y)
    const fill = n.isCompound ? '#fef3c7' : '#e8f4fd'
    const stroke = n.isCompound ? '#d97706' : '#4a90d9'
    parts.push(`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${n.width.toFixed(1)}" height="${n.height.toFixed(1)}" fill="${fill}" stroke="${stroke}" stroke-width="1"/>`)
  }
  for (const e of data.edges) {
    const pts = [e.start, ...e.points, e.end].map((p) => `${tx(p.x).toFixed(1)},${ty(p.y).toFixed(1)}`).join(' ')
    parts.push(`<polyline points="${pts}" fill="none" stroke="${edgeColor}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>`)
    const last = e.points.length > 0 ? e.points[e.points.length - 1] : e.start
    const ang = Math.atan2(e.end.y - last.y, e.end.x - last.x)
    const L = 8, a = 0.5
    const ax = tx(e.end.x), ay = ty(e.end.y)
    parts.push(`<polyline points="${(ax - L * Math.cos(ang - a)).toFixed(1)},${(ay - L * Math.sin(ang - a)).toFixed(1)} ${ax.toFixed(1)},${ay.toFixed(1)} ${(ax - L * Math.cos(ang + a)).toFixed(1)},${(ay - L * Math.sin(ang + a)).toFixed(1)}" fill="none" stroke="${edgeColor}" stroke-width="1.5" stroke-linecap="round"/>`)
  }
  for (const n of data.nodes) {
    const x = tx(n.x), y = ty(n.y)
    parts.push(`<text x="${(x + n.width / 2).toFixed(1)}" y="${(y + n.height / 2 + 3).toFixed(1)}" text-anchor="middle" font-size="9" fill="#333">${n.id}</text>`)
  }
  parts.push('</svg>')
  return parts.join('\n')
}

// ── 布局执行 ──

function layoutModel(elktPath, direction) {
  const source = readFileSync(elktPath, 'utf8')
  const parsed = parseElkt(source)
  if (direction) parsed.graphProps.direction = direction
  const { graph } = buildLGraphFromParsed(parsed, basename(elktPath, '.elkt'))
  new LayeredLayoutProvider().layout(graph)
  return extract(graph)
}

function writeOutputs(svg, outDir, name, label) {
  mkdirSync(outDir, { recursive: true })
  const svgPath = join(outDir, `${name}.svg`)
  writeFileSync(svgPath, svg, 'utf8')
  let pngPath = svgPath.replace(/\.svg$/, '.png')
  try {
    execSync(`sips -s format png "${svgPath}" --out "${pngPath}" >/dev/null 2>&1`)
  } catch {
    pngPath = null
  }
  console.log(`[vis] ${label}: ${svgPath}${pngPath ? ` + ${pngPath}` : ''}`)
}

// ── CLI ──

const cli = cac('vis')
cli.option('--direction <dir>', '布局方向 RIGHT|LEFT|DOWN|UP', { default: 'RIGHT' })
cli.option('--out <dir>', `输出目录 (默认 ${DEFAULT_OUT})`)

cli.command('render <elkt>', '跑 ggn 布局 → SVG/PNG')
  .action((elkt, opts) => {
    const dir = opts.out ?? DEFAULT_OUT
    const data = layoutModel(elkt, opts.direction)
    writeOutputs(toSvg(data), dir, `${basename(elkt, '.elkt')}_${opts.direction}`, `ggn ${opts.direction}`)
  })

function runJar(elkt, direction) {
  const exp = join(ROOT, 'scripts', 'vis-export-tmp.mjs')
  writeFileSync(exp, `import { readFileSync, writeFileSync } from 'node:fs'; import { parseElkt, elktToElkJson } from './elkt2test.mjs'; const s = readFileSync(${JSON.stringify(elkt)}, 'utf8'); const g = parseElkt(s); g.graphProps.direction = ${JSON.stringify(direction)}; writeFileSync('/tmp/vis-elk.json', JSON.stringify(elktToElkJson(g)));`)
  execSync(`bun "${exp}"`, { shell: '/bin/zsh' })
  const java = '/opt/homebrew/opt/openjdk@21/bin/java'
  // 仓库内 EdgeMain (out-edge, 与 EdgeOracleMain 同源构建): 输出节点(缩进层级) + 边弯点.
  const out = execSync(`cd "${join(ROOT, 'scripts/elk-java-debug')}" && ${java} -cp "out-edge:lib/*" EdgeMain /tmp/vis-elk.json`, { encoding: 'utf8' })
  // 解析 jar 节点/边; 节点坐标相对父, 用 indent 深度累加父坐标得世界坐标
  const nodes = [], edges = []
  const stack = []  // 每层父节点世界坐标
  for (const line of out.split('\n')) {
    const indent = (line.match(/^\s*/) ?? [''])[0].length
    const nm = line.match(/^\s*NODE (\S+) x=([\d.-]+) y=([\d.-]+) w=([\d.-]+) h=([\d.-]+)$/)
    if (nm) {
      const depth = Math.max(0, Math.floor(indent / 2))
      // EdgeMain 首行输出根图 (depth 0, id=root): 非真实节点, 画成不透明矩形会盖住所有边/箭头
      if (depth === 0) continue
      while (stack.length > depth) stack.pop()
      const parent = stack.length > 0 ? stack[stack.length - 1] : { x: 0, y: 0 }
      // 正则分组: nm[1]=id, nm[2]=x, nm[3]=y, nm[4]=w, nm[5]=h (之前下标偏一位 → 框错位/NaN)
      const w = { x: parent.x + Number(nm[2]), y: parent.y + Number(nm[3]) }
      nodes.push({ id: nm[1], x: w.x, y: w.y, width: Number(nm[4]), height: Number(nm[5]), isCompound: false })
      stack.push(w)
    }
    const em = line.match(/^\s*EDGE (\S+) start=\(([\d.-]+),([\d.-]+)\) (.*)end=\(([\d.-]+),([\d.-]+)\)$/)
    if (em) {
      // 分组: 1=src->tgt 2=startX 3=startY 4=中间(含 bp=...) 5=endX 6=endY
      const bps = [...em[4].matchAll(/bp=\(([\d.-]+),([\d.-]+)\)/g)].map(m => ({ x: Number(m[1]), y: Number(m[2]) }))
      edges.push({ id: em[1], start: { x: Number(em[2]), y: Number(em[3]) }, end: { x: Number(em[5]), y: Number(em[6]) }, points: bps })
    }
  }
  return { nodes, edges }
}

/** 叠加两张图 (不同颜色) 到同一坐标系, 返回 SVG + 文本差异报告. */
function overlaySvg(ggn, jar, pad = 48) {
  const PAD = pad
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const d of [ggn, jar]) for (const n of d.nodes) {
    minX = Math.min(minX, n.x); minY = Math.min(minY, n.y)
    maxX = Math.max(maxX, n.x + n.width); maxY = Math.max(maxY, n.y + n.height)
  }
  for (const d of [ggn, jar]) for (const e of d.edges) for (const pt of [e.start, e.end, ...e.points]) {
    minX = Math.min(minX, pt.x); minY = Math.min(minY, pt.y)
    maxX = Math.max(maxX, pt.x); maxY = Math.max(maxY, pt.y)
  }
  const W = maxX - minX + PAD * 2, H = maxY - minY + PAD * 2
  const tx = (x) => x - minX + PAD, ty = (y) => y - minY + PAD
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="system-ui, sans-serif">`]
  parts.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff"/>`)
  const drawEdges = (d, color, dash) => {
    for (const e of d.edges) {
      const pts = [e.start, ...e.points, e.end].map((p) => `${tx(p.x).toFixed(1)},${ty(p.y).toFixed(1)}`).join(' ')
      parts.push(`<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.2" stroke-dasharray="${dash}" stroke-linejoin="round" stroke-linecap="round"/>`)
    }
  }
  drawEdges(ggn, '#e14b4b', '')
  drawEdges(jar, '#2f9e44', '4 3')
  const drawNodes = (d, fill, stroke) => {
    for (const n of d.nodes) {
      const x = tx(n.x), y = ty(n.y)
      parts.push(`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${n.width.toFixed(1)}" height="${n.height.toFixed(1)}" fill="${fill}" stroke="${stroke}" stroke-width="0.8" fill-opacity="0.35"/>`)
      parts.push(`<text x="${(x + n.width / 2).toFixed(1)}" y="${(y - 2).toFixed(1)}" text-anchor="middle" font-size="8" fill="${stroke}">${n.id}</text>`)
    }
  }
  drawNodes(jar, '#2f9e44', '#2f9e44')
  drawNodes(ggn, '#e14b4b', '#e14b4b')
  parts.push('</svg>')
  // 文本差异报告
  const report = []
  report.push(`ggn: ${ggn.nodes.length} 节点 / ${ggn.edges.length} 边; jar: ${jar.nodes.length} 节点 / ${jar.edges.length} 边`)
  const gBends = ggn.edges.reduce((a, e) => a + e.points.length, 0)
  const jBends = jar.edges.reduce((a, e) => a + e.points.length, 0)
  report.push(`边弯点总数: ggn=${gBends}, jar=${jBends} ${gBends !== jBends ? '⚠️ 不一致' : '✓'}`)
  // 节点位置差异 (按 id 近似匹配: jar id 含节点名, ggn 是数字 — 只报告数量)
  return { svg: parts.join('\n'), report: report.join('\n') }
}

cli.command('compare <elkt>', 'ggn vs ELK jar → 并排图 + 叠加对比图 + 差异报告')
  .action((elkt, opts) => {
    const dir = opts.out ?? DEFAULT_OUT
    const name = basename(elkt, '.elkt')
    const ggn = layoutModel(elkt, opts.direction)
    writeOutputs(toSvg(ggn, 48, '#e14b4b'), dir, `${name}_ggn_${opts.direction}`, `ggn ${opts.direction}`)
    try {
      const jar = runJar(elkt, opts.direction)
      writeOutputs(toSvg(jar, 48, '#2f9e44'), dir, `${name}_jar_${opts.direction}`, `jar ${opts.direction}`)
      const { svg, report } = overlaySvg(ggn, jar)
      writeOutputs(svg, dir, `${name}_overlay_${opts.direction}`, `overlay(红=ggn 绿=jar)`)
      console.log(`\n[vis diff] ${name} ${opts.direction}:\n${report}`)
    } catch (e) {
      console.error(`[vis] jar 对比失败 (可先只跑 render): ${String(e.message ?? e).slice(0, 200)}`)
    }
  })

cli.command('models <glob>', '列出匹配的 elkt 模型').action((glob) => {
  for (const f of globSync(join(ROOT, 'test-resources/elk-models', glob))) console.log(f)
})

cli.help()
cli.parse()
