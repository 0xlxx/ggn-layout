import { readFileSync } from 'node:fs'
import { parseElkt } from '../../scripts/elkt2test.mjs'
// src
import { LGraph as SGraph, LNode as SNode, LPort as SPort, LEdge as SEdge } from '../../src/index.js'
import { LayeredLayoutProvider as SProvider } from '../../src/layered-layout-provider.js'
import { PORT_CONSTRAINTS as SPCC, PORT_INDEX as SPIX } from '../../src/options/layered-options.js'
// dist
import { LGraph as DGraph, LNode as DNode, LPort as DPort, LEdge as DEdge, LayeredLayoutProvider as DProvider, PORT_CONSTRAINTS as DPCC, PORT_INDEX as DPIX } from '../dist/index.mjs'

function build(libs: any, gd: any) {
  const { LGraph, LNode, LPort, LEdge, PCC, PIX } = libs
  const g = new LGraph()
  const nodeOf = new Map<string, any>()
  for (const id of gd.nodes) {
    const n = new LNode(g)
    const p = gd.nodeProps.get(id) ?? {}
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
    if ((p.labels ?? []).length > 0) {
      n.setLabels(p.labels.map(l => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: (l as any).width ?? 0, y: (l as any).height ?? 0 } })))
    }
    nodeOf.set(id, n)
  }
  const mkEdge = (s: string, sp: string | null, t: string, tp: string | null) => {
    const spIdx = sp === null ? null : (gd.nodeProps.get(s)?.ports ?? []).findIndex(p => p.id === sp)
    const tpIdx = tp === null ? null : (gd.nodeProps.get(t)?.ports ?? []).findIndex(p => p.id === tp)
    const src = nodeOf.get(s)!
    const tgt = nodeOf.get(t)!
    const spPort = spIdx !== null && spIdx < src.getPorts().length ? src.getPorts()[spIdx]! : (() => { const p = new LPort(); p.setNode(src); return p })()
    const tpPort = tpIdx !== null && tpIdx < tgt.getPorts().length ? tgt.getPorts()[tpIdx]! : (() => { const p = new LPort(); p.setNode(tgt); return p })()
    const e = new LEdge(); e.setSource(spPort); e.setTarget(tpPort)
  }
  for (const [s, sp, t, tp] of gd.edges) mkEdge(s, sp, t, tp)
  return { g, nodeOf }
}

const state = (g: any, nodeOf: Map<string, any>) => {
  const layers = g.getLayers().map(l => l.getNodes().map(n => `${n.getId()}`).join('|')).join('>')
  const nodes = [...nodeOf.values()].map(n => `${n.getId()}:${n.getPorts().map(p => `${p.getSide()}`).join(',')}`).join(' ')
  return `L[${layers}] ${nodes}`
}

it('compare src vs dist', () => {
  const source = readFileSync('test-resources/elk-models/tests/layered/inverted_ports/west_output.elkt', 'utf8')
  const gd = parseElkt(source)
  const srcLibs = { LGraph: SGraph, LNode: SNode, LPort: SPort, LEdge: SEdge, PCC: SPCC, PIX: SPIX }
  const dstLibs = { LGraph: DGraph, LNode: DNode, LPort: DPort, LEdge: DEdge, PCC: DPCC, PIX: DPIX }
  const a = build(srcLibs, gd)
  const b = build(dstLibs, gd)
  console.error('SRC prop', a.nodeOf.get('N1')!.getProperty(SPCC), 'DST prop', b.nodeOf.get('N1')!.getProperty(DPCC))
  console.error('SRC isSideFixed', JSON.stringify(SPCC), a.nodeOf.get('N1')!.getProperty(SPCC))
  const dnode: any = b.nodeOf.get('N1')!
  console.error('DST raw', dnode.getProperty(DPCC), 'mapkeys', JSON.stringify([...(dnode as any).props?.keys?.() ?? []]))
  const names: string[] = []
  const sp = new SProvider()
  sp.setHooks({ afterModule: (name: string) => { names.push(name); console.error('SRC after', name, state(a.g, a.nodeOf)) } })
  const dp = new DProvider()
  dp.setHooks({ afterModule: (name: string) => { console.error('DST after', name, state(b.g, b.nodeOf)) } })
  sp.layout(a.g)
  dp.layout(b.g)
  throw new Error('done')
})
