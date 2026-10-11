/**
 * vertiflex 内部属性 (ELK alg.vertiflex InternalProperties).
 *
 * Java 用 ElkNode 上的 IProperty (LEFT_OUTLINE/RIGHT_OUTLINE/OUTLINE_MAX_DEPTH/
 * MIN_X/MAX_X/MIN_Y/MAX_Y/EDGE_BEND_HEIGHT/NODE_MODEL_ORDER) 在阶段间共享状态;
 * TS 用 per-node Map 承载同一语义. 一次布局一个实例 (provider 创建, 阶段间传递).
 */
import type { ElkNode } from '../api/elk-json.js'
import type { OutlineNode } from './p2relative/outline-node.js'

/** 单节点内部属性集合 (Java InternalProperties 各 IProperty 的 TS 形态). */
export interface VertiFlexNodeProps {
  /** Defines the left outline of this subtree. */
  leftOutline?: OutlineNode
  /** Defines the right outline of this subtree. */
  rightOutline?: OutlineNode
  /** 树布局中 outline 的最大深度 (最低点). */
  outlineMaxDepth?: number
  /** 树的画布边界. */
  minX?: number
  maxX?: number
  minY?: number
  maxY?: number
  /** 边的弯点高度 (BendEdgeRouter 用). */
  edgeBendHeight?: number
  /** 节点模型序 (越小越靠前). */
  nodeModelOrder?: number
}

/** 内部属性存取 (Java InternalProperties 静态 Property 键的 per-node 形态). */
export class InternalProperties {
  private props = new Map<ElkNode, VertiFlexNodeProps>()

  private ensure(node: ElkNode): VertiFlexNodeProps {
    let p = this.props.get(node)
    if (p === undefined) { p = {}; this.props.set(node, p) }
    return p
  }

  getLeftOutline(node: ElkNode): OutlineNode | undefined {
    return this.props.get(node)?.leftOutline
  }

  setLeftOutline(node: ElkNode, v: OutlineNode): void {
    this.ensure(node).leftOutline = v
  }

  getRightOutline(node: ElkNode): OutlineNode | undefined {
    return this.props.get(node)?.rightOutline
  }

  setRightOutline(node: ElkNode, v: OutlineNode): void {
    this.ensure(node).rightOutline = v
  }

  getOutlineMaxDepth(node: ElkNode): number | undefined {
    return this.props.get(node)?.outlineMaxDepth
  }

  setOutlineMaxDepth(node: ElkNode, v: number): void {
    this.ensure(node).outlineMaxDepth = v
  }

  getMinX(node: ElkNode): number | undefined {
    return this.props.get(node)?.minX
  }

  setMinX(node: ElkNode, v: number): void {
    this.ensure(node).minX = v
  }

  getMaxX(node: ElkNode): number | undefined {
    return this.props.get(node)?.maxX
  }

  setMaxX(node: ElkNode, v: number): void {
    this.ensure(node).maxX = v
  }

  getMinY(node: ElkNode): number | undefined {
    return this.props.get(node)?.minY
  }

  setMinY(node: ElkNode, v: number): void {
    this.ensure(node).minY = v
  }

  getMaxY(node: ElkNode): number | undefined {
    return this.props.get(node)?.maxY
  }

  setMaxY(node: ElkNode, v: number): void {
    this.ensure(node).maxY = v
  }

  getEdgeBendHeight(node: ElkNode): number | undefined {
    return this.props.get(node)?.edgeBendHeight
  }

  setEdgeBendHeight(node: ElkNode, v: number): void {
    this.ensure(node).edgeBendHeight = v
  }

  getNodeModelOrder(node: ElkNode): number {
    return this.props.get(node)?.nodeModelOrder ?? 0
  }

  setNodeModelOrder(node: ElkNode, v: number): void {
    this.ensure(node).nodeModelOrder = v
  }
}
