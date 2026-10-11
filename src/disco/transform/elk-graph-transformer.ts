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
 * ElkGraphTransformer — alg.disco.transform.ElkGraphTransformer (0.12.0).
 * ElkNode JSON → DCGraph; 压缩后把新布局应用回原图 (节点/端口/标签/边 section).
 *
 * 输入坐标语义: elktToElkJson 不发射节点 x/y (ElkGraphJson 同: position 仅为 property),
 * 故 importGraph 中所有元素坐标均为 0 — 分量在原点完全重叠, 打包算法将其摊开.
 */
import { KVector } from '../../force/kvector.js'
import { KVectorChain } from '../geometry.js'
import { DCDirection } from '../graph/dc-direction.js'
import { DCElement } from '../graph/dc-element.js'
import { DCExtension } from '../graph/dc-extension.js'
import { DCGraph } from '../graph/dc-graph.js'
import { EDGE_THICKNESS, optNum } from '../options.js'
import { ElkGraphComponentsProcessor, findNodeById, nodeIdOf, portIdOf } from './elk-graph-components-processor.js'
import type { ElkEdge, ElkEdgeSection, ElkNode, ElkPort } from '../../api/elk-json.js'

/** ELK JSON 标签形态 (ElkNode.labels 元素; 节点/端口/边标签共用). */
interface ElkLabel {
  text: string
  x?: number
  y?: number
  width?: number
  height?: number
}

const HALF_PI = Math.PI / 2

/** ELK JSON 中 shape 的 x/y/width/height (ElkNode/ElkLabel/ElkPort 通用). */
interface ElkShape {
  x?: number
  y?: number
  width?: number
  height?: number
}

export class ElkGraphTransformer {
  /** 原图的层次父节点 (本节点). */
  private parent: ElkNode | null = null
  /** 原图元素 → DCElement (仅当坐标需要在分量移动时改变; 不含端口与节点/端口标签). */
  private elementMapping = new Map<object, DCElement>()
  private incomingExtensionsMapping = new Map<ElkEdge, DCExtension>()
  private outgoingExtensionsMapping = new Map<ElkEdge, DCExtension>()
  /** 转换后的 DCGraph. */
  private transformedGraph: DCGraph | null = null
  private componentSpacing = 0.0

  constructor(componentSpacing = 0.0) {
    this.componentSpacing = componentSpacing
  }

  importGraph(graph: ElkNode): DCGraph {
    this.parent = graph
    // Split graph into components
    const components = ElkGraphComponentsProcessor.split(graph)
    // This list of lists is used to construct the DCGraph from its smallest units, so called DCElements.
    const result: DCElement[][] = []

    for (const component of components) {
      // Each of the subResult lists will represent a connected component in the DCGraph.
      const subResult: DCElement[] = []
      result.push(subResult)
      const edgeSet = new Set<ElkEdge>()
      for (const node of component) {
        // "true" indicates - we need to consider the position of ElkNodes when applying the new layout of the
        // DCGraph back to the KGraph.
        const componentNode = this.importElkShape(node, true, 0.0, 0.0)
        subResult.push(componentNode)

        // Compute offset for labels (used for computing absolute position)
        const nodeX = node.x ?? 0
        const nodeY = node.y ?? 0

        // For use in the Debugview only
        componentNode.setParentCoords(new KVector(nodeX, nodeY))

        // next look at all labels of this ElkNode ...
        for (const label of node.labels ?? []) {
          // "false" indicates - ElkLabels belonging to nodes have coordinates relative to their ElkNode. So don't
          // adjust their position when applying the layout of the DCGraph back to the KGraph.
          const componentLabel = this.importElkShape(label, false, nodeX, nodeY)
          subResult.push(componentLabel)
        }

        // ... then the ports of the ElkNode
        for (const port of node.ports ?? []) {
          // "false" - ElkPorts have coordinates relative to their ElkNode
          const componentPort = this.importElkShape(port, false, nodeX, nodeY)
          subResult.push(componentPort)

          // ElkPorts can have labels, too!
          // Compute offset for labels of ElkPorts
          const portX = (port.x ?? 0) + nodeX
          const portY = (port.y ?? 0) + nodeY

          for (const label of (port as { labels?: ElkLabel[] }).labels ?? []) {
            // false - ElkLabels have coordinates relative to their ElkPort
            const componentLabel = this.importElkShape(label, false, portX, portY)
            subResult.push(componentLabel)
          }
        }

        for (const e of this.allIncidentEdges(graph, node)) edgeSet.add(e)
      }
      this.importElkEdges(edgeSet, subResult)
    }
    // Finally create the DCGraph
    const layoutOptions = { ...(graph.layoutOptions ?? {}), ...(graph.properties ?? {}) }
    this.transformedGraph = new DCGraph(result, this.componentSpacing / 2, layoutOptions)

    return this.transformedGraph
  }

  applyLayout(): void {
    const graphDimensions = this.transformedGraph!.getDimensions()
    const newWidth = graphDimensions.x
    const newHeight = graphDimensions.y

    const oldWidth = this.parent!.width ?? 0
    const oldHeight = this.parent!.height ?? 0

    // Adjust size of layout
    this.parent!.width = graphDimensions.x
    this.parent!.height = graphDimensions.y

    const xFactor = newWidth / oldWidth
    const yFactor = newHeight / oldHeight

    for (const label of this.parent!.labels ?? []) {
      label.x = (label.x ?? 0) * xFactor
      label.y = (label.y ?? 0) * yFactor
    }

    for (const port of this.parent!.ports ?? []) {
      const px = port.x ?? 0
      const py = port.y ?? 0

      if (px > 0) {
        port.x = px * xFactor
      }
      if (py > 0) {
        port.y = py * yFactor
      }
    }

    // Apply offsets, whenever necessary.
    for (const [elem, poly] of this.elementMapping) {
      this.applyOffset(elem, poly)
    }

    const adjustedPorts: ElkPort[] = []

    for (const [edge, ext] of this.incomingExtensionsMapping) {
      const dir = ext.getDirection()
      const edgeSection = this.firstEdgeSection(edge)
      const newPoints = this.adjustFirstSegment(this.getSourceNode(this.parent!, edge), this.createVectorChain(edgeSection), dir)
      this.applyVectorChain(newPoints, edgeSection)

      const portToAdjust = this.getSourcePort(this.parent!, edge)
      if (portToAdjust !== undefined && !adjustedPorts.includes(portToAdjust)) {
        adjustedPorts.push(portToAdjust)
        this.adjustRelatedPort(portToAdjust, newPoints.getFirst(), dir)
      }
    }
    for (const [edge, ext] of this.outgoingExtensionsMapping) {
      const dir = ext.getDirection()
      const edgeSection = this.firstEdgeSection(edge)
      const newPoints = this.adjustFirstSegment(this.getTargetNode(this.parent!, edge),
        KVectorChain.of(this.createVectorChain(edgeSection).toArray()).reverse(), dir)
      const reversed = KVectorChain.of(newPoints.toArray()).reverse()
      this.applyVectorChain(reversed, edgeSection)

      const portToAdjust = this.getTargetPort(this.parent!, edge)
      if (portToAdjust !== undefined && !adjustedPorts.includes(portToAdjust)) {
        adjustedPorts.push(portToAdjust)
        this.adjustRelatedPort(portToAdjust, reversed.getLast(), dir)
      }
    }
  }

  // ── Private helper methods ──

  /**
   * 压缩后调整端口位置 (DisCo 目前仅支持 fixed side port constraint).
   * dir 即端口所在父节点侧.
   */
  private adjustRelatedPort(port: ElkPort, edgePoint: KVector, dir: DCDirection): void {
    if (DCDirection.isHorizontal(dir)) {
      port.y = edgePoint.y - ((port.height ?? 0) / 2)
    } else { // dir is vertical
      port.x = edgePoint.x - ((port.width ?? 0) / 2)
    }
  }

  /** 把 ElkNode/ElkLabel/ElkPort 转换为 DCElement (坐标转绝对). */
  private importElkShape(element: ElkShape, considerWhenApplyingOffset: boolean, offsetX: number, offsetY: number): DCElement {
    const halfComponentSpacing = this.componentSpacing / 2
    const x0 = (element.x ?? 0) + offsetX - halfComponentSpacing
    const y0 = (element.y ?? 0) + offsetY - halfComponentSpacing
    const x1 = x0 + (element.width ?? 0) + this.componentSpacing
    const y1 = y0 + (element.height ?? 0) + this.componentSpacing

    const coords = new KVectorChain()
    coords.add(new KVector(x0, y0))
    coords.add(new KVector(x0, y1))
    coords.add(new KVector(x1, y1))
    coords.add(new KVector(x1, y0))

    const shape = new DCElement(coords)

    if (considerWhenApplyingOffset) {
      this.elementMapping.set(element, shape)
    }

    return shape
  }

  /** 把 ElkEdge 转换为 DCElement (含其标签). */
  private importElkEdge(edge: ElkEdge, newComponent: DCElement[]): DCElement {
    const edgeSection = this.firstEdgeSection(edge)
    const points = this.createVectorChain(edgeSection)

    const thickness = optNum(edge, EDGE_THICKNESS)
    const contour = this.getContour(points.toArray(), thickness + this.componentSpacing)

    const shape = new DCElement(contour)
    this.elementMapping.set(edge, shape)
    newComponent.push(shape)

    // ElkEdges can have labels, too!
    for (const label of (edge as { labels?: ElkLabel[] }).labels ?? []) {
      // "true" - ElkLabels belonging to an ElkEdge have absolute coordinates and have to be considered when applying
      // changes to the DCGraph back to the original graph.
      const componentLabel = this.importElkShape(label, true, 0.0, 0.0)
      newComponent.push(componentLabel)
    }

    return shape
  }

  /** 把短层级 ElkEdge 转换为 DCExtension (含其标签). */
  private importExtension(edge: ElkEdge, newComponent: DCElement[], outgoingExtension: boolean): void {
    const edgeSection = this.firstEdgeSection(edge)
    let points = this.createVectorChain(edgeSection)

    if (outgoingExtension) {
      points = KVectorChain.of(points.toArray()).reverse()
    }

    // Is going to hold the extension
    let shape: DCElement

    const thickness = optNum(edge, EDGE_THICKNESS)

    const outerPoint = points.getFirst()
    const innerPoint = points.get(1)

    if (points.size() > 2) {
      const fixedEdgePoints = points.toArray().slice(1)

      const contour = this.getContour(fixedEdgePoints, thickness + this.componentSpacing)
      shape = new DCElement(contour)
      newComponent.push(shape)
    } else {
      if (outgoingExtension) {
        shape = this.elementMapping.get(this.getSourceNode(this.parent!, edge))!
      } else {
        shape = this.elementMapping.get(this.getTargetNode(this.parent!, edge))!
      }
    }

    // Construct the extension and add to mapping
    let extParent = this.getSourceNode(this.parent!, edge)
    if (outgoingExtension) {
      extParent = this.getTargetNode(this.parent!, edge)
    }
    const dir = this.nearestSide(outerPoint, extParent)
    let extensionWidth = thickness + this.componentSpacing
    let middlePos: KVector

    if (DCDirection.isHorizontal(dir)) { // West or east extension
      extensionWidth += Math.abs(outerPoint.y - innerPoint.y)
      middlePos = new KVector(innerPoint.x, (innerPoint.y + outerPoint.y) / 2)
    } else {
      extensionWidth += Math.abs(outerPoint.x - innerPoint.x)
      middlePos = new KVector((innerPoint.x + outerPoint.x) / 2, innerPoint.y)
    }

    if (outgoingExtension) {
      this.outgoingExtensionsMapping.set(edge, new DCExtension(shape, dir, middlePos, extensionWidth))
    } else {
      this.incomingExtensionsMapping.set(edge, new DCExtension(shape, dir, middlePos, extensionWidth))
    }
    this.elementMapping.set(edge, shape)

    // ElkEdges can have labels, too!
    for (const label of (edge as { labels?: ElkLabel[] }).labels ?? []) {
      const componentLabel = this.importElkShape(label, true, 0.0, 0.0)
      newComponent.push(componentLabel)
    }
  }

  /** 给定相对节点左上角的点, 计算其最近的一侧. */
  private nearestSide(point: KVector, node: ElkNode): DCDirection {
    let distance: number
    let shortestDistance = Number.MAX_VALUE
    let result: DCDirection = DCDirection.NORTH

    // NORTHVALUE
    shortestDistance = Math.abs(point.y)
    // SOUTHVALUE
    distance = Math.abs((node.height ?? 0) - point.y)
    if (distance < shortestDistance) {
      shortestDistance = distance
      result = DCDirection.SOUTH
    }
    // WESTVALUE
    distance = Math.abs(point.x)
    if (distance < shortestDistance) {
      shortestDistance = distance
      result = DCDirection.WEST
    }
    // EASTVALUE
    distance = Math.abs((node.width ?? 0) - point.x)
    if (distance < shortestDistance) {
      shortestDistance = distance
      result = DCDirection.EAST
    }
    return result
  }

  /** 转换同一连通分量的多条边 (及标签), 加入目标集合. */
  private importElkEdges(edges: Set<ElkEdge>, newComponent: DCElement[]): void {
    for (const edge of edges) {
      // For Edges, you always have to check, if the corresponding DCElement already exists.
      const componentEdge = this.elementMapping.get(edge)
      if (componentEdge === undefined) {
        const srcNode = this.getSourceNode(this.parent!, edge)
        const tgtNode = this.getTargetNode(this.parent!, edge)
        if (srcNode.id === tgtNode.id || parentId(srcNode) === parentId(tgtNode)) {
          this.importElkEdge(edge, newComponent)
        } else if (srcNode.id === parentId(tgtNode)) {
          if (this.incomingExtensionsMapping.get(edge) === undefined
            && this.elementMapping.get(tgtNode) !== undefined) { // otherwise the extension has already been taken care of
            this.importExtension(edge, newComponent, false)
          }
        } else {
          // outGoingExtensions
          if (this.outgoingExtensionsMapping.get(edge) === undefined
            && this.elementMapping.get(srcNode) !== undefined) { // otherwise the extension has already been taken care of
            this.importExtension(edge, newComponent, true)
          }
        }
      }
    }
  }

  /**
   * 给定边全部源/弯/目标点, 计算构造多边形 DCElement 所需全部顶点.
   */
  private getContour(edgePoints: KVector[], thickness: number): KVectorChain {
    const ccwPoints: KVector[] = []
    const cwPoints: KVector[] = []
    const radius = thickness / 2

    const numberOfPoints = edgePoints.length

    // special case: first edge segment. Assumption an edge has at least two points
    let predecessor: KVector
    let current = edgePoints[0]!
    let successor = edgePoints[1]!
    let orthPoints = this.getOrthogonalPoints(current.x, current.y, successor.x, successor.y, radius)
    ccwPoints.push(orthPoints[0]!)
    cwPoints.push(orthPoints[1]!)

    // normal case: bendpoints have a preceding and a succeeding neighbor
    for (let i = 2; i < numberOfPoints; i++) {
      predecessor = current
      current = successor
      successor = edgePoints[i]!
      orthPoints = this.getOrthogonalPoints(current.x, current.y, predecessor.x, predecessor.y, radius)
      ccwPoints.push(orthPoints[1]!)
      cwPoints.push(orthPoints[0]!)

      orthPoints = this.getOrthogonalPoints(current.x, current.y, successor.x, successor.y, radius)
      ccwPoints.push(orthPoints[0]!)
      cwPoints.push(orthPoints[1]!)
    }
    // For the last point, consider the line connecting back to the previous point (the resulting orthogonal points
    // will be in reversed order in the resulting list, though.).
    orthPoints = this.getOrthogonalPoints(successor.x, successor.y, current.x, current.y, radius)
    ccwPoints.push(orthPoints[1]!)
    cwPoints.push(orthPoints[0]!)

    // Compute the intersections of the line segments of the orthogonal points
    const ccwMerged = new KVectorChain()
    const cwMerged: KVector[] = []

    ccwMerged.add(ccwPoints[0]!)
    for (let i = 1; i < ccwPoints.length - 2; i += 2) {
      const currentPoint = ccwPoints[i]!
      const intersectionPoint = this.computeIntersection(ccwPoints[i - 1]!, currentPoint, ccwPoints[i + 1]!, ccwPoints[i + 2]!)

      // Keep currentPoint if lines are coincident (or parallel).
      if (!Number.isFinite(intersectionPoint.x) || !Number.isFinite(intersectionPoint.y)) {
        ccwMerged.add(currentPoint)
      } else {
        ccwMerged.add(intersectionPoint)
      }
    }
    ccwMerged.add(ccwPoints[ccwPoints.length - 1]!)

    cwMerged.push(cwPoints[0]!)
    for (let i = 1; i < cwPoints.length - 2; i += 2) {
      const currentPoint = cwPoints[i]!
      const intersectionPoint = this.computeIntersection(cwPoints[i - 1]!, currentPoint, cwPoints[i + 1]!, cwPoints[i + 2]!)

      // Keep currentPoint if lines are coincident (or parallel).
      if (!Number.isFinite(intersectionPoint.x) || !Number.isFinite(intersectionPoint.y)) {
        cwMerged.push(currentPoint)
      } else {
        cwMerged.push(intersectionPoint)
      }
    }
    cwMerged.push(cwPoints[cwPoints.length - 1]!)

    // merge lists (one of them has to be added in reverse order)
    for (let i = cwMerged.length - 1; i >= 0; i--) {
      ccwMerged.add(cwMerged[i]!)
    }

    return ccwMerged
  }

  /** 从边上一点生成两点: 与边方向正交, 距当前点 radius. */
  private getOrthogonalPoints(curX: number, curY: number, nxtX: number, nxtY: number, radius: number): KVector[] {
    const difX = nxtX - curX
    const difY = nxtY - curY

    const angleRadians = Math.atan2(difX, difY)
    const orthAngleCCW = angleRadians + HALF_PI
    const orthAngleCW = angleRadians - HALF_PI

    const xCCW = radius * Math.sin(orthAngleCCW) + curX
    const yCCW = radius * Math.cos(orthAngleCCW) + curY
    const xCW = radius * Math.sin(orthAngleCW) + curX
    const yCW = radius * Math.cos(orthAngleCW) + curY

    return [new KVector(xCCW, yCCW), new KVector(xCW, yCW)]
  }

  // might result in +inf or -inf
  private computeIntersection(p1: KVector, p2: KVector, p3: KVector, p4: KVector): KVector {
    const x1 = p1.x
    const y1 = p1.y
    const x2 = p2.x
    const y2 = p2.y
    const x3 = p3.x
    const y3 = p3.y
    const x4 = p4.x
    const y4 = p4.y

    const factor1 = x1 * y2 - y1 * x2
    const factor2 = x3 * y4 - y3 * x4
    const denominator = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)

    const x = (factor1 * (x3 - x4) - factor2 * (x1 - x2)) / denominator
    const y = (factor1 * (y3 - y4) - factor2 * (y1 - y2)) / denominator

    return new KVector(x, y)
  }

  /** 调整被当作 extension 处理的边段 (压缩后). */
  private adjustFirstSegment(source: ElkNode, chain: KVectorChain, dir: DCDirection): KVectorChain {
    const firstPoint = chain.remove()
    switch (dir) {
      case 'NORTH':
        firstPoint.y = 0
        break
      case 'SOUTH':
        firstPoint.y = source.height ?? 0
        break
      case 'WEST':
        firstPoint.x = 0
        break
      default: // EAST
        firstPoint.x = source.width ?? 0
    }

    chain.addAt(0, firstPoint)

    return chain
  }

  // ── ElkGraphUtil / ElkUtil 对应物 ──

  /** 子树内全部边 (Java 图模型: 本图容器含全部后代边). */
  private allEdges(graph: ElkNode): ElkEdge[] {
    const out: ElkEdge[] = []
    const walk = (n: ElkNode) => {
      for (const e of n.edges ?? []) out.push(e)
      for (const c of n.children ?? []) walk(c)
    }
    walk(graph)
    return out
  }

  /** node 的全部入射边 (含跨层级; ElkGraphUtil.allIncidentEdges). */
  private allIncidentEdges(graph: ElkNode, node: ElkNode): ElkEdge[] {
    return this.allEdges(graph).filter((e) => {
      const src = nodeIdOf(String(e.sources?.[0] ?? ''), graph)
      const tgt = nodeIdOf(String(e.targets?.[0] ?? ''), graph)
      const nodeId = node.id
      return src === nodeId || tgt === nodeId
    })
  }

  private getSourceNode(graph: ElkNode, edge: ElkEdge): ElkNode {
    return findNodeById(graph, nodeIdOf(String(edge.sources?.[0] ?? ''), graph))!
  }

  private getTargetNode(graph: ElkNode, edge: ElkEdge): ElkNode {
    return findNodeById(graph, nodeIdOf(String(edge.targets?.[0] ?? ''), graph))!
  }

  private getSourcePort(graph: ElkNode, edge: ElkEdge): ElkPort | undefined {
    const ref = String(edge.sources?.[0] ?? '')
    const portId = portIdOf(ref, graph)
    if (portId === undefined) return undefined
    return findNodeById(graph, nodeIdOf(ref, graph))?.ports?.find((p) => p.id === portId)
  }

  private getTargetPort(graph: ElkNode, edge: ElkEdge): ElkPort | undefined {
    const ref = String(edge.targets?.[0] ?? '')
    const portId = portIdOf(ref, graph)
    if (portId === undefined) return undefined
    return findNodeById(graph, nodeIdOf(ref, graph))?.ports?.find((p) => p.id === portId)
  }

  /** edge 第一条 section; 无 section 时创建并挂载 (Java firstEdgeSection(edge,false,false) createEdgeSection 语义, start/end 默认 (0,0)). */
  private firstEdgeSection(edge: ElkEdge): ElkEdgeSection {
    const s = (edge.sections ?? [])[0]
    if (s !== undefined) {
      return s
    }
    const section: ElkEdgeSection = {
      startPoint: { x: 0, y: 0 },
      endPoint: { x: 0, y: 0 },
      bendPoints: [],
    }
    edge.sections = [section]
    return section
  }

  /** section → 点链 (startPoint + bendPoints + endPoint, 拷贝). */
  createVectorChain(section: ElkEdgeSection): KVectorChain {
    const chain = new KVectorChain()
    chain.add(new KVector(section.startPoint.x, section.startPoint.y))
    for (const b of section.bendPoints ?? []) chain.add(new KVector(b.x, b.y))
    chain.add(new KVector(section.endPoint.x, section.endPoint.y))
    return chain
  }

  /** 点链写回 section. */
  applyVectorChain(chain: KVectorChain, section: ElkEdgeSection): void {
    const pts = chain.toArray()
    section.startPoint = { x: pts[0]!.x, y: pts[0]!.y }
    if (pts.length >= 2) section.endPoint = { x: pts[pts.length - 1]!.x, y: pts[pts.length - 1]!.y }
    if (pts.length > 2) {
      const bends = pts.slice(1, -1)
      section.bendPoints = bends.map((b) => ({ x: b.x, y: b.y }))
    } else {
      section.bendPoints = []
    }
  }

  /** OffsetApplier: 把 DCElement 的偏移应用到原图元素. */
  private applyOffset(elem: object, poly: DCElement): void {
    const offset = poly.getOffset()
    if ('sections' in elem) {
      const e = elem as ElkEdge
      const edgeSection = this.firstEdgeSection(e)
      const points = this.createVectorChain(edgeSection)
      points.each((p) => {
        p.add(offset)
      })
      this.applyVectorChain(points, edgeSection)
      const junctionPoints = (e.properties as Record<string, unknown> | undefined)?.['org.eclipse.elk.junctionPoints']
      if (Array.isArray(junctionPoints)) {
        for (const jp of junctionPoints as { x: number; y: number }[]) {
          jp.x += offset.x
          jp.y += offset.y
        }
      }
    } else {
      const shape = elem as { x?: number; y?: number }
      shape.x = (shape.x ?? 0) + offset.x
      shape.y = (shape.y ?? 0) + offset.y
    }
  }
}

/** 节点 id 的父 id (路径式). */
function parentId(node: ElkNode): string {
  const dot = node.id.lastIndexOf('.')
  return dot === -1 ? '' : node.id.slice(0, dot)
}
