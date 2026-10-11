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
 * mergeEdges 支持 (对应 ELK LGraphUtil.createPort 的合并分支 + provideCollectorPort).
 * 仅用于测试/导入路径的边端口创建: mergeEdges=true 且节点非 side-fixed 时, 每侧共享一个收集端口.
 */
import type { LNode } from './lnode.js'
import { LPort } from './lport.js'
import { PortSide, PortType } from './enums.js'
import { INPUT_COLLECT, OUTPUT_COLLECT } from '../options/internal-properties.js'

/** 中心点 (对应 ELK centerPoint): 端口位置居中于节点对应侧. */
function centerPoint(pos: { x: number; y: number }, nodeSize: { x: number; y: number }, side: PortSide): void {
  switch (side) {
    case PortSide.WEST: pos.x = 0; pos.y = nodeSize.y / 2; break
    case PortSide.EAST: pos.x = nodeSize.x; pos.y = nodeSize.y / 2; break
    case PortSide.NORTH: pos.x = nodeSize.x / 2; pos.y = 0; break
    case PortSide.SOUTH: pos.x = nodeSize.x / 2; pos.y = nodeSize.y; break
    default: pos.x = nodeSize.x / 2; pos.y = nodeSize.y / 2
  }
}

/** 提供收集端口 (对应 ELK provideCollectorPort). */
export function provideCollectorPort(node: LNode, type: PortType, side: PortSide): LPort {
  const prop = type === PortType.INPUT ? INPUT_COLLECT : OUTPUT_COLLECT
  for (const p of node.getPorts()) {
    if (p.getProperty(prop) === true) return p
  }
  const port = new LPort()
  port.setProperty(prop, true)
  port.setNode(node)
  port.setSide(side)
  centerPoint(port.getPosition(), node.getSize(), side)
  return port
}

/** 创建边端口 (对应 ELK LGraphUtil.createPort 的合并分支): 满足时共享收集端口. */
export function createMergedPort(node: LNode, type: PortType, defaultSide: PortSide, mergeEdges: boolean, sideFixed: boolean): LPort {
  if (mergeEdges && !sideFixed) {
    return provideCollectorPort(node, type, type === PortType.OUTPUT ? defaultSide : opposed(defaultSide))
  }
  const port = new LPort()
  port.setNode(node)
  port.setSide(type === PortType.OUTPUT ? defaultSide : opposed(defaultSide))
  return port
}

function opposed(side: PortSide): PortSide {
  switch (side) {
    case PortSide.NORTH: return PortSide.SOUTH
    case PortSide.SOUTH: return PortSide.NORTH
    case PortSide.EAST: return PortSide.WEST
    case PortSide.WEST: return PortSide.EAST
    default: return PortSide.UNDEFINED
  }
}
