/**
 * mrtree ElkGraphImporter — ELK alg.mrtree.ElkGraphImporter 0.12.0.
 *
 * importGraph: ElkNode JSON 子图 → TGraph (节点中心坐标, size max(w,1), 边过滤
 * hierarchical/selfloop; source/target 不在子图内 → 跳过).
 * applyLayout: 节点位置写回 ElkNode (左上角), 边 bendPoints 写回 sections
 * (startPoint/bendPoints/endPoint), 容器尺寸 = 内容包围盒 + padding, 写
 * childArea.width/height.
 */
import { KVector } from '../force/kvector.js'
import type { ElkEdge, ElkNode } from '../api/elk-json.js'
import { TGraph, TNode, TEdge, P_ORIGIN, getProp, setProp } from './graph.js'
import {
  NODE_SIZE_FIXED_GRAPH_SIZE, optNum, optPadding,
} from './options.js'

export class ElkGraphImporter {
  /** ELK JSON → TGraph (Java importGraph). */
  importGraph(elkgraph: ElkNode): TGraph {
    const tGraph = new TGraph()

    // copy the properties of the KGraph to the t-graph (layoutOptions + properties)
    Object.assign(tGraph.props, elkgraph.layoutOptions ?? {}, elkgraph.properties ?? {})
    setProp(tGraph, P_ORIGIN, elkgraph)

    // keep a list of created nodes in the t-graph
    const elemMap = new Map<ElkNode, TNode>()

    // transform nodes and edges
    this.transformNodes(elkgraph, tGraph, elemMap)
    this.transformEdges(elkgraph, tGraph, elemMap)

    return tGraph
  }

  private transformNodes(parentNode: ElkNode, tGraph: TGraph, elemMap: Map<ElkNode, TNode>): void {
    let index = 0
    for (const elknode of parentNode.children ?? []) {
      // copy label
      let label = ''
      if ((elknode.labels?.length ?? 0) > 0) label = elknode.labels![0].text ?? ''

      // create new tNode
      const newNode = new TNode(index++, tGraph, label)
      Object.assign(newNode.props, elknode.layoutOptions ?? {}, elknode.properties ?? {})
      setProp(newNode, P_ORIGIN, elknode)

      newNode.getPosition().y = (elknode.y ?? 0) + (elknode.height ?? 0) / 2
      newNode.getSize().x = Math.max(elknode.width ?? 0, 1)
      newNode.getPosition().x = (elknode.x ?? 0) + (elknode.width ?? 0) / 2
      newNode.getSize().y = Math.max(elknode.height ?? 0, 1)

      tGraph.getNodes().push(newNode)
      elemMap.set(elknode, newNode)
    }
  }

  private transformEdges(parentNode: ElkNode, tGraph: TGraph, elemMap: Map<ElkNode, TNode>): void {
    // Java 原版每条边对容器 children 线性扫描一次 O(E·V); 预建 id→node 索引保持同一
    // 匹配语义 (首个匹配者优先) 但不改变任何可观察行为。
    const nodeIndex = this.buildNodeIndex(parentNode)
    for (const elkedge of parentNode.edges ?? []) {
      // exclude hyperedges, edges that pass hierarchy bounds, and self-loops
      if (!this.isHierarchical(elkedge) && !this.isSelfloop(elkedge)) {
        // find the corresponding source and target tNode of edge
        const srcNode = this.findNode(nodeIndex, elkedge.sources?.[0] ?? '')
        const tgtNode = this.findNode(nodeIndex, elkedge.targets?.[0] ?? '')
        const source = srcNode !== undefined ? elemMap.get(srcNode) : undefined
        const target = tgtNode !== undefined ? elemMap.get(tgtNode) : undefined

        if (source !== undefined && target !== undefined) {
          // create a edge and add edge to tGraph
          const newEdge = new TEdge(source, target)
          setProp(newEdge, P_ORIGIN, elkedge)
          Object.assign(newEdge.props, elkedge.layoutOptions ?? {}, elkedge.properties ?? {})

          // update tNode accordingly
          source.getOutgoingEdges().push(newEdge)
          target.getIncomingEdges().push(newEdge)
          tGraph.getEdges().push(newEdge)
        }
      }
    }
  }

  /** 边是否跨层级 (source/target 之一不在容器 children 中) 或超边. */
  private isHierarchical(e: ElkEdge): boolean {
    if ((e.sources ?? []).length !== 1 || (e.targets ?? []).length !== 1) return true
    return false
  }

  /** 自环: source == target. */
  private isSelfloop(e: ElkEdge): boolean {
    return String(e.sources?.[0] ?? '') === String(e.targets?.[0] ?? '')
  }

  /** 容器 children 的 id→node 索引 (端口引用 "Nx.portId" 额外登记完整端口 id). */
  private buildNodeIndex(parentNode: ElkNode): Map<string, ElkNode> {
    const index = new Map<string, ElkNode>()
    for (const c of parentNode.children ?? []) {
      if (!index.has(c.id)) index.set(c.id, c)
      for (const p of c.ports ?? []) {
        const portRef = `${c.id}.${p.id}`
        if (!index.has(portRef)) index.set(portRef, c)
      }
    }
    return index
  }

  /** 在容器 children 中按 id 查找 (含端口后缀剥离; Java connectableShapeToNode). */
  private findNode(nodeIndex: Map<string, ElkNode>, ref: string): ElkNode | undefined {
    return nodeIndex.get(ref)
  }

  /** TGraph 布局结果 → ELK JSON (Java applyLayout). */
  applyLayout(tGraph: TGraph): void {
    // get the corresponding kGraph
    const elkgraph = getProp<ElkNode | undefined>(tGraph, P_ORIGIN, undefined)
    if (elkgraph === undefined) return

    // calculate the offset from border spacing and node distribution (Java int 极值初始化)
    let minXPos = 2147483647
    let minYPos = 2147483647
    let maxXPos = -2147483648
    let maxYPos = -2147483648
    for (const tNode of tGraph.getNodes()) {
      const pos = tNode.getPosition()
      const size = tNode.getSize()
      minXPos = Math.min(minXPos, pos.x - size.x / 2)
      minYPos = Math.min(minYPos, pos.y - size.y / 2)
      maxXPos = Math.max(maxXPos, pos.x + size.x / 2)
      maxYPos = Math.max(maxYPos, pos.y + size.y / 2)
    }

    const padding = optPadding(elkgraph)

    // apply tNode positions to elkNodes
    for (const tNode of tGraph.getNodes()) {
      const object = getProp<unknown>(tNode, P_ORIGIN, undefined)
      if (object !== undefined && typeof object === 'object' && 'id' in (object as object)) {
        const elknode = object as ElkNode
        elknode.x = tNode.getPosition().x
        elknode.y = tNode.getPosition().y
      }
    }

    // copy tEdge bendpoints to elkEdges
    for (const tEdge of tGraph.getEdges()) {
      const elkedge = getProp<ElkEdge | undefined>(tEdge, P_ORIGIN, undefined)
      if (elkedge !== undefined) {
        const bendPoints = tEdge.getBendPoints()
        const section = this.firstEdgeSection(elkedge, true, true)
        this.applyVectorChain(bendPoints, section)
      }
    }

    // set up the graph
    const width = maxXPos - minXPos + padding.left + padding.right
    const height = maxYPos - minYPos + padding.top + padding.bottom
    if (!optNum(elkgraph, NODE_SIZE_FIXED_GRAPH_SIZE)) {
      this.resizeNode(elkgraph, width, height, false, false)
    }
    elkgraph.layoutOptions ??= {}
    elkgraph.layoutOptions['org.eclipse.elk.childArea.width'] = String(width - padding.left - padding.right)
    elkgraph.layoutOptions['org.eclipse.elk.childArea.height'] = String(height - padding.top - padding.bottom)
  }

  /** 取首个 edge section (无则创建, 重置内容, 移除其余). */
  private firstEdgeSection(edge: ElkEdge, resetSection: boolean, removeOtherSections: boolean): NonNullable<ElkEdge['sections']>[number] {
    edge.sections ??= []
    if (edge.sections.length === 0) {
      edge.sections.push({ startPoint: { x: 0, y: 0 }, endPoint: { x: 0, y: 0 } })
      return edge.sections[0]
    }
    const section = edge.sections[0]
    if (resetSection) {
      section.bendPoints = []
      section.startPoint = { x: 0, y: 0 }
      section.endPoint = { x: 0, y: 0 }
    }
    if (removeOtherSections) {
      while (edge.sections.length > 1) edge.sections.pop()
    }
    return section
  }

  /** ElkUtil.applyVectorChain: startPoint = 首点, bendPoints = 中间, endPoint = 末点. */
  private applyVectorChain(vectorChain: KVector[], section: NonNullable<ElkEdge['sections']>[number]): void {
    if (vectorChain.length < 2) {
      throw new Error('The vector chain must contain at least a source and a target point.')
    }
    const firstPoint = vectorChain[0]
    section.startPoint = { x: firstPoint.x, y: firstPoint.y }

    section.bendPoints ??= []
    const bends = section.bendPoints
    const oldLen = bends.length
    const newMid = vectorChain.slice(1, vectorChain.length - 1)
    for (let i = 0; i < newMid.length; i++) {
      const p = newMid[i]
      if (i < oldLen) {
        bends[i].x = p.x
        bends[i].y = p.y
      } else {
        bends.push({ x: p.x, y: p.y })
      }
    }
    while (bends.length > newMid.length) bends.pop()

    const lastPoint = vectorChain[vectorChain.length - 1]
    section.endPoint = { x: lastPoint.x, y: lastPoint.y }
  }

  /** ElkUtil.resizeNode(keepPorts=false, keepLabels=false): 尺寸 = max(minSize, newSize). */
  private resizeNode(node: ElkNode, newWidth: number, newHeight: number, _movePorts: boolean, _moveLabels: boolean): void {
    const minSize = this.effectiveMinSizeConstraintFor(node)
    const finalWidth = Math.max(minSize.x, newWidth)
    const finalHeight = Math.max(minSize.y, newHeight)
    node.width = finalWidth
    node.height = finalHeight
  }

  /** 最小尺寸约束 (org.eclipse.elk.nodeSize.minimum), 默认 0,0. */
  private effectiveMinSizeConstraintFor(node: ElkNode): { x: number; y: number } {
    const v = node.layoutOptions?.['org.eclipse.elk.nodeSize.minimum'] ?? node.properties?.['org.eclipse.elk.nodeSize.minimum']
    if (v === undefined || v === null) return { x: 0, y: 0 }
    if (typeof v === 'number') return { x: v, y: v }
    if (Array.isArray(v)) {
      return { x: Number(v[0]) || 0, y: Number(v[1]) || 0 }
    }
    const s = String(v).replace(/^\[|\]$/g, '')
    const m = s.match(/^(-?[\d.]+)[, ]+(-?[\d.]+)$/)
    if (m) return { x: Number(m[1]) || 0, y: Number(m[2]) || 0 }
    const n = Number(s)
    if (Number.isFinite(n)) return { x: n, y: n }
    return { x: 0, y: 0 }
  }
}
