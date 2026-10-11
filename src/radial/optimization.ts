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
 * optimization — ELK alg.radial.intermediate.optimization
 * (IEvaluation / EdgeLengthOptimization / EdgeLengthPositionOptimization / CrossingMinimizationPosition).
 *
 * 注意 Java 源码的既有细节均 1:1 保留:
 * - CrossingMinimizationPosition.isCrossing 的 rootY 用 root.getX() (Java bug);
 * - EdgeLengthPositionOptimization 的 rootY 用 root.getHeight() (无 /2);
 * - POSITION 属性缺失时 Java NPE → TS 抛同样语义的错.
 */
import type { ElkNode } from '../api/elk-json.js'
import { KVector, clipVector } from '../force/kvector.js'
import { POSITION, RadialTranslationStrategy, jsonOpt } from './options.js'
import { getSuccessors, allOutgoingEdges, findNodeById, nodeIdOfRef } from './radial-util.js'

/** 平移优化评估器 (Java IEvaluation). */
export interface IEvaluation {
  evaluate(node: ElkNode): number
}

/**
 * 边长度评估 (Java EdgeLengthOptimization): 根节点每条出边的裁剪后长度之和.
 */
export class EdgeLengthOptimization implements IEvaluation {
  private graph: ElkNode

  constructor(graph: ElkNode) {
    this.graph = graph
  }

  evaluate(root: ElkNode): number {
    let edgeLength = 0
    for (const edge of allOutgoingEdges(this.graph, root)) {
      const target = findNodeById(this.graph, nodeIdOfRef(this.graph, String(edge.targets?.[0] ?? '')) ?? '')!
      let targetX = (target.x ?? 0) + (target.width ?? 0) / 2
      let targetY = (target.y ?? 0) + (target.height ?? 0) / 2

      let rootX = (root.x ?? 0) + (root.width ?? 0) / 2
      let rootY = (root.y ?? 0) + (root.height ?? 0) / 2

      // Clipping
      const vector = new KVector(targetX - rootX, targetY - rootY)
      const sourceClip = new KVector(vector.x, vector.y)
      clipVector(sourceClip, root.width ?? 0, root.height ?? 0)
      vector.x -= sourceClip.x
      vector.y -= sourceClip.y

      rootX = targetX - vector.x
      rootY = targetY - vector.y

      const targetClip = new KVector(vector.x, vector.y)
      clipVector(targetClip, target.width ?? 0, target.height ?? 0)
      vector.x -= targetClip.x
      vector.y -= targetClip.y

      targetX = rootX + vector.x
      targetY = rootY + vector.y

      const vectorX = targetX - rootX
      const vectorY = targetY - rootY
      edgeLength += Math.sqrt(vectorX * vectorX + vectorY * vectorY)
    }
    return edgeLength
  }
}

/**
 * 基于 POSITION 的边长度评估 (Java EdgeLengthPositionOptimization): 边起点由位置属性给出.
 */
export class EdgeLengthPositionOptimization implements IEvaluation {
  private graph: ElkNode

  constructor(graph: ElkNode) {
    this.graph = graph
  }

  evaluate(root: ElkNode): number {
    let edgeLength = 0
    for (const edge of allOutgoingEdges(this.graph, root)) {
      const target = findNodeById(this.graph, nodeIdOfRef(this.graph, String(edge.targets?.[0] ?? '')) ?? '')!
      const targetX = (target.x ?? 0) + (target.width ?? 0) / 2
      const targetY = (target.y ?? 0) + (target.height ?? 0) / 2

      const position = jsonOpt<{ x: number; y: number }>(target, POSITION)
      if (position === undefined) {
        throw new Error('[radial] EdgeLengthPositionOptimization requires CoreOptions.POSITION (Java NPE 等价)')
      }
      const rootX = (root.x ?? 0) + position.x + (root.width ?? 0) / 2
      const rootY = (root.y ?? 0) + position.y + (root.height ?? 0)

      const vectorX = targetX - rootX
      const vectorY = targetY - rootY
      edgeLength += Math.sqrt(vectorX * vectorX + vectorY * vectorY)
    }
    return edgeLength
  }
}

/**
 * 交叉数评估 (Java CrossingMinimizationPosition): 根与第一半径之间边的交叉数.
 * 期望 POSITION 指向树父节点内的一个点.
 */
export class CrossingMinimizationPosition implements IEvaluation {
  private graph: ElkNode

  constructor(graph: ElkNode) {
    this.graph = graph
  }

  evaluate(rootNode: ElkNode): number {
    let crossings = 0
    const nodes = getSuccessors(this.graph, rootNode)

    let k = 0
    for (const node1 of nodes) {
      k++
      for (let i = k; i < nodes.length; i++) {
        if (this.isCrossing(rootNode, node1, nodes[i]!)) {
          crossings += 1
        }
      }
    }
    return crossings
  }

  /** 两条边是否交叉 (Java isCrossing, 保留 rootY = root.getX() 的 Java 原样). */
  private isCrossing(root: ElkNode, node1: ElkNode, node2: ElkNode): boolean {
    // root
    const rootX = (root.x ?? 0) + (root.width ?? 0) / 2
    const rootY = (root.x ?? 0) + (root.width ?? 0) / 2 // Java 原样: 用 X!

    // node1
    const xPos1 = (node1.x ?? 0) + (node1.width ?? 0) / 2
    const yPos1 = (node1.y ?? 0) + (node1.height ?? 0) / 2
    const node1Vector = new KVector(xPos1, yPos1)

    const position1 = jsonOpt<{ x: number; y: number }>(node1, POSITION)
    if (position1 === undefined) {
      throw new Error('[radial] CrossingMinimizationPosition requires CoreOptions.POSITION (Java NPE 等价)')
    }
    position1.x = position1.x + rootX
    position1.y = position1.y + rootY

    const m1 = (node1Vector.y - position1.y) / (node1Vector.x - position1.x)
    const b1 = node1Vector.y - m1 * node1Vector.x

    // node2
    const xPos2 = (node2.x ?? 0) + (node2.width ?? 0) / 2
    const yPos2 = (node2.y ?? 0) + (node2.height ?? 0) / 2
    const node2Vector = new KVector(xPos2, yPos2)

    const position2 = jsonOpt<{ x: number; y: number }>(node2, POSITION)
    if (position2 === undefined) {
      throw new Error('[radial] CrossingMinimizationPosition requires CoreOptions.POSITION (Java NPE 等价)')
    }
    position2.x = position2.x + rootX
    position2.y = position2.y + rootY

    const m2 = (node2Vector.y - position2.y) / (node2Vector.x - position2.x)
    const b2 = node2Vector.y - m2 * node2Vector.x

    const xCut = (b1 - b2) / (m2 - m1)
    // check whether the cut occurs on the relevant line segment
    if ((position1.x < xCut && node1Vector.x < xCut) || (xCut < position1.x && xCut < node1Vector.x)) {
      return false
    } else if ((position2.x < xCut && node2Vector.x < xCut) || (xCut < position2.x && xCut < node2Vector.x)) {
      return false
    }
    return true
  }
}

/** 优化器工厂 (Java RadialTranslationStrategy.create; NONE → null). */
export function createOptimizer(graph: ElkNode, strategy: RadialTranslationStrategy): IEvaluation | null {
  switch (strategy) {
    case RadialTranslationStrategy.EDGE_LENGTH:
      return new EdgeLengthOptimization(graph)
    case RadialTranslationStrategy.EDGE_LENGTH_BY_POSITION:
      return new EdgeLengthPositionOptimization(graph)
    case RadialTranslationStrategy.CROSSING_MINIMIZATION_BY_POSITION:
      return new CrossingMinimizationPosition(graph)
    case RadialTranslationStrategy.NONE:
      return null
    default:
      throw new Error(`No implementation is available for the layout option ${strategy}`)
  }
}
