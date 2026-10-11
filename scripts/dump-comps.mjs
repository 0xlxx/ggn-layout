/**
 * 临时调试: dump ggn 分量拆分与 combine 排列结果.
 *   node scripts/dump-comps.mjs <elkt 文件>
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseElkt } from './elkt2test.mjs'
import { LGraph, LNode, LPort, LEdge, LayeredLayoutProvider, HIERARCHY_HANDLING } from '../dist/index.mjs'

const PCC = 'org.eclipse.elk.portConstraints'
const PIX = 'org.eclipse.elk.port.index'

function buildGraph(graphData) {
  const { nodes, edges, hierarchy, graphProps, nodeProps } = graphData
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
      if (port.index !== null && port.index !== undefined) lport.setProperty(PIX, port.index)
    }
    nodeOf.set(id, n)
  }
  for (const p of hierarchy.keys()) {
    nodeOf.get(p).setNestedGraph(nestedGraphs.get(p))
    nestedGraphs.get(p).setParentNode(nodeOf.get(p))
  }
  for (const [s, sp, t, tp] of edges) {
    const spIdx = sp === null ? null : (nodeProps.get(s)?.ports ?? []).findIndex(pp => pp.id === sp)
    const tpIdx = tp === null ? null : (nodeProps.get(t)?.ports ?? []).findIndex(pp => pp.id === tp)
    const spPort = spIdx !== null && spIdx < nodeOf.get(s).getPorts().length ? nodeOf.get(s).getPorts()[spIdx] : (() => { const p = new LPort(); p.setNode(nodeOf.get(s)); return p })()
    const tpPort = tpIdx !== null && tpIdx < nodeOf.get(t).getPorts().length ? nodeOf.get(t).getPorts()[tpIdx] : (() => { const p = new LPort(); p.setNode(nodeOf.get(t)); return p })()
    const e = new LEdge(); e.setSource(spPort); e.setTarget(tpPort)
  }
  return { g, nodeOf, nodeProps }
}

const file = process.argv[2]
const source = readFileSync(resolve(file), 'utf8')
const graphData = parseElkt(source)
const { g, nodeOf, nodeProps } = buildGraph(graphData)

const { ComponentsProcessor, computeComponentSize } = await import('../dist/index.mjs')
const comps = new ComponentsProcessor().split(g)
console.log(`分量数: ${comps.length}`)
{
  let zero = 0
  for (const n of g.getLayerlessNodes()) { if (n.size.x < 1 || n.size.y < 1) zero++ }
  console.log(`布局前 0 尺寸节点: ${zero}, 前5节点 id: ${g.getLayerlessNodes().slice(0,5).map(n=>n.id).join(',')}`)
  if (zero > 0) {
    for (const n of g.getLayerlessNodes().slice(0, 5)) console.log(`  布局前 ${n.id}: ${n.size.x}x${n.size.y}`)
  }
}
comps.forEach((c, i) => {
  const nodes = c.getLayerlessNodes()
  const edges = nodes.reduce((acc, n) => acc + n.getPorts().reduce((a, p) => a + p.getOutgoingEdges().length, 0), 0)
  console.log(`  分量${i}: ${nodes.length} 节点 ${edges} 边, size=${c.getSize().x.toFixed(1)}x${c.getSize().y.toFixed(1)}`)
})

// 布局并打印排列结果
const provider = new LayeredLayoutProvider()
provider.setHooks({
  afterPhase: (phase, graph) => {
    if (phase === 'done' && graph !== g) {
      const all = graph.getAllNodes()
      console.log(`分量 ${all.length} 节点 done: 层数=${graph.getLayers().length} 层=${graph.getLayers().map(l => l.getNodes().length).join(',')} y 高=${Math.max(...all.map(n => n.position.y + n.size.y), 0).toFixed(0)}`)
    }
  }
})
provider.layout(g)
console.log('--- combine 后 ---')
{
  const nodes = g.getAllNodes()
  const seen = new Set()
  let overlap = 0
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j]
      if (a.position.x < b.position.x + b.size.x && b.position.x < a.position.x + a.size.x &&
          a.position.y < b.position.y + b.size.y && b.position.y < a.position.y + a.size.y) {
        overlap++
        if (overlap <= 5) console.log(`  重叠: ${a.id}(${a.position.x.toFixed(1)},${a.position.y.toFixed(1)}) ${a.size.x}x${a.size.y} vs ${b.id}(${b.position.x.toFixed(1)},${b.position.y.toFixed(1)}) ${b.size.x}x${b.size.y}`)
      }
    }
  }
  console.log(`重叠对数: ${overlap}`)
}
console.log('root 层结构:', g.getLayers().length)

for (const n of g.getLayerlessNodes()) {
  console.log(`  ${n.id}: (${n.position.x.toFixed(1)}, ${n.position.y.toFixed(1)}) ${n.size.x.toFixed(0)}x${n.size.y.toFixed(0)}`)
}
