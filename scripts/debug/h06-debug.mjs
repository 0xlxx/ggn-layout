import { it } from 'vitest'
import { LGraph, LNode, LPort, LEdge } from '../../src/index.ts'
import { LayeredLayoutProvider } from '../../src/layered-layout-provider.ts'

import { PORT_CONSTRAINTS as PORT_CONSTRAINTS_KEY, HIERARCHY_HANDLING as HIERARCHY_HANDLING_KEY, DIRECTION as DIRECTION_KEY } from '../../src/options/layered-options.ts'
import ELK from 'elkjs/lib/elk.bundled.js'

const HIERARCHY = {"2":[3,4,5,6]}
const DIMS = [[50,50],[50,50],[100,20],[50,50],[50,50],[50,50],[50,50]]
const NODE_PORTS = [[],[],[{"id":"CN1","x":10,"y":-5,"w":5,"h":5,"side":"NORTH","index":null},{"id":"CN2","x":50,"y":-5,"w":5,"h":5,"side":"NORTH","index":null},{"id":"CS1","x":10,"y":20,"w":5,"h":5,"side":"SOUTH","index":null},{"id":"CS2","x":50,"y":20,"w":5,"h":5,"side":"SOUTH","index":null}],[],[],[],[]]
const PORT_CONSTRAINTS = [null,null,"FIXED_SIDE",null,null,null,null]
const EDGE_IDX = [[2,1,"CN2",3,null,null],[2,0,"CN1",4,null,null],[2,3,"CS2",5,null,null],[2,2,"CS1",6,null,null],[3,null,null,4,null,null],[5,null,null,6,null,null],[0,null,null,2,0,"CN1"],[1,null,null,2,1,"CN2"]]

function createSimpleEdge(src, tgt, spIdx = null, tpIdx = null) {
  const sp = spIdx !== null && spIdx < src.getPorts().length ? src.getPorts()[spIdx] : (() => { const p = new LPort(); p.setNode(src); return p })()
  const tp = tpIdx !== null && tpIdx < tgt.getPorts().length ? tgt.getPorts()[tpIdx] : (() => { const p = new LPort(); p.setNode(tgt); return p })()
  const e = new LEdge(); e.setSource(sp); e.setTarget(tp)
  return e
}

function buildGgn() {
  const graph = new LGraph()
  const nodeOf = new Map()
  const nestedGraphs = new Map()
  for (const p of Object.keys(HIERARCHY).map(Number)) nestedGraphs.set(p, new LGraph())
  for (let i = 0; i < DIMS.length; i++) {
    const parentIdx = Object.entries(HIERARCHY).find(([, kids]) => kids.includes(i))?.[0]
    const g = parentIdx !== undefined ? nestedGraphs.get(Number(parentIdx)) : graph
    const n = new LNode(g)
    n.size = { x: DIMS[i][0], y: DIMS[i][1] }
    if (PORT_CONSTRAINTS[i]) n.setProperty(PORT_CONSTRAINTS_KEY, PORT_CONSTRAINTS[i])
    for (const pd of NODE_PORTS[i]) {
      const port = new LPort()
      port.setNode(n)
      port.getPosition().x = pd.x
      port.getPosition().y = pd.y
      port.size = { x: pd.w, y: pd.h }
      if (pd.side) port.setSide(pd.side)
    }
    nodeOf.set(i, n)
  }
  for (const p of Object.keys(HIERARCHY).map(Number)) {
    const parent = nodeOf.get(p)
    const nested = nestedGraphs.get(p)
    parent.setNestedGraph(nested)
    nested.setParentNode(parent)
  }
  for (const [s, sp, , t, tp] of EDGE_IDX) createSimpleEdge(nodeOf.get(s), nodeOf.get(t), sp, tp)
  graph.setProperty(HIERARCHY_HANDLING_KEY, 'INCLUDE_CHILDREN')
  graph.setProperty(DIRECTION_KEY, 'RIGHT')
  return { graph, nodeOf }
}

const { graph, nodeOf } = buildGgn()
new LayeredLayoutProvider().layout(graph)

console.log('=== ggn ===')
for (const [id, n] of nodeOf) {
  const ports = n.getPorts().map(p => `${p.id}@${Math.round(p.getPosition().x)},${Math.round(p.getPosition().y)}:${p.getSide()}`)
  console.log(`N${id} pos=${Math.round(n.position.x)},${Math.round(n.position.y)} size=${n.size.x},${n.size.y} ports=[${ports.join(' ')}]`)
}

// elkjs
const elk = new ELK()
const elkChildren = Array.from({ length: DIMS.length }, (_, i) => i)
  .filter(i => !Object.values(HIERARCHY).flat().includes(i))
  .map(i => {
    const kids = HIERARCHY[i]
    const node = {
      id: 'N' + i,
      width: DIMS[i][0], height: DIMS[i][1],
      layoutOptions: {},
      ports: NODE_PORTS[i].map(p => ({ id: 'N' + i + '.' + p.id, x: p.x, y: p.y, width: p.w, height: p.h, layoutOptions: p.side ? { 'elk.port.side': p.side } : {} })),
    }
    if (kids) node.children = kids.map(k => ({ id: 'N' + k, width: DIMS[k][0], height: DIMS[k][1] }))
    return node
  })
const elkRes = await elk.layout({
  id: 'root',
  layoutOptions: { 'elk.algorithm': 'layered', 'elk.direction': 'RIGHT', 'elk.randomSeed': '1', 'elk.hierarchyHandling': 'INCLUDE_CHILDREN' },
  children: elkChildren,
  edges: EDGE_IDX.map(([s, , sp, t, , tp], i) => ({ id: 'e' + i, sources: [sp ? 'N' + s + '.' + sp : 'N' + s], targets: [tp ? 'N' + t + '.' + tp : 'N' + t] })),
})
console.log('=== elkjs ===')
const walk = (list, px, py) => {
  for (const c of list) {
    const wx = px + c.x, wy = py + c.y
    console.log(`${c.id} pos=${Math.round(c.x)},${Math.round(c.y)} world=${Math.round(wx)},${Math.round(wy)} size=${c.width},${c.height}`)
    if (c.children) walk(c.children, wx, wy)
  }
}
walk(elkRes.children ?? [], 0, 0)
