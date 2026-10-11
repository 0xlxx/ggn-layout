/**
 * elk-debug (layout 调试 CLI) — 单图分模块输入/输出检测 + elkjs 差分.
 *
 * 用法:
 *   node scripts/probe.mjs modules <elkt 文件>   # 逐模块指纹 (每个模块的 in/out 变化)
 *   node scripts/probe.mjs modules <file> --full # 完整指纹 (不省略)
 *   node scripts/probe.mjs modules <file> --json # JSON 输出 (machine readable)
 *   node scripts/probe.mjs diff <elkt 文件>       # elkjs 坐标差分 (节点 + 端口)
 *
 * 指纹格式 (每行一个模块, 相邻行对比即知该模块改了什么):
 *   L:<层内节点id顺序>  N:<每节点端口 id:side:x,y>  E:<边 source.node.port->target.node.port>
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { globSync } from 'glob'
import ELK from 'elkjs/lib/elk.bundled.js'
import { parseElkt, OPT_MAP } from './elkt2test.mjs'
import { LGraph, LNode, LPort, LEdge, LayeredLayoutProvider, HIERARCHY_HANDLING } from '../dist/index.mjs'

const PCC = 'org.eclipse.elk.portConstraints'
const PIX = 'org.eclipse.elk.port.index'

// ── 图指纹: 模块输入/输出的结构摘要 ──

// node.id 会被 P3/P4 重写 (层内索引), 指纹用 elkt 原始名映射 (buildGraph 时记录).
let nameOf = null

function fingerprint(graph) {
  const chunks = []
  const layers = graph.getLayers()
  const nm = (n) => nameOf?.get(n) ?? n.id
  if (layers.length) {
    chunks.push(`L:${layers.map(l => l.getNodes().map(n => nm(n)).join('|')).join('>')}`)
  }
  for (const n of graph.getAllNodes()) {
    const ps = n.getPorts().map(p =>
      `${p.id}:${p.getSide()}:${p.getPosition().x.toFixed(2)},${p.getPosition().y.toFixed(2)}`
    ).join(';')
    chunks.push(`N${nm(n)}:${n.size.x.toFixed(0)}x${n.size.y.toFixed(0)}[${ps}]`)
  }
  const edgeParts = []
  for (const n of graph.getAllNodes()) {
    for (const p of n.getPorts()) {
      for (const e of p.getOutgoingEdges()) {
        edgeParts.push(`${nm(n)}.${p.id}->${nm(e.getTarget()?.getNode())}.${e.getTarget()?.id}`)
      }
    }
  }
  if (edgeParts.length) chunks.push(`E:${edgeParts.join(' ')}`)
  return chunks.join('  ')
}

/** 两指纹间的行级差异 (用于显示模块 in/out 变化). */
function diffFingerprint(prev, curr) {
  const p = new Set(prev.split('  '))
  const c = new Set(curr.split('  '))
  const added = [...c].filter(x => !p.has(x))
  const removed = [...p].filter(x => !c.has(x))
  return { added, removed }
}

let probeIncludeChildren = process.argv.includes('--include')

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
    if (probeLabels && (p.labels ?? []).length > 0) {
      n.setLabels(p.labels.map(l => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width ?? 0, y: l.height ?? 0 } })))
    }
    nodeOf.set(id, n)
  }
  for (const p of hierarchy.keys()) {
    nodeOf.get(p).setNestedGraph(nestedGraphs.get(p))
    nestedGraphs.get(p).setParentNode(nodeOf.get(p))
  }
  for (const [s, sp, t, tp] of edges) {
    createSimpleEdge(nodeOf.get(s), nodeOf.get(t), spIdxOf(nodeProps, s, sp), spIdxOf(nodeProps, t, tp))
  }
  if (probeIncludeChildren && hierarchy.size > 0) {
    g.setProperty(HIERARCHY_HANDLING, 'INCLUDE_CHILDREN')
  }
  applyGraphPropsToGgn(g, graphProps)
  nameOf = new Map([...nodeOf.entries()].map(([id, n]) => [n, 'N' + id]))
  return { g, nodeOf, graphProps, nodeProps }
}

// 测试模板 (elkt2test) 差分测试不设置 labels (elkt2test buildElkHierarchy 也无 labels).
// probe 默认与测试一致 (无 labels); --labels 时保留.
let probeLabels = process.argv.includes('--labels')


// M0-B: 与 elkt2test 相同的 OPT_MAP 注入 (ggn 侧 + elkjs 侧), 保证 diff/java 命令参数三端一致.
function coerceOpt(meta, raw) {
  let v = String(raw).trim()
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
  if (meta.type === 'num') return Number(v)
  if (meta.type === 'bool') return v === 'true' || v === 'TRUE'
  return v
}
const SKIP_ELKJS = new Set(['elk.direction', 'elk.randomSeed', 'elk.hierarchyHandling', 'elk.algorithm'])
function elkjsLayoutOptions(graphProps, hierarchy) {
  const opts = { 'elk.algorithm': 'layered', 'elk.direction': String(graphProps.direction ?? 'RIGHT').toUpperCase(), 'elk.randomSeed': '1', ...(hierarchy.size > 0 ? { 'elk.hierarchyHandling': 'INCLUDE_CHILDREN' } : {}) }
  for (const [k, v] of Object.entries(graphProps)) {
    const m = OPT_MAP[k]
    if (!m || SKIP_ELKJS.has(m.elkjs)) continue
    opts[m.elkjs] = coerceOpt(m, v)
  }
  return opts
}
function applyGraphPropsToGgn(g, graphProps) {
  for (const [k, v] of Object.entries(graphProps)) {
    const m = OPT_MAP[k]
    if (!m) continue
    g.setProperty(m.ggn, coerceOpt(m, v))
  }
}

function createSimpleEdge(src, tgt, spIdx = null, tpIdx = null) {
  const sp = spIdx !== null && spIdx < src.getPorts().length ? src.getPorts()[spIdx]
    : (() => { const p = new LPort(); p.setNode(src); return p })()
  const tp = tpIdx !== null && tpIdx < tgt.getPorts().length ? tgt.getPorts()[tpIdx]
    : (() => { const p = new LPort(); p.setNode(tgt); return p })()
  const e = new LEdge(); e.setSource(sp); e.setTarget(tp)
  return e
}

function spIdxOf(nodeProps, nodeId, portId) {
  if (portId === null) return null
  const ports = nodeProps.get(nodeId)?.ports ?? []
  const i = ports.findIndex(p => p.id === portId)
  return i === -1 ? null : i
}

// ── 命令 1: modules — 逐模块指纹 ──

function cmdModules(file, { full, json }) {
  const source = readFileSync(resolve(file), 'utf8')
  const graphData = parseElkt(source)
  const { g } = buildGraph(graphData)

  const entries = []
  let prev = null
  const provider = new LayeredLayoutProvider()
  provider.setHooks({
    beforeModule: (name) => {
      if (prev === null) prev = fingerprint(g)
      entries.push({ phase: 'in', name, fp: prev })
    },
    afterModule: (name) => {
      const fp = fingerprint(g)
      entries.push({ phase: 'out', name, fp })
      prev = fp
    },
  })
  provider.layout(g)
  // 布局后最终指纹
  const finalFp = fingerprint(g)
  entries.push({ phase: 'final', name: 'done', fp: finalFp })

  if (json) {
    process.stdout.write(JSON.stringify(entries.map(e => ({ module: e.name, phase: e.phase, fingerprint: e.fp })), null, 1) + '\n')
    return
  }

  console.log(`===== ${file} ===== (${graphData.nodes.length} 节点 / ${graphData.edges.length} 边)`)
  let lastFp = null
  for (const e of entries) {
    if (e.phase === 'in') {
      lastFp = e.fp
      continue
    }
    if (e.phase === 'final') {
      console.log(`[done] 最终指纹`)
      if (full) console.log(`  ${e.fp}`)
      continue
    }
    if (lastFp === null) {
      console.log(`[${e.name}] 无输入指纹`)
      lastFp = e.fp
      continue
    }
    const { added, removed } = diffFingerprint(lastFp, e.fp)
    if (added.length || removed.length) {
      console.log(`[${e.name}] ${added.length} 增 / ${removed.length} 删`)
      for (const r of removed) console.log(`  - ${r}`)
      for (const a of added) console.log(`  + ${a}`)
    } else {
      console.log(`[${e.name}] 无变化`)
    }
    lastFp = e.fp
  }
}

// ── 命令 2: diff — elkjs 坐标差分 ──

async function cmdDiff(file) {
  const source = readFileSync(resolve(file), 'utf8')
  const graphData = parseElkt(source)
  const { g, nodeOf, graphProps, nodeProps } = buildGraph(graphData)

  const provider = new LayeredLayoutProvider()
  provider.layout(g)

  const rootIds = graphData.nodes.filter(id => ![...graphData.hierarchy.values()].flat().includes(id))
  const buildElkHierarchy = (idx) => {
    const p = nodeProps.get(idx) ?? {}
    const node = { id: 'N' + idx, width: p.width ?? 60, height: p.height ?? 30 }
    const ports = p.ports ?? []
    if (ports.length > 0) {
      // port.index: ELK 语义为"端口在侧内的序号" (FIXED_ORDER/FIXED_POS 用); elkt 无显式 index 时
      // 按声明顺序每侧递增, 否则 jar import 全 0 → BinaryIndexedTree.rank 越界 (compound04 崩).
      const sideCount = new Map()
      node.ports = ports.map(pp => {
        const side = pp.side ?? 'UNDEFINED'
        const idx = pp.index ?? sideCount.get(side) ?? 0
        sideCount.set(side, idx + 1)
        return { id: `N${idx}.${pp.id}`, width: pp.w ?? 8, height: pp.h ?? 8, properties: { 'port.side': side, 'port.index': String(idx), 'port.x': String(pp.x ?? 0), 'port.y': String(pp.y ?? 0) } }
      })
    }
    if ((p.labels ?? []).length > 0) {
      node.labels = p.labels.map(l => ({ text: l.text, width: l.width ?? 0, height: l.height ?? 0, properties: { 'org.eclipse.elk.position': '0 0' } }))
    }
    const kids = graphData.hierarchy.get(idx) ?? []
    if (kids.length > 0) node.children = kids.map(k => buildElkHierarchy(k))
    return node
  }
  const elk = new ELK()
  const elkRes = await elk.layout({
    id: 'root',
    layoutOptions: elkjsLayoutOptions(graphProps, graphData.hierarchy),
    children: rootIds.map(i => buildElkHierarchy(i)),
    edges: graphData.edges.map(([s, sp, t, tp], i) => ({
      id: 'e' + i,
      sources: [sp === null ? 'N' + s : `N${s}.${sp}`],
      targets: [tp === null ? 'N' + t : `N${t}.${tp}`],
    })),
  })
  const elkPos = new Map()
  const walk = (list, px, py) => {
    for (const c of list) {
      const wx = px + c.x, wy = py + c.y
      elkPos.set(c.id, { x: wx, y: wy, ports: c.ports?.map(p => ({ y: p.y })) ?? [] })
      if (c.children) walk(c.children, wx, wy)
    }
  }
  walk(elkRes.children ?? [], 0, 0)

  console.log(`===== ${file} ===== (${graphData.nodes.length} 节点 / ${graphData.edges.length} 边)`)
  let failCount = 0
  // ggn 子图节点坐标相对父节点 (与 elkjs 一致): 世界坐标 = 递归累加父偏移.
  const ggnPos = new Map()
  const walkGgn = (ids, px, py) => {
    for (const id of ids) {
      const n = nodeOf.get(id)
      const wx = px + n.position.x, wy = py + n.position.y
      ggnPos.set(id, { x: wx, y: wy })
      const kids = graphData.hierarchy.get(id) ?? []
      if (kids.length > 0) walkGgn(kids, wx, wy)
    }
  }
  const rootIds2 = graphData.nodes.filter(id => ![...graphData.hierarchy.values()].flat().includes(id))
  walkGgn(rootIds2, 0, 0)

  for (const id of graphData.nodes) {
    const gn = ggnPos.get(id)
    const el = elkPos.get('N' + id)
    if (!el || !gn) continue
    const dx = gn.x - el.x, dy = gn.y - el.y
    const fail = Math.abs(dx) > 1 || Math.abs(dy) > 1
    if (fail) failCount++
    console.log(`  N${id}: ggn=(${gn.x.toFixed(2)}, ${gn.y.toFixed(2)}) elk=(${el.x.toFixed(2)}, ${el.y.toFixed(2)}) d=(${dx.toFixed(2)}, ${dy.toFixed(2)})${fail ? ' ✗' : ''}`)
  }
  for (const id of graphData.nodes) {
    const n = nodeOf.get(id)
    const el = elkPos.get('N' + id)
    if (!el || !n.getPorts().length) continue
    const ek = el.ports.map(p => p.y.toFixed(2)).join(',')
    const gg = n.getPorts().map(p => p.getPosition().y.toFixed(2)).join(',')
    if (ek && ek !== gg) console.log(`  N${id} ports: elk=[${ek}] ggn=[${gg}]`)
  }
  console.log(`结果: ${failCount}/${graphData.nodes.length} 节点坐标超差`)
}

// ── 命令 4: java — ELK Java 快照模块级差分 (权威中间状态 vs ggn 指纹) ──
//   流程: export elkt → run.sh (JDK21) → 提取各 Before_<Module> 快照层序 → ggn 同模块对比.
//   用法: node scripts/probe.mjs java <elkt 文件> [--json]

import { execSync } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync as rf, writeFileSync as wf } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** ELK Java 管线序 (快照 slot 顺序). */
const PIPELINE = [
  'EdgeAndLayerConstraintEdgeReverser', 'GreedyCycleBreaker', 'LayerConstraintPreprocessor',
  'NetworkSimplexLayerer', 'LayerConstraintPostprocessor', 'LongEdgeSplitter', 'PortSideProcessor',
  'PortListSorter', 'LayerSweepCrossingMinimizer', 'InLayerConstraintProcessor',
  'LabelAndNodeSizeProcessor', 'InnermostNodeMarginCalculator', 'BKNodePlacer',
  'LayerSizeAndGraphHeightCalculator', 'OrthogonalEdgeRouter', 'LongEdgeJoiner',
  'EndLabelSorter', 'ReversedEdgeRestorer',
]

/** ELK Java 模块 → ggn 模块名 (只对比两边都有的关键模块). */
const MODULE_MAP = {
  GreedyCycleBreaker: 'GreedyCycleBreaker',
  NetworkSimplexLayerer: 'NetworkSimplexLayerer',
  LongEdgeSplitter: 'LongEdgeSplitter',
  PortSideProcessor: 'PortSideProcessor',
  PortListSorter: 'PortListSorter',
  LayerSweepCrossingMinimizer: 'LayerSweepCrossingMinimizer',
  LabelAndNodeSizeProcessor: 'LabelAndNodeSizeProcessor',
  BKNodePlacer: 'BKNodePlacer',
  LayerSizeAndGraphHeightCalculator: 'LayerSizeAndGraphHeightCalculator',
  OrthogonalEdgeRouter: 'OrthogonalEdgeRouter',
  LongEdgeJoiner: 'LongEdgeJoiner',
}

/** 从 ELK Java DOT 快照提取层序: "root.Nc1_n1 (0,0)" → { layer, index, name }. */
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

function cmdJava(file, { json }) {
  const source = rf(resolve(file), 'utf8')
  const graphData = parseElkt(source)
  const { g, nodeOf } = buildGraph(graphData)
  // parseElkt 的 nodes 是 elkt 节点名; export id = 'N'+名; 两侧同体系.
  const elktName = new Map([...nodeOf.entries()].map(([id, n]) => [n, 'N' + id]))

  // 1. ggn 侧: 每模块后层序 (+ --full 时完整状态: 层序/端口/尺寸).
  const full = process.argv.includes('--full')
  const ggnLayers = new Map()
  const ggnState = new Map()
  const provider = new LayeredLayoutProvider()
  provider.setHooks({
    afterModule: (name) => {
      if (process.env.GGN_BUILD_DBG) {
        if (name !== 'LongEdgeSplitter' && name !== 'PortSideProcessor' && name !== 'PortListSorter') return
        const n = nodeOf.get('c1_n2')
        if (n) {
          const inc = n.getPorts().map(p => {
            const srcs = p.getIncomingEdges().map(e => {
              const sn = e.getSource() ? e.getSource().getNode() : null
              return nameOf.get(sn) ?? (sn ? sn.id : '?')
            }).join(',')
            return `${p.getSide()}[${srcs}]`
          }).join(' ')
          console.error(`GGN AFTER ${name} Nc1_n2 ports=${inc}`)
        }
      }
      const layers = g.getLayers().map(l => l.getNodes().map(n => elktName.get(n) ?? String(n.id)))
      if (layers.length > 0 && MODULE_MAP[name]) {
        ggnLayers.set(name, layers)
        if (full) ggnState.set(name, dumpGgnState(g, elktName))
      }
    },
  })
  provider.layout(g)

  // 2. ELK Java 侧: 每模块前快照层序.
  const dir = join(tmpdir(), 'elk-java-probe')
  mkdirSync(dir, { recursive: true })
  const inFile = join(dir, 'g.elk.json')
  cmdExport(file, inFile)
  const outDir = join(dir, 'out')
  try {
    execSync(`${resolve('scripts/elk-java-debug/run.sh')} ${inFile} ${outDir}`, { stdio: 'pipe' })
  } catch (e) {
    console.error('ELK Java 运行失败:', e.stderr?.toString()?.slice(0, 500))
    process.exit(1)
  }

  // 3. 提取 Java 各模块前快照 (同名模块多次出现: 取最后一个 = 该模块最终输出).
  //    DOT 槽位含层序, JSON 槽位含端口坐标 (两者同 slot+module 配对, 组内 DOT 先 JSON 后).
  const javaLayers = new Map()
  const javaState = new Map()
  const snapGroups = new Map()
  for (const f of readdirSync(outDir).sort()) {
    const m = f.match(/^(\d+)-Before_([A-Za-z]+)(?:_\d+)?\.json$/)
    if (!m || !MODULE_MAP[m[2]]) continue
    const key = m[1] + '-' + m[2]
    const text = rf(join(outDir, f), 'utf8')
    snapGroups.set(key, (snapGroups.get(key) ?? []) + (text.startsWith('digraph') ? 'D' : 'J'))
    if (text.startsWith('digraph')) {
      const layers = parseDotLayers(text)
      if (layers.length > 0) javaLayers.set(m[2], layers)
    } else if (full) {
      javaState.set(m[2], parseJsonPorts(text))
    }
  }

  // 4. 对比: 找第一个层序分叉的模块.
  if (json) {
    process.stdout.write(JSON.stringify({ ggn: [...ggnLayers.entries()], java: [...javaLayers.entries()] }, null, 1) + '\n')
    return
  }
  console.log(`===== ${file} 模块级差分 (ggn vs ELK Java 快照) =====`)
  const modules = [...new Set(Object.values(MODULE_MAP))]
  let firstDiff = null
  for (const mod of modules) {
    const gg = ggnLayers.get(mod)
    const jv = javaLayers.get(mod)
    if (!gg || !jv) continue
    const same = JSON.stringify(gg) === JSON.stringify(jv)
    const mark = same ? '✓' : '✗'
    console.log(`  [${mark}] ${mod}`)
    if (!same && firstDiff === null) firstDiff = mod
    if (gg && jv && !same) {
      for (let i = 0; i < Math.max(gg.length, jv.length); i++) {
        const a = gg[i]?.join(',') ?? '(无)'
        const b = jv[i]?.join(',') ?? '(无)'
        if (a !== b) {
          console.log(`      层${i}: ggn=[${a}]`)
          console.log(`            java=[${b}]`)
        }
      }
    }
    if (full) {
      const gs = ggnState.get(mod)
      const js = javaState.get(mod)
      if (!gs || !js) continue
      const diffs = []
      for (const [nm, gInfo] of Object.entries(gs.nodes)) {
        const jInfo = js.nodes?.[nm]
        if (!jInfo) continue
        const gPorts = gInfo.ports.map(p => `${p.side}:${p.y.toFixed(2)}`).join(' ')
        const jPorts = (jInfo.ports ?? []).map(p => `${p.side ?? '?'}:${p.y.toFixed(2)}`).join(' ')
        const gSize = `${gInfo.size[0]}x${gInfo.size[1]}`
        const jSize = `${jInfo.size?.[0]}x${jInfo.size?.[1]}`
        const gPos = `(${gInfo.pos[0].toFixed(1)},${gInfo.pos[1].toFixed(1)})`
        const jPos = `(${jInfo.pos?.[0]?.toFixed(1)},${jInfo.pos?.[1]?.toFixed(1)})`
        const marks = []
        if (gPos !== jPos) marks.push(`坐标 ${gPos} vs ${jPos}`)
        if (gSize !== jSize) marks.push(`尺寸 ${gSize} vs ${jSize}`)
        if (gPorts !== jPorts) marks.push(`端口 [${gPorts}] vs [${jPorts}]`)
        if (marks.length) diffs.push(`      ${nm}: ${marks.join(' | ')}`)
      }
      if (diffs.length) {
        console.log(`  ── ${mod} 状态对比 ──`)
        console.log(diffs.join('\n'))
      }
    }
  }
  if (firstDiff === null) console.log('  全部一致 ✓')
  else console.log(`  → 第一个分叉模块: ${firstDiff}`)
}

/** 层序 dummy 归一化: 非原始节点 (LongEdgeSplitter 等创建的) 统一为 #d (id 因全局计数不同). */
function normalizeDummyLayers(layers, graphData) {
  const known = new Set(graphData.nodes.map(n => 'N' + n))
  return layers.map(l => l.map(n => known.has(n) ? n : '#d'))
}

/** ggn 侧完整状态 dump (层序 + 节点尺寸 + 端口位置). */
function dumpGgnState(g, elktName) {
  const nodes = {}
  for (const layer of g.getLayers()) {
    for (const n of layer.getNodes()) {
      const name = elktName.get(n) ?? String(n.id)
      nodes[name] = {
        size: [n.size.x, n.size.y],
        pos: [n.position.x, n.position.y],
        ports: n.getPorts().map(p => ({ side: p.getSide(), y: p.getPosition().y })),
      }
    }
  }
  return { nodes }
}

/** 解析 ELK Java JSON 快照的端口位置 (节点名从 properties.origin 提取). */
function parseJsonPorts(text) {
  const d = JSON.parse(text)
  const nodes = {}
  const walk = (n) => {
    const o = n.properties?.origin ?? ''
    const m = o.match(/ElkNode "([^"]+)"/)
    if (m) {
      nodes[m[1]] = {
        size: [n.width ?? 0, n.height ?? 0],
        pos: [n.x ?? 0, n.y ?? 0],
        ports: (n.ports ?? []).map(p => ({ side: p.properties?.['port.side'] ?? '?', y: p.y ?? 0 })),
      }
    }
    for (const c of n.children ?? []) walk(c)
  }
  for (const c of d.children ?? []) walk(c)
  return { nodes }
}

// ── 命令 5: module-check — 单模块输入/输出对比 (ggn beforeModule vs Java Before_Module;
//    输出 = ggn afterModule vs Java 下一模块 Before) ──

function cmpState(name, gs, js, pad = null, checkPos = false) {
  const diffs = []
  for (const [nm, gInfo] of Object.entries(gs.nodes)) {
    const jInfo = js.nodes?.[nm]
    if (!jInfo) continue
    const gPorts = [...gInfo.ports.map(p => p.y)].sort((a, b) => a - b)
    const jPorts = [...(jInfo.ports ?? []).map(p => p.y)].sort((a, b) => a - b)
    const gPortsStr = gPorts.map(v => v.toFixed(2)).join(',')
    const jPortsStr = jPorts.map(v => v.toFixed(2)).join(',')
    const gSize = `${gInfo.size[0]}x${gInfo.size[1]}`
    const jSize = `${jInfo.size?.[0]}x${jInfo.size?.[1]}`
    const marks = []
    if (gSize !== jSize) marks.push(`尺寸 ${gSize} vs ${jSize}`)
    if (gPortsStr !== jPortsStr) marks.push(`端口y [${gPortsStr}] vs [${jPortsStr}]`)
    if (checkPos && jInfo.pos) {
      // ggn 坐标未加 padding, java 已加 — 归一化后比较
      const gx = gInfo.pos[0] + (pad?.left ?? 0)
      const gy = gInfo.pos[1] + (pad?.top ?? 0)
      const jx = jInfo.pos[0] ?? 0
      const jy = jInfo.pos[1] ?? 0
      if (Math.abs(gx - jx) > 0.1 || Math.abs(gy - jy) > 0.1) {
        marks.push(`坐标 (${gx.toFixed(1)},${gy.toFixed(1)}) vs (${jx.toFixed(1)},${jy.toFixed(1)})`)
      }
    }
    if (marks.length) diffs.push(`      ${nm}: ${marks.join(' | ')}`)
  }
  return diffs
}

function cmdModuleCheck(file, module) {
  const source = rf(resolve(file), 'utf8')
  const graphData = parseElkt(source)
  const { g, nodeOf } = buildGraph(graphData)
  const elktName = new Map([...nodeOf.entries()].map(([id, n]) => [n, 'N' + id]))

  // ggn 侧: 目标模块的 before/after 状态
  let ggnIn = null
  let ggnOut = null
  let ggnInLayers = null
  let ggnOutLayers = null
  const provider = new LayeredLayoutProvider()
  provider.setHooks({
    beforeModule: (name) => {
      if (name === module || (name === 'NodeMarginCalculator' && module === 'InnermostNodeMarginCalculator')) {
        ggnIn = dumpGgnState(g, elktName)
        ggnInLayers = g.getLayers().map(l => l.getNodes().map(n => elktName.get(n) ?? '#d'))
      }
    },
    afterModule: (name) => {
      if (name === module || (name === 'NodeMarginCalculator' && module === 'InnermostNodeMarginCalculator')) {
        ggnOut = dumpGgnState(g, elktName)
        ggnOutLayers = g.getLayers().map(l => l.getNodes().map(n => elktName.get(n) ?? '#d'))
      }
    },
  })
  provider.layout(g)

  // ELK Java 侧快照
  const dir = join(tmpdir(), 'elk-java-probe')
  mkdirSync(dir, { recursive: true })
  const inFile = join(dir, 'g.elk.json')
  cmdExport(file, inFile)
  const outDir = join(dir, 'out')
  try {
    execSync(`${resolve('scripts/elk-java-debug/run.sh')} ${inFile} ${outDir}`, { stdio: 'pipe' })
  } catch (e) {
    console.error('ELK Java 运行失败:', e.stderr?.toString()?.slice(0, 500))
    process.exit(1)
  }

  // 解析快照: 每模块的层序 (DOT) + 状态 (JSON).
  // 同名模块多次出现 (LayerSweep 8/9): 输入用第一个快照, 输出用最后一个.
  const javaFirstLayers = new Map()
  const javaLastLayers = new Map()
  const javaState = new Map()
  for (const f of readdirSync(outDir).sort()) {
    const m = f.match(/^(\d+)-Before_([A-Za-z]+)(?:_\d+)?\.json$/)
    if (!m || !PIPELINE.includes(m[2])) continue
    const text = rf(join(outDir, f), 'utf8')
    if (text.startsWith('digraph')) {
      const layers = normalizeDummyLayers(parseDotLayers(text), graphData)
      if (layers.length > 0) {
        if (!javaFirstLayers.has(m[2])) javaFirstLayers.set(m[2], layers)
        javaLastLayers.set(m[2], layers)
      }
    } else {
      try { javaState.set(m[2], parseJsonPorts(text)) } catch (e) { /* 跳过损坏 JSON */ }
    }
  }

  // 输出 = 目标模块在 Java 管线中的后继模块的 Before
  const idx = PIPELINE.indexOf(module)
  const next = idx >= 0 && idx < PIPELINE.length - 1 ? PIPELINE[idx + 1] : null

  console.log(`===== ${file} [${module}] 输入/输出对比 =====`)
  // 输入: 层序 (第一个快照) + 状态
  const jInLayers = javaFirstLayers.get(module)
  const jInState = javaState.get(module)
  const layerOk = ggnInLayers && jInLayers && JSON.stringify(ggnInLayers) === JSON.stringify(jInLayers)
  console.log(`  输入层序: ${ggnInLayers && jInLayers ? (layerOk ? '✓' : '✗') : '无层序可比'}`)
  if (ggnInLayers && jInLayers && !layerOk) {
    for (let i = 0; i < Math.max(ggnInLayers.length, jInLayers.length); i++) {
      const a = ggnInLayers[i]?.join(',') ?? '(无)'
      const b = jInLayers[i]?.join(',') ?? '(无)'
      if (a !== b) console.log(`      层${i}: ggn=[${a}]`)
      console.log(`            java=[${b}]`)
    }
  }
  if (ggnIn && jInState) {
    const diffs = cmpState(module, ggnIn, jInState)
    console.log(`  输入状态: ${diffs.length === 0 ? '✓' : '✗ ' + diffs.length + ' 处差异'}`)
    for (const d of diffs) console.log(d)
  } else {
    console.log(`  输入状态: 无状态可比 (ggn=${!!ggnIn} java=${!!jInState})`)
  }
  // 输出
  const jOutState = next ? javaState.get(next) : null
  const jOutLayers = next ? javaLastLayers.get(next) : null
  if (ggnOut && jOutState) {
    const diffs = cmpState(module, ggnOut, jOutState, g.getPadding(), true)
    console.log(`  输出状态: ${diffs.length === 0 ? '✓' : '✗ ' + diffs.length + ' 处差异'}`)
    for (const d of diffs) console.log(d)
  } else {
    console.log(`  输出状态: 无状态可比 (ggn=${!!ggnOut} java=${!!jOutState} 后继=${next})`)
  }
  if (ggnOutLayers && jOutLayers) {
    const ok = JSON.stringify(ggnOutLayers) === JSON.stringify(jOutLayers)
    console.log(`  输出层序: ${ok ? '✓' : '✗'}`)
    if (!ok) {
      for (let i = 0; i < Math.max(ggnOutLayers.length, jOutLayers.length); i++) {
        const a = ggnOutLayers[i]?.join(',') ?? '(无)'
        const b = jOutLayers[i]?.join(',') ?? '(无)'
        if (a !== b) {
          console.log(`      层${i}: ggn=[${a}]`)
          console.log(`            java=[${b}]`)
        }
      }
    }
  } else {
    console.log(`  输出层序: 无层序可比 (ggn=${!!ggnOutLayers} java=${!!jOutLayers})`)
  }
}

// ── 命令 3: export — elkt → ElkGraphJson (供 ELK Java DebugMain 加载) ──
function cmdExport(file, outFile) {
  const source = readFileSync(resolve(file), 'utf8')
  const graphData = parseElkt(source)
  const { graphProps, nodeProps, hierarchy } = graphData
  const buildElkHierarchy = (idx) => {
    const p = nodeProps.get(idx) ?? {}
    const node = { id: 'N' + idx, width: p.width ?? 60, height: p.height ?? 30 }
    if (p.portConstraints) node.layoutOptions = { 'org.eclipse.elk.portConstraints': p.portConstraints }
    const ports = p.ports ?? []
    if (ports.length > 0) {
      node.ports = ports.map(pp => ({ id: 'N' + idx + '.' + pp.id, width: pp.w ?? 8, height: pp.h ?? 8, x: pp.x ?? 0, y: pp.y ?? 0, properties: { 'org.eclipse.elk.port.side': pp.side ?? 'UNDEFINED', 'org.eclipse.elk.port.index': String(pp.index ?? 0) } }))
    }
    // 测试模板 (elkt2test) 的 elkjs 输入不含 labels: export 对齐 (保持差分一致).
    const kids = hierarchy.get(idx) ?? []
    if (kids.length > 0) node.children = kids.map(k => buildElkHierarchy(k))
    return node
  }
  const rootIds = graphData.nodes.filter(id => ![...hierarchy.values()].flat().includes(id))
  // M0-B/M1: 完整 graphProps → jar (canonical org.eclipse.elk.* key; OPT_MAP.ggn 即 canonical).
  // elkt 短名 → canonical key; 与 elkt2test 生成的 ggn 注入 key 完全一致 (三端参数一致前提).
  const layoutOptions = {}
  for (const [k, v] of Object.entries(graphProps)) {
    const canon = OPT_MAP[k]?.ggn
    if (!canon) continue
    let sv = String(v).trim()
    if ((sv.startsWith('"') && sv.endsWith('"')) || (sv.startsWith("'") && sv.endsWith("'"))) sv = sv.slice(1, -1)
    layoutOptions[canon] = k === 'direction' ? sv.toUpperCase() : sv
  }
  layoutOptions['org.eclipse.elk.direction'] ??= String(graphProps.direction ?? 'RIGHT').toUpperCase()
  layoutOptions['org.eclipse.elk.randomSeed'] ??= '1'
  if (hierarchy.size > 0) layoutOptions['org.eclipse.elk.hierarchyHandling'] ??= 'INCLUDE_CHILDREN'
  const out = {
    id: 'root',
    layoutOptions,
    children: rootIds.map(i => buildElkHierarchy(i)),
    edges: graphData.edges.map(([s, sp, t, tp], i) => ({
      id: 'e' + i,
      sources: [sp === null ? 'N' + s : 'N' + s + '.' + sp],
      targets: [tp === null ? 'N' + t : 'N' + t + '.' + tp],
    })),
  }
  writeFileSync(outFile, JSON.stringify(out, null, 1) + '\n')
  console.log(`已导出 ${outFile} (${rootIds.length} 根节点 / ${out.edges.length} 边)`)
}

// ── 入口 ──

const [cmd, ...rest] = process.argv.slice(2)
const opts = { full: rest.includes('--full'), json: rest.includes('--json') }
const fileArg = rest.find(a => !a.startsWith('--'))

if (cmd === 'modules' && fileArg) {
  cmdModules(fileArg, opts)
} else if (cmd === 'diff' && fileArg) {
  cmdDiff(fileArg)
} else if (cmd === 'java' && fileArg) {
  cmdJava(fileArg, opts)
} else if (cmd === 'module-check' && fileArg) {
  cmdModuleCheck(fileArg, rest.find(a => !a.startsWith('-') && a !== fileArg))
} else if (cmd === 'export' && fileArg) {
  const outIdx = rest.indexOf('-o')
  cmdExport(fileArg, outIdx >= 0 ? rest[outIdx + 1] : fileArg.replace(/\.elkt$/, '.elk.json'))
} else {
  console.error(`用法:
  node scripts/probe.mjs modules <elkt 文件> [--full|--json]   逐模块指纹 (in/out 变化)
  node scripts/probe.mjs diff <elkt 文件>                        elkjs 坐标差分
  node scripts/probe.mjs java <elkt 文件> [--json]              模块级差分 (ggn vs ELK Java 快照)
  node scripts/probe.mjs module-check <elkt 文件> <Module>       单模块输入/输出对比
  node scripts/probe.mjs export <elkt 文件> -o <out.json>       导出 ElkGraphJson (供 ELK Java DebugMain)`)
  process.exit(1)
}
