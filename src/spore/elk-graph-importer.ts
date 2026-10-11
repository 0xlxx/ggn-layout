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
 * ElkGraphImporter — ELK alg.spore.ElkGraphImporter 0.12.0.
 *
 * ElkNode JSON ↔ spore Graph 转换:
 * - importGraph: 读选项 + 建 Node (rect = 中心±(半宽/半高)+spacing/2+margin) + 根选择;
 * - updateGraph: 迭代后把 originalVertex 更新为当前 rect 中心, 重置 tEdges/tree;
 * - applyPositions: 节点位置写回 ElkNode + 父节点 resize (内容+padding) + 整体平移
 *   + 边直线路由 (clipVector 锚点).
 *
 * margin 取 org.eclipse.elk.margins (默认 0; Java NodeMarginCalculator 对无标签/端口节点同).
 */
import { KVector } from '../force/kvector.js'
import type { ElkNode, ElkEdge } from '../api/elk-json.js'
import { Rect, overlap, shortestDistance, clipVector } from './geometry.js'
import { Graph, Node, TreeConstructionStrategy, CompactionStrategy } from './graph.js'
import type { CostFunction } from './graph.js'
import {
  SPACING_NODE_NODE,
  PROCESSING_ORDER_TREE_CONSTRUCTION, PROCESSING_ORDER_SPANNING_TREE_COST_FUNCTION,
  PROCESSING_ORDER_PREFERRED_ROOT, PROCESSING_ORDER_ROOT_SELECTION,
  COMPACTION_COMPACTION_STRATEGY, COMPACTION_ORTHOGONAL,
  optStr, optNum, optBool, optPadding, jsonOpt,
  SpanningTreeCostFunction, RootSelection,
} from './options.js'
import type { ElkPadding } from './options.js'

/** Node 与源 ElkNode 的关联 (Java Pair<Node, ElkNode>). */
type NodePair = { node: Node; elkNode: ElkNode }

/** importGraph 选项覆盖 (Java provider setProperty 强制项). */
export interface ImportOverrides {
  rootSelection?: RootSelection
  costFunction?: SpanningTreeCostFunction
  treeConstruction?: TreeConstructionStrategy
}

export class SporeElkGraphImporter {
  private graph!: Graph
  /** originalVertex(精确键) → [Node, ElkNode]. */
  private nodeMap = new Map<string, NodePair>()
  private elkGraph!: ElkNode
  private spacingNodeNode = 8
  private padding: ElkPadding = { top: 8, left: 8, right: 8, bottom: 8 }

  // ── 代价函数 (Java ElkGraphImporter 回调) ──

  /** 中心点欧氏距离. */
  private centerDistance: CostFunction = (e) => e.u.distance(e.v)

  /** 到根中心最小距离. */
  private minimumRootDistance: CostFunction = (e) =>
    Math.min(e.u.distance(this.graph.preferredRoot!.vertex), e.v.distance(this.graph.preferredRoot!.vertex))

  /** 外接圆间距: 中心距 - 各自中心到矩形左上角距离. */
  private circleUnderlap: CostFunction = (e) => {
    const n1 = this.nodeMap.get(vkey(e.u))!.node
    const n2 = this.nodeMap.get(vkey(e.v))!.node
    return e.u.distance(e.v) - e.u.distance(n1.rect.getPosition()) - e.v.distance(n2.rect.getPosition())
  }

  /** 矩形 underlap (沿中心连线可靠近距离). */
  private rectangleUnderlap: CostFunction = (e) => {
    const n1 = this.nodeMap.get(vkey(e.u))!.node
    const n2 = this.nodeMap.get(vkey(e.v))!.node
    return n1.underlap(n2)
  }

  /** Nachmanson 等: 不相交 → 最短距离; 重叠 → -(overlap-1)*中心距. */
  private invertedOverlap: CostFunction = (e) => {
    const n1 = this.nodeMap.get(vkey(e.u))!.node
    const n2 = this.nodeMap.get(vkey(e.v))!.node
    const r1 = n1.rect
    const r2 = n2.rect
    const dist = shortestDistance(r1, r2)
    if (dist >= 0) return dist
    const s = r2.getCenter().sub(r1.getCenter()).length()
    return -(overlap(r1, r2) - 1) * s
  }

  // ── 主流程 ──

  /** 创建 spore Graph (Java importGraph; overrides 对应 provider setProperty 强制项). */
  importGraph(inputGraph: ElkNode, overrides: ImportOverrides = {}): Graph {
    this.elkGraph = inputGraph
    this.nodeMap = new Map()
    this.padding = optPadding(inputGraph)
    this.spacingNodeNode = optNum(inputGraph, SPACING_NODE_NODE)

    // 选项 (melk 默认: cost=CIRCLE_UNDERLAP; sporeOverlap provider 强制 CENTER_NODE + INVERTED_OVERLAP + MIN)
    const preferredRootID = jsonOpt<string>(inputGraph, PROCESSING_ORDER_PREFERRED_ROOT)
    const costFunctionID = overrides.costFunction ?? optStr(inputGraph, PROCESSING_ORDER_SPANNING_TREE_COST_FUNCTION, SpanningTreeCostFunction.CIRCLE_UNDERLAP)
    const treeConstructionStrategy = overrides.treeConstruction ?? optStr(inputGraph, PROCESSING_ORDER_TREE_CONSTRUCTION, TreeConstructionStrategy.MINIMUM_SPANNING_TREE)
    const compactionStrategy = optStr(inputGraph, COMPACTION_COMPACTION_STRATEGY, CompactionStrategy.DEPTH_FIRST)
    const rootSelection = overrides.rootSelection ?? optStr(inputGraph, PROCESSING_ORDER_ROOT_SELECTION, RootSelection.CENTER_NODE)

    let costFunction: CostFunction = this.centerDistance
    switch (costFunctionID) {
      case SpanningTreeCostFunction.CENTER_DISTANCE: costFunction = this.centerDistance; break
      case SpanningTreeCostFunction.CIRCLE_UNDERLAP: costFunction = this.circleUnderlap; break
      case SpanningTreeCostFunction.RECTANGLE_UNDERLAP: costFunction = this.rectangleUnderlap; break
      case SpanningTreeCostFunction.INVERTED_OVERLAP: costFunction = this.invertedOverlap; break
      case SpanningTreeCostFunction.MINIMUM_ROOT_DISTANCE: costFunction = this.minimumRootDistance; break
      default:
        throw new Error(`No implementation available for ${costFunctionID}`)
    }

    const graph = new Graph(costFunction, treeConstructionStrategy, compactionStrategy)
    graph.orthogonalCompaction = optBool(inputGraph, COMPACTION_ORTHOGONAL)
    this.graph = graph

    if ((inputGraph.children ?? []).length === 0) return graph

    // 建 Node
    for (const elkNode of inputGraph.children ?? []) {
      const halfWidth = (elkNode.width ?? 0) / 2
      const halfHeight = (elkNode.height ?? 0) / 2
      const vertex = new KVector((elkNode.x ?? 0) + halfWidth, (elkNode.y ?? 0) + halfHeight)

      // 重合中心点随机微移 (Java: 零长边无方向无法缩放)
      while (this.nodeMap.has(vkey(vertex))) {
        vertex.add(new KVector((Math.random() - 0.5) * 0.001, (Math.random() - 0.5) * 0.001))
      }

      const margin = parseMargin(jsonOpt<unknown>(elkNode, 'org.eclipse.elk.margins'))
      const node = new Node(vertex, new Rect(
        vertex.x - halfWidth - this.spacingNodeNode / 2 - margin.left,
        vertex.y - halfHeight - this.spacingNodeNode / 2 - margin.top,
        (elkNode.width ?? 0) + this.spacingNodeNode + margin.left + margin.right,
        (elkNode.height ?? 0) + this.spacingNodeNode + margin.top + margin.bottom,
      ))

      graph.vertices.push(node)
      this.nodeMap.set(vkey(vertex), { node, elkNode })
    }

    // 生成树根选择
    switch (rootSelection) {
      case RootSelection.FIXED: {
        if (preferredRootID === undefined || preferredRootID === null) {
          graph.preferredRoot = graph.vertices[0]!
        } else {
          for (const node of graph.vertices) {
            const id = this.nodeMap.get(vkey(node.originalVertex))!.elkNode.id
            if (id !== undefined && id === preferredRootID) graph.preferredRoot = node
          }
        }
        break
      }
      case RootSelection.CENTER_NODE: {
        // 图中央最接近的节点
        const center = new KVector(this.elkGraph.width ?? 0, this.elkGraph.height ?? 0)
        center.scale(0.5)
        center.add(new KVector(this.elkGraph.x ?? 0, this.elkGraph.y ?? 0))
        let closest = Number.POSITIVE_INFINITY
        for (const node of graph.vertices) {
          const distance = node.originalVertex.distance(center)
          if (distance < closest) {
            closest = distance
            graph.preferredRoot = node
          }
        }
        break
      }
      default:
        throw new Error(`No implementation available for ${rootSelection}`)
    }

    return graph
  }

  /** 迭代后更新 originalVertex 为当前 rect 中心, 重置 tEdges/tree (Java updateGraph). */
  updateGraph(g: Graph): void {
    const updatedNodeMap = new Map<string, NodePair>()
    g.tEdges = null
    g.tree = null
    for (const n of g.vertices) {
      const original = this.nodeMap.get(vkey(n.originalVertex))!
      n.originalVertex = n.rect.getCenter()
      updatedNodeMap.set(vkey(n.originalVertex), original)
    }
    this.nodeMap = updatedNodeMap
  }

  /** 位置写回 ElkNode + 父节点 resize/平移 + 边直线路由 (Java applyPositions). */
  applyPositions(g: Graph): void {
    if (g.vertices.length === 0) return // Java: 无子节点不设父尺寸 (SporeMain 空图输出无 width/height)
    let minX = Number.POSITIVE_INFINITY
    let minY = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let maxY = Number.NEGATIVE_INFINITY
    for (const node of g.vertices) {
      const elkNode = this.nodeMap.get(vkey(node.originalVertex))!.elkNode
      elkNode.x = node.rect.x
      elkNode.y = node.rect.y
      minX = Math.min(minX, elkNode.x!)
      minY = Math.min(minY, elkNode.y!)
      maxX = Math.max(maxX, elkNode.x! + (elkNode.width ?? 0))
      maxY = Math.max(maxY, elkNode.y! + (elkNode.height ?? 0))
    }

    // 父节点尺寸 = 内容 + padding (ElkUtil.resizeNode + effectiveMinSizeConstraint: 无约束 → 0)
    this.elkGraph.width = maxX - minX + this.padding.left + this.padding.right
    this.elkGraph.height = maxY - minY + this.padding.top + this.padding.bottom

    // 整体平移 (ElkUtil.translate: 子节点 + 容器内边)
    const offsetX = -minX + this.padding.left
    const offsetY = -minY + this.padding.top
    for (const child of this.elkGraph.children ?? []) {
      child.x = (child.x ?? 0) + offsetX
      child.y = (child.y ?? 0) + offsetY
    }

    // 边直线路由 (source/target 中心裁剪到节点边界)
    for (const e of this.elkGraph.edges ?? []) {
      const section = firstEdgeSection(e)
      const source = findNode(this.elkGraph, e.sources?.[0])
      const target = findNode(this.elkGraph, e.targets?.[0])
      if (source === undefined || target === undefined) continue
      const startLocation = new KVector(
        (source.x ?? 0) + (source.width ?? 0) / 2,
        (source.y ?? 0) + (source.height ?? 0) / 2,
      )
      const endLocation = new KVector(
        (target.x ?? 0) + (target.width ?? 0) / 2,
        (target.y ?? 0) + (target.height ?? 0) / 2,
      )
      const uv = endLocation.clone().sub(startLocation)
      clipVector(uv, source.width ?? 0, source.height ?? 0)
      startLocation.add(uv)
      const vu = startLocation.clone().sub(endLocation)
      clipVector(vu, target.width ?? 0, target.height ?? 0)
      endLocation.add(vu)
      section.startPoint = { x: startLocation.x, y: startLocation.y }
      section.endPoint = { x: endLocation.x, y: endLocation.y }
    }
  }
}

/** KVector 精确键. */
function vkey(v: KVector): string {
  return `${v.x},${v.y}`
}

/** org.eclipse.elk.margins 解析 (数字 / [top=..,left=..] / 缺省 0). */
function parseMargin(v: unknown): { top: number; left: number; right: number; bottom: number } {
  const zero = { top: 0, left: 0, right: 0, bottom: 0 }
  if (typeof v === 'number') return { top: v, left: v, right: v, bottom: v }
  if (typeof v === 'object' && v !== null) {
    const o = v as Record<string, unknown>
    const num = (k: string): number => (typeof o[k] === 'number' ? o[k] as number : 0)
    return { top: num('top'), left: num('left'), right: num('right'), bottom: num('bottom') }
  }
  if (typeof v === 'string' && v.trim() !== '') {
    const m: Record<string, number> = {}
    for (const part of v.replace(/^\[|\]$/g, '').split(',')) {
      const [k, val] = part.split('=').map((t) => t.trim())
      const n = Number(val)
      if (k !== undefined && Number.isFinite(n)) m[k] = n
    }
    const num = (k: string): number => m[k] ?? 0
    return { top: num('top'), left: num('left'), right: num('right'), bottom: num('bottom') }
  }
  return zero
}

/** ElkGraphUtil.firstEdgeSection(e, true, true): 无 section 则新建. */
function firstEdgeSection(e: ElkEdge): NonNullable<ElkEdge['sections']>[number] {
  e.sections ??= []
  if (e.sections.length === 0) e.sections.push({ startPoint: { x: 0, y: 0 }, endPoint: { x: 0, y: 0 } })
  return e.sections[0]!
}

/** 在容器内按 id 找子节点 (全路径点号回退到节点段). */
function findNode(container: ElkNode, ref: string | undefined): ElkNode | undefined {
  if (ref === undefined) return undefined
  const direct = (container.children ?? []).find((c) => c.id === ref)
  if (direct !== undefined) return direct
  const base = ref.includes('.') ? ref.slice(0, ref.lastIndexOf('.')) : ref
  return (container.children ?? []).find((c) => c.id === base)
}

export type { CostFunction }
