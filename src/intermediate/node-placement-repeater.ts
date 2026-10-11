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
 * NodePlacementRepeater (对应 ELK intermediate.NodePlacementRepeater).
 * network simplex node flexibility 后置: 按第一遍算出的节点尺寸固定尺寸, 关掉弹性,
 * 用 RECOMPUTE_NODE_PLACEMENT 指定的算法跑第二遍节点放置.
 */
import type { LGraph } from '../graph/lgraph.js'
import {
  NodePlacementStrategy,
  NODE_PLACEMENT_NETWORK_SIMPLEX_NODE_FLEXIBILITY_RECOMPUTE_NODE_PLACEMENT,
  NODE_PLACEMENT_NETWORK_SIMPLEX_NODE_FLEXIBILITY_DEFAULT,
  NODE_PLACEMENT_NETWORK_SIMPLEX_NODE_FLEXIBILITY,
  NODE_SIZE_CONSTRAINTS,
} from '../options/layered-options.js'
import { processLabelAndNodeSize } from './label-and-node-size-processor.js'
import { calculateNodeMargins } from './node-margin-calculator.js'
import { processSimpleNodePlace } from '../p4nodes/simple-node-placer.js'
import { processInteractiveNodePlace } from '../p4nodes/interactive-node-placer.js'
import { NetworkSimplexPlacer } from '../p4nodes/network-simplex-placer.js'
import { BKNodePlacer } from '../p4nodes/bk-node-placer.js'

export function processNodePlacementRepeat(layeredGraph: LGraph): void {
  const strategy = layeredGraph.getProperty(NODE_PLACEMENT_NETWORK_SIMPLEX_NODE_FLEXIBILITY_RECOMPUTE_NODE_PLACEMENT)
  // 未设置则不做第二遍 (ELK: 策略只在选项非 null 时调度本处理器).
  if (strategy === null || strategy === undefined) return

  // 第二遍禁用节点弹性: 图级默认 + 节点级覆盖都清掉.
  layeredGraph.setProperty(NODE_PLACEMENT_NETWORK_SIMPLEX_NODE_FLEXIBILITY_DEFAULT, null)
  for (const layer of layeredGraph.getLayers()) {
    for (const node of layer.getNodes()) {
      // 节点级弹性不影响第二遍.
      node.setProperty(NODE_PLACEMENT_NETWORK_SIMPLEX_NODE_FLEXIBILITY, null)
      // 默认节点尺寸约束 == 固定尺寸.
      node.setProperty(NODE_SIZE_CONSTRAINTS, null)
      // 重置节点位置.
      node.position.y = 0
    }
  }
  // 基于固定尺寸重算端口/label 位置与节点 margin.
  processLabelAndNodeSize(layeredGraph)
  calculateNodeMargins(layeredGraph)
  // 第二遍节点放置.
  runNodePlacer(strategy, layeredGraph)
}

/** 按 ELK NodePlacementStrategy 分发到对应放置器 (与 LayeredLayoutProvider 的 P4 分发一致). */
function runNodePlacer(strategy: NodePlacementStrategy, layeredGraph: LGraph): void {
  switch (strategy) {
    case NodePlacementStrategy.SIMPLE:
      processSimpleNodePlace(layeredGraph)
      break
    case NodePlacementStrategy.INTERACTIVE:
      processInteractiveNodePlace(layeredGraph)
      break
    case NodePlacementStrategy.NETWORK_SIMPLEX:
      new NetworkSimplexPlacer().process(layeredGraph)
      break
    case NodePlacementStrategy.BRANDES_KOEPF:
      new BKNodePlacer().process(layeredGraph)
      break
    default:
      throw new Error(`未支持的节点放置策略: ${strategy}`)
  }
}
