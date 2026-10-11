import { readFileSync } from 'node:fs'
import { parseElkt } from '../../scripts/elkt2test.mjs'
import ELK from 'elkjs/lib/elk.bundled.js'

const model = process.argv[2] ?? '403_stackedSelfLoopLabels'
const source = readFileSync(`test-resources/elk-models/tickets/layered/${model}.elkt`, 'utf8')
const graphData = parseElkt(source)
const { nodes, edges, hierarchy, nodeProps } = graphData

const rootIds = nodes.filter(id => ![...hierarchy.values()].flat().includes(id))
const buildElk = (idx) => {
  const p = nodeProps.get(idx) ?? {}
  const node = { id: 'N' + idx, width: p.width ?? 60, height: p.height ?? 30 }
  if (p.portConstraints) node.layoutOptions = { 'elk.portConstraints': p.portConstraints }
  const ports = p.ports ?? []
  if (ports.length > 0) {
    node.ports = ports.map(pp => ({ id: `N${idx}.${pp.id}`, width: pp.w ?? 8, height: pp.h ?? 8, x: pp.x ?? 0, y: pp.y ?? 0, properties: { 'port.side': pp.side ?? 'UNDEFINED', 'port.index': String(pp.index ?? 0), 'port.x': String(pp.x ?? 0), 'port.y': String(pp.y ?? 0) } }))
  }
  const kids = hierarchy.get(idx) ?? []
  if (kids.length > 0) node.children = kids.map(k => buildElk(k))
  return node
}
const elk = new ELK()
const elkRes = await elk.layout({
  id: 'root',
  layoutOptions: { 'elk.algorithm': 'layered', 'elk.direction': 'RIGHT', 'elk.randomSeed': '1', ...(hierarchy.size > 0 ? { 'elk.hierarchyHandling': 'INCLUDE_CHILDREN' } : {}) },
  children: rootIds.map(i => buildElk(i)),
  edges: edges.map(([s, sp, t, tp], i) => ({ id: 'e' + i, sources: [sp === null ? 'N' + s : `N${s}.${sp}`], targets: [tp === null ? 'N' + t : `N${t}.${tp}`] })),
})
console.log('===== ELKJS =====')
const walk = (list, px, py) => {
  for (const c of list) {
    const wx = px + c.x, wy = py + c.y
    console.log(`${c.id}: pos=(${wx.toFixed(2)}, ${wy.toFixed(2)}) size=(${c.width}, ${c.height})`)
    if (c.ports) for (const p of c.ports) console.log(`  port ${p.id}@(${p.x.toFixed(2)},${p.y.toFixed(2)})`)
    if (c.edges) for (const e of c.edges) console.log(`  edge ${e.id} bps=[${(e.sections?.[0]?.bendPoints ?? []).map(b => `(${b.x},${b.y})`).join(' ')}]`)
    if (c.children) walk(c.children, wx, wy)
  }
}
walk(elkRes.children ?? [], 0, 0)
