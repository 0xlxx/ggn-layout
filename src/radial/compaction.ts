/**
 * compaction — ELK alg.radial.intermediate.compaction
 * (AbstractRadiusExtensionCompaction / IRadialCompactor / RadialCompaction /
 * AnnulusWedgeCompaction / GeneralCompactor).
 *
 * 两种压缩策略: 逐半径收缩 (RadialCompaction) 与逐楔形收缩 (AnnulusWedgeCompaction);
 * 收缩/外扩沿节点与根的连线方向, 步长 compactionStepSize (默认 1).
 */
import type { ElkNode } from '../api/elk-json.js'
import { COMPACTOR, COMPACTION_STEP_SIZE, SORTER, SPACING_NODE_NODE, optStr, optNum, jsonOpt, getGraphProperty, CompactionStrategy, SortingStrategy } from './options.js'
import {
  getSuccessors, getNextLevelNodes, getTreeParent,
} from './radial-util.js'
import type { IRadialSorter } from './sorting.js'
import { createSorter } from './sorting.js'
import { INTERNAL_ROOT_NODE } from './radial-layout.js'

/** 径向压缩器 (Java IRadialCompactor). */
export interface IRadialCompactor {
  compact(graph: ElkNode): void
}

/**
 * 基础逻辑: 同一半径节点沿入边方向收缩/外扩, 重叠检测 (Java AbstractRadiusExtensionCompaction).
 */
export class AbstractRadiusExtensionCompaction {
  /** 收缩步长, 默认 1. */
  protected compactionStep = 1
  /** 重叠检测时考虑的节点间距. */
  protected spacing = 0
  /** 图的根节点. */
  protected root: ElkNode | null = null

  /** 把同一半径的节点沿其入边方向移动 compactionStep (isContracting → 内移, 否则外移). */
  contractLayer(graph: ElkNode, layerNodes: ElkNode[], isContracting: boolean): void {
    for (const node of layerNodes) {
      // node center
      let xPos = (node.x ?? 0) + (node.width ?? 0) / 2
      let yPos = (node.y ?? 0) + (node.height ?? 0) / 2

      const treeParent = this.root!
      const parentX = (treeParent.x ?? 0) + (treeParent.width ?? 0) / 2
      const parentY = (treeParent.y ?? 0) + (treeParent.height ?? 0) / 2

      // vector of edge
      let x = xPos - parentX
      let y = yPos - parentY
      // vector length
      const length = Math.sqrt(x * x + y * y)

      // multiply with normalized vector
      x *= this.compactionStep / length
      y *= this.compactionStep / length

      if (isContracting) {
        xPos -= x
        yPos -= y
      } else {
        xPos += x
        yPos += y
      }

      node.x = xPos - (node.width ?? 0) / 2
      node.y = yPos - (node.height ?? 0) / 2
    }
  }

  /** 把节点沿根连线方向移动 distance (Java moveNode). */
  moveNode(node: ElkNode, distance: number): void {
    // Move child distance into the direction of the connection to the root node
    // We have to measure from center to center since the different nodes might have different sizes.
    const root = this.root!
    const rootX = (root.x ?? 0) + (root.width ?? 0) / 2.0
    const rootY = (root.y ?? 0) + (root.height ?? 0) / 2.0
    const nodeX = (node.x ?? 0) + (node.width ?? 0) / 2.0
    const nodeY = (node.y ?? 0) + (node.height ?? 0) / 2.0
    const differenceX = nodeX - rootX
    const differenceY = nodeY - rootY
    // Calculate unit vector
    const length = Math.sqrt(differenceX * differenceX + differenceY * differenceY)
    const unitX = differenceX / length
    const unitY = differenceY / length
    // Move node by distance in direction of unit vector.
    node.x = (node.x ?? 0) + unitX * distance
    node.y = (node.y ?? 0) + unitY * distance
  }

  /** 两节点是否重叠 (含间距; Java overlap, 原样保留四分支判断). */
  overlap(node1: ElkNode, node2: ElkNode): boolean {
    const x1 = (node1.x ?? 0) - this.spacing / 2
    const x2 = (node2.x ?? 0) - this.spacing / 2
    const y1 = (node1.y ?? 0) - this.spacing / 2
    const y2 = (node2.y ?? 0) - this.spacing / 2

    const width1 = (node1.width ?? 0) + this.spacing
    const width2 = (node2.width ?? 0) + this.spacing
    const height1 = (node1.height ?? 0) + this.spacing
    const height2 = (node2.height ?? 0) + this.spacing

    if ((x1 < x2 + width2 && x2 < x1) && (y1 < y2 + height2 && y2 < y1)) {
      // left upper and right lower corner overlap
      return true
    } else if ((x2 < x1 + width1 && x1 < x2) && (y2 < y1 + height1 && y1 < y2)) {
      // right lower and left upper corner overlap
      return true
    } else if ((x1 < x2 + width2 && x2 < x1) && (y1 < y2 && y2 < y1 + height1)) {
      // left lower and right upper corner overlap
      return true
    } else if ((x2 < x1 + width1 && x1 < x2) && (y1 < y2 + height2 && y2 < y1)) {
      // right upper and left lower corner overlap
      return true
    }
    return false
  }

  /** 同一半径节点 (环状相邻对) 是否重叠 (Java overlapLayer). */
  overlapLayer(nodes: ElkNode[]): boolean {
    let overlapping = false
    if (nodes.length < 2) {
      return false
    }
    for (let i = 0; i < nodes.length; i++) {
      if (i < nodes.length - 1) {
        overlapping ||= this.overlap(nodes[i]!, nodes[i + 1]!)
      } else {
        overlapping ||= this.overlap(nodes[i]!, nodes[0]!)
      }
    }
    return overlapping
  }

  // ── Java getter/setter 等价 (基类字段访问) ──

  getCompactionStep(): number { return this.compactionStep }
  setCompactionStep(step: number): void { this.compactionStep = step }
  getSpacing(): number { return this.spacing }
  setSpacing(spacing: number): void { this.spacing = spacing }
  getRoot(): ElkNode | null { return this.root }
  setRoot(root: ElkNode): void { this.root = root }
}

/**
 * 逐半径压缩 (Java RadialCompaction): 从内半径开始, 每层收缩到出现重叠为止,
 * 撤销最后一步后递归下一层.
 */
export class RadialCompaction extends AbstractRadiusExtensionCompaction implements IRadialCompactor {
  private graph: ElkNode
  /** 排序器 (同一半径节点的顺序). */
  private sorter: IRadialSorter | null = null
  /** 上一层半径值. */
  private lastRadius = 0

  constructor(graph: ElkNode) {
    super()
    this.graph = graph
  }

  compact(graph: ElkNode): void {
    const root = getGraphProperty<ElkNode>(graph, INTERNAL_ROOT_NODE, undefined as unknown as ElkNode)
    this.setRoot(root)
    this.sorter = createSorter(this.graph, optStr(graph, SORTER, SortingStrategy.NONE))
    const stepSize = jsonOpt<number>(graph, COMPACTION_STEP_SIZE)
    if (stepSize !== undefined && stepSize !== null) {
      this.setCompactionStep(Number(stepSize))
    }
    this.setSpacing(optNum(graph, SPACING_NODE_NODE))

    const firstLevelNodes = getSuccessors(this.graph, root)
    if (this.sorter !== null) {
      this.sorter.sort(firstLevelNodes)
    }
    this.contract(firstLevelNodes)
  }

  /** 收缩一个半径, 然后递归下一半径 (Java contract). */
  private contract(nodes: ElkNode[]): void {
    if (nodes.length === 0) return
    let isOverlapping = this.overlapping(nodes)
    let wasContracted = false
    while (!isOverlapping) {
      this.contractLayer(this.graph, nodes, true)
      wasContracted = true
      isOverlapping = this.overlapping(nodes)
    }
    // undo last step
    if (wasContracted) {
      this.contractLayer(this.graph, nodes, false)
    }
    const nextLevelNodes = getNextLevelNodes(this.graph, nodes)
    if (this.sorter !== null) {
      this.sorter.sort(nextLevelNodes)
    }
    this.lastRadius = this.calculateRadius(nodes[0]!)
    this.contract(nextLevelNodes)
  }

  /** 节点左上角到根左上角的距离 (Java calculateRadius, 原样用左上角). */
  private calculateRadius(node: ElkNode): number {
    const xPos = node.x ?? 0
    const yPos = node.y ?? 0

    const root = this.getRoot()!
    const rootX = root.x ?? 0
    const rootY = root.y ?? 0

    const vectorX = xPos - rootX
    const vectorY = yPos - rootY
    return Math.sqrt(vectorX * vectorX + vectorY * vectorY)
  }

  /** 半径内节点重叠, 或与上一层重叠, 或半径已贴近上一层 (Java overlapping). */
  private overlapping(nodes: ElkNode[]): boolean {
    if (this.overlapLayer(nodes)) {
      return true
    }
    for (const node of nodes) {
      const parent = getTreeParent(this.graph, node)
      if (parent !== null && this.overlap(node, parent)) {
        return true
      }

      if (this.calculateRadius(node) - this.getSpacing() <= this.lastRadius) {
        return true
      }
    }
    return false
  }
}

/**
 * 逐楔形压缩 (Java AnnulusWedgeCompaction): 每个楔形 (以根的直接后继划分) 独立收缩
 * 到与相邻楔形轮廓/前驱重叠为止, 做两轮.
 */
export class AnnulusWedgeCompaction extends AbstractRadiusExtensionCompaction implements IRadialCompactor {
  private graph: ElkNode
  /** 每个楔形的左轮廓 (键 = 楔形第一个节点). */
  private leftContour = new Map<ElkNode, ElkNode[]>()
  /** 每个楔形的右轮廓. */
  private rightContour = new Map<ElkNode, ElkNode[]>()
  /** 排序器. */
  private sorter: IRadialSorter | null = null

  constructor(graph: ElkNode) {
    super()
    this.graph = graph
  }

  compact(graph: ElkNode): void {
    // Get values of the graph
    const root = getGraphProperty<ElkNode>(graph, INTERNAL_ROOT_NODE, undefined as unknown as ElkNode)
    this.setRoot(root)
    this.sorter = createSorter(this.graph, optStr(graph, SORTER, SortingStrategy.NONE))
    const stepSize = jsonOpt<number>(graph, COMPACTION_STEP_SIZE)
    if (stepSize !== undefined && stepSize !== null) {
      this.setCompactionStep(Number(stepSize))
    }
    this.setSpacing(optNum(graph, SPACING_NODE_NODE))

    // Calculate the first level nodes
    const successors = getSuccessors(this.graph, root)
    if (this.sorter !== null) {
      this.sorter.sort(successors)
    }
    this.constructContour(successors)

    // contract each wedge; do it two times to assure each node is compacted as much as possible
    for (let k = 0; k < 2; k++) {
      for (let i = 0; i < successors.length; i++) {
        const rightParent = i < successors.length - 1 ? successors[i + 1]! : successors[0]!
        const leftParent = i === 0 ? successors[successors.length - 1]! : successors[i - 1]!

        this.contractWedge(successors[i]!, [root], leftParent, rightParent, [successors[i]!])
      }
    }
  }

  /** 收缩一个楔形: 沿入边内移直到重叠, 撤销一步后递归下一半径 (Java contractWedge). */
  private contractWedge(
    wedgeParent: ElkNode, predecessors: ElkNode[],
    radialPredecessor: ElkNode, radialSuccessor: ElkNode, currentRadiusNodes: ElkNode[],
  ): void {
    let isOverlapping = this.overlapping(predecessors, radialPredecessor, radialSuccessor, currentRadiusNodes)
    let wasContracted = false

    while (!isOverlapping) {
      this.contractLayer(this.graph, currentRadiusNodes, true)
      wasContracted = true
      isOverlapping = this.overlapping(predecessors, radialPredecessor, radialSuccessor, currentRadiusNodes)
    }

    // undo last step
    if (wasContracted) {
      this.contractLayer(this.graph, currentRadiusNodes, false)
    }
    // continue with the nodes from the next radius
    const nextLevelNodes = getNextLevelNodes(this.graph, currentRadiusNodes)
    if (nextLevelNodes.length > 0) {
      if (this.sorter !== null) {
        this.sorter.sort(nextLevelNodes)
      }
      this.contractWedge(wedgeParent, currentRadiusNodes, radialPredecessor, radialSuccessor, nextLevelNodes)
    }
  }

  /** 检测重叠: 与相邻楔形左右轮廓 / 半径内相邻 / 与前驱 (Java overlapping). */
  private overlapping(
    predecessors: ElkNode[], leftParent: ElkNode, rightParent: ElkNode, layerNodes: ElkNode[],
  ): boolean {
    if (this.sorter !== null) {
      this.sorter.sort(layerNodes)
    }
    const firstNode = layerNodes[0]!

    // overlap with left wedge contour
    if (this.contourOverlap(leftParent, firstNode, false)) {
      return true
    }

    // overlap with right wedge contour
    const lastNode = layerNodes[layerNodes.length - 1]!
    if (this.contourOverlap(rightParent, lastNode, true)) {
      return true
    }

    // overlaps on the radius
    if (this.overlapLayer(layerNodes)) {
      return true
    }

    // overlaps with the predecessors
    for (const sortedNode of layerNodes) {
      for (const predecessor of predecessors) {
        if (this.overlap(sortedNode, predecessor)) {
          return true
        }
      }
    }

    return false
  }

  /** 节点是否与相邻楔形轮廓重叠 (Java contourOverlap). */
  private contourOverlap(neighbourWedgeParent: ElkNode, node: ElkNode, left: boolean): boolean {
    const contour = left ? this.leftContour.get(neighbourWedgeParent) : this.rightContour.get(neighbourWedgeParent)
    if (contour === undefined) return false
    for (const contourNode of contour) {
      if (this.overlap(node, contourNode)) {
        return true
      }
    }
    return false
  }

  /** 构造每个第一层节点的左右轮廓 (Java constructContour). */
  private constructContour(nodes: ElkNode[]): void {
    for (const node of nodes) {
      this.leftContour.set(node, [node])
      this.rightContour.set(node, [node])

      let successors = getSuccessors(this.graph, node)
      if (successors.length > 0) {
        if (this.sorter !== null) {
          this.sorter.sort(successors)
        }
        this.leftContour.get(node)!.push(successors[0]!)
        this.rightContour.get(node)!.push(successors[successors.length - 1]!)

        while (getNextLevelNodes(this.graph, successors).length > 0) {
          successors = getNextLevelNodes(this.graph, successors)
          if (this.sorter !== null) {
            this.sorter.sort(successors)
          }
          this.leftContour.get(node)!.push(successors[0]!)
          this.rightContour.get(node)!.push(successors[successors.length - 1]!)
        }
      }
    }
  }
}

/** 压缩布局处理器 (Java GeneralCompactor.process). */
export function generalCompactor(graph: ElkNode): void {
  const compactor = createCompactor(graph, optStr(graph, COMPACTOR, CompactionStrategy.NONE))
  compactor.compact(graph)
}

/** 压缩器工厂 (Java CompactionStrategy.create; NONE → 不调用). */
export function createCompactor(graph: ElkNode, strategy: CompactionStrategy): IRadialCompactor {
  switch (strategy) {
    case CompactionStrategy.RADIAL_COMPACTION:
      return new RadialCompaction(graph)
    case CompactionStrategy.WEDGE_COMPACTION:
      return new AnnulusWedgeCompaction(graph)
    default:
      throw new Error(`No implementation is available for the layout option ${strategy}`)
  }
}
