/**
 * HorizontalGraphCompactor (对应 ELK intermediate.compaction.HorizontalGraphCompactor).
 * P5 后处理器: 把已路由图再水平压缩 (postCompaction.strategy != NONE 且 edgeRouting != POLYLINE).
 *
 * 首版 (2026-08-10): 节点-only 压缩 (无垂直段), 支持 LEFT/RIGHT 策略 + scanline/quadratic 约束;
 * LEFT_RIGHT_*_LOCKING 用 transformer.lockMap; EDGE_LENGTH 用 NetworkSimplexCompaction
 * (network-simplex-compaction.ts, 2026-08-11 移植, 对齐 Java alg.common.networksimplex).
 */
import { OneDimensionalCompactor } from './oned-compactor.js'
import { EdgeAwareScanlineConstraintCalculation } from './edge-aware-scanline.js'
import { LGraphToCGraphTransformer } from './lgraph-to-cgraph-transformer.js'
import type { ISpacingsHandler } from './spacings-handler.js'
import type { CNode } from './cnode.js'
import { LNodeCNode, VerticalSegmentCNode } from './cnode-implementations.js'
import type { LGraph } from '../../graph/lgraph.js'
import type { LNode } from '../../graph/lnode.js'
import { NodeType, Direction } from '../../graph/enums.js'
import { COMPACTION_POST_COMPACTION_STRATEGY, COMPACTION_POST_COMPACTION_CONSTRAINTS } from '../../options/layered-options.js'
import { SPACINGS } from '../../options/internal-properties.js'
import type { VerticalSegment } from './vertical-segment.js'
import { NetworkSimplexCompaction } from './network-simplex-compaction.js'

/** 两 CNode 是否来自同一组边 (同边垂直段间距 0). */
export function isVerticalSegmentsOfSameEdge(c1: CNode, c2: CNode): boolean {
  const v1 = c1 instanceof VerticalSegmentCNode ? c1.vs : null
  const v2 = c2 instanceof VerticalSegmentCNode ? c2.vs : null
  if (v1 === null || v2 === null) return false
  return v1.representedLEdges.some(e => v2.representedLEdges.includes(e))
}

export function getLNodeOrNull(c: CNode): LNode | null {
  return c instanceof LNodeCNode ? c.lNode : null
}

export function getVerticalSegmentOrNull(c: CNode): VerticalSegment | null {
  return c instanceof VerticalSegmentCNode ? c.vs : null
}

export class HorizontalGraphCompactor {
  private lGraph!: LGraph

  process(layeredGraph: LGraph): void {
    if (process.env.GGN_COMPACT_DBG) console.error('[CMP] process called, strategy=' + layeredGraph.getProperty(COMPACTION_POST_COMPACTION_STRATEGY))
    const strategy = layeredGraph.getProperty(COMPACTION_POST_COMPACTION_STRATEGY)
    if (strategy === 'NONE') return

    this.lGraph = layeredGraph

    const transformer = new LGraphToCGraphTransformer()
    const odc = new OneDimensionalCompactor(transformer.transform(layeredGraph))
    odc.setSpacingsHandler(this.specialSpacingsHandler)

    // 约束算法: ELK 默认 SCANLINE (EdgeAwareScanline), ggn 节点版用通用 scanline; 其余 QUADRATIC.
    const constraints = layeredGraph.getProperty(COMPACTION_POST_COMPACTION_CONSTRAINTS)
    if (constraints === 'SCANLINE') {
      odc.setConstraintAlgorithm(new EdgeAwareScanlineConstraintCalculation(layeredGraph))
    } else {
      odc.setConstraintAlgorithm(OneDimensionalCompactor.QUADRATIC_CONSTRAINTS)
    }

    // 压缩策略分发.
    switch (strategy) {
      case 'LEFT':
        odc.compact()
        break
      case 'RIGHT':
        odc.changeDirection(Direction.RIGHT).compact()
        break
      case 'LEFT_RIGHT_CONSTRAINT_LOCKING':
        odc.compact()
          .changeDirection(Direction.RIGHT)
          .setLockingStrategy(pair => pair.first.cGroup!.outDegree === 0)
          .applyLockingStrategy()
          .compact()
        break
      case 'LEFT_RIGHT_CONNECTION_LOCKING':
        odc.compact()
          .changeDirection(Direction.RIGHT)
          .setLockingStrategy(pair => transformer.getLockMap().get(pair.first)?.get(pair.second) ?? false)
          .applyLockingStrategy()
          .compact()
        break
      case 'EDGE_LENGTH':
        // ELK 用 NetworkSimplexCompaction (network simplex 最小化边长, 非 LongestPath).
        odc.setCompactionAlgorithm(new NetworkSimplexCompaction()).compact()
        break
      default:
        break
    }

    // 恢复 LEFT 方向并应用布局.
    odc.finish()
    transformer.applyLayout()
  }

  /** LGraph 特殊间距: 同边垂直段 0; 外部端口 0; 其余按节点类型查 SPACINGS. */
  private readonly specialSpacingsHandler: ISpacingsHandler<CNode> = {
    getHorizontalSpacing: (cNode1: CNode, cNode2: CNode): number => {
      if (isVerticalSegmentsOfSameEdge(cNode1, cNode2)) return 0
      const node1 = getLNodeOrNull(cNode1)
      const node2 = getLNodeOrNull(cNode2)
      if ((node1 !== null && node1.getType() === NodeType.EXTERNAL_PORT)
        || (node2 !== null && node2.getType() === NodeType.EXTERNAL_PORT)) {
        return 0
      }
      const spacings = this.lGraph.getProperty(SPACINGS)
      if (!spacings) return 0
      return spacings.getHorizontalSpacingByType(
        node1 !== null ? node1.getType() : NodeType.LONG_EDGE,
        node2 !== null ? node2.getType() : NodeType.LONG_EDGE,
      )
    },
    getVerticalSpacing: (cNode1: CNode, cNode2: CNode): number => {
      if (isVerticalSegmentsOfSameEdge(cNode1, cNode2)) return 1
      const node1 = getLNodeOrNull(cNode1)
      const node2 = getLNodeOrNull(cNode2)
      const spacings = this.lGraph.getProperty(SPACINGS)
      if (!spacings) return 0
      return spacings.getVerticalSpacingByType(
        node1 !== null ? node1.getType() : NodeType.LONG_EDGE,
        node2 !== null ? node2.getType() : NodeType.LONG_EDGE,
      )
    },
  }
}
