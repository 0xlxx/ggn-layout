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
 * CuttingUtils (对应 ELK wrapping.CuttingUtils) — 多个切割启发式共用的工具方法.
 *
 * 为一条边插入两个 in-layer dummy 与可变数量的 long edge dummy:
 * 原边 e=(u,v), in-layer dummy il_1/il_2 分别插入 L(u)/L(v), long edge dummy
 * d_1..d_m 插入 L(u)+1..L(v)-1, 结果链为:
 * <pre>
 *                               v
 *                               î
 * il_1 -> d_1 -> ... -> d_m -> il_2
 *  î
 *  u
 * </pre>
 * 向后 wrap 的边额外获得 edgeNode 间距 (WRAPPING_ADDITIONAL_EDGE_SPACING) 以在视觉上分离.
 *
 * 来源: org.eclipse.elk.alg.layered.intermediate.wrapping.CuttingUtils
 */
import type { LGraph } from '../../graph/lgraph.js'
import { LNode } from '../../graph/lnode.js'
import { LPort } from '../../graph/lport.js'
import { LEdge } from '../../graph/ledge.js'
import { MapPropertyHolder } from '../../graph/properties.js'
import { NodeType, PortConstraints, PortSide } from '../../graph/enums.js'
import { ORIGIN, LONG_EDGE_SOURCE, LONG_EDGE_TARGET } from '../../options/internal-properties.js'
import {
  EDGE_THICKNESS, JUNCTION_POINTS, PORT_CONSTRAINTS, SPACING_EDGE_NODE, SPACING_INDIVIDUAL,
  WRAPPING_ADDITIONAL_EDGE_SPACING,
} from '../../options/layered-options.js'

/**
 * 为 {@code originalEdge} 插入 dummy 链, 返回新创建的段边列表.
 *
 * @param offsetFirstInLayerDummy
 *            第一个 in-layer dummy 插入到层尾前多少位 (其余 dummy 一律插到层尾).
 */
export function insertDummies(layeredGraph: LGraph, originalEdge: LEdge, offsetFirstInLayerDummy: number): LEdge[] {
  // 为了在视觉上分离向后 wrap 的边, 增加额外间距
  const edgeNodeSpacing = layeredGraph.getProperty(SPACING_EDGE_NODE)
  const additionalSpacing = layeredGraph.getProperty(WRAPPING_ADDITIONAL_EDGE_SPACING)
  const is = new MapPropertyHolder()
  is.setProperty(SPACING_EDGE_NODE, edgeNodeSpacing + additionalSpacing)

  let edge = originalEdge
  const targetPort = edge.getTarget()!
  const src = edge.getSource()!.getNode()!
  const tgt = edge.getTarget()!.getNode()!

  const srcIndex = src.getLayer()!.getIndex()
  const tgtIndex = tgt.getLayer()!.getIndex()

  const createdEdges: LEdge[] = []

  for (let i = srcIndex; i <= tgtIndex; i++) {
    // 创建 dummy 节点
    const dummyNode = new LNode(layeredGraph)
    dummyNode.setType(NodeType.LONG_EDGE)
    dummyNode.setProperty(ORIGIN, edge)
    dummyNode.setProperty(PORT_CONSTRAINTS, PortConstraints.FIXED_POS)
    dummyNode.setProperty(SPACING_INDIVIDUAL, is)

    const nextLayer = layeredGraph.getLayers()[i]!
    if (i === srcIndex) {
      dummyNode.setLayerAt(nextLayer.getNodes().length - offsetFirstInLayerDummy, nextLayer)
    } else {
      dummyNode.setLayer(nextLayer)
    }

    // 设置边厚度
    let thickness = edge.getProperty(EDGE_THICKNESS)
    if (thickness < 0) {
      thickness = 0
      edge.setProperty(EDGE_THICKNESS, thickness)
    }
    dummyNode.size.y = thickness
    const portPos = Math.floor(thickness / 2)

    // 创建 dummy 输入/输出端口
    const dummyInput = new LPort()
    dummyInput.setSide(PortSide.WEST)
    dummyInput.setNode(dummyNode)
    dummyInput.getPosition().y = portPos

    const dummyOutput = new LPort()
    dummyOutput.setSide(PortSide.EAST)
    dummyOutput.setNode(dummyNode)
    dummyOutput.getPosition().y = portPos

    edge.setTarget(dummyInput)

    // 创建 dummy 边
    const dummyEdge = new LEdge()
    dummyEdge.copyProperties(edge)
    dummyEdge.setProperty(JUNCTION_POINTS, null)
    dummyEdge.setSource(dummyOutput)
    dummyEdge.setTarget(targetPort)

    setDummyProperties(dummyNode, edge, dummyEdge)
    createdEdges.push(dummyEdge)
    edge = dummyEdge
  }

  return createdEdges
}

/**
 * 在给定 dummy 节点上设置源/目标属性 (复制自 LongEdgeSplitter).
 *
 * @param dummy 该 dummy 节点.
 * @param inEdge 进入该 dummy 节点的边.
 * @param outEdge 从该 dummy 节点出去的边.
 */
function setDummyProperties(dummy: LNode, inEdge: LEdge, outEdge: LEdge): void {
  const inEdgeSourceNode = inEdge.getSource()!.getNode()!

  if (inEdgeSourceNode.getType() === NodeType.LONG_EDGE) {
    // 入边来自 long edge dummy 节点, 直接复制其属性
    dummy.setProperty(LONG_EDGE_SOURCE, inEdgeSourceNode.getProperty(LONG_EDGE_SOURCE))
    dummy.setProperty(LONG_EDGE_TARGET, inEdgeSourceNode.getProperty(LONG_EDGE_TARGET))
  } else {
    // 源是入边的源端口, 目标是出边的目标端口
    dummy.setProperty(LONG_EDGE_SOURCE, inEdge.getSource())
    dummy.setProperty(LONG_EDGE_TARGET, outEdge.getTarget())
  }
}
