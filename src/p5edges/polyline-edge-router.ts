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
 * PolylineEdgeRouter (对应 ELK p5edges.PolylineEdgeRouter 的层定位部分).
 *
 * edgeRouting=POLYLINE: 按边垂直跨度重算层距 (layerSpacing = LAYER_SPACE_FAC * edgeSpaceFac * maxVertDiff + nodeSpacing),
 * 并调用 placeNodesHorizontally 重放各层节点 x 坐标 → 节点位置与 ORTHOGONAL 不同.
 *
 * 完整实现: 层定位 + 节点重放 + 弯点插入 (processNode/addBendPoint/processInLayerEdge)
 * + junction points (对齐 ELK PolylineEdgeRouter.java:202-506).
 */
import type { LGraph } from '../graph/lgraph.js'
import type { LNode } from '../graph/lnode.js'
import type { Layer } from '../graph/layer.js'
import type { LPort } from '../graph/lport.js'
import type { LEdge } from '../graph/ledge.js'
import { NodeType, PortSide } from '../graph/enums.js'
import { EDGE_ROUTING_POLYLINE_SLOPED_EDGE_ZONE_WIDTH, SPACING_NODE_NODE_BETWEEN_LAYERS, SPACING_EDGE_EDGE_BETWEEN_LAYERS, JUNCTION_POINTS, ALIGNMENT } from '../options/layered-options.js'
import { ORIGIN } from '../options/internal-properties.js'
import type { KVector } from '../graph/enums.js'

/** 层距系数 (ELK LAYER_SPACE_FAC). */
const LAYER_SPACE_FAC = 0.4
/** 弯点与对端锚点 y 差小于该值时跳过 (ELK MIN_VERT_DIFF). */
const MIN_VERT_DIFF = 1.0

/** 两点相等 (对应 KVector.equals; ELK addBendPoint 用 !equals 判断). */
function samePoint(a: KVector, b: KVector): boolean {
  return a.x === b.x && a.y === b.y
}

export class PolylineEdgeRouter {
  /** 已创建的 junction points 去重 (ELK createdJunctionPoints). */
  private createdJunctionPoints = new Set<string>()

  process(layeredGraph: LGraph): void {
    const slopedEdgeZoneWidth = layeredGraph.getProperty(EDGE_ROUTING_POLYLINE_SLOPED_EDGE_ZONE_WIDTH)
    const nodeSpacing = layeredGraph.getProperty(SPACING_NODE_NODE_BETWEEN_LAYERS)
    const edgeSpacing = layeredGraph.getProperty(SPACING_EDGE_EDGE_BETWEEN_LAYERS)
    const edgeSpaceFac = Math.min(1.0, edgeSpacing / nodeSpacing)

    let xpos = 0.0
    let layerSpacing = 0.0

    // 首层 west 侧 in-layer 边所需水平间距.
    const layers = layeredGraph.getLayers()
    if (layers.length > 0) {
      const yDiff = this.calculateWestInLayerEdgeYDiff(layers[0]!)
      xpos = LAYER_SPACE_FAC * edgeSpaceFac * yDiff
    }

    for (let li = 0; li < layers.length; li++) {
      const layer = layers[li]!
      const externalLayer = layer.getNodes().length > 0
        && layer.getNodes().every(n => n.getType() === NodeType.EXTERNAL_PORT)
      const hasNext = li + 1 < layers.length

      // 最右侧外部端口层不加 nodeSpacing.
      if (externalLayer && xpos > 0) {
        xpos -= nodeSpacing
      }

      // 重放本层节点 x 坐标.
      placeNodesHorizontally(layer, xpos)

      // 计算本层出边到下一层的最大垂直跨度 (层距用).
      let maxVertDiff = 0.0
      for (const node of layer.getNodes()) {
        let maxCurrOutputYDiff = 0.0
        for (const outgoingEdge of node.getOutgoingEdges()) {
          const source = outgoingEdge.getSource()
          const target = outgoingEdge.getTarget()
          if (!source || !target) continue
          let sourcePos = source.getAbsoluteAnchor().y
          let targetPos = target.getAbsoluteAnchor().y

          const targetLayer = target.getNode()?.getLayer()
          if (targetLayer === layer && !outgoingEdge.isSelfLoop()) {
            // in-layer 边: 插入额外弯点 (ELK PolylineEdgeRouter.processInLayerEdge)
            this.processInLayerEdge(outgoingEdge, xpos, LAYER_SPACE_FAC * edgeSpaceFac * Math.abs(sourcePos - targetPos))
            // west 源不贡献本层间距 (已在计算首层间距时计入).
            if (source.getSide() === PortSide.WEST) {
              sourcePos = 0
              targetPos = 0
            }
          }

          maxCurrOutputYDiff = Math.max(maxCurrOutputYDiff, Math.abs(targetPos - sourcePos))
        }

        // 为节点入射边插入弯点 (ELK PolylineEdgeRouter.processNode, 仅特定节点类型).
        switch (node.getType()) {
          case NodeType.NORMAL:
          case NodeType.LABEL:
          case NodeType.LONG_EDGE:
          case NodeType.NORTH_SOUTH_PORT:
          case NodeType.BREAKING_POINT:
            this.processNode(node, xpos, slopedEdgeZoneWidth)
            break
        }

        maxVertDiff = Math.max(maxVertDiff, maxCurrOutputYDiff)
      }

      // 下一层 west 侧 in-layer 边也计入本层间距.
      if (hasNext) {
        const yDiff = this.calculateWestInLayerEdgeYDiff(layers[li + 1]!)
        maxVertDiff = Math.max(maxVertDiff, yDiff)
      }

      layerSpacing = LAYER_SPACE_FAC * edgeSpaceFac * maxVertDiff
      if (!externalLayer && hasNext) {
        layerSpacing += nodeSpacing
      }
      xpos += layer.getSize().x + layerSpacing
    }

    this.createdJunctionPoints.clear()

    // 图宽 (对应 ELK routeEdges 末尾 layeredGraph.getSize().x = xpos).
    layeredGraph.getSize().x = xpos
  }

  /** 为节点入射边插入弯点 (ELK PolylineEdgeRouter.processNode :322). */
  private processNode(node: LNode, layerLeftXPos: number, maxAcceptableXDiff: number): void {
    const layerRightXPos = layerLeftXPos + node.getLayer()!.getSize().x

    for (const port of node.getPorts()) {
      const absolutePortAnchor = { ...port.getAbsoluteAnchor() }

      if (node.getType() === NodeType.NORTH_SOUTH_PORT) {
        // N-S dummy 的端口真实 x 与 dummy 位置不同 → 用 ORIGIN 端口锚点 (ELK #515)
        const correspondingPort = port.getProperty(ORIGIN) as unknown as LPort | null
        if (correspondingPort) {
          absolutePortAnchor.x = correspondingPort.getAbsoluteAnchor().x
          node.getPosition().x = absolutePortAnchor.x
        }
      }

      const bendPoint: KVector = { x: 0, y: absolutePortAnchor.y }
      if (port.getSide() === PortSide.EAST) {
        bendPoint.x = layerRightXPos
      } else if (port.getSide() === PortSide.WEST) {
        bendPoint.x = layerLeftXPos
      } else {
        // 只处理 E/W 端口
        continue
      }

      // 端口锚点与弯点重合时不插入 (in-layer dummy 除外)
      const xDistance = Math.abs(absolutePortAnchor.x - bendPoint.x)
      if (xDistance <= maxAcceptableXDiff && !this.isInLayerDummy(node)) {
        continue
      }

      const addJunctionPoint = port.getOutgoingEdges().length + port.getIncomingEdges().length > 1

      for (const e of port.getConnectedEdges()) {
        const otherPort = e.getSource() === port ? e.getTarget()! : e.getSource()!
        if (Math.abs(otherPort.getAbsoluteAnchor().y - bendPoint.y) > MIN_VERT_DIFF) {
          this.addBendPoint(e, bendPoint, addJunctionPoint, port)
        }
      }
    }
  }

  /** 层内边额外弯点, 插在弯点列表头部 (ELK PolylineEdgeRouter.processInLayerEdge :392). */
  private processInLayerEdge(edge: LEdge, layerXPos: number, edgeSpacing: number): void {
    const sourcePort = edge.getSource()!
    const targetPort = edge.getTarget()!
    const sourceAnchorY = sourcePort.getAbsoluteAnchor().y
    const midY = (sourceAnchorY + targetPort.getAbsoluteAnchor().y) / 2.0

    const bendPoint: KVector = sourcePort.getSide() === PortSide.EAST
      ? { x: layerXPos + sourcePort.getNode()!.getLayer()!.getSize().x + edgeSpacing, y: midY }
      : { x: layerXPos - edgeSpacing, y: midY }

    edge.getBendPoints().unshift(bendPoint)
  }

  /** 添加弯点 + 可选 junction point (ELK PolylineEdgeRouter.addBendPoint :464). */
  private addBendPoint(edge: LEdge, bendPoint: KVector, addJunctionPoint: boolean, currPort: LPort): void {
    if ((edge.isInLayerEdge() || !samePoint(currPort.getAbsoluteAnchor(), bendPoint)) && !edge.isSelfLoop()) {
      if (edge.getSource() === currPort) {
        edge.getBendPoints().unshift({ ...bendPoint })
      } else {
        edge.getBendPoints().push({ ...bendPoint })
      }

      const key = `${bendPoint.x},${bendPoint.y}`
      if (addJunctionPoint && !this.createdJunctionPoints.has(key)) {
        let junctionPoints = edge.getProperty(JUNCTION_POINTS)
        if (junctionPoints === null || junctionPoints === undefined) {
          junctionPoints = []
          edge.setProperty(JUNCTION_POINTS, junctionPoints)
        }
        const jpoint = { ...bendPoint }
        ;(junctionPoints as KVector[]).push(jpoint)
        this.createdJunctionPoints.add(key)
      }
    }
  }

  /** LONG_EDGE dummy 且含层内边 (ELK PolylineEdgeRouter.isInLayerDummy). */
  private isInLayerDummy(node: LNode): boolean {
    if (node.getType() === NodeType.LONG_EDGE) {
      for (const e of node.getConnectedEdges()) {
        if (e.isInLayerEdge()) return true
      }
    }
    return false
  }

  /** west 侧 in-layer 边最大垂直跨度 (对应 ELK calculateWestInLayerEdgeYDiff). */
  private calculateWestInLayerEdgeYDiff(layer: Layer): number {
    let maxYDiff = 0.0
    for (const node of layer.getNodes()) {
      for (const outgoingEdge of node.getOutgoingEdges()) {
        const source = outgoingEdge.getSource()
        const target = outgoingEdge.getTarget()
        if (!source || !target) continue
        const targetLayer = target.getNode()?.getLayer()
        if (targetLayer === layer && source.getSide() === PortSide.WEST) {
          const sourcePos = source.getAbsoluteAnchor().y
          const targetPos = target.getAbsoluteAnchor().y
          maxYDiff = Math.max(maxYDiff, Math.abs(targetPos - sourcePos))
        }
      }
    }
    return maxYDiff
  }
}

/** 重放层内节点 x (对应 ELK LGraphUtil.placeNodesHorizontally). */
export function placeNodesHorizontally(layer: Layer, xoffset: number): void {
  let maxLeftMargin = 0
  let maxRightMargin = 0
  for (const node of layer.getNodes()) {
    maxLeftMargin = Math.max(maxLeftMargin, node.getMargin().left)
    maxRightMargin = Math.max(maxRightMargin, node.getMargin().right)
  }

  for (const node of layer.getNodes()) {
    // per-node alignment (ELK CoreOptions.ALIGNMENT; 与 layer-size-calculator 版保持一致).
    const alignment = node.getProperty(ALIGNMENT)
    let ratio: number
    if (alignment === 'LEFT') ratio = 0.0
    else if (alignment === 'RIGHT') ratio = 1.0
    else if (alignment === 'CENTER') ratio = 0.5
    else {
      let inports = 0
      let outports = 0
      for (const port of node.getPorts()) {
        if (port.getIncomingEdges().length > 0) inports++
        if (port.getOutgoingEdges().length > 0) outports++
      }
      ratio = inports + outports === 0 ? 0.5 : outports / (inports + outports)
    }

    const size = layer.getSize()
    const nodeSize = node.getSize().x
    let xpos = (size.x - nodeSize) * ratio
    if (ratio > 0.5) {
      xpos -= maxRightMargin * 2 * (ratio - 0.5)
    } else if (ratio < 0.5) {
      xpos += maxLeftMargin * 2 * (0.5 - ratio)
    }

    const leftMargin = node.getMargin().left
    if (xpos < leftMargin) xpos = leftMargin
    const rightMargin = node.getMargin().right
    if (xpos > size.x - rightMargin - nodeSize) {
      xpos = size.x - rightMargin - nodeSize
    }

    node.getPosition().x = xoffset + xpos
  }
}
