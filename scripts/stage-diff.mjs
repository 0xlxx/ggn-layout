/**
 * stage-diff — ELK layered 阶段快照对比 CLI (二分定位 bug 所在阶段).
 *
 * 原理:
 *   - ELK Java 0.12.0 内置每 processor 前快照 (DebugMain + ElkLayered.logDebugGraph → JSON)
 *   - ggn 通过 setHooks 在每模块前/后 + 每相位 (P1/P2/P3/BK/P5/done/combine) 采样同样规范化快照
 *   - 按「相位边界」对齐对比 (jar 相位序为 SSOT), 报告首个分歧点 → 二分定位
 *
 * 用法 (bun scripts/stage-diff.mjs ...):
 *   stage-diff ggn   <elkt> [--out <dir>]          # 跑 ggn, 输出阶段快照 JSON
 *   stage-diff jar   <elkt> [--out <dir>]          # 跑 ELK Java (DebugMain), 输出规范化阶段快照 JSON
 *   stage-diff diff  <elkt> [--eps N] [--modules] [--max N] [--verbose]
 *   stage-diff list  <stages.json>                 # 列出阶段
 *
 * 快照规范化 (两边同构):
 *   { layers: [[nodeKey...]], nodes: { key: {type,x,y,w,h,ports:[{side,x,y}]} }, edges: [{src,tgt,bends}] }
 *   - key: 模型节点 id (elkt 名; jar 从 origin "ElkNode \"...\"" 解析; 嵌套 "父.子")
 *   - 坐标: canonical (jar 节点坐标减 padding; 端口原样)
 */
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from 'node:fs'
import { join, resolve, basename } from 'node:path'
import { tmpdir } from 'node:os'
import { execSync } from 'node:child_process'
import { globSync } from 'glob'
import { parseElkt, elktToElkJson, applyGraphPropsToLGraph } from './elkt2test.mjs'
import { LGraph, LNode, LPort, LEdge } from '../src/index.ts'
import { PortSide, PortType } from '../src/graph/enums.ts'
import { createMergedPort } from '../src/graph/lgraph-util-merge.ts'
import { LayeredLayoutProvider } from '../src/layered-layout-provider.ts'
import { PORT_CONSTRAINTS as PCC_KEY, PORT_INDEX as PIX_KEY } from '../src/options/layered-options.ts'

const ROOT = resolve(import.meta.dirname, '..')
const DBG = join(ROOT, 'scripts/elk-java-debug')

// ── 图构建 (与 elkt2test 生成测试同语义) ──
function mkEdgePort(node, type, mergeEdges, defaultSide) {
  if (mergeEdges && node.getProperty(PCC_KEY) !== 'FIXED_SIDE') {
    return createMergedPort(node, type, defaultSide, true, false)
  }
  const p = new LPort(); p.setNode(node)
  p.setSide(type === PortType.OUTPUT ? defaultSide : opposedSide(defaultSide))
  return p
}
function opposedSide(side) {
  switch (side) {
    case PortSide.NORTH: return PortSide.SOUTH
    case PortSide.SOUTH: return PortSide.NORTH
    case PortSide.EAST: return PortSide.WEST
    case PortSide.WEST: return PortSide.EAST
    default: return PortSide.UNDEFINED
  }
}

function buildGraph(graphData) {
  const { nodes, edges, hierarchy, graphProps, nodeProps } = graphData
  const g = new LGraph()
  const nodeOf = new Map()
  const nested = new Map()
  for (const p of hierarchy.keys()) nested.set(p, new LGraph())
  const keyOf = new Map()
  for (const id of nodes) {
    const parentIdx = [...hierarchy.entries()].find(([, kids]) => kids.includes(id))?.[0]
    const gg = parentIdx !== undefined ? nested.get(parentIdx) : g
    const n = new LNode(gg)
    const p = nodeProps.get(id) ?? {}
    n.size = { x: p.width ?? 60, y: p.height ?? 30 }
    if (p.portConstraints) n.setProperty(PCC_KEY, p.portConstraints)
    for (const port of p.ports ?? []) {
      const lp = new LPort()
      lp.setNode(n)
      lp.getPosition().x = port.x ?? 0
      lp.getPosition().y = port.y ?? 0
      lp.size = { x: port.w ?? 8, y: port.h ?? 8 }
      if (port.side) lp.setSide(port.side)
      if (port.index !== null && port.index !== undefined) lp.setProperty(PIX_KEY, port.index)
    }
    nodeOf.set(id, n)
    // key = "N"+elkt id (与 jar oracle / DebugMain origin 命名一致)
    keyOf.set(n, 'N' + id)
  }
  for (const p of hierarchy.keys()) {
    nodeOf.get(p).setNestedGraph(nested.get(p))
    nested.get(p).setParentNode(nodeOf.get(p))
  }
  const defaultSide = { RIGHT: PortSide.EAST, LEFT: PortSide.WEST, DOWN: PortSide.SOUTH, UP: PortSide.NORTH }[String(graphProps.direction ?? 'RIGHT').toUpperCase()] ?? PortSide.EAST
  const mergeEdges = graphProps.mergeEdges === true || graphProps.mergeEdges === 'true'
  for (const [s, sp, t, tp] of edges) {
    const spIdx = sp === null ? null : (nodeProps.get(s)?.ports ?? []).findIndex(pp => pp.id === sp)
    const tpIdx = tp === null ? null : (nodeProps.get(t)?.ports ?? []).findIndex(pp => pp.id === tp)
    const src = nodeOf.get(s), tgt = nodeOf.get(t)
    const spPort = spIdx !== null && spIdx < src.getPorts().length ? src.getPorts()[spIdx] : mkEdgePort(src, PortType.OUTPUT, mergeEdges, defaultSide)
    const tpPort = tpIdx !== null && tpIdx < tgt.getPorts().length ? tgt.getPorts()[tpIdx] : mkEdgePort(tgt, PortType.INPUT, mergeEdges, defaultSide)
    const e = new LEdge(); e.setSource(spPort); e.setTarget(tpPort)
  }
  applyGraphPropsToLGraph(g, graphProps)
  return { graph: g, keyOf }
}

// ── 快照规范化 ──
const r3 = (v) => Math.round(v * 1000) / 1000
function ggnSnapshot(graph, keyOf) {
  const nodeSum = (n, layerIdx) => {
    return {
      key: keyOf.get(n) ?? '?',
      type: String(n.getType()),
      layer: layerIdx ?? (n.getLayer() === null ? -1 : graph.getLayers().indexOf(n.getLayer())),
      x: r3(n.position.x), y: r3(n.position.y), w: r3(n.size.x), h: r3(n.size.y),
      ports: n.getPorts().map(p => ({ side: String(p.getSide()), x: r3(p.getPosition().x), y: r3(p.getPosition().y) })),
    }
  }
  const nodes = {}
  const emitNode = (n, layerIdx) => {
    const key = keyOf.get(n)
    if (nodes[key]) return
    const s = nodeSum(n, layerIdx)
    nodes[s.key] = s
  }
  const walk = (graph) => {
    const layerMap = new Map(graph.getLayers().map((l, i) => [l, i]))
    for (const n of graph.getLayerlessNodes()) emitNode(n, -1)
    for (const layer of graph.getLayers()) {
      for (const n of layer.getNodes()) emitNode(n, layerMap.get(layer))
    }
    for (const n of graph.getLayerlessNodes()) if (n.getNestedGraph() !== null) walk(n.getNestedGraph())
    for (const layer of graph.getLayers()) for (const n of layer.getNodes()) if (n.getNestedGraph() !== null) walk(n.getNestedGraph())
  }
  walk(graph)
  const layerKeys = graph.getLayers().map(l => l.getNodes().map(n => keyOf.get(n)))
  const seen = new Set()
  const edges = []
  const collect = (graph) => {
    const all = [...graph.getLayerlessNodes()]
    for (const l of graph.getLayers()) all.push(...l.getNodes())
    for (const n of all) {
      for (const p of n.getPorts()) {
        for (const e of p.getOutgoingEdges()) {
          if (seen.has(e)) continue
          seen.add(e)
          const s = e.getSource(), t = e.getTarget()
          const portIdx = (node, port) => node ? node.getPorts().indexOf(port) : -1
          edges.push({
            src: s && s.getNode() ? `${keyOf.get(s.getNode())}:${portIdx(s.getNode(), s)}` : 'null',
            tgt: t && t.getNode() ? `${keyOf.get(t.getNode())}:${portIdx(t.getNode(), t)}` : 'null',
            bends: e.getBendPoints().map(bp => [r3(bp.x), r3(bp.y)]),
          })
        }
      }
      if (n.getNestedGraph() !== null) collect(n.getNestedGraph())
    }
  }
  collect(graph)
  return { layerKeys, nodes, edges, graphSize: { x: r3(graph.getSize().x), y: r3(graph.getSize().y) } }
}

// ── ggn 采集 ──
function collectGgn(elktPath, dir = null) {
  const src = readFileSync(elktPath, 'utf8')
  const gd = parseElkt(src)
  if (dir) gd.graphProps.direction = dir
  const { graph, keyOf } = buildGraph(gd)
  const provider = new LayeredLayoutProvider()
  const stages = []
  const record = (kind, module, gr) => stages.push({ kind, module, snapshot: ggnSnapshot(gr, keyOf) })
  provider.setHooks({
    beforeModule: (name, gr) => record('before', name, gr),
    afterModule: (name, gr) => record('after', name, gr),
    afterPhase: (phase, gr) => record('phase', phase, gr),
  })
  provider.layout(graph)
  const groups = []
  let cur = null
  for (const st of stages) {
    if (st.kind === 'before' && st.module === 'GraphTransformer(in)') { cur = []; groups.push(cur) }
    if (cur) cur.push(st)
  }
  const grouped = groups.length > 0 ? groups : [stages]
  const combine = grouped.flat().find(st => st.kind === 'phase' && st.module === 'combine')?.snapshot ?? null
  const padding = { left: graph.getPadding().left, top: graph.getPadding().top }
  return { groups: grouped, combine, rootFinal: ggnSnapshot(graph, keyOf), padding }
}

// ── jar 采集 ──
function collectJar(elktPath, dir = null) {
  const src = readFileSync(elktPath, 'utf8')
  const gd = parseElkt(src)
  if (dir) gd.graphProps.direction = dir
  const work = mkdtempSync(join(tmpdir(), 'stage-diff-jar-'))
  const input = join(work, 'input.json')
  writeFileSync(input, JSON.stringify(elktToElkJson(gd)))
  const stagesDir = join(work, 'stages')
  mkdirSync(stagesDir, { recursive: true })
  let stdout = ''
  try {
    stdout = execSync(`"${join(DBG, 'run.sh')}" "${input}" "${stagesDir}"`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], cwd: DBG, shell: '/bin/zsh' })
  } catch (e) { stdout = e.stdout ?? '' }
  const files = globSync(join(stagesDir, '*.json'))
    .map(f => ({ f, seq: Number(basename(f).split('_').pop().replace('.json', '')) }))
    .sort((a, b) => a.seq - b.seq)
  const groups = []
  let cur = null
  for (const { f } of files) {
    const text = readFileSync(f, 'utf8').trim()
    if (!text.startsWith('{')) continue
    let d
    try { d = JSON.parse(text) } catch { continue }
    const m = basename(f).match(/^(\d+)-Before_(.+?)_\d+\.json$/)
    const slot = m ? Number(m[1]) : -1
    const module = m ? m[2] : 'Finished'
    if (slot === 0) { cur = []; groups.push(cur) }
    if (!cur) continue
    cur.push({ kind: 'before', module, slot, snapshot: jarSnapshot(d) })
  }
  // 最终 root 坐标 (DebugMain stdout "最终坐标:" 段; 相对父块, 与 ggn final 直接可比)
  const rootFinal = { layerKeys: [], nodes: {}, edges: [] }
  const finIdx = stdout.indexOf('最终坐标:')
  if (finIdx >= 0) {
    const section = stdout.slice(finIdx)
    const endIdx = section.indexOf('端口侧:')
    const block = (endIdx >= 0 ? section.slice(0, endIdx) : section).split('\n')
    for (const line of block) {
      const m = line.match(/^\s+(\S+) x=([\d.+-]+) y=([\d.+-]+) w=([\d.+-]+) h=([\d.+-]+)/)
      if (m) rootFinal.nodes[m[1]] = { key: m[1], type: 'NORMAL', layer: -1, x: r3(Number(m[2])), y: r3(Number(m[3])), w: r3(Number(m[4])), h: r3(Number(m[5])), ports: [] }
    }
  }
  return { groups, rootFinal }
}

/** 从 jar 节点 properties.origin 解析模型 id ("ElkNode \"NAME\" ...") */
function originName(c) {
  const o = c.properties?.origin
  if (typeof o === 'string') {
    const m = /ElkNode "([^"]+)"/.exec(o)
    if (m) return m[1]
  }
  const lbl = c.labels?.[0]?.text ?? ''
  const m2 = /^([^\s(]+)/.exec(lbl)
  return m2 ? m2[1] : c.id
}

function jarSnapshot(d) {
  const padding = d.properties?.['org.eclipse.elk.padding']
  let pl = 0, pt = 0
  if (typeof padding === 'string') {
    const mm = padding.match(/left=([\d.]+)/)
    const mt = padding.match(/top=([\d.]+)/)
    if (mm) pl = Number(mm[1])
    if (mt) pt = Number(mt[1])
  }
  const keyByHash = new Map()
  const portKeyByHash = new Map()
  const nodeList = []
  const walkKeys = (children) => {
    for (const c of children) {
      const key = originName(c)
      keyByHash.set(c.id, key)
      ;(c.ports ?? []).forEach((p, pi) => portKeyByHash.set(p.id, `${key}:${pi}`))
      if (c.children && c.children.length > 0) walkKeys(c.children)
    }
  }
  walkKeys(d.children ?? [])
  const nodes = {}
  const walkNodes = (children) => {
    for (const c of children) {
      const key = originName(c)
      const lbl = c.labels?.[0]?.text ?? ''
      const lm = lbl.match(/\((-?\d+),(\d+)\)/)
      const layer = lm ? Number(lm[1]) : -1
      const dummy = /\[ DUMMY: ([A-Z_]+) \]/.exec(lbl)
      nodes[key] = {
        key,
        type: dummy ? dummy[1] : 'NORMAL',
        layer,
        x: r3((c.x ?? 0) - pl), y: r3((c.y ?? 0) - pt),
        w: r3(c.width ?? 0), h: r3(c.height ?? 0),
        ports: (c.ports ?? []).map(p => ({
          side: String(p.properties?.['org.eclipse.elk.port.side'] ?? 'UNDEFINED'),
          x: r3(p.x ?? 0), y: r3(p.y ?? 0),
        })),
      }
      if (c.children && c.children.length > 0) walkNodes(c.children)
    }
  }
  walkNodes(d.children ?? [])
  const maxLayer = Math.max(-1, ...Object.values(nodes).map(n => n.layer))
  const layerKeys = []
  for (let L = 0; L <= maxLayer; L++) {
    const keys = Object.values(nodes).filter(n => n.layer === L).map(n => n.key)
    if (keys.length > 0) layerKeys.push(keys)
  }
  const edges = (d.edges ?? []).map(e => ({
    src: e.sourcePort ? portKeyByHash.get(e.sourcePort) ?? e.source : keyByHash.get(e.source) ?? e.source,
    tgt: e.targetPort ? portKeyByHash.get(e.targetPort) ?? e.target : keyByHash.get(e.target) ?? e.target,
    bends: (e.bendPoints ?? []).map(bp => [r3(bp.x), r3(bp.y)]),
  }))
  return { layerKeys, nodes, edges, graphSize: { x: r3(d.width ?? 0), y: r3(d.height ?? 0) } }
}

// ── 对比 ──
function diffSnapshots(a, b, eps, ignorePorts = false, ignoreEdges = false) {
  const diffs = []
  const eq = (x, y) => Math.abs(x - y) <= eps
  const aLayers = a.layerKeys.map(l => l.join(',')).join(' | ')
  const bLayers = b.layerKeys.map(l => l.join(',')).join(' | ')
  if (aLayers !== bLayers) diffs.push(`层结构: jar [${aLayers}] ggn [${bLayers}]`)
  const allKeys = new Set([...Object.keys(a.nodes), ...Object.keys(b.nodes)])
  for (const key of allKeys) {
    const na = a.nodes[key], nb = b.nodes[key]
    if (!na || !nb) { diffs.push(`节点 ${key}: 仅一侧存在 (jar=${!!na} ggn=${!!nb})`); continue }
    if (na.type !== nb.type) diffs.push(`节点 ${key} type: jar=${na.type} ggn=${nb.type}`)
    if (!eq(na.x, nb.x) || !eq(na.y, nb.y)) diffs.push(`节点 ${key} pos: jar=(${na.x},${na.y}) ggn=(${nb.x},${nb.y})`)
    if (!eq(na.w, nb.w) || !eq(na.h, nb.h)) diffs.push(`节点 ${key} size: jar=(${na.w},${na.h}) ggn=(${nb.w},${nb.h})`)
    if (!ignorePorts) {
      const ap = na.ports.map(p => `${p.side}@${p.x},${p.y}`).join(' ')
      const bp = nb.ports.map(p => `${p.side}@${p.x},${p.y}`).join(' ')
      if (ap !== bp) diffs.push(`节点 ${key} 端口: jar [${ap}] ggn [${bp}]`)
    }
  }
  if (a.graphSize && b.graphSize && (!eq(a.graphSize.x, b.graphSize.x) || !eq(a.graphSize.y, b.graphSize.y))) {
    diffs.push(`图尺寸: jar=(${a.graphSize.x},${a.graphSize.y}) ggn=(${b.graphSize.x},${b.graphSize.y})`)
  }
  if (!ignoreEdges) {
    const ae = JSON.stringify(a.edges.map(e => ({ src: e.src, tgt: e.tgt })))
    const be = JSON.stringify(b.edges.map(e => ({ src: e.src, tgt: e.tgt })))
    if (ae !== be) diffs.push(`边拓扑: jar ${a.edges.length} ggn ${b.edges.length}`)
    const ab = JSON.stringify(a.edges.map(e => e.bends))
    const bb = JSON.stringify(b.edges.map(e => e.bends))
    if (ab !== bb) diffs.push(`边弯点: jar ${a.edges.length} ggn ${b.edges.length}`)
  }
  return diffs
}

// jar 模块 → ggn 别名
const MODULE_ALIAS = {
  'SelfLoopPreProcessor': 'SelfLoopPreprocessor',
  'SelfLoopPostProcessor': 'SelfLoopPostprocessor',
  'InnermostNodeMarginCalculator': 'NodeMarginCalculator',
}

// 相位边界 (jar 侧锚点模块; 取 jar 顺序中第一个命中 → 该阶段快照 = 前相位结束状态)
const P2_START = ['NetworkSimplexLayerer', 'LongestPathSourceLayerer', 'LongestPathLayerer', 'InteractiveLayerer']
const P3_START = ['LayerConstraintPostprocessor']
const P4_START = ['SelfLoopPortRestorer', 'LabelDummySwitcher', 'LabelSideSelector', 'EndLabelPreprocessor',
  'InLayerConstraintProcessor', 'LabelAndNodeSizeProcessor', 'InnermostNodeMarginCalculator', 'SelfLoopRouter']
const P5_START = ['LayerSizeAndGraphHeightCalculator']

/** 构建相位检查点 (jar 序为 SSOT). 返回 [{label, jar, ggn, note}] */
function buildPhaseCheckpoints(jarStages, ggnStages) {
  const jarSnap = (module) => jarStages.find(st => st.kind === 'before' && st.module === module)?.snapshot ?? null
  const jarFinished = [...jarStages].reverse().find(st => st.kind === 'before' && st.module === 'Finished')?.snapshot
    ?? jarStages[jarStages.length - 1]?.snapshot ?? null
  const firstJar = (set) => {
    for (const st of jarStages) if (st.kind === 'before' && set.includes(st.module)) return st.snapshot
    return null
  }
  const ggnPhase = (phase) => ggnStages.find(st => st.kind === 'phase' && st.module === phase)?.snapshot ?? null

  const cps = []
  cps.push({ label: '初始(导入后/P1前)', jar: firstJar(P2_START) ?? jarSnap('GreedyCycleBreaker') ?? jarStages[0]?.snapshot, ggn: ggnPhase('P1') ?? null, note: 'import→P1' })
  cps.push({ label: 'P1 断环后', jar: firstJar(P2_START) ?? null, ggn: ggnPhase('P1') ?? null })
  cps.push({ label: 'P2 分层后', jar: firstJar(P3_START) ?? null, ggn: ggnPhase('P2') ?? null })
  cps.push({ label: 'P3 排序后', jar: firstJar(P4_START) ?? null, ggn: ggnPhase('P3') ?? null })
  cps.push({ label: 'P4 BK 后', jar: firstJar(P5_START) ?? null, ggn: ggnPhase('BK') ?? null })
  cps.push({ label: 'P5 路由后', jar: firstJar(['SelfLoopPostProcessor', 'SelfLoopPostprocessor']) ?? jarFinished, ggn: ggnPhase('P5') ?? null })
  cps.push({ label: '布局完成', jar: jarFinished, ggn: ggnPhase('done') ?? null })
  return cps
}

/** 构建逐模块检查点 (细粒度; 注意两边模块顺序差异可能产生虚假差异) */
function buildModuleCheckpoints(jarStages, ggnStages) {
  const ggnBefore = new Map()
  for (const st of ggnStages) if (st.kind === 'before' && !ggnBefore.has(st.module)) ggnBefore.set(st.module, st.snapshot)
  const cps = []
  const seen = new Set()
  for (const st of jarStages) {
    if (st.kind !== 'before' || seen.has(st.module)) continue
    seen.add(st.module)
    const g = MODULE_ALIAS[st.module] ?? st.module
    cps.push({ label: st.module, jar: st.snapshot, ggn: ggnBefore.get(g) ?? null })
  }
  return cps
}

// ── CLI ──
function parseArgs(argv) {
  const args = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--out') args.out = argv[++i]
    else if (a === '--eps') args.eps = Number(argv[++i])
    else if (a === '--max') args.max = Number(argv[++i])
    else if (a === '--verbose') args.verbose = true
    else if (a === '--modules') args.modules = true
    else if (a === '--dir') args.dir = argv[++i]
    else args._.push(a)
  }
  return args
}

const argv = process.argv.slice(2)
const args = parseArgs(argv)
const [cmd, file] = args._
const eps = args.eps ?? 2

function report(groups, opts) {
  let firstDiff = null
  const ggnRoot = groups.ggn.rootFinal ?? null
  const jarRoot = groups.jar.rootFinal ?? null
  if (ggnRoot && jarRoot) {
    const diffs = diffSnapshots(jarRoot, ggnRoot, opts.eps ?? 2, true, true)
    const mark = diffs.length === 0 ? '✓' : '✗'
    console.log(`\n=== 全局 (root) ===`)
    console.log(`  ${mark} 最终布局 (jar vs ggn)${diffs.length ? ` (${diffs.length} 差异)` : ''}`)
    if (diffs.length > 0 && firstDiff === null) firstDiff = { comp: 'root', cp: { label: '最终布局' }, diffs }
    if (opts.verbose && diffs.length > 0) for (const d of diffs.slice(0, 12)) console.log(`      ${d}`)
  }
  const ggnList = Array.isArray(groups.ggn) ? groups.ggn : groups.ggn.groups
  const jarList = Array.isArray(groups.jar) ? groups.jar : groups.jar.groups
  for (let ci = 0; ci < Math.max(ggnList.length, jarList.length); ci++) {
    const g = ggnList[ci] ?? []
    const j = jarList[ci] ?? []
    const cps = opts.modules ? buildModuleCheckpoints(j, g) : buildPhaseCheckpoints(j, g)
    console.log(`\n=== 分量 ${ci} (${cps.length} 检查点) ===`)
    for (let k = 0; k < cps.length; k++) {
      if (opts.max && k >= opts.max) break
      const cp = cps[k]
      if (!cp.jar || !cp.ggn) { console.log(`  ? ${cp.label} (缺快照)`); continue }
      const diffs = diffSnapshots(cp.jar, cp.ggn, eps)
      const mark = diffs.length === 0 ? '✓' : '✗'
      console.log(`  ${mark} ${cp.label}${diffs.length ? ` (${diffs.length} 差异)` : ''}`)
      if (diffs.length > 0 && firstDiff === null) firstDiff = { comp: ci, cp, diffs }
      if (opts.verbose && diffs.length > 0) {
        for (const d of diffs.slice(0, 10)) console.log(`      ${d}`)
        if (diffs.length > 10) console.log(`      ... 共 ${diffs.length} 条`)
      }
    }
  }
  if (firstDiff) {
    console.log(`\n★ 首个分歧: 分量 ${firstDiff.comp} @ ${firstDiff.cp.label}`)
    for (const d of firstDiff.diffs.slice(0, 12)) console.log(`  ${d}`)
    if (opts.modules) console.log('  (模块级对比, 注意两边模块顺序差异可能产生虚假差异)')
  } else {
    console.log('\n★ 所有检查点一致')
  }
}

if (cmd === 'ggn') {
  const res = collectGgn(file, args.dir)
  const out = args.out ?? '/tmp/stage-diff-ggn.json'
  writeFileSync(out, JSON.stringify({ groups: res.groups, rootFinal: res.rootFinal, combine: res.combine, padding: res.padding }, null, 1))
  console.log(`[ggn] ${res.groups.length} 分量, ${res.groups.flat().length} 阶段 → ${out}`)
} else if (cmd === 'jar') {
  const res = collectJar(file, args.dir)
  const out = args.out ?? '/tmp/stage-diff-jar.json'
  writeFileSync(out, JSON.stringify({ groups: res.groups, rootFinal: res.rootFinal }, null, 1))
  console.log(`[jar] ${res.groups.length} 分量, ${res.groups.flat().length} 阶段 → ${out}`)
} else if (cmd === 'diff') {
  report({ ggn: collectGgn(file, args.dir), jar: collectJar(file, args.dir) }, args)
} else if (cmd === 'list') {
  const data = JSON.parse(readFileSync(file, 'utf8'))
  const groups = Array.isArray(data) ? data : data.groups
  groups.forEach((g, ci) => {
    console.log(`--- 分量 ${ci} (${g.length} 阶段) ---`)
    for (const st of g) console.log(`  ${st.kind} ${st.module}`)
  })
} else {
  console.log('用法见文件头注释')
  process.exit(1)
}
