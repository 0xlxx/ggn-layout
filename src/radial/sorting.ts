/**
 * sorting — ELK alg.radial.sorting (IRadialSorter / IDSorter / PolarCoordinateSorter).
 *
 * 排序依赖的 ORDER_ID 通过图属性内存存储 (Java setProperty 写图对象, 不导出 JSON);
 * 显式 layoutOptions 的 orderId 优先 (Java getProperty 语义).
 */
import type { ElkNode } from '../api/elk-json.js'
import { ORDER_ID, SortingStrategy, optNum, setGraphProperty } from './options.js'
import {
  getSuccessors, findRootOfNode, createPolarComparator, TWO_PI,
} from './radial-util.js'

/** 同一半径节点排序器 (Java IRadialSorter). */
export interface IRadialSorter {
  sort(nodes: ElkNode[]): void
  initialize(root: ElkNode): void
}

/**
 * 按 ORDER_ID 排序 (Java IDSorter).
 */
export class IDSorter implements IRadialSorter {
  sort(nodes: ElkNode[]): void {
    nodes.sort((node1, node2) => {
      const orderID1 = optNum(node1, ORDER_ID)
      const orderID2 = optNum(node2, ORDER_ID)
      return orderID1 - orderID2
    })
  }

  initialize(_root: ElkNode): void {
    // nothing to do here
  }
}

const DEGREE_45 = 0.25 * Math.PI
const DEGREE_90 = 0.5 * Math.PI
const DEGREE_135 = 0.75 * Math.PI
const DEGREE_225 = 1.25 * Math.PI
const DEGREE_270 = 1.5 * Math.PI
const DEGREE_315 = 1.75 * Math.PI

/**
 * 极坐标排序器 (Java PolarCoordinateSorter): 按相对父的极坐标排序;
 * 初始化时给整棵树分配 ORDER_ID, 之后按 ID 排序.
 */
export class PolarCoordinateSorter implements IRadialSorter {
  private compRight = createPolarComparator(0, 0)
  private compLeft = createPolarComparator(Math.PI, 0)
  private compTop = createPolarComparator(DEGREE_270, 0)
  private compBottom = createPolarComparator(DEGREE_90, 0)
  private idSorter: IDSorter | null = null
  /** 布局图 (idSorter 排序需要从节点反查图). */
  private graph: ElkNode | null = null

  constructor(graph: ElkNode) {
    this.graph = graph
  }

  /** 初始化: 第一层按极坐标排序后递归分配 ORDER_ID (Java initialize). */
  initialize(root: ElkNode): void {
    this.idSorter = new IDSorter()
    const successors = getSuccessors(this.graph!, root)
    // 排序从 0 度 (圆右侧) 开始
    successors.sort(this.compRight)
    this.setIDForNodes(successors, 0)
  }

  /** 递归分配 ORDER_ID (Java setIDForNodes), 返回下一层起始 id. */
  private setIDForNodes(nodes: ElkNode[], idOffset: number): number {
    let id = idOffset
    let nextLayerId = 0
    for (const node of nodes) {
      setGraphProperty(node, ORDER_ID, id++)
      const nodeSuccessors = getSuccessors(this.graph!, node)
      let arc = Math.atan2((node.y ?? 0) + (node.height ?? 0) / 2, (node.x ?? 0) + (node.width ?? 0) / 2)
      arc += arc < 0 ? TWO_PI : 0

      // node is right of parent node
      if (arc < DEGREE_45 || arc > DEGREE_315) {
        nodeSuccessors.sort(this.compLeft)
      } else if (arc <= DEGREE_315 && arc > DEGREE_225) { // node is below parent node
        nodeSuccessors.sort(this.compTop)
      } else if (arc <= DEGREE_225 && arc > DEGREE_135) { // node is left
        nodeSuccessors.sort(this.compRight)
      } else if (arc <= DEGREE_135) { // node is top
        nodeSuccessors.sort(this.compBottom)
      }

      nextLayerId = this.setIDForNodes(nodeSuccessors, nextLayerId)
    }
    return id
  }

  sort(nodes: ElkNode[]): void {
    if (nodes.length === 0) return
    if (this.idSorter === null) {
      const root = findRootOfNode(this.graph!, nodes[0]!)
      this.initialize(root)
    }
    this.idSorter!.sort(nodes)
  }
}

/** 排序器工厂 (Java SortingStrategy.create). */
export function createSorter(graph: ElkNode, strategy: SortingStrategy): IRadialSorter | null {
  switch (strategy) {
    case SortingStrategy.NONE:
      return null
    case SortingStrategy.POLAR_COORDINATE:
      return new PolarCoordinateSorter(graph)
    case SortingStrategy.ID:
      return new IDSorter()
    default:
      throw new Error(`No implementation is available for the layout option ${strategy}`)
  }
}
