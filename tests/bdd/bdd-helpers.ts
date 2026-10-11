/**
 * BDD 共享 helper — 直接 vitest 写法的建图/布局/断言工具.
 *
 * 由 gherkin-runner.test.ts 的正则 step 注册表迁移而来:
 *   - 每个 step → 一个类型化方法/函数 (Harness 方法 = 建图/执行, 导出函数 = 断言);
 *   - 无正则/无全局注册表/无 world 中间态, 参数类型安全, 报错直接指向断言行.
 * 语义与迁移前完全一致 (55 个场景全绿后迁移, 行为等价).
 */
import { expect } from 'vitest'
import { LGraph, LNode, LPort, LEdge, Layer, LayeredLayoutProvider, PortSide, getEdgeEndpoints } from '../../src/index.js'
import { isDescendant } from '../../src/graph/lgraph-util.js'
import type { LEdgeLabel } from '../../src/graph/ledge.js'
import { NodeType, PortConstraints } from '../../src/graph/enums.js'
import {
  EXT_PORT_SIDE, EXT_PORT_REPLACED_DUMMY, EXT_PORT_REPLACED_DUMMIES, RANDOM,
} from '../../src/options/internal-properties.js'
import {
  HIERARCHY_HANDLING, DIRECTION, PORT_CONSTRAINTS, SPACING_NODE_NODE, SPACING_EDGE_EDGE,
} from '../../src/options/layered-options.js'
import { JavaRandom } from '../../src/util/java-random.js'
import {
  processHierarchicalPortOrthogonalRouting, countRoutingSlots, restoreNorthSouthDummies, setNorthSouthDummyCoordinates,
} from '../../src/intermediate/hierarchical-port-orthogonal-edge-router.js'

// ── Harness: 建图 + 布局执行 (原 World + 建图/执行 step) ──

export interface NSSpec {
  side: PortSide
  groups: number[][]
  nodeSpacing: number
  edgeSpacing: number
  originals: LNode[]
  temps: LNode[]
  beforeOffsetY: number
  beforeSizeY: number
  beforeOffsetX: number
  beforeSizeX: number
  expectedExtPorts: number
  northSlots: number
  southSlots: number
}

export class Harness {
  readonly root = new LGraph()
  readonly nodes = new Map<string, LNode>()
  readonly ports = new Map<string, LPort>()
  readonly edges: LEdge[] = []
  readonly edgeLabels: { edge: LEdge; label: LEdgeLabel }[] = []
  readonly hierarchy = new Map<LNode, LGraph>()
  /** P1 断环后布局图是否无环 (ELK: 输出边会被 ReversedEdgeRestorer 恢复原方向, 最终图可能仍有环). */
  p1Acyclic = true
  /** N-S 外部端口路由场景状态 (直接建图 harness; 其余场景为 null). */
  ns: NSSpec | null = null

  /** 创建普通节点 (名字按逗号/空白拆分). */
  node(...names: string[]): this {
    for (const name of names.flatMap(n => n.split(/[,\s]+/)).filter(Boolean)) {
      const n = new LNode(this.root); n.size = { x: 60, y: 30 }
      this.nodes.set(name, n)
    }
    return this
  }

  /** 建边 (逗号分隔); 端点若已注册为具名端口 (复合节点端口) 直接复用. */
  edge(...specs: string[]): this {
    for (const raw of specs.flatMap(x => x.split(','))) {
      const m = raw.trim().match(/^(\w+)\s*→\s*(\w+)$/)
      if (!m) throw new Error(`无法解析边: ${raw}`)
      const [src, tgt] = [m[1]!, m[2]!]
      const sp = this.ports.get(src) ?? (() => { const p = new LPort(); p.setNode(this.nodes.get(src)!); return p })()
      const tp = this.ports.get(tgt) ?? (() => { const p = new LPort(); p.setNode(this.nodes.get(tgt)!); return p })()
      const e = new LEdge(); e.setSource(sp); e.setTarget(tp)
      this.edges.push(e)
    }
    return this
  }

  /** 建边 + 附一个边标签 (placement: CENTER/HEAD/TAIL). */
  edgeWithLabel(edgeSpec: string, placement: string): this {
    const [src, tgt] = edgeSpec.split('→')
    const sp = this.ports.get(src) ?? (() => { const p = new LPort(); p.setNode(this.nodes.get(src)!); return p })()
    const tp = this.ports.get(tgt) ?? (() => { const p = new LPort(); p.setNode(this.nodes.get(tgt)!); return p })()
    const e = new LEdge(); e.setSource(sp); e.setTarget(tp)
    this.edges.push(e)
    const label: LEdgeLabel = { text: placement + '-label', position: { x: 0, y: 0 }, size: { x: 40, y: 16 }, placement: placement === 'CENTER' ? 'CENTER' : placement }
    e.getLabels().push(label)
    this.edgeLabels.push({ edge: e, label })
    return this
  }

  /** 复合节点 + 子节点 (子节点进嵌套图, 尺寸 40x20). */
  compound(parent: string, ...children: string[]): this {
    const p = this.nodes.get(parent) ?? (() => { const n = new LNode(this.root); n.size = { x: 60, y: 30 }; this.nodes.set(parent, n); return n })()
    const nested = new LGraph()
    p.setNestedGraph(nested)
    nested.setParentNode(p)
    this.hierarchy.set(p, nested)
    for (const name of children.flatMap(c => c.split(/[,\s]+/)).filter(Boolean)) {
      const c = new LNode(nested); c.size = { x: 40, y: 20 }
      this.nodes.set(name, c)
    }
    return this
  }

  /** 节点带 FIXED_SIDE 端口 (specs: [端口名, 侧] 列表). */
  fixedSidePorts(node: string, ...specs: [string, string][]): this {
    const n = this.nodes.get(node) ?? (() => { const nn = new LNode(this.root); nn.size = { x: 60, y: 30 }; this.nodes.set(node, nn); return nn })()
    n.setProperty(PORT_CONSTRAINTS, PortConstraints.FIXED_SIDE)
    for (const [name, side] of specs) {
      const port = new LPort(); port.setNode(n); port.setSide(side as PortSide); port.size = { x: 8, y: 8 }
      this.ports.set(name, port)
    }
    return this
  }

  direction(dir: string): this {
    this.root.setProperty(DIRECTION, dir.trim().toUpperCase())
    return this
  }

  orthogonalRouting(): this {
    this.root.setProperty('org.eclipse.elk.edgeRouting', 'ORTHOGONAL')
    return this
  }

  /** 设置 edgeRouting=SPLINES (后压缩的前置). */
  splinesRouting(): this {
    this.root.setProperty('org.eclipse.elk.edgeRouting', 'SPLINES')
    return this
  }

  /** 设置 postCompaction.strategy (LEFT/RIGHT/NONE 等). */
  postCompaction(strategy: string): this {
    this.root.setProperty('org.eclipse.elk.layered.compaction.postCompaction.strategy', strategy)
    return this
  }

  /** 执行分层布局: 有层级时自动 INCLUDE_CHILDREN, 并记录 P1 断环后是否无环. */
  layout(): this {
    if (this.hierarchy.size > 0) this.root.setProperty(HIERARCHY_HANDLING, 'INCLUDE_CHILDREN')
    const provider = new LayeredLayoutProvider()
    provider.setHooks({ afterPhase: (phase, graph) => { if (phase === 'P1') this.p1Acyclic = isAcyclicGraph(graph) } })
    provider.layout(this.root)
    return this
  }

  /** 执行分层布局 (强制 INCLUDE_CHILDREN). */
  layoutIncludeChildren(): this {
    this.root.setProperty(HIERARCHY_HANDLING, 'INCLUDE_CHILDREN')
    new LayeredLayoutProvider().layout(this.root)
    return this
  }
}

// ── 基础图工具 ──

export function nameOf(h: Harness, n: LNode): string {
  for (const [k, v] of h.nodes) if (v === n) return k
  return String(n.id)
}

export function worldPosNode(n: LNode): { x: number; y: number } {
  let x = n.position.x, y = n.position.y
  let g = n.getGraph()
  while (g && g.getParentNode()) {
    const p = g.getParentNode()!
    x += p.position.x; y += p.position.y
    g = p.getGraph()
  }
  return { x, y }
}

export function worldPos(h: Harness, name: string): { x: number; y: number } {
  return worldPosNode(h.nodes.get(name)!)
}

export function layerOfNode(n: LNode): number { return n.getLayer()?.getIndex() ?? -1 }

export function isAcyclicGraph(g: LGraph): boolean {
  const seen = new Set<LNode>(), inPath = new Set<LNode>()
  const dfs = (n: LNode): boolean => {
    if (inPath.has(n)) return false
    if (seen.has(n)) return true
    inPath.add(n); seen.add(n)
    for (const e of n.getOutgoingEdges()) {
      const t = e.getTarget()?.getNode()
      if (t && t !== n && !dfs(t)) return false
    }
    inPath.delete(n)
    return true
  }
  for (const l of g.getLayers()) for (const n of l.getNodes()) if (!seen.has(n) && !dfs(n)) return false
  for (const n of g.getLayerlessNodes()) if (!seen.has(n) && !dfs(n)) return false
  return true
}

// ── 核心布局断言 ──

export function expectLayered(h: Harness): void {
  for (const n of h.nodes.values()) expect(layerOfNode(n), `${nameOf(h, n)} 无层`).toBeGreaterThanOrEqual(0)
}

export function expectLayerOrderNonDecreasing(h: Harness): void {
  for (const e of h.edges) {
    const s = e.getSource()!.getNode()!, t = e.getTarget()!.getNode()!
    expect(layerOfNode(t), `边 ${nameOf(h, s)}→${nameOf(h, t)} 目标层 < 源层`).toBeGreaterThanOrEqual(layerOfNode(s))
  }
}

/** P1 断环后布局图无环 (最终图被 ReversedEdgeRestorer 恢复原方向, 可能仍有环 — 检查 P1 阶段标志). */
export function expectP1Acyclic(h: Harness): void {
  expect(h.p1Acyclic, 'P1 断环后布局图应无环 (输出边恢复原方向后可能仍有环)').toBe(true)
}

/** 布局后最终图无环 (N-S 直接建图场景用). */
export function expectAcyclic(h: Harness): void {
  expect(isAcyclicGraph(h.root)).toBe(true)
}

export function expectNoOverlap(h: Harness): void {
  const all = [...h.nodes.values()]
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    const a = all[i]!, b = all[j]!
    if (a.getGraph() === b.getGraph() && a.getLayer() === b.getLayer()) continue
    const pa = worldPosNode(a), pb = worldPosNode(b)
    const ox = pa.x < pb.x + b.size.x && pa.x + a.size.x > pb.x
    const oy = pa.y < pb.y + b.size.y && pa.y + a.size.y > pb.y
    expect(ox && oy, `${nameOf(h, a)} 与 ${nameOf(h, b)} 重叠`).toBe(false)
  }
}

export function expectFiniteCoords(h: Harness): void {
  for (const n of h.nodes.values()) {
    expect(Number.isFinite(n.position.x), `${nameOf(h, n)} x`).toBe(true)
    expect(Number.isFinite(n.position.y), `${nameOf(h, n)} y`).toBe(true)
  }
}

export function expectPositiveSizes(h: Harness): void {
  for (const n of h.nodes.values()) {
    expect(n.size.x).toBeGreaterThan(0)
    expect(n.size.y).toBeGreaterThan(0)
  }
}

export function expectSourceRelative(h: Harness, s: string, t: string, pos: 'left' | 'right' | 'above' | 'below'): void {
  const a = worldPos(h, s), b = worldPos(h, t)
  if (pos === 'left') expect(a.x).toBeLessThan(b.x)
  else if (pos === 'right') expect(a.x).toBeGreaterThan(b.x)
  else if (pos === 'above') expect(a.y).toBeLessThan(b.y)
  else expect(a.y).toBeGreaterThan(b.y)
}

export function expectIsolatedPositioned(h: Harness, c: string): void {
  const n = h.nodes.get(c)!
  expect(Number.isFinite(n.position.x)).toBe(true)
  expect(Number.isFinite(n.position.y)).toBe(true)
}

// ── 复合/端口断言 ──

export function expectParentContains(h: Harness, parent: string, c1: string, c2: string): void {
  const p = worldPos(h, parent), pn = h.nodes.get(parent)!
  for (const c of [c1, c2]) {
    const cn = h.nodes.get(c)!, cp = worldPos(h, c)
    expect(cp.x).toBeGreaterThanOrEqual(p.x - 1e-6)
    expect(cp.y).toBeGreaterThanOrEqual(p.y - 1e-6)
    expect(cp.x + cn.size.x).toBeLessThanOrEqual(p.x + pn.size.x + 1e-6)
    expect(cp.y + cn.size.y).toBeLessThanOrEqual(p.y + pn.size.y + 1e-6)
  }
}

export function expectParentSizeSufficient(h: Harness, parent: string): void {
  const pn = h.nodes.get(parent)!, p = worldPos(h, parent)
  for (const [cnode] of h.hierarchy.get(pn)?.getAllNodes().map(n => [[n, worldPosNode(n)]]) ?? []) {
    const [cn, cp] = cnode as [LNode, { x: number; y: number }]
    expect(cp.x + cn.size.x).toBeLessThanOrEqual(p.x + pn.size.x + 1e-6)
    expect(cp.y + cn.size.y).toBeLessThanOrEqual(p.y + pn.size.y + 1e-6)
  }
}

export function expectPortSide(h: Harness, p: string, side: string): void {
  expect(h.ports.get(p)!.getSide()).toBe(side)
}

export function expectPortOnBoundary(h: Harness, p: string, node: string): void {
  const port = h.ports.get(p)!, n = h.nodes.get(node)!
  const anchor = port.getAbsoluteAnchor()
  const p0 = worldPos(h, node)
  const tol = 1e-6
  // 端口贴节点边界: 锚点在边界 ± 端口尺寸内 (NORTH/WEST 端口外缘锚点在节点外).
  const ps = port.size
  const onX = Math.abs(anchor.x - p0.x) <= ps.x + tol || Math.abs(anchor.x - (p0.x + n.size.x)) <= ps.x + tol
  const onY = Math.abs(anchor.y - p0.y) <= ps.y + tol || Math.abs(anchor.y - (p0.y + n.size.y)) <= ps.y + tol
  expect(onX || onY, `端口 ${p} 不在节点 ${node} 边界 (anchor=${anchor.x},${anchor.y}, node=(${p0.x},${p0.y}) size=${n.size.x}x${n.size.y})`).toBe(true)
}

// ── 边标签断言 ──

export function expectEdgeLabelFinite(h: Harness): void {
  for (const { label } of h.edgeLabels) {
    expect(Number.isFinite(label.position.x), 'label x').toBe(true)
    expect(Number.isFinite(label.position.y), 'label y').toBe(true)
  }
}

export function expectEdgeLabelSizes(h: Harness): void {
  for (const { label } of h.edgeLabels) {
    expect(label.size.x, 'label w').toBeGreaterThan(0)
    expect(label.size.y, 'label h').toBeGreaterThan(0)
  }
}

// ── N-S 外部端口正交路由 (HierarchicalPortOrthogonalEdgeRouter) ──

/** 布局规格: 每组 "; " 分隔 = 一个原始外部端口 dummy, 组内 "," = 该 dummy 的临时替换 dummy x. */
export function parseNSLayout(layout: string): number[][] {
  return layout.split(';').map(g => g.split(',').map(x => Number(x.trim())).filter(Number.isFinite))
}

export function graphNodesUnique(g: LGraph): LNode[] {
  // LNode(graph) 会同时进 layerlessNodes, getAllNodes 会重复; 用 Set 去重.
  return [...new Set(g.getAllNodes())]
}

/** 层内的外部端口 dummy (唯一). 已移除 (setLayer(null)) 的临时 dummy 不在任何层, 不计数. */
export function extDummies(h: Harness): LNode[] {
  const out: LNode[] = []
  const seen = new Set<LNode>()
  const collect = (g: LGraph) => {
    for (const l of g.getLayers()) {
      for (const n of l.getNodes()) {
        if (n.getType() === NodeType.EXTERNAL_PORT && !seen.has(n)) { seen.add(n); out.push(n) }
      }
    }
  }
  collect(h.root)
  for (const child of h.hierarchy.values()) collect(child)
  return out
}

/** 构建 N-S 路由场景图: L0=[源 S], L1=[临时 dummy]; 原始 dummy 先不入层 (Step1 归入末层). */
export function buildNSRoutingGraph(
  h: Harness, spec: { side: PortSide; groups: number[][]; nodeSpacing: number; edgeSpacing: number },
  opts: { withEW?: boolean; graphWidth?: number } = {},
): void {
  const g = h.root
  g.setProperty(PORT_CONSTRAINTS, PortConstraints.FIXED_SIDE)
  g.setProperty(SPACING_NODE_NODE, spec.nodeSpacing)
  g.setProperty(SPACING_EDGE_EDGE, spec.edgeSpacing)
  g.setProperty(RANDOM, new JavaRandom(0))
  if (opts.graphWidth !== undefined) g.getSize().x = opts.graphWidth
  const l0 = new Layer(g); g.getLayers().push(l0)
  const l1 = new Layer(g); g.getLayers().push(l1)
  const src = new LNode(); src.setType(NodeType.NORMAL); src.size = { x: 60, y: 30 }
  src.setLayer(l0); src.getPosition().y = 10
  const sp = new LPort(); sp.setNode(src); sp.setSide(PortSide.EAST); sp.getPosition().y = 15

  const originals: LNode[] = []
  const temps: LNode[] = []
  for (const xs of spec.groups) {
    const orig = new LNode(); orig.setType(NodeType.EXTERNAL_PORT)
    orig.setProperty(EXT_PORT_SIDE, spec.side); orig.size = { x: 0, y: 0 }
    const origPort = new LPort(); origPort.setNode(orig)
    origPort.setSide(spec.side === PortSide.NORTH ? PortSide.SOUTH : PortSide.NORTH)
    originals.push(orig)
    for (const tx of xs) {
      const temp = new LNode(); temp.setType(NodeType.EXTERNAL_PORT)
      temp.setProperty(EXT_PORT_REPLACED_DUMMY, orig)
      temp.setProperty(EXT_PORT_SIDE, spec.side)
      temp.setProperty(PORT_CONSTRAINTS, PortConstraints.FIXED_POS)
      temp.setLayer(l1); temp.getPosition().x = tx; temp.getPosition().y = 0
      const inPort = new LPort(); inPort.setNode(temp); inPort.setSide(PortSide.WEST)
      const outPort = new LPort(); outPort.setNode(temp); outPort.setSide(PortSide.EAST)
      const e = new LEdge(); e.setSource(sp); e.setTarget(inPort)
      h.edges.push(e)
      temps.push(temp)
    }
  }

  let expectedExtPorts = originals.length
  if (opts.withEW) {
    const west = new LNode(); west.setType(NodeType.EXTERNAL_PORT)
    west.setProperty(EXT_PORT_SIDE, PortSide.WEST); west.size = { x: 0, y: 8 }; west.setLayer(l0); west.getPosition().y = 10
    const wp = new LPort(); wp.setNode(west); wp.setSide(PortSide.EAST)
    const east = new LNode(); east.setType(NodeType.EXTERNAL_PORT)
    east.setProperty(EXT_PORT_SIDE, PortSide.EAST); east.size = { x: 0, y: 8 }; east.setLayer(l1); east.getPosition().y = 10
    const ep = new LPort(); ep.setNode(east); ep.setSide(PortSide.WEST)
    expectedExtPorts += 2
  }

  g.setProperty(EXT_PORT_REPLACED_DUMMIES, originals)
  h.ns = {
    side: spec.side, groups: spec.groups,
    nodeSpacing: spec.nodeSpacing, edgeSpacing: spec.edgeSpacing,
    originals, temps,
    beforeOffsetY: g.getOffset().y, beforeSizeY: g.getSize().y,
    beforeOffsetX: g.getOffset().x, beforeSizeX: g.getSize().x,
    expectedExtPorts, northSlots: 0, southSlots: 0,
  }
}

/** 执行 N-S 外部端口正交路由: 槽数在独立探针图上按 ELK Step1+2 顺序计算, 避免污染主图. */
export function runNSRouting(h: Harness): void {
  const spec = h.ns!
  const probe = new Harness()
  buildNSRoutingGraph(probe, { side: spec.side, groups: spec.groups, nodeSpacing: spec.nodeSpacing, edgeSpacing: spec.edgeSpacing })
  const dummies = restoreNorthSouthDummies(probe.root)
  setNorthSouthDummyCoordinates(probe.root, dummies)
  const { northSlots, southSlots } = countRoutingSlots(probe.root, dummies)
  h.ns!.northSlots = northSlots
  h.ns!.southSlots = southSlots
  processHierarchicalPortOrthogonalRouting(h.root)
}

/** ELK Step3 routeEdges: slots>0 → nodeSpacing + (slots-1)*edgeSpacing; slots=0 (直线边) → 0. */
export function expectNSOffsetAndSize(h: Harness, side: string, slots: number): void {
  const ns = h.root.getProperty(SPACING_NODE_NODE)
  const es = h.root.getProperty(SPACING_EDGE_EDGE)
  const expected = slots > 0 ? ns + (slots - 1) * es : 0
  const dOffY = h.root.getOffset().y - h.ns!.beforeOffsetY
  const dSizeY = h.root.getSize().y - h.ns!.beforeSizeY
  if (side === 'NORTH') {
    expect(h.ns!.northSlots, `实际 NORTH 槽数 ${h.ns!.northSlots} ≠ ${slots}`).toBe(slots)
    expect(dOffY, `NORTH 路由后 offset.y 增量 ${dOffY} ≠ ${expected}`).toBe(expected)
    expect(dSizeY, `NORTH 路由后 size.y 增量 ${dSizeY} ≠ ${expected}`).toBe(expected)
  } else {
    expect(h.ns!.southSlots, `实际 SOUTH 槽数 ${h.ns!.southSlots} ≠ ${slots}`).toBe(slots)
    expect(dOffY, `SOUTH 路由不应改变 offset.y (增量 ${dOffY})`).toBe(0)
    expect(dSizeY, `SOUTH 路由后 size.y 增量 ${dSizeY} ≠ ${expected}`).toBe(expected)
  }
}

/** N/S 外部端口 dummy 定位 (ggn 语义, 坐标系适配: NORTH.y = -offset.y). */
export function expectNSDummyPosition(h: Harness, side: string): void {
  const pad = h.root.getPadding()
  const off = h.root.getOffset()
  const size = h.root.getSize()
  for (const n of extDummies(h)) {
    if (n.getProperty(EXT_PORT_SIDE) !== side) continue
    if (side === 'NORTH') {
      // 语义等价性 (坐标系适配, 非差异): ggn pre-padding 坐标 northY = -offset.y,
      // ELK content 坐标 northY = -padding.top - offset.y; padding 由 resizeParentNode 单独计入,
      // 两者经 resize 后 dummy 均落在父节点顶边 (y=0, 端口 y=-portHeight). 此处断言 ggn 语义值.
      expect(n.getPosition().y, `NORTH dummy y=${n.getPosition().y} ≠ -offset.y (ggn 语义)`).toBe(-off.y)
    } else {
      const expectedY = size.y + pad.top + pad.bottom - off.y
      expect(n.getPosition().y, `SOUTH dummy y=${n.getPosition().y} ≠ size.y+pad.top+pad.bottom-offset.y=${expectedY}`).toBe(expectedY)
    }
  }
}

/** ELK Step5 fixCoordinates: WEST.x = -offset.x - padding.left. */
export function expectWESTDummyX(h: Harness): void {
  const expectedX = -h.root.getOffset().x - h.root.getPadding().left
  for (const n of extDummies(h)) {
    if (n.getProperty(EXT_PORT_SIDE) !== PortSide.WEST) continue
    expect(n.getPosition().x, `WEST dummy x=${n.getPosition().x} ≠ ${expectedX}`).toBe(expectedX)
  }
}

/** ELK Step5 fixCoordinates: EAST.x = size.x + padding.right - offset.x. */
export function expectEASTDummyX(h: Harness): void {
  const expectedX = h.root.getSize().x + h.root.getPadding().right - h.root.getOffset().x
  for (const n of extDummies(h)) {
    if (n.getProperty(EXT_PORT_SIDE) !== PortSide.EAST) continue
    expect(n.getPosition().x, `EAST dummy x=${n.getPosition().x} ≠ ${expectedX}`).toBe(expectedX)
  }
}

/** ELK Step4 removeTemporaryNorthSouthDummies: 临时 dummy 的入/出边重连到原始 dummy. */
export function expectOriginalsHoldEdges(h: Harness): void {
  const originals = h.ns!.originals
  const origSet = new Set(originals)
  for (const e of h.edges) {
    expect(e.getSource(), '重连边缺少 source').toBeTruthy()
    expect(e.getTarget(), '重连边缺少 target').toBeTruthy()
    const srcNode = e.getSource()!.getNode()
    const tgtNode = e.getTarget()!.getNode()
    expect(srcNode, '重连边源节点已移除').toBeTruthy()
    expect(tgtNode, '重连边目标节点已移除').toBeTruthy()
    expect(tgtNode!.hasProperty(EXT_PORT_REPLACED_DUMMY), '边仍连到临时 dummy').toBe(false)
    expect(origSet.has(tgtNode!), '边未重连到原始外部端口 dummy').toBe(true)
  }
  const port0 = originals[0]!.getPorts()[0]!
  expect(port0.getIncomingEdges().length, `原始 dummy 入边数 ${port0.getIncomingEdges().length} ≠ ${h.edges.length}`).toBe(h.edges.length)
}

// ── 结构不变量 (N-S 场景通用) ──

/** 所有可达边 (经端口) 的 source/target 均存在且端点节点未被移除. */
export function expectNoDanglingEdges(h: Harness): void {
  const seen = new Set<LEdge>()
  const check = (g: LGraph) => {
    for (const n of graphNodesUnique(g)) {
      for (const p of n.getPorts()) {
        for (const e of [...p.getIncomingEdges(), ...p.getOutgoingEdges()]) {
          if (seen.has(e)) continue
          seen.add(e)
          expect(e.getSource(), '悬挂边: source 缺失').toBeTruthy()
          expect(e.getTarget(), '悬挂边: target 缺失').toBeTruthy()
          expect(e.getSource()!.getNode(), '悬挂边: 源节点已移除').toBeTruthy()
          expect(e.getTarget()!.getNode(), '悬挂边: 目标节点已移除').toBeTruthy()
        }
      }
    }
  }
  check(h.root)
  for (const child of h.hierarchy.values()) check(child)
}

/** 层内不再存在 EXT_PORT_REPLACED_DUMMY 节点; 直接建图场景还要求外部端口 dummy 数量回到原始数. */
export function expectTempDummiesRemoved(h: Harness): void {
  const dummies = extDummies(h)
  for (const d of dummies) {
    expect(d.hasProperty(EXT_PORT_REPLACED_DUMMY), '存在未移除的临时替换 dummy').toBe(false)
  }
  if (h.ns !== null) {
    expect(dummies.length, `外部端口 dummy 数量 ${dummies.length} ≠ 原始数 ${h.ns.expectedExtPorts}`).toBe(h.ns.expectedExtPorts)
  }
}

/** NORTH: 内容区顶部 (y=0) 之上或齐平; SOUTH: 内容区底部 (size.y) 之下或齐平. */
export function expectExtDummiesOutside(h: Harness): void {
  for (const d of extDummies(h)) {
    const side = d.getProperty(EXT_PORT_SIDE)
    const sizeY = d.getGraph()?.getSize().y ?? 0
    if (side === PortSide.NORTH) {
      expect(d.getPosition().y, `NORTH dummy y=${d.getPosition().y} 侵入内容区 (顶部之上或齐平)`).toBeLessThanOrEqual(0)
    } else if (side === PortSide.SOUTH) {
      expect(d.getPosition().y, `SOUTH dummy y=${d.getPosition().y} 未达内容区底部 ${sizeY}`).toBeGreaterThanOrEqual(sizeY)
    }
  }
}

export function expectFiniteGraph(h: Harness): void {
  for (const n of graphNodesUnique(h.root)) {
    expect(Number.isFinite(n.position.x), `${nameOf(h, n)} x`).toBe(true)
    expect(Number.isFinite(n.position.y), `${nameOf(h, n)} y`).toBe(true)
    expect(Number.isFinite(n.size.x), `${nameOf(h, n)} size.x`).toBe(true)
    expect(Number.isFinite(n.size.y), `${nameOf(h, n)} size.y`).toBe(true)
    for (const p of n.getPorts()) {
      expect(Number.isFinite(p.getPosition().x), `${nameOf(h, n)} 端口 x`).toBe(true)
      expect(Number.isFinite(p.getPosition().y), `${nameOf(h, n)} 端口 y`).toBe(true)
      for (const e of [...p.getIncomingEdges(), ...p.getOutgoingEdges()]) {
        for (const bp of e.getBendPoints()) {
          expect(Number.isFinite(bp.x), `${nameOf(h, n)} 弯点 x`).toBe(true)
          expect(Number.isFinite(bp.y), `${nameOf(h, n)} 弯点 y`).toBe(true)
        }
      }
    }
  }
}

// ── 正交边路由 (与 ELK Java 输出一致 + 算法不变量) ──

export function edgeByName(h: Harness, src: string, tgt: string): LEdge {
  const s = h.nodes.get(src)
  const t = h.nodes.get(tgt)
  if (!s || !t) throw new Error(`未知节点 ${src}->${tgt}`)
  const e = h.edges.find(x => x.getSource()?.getNode() === s && x.getTarget()?.getNode() === t)
  if (!e) throw new Error(`边 ${src}->${tgt} 未创建`)
  return e
}

/** 边路由点序列 = [源端点, ...弯点, 目标端点] (跨层级边用 getEdgeEndpoints 统一坐标系). */
function edgeRoutePoints(e: LEdge): { x: number; y: number }[] {
  const { source, target } = getEdgeEndpoints(e)
  return [source, ...e.getBendPoints(), target]
}

/** 检查边路由是否正交: 相邻段必须交替水平/垂直 (容差 0.05, 对应 ELK TOLERANCE). */
function orthoRouteProblems(e: LEdge): string[] {
  const pts = edgeRoutePoints(e)
  const problems: string[] = []
  if (pts.length < 2) {
    problems.push(`边 ${e.id}: 路由点少于 2`)
    return problems
  }
  let horizontal = Math.abs(pts[0]!.y - pts[1]!.y) <= 0.05
  let prev = pts[0]!
  for (let i = 1; i < pts.length; i++) {
    const cur = pts[i]!
    if (horizontal) {
      if (Math.abs(prev.y - cur.y) > 0.05) {
        problems.push(`边 ${e.id}: 期望水平段 (${prev.x.toFixed(1)},${prev.y.toFixed(1)})->(${cur.x.toFixed(1)},${cur.y.toFixed(1)})`)
      }
    } else if (Math.abs(prev.x - cur.x) > 0.05) {
      problems.push(`边 ${e.id}: 期望垂直段 (${prev.x.toFixed(1)},${prev.y.toFixed(1)})->(${cur.x.toFixed(1)},${cur.y.toFixed(1)})`)
    }
    horizontal = !horizontal
    prev = cur
  }
  return problems
}

/** 线段与轴对齐矩形严格相交 (不含边界接触; 边从端口出发贴着节点边界不算穿过). */
function segmentIntersectsRect(a: { x: number; y: number }, b: { x: number; y: number }, r: { x: number; y: number; w: number; h: number }): boolean {
  const minX = Math.min(a.x, b.x), maxX = Math.max(a.x, b.x)
  const minY = Math.min(a.y, b.y), maxY = Math.max(a.y, b.y)
  // AABB 无交集 (含边界接触不算相交)
  if (maxX <= r.x || minX >= r.x + r.w || maxY <= r.y || minY >= r.y + r.h) return false
  if (Math.abs(a.y - b.y) < 1e-9) {
    // 水平段: y 在矩形内部 (严格) 且 x 区间与矩形内部有重叠
    return a.y > r.y && a.y < r.y + r.h && maxX > r.x && minX < r.x + r.w
  }
  if (Math.abs(a.x - b.x) < 1e-9) {
    return a.x > r.x && a.x < r.x + r.w && maxY > r.y && minY < r.y + r.h
  }
  return true
}

export function expectBendPoints(h: Harness, src: string, tgt: string, expected: [number, number][]): void {
  const e = edgeByName(h, src, tgt)
  expect(e.getBendPoints().map(b => [b.x, b.y]), `边 ${src}->${tgt} 弯点`).toEqual(expected)
}

export function expectNoBendPoints(h: Harness, src: string, tgt: string): void {
  expect(edgeByName(h, src, tgt).getBendPoints(), `边 ${src}->${tgt} 弯点`).toEqual([])
}

export function expectOrtho(h: Harness): void {
  const problems: string[] = []
  for (const e of h.edges) problems.push(...orthoRouteProblems(e))
  expect(problems, problems.join('\n')).toEqual([])
}

export function expectOrthoHierarchical(h: Harness): void {
  const problems: string[] = []
  for (const e of h.edges) {
    const s = e.getSource()?.getNode(), t = e.getTarget()?.getNode()
    if (!s || !t || s === t) continue
    if (!isDescendant(t, s) && !isDescendant(s, t)) continue
    problems.push(...orthoRouteProblems(e))
  }
  expect(problems, problems.join('\n')).toEqual([])
}

export function expectNoEdgeNodeIntersections(h: Harness): void {
  const boxes = [...h.nodes.values()].map(n => ({ x: n.position.x, y: n.position.y, w: n.size.x, h: n.size.y }))
  const problems: string[] = []
  for (const e of h.edges) {
    const pts = edgeRoutePoints(e)
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]!, b = pts[i]!
      for (const box of boxes) {
        if (segmentIntersectsRect(a, b, box)) {
          problems.push(`边 ${e.id} 段 (${a.x.toFixed(1)},${a.y.toFixed(1)})->(${b.x.toFixed(1)},${b.y.toFixed(1)}) 与节点盒相交`)
        }
      }
    }
  }
  expect(problems, problems.join('\n')).toEqual([])
}
