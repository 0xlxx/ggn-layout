import ELK from 'elkjs/lib/elk.bundled.js'
import { LGraph, LNode, LPort, LEdge } from '../../src/index.js'
import { LayeredLayoutProvider } from '../../src/layered-layout-provider.js'
import { PORT_CONSTRAINTS as PORT_CONSTRAINTS_KEY, PORT_INDEX as PORT_INDEX_KEY, HIERARCHY_HANDLING as HIERARCHY_HANDLING_KEY, DIRECTION as DIRECTION_KEY } from '../../src/options/layered-options.js'
const elk = new ELK()
function createSimpleEdge(src: LNode, tgt: LNode, spIdx: number | null = null, tpIdx: number | null = null): LEdge {
  const sp = spIdx !== null && spIdx < src.getPorts().length ? src.getPorts()[spIdx]! : (() => { const p = new LPort(); p.setNode(src); return p })()
  const tp = tpIdx !== null && tpIdx < tgt.getPorts().length ? tgt.getPorts()[tpIdx]! : (() => { const p = new LPort(); p.setNode(tgt); return p })()
  const e = new LEdge(); e.setSource(sp); e.setTarget(tp)
  return e
}
function buildElkHierarchy(idx: number, hierarchy: Record<number, number[]>, dims: [number, number][], nodePorts: { id: string; x: number; y: number; w: number; h: number; side: string | null; index: number | null }[][], portConstraints: (string | null)[]): any {
  const [w, h] = dims[idx]
  const node: any = { id: 'N' + idx, width: w, height: h }
  if (portConstraints[idx]) node.layoutOptions = { 'elk.portConstraints': portConstraints[idx] }
  const ports = nodePorts[idx] ?? []
  if (ports.length > 0) node.ports = ports.map((p: any) => ({ id: 'N' + idx + '.' + p.id, width: p.w, height: p.h, x: p.x, y: p.y, properties: { 'port.side': p.side ?? 'UNDEFINED', 'port.index': String(p.index ?? 0), 'port.x': String(p.x), 'port.y': String(p.y) } }))
  const kids = hierarchy[idx] ?? []
  if (kids.length > 0) node.children = kids.map(k => buildElkHierarchy(k, hierarchy, dims, nodePorts, portConstraints))
  return node
}
it('hierarchy02 debug', async () => {
  const HIERARCHY: Record<number, number[]> = {"1":[2,3,4]}
  const EDGE_IDX: [number, number | null, string | null, number, number | null, string | null][] = [[1,0,"CW1",2,null,null],[1,1,"CW2",3,null,null],[2,null,null,4,null,null],[3,null,null,4,null,null],[4,null,null,1,2,"CE1"],[0,null,null,1,0,"CW1"],[0,null,null,1,1,"CW2"],[0,null,null,5,null,null],[1,2,"CE1",5,null,null],[1,2,"CE1",6,null,null]]
  const DIMS: [number, number][] = [[50,50],[60,30],[50,50],[50,50],[50,50],[50,50],[50,50]]
  const PORT_CONSTRAINTS: (string | null)[] = [null,"FREE",null,null,null,null,null]
  const NODE_PORTS: { id: string; x: number; y: number; w: number; h: number; side: string | null; index: number | null }[][] = [[],[{"id":"CW1","x":0,"y":0,"w":5,"h":5,"side":null,"index":null},{"id":"CW2","x":0,"y":0,"w":5,"h":5,"side":null,"index":null},{"id":"CE1","x":0,"y":0,"w":5,"h":5,"side":null,"index":null}],[],[],[],[],[]]

  const elkChildren = [0,1,5,6].map(i => buildElkHierarchy(i, HIERARCHY, DIMS, NODE_PORTS, PORT_CONSTRAINTS))
  const elkRes = await elk.layout({
    id: 'root',
    layoutOptions: { 'elk.algorithm': 'layered', 'elk.randomSeed': '1', 'elk.hierarchyHandling': 'INCLUDE_CHILDREN' },
    children: elkChildren,
    edges: EDGE_IDX.map(([s, , sp, t, , tp], i) => ({ id: 'e' + i, sources: [sp ? 'N' + s + '.' + sp : 'N' + s], targets: [tp ? 'N' + t + '.' + tp : 'N' + t] })),
  })
  const walk = (list: any[], px: number, py: number) => { for (const c of list) { console.log(`elk ${c.id}: (${(px+c.x).toFixed(1)},${(py+c.y).toFixed(1)}) size(${c.width}x${c.height})`); if (c.children) walk(c.children, px+c.x, py+c.y) } }
  walk(elkRes.children ?? [], 0, 0)

  const graph = new LGraph()
  const graphNodes: LNode[] = []
  const nodeOf = new Map<number, LNode>()
  const nestedGraphs = new Map<number, LGraph>()
  for (const p of Object.keys(HIERARCHY).map(Number)) nestedGraphs.set(p, new LGraph())
  for (let i = 0; i < DIMS.length; i++) {
    const parentIdx = Object.entries(HIERARCHY).find(([, kids]) => kids.includes(i))?.[0]
    const g = parentIdx !== undefined ? nestedGraphs.get(Number(parentIdx))! : graph
    const n = new LNode(g)
    n.size = { x: DIMS[i][0], y: DIMS[i][1] }
    if (PORT_CONSTRAINTS[i]) n.setProperty(PORT_CONSTRAINTS_KEY, PORT_CONSTRAINTS[i] as any)
    for (const portDesc of NODE_PORTS[i]) {
      const port = new LPort()
      port.setNode(n)
      port.getPosition().x = portDesc.x
      port.getPosition().y = portDesc.y
      port.size = { x: portDesc.w, y: portDesc.h }
      if (portDesc.side) port.setSide(portDesc.side as any)
      if (portDesc.index !== null) port.setProperty(PORT_INDEX_KEY, portDesc.index)
    }
    nodeOf.set(i, n)
    graphNodes.push(n)
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
  new LayeredLayoutProvider().layout(graph)
  for (let i = 0; i < graphNodes.length; i++) {
    const n = graphNodes[i]!
    let wx = n.position.x, wy = n.position.y
    let g = n.getGraph()
    while (g !== null && g !== graph) { const parent = g.getParentNode()!; wx += parent.position.x; wy += parent.position.y; g = parent.getGraph() }
    console.log(`ggn N${i}: (${wx.toFixed(1)},${wy.toFixed(1)}) size(${n.size.x}x${n.size.y})`)
  }
})
