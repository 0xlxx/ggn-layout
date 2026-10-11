import { it } from 'vitest'
import { writeFileSync } from 'node:fs'
import ELK from 'elkjs/lib/elk.bundled.js'
import { readFileSync } from 'node:fs'
import { parseElkt } from '../../scripts/elkt2test.mjs'

it('elkjs hierarchicalEdges 父子坐标', async () => {
  const source = readFileSync('test-resources/elk-models/examples/hierarchy/hierarchicalEdges.elkt', 'utf8')
  const { nodes, edges, hierarchy, nodeProps } = parseElkt(source)
  function buildElk(idx) {
    const id = nodes[idx]
    const p = nodeProps.get(id) ?? {}
    const node = { id, width: p.width ?? 60, height: p.height ?? 30 }
    const kids = (hierarchy.get(id) ?? [])
    if (kids.length > 0) node.children = kids.map(k => buildElk(nodes.indexOf(k)))
    return node
  }
  const roots = nodes.filter((_, i) => ![...hierarchy.values()].flat().includes(nodes[i]))
    .map(n => buildElk(nodes.indexOf(n)))
  const elkEdges = edges.map(([s, sp, t, tp], i) => ({ id: 'e' + i, sources: [sp ? s + '.' + sp : s], targets: [tp ? t + '.' + tp : t] }))
  const elk = new ELK()
  const res = await elk.layout({ id: 'root', layoutOptions: { 'elk.algorithm': 'layered', 'elk.direction': 'RIGHT' }, children: roots, edges: elkEdges })
  const lines = []
  function walk(list, parent) {
    for (const c of list) {
      lines.push(`ELKJS node ${c.id} pos=(${c.x},${c.y}) size=(${c.width}x${c.height}) parent=${parent ?? 'ROOT'}`)
      if (c.children) walk(c.children, c.id)
    }
  }
  walk(res.children ?? [], null)
  writeFileSync('bench-results/elkjs-probe.txt', lines.join('\n'), 'utf8')
})
