import ELK from 'elkjs/lib/elk.bundled.js'
import { LGraph, LNode, LPort, LEdge } from '../../src/index.js'
import { LayeredLayoutProvider } from '../../src/layered-layout-provider.js'
import { PORT_CONSTRAINTS as PORT_CONSTRAINTS_KEY, DIRECTION as DIRECTION_KEY } from '../../src/options/layered-options.js'
import { it } from 'vitest'

const DIMS: [number, number][] = [[220,100],[50,50],[50,50],[50,50],[50,50],[50,50],[50,50],[50,50],[50,50],[50,50],[50,50],[50,50],[50,50],[50,50],[50,50],[50,50],[50,50],[50,50],[50,50],[50,50],[50,50]]
const EDGE_IDX: any = [[0,0,"P1N1",12,0,"P31"],[0,2,"P1N3",11,0,"P30"],[0,4,"P1N5",15,0,"P34"],[0,5,"P1N6",14,0,"P33"],[0,6,"P1N7",13,0,"P32"],[0,8,"P1S1",16,0,"P35"],[0,9,"P1S2",17,0,"P36"],[0,11,"P1S4",18,0,"P37"],[0,13,"P1S6",19,0,"P38"],[0,15,"P1S8",20,0,"P39"],[1,0,"P20",0,7,"P1N8"],[2,0,"P21",0,4,"P1N5"],[3,0,"P22",0,3,"P1N4"],[4,0,"P23",0,1,"P1N2"],[5,0,"P24",0,5,"P1N6"],[6,0,"P25",0,14,"P1S7"],[7,0,"P26",0,10,"P1S3"],[8,0,"P27",0,12,"P1S5"],[9,0,"P28",0,15,"P1S8"],[10,0,"P29",0,8,"P1S1"]]
const PORT_CONSTRAINTS: (string | null)[] = ["FIXED_SIDE","FIXED_SIDE","FIXED_SIDE","FIXED_SIDE","FIXED_SIDE","FIXED_SIDE","FIXED_SIDE","FIXED_SIDE","FIXED_SIDE","FIXED_SIDE","FIXED_SIDE","FIXED_SIDE","FIXED_SIDE","FIXED_SIDE","FIXED_SIDE","FIXED_SIDE","FIXED_SIDE","FIXED_SIDE","FIXED_SIDE","FIXED_SIDE","FIXED_SIDE"]
const NODE_PORTS: any = [[{"id":"P1N1","x":0,"y":0,"w":5,"h":5,"side":"NORTH","index":null},{"id":"P1N2","x":0,"y":0,"w":5,"h":5,"side":"NORTH","index":null},{"id":"P1N3","x":0,"y":0,"w":5,"h":5,"side":"NORTH","index":null},{"id":"P1N4","x":0,"y":0,"w":5,"h":5,"side":"NORTH","index":null},{"id":"P1N5","x":0,"y":0,"w":5,"h":5,"side":"NORTH","index":null},{"id":"P1N6","x":0,"y":0,"w":5,"h":5,"side":"NORTH","index":null},{"id":"P1N7","x":0,"y":0,"w":5,"h":5,"side":"NORTH","index":null},{"id":"P1N8","x":0,"y":0,"w":5,"h":5,"side":"NORTH","index":null},{"id":"P1S1","x":0,"y":0,"w":5,"h":5,"side":"SOUTH","index":null},{"id":"P1S2","x":0,"y":0,"w":5,"h":5,"side":"SOUTH","index":null},{"id":"P1S3","x":0,"y":0,"w":5,"h":5,"side":"SOUTH","index":null},{"id":"P1S4","x":0,"y":0,"w":5,"h":5,"side":"SOUTH","index":null},{"id":"P1S5","x":0,"y":0,"w":5,"h":5,"side":"SOUTH","index":null},{"id":"P1S6","x":0,"y":0,"w":5,"h":5,"side":"SOUTH","index":null},{"id":"P1S7","x":0,"y":0,"w":5,"h":5,"side":"SOUTH","index":null},{"id":"P1S8","x":0,"y":0,"w":5,"h":5,"side":"SOUTH","index":null}],[{"id":"P20","x":0,"y":0,"w":5,"h":5,"side":"EAST","index":null}],[{"id":"P21","x":0,"y":0,"w":5,"h":5,"side":"EAST","index":null}],[{"id":"P22","x":0,"y":0,"w":5,"h":5,"side":"EAST","index":null}],[{"id":"P23","x":0,"y":0,"w":5,"h":5,"side":"EAST","index":null}],[{"id":"P24","x":0,"y":0,"w":5,"h":5,"side":"EAST","index":null}],[{"id":"P25","x":0,"y":0,"w":5,"h":5,"side":"EAST","index":null}],[{"id":"P26","x":0,"y":0,"w":5,"h":5,"side":"EAST","index":null}],[{"id":"P27","x":0,"y":0,"w":5,"h":5,"side":"EAST","index":null}],[{"id":"P28","x":0,"y":0,"w":5,"h":5,"side":"EAST","index":null}],[{"id":"P29","x":0,"y":0,"w":5,"h":5,"side":"EAST","index":null}],[{"id":"P30","x":0,"y":0,"w":5,"h":5,"side":"WEST","index":null}],[{"id":"P31","x":0,"y":0,"w":5,"h":5,"side":"WEST","index":null}],[{"id":"P32","x":0,"y":0,"w":5,"h":5,"side":"WEST","index":null}],[{"id":"P33","x":0,"y":0,"w":5,"h":5,"side":"WEST","index":null}],[{"id":"P34","x":0,"y":0,"w":5,"h":5,"side":"WEST","index":null}],[{"id":"P35","x":0,"y":0,"w":5,"h":5,"side":"WEST","index":null}],[{"id":"P36","x":0,"y":0,"w":5,"h":5,"side":"WEST","index":null}],[{"id":"P37","x":0,"y":0,"w":5,"h":5,"side":"WEST","index":null}],[{"id":"P38","x":0,"y":0,"w":5,"h":5,"side":"WEST","index":null}],[{"id":"P39","x":0,"y":0,"w":5,"h":5,"side":"WEST","index":null}]]

function createSimpleEdge(src: LNode, tgt: LNode, spIdx: number | null = null, tpIdx: number | null = null): LEdge {
  const sp = spIdx !== null && spIdx < src.getPorts().length ? src.getPorts()[spIdx]! : (() => { const p = new LPort(); p.setNode(src); return p })()
  const tp = tpIdx !== null && tpIdx < tgt.getPorts().length ? tgt.getPorts()[tpIdx]! : (() => { const p = new LPort(); p.setNode(tgt); return p })()
  const e = new LEdge(); e.setSource(sp); e.setTarget(tp)
  return e
}

it('debug nsfs', async () => {
  const graph = new LGraph()
  const nodeOf = new Map<number, LNode>()
  for (let i = 0; i < DIMS.length; i++) {
    const n = new LNode(graph)
    n.size = { x: DIMS[i][0], y: DIMS[i][1] }
    if (PORT_CONSTRAINTS[i]) n.setProperty(PORT_CONSTRAINTS_KEY, PORT_CONSTRAINTS[i] as any)
    for (const pd of NODE_PORTS[i]) {
      const port = new LPort()
      port.setNode(n)
      port.getPosition().x = pd.x
      port.getPosition().y = pd.y
      port.size = { x: pd.w, y: pd.h }
      if (pd.side) port.setSide(pd.side as any)
    }
    if (i === 0) n.setLabels([{ text: 'N1', position: { x: 0, y: 0 }, size: { x: 0, y: 0 } }])
    nodeOf.set(i, n)
  }
  for (const [s, sp, , t, tp] of EDGE_IDX) createSimpleEdge(nodeOf.get(s)!, nodeOf.get(t)!, sp, tp)
  graph.setProperty(DIRECTION_KEY, 'RIGHT')
  new LayeredLayoutProvider().layout(graph)
  console.log('=== ggn ===')
  for (const [id, n] of nodeOf) {
    const ports = n.getPorts().map((p: any) => `${p.id}@${Math.round(p.getPosition().x)},${Math.round(p.getPosition().y)}:${p.getSide()}`).slice(0, 4)
    console.log(`N${id} pos=${Math.round(n.position.x)},${Math.round(n.position.y)} size=${Math.round(n.size.x)},${Math.round(n.size.y)} ports=[${ports.join(' ')}...]`)
  }
  const elk = new ELK()
  function buildElkHierarchy(idx: number): any {
    const [w, h] = DIMS[idx]
    const node: any = { id: 'N' + idx, width: w, height: h }
    if (PORT_CONSTRAINTS[idx]) node.layoutOptions = { 'elk.portConstraints': PORT_CONSTRAINTS[idx] }
    const ports = NODE_PORTS[idx] ?? []
    if (ports.length > 0) node.ports = ports.map((p: any) => ({ id: 'N' + idx + '.' + p.id, width: p.w, height: p.h, x: p.x, y: p.y, properties: { 'port.side': p.side ?? 'UNDEFINED', 'port.index': String(p.index ?? 0), 'port.x': String(p.x), 'port.y': String(p.y) } }))
    return node
  }
  const elkChildren = DIMS.map((_, i) => i).map(buildElkHierarchy)
  const elkRes = await elk.layout({
    id: 'root',
    layoutOptions: { 'elk.algorithm': 'layered', 'elk.direction': 'RIGHT', 'elk.randomSeed': '1' },
    children: elkChildren,
    edges: EDGE_IDX.map(([s, , sp, t, , tp], i: number) => ({ id: 'e' + i, sources: [sp ? 'N' + s + '.' + sp : 'N' + s], targets: [tp ? 'N' + t + '.' + tp : 'N' + t] })),
  })
  console.log('=== elkjs ===')
  for (const c of elkRes.children ?? []) console.log(`N${c.id.replace('N','')} pos=${Math.round(c.x)},${Math.round(c.y)} size=${c.width},${c.height}`)
})
