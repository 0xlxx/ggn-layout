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
 * SplineEdgeRouter (对应 ELK p5edges.splines.SplineEdgeRouter 的层间距计算部分).
 *
 * 移植范围: 层间 spline 段生成 (含 hyperedge 合并) + 依赖图断环/拓扑编号 → slotCount,
 * 层间距 increment = edgeNodeSpacing*2 + (slotCount-1)*edgeEdgeSpacing, SLOPPY 模式再用
 * computeSloppySpacing 取大 (ELK SplineEdgeRouter.java line 221-300, 461-484).
 *
 * 边路由占位: 不生成普通边 spline 弯点 (坐标差分只查节点位置), 但层间距/节点 x 与 ELK 一致.
 * 自环: 与现行 ELK 一样把 selfLoopsLayer 排除在段生成外; 对到达 P5 且尚未预路由 (无弯点)
 * 的自环边, 用 NubsSelfLoop 收尾生成样条弯点 (旧 ELK SplineEdgeRouter 966490b7 / 旧
 * SplineSelfLoopRouter 629b5f4c 曾在此用 NubsSelfLoop). 常规管线自环在 P1 被
 * SelfLoopPreprocessor 隐藏并由 SplineSelfLoopRouter 预路由, 故本路径在标准图上是空操作.
 */
import type { LGraph } from '../../graph/lgraph.js'
import type { Layer } from '../../graph/layer.js'
import type { LNode } from '../../graph/lnode.js'
import type { LPort } from '../../graph/lport.js'
import type { LEdge } from '../../graph/ledge.js'
import { NodeType, PortSide } from '../../graph/enums.js'
import {
  SPACING_NODE_NODE_BETWEEN_LAYERS,
  SPACING_EDGE_EDGE_BETWEEN_LAYERS,
  SPACING_EDGE_NODE_BETWEEN_LAYERS,
  EDGE_ROUTING_SPLINES_MODE,
  EDGE_ROUTING_SPLINES_SLOPPY_LAYER_SPACING_FACTOR,
} from '../../options/layered-options.js'
import { RANDOM, REVERSED, EXT_PORT_SIDE, SPLINE_ROUTE_START, SPLINE_EDGE_CHAIN } from '../../options/internal-properties.js'
import { placeNodesHorizontally } from '../layer-size-calculator.js'
import { SplineSegment, SplineDependency } from './spline-segment.js'
import { NubsSelfLoop } from './nubs-self-loop.js'
import type { JavaRandom } from '../../util/java-random.js'

/** 直线判定容差 (ELK SplineEdgeRouter.MAX_VERTICAL_DIFF_FOR_STRAIGHT, line 82). */
const MAX_VERTICAL_DIFF_FOR_STRAIGHT = 0.2
/** isBetween 容差 (ELK SplinesMath.EPSILON). */
const EPSILON = 1e-8

/** 自环收尾样条的最小外扩距离 (edgeNodeSpacing 过小时兜底; 旧 ELK MIN_SIDE_HEIGHT=15 量级). */
const MIN_SELF_LOOP_LENGTH = 20.0

type SideToProcess = 'LEFT' | 'RIGHT'

function isBetween(value: number, boundary0: number, boundary1: number): boolean {
  if (Math.abs(boundary0 - value) < EPSILON || Math.abs(boundary1 - value) < EPSILON) return true
  return boundary0 - value > EPSILON ? value - boundary1 > EPSILON : boundary1 - value > EPSILON
}

/** 两侧是否相邻 (一个水平侧 + 一个垂直侧; 同侧/相对侧均非相邻). */
function isAdjacentSide(a: PortSide, b: PortSide): boolean {
  if (a === b) return false
  const aHorizontal = a === PortSide.WEST || a === PortSide.EAST
  const bHorizontal = b === PortSide.WEST || b === PortSide.EAST
  return aHorizontal !== bHorizontal
}

/** ELK PolylineEdgeRouter.PRED_EXTERNAL_WEST_OR_EAST_PORT (line 65-71). */
function isExternalWestOrEastPort(node: LNode): boolean {
  return node.getType() === NodeType.EXTERNAL_PORT
    && (node.getProperty(EXT_PORT_SIDE) === PortSide.WEST || node.getProperty(EXT_PORT_SIDE) === PortSide.EAST)
}

export class SplineEdgeRouter {
  private edgesRemainingLayer: LEdge[] = []
  private splineSegmentsLayer: SplineSegment[] = []
  private leftPortsLayer: LPort[] = []
  private rightPortsLayer: LPort[] = []
  private selfLoopsLayer: Set<LEdge> = new Set()
  private startEdges: LEdge[] = []
  private allSplineSegments: SplineSegment[] = []
  private edgeToSegmentMap = new Map<LEdge, SplineSegment>()
  private successingEdge = new Map<LEdge, LEdge>()

  process(layeredGraph: LGraph): void {
    if (layeredGraph.getLayers().length === 0) {
      layeredGraph.getSize().x = 0
      return
    }

    // ELK line 192-201: 间距/模式选项.
    const nodeNodeSpacing = layeredGraph.getProperty(SPACING_NODE_NODE_BETWEEN_LAYERS)
    const edgeNodeSpacing = layeredGraph.getProperty(SPACING_EDGE_NODE_BETWEEN_LAYERS)
    const edgeEdgeSpacing = layeredGraph.getProperty(SPACING_EDGE_EDGE_BETWEEN_LAYERS)
    const mode = layeredGraph.getProperty(EDGE_ROUTING_SPLINES_MODE)
    const sloppyRouting = mode === 'SLOPPY'
    const sloppyLayerSpacingFactor = layeredGraph.getProperty(EDGE_ROUTING_SPLINES_SLOPPY_LAYER_SPACING_FACTOR)

    this.startEdges = []
    this.allSplineSegments = []
    this.successingEdge = new Map()

    // ELK line 208-214: 首/末层是否全为外部 W/E 端口.
    const layers = layeredGraph.getLayers()
    const firstLayer = layers[0]!
    const lastLayer = layers[layers.length - 1]!
    const isLeftLayerExternal = firstLayer.getNodes().length > 0 && firstLayer.getNodes().every(n => isExternalWestOrEastPort(n))
    const isRightLayerExternal = lastLayer.getNodes().length > 0 && lastLayer.getNodes().every(n => isExternalWestOrEastPort(n))

    let xpos = 0.0
    let leftLayer: Layer | null = null
    for (let li = 0; li <= layers.length; li++) {
      const rightLayer = li < layers.length ? layers[li]! : null

      this.clearThenFillMappings(leftLayer, rightLayer)
      this.createSegmentsAndComputeRanking(layeredGraph)

      // ELK line 231-235: 非直线段的最大 rank+1 → slotCount.
      let slotCount = 0
      for (const seg of this.splineSegmentsLayer) {
        if (!seg.isStraight) slotCount = Math.max(slotCount, seg.rank + 1)
      }

      // ELK line 241-273: 层间距 + 层定位.
      let xSegmentDelta = 0
      let rightLayerPosition = xpos
      const isSpecialLeftLayer = leftLayer === null || (isLeftLayerExternal && leftLayer === firstLayer)
      const isSpecialRightLayer = rightLayer === null || (isRightLayerExternal && rightLayer === lastLayer)

      if (slotCount > 0) {
        let increment = 0
        if (leftLayer !== null) increment += edgeNodeSpacing
        increment += (slotCount - 1) * edgeEdgeSpacing
        if (rightLayer !== null) increment += edgeNodeSpacing

        if (sloppyRouting && rightLayer !== null) {
          increment = Math.max(increment, this.computeSloppySpacing(rightLayer, edgeEdgeSpacing, nodeNodeSpacing, sloppyLayerSpacingFactor))
        }
        if (increment < nodeNodeSpacing && !isSpecialLeftLayer && !isSpecialRightLayer) {
          xSegmentDelta = (nodeNodeSpacing - increment) / 2
          increment = nodeNodeSpacing
        }
        rightLayerPosition += increment
      } else if (!isSpecialLeftLayer && !isSpecialRightLayer) {
        rightLayerPosition += nodeNodeSpacing
      }

      if (process.env.GGN_SPLINES_DBG) {
        const desc = this.splineSegmentsLayer.map(seg =>
          `seg[${seg.edges.length}e straight=${seg.isStraight} rank=${seg.rank} y=${seg.boundingBox.y.toFixed(2)} h=${seg.boundingBox.height.toFixed(2)}]`,
        ).join(' ')
        console.error(`[Splines] pair left=${leftLayer === null ? 'null' : leftLayer.getNodes().length} right=${rightLayer === null ? 'null' : rightLayer.getNodes().length} segments=${this.splineSegmentsLayer.length} slotCount=${slotCount} sloppySpacing=${sloppyRouting && rightLayer !== null ? this.computeSloppySpacing(rightLayer, edgeEdgeSpacing, nodeNodeSpacing, sloppyLayerSpacingFactor).toFixed(4) : 'n/a'} increment=${(rightLayerPosition - xpos).toFixed(4)} ${desc}`)
      }

      if (rightLayer !== null) {
        placeNodesHorizontally(rightLayer, rightLayerPosition)
      }

      // 自环收尾: 节点 x 已就位后再用 NubsSelfLoop 生成绝对坐标弯点 (见 routeSelfLoops 注释).
      this.routeSelfLoops(edgeNodeSpacing)

      // 段 bbox/xDelta 赋值 (ELK line 283-288) — 弯点生成占位, 保留状态.
      for (const segment of this.splineSegmentsLayer) {
        segment.boundingBox.x = xpos
        segment.boundingBox.width = rightLayerPosition - xpos
        segment.xDelta = xSegmentDelta
        segment.isWestOfInitialLayer = leftLayer === null
      }
      this.allSplineSegments.push(...this.splineSegmentsLayer)

      xpos = rightLayerPosition
      if (rightLayer !== null) xpos += rightLayer.getSize().x
      leftLayer = rightLayer
    }

    // ELK line 312: 图宽.
    layeredGraph.getSize().x = xpos

    // ★ ELK line 303-309: 为每条 startEdge 存边链 + spline 段链 (FinalSplineBendpointsCalculator 用).
    for (const edge of this.startEdges) {
      const edgeChain = this.getEdgeChain(edge)
      if (edgeChain.length > 0) edge.setProperty(SPLINE_EDGE_CHAIN, edgeChain)
      const chain = this.getSplinePath(edge)
      if (chain.length > 0) edge.setProperty(SPLINE_ROUTE_START, chain)
    }

    if (process.env.GGN_SPLINES_DBG) {
      console.error(`[Splines] nodeNode=${nodeNodeSpacing} edgeNode=${edgeNodeSpacing} edgeEdge=${edgeEdgeSpacing} sloppy=${sloppyRouting} factor=${sloppyLayerSpacingFactor} width=${xpos}`)
    }
  }

  /** 沿边链收集边 (对应 ELK SplineEdgeRouter.getEdgeChain, line 941-949). */
  private getEdgeChain(start: LEdge): LEdge[] {
    const edgeChain: LEdge[] = []
    let current: LEdge | null = start
    while (current !== null) {
      edgeChain.push(current)
      current = this.successingEdge.get(current) ?? null
    }
    return edgeChain
  }

  /** 沿边链收集 spline 段 + 标记首/末段 (对应 ELK SplineEdgeRouter.getSplinePath, line 951-977). */
  private getSplinePath(start: LEdge): SplineSegment[] {
    const segmentChain: SplineSegment[] = []
    let current: LEdge | null = start
    while (current !== null) {
      const segment = this.edgeToSegmentMap.get(current)
      if (!segment) break
      segment.sourcePort = current.getSource()
      segment.targetPort = current.getTarget()
      segmentChain.push(segment)
      current = this.successingEdge.get(current) ?? null
    }
    if (segmentChain.length > 0) {
      const initialSegment = segmentChain[0]!
      initialSegment.initialSegment = true
      initialSegment.sourceNode = initialSegment.edges[0]!.getSource()!.getNode()
      const lastSegment = segmentChain[segmentChain.length - 1]!
      lastSegment.lastSegment = true
      lastSegment.targetNode = lastSegment.edges[0]!.getTarget()!.getNode()
    }
    return segmentChain
  }

  /** 层对填充 (对应 ELK clearThenFillMappings, line 361-454). */
  private clearThenFillMappings(leftLayer: Layer | null, rightLayer: Layer | null): void {
    this.leftPortsLayer = []
    this.rightPortsLayer = []
    this.edgesRemainingLayer = []
    this.splineSegmentsLayer = []
    this.selfLoopsLayer = new Set()

    if (leftLayer !== null) {
      for (const node of leftLayer.getNodes()) {
        for (const sourcePort of node.getPorts(PortSide.EAST)) {
          this.leftPortsLayer.push(sourcePort)
          for (const edge of sourcePort.getOutgoingEdges()) {
            if (edge.isSelfLoop()) continue
            this.edgesRemainingLayer.push(edge)
            this.findAndAddSuccessor(edge)
            if (isQualifiedAsStartingNode(edge.getSource()!.getNode()!)) this.startEdges.push(edge)
            const targetPort = edge.getTarget()!
            const targetNode = targetPort.getNode()!
            const targetLayer = targetNode.getLayer()
            if (targetLayer === rightLayer) {
              this.rightPortsLayer.push(targetPort)
            } else if (targetLayer === leftLayer) {
              this.leftPortsLayer.push(targetPort)
            } else {
              // 同端口出入未支持 (ELK line 446-448).
              const idx = this.edgesRemainingLayer.indexOf(edge)
              if (idx !== -1) this.edgesRemainingLayer.splice(idx, 1)
            }
          }
        }
      }
    }

    if (rightLayer !== null) {
      for (const node of rightLayer.getNodes()) {
        // 自环 (ELK line 410-417).
        for (const port of node.getPorts()) {
          for (const edge of port.getOutgoingEdges()) {
            if (edge.isSelfLoop()) this.selfLoopsLayer.add(edge)
          }
        }
        for (const sourcePort of node.getPorts(PortSide.WEST)) {
          this.rightPortsLayer.push(sourcePort)
          for (const edge of sourcePort.getOutgoingEdges()) {
            if (edge.isSelfLoop()) continue
            this.edgesRemainingLayer.push(edge)
            this.findAndAddSuccessor(edge)
            if (isQualifiedAsStartingNode(edge.getSource()!.getNode()!)) this.startEdges.push(edge)
            const targetPort = edge.getTarget()!
            const targetNode = targetPort.getNode()!
            const targetLayer = targetNode.getLayer()
            if (targetLayer === rightLayer) {
              this.rightPortsLayer.push(targetPort)
            } else if (targetLayer === leftLayer) {
              this.leftPortsLayer.push(targetPort)
            } else {
              const idx = this.edgesRemainingLayer.indexOf(edge)
              if (idx !== -1) this.edgesRemainingLayer.splice(idx, 1)
            }
          }
        }
      }
    }
  }

  /**
   * 自环收尾路由 (接入 selfLoopsLayer 处理路径).
   *
   * 现行 ELK SplineEdgeRouter 只收集 selfLoopsLayer (排除自环, 不自建弯点 — 自环由
   * intermediate.SelfLoopRouter 在 P4 前路由). 旧 ELK (SplineEdgeRouter 966490b7 /
   * SplineSelfLoopRouter 629b5f4c) 用 NubsSelfLoop 在此生成自环样条. 本方法作为收尾:
   * 对到达 P5 且尚未预路由 (无弯点) 的自环边, 用 NubsSelfLoop 生成样条弯点:
   *  - 同侧端口 → createSideSelfLoop (沿侧方向外扩 length);
   *  - 相邻侧端口 → createCornerSelfLoop (拐角公式定第二 CP);
   *  - 相对侧/未定侧 → 跳过 (需预计算拐角弯点, 由 SelfLoopRouter 负责).
   * NubsSelfLoop 生成的是端口相对坐标 (port.position + anchor), 与旧 ELK 一致在 P5 补
   * 节点位置偏移得到绝对坐标. 常规管线自环在 P1 被 SelfLoopPreprocessor 隐藏并由
   * SplineSelfLoopRouter 预路由, 因此本路径在标准图上是空操作 (selfLoopsLayer 为空).
   */
  private routeSelfLoops(edgeNodeSpacing: number): void {
    if (this.selfLoopsLayer.size === 0) return
    const length = edgeNodeSpacing > 0 ? edgeNodeSpacing : MIN_SELF_LOOP_LENGTH
    for (const edge of this.selfLoopsLayer) {
      const source = edge.getSource()
      const target = edge.getTarget()
      if (source === null || target === null || edge.getBendPoints().length > 0) continue
      const sourceSide = source.getSide()
      const targetSide = target.getSide()
      if (sourceSide === PortSide.UNDEFINED || targetSide === PortSide.UNDEFINED) continue

      let nubs: NubsSelfLoop | null = null
      if (sourceSide === targetSide) {
        nubs = NubsSelfLoop.createSideSelfLoop(source, target, length)
      } else if (isAdjacentSide(sourceSide, targetSide)) {
        nubs = NubsSelfLoop.createCornerSelfLoop(source, target, length, length)
      }
      if (nubs === null) continue

      // 节点位置偏移 (旧 ELK SplineEdgeRouter 966490b7: "add the node offset to the bend points").
      const node = source.getNode()
      const offset = node !== null ? node.getPosition() : { x: 0, y: 0 }
      for (const bp of nubs.getBezierCP()) edge.getBendPoints().push({ x: bp.x + offset.x, y: bp.y + offset.y })
    }
  }

  /** 段生成 + 依赖 + 断环 + 拓扑编号 (对应 ELK createSegmentsAndComputeRanking, line 318-353). */
  private createSegmentsAndComputeRanking(layeredGraph: LGraph): void {
    this.createSplineSegmentsForHyperEdges('LEFT', true)
    this.createSplineSegmentsForHyperEdges('LEFT', false)
    this.createSplineSegmentsForHyperEdges('RIGHT', true)
    this.createSplineSegmentsForHyperEdges('RIGHT', false)
    this.createSplineSegments()

    // 依赖图 (ELK line 337-344).
    for (let i = 0; i < this.splineSegmentsLayer.length; i++) {
      const hyperEdge1 = this.splineSegmentsLayer[i]!
      for (let j = i + 1; j < this.splineSegmentsLayer.length; j++) {
        this.createDependency(hyperEdge1, this.splineSegmentsLayer[j]!)
      }
    }

    this.breakCycles(this.splineSegmentsLayer, layeredGraph.getProperty(RANDOM))
    this.topologicalNumbering(this.splineSegmentsLayer)
  }

  /** 单边段生成 (对应 ELK createSplineSegments, line 521-552). */
  private createSplineSegments(): void {
    for (const edge of this.edgesRemainingLayer) {
      const sourcePort = edge.getSource()!
      let sourceSide: SideToProcess
      if (this.leftPortsLayer.includes(sourcePort)) sourceSide = 'LEFT'
      else if (this.rightPortsLayer.includes(sourcePort)) sourceSide = 'RIGHT'
      else throw new Error('Source port must be in one of the port sets.')

      const targetPort = edge.getTarget()!
      let targetSide: SideToProcess
      if (this.leftPortsLayer.includes(targetPort)) targetSide = 'LEFT'
      else if (this.rightPortsLayer.includes(targetPort)) targetSide = 'RIGHT'
      else throw new Error('Target port must be in one of the port sets.')

      const seg = SplineSegment.fromSingleEdge(edge, sourceSide, targetSide, (a, b) => isStraight(a, b))
      this.edgeToSegmentMap.set(edge, seg)
      this.splineSegmentsLayer.push(seg)
    }
  }

  /** hyperedge 段生成 (对应 ELK createSplineSegmentsForHyperEdges, line 568-648). */
  private createSplineSegmentsForHyperEdges(sideToProcess: SideToProcess, reversed: boolean): void {
    const portsToProcess = sideToProcess === 'LEFT' ? this.leftPortsLayer : this.rightPortsLayer

    for (const singlePort of portsToProcess) {
      const singlePortPosition = singlePort.getAbsoluteAnchor().y
      const upEdges: { side: SideToProcess; edge: LEdge }[] = []
      const downEdges: { side: SideToProcess; edge: LEdge }[] = []

      for (const edge of singlePort.getConnectedEdges()) {
        if (edge.getProperty(REVERSED) !== reversed) continue
        if (this.edgesRemainingLayer.includes(edge)) {
          let targetPort: LPort
          if (edge.getTarget() === singlePort) targetPort = edge.getSource()!
          else targetPort = edge.getTarget()!

          const targetPortPosition = targetPort.getAbsoluteAnchor().y
          if (isStraight(targetPortPosition, singlePortPosition)) continue

          if (targetPortPosition < singlePortPosition) {
            upEdges.push({ side: this.leftPortsLayer.includes(targetPort) ? 'LEFT' : 'RIGHT', edge })
          } else {
            downEdges.push({ side: this.leftPortsLayer.includes(targetPort) ? 'LEFT' : 'RIGHT', edge })
          }
        }
      }

      if (upEdges.length > 1) {
        const seg = SplineSegment.fromHyperEdge(singlePort, upEdges, sideToProcess)
        for (const { edge } of upEdges) this.edgeToSegmentMap.set(edge, seg)
        this.splineSegmentsLayer.push(seg)
        for (const { edge } of upEdges) {
          const idx = this.edgesRemainingLayer.indexOf(edge)
          if (idx !== -1) this.edgesRemainingLayer.splice(idx, 1)
        }
      }
      if (downEdges.length > 1) {
        const seg = SplineSegment.fromHyperEdge(singlePort, downEdges, sideToProcess)
        for (const { edge } of downEdges) this.edgeToSegmentMap.set(edge, seg)
        this.splineSegmentsLayer.push(seg)
        for (const { edge } of downEdges) {
          const idx = this.edgesRemainingLayer.indexOf(edge)
          if (idx !== -1) this.edgesRemainingLayer.splice(idx, 1)
        }
      }
    }
  }

  /** 依赖建边 (对应 ELK createDependency, line 655-700). */
  private createDependency(edge0: SplineSegment, edge1: SplineSegment): void {
    if (edge0.hyperEdgeTopYPos > edge1.hyperEdgeBottomYPos || edge1.hyperEdgeTopYPos > edge0.hyperEdgeBottomYPos) {
      return
    }
    let edge0Counter = 0
    let edge1Counter = 0

    for (const port of edge0.rightPorts) {
      if (isBetween(port.getAbsoluteAnchor().y, edge1.hyperEdgeTopYPos, edge1.hyperEdgeBottomYPos)) edge0Counter++
    }
    for (const port of edge0.leftPorts) {
      if (isBetween(port.getAbsoluteAnchor().y, edge1.hyperEdgeTopYPos, edge1.hyperEdgeBottomYPos)) edge0Counter--
    }
    for (const port of edge1.rightPorts) {
      if (isBetween(port.getAbsoluteAnchor().y, edge0.hyperEdgeTopYPos, edge0.hyperEdgeBottomYPos)) edge1Counter++
    }
    for (const port of edge1.leftPorts) {
      if (isBetween(port.getAbsoluteAnchor().y, edge0.hyperEdgeTopYPos, edge0.hyperEdgeBottomYPos)) edge1Counter--
    }

    if (edge0Counter < edge1Counter) {
      new SplineDependency(edge0, edge1, edge1Counter - edge0Counter)
    } else if (edge1Counter < edge0Counter) {
      new SplineDependency(edge1, edge0, edge0Counter - edge1Counter)
    } else {
      new SplineDependency(edge1, edge0, 0)
      new SplineDependency(edge0, edge1, 0)
    }
  }

  /** 断环 (对应 ELK breakCycles, line 712-813). */
  private breakCycles(edges: SplineSegment[], random: JavaRandom | undefined): void {
    const sources: SplineSegment[] = []
    const sinks: SplineSegment[] = []

    let nextMark = -1
    for (const edge of edges) {
      edge.mark = nextMark--
      let inweight = 0
      let outweight = 0
      for (const dependency of edge.outgoing) outweight += dependency.weight
      for (const dependency of edge.incoming) inweight += dependency.weight
      edge.inweight = inweight
      edge.outweight = outweight
      if (outweight === 0) sinks.push(edge)
      else if (inweight === 0) sources.push(edge)
    }

    const unprocessed = new Set(edges)
    const markBase = edges.length
    let nextLeft = markBase + 1
    let nextRight = markBase - 1
    const maxEdges: SplineSegment[] = []

    while (unprocessed.size > 0) {
      while (sinks.length > 0) {
        const sink = sinks.shift()!
        unprocessed.delete(sink)
        sink.mark = nextRight--
        this.updateNeighbors(sink, sources, sinks)
      }

      while (sources.length > 0) {
        const source = sources.shift()!
        unprocessed.delete(source)
        source.mark = nextLeft++
        this.updateNeighbors(source, sources, sinks)
      }

      let maxOutflow = Number.MIN_SAFE_INTEGER
      for (const edge of unprocessed) {
        const outflow = edge.outweight - edge.inweight
        if (outflow >= maxOutflow) {
          if (outflow > maxOutflow) {
            maxEdges.length = 0
            maxOutflow = outflow
          }
          maxEdges.push(edge)
        }
      }

      if (maxEdges.length > 0) {
        const maxEdge = random !== undefined ? maxEdges[random.nextInt(maxEdges.length)]! : maxEdges[0]!
        unprocessed.delete(maxEdge)
        maxEdge.mark = nextLeft++
        this.updateNeighbors(maxEdge, sources, sinks)
        maxEdges.length = 0
      }
    }

    const shiftBase = edges.length + 1
    for (const edge of edges) {
      if (edge.mark < markBase) edge.mark += shiftBase
    }

    for (const source of edges) {
      const depIter = source.outgoing
      for (let i = depIter.length - 1; i >= 0; i--) {
        const dependency = depIter[i]!
        const target = dependency.target
        if (source.mark > target.mark) {
          depIter.splice(i, 1)
          const ti = target.incoming.indexOf(dependency)
          if (ti !== -1) target.incoming.splice(ti, 1)
          if (dependency.weight > 0) {
            dependency.source = target
            target.outgoing.push(dependency)
            dependency.target = source
            source.incoming.push(dependency)
          }
        }
      }
    }
  }

  /** 邻接更新 (对应 ELK updateNeighbors, line 824-846). */
  private updateNeighbors(edge: SplineSegment, sources: SplineSegment[], sinks: SplineSegment[]): void {
    for (const dep of edge.outgoing) {
      if (dep.target.mark < 0 && dep.weight > 0) {
        dep.target.inweight -= dep.weight
        if (dep.target.inweight <= 0 && dep.target.outweight > 0) sources.push(dep.target)
      }
    }
    for (const dep of edge.incoming) {
      if (dep.source.mark < 0 && dep.weight > 0) {
        dep.source.outweight -= dep.weight
        if (dep.source.outweight <= 0 && dep.source.inweight > 0) sinks.push(dep.source)
      }
    }
  }

  /** 拓扑编号 (对应 ELK topologicalNumbering, line 856-926). */
  private topologicalNumbering(edges: SplineSegment[]): void {
    const sources: SplineSegment[] = []
    const rightwardTargets: SplineSegment[] = []
    for (const edge of edges) {
      edge.rank = 0
      edge.inweight = edge.incoming.length
      edge.outweight = edge.outgoing.length
      if (edge.inweight === 0) sources.push(edge)
      if (edge.outweight === 0 && edge.leftPorts.length === 0) rightwardTargets.push(edge)
    }

    let maxRank = -1
    while (sources.length > 0) {
      const edge = sources.shift()!
      for (const dep of edge.outgoing) {
        const target = dep.target
        target.rank = Math.max(target.rank, edge.rank + 1)
        maxRank = Math.max(maxRank, target.rank)
        target.inweight--
        if (target.inweight === 0) sources.push(target)
      }
    }

    if (maxRank > -1) {
      for (const edge of rightwardTargets) edge.rank = maxRank

      while (rightwardTargets.length > 0) {
        const edge = rightwardTargets.shift()!
        for (const dep of edge.incoming) {
          const source = dep.source
          if (source.leftPorts.length > 0) continue
          source.rank = Math.min(source.rank, edge.rank - 1)
          source.outweight--
          if (source.outweight === 0) rightwardTargets.push(source)
        }
      }
    }
  }

  /** sloppy 层距 (对应 ELK computeSloppySpacing, line 461-484). */
  private computeSloppySpacing(
    rightLayer: Layer,
    edgeEdgeSpacing: number,
    nodeNodeSpacing: number,
    sloppyLayerSpacingFactor: number,
  ): number {
    let maxVertDiff = 0.0
    for (const node of rightLayer.getNodes()) {
      let maxCurrInputYDiff = 0.0
      for (const incomingEdge of node.getIncomingEdges()) {
        const sourcePos = incomingEdge.getSource()!.getAbsoluteAnchor().y
        const targetPos = incomingEdge.getTarget()!.getAbsoluteAnchor().y
        maxCurrInputYDiff = Math.max(maxCurrInputYDiff, Math.abs(targetPos - sourcePos))
      }
      maxVertDiff = Math.max(maxVertDiff, maxCurrInputYDiff)
    }
    return sloppyLayerSpacingFactor * Math.min(1.0, edgeEdgeSpacing / nodeNodeSpacing) * maxVertDiff
  }

  /** 找后继边 (对应 ELK findAndAddSuccessor, line 493-506). */
  private findAndAddSuccessor(edge: LEdge): void {
    const targetNode = edge.getTarget()!.getNode()!
    if (isNormalNode(targetNode)) return
    const iter = targetNode.getOutgoingEdges()
    if (iter.length > 0) this.successingEdge.set(edge, iter[0]!)
  }
}

/** 直线判定 (ELK SplineEdgeRouter.isStraight, line 937-939). */
export function isStraight(firstY: number, secondY: number): boolean {
  return Math.abs(firstY - secondY) < MAX_VERTICAL_DIFF_FOR_STRAIGHT
}

/** 正常节点 (ELK SplineEdgeRouter.isNormalNode, line 980-984). */
export function isNormalNode(node: LNode): boolean {
  const nt = node.getType()
  return nt === NodeType.NORMAL || nt === NodeType.BREAKING_POINT
}

/** 起始节点 (ELK SplineEdgeRouter.isQualifiedAsStartingNode, line 995-1001). */
export function isQualifiedAsStartingNode(node: LNode): boolean {
  const nt = node.getType()
  return nt === NodeType.NORMAL
    || nt === NodeType.NORTH_SOUTH_PORT
    || nt === NodeType.EXTERNAL_PORT
    || nt === NodeType.BREAKING_POINT
}
