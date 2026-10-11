/**
 * jar-triage (M3 三分法工具): ggn vs elkjs vs ELK Java 0.12.0 jar 三方坐标对比.
 *
 * 用法:
 *   node scripts/jar-triage.mjs <elkt 文件> [更多 elkt 文件...]
 *   node scripts/jar-triage.mjs 'test-resources/elk-models/tests/<glob>'   (glob 展开 elkt)
 *
 * 输出每图: 每节点 ggn/elkjs/jar 坐标 + 三方归类:
 *   PASS    ggn≈elkjs≈jar (三方一致)
 *   GGN_BUG ggn≠jar (jar 为 oracle → 真 bug, 进修复队列)
 *   ELKJS_DIV ggn≈jar≠elkjs (分歧冻结候选 divergence.json)
 *   ALL_DIV 三方各不相同 (多半 harness/参数问题, 先修工具再复核)
 *   JAR_ERR jar 崩溃/无坐标 (工具待修)
 *
 * ε 容差: JAR_TOLERANCE 环境变量 (默认 1, 与测试一致).
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'
import { execSync } from 'node:child_process'
import { globSync } from 'glob'
import ELK from 'elkjs/lib/elk.bundled.js'
import { parseElkt, OPT_MAP } from './elkt2test.mjs'
import { LGraph, LNode, LPort, LEdge, LayeredLayoutProvider, createMergedPort, PortSide, PortType } from '../dist/index.mjs'

const TOL = Number(process.env.JAR_TOLERANCE ?? 1)
const files = process.argv.slice(2).flatMap(p => globSync(p))

function coerceOpt(meta, raw) {
  let v = String(raw).trim()
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
  if (meta.type === 'num') return Number(v)
  if (meta.type === 'bool') return v === 'true' || v === 'TRUE'
  return v
}
const SKIP_ELKJS = new Set(['elk.direction', 'elk.randomSeed', 'elk.hierarchyHandling', 'elk.algorithm'])
function elkjsOpts(graphProps, hierarchy) {
  const o = { 'elk.algorithm': 'layered', 'elk.direction': String(graphProps.direction ?? 'RIGHT').toUpperCase(), 'elk.randomSeed': '1', ...(hierarchy.size > 0 ? { 'elk.hierarchyHandling': 'INCLUDE_CHILDREN' } : {}) }
  for (const [k, v] of Object.entries(graphProps)) {
    const m = OPT_MAP[k]
    if (!m || SKIP_ELKJS.has(m.elkjs)) continue
    o[m.elkjs] = coerceOpt(m, v)
  }
  return o
}
function applyGgn(g, graphProps) {
  for (const [k, v] of Object.entries(graphProps)) {
    const m = OPT_MAP[k]
    if (!m) continue
    g.setProperty(m.ggn, coerceOpt(m, v))
  }
}

function buildGgn(graphData) {
  const { nodes, edges, hierarchy, graphProps, nodeProps } = graphData
  const g = new LGraph()
  const nodeOf = new Map()
  const nested = new Map()
  for (const p of hierarchy.keys()) nested.set(p, new LGraph())
  for (const id of nodes) {
    const parent = [...hierarchy.entries()].find(([, kids]) => kids.includes(id))?.[0]
    const gg = parent !== undefined ? nested.get(parent) : g
    const n = new LNode(gg)
    const p = nodeProps.get(id) ?? {}
    n.size = { x: p.width ?? 60, y: p.height ?? 30 }
    if (p.portConstraints) n.setProperty('org.eclipse.elk.portConstraints', p.portConstraints)
    for (const port of p.ports ?? []) {
      const lp = new LPort(); lp.setNode(n)
      lp.getPosition().x = port.x ?? 0; lp.getPosition().y = port.y ?? 0
      lp.size = { x: port.w ?? 8, y: port.h ?? 8 }
      if (port.side) lp.setSide(port.side)
      if (port.index != null) lp.setProperty('org.eclipse.elk.port.index', port.index)
      if ((port.labels ?? []).length) lp.setLabels(port.labels.map(l => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width ?? 0, y: l.height ?? 0 } })))
    }
    if ((p.labels ?? []).length) n.setLabels(p.labels.map(l => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width ?? 0, y: l.height ?? 0 } })))
    nodeOf.set(id, n)
  }
  for (const p of hierarchy.keys()) { nodeOf.get(p).setNestedGraph(nested.get(p)); nested.get(p).setParentNode(nodeOf.get(p)) }
  const spIdx = (nid, pid) => pid === null ? null : (nodeProps.get(nid)?.ports ?? []).findIndex(x => x.id === pid) === -1 ? null : (nodeProps.get(nid)?.ports ?? []).findIndex(x => x.id === pid)
  // mergeEdges: 共享收集端口 (ELK LGraphUtil.createPort 合并分支). 方向 → 默认侧 (RIGHT→EAST).
  const mergeEdges = graphProps.mergeEdges === true || graphProps.mergeEdges === 'true'
  const defaultSide = ({ RIGHT: PortSide.EAST, LEFT: PortSide.WEST, DOWN: PortSide.SOUTH, UP: PortSide.NORTH })[String(graphProps.direction ?? 'RIGHT').toUpperCase()] ?? PortSide.EAST
  const sideFixed = (n) => n.getProperty('org.eclipse.elk.portConstraints') === 'FIXED_SIDE'
  for (const [s, sp, t, tp] of edges) {
    const spc = sp !== null ? nodeProps.get(s)?.ports?.findIndex(x => x.id === sp) ?? -1 : -1
    const tpc = tp !== null ? nodeProps.get(t)?.ports?.findIndex(x => x.id === tp) ?? -1 : -1
    const src = nodeOf.get(s), tgt = nodeOf.get(t)
    const mkPort = (n, type, idx, declared) => idx >= 0 && idx < n.getPorts().length ? n.getPorts()[idx]
      : (mergeEdges && !sideFixed(n) ? createMergedPort(n, type, defaultSide, true, false) : (() => { const p = new LPort(); p.setNode(n); return p })())
    const spPort = mkPort(src, PortType.OUTPUT, spc, sp)
    const tpPort = mkPort(tgt, PortType.INPUT, tpc, tp)
    const e = new LEdge(); e.setSource(spPort); e.setTarget(tpPort)
  }
  if (hierarchy.size > 0) g.setProperty('org.eclipse.elk.hierarchyHandling', 'INCLUDE_CHILDREN')
  applyGgn(g, graphProps)
  return { g, nodeOf }
}

function runJar(graphData) {
  const { graphProps, hierarchy } = graphData
  const dir = mkdtempSync(join(tmpdir(), 'jar-triage-'))
  try {
    // export 同 probe.mjs cmdExport: canonical layoutOptions
    const build = (idx) => {
      const p = graphData.nodeProps.get(idx) ?? {}
      const node = { id: 'N' + idx, width: p.width ?? 60, height: p.height ?? 30 }
      if (p.portConstraints) node.layoutOptions = { 'org.eclipse.elk.portConstraints': p.portConstraints }
      const ports = p.ports ?? []
      if (ports.length) node.ports = ports.map(pp => ({ id: 'N' + idx + '.' + pp.id, width: pp.w ?? 8, height: pp.h ?? 8, x: pp.x ?? 0, y: pp.y ?? 0, labels: (pp.labels ?? []).map(l => ({ text: l.text, x: 0, y: 0, width: l.width ?? 0, height: l.height ?? 0 })), properties: { 'org.eclipse.elk.port.side': pp.side ?? 'UNDEFINED', 'org.eclipse.elk.port.index': String(pp.index ?? 0) } }))
      const kids = hierarchy.get(idx) ?? []
      if (kids.length) node.children = kids.map(k => build(k))
      return node
    }
    const rootIds = graphData.nodes.filter(id => ![...hierarchy.values()].flat().includes(id))
    const lo = {}
    for (const [k, v] of Object.entries(graphProps)) {
      const canon = OPT_MAP[k]?.ggn
      if (!canon) continue
      let sv = String(v).trim()
      if ((sv.startsWith('"') && sv.endsWith('"')) || (sv.startsWith("'") && sv.endsWith("'"))) sv = sv.slice(1, -1)
      lo[canon] = k === 'direction' ? sv.toUpperCase() : sv
    }
    lo['org.eclipse.elk.direction'] ??= String(graphProps.direction ?? 'RIGHT').toUpperCase()
    lo['org.eclipse.elk.randomSeed'] ??= '1'
    if (hierarchy.size > 0) lo['org.eclipse.elk.hierarchyHandling'] ??= 'INCLUDE_CHILDREN'
    const inFile = join(dir, 'g.elk.json')
    writeFileSync(inFile, JSON.stringify({ id: 'root', layoutOptions: lo, children: rootIds.map(build), edges: graphData.edges.map(([s, sp, t, tp], i) => ({ id: 'e' + i, sources: [sp === null ? 'N' + s : 'N' + s + '.' + sp], targets: [tp === null ? 'N' + t : 'N' + t + '.' + tp] })) }))
    const out = execSync(`ELK_JAVA_HOME=/opt/homebrew/opt/openjdk@21 bash scripts/elk-java-debug/run.sh ${inFile} ${dir}/out`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    const coords = {}
    const re = /^\s*(\S+)\s+x=([\d.-]+)\s+y=([\d.-]+)/gm
    let m
    while ((m = re.exec(out)) !== null) coords[m[1]] = { x: Number(m[2]), y: Number(m[3]) }
    return { ok: Object.keys(coords).length > 0, coords }
  } catch (e) {
    return { ok: false, error: String(e.stderr ?? e).slice(0, 300) }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const elk = new ELK()
for (const file of files) {
  const graphData = parseElkt(readFileSync(resolve(file), 'utf8'))
  const { g, nodeOf } = buildGgn(graphData)
  let ggnCrash = null
  try {
    new LayeredLayoutProvider().layout(g)
  } catch (e) {
    ggnCrash = String(e.message ?? e).slice(0, 200)
  }
  const ggnPos = new Map([...nodeOf.entries()].map(([id, n]) => ['N' + id, { x: n.position.x, y: n.position.y }]))

  // elkjs
  let elkPos = new Map()
  try {
    const buildE = (idx) => {
      const p = graphData.nodeProps.get(idx) ?? {}
      const node = { id: 'N' + idx, width: p.width ?? 60, height: p.height ?? 30 }
      if (p.portConstraints) node.layoutOptions = { 'elk.portConstraints': p.portConstraints }
      const ports = p.ports ?? []
      if (ports.length) node.ports = ports.map(pp => ({ id: 'N' + idx + '.' + pp.id, width: pp.w ?? 8, height: pp.h ?? 8, x: pp.x ?? 0, y: pp.y ?? 0, labels: (pp.labels ?? []).map(l => ({ text: l.text, x: 0, y: 0, width: l.width ?? 0, height: l.height ?? 0 })), properties: { 'port.side': pp.side ?? 'UNDEFINED', 'port.index': String(pp.index ?? 0), 'port.x': String(pp.x ?? 0), 'port.y': String(pp.y ?? 0) } }))
      const kids = graphData.hierarchy.get(idx) ?? []
      if (kids.length) node.children = kids.map(k => buildE(k))
      return node
    }
    const rootIds = graphData.nodes.filter(id => ![...graphData.hierarchy.values()].flat().includes(id))
    const res = await elk.layout({ id: 'root', layoutOptions: elkjsOpts(graphData.graphProps, graphData.hierarchy), children: rootIds.map(buildE), edges: graphData.edges.map(([s, sp, t, tp], i) => ({ id: 'e' + i, sources: [sp === null ? 'N' + s : 'N' + s + '.' + sp], targets: [tp === null ? 'N' + t : 'N' + t + '.' + tp] })) })
    const walk = (list, px, py) => { for (const c of list) { const wx = px + c.x, wy = py + c.y; elkPos.set(c.id, { x: wx, y: wy }); if (c.children) walk(c.children, wx, wy) } }
    walk(res.children ?? [], 0, 0)
  } catch (e) { elkPos = null }

  const jar = runJar(graphData)

  const near = (a, b) => a && b && Math.abs(a.x - b.x) <= TOL && Math.abs(a.y - b.y) <= TOL
  if (ggnCrash) {
    console.log(`\n===== ${file} (${graphData.nodes.length} 节点) → ②真 bug (ggn 崩溃) [ggnCrash]`)
    console.log(`    ggn crash: ${ggnCrash}`)
    continue
  }
  let ggnBug = 0, elkjsDiv = 0, allDiv = 0, pass = 0
  const lines = []
  for (const [id, gp] of ggnPos) {
    const ep = elkPos?.get(id)
    const jp = jar.ok ? jar.coords[id] : undefined
    let cls
    if (!jar.ok) cls = 'JAR_ERR'
    else if (near(gp, jp) && (!ep || near(gp, ep))) cls = 'PASS'
    else if (near(gp, jp) && ep && !near(gp, ep)) cls = 'ELKJS_DIV'
    else if (!near(gp, jp) && ep && near(ep, jp)) cls = 'GGN_BUG'
    else if (!near(gp, jp) && ep && !near(ep, jp)) cls = 'ALL_DIV'
    else if (!near(gp, jp) && !ep) cls = 'GGN_BUG(no elkjs)'
    else cls = '?'
    if (cls === 'GGN_BUG' || cls === 'GGN_BUG(no elkjs)') ggnBug++
    else if (cls === 'ELKJS_DIV') elkjsDiv++
    else if (cls === 'ALL_DIV') allDiv++
    else if (cls === 'PASS') pass++
    lines.push(`    ${id}: ggn=(${gp.x.toFixed(1)},${gp.y.toFixed(1)}) elkjs=${ep ? `(${ep.x.toFixed(1)},${ep.y.toFixed(1)})` : 'ERR'} jar=${jp ? `(${jp.x.toFixed(1)},${jp.y.toFixed(1)})` : 'ERR'} → ${cls}`)
  }
  const verdict = !jar.ok ? '③工具待修(jar 崩)' : ggnBug > 0 ? '②真 bug (ggn≠jar)' : elkjsDiv > 0 ? '①分歧冻结 (ggn≈jar, elkjs 差)' : allDiv > 0 ? '③工具待修(三方各差)' : 'PASS'
  console.log(`\n===== ${file} (${graphData.nodes.length} 节点) → ${verdict} [ggnBug=${ggnBug} elkjsDiv=${elkjsDiv} allDiv=${allDiv} pass=${pass}]`)
  if (!jar.ok) console.log(`    jar err: ${jar.error}`)
  console.log(lines.join('\n'))
}
