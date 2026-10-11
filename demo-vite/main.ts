/// <reference types="vite/client" />
/**
 * layout 浏览器演示 (Vite).
 *
 * 两个板块:
 *  1. 增量布局 Playground — 编辑小图 (加/删节点), 用上一轮布局坐标做增量重布局
 *     (INTERACTIVE 分层/断环 + semi-interactive 交叉最小化), 对比「全量布局」的总位移.
 *  2. 示例图库 — 真实语料 + 各布局算法, 支持与 elkjs 逐坐标对照.
 *
 * 修改 layout src 触发 HMR 热更新.
 */
import { layoutElkJson, type ElkNode, type ElkEdge } from '../src/public.ts'
import { createLayoutWorker, type LayoutWorkerClient } from '../src/api/worker.js'
import ELK from 'elkjs/lib/elk.bundled.js'
import type { ElkNode as ElkjsNode } from 'elkjs/lib/elk-api.js'
// Vite 把 src/layout-worker.ts 打包为独立 worker 模块 (vite/client 声明 *?worker)
import LayoutWorkerCtor from '../src/layout-worker.ts?worker'

// ═══════════════════════ 1. 增量布局 Playground ═══════════════════════

/** 交互式增量布局选项组合 (ELK interactive 三件套 + 输出 layer/positionId). */
const INCREMENTAL_OPTS: Record<string, string> = {
  'org.eclipse.elk.layered.layering.strategy': 'INTERACTIVE',
  'org.eclipse.elk.layered.cycleBreaking.strategy': 'INTERACTIVE',
  'org.eclipse.elk.layered.crossingMinimization.semiInteractive': 'true',
  'org.eclipse.elk.interactiveLayout': 'true',
}

const NODE_W = 88
const NODE_H = 40

/** 初始流水线: build → test → deploy, lint 汇入 test. */
const INITIAL_GRAPH: ElkNode = {
  id: 'pipe',
  children: [
    { id: 'build', width: NODE_W, height: NODE_H },
    { id: 'test', width: NODE_W, height: NODE_H },
    { id: 'deploy', width: NODE_W, height: NODE_H },
    { id: 'lint', width: NODE_W, height: NODE_H },
  ],
  edges: [
    { id: 'e1', sources: ['build'], targets: ['test'] },
    { id: 'e2', sources: ['test'], targets: ['deploy'] },
    { id: 'e3', sources: ['lint'], targets: ['test'] },
  ],
}

/** 当前编辑中的图 (不含坐标; 布局时按需注入上一轮坐标). */
let liveGraph: ElkNode = structuredClone(INITIAL_GRAPH)
/** 上一轮布局输出坐标 (nodeId → 全局 x/y). */
let lastPos = new Map<string, { x: number; y: number }>()
/** 新节点首次放置位置 (上一轮坐标里没有它们). */
let pendingPos = new Map<string, { x: number; y: number }>()
/** 本轮新增 (可删除) 的节点. */
const addedNodes: string[] = []
let addedCount = 0
let lastIncMove = NaN
let lastFullMove = NaN

function graphSize(): { nodes: number; edges: number } {
  return { nodes: (liveGraph.children ?? []).length, edges: (liveGraph.edges ?? []).length }
}

/** 新增节点: 挂到流水线末端之后, 放在画布最右侧. */
function addNode(): void {
  const id = `n${++addedCount}`
  const parent = (liveGraph.children ?? [])[liveGraph.children!.length - 1]!
  liveGraph.children!.push({ id, width: NODE_W, height: NODE_H })
  liveGraph.edges!.push({ id: `e-${id}`, sources: [parent.id], targets: [id] })
  addedNodes.push(id)
  const maxX = [...lastPos.values()].reduce((m, p) => Math.max(m, p.x + NODE_W), 0)
  pendingPos.set(id, { x: maxX + 60, y: 0 })
}

/** 删除最近新增的节点 (初始 4 个节点不可删). */
function removeNode(): void {
  const id = addedNodes.pop()
  if (id === undefined) return
  pendingPos.delete(id)
  liveGraph.children = liveGraph.children!.filter((c) => c.id !== id)
  liveGraph.edges = liveGraph.edges!.filter((e) => !(e.sources ?? []).includes(id) && !(e.targets ?? []).includes(id))
}

/** 布局执行引擎: 主线程同步 (layoutElkJson) 或 worker 异步 (LayoutWorkerClient). */
let useWorker = false
let workerClient: LayoutWorkerClient | null = null
/** 渲染代次: 切换引擎/操作时递增, 旧异步结果落地前比对丢弃 (防竞态覆盖). */
let renderToken = 0

function layoutClient(): LayoutWorkerClient {
  workerClient ??= createLayoutWorker(() => new LayoutWorkerCtor())
  return workerClient
}

/** 全量 (默认 NETWORK_SIMPLEX) 或增量 (INTERACTIVE 三件套) 布局, 返回输出与位移. */
async function runLiveLayout(full: boolean): Promise<{ out: ElkNode; move: number; ms: number }> {
  const t0 = performance.now()
  const input = structuredClone(liveGraph)
  const prev = new Map(lastPos)
  if (full) {
    // 全量: 清掉坐标与节点级选项 (默认策略重排).
    for (const c of input.children ?? []) {
      delete c.x
      delete c.y
      delete c.layoutOptions
    }
  } else {
    // 增量: 注入上一轮输出坐标 (x/y 种子 LNode.position) + org.eclipse.elk.position
    // (semi-interactive 交叉最小化按它保持层内序).
    for (const c of input.children ?? []) {
      const p = pendingPos.get(c.id) ?? prev.get(c.id)
      if (!p) continue
      c.x = p.x
      c.y = p.y
      c.layoutOptions = { ...(c.layoutOptions ?? {}), 'org.eclipse.elk.position': `(${p.x}, ${p.y})` }
    }
  }
  const layoutOptions = full ? {} : INCREMENTAL_OPTS
  const out = useWorker
    ? await layoutClient().layout(input, { layoutOptions })
    : layoutElkJson(input, { layoutOptions })
  const ms = performance.now() - t0

  // 位移: 只统计上一轮已存在的节点 (新节点无历史).
  let move = 0
  for (const c of out.children ?? []) {
    const p = prev.get(c.id)
    if (p) move += Math.hypot((c.x ?? 0) - p.x, (c.y ?? 0) - p.y)
  }
  lastPos = new Map((out.children ?? []).map((c) => [c.id, { x: c.x ?? 0, y: c.y ?? 0 }]))
  pendingPos.clear()
  return { out, move, ms }
}

async function renderIncremental(): Promise<void> {
  const tok = ++renderToken
  const prevGhost = new Map(lastPos)
  const { out, move, ms } = await runLiveLayout(false)
  if (tok !== renderToken) return // 期间被更新的操作取代 → 丢弃过期结果
  lastIncMove = move
  const size = graphSize()
  incStage.innerHTML = toSvg(flattenElkJson(out), { ghost: prevGhost, added: new Set(addedNodes) })
  const fullMove = Number.isFinite(lastFullMove) ? lastFullMove.toFixed(0) : '—'
  const color = Number.isFinite(lastFullMove) && move <= lastFullMove * 0.5 ? 'ok' : 'warn'
  incMetrics.innerHTML =
    `节点 <b>${size.nodes}</b> · 边 <b>${size.edges}</b> · 耗时 <b>${ms.toFixed(1)} ms</b>` +
    ` · 引擎 <b>${useWorker ? 'worker' : '主线程'}</b>` +
    ` · 增量位移 <b class="${color}">${move.toFixed(0)} px</b>` +
    ` · 全量位移 <b>${fullMove} px</b>`
}

async function renderFull(): Promise<void> {
  const tok = ++renderToken
  const prevGhost = new Map(lastPos)
  const { out, move, ms } = await runLiveLayout(true)
  if (tok !== renderToken) return
  lastFullMove = move
  const size = graphSize()
  incStage.innerHTML = toSvg(flattenElkJson(out), { ghost: prevGhost, added: new Set(addedNodes) })
  incMetrics.innerHTML =
    `节点 <b>${size.nodes}</b> · 边 <b>${size.edges}</b> · 耗时 <b>${ms.toFixed(1)} ms</b>` +
    ` · 引擎 <b>${useWorker ? 'worker' : '主线程'}</b>` +
    ` · 增量位移 <b>${Number.isFinite(lastIncMove) ? lastIncMove.toFixed(0) : '—'} px</b>` +
    ` · 全量位移 <b class="warn">${move.toFixed(0)} px</b>`
}

// ═══════════════════════ 2. 示例图库 ═══════════════════════

import hierarchicalEdges from './data/examples_hierarchy_hierarchicalEdges.json'
import direction from './data/examples_general_direction.json'
import mixingDirection from './data/examples_general_mixingDirection.json'
import blindCommunication from './data/ptolemy_hierarchical_pn_blindcommunication_BlindCommunication.json'
import carTracking from './data/ptolemy_flattened_aspect_cartrackingattackmodeling_CarTrackingAttackModeling.json'
import intersections from './data/ptolemy_flattened_wireless_intersections_Intersections.json'
import optimizationAdvisor from './data/ptolemy_hierarchical_ptango_optimizationadvisor_OptimizationAdvisor.json'
import counterMachine from './data/ptolemy_flattened_pn_countermachine_CounterMachine.json'
import robotArm from './data/ptolemy_hierarchical_gr_robotarm_RobotArm.json'
import pickStates from './data/ptolemy_flattened_dt_pickstates_pickstates.json'
import starmac from './data/ptolemy_hierarchical_continuous_starmac_Starmac.json'
import printingPress from './data/ptolemy_flattened_ptides_printingpress_PrintingPress.json'
import algsBox from './data/algs_box.json'
import algsFixed from './data/algs_fixed.json'
import algsRandom from './data/algs_random.json'
import algsStress from './data/algs_stress.json'
import algsForce from './data/algs_force.json'
import algsRectpacking from './data/algs_rectpacking.json'
import algsTopdown from './data/algs_topdown.json'
import algsSpore from './data/algs_spore.json'
import algsRadial from './data/algs_radial.json'
import algsVertiflex from './data/algs_vertiflex.json'
import algsDisco from './data/algs_disco.json'
import algsMrtree from './data/algs_mrtree.json'

const GRAPHS = [
  { key: 'hierarchicalEdges', title: 'Hierarchical Edges', sub: '层级嵌套 · INCLUDE_CHILDREN', data: hierarchicalEdges },
  { key: 'direction', title: 'Direction', sub: '布局方向 · RIGHT', data: direction },
  { key: 'mixingDirection', title: 'Mixing Direction', sub: '子块独立朝向', data: mixingDirection },
  { key: 'blindCommunication', title: 'Blind Communication', sub: 'realworld · 51 节点', data: blindCommunication },
  { key: 'carTracking', title: 'Car Tracking', sub: 'realworld · 50 节点', data: carTracking },
  { key: 'intersections', title: 'Intersections', sub: 'realworld · 220 节点', data: intersections },
  { key: 'optimizationAdvisor', title: 'Optimization Advisor', sub: 'realworld · 105 节点', data: optimizationAdvisor },
  { key: 'counterMachine', title: 'Counter Machine', sub: 'realworld · 118 节点', data: counterMachine },
  { key: 'robotArm', title: 'Robot Arm', sub: 'realworld · 153 节点', data: robotArm },
  { key: 'pickStates', title: 'Pick States', sub: 'realworld · 175 节点', data: pickStates },
  { key: 'starmac', title: 'Starmac', sub: 'realworld · 271 节点', data: starmac },
  { key: 'printingPress', title: 'Printing Press', sub: 'realworld · 302 节点', data: printingPress },
  { key: 'algsBox', title: 'Box', sub: '简单装箱', data: algsBox },
  { key: 'algsFixed', title: 'Fixed', sub: '保持输入坐标', data: algsFixed },
  { key: 'algsRandom', title: 'Random', sub: '随机散布', data: algsRandom },
  { key: 'algsStress', title: 'Stress', sub: '应力主化力导向', data: algsStress },
  { key: 'algsForce', title: 'Force (FR)', sub: 'Fruchterman-Reingold', data: algsForce },
  { key: 'algsRectpacking', title: 'Rect Packing', sub: '矩形装箱', data: algsRectpacking },
  { key: 'algsTopdown', title: 'Topdown Packing', sub: '自顶向下装箱', data: algsTopdown },
  { key: 'algsSpore', title: 'Spore', sub: '重叠移除', data: algsSpore },
  { key: 'algsRadial', title: 'Radial', sub: '径向树', data: algsRadial },
  { key: 'algsVertiflex', title: 'VertiFlex', sub: '垂直弹性', data: algsVertiflex },
  { key: 'algsDisco', title: 'DisCo', sub: '连通分量打包', data: algsDisco },
  { key: 'algsMrtree', title: 'MrTree', sub: '多叉树 (DOWN)', data: algsMrtree },
] as const

const DIRECTIONS = ['RIGHT', 'LEFT', 'DOWN', 'UP'] as const
type Dir = (typeof DIRECTIONS)[number]

let current = GRAPHS.find((g) => g.key === 'intersections') ?? GRAPHS[0]
let currentDir: Dir = 'RIGHT'
let engine: 'layout' | 'elkjs' | 'compare' | 'worker' = 'layout'
/** 主线程引擎最近一次布局耗时 (worker 引擎模式下做对比展示). */
let mainThreadMs = NaN
/** gallery 渲染代次: 切换图/方向/引擎时递增, 丢弃过期异步结果. */
let galToken = 0
const TOLERANCE = 1

// ═══════════════════════ 共享: ELK JSON 拍平 + 渲染 ═══════════════════════

interface FlatNode {
  id: string
  x: number
  y: number
  width: number
  height: number
  isCompound: boolean
}
interface FlatEdge {
  key: string
  start: { x: number; y: number }
  end: { x: number; y: number }
  points: { x: number; y: number }[]
}
interface FlatResult {
  nodes: FlatNode[]
  edges: FlatEdge[]
}

/** 库 org.eclipse.elk.json.shapeCoords/edgeCoords=ROOT 已输出全局坐标 → 只拍平. */
function flattenElkJson(res: ElkNode): FlatResult {
  const nodes: FlatNode[] = []
  const edgeItems: ElkEdge[] = []
  const walk = (list?: ElkNode[]): void => {
    for (const c of list ?? []) {
      nodes.push({ id: c.id, x: c.x ?? 0, y: c.y ?? 0, width: c.width ?? 0, height: c.height ?? 0, isCompound: (c.children?.length ?? 0) > 0 })
      for (const e of c.edges ?? []) edgeItems.push(e)
      walk(c.children)
    }
  }
  walk(res.children)
  for (const e of res.edges ?? []) edgeItems.push(e)
  const edges: FlatEdge[] = []
  for (const e of edgeItems) {
    const s = e.sections?.[0]
    if (!s?.startPoint || !s?.endPoint) continue
    edges.push({
      key: `${String(e.sources?.[0] ?? '')} → ${String(e.targets?.[0] ?? '')}`,
      start: s.startPoint,
      end: s.endPoint,
      points: (s.bendPoints ?? []).filter((bp) => Number.isFinite(bp.x) && Number.isFinite(bp.y)),
    })
  }
  return { nodes, edges }
}

/** 库内坐标模式: ROOT = 节点/边直接输出全局坐标. */
const ROOT_COORDS = { 'org.eclipse.elk.json.shapeCoords': 'ROOT', 'org.eclipse.elk.json.edgeCoords': 'ROOT' }

/** layout (本库) 布局: 输出标准 ELK JSON. 深拷贝防止任一引擎原地写回共享语料. */
function runElkLayout(parsed: ElkNode): FlatResult {
  return flattenElkJson(layoutElkJson(structuredClone(parsed), { direction: currentDir, layoutOptions: ROOT_COORDS }))
}

/** elkjs (oracle) 布局. */
async function runElkjs(parsed: ElkNode): Promise<FlatResult> {
  // 根 layoutOptions 前缀改写 org.eclipse.elk.* → elk.* (elkjs 约定); 节点级 org.* 选项
  // elkjs 0.12.0 原生识别. ★ 必须深拷贝: elkjs.layout 原地写回 children x/y 与 edges sections,
  // 污染共享语料后二次渲染输出相对坐标 bendPoints → 错位斜线 (Intersections LEFT 实证).
  const elk = new ELK()
  const layoutOptions: Record<string, string> = {}
  for (const [k, v] of Object.entries(parsed.layoutOptions ?? {})) {
    layoutOptions[k.replace(/^org\.eclipse\.elk\.layered\./, 'elk.layered.').replace(/^org\.eclipse\.elk\./, 'elk.')] = String(v)
  }
  layoutOptions['elk.direction'] = currentDir
  layoutOptions['elk.json.shapeCoords'] = 'ROOT'
  layoutOptions['elk.json.edgeCoords'] = 'ROOT'
  // ★ elkjs 合并语义: graph 自带 layoutOptions 优先于 options.layoutOptions (实测:
  // graph 自带 elk.direction=RIGHT + options DOWN → 仍水平排). 方向必须写进传入的
  // graph 副本, 覆盖自带值 (examples_general_direction.json 自带 org.eclipse.elk.direction).
  const res = await elk.layout(
    { ...structuredClone(parsed), layoutOptions: { ...layoutOptions } } as unknown as ElkjsNode,
    { layoutOptions },
  )
  return flattenElkJson(res as unknown as ElkNode)
}

// ── SVG 渲染 ──

const PALETTE = {
  layout: { node: '#eef2ff', nodeStroke: '#6366f1', edge: '#a5b4fc', compound: '#fef9c3', compoundStroke: '#ca8a04' },
  elkjs: { node: '#ecfdf5', nodeStroke: '#059669', edge: '#6ee7b7', compound: '#f0fdfa', compoundStroke: '#0d9488' },
}

interface SvgOpts {
  pad?: number
  pal?: typeof PALETTE.layout
  ghost?: Map<string, { x: number; y: number }>
  added?: Set<string>
}

function toSvg(data: FlatResult, opts: SvgOpts = {}): string {
  const pad = opts.pad ?? 40
  const pal = opts.pal ?? PALETTE.layout
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const n of data.nodes) {
    minX = Math.min(minX, n.x); minY = Math.min(minY, n.y)
    maxX = Math.max(maxX, n.x + n.width); maxY = Math.max(maxY, n.y + n.height)
  }
  for (const e of data.edges) {
    for (const pt of [e.start, e.end, ...e.points]) {
      minX = Math.min(minX, pt.x); minY = Math.min(minY, pt.y)
      maxX = Math.max(maxX, pt.x); maxY = Math.max(maxY, pt.y)
    }
  }
  for (const p of opts.ghost?.values() ?? []) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x + NODE_W); maxY = Math.max(maxY, p.y + NODE_H)
  }
  const W = Math.max(maxX - minX + pad * 2, 60)
  const H = Math.max(maxY - minY + pad * 2, 60)
  const tx = (x: number): number => x - minX + pad
  const ty = (y: number): number => y - minY + pad
  const parts: string[] = []
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="system-ui, sans-serif">`)

  // 上一轮位置 ghost (虚线) + 位移连线
  for (const n of data.nodes) {
    const g = opts.ghost?.get(n.id)
    if (!g) continue
    const dx = Math.hypot(g.x - n.x, g.y - n.y)
    if (dx < 1) continue
    parts.push(`<rect x="${tx(g.x)}" y="${ty(g.y)}" width="${n.width}" height="${n.height}" rx="6" fill="none" stroke="#d4d4d8" stroke-width="1" stroke-dasharray="3 3"/>`)
    parts.push(`<line x1="${tx(g.x + n.width / 2)}" y1="${ty(g.y + n.height / 2)}" x2="${tx(n.x + n.width / 2)}" y2="${ty(n.y + n.height / 2)}" stroke="#e4e4e7" stroke-width="1"/>`)
  }
  // 边
  for (const e of data.edges) {
    const pts = [e.start, ...e.points, e.end].map((p) => `${tx(p.x).toFixed(1)},${ty(p.y).toFixed(1)}`).join(' ')
    parts.push(`<polyline points="${pts}" fill="none" stroke="${pal.edge}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>`)
    const last = e.points.length > 0 ? e.points[e.points.length - 1]! : e.start
    const ang = Math.atan2(e.end.y - last.y, e.end.x - last.x)
    const L = 8, a = 0.5
    const ax = tx(e.end.x), ay = ty(e.end.y)
    parts.push(`<polyline points="${(ax - L * Math.cos(ang - a)).toFixed(1)},${(ay - L * Math.sin(ang - a)).toFixed(1)} ${ax.toFixed(1)},${ay.toFixed(1)} ${(ax - L * Math.cos(ang + a)).toFixed(1)},${(ay - L * Math.sin(ang + a)).toFixed(1)}" fill="none" stroke="${pal.edge}" stroke-width="1.5" stroke-linecap="round"/>`)
  }
  // 节点
  for (const n of data.nodes) {
    const x = tx(n.x), y = ty(n.y)
    const isAdded = opts.added?.has(n.id) ?? false
    const fill = n.isCompound ? pal.compound : isAdded ? '#fff7ed' : pal.node
    const stroke = n.isCompound ? pal.compoundStroke : isAdded ? '#f97316' : pal.nodeStroke
    parts.push(`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${n.width.toFixed(1)}" height="${n.height.toFixed(1)}" rx="6" fill="${fill}" stroke="${stroke}" stroke-width="${isAdded ? 1.5 : 1}"/>`)
    const label = String(n.id)
    const maxChars = Math.max(2, Math.floor(n.width / 7))
    const short = label.length > maxChars ? label.slice(0, Math.max(1, maxChars - 1)) + '…' : label
    parts.push(`<text x="${(x + n.width / 2).toFixed(1)}" y="${(y + n.height / 2 + 3.5).toFixed(1)}" text-anchor="middle" font-size="10.5" fill="#27272a">${short}</text>`)
  }
  parts.push('</svg>')
  return parts.join('\n')
}

/** 并排对照: 左 layout (蓝), 右 elkjs (绿). */
function toCompareSvg(ggn: FlatResult, elk: FlatResult): string {
  const l = toSvg(ggn, { pad: 20, pal: PALETTE.layout })
  const r = toSvg(elk, { pad: 20, pal: PALETTE.elkjs })
  return `<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
  <div><div style="font:11px ui-monospace,monospace;color:#6366f1;padding:2px 4px">layout</div>${l}</div>
  <div><div style="font:11px ui-monospace,monospace;color:#059669;padding:2px 4px">elkjs</div>${r}</div>
</div>`
}

// ── 差异 ──

function diffNodes(ggn: FlatNode[], elk: FlatNode[], tolerance: number) {
  const elkById = new Map(elk.map((n) => [n.id, n]))
  const rows = ggn
    .map((g) => {
      const e = elkById.get(g.id)
      if (!e) return null
      const dist = Math.hypot(g.x - e.x, g.y - e.y)
      return { id: g.id, dist, pass: dist <= tolerance }
    })
    .filter(Boolean) as { id: string; dist: number; pass: boolean }[]
  const passed = rows.filter((r) => r.pass).length
  const maxDist = rows.length ? Math.max(...rows.map((r) => r.dist)) : 0
  return { rows, passed, total: rows.length, maxDist }
}

function diffEdges(ggnEdges: FlatEdge[], elkEdges: FlatEdge[], tolerance: number) {
  const elkByKey = new Map(elkEdges.map((e) => [e.key, e]))
  const rows = ggnEdges
    .map((g) => {
      const e = elkByKey.get(g.key)
      if (!e) return null
      const segs = Math.max(g.points.length, e.points.length)
      let maxDist = 0
      for (let i = 0; i < segs; i++) {
        const a = i < g.points.length ? g.points[i]! : g.end
        const b = i < e.points.length ? e.points[i]! : e.end
        maxDist = Math.max(maxDist, Math.hypot(a.x - b.x, a.y - b.y))
      }
      maxDist = Math.max(maxDist, Math.hypot(g.start.x - e.start.x, g.start.y - e.start.y), Math.hypot(g.end.x - e.end.x, g.end.y - e.end.y))
      return { key: g.key, maxDist, pass: maxDist <= tolerance }
    })
    .filter(Boolean) as { key: string; maxDist: number; pass: boolean }[]
  const passed = rows.filter((r) => r.pass).length
  const maxDist = rows.length ? Math.max(...rows.map((r) => r.maxDist)) : 0
  return { rows, passed, total: rows.length, maxDist }
}

// ── 图库渲染 ──

/** rAF 帧计数器: 布局期间主线程是否被阻塞的可视化证明 (worker 布局时帧数持续累加). */
let frameCount = 0
let rafId = 0
function startFrameCounter(): void {
  frameCount = 0
  const tick = (): void => {
    frameCount++
    rafId = requestAnimationFrame(tick)
  }
  rafId = requestAnimationFrame(tick)
}
function stopFrameCounter(): void {
  cancelAnimationFrame(rafId)
}

async function renderGallery(): Promise<void> {
  const tok = ++galToken
  if (engine === 'worker') {
    // Worker 引擎: 布局在后台线程执行, 主线程不阻塞 — 用帧计数演示.
    startFrameCounter()
    const t0 = performance.now()
    const out = await layoutClient().layout(structuredClone(current.data as ElkNode), {
      direction: currentDir,
      layoutOptions: ROOT_COORDS,
    })
    const ms = performance.now() - t0
    stopFrameCounter()
    if (tok !== galToken) return
    const ggn = flattenElkJson(out)
    galStage.innerHTML = toSvg(ggn)
    const mainCmp = Number.isFinite(mainThreadMs)
      ? ` · 主线程 <b>${mainThreadMs.toFixed(1)} ms</b>`
      : ''
    galMetrics.innerHTML =
      `节点 <b>${ggn.nodes.length}</b> · 边 <b>${ggn.edges.length}</b>` +
      ` · Worker 耗时 <b>${ms.toFixed(1)} ms</b>${mainCmp}` +
      ` · 布局期间主线程渲染 <b class="ok">${frameCount} 帧</b> (UI 不阻塞)`
    return
  }

  const t0 = performance.now()
  startFrameCounter()
  const ggn = runElkLayout(current.data as ElkNode)
  const ms = performance.now() - t0
  stopFrameCounter()
  if (tok !== galToken) return
  if (engine === 'layout') mainThreadMs = ms

  if (engine === 'elkjs') {
    const elkRes = await runElkjs(current.data as ElkNode)
    if (tok !== galToken) return
    galStage.innerHTML = toSvg(elkRes, { pal: PALETTE.elkjs })
    galMetrics.innerHTML = `节点 <b>${elkRes.nodes.length}</b> · 边 <b>${elkRes.edges.length}</b> · 耗时 <b>${ms.toFixed(1)} ms</b> · <span class="ok">elkjs 单独渲染</span>`
    return
  }
  if (engine === 'compare') {
    const elkRes = await runElkjs(current.data as ElkNode)
    if (tok !== galToken) return
    const d = diffNodes(ggn.nodes, elkRes.nodes, TOLERANCE)
    const de = diffEdges(ggn.edges, elkRes.edges, TOLERANCE)
    galStage.innerHTML = toCompareSvg(ggn, elkRes)
    const ok = d.passed === d.total && de.passed === de.total
    galMetrics.innerHTML = `节点 <b>${d.total}</b> · 边 <b>${ggn.edges.length}</b> · 耗时 <b>${ms.toFixed(1)} ms</b> · 对照节点 <b class="${ok ? 'ok' : 'warn'}">${d.passed}/${d.total}</b> · 边路由 <b class="${ok ? 'ok' : 'warn'}">${de.passed}/${de.total}</b> · 最大 Δ <b>${d.maxDist.toFixed(1)} px</b>`
    return
  }
  galStage.innerHTML = toSvg(ggn)
  galMetrics.innerHTML =
    `节点 <b>${ggn.nodes.length}</b> · 边 <b>${ggn.edges.length}</b> · 耗时 <b>${ms.toFixed(1)} ms</b>` +
    ` · 布局期间主线程渲染 <b class="warn">${frameCount} 帧</b> (同步阻塞)`
}

// ═══════════════════════ 页面装配 ═══════════════════════

const incStage = document.getElementById('inc-stage') as HTMLDivElement
const incMetrics = document.getElementById('inc-metrics') as HTMLDivElement
const galStage = document.getElementById('gal-stage') as HTMLDivElement
const galMetrics = document.getElementById('gal-metrics') as HTMLDivElement
const graphList = document.getElementById('graph-list') as HTMLElement

document.getElementById('btn-add')?.addEventListener('click', () => { addNode(); void renderIncremental() })
document.getElementById('btn-del')?.addEventListener('click', () => { removeNode(); void renderIncremental() })
document.getElementById('btn-inc')?.addEventListener('click', () => void renderIncremental())
document.getElementById('btn-full')?.addEventListener('click', () => void renderFull())
document.querySelectorAll<HTMLButtonElement>('[data-inc-engine]').forEach((btn) => {
  btn.addEventListener('click', () => {
    useWorker = btn.dataset.incEngine === 'worker'
    document.querySelectorAll('[data-inc-engine]').forEach((x) => x.classList.toggle('active', x === btn))
    void renderIncremental()
  })
})

// 视图切换: 标签页互斥显隐 (内容驱动布局, 不再堆叠滚动)
document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => {
  b.addEventListener('click', () => {
    document.querySelectorAll('[data-tab]').forEach((x) => x.classList.toggle('active', x === b))
    const name = b.dataset.tab
    document.querySelectorAll<HTMLElement>('[data-view]').forEach((v) => { v.hidden = v.dataset.view !== name })
  })
})

// 图库方向 + 引擎
document.querySelectorAll<HTMLButtonElement>('[data-dir]').forEach((btn) => {
  btn.addEventListener('click', () => {
    currentDir = btn.dataset.dir as Dir
    document.querySelectorAll('[data-dir]').forEach((x) => x.classList.toggle('active', x === btn))
    void renderGallery()
  })
})
document.querySelectorAll<HTMLButtonElement>('[data-engine]').forEach((btn) => {
  btn.addEventListener('click', () => {
    engine = btn.dataset.engine as typeof engine
    document.querySelectorAll('[data-engine]').forEach((x) => x.classList.toggle('active', x === btn))
    void renderGallery()
  })
})

// 图列表
for (const g of GRAPHS) {
  const card = document.createElement('button')
  card.type = 'button'
  card.className = 'graph-card'
  card.dataset.key = g.key
  card.innerHTML = `<span class="gc-title">${g.title}</span><span class="gc-sub">${g.sub}</span>`
  card.addEventListener('click', () => {
    current = g
    for (const el of graphList.children) (el as HTMLElement).classList.toggle('active', (el as HTMLElement).dataset.key === g.key)
    void renderGallery()
  })
  graphList.appendChild(card)
}
;(graphList.children[GRAPHS.findIndex((g) => g.key === current.key)] as HTMLElement)?.classList.add('active')

// 初始化
void (async () => {
  lastPos = new Map(
    layoutElkJson(structuredClone(INITIAL_GRAPH), { layoutOptions: ROOT_COORDS }).children?.map((c) => [c.id, { x: c.x ?? 0, y: c.y ?? 0 }]) ?? [],
  )
  await renderIncremental()
  await renderGallery()
  await renderNested()
})()

// ═══════════════════════ 3. 嵌套布局 MVP ═══════════════════════
// 验证「group 作为 node」的嵌套任意布局 + 跨层级边能力边界。
// 结论基于 layout 实证 (bun 脚本) + ELK Java 文档:
//   - INCLUDE_CHILDREN + 纯 layered 嵌套 → 跨层级边完整路由 (S1)
//   - 非 layered 子树 (box/force) = black-box → 结构嵌套成立, 边路由依赖 provider 是否读边 (S2/S4)
//   - 跨出 non-layered 子树 → UnsupportedGraphException (忠实 Java) (S3)

interface NestedEdge {
  id?: string
  sources: string[]
  targets: string[]
  routed: boolean
  start: { x: number; y: number }
  end: { x: number; y: number }
  points: { x: number; y: number }[]
}

interface NestedFlat {
  nodes: { id: string; x: number; y: number; width: number; height: number; isCompound: boolean; algorithm: string }[]
  edges: NestedEdge[]
}

interface NestedScenario {
  key: string
  title: string
  sub: string
  input: ElkNode
  verdict: { level: 'ok' | 'warn' | 'err'; title: string; body: string }
}

const NODE_NESTED_W = 40
const NODE_NESTED_H = 30

const NESTED_SCENARIOS: NestedScenario[] = [
  {
    key: 's1',
    title: 'S1 · 纯 layered 嵌套 + 跨层级边',
    sub: 'v1 支持 · 基线：组内边 + 跨组边 + 跨两层（b2→c1）',
    input: {
      id: 'root',
      layoutOptions: { 'org.eclipse.elk.hierarchyHandling': 'INCLUDE_CHILDREN' },
      children: [
        {
          id: 'groupA',
          children: [
            { id: 'a1', width: NODE_NESTED_W, height: NODE_NESTED_H },
            { id: 'a2', width: NODE_NESTED_W, height: NODE_NESTED_H },
            {
              id: 'groupB',
              children: [
                { id: 'b1', width: 30, height: NODE_NESTED_H },
                { id: 'b2', width: 30, height: NODE_NESTED_H },
                { id: 'b3', width: 30, height: NODE_NESTED_H },
              ],
              edges: [{ id: 'e-b1-b2', sources: ['b1'], targets: ['b2'] }],
            },
          ],
          edges: [
            { id: 'e-a1-a2', sources: ['a1'], targets: ['a2'] },
            { id: 'e-a1-b1', sources: ['a1'], targets: ['b1'] },
          ],
        },
        { id: 'c1', width: 50, height: NODE_NESTED_H },
      ],
      edges: [
        { id: 'e-a2-c1', sources: ['a2'], targets: ['c1'] },
        { id: 'e-b3-a2', sources: ['b3'], targets: ['a2'] },
        { id: 'e-b2-c1', sources: ['b2'], targets: ['c1'] },
      ],
    },
    verdict: {
      level: 'ok',
      title: '✅ v1 支持：组内/跨组/跨层级边全部路由',
      body: 'INCLUDE_CHILDREN 单次布局：组内边（a1→a2）、跨组边（a1→b1、b3→a2）、跨两层到顶层（b2→c1）都经 ExternalPort dummy 拆分并正确路由。',
    },
  },
  {
    key: 's2',
    title: 'S2 · 深层嵌套（3 层 group）',
    sub: 'v1 支持 · 跨组边穿透任意层级：g3 最深叶子 c2 → 顶层 x1',
    input: {
      id: 'root',
      layoutOptions: { 'org.eclipse.elk.hierarchyHandling': 'INCLUDE_CHILDREN' },
      children: [
        {
          id: 'g1',
          children: [
            { id: 'a1', width: NODE_NESTED_W, height: NODE_NESTED_H },
            {
              id: 'g2',
              children: [
                { id: 'b1', width: 30, height: NODE_NESTED_H },
                {
                  id: 'g3',
                  children: [
                    { id: 'c1', width: 30, height: NODE_NESTED_H },
                    { id: 'c2', width: 30, height: NODE_NESTED_H },
                  ],
                  edges: [{ id: 'e-c1-c2', sources: ['c1'], targets: ['c2'] }],
                },
              ],
              edges: [{ id: 'e-b1-c1', sources: ['b1'], targets: ['c1'] }],
            },
          ],
          edges: [{ id: 'e-a1-b1', sources: ['a1'], targets: ['b1'] }],
        },
        { id: 'x1', width: 50, height: NODE_NESTED_H },
      ],
      edges: [
        { id: 'e-c2-x1', sources: ['c2'], targets: ['x1'] },
        { id: 'e-a1-x1', sources: ['a1'], targets: ['x1'] },
      ],
    },
    verdict: {
      level: 'ok',
      title: '✅ v1 支持：嵌套任意深度，跨组边穿透任意层级',
      body: '3 层 group 嵌套全部单次布局；最深叶子 c2 → 顶层 x1、a1 → x1 均正确路由。跨组边不受深度限制。',
    },
  },
  {
    key: 's3',
    title: 'S3 · 组 ↔ 节点链接',
    sub: 'v1 支持 · 组连顶层节点 / 顶层节点连组 / 组连组内节点 / 组内节点连组',
    input: {
      id: 'root',
      layoutOptions: { 'org.eclipse.elk.hierarchyHandling': 'INCLUDE_CHILDREN' },
      children: [
        {
          id: 'g1',
          children: [
            { id: 'a1', width: NODE_NESTED_W, height: NODE_NESTED_H },
            { id: 'a2', width: NODE_NESTED_W, height: NODE_NESTED_H },
          ],
        },
        {
          id: 'g2',
          children: [
            { id: 'b1', width: 30, height: NODE_NESTED_H },
            { id: 'b2', width: 30, height: NODE_NESTED_H },
          ],
        },
        { id: 'x1', width: 50, height: NODE_NESTED_H },
      ],
      edges: [
        { id: 'e-g1-x1', sources: ['g1'], targets: ['x1'] },
        { id: 'e-x1-g2', sources: ['x1'], targets: ['g2'] },
        { id: 'e-g1-b1', sources: ['g1'], targets: ['b1'] },
        { id: 'e-a1-g2', sources: ['a1'], targets: ['g2'] },
      ],
    },
    verdict: {
      level: 'ok',
      title: '✅ v1 支持：组作为端点的二元关系全部路由',
      body: '组↔顶层节点（g1→x1、x1→g2）、组↔组内节点（g1→b1、a1→g2）四种组合全部 sec=1。组在 layered 图里就是普通节点，可自由作 edge 端点。',
    },
  },
  {
    key: 's4',
    title: 'S4 · 组 ↔ 组链接',
    sub: 'v1 支持 · 组连组 + 组连深层节点（穿透 2 层容器边界）',
    input: {
      id: 'root',
      layoutOptions: { 'org.eclipse.elk.hierarchyHandling': 'INCLUDE_CHILDREN' },
      children: [
        {
          id: 'g1',
          children: [
            { id: 'a1', width: NODE_NESTED_W, height: NODE_NESTED_H },
            {
              id: 'g3',
              children: [
                { id: 'c1', width: 30, height: NODE_NESTED_H },
                { id: 'c2', width: 30, height: NODE_NESTED_H },
              ],
            },
          ],
        },
        { id: 'g2', children: [{ id: 'b1', width: 30, height: NODE_NESTED_H }] },
      ],
      edges: [
        { id: 'e-g1-g2', sources: ['g1'], targets: ['g2'] },
        { id: 'e-g2-g3', sources: ['g2'], targets: ['g3'] },
        { id: 'e-g2-c1', sources: ['g2'], targets: ['c1'] },
      ],
    },
    verdict: {
      level: 'ok',
      title: '✅ v1 支持：组↔组、组→深层节点穿透 2 层边界',
      body: '组↔组（g1→g2、g2→g3）路由；组→深层节点（g2→c1，c1 在 g1>g3 内）跨 2 层容器边界，bendPoints=2 正确穿透。',
    },
  },
  {
    key: 's5',
    title: 'S5 · 祖先/环/多重边',
    sub: 'v1 支持 · 节点→自身祖先组 / 组→自身子节点 / 跨组环 / 多重边',
    input: {
      id: 'root',
      layoutOptions: { 'org.eclipse.elk.hierarchyHandling': 'INCLUDE_CHILDREN' },
      children: [
        {
          id: 'g1',
          children: [
            { id: 'a1', width: NODE_NESTED_W, height: NODE_NESTED_H },
            { id: 'a2', width: NODE_NESTED_W, height: NODE_NESTED_H },
          ],
        },
        {
          id: 'g2',
          children: [
            { id: 'b1', width: 30, height: NODE_NESTED_H },
            { id: 'b2', width: 30, height: NODE_NESTED_H },
          ],
        },
      ],
      edges: [
        { id: 'e-a1-g1', sources: ['a1'], targets: ['g1'] },
        { id: 'e-g1-a2', sources: ['g1'], targets: ['a2'] },
        { id: 'e-a1-b1', sources: ['a1'], targets: ['b1'] },
        { id: 'e-b1-g2', sources: ['b1'], targets: ['g2'] },
        { id: 'e-g2-a1', sources: ['g2'], targets: ['a1'] },
        { id: 'e-a2-b1-a', sources: ['a2'], targets: ['b1'] },
        { id: 'e-a2-b1-b', sources: ['a2'], targets: ['b1'] },
      ],
    },
    verdict: {
      level: 'ok',
      title: '✅ v1 支持：边角案例全部路由',
      body: '节点→自身祖先组（a1→g1）、组→自身子节点（g1→a2）、跨组环（a1→b1→g2→a1，layered 内部破环但三条都路由）、多重边（a2→b1 ×2）——纯 layered 都能可靠表达。',
    },
  },
  {
    key: 's6',
    title: 'S6 · 边界：box 内嵌 force',
    sub: 'v1 范围外 · root(layered) > outer(box) > f(force)：边不路由',
    input: {
      id: 'root',
      layoutOptions: { 'org.eclipse.elk.hierarchyHandling': 'INCLUDE_CHILDREN' },
      children: [
        {
          id: 'outer',
          layoutOptions: { 'org.eclipse.elk.algorithm': 'box' },
          children: [
            { id: 'a1', width: NODE_NESTED_W, height: NODE_NESTED_H },
            {
              id: 'f',
              layoutOptions: { 'org.eclipse.elk.algorithm': 'force' },
              children: [
                { id: 'b1', width: 30, height: NODE_NESTED_H },
                { id: 'b2', width: 30, height: NODE_NESTED_H },
              ],
              edges: [{ id: 'e-b1-b2', sources: ['b1'], targets: ['b2'] }],
            },
          ],
          edges: [{ id: 'e-a1-f', sources: ['a1'], targets: ['f'] }],
        },
      ],
    },
    verdict: {
      level: 'err',
      title: '❌ v1 范围外：混合算法嵌套存在边路由缺口',
      body: '结构上「group 作为 node」成立，但 box 不读边 → e-a1-f 无路由；force 内部边 e-b1-b2 被 attachSubtreeEdges 误挂到外层 box → 不路由。这是 v1 只支持纯 layered 的实证依据。',
    },
  },
  {
    key: 's7',
    title: 'S7 · 边界：跨出非 layered 子树',
    sub: 'v1 范围外 · box 内叶子 a1 → root 层 c1：期望连叶子而非连 group',
    input: {
      id: 'root',
      layoutOptions: { 'org.eclipse.elk.hierarchyHandling': 'INCLUDE_CHILDREN' },
      children: [
        {
          id: 'g',
          layoutOptions: { 'org.eclipse.elk.algorithm': 'box' },
          children: [
            { id: 'a1', width: NODE_NESTED_W, height: NODE_NESTED_H },
            { id: 'a2', width: NODE_NESTED_W, height: NODE_NESTED_H },
          ],
          edges: [{ id: 'e-a1-a2', sources: ['a1'], targets: ['a2'] }],
        },
        { id: 'c1', width: 50, height: NODE_NESTED_H },
      ],
      edges: [{ id: 'e-a1-c1', sources: ['a1'], targets: ['c1'] }],
    },
    verdict: {
      level: 'err',
      title: '❌ v1 范围外：UnsupportedGraphException',
      body: '非 layered 子树是 black-box，layered 图里只留容器一个节点；边连到 black-box 内部叶子 → 抛 UnsupportedGraphException（忠实 ELK Java 0.12.0）。跨层级边 ⇔ INCLUDE_CHILDREN ⇔ 整棵子树同一种算法，二者不可兼得。',
    },
  },
]

let nestedKey = 's1'

/** 收集 ROOT 坐标输出：递归节点（含容器/算法）+ 全部边（路由/未路由）。 */
function collectNestedFlat(out: ElkNode): NestedFlat {
  const nodes: NestedFlat['nodes'] = []
  const rawEdges: ElkEdge[] = []
  const nodeById = new Map<string, { x: number; y: number; width: number; height: number }>()
  const walk = (n: ElkNode): void => {
    const algorithm = String(
      n.layoutOptions?.['org.eclipse.elk.algorithm'] ?? n.layoutOptions?.algorithm ?? '',
    )
    nodes.push({
      id: n.id,
      x: n.x ?? 0,
      y: n.y ?? 0,
      width: n.width ?? 0,
      height: n.height ?? 0,
      isCompound: (n.children?.length ?? 0) > 0,
      algorithm,
    })
    nodeById.set(n.id, { x: n.x ?? 0, y: n.y ?? 0, width: n.width ?? 0, height: n.height ?? 0 })
    for (const e of n.edges ?? []) rawEdges.push(e)
    for (const c of n.children ?? []) walk(c)
  }
  for (const c of out.children ?? []) walk(c)
  for (const e of out.edges ?? []) rawEdges.push(e)

  const centerOf = (ref: string): { x: number; y: number } | null => {
    const id = ref.includes('.') ? ref.slice(0, ref.lastIndexOf('.')) : ref
    const n = nodeById.get(id)
    if (!n) return null
    return { x: n.x + n.width / 2, y: n.y + n.height / 2 }
  }
  const edges: NestedEdge[] = rawEdges.map((e) => {
    const s = e.sections?.[0]
    const src = String(e.sources?.[0] ?? '')
    const tgt = String(e.targets?.[0] ?? '')
    if (s?.startPoint && s?.endPoint) {
      return {
        id: e.id,
        sources: e.sources ?? [],
        targets: e.targets ?? [],
        routed: true,
        start: s.startPoint,
        end: s.endPoint,
        points: (s.bendPoints ?? []).filter((bp) => Number.isFinite(bp.x) && Number.isFinite(bp.y)),
      }
    }
    // 未路由边：节点中心直连（虚线）。端点可能是容器端口引用，回退到容器中心。
    const c1 = centerOf(src)
    const c2 = centerOf(tgt)
    return {
      id: e.id,
      sources: e.sources ?? [],
      targets: e.targets ?? [],
      routed: false,
      start: c1 ?? { x: 0, y: 0 },
      end: c2 ?? { x: 0, y: 0 },
      points: [],
    }
  })
  return { nodes, edges }
}

/** 嵌套 MVP 专用 SVG：容器圆角矩形 + 算法标注，路由/未路由边分色。 */
function toNestedSvg(flat: NestedFlat): string {
  const pad = 48
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const n of flat.nodes) {
    minX = Math.min(minX, n.x); minY = Math.min(minY, n.y)
    maxX = Math.max(maxX, n.x + n.width); maxY = Math.max(maxY, n.y + n.height)
  }
  for (const e of flat.edges) {
    for (const pt of [e.start, e.end, ...e.points]) {
      minX = Math.min(minX, pt.x); minY = Math.min(minY, pt.y)
      maxX = Math.max(maxX, pt.x); maxY = Math.max(maxY, pt.y)
    }
  }
  if (!Number.isFinite(minX)) { minX = 0; minY = 0; maxX = 60; maxY = 60 }
  const W = Math.max(maxX - minX + pad * 2, 120)
  const H = Math.max(maxY - minY + pad * 2, 120)
  const tx = (x: number): number => x - minX + pad
  const ty = (y: number): number => y - minY + pad
  const parts: string[] = []
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="system-ui, sans-serif">`)

  // 容器底框（先画，叶子节点覆盖其上）
  for (const n of flat.nodes) {
    if (!n.isCompound) continue
    parts.push(`<rect x="${tx(n.x)}" y="${ty(n.y)}" width="${n.width}" height="${n.height}" rx="10" fill="#fef9c3" stroke="#ca8a04" stroke-width="1.5" stroke-dasharray="${n.algorithm === 'box' ? '6 3' : '2 2'}"/>`)
    const tag = n.algorithm ? `${n.id} · ${n.algorithm}` : n.id
    parts.push(`<text x="${tx(n.x) + 8}" y="${ty(n.y) + 14}" font-size="10" font-weight="600" fill="#92400e" font-family="ui-monospace,monospace">${tag}</text>`)
  }
  // 边：已路由（实线+箭头）/ 未路由（虚线）
  for (const e of flat.edges) {
    const pts = [e.start, ...e.points, e.end].map((p) => `${tx(p.x).toFixed(1)},${ty(p.y).toFixed(1)}`).join(' ')
    if (e.routed) {
      parts.push(`<polyline points="${pts}" fill="none" stroke="#a5b4fc" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>`)
      const last = e.points.length > 0 ? e.points[e.points.length - 1]! : e.start
      const ang = Math.atan2(e.end.y - last.y, e.end.x - last.x)
      const L = 8, a = 0.5
      const ax = tx(e.end.x), ay = ty(e.end.y)
      parts.push(`<polyline points="${(ax - L * Math.cos(ang - a)).toFixed(1)},${(ay - L * Math.sin(ang - a)).toFixed(1)} ${ax.toFixed(1)},${ay.toFixed(1)} ${(ax - L * Math.cos(ang + a)).toFixed(1)},${(ay - L * Math.sin(ang + a)).toFixed(1)}" fill="none" stroke="#a5b4fc" stroke-width="1.5" stroke-linecap="round"/>`)
    } else {
      parts.push(`<line x1="${tx(e.start.x).toFixed(1)}" y1="${ty(e.start.y).toFixed(1)}" x2="${tx(e.end.x).toFixed(1)}" y2="${ty(e.end.y).toFixed(1)}" stroke="#d4d4d8" stroke-width="1.5" stroke-dasharray="5 4"/>`)
    }
  }
  // 叶子节点
  for (const n of flat.nodes) {
    if (n.isCompound) continue
    const x = tx(n.x), y = ty(n.y)
    parts.push(`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${n.width.toFixed(1)}" height="${n.height.toFixed(1)}" rx="6" fill="#eef2ff" stroke="#6366f1" stroke-width="1"/>`)
    const maxChars = Math.max(2, Math.floor(n.width / 7))
    const short = n.id.length > maxChars ? n.id.slice(0, Math.max(1, maxChars - 1)) + '…' : n.id
    parts.push(`<text x="${(x + n.width / 2).toFixed(1)}" y="${(y + n.height / 2 + 3.5).toFixed(1)}" text-anchor="middle" font-size="10.5" fill="#27272a">${short}</text>`)
  }
  parts.push('</svg>')
  return parts.join('\n')
}

async function renderNested(): Promise<void> {
  const sc = NESTED_SCENARIOS.find((s) => s.key === nestedKey) ?? NESTED_SCENARIOS[0]!
  nestedJson.textContent = JSON.stringify(sc.input, null, 2)
  try {
    const out = layoutElkJson(structuredClone(sc.input), { layoutOptions: ROOT_COORDS }) as ElkNode
    const flat = collectNestedFlat(out)
    const routed = flat.edges.filter((e) => e.routed).length
    const unrouted = flat.edges.length - routed
    nestedStage.innerHTML = toNestedSvg(flat)
    nestedMetrics.innerHTML =
      `节点 <b>${flat.nodes.length}</b> · 边 <b>${flat.edges.length}</b>` +
      ` · 已路由 <b class="ok">${routed}</b>` +
      ` · 未路由 <b class="${unrouted > 0 ? 'warn' : 'ok'}">${unrouted}</b>` +
      ` · 算法 <b>${[...new Set(flat.nodes.map((n) => n.algorithm || 'layered'))].join(', ')}</b>`
    nestedVerdict.className = `verdict ${sc.verdict.level}`
    nestedVerdict.innerHTML = `<b>${sc.verdict.title}</b><pre>${sc.verdict.body}</pre>`
  } catch (err) {
    nestedStage.innerHTML = ''
    const msg = (err as Error).message
    nestedMetrics.innerHTML = `<b class="warn">布局失败</b> · ${msg.split('\n')[0] ?? msg}`
    nestedVerdict.className = `verdict ${sc.verdict.level}`
    nestedVerdict.innerHTML = `<b>${sc.verdict.title}</b><pre>${sc.verdict.body}</pre>`
    const head = msg.split('\n')[0] ?? msg
    const rest = msg.split('\n').slice(1).join('\n')
    nestedJson.textContent = `输入 JSON\n${JSON.stringify(sc.input, null, 2)}\n\n—— 布局抛错 ——\n${head}${rest ? '\n' + rest : ''}`
  }
}

const nestedStage = document.getElementById('nested-stage') as HTMLDivElement
const nestedMetrics = document.getElementById('nested-metrics') as HTMLDivElement
const nestedVerdict = document.getElementById('nested-verdict') as HTMLDivElement
const nestedJson = document.getElementById('nested-json') as HTMLPreElement

document.querySelectorAll<HTMLButtonElement>('[data-scenario]').forEach((btn) => {
  btn.addEventListener('click', () => {
    nestedKey = btn.dataset.scenario as string
    document.querySelectorAll('[data-scenario]').forEach((x) => x.classList.toggle('active', x === btn))
    void renderNested()
  })
})
