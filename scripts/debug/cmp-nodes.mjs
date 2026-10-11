/** 节点位置对比: ggn vs jar. 用法: bun cmp-nodes.mjs <demoJson> <jarOut> */
import { readFileSync } from 'node:fs'
import { LayeredLayoutProvider } from '../../src/index.ts'
import { buildLGraphFromParsed } from '../../shared/elkgraph-builder.ts'
const [demoJson, jarOut] = process.argv.slice(2)
const raw = JSON.parse(readFileSync(demoJson, 'utf8'))
const graphData = { ...raw, nodeProps: new Map(Object.entries(raw.nodeProps ?? {})), hierarchy: new Map(Object.entries(raw.hierarchy ?? {})) }
const { graph, nodeOf } = buildLGraphFromParsed(graphData, demoJson)
const p = new LayeredLayoutProvider()
p.layout(graph)
// jar 节点
const jarNodes = new Map()
for (const line of readFileSync(jarOut, 'utf8').split('\n')) {
  const m = line.match(/^node (NN[\w.]*) x=([\d.-]+) y=([\d.-]+)/)
  if (m) jarNodes.set(m[1].replace(/^NN/, 'N'), { x: +m[2], y: +m[3] })
}
let diff = 0, maxD = 0, maxNode = ''
const diffs = []
for (const [i, n] of nodeOf) {
  const nm = raw.nodes[i]
  const j = jarNodes.get(nm)
  if (!j) { console.log(`[missing jar] ${nm}`); continue }
  const d = Math.max(Math.abs(n.position.x - j.x), Math.abs(n.position.y - j.y))
  if (d > maxD) { maxD = d; maxNode = nm }
  if (d > 2) { diff++; diffs.push({ nm, g: [Math.round(n.position.x), Math.round(n.position.y)], j: [Math.round(j.x), Math.round(j.y)], d: Math.round(d) }) }
}
console.log(`=== 摘要: 节点 ${nodeOf.size}, jar ${jarNodes.size}, 差>2 共 ${diff}, max=${maxD.toFixed(1)} (${maxNode})`)
for (const d of diffs.slice(0, 25)) console.log(`  ${d.nm}: ggn=(${d.g}), jar=(${d.j}), d=${d.d}`)
