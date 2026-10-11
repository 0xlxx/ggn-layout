/**
 * SelfLoopPostprocessor (对应 ELK intermediate.SelfLoopPostProcessor).
 * P5 后: 恢复自环边 (bendPoints 加节点位置偏移) + 应用自环标签位置.
 */
import type { LGraph } from '../graph/lgraph.js'
import { NodeType } from '../graph/enums.js'
import { SELF_LOOP_HOLDER } from '../options/internal-properties.js'
import type { SelfLoopHolder } from './loops/self-loop-holder.js'

export function processSelfLoopPost(graph: LGraph): void {
    for (const layer of graph.getLayers()) {
      for (const lNode of layer.getNodes()) {
        if (lNode.getType() !== NodeType.NORMAL) continue
        const slHolder = lNode.getProperty(SELF_LOOP_HOLDER) as SelfLoopHolder | null
        if (slHolder === null || slHolder === undefined) continue
        processNode(lNode, slHolder)
      }
    }
  }

function processNode(lNode: import('../graph/lnode.js').LNode, slHolder: SelfLoopHolder): void {
    for (const slLoop of slHolder.getSLHyperLoops()) {
      for (const slEdge of slLoop.getSLEdges()) {
        restoreEdge(lNode, slEdge)
      }
    }
    for (const slLoop of slHolder.getSLHyperLoops()) {
      if (slLoop.getSLLabels() !== null) {
        slLoop.getSLLabels()!.applyPlacement(lNode.position)
      }
    }
  }

function restoreEdge(lNode: import('../graph/lnode.js').LNode, slEdge: import('./loops/self-loop-edge.js').SelfLoopEdge): void {
    const lEdge = slEdge.getLEdge()
    lEdge.setSource(slEdge.getSLSource().getLPort())
    lEdge.setTarget(slEdge.getSLTarget().getLPort())
    for (const bp of lEdge.getBendPoints()) {
      bp.x += lNode.position.x
      bp.y += lNode.position.y
    }
  }
