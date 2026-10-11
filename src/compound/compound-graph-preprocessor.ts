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
 * CompoundGraphPreprocessor (对应 ELK compound.CompoundGraphPreprocessor).
 * 拆分跨层级边: 为嵌套节点端口创建 ExternalPort dummy, 边重连到 dummy.
 * label 移动与 inside self loop 暂不处理 (默认关闭).
 */
import type { LGraph } from '../graph/lgraph.js'
import type { LNode } from '../graph/lnode.js'
import { LPort } from '../graph/lport.js'
import { LEdge } from '../graph/ledge.js'
import { PortSide, PortType, PortConstraints, NodeType } from '../graph/enums.js'
import { EXT_PORT_SIDE, ORIGIN, PORT_DUMMY, INSIDE_CONNECTIONS, CROSS_HIERARCHY_MAP, GRAPH_PROPERTIES, GraphProperties } from '../options/internal-properties.js'
import { PORT_CONSTRAINTS, MERGE_HIERARCHY_EDGES, PORT_BORDER_OFFSET, JUNCTION_POINTS, SPACING_EDGE_EDGE, HIERARCHY_HANDLING, INSIDE_SELF_LOOPS_ACTIVATE, INSIDE_SELF_LOOPS_YO, PORT_LABELS_PLACEMENT } from '../options/layered-options.js'
import { CrossHierarchyEdge } from './cross-hierarchy-edge.js'
import { compareCrossHierarchyEdges } from './cross-hierarchy-edge-comparator.js'
import { createExternalPortDummy, getDirection, isDescendant, oppositeSide, sideFromDirection } from '../graph/lgraph-util.js'

/** 内部表示: 跨层级边在某图内的拆分点 (ELK ExternalPort). */
class ExternalPort {
  origEdges: LEdge[] = []
  newEdge: LEdge
  dummyNode: LNode
  dummyPort: LPort
  type: PortType
  exported: boolean

  constructor(origEdge: LEdge, newEdge: LEdge, dummyNode: LNode, dummyPort: LPort,
    type: PortType, exported: boolean) {
    this.origEdges.push(origEdge)
    this.newEdge = newEdge
    this.dummyNode = dummyNode
    this.dummyPort = dummyPort
    this.type = type
    this.exported = exported
  }
}

export class CompoundGraphPreprocessor {
  private crossHierarchyMap = new Map<LEdge, CrossHierarchyEdge[]>()
  private dummyNodeMap = new Map<LPort, LNode>()
  private topGraph: LGraph | null = null

  process(graph: LGraph): void {
    this.crossHierarchyMap = new Map()
    this.topGraph = graph
    // SEPARATE_CHILDREN (非 INCLUDE): 子图独立布局, 但跨层级边必须在子图内建 ExternalPort dummy
    // (jar 实证 Issue680 subgraph: ext-in (15x20) + ext-out (15x22) 两个 dummy → child.y=57),
    // 否则子图布局缺失边界端口 → child.y=12. 根图不建 dummy (父节点真实端口按 netFlow 定侧).
    if (graph.getProperty(HIERARCHY_HANDLING) !== 'INCLUDE_CHILDREN') {
      this.separateTransformHierarchyEdges(graph)
      // 容器端口定侧必须在移除原边之前 (netFlow 依赖边存在).
      this.setContainerPortSidesByNetFlow(graph)
      // inside self loop dummy 会把容器端口侧固定到 dummy 侧 (ELK setSidesOfPortsToSidesOfDummyNodes).
      this.setSidesOfPortsToSidesOfDummyNodes()
      this.removeOriginalEdges()
      // ELK CompoundGraphPreprocessor.process 无条件把 crossHierarchyMap 挂到图 (SEPARATE 分支此前漏设,
      // 导致 insideSelfLoops (假层级, 走 SEPARATE) 的 yo 自环 dummy 边无法被 CompoundGraphPostprocessor
      // 恢复 → selfloop 边丢失/方向错 (insideSelfLoops E2E 差 6, edge 0->0 只剩 EAST→WEST 一条).
      graph.setProperty(CROSS_HIERARCHY_MAP, this.crossHierarchyMap)
      this.dummyNodeMap.clear()
      return
    }
    this.transformHierarchyEdges(graph, null)
    this.removeOriginalEdges()
    this.setSidesOfPortsToSidesOfDummyNodes()

    graph.setProperty(CROSS_HIERARCHY_MAP, this.crossHierarchyMap)
    this.dummyNodeMap.clear()
  }

  /** SEPARATE_CHILDREN: 递归在每个子图内为跨边界边创建 ExternalPort dummy 并重连. */
  private separateTransformHierarchyEdges(graph: LGraph): void {
    for (const node of graph.getLayerlessNodes()) {
      const nested = node.getNestedGraph()
      if (nested === null) continue
      this.separateTransformHierarchyEdges(nested)
      this.separateTransformNestedEdges(nested, node)
      // inside self loops: 边连容器端口, 不经过子图节点, 需单独处理 (ELK processInsideSelfLoops).
      // jar SEPARATE 用 transformExternalPort (节点 PORT_CONSTRAINTS + 端口实际侧, 不 netFlow 调整);
      // ggn 嵌套图路径等价对齐 (297 同侧双 WEST dummy: P2 须保持 WEST 而非 netFlow 调整的 EAST).
      this.processInsideSelfLoops(nested, node, node.getProperty(PORT_CONSTRAINTS), true)
    }
  }

  /** 处理单个子图: 对每条跨出子图边, 在子图内建 dummy (容器端口尺寸) 并连到子端口. */
  private separateTransformNestedEdges(nested: LGraph, containerNode: LNode): void {
    const created: ExternalPort[] = []
    const seen = new Set<LEdge>()
    for (const n of [...nested.getLayerlessNodes()]) {
      if (n.getType() === NodeType.EXTERNAL_PORT) continue
      for (const port of n.getPorts()) {
        for (const outEdge of [...port.getOutgoingEdges()]) {
          if (seen.has(outEdge)) continue
          const tgt = outEdge.getTarget()!.getNode()!
          if (tgt.getGraph() !== nested) {
            seen.add(outEdge)
            const ep = this.introduceSeparateExternalPort(nested, containerNode, outEdge, port, PortType.OUTPUT)
            if (ep !== null) created.push(ep)
          }
        }
        for (const inEdge of [...port.getIncomingEdges()]) {
          if (seen.has(inEdge)) continue
          const src = inEdge.getSource()!.getNode()!
          if (src.getGraph() !== nested) {
            seen.add(inEdge)
            const ep = this.introduceSeparateExternalPort(nested, containerNode, inEdge, port, PortType.INPUT)
            if (ep !== null) created.push(ep)
          }
        }
      }
    }
    for (const ep of created) {
      if (!nested.getLayerlessNodes().includes(ep.dummyNode)) {
        nested.getLayerlessNodes().push(ep.dummyNode)
      }
    }
    if (created.length > 0) {
      nested.getProperty(GRAPH_PROPERTIES).add(GraphProperties.EXTERNAL_PORTS)
    }
  }

  /** 创建子图内的 ExternalPort dummy (尺寸取容器端口: 宽=portWidth, NORTH/SOUTH 高=-borderOffset). */
  private introduceSeparateExternalPort(nested: LGraph, containerNode: LNode, origEdge: LEdge,
    childPort: LPort, portType: PortType): ExternalPort | null {
    const outsidePort = portType === PortType.INPUT ? origEdge.getSource()! : origEdge.getTarget()!
    if (outsidePort.getNode() !== containerNode) return null

    let externalPortSide = outsidePort.getSide()
    if (externalPortSide === PortSide.UNDEFINED) {
      const dir = getDirection(nested)
      externalPortSide = portType === PortType.INPUT
        ? oppositeSide(sideFromDirection(dir))
        : sideFromDirection(dir)
    }

    const dummyNode = createExternalPortDummy(
      outsidePort as unknown as { getProperty<T>(p: unknown): T; setProperty(p: unknown, v: unknown): void },
      containerNode.getProperty(PORT_CONSTRAINTS),
      externalPortSide,
      this.calculateNetFlow(outsidePort),
      null,
      outsidePort.getPosition(),
      outsidePort.getSize(),
      getDirection(nested),
      nested,
    )
    dummyNode.setProperty(ORIGIN, outsidePort)
    if (!this.dummyNodeMap.has(outsidePort)) this.dummyNodeMap.set(outsidePort, dummyNode)

    const dummyEdge = this.createDummyEdge(nested, origEdge)
    const dummyPort = dummyNode.getPorts()[0]!
    if (portType === PortType.INPUT) {
      dummyEdge.setSource(dummyPort)
      dummyEdge.setTarget(childPort)
    } else {
      dummyEdge.setSource(childPort)
      dummyEdge.setTarget(dummyPort)
    }

    const ep = new ExternalPort(origEdge, dummyEdge, dummyNode, dummyPort, portType, true)
    this.addToMap(origEdge, new CrossHierarchyEdge(dummyEdge, nested, portType))
    return ep
  }

  /** SEPARATE: 容器真实端口按 netFlow 定侧 (ELK ensureDefinedPortSide: getNetFlow()=in-out, >0→流向侧). */
  private setContainerPortSidesByNetFlow(graph: LGraph): void {
    for (const node of graph.getLayerlessNodes()) {
      const nested = node.getNestedGraph()
      if (nested === null) continue
      const pc = node.getProperty(PORT_CONSTRAINTS)
      if (!PortConstraints.isSideFixed(pc)) {
        for (const port of node.getPorts()) {
          if (port.getSide() !== PortSide.UNDEFINED) continue
          const dir = getDirection(nested)
          const flowSide = sideFromDirection(dir)
          port.setSideInferred(port.getNetFlow() > 0 ? flowSide : oppositeSide(flowSide))
        }
      }
      this.setContainerPortSidesByNetFlow(nested)
    }
  }

  /** 移除原跨层级边 + 把标签移到对应 dummy 段 (ELK moveLabelsAndRemoveOriginalEdges 249-297). */
  private removeOriginalEdges(): void {
    for (const origEdge of [...this.crossHierarchyMap.keys()]) {
      const chEdges = this.crossHierarchyMap.get(origEdge) ?? []
      if (origEdge.getLabels().length > 0 && chEdges.length > 0) {
        const sorted = [...chEdges].sort((a, b) => compareCrossHierarchyEdges(a, b, this.topGraph!))
        for (const label of [...origEdge.getLabels()]) {
          let targetIndex = -1
          // ELK: edgeLabels.placement 默认 CENTER (Core.melk), 未显式设置等价 CENTER.
          const placement = label.placement === undefined ? 'CENTER' : label.placement
          switch (placement) {
            case 'HEAD':
              targetIndex = sorted.length - 1
              break
            case 'CENTER':
              targetIndex = this.shallowestEdgeSegment(sorted)
              break
            case 'TAIL':
              targetIndex = 0
              break
            default:
              // ELK: 未知 placement 忽略 (标签不移动, 随之被移除).
              break
          }
          if (targetIndex !== -1) {
            const targetSegment = sorted[targetIndex]!
            targetSegment.getNewEdge().getLabels().push(label)
            origEdge.getLabels().splice(origEdge.getLabels().indexOf(label), 1)
            // ELK: 不改 placement (TAIL/HEAD 保留), 只记录 ORIGINAL_LABEL_EDGE + 图属性 END/CENTER_LABELS
            // (905 实证: 强制改 CENTER → begin/end 也进 LABEL dummy → dummy 高 67 vs jar 25 → N2 位置差 69).
          }
        }
      }
      origEdge.setSource(null)
      origEdge.setTarget(null)
    }
  }

  /** ELK getShallowestEdgeSegment: 最后一段 OUTPUT, 否则取第一段. */
  private shallowestEdgeSegment(edgeSegments: CrossHierarchyEdge[]): number {
    let result = -1
    for (let index = 0; index < edgeSegments.length; index++) {
      if (edgeSegments[index]!.getType() === PortType.INPUT) {
        result = index === 0 ? 0 : index - 1
        break
      } else if (index === edgeSegments.length - 1) {
        result = index
      }
    }
    return result
  }

  private setSidesOfPortsToSidesOfDummyNodes(): void {
    for (const [externalPort, dummyNode] of this.dummyNodeMap) {
      dummyNode.setProperty(ORIGIN, externalPort)
      externalPort.setProperty(PORT_DUMMY, dummyNode)
      externalPort.setProperty(INSIDE_CONNECTIONS, true)
      const extSide = dummyNode.getProperty(EXT_PORT_SIDE)
      externalPort.setSide(extSide === PortSide.UNDEFINED ? PortSide.UNDEFINED : extSide)
      externalPort.getNode()!.setProperty(PORT_CONSTRAINTS, PortConstraints.FIXED_SIDE)
      externalPort.getNode()!.getGraph()!.getProperty(GRAPH_PROPERTIES).add(GraphProperties.NON_FREE_PORTS)
    }
  }

  ////////////////////////////////////////////////////////////////////////////////////////////
  // Inside Self Loop Processing (ELK CompoundGraphPreprocessor.processInsideSelfLoops 616-685)

  /**
   * 把节点的 inside self loop (activate + yo) 拆成嵌套图内两个 ExternalPort dummy 之间的边.
   * 原边记录到 crossHierarchyMap (postprocessor 恢复时把 dummy 边弯点搬回原边).
   * source dummy netFlow=-1 (输入), target dummy netFlow=1 (输出), 与 ELK 一致.
   */
  private processInsideSelfLoops(nestedGraph: LGraph, node: LNode, portConstraints: PortConstraints, sortByPortOrder: boolean): void {
    if (!node.getProperty(INSIDE_SELF_LOOPS_ACTIVATE)) return

    for (const lport of node.getPorts()) {
      for (const outEdge of [...lport.getOutgoingEdges()]) {
        const isSelfLoop = outEdge.getTarget()!.getNode() === node
        const isInsideSelfLoop = isSelfLoop && outEdge.getProperty(INSIDE_SELF_LOOPS_YO)
        if (!isInsideSelfLoop) continue

        const sourcePort = outEdge.getSource()!
        let sourceExtPortDummy = this.dummyNodeMap.get(sourcePort)
        if (sourceExtPortDummy === undefined) {
          sourceExtPortDummy = createExternalPortDummy(
            sourcePort as unknown as { getProperty<T>(p: unknown): T; setProperty(p: unknown, v: unknown): void },
            portConstraints,
            sourcePort.getSide(),
            -1,
            null,
            null,
            sourcePort.getSize(),
            getDirection(nestedGraph),
            nestedGraph,
          )
          sourceExtPortDummy.setProperty(ORIGIN, sourcePort)
          this.dummyNodeMap.set(sourcePort, sourceExtPortDummy)
          if (!nestedGraph.getLayerlessNodes().includes(sourceExtPortDummy)) {
            nestedGraph.getLayerlessNodes().push(sourceExtPortDummy)
          }
        }

        const targetPort = outEdge.getTarget()!
        let targetExtPortDummy = this.dummyNodeMap.get(targetPort)
        if (targetExtPortDummy === undefined) {
          targetExtPortDummy = createExternalPortDummy(
            targetPort as unknown as { getProperty<T>(p: unknown): T; setProperty(p: unknown, v: unknown): void },
            portConstraints,
            targetPort.getSide(),
            1,
            null,
            null,
            targetPort.getSize(),
            getDirection(nestedGraph),
            nestedGraph,
          )
          targetExtPortDummy.setProperty(ORIGIN, targetPort)
          this.dummyNodeMap.set(targetPort, targetExtPortDummy)
          if (!nestedGraph.getLayerlessNodes().includes(targetExtPortDummy)) {
            nestedGraph.getLayerlessNodes().push(targetExtPortDummy)
          }
        }

        const dummyEdge = this.createDummyEdge(nestedGraph, outEdge)
        dummyEdge.setSource(sourceExtPortDummy.getPorts()[0]!)
        dummyEdge.setTarget(targetExtPortDummy.getPorts()[0]!)
        this.addToMap(outEdge, new CrossHierarchyEdge(dummyEdge, nestedGraph, PortType.OUTPUT))
        nestedGraph.getProperty(GRAPH_PROPERTIES).add(GraphProperties.EXTERNAL_PORTS)
      }
    }
    // jar SEPARATE transformExternalPort 按 node.getPorts() 模型顺序创建 dummy (P2 先 P4 后);
    // ggn processInsideSelfLoops 按边顺序 (source P4 先) → 同侧 dummy 垂直顺序反 →
    // 自环 U 形弯点方向反 (297 [[54,34],[54,64]] vs jar [[54,64],[54,34]]).
    // 仅 SEPARATE 路径排序 (INCLUDE_CHILDREN 的 jar CGP 按边顺序, 不排序 — 273 DOWN/UP).
    if (sortByPortOrder) {
      const portOrder = new Map<LPort, number>()
      node.getPorts().forEach((p, i) => portOrder.set(p, i))
      const nodes = nestedGraph.getLayerlessNodes()
      const sorted = [...nodes].sort((a, b) => {
        const ao = a.getProperty(ORIGIN)
        const bo = b.getProperty(ORIGIN)
        if (ao instanceof LPort && bo instanceof LPort) {
          const ai = portOrder.get(ao)
          const bi = portOrder.get(bo)
          if (ai !== undefined && bi !== undefined) return ai - bi
        }
        return 0
      })
      if (sorted.some((n, i) => n !== nodes[i])) {
        nodes.length = 0
        nodes.push(...sorted)
      }
    }
  }

  /**
   * 端口的净流 (ELK CompoundGraphPreprocessor.calculateNetFlow 825-870):
   * inside self loop 的投票与普通自环相反 (出边 inside → inputVote, 入边 inside → outputVote).
   */
  private calculateNetFlow(port: LPort): number {
    const node = port.getNode()!
    const insideSelfLoopsEnabled = node.getProperty(INSIDE_SELF_LOOPS_ACTIVATE)

    let outputPortVote = 0
    let inputPortVote = 0

    for (const outgoingEdge of port.getOutgoingEdges()) {
      const isSelfLoop = outgoingEdge.isSelfLoop()
      const isInsideSelfLoop = isSelfLoop && insideSelfLoopsEnabled && outgoingEdge.getProperty(INSIDE_SELF_LOOPS_YO)
      const targetNode = outgoingEdge.getTarget()!.getNode()!
      if (isSelfLoop && isInsideSelfLoop) {
        inputPortVote++
      } else if (isSelfLoop && !isInsideSelfLoop) {
        outputPortVote++
      } else if (targetNode.getGraph()!.getParentNode() === node) {
        inputPortVote++
      } else {
        outputPortVote++
      }
    }

    for (const incomingEdge of port.getIncomingEdges()) {
      const isSelfLoop = incomingEdge.isSelfLoop()
      const isInsideSelfLoop = isSelfLoop && insideSelfLoopsEnabled && incomingEdge.getProperty(INSIDE_SELF_LOOPS_YO)
      const sourceNode = incomingEdge.getSource()!.getNode()!
      if (isSelfLoop && isInsideSelfLoop) {
        outputPortVote++
      } else if (isSelfLoop && !isInsideSelfLoop) {
        inputPortVote++
      } else if (sourceNode.getGraph()!.getParentNode() === node) {
        outputPortVote++
      } else {
        inputPortVote++
      }
    }

    return outputPortVote - inputPortVote
  }

  private transformHierarchyEdges(graph: LGraph, parentNode: LNode | null): ExternalPort[] {
    const containedExternalPorts: ExternalPort[] = []

    for (const node of graph.getLayerlessNodes()) {
      const nestedGraph = node.getNestedGraph()
      if (nestedGraph !== null) {
        const childPorts = this.transformHierarchyEdges(nestedGraph, node)
        containedExternalPorts.push(...childPorts)

        // inside self loops: 在子图内建 ext port dummy + dummy 边 (ELK transformHierarchyEdges 内调用).
        // jar INCLUDE_CHILDREN 的 CGP processInsideSelfLoops 用 PortConstraints.FREE (netFlow 调整).
        this.processInsideSelfLoops(nestedGraph, node, PortConstraints.FREE, false)

        if (nestedGraph.getProperty(GRAPH_PROPERTIES).has(GraphProperties.EXTERNAL_PORTS)) {
          // ELK CompoundGraphPreprocessor: 为容器所有端口创建外部 dummy (含无边端口).
          // elkjs 实测 (multilabels_compound): FIXED_SIDE 的无边端口也有 dummy → 父节点
          // 高度含其位置 (61 vs 只有边端口时的 54), 且 getExternalPortPosition 给无边端口定位.
          const portConstraints = node.getProperty(PORT_CONSTRAINTS)
          for (const port of node.getPorts()) {
            let dummyNode = this.dummyNodeMap.get(port)
            if (dummyNode === undefined) {
              dummyNode = createExternalPortDummy(
                port as unknown as { getProperty<T>(p: unknown): T; setProperty(p: unknown, v: unknown): void },
                portConstraints,
                port.getSide(),
                -port.getNetFlow(),
                null,
                { x: 0, y: 0 },
                port.getSize(),
                getDirection(nestedGraph),
                nestedGraph,
              )
              dummyNode.setProperty(ORIGIN, port)
              this.dummyNodeMap.set(port, dummyNode)
              if (!nestedGraph.getLayerlessNodes().includes(dummyNode)) {
                nestedGraph.getLayerlessNodes().push(dummyNode)
              }
            }
            // ELK CompoundGraphPreprocessor (195-222): 给 dummy 端口加空标签 (尺寸=原标签尺寸),
            // 为外部端口标签预留容器内空间. 非 INSIDE → FIXED 只留 insidePart (E/W→size.x, N/S→size.y;
            // borderOffset 用 0, 只需标签在端口内部分), OUTSIDE → 0. 位置保持 (0,0) (空 LLabel).
            // dummy 标签经 NodeMarginCalculator 计入 dummy margin → 容器宽度/高度预留标签空间
            // (701 MyCont4 FIXED +32 / INSIDE +101 实测; fixed_positions_01 子节点标签 containment).
            const insidePortLabels = (node.getProperty<string[]>(PORT_LABELS_PLACEMENT) ?? []).includes('INSIDE')
            const dummyNodePort = dummyNode.getPorts()[0]!
            const placement = node.getProperty<string[]>(PORT_LABELS_PLACEMENT) ?? []
            const isFixed = !placement.includes('INSIDE') && !placement.includes('OUTSIDE')
            for (const extPortLabel of port.getLabels()) {
              const dummyPortLabel = { text: '', position: { x: 0, y: 0 }, size: { x: extPortLabel.size.x, y: extPortLabel.size.y } }
              if (!insidePortLabels) {
                const side = port.getSide()
                let insidePart = 0
                if (isFixed) {
                  // ElkUtil.computeInsidePart(borderOffset=0)
                  switch (side) {
                    case PortSide.EAST: insidePart = Math.max(0, -extPortLabel.position.x); break
                    case PortSide.WEST: insidePart = Math.max(0, extPortLabel.size.x + extPortLabel.position.x - port.getSize().x); break
                    case PortSide.NORTH: insidePart = Math.max(0, extPortLabel.size.y + extPortLabel.position.y - port.getSize().y); break
                    case PortSide.SOUTH: insidePart = Math.max(0, -extPortLabel.position.y); break
                  }
                }
                if (side === PortSide.EAST || side === PortSide.WEST) dummyPortLabel.size.x = insidePart
                else dummyPortLabel.size.y = insidePart
              }
              ;(dummyNodePort.getLabels() as { text: string; position: { x: number; y: number }; size: { x: number; y: number } }[]).push(dummyPortLabel)
            }
          }
        }
      }
    }

    const exportedExternalPorts: ExternalPort[] = []
    this.processInnerHierarchicalEdgeSegments(graph, parentNode, containedExternalPorts, exportedExternalPorts)
    if (parentNode !== null) {
      this.processOuterHierarchicalEdgeSegments(graph, parentNode, exportedExternalPorts)
    }
    return exportedExternalPorts
  }

  private processInnerHierarchicalEdgeSegments(graph: LGraph, parentNode: LNode | null,
    containedExternalPorts: ExternalPort[], exportedExternalPorts: ExternalPort[]): void {
    const createdExternalPorts: ExternalPort[] = []

    for (const externalPort of containedExternalPorts) {
      let currentExternalPort: ExternalPort | null = null

      if (externalPort.type === PortType.OUTPUT) {
        for (const outEdge of [...externalPort.origEdges]) {
          const targetNode = outEdge.getTarget()!.getNode()!
          if (targetNode.getGraph() === graph) {
            this.connectChild(graph, externalPort, outEdge, externalPort.dummyPort, outEdge.getTarget()!)
          } else if (parentNode === null || isDescendant(targetNode, parentNode)) {
            this.connectSiblings(graph, externalPort, containedExternalPorts, outEdge)
          } else {
            const newExternalPort = this.introduceHierarchicalEdgeSegment(
              graph, parentNode, outEdge, externalPort.dummyPort, PortType.OUTPUT, currentExternalPort)
            if (newExternalPort !== currentExternalPort) createdExternalPorts.push(newExternalPort)
            if (newExternalPort.exported) currentExternalPort = newExternalPort
          }
        }
      } else {
        for (const inEdge of [...externalPort.origEdges]) {
          const sourceNode = inEdge.getSource()!.getNode()!
          if (sourceNode.getGraph() === graph) {
            this.connectChild(graph, externalPort, inEdge, inEdge.getSource()!, externalPort.dummyPort)
          } else if (parentNode === null || isDescendant(sourceNode, parentNode)) {
            continue
          } else {
            const newExternalPort = this.introduceHierarchicalEdgeSegment(
              graph, parentNode, inEdge, externalPort.dummyPort, PortType.INPUT, currentExternalPort)
            if (newExternalPort !== currentExternalPort) createdExternalPorts.push(newExternalPort)
            if (newExternalPort.exported) currentExternalPort = newExternalPort
          }
        }
      }
    }

    for (const externalPort of createdExternalPorts) {
      if (!graph.getLayerlessNodes().includes(externalPort.dummyNode)) {
        graph.getLayerlessNodes().push(externalPort.dummyNode)
      }
      if (externalPort.exported) exportedExternalPorts.push(externalPort)
    }
  }

  private processOuterHierarchicalEdgeSegments(graph: LGraph, parentNode: LNode,
    exportedExternalPorts: ExternalPort[]): void {
    const createdExternalPorts: ExternalPort[] = []

    for (const childNode of graph.getLayerlessNodes()) {
      for (const childPort of childNode.getPorts()) {
        let currentExternalOutputPort: ExternalPort | null = null
        for (const outEdge of [...childPort.getOutgoingEdges()]) {
          const tgt = outEdge.getTarget()!.getNode()!
          if (!isDescendant(tgt, parentNode)) {
            const newExternalPort = this.introduceHierarchicalEdgeSegment(
              graph, parentNode, outEdge, outEdge.getSource()!, PortType.OUTPUT, currentExternalOutputPort)
            if (newExternalPort !== currentExternalOutputPort) createdExternalPorts.push(newExternalPort)
            if (newExternalPort.exported) currentExternalOutputPort = newExternalPort
          }
        }

        let currentExternalInputPort: ExternalPort | null = null
        if (process.env.GGN_CGP_DBG) {
          const cgpOuterPn = graph.getParentNode()
          const cgpOuterName = cgpOuterPn ? (cgpOuterPn.getLabels()[0]?.text ?? '#' + cgpOuterPn.id) : 'root'
          console.error(`CGP outer graph=${cgpOuterName} childNode=${childNode.getLabels()[0]?.text ?? '#' + childNode.id} childPort=${childPort.id} incoming=${childPort.getIncomingEdges().map(e => `${e.id ?? '?'}:${e.getSource()!.getNode()!.getLabels()[0]?.text ?? '#' + e.getSource()!.getNode()!.id}->${e.getTarget()!.getNode()!.getLabels()[0]?.text ?? '#' + e.getTarget()!.getNode()!.id}`).join(',')}`)
        }
        for (const inEdge of [...childPort.getIncomingEdges()]) {
          const src = inEdge.getSource()!.getNode()!
          if (!isDescendant(src, parentNode)) {
            const newExternalPort = this.introduceHierarchicalEdgeSegment(
              graph, parentNode, inEdge, inEdge.getTarget()!, PortType.INPUT, currentExternalInputPort)
            if (newExternalPort !== currentExternalInputPort) createdExternalPorts.push(newExternalPort)
            if (newExternalPort.exported) currentExternalInputPort = newExternalPort
          }
        }
      }
    }

    for (const externalPort of createdExternalPorts) {
      if (!graph.getLayerlessNodes().includes(externalPort.dummyNode)) {
        graph.getLayerlessNodes().push(externalPort.dummyNode)
      }
      if (externalPort.exported) exportedExternalPorts.push(externalPort)
    }
  }

  private connectChild(graph: LGraph, externalPort: ExternalPort, origEdge: LEdge,
    sourcePort: LPort, targetPort: LPort): void {
    const dummyEdge = this.createDummyEdge(graph, origEdge)
    dummyEdge.setSource(sourcePort)
    dummyEdge.setTarget(targetPort)
    this.addToMap(origEdge, new CrossHierarchyEdge(dummyEdge, graph, externalPort.type))
  }

  private connectSiblings(graph: LGraph, externalOutputPort: ExternalPort,
    containedExternalPorts: ExternalPort[], origEdge: LEdge): void {
    let targetExternalPort: ExternalPort | null = null
    for (const externalPort2 of containedExternalPorts) {
      if (externalPort2 !== externalOutputPort && externalPort2.origEdges.includes(origEdge)) {
        targetExternalPort = externalPort2
        break
      }
    }
    if (targetExternalPort === null) return

    const dummyEdge = this.createDummyEdge(graph, origEdge)
    dummyEdge.setSource(externalOutputPort.dummyPort)
    dummyEdge.setTarget(targetExternalPort.dummyPort)
    this.addToMap(origEdge, new CrossHierarchyEdge(dummyEdge, graph, externalOutputPort.type))
  }

  private introduceHierarchicalEdgeSegment(graph: LGraph, parentNode: LNode | null,
    origEdge: LEdge, oppositePort: LPort, portType: PortType,
    defaultExternalPort: ExternalPort | null): ExternalPort {
    const mergeExternalPorts = graph.getProperty(MERGE_HIERARCHY_EDGES)
    if (process.env.GGN_CGP_DBG) {
      const cgpPn = graph.getParentNode()
      const cgpPnName = cgpPn ? (cgpPn.getLabels()[0]?.text ?? '#' + cgpPn.id) : 'root'
      console.error(`CGP seg graph=${cgpPnName} edge=${origEdge.id ?? '?'} type=${portType} merge=${mergeExternalPorts} default=${defaultExternalPort === null ? 'null' : 'reuse'} src=${origEdge.getSource()!.getNode()!.getLabels()[0]?.text ?? '#' + origEdge.getSource()!.getNode()!.id} tgt=${origEdge.getTarget()!.getNode()!.getLabels()[0]?.text ?? '#' + origEdge.getTarget()!.getNode()!.id}`)
    }

    let parentEndPort: LPort | null = null
    if (portType === PortType.INPUT && origEdge.getSource()!.getNode() === parentNode) {
      parentEndPort = origEdge.getSource()!
    } else if (portType === PortType.OUTPUT && origEdge.getTarget()!.getNode() === parentNode) {
      parentEndPort = origEdge.getTarget()!
    }

    let externalPort = defaultExternalPort
    if (externalPort === null || !mergeExternalPorts || parentEndPort !== null) {
      let externalPortSide = PortSide.UNDEFINED
      if (parentEndPort !== null) {
        // 与 Java/elkjs 一致: 侧 = parentEndPort.getSide(), UNDEFINED 时不推断,
        // 交给 createExternalPortDummy 按 portConstraints/netFlow 定侧
        // (Java CompoundGraphPreprocessor:744-754 / elkjs 同; TS 原方向回退是独有偏差).
        externalPortSide = parentEndPort.getSide()
      } else if (parentNode !== null && PortConstraints.isSideFixed(parentNode.getProperty(PORT_CONSTRAINTS))) {
        externalPortSide = portType === PortType.INPUT ? PortSide.WEST : PortSide.EAST
      }
      const dummyNode = this.createExternalPortDummy(graph, parentNode, portType, externalPortSide, origEdge)

      const dummyEdge = this.createDummyEdge(parentNode!.getGraph()!, origEdge)
      if (portType === PortType.INPUT) {
        dummyEdge.setSource(dummyNode.getPorts()[0]!)
        dummyEdge.setTarget(oppositePort)
      } else {
        dummyEdge.setSource(oppositePort)
        dummyEdge.setTarget(dummyNode.getPorts()[0]!)
      }

      externalPort = new ExternalPort(origEdge, dummyEdge, dummyNode,
        dummyNode.getProperty(ORIGIN) as LPort, portType, parentEndPort === null)
    } else {
      externalPort.origEdges.push(origEdge)
    }

    this.addToMap(origEdge, new CrossHierarchyEdge(externalPort.newEdge, graph, portType))
    return externalPort
  }

  private createExternalPortDummy(graph: LGraph, parentNode: LNode | null,
    portType: PortType, portSide: PortSide, edge: LEdge): LNode {
    let dummyNode: LNode | null = null

    const outsidePort = portType === PortType.INPUT ? edge.getSource()! : edge.getTarget()!
    const layoutDirection = getDirection(graph)

    if (outsidePort.getNode() === parentNode) {
      dummyNode = this.dummyNodeMap.get(outsidePort) ?? null
      if (dummyNode === null) {
        dummyNode = createExternalPortDummy(
          outsidePort as unknown as { getProperty<T>(p: unknown): T; setProperty(p: unknown, v: unknown): void },
          parentNode!.getProperty(PORT_CONSTRAINTS),
          portSide,
          this.calculateNetFlow(outsidePort),
          null,
          outsidePort.getPosition(),
          outsidePort.getSize(),
          layoutDirection,
          graph,
        )
        dummyNode.setProperty(ORIGIN, outsidePort)
        this.dummyNodeMap.set(outsidePort, dummyNode)
      }
    } else {
      // ELK createExternalPortProperties: SPACING_EDGE_EDGE / 2 (elkjs 实测 5, 用于 getExternalPortPosition 的 WEST 负偏移).
      const offset = graph.getProperty(SPACING_EDGE_EDGE) / 2
      const holder = {
        getProperty<T>(p: unknown): T {
          if (p === PORT_BORDER_OFFSET) return offset as T
          return undefined as T
        },
        setProperty(): void {},
      }
      dummyNode = createExternalPortDummy(
        holder,
        parentNode!.getProperty(PORT_CONSTRAINTS),
        portSide,
        portType === PortType.INPUT ? -1 : 1,
        null,
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        layoutDirection,
        graph,
      )
      const dummyPort = this.createPortForDummy(dummyNode, parentNode!, portType)
      dummyNode.setProperty(ORIGIN, dummyPort)
      this.dummyNodeMap.set(dummyPort, dummyNode)
    }

    graph.getProperty(GRAPH_PROPERTIES).add(GraphProperties.EXTERNAL_PORTS)
    const pc = graph.getProperty(PORT_CONSTRAINTS)
    if (PortConstraints.isSideFixed(pc)) {
      graph.setProperty(PORT_CONSTRAINTS, PortConstraints.FIXED_SIDE)
    } else {
      graph.setProperty(PORT_CONSTRAINTS, PortConstraints.FREE)
    }
    return dummyNode!
  }

  private createPortForDummy(dummyNode: LNode, parentNode: LNode, type: PortType): LPort {
    const graph = parentNode.getGraph()!
    const layoutDirection = getDirection(graph)
    const port = new LPort()
    port.setNode(parentNode)
    if (type === PortType.INPUT) {
      port.setSide(oppositeSide(sideFromDirection(layoutDirection)))
    } else {
      port.setSide(sideFromDirection(layoutDirection))
    }
    port.setProperty(PORT_BORDER_OFFSET, dummyNode.getProperty(PORT_BORDER_OFFSET))
    return port
  }

  private createDummyEdge(graph: LGraph, origEdge: LEdge): LEdge {
    const dummyEdge = new LEdge()
    dummyEdge.copyProperties(origEdge)
    dummyEdge.setProperty(JUNCTION_POINTS, null)
    return dummyEdge
  }

  private addToMap(origEdge: LEdge, chEdge: CrossHierarchyEdge): void {
    const list = this.crossHierarchyMap.get(origEdge)
    if (list === undefined) {
      this.crossHierarchyMap.set(origEdge, [chEdge])
    } else {
      list.push(chEdge)
    }
  }
}
