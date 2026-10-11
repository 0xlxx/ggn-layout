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
 * mrtree TreeUtil — ELK alg.mrtree.TreeUtil 0.12.0 (静态工具 1:1).
 */
import { KVector } from '../force/kvector.js'
import { TGraph, TEdge, TNode, getInt, getBool, getProp, P_ROOT, P_REMOVABLE_EDGES } from './graph.js'
import { directionVector } from './graph.js'
import { DIRECTION, TREE_LEVEL } from './options.js'
import { Direction } from './options.js'

/** 图中标记 ROOT 的第一个节点. */
export function getRoot(tGraph: TGraph): TNode {
  return tGraph.getNodes().find((x) => getBool(x, P_ROOT, false)) as TNode
}

/** 树的深度. */
export function depth(root: TNode): number {
  const childs = getChildren(root)
  if (childs.length === 0) return 1
  // Java stream max 的逐元素语义; 避免 Math.max(...arr) 对大 fanout 的展开限制
  let max = 0
  for (const x of childs) {
    const d = depth(x)
    if (d > max) max = d
  }
  return max + 1
}

/** 子节点 (去重). */
export function getChildren(n: TNode): TNode[] {
  const re: TNode[] = []
  for (const out of n.getOutgoingEdges()) re.push(out.getTarget())
  return [...new Set(re)]
}

/** 节点到根的距离. */
export function rootDistance(n: TNode, root: TNode): number {
  if (n === root) return 0
  const p = n.getIncomingEdges()[0].getSource()
  return rootDistance(p, root) + 1
}

/**
 * 候选入边全集 (Java 语义 = graph.edges 全表).
 *
 * 图结构不变量: 除 P1 treeify 中为破环而摘下的边 (`P_REMOVABLE_EDGES`, 仍在
 * graph.edges 中但已从两端邻接表移除) 之外, graph.edges ≡ 各节点邻接表的并集
 * (importGraph/addChild/setSource/setTarget 都同步维护两份)。故用「节点邻接表 +
 * 摘下的破环边」重建全集, 值域与 Java 的 graph.edges 扫描完全一致, 但复杂度从
 * O(V·E) 降到 O(deg(n) + |removable|)。
 */
function candidateEdges(n: TNode, graph: TGraph, incoming: boolean): TEdge[] {
  const re: TEdge[] = []
  const seen = new Set<TEdge>()
  for (const e of incoming ? n.getIncomingEdges() : n.getOutgoingEdges()) {
    if (!seen.has(e)) { seen.add(e); re.push(e) }
  }
  const removed = getProp<TEdge[] | undefined>(graph, P_REMOVABLE_EDGES, undefined)
  if (removed !== undefined) {
    for (const e of removed) {
      const endpoint = incoming ? e.getTarget() : e.getSource()
      if (endpoint !== n && endpoint.id !== n.id) continue
      if (!seen.has(e)) { seen.add(e); re.push(e) }
    }
  }
  return re
}

/**
 * 所有入边 (跨层, 去重, 按 source.x 排序).
 * 去重: Java 用 `toString()` (source,target 标签对), 对不同的边对象等价于按对象身份去重。
 */
export function getAllIncomingEdges(n: TNode, graph: TGraph): TEdge[] {
  const re: TEdge[] = []
  for (const e of candidateEdges(n, graph, true)) {
    if (e.getTarget().id === n.id && getInt(e.getSource(), TREE_LEVEL, 0) !== getInt(e.getTarget(), TREE_LEVEL, 0)) {
      re.push(e)
    }
  }
  re.sort((x, y) => x.getSource().getPosition().x - y.getSource().getPosition().x)
  return re
}

/** 子树节点集合. */
export function getSubtree(n: TNode): TNode[] {
  if (getChildren(n).length === 0) return [n]
  let re: TNode[] = []
  for (const c of getChildren(n)) re = re.concat(getSubtree(c))
  re.push(n)
  return re
}

/** 所有出边 (非 SUPER_ROOT, 跨层, 去重, 按 target.x 排序); 候选集合同 getAllIncomingEdges. */
export function getAllOutgoingEdges(n: TNode, graph: TGraph): TEdge[] {
  const re: TEdge[] = []
  for (const e of candidateEdges(n, graph, false)) {
    if (
      e.getSource().id === n.id
      && !(e.getSource().getLabel() === 'SUPER_ROOT')
      && getInt(e.getSource(), TREE_LEVEL, 0) !== getInt(e.getTarget(), TREE_LEVEL, 0)
    ) {
      re.push(e)
    }
  }
  re.sort((x, y) => x.getTarget().getPosition().x - y.getTarget().getPosition().x)
  return re
}

/** 边的首点 (无弯点 → 目标中心). */
export function getFirstPoint(e: TEdge): KVector {
  if (e.getBendPoints().length === 0) {
    return new KVector(e.getTarget().getPosition().x, e.getTarget().getPosition().y)
  }
  return e.getBendPoints()[0]
}

/** 边的末点 (无弯点 → 源中心). */
export function getLastPoint(e: TEdge): KVector {
  if (e.getBendPoints().length === 0) {
    return new KVector(e.getSource().getPosition().x, e.getSource().getPosition().y)
  }
  return e.getBendPoints()[e.getBendPoints().length - 1]
}

/** 图的布局方向 (从 graph props 读, 导入时 layoutOptions 已复制). */
export function getDirection(g: TGraph): Direction {
  const v = g.props[DIRECTION]
  if (v === undefined || v === null) return Direction.UNDEFINED
  const s = String(v).toUpperCase()
  if (s === 'UP') return Direction.UP
  if (s === 'LEFT') return Direction.LEFT
  if (s === 'RIGHT') return Direction.RIGHT
  if (s === 'DOWN') return Direction.DOWN
  return Direction.UNDEFINED
}

/** 方向向量 (TreeUtil.getDirectionVector). */
export function getDirectionVector(d: Direction): KVector {
  return directionVector(d)
}

/** 节点在方向上的半尺寸. */
export function getNodeSizeInDirection(n: TNode, d: Direction): number {
  if (d === Direction.LEFT) return -n.getSize().x / 2
  if (d === Direction.UP) return -n.getSize().y / 2
  if (d === Direction.RIGHT) return n.getSize().x / 2
  return n.getSize().y / 2
}

/** 节点在方向上的半尺寸向量. */
export function getNodeSizeVectorInDirection(n: TNode, d: Direction): KVector {
  if (d === Direction.LEFT) return new KVector(-n.getSize().x / 2, 0)
  if (d === Direction.UP) return new KVector(0, -n.getSize().y / 2)
  if (d === Direction.RIGHT) return new KVector(n.getSize().x / 2, 0)
  return new KVector(0, n.getSize().y / 2)
}

/** 右转. */
export function turnRight(d: Direction): Direction {
  if (d === Direction.LEFT) return Direction.UP
  if (d === Direction.UP) return Direction.RIGHT
  if (d === Direction.RIGHT) return Direction.DOWN
  return Direction.LEFT
}

/** 左转. */
export function turnLeft(d: Direction): Direction {
  if (d === Direction.RIGHT) return Direction.UP
  if (d === Direction.UP) return Direction.LEFT
  if (d === Direction.LEFT) return Direction.DOWN
  return Direction.RIGHT
}

/** 将 next 沿 center 方向缩放到节点边界. */
export function toNodeBorder(center: KVector, next: KVector, size: KVector): void {
  const wh = size.x / 2
  const hh = size.y / 2
  const absx = Math.abs(next.x - center.x)
  const absy = Math.abs(next.y - center.y)
  let xscale = 1
  let yscale = 1
  if (absx > wh) xscale = wh / absx
  if (absy > hh) yscale = hh / absy
  const scale = Math.min(xscale, yscale)
  center.x += scale * (next.x - center.x)
  center.y += scale * (next.y - center.y)
}

/** 边是否引入环 (沿方向向量投影 ≤ 0). */
export function isCycleInducing(e: TEdge, g: TGraph): boolean {
  const dir = getDirectionVector(getDirection(g))
  return dir.x * (e.getTarget().getPosition().x - e.getSource().getPosition().x)
    + dir.y * (e.getTarget().getPosition().y - e.getSource().getPosition().y) <= 0
}

/** 唯一 long 键 (Java getUniqueLong: a<<32 | b). */
export function getUniqueLong(a: number, b: number): string {
  return `${a}#${b}`
}

/** 最低父节点 (在方向向量上投影最大). */
export function getLowestParent(n: TNode, g: TGraph): TNode | null {
  const dirVec = getDirectionVector(getDirection(g))
  if (n.getIncomingEdges().length === 0) return null
  const sources = n.getIncomingEdges().map((x) => x.getSource())
  const parents = g.getNodes().filter((x) => sources.includes(x))
  if (parents.length === 0) return null
  const proj = (x: TNode): number => {
    const v = new KVector(x.getPosition().x + x.getSize().x / 2, x.getPosition().y + x.getSize().y / 2)
    return v.x * dirVec.x + v.y * dirVec.y
  }
  const lowestParentPos = Math.max(...parents.map(proj))
  return parents.find((x) => proj(x) === lowestParentPos) ?? null
}

/** 最深级别的 leftmost (depth<0 → 最深; depth>1 → 向下 depth 级; 其余当前层). */
export function getLeftMost(currentlevel: Iterable<TNode>, depthParam = -1): TNode | null {
  const level = [...currentlevel]
  let d = depthParam
  if (0 < level.length) {
    if (1 < d) {
      d--
      let nextLevel: TNode[] = []
      for (const cN of level) nextLevel = nextLevel.concat(cN.getChildren())
      return getLeftMost(nextLevel, d)
    }
    if (d < 0) {
      let nextLevel: TNode[] = []
      for (const cN of level) nextLevel = nextLevel.concat(cN.getChildren())
      if (0 < nextLevel.length) {
        return getLeftMost(nextLevel, d)
      }
    }
  }
  return level[0] ?? null
}
