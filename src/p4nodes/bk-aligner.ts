/**
 * BKAligner (对应 ELK p4nodes.bk.BKAligner).
 *
 * 免分配 (簇 bk-node-placement):
 *  - verticalAlignment / insideBlockShift 方向逆序遍历改索引遍历 (去掉 [...].reverse() 拷贝).
 *  - insideBlockShift 去掉 getBlocks 的 Map+LNode[] 分配, 直接按层/节点序处理块根
 *    (块间无共享可变状态, 处理顺序不影响结果, 与原 blocks.keys() 顺序语义一致).
 *  - getEdge 直读端口边数组 (原 getConnectedEdges 每次分配结果数组).
 */
import type { LGraph } from '../graph/lgraph.js'
import type { LNode } from '../graph/lnode.js'
import type { LEdge } from '../graph/ledge.js'

// R17 对齐边缓存: WeakMap<source LNode, Map<target LNode, LEdge>>.
// 前提 (已主线程验证): BK (bk-*.ts) 期间无 addEdge/removeEdge/sort edge → 边集合与顺序不变,
// 缓存「首次查询的第一条边」与 ELK getEdge (每次取当前边序第一条) 逐位一致, 无需 ELK 语义豁免.
// 跨图安全: WeakMap 弱引用 + key 为节点对象, 图 GC 后自动回收; 平行边/反向边由有向 (source,target) 键区分.
const bkEdgeCache = new WeakMap<LNode, Map<LNode, LEdge>>()
import { NodeType } from '../graph/enums.js'
import type { NeighborhoodInformation } from './neighborhood-information.js'
import { BKAlignedLayout, HDirection, VDirection } from './bk-aligned-layout.js'

export class BKAligner {
  private layeredGraph: LGraph
  private ni: NeighborhoodInformation

  constructor(layeredGraph: LGraph, ni: NeighborhoodInformation) {
    this.layeredGraph = layeredGraph
    this.ni = ni
  }

  verticalAlignment(bal: BKAlignedLayout, markedEdges: Set<number>): void {
    for (const layer of this.layeredGraph.getLayers()) {
      for (const v of layer.getNodes()) {
        bal.root[v.id] = v
        bal.align[v.id] = v
        bal.innerShift[v.id] = 0.0
      }
    }

    const layers = this.layeredGraph.getLayers()
    const layerCount = layers.length
    const hdirLeft = bal.hdir === HDirection.LEFT
    const vdirUp = bal.vdir === VDirection.UP

    for (let li = 0; li < layerCount; li++) {
      const layer = layers[hdirLeft ? layerCount - 1 - li : li]!
      let r = -1
      const nodes = layer.getNodes()
      const nodeCount = nodes.length
      if (vdirUp) {
        r = Number.MAX_SAFE_INTEGER
      }

      for (let vi = 0; vi < nodeCount; vi++) {
        const v_i_k = nodes[vdirUp ? nodeCount - 1 - vi : vi]!
        const neighbors = hdirLeft ? this.ni.rightNeighbors[v_i_k.id] : this.ni.leftNeighbors[v_i_k.id]
        if (neighbors.length > 0) {
          const d = neighbors.length
          const low = Math.floor((d + 1.0) / 2.0) - 1
          const high = Math.ceil((d + 1.0) / 2.0) - 1

          if (vdirUp) {
            for (let m = high; m >= low; m--) {
              if (bal.align[v_i_k.id] === v_i_k) {
                const u_m = neighbors[m]!.first
                if (!markedEdges.has(neighbors[m]!.second.id) && r > this.ni.nodeIndex[u_m.id]!) {
                  bal.align[u_m.id] = v_i_k
                  bal.root[v_i_k.id] = bal.root[u_m.id]
                  bal.align[v_i_k.id] = bal.root[v_i_k.id]
                  bal.od[bal.root[v_i_k.id]!.id] = (bal.od[bal.root[v_i_k.id]!.id] !== 0 && v_i_k.getType() === NodeType.LONG_EDGE) ? 1 : 0
                  r = this.ni.nodeIndex[u_m.id]!
                }
              }
            }
          } else {
            for (let m = low; m <= high; m++) {
              if (bal.align[v_i_k.id] === v_i_k) {
                const um = neighbors[m]!.first
                if (!markedEdges.has(neighbors[m]!.second.id) && r < this.ni.nodeIndex[um.id]!) {
                  bal.align[um.id] = v_i_k
                  bal.root[v_i_k.id] = bal.root[um.id]
                  bal.align[v_i_k.id] = bal.root[v_i_k.id]
                  bal.od[bal.root[v_i_k.id]!.id] = (bal.od[bal.root[v_i_k.id]!.id] !== 0 && v_i_k.getType() === NodeType.LONG_EDGE) ? 1 : 0
                  r = this.ni.nodeIndex[um.id]!
                }
              }
            }
          }
        }
      }
    }
  }

  insideBlockShift(bal: BKAlignedLayout): void {
    if (process.env.GGN_BK_BLOCKS) {
      const blocks = this.getBlocks(bal)
      const desc = [...blocks.keys()].map(root => {
        const members = blocks.get(root)!.map(n => (n.getLabels()[0]?.text ?? n.id)).join(",")
        return "root=" + (root.getLabels()[0]?.text ?? root.id) + "[" + members + "]"
      }).join(" | ")
      console.error(`GGN_BK_BLOCKS ${bal.vdir}/${bal.hdir}: ${desc}`)
    }
    for (const layer of this.layeredGraph.getLayers()) {
      for (const node of layer.getNodes()) {
        if (bal.root[node.id] !== node) continue
        this.shiftBlock(bal, node)
      }
    }
  }

  private shiftBlock(bal: BKAlignedLayout, root: LNode): void {
    let spaceAbove = 0.0
    let spaceBelow = 0.0
    spaceAbove = root.getMargin().top
    spaceBelow = root.size.y + root.getMargin().bottom
    bal.innerShift[root.id] = 0.0

    let current = root
    let next: LNode
    while ((next = bal.align[current.id]!) !== root) {
      const edge = this.getEdge(current, next)!
      if (process.env.GGN_BK_DBG) {
        const s = edge.getSource()!
        const t = edge.getTarget()!
        console.error(`GGN BK shift blk=${root.id} cur=${current.id} next=${next.id} edge=${s.getNode()!.id}->${t.getNode()!.id} srcPortY=${s.getPosition().y} tgtPortY=${t.getPosition().y} hdir=${bal.hdir}`)
      }
      let portPosDiff = 0.0
      if (bal.hdir === HDirection.LEFT) {
        portPosDiff = edge.getTarget()!.getPosition().y + edge.getTarget()!.getAnchor().y
          - edge.getSource()!.getPosition().y - edge.getSource()!.getAnchor().y
      } else {
        portPosDiff = edge.getSource()!.getPosition().y + edge.getSource()!.getAnchor().y
          - edge.getTarget()!.getPosition().y - edge.getTarget()!.getAnchor().y
      }
      const nextInnerShift = bal.innerShift[current.id] + portPosDiff
      bal.innerShift[next.id] = nextInnerShift

      spaceAbove = Math.max(spaceAbove, next.getMargin().top - nextInnerShift)
      spaceBelow = Math.max(spaceBelow, nextInnerShift + next.size.y + next.getMargin().bottom)

      current = next
    }
    current = root
    do {
      bal.innerShift[current.id] = bal.innerShift[current.id] + spaceAbove
      current = bal.align[current.id]!
    } while (current !== root)

    bal.blockSize[root.id] = spaceAbove + spaceBelow
    if (process.env.GGN_BK_IS) {
      const desc = this.layeredGraph.getAllNodes().map(n => (n.getLabels()[0]?.text ?? n.id) + ":" + bal.innerShift[n.id]).join(" ")
      console.error(`GGN_BK_IS ${bal.vdir}/${bal.hdir}: ${desc}`)
    }
  }

  getBlocks(bal: BKAlignedLayout): Map<LNode, LNode[]> {
    const blocks = new Map<LNode, LNode[]>()
    for (const layer of this.layeredGraph.getLayers()) {
      for (const node of layer.getNodes()) {
        const root = bal.root[node.id]!
        let blockContents = blocks.get(root)
        if (!blockContents) {
          blockContents = []
          blocks.set(root, blockContents)
        }
        blockContents.push(node)
      }
    }
    return blocks
  }

  static getEdge(source: LNode, target: LNode): LEdge | null {
    // 语义与原 getConnectedEdges 全量迭代一致: 入边另一端点 = target 或 出边另一端点 = target.
    // source !== target 时: 入边 target 端必为 source 自身、出边 source 端必为 source 自身,
    // 各只需一次节点解引用; 自环查询 (source === target) 走原全量双端点检查 (BK 内部不会触发).
    if (source === target) {
      for (const port of source.getPorts()) {
        for (const edge of port.getIncomingEdges()) {
          if (edge.getTarget()!.getNode() === target || edge.getSource()!.getNode() === target) return edge
        }
        for (const edge of port.getOutgoingEdges()) {
          if (edge.getTarget()!.getNode() === target || edge.getSource()!.getNode() === target) return edge
        }
      }
      return null
    }
    let byTarget = bkEdgeCache.get(source)
    if (byTarget === undefined) { byTarget = new Map(); bkEdgeCache.set(source, byTarget) }
    const cached = byTarget.get(target)
    if (cached !== undefined) return cached
    for (const port of source.getPorts()) {
      for (const edge of port.getIncomingEdges()) {
        if (edge.getSource()!.getNode() === target) { byTarget.set(target, edge); return edge }
      }
      for (const edge of port.getOutgoingEdges()) {
        if (edge.getTarget()!.getNode() === target) { byTarget.set(target, edge); return edge }
      }
    }
    return null
  }

  private getEdge(source: LNode, target: LNode): LEdge | null {
    return BKAligner.getEdge(source, target)
  }
}
