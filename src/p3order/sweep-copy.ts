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
 * SweepCopy (对应 ELK p3order.SweepCopy).
 */
import type { LNode } from '../graph/lnode.js'
import type { LPort } from '../graph/lport.js'
import type { LGraph } from '../graph/lgraph.js'
import { NodeType, PortSide, PortConstraints } from '../graph/enums.js'
import { ORIGIN, IN_LAYER_LAYOUT_UNIT } from '../options/internal-properties.js'
import { PORT_CONSTRAINTS, PORT_INDEX } from '../options/layered-options.js'

/** 端口综合比较器 (ELK PortListSorter.CMP_COMBINED = CMP_PORT_SIDE + CMP_FIXED_ORDER_AND_FIXED_POS). */
// 之前是错误简化 (所有侧都按 y 升序): WEST/SOUTH 应降序, NORTH 按 x, EAST 按 y;
// 且非 order-fixed 时只按侧排序 (位置不参与). SweepCopy 用它重排 N-S dummy 原节点端口,
// 简化版会把 PortListSorter 已排好的 WEST 端口 (y 降序) 再翻回升序 → OER 段序/断环方向错
// (north_multiple::DOWN 车道交换实证).
function cmpCombined(a: LPort, b: LPort): number {
  const sideOrder: Record<string, number> = { [PortSide.NORTH]: 0, [PortSide.EAST]: 1, [PortSide.SOUTH]: 2, [PortSide.WEST]: 3 }
  const sa = sideOrder[a.getSide()] ?? 0
  const sb = sideOrder[b.getSide()] ?? 0
  if (sa !== sb) return sa - sb
  const pc = a.getNode()!.getProperty(PORT_CONSTRAINTS)
  if (!PortConstraints.isOrderFixed(pc)) return 0
  if (pc === PortConstraints.FIXED_ORDER) {
    const i1 = a.getProperty(PORT_INDEX)
    const i2 = b.getProperty(PORT_INDEX)
    if (i1 !== null && i2 !== null && i1 - i2 !== 0) return i1 - i2
  }
  switch (a.getSide()) {
    case PortSide.NORTH: return a.getPosition().x - b.getPosition().x
    case PortSide.EAST: return a.getPosition().y - b.getPosition().y
    case PortSide.SOUTH: return b.getPosition().x - a.getPosition().x
    case PortSide.WEST: return b.getPosition().y - a.getPosition().y
    default: return 0
  }
}

export class SweepCopy {
  private nodeOrder: LNode[][] | null
  private portOrders: LPort[][][]

  constructor(nodeOrderIn: LNode[][] | SweepCopy) {
    if (nodeOrderIn instanceof SweepCopy) {
      const sc = nodeOrderIn
      this.nodeOrder = SweepCopy.deepCopy(sc.nodeOrder)
      this.portOrders = [...sc.portOrders]
    } else {
      this.nodeOrder = SweepCopy.deepCopy(nodeOrderIn)
      const portOrders = new Array<LPort[][]>(nodeOrderIn.length)
      this.portOrders = portOrders
      for (let layerIx = 0; layerIx < nodeOrderIn.length; layerIx++) {
        const lNodes = nodeOrderIn[layerIx]!
        const layer = new Array<LPort[]>(lNodes.length)
        portOrders[layerIx] = layer
        for (let nodeIx = 0; nodeIx < lNodes.length; nodeIx++) {
          layer[nodeIx] = lNodes[nodeIx]!.getPorts().slice()
        }
      }
    }
  }

  private static deepCopy(currentlyBestNodeOrder: LNode[][] | null): LNode[][] | null {
    if (currentlyBestNodeOrder === null) return null
    const result = new Array<LNode[]>(currentlyBestNodeOrder.length)
    for (let i = 0; i < currentlyBestNodeOrder.length; i++) result[i] = currentlyBestNodeOrder[i]!.slice()
    return result
  }

  nodes(): LNode[][] | null {
    return this.nodeOrder
  }

  transferNodeAndPortOrdersToGraph(lGraph: LGraph, setPortContstraints: boolean): void {
    const northSouthPortDummies: LNode[] = []
    const updatePortOrder = new Set<LNode>()

    const layers = lGraph.getLayers()
    for (let i = 0; i < layers.length; i++) {
      const nodes = layers[i]!.getNodes()
      northSouthPortDummies.length = 0

      for (let j = 0; j < nodes.length; j++) {
        const node = this.nodeOrder![i]![j]!
        node.id = j
        if (node.getType() === NodeType.NORTH_SOUTH_PORT) northSouthPortDummies.push(node)
        layers[i]!.getNodes()[j] = node
        node.getPorts().length = 0
        node.getPorts().push(...this.portOrders[i]![j]!)
        if (setPortContstraints) {
          const pc = node.getProperty<PortConstraints>(PORT_CONSTRAINTS)
          if (!PortConstraints.isOrderFixed(pc)) {
            node.setProperty(PORT_CONSTRAINTS, PortConstraints.FIXED_ORDER)
          }
        }
      }

      for (const dummy of northSouthPortDummies) {
        const origin = this.assertCorrectPortSides(dummy)
        updatePortOrder.add(origin)
        updatePortOrder.add(dummy)
      }
    }

    for (const node of updatePortOrder) {
      node.getPorts().sort(cmpCombined)
    }
  }

  private assertCorrectPortSides(dummy: LNode): LNode {
    const origin = dummy.getProperty<LNode>(IN_LAYER_LAYOUT_UNIT)
    const dummyPort = dummy.getPorts()[0]!

    for (const port of origin.getPorts()) {
      if (port === (dummyPort.getProperty(ORIGIN) as LPort)) {
        if (port.getSide() === PortSide.NORTH && dummy.id > origin.id) {
          port.setSide(PortSide.SOUTH)
          if (port.isExplicitlySuppliedPortAnchor()) {
            const portHeight = port.getSize().y
            const anchorY = port.getAnchor().y
            port.getAnchor().y = portHeight - anchorY
          }
        } else if (port.getSide() === PortSide.SOUTH && origin.id > dummy.id) {
          port.setSide(PortSide.NORTH)
          if (port.isExplicitlySuppliedPortAnchor()) {
            const portHeight = port.getSize().y
            const anchorY = port.getAnchor().y
            port.getAnchor().y = -(portHeight - anchorY)
          }
        }
        break
      }
    }
    return origin
  }
}
