/**
 * 批量模块分叉扫描: 对一批 elkt 文件, 每个跑一次 ggn 布局 + 一次 ELK Java 快照,
 * 对比全部管线模块的输入/输出, 输出"分叉模块 → 图"分布 (确定修复优先级).
 *
 * 用法: node scripts/scan-modules.mjs <elkt 文件...> [--limit N]
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'
import { execSync } from 'node:child_process'
import { parseElkt } from './elkt2test.mjs'
import { LGraph, LNode, LPort, LEdge, LayeredLayoutProvider } from '../dist/index.mjs'

const PIPELINE = [
  'GreedyCycleBreaker', 'LayerConstraintPreprocessor', 'NetworkSimplexLayerer',
  'LayerConstraintPostprocessor', 'LongEdgeSplitter', 'PortSideProcessor', 'PortListSorter',
  'LayerSweepCrossingMinimizer', 'LabelAndNodeSizeProcessor', 'BKNodePlacer',
  'LayerSizeAndGraphHeightCalculator', 'OrthogonalEdgeRouter', 'LongEdgeJoiner', 'ReversedEdgeRestorer',
]

function dumpState(g, elktName) {
  const layers = g.getLayers().map(l => l.getNodes().map(n => elktName.get(n) ?? String(n.id)))
  const nodes = {}
  for (const layer of g.getLayers()) {
    for (const n of layer.getNodes()) {
      const name = elktName.get(n) ?? String(n.id)
      nodes[name] = {
        size: [n.size.x, n.size.y],
        ports: n.getPorts().map(p => ({ y: p.getPosition().y })),
      }
    }
  }
  return { layers, nodes }
}

function parseDotLayers(text) {
  const nodes = []
  for (const m of text.matchAll(/label="([^"]+)"/g)) {
    const gm = m[1].match(/^([^ ]+)\s*\((-?\d+),(\d+)\)$/)
    if (!gm) continue
    const name = gm[1].replace(/^root\./, '')
    nodes.push({ layer: +gm[2], index: +gm[3], name })
  }
  const layers = []
  for (const n of nodes.sort((a, b) => a.layer - b.layer || a.index - b.index)) {
    layers[n.layer] = layers[n.layer] ?? []
    layers[n.layer].push(n.name)
  }
  return layers
}

function parseJsonPorts(text) {
  const d = JSON.parse(text)
  const nodes = {}
  const walk = (n) => {
    const o = n.properties?.origin ?? ''
    const m = o.match(/ElkNode "([^"]+)"/)
    if (m) {
      nodes[m[1]] = {
        size: [n.width ?? 0, n.height ?? 0],
        ports: (n.ports ?? []).map(p => ({ y: p.y ?? 0 })),
      }
    }
    for (const c of n.children ?? []) walk(c)
  }
  for (const c of d.children ?? []) walk(c)
  return { nodes }
}

function cmpState(gs, js) {
  const diffs = []
  for (const [nm, gInfo] of Object.entries(gs.nodes)) {
    const jInfo = js.nodes?.[nm]
    if (!jInfo) continue
    const gp = [...gInfo.ports.map(p => p.y)].sort((a, b) => a - b).join(',')
    const jp = [...(jInfo.ports ?? []).map(p => p.y)].sort((a, b) => a - b).join(',')
    if (gp !== jp) diffs.push(nm)
  }
  return diffs
}

async function scan(file) {
  const source = readFileSync(resolve(file), 'utf8')
  const graphData = parseElkt(source)
  const g = new LGraph()
  const nodeOf = new Map()
  for (const id of graphData.nodes) {
    const n = new LNode(g)
    const p = graphData.nodeProps.get(id) ?? {}
    n.size = { x: p.width ?? 60, y: p.height ?? 30 }
    nodeOf.set(id, n)
  }
  const elktName = new Map([...nodeOf.entries()].map(([id, n]) => [n, 'N' + id]))
  for (const [s, sp, t, tp] of graphData.edges) {
    const sn = nodeOf.get(s), tn = nodeOf.get(t)
    const sp2 = (() => { const p = new LPort(); p.setNode(sn); return p })()
    const tp2 = (() => { const p = new LPort(); p.setNode(tn); return p })()
    const e = new LEdge(); e.setSource(sp2); e.setTarget(tp2)
  }
  const ggnIn = new Map()
  const ggnOut = new Map()
  const provider = new LayeredLayoutProvider()
  provider.setHooks({
    beforeModule: (name) => { if (PIPELINE.includes(name)) ggnIn.set(name, dumpState(g, elktName)) },
    afterModule: (name) => { if (PIPELINE.includes(name)) ggnOut.set(name, dumpState(g, elktName)) },
  })
  provider.layout(g)

  // Java 快照
  const dir = join(tmpdir(), 'elk-scan')
  mkdirSync(dir, { recursive: true })
  const inFile = join(dir, 'g.elk.json')
  writeFileSync(inFile, JSON.stringify(exportGraph(graphData), null, 1))
  const outDir = join(dir, 'out')
  try {
    execSync(`./scripts/elk-java-debug/run.sh ${inFile} ${outDir}`, { stdio: 'pipe', maxBuffer: 64 * 1024 * 1024 })
  } catch (e) { return { file, error: 'java' } }

  const javaFirst = new Map()
  const javaState = new Map()
  for (const f of readdirSync(outDir).sort()) {
    const m = f.match(/^(\d+)-Before_([A-Za-z]+)(?:_\d+)?\.json$/)
    if (!m || !PIPELINE.includes(m[2])) continue
    const text = readFileSync(join(outDir, f), 'utf8')
    if (text.startsWith('digraph')) {
      const known = new Set(graphData.nodes.map(n => 'N' + n))
      const layers = parseDotLayers(text).map(l => l.map(n => known.has(n) ? n : '#d'))
      if (layers.length > 0 && !javaFirst.has(m[2])) javaFirst.set(m[2], layers)
    } else {
      try { javaState.set(m[2], parseJsonPorts(text)) } catch (e) {}
    }
  }

  const forks = new Set()
  for (const mod of PIPELINE) {
    const jLayers = javaFirst.get(mod)
    const jState = javaState.get(mod)
    const gIn = ggnIn.get(mod)
    const gOut = ggnOut.get(mod)
    const known = new Set(graphData.nodes.map(n => 'N' + n))
    const norm = (ls) => ls.map(l => l.map(n => known.has(n) ? n : '#d'))
    if (jLayers && gIn && JSON.stringify(norm(gIn.layers)) !== JSON.stringify(jLayers)) forks.add(`${mod}:输入层序`)
    if (jState && gIn && cmpState(gIn, jState).length > 0) forks.add(`${mod}:输入状态`)
    if (jState && gOut && cmpState(gOut, jState).length > 0) forks.add(`${mod}:输出`)
  }
  return { file, forks: [...forks] }
}

function exportGraph(graphData) {
  const { graphProps, nodeProps, hierarchy } = graphData
  const buildElkHierarchy = (idx) => {
    const p = nodeProps.get(idx) ?? {}
    const node = { id: 'N' + idx, width: p.width ?? 60, height: p.height ?? 30 }
    const ports = p.ports ?? []
    if (ports.length > 0) {
      node.ports = ports.map(pp => ({ id: 'N' + idx + '.' + pp.id, width: pp.w ?? 8, height: pp.h ?? 8, properties: { 'port.side': pp.side ?? 'UNDEFINED', 'port.index': String(pp.index ?? 0), 'port.x': String(pp.x ?? 0), 'port.y': String(pp.y ?? 0) } }))
    }
    const kids = hierarchy.get(idx) ?? []
    if (kids.length > 0) node.children = kids.map(k => buildElkHierarchy(k))
    return node
  }
  const rootIds = graphData.nodes.filter(id => ![...hierarchy.values()].flat().includes(id))
  return {
    id: 'root',
    layoutOptions: { 'elk.direction': String(graphProps.direction ?? 'RIGHT').toUpperCase(), 'elk.randomSeed': '1' },
    children: rootIds.map(i => buildElkHierarchy(i)),
    edges: graphData.edges.map(([s, sp, t, tp], i) => ({
      id: 'e' + i,
      sources: [sp === null ? 'N' + s : 'N' + s + '.' + sp],
      targets: [tp === null ? 'N' + t : 'N' + t + '.' + tp],
    })),
  }
}

const files = process.argv.slice(2).filter(a => !a.startsWith('--'))
const limitIdx = process.argv.indexOf('--limit')
const limit = limitIdx >= 0 ? +process.argv[limitIdx + 1] : files.length

const results = []
for (const f of files.slice(0, limit)) {
  const r = await scan(f)
  results.push(r)
  const mark = r.forks.length ? '✗' : '✓'
  console.log(`[${mark}] ${f.split('/').pop()} ${r.forks.join(' | ')}`)
}

const dist = new Map()
for (const r of results) for (const fk of r.forks) dist.set(fk, (dist.get(fk) ?? 0) + 1)
console.log('\n=== 分叉模块分布 ===')
for (const [k, v] of [...dist.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`${v.toString().padStart(3)}  ${k}`)
}
