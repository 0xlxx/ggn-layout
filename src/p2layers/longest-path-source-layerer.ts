/**
 * LongestPathSourceLayerer (对应 ELK p2layers.LongestPathSourceLayerer).
 * 与 LongestPathLayerer 相同, 但按「从 source 出发的最长路径」分层 (反向遍历入边).
 */
import type { LGraph } from '../graph/lgraph.js'
import { Layer } from '../graph/layer.js'
import type { LNode } from '../graph/lnode.js'
import type { IElkProgressMonitor } from '../layered-layout-provider.js'

export class LongestPathSourceLayerer {
  private layeredGraph!: LGraph
  private nodeHeights = new Map<LNode, number>()

  process(theLayeredGraph: LGraph, monitor: IElkProgressMonitor): void {
    monitor.begin('Longest path to source layering', 1)
    this.layeredGraph = theLayeredGraph
    const nodes = theLayeredGraph.getLayerlessNodes()
    this.nodeHeights = new Map()
    for (const node of nodes) this.nodeHeights.set(node, -1)

    for (const node of nodes) this.visit(node)
    nodes.length = 0
    this.layeredGraph = null as unknown as LGraph
    this.nodeHeights = new Map()
    monitor.done()
  }

  private visit(node: LNode): number {
    const height = this.nodeHeights.get(node)
    if (height !== undefined && height >= 0) return height
    // 不在 nodeHeights 的节点 (父容器, 非本图 layerless): Java int[] 默认 0 → 视为已访问高度 0,
    // 不递归不 putNode (否则父节点被错误分层 → 层数/位置差异, 例 PrintingPress Contents 7 vs 14 层).
    if (height === undefined) return 0
    let maxHeight = 1
    for (const port of node.getPorts()) {
      for (const edge of port.getIncomingEdges()) {
        const sourceNode = edge.getSource()!.getNode()!
        if (node !== sourceNode) {
          const sourceHeight = this.visit(sourceNode)
          maxHeight = Math.max(maxHeight, sourceHeight + 1)
        }
      }
    }
    this.putNode(node, maxHeight)
    return maxHeight
  }

  private putNode(node: LNode, height: number): void {
    const layers = this.layeredGraph.getLayers()
    // 追加层到末尾; 层索引 = height - 1 (源在最左).
    for (let i = layers.length; i < height; i++) {
      layers.push(new Layer(this.layeredGraph))
    }
    node.setLayer(layers[height - 1]!)
    this.nodeHeights.set(node, height)
  }
}
