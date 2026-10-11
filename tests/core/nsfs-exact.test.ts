import ELK from 'elkjs/lib/elk.bundled.js'
import { LGraph, LNode, LPort, LEdge, Direction } from '../../src/index.js'
import { LayeredLayoutProvider } from '../../src/layered-layout-provider.js'
import { PORT_CONSTRAINTS as PORT_CONSTRAINTS_KEY, PORT_INDEX as PORT_INDEX_KEY, DIRECTION as DIRECTION_KEY, HIERARCHY_HANDLING as HIERARCHY_HANDLING_KEY } from '../../src/options/layered-options.js'
import { it } from 'vitest'
const elk = new ELK()
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

function createSimpleEdge(src: LNode, tgt: LNode, spIdx: number | null = null, tpIdx: number | null = null): LEdge {
  const sp = spIdx !== null && spIdx < src.getPorts().length ? src.getPorts()[spIdx]! : (() => { const p = new LPort(); p.setNode(src); return p })()
  const tp = tpIdx !== null && tpIdx < tgt.getPorts().length ? tgt.getPorts()[tpIdx]! : (() => { const p = new LPort(); p.setNode(tgt); return p })()
  const e = new LEdge(); e.setSource(sp); e.setTarget(tp)
  return e
}

  const HIERARCHY: Record<number, number[]> = {}
  const EDGE_IDX: [number, number | null, string | null, number, number | null, string | null][] = [[0,0,"P1N1",12,0,"P31"],[0,2,"P1N3",11,0,"P30"],[0,4,"P1N5",15,0,"P34"],[0,5,"P1N6",14,0,"P33"],[0,6,"P1N7",13,0,"P32"],[0,8,"P1S1",16,0,"P35"],[0,9,"P1S2",17,0,"P36"],[0,11,"P1S4",18,0,"P37"],[0,13,"P1S6",19,0,"P38"],[0,15,"P1S8",20,0,"P39"],[1,0,"P20",0,7,"P1N8"],[2,0,"P21",0,4,"P1N5"],[3,0,"P22",0,3,"P1N4"],[4,0,"P23",0,1,"P1N2"],[5,0,"P24",0,5,"P1N6"],[6,0,"P25",0,14,"P1S7"],[7,0,"P26",0,10,"P1S3"],[8,0,"P27",0,12,"P1S5"],[9,0,"P28",0,15,"P1S8"],[10,0,"P29",0,8,"P1S1"]]
  const DIMS: [number, number][] = [[220,100],[50,50],[50,50],[50,50],[50,50],[50,50],[50,50],[50,50],[50,50],[50,50],[50,50],[50,50],[50,50],[50,50],[50,50],[50,50],[50,50],[50,50],[50,50],[50,50],[50,50]]
  const PORT_IDS: string[] = ["P1N1","P1N2","P1N3","P1N4","P1N5","P1N6","P1N7","P1N8","P1S1","P1S2","P1S3","P1S4","P1S5","P1S6","P1S7","P1S8","P20","P21","P22","P23","P24","P25","P26","P27","P28","P29","P30","P31","P32","P33","P34","P35","P36","P37","P38","P39"]
  const PORT_CONSTRAINTS: (string | null)[] = ["FIXED_SIDE","FIXED_SIDE","FIXED_SIDE","FIXED_SIDE","FIXED_SIDE","FIXED_SIDE","FIXED_SIDE","FIXED_SIDE","FIXED_SIDE","FIXED_SIDE","FIXED_SIDE","FIXED_SIDE","FIXED_SIDE","FIXED_SIDE","FIXED_SIDE","FIXED_SIDE","FIXED_SIDE","FIXED_SIDE","FIXED_SIDE","FIXED_SIDE","FIXED_SIDE"]
  const NODE_PORTS: { id: string; x: number; y: number; w: number; h: number; side: string | null; index: number | null }[][] = [[{"id":"P1N1","x":0,"y":0,"w":5,"h":5,"side":"NORTH","index":null},{"id":"P1N2","x":0,"y":0,"w":5,"h":5,"side":"NORTH","index":null},{"id":"P1N3","x":0,"y":0,"w":5,"h":5,"side":"NORTH","index":null},{"id":"P1N4","x":0,"y":0,"w":5,"h":5,"side":"NORTH","index":null},{"id":"P1N5","x":0,"y":0,"w":5,"h":5,"side":"NORTH","index":null},{"id":"P1N6","x":0,"y":0,"w":5,"h":5,"side":"NORTH","index":null},{"id":"P1N7","x":0,"y":0,"w":5,"h":5,"side":"NORTH","index":null},{"id":"P1N8","x":0,"y":0,"w":5,"h":5,"side":"NORTH","index":null},{"id":"P1S1","x":0,"y":0,"w":5,"h":5,"side":"SOUTH","index":null},{"id":"P1S2","x":0,"y":0,"w":5,"h":5,"side":"SOUTH","index":null},{"id":"P1S3","x":0,"y":0,"w":5,"h":5,"side":"SOUTH","index":null},{"id":"P1S4","x":0,"y":0,"w":5,"h":5,"side":"SOUTH","index":null},{"id":"P1S5","x":0,"y":0,"w":5,"h":5,"side":"SOUTH","index":null},{"id":"P1S6","x":0,"y":0,"w":5,"h":5,"side":"SOUTH","index":null},{"id":"P1S7","x":0,"y":0,"w":5,"h":5,"side":"SOUTH","index":null},{"id":"P1S8","x":0,"y":0,"w":5,"h":5,"side":"SOUTH","index":null}],[{"id":"P20","x":0,"y":0,"w":5,"h":5,"side":"EAST","index":null}],[{"id":"P21","x":0,"y":0,"w":5,"h":5,"side":"EAST","index":null}],[{"id":"P22","x":0,"y":0,"w":5,"h":5,"side":"EAST","index":null}],[{"id":"P23","x":0,"y":0,"w":5,"h":5,"side":"EAST","index":null}],[{"id":"P24","x":0,"y":0,"w":5,"h":5,"side":"EAST","index":null}],[{"id":"P25","x":0,"y":0,"w":5,"h":5,"side":"EAST","index":null}],[{"id":"P26","x":0,"y":0,"w":5,"h":5,"side":"EAST","index":null}],[{"id":"P27","x":0,"y":0,"w":5,"h":5,"side":"EAST","index":null}],[{"id":"P28","x":0,"y":0,"w":5,"h":5,"side":"EAST","index":null}],[{"id":"P29","x":0,"y":0,"w":5,"h":5,"side":"EAST","index":null}],[{"id":"P30","x":0,"y":0,"w":5,"h":5,"side":"WEST","index":null}],[{"id":"P31","x":0,"y":0,"w":5,"h":5,"side":"WEST","index":null}],[{"id":"P32","x":0,"y":0,"w":5,"h":5,"side":"WEST","index":null}],[{"id":"P33","x":0,"y":0,"w":5,"h":5,"side":"WEST","index":null}],[{"id":"P34","x":0,"y":0,"w":5,"h":5,"side":"WEST","index":null}],[{"id":"P35","x":0,"y":0,"w":5,"h":5,"side":"WEST","index":null}],[{"id":"P36","x":0,"y":0,"w":5,"h":5,"side":"WEST","index":null}],[{"id":"P37","x":0,"y":0,"w":5,"h":5,"side":"WEST","index":null}],[{"id":"P38","x":0,"y":0,"w":5,"h":5,"side":"WEST","index":null}],[{"id":"P39","x":0,"y":0,"w":5,"h":5,"side":"WEST","index":null}]]
  const NODE_LABELS: { text: string; width: number; height: number }[][] = [[{"text":"N1","width":0,"height":0}],[{"text":"N20","width":0,"height":0}],[{"text":"N21","width":0,"height":0}],[{"text":"N22","width":0,"height":0}],[{"text":"N23","width":0,"height":0}],[{"text":"N24","width":0,"height":0}],[{"text":"N25","width":0,"height":0}],[{"text":"N26","width":0,"height":0}],[{"text":"N27","width":0,"height":0}],[{"text":"N28","width":0,"height":0}],[{"text":"N29","width":0,"height":0}],[{"text":"N30","width":0,"height":0}],[{"text":"N31","width":0,"height":0}],[{"text":"N32","width":0,"height":0}],[{"text":"N33","width":0,"height":0}],[{"text":"N34","width":0,"height":0}],[{"text":"N35","width":0,"height":0}],[{"text":"N36","width":0,"height":0}],[{"text":"N37","width":0,"height":0}],[{"text":"N38","width":0,"height":0}],[{"text":"N39","width":0,"height":0}]]


  it('坐标级差分: 与 elkjs 1:1 对齐', async () => {
    const graph = new LGraph()
    const nodeOf = new Map<number, LNode>()
    const nestedGraphs = new Map<number, LGraph>()
    // 只有容器节点 (有子节点的) 才拥有 nestedGraph (ELK 模型).
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      nestedGraphs.set(p, new LGraph())
    }
    for (let i = 0; i < DIMS.length; i++) {
      const parentIdx = Object.entries(HIERARCHY).find(([, kids]) => kids.includes(i))?.[0]
      const g = parentIdx !== undefined ? nestedGraphs.get(Number(parentIdx))! : graph
      const n = new LNode(g)
      n.size = { x: DIMS[i][0], y: DIMS[i][1] }
      if (PORT_CONSTRAINTS[i]) {
        n.setProperty(PORT_CONSTRAINTS_KEY, PORT_CONSTRAINTS[i] as any)
      }
      for (const portDesc of NODE_PORTS[i]) {
        const port = new LPort()
        port.setNode(n)
        port.getPosition().x = portDesc.x
        port.getPosition().y = portDesc.y
        port.size = { x: portDesc.w, y: portDesc.h }
        if (portDesc.side) port.setSide(portDesc.side as any)
        if (portDesc.index !== null) port.setProperty(PORT_INDEX_KEY, portDesc.index)
      }
      if (NODE_LABELS[i].length > 0) {
        n.setLabels(NODE_LABELS[i].map((l) => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height } })))
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
    if (Object.keys(HIERARCHY).length > 0) {
      graph.setProperty(HIERARCHY_HANDLING_KEY, 'INCLUDE_CHILDREN')
    }
    graph.setProperty(DIRECTION_KEY, Direction.RIGHT)

    new LayeredLayoutProvider().layout(graph)

    if (false) {
      for (const n of nodeOf.values()) {
        expect(Number.isFinite(n.position.x)).toBe(true)
        expect(Number.isFinite(n.position.y)).toBe(true)
      }
      return
    }

    const elkChildren = Array.from({ length: DIMS.length }, (_, i) => i)
      .filter(i => !Object.values(HIERARCHY).flat().includes(i))
      .map(i => buildElkHierarchy(i, HIERARCHY, DIMS, NODE_PORTS, PORT_CONSTRAINTS)) as any[]
    const elkRes = await elk.layout({
      id: 'root',
      layoutOptions: { 'elk.algorithm': 'layered', 'elk.direction': 'RIGHT', 'elk.randomSeed': '1', ...(false ? { 'elk.hierarchyHandling': 'INCLUDE_CHILDREN' } : {}) },
      children: elkChildren,
      edges: EDGE_IDX.map(([s, , sp, t, , tp], i) => ({ id: 'e' + i, sources: [sp ? 'N' + s + '.' + sp : 'N' + s], targets: [tp ? 'N' + t + '.' + tp : 'N' + t] })),
    })

    // 坐标级差分: 每个节点的世界坐标与 elkjs 一致 (容差 1).
    // elkjs 返回的坐标是相对父块的 (INCLUDE_CHILDREN 时子节点坐标是块内坐标).
    const elkPos = new Map<string, { x: number; y: number }>()
    const walk = (list: any[], parentX: number, parentY: number) => {
      for (const c of list) {
        const wx = parentX + c.x, wy = parentY + c.y
        elkPos.set(c.id, { x: wx, y: wy })
        if (c.children) walk(c.children, wx, wy)
      }
    }
    walk(elkRes.children ?? [], 0, 0)

    // ggn 子图节点坐标是相对父节点的 (与 elkjs 一致): 差分前做世界坐标累加.
    const ggnPos = new Map<number, { x: number; y: number }>()
    const walkGgn = (ids: number[], px: number, py: number) => {
      for (const id of ids) {
        const n = nodeOf.get(id)!
        const wx = px + n.position.x, wy = py + n.position.y
        ggnPos.set(id, { x: wx, y: wy })
        const kids = HIERARCHY[id] ?? []
        if (kids.length > 0) walkGgn(kids, wx, wy)
      }
    }
    walkGgn(Object.keys(HIERARCHY).length > 0
      ? DIMS.map((_, i) => i).filter(i => !Object.values(HIERARCHY).flat().includes(i))
      : DIMS.map((_, i) => i), 0, 0)

    for (const [id, pos] of ggnPos) {
      const el = elkPos.get('N' + id)!
      console.log('DBGALL', 'N' + id, 'ggn', pos.x.toFixed(1), pos.y.toFixed(1), 'elk', el.x.toFixed(1), el.y.toFixed(1))
    }
    for (let i = 0; i < DIMS.length; i++) {
      const n = nodeOf.get(i)!
      const el = elkPos.get('N' + i)!
      const gn = ggnPos.get(i)!
      if (Math.abs(gn.x - el.x) > 1) console.log('DIFFX', 'N' + i, 'ggn', gn.x, 'elk', el.x)
      if (Math.abs(gn.y - el.y) > 1) console.log('DIFFY', 'N' + i, 'ggn', gn.y, 'elk', el.y)
      expect(Math.abs(gn.x - el.x), 'N' + i + ' x').toBeLessThanOrEqual(1)
      expect(Math.abs(gn.y - el.y), 'N' + i + ' y').toBeLessThanOrEqual(1)
    }
  })
