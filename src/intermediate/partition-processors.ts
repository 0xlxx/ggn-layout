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
 * 分区布局处理器 (对应 ELK intermediate.Partition{Pre,Mid,Post}processor).
 *
 * 三个处理器配合 (partitioning.activate 时由 GraphConfigurator 加入):
 *   1. PartitionPreprocessor (P1 前): 反转「高分区 → 低分区」的边, 使断环后分区序不被破坏,
 *      反转边加 PRIORITY_DIRECTION=1000 防止 P1 再反转.
 *   2. PartitionMidprocessor (P2 前): 相邻分区 (a<b) 之间加约束边 (PARTITION_DUMMY 端口/边),
 *      强制小分区在左 (layering 时约束保证).
 *   3. PartitionPostprocessor (P3 前): 移除全部 PARTITION_DUMMY 端口 (边随之移除).
 */
import { LGraph } from '../graph/lgraph.js'
import { LNode } from '../graph/lnode.js'
import { LPort } from '../graph/lport.js'
import { LEdge } from '../graph/ledge.js'
import { PortSide } from '../graph/enums.js'
import { PARTITIONING_PARTITION, PARTITIONING_ACTIVATE, PRIORITY_DIRECTION } from '../options/layered-options.js'
import { PARTITION_DUMMY } from '../options/internal-properties.js'
import { GraphProperties, GRAPH_PROPERTIES } from '../options/internal-properties.js'

/** ELK PartitionPreprocessor: P1 前反转高→低分区边. */
export function processPartitionPre(graph: LGraph): void {
  const partitionedNodes = graph.getLayerlessNodes().filter((n) => n.hasProperty(PARTITIONING_PARTITION))
  const edgesToBeReversed: LEdge[] = []
  for (const node of graph.getLayerlessNodes()) {
    if (!node.hasProperty(PARTITIONING_PARTITION)) continue
    for (const edge of node.getOutgoingEdges()) {
      if (mustBeReversed(edge, partitionedNodes)) edgesToBeReversed.push(edge)
    }
  }
  for (const edge of edgesToBeReversed) {
    edge.reverse(graph, true)
    let priority = 1000
    if (edge.hasProperty(PRIORITY_DIRECTION)) priority += edge.getProperty(PRIORITY_DIRECTION)
    edge.setProperty(PRIORITY_DIRECTION, priority)
  }
}

function mustBeReversed(edge: LEdge, partitionedNodes: LNode[]): boolean {
  const source = edge.getSource()?.getNode()
  const target = edge.getTarget()?.getNode()
  if (!source || !target) return false
  const sourcePartition = source.getProperty(PARTITIONING_PARTITION)
  if (target.hasProperty(PARTITIONING_PARTITION)) {
    return sourcePartition! > target.getProperty(PARTITIONING_PARTITION)!
  }
  // 目标无分区: BFS 找可达的更低分区节点 → 反转
  const lower = partitionedNodes.filter((n) => n.getProperty(PARTITIONING_PARTITION)! < sourcePartition!)
  const queue: LNode[] = [source]
  const visited = new Set<LNode>([source])
  while (queue.length > 0) {
    const current = queue.shift()!
    if (lower.includes(current)) return true
    for (const out of current.getOutgoingEdges()) {
      const targetNode = out.getTarget()?.getNode()
      if (targetNode && !visited.has(targetNode)) {
        visited.add(targetNode)
        queue.push(targetNode)
      }
    }
  }
  return false
}

/** ELK PartitionMidprocessor: P2 前加相邻分区约束边. */
export function processPartitionMid(graph: LGraph): void {
  const partitionToNodes = new Map<number | null, LNode[]>()
  for (const node of graph.getLayerlessNodes()) {
    if (node.hasProperty(PARTITIONING_PARTITION)) {
      const id = node.getProperty(PARTITIONING_PARTITION)
      if (!partitionToNodes.has(id)) partitionToNodes.set(id, [])
      partitionToNodes.get(id)!.push(node)
    }
  }
  if (partitionToNodes.size === 0) return
  const sorted = [...partitionToNodes.keys()].sort((a, b) => a! - b!)
  for (let i = 0; i + 1 < sorted.length; i++) {
    connectPartitions(partitionToNodes.get(sorted[i])!, partitionToNodes.get(sorted[i + 1])!)
  }
}

function connectPartitions(first: LNode[], second: LNode[]): void {
  for (const node of first) {
    const sourcePort = new LPort()
    sourcePort.setNode(node)
    sourcePort.setSide(PortSide.EAST)
    sourcePort.setProperty(PARTITION_DUMMY, true)
    for (const otherNode of second) {
      const targetPort = new LPort()
      targetPort.setNode(otherNode)
      targetPort.setSide(PortSide.WEST)
      targetPort.setProperty(PARTITION_DUMMY, true)
      const edge = new LEdge()
      edge.setProperty(PARTITION_DUMMY, true)
      edge.setSource(sourcePort)
      edge.setTarget(targetPort)
    }
  }
}

/** ELK PartitionPostprocessor: P3 前移除全部 PARTITION_DUMMY 端口. */
export function processPartitionPost(graph: LGraph): void {
  for (const layer of graph.getLayers()) {
    for (const node of layer.getNodes()) {
      node.setPorts(node.getPorts().filter((p) => !p.getProperty(PARTITION_DUMMY)))
    }
  }
}

/** 是否激活分区 (顶层图 PARTITIONING_ACTIVATE → GraphProperties.PARTITIONS). */
export function collectPartitions(graph: LGraph): void {
  if (graph.getProperty(PARTITIONING_ACTIVATE)) {
    graph.getProperty(GRAPH_PROPERTIES).add(GraphProperties.PARTITIONS)
  }
}
