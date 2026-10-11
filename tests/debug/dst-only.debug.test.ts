import { readFileSync } from 'node:fs'
import { parseElkt } from '../../scripts/elkt2test.mjs'
import { LGraph, LNode, LPort, LEdge, LayeredLayoutProvider, PORT_CONSTRAINTS as DPCC, PORT_INDEX as DPIX } from '../dist/index.mjs'

it('dst only', async () => {
  const gd = parseElkt(readFileSync('test-resources/elk-models/tests/layered/inverted_ports/west_output.elkt', 'utf8'))
  const g = new LGraph()
  const nodeOf = new Map<string, any>()
  for (const id of gd.nodes) {
    const n = new LNode(g)
    const p = gd.nodeProps.get(id) ?? {}
    n.size = { x: p.width ?? 60, y: p.height ?? 30 }
    if (p.portConstraints) n.setProperty(DPCC, p.portConstraints)
    for (const port of p.ports ?? []) {
      const lport = new LPort()
      lport.setNode(n)
      if (port.side) lport.setSide(port.side)
    }
    nodeOf.set(id, n)
  }
  for (const [s, sp, t, tp] of gd.edges) {
    const src = nodeOf.get(s)!
    const tgt = nodeOf.get(t)!
    const spPort = src.getPorts()[0]!
    const tpPort = tgt.getPorts()[0]!
    const e = new LEdge(); e.setSource(spPort); e.setTarget(tpPort)
  }
  console.error('DBG DPCC id', DPCC.getId())
  const n0: any = nodeOf.get('N1')!
  const fresh = new (await import('../dist/index.mjs')).Property('org.eclipse.elk.layered.portConstraints', 'UNDEFINED')
  console.error('DBG fresh getProperty', n0.getProperty(fresh), 'sameIdGet', n0.getProperty(DPCC), 'hasProp', n0.hasProperty(DPCC))
  const p = new LayeredLayoutProvider()
  p.setHooks({ beforeModule: (name: string) => {
    console.error('DBG before', name, [...nodeOf.values()].map(n => `${n.getId()}:pc=${n.getProperty(DPCC)}:${n.getPorts().map(q => q.getSide()).join(',')}`).join(' '))
  }, afterModule: (name: string) => {
    if (name === 'PortSideProcessor') console.error('DBG after', name, [...nodeOf.values()].map(n => `${n.getId()}:pc=${n.getProperty(DPCC)}:${n.getPorts().map(q => q.getSide()).join(',')}`).join(' '))
  }})
  p.layout(g)
  throw new Error('done')
})
