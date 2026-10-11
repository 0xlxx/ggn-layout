/**
 * LabelDummyInserter (对应 ELK intermediate.LabelDummyInserter).
 * 为有 CENTER 边标签的边创建 LABEL dummy 节点 (拆分边, 移动标签), 在分层前预留空间.
 */
import type { LGraph } from '../graph/lgraph.js'
import { LNode } from '../graph/lnode.js'
import type { LEdge } from '../graph/ledge.js'
import { NodeType, PortConstraints } from '../graph/enums.js'
import { ORIGIN, REPRESENTED_LABELS, LONG_EDGE_SOURCE, LONG_EDGE_TARGET } from '../options/internal-properties.js'
import { PORT_CONSTRAINTS, EDGE_THICKNESS, SPACING_EDGE_LABEL, SPACING_LABEL_LABEL, DIRECTION } from '../options/layered-options.js'
import { splitEdge } from './long-edge-splitter.js'
import type { LEdgeLabel } from '../graph/ledge.js'

function isCenterLabel(label: LEdgeLabel): boolean {
  // ELK: edgeLabels.placement 默认 CENTER; UNDEFINED (非法值/未设置) 归一化为 CENTER
  // (Core.melk edgeLabels.placement default = EdgeLabelPlacement.CENTER).
  return label.placement === undefined || label.placement === 'CENTER' || label.placement === 'UNDEFINED'
}

export function processLabelDummyInsert(layeredGraph: LGraph): void {
    const edgeLabelSpacing = layeredGraph.getProperty(SPACING_EDGE_LABEL)
    const labelLabelSpacing = layeredGraph.getProperty(SPACING_LABEL_LABEL)
    const vertical = layeredGraph.getProperty(DIRECTION) === 'DOWN' || layeredGraph.getProperty(DIRECTION) === 'UP'

    // ggn LNode(graph) 构造器已把 dummy 加入 layerlessNodes (Java LNode(LGraph) 只设 graph 引用,
    // LabelDummyInserter.java L116 由 addAll 一次性加入) — 这里不能再 push, 否则重复 (与 Java 1:1).
    for (const node of layeredGraph.getLayerlessNodes()) {
      for (const edge of [...node.getOutgoingEdges()]) {
        if (!edgeNeedsToBeProcessed(edge)) continue
        const thickness = retrieveThickness(edge)

        const representedLabels: LEdgeLabel[] = []
        const dummyNode = createLabelDummy(layeredGraph, edge, thickness, representedLabels)

        const dummySize = dummyNode.size
        const labels = edge.getLabels()
        // Java LabelDummyInserter.java L88-103 用 listIterator 正序遍历 → REPRESENTED_LABELS
        // 保持原始标签顺序 (反向 splice 会把顺序反转, 与 remover 放置顺序不一致).
        for (let i = 0; i < labels.length;) {
          const label = labels[i]!
          if (isCenterLabel(label)) {
            if (vertical) {
              dummySize.x += label.size.x + labelLabelSpacing
              dummySize.y = Math.max(dummySize.y, label.size.y)
            } else {
              dummySize.x = Math.max(dummySize.x, label.size.x)
              dummySize.y += label.size.y + labelLabelSpacing
            }
            representedLabels.push(label)
            labels.splice(i, 1)
          } else {
            i++
          }
        }

        if (vertical) {
          dummySize.x -= labelLabelSpacing
          dummySize.y += edgeLabelSpacing + thickness
        } else {
          dummySize.y += edgeLabelSpacing - labelLabelSpacing + thickness
        }
      }
    }
  }

function edgeNeedsToBeProcessed(edge: LEdge): boolean {
    if (edge.getSource()!.getNode() === edge.getTarget()!.getNode()) return false
    return edge.getLabels().some(isCenterLabel)
  }

function retrieveThickness(edge: LEdge): number {
    let thickness = edge.getProperty(EDGE_THICKNESS)
    if (thickness < 0) {
      thickness = 0
      edge.setProperty(EDGE_THICKNESS, thickness)
    }
    return thickness
  }

function createLabelDummy(layeredGraph: LGraph, edge: LEdge, thickness: number,
    representedLabels: LEdgeLabel[]): LNode {
    const dummyNode = new LNode(layeredGraph)
    dummyNode.setType(NodeType.LABEL)
    dummyNode.setProperty(ORIGIN, edge)
    dummyNode.setProperty(REPRESENTED_LABELS, representedLabels)
    dummyNode.setProperty(PORT_CONSTRAINTS, PortConstraints.FIXED_POS)
    dummyNode.setProperty(LONG_EDGE_SOURCE, edge.getSource())
    dummyNode.setProperty(LONG_EDGE_TARGET, edge.getTarget())

    splitEdge(edge, dummyNode)
    return dummyNode
  }
