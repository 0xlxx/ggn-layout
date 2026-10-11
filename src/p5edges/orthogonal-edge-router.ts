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
 * OrthogonalEdgeRouter 改进版: 简化 slot 分配 (区间贪心着色) 决定路由宽度.
 *
 * 对应 ELK OrthogonalRoutingGenerator 的 rankCount 语义:
 *   routingWidth = (slots-1)*edgeEdgeSpacing + 2*edgeNodeSpacing (非首尾层)
 * 边 bendPoints 暂不生成 (坐标差分不检查边).
 */
import type { LGraph } from '../graph/lgraph.js'
import type { LNode } from '../graph/lnode.js'
import {
  SPACING_NODE_NODE_BETWEEN_LAYERS,
  SPACING_EDGE_EDGE_BETWEEN_LAYERS,
  SPACING_EDGE_NODE_BETWEEN_LAYERS,
} from '../options/layered-options.js'
import { placeNodesHorizontally } from './layer-size-calculator.js'
import { OrthogonalRoutingGenerator } from './orthogonal/orthogonal-routing-generator.js'
import { RANDOM, EXT_PORT_SIDE } from '../options/internal-properties.js'

const TOLERANCE = 1e-3

/** 层间非直线边的 Y 区间, 贪心着色返回槽数 (0 = 全直线). */
export class OrthogonalEdgeRouter {
  process(layeredGraph: LGraph): void {
    const nodeNodeSpacing = layeredGraph.getProperty(SPACING_NODE_NODE_BETWEEN_LAYERS)
    const edgeEdgeSpacing = layeredGraph.getProperty(SPACING_EDGE_EDGE_BETWEEN_LAYERS)
    const edgeNodeSpacing = layeredGraph.getProperty(SPACING_EDGE_NODE_BETWEEN_LAYERS)
    // ELK OrthogonalEdgeRouter: new OrthogonalRoutingGenerator(WEST_TO_EAST, edgeEdgeSpacing, ...).
    const routingGenerator = new OrthogonalRoutingGenerator(edgeEdgeSpacing)

    // ELK 单遍流程: 每层间调 routeEdges 一次 (同时得槽数 → 宽度, 并生成边弯点).
    let xpos = 0.0
    const layers = layeredGraph.getLayers()
    const isExtWE = (ns: LNode[]) => ns.length > 0
      && ns.every(n => n.getType().toString() === 'EXTERNAL_PORT'
        && (n.getProperty(EXT_PORT_SIDE) === 'WEST' || n.getProperty(EXT_PORT_SIDE) === 'EAST'))

    let leftLayer: LNode[] | null = null
    for (let li = 0; li <= layers.length; li++) {
      const rightLayer = li < layers.length ? layers[li]!.getNodes() : null
      // 放置左层节点 (ELK placeNodesHorizontally(leftLayer, xpos)).
      if (leftLayer !== null) {
        placeNodesHorizontally(layers[li - 1]!, xpos)
        xpos += layers[li - 1]!.getSize().x
      }
      // 路由左右层间边 (弯点 + 槽数).
      const startPos = leftLayer === null ? xpos : xpos + edgeNodeSpacing
      const random = layeredGraph.getProperty(RANDOM)
      const slots = routingGenerator.routeEdges(leftLayer, rightLayer, startPos, random)
      if (process.env.GGN_OER_DBG) {
        console.error(`GGN OER gap graph=${layeredGraph.getParentNode()?.id ?? 'root'} li=${li} slots=${slots} ls=${leftLayer?.length ?? 0} rs=${rightLayer?.length ?? 0}`)
        if (rightLayer && layeredGraph.getParentNode() === null) {
          const rb = rightLayer.map(nn => {
            const t = nn.getType()
            const lab = nn.getLabels()[0]?.text ?? nn.id
            const ports = nn.getPorts().map(pp => `${pp.getSide()}@${(pp.getPosition().y + nn.getPosition().y).toFixed(1)}`).join(';')
            return `${t}:${lab}(y=${nn.getPosition().y.toFixed(1)},w=${nn.getSize().x.toFixed(1)}) ports[${ports}]`
          }).join(' ')
          console.error(`  GGN OER R: ${rb}`)
        }
      }

      // ELK PRED_EXTERNAL_WEST_OR_EAST_PORT: 只有 WEST/EAST 外部端口层跳过间距
      // (NORTH/SOUTH 外部端口仍加间距, 否则子图 L0→L1 路由区宽度丢失).
      const isLeftExternal = leftLayer === null || isExtWE(leftLayer)
      const isRightExternal = rightLayer === null || isExtWE(rightLayer)

      if (slots > 0) {
        let routingWidth = (slots - 1) * edgeEdgeSpacing
        if (leftLayer !== null) routingWidth += edgeNodeSpacing
        if (rightLayer !== null) routingWidth += edgeNodeSpacing
        if (routingWidth < nodeNodeSpacing && !isLeftExternal && !isRightExternal) {
          routingWidth = nodeNodeSpacing
        }
        xpos += routingWidth
      } else if (!isLeftExternal && !isRightExternal) {
        xpos += nodeNodeSpacing
      }
      leftLayer = rightLayer
    }

    // 图宽 = 最大节点右边界 + 右 padding (ELK 总宽语义).
    let maxRight = xpos
    for (const layer of layers) {
      for (const n of layer.getNodes()) {
        maxRight = Math.max(maxRight, n.position.x + n.size.x)
      }
    }
    layeredGraph.getSize().x = maxRight
  }
}
