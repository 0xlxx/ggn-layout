import { LGraph, LNode, LPort, LEdge } from '../../src/index.js'
import { LayeredLayoutProvider } from '../../src/layered-layout-provider.js'
import { PORT_CONSTRAINTS as PORT_CONSTRAINTS_KEY, PORT_INDEX as PORT_INDEX_KEY, DIRECTION as DIRECTION_KEY } from '../../src/options/layered-options.js'

it('debug west_output module trace', () => {
  const graph = new LGraph()
  const nodeOf = new Map<number, LNode>()
  const DIMS = [[50,50],[50,50]]
  const PORT_CONSTRAINTS = ["FIXED_SIDE","FIXED_SIDE"]
  const NODE_PORTS = [[{"id":"P1_1","x":0,"y":0,"w":5,"h":5,"side":"WEST","index":null}],[{"id":"P2_1","x":0,"y":0,"w":5,"h":5,"side":"WEST","index":null}]]
  const EDGE_IDX = [[0,0,"P1_1",1,0,"P2_1"]]
  for (let i = 0; i < DIMS.length; i++) {
    const n = new LNode(graph)
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
  }
  const createSimpleEdge = (src: LNode, tgt: LNode, spIdx: number | null, tpIdx: number | null) => {
    const sp = spIdx !== null && spIdx < src.getPorts().length ? src.getPorts()[spIdx]! : (() => { const p = new LPort(); p.setNode(src); return p })()
    const tp = tpIdx !== null && tpIdx < tgt.getPorts().length ? tgt.getPorts()[tpIdx]! : (() => { const p = new LPort(); p.setNode(tgt); return p })()
    const e = new LEdge(); e.setSource(sp); e.setTarget(tp)
    return e
  }
  for (const [s, sp, , t, tp] of EDGE_IDX) createSimpleEdge(nodeOf.get(s)!, nodeOf.get(t)!, sp, tp)
  graph.setProperty(DIRECTION_KEY, 'RIGHT')
  const provider = new LayeredLayoutProvider()
  provider.setHooks({
    beforeModule: (name: string) => {
      if (['LongEdgeSplitter','PortSideProcessor','InvertedPortProcessor','PortListSorter','LayerSweepCrossingMinimizer','ReversedEdgeRestorer','GraphTransformer(out)'].includes(name)) {
        const info = [...nodeOf.values()].map(n => `${n.id}: ports=${n.getPorts().map(p => `${p.id}@${p.getSide()}(in=${p.getIncomingEdges().length},out=${p.getOutgoingEdges().length})`).join(';')}`).join('  ')
        const layers = graph.getLayers().map(l => l.getNodes().map(n => `${n.getId()}:${n.getType()}`).join('|')).join('>')
        console.error(`BEFORE ${name}: layers=${layers} ${info}`)
      }
    },
    afterModule: (name: string) => {
      if (['LongEdgeSplitter','PortSideProcessor','InvertedPortProcessor','PortListSorter','LayerSweepCrossingMinimizer','ReversedEdgeRestorer','GraphTransformer(out)'].includes(name)) {
        const info = [...nodeOf.values()].map(n => `${n.id}: ports=${n.getPorts().map(p => `${p.id}@${p.getSide()}(in=${p.getIncomingEdges().length},out=${p.getOutgoingEdges().length})`).join(';')}`).join('  ')
        const layers = graph.getLayers().map(l => l.getNodes().map(n => `${n.getId()}:${n.getType()}`).join('|')).join('>')
        const all = graph.getAllNodes().map(n => `${n.getId()}[${n.getType()}]@(${n.position.x.toFixed(1)},${n.position.y.toFixed(1)})`).join(' ')
        console.error(`AFTER  ${name}: layers=${layers} ${info}  all=${all}`)
      }
    },
  })
  provider.layout(graph)
  throw new Error('done')
})
