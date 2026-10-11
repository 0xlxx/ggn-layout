/*
 * Copyright (c) 2026 GGN contributors.
 * Portions derived from the Eclipse Layout Kernel (ELK), Copyright (c) Kiel University and others.
 *
 * This file is part of ggn-layout, a TypeScript port of ELK v0.12.0.
 * Upstream attribution and source range: see THIRD_PARTY_NOTICES.md.
 *
 * SPDX-License-Identifier: EPL-2.0
 * License text: LICENSES/EPL-2.0.txt.
 */
/**
 * GraphTransformer (对应 ELK intermediate.GraphTransformer).
 *
 * 非 RIGHT 方向: 布局前把图变换到内部 LTR (left-to-right) 语义, 布局后变换回原方向.
 * 这是完整图变换 (transpose + mirror), 覆盖节点/端口/边/标签的坐标与侧, 而非简单 swap.
 *
 * - TO_INPUT_DIRECTION (布局前, 对应 ELK DIRECTION_PREPROCESSOR):
 *     LEFT: mirrorX + mirrorY
 *     DOWN: rotate90CounterClockwise = mirrorX + transpose
 *     UP:   rotate90Clockwise        = transpose + mirrorX
 * - TO_INTERNAL_LTR (布局后, 对应 ELK DIRECTION_POSTPROCESSOR):
 *     LEFT: mirrorX + mirrorY
 *     DOWN: rotate90Clockwise        = transpose + mirrorX
 *     UP:   rotate90CounterClockwise = mirrorX + transpose
 */
import type { LGraph } from '../graph/lgraph.js'
import type { LNode, LLabel } from '../graph/lnode.js'
import { Direction, PortSide, NodeType, LayerConstraint, InLayerConstraint } from '../graph/enums.js'
import { EXT_PORT_SIDE } from '../options/internal-properties.js'
import { LPort } from '../graph/lport.js'


import {
  PORT_INDEX,
  JUNCTION_POINTS,
  DIRECTION,
  DIRECTION_CONGRUENCY,
  NODE_LABELS_PADDING,
  POSITION,
  NODE_SIZE_MINIMUM,
  ALIGNMENT,
  NODE_LABELS_PLACEMENT,
  EDGE_LABELS_SIDE_SELECTION,
  EdgeLabelSideSelection,
} from '../options/layered-options.js'

export enum TransformMode {
  TO_INPUT_DIRECTION = 'TO_INPUT_DIRECTION',
  TO_INTERNAL_LTR = 'TO_INTERNAL_LTR',
}

type V = { x: number; y: number }
type Padding = { left: number; top: number; right: number; bottom: number }

function transposeV(v: V): void {
  const t = v.x
  v.x = v.y
  v.y = t
}

function mirrorXV(v: V, offset: number): void {
  v.x = offset - v.x
}

function mirrorYV(v: V, offset: number): void {
  v.y = offset - v.y
}

function transposePadding(p: Padding): void {
  const oldTop = p.top
  const oldBottom = p.bottom
  const oldLeft = p.left
  const oldRight = p.right
  p.top = oldLeft
  p.bottom = oldRight
  p.left = oldTop
  p.right = oldBottom
}

function mirrorXPadding(p: Padding): void {
  const oldLeft = p.left
  p.left = p.right
  p.right = oldLeft
}

function mirrorYPadding(p: Padding): void {
  const oldTop = p.top
  p.top = p.bottom
  p.bottom = oldTop
}

function mirrorPortSideX(side: PortSide): PortSide {
  if (side === PortSide.EAST) return PortSide.WEST
  if (side === PortSide.WEST) return PortSide.EAST
  return side
}

function mirrorPortSideY(side: PortSide): PortSide {
  if (side === PortSide.NORTH) return PortSide.SOUTH
  if (side === PortSide.SOUTH) return PortSide.NORTH
  return side
}

function transposePortSide(side: PortSide): PortSide {
  switch (side) {
    case PortSide.NORTH: return PortSide.WEST
    case PortSide.WEST: return PortSide.NORTH
    case PortSide.SOUTH: return PortSide.EAST
    case PortSide.EAST: return PortSide.SOUTH
    default: return PortSide.UNDEFINED
  }
}

function reverseIndex(port: LPort): void {
  const index = port.getProperty(PORT_INDEX)
  if (index !== null && index !== undefined) {
    port.setProperty(PORT_INDEX, -index)
  }
}

function mirrorLayerConstraintX(node: LNode): void {
  switch (node.getLayerConstraint()) {
    case LayerConstraint.FIRST:
      node.setLayerConstraint(LayerConstraint.LAST)
      break
    case LayerConstraint.FIRST_SEPARATE:
      node.setLayerConstraint(LayerConstraint.LAST_SEPARATE)
      break
    case LayerConstraint.LAST:
      node.setLayerConstraint(LayerConstraint.FIRST)
      break
    case LayerConstraint.LAST_SEPARATE:
      node.setLayerConstraint(LayerConstraint.FIRST_SEPARATE)
      break
  }
}

function mirrorInLayerConstraintY(node: LNode): void {
  switch (node.getInLayerConstraint()) {
    case InLayerConstraint.TOP:
      node.setInLayerConstraint(InLayerConstraint.BOTTOM)
      break
    case InLayerConstraint.BOTTOM:
      node.setInLayerConstraint(InLayerConstraint.TOP)
      break
  }
}

function transposeLayerConstraint(node: LNode): void {
  // 逐字同构 ELK GraphTransformer.java:795-812. ggn LNode 的未设置默认值是 null,
  // 等价于 Java 属性默认值 LayerConstraint.NONE / InLayerConstraint.NONE —— 上述各
  // 分支判定在 null 与 NONE 下行为一致, 且显式写入的值与 Java 相同 (NONE), 往返语义不变.
  const layerConstraint = node.getLayerConstraint()
  const inLayerConstraint = node.getInLayerConstraint()
  if (layerConstraint === LayerConstraint.FIRST_SEPARATE) {
    node.setLayerConstraint(LayerConstraint.NONE)
    node.setInLayerConstraint(InLayerConstraint.TOP)
  } else if (layerConstraint === LayerConstraint.LAST_SEPARATE) {
    node.setLayerConstraint(LayerConstraint.NONE)
    node.setInLayerConstraint(InLayerConstraint.BOTTOM)
  } else if (inLayerConstraint === InLayerConstraint.TOP) {
    node.setLayerConstraint(LayerConstraint.FIRST_SEPARATE)
    node.setInLayerConstraint(InLayerConstraint.NONE)
  } else if (inLayerConstraint === InLayerConstraint.BOTTOM) {
    node.setLayerConstraint(LayerConstraint.LAST_SEPARATE)
    node.setInLayerConstraint(InLayerConstraint.NONE)
  }
}


/** 解析 placement (string[] 或字符串如 "[H_LEFT, V_TOP, OUTSIDE]") → token 数组
 * (与 elkgraph-builder / effectivePlacement 同源解析: 去方括号 + split). */
function parsePlacement(raw: string | string[] | undefined): string[] {
  if (Array.isArray(raw)) return [...raw]
  return String(raw ?? '').replace(/[\[\]]/g, '').split(/[\s,]+/).filter(Boolean)
}

/** mirrorX 的 placement: H_LEFT ↔ H_RIGHT (ELK mirrorNodeLabelPlacementX: if/else-if 语义). */
function mirrorXPlacementTokens(tokens: string[]): string[] {
  const out = [...tokens]
  const iLeft = out.indexOf('H_LEFT')
  const iRight = out.indexOf('H_RIGHT')
  if (iLeft >= 0) out[iLeft] = 'H_RIGHT'
  else if (iRight >= 0) out[iRight] = 'H_LEFT'
  return out
}

/** mirrorY 的 placement: V_TOP ↔ V_BOTTOM (ELK mirrorNodeLabelPlacementY). */
function mirrorYPlacementTokens(tokens: string[]): string[] {
  const out = [...tokens]
  const iTop = out.indexOf('V_TOP')
  const iBottom = out.indexOf('V_BOTTOM')
  if (iTop >= 0) out[iTop] = 'V_BOTTOM'
  else if (iBottom >= 0) out[iBottom] = 'V_TOP'
  return out
}

/** transpose 的 placement (ELK transposeNodeLabelPlacement): 水平/垂直对齐互换;
 * 非空且无 INSIDE → 补 OUTSIDE; 无 H_PRIORITY → 补 H_PRIORITY. */
function transposePlacementTokens(tokens: string[]): string[] {
  if (tokens.length === 0) return tokens
  const out: string[] = []
  if (tokens.includes('INSIDE')) out.push('INSIDE')
  else out.push('OUTSIDE')
  if (!tokens.includes('H_PRIORITY')) out.push('H_PRIORITY')
  if (tokens.includes('H_LEFT')) out.push('V_TOP')
  else if (tokens.includes('H_CENTER')) out.push('V_CENTER')
  else if (tokens.includes('H_RIGHT')) out.push('V_BOTTOM')
  if (tokens.includes('V_TOP')) out.push('H_LEFT')
  else if (tokens.includes('V_CENTER')) out.push('H_CENTER')
  else if (tokens.includes('V_BOTTOM')) out.push('H_RIGHT')
  return out
}

function serializePlacement(tokens: string[]): string {
  return tokens.join(', ')
}

export class GraphTransformer {
  constructor(private readonly mode: TransformMode) {}

  process(layeredGraph: LGraph): void {

    const nodes: LNode[] = [...layeredGraph.getLayerlessNodes()]
    for (const layer of layeredGraph.getLayers()) {
      nodes.push(...layer.getNodes())
    }
    // 只处理显式方向 (UNDEFINED/RIGHT 不变换, ELK GraphConfigurator 语义).
    // ELK 默认 READING_DIRECTION: 保持自然阅读方向 (LEFT 只镜像 X, DOWN/UP 只转置).
    // ROTATION: 四方向是 LTR 结果的旋转 (LEFT 镜像 X+Y, DOWN/UP 旋转 90°).
    const direction = layeredGraph.getProperty(DIRECTION)
    const reading = layeredGraph.getProperty(DIRECTION_CONGRUENCY) === 'READING_DIRECTION'
    const toInput = this.mode === TransformMode.TO_INPUT_DIRECTION
    if (reading) {
      switch (direction) {
        case Direction.LEFT:
          this.mirrorAllX(layeredGraph, nodes)
          break
        case Direction.DOWN:
          this.transposeAll(layeredGraph, nodes)
          break
        case Direction.UP:
          if (!toInput) {
            this.transposeAll(layeredGraph, nodes)
            this.mirrorAllY(layeredGraph, nodes)
          } else {
            this.mirrorAllY(layeredGraph, nodes)
            this.transposeAll(layeredGraph, nodes)
          }
          break
      }
    } else if (toInput) {
      switch (direction) {
        case Direction.LEFT:
          this.mirrorAllX(layeredGraph, nodes)
          this.mirrorAllY(layeredGraph, nodes)
          break
        case Direction.DOWN:
          // rotate90CounterClockwise
          this.mirrorAllX(layeredGraph, nodes)
          this.transposeAll(layeredGraph, nodes)
          break
        case Direction.UP:
          // rotate90Clockwise
          this.transposeAll(layeredGraph, nodes)
          this.mirrorAllX(layeredGraph, nodes)
          break
      }
    } else {
      switch (direction) {
        case Direction.LEFT:
          this.mirrorAllX(layeredGraph, nodes)
          this.mirrorAllY(layeredGraph, nodes)
          break
        case Direction.DOWN:
          // rotate90Clockwise
          this.transposeAll(layeredGraph, nodes)
          this.mirrorAllX(layeredGraph, nodes)
          break
        case Direction.UP:
          // rotate90CounterClockwise
          this.mirrorAllX(layeredGraph, nodes)
          this.transposeAll(layeredGraph, nodes)
          break
      }
    }
  }



  // ── mirrorX ──

  private mirrorAllX(graph: LGraph, nodes: LNode[]): void {
    if (graph.hasProperty(NODE_LABELS_PADDING)) mirrorXPadding(graph.getProperty(NODE_LABELS_PADDING))
    let offset = 0
    if (graph.getSize().x === 0) {
      for (const node of nodes) {
        offset = Math.max(offset, node.position.x + node.size.x + node.getMargin().right)
      }
    } else {
      offset = graph.getSize().x - graph.getOffset().x
    }
    offset -= graph.getOffset().x

    for (const node of nodes) {
      mirrorXV(node.position, offset - node.size.x)
      mirrorXPadding(node.getPadding())
      this.mirrorLabelPlacementX(node)
      this.mirrorPositionX(node, offset)
      this.mirrorAlignmentX(node)

      const nodeSize = node.size
      for (const port of node.getPorts()) {
        mirrorXV(port.getPosition(), nodeSize.x - port.getSize().x)
        mirrorXV(port.getAnchor(), port.getSize().x)
        port.setSideInferred(mirrorPortSideX(port.getSide()))
        reverseIndex(port)

        for (const edge of port.getOutgoingEdges()) {
          for (const bendPoint of edge.getBendPoints()) mirrorXV(bendPoint, offset)
          const junctionPoints = edge.getProperty(JUNCTION_POINTS) as V[] | null | undefined
          if (junctionPoints != null) {
            for (const jp of junctionPoints) mirrorXV(jp, offset)
          }
          for (const label of edge.getLabels()) {
            mirrorXV(label.position, offset - label.size.x)
          }
        }
        for (const label of port.getLabels()) {
          mirrorXV(label.position, port.getSize().x - label.size.x)
        }
      }

      if (node.getType() === NodeType.EXTERNAL_PORT) {
        node.setProperty(EXT_PORT_SIDE, mirrorPortSideX(node.getProperty(EXT_PORT_SIDE)))
        mirrorLayerConstraintX(node)
      }

      // 节点标签: ELK mirrorX(nodes) 会镜像标签位置 (mirrorNodeLabelPlacementX + mirrorX).
      for (const label of node.getLabels()) {
        this.mirrorLabelPlacementXOn(label)
        mirrorXV(label.position, nodeSize.x - label.size.x)
      }
    }
  }

  // ── mirrorY ──

  private mirrorAllY(graph: LGraph, nodes: LNode[]): void {
    if (graph.hasProperty(NODE_LABELS_PADDING)) mirrorYPadding(graph.getProperty(NODE_LABELS_PADDING))
    let offset = 0
    if (graph.getSize().y === 0) {
      for (const node of nodes) {
        offset = Math.max(offset, node.position.y + node.size.y + node.getMargin().bottom)
      }
    } else {
      offset = graph.getSize().y - graph.getOffset().y
    }
    offset -= graph.getOffset().y

    for (const node of nodes) {
      mirrorYV(node.position, offset - node.size.y)
      mirrorYPadding(node.getPadding())
      this.mirrorLabelPlacementY(node)
      this.mirrorPositionY(node, offset)
      this.mirrorAlignmentY(node)

      const nodeSize = node.size
      for (const port of node.getPorts()) {
        mirrorYV(port.getPosition(), nodeSize.y - port.getSize().y)
        mirrorYV(port.getAnchor(), port.getSize().y)
        port.setSideInferred(mirrorPortSideY(port.getSide()))
        reverseIndex(port)

        for (const edge of port.getOutgoingEdges()) {
          for (const bendPoint of edge.getBendPoints()) mirrorYV(bendPoint, offset)
          const junctionPoints = edge.getProperty(JUNCTION_POINTS) as V[] | null | undefined
          if (junctionPoints != null) {
            for (const jp of junctionPoints) mirrorYV(jp, offset)
          }
          for (const label of edge.getLabels()) {
            mirrorYV(label.position, offset - label.size.y)
          }
        }
        for (const label of port.getLabels()) {
          mirrorYV(label.position, port.getSize().y - label.size.y)
        }
      }

      if (node.getType() === NodeType.EXTERNAL_PORT) {
        node.setProperty(EXT_PORT_SIDE, mirrorPortSideY(node.getProperty(EXT_PORT_SIDE)))
        mirrorInLayerConstraintY(node)
      }

      for (const label of node.getLabels()) {
        this.mirrorLabelPlacementYOn(label)
        mirrorYV(label.position, nodeSize.y - label.size.y)
      }
    }
  }

  // ── transpose ──

  private transposeAll(graph: LGraph, nodes: LNode[]): void {
    transposeV(graph.getOffset())
    transposeV(graph.getSize())
    transposePadding(graph.getPadding())
    // ELK transposeAll: 转置 NODE_LABELS_PADDING (方向往返后节点标签局部坐标保持).
    if (graph.hasProperty(NODE_LABELS_PADDING)) {
      transposePadding(graph.getProperty(NODE_LABELS_PADDING))
    }

    for (const node of nodes) {
      transposeV(node.position)
      transposeV(node.size)
      transposePadding(node.getPadding())
      this.transposeLabelPlacement(node)
      this.transposeProperties(node)

      for (const port of node.getPorts()) {
        transposeV(port.getPosition())
        transposeV(port.getAnchor())
        transposeV(port.getSize())
        port.setSideInferred(transposePortSide(port.getSide()))
        reverseIndex(port)

        for (const edge of port.getOutgoingEdges()) {
          for (const bendPoint of edge.getBendPoints()) transposeV(bendPoint)
          const junctionPoints = edge.getProperty(JUNCTION_POINTS) as V[] | null | undefined
          if (junctionPoints != null) {
            for (const jp of junctionPoints) transposeV(jp)
          }
          for (const label of edge.getLabels()) {
            transposeV(label.position)
            transposeV(label.size)
          }
        }
        for (const label of port.getLabels()) {
          transposeV(label.position)
          transposeV(label.size)
        }
      }

      if (node.getType() === NodeType.EXTERNAL_PORT) {
        node.setProperty(EXT_PORT_SIDE, transposePortSide(node.getProperty(EXT_PORT_SIDE)))
        transposeLayerConstraint(node)
      }

      for (const label of node.getLabels()) {
        this.transposeLabelPlacementOn(label)
        transposeV(label.size)
        transposeV(label.position)
      }
    }
  }
  // ── 1:1 补齐 (ELK GraphTransformer.java 0.12.0): placement / POSITION / ALIGNMENT /
  //     NODE_SIZE_MINIMUM / EDGE_LABELS_SIDE_SELECTION 的方向变换 ──

  private mirrorLabelPlacementX(node: LNode): void {
    if (!node.hasProperty(NODE_LABELS_PLACEMENT)) return
    const tokens = parsePlacement(node.getProperty<string | string[]>(NODE_LABELS_PLACEMENT))
    if (tokens.length === 0) return
    node.setProperty(NODE_LABELS_PLACEMENT, mirrorXPlacementTokens(tokens))
  }

  private mirrorLabelPlacementY(node: LNode): void {
    if (!node.hasProperty(NODE_LABELS_PLACEMENT)) return
    const tokens = parsePlacement(node.getProperty<string | string[]>(NODE_LABELS_PLACEMENT))
    if (tokens.length === 0) return
    node.setProperty(NODE_LABELS_PLACEMENT, mirrorYPlacementTokens(tokens))
  }

  private transposeLabelPlacement(node: LNode): void {
    if (!node.hasProperty(NODE_LABELS_PLACEMENT)) return
    const tokens = parsePlacement(node.getProperty<string | string[]>(NODE_LABELS_PLACEMENT))
    node.setProperty(NODE_LABELS_PLACEMENT, transposePlacementTokens(tokens))
  }

  private mirrorLabelPlacementXOn(label: LLabel): void {
    if (label.placement === undefined || label.placement === '') return
    const tokens = parsePlacement(label.placement)
    if (tokens.length === 0) return
    label.placement = serializePlacement(mirrorXPlacementTokens(tokens))
  }

  private mirrorLabelPlacementYOn(label: LLabel): void {
    if (label.placement === undefined || label.placement === '') return
    const tokens = parsePlacement(label.placement)
    if (tokens.length === 0) return
    label.placement = serializePlacement(mirrorYPlacementTokens(tokens))
  }

  private transposeLabelPlacementOn(label: LLabel): void {
    if (label.placement === undefined || label.placement === '') return
    const tokens = parsePlacement(label.placement)
    if (tokens.length === 0) return
    label.placement = serializePlacement(transposePlacementTokens(tokens))
  }

  /** 节点显式位置 (ELK CoreOptions.POSITION): mirrorX (布局前/后各一次). */
  private mirrorPositionX(node: LNode, offset: number): void {
    if (!node.hasProperty(POSITION)) return
    const pos = node.getProperty<{ x: number; y: number } | null>(POSITION)
    if (pos) mirrorXV(pos, offset - node.size.x)
  }

  private mirrorPositionY(node: LNode, offset: number): void {
    if (!node.hasProperty(POSITION)) return
    const pos = node.getProperty<{ x: number; y: number } | null>(POSITION)
    if (pos) mirrorYV(pos, offset - node.size.y)
  }

  private mirrorAlignmentX(node: LNode): void {
    switch (node.getProperty(ALIGNMENT)) {
      case 'LEFT':
        node.setProperty(ALIGNMENT, 'RIGHT')
        break
      case 'RIGHT':
        node.setProperty(ALIGNMENT, 'LEFT')
        break
    }
  }

  private mirrorAlignmentY(node: LNode): void {
    switch (node.getProperty(ALIGNMENT)) {
      case 'TOP':
        node.setProperty(ALIGNMENT, 'BOTTOM')
        break
      case 'BOTTOM':
        node.setProperty(ALIGNMENT, 'TOP')
        break
    }
  }

  /** ELK transposeProperties: NODE_SIZE_MINIMUM / ALIGNMENT / POSITION 转置. */
  private transposeProperties(node: LNode): void {
    const minSize = node.getProperty(NODE_SIZE_MINIMUM)
    node.setProperty(NODE_SIZE_MINIMUM, { x: minSize.y, y: minSize.x })
    // 注：nested graph 的 NODE_SIZE_MINIMUM（applyNestedGraphMinimumSizes 写入的 cell 尺寸）
    // **不随方向转置**——ELK Java 0.12.0 GraphTransformer.transposeAll（javap 实证）只转置
    // offset/size/padding/NODE_LABELS_PADDING，nested min 保持导入期原始方向值；ggn 曾加
    // nested min 转置（7ced459）导致 DOWN/UP 容器尺寸错（136×83 vs jar 76×136），2026-08-16
    // P1-1 修复撤销。nested min 方向正确性由 applyNestedGraphMinimumSizes 的 FREE 端口按方向
    // 定侧保证（ElkGraphImporter ensureDefinedPortSide，port-side-processor setPortSide）。
    // contentAlignment 随方向转置（2026-08-16 对齐 elkjs）：DOWN/UP 下 H↔V 互换——
    // NODE_LABELS 撑宽在 canonical LTR 是「高」（nestedMin.y 大），用户 H_CENTER 需转成 canonical
    // V_CENTER 才在转置回后居中水平（elkjs 实证：DOWN + H_CENTER → 内容 x=74 居中；ggn 此前不转置
    // → contentAlignment 块 newH>oldH 触发但无 V_CENTER → 不平移，内容偏左）。
    const align = node.getProperty<string[]>('org.eclipse.elk.contentAlignment') ?? []
    if (align.length > 0) {
      const swapped = align.map((a) =>
        a === 'H_CENTER' ? 'V_CENTER' : a === 'V_CENTER' ? 'H_CENTER' :
        a === 'H_LEFT' ? 'V_TOP' : a === 'H_RIGHT' ? 'V_BOTTOM' :
        a === 'V_TOP' ? 'H_LEFT' : a === 'V_BOTTOM' ? 'H_RIGHT' : a)
      node.setProperty('org.eclipse.elk.contentAlignment', swapped)
    }
    switch (node.getProperty(ALIGNMENT)) {
      case 'LEFT':
        node.setProperty(ALIGNMENT, 'TOP')
        break
      case 'RIGHT':
        node.setProperty(ALIGNMENT, 'BOTTOM')
        break
      case 'TOP':
        node.setProperty(ALIGNMENT, 'LEFT')
        break
      case 'BOTTOM':
        node.setProperty(ALIGNMENT, 'RIGHT')
        break
    }
    if (node.hasProperty(POSITION)) {
      const pos = node.getProperty<{ x: number; y: number } | null>(POSITION)
      if (pos) {
        const t = pos.x
        pos.x = pos.y
        pos.y = t
      }
    }
  }

  /** ELK transposeEdgeLabelPlacement: 边标签侧选择 UP↔DOWN 互换. */
  private transposeEdgeLabelPlacement(graph: LGraph): void {
    const mode = graph.getProperty(EDGE_LABELS_SIDE_SELECTION)
    switch (mode) {
      case EdgeLabelSideSelection.ALWAYS_UP:
        graph.setProperty(EDGE_LABELS_SIDE_SELECTION, EdgeLabelSideSelection.ALWAYS_DOWN)
        break
      case EdgeLabelSideSelection.ALWAYS_DOWN:
        graph.setProperty(EDGE_LABELS_SIDE_SELECTION, EdgeLabelSideSelection.ALWAYS_UP)
        break
      case EdgeLabelSideSelection.DIRECTION_UP:
        graph.setProperty(EDGE_LABELS_SIDE_SELECTION, EdgeLabelSideSelection.DIRECTION_DOWN)
        break
      case EdgeLabelSideSelection.DIRECTION_DOWN:
        graph.setProperty(EDGE_LABELS_SIDE_SELECTION, EdgeLabelSideSelection.DIRECTION_UP)
        break
      case EdgeLabelSideSelection.SMART_UP:
        graph.setProperty(EDGE_LABELS_SIDE_SELECTION, EdgeLabelSideSelection.SMART_DOWN)
        break
      case EdgeLabelSideSelection.SMART_DOWN:
        graph.setProperty(EDGE_LABELS_SIDE_SELECTION, EdgeLabelSideSelection.SMART_UP)
        break
    }
  }
}

