import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseElkt } from '../../scripts/elkt2test.mjs'
import { LGraph, LNode, LPort, LEdge, NodeType } from '../../src/index.js'
import { LayeredLayoutProvider } from '../../src/layered-layout-provider.js'
import { PORT_CONSTRAINTS as PCC, DIRECTION as DIR_KEY, HIERARCHY_HANDLING as HH } from '../../src/options/layered-options.js'
import { SELF_LOOP_HOLDER } from '../../src/options/internal-properties.js'
import { SelfLoopHolder } from '../../src/intermediate/loops/self-loop-holder.js'

describe('zz-debug-sltmp', () => {
  it('debug', () => {
    const model = process.env.DBG_MODEL ?? '288_selfLoopsCauseNPE_a'
    const source = readFileSync(`test-resources/elk-models/tickets/layered/${model}.elkt`, 'utf8')
    const gd = parseElkt(source)
    const { nodes, edges, hierarchy, nodeProps } = gd
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
    if (hierarchy.size > 0) g.setProperty(HH, 'INCLUDE_CHILDREN')
    g.setProperty(DIR_KEY, 'RIGHT')
    const provider = new LayeredLayoutProvider()
    provider.setHooks({
      afterModule: (name, graph) => {
        if (name === 'SelfLoopRouter') {
          console.log(`--- after ${name} (graph parent=${graph.getParentNode()?.id ?? 'root'}) ---`)
          for (const n of graph.getAllNodes()) {
            if (n.getType() !== NodeType.NORMAL) continue
            const sh = n.getProperty(SELF_LOOP_HOLDER) as SelfLoopHolder | null
            if (!sh) continue
            for (const slLoop of sh.getSLHyperLoops()) {
              console.log(`  loop type=${slLoop.getSelfLoopType()} leftmost=${slLoop.getLeftmostPort()?.getLPort().getSide()}(id ${slLoop.getLeftmostPort()?.getLPort().id}) rightmost=${slLoop.getRightmostPort()?.getLPort().getSide()}(id ${slLoop.getRightmostPort()?.getLPort().id}) occupied=[${[...slLoop.getOccupiedPortSides()].join(',')}]`)
              for (const side of ['NORTH','EAST','SOUTH','WEST'] as const) {
                console.log(`    side ${side}: routingSlot=${slLoop.getRoutingSlot(side as any)}`)
              }
            }
          }
        }
      },
    })
    provider.layout(g)
    console.log('--- final ---')
    for (const [id, n] of nodeOf) {
      const m = n.getMargin()
      console.log(`N${id}: pos=(${n.position.x.toFixed(1)},${n.position.y.toFixed(1)}) size=(${n.size.x},${n.size.y}) margin=(l:${m.left.toFixed(1)},t:${m.top.toFixed(1)},r:${m.right.toFixed(1)},b:${m.bottom.toFixed(1)})`)
    }
    expect(true).toBe(true)
  })
})
