/**
 * 边路由对比: ggn (layout) vs elk Java 0.12.0 jar.
 * 用法: bun cmp-edge.mjs <demoJson> <jarOutput>
 * 端口名匹配: 用 nodeProps.ports 的位置 (x/y) 匹配 ggn 端口.
 */
import { readFileSync } from 'node:fs'
import { LayeredLayoutProvider, getEdgeEndpoints } from '../../src/index.ts'
import { buildLGraphFromParsed } from '../../shared/elkgraph-builder.ts'

const [demoJson, jarOut] = process.argv.slice(2)
const raw = JSON.parse(readFileSync(demoJson, 'utf8'))
const graphData = { ...raw, nodeProps: new Map(Object.entries(raw.nodeProps ?? {})), hierarchy: new Map(Object.entries(raw.hierarchy ?? {})) }
const { graph, nodeOf } = buildLGraphFromParsed(graphData, demoJson)
const p = new LayeredLayoutProvider()
p.layout(graph)

const nodeIdx = new Map()
for (const [i, n] of nodeOf) nodeIdx.set(n, i)
// 端口名: 用 nodeProps.ports 位置 (x/y) 匹配 ggn 端口
const portName = (port) => {
  const ni = nodeIdx.get(port.getNode())
  const nm = raw.nodes[ni]
  const pp = raw.nodeProps[nm]?.ports ?? []
  const px = port.getPosition().x, py = port.getPosition().y
  for (const cp of pp) {
    if (Math.abs((cp.x ?? 0) - px) < 0.01 && Math.abs((cp.y ?? 0) - py) < 0.01) return cp.id
  }
  return `pos(${px},${py})`
}

const ggnEdges = new Map()
const seen = new Set()
const stack = [graph]
while (stack.length) {
  const g = stack.pop()
  for (const n of g.getAllNodes()) {
    if (n.getNestedGraph()) stack.push(n.getNestedGraph())
    for (const port of n.getPorts()) {
      for (const e of port.getOutgoingEdges()) {
        if (seen.has(e)) continue
        seen.add(e)
        const src = e.getSource(), tgt = e.getTarget()
        if (!src || !tgt) continue
        const key = `${raw.nodes[nodeIdx.get(src.getNode())]}|${portName(src)}|${raw.nodes[nodeIdx.get(tgt.getNode())]}|${portName(tgt)}`
        const { source, target } = getEdgeEndpoints(e)
        ggnEdges.set(key, [source, ...e.getBendPoints(), target].map(pt => [Math.round(pt.x * 10) / 10, Math.round(pt.y * 10) / 10]))
      }
    }
  }
}

const jarEdges = new Map()
let curKey = null
for (const line of readFileSync(jarOut, 'utf8').split('\n')) {
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
    jarEdges.set(curKey, pts.map(pt => [Math.round(pt[0] * 10) / 10, Math.round(pt[1] * 10) / 10]))
  }
}

let matched = 0, diffEdges = 0, countDiff = 0, totalDiff = 0, maxDiff = 0
const diffs = []
for (const [key, jarPts] of jarEdges) {
  const ggnPts = ggnEdges.get(key)
  if (!ggnPts) { console.log(`[missing ggn] ${key}`); continue }
  matched++
  if (ggnPts.length !== jarPts.length) { countDiff++; diffEdges++; diffs.push({ key, ggn: ggnPts, jar: jarPts, max: Infinity }); continue }
  let edgeMax = 0
  for (let i = 0; i < ggnPts.length; i++) {
    const d = Math.max(Math.abs(ggnPts[i][0] - jarPts[i][0]), Math.abs(ggnPts[i][1] - jarPts[i][1]))
    edgeMax = Math.max(edgeMax, d); totalDiff += d
  }
  maxDiff = Math.max(maxDiff, edgeMax)
  if (edgeMax > 1) { diffEdges++; diffs.push({ key, ggn: ggnPts, jar: jarPts, max: edgeMax }) }
}
console.log(`=== 摘要: jar ${jarEdges.size} 边, ggn 匹配 ${matched}, 差异 ${diffEdges} (点数差 ${countDiff}), avg=${(totalDiff / Math.max(1, matched)).toFixed(2)}, max=${maxDiff.toFixed(1)}`)
for (const d of diffs.slice(0, 14)) {
  console.log(`\n[${d.max === Infinity ? 'count' : 'diff'}] ${d.key} max=${d.max === Infinity ? '∞' : d.max.toFixed(1)}`)
  console.log(`   ggn=${JSON.stringify(d.ggn)}`)
  console.log(`   jar=${JSON.stringify(d.jar)}`)
}
