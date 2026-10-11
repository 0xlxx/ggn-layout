/**
 * ElkGraphImporter — ELK alg.force.ElkGraphImporter 0.12.0.
 * 在 ElkNode JSON (ElkGraphJson 形态) 与 FGraph 之间转换.
 * 端口暂不考虑 (Java transformNodes 亦为 TODO).
 */
import { FGraph, FNode, FEdge, FLabel } from './graph.js'
import { KVector } from './kvector.js'
import { PADDING, optOf, DEFAULTS, parsePadding } from './options.js'
import { ORIGIN } from './internal-properties.js'
import type { ElkNode, ElkEdge } from '../api/elk-json.js'

function copyOptions(target: { setProperty: (k: string, v: unknown) => void }, src: { layoutOptions?: Record<string, unknown>; properties?: Record<string, unknown> } | undefined): void {
  for (const [k, v] of Object.entries(src?.layoutOptions ?? {})) target.setProperty(k, v)
  for (const [k, v] of Object.entries(src?.properties ?? {})) target.setProperty(k, v)
}

/** JSON 引用 "nodeId.portId" → 节点 id (force 不考虑端口). */
function connectableToNodeId(ref: string): string {
  return ref.split('.').length > 1 ? ref.slice(0, ref.lastIndexOf('.')) : ref
}

export class ElkGraphImporter {
  importGraph(kgraph: ElkNode): FGraph {
    const fgraph = new FGraph()
    copyOptions(fgraph, kgraph)
    fgraph.setProperty(ORIGIN, kgraph)

    const elemMap = new Map<string, FNode>()
    this.transformNodes(kgraph, fgraph, elemMap)
    this.transformEdges(kgraph, fgraph, elemMap)
    return fgraph
  }

  private transformNodes(kgraph: ElkNode, fgraph: FGraph, elemMap: Map<string, FNode>): void {
    let index = 0
    for (const knode of kgraph.children ?? []) {
      const label = (knode.labels ?? [])[0]?.text ?? ''
      const newNode = new FNode(label)
      copyOptions(newNode, knode)
      newNode.setProperty(ORIGIN, knode)

      newNode.id = index++
      newNode.getPosition().x = (knode.x ?? 0) + (knode.width ?? 0) / 2
      newNode.getPosition().y = (knode.y ?? 0) + (knode.height ?? 0) / 2
      newNode.getSize().x = Math.max(knode.width ?? 0, 1)
      newNode.getSize().y = Math.max(knode.height ?? 0, 1)

      fgraph.getNodes().push(newNode)
      elemMap.set(knode.id, newNode)
    }
  }

  private transformEdges(kgraph: ElkNode, fgraph: FGraph, elemMap: Map<string, FNode>): void {
    // JSON 语义: 边挂在容器节点 edges (Java getOutgoingEdges 遍历父容器边; 665 实证).
    for (const kedge of kgraph.edges ?? []) {
        const srcRef = (kedge.sources ?? [])[0]
        const tgtRef = (kedge.targets ?? [])[0]
        if (srcRef === undefined || tgtRef === undefined) continue
        // 嵌套节点全路径含点 (A.B.C), 先查完整 id, 失败再尝试去端口 (A.B.C.P → A.B.C).
        const srcNode = elemMap.get(srcRef) ?? elemMap.get(connectableToNodeId(srcRef))
        const tgtNode = elemMap.get(tgtRef) ?? elemMap.get(connectableToNodeId(tgtRef))
        if (!srcNode || !tgtNode) continue

        const newEdge = new FEdge()
        copyOptions(newEdge, kedge)
        newEdge.setProperty(ORIGIN, kedge)
        newEdge.setSource(srcNode)
        newEdge.setTarget(tgtNode)
        fgraph.getEdges().push(newEdge)

        for (const klabel of (kedge.labels as unknown as { text?: string; width?: number; height?: number; layoutOptions?: Record<string, unknown> }[] | undefined) ?? []) {
          const newLabel = new FLabel(newEdge, klabel.text ?? '')
          copyOptions(newLabel, { layoutOptions: klabel.layoutOptions })
          newLabel.setProperty(ORIGIN, klabel)
          newLabel.getSize().x = Math.max(klabel.width ?? 0, 1)
          newLabel.getSize().y = Math.max(klabel.height ?? 0, 1)
          newLabel.refreshPosition()
          fgraph.getLabels().push(newLabel)
      }
    }
  }

  /** 布局结果写回 ElkNode JSON (Java applyLayout). */
  applyLayout(fgraph: FGraph): void {
    const kgraph = fgraph.getProperty<ElkNode>(ORIGIN)

    let minXPos = Number.MAX_SAFE_INTEGER
    let minYPos = Number.MAX_SAFE_INTEGER
    let maxXPos = Number.MIN_SAFE_INTEGER
    let maxYPos = Number.MIN_SAFE_INTEGER

    for (const node of fgraph.getNodes()) {
      const pos = node.getPosition()
      const size = node.getSize()
      minXPos = Math.min(minXPos, pos.x - size.x / 2)
      minYPos = Math.min(minYPos, pos.y - size.y / 2)
      maxXPos = Math.max(maxXPos, pos.x + size.x / 2)
      maxYPos = Math.max(maxYPos, pos.y + size.y / 2)
    }
    for (const bp of fgraph.getBendpoints()) {
      const pos = bp.getPosition()
      const size = bp.getSize()
      minXPos = Math.min(minXPos, pos.x - size.x / 2)
      minYPos = Math.min(minYPos, pos.y - size.y / 2)
      maxXPos = Math.max(maxXPos, pos.x + size.x / 2)
      maxYPos = Math.max(maxYPos, pos.y + size.y / 2)
    }

    const padding = parsePadding(optOf(fgraph, PADDING, DEFAULTS[PADDING]), DEFAULTS[PADDING])
    const offset = new KVector(padding.left - minXPos, padding.top - minYPos)

    for (const fnode of fgraph.getNodes()) {
      const knode = fnode.getProperty<ElkNode>(ORIGIN)
      if (knode) {
        knode.x = fnode.getPosition().x + offset.x - (knode.width ?? 0) / 2
        knode.y = fnode.getPosition().y + offset.y - (knode.height ?? 0) / 2
      }
    }

    for (const fedge of fgraph.getEdges()) {
      const kedge = fedge.getProperty<ElkEdge>(ORIGIN)
      if (!kedge) continue
      const sections = kedge.sections ?? []
      const section = sections[0] ?? {}
      const startLocation = fedge.getSourcePoint().clone().add(offset)
      section.startPoint = { x: startLocation.x, y: startLocation.y }
      section.endPoint = { x: fedge.getTargetPoint().x + offset.x, y: fedge.getTargetPoint().y + offset.y }
      section.bendPoints = fedge.getBendpoints().map((bp) => ({
        x: bp.getPosition().x + offset.x,
        y: bp.getPosition().y + offset.y,
      }))
      if (kedge.sections === undefined) kedge.sections = [section]
      else kedge.sections[0] = section
    }

    for (const flabel of fgraph.getLabels()) {
      const klabel = flabel.getProperty<{ x?: number; y?: number }>(ORIGIN)
      if (klabel) {
        klabel.x = flabel.getPosition().x + offset.x
        klabel.y = flabel.getPosition().y + offset.y
      }
    }

    const width = maxXPos - minXPos + padding.left + padding.right
    const height = maxYPos - minYPos + padding.top + padding.bottom
    kgraph.width = width
    kgraph.height = height
  }
}
