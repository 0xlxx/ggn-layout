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
 * HierarchicalPortConstraintProcessor (对应 ELK intermediate.HierarchicalPortConstraintProcessor).
 *
 * EXTERNAL_PORTS 图, P3 前:
 *   - E/W 外部端口 dummy: 按 PORT_RATIO_OR_POSITION 排序, 加 in-layer successor 约束 (FIXED_ORDER+).
 *   - N/S 外部端口 dummy: 每层为相邻的普通节点创建替身 dummy (FIXED_POS), 重连边, 移除原 dummy.
 */
import type { LGraph } from '../graph/lgraph.js'
import { LNode } from '../graph/lnode.js'
import { Layer } from '../graph/layer.js'
import { LPort } from '../graph/lport.js'
import { NodeType, PortSide, PortConstraints } from '../graph/enums.js'
import {
  EXT_PORT_SIDE, PORT_RATIO_OR_POSITION, EXT_PORT_REPLACED_DUMMY, EXT_PORT_REPLACED_DUMMIES,
  IN_LAYER_SUCCESSOR_CONSTRAINTS,
} from '../options/internal-properties.js'
import { PORT_CONSTRAINTS, ALIGNMENT } from '../options/layered-options.js'

const DUMMY_INPUT_PORT = 0
const DUMMY_OUTPUT_PORT = 1

export class HierarchicalPortConstraintProcessor {
  process(layeredGraph: LGraph): void {
    this.processEasternAndWesternPortDummies(layeredGraph)
    this.processNorthernAndSouthernPortDummies(layeredGraph)
  }

  private processEasternAndWesternPortDummies(layeredGraph: LGraph): void {
    if (!PortConstraints.isOrderFixed(layeredGraph.getProperty(PORT_CONSTRAINTS))) return
    const layers = layeredGraph.getLayers()
    if (layers.length === 0) return
    this.processEW(layers[0]!)
    this.processEW(layers[layers.length - 1]!)
  }

  private processEW(layer: Layer): void {
    const nodes = [...layer.getNodes()]
    nodes.sort((node1, node2) => {
      const t1 = node1.getType(), t2 = node2.getType()
      const p1 = node1.getProperty(PORT_RATIO_OR_POSITION), p2 = node2.getProperty(PORT_RATIO_OR_POSITION)
      if (t2 !== NodeType.EXTERNAL_PORT) return -1
      if (t1 !== NodeType.EXTERNAL_PORT) return 1
      if (p1 === p2) return 0
      return p1 < p2 ? -1 : 1
    })

    let lastHierarchicalDummy: LNode | null = null
    for (const node of nodes) {
      if (node.getType() !== NodeType.EXTERNAL_PORT) break
      const side = node.getProperty(EXT_PORT_SIDE)
      if (side !== PortSide.WEST && side !== PortSide.EAST) continue
      if (lastHierarchicalDummy !== null) {
        let successors = lastHierarchicalDummy.getProperty<LNode[]>(IN_LAYER_SUCCESSOR_CONSTRAINTS)
        if (successors === undefined || successors === null) {
          successors = []
          lastHierarchicalDummy.setProperty(IN_LAYER_SUCCESSOR_CONSTRAINTS, successors)
        }
        successors.push(node)
      }
      lastHierarchicalDummy = node
    }
  }

  private processNorthernAndSouthernPortDummies(layeredGraph: LGraph): void {
    if (!PortConstraints.isSideFixed(layeredGraph.getProperty(PORT_CONSTRAINTS))) return
    const layers = layeredGraph.getLayers()
    const layerCount = layers.length

    const extPortToDummyNodeMap: Map<unknown, LNode>[] = [new Map(), new Map()]
    const newDummyNodes: LNode[][] = [[], []]
    const originalExternalPortDummies: LNode[] = []

    for (let currLayerIdx = 0; currLayerIdx < layerCount; currLayerIdx++) {
      const currentLayer = layers[currLayerIdx]!
      const prevExtPortToDummyNodesMap = extPortToDummyNodeMap[currLayerIdx]!
      const nextExtPortToDummyNodesMap = new Map<unknown, LNode>()
      extPortToDummyNodeMap.push(nextExtPortToDummyNodesMap)
      const prevNewDummyNodes = newDummyNodes[currLayerIdx]!
      const nextNewDummyNodes: LNode[] = []
      newDummyNodes.push(nextNewDummyNodes)

      for (const currentNode of currentLayer.getNodes()) {
        if (this.isNorthernOrSouthernDummy(currentNode)) {
          originalExternalPortDummies.push(currentNode)
          continue
        }
        for (const edge of currentNode.getIncomingEdges()) {
          const sourceNode = edge.getSource()?.getNode()
          if (sourceNode === null || sourceNode === undefined || !this.isNorthernOrSouthernDummy(sourceNode)) continue
          const origin = sourceNode.getProperty(EXT_PORT_REPLACED_DUMMY) ?? sourceNode
          let prevLayerDummy = prevExtPortToDummyNodesMap.get(origin) ?? null
          if (prevLayerDummy === null) {
            prevLayerDummy = this.createDummy(layeredGraph, sourceNode)
            prevExtPortToDummyNodesMap.set(origin, prevLayerDummy)
            prevNewDummyNodes.push(prevLayerDummy)
          }
          edge.setSource(prevLayerDummy.getPorts()[DUMMY_OUTPUT_PORT]!)
        }
        for (const edge of currentNode.getOutgoingEdges()) {
          const targetNode = edge.getTarget()?.getNode()
          if (targetNode === null || targetNode === undefined || !this.isNorthernOrSouthernDummy(targetNode)) continue
          const origin = targetNode.getProperty(EXT_PORT_REPLACED_DUMMY) ?? targetNode
          let nextLayerDummy = nextExtPortToDummyNodesMap.get(origin) ?? null
          if (nextLayerDummy === null) {
            nextLayerDummy = this.createDummy(layeredGraph, targetNode)
            nextExtPortToDummyNodesMap.set(origin, nextLayerDummy)
            nextNewDummyNodes.push(nextLayerDummy)
          }
          edge.setTarget(nextLayerDummy.getPorts()[DUMMY_INPUT_PORT]!)
        }
      }
    }

    for (let i = 0; i < newDummyNodes.length; i++) {
      const nodeList = newDummyNodes[i]!
      if (nodeList.length === 0) continue
      let layer: Layer
      if (i === 0) {
        layer = new Layer(layeredGraph)
        layers.unshift(layer)
      } else if (i === extPortToDummyNodeMap.length - 1) {
        layer = new Layer(layeredGraph)
        layers.push(layer)
      } else {
        layer = layers[i - 1]!
      }
      for (const dummy of nodeList) dummy.setLayer(layer)
    }

    for (const originalDummy of originalExternalPortDummies) originalDummy.setLayer(null)
    layeredGraph.setProperty(EXT_PORT_REPLACED_DUMMIES, originalExternalPortDummies)
  }

  private isNorthernOrSouthernDummy(node: LNode): boolean {
    if (node.getType() !== NodeType.EXTERNAL_PORT) return false
    const side = node.getProperty(EXT_PORT_SIDE)
    return side === PortSide.NORTH || side === PortSide.SOUTH
  }

  private createDummy(layeredGraph: LGraph, originalDummy: LNode): LNode {
    const newDummy = new LNode(layeredGraph)
    newDummy.copyProperties(originalDummy)
    // ELK copyProperties 复制 IN_LAYER_CONSTRAINT (属性表); ggn 是字段 → 显式继承.
    newDummy.setInLayerConstraint(originalDummy.getInLayerConstraint()!)
    newDummy.setProperty(EXT_PORT_REPLACED_DUMMY, originalDummy)
    newDummy.setProperty(PORT_CONSTRAINTS, PortConstraints.FIXED_POS)
    newDummy.setProperty(ALIGNMENT, 'CENTER')
    newDummy.setType(NodeType.EXTERNAL_PORT)

    const inputPort = new LPort()
    inputPort.setNode(newDummy)
    inputPort.setSide(PortSide.WEST)
    const outputPort = new LPort()
    outputPort.setNode(newDummy)
    outputPort.setSide(PortSide.EAST)
    return newDummy
  }
}
