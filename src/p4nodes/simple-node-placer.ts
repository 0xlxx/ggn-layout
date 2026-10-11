/**
 * SimpleNodePlacer (对应 ELK p4nodes.SimpleNodePlacer).
 *
 * nodePlacement.strategy = SIMPLE: 只设置各层节点的垂直坐标 (y), 使层内不重叠, 层高取最大层高居中.
 * x 坐标由 P5 边路由 (Orthogonal/Polyline placeNodesHorizontally) 负责.
 */
import type { LGraph } from '../graph/lgraph.js'
import type { LNode } from '../graph/lnode.js'
import { SPACINGS } from '../options/internal-properties.js'

export function processSimpleNodePlace(layeredGraph: LGraph): void {
    const spacings = layeredGraph.getProperty(SPACINGS)

    // 第一遍: 计算每层高度 (层内节点垂直堆叠).
    let maxHeight = 0
    for (const layer of layeredGraph.getLayers()) {
      const layerSize = layer.getSize()
      layerSize.y = 0
      let lastNode: LNode | null = null
      for (const node of layer.getNodes()) {
        if (lastNode !== null) {
          layerSize.y += spacings.getVerticalSpacing(node, lastNode)
        }
        layerSize.y += node.getMargin().top + node.getSize().y + node.getMargin().bottom
        lastNode = node
      }
      maxHeight = Math.max(maxHeight, layerSize.y)
    }

    // 第二遍: 各层节点以最大层高居中.
    for (const layer of layeredGraph.getLayers()) {
      const layerSize = layer.getSize()
      let pos = (maxHeight - layerSize.y) / 2
      let lastNode: LNode | null = null
      for (const node of layer.getNodes()) {
        if (lastNode !== null) {
          pos += spacings.getVerticalSpacing(node, lastNode)
        }
        pos += node.getMargin().top
        node.getPosition().y = pos
        pos += node.getSize().y + node.getMargin().bottom
        lastNode = node
      }
    }
  }
