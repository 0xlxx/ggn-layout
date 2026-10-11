import { readFileSync } from 'node:fs'
import { describe, it } from 'vitest'
import { parseElkt } from '../../scripts/elkt2test.mjs'
import { LGraph, LNode, LPort, LEdge } from '../../src/index.js'
import { LayeredLayoutProvider } from '../../src/layered-layout-provider.js'
import { PORT_CONSTRAINTS as PCC, PORT_INDEX as PIX, HIERARCHY_HANDLING as HIH, DIRECTION as DIR } from '../../src/options/layered-options.js'

function buildGraph(graphData) {
  const { nodes, edges, hierarchy, nodeProps } = graphData
  const g = new LGraph()
  const nodeOf = new Map()
  const nestedGraphs = new Map()
  for (const p of hierarchy.keys()) nestedGraphs.set(p, new LGraph())
  for (const id of nodes) {
    const parentIdx = [...hierarchy.entries()].find(([, kids]) => kids.includes(id))?.[0]
    const gg = parentIdx !== undefined ? nestedGraphs.get(parentIdx) : g
    const n = new LNode(gg)
    const p = nodeProps.get(id) ?? {}
    n.size = { x: p.width ?? 60, y: p.height ?? 30 }
    if (p.portConstraints) n.setProperty(PCC, p.portConstraints)
    for (const port of p.ports ?? []) {
      const lport = new LPort()
      lport.setNode(n)
      lport.getPosition().x = port.x ?? 0
      lport.getPosition().y = port.y ?? 0
      lport.size = { x: port.w ?? 8, y: port.h ?? 8 }
      if (port.side) lport.setSide(port.side)
      if (port.index !== null && port.index !== undefined) lport.setProperty(PIX, port.index)
    }
    nodeOf.set(id, n)
  }
  for (const p of hierarchy.keys()) {
    nodeOf.get(p).setNestedGraph(nestedGraphs.get(p))
    nestedGraphs.get(p).setParentNode(nodeOf.get(p))
  }
  for (const [s, sp, t, tp] of edges) {
    const src = nodeOf.get(s), tgt = nodeOf.get(t)
    const spIdx = sp === null ? null : (nodeProps.get(s)?.ports ?? []).findIndex(pp => pp.id === sp)
    const tpIdx = tp === null ? null : (nodeProps.get(t)?.ports ?? []).findIndex(pp => pp.id === tp)
    const mkS = () => { if (spIdx !== null && spIdx !== -1 && spIdx < src.getPorts().length) return src.getPorts()[spIdx]; const pp = new LPort(); pp.setNode(src); return pp }
    const mkT = () => { if (tpIdx !== null && tpIdx !== -1 && tpIdx < tgt.getPorts().length) return tgt.getPorts()[tpIdx]; const pp = new LPort(); pp.setNode(tgt); return pp }
    const e = new LEdge(); e.setSource(mkS()); e.setTarget(mkT())
  }
  if (hierarchy.size > 0) g.setProperty(HIH, 'INCLUDE_CHILDREN')
  g.setProperty(DIR, 'RIGHT')
  return { g, nodeOf, hierarchy, nodes }
}

describe('t623p', () => {
  it('p2 order', () => {
    const src = readFileSync('test-resources/elk-models/tickets/layered/623_layerConstraintProcessing.elkt', 'utf8')
    const gd = parseElkt(src)
    const { g, nodeOf, hierarchy, nodes } = buildGraph(gd)
    const prov = new LayeredLayoutProvider()
    prov.setHooks({
      beforeModule: (name: string) => {
        if (name.includes('LayerSweepCrossingMinimizer')) {
          const child = nodeOf.get('o')?.getNestedGraph()
          if (child) {
            const nm = new Map([...nodeOf.entries()].map(([k, v]) => [v, k]))
            for (const [li, layer] of child.getLayers().entries()) {
              console.log('child L' + li, layer.getNodes().map(n => nm.get(n) ?? n.id).join(','))
            }
          }
        }
      },
    })
    prov.layout(g)
    // 打印 elkjs 需要的顺序: last,first,i2,i1 (从 y 位置推断)
    console.log('elkjs L1 (y 序): last, first, i2, i1')
  })
})
