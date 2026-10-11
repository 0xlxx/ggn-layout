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
 * HighDegreeNodeLayeringProcessor (对应 ELK intermediate.HighDegreeNodeLayeringProcessor).
 *
 * 高连通节点 (degree >= threshold) 周围的「树」(单连接链) 移到独立层, 给扇出/扇入让出空间,
 * 避免交叉最小化阶段的高连通节点排布失控 (Fan / high-degree-example 实证).
 *
 * 流程 (对齐 ELK 0.12.0):
 *   1. 逐层找高连通节点, 计算其入/出树 (hasSingleConnection + isTreeRoot, 树高 ≤ treeHeight);
 *   2. 在当前层前插入 incMax 层, 把入树根移入 (moveTree: 根在最远层, 链向当前层延伸);
 *   3. 在当前层后插入 outMax 层, 移出树;
 *   4. 移除空层.
 */
import { LGraph } from '../graph/lgraph.js'
import { LNode } from '../graph/lnode.js'
import { LEdge } from '../graph/ledge.js'
import { Layer } from '../graph/layer.js'
import { HIGH_DEGREE_NODES_THRESHOLD, HIGH_DEGREE_NODES_TREE_HEIGHT } from '../options/layered-options.js'

interface Hdni {
  incMax: number
  incRoots: LNode[] | null
  outMax: number
  outRoots: LNode[] | null
}

export function processHighDegreeNodeLayering(graph: LGraph): void {
  let degreeThreshold = graph.getProperty(HIGH_DEGREE_NODES_THRESHOLD)
  let treeHeightThreshold = graph.getProperty(HIGH_DEGREE_NODES_TREE_HEIGHT)
  if (treeHeightThreshold === 0) treeHeightThreshold = Number.MAX_SAFE_INTEGER

  const layers = graph.getLayers()
  let li = 0
  while (li < layers.length) {
    const current = layers[li]!
    const highDegreeNodes: [LNode, Hdni][] = []
    let incMax = -1
    let outMax = -1
    for (const n of [...current.getNodes()]) {
      if (degree(n) >= degreeThreshold) {
        const hdni = calculateInformation(n, degreeThreshold, treeHeightThreshold)
        incMax = Math.max(incMax, hdni.incMax)
        outMax = Math.max(outMax, hdni.outMax)
        highDegreeNodes.push([n, hdni])
      }
    }
    // 插入前层 (prependLayer: 每层插在当前层前; unshift 使 [0] 为最靠近当前层)
    const preLayers: Layer[] = []
    for (let i = 0; i < incMax; i++) {
      const l = new Layer(graph)
      layers.splice(li, 0, l)
      preLayers.unshift(l)
    }
    preLayers.reverse() // 根应移到最靠近当前层 (big2) 的层
    for (const [, hdni] of highDegreeNodes) {
      if (hdni.incRoots !== null) for (const root of hdni.incRoots) moveTree(root, (n) => n.getIncomingEdges(), preLayers)
    }
    // 插入后层 (appendLayer: 当前层后)
    const currentIdx = li + Math.max(0, incMax)
    const afterLayers: Layer[] = []
    for (let i = 0; i < outMax; i++) {
      const l = new Layer(graph)
      layers.splice(currentIdx + 1 + i, 0, l)
      afterLayers.push(l)
    }
    for (const [, hdni] of highDegreeNodes) {
      if (hdni.outRoots !== null) for (const root of hdni.outRoots) moveTree(root, (n) => n.getOutgoingEdges(), afterLayers)
    }
    // 前进到下一个原始层: 无高连通节点时 incMax/outMax=-1 → 用 0 (不插入)
    li += Math.max(0, incMax) + 1 + Math.max(0, outMax)
  }

  // 移除空层
  for (let i = layers.length - 1; i >= 0; i--) {
    if (layers[i]!.getNodes().length === 0) layers.splice(i, 1)
  }

}

function calculateInformation(hdn: LNode, degreeThreshold: number, treeHeightThreshold: number): Hdni {
  const hdni: Hdni = { incMax: -1, incRoots: null, outMax: -1, outRoots: null }
  for (const incEdge of hdn.getIncomingEdges()) {
    if (incEdge.isSelfLoop()) continue
    const src = incEdge.getSource()!.getNode()!
    if (hasSingleConnection(src, (n) => n.getOutgoingEdges())) {
      const h = isTreeRoot(src, (n) => n.getOutgoingEdges(), (n) => n.getIncomingEdges(), degreeThreshold, treeHeightThreshold)
      if (h === -1) continue
      hdni.incMax = Math.max(hdni.incMax, h)
      if (hdni.incRoots === null) hdni.incRoots = []
      hdni.incRoots.push(src)
    }
  }
  for (const outEdge of hdn.getOutgoingEdges()) {
    if (outEdge.isSelfLoop()) continue
    const tgt = outEdge.getTarget()!.getNode()!
    if (hasSingleConnection(tgt, (n) => n.getIncomingEdges())) {
      const h = isTreeRoot(tgt, (n) => n.getIncomingEdges(), (n) => n.getOutgoingEdges(), degreeThreshold, treeHeightThreshold)
      if (h === -1) continue
      hdni.outMax = Math.max(hdni.outMax, h)
      if (hdni.outRoots === null) hdni.outRoots = []
      hdni.outRoots.push(tgt)
    }
  }
  return hdni
}

function isTreeRoot(root: LNode, ancestorEdges: (n: LNode) => LEdge[], descendantEdges: (n: LNode) => LEdge[],
  degreeThreshold: number, treeHeightThreshold: number): number {
  if (degree(root) >= degreeThreshold) return -1
  if (!hasSingleConnection(root, ancestorEdges)) return -1
  const descendants = descendantEdges(root)
  if (descendants.length === 0) return 1
  let currentHeight = 0
  for (const e of descendants) {
    const other = otherEnd(e, root)
    const height = isTreeRoot(other, ancestorEdges, descendantEdges, degreeThreshold, treeHeightThreshold)
    if (height === -1) return -1
    currentHeight = Math.max(currentHeight, height)
    if (currentHeight > treeHeightThreshold - 1) return -1
  }
  return currentHeight + 1
}

function moveTree(root: LNode, edgesFun: (n: LNode) => LEdge[], layers: Layer[]): void {
  root.setLayer(layers[0]!)
  const subList = layers.slice(1)
  for (const e of edgesFun(root)) {
    moveTree(otherEnd(e, root), edgesFun, subList)
  }
}

function degree(node: LNode): number {
  return node.getConnectedEdges().length
}

function hasSingleConnection(node: LNode, edgeSelector: (n: LNode) => LEdge[]): boolean {
  let connection: LNode | null = null
  for (const e of edgeSelector(node)) {
    const other = otherEnd(e, node)
    if (connection === null) connection = other
    else if (other !== connection) return false
  }
  return true
}

function otherEnd(e: LEdge, node: LNode): LNode {
  const s = e.getSource()?.getNode()
  const t = e.getTarget()?.getNode()
  return s === node ? t! : s!
}
