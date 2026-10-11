import { readFileSync } from 'node:fs'
import { parseElkt } from '../../scripts/elkt2test.mjs'
import { LGraph, LNode, LPort, LEdge, LayeredLayoutProvider } from '../../dist/index.mjs'

const model = process.argv[2] ?? '403_stackedSelfLoopLabels'
const source = readFileSync(`test-resources/elk-models/tickets/layered/${model}.elkt`, 'utf8')
const graphData = parseElkt(source)
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
  if (p.portConstraints) n.setProperty('org.eclipse.elk.layered.portConstraints', p.portConstraints)
  for (const port of p.ports ?? []) {
    const lport = new LPort()
    lport.setNode(n)
    lport.getPosition().x = port.x ?? 0
    lport.getPosition().y = port.y ?? 0
    lport.size = { x: port.w ?? 8, y: port.h ?? 8 }
    if (port.side) lport.setSide(port.side)
  }
  nodeOf.set(id, n)
}
for (const p of hierarchy.keys()) {
  nodeOf.get(p).setNestedGraph(nestedGraphs.get(p))
  nestedGraphs.get(p).setParentNode(nodeOf.get(p))
}
for (const [s, sp, t, tp] of edges) {
  const spIdx = sp === null ? null : nodeProps.get(s).ports.findIndex(p => p.id === sp)
  const tpIdx = tp === null ? null : nodeProps.get(t).ports.findIndex(p => p.id === tp)
  const spP = spIdx !== null && spIdx < nodeOf.get(s).getPorts().length ? nodeOf.get(s).getPorts()[spIdx] : (() => { const p = new LPort(); p.setNode(nodeOf.get(s)); return p })()
  const tpP = tpIdx !== null && tpIdx < nodeOf.get(t).getPorts().length ? nodeOf.get(t).getPorts()[tpIdx] : (() => { const p = new LPort(); p.setNode(nodeOf.get(t)); return p })()
  const e = new LEdge(); e.setSource(spP); e.setTarget(tpP)
}
if (hierarchy.size > 0) g.setProperty('elk.hierarchyHandling', 'INCLUDE_CHILDREN')
g.setProperty('org.eclipse.elk.layered.direction', 'RIGHT')
g.setProperty('org.eclipse.elk.layered.randomSeed', 1)

const provider = new LayeredLayoutProvider()
provider.hooks = {
  afterPhase: (phase, graph) => {
    if (phase === 'SelfLoopRouter' || phase === 'BK') {
      console.log(`--- after ${phase} ---`)
      for (const n of graph.getAllNodes()) {
        const m = n.getMargin()
        console.log(`  ${n.id}: pos=(${n.position.x.toFixed(1)},${n.position.y.toFixed(1)}) size=(${n.size.x},${n.size.y}) margin=(l:${m.left.toFixed(1)},t:${m.top.toFixed(1)},r:${m.right.toFixed(1)},b:${m.bottom.toFixed(1)})`)
      }
    }
  }
}
provider.layout(g)
console.log('--- final ---')
for (const [id, n] of nodeOf) {
  const m = n.getMargin()
  console.log(`N${id}: pos=(${n.position.x.toFixed(1)},${n.position.y.toFixed(1)}) size=(${n.size.x},${n.size.y}) margin=(l:${m.left.toFixed(1)},t:${m.top.toFixed(1)},r:${m.right.toFixed(1)},b:${m.bottom.toFixed(1)})`)
}
