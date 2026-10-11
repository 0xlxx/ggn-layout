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
 * NaiveMinST — ELK alg.common.NaiveMinST 0.12.0.
 *
 * 朴素最小生成树: 按代价排序边, 反复取第一条「一端在树内、一端在树外」的边
 * 加入生成树 (边已排序, 无需继续查找). 前提: 边集构成连通图且 root 在顶点集内.
 *
 * 同权边按输入 (Java HashSet<TEdge>) 迭代序稳定排序 → 需 JavaHashSet 保证与 jar 全等.
 */
import { KVector } from '../force/kvector.js'
import { TEdge, Tree, Node } from './graph.js'
import type { CostFunction } from './graph.js'
import type { JavaHashSet } from './java-hash-set.js'

/**
 * 创建以 root 为根的生成树.
 * @param tEdges 图边集 (Java HashSet 迭代序)
 * @param root 根顶点
 * @param costFunction 边代价函数
 */
export function createSpanningTree(
  tEdges: JavaHashSet<TEdge>,
  root: KVector,
  costFunction: CostFunction,
): Tree<KVector> {
  // 边权重: 保持 tEdges 迭代序求值, 排序时直接使用缓存权重.
  // 旧实现每次比较都调用 TEdge.key()/vkey(), 在 O(E log E) 比较中重复构造字符串.
  interface WeightedEdge { edge: TEdge; weight: number; order: number }
  const weightedEdges: WeightedEdge[] = []
  tEdges.forEach((edge) => weightedEdges.push({ edge, weight: costFunction(edge), order: 0 }))

  // 按权重稳定排序 (Java: List.sort 稳定, 同权保持 tEdges 迭代序)
  weightedEdges.sort((e1, e2) => e1.weight < e2.weight ? -1 : e1.weight > e2.weight ? 1 : 0)
  for (let i = 0; i < weightedEdges.length; i++) weightedEdges[i]!.order = i

  // 顶点坐标键在一次生成树构造内不会变化; 按对象缓存纯字符串实现,
  // 仍用坐标值相等语义, 以兼容 maxST 中 root 为 vertex clone 的情况.
  const vertexKeys = new Map<KVector, string>()
  const keyOf = (v: KVector): string => {
    let key = vertexKeys.get(v)
    if (key === undefined) {
      key = vkeyOf(v)
      vertexKeys.set(v, key)
    }
    return key
  }

  // 邻接表用于 Prim 扩张: 新节点入树时, 只扫描其入射边.
  const incidentEdges = new Map<string, WeightedEdge[]>()
  for (const entry of weightedEdges) {
    const uKey = keyOf(entry.edge.u)
    const vKey = keyOf(entry.edge.v)
    let uList = incidentEdges.get(uKey)
    if (uList === undefined) incidentEdges.set(uKey, uList = [])
    uList.push(entry)
    let vList = incidentEdges.get(vKey)
    if (vList === undefined) incidentEdges.set(vKey, vList = [])
    vList.push(entry)
  }

  // 按 (weight, 排序后下标) 排序的二叉最小堆.
  // NaiveMinST 每轮取「最小权重、同权最先出现」的跨界边; 堆返回同一条边,
  // 因而不改变生成树, 但把每轮全量 E 扫描降为 O(E log E).
  const heap: WeightedEdge[] = []
  const heapLess = (a: WeightedEdge, b: WeightedEdge): boolean => {
    if (a.weight < b.weight) return true
    if (a.weight > b.weight) return false
    return a.order < b.order
  }
  const heapPush = (entry: WeightedEdge): void => {
    let i = heap.length
    heap.push(entry)
    while (i > 0) {
      const parent = (i - 1) >> 1
      const p = heap[parent]!
      if (!heapLess(entry, p)) break
      heap[parent] = entry
      heap[i] = p
      i = parent
    }
  }
  const heapPop = (): WeightedEdge => {
    const top = heap[0]!
    const last = heap.pop()!
    if (heap.length === 0) return top
    heap[0] = last
    let i = 0
    while (true) {
      const left = i * 2 + 1
      if (left >= heap.length) break
      const right = left + 1
      let child = left
      if (right < heap.length && heapLess(heap[right]!, heap[left]!)) child = right
      const c = heap[child]!
      if (!heapLess(c, last)) break
      heap[i] = c
      heap[child] = last
      i = child
    }
    return top
  }

  const minST = new Tree<KVector>(root)
  const treeNodes = new Map<string, Tree<KVector>>()
  const pushed = new Uint8Array(weightedEdges.length)
  const pushIncident = (vertexKey: string): void => {
    const list = incidentEdges.get(vertexKey)
    if (list === undefined) return
    for (const entry of list) {
      if (pushed[entry.order] !== 0) continue
      pushed[entry.order] = 1
      heapPush(entry)
    }
  }

  const rootKey = keyOf(root)
  treeNodes.set(rootKey, minST)
  pushIncident(rootKey)

  while (heap.length > 0) {
    const entry = heapPop()
    const edge = entry.edge
    const uKey = keyOf(edge.u)
    const vKey = keyOf(edge.v)
    const uIn = treeNodes.has(uKey)
    const vIn = treeNodes.has(vKey)
    if (uIn === vIn) continue // 两端均已在树内 (或均未入树) → 非扩张边

    const outsideKey = uIn ? vKey : uKey
    const outsideNode = uIn ? edge.v : edge.u
    const subTree = new Tree<KVector>(outsideNode)
    treeNodes.get(uIn ? uKey : vKey)!.children.push(subTree)
    treeNodes.set(outsideKey, subTree)
    pushIncident(outsideKey)
  }

  return minST
}

/** 顶点精确相等键. */
export function vkeyOf(v: KVector): string {
  return `${v.x},${v.y}`
}

/**
 * 把 Tree<KVector> 转成 Tree<Node> (MinSTPhase.convert):
 * originalVertex → Node 映射后镜像树结构.
 */
export function convertTree(tTree: Tree<KVector>, vertices: Node[]): Tree<Node> {
  const nodeMap = new Map<string, Node>()
  for (const n of vertices) nodeMap.set(vkeyOf(n.originalVertex), n)
  const root = new Tree<Node>(nodeMap.get(vkeyOf(tTree.node))!)
  addNode(root, tTree, nodeMap)
  return root
}

function addNode(s: Tree<Node>, t: Tree<KVector>, nodeMap: Map<string, Node>): void {
  for (const child of t.children) {
    const childTree = new Tree<Node>(nodeMap.get(vkeyOf(child.node))!)
    s.children.push(childTree)
    addNode(childTree, child, nodeMap)
  }
}
