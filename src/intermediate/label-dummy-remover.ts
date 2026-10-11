/**
 * LabelDummyRemover (对应 ELK intermediate.LabelDummyRemover).
 * P5 后: 移除 LABEL dummy, 把标签放到 dummy 位置, 边重连回原边.
 *
 * 垂直布局放置与 ELK LabelDummyRemover.java:151-170 同构:
 *  - UP 方向先反转标签顺序 (Java: Lists.reverse(labels), LabelDummyRemover.java:154-158)
 *  - inline 标签 (EDGE_LABELS_INLINE) 居中; 否则 BELOW(leftAligned) 顶对齐、ABOVE 底对齐
 *    (LabelDummyRemover.java:163-169)
 */
import type { LGraph } from '../graph/lgraph.js'
import type { LEdge } from '../graph/ledge.js'
import { NodeType } from '../graph/enums.js'
import { ORIGIN, REPRESENTED_LABELS, LABEL_SIDE } from '../options/internal-properties.js'
import { EDGE_THICKNESS, SPACING_EDGE_LABEL, SPACING_LABEL_LABEL, DIRECTION } from '../options/layered-options.js'
import { joinAt } from './long-edge-joiner.js'
import type { LEdgeLabel } from '../graph/ledge.js'

export function processLabelDummyRemoval(layeredGraph: LGraph): void {
    const edgeLabelSpacing = layeredGraph.getProperty(SPACING_EDGE_LABEL)
    const labelLabelSpacing = layeredGraph.getProperty(SPACING_LABEL_LABEL)
    const layoutDirection = layeredGraph.getProperty(DIRECTION)
    const vertical = layoutDirection === 'DOWN' || layoutDirection === 'UP'

    for (const layer of layeredGraph.getLayers()) {
      for (let i = layer.getNodes().length - 1; i >= 0; i--) {
        const node = layer.getNodes()[i]!
        if (node.getType() !== NodeType.LABEL) continue

        const originEdge = node.getProperty(ORIGIN) as LEdge
        const thickness = originEdge.getProperty(EDGE_THICKNESS)
        const labelsBelowEdge = node.getProperty(LABEL_SIDE) === 'BELOW'

        const currLabelPos = { ...node.getPosition() }
        if (process.env.GGN_LDR_DBG) console.error(`[LDR] dummy ${node.id} pos=(${node.position.x},${node.position.y}) size=(${node.size.x},${node.size.y}) labels=${(node.getProperty(REPRESENTED_LABELS) as LEdgeLabel[]).length}`)
        if (labelsBelowEdge) currLabelPos.y += thickness + edgeLabelSpacing

        // Java: labelSpace.y = node.size.y + (isInlineEdgeLabel ? 0 : -thickness - edgeLabelSpacing);
        // ggn 无 EDGE_LABELS_INLINE 支持 → 恒取非 inline 分支 (LabelDummyRemover.java:139-141).
        const labelSpace = {
          x: node.size.x,
          y: node.size.y - thickness - edgeLabelSpacing,
        }

        const representedLabels = node.getProperty(REPRESENTED_LABELS) as LEdgeLabel[]
        if (vertical) {
          placeLabelsForVerticalLayout(representedLabels, currLabelPos, labelLabelSpacing, labelSpace, labelsBelowEdge, layoutDirection)
        } else {
          let y = currLabelPos.y
          for (const label of representedLabels) {
            label.position.x = currLabelPos.x + (labelSpace.x - label.size.x) / 2
            label.position.y = y
            y += label.size.y + labelLabelSpacing
          }
        }

        if (process.env.GGN_LDR2) console.error(`[LDR2] dummy ${node.id} repr=${representedLabels.length} edgeBefore=${originEdge.getLabels().length}`)
        originEdge.getLabels().push(...representedLabels)
        joinAt(node, false)
        layer.getNodes().splice(i, 1)
      }
    }
  }

/** 垂直方向标签放置 (LabelDummyRemover.java:151-170). */
function placeLabelsForVerticalLayout(
  labels: LEdgeLabel[], labelPos: { x: number; y: number }, labelSpacing: number,
  labelSpace: { x: number; y: number }, leftAligned: boolean, layoutDirection: string,
): void {
  // ggn 无 EDGE_LABELS_INLINE 属性 → inline 恒为 false (Java: allMatch(EDGE_LABELS_INLINE), :161-163)
  const inline = false

  // UP 方向反转标签放置顺序, 保证最终标签顺序正确 (Java: Lists.reverse, :154-158)
  const effectiveLabels = layoutDirection === 'UP' ? [...labels].reverse() : labels

  for (const label of effectiveLabels) {
    label.position.x = labelPos.x
    if (inline) {
      label.position.y = labelPos.y + (labelSpace.y - label.size.y) / 2
    } else if (leftAligned) {
      label.position.y = labelPos.y
    } else {
      label.position.y = labelPos.y + labelSpace.y - label.size.y
    }
    labelPos.x += label.size.x + labelSpacing
  }
}
