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
 * P2 相对水平放置 (ELK alg.vertiflex p2relative.RelativeXPlacer).
 *
 * 用相对父节点的坐标放置节点 (P3 再转绝对):
 * - STRAIGHT: 子树按 outline 间距压实, 子节点排列成半圆使直线边不重叠
 *   (考虑模型序时按高度分组左/右分摊, 否则按宽度 V 形分摊);
 * - BEND: 保持模型序完全不变, 计算边弯点高度 (EDGE_BEND_HEIGHT) 使带弯点
 *   的边路由仍无重叠.
 *
 * outline: 每个节点 4 点链 (上缘/底缘), 兄弟子树 outline 合并到第一个子树
 * (bundleChildren 双向补全). OUTLINE_MAX_DEPTH = outline 最底点 y.
 * splitGroup 保持 Java 0.12.0 原样 (含无 i++ 的 while, 行为经 jar 差分验证).
 */
import type { ElkNode } from '../../api/elk-json.js'
import { InternalProperties } from '../internal-properties.js'
import {
  CONSIDER_NODE_MODEL_ORDER, LAYOUT_STRATEGY, SPACING_NODE_NODE,
  EdgeRoutingStrategy, optBool, optMargins, optNum, optStr,
} from '../options.js'
import { nodeX, outgoingEdges, targetOf } from '../vertiflex-util.js'
import { NodeComparator } from './node-comparator.js'
import { OutlineNode } from './outline-node.js'

// 把所有 outline 移动到最小 y 位置的常量
const MINIMAL_Y = -100.0

/** 可变 Pair<Double, Double> (Java org.eclipse.elk.core.util.Pair). */
type Pair = { first: number; second: number }

/**
 * RelativeXPlacer.process(graph).
 * @param graph 算法所在节点 (树容器).
 * @param root  树的根节点 (InternalProperties.ROOT_NODE).
 */
export function relativeXPlacer(graph: ElkNode, root: ElkNode, props: InternalProperties): void {
  const spacingNodeNode = optNum(graph, SPACING_NODE_NODE, 20)
  const considerNodeModelOrder = optBool(graph, CONSIDER_NODE_MODEL_ORDER, true)

  if ((graph.children ?? []).length > 0) {
    const strategy = optStr<EdgeRoutingStrategy>(graph, LAYOUT_STRATEGY, EdgeRoutingStrategy.STRAIGHT)
    switch (strategy) {
      case EdgeRoutingStrategy.STRAIGHT:
        recursiveStraightlinePlacement(graph, root, props, spacingNodeNode, considerNodeModelOrder)
        break
      case EdgeRoutingStrategy.BEND:
        recursiveBentlinePlacement(graph, root, props, spacingNodeNode)
        break
      default:
        break
    }
  }
}

/** 计算两个 outline 之间的距离 (outlineDistance). */
function outlineDistance(outline1: OutlineNode, outline2: OutlineNode): number {
  const changedOutline1 = new OutlineNode(outline1.getRelativeX(), MINIMAL_Y,
    new OutlineNode(0.0, outline1.getAbsoluteY(), outline1.getNext()))
  const changedOutline2 = new OutlineNode(outline2.getRelativeX(), MINIMAL_Y,
    new OutlineNode(0.0, outline2.getAbsoluteY(), outline2.getNext()))

  // 返回值
  let dist = changedOutline1.getRelativeX() - changedOutline2.getRelativeX()

  let o1: OutlineNode | null
  let o2: OutlineNode | null
  let x1: number
  let x2: number
  let deltaX: number
  let deltaY: number
  let newdist: number

  // 第一遍 (o1 的点与 o2 比较). 循环条件 !o2.isLast() 保证 else 分支的
  // o2.getNext() 非空 (Java 同语义, 无空检查); o1 链可能耗尽 (null).
  o1 = changedOutline1
  o2 = changedOutline2
  x1 = o1.getRelativeX()
  x2 = o2.getRelativeX()
  while (o1 !== null && !o2.isLast()) {
    const o2n = o2.getNext()!
    if (o2n.getAbsoluteY() > o1.getAbsoluteY()) {
      // 现在比较
      deltaX = o2n.getRelativeX()
      deltaY = o2n.getAbsoluteY() - o2.getAbsoluteY()
      newdist = x1 - x2 - ((o1.getAbsoluteY() - o2.getAbsoluteY()) * deltaX) / deltaY

      dist = Math.max(dist, newdist)

      // 现在移动 o1
      o1 = o1.getNext()
      if (o1 !== null) {
        x1 += o1.getRelativeX()
      }
    } else {
      o2 = o2.getNext()!
      x2 += o2.getRelativeX()
    }
  }

  // 第二遍 (o2 的点与 o1 比较). 循环条件 !o1.isLast() 保证 else 分支的
  // o1.getNext() 非空; o2 链可能耗尽 (null).
  o1 = changedOutline1
  o2 = changedOutline2
  x1 = o1.getRelativeX()
  x2 = o2.getRelativeX()
  while (o2 !== null && !o1.isLast()) {
    const o1n = o1.getNext()!
    if (o1n.getAbsoluteY() > o2.getAbsoluteY()) {
      // 现在比较
      deltaX = o1n.getRelativeX()
      deltaY = o1n.getAbsoluteY() - o1.getAbsoluteY()
      newdist = x1 - x2 + ((o2.getAbsoluteY() - o1.getAbsoluteY()) * deltaX) / deltaY

      dist = Math.max(dist, newdist)

      // 现在移动 o2
      o2 = o2.getNext()!
      if (o2 !== null) {
        x2 += o2.getRelativeX()
      }
    } else {
      o1 = o1.getNext()!
      x1 += o1.getRelativeX()
    }
  }

  return dist
}

/**
 * 递归计算一个节点及其子节点的布局 (直线路由变体).
 * 子节点排列成半圆, 保证父到子的直线边可画且互不重叠.
 */
function recursiveStraightlinePlacement(
  graph: ElkNode,
  root: ElkNode,
  props: InternalProperties,
  spacingNodeNode: number,
  considerNodeModelOrder: boolean,
): void {
  makeSimpleOutlines(root, props, spacingNodeNode)

  if (outgoingEdges(graph, root).length > 0) {
    // 取全部子节点
    const children: ElkNode[] = []
    for (const edge of outgoingEdges(graph, root)) {
      const child = targetOf(graph, edge)
      recursiveStraightlinePlacement(graph, child, props, spacingNodeNode, considerNodeModelOrder)
      children.push(child)
    }
    // 现在子节点排序成半圆. 直线边无重叠路由, 布局相对紧凑.
    sortSubTrees(children, props, considerNodeModelOrder)

    // 现在用 outline 把子节点压在一起
    for (let i = 0; i < children.length - 1; i++) {
      bundleChildren(children[0]!, children[i]!, children[i + 1]!, props)
    }

    // 现在把根移到节点中间. 计算 y 最低的子节点点避免重叠;
    // 若有多个最低子节点, 根放在它们中间.
    let pos = 0
    let maxDepth = 0.0
    let maxDepthStartPos = 0
    while (pos < children.length && (children[pos]!.y ?? 0) >= maxDepth) {
      if ((children[pos]!.y ?? 0) > maxDepth) {
        maxDepthStartPos = pos
        maxDepth = children[pos]!.y ?? 0
      }
      pos += 1
    }
    let moveRoot = 0.0
    if (pos > 0) {
      moveRoot = (nodeX(children[maxDepthStartPos]!) + nodeX(children[pos - 1]!)
        + (children[pos - 1]!.width ?? 0)) / 2.0
        - nodeX(root) - (root.width ?? 0) / 2.0
    }

    // 注意: 此读取自根节点自身 (Java 从子树根读 CONSIDER_NODE_MODEL_ORDER,
    // 与 process() 从容器读的字段是两处独立读取).
    if (!optBool(root, CONSIDER_NODE_MODEL_ORDER, true)) {
      let betterMoveRoot = (nodeX(children[0]!) + nodeX(children[children.length - 1]!)
        + (children[children.length - 1]!.width ?? 0) - (root.width ?? 0)) / 2.0 - nodeX(root)
      let newMoveRoot: number

      if (betterMoveRoot < moveRoot) {
        let rightOutline: OutlineNode | undefined
        let rightOutlineX: number
        let posX: number
        for (let i = 0; i < maxDepthStartPos; i++) {
          for (let j = i + 1; j < maxDepthStartPos + 1; j++) {
            rightOutline = props.getRightOutline(children[i]!)
            rightOutlineX = nodeX(children[i]!) + rightOutline!.getRelativeX()
            posX = nodeX(children[j]!) + (children[j]!.width ?? 0) / 2.0
            while (rightOutline !== undefined && rightOutline.getAbsoluteY() < maxDepth) {
              newMoveRoot = posX - (root.width ?? 0) / 2.0 + (posX - rightOutlineX) * (((root.y ?? 0)
                + (root.height ?? 0)) - maxDepth) / (maxDepth - rightOutline.getAbsoluteY())
              betterMoveRoot = Math.max(betterMoveRoot, newMoveRoot)

              rightOutline = rightOutline.getNext() ?? undefined
              if (rightOutline !== undefined) {
                rightOutlineX += rightOutline.getRelativeX()
              }
            }
          }
        }
        moveRoot = betterMoveRoot
      }

      if (betterMoveRoot > moveRoot) {
        let leftOutline: OutlineNode | undefined
        let leftOutlineX: number
        let posX: number
        for (let i = pos; i < children.length; i++) {
          for (let j = pos - 1; j < i; j++) {
            leftOutline = props.getLeftOutline(children[i]!)
            leftOutlineX = nodeX(children[i]!) + leftOutline!.getRelativeX()
            posX = nodeX(children[j]!) + (children[j]!.width ?? 0) / 2.0
            while (leftOutline !== undefined && leftOutline.getAbsoluteY() < maxDepth) {
              newMoveRoot = posX - (root.width ?? 0) / 2.0 + (posX - leftOutlineX) * (((root.y ?? 0)
                + (root.height ?? 0)) - maxDepth) / (maxDepth - leftOutline.getAbsoluteY())
              betterMoveRoot = Math.min(betterMoveRoot, newMoveRoot)

              leftOutline = leftOutline.getNext() ?? undefined
              if (leftOutline !== undefined) {
                leftOutlineX += leftOutline.getRelativeX()
              }
            }
          }
        }
        moveRoot = betterMoveRoot
      }
    }

    for (const child of children) {
      child.x = nodeX(child) - moveRoot
    }

    // 左 outline 更新
    const graphLeftOutline = props.getLeftOutline(root)!
    const leftChildOutline = props.getLeftOutline(children[0]!)!

    let newX = nodeX(children[0]!) + leftChildOutline.getRelativeX() - graphLeftOutline.getRelativeX()
    graphLeftOutline.getNext()!.getNext()!.getNext()!.setNext(
      new OutlineNode(newX, leftChildOutline.getAbsoluteY(), leftChildOutline.getNext()))

    // 右 outline 更新
    const graphRightOutline = props.getRightOutline(root)!
    const rightChildOutline = props.getRightOutline(children[children.length - 1]!)!

    newX = nodeX(children[children.length - 1]!) + rightChildOutline.getRelativeX()
      - graphRightOutline.getRelativeX()
    graphRightOutline.getNext()!.getNext()!.getNext()!.setNext(
      new OutlineNode(newX, rightChildOutline.getAbsoluteY(), rightChildOutline.getNext()))

    // 更新 outlineMaxY / min 与 max x、y
    for (const child of children) {
      props.setOutlineMaxDepth(root, Math.max(props.getOutlineMaxDepth(root) ?? 0,
        props.getOutlineMaxDepth(child) ?? 0))
      props.setMinX(root, Math.min(props.getMinX(root) ?? 0, nodeX(child) + (props.getMinX(child) ?? 0)))
      props.setMaxX(root, Math.max(props.getMaxX(root) ?? 0, nodeX(child) + (props.getMaxX(child) ?? 0)))
    }
    props.setMaxY(root, props.getOutlineMaxDepth(root) ?? 0)
  }
}

/**
 * 保持模型序放置节点并计算后续边的弯点 (BEND 变体).
 * 模型序完全保留, 为边计算弯点使无重叠路由仍可能.
 */
function recursiveBentlinePlacement(
  graph: ElkNode,
  root: ElkNode,
  props: InternalProperties,
  spacingNodeNode: number,
): void {
  // 为所有节点建立初始 outline
  makeSimpleOutlines(root, props, spacingNodeNode)

  // 递归终止条件: 节点有子节点则继续
  if (outgoingEdges(graph, root).length > 0) {
    // 取全部子节点
    const children: ElkNode[] = []
    for (const edge of outgoingEdges(graph, root)) {
      const child = targetOf(graph, edge)
      recursiveBentlinePlacement(graph, child, props, spacingNodeNode)
      children.push(child)
    }

    const childrenSize = children.length

    // 现在用 outline 把子节点压在一起
    for (let i = 0; i < children.length - 1; i++) {
      bundleChildren(children[0]!, children[i]!, children[i + 1]!, props)
    }

    const moveRoot = (nodeX(children[0]!) + (children[0]!.width ?? 0) / 2.0
      + nodeX(children[children.length - 1]!) + (children[children.length - 1]!.width ?? 0) / 2.0
      - (root.width ?? 0)) / 2.0 - nodeX(root)

    for (const child of children) {
      child.x = nodeX(child) - moveRoot
      props.setEdgeBendHeight(child, props.getLeftOutline(child)!.getAbsoluteY())
    }

    // 设置父节点右侧子节点的弯点高度
    let i = 0
    while (i < childrenSize - 1 && nodeX(children[i]!) + (children[i]!.width ?? 0)
      + optMargins(children[i]!).right - (root.width ?? 0) / 2.0 <= 0.0) {
      i++
    }

    let globalBendHeight = props.getEdgeBendHeight(children[i]!)!
    for (let a = 0; a < childrenSize; a++) {
      if (globalBendHeight < props.getEdgeBendHeight(children[a]!)!) {
        props.setEdgeBendHeight(children[a]!, globalBendHeight)
      } else {
        globalBendHeight = props.getEdgeBendHeight(children[a]!)!
      }
    }

    // 设置父节点左侧子节点的弯点高度
    i = childrenSize - 1
    while (i > 0 && nodeX(children[i]!) - optMargins(children[i]!).left
      - (root.width ?? 0) / 2.0 >= 0.0) {
      i--
    }

    if (i < childrenSize) {
      for (let a = i; a >= 0; a--) {
        if (globalBendHeight < props.getEdgeBendHeight(children[a]!)!) {
          props.setEdgeBendHeight(children[a]!, globalBendHeight)
        } else {
          globalBendHeight = props.getEdgeBendHeight(children[a]!)!
        }
      }
    }

    let newX: number
    let newOutlinepart: OutlineNode
    // 左 outline 更新
    const leftChildOutline = props.getLeftOutline(children[0]!)!
    const graphLeftOutline = props.getLeftOutline(root)!

    newX = nodeX(children[0]!) + leftChildOutline.getRelativeX() - graphLeftOutline.getRelativeX()
    newOutlinepart = new OutlineNode(0.0, leftChildOutline.getAbsoluteY(), leftChildOutline.getNext())
    graphLeftOutline.getNext()!.getNext()!.getNext()!.setNext(
      new OutlineNode(newX, props.getEdgeBendHeight(children[0]!)!, newOutlinepart))

    // 右 outline 更新
    const graphRightOutline = props.getRightOutline(root)!
    const rightChildOutline = props.getRightOutline(children[childrenSize - 1]!)!

    newX = nodeX(children[childrenSize - 1]!) + rightChildOutline.getRelativeX()
      - graphRightOutline.getRelativeX()
    newOutlinepart = new OutlineNode(0.0, rightChildOutline.getAbsoluteY(), rightChildOutline.getNext())
    graphRightOutline.getNext()!.getNext()!.getNext()!.setNext(
      new OutlineNode(newX, props.getEdgeBendHeight(children[childrenSize - 1]!)!, newOutlinepart))

    // 更新 outlineMaxY / min 与 max x、y
    for (const child of children) {
      props.setOutlineMaxDepth(root, Math.max(props.getOutlineMaxDepth(root) ?? 0,
        props.getOutlineMaxDepth(child) ?? 0))
      props.setMinX(root, Math.min(props.getMinX(root) ?? 0, nodeX(child) + (props.getMinX(child) ?? 0)))
      props.setMaxX(root, Math.max(props.getMaxX(root) ?? 0, nodeX(child) + (props.getMaxX(child) ?? 0)))
    }
    props.setMaxY(root, props.getOutlineMaxDepth(root) ?? 0)
  }
}

/** 把子树排序成半圆 (sortSubTrees). */
function sortSubTrees(children: ElkNode[], props: InternalProperties, considerNodeModelOrder: boolean): void {
  // 首先按子树根 y 坐标排序 (稳定排序, 同 Java TimSort)
  children.sort((a, b) => new NodeComparator(false).compare(a, b, props))

  const a: ElkNode[] = []
  const b: ElkNode[] = []

  if (considerNodeModelOrder) {
    splitNodesWithModelOrder(children, a, b, props)
  } else {
    // 现在把它们排成 V 形; 最深的元素不参与宽度计算
    a.push(children[children.length - 1]!)
    let widthA = 0.0
    let widthB = 0.0
    for (let i = 1; i < children.length; i++) {
      if (widthA <= widthB) {
        a.push(children[children.length - 1 - i]!)
        widthA += children[children.length - 1 - i]!.width ?? 0
      } else {
        b.push(children[children.length - 1 - i]!)
        widthB += children[children.length - 1 - i]!.width ?? 0
      }
    }
    a.reverse()
  }

  b.sort((x, y) => new NodeComparator(true).compare(x, y, props))
  a.push(...b)
  for (let i = 0; i < children.length; i++) {
    children[i] = a[i]!
  }
}

/**
 * 把节点按高度拆成两组, 同高节点保持合理模型序 (splitNodesWithModelOrder).
 * 保持 Java 0.12.0 原样 (size 1/2 分支不 return 的落空 + 组逻辑; 多余元素
 * 由 sortSubTrees 最终拷贝丢弃).
 */
function splitNodesWithModelOrder(original: ElkNode[], left: ElkNode[], right: ElkNode[], props: InternalProperties): void {
  // 识别下一子组 (全部同 y); 在加权中点拆分 (前半加入左组, 后半加入右组)
  if (original.length === 0) {
    return
  }
  if (original.length === 1) {
    left.push(original[0]!)
  }
  if (original.length === 2) {
    // 用模型序决定哪个节点进入哪组, 与高度排序无关
    const first = original[0]!
    const second = original[1]!

    if (props.getNodeModelOrder(first) > props.getNodeModelOrder(second)) {
      left.push(second)
      right.push(first)
    } else {
      left.push(first)
      right.push(second)
    }
  }

  let currentGroup: ElkNode[] = []
  const widthLeftRight: Pair = { first: 0.0, second: 0.0 }
  let current = original[0]!
  currentGroup.push(current)
  for (let i = 1; i < original.length; i++) {
    const next = original[i]!
    if ((current.y ?? 0) === (next.y ?? 0)) {
      // 下一个节点与前一个同高, 加入当前组
      currentGroup.push(next)
    } else {
      // 拆分并整组加入
      const finalIndexOfLeft = splitGroup(currentGroup, widthLeftRight)
      left.push(...currentGroup.slice(0, finalIndexOfLeft + 1))
      right.push(...currentGroup.slice(finalIndexOfLeft + 1))

      // 重置组
      currentGroup = []
      currentGroup.push(next)
    }
    current = next

    // 若 next 是最后一个元素, 现在拆分并加入当前组
    if (i === original.length - 1) {
      const finalIndexOfLeft = splitGroup(currentGroup, widthLeftRight)
      left.push(...currentGroup.slice(0, finalIndexOfLeft + 1))
      right.push(...currentGroup.slice(finalIndexOfLeft + 1))
    }
  }
}

/**
 * 按左右两组当前宽度找到合理的组拆分点 (splitGroup).
 * @param group 待拆分元素组.
 * @param widthLeftRight 左右组当前宽度.
 * @return 组拆分位置下标.
 */
function splitGroup(group: ElkNode[], widthLeftRight: Pair): number {
  if (group.length === 1) {
    return 0
  } else {
    const widthLeft = widthLeftRight.first
    const widthRight = widthLeftRight.second

    let totalNewWidth = 0
    for (const node of group) {
      totalNewWidth += node.width ?? 0
    }

    // 线性方程求左右组相等长度的期望宽度
    //  I: a + x = b + y
    // II: x + y = t
    // 其中 a、b 是 widthLeft 和 widthRight, x、y 是左右组期望增量, t 是 totalNewWidth
    // 解: x = (t-a+b)/2, y = t - (t-a+b)/2

    const desiredLeft = (totalNewWidth - widthLeft + widthRight) / 2

    // 向左侧加节点直到超过 desiredLeft
    // 移除最后一个元素并比较两个解, 取更接近期望解的一个
    // (注意: Java 0.12.0 此 while 无 i++, 行为 bug 级保留, jar 差分实证)
    let i = 0
    let newLeftWidth = 0
    while (desiredLeft < newLeftWidth && i < group.length) {
      newLeftWidth += group[i]!.width ?? 0
    }

    const exceed = newLeftWidth - desiredLeft
    const under = desiredLeft - (newLeftWidth - (group[i]!.width ?? 0))

    let resultIndex: number
    if (exceed > under) {
      resultIndex = i
    } else {
      resultIndex = i - 1
    }

    // 把新宽度加入累计宽度
    widthLeftRight.first = widthLeft + exceed
    let newRightWidth = 0
    for (let j = resultIndex + 1; j < group.length; j++) {
      newRightWidth += group[j]!.width ?? 0
    }
    widthLeftRight.second = widthRight + newRightWidth

    return resultIndex
  }
}

/** 创建节点周围的初始 outline (makeSimpleOutlines). */
function makeSimpleOutlines(node: ElkNode, props: InternalProperties, spacingNodeNode: number): void {
  const margins = optMargins(node)

  // 设置左右 outline 属性
  let endpart: OutlineNode
  endpart = new OutlineNode(0.0, (node.y ?? 0) + (node.height ?? 0) + margins.bottom + spacingNodeNode / 2,
    new OutlineNode((node.width ?? 0) / 2.0,
      (node.y ?? 0) + (node.height ?? 0) + margins.bottom + spacingNodeNode / 2, null))

  props.setLeftOutline(node, new OutlineNode((-margins.left - spacingNodeNode / 2)
    + (node.width ?? 0) / 2.0, (node.y ?? 0) - margins.top - spacingNodeNode / 2,
    new OutlineNode(-(node.width ?? 0) / 2.0, (node.y ?? 0) - margins.top, endpart)))

  endpart = new OutlineNode(0.0, (node.y ?? 0) + (node.height ?? 0) + margins.bottom,
    new OutlineNode(-(node.width ?? 0) / 2.0,
      (node.y ?? 0) + (node.height ?? 0) + margins.bottom + spacingNodeNode / 2, null))

  props.setRightOutline(node, new OutlineNode((node.width ?? 0) / 2.0
    + margins.right + spacingNodeNode / 2, (node.y ?? 0) - margins.top,
    new OutlineNode((node.width ?? 0) / 2.0, (node.y ?? 0) - margins.top - spacingNodeNode / 2, endpart)))

  // 设置 min 与 max 值
  props.setMinX(node, (node.x ?? 0) - margins.left)
  props.setMaxX(node, (node.x ?? 0) + margins.right + (node.width ?? 0))
  props.setMinY(node, (node.y ?? 0) - margins.top)
  props.setMaxY(node, (node.y ?? 0) + margins.bottom + (node.height ?? 0))
  props.setOutlineMaxDepth(node, props.getLeftOutline(node)!.getNext()!.getNext()!.getAbsoluteY())
}

/**
 * 组合多个兄弟节点的 outline 成为它们所属树的 outline (bundleChildren).
 */
function bundleChildren(
  leftSubtree: ElkNode,
  a: ElkNode,
  b: ElkNode,
  props: InternalProperties,
): void {
  let deltaX: number
  let deltaY: number
  let change: number

  // 计算两部分之间的距离
  const dist = outlineDistance(props.getRightOutline(a)!, props.getLeftOutline(b)!)
  b.x = nodeX(a) + dist

  // 增强左 outline
  if ((props.getOutlineMaxDepth(leftSubtree) ?? 0) < (props.getOutlineMaxDepth(b) ?? 0)) {
    let lastL = props.getLeftOutline(leftSubtree)!
    let lAbsX = lastL.getRelativeX() + nodeX(leftSubtree)

    // 移到 leftSubtree 的末尾
    while (!lastL.isLast()) {
      lastL = lastL.getNext()!
      lAbsX += lastL.getRelativeX()
    }
    // 在 b 的左 outline 中找到合适位置
    let bItterator = new OutlineNode(props.getLeftOutline(b)!.getRelativeX(),
      MINIMAL_Y, props.getLeftOutline(b)!.getNext())
    let rAbsX = bItterator.getRelativeX() + nodeX(b)
    while (bItterator.getNext()!.getAbsoluteY() <= lastL.getAbsoluteY()) {
      bItterator = bItterator.getNext()!
      rAbsX += bItterator.getRelativeX()
    }
    // 现在计算变化量
    deltaX = bItterator.getNext()!.getRelativeX()
    deltaY = bItterator.getNext()!.getAbsoluteY() - bItterator.getAbsoluteY()
    change = ((lastL.getAbsoluteY() - bItterator.getAbsoluteY()) * deltaX) / deltaY

    // 现在计算新点
    const newX = -lAbsX + rAbsX + change
    const newNext = new OutlineNode(bItterator.getNext()!.getRelativeX() - change, bItterator.getNext()!
      .getAbsoluteY(), bItterator.getNext()!.getNext())
    lastL.setNext(new OutlineNode(newX, lastL.getAbsoluteY(), newNext))

    // 现在更新 outline_max_depth
    props.setOutlineMaxDepth(leftSubtree, props.getOutlineMaxDepth(b) ?? 0)
  }

  // 增强右 outline
  if ((props.getOutlineMaxDepth(b) ?? 0) < (props.getOutlineMaxDepth(a) ?? 0)) {
    let lastB = props.getRightOutline(b)!
    let rAbsX = lastB.getRelativeX() + nodeX(b)

    // 移到 b 的末尾
    while (!lastB.isLast()) {
      lastB = lastB.getNext()!
      rAbsX += lastB.getRelativeX()
    }
    // 在 a 的右 outline 中找到合适位置
    let aItterator = new OutlineNode(props.getRightOutline(a)!.getRelativeX(),
      MINIMAL_Y, props.getRightOutline(a)!.getNext())
    let aAbsX = aItterator.getRelativeX() + nodeX(a)
    while (aItterator.getNext()!.getAbsoluteY() <= lastB.getAbsoluteY()) {
      aItterator = aItterator.getNext()!
      aAbsX += aItterator.getRelativeX()
    }
    // 现在计算变化量
    deltaX = aItterator.getNext()!.getRelativeX()
    deltaY = aItterator.getNext()!.getAbsoluteY() - aItterator.getAbsoluteY()
    change = ((lastB.getAbsoluteY() - aItterator.getAbsoluteY()) * deltaX) / deltaY

    // 现在计算新点
    const newX = aAbsX - rAbsX + change
    const newNext = new OutlineNode(aItterator.getNext()!.getRelativeX() - change,
      aItterator.getNext()!.getAbsoluteY(), aItterator.getNext()!.getNext())
    lastB.setNext(new OutlineNode(newX, lastB.getAbsoluteY(), newNext))
    // 现在更新 outline_max_depth
    props.setOutlineMaxDepth(b, props.getOutlineMaxDepth(a) ?? 0)
  }
}
