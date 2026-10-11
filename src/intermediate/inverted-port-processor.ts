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
 * InvertedPortProcessor (对应 ELK intermediate.InvertedPortProcessor).
 * P3 前置: 处理反向端口 (WEST 输出口 / EAST 输入口的边) — P1 断环后端口方向与边不匹配的图.
 *
 * 现代 TS 实现: 模块级纯函数 + 解构 + 数组方法, 替代 Java 的类/列表迭代.
 */
import type { LGraph } from '../graph/lgraph.js'
import { LNode } from '../graph/lnode.js'
import { LPort } from '../graph/lport.js'
import { LEdge } from '../graph/ledge.js'
import { NodeType, PortSide, PortType, PortConstraints } from '../graph/enums.js'
import { ORIGIN, LONG_EDGE_SOURCE, LONG_EDGE_TARGET } from '../options/internal-properties.js'
import { PORT_CONSTRAINTS, JUNCTION_POINTS } from '../options/layered-options.js'

/** 创建反向端口 dummy (ELK createEast/WestPortSideDummies 的公共部分). */
function createOddPortDummies(graph: LGraph, oddPort: LPort, edge: LEdge,
  unassigned: LNode[], isEast: boolean): void {
  // 自环忽略
  const otherNode = isEast ? edge.getSource()!.getNode()! : edge.getTarget()!.getNode()!
  if (otherNode === oddPort.getNode()) return

  const dummy = new LNode(graph)
  if (process.env.IPP_DEBUG) console.error(`[IPP] create dummy for ${oddPort.getNode()?.getId()} port ${oddPort.getSide()} edge ${edge.getId()} isEast=${isEast}`)
  dummy.setType(NodeType.LONG_EDGE)
  dummy.setProperty(ORIGIN, edge)
  dummy.setProperty(PORT_CONSTRAINTS, PortConstraints.FIXED_POS)
  unassigned.push(dummy)

  const dummyInput = new LPort()
  dummyInput.setNode(dummy)
  dummyInput.setSide(PortSide.WEST)
  const dummyOutput = new LPort()
  dummyOutput.setNode(dummy)
  dummyOutput.setSide(PortSide.EAST)

  if (isEast) {
    // 输入口在 EAST: 原边 → dummyInput, dummyOutput → 原端口
    edge.setTarget(dummyInput)
    const dummyEdge = new LEdge()
    dummyEdge.copyProperties(edge)
    dummyEdge.setProperty(JUNCTION_POINTS, null)
    dummyEdge.setSource(dummyOutput)
    dummyEdge.setTarget(oddPort)
    setLongEdgeSourceAndTarget(dummy, dummyInput, dummyOutput, oddPort)
    moveHeadLabels(edge, dummyEdge)
  } else {
    // 输出口在 WEST: 原边 → dummyInput, dummyOutput → 原 target
    const originalTarget = edge.getTarget()!
    edge.setTarget(dummyInput)
    const dummyEdge = new LEdge()
    dummyEdge.copyProperties(edge)
    dummyEdge.setProperty(JUNCTION_POINTS, null)
    dummyEdge.setSource(dummyOutput)
    dummyEdge.setTarget(originalTarget)
    setLongEdgeSourceAndTarget(dummy, dummyInput, dummyOutput, oddPort)
    moveHeadLabels(edge, dummyEdge)
  }
}

/** 移动 HEAD label 到新 dummy 边 (ELK 的 label 移动逻辑). */
function moveHeadLabels(oldEdge: LEdge, newEdge: LEdge): void {
  const labels = oldEdge.getLabels()
  for (let i = labels.length - 1; i >= 0; i--) {
    const label = labels[i]!
    if (label.placement === 'HEAD') {
      // ELK 记录 END_LABEL_EDGE; ggn 的 LEdgeLabel 无 property 系统, 仅移动.
      const [moved] = labels.splice(i, 1)
      newEdge.getLabels().push(moved!)
    }
  }
}

/** 设置 LONG_EDGE_SOURCE/TARGET (ELK setLongEdgeSourceAndTarget). */
function setLongEdgeSourceAndTarget(dummy: LNode, dummyInput: LPort, dummyOutput: LPort, _oddPort: LPort): void {
  const sourcePort = dummyInput.getIncomingEdges()[0]!.getSource()!
  const sourceNode = sourcePort.getNode()!
  dummy.setProperty(LONG_EDGE_SOURCE,
    sourceNode.getType() === NodeType.LONG_EDGE ? sourceNode.getProperty(LONG_EDGE_SOURCE) : sourcePort)

  const targetPort = dummyOutput.getOutgoingEdges()[0]!.getTarget()!
  const targetNode = targetPort.getNode()!
  dummy.setProperty(LONG_EDGE_TARGET,
    targetNode.getType() === NodeType.LONG_EDGE ? targetNode.getProperty(LONG_EDGE_TARGET) : targetPort)
}

export function processInvertedPorts(layeredGraph: LGraph): void {
    const layers = layeredGraph.getLayers()
    const unassigned: LNode[] = []
    let currentLayerIndex = 0

    for (const layer of layers) {
      // 上一层的未分配 dummy 归位
      if (currentLayerIndex > 0) {
        for (const node of unassigned) node.setLayer(layers[currentLayerIndex - 1]!)
        unassigned.length = 0
      }

      for (const node of layer.getNodes()) {
        if (node.getType() !== NodeType.NORMAL) continue
        if (!PortConstraints.isSideFixed(node.getProperty(PORT_CONSTRAINTS))) continue

        // EAST 输入口: 每条入边插入 dummy
        for (const port of node.getPorts(PortType.INPUT).filter(p => p.getSide() === PortSide.EAST)) {
          for (const edge of [...port.getIncomingEdges()]) {
            createOddPortDummies(layeredGraph, port, edge, unassigned, true)
          }
        }
        // WEST 输出口: 每条出边插入 dummy
        for (const port of node.getPorts(PortType.OUTPUT).filter(p => p.getSide() === PortSide.WEST)) {
          for (const edge of [...port.getOutgoingEdges()]) {
            createOddPortDummies(layeredGraph, port, edge, unassigned, false)
          }
        }
      }
      currentLayerIndex++
    }

    // 剩余的未分配 dummy 归到最后一层
    for (const node of unassigned) node.setLayer(layers[layers.length - 1]!)
}
