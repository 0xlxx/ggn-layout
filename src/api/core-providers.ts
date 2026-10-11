/*
 * Copyright (c) 2026 GGN contributors.
 *
 * This file is part of ggn-layout. It is original work of the GGN project and
 * is made available under the terms of the MIT License.
 *
 * SPDX-License-Identifier: MIT
 * License text: LICENSE.
 */
/**
 * core 算法 provider (对应 ELK org.eclipse.elk.core.util 的 topdown provider).
 *
 * 与 layered 不同, 这些算法直接操作 ElkNode JSON (ElkGraphJson 形态), 不做 LGraph 转换:
 *   - fixed:  读 org.eclipse.elk.position / bendPoints, 设置节点/标签/端口/边位置 (不动无 position 的元素).
 *   - random: 用 JavaRandom (RANDOM_SEED) 在画布内随机分布节点 + 随机弯折边.
 *   - box:    不考虑边, 把子节点按盒子装箱 (SIMPLE 模式; GROUP_* 模式待移植).
 *
 * 集成方式 (layoutElkJson): 自底向上先对非 layered 子树跑对应 provider (子节点位置/尺寸定型),
 * 再让 layered 把该子树当黑盒 (builder 跳过其嵌套图). 详见 docs/NON-LAYERED-PORTING.md.
 */
import { JavaRandom } from '../util/java-random.js'
import type { ElkNode, ElkEdge } from './elk-json.js'

// ── 选项读取 (layoutOptions 全键) ──

interface OptHolder {
  layoutOptions?: Record<string, unknown>
  properties?: Record<string, unknown>
}

function optOf(node: OptHolder, key: string): unknown {
  return node.layoutOptions?.[key] ?? node.properties?.[key] ?? node.layoutOptions?.[key.replace(/^org\.eclipse\.elk\./, 'elk.')]
}

function optVec(node: OptHolder, key: string): { x: number; y: number } | null {
  const v = optOf(node, key)
  if (v === undefined || v === null) return null
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    if (typeof o.x === 'number' && typeof o.y === 'number') return { x: o.x, y: o.y }
    return null
  }
  const s = String(v).replace(/[()[\]]/g, '')
  const [x, y] = s.split(',').map((t) => Number(t.trim()))
  if (Number.isFinite(x) && Number.isFinite(y)) return { x, y }
  return null
}

function optNum(node: OptHolder, key: string): number | null {
  const v = optOf(node, key)
  if (v === undefined || v === null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function optBool(node: OptHolder, key: string, def = false): boolean {
  const v = optOf(node, key)
  if (v === undefined || v === null) return def
  return String(v) === 'true'
}

// ── FixedLayoutProvider (ELK core/util/FixedLayoutProvider) ──

/**
 * 固定位置布局: 读 POSITION/BEND_POINTS 选项设置位置; 无 position 的元素保持原位.
 * 返回处理后的节点 (原地修改).
 */
export function fixedLayout(layoutNode: ElkNode): ElkNode {
  const edgeRouting = optOf(layoutNode, 'org.eclipse.elk.edgeRouting')
  let maxx = 0
  let maxy = 0

  for (const node of layoutNode.children ?? []) {
    // 节点固定位置 (或保持原位)
    const pos = optVec(node, 'org.eclipse.elk.position')
    if (pos !== null) {
      node.x = pos.x
      node.y = pos.y
      // 固定尺寸约束
      const sizeConstraints = String(optOf(node, 'org.eclipse.elk.nodeSize.constraints') ?? '')
      if (sizeConstraints.includes('MINIMUM_SIZE')) {
        const minSize = optVec(node, 'org.eclipse.elk.nodeSize.minimum')
        if (minSize !== null && minSize.x > 0 && minSize.y > 0) {
          const w = Math.max(node.width ?? 0, minSize.x)
          const h = Math.max(node.height ?? 0, minSize.y)
          node.width = w
          node.height = h
        }
      }
    }
    maxx = Math.max(maxx, (node.x ?? 0) + (node.width ?? 0))
    maxy = Math.max(maxy, (node.y ?? 0) + (node.height ?? 0))

    // 节点标签
    for (const label of node.labels ?? []) {
      const lp = optVec(label as unknown as OptHolder, 'org.eclipse.elk.position')
      if (lp !== null) {
        label.x = lp.x
        label.y = lp.y
      }
      maxx = Math.max(maxx, (node.x ?? 0) + (label.x ?? 0) + (label.width ?? 0))
      maxy = Math.max(maxy, (node.y ?? 0) + (label.y ?? 0) + (label.height ?? 0))
    }

    // 端口
    for (const port of node.ports ?? []) {
      const pp = optVec(port, 'org.eclipse.elk.position')
      if (pp !== null) {
        port.x = pp.x
        port.y = pp.y
      }
      const portx = (node.x ?? 0) + (port.x ?? 0)
      const porty = (node.y ?? 0) + (port.y ?? 0)
      maxx = Math.max(maxx, portx + (port.width ?? 0))
      maxy = Math.max(maxy, porty + (port.height ?? 0))
      for (const label of (port as unknown as { labels?: { x?: number; y?: number; width?: number; height?: number }[] }).labels ?? []) {
        const lp = optVec(label as unknown as OptHolder, 'org.eclipse.elk.position')
        if (lp !== null) {
          label.x = lp.x
          label.y = lp.y
        }
        maxx = Math.max(maxx, portx + (label.x ?? 0) + (label.width ?? 0))
        maxy = Math.max(maxy, porty + (label.y ?? 0) + (label.height ?? 0))
      }
    }

    // 出边 (含层级边)
    for (const edge of outgoingEdges(node)) {
      const mv = fixedProcessEdge(edge, edgeRouting)
      maxx = Math.max(maxx, mv.x)
      maxy = Math.max(maxy, mv.y)
    }
    // 入边 (跨层级)
    for (const edge of incomingEdges(node)) {
      const src = edge.sources?.[0]
      const srcNode = src === undefined ? null : nodeById(layoutNode, src)
      if (srcNode !== null && srcNode !== node) {
        const mv = fixedProcessEdge(edge, edgeRouting)
        maxx = Math.max(maxx, mv.x)
        maxy = Math.max(maxy, mv.y)
      }
    }
  }

  // 正交路由 → 计算 junction points (ELK generateJunctionPoints, 简化: 无弯点则不设).
  if (edgeRouting === 'ORTHOGONAL') {
    for (const node of layoutNode.children ?? []) {
      for (const edge of outgoingEdges(node)) {
        fixedJunctionPoints(edge)
      }
    }
  }

  // 父节点尺寸 (除非 fixedGraphSize)
  if (!optBool(layoutNode, 'org.eclipse.elk.nodeSize.fixedGraphSize')) {
    const pad = optPadding(layoutNode)
    layoutNode.width = maxx + pad.left + pad.right
    layoutNode.height = maxy + pad.top + pad.bottom
  }
  return layoutNode
}

function fixedProcessEdge(edge: ElkEdge, _edgeRouting: unknown): { x: number; y: number } {
  const src = edge.sources?.[0]
  const tgt = edge.targets?.[0]
  const maxv = { x: 0, y: 0 }
  const bends = optOf(edge, 'org.eclipse.elk.bendPoints')
  const bendList = Array.isArray(bends) ? bends : null
  if (bendList !== null && bendList.length >= 2) {
    const section: { startPoint?: { x: number; y: number }; endPoint?: { x: number; y: number }; bendPoints?: { x: number; y: number }[] } = {}
    if (bendList.length >= 1) section.startPoint = toPoint(bendList[0])
    if (bendList.length >= 2) section.endPoint = toPoint(bendList[bendList.length - 1])
    if (bendList.length > 2) section.bendPoints = bendList.slice(1, -1).map(toPoint)
    edge.sections = [section as ElkEdge['sections'] extends (infer T)[] ? T : never]
  }
  // 同层级边: 弯点最大坐标
  if (src !== undefined && tgt !== undefined) {
    for (const s of edge.sections ?? []) {
      for (const b of s.bendPoints ?? []) {
        maxv.x = Math.max(maxv.x, b.x)
        maxv.y = Math.max(maxv.y, b.y)
      }
      if (s.startPoint) { maxv.x = Math.max(maxv.x, s.startPoint.x); maxv.y = Math.max(maxv.y, s.startPoint.y) }
      if (s.endPoint) { maxv.x = Math.max(maxv.x, s.endPoint.x); maxv.y = Math.max(maxv.y, s.endPoint.y) }
    }
  }
  return maxv
}

function fixedJunctionPoints(edge: ElkEdge): void {
  // ELK ElkUtil.determineJunctionPoints: 由弯点推断正交连接点. ggn 简化: 有正交弯点则记录.
  const bends = (edge.sections ?? [])[0]?.bendPoints
  if (bends !== undefined && bends.length > 0) {
    edge.layoutOptions = { ...edge.layoutOptions, 'org.eclipse.elk.junctionPoints': bends.map((b) => ({ x: b.x, y: b.y })) }
  }
}

// ── RandomLayoutProvider (ELK core/util/RandomLayoutProvider) ──

const RANDOM_MAX_BENDS = 5
const RANDOM_RAND_FACT = 0.2

/**
 * 随机布局: 用 JavaRandom (seed=RANDOM_SEED) 在画布内随机分布子节点, 边加随机弯点.
 * 需与 Java 相同 seed 序列 (JavaRandom 已对齐 java.util.Random).
 */
export function randomLayout(layoutNode: ElkNode): ElkNode {
  const spacing = optNum(layoutNode, 'org.eclipse.elk.spacing.nodeNode') ?? 20
  const padding = optPadding(layoutNode)
  const aspectRatio = optNum(layoutNode, 'org.eclipse.elk.aspectRatio') ?? 1.6
  const seed = optNum(layoutNode, 'org.eclipse.elk.randomSeed') ?? 0
  const random = new JavaRandom(seed)

  const children = layoutNode.children ?? []
  const n = children.length
  if (n === 0) return layoutNode

  let maxWidth = 0
  let maxHeight = 0
  let nodesArea = 0
  for (const node of children) {
    const w = node.width ?? 0
    const h = node.height ?? 0
    maxWidth = Math.max(maxWidth, w)
    maxHeight = Math.max(maxHeight, h)
    nodesArea += w * h
  }

  const drawArea = nodesArea + 2 * spacing * spacing * n
  const areaSqrt = Math.sqrt(drawArea)
  const drawWidth = Math.max(areaSqrt * aspectRatio, maxWidth)
  const drawHeight = Math.max(areaSqrt / aspectRatio, maxHeight)

  // 随机节点位置 (Java 语义: 每个节点 nextDouble 消耗 2 个随机值)
  for (const node of children) {
    node.x = padding.left + random.nextDouble() * (drawWidth - (node.width ?? 0))
    node.y = padding.left + random.nextDouble() * (drawHeight - (node.height ?? 0))
  }

  const totalWidth = drawWidth + padding.left + padding.right
  const totalHeight = drawHeight + padding.top + padding.bottom
  for (const source of children) {
    for (const edge of outgoingEdges(source)) {
      if (!edge.sections || (edge.sections ?? []).length === 0) {
        randomizeEdge(edge, random, totalWidth, totalHeight, layoutNode)
      }
    }
  }

  layoutNode.width = totalWidth
  layoutNode.height = totalHeight
  return layoutNode
}

function randomizeEdge(edge: ElkEdge, random: JavaRandom, drawWidth: number, drawHeight: number, root: ElkNode): void {
  // 源坐标 (节点/端口形状解析: ELK connectableShape → 节点位置 + 端口偏移)
  const srcShape = resolveShape(root, edge.sources?.[0])
  const tgtShape = resolveShape(root, edge.targets?.[0])
  let sourceX = srcShape.x
  let sourceY = srcShape.y
  const sourceWidth = srcShape.w / 2
  const sourceHeight = srcShape.h / 2
  sourceX += sourceWidth
  sourceY += sourceHeight

  let targetX = tgtShape.x
  let targetY = tgtShape.y
  const targetWidth = tgtShape.w / 2
  const targetHeight = tgtShape.h / 2
  targetX += targetWidth
  targetY += targetHeight

  // 单 section
  const section: { startPoint: { x: number; y: number }; endPoint: { x: number; y: number }; bendPoints: { x: number; y: number }[] } =
    { startPoint: { x: 0, y: 0 }, endPoint: { x: 0, y: 0 }, bendPoints: [] }

  // 源点贴到源元素边界 (ELK randomize 的边界投影)
  let sourcePX = targetX
  if (targetX > sourceX + sourceWidth) sourcePX = sourceX + sourceWidth
  else if (targetX < sourceX - sourceWidth) sourcePX = sourceX - sourceWidth
  let sourcePY = targetY
  if (targetY > sourceY + sourceHeight) sourcePY = sourceY + sourceHeight
  else if (targetY < sourceY - sourceHeight) sourcePY = sourceY - sourceHeight
  if (sourcePX > sourceX - sourceWidth && sourcePX < sourceX + sourceWidth
    && sourcePY > sourceY - sourceHeight && sourcePY < sourceY + sourceHeight) {
    sourcePX = sourceX + sourceWidth
  }
  section.startPoint = { x: sourcePX, y: sourcePY }

  let targetPX = sourceX
  if (sourceX > targetX + targetWidth) targetPX = targetX + targetWidth
  else if (sourceX < targetX - targetWidth) targetPX = targetX - targetWidth
  let targetPY = sourceY
  if (sourceY > targetY + targetHeight) targetPY = targetY + targetHeight
  else if (sourceY < targetY - targetHeight) targetPY = targetY - targetHeight
  if (targetPX > targetX - targetWidth && targetPX < targetX + targetWidth
    && targetPY > targetY - targetHeight && targetPY < targetY + targetHeight) {
    targetPY = targetY + targetHeight
  }
  section.endPoint = { x: targetPX, y: targetPY }

  // 随机弯点
  const bendsNum = random.nextInt(RANDOM_MAX_BENDS)
  const xdiff = targetPX - sourcePX
  const ydiff = targetPY - sourcePY
  const totalDist = Math.sqrt(xdiff * xdiff + ydiff * ydiff)
  const maxRand = totalDist * RANDOM_RAND_FACT
  const xincr = xdiff / (bendsNum + 1)
  const yincr = ydiff / (bendsNum + 1)
  let x = sourcePX
  let y = sourcePY
  for (let i = 0; i < bendsNum; i++) {
    x += xincr
    y += yincr
    let randx = x + random.nextFloat() * maxRand - maxRand / 2
    if (randx < 0) randx = 1
    else if (randx > drawWidth) randx = drawWidth - 1
    let randy = y + random.nextFloat() * maxRand - maxRand / 2
    if (randy < 0) randy = 1
    else if (randy > drawHeight) randy = drawHeight - 1
    section.bendPoints.push({ x: randx, y: randy })
  }
  edge.sections = [section]
}

// ── BoxLayoutProvider (ELK core/util/BoxLayoutProvider, SIMPLE 模式) ──

const BOX_DEF_ASPECT_RATIO = 1.3

/** 装箱布局 (SIMPLE): 子节点按盒子打包, 父节点尺寸自适应. GROUP_* 模式待移植. */
export function boxLayout(layoutNode: ElkNode): ElkNode {
  const mode = String(optOf(layoutNode, 'org.eclipse.elk.box.packingMode') ?? 'SIMPLE')
  if (mode !== 'SIMPLE') {
    throw new Error(`[layout] box.packingMode '${mode}' 尚未移植 (当前仅 SIMPLE); 见 docs/NON-LAYERED-PORTING.md`)
  }
  const objSpacing = optNum(layoutNode, 'org.eclipse.elk.spacing.nodeNode') ?? 15
  const padding = optPadding(layoutNode)
  const expandNodes = optBool(layoutNode, 'org.eclipse.elk.expandNodes')
  const interactive = optBool(layoutNode, 'org.eclipse.elk.interactive')
  placeBoxes(layoutNode, objSpacing, padding, expandNodes, interactive)
  return layoutNode
}

function placeBoxes(parent: ElkNode, objSpacing: number, padding: { left: number; top: number; right: number; bottom: number },
  expandNodes: boolean, interactive: boolean): void {
  const sorted = boxSort(parent, interactive)
  const minSize = effectiveMinSize(parent)
  const aspectRatio = optNum(parent, 'org.eclipse.elk.aspectRatio') ?? BOX_DEF_ASPECT_RATIO
  const parentSize = placeBoxesCore(sorted, objSpacing, padding, minSize.x, minSize.y, expandNodes, aspectRatio)
  parent.width = parentSize.x
  parent.height = parentSize.y
}

function boxSort(parent: ElkNode, interactive: boolean): ElkNode[] {
  const children = [...(parent.children ?? [])]
  children.sort((c1, c2) => {
    const p1 = optNum(c1, 'org.eclipse.elk.priority') ?? 0
    const p2 = optNum(c2, 'org.eclipse.elk.priority') ?? 0
    if (p1 !== p2) return p2 - p1
    if (interactive) {
      const dy = (c1.y ?? 0) - (c2.y ?? 0)
      if (dy !== 0) return dy
      return (c1.x ?? 0) - (c2.x ?? 0)
    }
    return (c1.width ?? 0) * (c1.height ?? 0) - (c2.width ?? 0) * (c2.height ?? 0)
  })
  return children
}

function placeBoxesCore(sorted: ElkNode[], minSpacing: number, padding: { left: number; top: number; right: number; bottom: number },
  minTotalWidth: number, minTotalHeight: number, expandNodes: boolean, aspectRatio: number): { x: number; y: number } {
  let maxRowWidth = 0
  let totalArea = 0
  for (const box of sorted) {
    maxRowWidth = Math.max(maxRowWidth, box.width ?? 0)
    totalArea += (box.width ?? 0) * (box.height ?? 0)
  }
  const mean = totalArea / Math.max(1, sorted.length)
  let stddev = 0
  for (const box of sorted) stddev += Math.pow((box.width ?? 0) * (box.height ?? 0) - mean, 2)
  stddev = Math.sqrt(stddev / Math.max(1, sorted.length))
  totalArea += sorted.length * 1 * stddev
  totalArea += Math.sqrt(totalArea) * (padding.bottom + padding.top)
  totalArea += Math.sqrt(totalArea) * padding.right
  maxRowWidth = Math.max(maxRowWidth, Math.sqrt(totalArea * aspectRatio)) + padding.left

  let xpos = padding.left
  let ypos = padding.top
  let highestBox = 0
  let broadestRow = padding.left + padding.right
  const rowIndices: number[] = [0]
  const rowHeights: number[] = []

  for (let i = 0; i < sorted.length; i++) {
    const box = sorted[i]!
    const width = box.width ?? 0
    const height = box.height ?? 0
    if (xpos + width > maxRowWidth) {
      if (expandNodes) {
        rowHeights.push(highestBox)
        rowIndices.push(i)
      }
      xpos = padding.left
      ypos += highestBox + minSpacing
      highestBox = 0
      broadestRow = Math.max(broadestRow, padding.left + padding.right + width)
    }
    box.x = xpos
    box.y = ypos
    broadestRow = Math.max(broadestRow, xpos + width + padding.right)
    highestBox = Math.max(highestBox, height)
    xpos += width + minSpacing
  }
  broadestRow = Math.max(broadestRow, minTotalWidth)
  let totalHeight = ypos + highestBox + padding.bottom
  if (totalHeight < minTotalHeight) {
    highestBox += minTotalHeight - totalHeight
    totalHeight = minTotalHeight
  }

  // expand nodes (ELK: 行内节点等高填充)
  if (expandNodes) {
    xpos = padding.left
    rowIndices.push(sorted.length)
    let nextRowIndex = rowIndices.shift()!
    rowHeights.push(highestBox)
    let rowHeight = 0
    let ri = 0
    for (let i = 0; i < sorted.length; i++) {
      if (i === nextRowIndex) {
        xpos = padding.left
        rowHeight = rowHeights[ri++]!
        nextRowIndex = rowIndices.shift()!
      }
      const box = sorted[i]!
      const oldHeight = box.height ?? 0
      box.height = rowHeight
      if (i + 1 === nextRowIndex) {
        const newWidth = broadestRow - xpos - padding.right
        box.width = newWidth
        void oldHeight
      }
      box.x = xpos
      xpos += (box.width ?? 0) + minSpacing
    }
  }

  return { x: broadestRow, y: totalHeight }
}

function effectiveMinSize(parent: ElkNode): { x: number; y: number } {
  const c = String(optOf(parent, 'org.eclipse.elk.nodeSize.constraints') ?? '')
  const m = optVec(parent, 'org.eclipse.elk.nodeSize.minimum')
  if (c.includes('MINIMUM_SIZE') && m !== null) return m
  return { x: 0, y: 0 }
}

// ── 工具 ──

/** ELK core 算法 padding: 默认 15 (Core.melk fixed/box/random supports padding = new ElkPadding(15)),
 *  非 layered 的 12 (图 padding). 支持对象与字符串 "[top=..,left=..,..]" 两种 JSON 形态. */
function optPadding(node: ElkNode, def = 15): { left: number; top: number; right: number; bottom: number } {
  const v = optOf(node, 'org.eclipse.elk.padding')
  if (typeof v === 'object' && v !== null) {
    const o = v as Record<string, unknown>
    const num = (k: string): number => (typeof o[k] === 'number' ? o[k] as number : def)
    return { left: num('left'), top: num('top'), right: num('right'), bottom: num('bottom') }
  }
  if (typeof v === 'string') {
    const m: Record<string, number> = {}
    for (const part of v.replace(/^\[|\]$/g, '').split(',')) {
      const [k, val] = part.split('=').map((t) => t.trim())
      const n = Number(val)
      if (k !== undefined && Number.isFinite(n)) m[k] = n
    }
    const num = (k: string): number => m[k] ?? def
    return { left: num('left'), top: num('top'), right: num('right'), bottom: num('bottom') }
  }
  return { left: def, top: def, right: def, bottom: def }
}

function toPoint(v: unknown): { x: number; y: number } {
  const o = v as Record<string, unknown>
  return { x: Number(o.x ?? 0), y: Number(o.y ?? 0) }
}

function outgoingEdges(node: ElkNode): ElkEdge[] {
  // 边挂在容器节点的 edges 数组; 简单场景边在 node.edges (或根). ggn JSON 边挂 LCA 容器.
  return node.edges ?? []
}

function incomingEdges(_node: ElkNode): ElkEdge[] {
  // ELK allIncomingEdges 含跨层级入边; 简单场景忽略 (边已按 LCA 挂载).
  return []
}

function nodeById(root: ElkNode, ref: string): ElkNode | null {
  const strip = ref.replace(/^N/, '')
  const stack: ElkNode[] = [root]
  while (stack.length > 0) {
    const n = stack.pop()!
    if (n.id === strip || n.id === ref) return n
    for (const c of n.children ?? []) stack.push(c)
  }
  return null
}

/** 解析边端点形状 (节点或端口): 返回绝对 x/y + 宽高. 端口时叠加父节点位置 + 端口位置. */
function resolveShape(root: ElkNode, ref: string | undefined): { x: number; y: number; w: number; h: number } {
  if (ref === undefined) return { x: 0, y: 0, w: 0, h: 0 }
  const strip = ref.replace(/^N/, '')
  // 先按完整 id 找节点
  const node = nodeById(root, ref)
  if (node !== null) return { x: node.x ?? 0, y: node.y ?? 0, w: node.width ?? 0, h: node.height ?? 0 }
  // 端口: ref = "nodeId.portId"
  const dot = strip.lastIndexOf('.')
  if (dot !== -1) {
    const n = nodeById(root, strip.slice(0, dot))
    if (n !== null) {
      const port = (n.ports ?? []).find((p) => p.id === strip.slice(dot + 1) || p.id === `N${strip.slice(dot + 1)}`)
      const px = (port?.x ?? 0) + (n.x ?? 0)
      const py = (port?.y ?? 0) + (n.y ?? 0)
      return { x: px, y: py, w: port?.width ?? 0, h: port?.height ?? 0 }
    }
  }
  return { x: 0, y: 0, w: 0, h: 0 }
}
