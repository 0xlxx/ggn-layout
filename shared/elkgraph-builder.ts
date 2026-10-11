/** 共享建图核心 — 无 node 依赖, scripts (elkt-build) 与 demo (layout-build) 共用.
 * 单一来源: parseElkt 结构 / ELK JSON → LGraph, 消除浏览器 fork 不一致 (审查报告 §2.1-2.3).
 */
// tree-shaking: 不引完整入口 (src/index.ts → public → api/index → register-all → 全部非 layered provider),
// 从具体模块引模型符号 (layered-only 子入口才能 tree-shake 掉非 layered 代码).
import { LGraph, type LPadding } from '../src/graph/lgraph.js'
import { LNode } from '../src/graph/lnode.js'
import { LPort } from '../src/graph/lport.js'
import { LEdge } from '../src/graph/ledge.js'
import { PortSide, PortType } from '../src/graph/enums.js'
import { createMergedPort } from '../src/graph/lgraph-util-merge.js'
import {
  PORT_BORDER_OFFSET as PORT_BORDER_OFFSET_KEY,
  PORT_CONSTRAINTS as PORT_CONSTRAINTS_KEY,
  PORT_INDEX as PORT_INDEX_KEY,
  HIERARCHY_HANDLING as HIERARCHY_HANDLING_KEY,
  DIRECTION as DIRECTION_KEY,
  INSIDE_SELF_LOOPS_ACTIVATE as INSIDE_SELF_LOOPS_ACTIVATE_KEY,
  INSIDE_SELF_LOOPS_YO as INSIDE_SELF_LOOPS_YO_KEY,
  EDGE_THICKNESS as EDGE_THICKNESS_KEY,
  RANDOM_SEED as RANDOM_SEED_KEY,
  MERGE_EDGES as MERGE_EDGES_KEY,
} from '../src/options/layered-options.js'
import { OPT_MAP, coerceVal } from './opt-map.js'

// ── ELK JSON 输入结构 (elkJsonToParsed 输入) ──
interface ElkLabelJson {
  text?: string
  width?: number
  height?: number
  x?: number
  y?: number
  placement?: string
  layoutOptions?: Record<string, unknown>
}

interface ElkPortJson {
  id?: string
  x?: number
  y?: number
  width?: number
  height?: number
  properties?: Record<string, unknown>
  labels?: ElkLabelJson[]
}

interface ElkEdgeJson {
  sources?: unknown[]
  targets?: unknown[]
  source?: unknown
  target?: unknown
  properties?: Record<string, unknown>
  labels?: ElkLabelJson[]
}

interface ElkNodeJson {
  id: string
  width?: number
  height?: number
  x?: number
  y?: number
  ports?: ElkPortJson[]
  labels?: ElkLabelJson[]
  children?: ElkNodeJson[]
  edges?: ElkEdgeJson[]
  layoutOptions?: Record<string, unknown>
}

// ── parsed 中间结构 (elkJsonToParsed 输出 / buildLGraphFromParsed 输入) ──
interface ParsedPort {
  id: string
  x?: number
  y?: number
  w: number
  h: number
  side?: string | null
  index?: number
  borderOffset?: number
  labels?: ParsedPortLabel[]
}

interface ParsedPortLabel {
  text: string
  width: number
  height: number
  x?: number
  y?: number
}

interface ParsedLabel {
  text?: string
  width?: number
  height?: number
  x?: number
  y?: number
  placement?: string | null
}

interface NodeProps {
  width?: number
  height?: number
  x?: number
  y?: number
  ports?: ParsedPort[]
  labels?: ParsedLabel[]
  portConstraints?: string
  padding?: string | { top?: number; left?: number; right?: number; bottom?: number } | { x?: number; y?: number }
  mergeEdges?: boolean | string
  algorithm?: string
  'insideSelfLoops.activate'?: boolean | string
  'nodeLabels.placement'?: string
  'nodeLabels.padding'?: string | { top?: number; left?: number; right?: number; bottom?: number }
  'spacing.labelLabel'?: number | string
  [key: string]: unknown
}

type ParsedEdge = [string, string | null, string, string | null, boolean, ParsedLabel[], number | null]

export interface ParsedGraph {
  nodes: string[]
  edges: ParsedEdge[]
  hierarchy: Map<string, string[]>
  graphProps: Record<string, unknown>
  nodeProps: Map<string, NodeProps>
}

function buildHierarchy(
  nodeIndexById: Readonly<Record<string, number>>,
  hierarchy: Map<string, string[]> | Record<string, string[]>,
): Record<number, number[]> {
  const result: Record<number, number[]> = {}
  const entries: IterableIterator<[string, string[]]> | Array<[string, string[]]> =
    hierarchy instanceof Map ? hierarchy.entries() : Object.entries(hierarchy)
  for (const [parent, kids] of entries) {
    const pi = nodeIndexById[parent]
    if (pi === undefined) continue
    const kidIndices: number[] = []
    for (const k of kids) {
      const ki = nodeIndexById[k]
      if (ki !== undefined) kidIndices.push(ki)
    }
    result[pi] = kidIndices
  }
  return result
}

function createSimpleEdge(
  src: LNode,
  tgt: LNode,
  spIdx: number | null = null,
  tpIdx: number | null = null,
  defaultSide = 'EAST',
  srcMergeEdges = false,
  tgtMergeEdges = false,
): LEdge {
  const mk = (node: LNode, type: 'OUTPUT' | 'INPUT', merge: boolean): LPort => {
    // ELK LGraphUtil.createPort 合并分支: 图级 MERGE_EDGES (ELK 读 layeredGraph.getProperty) 且非 FIXED_SIDE
    // → 每侧共享收集端口. 源侧用边所在图 (LCA, ELK ElkGraphImporter 传 lgraph), 目标侧用目标节点所在图
    // (ELK createPort(targetLNode, ..., targetLNode.getGraph())) — hierarchy01 N3_1 实证.
    if (merge && node.getProperty(PORT_CONSTRAINTS_KEY) !== 'FIXED_SIDE') {
      return createMergedPort(node, type === 'OUTPUT' ? PortType.OUTPUT : PortType.INPUT,
        ((type === 'OUTPUT' ? defaultSide : OPPOSED[defaultSide] ?? 'WEST') ?? 'EAST') as PortSide, true, false)
    }
    const p = new LPort(); p.setNode(node); p.setSide((type === 'OUTPUT' ? defaultSide : OPPOSED[defaultSide] ?? 'WEST') as PortSide); return p
  }
  const sp = spIdx !== null && spIdx < src.getPorts().length ? src.getPorts()[spIdx] : mk(src, 'OUTPUT', srcMergeEdges)
  const tp = tpIdx !== null && tpIdx < tgt.getPorts().length ? tgt.getPorts()[tpIdx] : mk(tgt, 'INPUT', tgtMergeEdges)
  const e = new LEdge(); e.setSource(sp); e.setTarget(tp)
  return e
}

const OPPOSED: Record<string, string> = { NORTH: 'SOUTH', SOUTH: 'NORTH', EAST: 'WEST', WEST: 'EAST' }

/** ELK ElkGraphImporter.transformEdge 复刻: 跨层级边校验 (ticket 588).
 * Java 0.12.0 行为: 边端点若不在当前 layered 运行的 nodeAndPortMap (位于另一层级、
 * 由非 layered 算法布局的子图内), 抛 UnsupportedGraphException (ElkGraphImporter.java:1130).
 * 规则 (对齐 importHierarchicalGraph):
 *   - 边所在容器 = 端点 LCA (点号路径公共前缀); 容器不在 layered 运行内 (自身是 black-box
 *     节点或其后代, 如 665: 两端同处 stress 子图) → 该边由子算法处理, 不抛;
 *   - 容器在 layered 运行内 (如 588: root 层) → 任一端点不在表内 (black-box 后代) → 抛.
 * bbOf(ref): ref 的最近 black-box 祖先 (自身是 black-box 节点不算 — Java 容器节点本身在表内);
 * isBlackBox(id): id 自身是否是 black-box 节点. */
function lcaOfDotted(a: string, b: string): string | null {
  const pa = a.split('.')
  const pb = b.split('.')
  let i = 0
  while (i < pa.length && i < pb.length && pa[i] === pb[i]) i++
  return i === 0 ? null : pa.slice(0, i).join('.')
}

/** 归一化算法 id (org.eclipse.elk./elk. 前缀剥离, 小写) — 判定「非 layered 算法」用. */
function normAlgId(a: unknown): string {
  return String(a).trim().toLowerCase().replace(/^org\.eclipse\.elk\./, '').replace(/^elk\./, '')
}

function assertNoCrossHierarchyEdge(
  sRef: string,
  tRef: string,
  bbOf: (ref: string) => string | null,
  isBlackBox: (id: string) => boolean,
): void {
  const bbS = bbOf(sRef)
  const bbT = bbOf(tRef)
  if (bbS === null && bbT === null) return
  const lca = lcaOfDotted(sRef, tRef)
  const lcaInRun = lca === null ? true : !isBlackBox(lca) && bbOf(lca) === null
  if (lcaInRun) {
    throw new Error(
      'UnsupportedGraphException: The source or the target of edge could not be found. ' +
      'This usually happens when an edge connects a node laid out by ELK Layered to a node in ' +
      'another level of hierarchy laid out by either another instance of ELK Layered or another ' +
      'layout algorithm alltogether. The former can be solved by setting the hierarchyHandling ' +
      'option to INCLUDE_CHILDREN.')
  }
}

function applyGraphPropsToLGraph(graph: LGraph, graphProps: Record<string, unknown>): void {
  for (const [k, v] of Object.entries(graphProps)) {
    const m = OPT_MAP[k]
    if (!m) continue
    // 纯对象值（padding 等 complex 对象已由 elkJsonToParsed 原样保留）直接用，避免 String({top:20})
    // = "[object Object]" 破坏（2026-08-15 修复 A 附带：对象形态 padding 同字符串形态生效）；
    // 数组（enumset 等）仍走 String→coerceVal（与 R55 节点级一致）。
    const isPlainObj = typeof v === 'object' && v !== null && !Array.isArray(v)
    let val = isPlainObj ? (v as unknown) : coerceVal(m, String(v))  // R55: 与节点级一致 — elkjs 数值选项先字符串化
    if (val === undefined) continue // B4: 解析失败 (Java parseValue 异常 → 选项不设置)
    // B1: 与 buildLGraphFromParsed 节点级一致 — 按 m.ggn 判断 (图级短键是 `minimum`,
    // 旧 `k === 'nodeSize.minimum'` 永不命中 → tickets/273 P2 得字符串, NODE_SIZE_MINIMUM 被忽略).
    if (m.ggn === 'org.eclipse.elk.nodeSize.minimum' && typeof val === 'string') {
      const [nx, ny] = String(val).replace(/[()]/g, '').split(',').map(Number)
      val = { x: nx, y: ny }
    }
    // ★ root（graph）padding 必须进 LGraph.setPadding（this.padding 字段），不能只 setProperty——
    // 布局消费 getPadding()（this.padding）；此前 padding 进 property 永不被读 → root padding 全部
    // 失效（2026-08-15 黑盒修复期遗留「ggn root padding [top=N] 未生效」：entry y=12 vs elkjs y=32）。
    // 部分 padding 未指定边 = 0（ELK Java oracle 实证："[top=20]" → {top:20,left:0,right:0,bottom:0}，
    // 子节点 x=0；2026-08-15 审阅 P1-1 对齐）；「选项完全缺省」才由 LGraph 初始默认 12 兜底（此处无键不进入）。
    if (m.ggn === 'org.eclipse.elk.padding') {
      const padVal = val as Partial<LPadding> | null
      // B4：无效形态（标量 "20" / 向量 "(20,20)"）parse 失败 → 选项不设置 → 默认 12（对齐 Java）
      const hasPadKey =
        typeof padVal === 'object' &&
        padVal !== null &&
        (padVal.top !== undefined || padVal.left !== undefined || padVal.right !== undefined || padVal.bottom !== undefined)
      if (!hasPadKey) continue
      graph.setPadding({
        top: padVal.top ?? 0,
        left: padVal.left ?? 0,
        right: padVal.right ?? 0,
        bottom: padVal.bottom ?? 0,
      })
      continue
    }
    graph.setProperty(m.ggn, val)
  }
}

export function buildLGraphFromParsed(parsed: ParsedGraph, name = 'graph') {
  const { nodes, edges, hierarchy, graphProps, nodeProps } = parsed
  const nodeCount = nodes.length
  // indexOf 语义是首个匹配；重复 id 也只记录首次出现的位置.
  const nodeIndexById: Record<string, number> = Object.create(null)
  for (let i = 0; i < nodeCount; i++) {
    const id = nodes[i]
    if (nodeIndexById[id] === undefined) nodeIndexById[id] = i
  }
  const HIERARCHY = buildHierarchy(nodeIndexById, hierarchy)
  const GRAPH_DIRECTION = String(graphProps.direction ?? 'RIGHT').toUpperCase()

  const graph = new LGraph()
  const nodeOf = new Map<number, LNode>()
  const nestedGraphs = new Map<number, LGraph>()
  const parentForNode = new Int32Array(nodeCount)
  parentForNode.fill(-1)
  // 只有容器节点 (有子节点的) 才拥有 nestedGraph (ELK 模型).
  for (const parentIdxStr of Object.keys(HIERARCHY)) {
    const parentIdx = Number(parentIdxStr)
    nestedGraphs.set(parentIdx, new LGraph())
    // Object.entries(HIERARCHY).find 的等价索引: 原顺序首次命中优先.
    for (const k of HIERARCHY[parentIdx]) {
      if (parentForNode[k] === -1) parentForNode[k] = parentIdx
    }
  }

  for (let i = 0; i < nodeCount; i++) {
    const id = nodes[i]
    const p: NodeProps = nodeProps.get(id) ?? {}
    const parentIdx = parentForNode[i]
    const g = parentIdx !== -1 ? nestedGraphs.get(parentIdx) : graph
    const n = new LNode(g)
    n.size = { x: p.width ?? 60, y: p.height ?? 30 }
    // ELK ElkGraphImporter.transformNode (0.12.0:913-914): 输入 x/y 种子 LNode 位置 —
    // INTERACTIVE 分层/断环/交叉最小化读 node.getPosition(), 缺此种子则输入伪坐标全部丢失.
    if (p.x !== undefined) n.position.x = p.x
    if (p.y !== undefined) n.position.y = p.y
    if (p.portConstraints) n.setProperty(PORT_CONSTRAINTS_KEY, p.portConstraints)
    if (p['insideSelfLoops.activate'] === 'true' || p['insideSelfLoops.activate'] === true) {
      n.setProperty(INSIDE_SELF_LOOPS_ACTIVATE_KEY, true)
    }
    // SSOT 保真: 节点级选项 (除已单列处理的 portConstraints/insideSelfLoops.activate).
    for (const [k, v] of Object.entries(p)) {
      if (k.startsWith('_') || k === 'ports' || k === 'children' || k === 'labels' || k === 'width' || k === 'height') continue
      if (k === 'portConstraints' || k === 'insideSelfLoops.activate') continue
      const m = OPT_MAP[k]
      if (!m) continue
      // 纯对象值（nodeLabels.padding/position 等 complex 对象）原样保留——节点级此前缺 isPlainObj
      // 判断（图级已有），String({top:16}) = "[object Object]" → LNode property 异常 → NetworkSimplex
      // 崩（2026-08-16 实证：注入任意 nodeLabels.padding 值都崩；Java 节点 padding 是 ElkPadding 对象）。
      const isPlainObj = typeof v === 'object' && v !== null && !Array.isArray(v)
      let val = isPlainObj ? (v as unknown) : coerceVal(m, String(v))
      if (val === undefined) continue // B4: 解析失败 → 不设置 (Java 语义)
      if (m.ggn === 'org.eclipse.elk.nodeSize.minimum' && typeof val === 'string') {
        const [nx, ny] = String(val).replace(/[()]/g, '').split(',').map(Number)
        val = { x: nx, y: ny }
      }
      if (m.ggn === 'org.eclipse.elk.position' && typeof val === 'string') {
        const [px, py] = String(val).replace(/[()]/g, '').split(',').map(Number)
        val = { x: px, y: py }
      }
      n.setProperty(m.ggn, val)
    }
    for (const port of p.ports ?? []) {
      // B9/B10: 端口侧不在此推断 — 统一交给 LayeredLayoutProvider.initializeAllPortSides
      // (layout 期, CGP 之前, 对所有 side-fixed 端口用方向感知的 LGraphUtil.calcPortSide, 与 ELK 一致).
      // 旧的 build 期几何版 calcPortSide 无 UP/DOWN 分支/零尺寸保护, 且对无位置端口 (默认 0,0) 定侧错误,
      // 还会抢先定侧阻止 layout 期正确推断 (variants 实证: jar 对 (0,0)+FIXED_ORDER 推断 WEST, ggn build 期给 UNDEFINED).
      let side = port.side ?? null
      const lport = new LPort()
      lport.setNode(n)
      lport.getPosition().x = port.x ?? 0
      lport.getPosition().y = port.y ?? 0
      lport.size = { x: port.w ?? 8, y: port.h ?? 8 }
      if (port.borderOffset !== undefined && port.borderOffset !== null) lport.setProperty(PORT_BORDER_OFFSET_KEY, port.borderOffset)
      if (side) lport.setSide(side as PortSide)
      if (port.index !== null && port.index !== undefined) lport.setProperty(PORT_INDEX_KEY, port.index)
      // ★ 端口标签 (SSOT 输入保真; ELK ElkGraphImporter createPort + LPort labels; 701 端口标签尺寸/位置).
      if ((port.labels ?? []).length > 0) {
      lport.setLabels((port.labels ?? []).map((l) => ({
          text: l.text ?? '',
          position: { x: l.x ?? 0, y: l.y ?? 0 },
          size: { x: l.width ?? 0, y: l.height ?? 0 },
        })))
      }
    }
    if ((p.labels ?? []).length > 0) {
      n.setLabels((p.labels ?? []).map(l => ({
        text: l.text ?? '',
        position: { x: l.x ?? 0, y: l.y ?? 0 },
        size: { x: l.width ?? 0, y: l.height ?? 0 },
        placement: l.placement ?? undefined,
      })))
    }
    const isCompound = (hierarchy.get(id) ?? []).length > 0
    // ★ ELK ElkGraphImporter.createLGraph (0.12.0:615-626): 子图 padding = 父节点配置 padding
    //   (org.eclipse.elk.padding, 默认 12) + computeInsideNodeLabelPadding (标签高 + nodeLabels.padding + gap).
    //   (Spacing.add 是逐分量**相加**, 不是 max). 905 N1 label 21 → 12 + (21+5+0) = 38;
    //   489 N1 padding [5,5,5,5] → 子图 padding 5 (此前缺配置 padding → 子节点在 12 vs jar 5).
    if (isCompound) {
      const nested = nestedGraphs.get(i)
      if (nested) {
        // 部分 padding 未指定边 = 0（ELK Java oracle 语义，2026-08-15 审阅 P1-1 对齐）；
        // 选项完全缺省（null）→ 默认 12（CoreOptions.PADDING 默认，与 LGraph 初始 padding 一致）。
        // 修复黑盒修复期遗留「ggn root padding [top=N] 未生效」（entry y=12 vs elkjs y=32）：
        // 此前 configPad.bottom 等 undefined+0=NaN 污染整体回落默认。
        const configPadRaw = (typeof p.padding === 'object'
          ? p.padding
          : (p.padding ? coerceVal(OPT_MAP.padding, String(p.padding)) : null)) as { top?: number; left?: number; right?: number; bottom?: number } | null
        // 无效形态（标量 "20" / 向量 "(20,20)"）parse 失败 → 不设置 → 默认 12（B4，对齐 Java）；
        // 仅含 padding 键的对象才归一化（未指定边 0）。
        const isPadKey = (v: { top?: number; left?: number; right?: number; bottom?: number } | null): boolean =>
          v !== null && (v.top !== undefined || v.left !== undefined || v.right !== undefined || v.bottom !== undefined)
        const configPad = configPadRaw === null || !isPadKey(configPadRaw)
          ? { top: 12, left: 12, right: 12, bottom: 12 }
          : {
              top: configPadRaw.top ?? 0,
              left: configPadRaw.left ?? 0,
              right: configPadRaw.right ?? 0,
              bottom: configPadRaw.bottom ?? 0,
            }
        // B16c: 仅显式 INSIDE placement 的标签参与子图 padding (ELK computeInsideNodeLabelPadding:
        // 无 placement → NodeLabelLocation UNDEFINED → 不进 cell → padding 无 label 贡献 —
        // padding.elkt n1/n2/n4/n5 实证 subNode y=12/20/20/0, 无 labelPad; n3/n6 有 placement → +22).
        // 按 V 方向加 top/bottom, H 方向加 left/right (OUTSIDE 被 onlyInside=true 过滤).
        const nodePlRaw = p['nodeLabels.placement']
        let padTop = 0, padBottom = 0, padLeft = 0, padRight = 0
        for (const l of p.labels ?? []) {
          const plRaw = l.placement ?? nodePlRaw ?? ''
          if (!plRaw) continue
          const pl = String(plRaw).replace(/[\[\]]/g, '').split(/[\s,]+/).filter(Boolean)
          if (!pl.includes('INSIDE')) continue
          if (pl.includes('V_TOP')) padTop = Math.max(padTop, l.height ?? 0)
          else if (pl.includes('V_BOTTOM')) padBottom = Math.max(padBottom, l.height ?? 0)
          else {
            if (pl.includes('H_LEFT')) padLeft = Math.max(padLeft, l.width ?? 0)
            if (pl.includes('H_RIGHT')) padRight = Math.max(padRight, l.width ?? 0)
          }
        }
        const nlPad = p['nodeLabels.padding'] ?? { top: 5, right: 5, bottom: 5, left: 5 }
        const labelLabel = Number(p['spacing.labelLabel'] ?? 0)
        const nlTop = typeof nlPad === 'object' ? (nlPad.top ?? 5) : 5
        const nlBottom = typeof nlPad === 'object' ? (nlPad.bottom ?? 5) : 5
        const nlLeft = typeof nlPad === 'object' ? (nlPad.left ?? 5) : 5
        const nlRight = typeof nlPad === 'object' ? (nlPad.right ?? 5) : 5
        const fmt = (v: number, side: number): number => v > 0 ? v + side + 2 * labelLabel : 0
        nested.setPadding({
          top: configPad.top + fmt(padTop, nlTop),
          bottom: configPad.bottom + fmt(padBottom, nlBottom),
          left: configPad.left + fmt(padLeft, nlLeft),
          right: configPad.right + fmt(padRight, nlRight),
        })
      }
    }
    nodeOf.set(i, n)
  }

  for (const p of Object.keys(HIERARCHY).map(Number)) {
    const parent = nodeOf.get(p)!
    const nested = nestedGraphs.get(p)!
    parent.setNestedGraph(nested)
    nested.setParentNode(parent)
    // ELK ElkGraphImporter.createLGraph: copyProperties(elknode) → 节点级 mergeEdges 传播到嵌套图
    // (LGraphUtil.createPort 读 layeredGraph.getProperty(MERGE_EDGES), hierarchy01 N3_1/N1_1_1 实证).
    const nodeMerge = (nodeProps.get(nodes[p]) ?? {})['mergeEdges']
    if (nodeMerge === true || nodeMerge === 'true') nested.setProperty(MERGE_EDGES_KEY, true)
  }

  const mergeEdges = graphProps.mergeEdges === true || graphProps.mergeEdges === 'true'
  if (mergeEdges) graph.setProperty(MERGE_EDGES_KEY, true)

  // 边所在图 (LCA) 的 MERGE_EDGES: ELK ElkGraphImporter 按 edge.getContainingNode() (=端点 LCA)
  // 分层导入, 源侧 createPort(..., lgraph) 读边所在图属性; 目标侧读 targetLNode.getGraph().
  const parentOf = new Map<number, number>()
  for (const [parentIdxStr, kids] of Object.entries(HIERARCHY)) {
    const parentIdx = Number(parentIdxStr)
    for (const k of kids) parentOf.set(k, parentIdx)
  }
  const lcaGraphFor = (a: number, b: number): LGraph => {
    const seen = new Set<number>()
    let x: number | undefined = a
    while (x !== undefined) { seen.add(x); x = parentOf.get(x) }
    let y: number | undefined = b
    while (y !== undefined && !seen.has(y)) y = parentOf.get(y)
    if (y === undefined) return graph
    const py = parentOf.get(y)
    return py === undefined ? graph : (nestedGraphs.get(py) ?? graph)
  }

  // R18/588: 复刻 Java 跨层级边报错 (P2 parseElkt / P3 buildLGraphFromElkJson 路径) —
  // 端点 (或其点号祖先前缀) 带非 layered 算法 (stress/force/box/fixed/random...) 且边所在
  // 容器 (端点 LCA) 在 layered 运行内 → 抛 UnsupportedGraphException. 665 (两端同处 stress
  // 子图, LCA 自身是 black-box) 不抛 — 与 Java importHierarchicalGraph 队列一致.
  const pIsNonLayered = (id: string): boolean => {
    const pp = nodeProps.get(id)
    return pp !== undefined && pp.algorithm !== undefined && normAlgId(pp.algorithm) !== 'layered'
  }
  const pbbOf = (ref: string): string | null => {
    let dot = ref.lastIndexOf('.')
    while (dot !== -1) {
      const prefix = ref.slice(0, dot)
      if (pIsNonLayered(prefix)) return prefix
      dot = prefix.lastIndexOf('.')
    }
    return null
  }
  for (const [s, sp, t, tp, yo, labels, thickness] of edges) {
    assertNoCrossHierarchyEdge(s, t, pbbOf, pIsNonLayered)
    const si = nodeIndexById[s]
    const ti = nodeIndexById[t]
    if (si === undefined || ti === undefined) continue
    const spIdx = sp === null ? -1 : (nodeProps.get(s)?.ports ?? []).findIndex(p => p.id === sp)
    const tpIdx = tp === null ? -1 : (nodeProps.get(t)?.ports ?? []).findIndex(p => p.id === tp)
    const defaultSide = ({ RIGHT: 'EAST', LEFT: 'WEST', DOWN: 'SOUTH', UP: 'NORTH' } as Record<string, string>)[GRAPH_DIRECTION] ?? 'EAST'
    const srcMerge = (spIdx < 0 || spIdx >= nodeOf.get(si)!.getPorts().length) && lcaGraphFor(si, ti).getProperty(MERGE_EDGES_KEY) === true
    const tgtMerge = (tpIdx < 0 || tpIdx >= nodeOf.get(ti)!.getPorts().length) && nodeOf.get(ti)!.getGraph()?.getProperty(MERGE_EDGES_KEY) === true
    const e = createSimpleEdge(nodeOf.get(si)!, nodeOf.get(ti)!, spIdx >= 0 ? spIdx : null, tpIdx >= 0 ? tpIdx : null, defaultSide, srcMerge, tgtMerge)
    if (yo === true) e.setProperty(INSIDE_SELF_LOOPS_YO_KEY, true)
    if (thickness !== undefined && thickness !== null) e.setProperty(EDGE_THICKNESS_KEY, thickness)
    if (labels !== undefined && labels !== null && labels.length > 0) {
      for (const l of labels) {
        e.getLabels().push({ text: l.text ?? '', position: { x: 0, y: 0 }, size: { x: l.width ?? 0, y: l.height ?? 0 }, placement: l.placement ?? undefined })
      }
    }
  }

  if (Object.keys(HIERARCHY).length > 0) graph.setProperty(HIERARCHY_HANDLING_KEY, 'INCLUDE_CHILDREN')
  graph.setProperty(DIRECTION_KEY, GRAPH_DIRECTION)

  // M0-B: 应用 elkt 顶层算法属性 (与 elkt2test 生成测试 graph.setProperty(...) 1:1).
  applyGraphPropsToLGraph(graph, graphProps)

  // B2: P2 与 P3/jar 输入对称 — 显式注入默认 randomSeed=1 (ELK Core.melk 默认; elktToElkJson 已注入,
  // 旧 P2 不注入 → 897/900 模型 P2/P3 属性不一致, verify-json-path 靠 DEFAULT_GP 放行掩盖).
  if (!graph.hasProperty(RANDOM_SEED_KEY)) graph.setProperty(RANDOM_SEED_KEY, 1)

  return { graph, nodeOf, nodeCount, edgeCount: edges.length, hasHierarchy: Object.keys(HIERARCHY).length > 0, name }
}

/** layoutOptions 长键/elkjs 短键 (elk.*) → elkt 短键 (OPT_MAP 反查, 别名如 spacing.labelPort → labelPortHorizontal).
 * R55: 补 elkjs 短键匹配 (m.elkjs === k) — elk.randomSeed 之前不命中 fallback 原样输出,
 * 消费端 graphProps.randomSeed 读不到 → RANDOM_SEED 恒默认 1. */
export function shortOptKeys(o: Record<string, unknown> = {}): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(o)) {
    let short = null
    for (const [ek, m] of Object.entries(OPT_MAP)) if (m.ggn === k || m.elkjs === k) { short = ek; break }
    out[short ?? k.replace(/^org\.eclipse\.elk\./, '').replace(/^layered\./, '')] = v
  }
  return out
}

export function elkJsonToParsed(
  json: ElkNodeJson,
  opts: { stripNPrefix?: boolean; blackBoxIds?: Set<string> } = {},
): ParsedGraph {
  // 契约 (默认): 输入是 elktToElkJson 输出 (节点 id = 'N' + 原始id, 端口 id = 'N' + 节点id + '.' + 短名).
  // 剥离 'N' 前缀依赖该契约; 喂外部 ELK JSON (id 恰以 N 开头) 会剥错 → 任意 JSON 用
  // elkJsonToParsed(json, { stripNPrefix: false }) — id 原样保留 (公开 API layoutElkJson 路径).
  const stripN = opts.stripNPrefix !== false
  // 黑盒节点 (非 layered 算法子树): 节点本身进入 layered 图 (作为叶子), 子节点不递归
  // (子树由对应 core provider 布局; layered 不处理其内容).
  const blackBoxIds = opts.blackBoxIds instanceof Set ? opts.blackBoxIds : new Set()
  const nodes: string[] = []
  // 跨层级边校验预计算 (R18/588): black-box 子树内全部节点 id (Java: 不在 layered nodeAndPortMap).
  // blackBoxIds 可能带 'N' 前缀 (elktToElkJson) 或已剥 (stripN) — 统一成与 ref 同 id-space.
  const blackBoxNorm = new Set<string>()
  for (const bb of blackBoxIds) blackBoxNorm.add(stripN ? String(bb).replace(/^N/, '') : String(bb))
  // 后代节点 id → 最近 black-box 容器 id (黑盒节点自身不在表内: Java 容器节点本身在 layered 表).
  const bbDesc = new Map<string, string>()
  if (blackBoxNorm.size > 0) {
    const walkBB = (n: ElkNodeJson, inside: string | null): void => {
      const id = stripN ? String(n.id).replace(/^N/, '') : String(n.id)
      const cur = blackBoxNorm.has(id) ? id : inside
      for (const c of n.children ?? []) {
        const cid = stripN ? String(c.id).replace(/^N/, '') : String(c.id)
        if (cur !== null) bbDesc.set(cid, cur)
        walkBB(c, cur)
      }
    }
    walkBB(json, null)
  }
  const edges: ParsedEdge[] = []
  const hierarchy = new Map<string, string[]>()
  const graphProps: Record<string, unknown> = {}
  const nodeProps = new Map<string, NodeProps>()
  const nodeSet = new Set<string>()

  const walk = (n: ElkNodeJson, parentId: string | null): void => {
    // elktToElkJson id = 'N' + 原始id (如 'NleftToRight') → 去 'N' 还原 (stripNPrefix=false 时原样保留)
    const id = stripN ? n.id.replace(/^N/, '') : n.id
    if (!nodeSet.has(id)) { nodeSet.add(id); nodes.push(id) }
    if (parentId !== null && parentId !== undefined) {
      const kids = hierarchy.get(parentId) ?? []
      if (!kids.includes(id)) kids.push(id)
      hierarchy.set(parentId, kids)
    }
    const p: NodeProps = { width: n.width ?? 60, height: n.height ?? 30, x: n.x, y: n.y }
    // 端口: id 取短名 (去 nodeId + '.'), properties → side/index/borderOffset (index 数字, 省略 = 未定义)
    // 非空才设 (与 parseElkt 结构一致, 避免 ports: [])
    const prefix = (stripN ? 'N' + id : id) + '.' // JSON 端口 id = 'N' + nodeId + '.' + 短名 (或 nodeId + '.' + 短名)
    const rawPorts = n.ports ?? []
    p.ports = rawPorts.map((pt: ElkPortJson): ParsedPort => {
      const prop = shortOptKeys(pt.properties ?? {})
      const out: ParsedPort = { id: (pt.id && pt.id.startsWith(prefix) ? pt.id.slice(prefix.length) : pt.id) as string, w: 0, h: 0 }
      if (pt.x !== undefined) out.x = pt.x
      if (pt.y !== undefined) out.y = pt.y
      // ELK Java JSON importer (JsonImporter.xtend transformShapeLayout) 对无 width/height 端口
      // 保持 ElkShape 默认 0×0（ElkShapeImpl EDEFAULT dconst_0）；ggn 此前 ?? 8 自创默认 8×8 →
      // 无连接 FREE 端口在容器布局中贡献 margin 8px，外层容器尺寸与 ELK Java 差 8（2026-08-16
      // G 场景实证：128×97 vs jar 128×89）。elkt 语料路径（buildLGraphFromParsed ?? 8）不受影响。
      out.w = pt.width ?? 0
      out.h = pt.height ?? 0
      // B9: elktToElkJson 把无显式 side 的端口发射为 'UNDEFINED' (Java 侧默认);
      // 原样保留会让 buildLGraphFromParsed 的 compound+FIXED 按位置定侧 (side===null 才触发) 失效.
      // Java 语义: PORT_SIDE=UNDEFINED = 未定 → importer 推断, 故映射回 null.
      if (prop['port.side'] !== undefined) out.side = prop['port.side'] === 'UNDEFINED' ? null : prop['port.side'] as string
      if (prop['port.index'] !== undefined) out.index = Number(prop['port.index'])
      if (prop['port.borderOffset'] !== undefined) out.borderOffset = Number(prop['port.borderOffset'])
      // ★ 端口标签 (SSOT 往返保真: elktToElkJson 发射 → elkJsonToParsed 读回; 701).
      const rawPL = pt.labels ?? []
      if (rawPL.length > 0) {
        out.labels = rawPL.map((l: ElkLabelJson) => {
          const ol: ParsedPortLabel = { text: l.text ?? '', width: l.width ?? 0, height: l.height ?? 0 }
          if (l.x !== undefined) { ol.x = l.x; ol.y = l.y }
          return ol
        })
      }
      return out
    })
    if (rawPorts.length === 0) delete p.ports
    // 标签: text/width/height/placement (layoutOptions 里 nodeLabels.placement); 非空才设
    const rawLabels = n.labels ?? []
    p.labels = rawLabels.map((l: ElkLabelJson): ParsedLabel => {
      const lopt = shortOptKeys(l.layoutOptions ?? {})
      const out: ParsedLabel = { text: l.text ?? '', width: l.width ?? 0, height: l.height ?? 0 }
      if (l.x !== undefined) out.x = l.x
      if (l.y !== undefined) out.y = l.y
      if (lopt['nodeLabels.placement'] !== undefined) out.placement = lopt['nodeLabels.placement'] as string
      return out
    })
    if (rawLabels.length === 0) delete p.labels
    // 节点选项 (layoutOptions → nodeProps 短键; 含 portConstraints/nodeSize.* 等)
    Object.assign(p, shortOptKeys(n.layoutOptions ?? {}))
    nodeProps.set(id, p)
    // 黑盒子树不递归 (核心 provider 已布局; 子节点不进 layered 图).
    if (blackBoxIds.has(n.id) || blackBoxIds.has(id)) return
    for (const c of n.children ?? []) walk(c, id)
  }
  for (const c of json.children ?? []) walk(c, null)
  Object.assign(graphProps, shortOptKeys(json.layoutOptions ?? {}))

  // edges: sources/targets[0] → [s, sp, t, tp, yo, labels, thickness]
  // 端点 ref 是 'N'+原始id[.端口]; 先去 'N', 再判断 完整节点 id (含点, 如 leftToRight.n1) vs 节点.端口
  const resolveRef = (ref: unknown): [string, string | null] => {
    const r = stripN ? String(ref ?? '').replace(/^N/, '') : String(ref ?? '')
    if (nodeSet.has(r)) return [r, null]
    const dot = r.lastIndexOf('.')
    if (dot !== -1 && nodeSet.has(r.slice(0, dot))) return [r.slice(0, dot), r.slice(dot + 1)]
    return [r, null]
  }
  // 递归收集所有容器的边 (ELK: 边挂 LCA 容器; elktToElkJson 全部提升到 root, 外部 JSON 可挂在任意层).
  // 黑盒子树 (box/fixed/random/force/stress 已由 core provider 布局) 的边不进 layered 图 —
  // 否则 attach 到容器的内部边会被解析成外部端口 dummy (665 实证: 黑盒节点多出 2 端口 → y+10).
  const collectEdges = (n: ElkNodeJson): void => {
    if (blackBoxIds.has(n.id) || blackBoxIds.has((stripN ? String(n.id).replace(/^N/, '') : n.id))) return
    for (const e of n.edges ?? []) {
      // R18/588: 复刻 Java 跨层级边报错 — 原始 ref (未解析) 就校验, 否则 black-box 后代会被
      // resolveRef 误解析成「黑盒节点 + 假端口」而漏报 (Java transformEdge 端点不在表内即抛).
      if (blackBoxNorm.size > 0) {
        const rawS = e.sources?.[0] ?? e.source
        const rawT = e.targets?.[0] ?? e.target
        if (rawS !== undefined && rawT !== undefined) {
          const normRef = (r: unknown): string => stripN ? String(r).replace(/^N/, '') : String(r)
          const bbOfRef = (ref: string): string | null => {
            if (bbDesc.has(ref)) return bbDesc.get(ref)!
            const dot = ref.lastIndexOf('.')
            if (dot !== -1 && bbDesc.has(ref.slice(0, dot))) return bbDesc.get(ref.slice(0, dot))!
            return null
          }
          assertNoCrossHierarchyEdge(normRef(rawS), normRef(rawT), bbOfRef, (id) => blackBoxNorm.has(id))
        }
      }
      const [s, sp] = resolveRef(e.sources?.[0] ?? e.source)
      const [t, tp] = resolveRef(e.targets?.[0] ?? e.target)
      const prop = shortOptKeys(e.properties ?? {})
    const yo = prop['insideSelfLoops.yo'] === 'true'
    const thickness = prop['edge.thickness'] !== undefined ? Number(prop['edge.thickness']) : null
    const labels = (e.labels ?? []).map((l) => {
      // B8: elktToElkJson 把 placement 发射到 layoutOptions['org.eclipse.elk.edgeLabels.placement'],
      // 旧代码只读 l.placement → P3 丢边标签 placement (edge_label_placement 族全部丢失).
      const lopt = shortOptKeys(l.layoutOptions ?? {})
      const placement = (lopt['edgeLabels.placement'] ?? l.placement ?? null) as string | null
      return { text: l.text ?? '', width: l.width ?? 0, height: l.height ?? 0, placement }
    })
      edges.push([s, sp, t, tp, yo, labels, thickness])
    }
    for (const c of n.children ?? []) collectEdges(c)
  }
  collectEdges(json)
  return { nodes, edges, hierarchy, graphProps, nodeProps }
}

export function buildLGraphFromElkJson(json: ElkNodeJson, name = 'graph') {
  return buildLGraphFromParsed(elkJsonToParsed(json), name)
}
