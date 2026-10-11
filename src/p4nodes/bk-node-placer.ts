/*
 * Copyright (c) 2010, 2015 Kiel University and others.
 * Copyright (c) 2026 GGN contributors.
 *
 * This file is part of ggn-layout, a TypeScript port of the Eclipse Layout
 * Kernel (ELK, https://github.com/eclipse/elk). It is derived from ELK and is
 * made available under the terms of the Eclipse Public License 2.0.
 *
 * SPDX-License-Identifier: EPL-2.0
 * License text: LICENSES/EPL-2.0.txt — see also THIRD_PARTY_NOTICES.md.
 */
/**
 * BKNodePlacer (对应 ELK p4nodes.bk.BKNodePlacer).
 */
import type { LGraph } from '../graph/lgraph.js'
import type { LNode } from '../graph/lnode.js'
import { NodeType } from '../graph/enums.js'
import {
  NODE_PLACEMENT_BK_FIXED_ALIGNMENT,
  NODE_PLACEMENT_FAVOR_STRAIGHT_EDGES,
  FixedAlignment,
} from '../options/layered-options.js'
import { NeighborhoodInformation } from './neighborhood-information.js'
import { BKAlignedLayout, HDirection, VDirection } from './bk-aligned-layout.js'
import { BKAligner } from './bk-aligner.js'
import { BKCompactor } from './bk-compactor.js'

/** BK alignment size 平局容差 (浮点噪声吸收, 见选择循环注释). */
const BK_SIZE_EPSILON = 1e-6

/** 单个 BK 方向的计算结果 (方向复用后保留 y/innerShift 视图 + 尺寸). */
interface BKLayoutResult {
  vdir: VDirection | null
  hdir: HDirection | null
  y: Float64Array
  innerShift: Float64Array
  size: number
}

export class BKNodePlacer {
  private lGraph!: LGraph
  private markedEdges = new Set<number>()
  private ni!: NeighborhoodInformation
  private produceBalancedLayout = false

  private static readonly MIN_LAYERS_FOR_CONFLICTS = 3

  process(layeredGraph: LGraph): void {
    this.lGraph = layeredGraph
    this.ni = NeighborhoodInformation.buildFor(layeredGraph)

    const align = layeredGraph.getProperty(NODE_PLACEMENT_BK_FIXED_ALIGNMENT)
    const favorStraightEdges = layeredGraph.getProperty(NODE_PLACEMENT_FAVOR_STRAIGHT_EDGES)
    this.produceBalancedLayout = (align === FixedAlignment.NONE && !favorStraightEdges) || align === FixedAlignment.BALANCED

    this.markConflicts(layeredGraph)
    if (process.env.GGN_BK_IN) {
      // 插桩: P4 前层/节点顺序/端口 (对比 jar LoggedGraph 快照)
      for (const [li, l] of layeredGraph.getLayers().entries()) {
        const items = l.getNodes().map(n => {
          const nm = n.getLabels()[0]?.text ?? `d${n.id}`
          return `${nm}[${n.id}]`
        }).join(' ')
        console.error(`GGN_BK_IN layer=${li} nodes=${items}`)
      }
      for (const l of layeredGraph.getLayers()) {
        for (const n of l.getNodes()) {
          const nm = n.getLabels()[0]?.text ?? `d${n.id}`
          for (const p of n.getPorts()) {
            console.error(`GGN_BK_IN port ${nm}[${n.id}].${p.id} y=${p.getPosition().y} x=${p.getPosition().x} side=${p.getSide()}`)
          }
        }
      }
    }
    if (process.env.GGN_BK_DBG) {
      for (const l of layeredGraph.getLayers()) {
        for (const n of l.getNodes()) {
          const ports = n.getPorts().map(p => `${p.id}(${p.getPosition().y})`).join(' ')
          console.error(`GGN BK inPorts node=${n.id} ${ports}`)
        }
      }
    }
    // ── 方向复用 (簇 bk-node-placement): 单个 scratch BKAlignedLayout + 扁平 y/innerShift ──
    // 每个方向用 yAll/isAll 的一个 subarray 视图, 计算后保留 (y+innerShift) 结果;
    // root/align/sink/blockSize/shift/su/od 在方向间复用 (每次方向开始重置 su/od,
    // 其余数组由 verticalAlignment/insideBlockShift/horizontalCompaction 全量重写).
    // 顺序不变: 方向遍历/块遍历/邻居遍历与原 4 个独立 layout 完全一致 (ORDERED 红线内).
    const nodeCount = this.ni.nodeCount
    const dirs: Array<[VDirection, HDirection]> = []
    switch (align) {
      case FixedAlignment.LEFTDOWN:
        dirs.push([VDirection.DOWN, HDirection.LEFT])
        break
      case FixedAlignment.LEFTUP:
        dirs.push([VDirection.UP, HDirection.LEFT])
        break
      case FixedAlignment.RIGHTDOWN:
        dirs.push([VDirection.DOWN, HDirection.RIGHT])
        break
      case FixedAlignment.RIGHTUP:
        dirs.push([VDirection.UP, HDirection.RIGHT])
        break
      default:
        dirs.push([VDirection.DOWN, HDirection.RIGHT], [VDirection.UP, HDirection.RIGHT],
          [VDirection.DOWN, HDirection.LEFT], [VDirection.UP, HDirection.LEFT])
    }
    const nDirs = dirs.length
    const yAll = new Float64Array(nDirs * nodeCount)
    const isAll = new Float64Array(nDirs * nodeCount)
    const sizes = new Array<number>(nDirs)
    const scratch = new BKAlignedLayout(layeredGraph, nodeCount, null, null)
    const aligner = new BKAligner(layeredGraph, this.ni)
    const compacter = new BKCompactor(layeredGraph, this.ni)

    const results: BKLayoutResult[] = []
    for (let i = 0; i < nDirs; i++) {
      scratch.vdir = dirs[i]![0]
      scratch.hdir = dirs[i]![1]
      scratch.y = yAll.subarray(i * nodeCount, (i + 1) * nodeCount)
      scratch.innerShift = isAll.subarray(i * nodeCount, (i + 1) * nodeCount)
      scratch.su.fill(0)
      scratch.od.fill(1)
      aligner.verticalAlignment(scratch, this.markedEdges)
      aligner.insideBlockShift(scratch)
      if (process.env.GGN_BK_DBG) {
        const rootStr = scratch.root.map((r, j) => `${j}->${r ? r.id : '?'}`).join(' ')
        const alignStr = scratch.align.map((a, j) => `${j}->${a ? a.id : '?'}`).join(' ')
        const sinkStr = scratch.sink.map((s, j) => `${j}->${s ? s.id : '?'}`).join(' ')
        // eslint-disable-next-line no-console
        console.error(`GGN BK afterAlign vdir=${scratch.vdir} hdir=${scratch.hdir} root=[${rootStr}]`)
        console.error(`GGN BK   align=[${alignStr}]`)
        console.error(`GGN BK   sink=[${sinkStr}]`)
        const markedStr = [...this.markedEdges].join(' ')
        if (markedStr) console.error(`GGN BK markedEdges=[${markedStr}]`)
      }
      compacter.horizontalCompaction(scratch)
      sizes[i] = scratch.layoutSize()
      if (process.env.GGN_BK_FULL) {
        const nms = layeredGraph.getLayers().flatMap(l => l.getNodes()).map(n => `${n.id}:${scratch.y[n.id]}+${scratch.innerShift[n.id]} bs=${scratch.blockSize[scratch.root[n.id]?.id ?? -1]}`).join(' ')
        console.error(`GGN_BK_FULL ${scratch.vdir}/${scratch.hdir}: ${nms}`)
      }
      results.push({ vdir: dirs[i]![0], hdir: dirs[i]![1], y: scratch.y, innerShift: scratch.innerShift, size: sizes[i]! })
    }

    let chosenY: Float64Array | null = null
    let chosenIS: Float64Array | null = null
    let chosenSize = 0
    let chosenDesc = ''
    // 调试: GGN_BK_FORCE=down|up|downright 等强制方向 (格式 <vdir>/<hdir>, 0/0=DOWN/RIGHT 1/0=UP/RIGHT 0/1=DOWN/LEFT 1/1=UP/LEFT)
    if (process.env.GGN_BK_FORCE) {
      const f = process.env.GGN_BK_FORCE
      for (const r of results) {
        if (`${r.vdir}/${r.hdir}` === f) {
          chosenY = r.y
          chosenIS = r.innerShift
          chosenSize = r.size
          chosenDesc = `${r.vdir}/${r.hdir}`
          break
        }
      }
    }
    let balanced: BKAlignedLayout | null = null
    if (chosenY === null && this.produceBalancedLayout) {
      balanced = this.createBalancedLayout(this.lGraph, nodeCount, results)
      if (this.checkOrderConstraint(layeredGraph, balanced.y, balanced.innerShift)) {
        chosenY = balanced.y
        chosenIS = balanced.innerShift
        chosenSize = 0 // balanced 布局无 blockSize/root (仅 debug 打印用, 原实现此处亦无 layoutSize)
        chosenDesc = 'balanced'
      }
    }
    if (chosenY === null) {
      for (const r of results) {
        const ok = this.checkOrderConstraint(layeredGraph, r.y, r.innerShift)
        if (process.env.GGN_BK_DBG) console.error(`GGN BK feasible vdir=${r.vdir} hdir=${r.hdir} ok=${ok} size=${r.size}`)
        if (ok) {
          // 容差: 端口分布浮点噪声 (ggn 简化公式 vs ELK cell-system 累积, 末位差 ~1e-14) 会使
          // 本应相等的 4 个 alignment size 出现 ~3e-14 差异, 翻转平局选择 → 选中镜像布局 (±43px)。
          // ELK 语义: 平局取列表第一个 (RIGHTDOWN)。ε=1e-6 吸收噪声, 保持真实差异 (>ε) 语义不变。
          if (chosenY === null || chosenSize > r.size + BK_SIZE_EPSILON) {
            chosenY = r.y
            chosenIS = r.innerShift
            chosenSize = r.size
            chosenDesc = `${r.vdir}/${r.hdir}`
          }
        }
      }
    }
    if (chosenY === null) {
      chosenY = results[0]!.y
      chosenIS = results[0]!.innerShift
      chosenSize = results[0]!.size
      chosenDesc = `${results[0]!.vdir}/${results[0]!.hdir}`
    }
    if (process.env.GGN_BK_DBG) {
      const nm = (n: import('../graph/lnode.js').LNode) => String(n.id)
      for (const r of results) {
        const vals = layeredGraph.getLayers().flatMap(l => l.getNodes()).map(n => `${nm(n)}:${r.y[n.id]}`).join(' ')
        console.error(`GGN BK layout vdir=${r.vdir} hdir=${r.hdir} size=${r.size} y=[${vals}]`)
      }
      console.error(`GGN BK chosen=${chosenDesc} size=${chosenSize}`)
    }

    for (const layer of layeredGraph.getLayers()) {
      for (const node of layer.getNodes()) {
        node.position.y = chosenY![node.id] + chosenIS![node.id]
      }
    }

    scratch.cleanup()
    this.ni.cleanup()
    this.markedEdges.clear()
  }

  private markConflicts(layeredGraph: LGraph): void {
    const numberOfLayers = layeredGraph.getLayers().length
    if (numberOfLayers < BKNodePlacer.MIN_LAYERS_FOR_CONFLICTS) return

    const layerSize = layeredGraph.getLayers().map(l => l.getNodes().length)

    for (let i = 1; i < numberOfLayers - 1; i++) {
      const currentLayer = layeredGraph.getLayers()[i + 1]!
      let k_0 = 0
      let l = 0
      for (let l_1 = 0; l_1 < layerSize[i + 1]!; l_1++) {
        const v_l_i = currentLayer.getNodes()[l_1]!
        const incident = this.incidentToInnerSegment(v_l_i, i + 1, i)
        if (l_1 === layerSize[i + 1]! - 1 || incident) {
          let k_1 = layerSize[i]! - 1
          if (incident) {
            k_1 = this.ni.nodeIndex[this.ni.leftNeighbors[v_l_i.id]![0]!.first.id]!
          }
          while (l <= l_1) {
            const v_l = currentLayer.getNodes()[l]!
            if (!this.incidentToInnerSegment(v_l, i + 1, i)) {
              for (const upperNeighbor of this.ni.leftNeighbors[v_l.id]!) {
                const k = this.ni.nodeIndex[upperNeighbor.first.id]!
                if (k < k_0 || k > k_1) this.markedEdges.add(upperNeighbor.second.id)
              }
            }
            l++
          }
          k_0 = k_1
        }
      }
    }
  }

  private incidentToInnerSegment(node: LNode, layer1: number, layer2: number): boolean {
    if (node.getType() === NodeType.LONG_EDGE) {
      // 免分配: 直读端口入边数组 (原 getIncomingEdges 每次分配结果数组)
      for (const port of node.getPorts()) {
        for (const edge of port.getIncomingEdges()) {
          const sourceNodeType = edge.getSource()!.getNode()!.getType()
          if (sourceNodeType === NodeType.LONG_EDGE
            && this.ni.layerIndex[edge.getSource()!.getNode()!.getLayer()!.getIndex()] === layer2
            && this.ni.layerIndex[node.getLayer()!.getIndex()] === layer1) return true
        }
      }
    }
    return false
  }

  private createBalancedLayout(layeredGraph: LGraph, nodeCount: number, results: BKLayoutResult[]): BKAlignedLayout {
    const noOfLayouts = results.length
    const balanced = new BKAlignedLayout(layeredGraph, nodeCount, null, null)
    const width = new Array(noOfLayouts)
    const min = new Array(noOfLayouts)
    const max = new Array(noOfLayouts)
    let minWidthLayout = 0
    for (let i = 0; i < noOfLayouts; i++) {
      min[i] = Number.MAX_SAFE_INTEGER
      max[i] = Number.MIN_SAFE_INTEGER
    }

    for (let i = 0; i < noOfLayouts; i++) {
      const r = results[i]!
      width[i] = r.size
      if (width[minWidthLayout]! > width[i]!) minWidthLayout = i
      for (const layer of layeredGraph.getLayers()) {
        for (const n of layer.getNodes()) {
          const nodePosY = r.y[n.id] + r.innerShift[n.id]
          min[i] = Math.min(min[i]!, nodePosY)
          max[i] = Math.max(max[i]!, nodePosY + n.size.y)
        }
      }
    }

    const shift = new Array(noOfLayouts)
    for (let i = 0; i < noOfLayouts; i++) {
      if (results[i]!.vdir === VDirection.DOWN) shift[i] = min[minWidthLayout]! - min[i]!
      else shift[i] = max[minWidthLayout]! - max[i]!
    }

    const calculatedYs = new Array(noOfLayouts)
    for (const layer of layeredGraph.getLayers()) {
      for (const node of layer.getNodes()) {
        for (let i = 0; i < noOfLayouts; i++) {
          const r = results[i]!
          calculatedYs[i] = r.y[node.id] + r.innerShift[node.id] + shift[i]!
        }
        calculatedYs.sort((a, b) => a - b)
        balanced.y[node.id] = (calculatedYs[1]! + calculatedYs[2]!) / 2.0
        balanced.innerShift[node.id] = 0.0
      }
    }
    return balanced
  }

  private checkOrderConstraint(layeredGraph: LGraph, y: Float64Array, innerShift: Float64Array): boolean {
    let feasible = true
    for (const layer of layeredGraph.getLayers()) {
      let pos = Number.NEGATIVE_INFINITY
      for (const node of layer.getNodes()) {
        const top = y[node.id] + innerShift[node.id] - node.getMargin().top
        const bottom = y[node.id] + innerShift[node.id] + node.size.y + node.getMargin().bottom
        if (top > pos && bottom > pos) {
          pos = bottom
        } else {
          feasible = false
          break
        }
      }
      if (!feasible) break
    }
    return feasible
  }
}
