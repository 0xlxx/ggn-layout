/**
 * 边路由视觉对比 SVG: ggn (红) vs elk Java jar (蓝), 差异边高亮.
 * 用法: bun render-edge-cmp.mjs <demoJson> <jarOut> <out.svg>
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { LayeredLayoutProvider, getEdgeEndpoints } from '../../src/index.ts'
import { buildLGraphFromParsed } from '../../shared/elkgraph-builder.ts'

const [demoJson, jarOut, outSvg] = process.argv.slice(2)
const raw = JSON.parse(readFileSync(demoJson, 'utf8'))
const graphData = { ...raw, nodeProps: new Map(Object.entries(raw.nodeProps ?? {})), hierarchy: new Map(Object.entries(raw.hierarchy ?? {})) }
const { graph, nodeOf } = buildLGraphFromParsed(graphData, demoJson)
const p = new LayeredLayoutProvider()
p.layout(graph)

const nodeIdx = new Map()
for (const [i, n] of nodeOf) nodeIdx.set(n, i)
const portName = (port) => {
  const nm = raw.nodes[nodeIdx.get(port.getNode())]
  const pp = raw.nodeProps[nm]?.ports ?? []
  const px = port.getPosition().x, py = port.getPosition().y
  for (const cp of pp) if (Math.abs((cp.x ?? 0) - px) < 0.01 && Math.abs((cp.y ?? 0) - py) < 0.01) return cp.id
  return `pos(${px},${py})`
}

// ggn 边路由
const ggnEdges = new Map()
const seen = new Set()
const stack = [graph]
while (stack.length) {
  const g = stack.pop()
  for (const n of g.getAllNodes()) {
    if (n.getNestedGraph()) stack.push(n.getNestedGraph())
    for (const port of n.getPorts()) for (const e of port.getOutgoingEdges()) {
      if (seen.has(e)) continue
      seen.add(e)
      const src = e.getSource(), tgt = e.getTarget()
      if (!src || !tgt) continue
      const key = `${raw.nodes[nodeIdx.get(src.getNode())]}|${portName(src)}|${raw.nodes[nodeIdx.get(tgt.getNode())]}|${portName(tgt)}`
      const { source, target } = getEdgeEndpoints(e)
      ggnEdges.set(key, [source, ...e.getBendPoints(), target])
    }
  }
}
// jar 边路由 + 节点位置
const jarEdges = new Map(), jarNodes = new Map()
let curKey = null
for (const line of readFileSync(jarOut, 'utf8').split('\n')) {
  const nm = line.match(/^node (NN[\w.]*) x=([\d.-]+) y=([\d.-]+) w=([\d.-]+) h=([\d.-]+)/)
  if (nm) { jarNodes.set(nm[1], { x: +nm[2], y: +nm[3], w: +nm[4], h: +nm[5] }); continue }
  const em = line.match(/edge e\d+ src=\[ElkPort "([\w.]+)" .*\] tgt=\[ElkPort "([\w.]+)"/)
  if (em) {
    const sp = em[1].split('.'), tp = em[2].split('.')
    curKey = `${sp[0].replace(/^N/, '')}|${sp.slice(1).join('.')}|${tp[0].replace(/^N/, '')}|${tp.slice(1).join('.')}`
    jarEdges.set(curKey, [])
    continue
  }
  if (!curKey) continue
  const sm = line.match(/section start=\(([\d.-]+),([\d.-]+)\)(.*) end=\(([\d.-]+),([\d.-]+)\)/)
  if (sm) {
    const pts = [[+sm[1], +sm[2]]]
    for (const b of sm[3].matchAll(/bend=\(([\d.-]+),([\d.-]+)\)/g)) pts.push([+b[1], +b[2]])
    pts.push([+sm[4], +sm[5]])
    jarEdges.set(curKey, pts)
  }
}

// 差异检测
const diffKeys = new Set()
for (const [key, jp] of jarEdges) {
  const gp = ggnEdges.get(key)
  if (!gp) continue
  if (gp.length !== jp.length) { diffKeys.add(key); continue }
  for (let i = 0; i < gp.length; i++) {
    if (Math.max(Math.abs(gp[i].x - jp[i][0]), Math.abs(gp[i].y - jp[i][1])) > 1) { diffKeys.add(key); break }
  }
}

// SVG 尺寸
let maxX = 0, maxY = 0
for (const n of nodeOf.values()) { maxX = Math.max(maxX, n.position.x + n.size.x); maxY = Math.max(maxY, n.position.y + n.size.y) }
for (const n of jarNodes.values()) { maxX = Math.max(maxX, n.x + n.w); maxY = Math.max(maxY, n.y + n.h) }
const PAD = 40
const path = (pts) => pts.map((pt, i) => `${i === 0 ? 'M' : 'L'}${pt.x ?? pt[0]},${pt.y ?? pt[1]}`).join(' ')

let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${maxX + PAD * 2}" height="${maxY + PAD * 2}" viewBox="${-PAD} ${-PAD} ${maxX + PAD * 2} ${maxY + PAD * 2}">
<rect x="${-PAD}" y="${-PAD}" width="${maxX + PAD * 2}" height="${maxY + PAD * 2}" fill="#f8f8f8"/>
<g transform="translate(${PAD},${PAD})">`
// jar 节点 (灰框)
for (const [id, n] of jarNodes) svg += `<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" fill="#e0e0e0" stroke="#999"/><text x="${n.x + 2}" y="${n.y + 10}" font-size="8">${id.replace(/^NN/, 'N')}</text>`
// jar 边 (蓝)
for (const [key, pts] of jarEdges) svg += `<path d="${path(pts)}" fill="none" stroke="${diffKeys.has(key) ? '#3388ff' : '#8888ff'}" stroke-width="1.5"/>`
// ggn 边 (红)
for (const [key, pts] of ggnEdges) svg += `<path d="${path(pts)}" fill="none" stroke="${diffKeys.has(key) ? '#ff3333' : '#ffaaaa'}" stroke-width="1" stroke-dasharray="${diffKeys.has(key) ? '3,2' : 'none'}"/>`
svg += `</g></svg>`
writeFileSync(outSvg, svg)
console.log(`SVG: ${outSvg} (jar 边 ${jarEdges.size}, ggn 边 ${ggnEdges.size}, 差异边 ${diffKeys.size})`)
