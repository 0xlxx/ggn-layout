import ELK from 'elkjs/lib/elk.bundled.js'
import { LGraph, LNode, LPort, LEdge } from '../../src/index.js'
import { LayeredLayoutProvider } from '../../src/layered-layout-provider.js'
import { PORT_CONSTRAINTS as PORT_CONSTRAINTS_KEY, HIERARCHY_HANDLING as HIERARCHY_HANDLING_KEY, DIRECTION as DIRECTION_KEY } from '../../src/options/layered-options.js'
import { it } from 'vitest'
import { ORIGIN, GRAPH_PROPERTIES } from '../../src/options/internal-properties.js'

const HIERARCHY: Record<number, number[]> = {"4":[5,6,7]}
const DIMS: [number, number][] = [[50,50],[50,50],[50,50],[50,50],[100,20],[50,50],[50,50],[50,50]]
const NODE_PORTS: any = [[],[],[],[],[{"id":"CN1","x":10,"y":-5,"w":5,"h":5,"side":"NORTH"},{"id":"CN2","x":50,"y":-5,"w":5,"h":5,"side":"NORTH"},{"id":"CW1","x":-5,"y":10,"w":5,"h":5,"side":"WEST"},{"id":"CE1","x":100,"y":10,"w":5,"h":5,"side":"EAST"}],[],[],[]]
const PORT_CONSTRAINTS: (string | null)[] = [null,null,null,null,"FIXED_SIDE",null,null,null]
const EDGE_IDX: any = [[4,1,"CN2",5,null,null],[4,0,"CN1",6,null,null],[4,2,"CW1",7,null,null],[5,null,null,6,null,null],[7,null,null,4,3,"CE1"],[0,null,null,4,0,"CN1"],[1,null,null,4,1,"CN2"],[2,null,null,4,2,"CW1"],[4,3,"CE1",3,null,null]]

function createSimpleEdge(src: LNode, tgt: LNode, spIdx: number | null = null, tpIdx: number | null = null): LEdge {
  const sp = spIdx !== null && spIdx < src.getPorts().length ? src.getPorts()[spIdx]! : (() => { const p = new LPort(); p.setNode(src); return p })()
  const tp = tpIdx !== null && tpIdx < tgt.getPorts().length ? tgt.getPorts()[tpIdx]! : (() => { const p = new LPort(); p.setNode(tgt); return p })()
  const e = new LEdge(); e.setSource(sp); e.setTarget(tp)
  return e
}

function buildGgn() {
  const graph = new LGraph()
  const nodeOf = new Map<number, LNode>()
  const nestedGraphs = new Map<number, LGraph>()
  for (const p of Object.keys(HIERARCHY).map(Number)) nestedGraphs.set(p, new LGraph())
  for (let i = 0; i < DIMS.length; i++) {
    const parentIdx = Object.entries(HIERARCHY).find(([, kids]) => kids.includes(i))?.[0]
    const g = parentIdx !== undefined ? nestedGraphs.get(Number(parentIdx))! : graph
    const n = new LNode(g)
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
    nodeOf.set(i, n)
  }
  for (const p of Object.keys(HIERARCHY).map(Number)) {
    const parent = nodeOf.get(p)!
    const nested = nestedGraphs.get(p)!
    parent.setNestedGraph(nested)
    nested.setParentNode(parent)
  }
  for (const [s, sp, , t, tp] of EDGE_IDX) createSimpleEdge(nodeOf.get(s)!, nodeOf.get(t)!, sp, tp)
  graph.setProperty(HIERARCHY_HANDLING_KEY, 'INCLUDE_CHILDREN')
  graph.setProperty(DIRECTION_KEY, 'RIGHT')
  return { graph, nodeOf }
}

it('debug h05', async () => {
  const { graph, nodeOf } = buildGgn()
  const rootG = graph
  const dump = (tag: string) => {
    const info = rootG.getLayers().map((l: any, li: number) => {
      const nodes = l.getNodes().map((n: any) => {
        const name = (() => { for (let k = 0; k <= 7; k++) if (nodeOf.get(k) === n) return 'N' + k; return null })()
        return `${n.id}${name ? '=' + name : ''}`
      }).join(' ')
      return `L${li}: ${nodes}`
    }).join(' | ')
    console.log(tag, info)
  }
  const hooks: any = {
    afterPhase: (phase: string, g: any) => { if (g === rootG) dump('AFTER ' + phase) },
  }
  const lp = new LayeredLayoutProvider()
  lp.setHooks(hooks)
  lp.layout(graph)
  console.log('=== ggn ===')
  for (const [id, n] of nodeOf) {
    const ports = n.getPorts().map((p: any) => `${p.id}@${Math.round(p.getPosition().x)},${Math.round(p.getPosition().y)}:${p.getSide()}`)
    console.log(`N${id} pos=${Math.round(n.position.x)},${Math.round(n.position.y)} size=${Math.round(n.size.x)},${Math.round(n.size.y)} ports=[${ports.join(' ')}]`)
  }
  const elk = new ELK()
  function buildElkHierarchy(idx: number): any {
    const [w, h] = DIMS[idx]
    const node: any = { id: 'N' + idx, width: w, height: h }
    if (PORT_CONSTRAINTS[idx]) node.layoutOptions = { 'elk.portConstraints': PORT_CONSTRAINTS[idx] }
    const ports = NODE_PORTS[idx] ?? []
    if (ports.length > 0) node.ports = ports.map((p: any) => ({ id: 'N' + idx + '.' + p.id, width: p.w, height: p.h, x: p.x, y: p.y, properties: { 'port.side': p.side ?? 'UNDEFINED', 'port.index': String(p.index ?? 0), 'port.x': String(p.x), 'port.y': String(p.y) } }))
    const kids = HIERARCHY[idx] ?? []
    if (kids.length > 0) node.children = kids.map(buildElkHierarchy)
    return node
  }
  const elkChildren = DIMS.map((_, i) => i).filter(i => !Object.values(HIERARCHY).flat().includes(i)).map(buildElkHierarchy)
  const elkRes = await elk.layout({
    id: 'root',
    layoutOptions: { 'elk.algorithm': 'layered', 'elk.direction': 'RIGHT', 'elk.randomSeed': '1', 'elk.hierarchyHandling': 'INCLUDE_CHILDREN' },
    children: elkChildren,
    edges: EDGE_IDX.map(([s, , sp, t, , tp], i: number) => ({ id: 'e' + i, sources: [sp ? 'N' + s + '.' + sp : 'N' + s], targets: [tp ? 'N' + t + '.' + tp : 'N' + t] })),
  })
  console.log('=== elkjs ===')
  const walk = (list: any[], px: number, py: number) => {
    for (const c of list) {
      const wx = px + c.x, wy = py + c.y
      console.log(`${c.id} pos=${Math.round(c.x)},${Math.round(c.y)} world=${Math.round(wx)},${Math.round(wy)} size=${c.width},${c.height}`)
      for (const port of c.ports ?? []) console.log(`  port ${port.id} x=${Math.round(port.x)},y=${Math.round(port.y)}`)
      if (c.children) walk(c.children, wx, wy)
    }
  }
  walk(elkRes.children ?? [], 0, 0)
})
