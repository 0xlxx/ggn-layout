/**
 * NodeLabelPlacer (对应 ELK alg.common NodeLabelCellCreator + LabelPlacer 的 OUTSIDE 节点 label 部分,
 * layered 内最小可用).
 *
 * ELK NodeLabelLocation 语义 (NodeLabelCellCreator.handleNodeLabel + LabelPlacer.placeLabels):
 *  - placement 组合 → 位置类别: OUT_L_* / OUT_R_* (H_PRIORITY+H_LEFT/H_RIGHT, 或
 *    !H_PRIORITY+V_CENTER+H_LEFT/H_RIGHT → 水平侧); 其余 → OUT_T_* / OUT_B_* (垂直侧).
 *  - 垂直侧: V_TOP → y = -labelH - labelNodeSpacing (节点外上方, x 按 H 对齐);
 *             V_BOTTOM → y = nodeH + labelNodeSpacing.
 *  - 水平侧: H_LEFT → x = -labelW - labelNodeSpacing; H_RIGHT → x = nodeW + labelNodeSpacing.
 *  - 节点 label margin (ELK NodeMarginCalculator includeLabels): label 盒超出节点边界部分 =
 *    spacing + label 尺寸 (与放置公式同源).
 *
 * 本模块统一 label 放置与 margin 计算 (两处曾各自内联实现, 此处收敛避免不一致).
 * 纯函数 + 延迟计算: 由调用方在 P3 (LabelAndNodeSizeProcessor) / P4 前 (NodeMarginCalculator) 调用.
 */
import type { LNode } from '../../graph/lnode.js'
import { NODE_LABELS_PLACEMENT, SPACING_LABEL_NODE } from '../../options/layered-options.js'

/** label 的最小形态 (LNode.getLabels() 的元素). */
export interface NodeLabelLike {
  position: { x: number; y: number }
  size: { x: number; y: number }
  placement?: string
}

/** label 盒超出节点边界的外扩增量 (恒非负). */
export interface MarginDeltas {
  top: number
  left: number
  right: number
  bottom: number
}

const NO_MARGIN: MarginDeltas = { top: 0, left: 0, right: 0, bottom: 0 }

/**
 * 有效 placement (ELK 选项解析): label.placement 优先, 否则节点级 NODE_LABELS_PLACEMENT,
 * 均未设置 → 空 (ELK 默认 NodeLabelPlacement.fixed; 空 placement 不进 OUTSIDE 分支).
 * 图级不回退 — ELK melk 定义 targets nodes, labels (不含 parents), 图级设置不继承 (jar 实测).
 */
export function effectivePlacement(label: NodeLabelLike, node: LNode): string[] {
  const raw: string | string[] | undefined = label.placement ?? node.getProperty(NODE_LABELS_PLACEMENT)
  if (Array.isArray(raw)) return raw
  return String(raw ?? '').split(/[\s,]+/).filter(Boolean)
}

/** OUTSIDE 水平侧判定 (OUT_L_* / OUT_R_*): H_PRIORITY+H_LEFT/H_RIGHT, 或 !H_PRIORITY+V_CENTER+H_LEFT/H_RIGHT. */
export function isHorizontalOutsideSide(placement: string[]): boolean {
  const hasH = placement.includes('H_LEFT') || placement.includes('H_RIGHT')
  return (placement.includes('H_PRIORITY') && hasH)
    || (!placement.includes('H_PRIORITY') && placement.includes('V_CENTER') && hasH)
}

/**
 * 放置单个 OUTSIDE label (相对节点原点). 坐标语义与 ELK NodeLabelLocation 一致:
 *  - 水平侧: x 外移 (H_LEFT → -w - spacing, H_RIGHT → nodeW + spacing), y 按 V 对齐 (TOP=0/CENTER=居中/BOTTOM=nodeH-h);
 *  - 垂直侧: y 外移 (V_TOP → -h - spacing, V_BOTTOM → nodeH + spacing), x 按 H 对齐 (LEFT=0/CENTER=居中/RIGHT=nodeW-w).
 */
export function placeOutsideNodeLabel(
  label: NodeLabelLike,
  nodeSize: { x: number; y: number },
  placement: string[],
  spacing: number,
): void {
  const h = placement.includes('H_RIGHT') ? 'right' : placement.includes('H_LEFT') ? 'left' : 'center'
  const v = placement.includes('V_BOTTOM') ? 'bottom' : placement.includes('V_CENTER') ? 'center' : 'top'
  if (isHorizontalOutsideSide(placement)) {
    label.position.x = h === 'right' ? nodeSize.x + spacing : -label.size.x - spacing
    label.position.y = v === 'bottom' ? nodeSize.y - label.size.y
      : v === 'center' ? (nodeSize.y - label.size.y) / 2
      : 0
  } else {
    label.position.y = v === 'bottom' ? nodeSize.y + spacing : -label.size.y - spacing
    label.position.x = h === 'right' ? nodeSize.x - label.size.x
      : h === 'center' ? (nodeSize.x - label.size.x) / 2
      : 0
  }
}

/**
 * OUTSIDE label 的 margin 增量 (ELK NodeMarginCalculator): label 盒超出节点边界部分.
 * 与 placeOutsideNodeLabel 同源: 垂直侧 V_TOP → top, V_BOTTOM → bottom; 水平侧 H_LEFT → left, H_RIGHT → right.
 */
export function outsideNodeLabelMargins(
  labelSize: { x: number; y: number },
  placement: string[],
  spacing: number,
): MarginDeltas {
  if (isHorizontalOutsideSide(placement)) {
    const deltas: MarginDeltas = { ...NO_MARGIN }
    if (placement.includes('H_LEFT')) deltas.left = spacing + labelSize.x
    if (placement.includes('H_RIGHT')) deltas.right = spacing + labelSize.x
    return deltas
  }
  const deltas: MarginDeltas = { ...NO_MARGIN }
  if (placement.includes('V_TOP')) deltas.top = spacing + labelSize.y
  if (placement.includes('V_BOTTOM')) deltas.bottom = spacing + labelSize.y
  return deltas
}

/** labelNode 间距: 节点级 SPACING_LABEL_NODE → 图级 (ELK melk targets parents, 图级生效 — jar 实测) → 默认 5. */
export function labelNodeSpacing(node: LNode): number {
  if (node.hasProperty(SPACING_LABEL_NODE)) return node.getProperty(SPACING_LABEL_NODE)
  return node.getGraph()?.getProperty(SPACING_LABEL_NODE) ?? 5
}
