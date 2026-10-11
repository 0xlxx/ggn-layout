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
 * AbstractGraphPlacer (对应 ELK layered components.AbstractGraphPlacer).
 * 组合多个分层图: 按某种算法排布并合并到目标图.
 * 子类实现 combine; moveGraph/offsetGraph 负责节点/边弯点/交汇点/边标签的整体平移.
 */
import type { LEdge } from '../graph/ledge.js'
import type { LGraph } from '../graph/lgraph.js'
import { JUNCTION_POINTS } from '../options/layered-options.js'

export abstract class AbstractGraphPlacer {
  /**
   * 计算给定图的合适放置并合并进单个目标图.
   *
   * @param components 要合并的图
   * @param target 合并的目标图
   */
  abstract combine(components: LGraph[], target: LGraph): void

  /**
   * 按给定偏移把多个源图移入目标图. 集合顺序必须与哈希值无关,
   * 否则后续布局调用会产生不同结果.
   */
  protected moveGraphs(destGraph: LGraph, sourceGraphs: LGraph[], offsetX: number, offsetY: number): void {
    for (const sourceGraph of sourceGraphs) {
      this.moveGraph(destGraph, sourceGraph, offsetX, offsetY)
    }
  }

  /**
   * 按给定偏移把单个源图移入目标图. 每个图只能调用一次:
   * 除传入偏移外还会叠加图自身的 offset (Java moveGraph 语义).
   */
  protected moveGraph(destGraph: LGraph, sourceGraph: LGraph, offsetX: number, offsetY: number): void {
    const gx = offsetX + sourceGraph.getOffset().x
    const gy = offsetY + sourceGraph.getOffset().y
    const seenEdges = new Set<LEdge>()
    for (const node of sourceGraph.getLayerlessNodes()) {
      node.position.x += gx
      node.position.y += gy
      for (const port of node.getPorts()) {
        for (const edge of port.getOutgoingEdges()) {
          if (seenEdges.has(edge)) continue
          seenEdges.add(edge)
          for (const bp of edge.getBendPoints()) {
            bp.x += gx
            bp.y += gy
          }
          const junctionPoints = edge.getProperty(JUNCTION_POINTS)
          if (junctionPoints !== null) {
            for (const jp of junctionPoints as { x: number, y: number }[]) {
              jp.x += gx
              jp.y += gy
            }
          }
          for (const label of edge.getLabels()) {
            label.position.x += gx
            label.position.y += gy
          }
        }
      }
      destGraph.getLayerlessNodes().push(node)
      node.setGraph(destGraph)
    }
  }

  /** 批量 offsetGraph (只平移, 不移图). */
  protected offsetGraphs(graphs: LGraph[], offsetX: number, offsetY: number): void {
    for (const graph of graphs) {
      this.offsetGraph(graph, offsetX, offsetY)
    }
  }

  /**
   * 按给定偏移平移图, 不把节点移入其他图. 可对同一图调用任意多次:
   * 不叠加图自身 offset (ELK offsetGraph 语义).
   */
  protected offsetGraph(graph: LGraph, offsetX: number, offsetY: number): void {
    const seenEdges = new Set<LEdge>()
    for (const node of graph.getLayerlessNodes()) {
      node.position.x += offsetX
      node.position.y += offsetY
      for (const port of node.getPorts()) {
        for (const edge of port.getOutgoingEdges()) {
          if (seenEdges.has(edge)) continue
          seenEdges.add(edge)
          for (const bp of edge.getBendPoints()) {
            bp.x += offsetX
            bp.y += offsetY
          }
          const junctionPoints = edge.getProperty(JUNCTION_POINTS)
          if (junctionPoints !== null) {
            for (const jp of junctionPoints as { x: number, y: number }[]) {
              jp.x += offsetX
              jp.y += offsetY
            }
          }
          for (const label of edge.getLabels()) {
            label.position.x += offsetX
            label.position.y += offsetY
          }
        }
      }
    }
  }

}
