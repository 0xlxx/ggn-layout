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
 * CompoundGraphPostprocessor (对应 ELK compound.CompoundGraphPostprocessor).
 * 合并拆分后的跨层级边段, 恢复原始边的连接与 bendPoints (坐标转换到引用图).
 */
import type { LGraph } from '../graph/lgraph.js'
import type { LEdge } from '../graph/ledge.js'
import type { LNode } from '../graph/lnode.js'
import type { KVector } from '../graph/enums.js'
import { CROSS_HIERARCHY_MAP, TARGET_OFFSET, ORIGIN, EXT_PORT_SIDE } from '../options/internal-properties.js'
import { JUNCTION_POINTS, UNNECESSARY_BENDPOINTS, HIERARCHY_HANDLING, DIRECTION } from '../options/layered-options.js'
import { CrossHierarchyEdge } from './cross-hierarchy-edge.js'
import { compareCrossHierarchyEdges } from './cross-hierarchy-edge-comparator.js'
import { coordSystemOffset, lcaNodeOf } from '../graph/lgraph-util.js'
import { NodeType, PortSide, Direction } from '../graph/enums.js'

const TOLERANCE = 1e-3

export function processCompoundGraphPost(graph: LGraph): void {
    const addUnnecessaryBendpoints = graph.getProperty(UNNECESSARY_BENDPOINTS)
    const crossHierarchyMap = graph.getProperty(CROSS_HIERARCHY_MAP)
    if (crossHierarchyMap === undefined || crossHierarchyMap === null) return

    
    const dummyEdges = new Set<LEdge>()

    for (const [origEdge, chEdgesUnsorted] of crossHierarchyMap) {
      const chEdges = [...chEdgesUnsorted].sort((a, b) => compareCrossHierarchyEdges(a, b, graph))
      if (chEdges.length === 0) continue

      const sourcePort = chEdges[0]!.getActualSource()
      const targetPort = chEdges[chEdges.length - 1]!.getActualTarget()
      if (sourcePort === null || targetPort === null) continue

      // 合并坐标系统一为「边挂载容器 (LCA 容器节点) 内容图」— 与提取层 lcaNode (elk-json.ts)
      // + getEdgeEndpoints 的端点坐标系一致 (ELK transferrer 用 COORDINATE_SYSTEM_ORIGIN 做层级偏移,
      // ggn 提取层直接读边坐标, 故合并阶段就必须落在最终挂载容器坐标系).
      // ELK 用 sourcePort 所在图做 reference (转移时再层级偏移), 对「源深于 LCA 的跨分支边」
      // (288b NN7.N2.N1->NN7.N4 / 352 NN2.M1->NN3) 会留下 reference(源图)≠挂载容器(父图) 的差 —
      // jar 段边弯点直接就是挂载容器坐标 (197.33,50.33)/(218.67,50.33), ggn 旧逻辑 srcOff 用
      // graphParentOffset 上溯 (方向反) 得到 +12,+12 → sourcePoint 错误 (209.33,62.33).
      const referenceNode = sourcePort.getNode()!
      // 自环 (源=目标): 挂载容器 = 节点所在图的父容器 (elk-json.ts lcaNode 自环例外) —
      // 298 SEPARATE inside 自环挂 root.edges, 合并必须落在 root 坐标 (nested 坐标会差 NN1.pos).
      let container: LNode | null
      if (referenceNode === targetPort.getNode()!) {
        container = referenceNode.getGraph()?.getParentNode() ?? null
      } else {
        container = lcaNodeOf(referenceNode, targetPort.getNode()!)
      }
      let referenceGraph: LGraph
      if (container !== null) {
        referenceGraph = container.getNestedGraph()!
      } else {
        // 无共同祖先节点 → 挂 root 容器: 取源端口所在图的最顶层图.
        referenceGraph = referenceNode.getGraph()!
        while (referenceGraph.getParentNode() !== null) {
          referenceGraph = referenceGraph.getParentNode()!.getGraph()!
        }
      }

      const junctionPoints = clearJunctionPoints(origEdge, chEdges)
      origEdge.getBendPoints().length = 0

      let lastPoint: KVector | null = null
      for (const chEdge of chEdges) {
        // 段边弯点坐标系取决于段所在图 (ggn 两种嵌套图坐标约定):
        //   - 真实嵌套图 (有 NORMAL 内容): 节点/弯点 = 父节点相对坐标 (不含 padding) →
        //     graphParentOffset (352 M1->NN4 内段弯点 (268,32),(268,42) rel N2 → 根 (375,54),(375,64));
        //   - 纯外部端口 dummy 的 inside-self-loop 嵌套图 (prepareInsideSelfLoopsRecursive):
        //     content 坐标 (0,0 = 节点内容区左上) → coordSystemOffset (含 padding)
        //     (298 P2->P5 内段弯点 (0,10) content → 根 (44,34) = +NN1.pos+padding).
        const segHasNormal = chEdge.getGraph().getAllNodes().some(n => n.getType() === NodeType.NORMAL)
        const offset = segHasNormal
          ? graphParentOffset(chEdge.getGraph(), referenceGraph)
          : coordSystemOffset(chEdge.getGraph(), referenceGraph)

        const ledge = chEdge.getNewEdge()
        const bendPoints: KVector[] = ledge.getBendPoints().map(bp => ({ x: bp.x + offset.x, y: bp.y + offset.y }))

        // ggn 坐标系统一 (hierarchicalEdges 斜线根因):
        //   NORMAL 节点被 resizeParentNode 平移 → position 含 padding, getAbsoluteAnchor 含 padding,
        //     转 referenceGraph 用"父节点 position 累加"(不含 padding) → 含 padding 输出;
        //   EXTERNAL_PORT dummy 不平移 → position 是 content, getAbsoluteAnchor 是 content,
        //     转 referenceGraph 用 coordSystemOffset (含 padding) → 同样含 padding 输出.
        // 段边弯点 (P5 生成) 是 content, 用 coordSystemOffset (含 padding).
        const segGraph = chEdge.getGraph()
        const parentOffset = graphParentOffset(segGraph, referenceGraph)
        const segOffset = coordSystemOffset(segGraph, referenceGraph)
        const srcNode = ledge.getSource()!.getNode()
        const tgtNode = ledge.getTarget()!.getNode()
        // INCLUDE_CHILDREN 路径: resizeParentNode 把 canonical W-E 外部端口 dummy 的 y 与 NORMAL
        // 内容节点同步平移 (同 padding 约定) → 锚点偏移用 parentOffset (hierarchy01: N1_1 dummy
        // (138,35) 对齐端口绝对 y, 段边水平, 合并不再把源点当必要弯点); canonical N-S dummy 不平移
        // → 保持 content 约定用 segOffset. Phase D 方向变换后侧会变 (DOWN/UP: canonical W-E → 当前
        // N/S; LEFT: 镜像保持 W/E), 故按变换后的侧判定"是否被平移过". SEPARATE 路径全部保持 content.
        const includeChildren = graph.getProperty(HIERARCHY_HANDLING) === 'INCLUDE_CHILDREN'
        const dir = graph.getProperty(DIRECTION)
        const isTranslatedWEDummy = (n: LNode | null): boolean => {
          if (n === null || n.getType() !== NodeType.EXTERNAL_PORT) return false
          const side = n.getProperty(EXT_PORT_SIDE)
          if (dir === Direction.DOWN || dir === Direction.UP) {
            return side === PortSide.NORTH || side === PortSide.SOUTH
          }
          return side === PortSide.WEST || side === PortSide.EAST
        }
        const endpointOffset = (n: LNode | null): KVector => {
          if (n !== null && n.getType() === NodeType.EXTERNAL_PORT) {
            return includeChildren && isTranslatedWEDummy(n) ? parentOffset : segOffset
          }
          return parentOffset
        }
        const srcOff = endpointOffset(srcNode)
        const tgtOff = endpointOffset(tgtNode)
        const srcAbs = ledge.getSource()!.getAbsoluteAnchor()
        const tgtAbs = ledge.getTarget()!.getAbsoluteAnchor()
        const sourcePoint: KVector = {
          x: srcAbs.x + srcOff.x,
          y: srcAbs.y + srcOff.y,
        }
        const targetPoint: KVector = {
          x: tgtAbs.x + tgtOff.x,
          y: tgtAbs.y + tgtOff.y,
        }
        if (process.env.GGN_POST_DBG) {
          console.error(`[POST] src=${nameOf(ledge.getSource()!.getNode())} abs=(${srcAbs.x.toFixed(1)},${srcAbs.y.toFixed(1)}) +off(${srcOff.x.toFixed(1)},${srcOff.y.toFixed(1)}) => sp=(${sourcePoint.x.toFixed(1)},${sourcePoint.y.toFixed(1)}) | tgt=${nameOf(ledge.getTarget()!.getNode())} abs=(${tgtAbs.x.toFixed(1)},${tgtAbs.y.toFixed(1)}) +off(${tgtOff.x.toFixed(1)},${tgtOff.y.toFixed(1)}) => tp=(${targetPoint.x.toFixed(1)},${targetPoint.y.toFixed(1)})`)
        }

        if (lastPoint !== null) {
          const nextPoint = bendPoints.length > 0 ? bendPoints[0]! : targetPoint
          const xDiffEnough = Math.abs(lastPoint.x - nextPoint.x) > TOLERANCE
          const yDiffEnough = Math.abs(lastPoint.y - nextPoint.y) > TOLERANCE
          if ((!addUnnecessaryBendpoints && xDiffEnough && yDiffEnough)
            || (addUnnecessaryBendpoints && (xDiffEnough || yDiffEnough))) {
            origEdge.getBendPoints().push({ ...sourcePoint })
          }
        }

        origEdge.getBendPoints().push(...bendPoints)
        lastPoint = bendPoints.length > 0 ? bendPoints[bendPoints.length - 1]! : sourcePoint

        if (junctionPoints !== null) {
          const ledgeJPs = ledge.getProperty(JUNCTION_POINTS)
          if (ledgeJPs !== null && ledgeJPs !== undefined) {
            for (const jp of ledgeJPs as { x: number; y: number }[]) {
              junctionPoints.push({ x: jp.x + offset.x, y: jp.y + offset.y })
            }
          }
        }

        if (chEdge.getActualTarget() === targetPort) {
          const tgtNode = targetPort.getNode()!
          const targetGraph = tgtNode.getGraph()!
          // ggn getAbsoluteAnchor 的节点 position 已含 padding (Java 是 content 相对):
          // NORMAL 目标节点 → TARGET_OFFSET 必须用「父节点 position 累加」(不含 padding),
          //   否则 getEdgeEndpoints 双计 padding (hierarchicalEdges: (138,48) vs (114,24) +24 实证,
          //   jar 目标端点 (126,51) vs ggn (150,75));
          // EXTERNAL_PORT dummy (position 是 content) → 与段边弯点同约定用 coordSystemOffset (含 padding).
          const tOffset = tgtNode.getType() === NodeType.EXTERNAL_PORT
            ? coordSystemOffset(targetGraph, referenceGraph)
            : graphParentOffset(targetGraph, referenceGraph)
          origEdge.setProperty(TARGET_OFFSET, tOffset)
        }

        // copyLabelsBack (Java CompoundGraphPostprocessor.java:238-257): 段边标签拷回原跨层级边.
        // TS LEdgeLabel 无 propertyMap (无法设 ORIGINAL_LABEL_EDGE), 段边标签均来自该 origEdge
        // (CGP removeOriginalEdges 移动), 无条件拷贝 + 坐标转换 (offset 到 referenceGraph).
        for (const label of [...ledge.getLabels()]) {
          label.position.x += offset.x
          label.position.y += offset.y
          origEdge.getLabels().push(label)
        }
        ledge.getLabels().length = 0

        dummyEdges.add(ledge)
      }

      origEdge.setSource(sourcePort)
      origEdge.setTarget(targetPort)
    }

    for (const dummyEdge of dummyEdges) {
      dummyEdge.setSource(null)
      dummyEdge.setTarget(null)
    }
  }

function clearJunctionPoints(origEdge: LEdge, chEdges: CrossHierarchyEdge[]): { x: number; y: number }[] | null {
    const hasJP = chEdges.some(ch => {
      const jps = ch.getNewEdge().getProperty(JUNCTION_POINTS)
      return jps !== null && jps !== undefined && jps.length > 0
    })
    let junctionPoints = origEdge.getProperty(JUNCTION_POINTS) as { x: number; y: number }[] | null
    if (hasJP) {
      if (junctionPoints === null || junctionPoints === undefined) {
        junctionPoints = []
        origEdge.setProperty(JUNCTION_POINTS, junctionPoints)
      } else {
        junctionPoints.length = 0
      }
    } else if (junctionPoints !== null && junctionPoints !== undefined) {
      origEdge.setProperty(JUNCTION_POINTS, null)
      junctionPoints = null
    }
    return junctionPoints
  }

/** 端点偏移: 从 graph 累加父节点 position 直到 target (不含 padding; ggn 节点坐标已含 padding). */
function graphParentOffset(graph: LGraph, target: LGraph): KVector {
  const v: KVector = { x: 0, y: 0 }
  let g: LGraph | null = graph
  while (g !== null && g !== target) {
    const parent = g.getParentNode()
    if (parent === null) break
    v.x += parent.position.x
    v.y += parent.position.y
    g = parent.getGraph()
  }
  return v
}

function nameOf(n: LNode | null): string {
  if (n === null) return '?'
  const o = n.getProperty(ORIGIN)
  return o && typeof o === 'object' && 'id' in o ? String(o.id) : String(n.id)
}
