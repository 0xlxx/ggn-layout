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
 * LabelAndNodeSizeProcessor (对应 ELK intermediate.LabelAndNodeSizeProcessor 的核心: 端口放置).
 *
 * 在 P3 之后, P4 (BK) 之前放置端口位置:
 *  - FIXED_POSITION: 保留输入位置
 *  - FIXED_RATIO: 按比例 (PORT_RATIO_OR_POSITION, 简化: 保留)
 *  - FREE/FIXED_ORDER/FIXED_SIDE: 按侧均匀分布 (ELK PortPlacementCalculator 语义)
 *
 * 节点 label 尺寸扩展 (NodeLabelAndSizeCalculator) 暂不处理: elkt 节点均有显式尺寸.
 */
import type { LGraph } from '../graph/lgraph.js'
import type { LNode } from '../graph/lnode.js'
import { PortSide, NodeType } from '../graph/enums.js'
import { PORT_CONSTRAINTS, SPACING_PORT_PORT, SPACING_PORTS_SURROUNDING, NODE_LABELS_PADDING, NODE_SIZE_CONSTRAINTS, NODE_SIZE_MINIMUM, NODE_LABELS_PLACEMENT, SPACING_LABEL_LABEL, PORT_BORDER_OFFSET, PORT_LABELS_PLACEMENT, SPACING_LABEL_PORT_HORIZONTAL, SPACING_LABEL_PORT_VERTICAL, HIERARCHY_HANDLING } from '../options/layered-options.js'
import { buildCellContext, computeCellSystemSizeWithCtx, placeNodePortsWithCtx, placePortLabelsWithCtx } from './cell-system.js'
import type { CellCtx } from './cell-system.js'
import { effectivePlacement, labelNodeSpacing, placeOutsideNodeLabel } from './labels/node-label-placer.js'
import { MODEL_ORDER, EXT_PORT_SIDE } from '../options/internal-properties.js'
import { PortConstraints } from '../graph/enums.js'
import { getIndividualOrDefault } from '../p4nodes/spacings.js'

function getPortAlignment(_node: LNode): 'JUSTIFIED' | 'CENTER' | 'BEGIN' | 'END' | 'DISTRIBUTED' {
  return 'JUSTIFIED'
}

/** ELK PortPlacementCalculator 实测语义:
 *  - EAST 从上往下: y_i = (i+1)*spacing - portHeight
 *  - WEST 从下往上: y_i = (n-i)*spacing - portHeight
 *  - spacing = (nodeHeight + portHeight) / (n + 1)
 * 隐式端口 (height=0) 退化为 H*(i+1)/(n+1) 等分; 显式端口按 cell 系统含端口高度. */
function placeVerticalPortsEqually(node: LNode, side: PortSide, _portPort: number): void {
  const ports = node.getPorts(side)
  if (ports.length === 0) return
  if (process.env.GGN_VP_DBG && (side === PortSide.WEST || side === PortSide.EAST)) console.error(`VP n=${node.id} side=${side} ports=[${ports.map(p => `p${p.id}(mo${p.getProperty(MODEL_ORDER)})`).join(',')}]`)
  const nodeH = node.size.y
  // ELK PortPlacementCalculator.placeVerticalFreePorts (DISTRIBUTED) 中心间隔:
  //   centerSpacing = portHeight + (nodeH - Σsize.y)/(n+1)
  // 当所有端口同高 (Σsize = n×portHeight) 时 = (nodeH+portHeight)/(n+1) (原简化公式, 常规节点不变);
  // 含 size-0 (匿名/自环) 端口时 Σsize < n×portHeight → 中心间隔增大 (three_edges N1 实证: 7.67 vs 6.33).
  // portHeight 取正常端口高 (ports[0] 可能是 size-0, 用 0 会污染 spacing).
  const portHeight = ports.find(p => p.size.y > 0)?.size.y ?? ports[0]!.size.y
  const sumSizeY = ports.reduce((a, p) => a + p.size.y, 0)
  const spacing = portHeight + (nodeH - sumSizeY) / (ports.length + 1)
  const isWest = side === PortSide.WEST
  // ELK NodeContext.comparePortContexts: EAST 升序 (从上往下), WEST 降序 (从下往上).
  // 方向差异实际来自 P3 sweep 的端口重排 (sortPorts), 与约束类型无关.
  const eastBottomUp = false
  const westBottomUp = true
  for (let i = 0; i < ports.length; i++) {
    const port = ports[i]!
    const bottomUp = isWest ? westBottomUp : eastBottomUp
    const y = bottomUp
      ? (ports.length - i) * spacing - portHeight
      : (i + 1) * spacing - portHeight
    // ELK PortPlacementCalculator.calculateVerticalPortXCoordinate:
    // WEST x = -portWidth - borderOffset, EAST x = nodeWidth + borderOffset.
    const borderOffset = port.getProperty(PORT_BORDER_OFFSET) ?? 0
    port.getPosition().x = isWest ? -port.size.x - borderOffset : node.size.x + borderOffset
    port.getPosition().y = y
  }
}

function placeHorizontalFreePorts(node: LNode, side: PortSide, portPort: number): void {
  const ports = node.getPorts(side)
  if (ports.length === 0) return

  const nodeW = node.size.x
  const totalW = ports.reduce((sum, p) => sum + p.size.x, 0)
  const available = nodeW
  const alignment = getPortAlignment(node)
  let start = 0

  let effective = alignment
  if ((alignment === 'DISTRIBUTED' || alignment === 'JUSTIFIED') && ports.length === 1) {
    effective = 'CENTER'
  }

  // elkjs JUSTIFIED: 端口从 spacing 开始, 间距 = (avail-totalW)/(n+1) (两端各留 spacing).
  let spacing = portPort
  if (effective === 'JUSTIFIED') {
    spacing = (available - totalW) / (ports.length + 1)
    start = spacing
  }

  switch (effective) {
    case 'CENTER':
      start = (available - totalW) / 2
      break
    case 'END':
      start = available - totalW
      break
    default:
      break
  }

  let x = start
  // ELK NodeContext.comparePortContexts: NORTH/EAST 升序 (volatileId 升), SOUTH/WEST 降序 (volatileId 降).
  // 因此 SOUTH 端口始终右→左 (列表反转后从左到右摆放); 之前"仅 all-output 反转"是 elkjs 时代的镜像 hack.
  const iter = side === PortSide.SOUTH ? [...ports].reverse() : ports
  for (const port of iter) {
    const isNorth = side === PortSide.NORTH
    // ELK PortPlacementCalculator: NORTH 端口 y = -portHeight - PORT_BORDER_OFFSET
    // (负偏移端口伸入节点, 外扩减少). elkjs: SOUTH 端口在节点底部 (y=nodeH).
    const borderOffset = port.getProperty(PORT_BORDER_OFFSET)
    // ELK PortPlacementCalculator.calculateHorizontalPortYCoordinate: NORTH y = -h - offset,
    // SOUTH y = nodeH + offset (绝对坐标含 cell 原点; 701 实证: FIXED_SIDE SOUTH 端口 borderOffset=-8
    // → y=42 而非 50 → margin.bottom 12 而非 20). 之前 SOUTH 忽略 borderOffset (elkjs 语义).
    port.getPosition().y = isNorth ? -port.size.y - (borderOffset ?? 0) : node.size.y + (borderOffset ?? 0)
    port.getPosition().x = x
    x += port.size.x + spacing
  }
}

/**
 * 计算节点 cell 尺寸 (ELK NodeLabelAndSizeCalculator 的简化版, 对应 calculateMinimumGraphSize 的
 * process(applyStuff=false) 调用). 仅统计 PORTS/PORT_LABELS/NODE_LABELS/MINIMUM_SIZE 贡献:
 * - E/W 端口 → 高: ΣportH + (n-1)*portPort + 2*portPort (默认 DISTRIBUTED 对齐) + portsSurrounding;
 * - N/S 端口 → 宽: 同理;
 * - NODE_LABELS → 标签盒; MINIMUM_SIZE → nodeSize.minimum.
 * 316 实证: 2×200 WEST 端口 → 高 430 = 400 + 3*10; 宽度不含端口贡献 (无 N/S) → 0.
 */
export function computeNodeCellSize(node: LNode, graph: LGraph | null): { x: number; y: number } {
  const constraints = node.hasProperty(NODE_SIZE_CONSTRAINTS)
    ? node.getProperty(NODE_SIZE_CONSTRAINTS)
    : graph?.getProperty(NODE_SIZE_CONSTRAINTS) ?? []
  const portPort = graph?.getProperty(SPACING_PORT_PORT) ?? 10
  const surrounding = graph?.getProperty(SPACING_PORTS_SURROUNDING) ?? { top: 0, left: 0, bottom: 0, right: 0 }
  let cellW = 0
  let cellH = 0
  if (constraints.includes('PORTS')) {
    for (const side of [PortSide.EAST, PortSide.WEST]) {
      const ports = node.getPorts(side)
      if (ports.length === 0) continue
      const h = ports.reduce((a, p) => a + p.size.y, 0)
        + (ports.length - 1) * portPort + 2 * portPort
        + surrounding.top + surrounding.bottom
      cellH = Math.max(cellH, h)
    }
    for (const side of [PortSide.NORTH, PortSide.SOUTH]) {
      const ports = node.getPorts(side)
      if (ports.length === 0) continue
      const w = ports.reduce((a, p) => a + p.size.x, 0)
        + (ports.length - 1) * portPort + 2 * portPort
        + surrounding.left + surrounding.right
      cellW = Math.max(cellW, w)
    }
  }
  if (constraints.includes('NODE_LABELS')) {
    for (const label of node.getLabels()) {
      cellW = Math.max(cellW, label.size.x)
      cellH = Math.max(cellH, label.size.y)
    }
  }
  if (constraints.includes('MINIMUM_SIZE')) {
    // ELK getMinimumNodeOrClientAreaSize: 显式 minimum + DEFAULT_MINIMUM_SIZE 默认 20×20 (ElkUtil.DEFAULT_MIN).
    const min = node.hasProperty(NODE_SIZE_MINIMUM)
      ? node.getProperty(NODE_SIZE_MINIMUM)
      : { x: 0, y: 0 }
    cellW = Math.max(cellW, min.x > 0 ? min.x : 20)
    cellH = Math.max(cellH, min.y > 0 ? min.y : 20)
  }
  return { x: cellW, y: cellH }
}

export function processLabelAndNodeSize(layeredGraph: LGraph): void {
    const portPort = layeredGraph.getProperty(SPACING_PORT_PORT)

    for (const layer of layeredGraph.getLayers()) {
      for (const node of layer.getNodes()) {
        // ELK NodeDimensionCalculation filter: 只处理 NORMAL 节点 (dummy 端口位置由
        // HierarchicalPortPositionProcessor 定; FIXED_POS 分支会错误移动 dummy 端口到节点右缘 → +8).
        if (node.getType() !== NodeType.NORMAL) continue
        processNode(node, portPort)
      }
    }

    // ELK LabelAndNodeSizeProcessor (116-158): 外部端口 dummy 排除在 NodeDimensionCalculation 之外
    // (filter NORMAL), 用 placeExternalPortDummyLabels 按**父图** portLabels.placement 放置 dummy 标签,
    // 使后续 NodeMarginCalculator 为容器预留标签空间.
    placeExternalPortDummyLabels(layeredGraph)
  }

/**
 * ELK LabelAndNodeSizeProcessor.placeExternalPortDummyLabels: 放置外部端口 dummy 的端口标签.
 * 用图级 (父容器) placement; FIXED → 标签保持 (0,0) (insidePart 尺寸已在 createExternalPortDummy 修正).
 */
function placeExternalPortDummyLabels(layeredGraph: LGraph): void {
  const placement: string[] = layeredGraph.getProperty<string[]>(PORT_LABELS_PLACEMENT) ?? []
  const placeNextToPort = placement.includes('NEXT_TO_PORT_IF_POSSIBLE')
  const treatAsGroup = layeredGraph.getProperty<boolean>('org.eclipse.elk.portLabels.treatAsGroup') === true
  for (const layer of layeredGraph.getLayers()) {
    for (const node of layer.getNodes()) {
      if (node.getType() !== NodeType.EXTERNAL_PORT) continue
      const dummyPort = node.getPorts()[0]
      if (!dummyPort || dummyPort.getLabels().length === 0) continue
      const spacingH = getIndividualOrDefault(node, SPACING_LABEL_PORT_HORIZONTAL)
      const spacingV = getIndividualOrDefault(node, SPACING_LABEL_PORT_VERTICAL)
      const labelLabelSpacing = getIndividualOrDefault(node, SPACING_LABEL_LABEL)
      const dummySize = node.size
      const dummyPortPos = dummyPort.position
      // computePortLabelBox: 宽 = max label 宽, 高 = Σ label 高 + gap.
      const labels = dummyPort.getLabels()
      let boxW = 0
      let boxH = 0
      for (const l of labels) { boxW = Math.max(boxW, l.size.x); boxH += l.size.y }
      boxH += (labels.length - 1) * labelLabelSpacing
      const box = { x: 0, y: 0, width: boxW, height: boxH }
      const extSide = node.getProperty(EXT_PORT_SIDE)
      const labelNextToPort = (insideLabels: boolean): boolean => {
        if (!placeNextToPort) return false
        return insideLabels
          ? dummyPort.getIncomingEdges().length === 0 && dummyPort.getOutgoingEdges().length === 0
          : dummyPort.getConnectedEdges().length === 0
      }
      if (placement.includes('INSIDE')) {
        switch (extSide) {
          case PortSide.NORTH:
            box.x = (dummySize.x - box.width) / 2 - dummyPortPos.x
            box.y = spacingV
            break
          case PortSide.SOUTH:
            box.x = (dummySize.x - box.width) / 2 - dummyPortPos.x
            box.y = -spacingV - box.height
            break
          case PortSide.EAST:
          case PortSide.WEST:
            if (labelNextToPort(true)) {
              const labelHeight = treatAsGroup ? box.height : labels[0]!.size.y
              box.y = (dummySize.y - labelHeight) / 2 - dummyPortPos.y
            } else {
              box.y = dummySize.y + spacingV - dummyPortPos.y
            }
            box.x = extSide === PortSide.EAST ? -spacingH - box.width : spacingH
            break
        }
      } else if (placement.includes('OUTSIDE')) {
        switch (extSide) {
          case PortSide.NORTH:
          case PortSide.SOUTH:
            box.x = dummyPortPos.x + spacingH
            break
          case PortSide.EAST:
          case PortSide.WEST:
            if (labelNextToPort(false)) {
              const labelHeight = treatAsGroup ? box.height : labels[0]!.size.y
              box.y = (dummySize.y - labelHeight) / 2 - dummyPortPos.y
            } else {
              box.y = dummyPortPos.y + spacingV
            }
            break
        }
      }
      let currentY = box.y
      for (const label of labels) {
        label.position.x = box.x
        label.position.y = currentY
        currentY += label.size.y + labelLabelSpacing
      }
    }
  }
}

function processNode(node: LNode, portPort: number): void {
    // 单次构建 cell 上下文, 供 processNodeLabels / placeNodePorts / placePortLabels 复用
    // (原每阶段各自 buildCellContext → 每节点 2-3 次全量构建). ctx 构建只读图,
    // 各阶段消费顺序与 ELK 阶段顺序完全一致, 位级等价.
    const ctx = buildCellContext(node, node.getGraph(), false)
    processNodeLabels(node, ctx)
    const pc = node.getProperty(PORT_CONSTRAINTS)
    // ELK PortPlacementCalculator FIXED_POS/FIXED_RATIO (jar 意图, PortPlacementCalculator):
    //   - placeVerticalFixedPosPorts: E/W x 恒在边框 (calculateVerticalPortXCoordinate)
    //   - placeHorizontalFixedPosPorts: N/S y 恒在边框 (calculateHorizontalPortYCoordinate)
    //   - 仅对"显式侧"(输入图/用户 setSide) 端口生效; 推断侧 (340 等位置推断) 保留输入位置 (jar 实测).
    if (pc === PortConstraints.FIXED_POS || pc === PortConstraints.FIXED_RATIO
      || String(pc) === 'FIXED_POSITION' || String(pc) === 'FIXED_RATIO') {
      for (const port of node.getPorts(PortSide.NORTH)) {
        if (port.isExplicitSide()) port.getPosition().y = -port.size.y - (port.getProperty(PORT_BORDER_OFFSET) ?? 0)
      }
      for (const port of node.getPorts(PortSide.SOUTH)) {
        if (port.isExplicitSide()) port.getPosition().y = node.size.y + (port.getProperty(PORT_BORDER_OFFSET) ?? 0)
      }
      for (const port of node.getPorts(PortSide.WEST)) {
        if (port.isExplicitSide()) port.getPosition().x = -port.size.x - (port.getProperty(PORT_BORDER_OFFSET) ?? 0)
      }
      for (const port of node.getPorts(PortSide.EAST)) {
        if (port.isExplicitSide()) port.getPosition().x = node.size.x + (port.getProperty(PORT_BORDER_OFFSET) ?? 0)
      }
      // ELK PortLabelPlacementCalculator: FIXED_POS 也放置端口标签 (constrained → E/W 回退 simple;
      // 701 MyCont4/MyCont3 被 compound 处理器转 FIXED_POS → 缺此则容器自身 INSIDE 标签留在输入位 → margin 错).
      placePortLabelsWithCtx(ctx)
      return
    }
    if (node.getNestedGraph() === null) {
      // ELK PortPlacementCalculator: 扁平节点用 cell 矩形 + 端口标签 margin 放置 (FREE).
      placeNodePortsWithCtx(ctx, node.size.x, node.size.y)
      // ELK PHASE 6 offsetSouthernPortsByNodeSize: SOUTH 端口位置 += 节点高度.
      const nh = node.size.y
      for (const port of node.getPorts(PortSide.SOUTH)) port.getPosition().y += nh
      // ELK PHASE 5/6 PortLabelPlacementCalculator + LabelPlacer: INSIDE/OUTSIDE 端口标签定位.
      placePortLabelsWithCtx(ctx)
    } else {
      // 容器节点: 端口放置保持 old placement (resizeParentNode 后由调用方处理);
      // 端口标签放置仍须执行 (ELK LabelAndNodeSize 对 compound 节点也跑 PortLabelPlacementCalculator —
      // 701 MyCont4 INSIDE E 标签被放到 rect.x=-93 避免右越界, ggn 缺 → 标签留在输入位 → margin.right=52 vs 12).
      placeVerticalPortsEqually(node, PortSide.WEST, portPort)
      placeVerticalPortsEqually(node, PortSide.EAST, portPort)
      placeHorizontalFreePorts(node, PortSide.NORTH, portPort)
      placeHorizontalFreePorts(node, PortSide.SOUTH, portPort)
      placePortLabelsWithCtx(ctx)
    }
  }

  /**
   * 节点标签尺寸与放置 (对应 ELK NodeLabelAndSizeCalculator 的 NODE_LABELS 约束子集):
   * NODE_SIZE_CONSTRAINTS 含 NODE_LABELS 时, 节点尺寸 = 标签盒 + NODE_LABELS_PADDING;
   * 标签置于 (padding.left, padding.top).
   */
function processNodeLabels(node: LNode, ctx: CellCtx): void {
    const labels = node.getLabels()
    // ELK 选项继承: 节点未设置时回退到父图 (targets parents + nodes).
    const graph = node.getGraph()
    const constraints = node.hasProperty(NODE_SIZE_CONSTRAINTS)
      ? node.getProperty(NODE_SIZE_CONSTRAINTS)
      : graph?.getProperty(NODE_SIZE_CONSTRAINTS) ?? []
    // MINIMUM_SIZE 约束: 节点尺寸 = max(计算值, nodeSize.minimum) (ELK NodeLabelAndSizeUtilities).
    if (constraints.includes('MINIMUM_SIZE')) {
      // ELK NodeLabelAndSizeUtilities.getMinimumNodeSize: 只读**节点级** nodeSize.minimum,
      // 不回退图级 (NodeLabelAndSizeUtilities.java:226). 图级 minimum 由 calculateMinimumGraphSize
      // 用于嵌套图 resize, 子节点继承图级 minimum 是错的 — content_centered 实证: 嵌套图 minimum
      // (900,400) 被 n2/n3 继承 → 全变 900×400.
      const minimum = node.hasProperty(NODE_SIZE_MINIMUM)
        ? node.getProperty(NODE_SIZE_MINIMUM)
        : { x: 0, y: 0 }
      // 方向变换 (GraphTransformer TO_INPUT, transposeProperties) 已转置 NODE_SIZE_MINIMUM —
      // 与 ELK 导入期应用 minimum 对齐 (476 实证: 重复手动互换 → 200x200 回归).
      node.size.x = Math.max(node.size.x, minimum.x)
      node.size.y = Math.max(node.size.y, minimum.y)
    }
    // PORTS: 扁平节点 cell 覆盖 (299 实证: 3×8 EAST → 20×64; 必须在本函数提前返回前, 无标签节点也走).
    // 容器节点由 applyNestedGraphMinimumSizes → resizeParentNode 处理 (316).
    // 注意: PORT_LABELS 单独约束不覆盖 — ELK 056 实证: PORT_LABELS-only 节点保留显式尺寸 80×80
    // (无端口标签贡献时 cell min 不接管; 生成测试端口标签为空).
    if (constraints.includes('PORTS') && node.getNestedGraph() === null) {
      // cell 系统最小尺寸 (ELK 网格叠加): PORTS/NODE_LABELS/PORT_LABELS 一并参与;
      // MINIMUM_SIZE 由 NodeSizeCalculator 在 cell min 之上取 max (不能丢).
      const cell = computeCellSystemSizeWithCtx(ctx)
      if (cell) {
        let x = cell.x
        let y = cell.y
        // 旧 computeNodeCellSize 语义: MINIMUM_SIZE → 至少 20×20 (ELK DEFAULT_MINIMUM_SIZE 默认生效),
        // 显式 minimum > 0 时用显式值 (299 N1: cell 0×64 → 20×64; 425/flexible_ports 同理).
        if (constraints.includes('MINIMUM_SIZE')) {
          const minimum = node.hasProperty(NODE_SIZE_MINIMUM) ? node.getProperty(NODE_SIZE_MINIMUM) : { x: 0, y: 0 }
          x = Math.max(x, minimum.x > 0 ? minimum.x : 20)
          y = Math.max(y, minimum.y > 0 ? minimum.y : 20)
        }
        node.size.x = x
        node.size.y = y
      }
    }
    if (labels.length === 0) return
    const hasLabelConstraint = constraints.includes('NODE_LABELS')

    const padding = node.hasProperty(NODE_LABELS_PADDING)
      ? node.getProperty(NODE_LABELS_PADDING)
      : graph?.getProperty(NODE_LABELS_PADDING) ?? { top: 5, right: 5, bottom: 5, left: 5 }
    let maxW = 0
    let maxH = 0
    for (const label of labels) {
      maxW = Math.max(maxW, label.size.x)
      maxH = Math.max(maxH, label.size.y)
    }
    // NODE_LABELS 约束时**覆盖**节点尺寸 = 标签盒 (ELK NodeLabelAndSizeCalculator: 非 FIXED 约束时
    // node.size = cell 最小尺寸, 不是 max(输入)). 724 实证: 0 尺寸标签 → 节点 0×0 (ggn 之前 max(30,10)=30).
    // 注意: 标签 cell padding 恒为 0 (ELK 只对 COMPUTE_PADDING 调 setPadding), NODE_LABELS_PADDING
    // 只用于标签定位 (label.position), 不参与节点尺寸.
    // 条件: 仅当节点无 PORTS/PORT_LABELS 约束时覆盖 — 有端口约束时 cell 最小尺寸含端口贡献,
    // ggn 尚未实现 PORTS/PORT_LABELS 尺寸 (701 实证: 覆盖到 0 → 节点重叠). 待 cell 尺寸系统完成后再统一.
    const hasPortSizeConstraint = constraints.includes('PORTS') || constraints.includes('PORT_LABELS')
    // 容器节点 (有 nested graph) 尺寸由 resizeParentNode (nested 内容 + padding) 决定, NODE_LABELS
    // 约束不覆盖为标签盒 — partitioning.elkt default 容器 354×280 (nested) vs 标签盒 53×25 实证;
    // 容器标签通过 computeInsideNodeLabelPadding 计入 padding, 不直接设节点尺寸.
    // 黑盒节点 (SEPARATE_CHILDREN: nested 内容由 provider 布局, buildGraph 跳过 nested graph →
    // getNestedGraph()===null) 同样跳过覆盖 — 否则 NODE_LABELS 覆盖成标签盒、provider 布局的
    // 内容尺寸丢失 → 容器被压扁、子节点溢出 (2026-08-15 黑盒 label 移植缺陷: box/force/radial +
    // NODE_LABELS 容器 30 vs elkjs 内容 105/240/50, 差分实证 Java 容器 = 内容尺寸).
    const isBlackBox = node.getProperty(HIERARCHY_HANDLING) === 'SEPARATE_CHILDREN'
    if (hasLabelConstraint && !hasPortSizeConstraint && node.getNestedGraph() === null && !isBlackBox) {
      // ELK cell 最小尺寸 = max(NODE_LABELS 标签盒, MINIMUM_SIZE) — hierarchy01 实证:
      // MINIMUM_SIZE (默认 20×20) 不能被标签覆盖清掉 (0 尺寸标签 → 20×20 非 0×0).
      let lx = maxW
      let ly = maxH
      if (constraints.includes('MINIMUM_SIZE')) {
        const min = node.hasProperty(NODE_SIZE_MINIMUM) ? node.getProperty(NODE_SIZE_MINIMUM) : { x: 0, y: 0 }
        lx = Math.max(lx, min.x > 0 ? min.x : 20)
        ly = Math.max(ly, min.y > 0 ? min.y : 20)
      }
      // Issue682: NODE_LABELS cell 尺寸含 NODE_LABELS_PADDING (ELK cell-system LabelCell 语义).
      // 注: 0 尺寸标签 (insideNodeLabels_01) ELK 的 cell 仍 10×10 而节点 0×0 居中 — 需 cell-system
      // 移植才能完全对齐 (节点尺寸 vs cell 尺寸分离). 此处保留 padding (724 依赖).
      // B16f: NODE_LABELS + MINIMUM_SIZE 组合时 nodeSize = max(标签盒, minimum), **不含 padding**
      // (ELK NodeSizeCalculator: nodeSize = max(cell minimumWidth, minimum), cell minimumWidth 不含 padding;
      //  hierarchy01 Cache/Workflow 20×20 vs ggn 30×30 实证). 无 MINIMUM 时保留 padding (insideNodeLabels_01
      //  10×10 cell → collapseZeroLabelCells 收尾).
      const hasMinSize = constraints.includes('MINIMUM_SIZE')
      if (hasMinSize) {
        node.size.x = lx
        node.size.y = ly
      } else {
        node.size.x = lx + padding.left + padding.right
        node.size.y = ly + padding.top + padding.bottom
      }
    }

    // 标签放置: 按 NODE_LABELS_PLACEMENT (INSIDE V_TOP/V_CENTER/V_BOTTOM × H_LEFT/H_CENTER/H_RIGHT),
    // 对齐 ELK cell-system (NodeLabelCellCreator/NodeLabelLocation):
    //   - V_TOP 标签从 padding.top 向下堆叠; V_BOTTOM 从 padding.bottom 向上堆叠; V_CENTER 垂直居中;
    //   - H_LEFT/CENTER/RIGHT 各自独立定位 (非共享列);
    //   - labelLabel 间距 (默认 0).
    // 无 placement 时保持默认 H_CENTER + V_TOP (Issue476 节点标签居中不变量).
    placeNodeLabels(node, labels, padding, graph)
    void NODE_LABELS_PLACEMENT
}

/** 节点 label 放置: ELK cell-system 网格语义 (NodeLabelCellCreator/NodeLabelLocation).
 * INSIDE: 行 = V (TOP/CENTER/BOTTOM), 列 = H (LEFT/CENTER/RIGHT); 同 (V,H) cell 内纵向堆叠.
 * OUTSIDE: 无 H_PRIORITY → 标签放垂直侧 (V_TOP 上方 / V_BOTTOM 下方), x 按 H 对齐;
 *          含 H_PRIORITY → 标签放水平侧 (H_LEFT 左侧 / H_RIGHT 右侧), y 按 V 对齐.
 * 间距: INSIDE 用 labelLabel, OUTSIDE 用 labelNode (默认 5). */
function placeNodeLabels(node: LNode, labels: { position: { x: number; y: number }; size: { x: number; y: number }; placement?: string }[],
  padding: { top: number; left: number; right: number; bottom: number }, graph: LGraph | null): void {
  if (labels.length === 0) return
  const labelLabel = graph?.getProperty(SPACING_LABEL_LABEL) ?? 0
  // 图级 labelNode 生效 (ELK melk targets parents) — getProperty 返回默认值 5 会短路旧回退链, 走专用解析.
  const labelNode = labelNodeSpacing(node)
  const nodePlacement = node.getProperty(NODE_LABELS_PLACEMENT)
  const parse = (l: { placement?: string }): string[] => {
    const p = l.placement ?? nodePlacement ?? ''
    return Array.isArray(p) ? p : String(p).split(/[\s,]+/).filter(Boolean)
  }
  const vOf = (p: string[]): 'top' | 'center' | 'bottom' =>
    p.includes('V_BOTTOM') ? 'bottom' : p.includes('V_CENTER') ? 'center' : 'top'
  const hOf = (p: string[]): 'left' | 'center' | 'right' =>
    p.includes('H_RIGHT') ? 'right' : p.includes('H_LEFT') ? 'left' : 'center'

  // 每标签只解析一次 placement (原每次循环都 getProperty + split; 语义一致).
  const parsed: string[][] = new Array(labels.length)
  for (let i = 0; i < labels.length; i++) parsed[i] = parse(labels[i]!)
  // OUTSIDE 标签单独处理 (不进 INSIDE cell 网格)
  const outside: typeof labels = []
  const inside: typeof labels = []
  for (let i = 0; i < labels.length; i++) {
    if (parsed[i]!.includes('OUTSIDE')) outside.push(labels[i]!)
    else inside.push(labels[i]!)
  }
  if (outside.length > 0) {
    for (const l of outside) {
      // OUTSIDE label 放置 (NodeLabelPlacer): 垂直侧 OUT_T_*/OUT_B_* (V_TOP 上方 / V_BOTTOM 下方),
      // 水平侧 OUT_L_*/OUT_R_* (H_PRIORITY+H_LEFT/H_RIGHT 或 V_CENTER+H_LEFT/H_RIGHT).
      placeOutsideNodeLabel(l, node.size, effectivePlacement(l, node), labelNode)
    }
  }
  if (inside.length === 0) return

  // cells[v][h] = labels[]
  const cells: Record<string, Record<string, typeof inside>> = { top: {}, center: {}, bottom: {} }
  for (let i = 0; i < labels.length; i++) {
    const pl = parsed[i]!
    if (pl.includes('OUTSIDE')) continue
    const v = vOf(pl), h = hOf(pl)
    ;(cells[v][h] ??= []).push(labels[i]!)
  }
  // 各 V 行高度 = max over H 列 (该列堆叠高度)
  const rowH = (v: 'top' | 'center' | 'bottom'): number => {
    let max = 0
    for (const col of Object.values(cells[v])) {
      const h = col.reduce((a, l) => a + l.size.y + labelLabel, 0) - (col.length > 0 ? labelLabel : 0)
      max = Math.max(max, h)
    }
    return max
  }
  const topH = rowH('top'), bottomH = rowH('bottom'), centerH = rowH('center')

  // 各 V 行起始 y
  const rowY = (v: 'top' | 'center' | 'bottom', col: typeof inside): number => {
    if (v === 'top') return padding.top
    if (v === 'bottom') return node.size.y - padding.bottom - (col.reduce((a, l) => a + l.size.y + labelLabel, 0) - (col.length > 0 ? labelLabel : 0))
    // center: 垂直居中于 top 与 bottom 行之间
    const regionTop = padding.top + topH + labelLabel
    const regionBottom = node.size.y - padding.bottom - bottomH - labelLabel
    return regionTop + (regionBottom - regionTop - centerH) / 2
  }

  for (const v of ['top', 'center', 'bottom'] as const) {
    for (const h of Object.keys(cells[v])) {
      const col = cells[v][h]!
      let y = rowY(v, col)
      for (const l of col) { l.position.y = y; y += l.size.y + labelLabel }
    }
  }

  // H: 每列 x
  for (let i = 0; i < labels.length; i++) {
    if (parsed[i]!.includes('OUTSIDE')) continue
    const l = labels[i]!
    const h = hOf(parsed[i]!)
    if (h === 'right') l.position.x = node.size.x - l.size.x - padding.right
    else if (h === 'left') l.position.x = padding.left
    else l.position.x = padding.left + (node.size.x - padding.left - padding.right - l.size.x) / 2
  }
}
