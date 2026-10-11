/**
 * MinWidthLayerer (对应 ELK p2layers.MinWidthLayerer) — 1:1 移植.
 *
 * Nikolov/Tarassov/Branke 最小宽度分层启发式 (考虑 dummy 节点):
 * 在最长路径 (最小高度) 分层的基础上, 同时考虑图宽度, 并以实际节点尺寸
 * 归一化宽度. 自环允许 (会被过滤).
 *
 * Precondition: 图无环, 可含自环.
 * Postcondition: 所有节点已分层, 边只连接层号递增的节点.
 */
import type { LGraph } from '../graph/lgraph.js'
import type { LNode } from '../graph/lnode.js'
import type { LEdge } from '../graph/ledge.js'
import { Layer } from '../graph/layer.js'
import { NodeType } from '../graph/enums.js'
import {
  LAYERING_MIN_WIDTH_UPPER_BOUND_ON_WIDTH,
  LAYERING_MIN_WIDTH_UPPER_LAYER_ESTIMATION_SCALING_FACTOR,
  SPACING_EDGE_EDGE,
} from '../options/layered-options.js'
import type { IElkProgressMonitor } from '../layered-layout-provider.js'

export class MinWidthLayerer {
  private static readonly UPPERBOUND_ON_WIDTH_RANGE = { lower: 1, upper: 4 }
  private static readonly COMPENSATOR_RANGE = { lower: 1, upper: 2 }

  // Some variables used for considering real node sizes, see below.
  private dummySize = 0
  private minimumNodeSize = 0
  private normSize: number[] = []
  private avgSize = 0

  // Degrees of nodes without self loops, indexed by node.id
  private inDegree: number[] = []
  private outDegree: number[] = []

  /** 上次 process 选中最窄分层的层宽 (归一化 maxWidth 度量) — 测试/调试用. */
  lastMaxWidth = 0

  process(layeredGraph: LGraph, progressMonitor: IElkProgressMonitor): void {
    progressMonitor.begin('MinWidth layering', 1)

    const layers = layeredGraph.getLayers()
    const notInserted = layeredGraph.getLayerlessNodes()

    // The algorithm requires DAG G = (V, E). In this version self-loops are allowed (as we're
    // going to filter them). Additional properties as described above (called UBW and c in the
    // original paper):
    const upperBoundOnWidth = layeredGraph.getProperty(LAYERING_MIN_WIDTH_UPPER_BOUND_ON_WIDTH)
    const compensator = layeredGraph.getProperty(LAYERING_MIN_WIDTH_UPPER_LAYER_ESTIMATION_SCALING_FACTOR)

    // First step to consider the real size of nodes: Initialize the dummy size with the spacing
    // properties
    this.dummySize = layeredGraph.getProperty(SPACING_EDGE_EDGE)

    // Compute the minimum nodes size (of the real nodes). We're going to use this value in the
    // next step to normalize the different node sizes.
    this.minimumNodeSize = Number.POSITIVE_INFINITY
    for (const node of notInserted) {
      if (node.getType() !== NodeType.NORMAL) {
        continue
      }
      const size = node.getSize().y
      this.minimumNodeSize = Math.min(this.minimumNodeSize, size)
    }
    // The minimum nodes size might be zero. If This is the case, then simply don't normalize the
    // node sizes.
    this.minimumNodeSize = Math.max(1, this.minimumNodeSize)

    // We initialize the nodes' id and use it to refer to its in- and out-degree stored each in
    // an array. We also compute the size of each node in relation to the smallest real node in
    // the graph (normalized size) and store it in the same way.
    const numOfNodes = notInserted.length
    this.inDegree = new Array(numOfNodes).fill(0)
    this.outDegree = new Array(numOfNodes).fill(0)
    this.normSize = new Array(numOfNodes).fill(0)
    let i = 0
    this.avgSize = 0
    for (const node of notInserted) {
      // Warning: LNode.id is being redefined here!
      node.id = i++
      this.inDegree[node.id] = this.countEdgesExceptSelfLoops(node.getIncomingEdges())
      this.outDegree[node.id] = this.countEdgesExceptSelfLoops(node.getOutgoingEdges())
      this.normSize[node.id] = node.getSize().y / this.minimumNodeSize
      // The average size of a node will also be based on the normalized size.
      this.avgSize += this.normSize[node.id]
    }
    // normalize dummy size, too:
    this.dummySize /= this.minimumNodeSize
    // Divide sum of normalized node sizes by the number of nodes to get an actual mean.
    this.avgSize /= numOfNodes

    // Precalculate the successors of all nodes (as a Set) and put them in a list.
    const nodeSuccessors = this.precalcSuccessors(notInserted)

    // Guarantee ConditionSelect from the paper, which states that nodes with maximum out-degree
    // should be preferred during layer placement, by ordering the nodes by descending maximum
    // out-degree in advance.
    notInserted.sort((o1, o2) => {
      const outs1 = this.outDegree[o1.id]
      const outs2 = this.outDegree[o2.id]
      if (outs1 < outs2) {
        return 1
      }
      if (outs1 === outs2) {
        return 0
      }
      return -1
    })

    // minimum width of a layer of maximum size in a computed layering (primary criterion used
    // for comparison, if more than one layering is computed). It's a double as it takes in
    // account the actual width based on the normalized size of the nodes.
    let minWidth = Number.POSITIVE_INFINITY
    // minimum number of layers in a computed layering {@code minWidth} (secondary
    // criterion used for comparison, if more than one layering is computed).
    let minNumOfLayers = Number.MAX_SAFE_INTEGER
    // holding the currently chosen candidate for the final layering as a List
    let candidateLayering: LNode[][] | null = null

    // At first blindly set the parameters for the loose upper bound and the compensator to the
    // exact values, which have been configured via their respective properties, so that only
    // one layering will be computed ...
    let ubwStart = upperBoundOnWidth
    let ubwEnd = upperBoundOnWidth
    let cStart = compensator
    let cEnd = compensator

    // ... then check, whether any special values (i.e. negative values, which aren't valid) have
    // been used for the properties. In that case use the recommended ranges described above ...
    if (upperBoundOnWidth < 0) {
      ubwStart = MinWidthLayerer.UPPERBOUND_ON_WIDTH_RANGE.lower
      ubwEnd = MinWidthLayerer.UPPERBOUND_ON_WIDTH_RANGE.upper
    }
    if (compensator < 0) {
      cStart = MinWidthLayerer.COMPENSATOR_RANGE.lower
      cEnd = MinWidthLayerer.COMPENSATOR_RANGE.upper
    }

    // ... Depending on the start- and end-values, this nested for-loop will last for up to 8
    // iterations resulting in one, two, four or eight different layerings.
    for (let ubw = ubwStart; ubw <= ubwEnd; ubw++) {
      for (let c = cStart; c <= cEnd; c++) {
        const result = this.computeMinWidthLayering(ubw, c, notInserted, nodeSuccessors)
        const newWidth = result.width
        const layering = result.layers

        // Important if more than one layering is computed: replace the current candidate
        // layering with a newly computed one, if it is narrower or has the same maximum
        // width but less layers.
        const newNumOfLayers = layering.length
        if (newWidth < minWidth
          || (newWidth === minWidth && newNumOfLayers < minNumOfLayers)) {
          minWidth = newWidth
          minNumOfLayers = newNumOfLayers
          candidateLayering = layering
        }
      }
    }

    // Finally, add the winning layering to the Klay layered data structures.
    for (const layerList of candidateLayering!) {
      const currentLayer = new Layer(layeredGraph)
      for (const node of layerList) {
        node.setLayer(currentLayer)
      }
      layers.push(currentLayer)
    }

    this.lastMaxWidth = minWidth

    // The algorithm constructs the layering bottom up, but ElkLayered expects the list of
    // layers to be ordered top down.
    layers.reverse()
    // After the algorithm, there should be no nodes left to be put in a layer, so we're gonna
    // delete them.
    notInserted.length = 0

    progressMonitor.done()
  }

  /**
   * Calculates for a given Collection of {@link LNode} all its successors (i.e. a Set of
   * {@link LNode}s) without self-loops.
   */
  private precalcSuccessors(nodes: LNode[]): Set<LNode>[] {
    const successors: Set<LNode>[] = []

    for (const node of nodes) {
      const outNodes = new Set<LNode>()
      for (const edge of node.getOutgoingEdges()) {
        if (!this.isSelfLoop(edge)) {
          outNodes.add(edge.getTarget()!.getNode()!)
        }
      }
      successors.push(outNodes)
    }

    return successors
  }

  /**
   * Computes a layering (as a List of Lists) for a given Iterable of {@link LNode} according to
   * the MinWidth-heuristic and considering actual node sizes.
   *
   * @return the maximum width of the resulting layering (normalized by the smallest real node)
   *         and the layering itself as a list of list of nodes
   */
  private computeMinWidthLayering(
    upperBoundOnWidth: number,
    compensator: number,
    nodes: LNode[],
    nodeSuccessors: Set<LNode>[],
  ): { width: number; layers: LNode[][] } {
    const layers: LNode[][] = []
    const unplacedNodes = new Set(nodes)

    // One of the deviations from the paper is, that our upper bound is taking node sizes into
    // account:
    const ubwConsiderSize = upperBoundOnWidth * this.avgSize

    // in- and out-degree of the currently considered node, see while-loop below
    let inDeg = 0
    let outDeg = 0

    // The actual algorithm from the paper begins here:
    // In the Paper the first Set contains all nodes, which have already been placed (in this
    // version we consider only the nodes already placed in the current layer), and the
    // second contains all nodes already placed in layers which have been determined before the
    // currentLayer.
    const alreadyPlacedInCurrentLayer = new Set<LNode>()
    const alreadyPlacedInOtherLayers = new Set<LNode>()

    // Set up the first layer (algorithm is bottom up, so the List layer is going to be reversed
    // at the end.
    let currentLayer: LNode[] = []

    // Initial values for the width of the current layer and the estimated width of the coming
    // layers
    let widthCurrent = 0
    let widthUp = 0

    // Parameters needed for computing the width of a layering including dummy nodes:
    let maxWidth = 0
    let realWidth = 0
    // Number of "started" edges that did not "finish" yet (now multiplied with the normalized
    // dummy size to consider actual node sizes)
    let currentSpanningEdges = 0
    let goingOutFromThisLayer = 0
    // No need for a variable "comingIntoThisLayer" as "widthUp" already gets the job done.

    while (unplacedNodes.size > 0) {
      // Find a node, whose edges only point to nodes in the Set alreadyPlacedInOtherLayers;
      // will return {@code null} if such a node doesn't exist.
      let currentNode: LNode | null = this.selectNode(unplacedNodes, nodeSuccessors, alreadyPlacedInOtherLayers)

      // If a node is found in the previous step:
      if (currentNode !== null) {
        unplacedNodes.delete(currentNode)
        currentLayer.push(currentNode)
        alreadyPlacedInCurrentLayer.add(currentNode)

        outDeg = this.outDegree[currentNode.id]
        // Take node sizes in account: use the normalized size of current node and the
        // normalized dummy size for each edge
        widthCurrent += this.normSize[currentNode.id] - outDeg * this.dummySize

        inDeg = this.inDegree[currentNode.id]
        // Take node sizes in account: use the normalized normalized dummy size for each
        // edge
        widthUp += inDeg * this.dummySize

        goingOutFromThisLayer += outDeg * this.dummySize

        realWidth += this.normSize[currentNode.id]
      }

      // Go to the next layer if,
      // 1) no current node has been selected,
      // 2) there are no unplaced nodes left (last iteration of the while-loop),
      // 3) The conditionGoUp from the paper (with the difference of ubw being multiplied with
      // the average normalized node size) is satisfied, i.e.
      // 3.1) the width of the current layer is greater than the upper bound on the width and
      // the number of dummy nodes in the layer can't be reduced, as only nodes with no
      // outgoing edges are left for being considered for the current layer; or:
      // 3.2) The estimated width of the not yet determined layers is greater than the
      // scaling factor/compensator times the upper bound on the width.
      if (currentNode === null || unplacedNodes.size === 0
        || (widthCurrent >= ubwConsiderSize && this.normSize[currentNode.id] > outDeg * this.dummySize)
        || widthUp >= compensator * ubwConsiderSize) {
        layers.push(currentLayer)
        currentLayer = []
        for (const placed of alreadyPlacedInCurrentLayer) {
          alreadyPlacedInOtherLayers.add(placed)
        }
        alreadyPlacedInCurrentLayer.clear()

        // Remove all edges from the dummy node count, which are starting at a node placed
        // in this layer ...
        currentSpanningEdges -= goingOutFromThisLayer
        // ... Now we have the actual dummy node count (or rather the sum of their widths) for
        // this layer and can add it to the real nodes for comparing the width.
        maxWidth = Math.max(maxWidth, currentSpanningEdges * this.dummySize + realWidth)
        // In the next iteration we have to consider new dummy nodes from edges coming into
        // the layer we've just finished.
        currentSpanningEdges += widthUp

        widthCurrent = widthUp
        widthUp = 0
        goingOutFromThisLayer = 0
        realWidth = 0
      }
    }

    return { width: maxWidth, layers }
  }

  /**
   * Returns the first {@link LNode} in the given Set, whose outgoing edges end only in nodes of
   * the Set {@code targets}. Self-loops are ignored.
   *
   * Warning: Returns {@code null}, if such a node doesn't exist.
   */
  private selectNode(nodes: Set<LNode>, successors: Set<LNode>[], targets: Set<LNode>): LNode | null {
    for (const node of nodes) {
      if (this.containsAll(targets, successors[node.id]!)) {
        return node
      }
    }
    return null
  }

  private containsAll(targets: Set<LNode>, successors: Set<LNode>): boolean {
    for (const s of successors) {
      if (!targets.has(s)) return false
    }
    return true
  }

  /**
   * Returns the number of {@link LEdge} edges in the given Iterable, but ignores self-loops.
   */
  private countEdgesExceptSelfLoops(edges: LEdge[]): number {
    let i = 0
    for (const edge of edges) {
      if (!this.isSelfLoop(edge)) {
        i++
      }
    }
    return i
  }

  /** Checks whether an edge is a self-loop (i.e. source node == target node). */
  private isSelfLoop(edge: LEdge): boolean {
    return edge.getSource()!.getNode() === edge.getTarget()!.getNode()
  }
}
