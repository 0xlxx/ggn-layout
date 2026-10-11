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
 * PortListSorter (对应 ELK intermediate.PortListSorter).
 * P3 前置: 按端口约束排序节点端口列表 (影响端口 rank 与分布).
 */
import type { LGraph } from '../graph/lgraph.js'
import type { LPort } from '../graph/lport.js'
import type { LEdge } from '../graph/ledge.js'
import { PortSide, PortConstraints } from '../graph/enums.js'
import { PORT_CONSTRAINTS, PORT_INDEX, PORT_SORTING_STRATEGY } from '../options/layered-options.js'
import { REVERSED } from '../options/internal-properties.js'

// ELK PortSide 序: NORTH(0) EAST(1) SOUTH(2) WEST(3).
const SIDE_ORDER: Record<PortSide, number> = {
  [PortSide.NORTH]: 0,
  [PortSide.EAST]: 1,
  [PortSide.SOUTH]: 2,
  [PortSide.WEST]: 3,
  [PortSide.UNDEFINED]: 4,
}

const cmpPortSide = (p1: LPort, p2: LPort): number =>
  SIDE_ORDER[p1.getSide()] - SIDE_ORDER[p2.getSide()]

const cmpFixedOrderAndFixedPos = (p1: LPort, p2: LPort): number => {
  const pc = p1.getNode()!.getProperty(PORT_CONSTRAINTS)
  const sideDiff = SIDE_ORDER[p1.getSide()] - SIDE_ORDER[p2.getSide()]
  if (sideDiff !== 0 || !PortConstraints.isOrderFixed(pc)) return 0

  if (pc === PortConstraints.FIXED_ORDER) {
    const i1 = p1.getProperty(PORT_INDEX)
    const i2 = p2.getProperty(PORT_INDEX)
    if (i1 !== null && i2 !== null && i1 - i2 !== 0) return i1 - i2
  }

  switch (p1.getSide()) {
    case PortSide.NORTH: return p1.getPosition().x - p2.getPosition().x
    case PortSide.EAST: return p1.getPosition().y - p2.getPosition().y
    case PortSide.SOUTH: return p2.getPosition().x - p1.getPosition().x
    case PortSide.WEST: return p2.getPosition().y - p1.getPosition().y
    default: return 0
  }
}

const cmpCombined = (p1: LPort, p2: LPort): number =>
  cmpPortSide(p1, p2) || cmpFixedOrderAndFixedPos(p1, p2)

const realDegree = (p: LPort, edges: (port: LPort) => LEdge[]): number =>
  edges(p).filter(e => !e.getProperty(REVERSED)).length

const cmpPortDegreeEastWest = (p1: LPort, p2: LPort): number => {
  if (SIDE_ORDER[p1.getSide()] - SIDE_ORDER[p2.getSide()] !== 0) return 0
  switch (p1.getSide()) {
    case PortSide.EAST:
      return realDegree(p2, p => p.getOutgoingEdges()) - realDegree(p1, p => p.getOutgoingEdges())
    case PortSide.WEST:
      return realDegree(p1, p => p.getIncomingEdges()) - realDegree(p2, p => p.getIncomingEdges())
    default:
      return 0
  }
}

/** 反转 [low, high) 区间的端口 (数组解构交换). */
function reversePorts(ports: LPort[], low: number, high: number): void {
  // ELK: 2 元素及以下区间不反转 (reverse 的 early return).
  if (high - low <= 2) return
  const n = Math.floor((high - low) / 2)
  for (let i = 0; i < n; i++) {
    ;[ports[low + i]!, ports[high - i - 1]!] = [ports[high - i - 1]!, ports[low + i]!]
  }
}

/** 预排序列表中某侧的 [i, j) 范围 (ELK findPortSideRange). */
function findPortSideRange(ports: LPort[], side: PortSide): [number, number] {
  if (ports.length === 0) return [0, 0]
  const lb = SIDE_ORDER[side]
  const hb = lb + 1
  let low = 0
  let current = SIDE_ORDER[ports[0]!.getSide()]
  while (low < ports.length - 1 && current < lb) {
    low++
    current = SIDE_ORDER[ports[low]!.getSide()]
  }
  let high = low
  while (high < ports.length - 1 && current < hb) {
    high++
    current = SIDE_ORDER[ports[low]!.getSide()]
  }
  return [low, high]
}

function reverseWestAndSouthSide(ports: LPort[]): void {
  if (ports.length <= 1) return
  const [sLow, sHigh] = findPortSideRange(ports, PortSide.SOUTH)
  reversePorts(ports, sLow, sHigh)
  const [wLow, wHigh] = findPortSideRange(ports, PortSide.WEST)
  reversePorts(ports, wLow, wHigh)
}

export function processPortListSort(layeredGraph: LGraph): void {
    const pss = layeredGraph.getProperty(PORT_SORTING_STRATEGY)

    for (const layer of layeredGraph.getLayers()) {
      for (const node of layer.getNodes()) {
        const portConstraints = node.getProperty(PORT_CONSTRAINTS)
        const ports = node.getPorts()
        if (process.env.GGN_BK_DBG) {
          console.error(`GGN PLS node=${node.id} pc=${portConstraints} before=[${ports.map(p => `${p.id}:${p.getSide()}(${p.getPosition().x},${p.getPosition().y})`).join(' ')}]`)
        }

        if (PortConstraints.isOrderFixed(portConstraints)) {
          ports.sort(cmpCombined)
        } else if (PortConstraints.isSideFixed(portConstraints)) {
          ports.sort(cmpPortSide)
          reverseWestAndSouthSide(ports)
          if (pss === 'PORT_DEGREE') {
            ports.sort(cmpPortDegreeEastWest)
          }
        }
        if (process.env.GGN_BK_DBG) {
          console.error(`GGN PLS node=${node.id} after=[${ports.map(p => `${p.id}:${p.getSide()}(${p.getPosition().x},${p.getPosition().y})`).join(' ')}]`)
        }
      }
    }
  }
