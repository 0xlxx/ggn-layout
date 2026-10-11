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
 * InteractiveCrossingMinimizer (对应 ELK p3order.InteractiveCrossingMinimizer).
 *
 * crossingMinimization.strategy = INTERACTIVE: 尊重输入图节点先前位置排序各层节点
 * (无输入位置时 = 保持 model order), 并用 NodeRelativePortDistributor 分配端口.
 */
import type { LGraph } from '../graph/lgraph.js'
import type { LNode } from '../graph/lnode.js'
import type { LPort } from '../graph/lport.js'
import type { LEdge } from '../graph/ledge.js'
import { NodeType, PortSide } from '../graph/enums.js'
import { ORIGIN, REVERSED, ORIGINAL_BENDPOINTS, ORIGINAL_DUMMY_NODE_POSITION,
  LONG_EDGE_SOURCE, LONG_EDGE_TARGET, IN_LAYER_SUCCESSOR_CONSTRAINTS } from '../options/internal-properties.js'
import { INTERACTIVE_REFERENCE_POINT } from '../options/layered-options.js'
import { NodeRelativePortDistributor } from './port-distributors.js'
import { initInitializables } from './all-crossings-counter.js'

export class InteractiveCrossingMinimizer {
  process(layeredGraph: LGraph): void {
    // 每层设 id (port distribution 数组索引用).
    let layerIndex = 0
    for (const layer of layeredGraph.getLayers()) {
      layer.id = layerIndex++
    }

    const nodeOrder = layeredGraph.toNodeArray()
    const portDistributor = new NodeRelativePortDistributor(nodeOrder.length)
    initInitializables([portDistributor], nodeOrder)
    let portCount = 0
    layerIndex = 0
    for (const layer of layeredGraph.getLayers()) {
      // 计算水平参考位置 (边弯点比较用).
      let horizPos = 0
      let nodeCount = 0
      for (const node of layer.getNodes()) {
        if (node.getPosition().x > 0) {
          horizPos += node.getPosition().x + node.getSize().x / 2
          nodeCount++
        }
        for (const port of node.getPorts()) {
          port.id = portCount++
        }
      }
      if (nodeCount > 0) horizPos /= nodeCount

      // 计算每节点垂直位置.
      const pos = new Array<number>(layer.getNodes().length)
      let nextIndex = 0
      for (const node of layer.getNodes()) {
        node.id = nextIndex++
        pos[node.id] = getPos(node, horizPos)
        if (node.getType() === NodeType.LONG_EDGE) {
          node.setProperty(ORIGINAL_DUMMY_NODE_POSITION, pos[node.id])
        }
      }

      // 按位置排序 (稳定; 相同 y 时尊重 in-layer successor 约束).
      layer.getNodes().sort((node1, node2) => {
        const compare = pos[node1.id] - pos[node2.id]
        if (compare === 0) {
          const node1Successors = node1.getProperty(IN_LAYER_SUCCESSOR_CONSTRAINTS) ?? []
          const node2Successors = node2.getProperty(IN_LAYER_SUCCESSOR_CONSTRAINTS) ?? []
          if (node1Successors.includes(node2)) return -1
          if (node2Successors.includes(node1)) return 1
        }
        return compare
      })
      portDistributor.distributePortsWhileSweeping(nodeOrder, layerIndex, true)
      layerIndex++
    }
  }
}

/** 计算节点垂直位置 (对应 ELK getPos). */
function getPos(node: LNode, horizPos: number): number {
  switch (node.getType()) {
    case NodeType.LONG_EDGE: {
      const edge = node.getProperty(ORIGIN) as unknown as LEdge
      let bendpoints = (edge?.getProperty(ORIGINAL_BENDPOINTS) ?? []).slice()
      if (edge?.getProperty(REVERSED)) bendpoints.reverse()

      // 源点可定位时直接用源点 y.
      const source = node.getProperty(LONG_EDGE_SOURCE)
      if (source) {
        const sourcePoint = source.getAbsoluteAnchor()
        if (horizPos <= sourcePoint.x) return sourcePoint.y
        bendpoints.unshift(sourcePoint)
      }
      // 目标点可定位时直接用目标点 y.
      const target = node.getProperty(LONG_EDGE_TARGET)
      if (target) {
        const targetPoint = target.getAbsoluteAnchor()
        if (targetPoint.x <= horizPos) return targetPoint.y
        bendpoints.push(targetPoint)
      }
      // 沿边插值.
      if (bendpoints.length >= 2) {
        let point1 = bendpoints[0]!
        let point2 = bendpoints[1]!
        let i = 2
        while (point2.x < horizPos && i < bendpoints.length) {
          point1 = point2
          point2 = bendpoints[i++]!
        }
        return point1.y + (horizPos - point1.x) / (point2.x - point1.x) * (point2.y - point1.y)
      }
      break
    }
    case NodeType.NORTH_SOUTH_PORT: {
      // dummy 对应的原始端口及节点.
      const originPort = node.getPorts()[0]?.getProperty(ORIGIN) as unknown as LPort
      const originNode = originPort?.getNode()
      if (originNode && originPort) {
        if (originPort.getSide() === PortSide.NORTH) return originNode.getPosition().y
        if (originPort.getSide() === PortSide.SOUTH) return originNode.getPosition().y + originNode.getSize().y
      }
      break
    }
    default:
      break
  }
  // 回退: 节点交互参考点 (CENTER = 中心, TOP_LEFT = 左上).
  const ref = node.getGraph()?.getProperty(INTERACTIVE_REFERENCE_POINT)
  if (ref === 'TOP_LEFT') return node.getPosition().y
  return node.getPosition().y + node.getSize().y / 2
}
