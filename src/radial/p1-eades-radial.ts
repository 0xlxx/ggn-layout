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
 * p1-eades-radial — ELK alg.radial.p1position.EadesRadial + wedge
 * (IAnnulusWedgeCriteria / AnnulusWedgeByLeafs / AnnulusWedgeByNodeSpace).
 *
 * Eades 径向布局: 以根为中心, 同层节点放在同一半径, 每个节点置于其扇形楔形中心.
 * 可选平移优化: 尝试 0-359 度偏移, 按优化准则选第一个最优值.
 * 注意 Java 原样保留: tau = 2*acos(currentRadius/currentRadius + radius)
 * (半径 >0 时为 NaN, 恒走 else 分支).
 */
import type { ElkNode } from '../api/elk-json.js'
import { RADIUS, SORTER, WEDGE_CRITERIA, OPTIMIZATION_CRITERIA, getGraphProperty, optStr, AnnulusWedgeCriteria, SortingStrategy, RadialTranslationStrategy } from './options.js'
import { getSuccessors, centerNodesOnRadi, getNumberOfLeaves } from './radial-util.js'
import type { IRadialSorter } from './sorting.js'
import { createSorter } from './sorting.js'
import type { IEvaluation } from './optimization.js'
import { createOptimizer } from './optimization.js'
import { INTERNAL_ROOT_NODE } from './radial-layout.js'

/** 楔形空间准则 (Java IAnnulusWedgeCriteria). */
export interface IAnnulusWedgeCriteria {
  calculateWedgeSpace(node: ElkNode): number
}

/** 按叶数确定楔形空间 (Java AnnulusWedgeByLeafs). */
export class AnnulusWedgeByLeafs implements IAnnulusWedgeCriteria {
  private graph: ElkNode

  constructor(graph: ElkNode) {
    this.graph = graph
  }

  calculateWedgeSpace(node: ElkNode): number {
    return getNumberOfLeaves(this.graph, node)
  }
}

/** 按节点对角线与子树和确定楔形空间 (Java AnnulusWedgeByNodeSpace). */
export class AnnulusWedgeByNodeSpace implements IAnnulusWedgeCriteria {
  private graph: ElkNode

  constructor(graph: ElkNode) {
    this.graph = graph
  }

  calculateWedgeSpace(node: ElkNode): number {
    const successors = getSuccessors(this.graph, node)
    const height = node.height ?? 0
    const width = node.width ?? 0
    const nodeSize = Math.sqrt(height * height + width * width)

    let childSpace = 0
    for (const child of successors) {
      childSpace += this.calculateWedgeSpace(child)
    }
    return Math.max(childSpace, nodeSize)
  }
}

/** 楔形准则工厂 (Java AnnulusWedgeCriteria.create). */
export function createWedgeCriteria(graph: ElkNode, strategy: AnnulusWedgeCriteria): IAnnulusWedgeCriteria {
  switch (strategy) {
    case AnnulusWedgeCriteria.LEAF_NUMBER:
      return new AnnulusWedgeByLeafs(graph)
    case AnnulusWedgeCriteria.NODE_SIZE:
      return new AnnulusWedgeByNodeSpace(graph)
    default:
      throw new Error(`No implementation is available for the layout option ${strategy}`)
  }
}

const CIRCLE_DEGREES = 360
const DEGREE_TO_RAD = Math.PI / 180

/** P1 节点放置 (Java EadesRadial.process). */
export function eadesRadial(graph: ElkNode): void {
  const root = getGraphProperty<ElkNode>(graph, INTERNAL_ROOT_NODE, undefined as unknown as ElkNode)
  const radius = getGraphProperty<number>(graph, RADIUS, 0)
  const sorter = createSorter(graph, optStr(graph, SORTER, SortingStrategy.NONE))
  const annulusWedgeCriteria = createWedgeCriteria(graph, optStr(graph, WEDGE_CRITERIA, AnnulusWedgeCriteria.NODE_SIZE))
  const optimizer = createOptimizer(graph, optStr(graph, OPTIMIZATION_CRITERIA, RadialTranslationStrategy.NONE))
  translate(graph, root, radius, sorter, annulusWedgeCriteria, optimizer)
}

/** 按每个度数搜索最优平移 (Java translate). */
function translate(
  graph: ElkNode, root: ElkNode, radius: number,
  sorter: IRadialSorter | null, annulusWedgeCriteria: IAnnulusWedgeCriteria, optimizer: IEvaluation | null,
): void {
  let optimalOffset = 0
  let optimalValue = Number.MAX_VALUE

  if (optimizer !== null) {
    for (let i = 0; i < CIRCLE_DEGREES; i++) {
      const offset = i * DEGREE_TO_RAD
      positionNodes(graph, root, radius, sorter, annulusWedgeCriteria, root, 0, 0, 2 * Math.PI, offset)
      const translatedValue = optimizer.evaluate(root)
      // Take the first occurence of the minimum
      if (translatedValue < optimalValue) {
        optimalOffset = offset
        optimalValue = translatedValue
      }
    }
  }
  positionNodes(graph, root, radius, sorter, annulusWedgeCriteria, root, 0, 0, 2 * Math.PI, optimalOffset)
}

/**
 * 把节点放在楔形中心并计算下一子节点的楔形 (Java positionNodes).
 */
function positionNodes(
  graph: ElkNode, root: ElkNode, radius: number, sorter: IRadialSorter | null,
  annulusWedgeCriteria: IAnnulusWedgeCriteria,
  node: ElkNode, currentRadius: number, minAlpha: number, maxAlpha: number, optimalOffset: number,
): void {
  const radOffset = optimalOffset

  const alphaPoint = (minAlpha + maxAlpha) / 2 + radOffset

  // x=r*sinθ, y=r*cosθ
  const xPos = currentRadius * Math.cos(alphaPoint)
  const yPos = currentRadius * Math.sin(alphaPoint)

  // shift the nodes, such that the center of each node is on the circle
  centerNodesOnRadi(node, xPos, yPos)

  const numberOfLeafs = annulusWedgeCriteria.calculateWedgeSpace(node)
  // Java 原样: 2*acos(currentRadius/currentRadius + radius) — 半径 >0 时为 NaN
  const tau = 2 * Math.acos(currentRadius / currentRadius + radius)
  let s: number
  let alpha: number
  if (tau < maxAlpha - minAlpha) {
    s = tau / numberOfLeafs
    alpha = (minAlpha + maxAlpha - tau) / 2
  } else {
    s = (maxAlpha - minAlpha) / numberOfLeafs
    alpha = minAlpha
  }
  const successors = getSuccessors(graph, node)
  if (sorter !== null) {
    sorter.initialize(root)
    sorter.sort(successors)
  }
  for (const child of successors) {
    const numberOfChildLeafs = annulusWedgeCriteria.calculateWedgeSpace(child)
    positionNodes(graph, root, radius, sorter, annulusWedgeCriteria, child, currentRadius + radius, alpha, alpha + s * numberOfChildLeafs, optimalOffset)
    alpha += s * numberOfChildLeafs
  }
}
