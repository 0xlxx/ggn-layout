/*
 * Copyright (c) 2010, 2015 Kiel University and others.
 * Copyright (c) 2026 GGN contributors.
 *
 * This file is part of ggn-layout, a TypeScript port of the Eclipse Layout
 * Kernel (ELK, https://github.com/eclipse/elk). It is derived from ELK and is
 * made available under the terms of the Eclipse Public License 2.0.
 *
 * SPDX-License-Identifier: EPL-2.0
 * License text: LICENSES/EPL-2.0.txt — see also THIRD_PARTY_NOTICES.md.
 */
/**
 * mrtree 图结构 — ELK alg.mrtree graph 包 0.12.0.
 *
 * - TGraphElement: MapPropertyHolder 等价物 (props 表, get/set).
 * - TShape: 有位置/尺寸的元素 (pos/size 为 KVector).
 * - TNode/TEdge/TLabel/TGraph: 树图结构 (parent = incoming[0].source, children = outgoing targets).
 *
 * InternalProperties 常量与 TGraph/TNode 等一一对应 Java.
 */
import { KVector } from '../force/kvector.js'
import { Direction } from './options.js'

// ── InternalProperties (字符串键) ──
export const P_ORIGIN = 'origin'
export const P_DEPTH = 'DEPTH'
export const P_FAN = 'FAN'
export const P_DESCENDANTS = 'DESCENDANTS'
export const P_ROOT = 'ROOT'
export const P_LEFTNEIGHBOR = 'LEFTNEIGHBOR'
export const P_RIGHTNEIGHBOR = 'RIGHTNEIGHBOR'
export const P_LEFTSIBLING = 'LEFTSIBLING'
export const P_RIGHTSIBLING = 'RIGHTSIBLING'
export const P_DUMMY = 'DUMMY'
export const P_LEVEL = 'LEVEL'
export const P_REMOVABLE_EDGES = 'REMOVABLE_EDGES'
export const P_XCOOR = 'XCOOR'
export const P_YCOOR = 'YCOOR'
export const P_LEVELHEIGHT = 'LEVELHEIGHT'
export const P_LEVELMIN = 'LEVELMIN'
export const P_LEVELMAX = 'LEVELMAX'
export const P_GRAPH_XMIN = 'GRAPH_XMIN'
export const P_GRAPH_YMIN = 'GRAPH_YMIN'
export const P_GRAPH_XMAX = 'GRAPH_XMAX'
export const P_GRAPH_YMAX = 'GRAPH_YMAX'
export const P_COMPACT_LEVEL_ASCENSION = 'COMPACT_LEVEL_ASCENSION'
export const P_COMPACT_CONSTRAINTS = 'COMPACT_CONSTRAINTS'
export const P_ID = 'ID'
export const P_POSITION = 'POSITION'
export const P_PRELIM = 'PRELIM'
export const P_MODIFIER = 'MODIFIER'
export const P_BB_UPLEFT = 'boundingBox.upLeft'
export const P_BB_LOWRIGHT = 'boundingBox.lowRight'

export type Props = Record<string, unknown>

/** 属性持有者 (Java MapPropertyHolder). */
export interface PropertyHolder {
  props: Props
}

export function getProp<T>(el: PropertyHolder, key: string, def: T): T {
  const v = el.props[key]
  return v === undefined ? def : v as T
}

export function setProp(el: PropertyHolder, key: string, value: unknown): void {
  el.props[key] = value
}

/** 数值属性 (layoutOptions 值为字符串时 Number 化; 空/缺省 → def). */
export function getNum(el: PropertyHolder, key: string, def: number): number {
  const v = el.props[key]
  if (v === undefined || v === null || v === '') return def
  const n = Number(v)
  return Number.isFinite(n) ? n : def
}

/** 整数属性 (Java int 语义). */
export function getInt(el: PropertyHolder, key: string, def: number): number {
  return Math.trunc(getNum(el, key, def))
}

/** 布尔属性 (字符串 'false'/'0' 识别). */
export function getBool(el: PropertyHolder, key: string, def: boolean): boolean {
  const v = el.props[key]
  if (v === undefined || v === null || v === '') return def
  if (typeof v === 'boolean') return v
  const s = String(v).trim().toLowerCase()
  if (s === 'false' || s === '0') return false
  return true
}

/** 字符串属性. */
export function getStr(el: PropertyHolder, key: string, def: string): string {
  const v = el.props[key]
  if (v === undefined || v === null) return def
  return String(v)
}

// ── TGraphElement / TShape ──

/** TGraphElement: 图元素基类 (id + 属性表). */
export class TGraphElement implements PropertyHolder {
  /** Identifier value, may be arbitrarily used by algorithms. */
  id = 0
  props: Props = {}

  constructor(id?: number) {
    if (id !== undefined) this.id = id
  }
}

/** TShape: 有位置与尺寸的元素. */
export abstract class TShape extends TGraphElement {
  /** 位置 (节点为中心点, 其他为左上角; 布局后统一为左上角). */
  readonly pos: KVector = new KVector()
  /** 尺寸. */
  readonly size: KVector = new KVector()

  constructor(id?: number) {
    super(id)
  }

  getPosition(): KVector {
    return this.pos
  }

  getSize(): KVector {
    return this.size
  }
}

// ── TNode ──

/** TNode: 树图节点. */
export class TNode extends TShape {
  /** 所属图. */
  graph: TGraph
  /** 节点标签. */
  private label?: string
  /** 出边列表. */
  readonly outgoingEdges: TEdge[] = []
  /** 入边列表. */
  readonly incomingEdges: TEdge[] = []

  constructor(id: number, graph: TGraph, label?: string) {
    super(id)
    this.graph = graph
    this.label = label
  }

  toString(): string {
    if (this.label === undefined || this.label.length === 0) return `n_${this.id}`
    return `n_${this.label}`
  }

  getLabel(): string | undefined {
    return this.label
  }

  setLabel(label: string | undefined): void {
    this.label = label
  }

  /** 父节点 (incoming 第一条边的 source), 无则 null. */
  getParent(): TNode | null {
    if (this.incomingEdges.length === 0) return null
    return this.incomingEdges[0].getSource()
  }

  /** 子节点副本列表. */
  getChildrenCopy(): TNode[] {
    return this.outgoingEdges.map((e) => e.getTarget())
  }

  /** 子节点 (outgoing edges 的 target, 惰性迭代等价物). */
  getChildren(): TNode[] {
    return this.outgoingEdges.map((e) => e.getTarget())
  }

  getOutgoingEdges(): TEdge[] {
    return this.outgoingEdges
  }

  getIncomingEdges(): TEdge[] {
    return this.incomingEdges
  }

  /** addChild: 以 dummy 边加子节点. */
  addChild(child: TNode): void {
    const newEdge = new TEdge(this, child)
    setProp(newEdge, P_DUMMY, true)
    this.graph.getEdges().push(newEdge)
    this.outgoingEdges.push(newEdge)
    child.incomingEdges.push(newEdge)
  }

  isLeaf(): boolean {
    return this.outgoingEdges.length === 0
  }
}

// ── TEdge ──

/** TEdge 稳定身份计数器 (Java Object.hashCode 语义: 同对象恒同值). */
let edgeSerial = 0

/** TEdge: 树图边 (bendPoints 为内部弯点, 不含源/目标点). */
export class TEdge extends TGraphElement {
  /** 边标签. */
  readonly labels: TLabel[] = []
  /** 源节点. */
  private source: TNode
  /** 目标节点. */
  private target: TNode
  /** 内部弯点 (不含源/目标点; 路由后含). */
  readonly bendPoints: KVector[] = []
  /** 身份哈希 (Java Object.hashCode 等价). */
  private readonly identityHash: number = ++edgeSerial

  constructor(source: TNode, target: TNode) {
    super()
    this.source = source
    this.target = target
  }

  toString(): string {
    if (this.source !== undefined && this.target !== undefined) {
      return `${this.source.toString()}->${this.target.toString()}`
    }
    return `e_${this.identityHash}`
  }

  getSource(): TNode {
    return this.source
  }

  setSource(theSource: TNode): void {
    if (this.source !== theSource) {
      const idx = this.source.getOutgoingEdges().indexOf(this)
      if (this.source !== undefined && idx !== -1) this.source.getOutgoingEdges().splice(idx, 1)
      if (theSource !== undefined && !theSource.getOutgoingEdges().includes(this)) {
        theSource.getOutgoingEdges().push(this)
      }
      this.source = theSource
    }
  }

  getTarget(): TNode {
    return this.target
  }

  setTarget(theTarget: TNode): void {
    if (this.target !== theTarget) {
      const idx = this.target.getIncomingEdges().indexOf(this)
      if (this.target !== undefined && idx !== -1) this.target.getIncomingEdges().splice(idx, 1)
      if (theTarget !== undefined && !theTarget.getIncomingEdges().includes(this)) {
        theTarget.getIncomingEdges().push(this)
      }
      this.target = theTarget
    }
  }

  getLabels(): TLabel[] {
    return this.labels
  }

  getBendPoints(): KVector[] {
    return this.bendPoints
  }
}

// ── TLabel ──

/** TLabel: 树图标签 (挂在边上). */
export class TLabel extends TShape {
  /** 关联的边. */
  edge: TEdge
  /** 文本. */
  text: string

  constructor(tedge: TEdge, text: string) {
    super()
    this.edge = tedge
    this.text = text
    tedge.getLabels().push(this)
  }

  toString(): string {
    if (this.text === undefined || this.text.length === 0) return `l[${this.edge.toString()}]`
    return `l_${this.text}`
  }

  getText(): string {
    return this.text
  }

  getEdge(): TEdge {
    return this.edge
  }
}

// ── TGraph ──

/** TGraph: 树图. */
export class TGraph implements PropertyHolder {
  /** 所有节点. */
  readonly nodes: TNode[] = []
  /** 所有边. */
  readonly edges: TEdge[] = []
  props: Props = {}

  toString(): string {
    let tmp = ''
    for (const tNode of this.nodes) tmp += `${tNode.toString()}\n`
    for (const tEdge of this.edges) tmp += `${tEdge.toString()}\n`
    return tmp
  }

  getEdges(): TEdge[] {
    return this.edges
  }

  getNodes(): TNode[] {
    return this.nodes
  }
}

// ── KVector 辅助 (Java KVector 双参 add/sub + dotProduct; 不改 force/kvector.ts) ──

/** v.add(x, y) 双参版本. */
export function kadd(v: KVector, x: number, y: number): KVector {
  v.x += x
  v.y += y
  return v
}

/** v.sub(x, y) 双参版本. */
export function ksub(v: KVector, x: number, y: number): KVector {
  v.x -= x
  v.y -= y
  return v
}

/** dot product. */
export function kdot(a: KVector, b: KVector): number {
  return a.x * b.x + a.y * b.y
}

/** direction 向量 (TreeUtil.getDirectionVector). */
export function directionVector(d: Direction): KVector {
  switch (d) {
    case Direction.UP: return new KVector(0, -1)
    case Direction.RIGHT: return new KVector(1, 0)
    case Direction.LEFT: return new KVector(-1, 0)
    default: return new KVector(0, 1)
  }
}
