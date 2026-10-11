/**
 * NodePromotion (对应 ELK intermediate.NodePromotion, model-order 分支).
 * Nikolov/Tarassov 节点提升启发式: 把节点提升到更高层以减少 dummy 节点.
 * 本实现覆盖 MODEL_ORDER_LEFT_TO_RIGHT / RIGHT_TO_LEFT (ModelOrderLayerAssignmentTest 所用),
 * 通用 NIKOLOV 分支未实现 (无 JUnit 测试覆盖).
 */
import type { LGraph } from '../graph/lgraph.js'
import { Layer } from '../graph/layer.js'
import type { LNode } from '../graph/lnode.js'
import { NodeType } from '../graph/enums.js'
import { MODEL_ORDER } from '../options/internal-properties.js'
import { LAYERING_NODE_PROMOTION_STRATEGY } from '../options/layered-options.js'
import type { IElkProgressMonitor } from '../layered-layout-provider.js'

/** 层 ↔ 节点的双向有序映射 (对应 ELK BiLinkedHashMultiMap). */
class BiLayerMap {
  private layerToNodes = new Map<number, LNode[]>()
  private nodeToLayer = new Map<LNode, number>()

  put(layerId: number, node: LNode): void {
    const old = this.nodeToLayer.get(node)
    if (old !== undefined && old !== layerId) {
      const oldList = this.layerToNodes.get(old)
      if (oldList) {
        const idx = oldList.indexOf(node)
        if (idx !== -1) oldList.splice(idx, 1)
      }
    }
    this.nodeToLayer.set(node, layerId)
    let list = this.layerToNodes.get(layerId)
    if (!list) {
      list = []
      this.layerToNodes.set(layerId, list)
    }
    if (!list.includes(node)) list.push(node)
  }

  putAll(layerId: number, nodes: LNode[]): void {
    for (const node of nodes) this.put(layerId, node)
  }

  getValues(layerId: number): LNode[] {
    return this.layerToNodes.get(layerId) ?? []
  }

  getKey(node: LNode): number {
    return this.nodeToLayer.get(node)!
  }

  keys(): number[] {
    return [...this.layerToNodes.keys()]
  }

  isMaximalKey(layerId: number): boolean {
    return layerId === Math.max(...this.keys())
  }

  isMinimalKey(layerId: number): boolean {
    return layerId === Math.min(...this.keys())
  }
}

export class NodePromotion {
  private masterGraph!: LGraph
  private promotionStrategy = 'NONE'
  private biLayerMap = new BiLayerMap()

  process(layeredGraph: LGraph, progressMonitor: IElkProgressMonitor): void {
    progressMonitor.begin('Node promotion heuristic', 1)
    this.masterGraph = layeredGraph
    this.promotionStrategy = layeredGraph.getProperty(LAYERING_NODE_PROMOTION_STRATEGY)

    switch (this.promotionStrategy) {
      case 'MODEL_ORDER_LEFT_TO_RIGHT':
        this.precalculateAndSetInformationModelOrder()
        this.modelOrderNodePromotion(true)
        break
      case 'MODEL_ORDER_RIGHT_TO_LEFT':
        this.precalculateAndSetInformationModelOrder()
        this.modelOrderNodePromotion(false)
        break
      default:
        // NIKOLOV 等通用启发式分支: 无 JUnit 测试覆盖, 保持分层不变.
        break
    }

    if (this.promotionStrategy === 'MODEL_ORDER_LEFT_TO_RIGHT'
      || this.promotionStrategy === 'MODEL_ORDER_RIGHT_TO_LEFT') {
      this.setNewLayeringModelOrder(layeredGraph)
    }
    progressMonitor.done()
  }

  private precalculateAndSetInformationModelOrder(): void {
    this.biLayerMap = new BiLayerMap()
    // 不重赋 node.id (ggn 全局 id 被其它代码当数组索引), 用 BiLayerMap 的 nodeToLayer 替代.
    let layerId = 0
    for (const layer of this.masterGraph.getLayers()) {
      layer.id = layerId
      layerId++
    }
    const leftToRight = this.promotionStrategy === 'MODEL_ORDER_LEFT_TO_RIGHT'
    const cmp = (a: LNode, b: LNode): number => {
      // ELK MODEL_ORDER_NODE_COMPARATOR_DESC/ASC: 任一方无 MODEL_ORDER 时 return 0 (稳定保序),
      // 而不是把无 MODEL_ORDER 节点当作值 0 参与排序 (会重排层内顺序, 影响提升判定与 P3 节点序).
      if (!a.hasProperty(MODEL_ORDER) || !b.hasProperty(MODEL_ORDER)) return 0
      const moA = a.getProperty<number>(MODEL_ORDER)
      const moB = b.getProperty<number>(MODEL_ORDER)
      return leftToRight ? moB - moA : moA - moB
    }
    for (const layer of this.masterGraph.getLayers()) {
      layer.getNodes().sort(cmp)
      this.biLayerMap.putAll(layer.id, layer.getNodes())
    }
  }

  private modelOrderNodePromotion(leftToRight: boolean): void {
    let somethingChanged: boolean
    do {
      somethingChanged = false
      const keys = this.biLayerMap.keys()
      for (let currentLayerId = leftToRight ? keys.length - 2 : 1;
        leftToRight ? currentLayerId >= 0 : currentLayerId < keys.length;
        currentLayerId += leftToRight ? -1 : 1) {
        const currentLayer = this.biLayerMap.getValues(currentLayerId)
        for (let nodeIndex = 0; nodeIndex < currentLayer.length; nodeIndex++) {
          const node = currentLayer[nodeIndex]!
          if (!node.hasProperty(MODEL_ORDER)) continue
          if (this.biLayerMap.isMaximalKey(currentLayerId) && leftToRight
            || this.biLayerMap.isMinimalKey(currentLayerId) && !leftToRight) {
            continue
          }
          // 同层节点若有更大的 model order (L2R) 则不能提升.
          let shallBePromoted = true
          for (const otherNode of currentLayer) {
            if (otherNode.hasProperty(MODEL_ORDER)) {
              const nodeMo = node.getProperty<number>(MODEL_ORDER)
              const otherMo = otherNode.getProperty<number>(MODEL_ORDER)
              if (leftToRight && nodeMo < otherMo || !leftToRight && nodeMo > otherMo) {
                shallBePromoted = false
              }
            }
          }
          if (!shallBePromoted) continue

          // 下一层若有更小 (L2R) model order 的节点 → 提升.
          const nextLayerId = leftToRight ? currentLayerId + 1 : currentLayerId - 1
          const nextLayer = this.biLayerMap.getValues(nextLayerId)
          let modelOrderAllowsPromotion = false
          let promoteThroughDummyLayer = true
          let containsLabels = false
          for (const nextLayerNode of nextLayer) {
            if (nextLayerNode.hasProperty(MODEL_ORDER)) {
              if (nextLayerNode !== node) {
                const nodeMo = node.getProperty<number>(MODEL_ORDER)
                const nextMo = nextLayerNode.getProperty<number>(MODEL_ORDER)
                modelOrderAllowsPromotion ||= leftToRight ? nextMo < nodeMo : nextMo > nodeMo
                promoteThroughDummyLayer = false
              }
            } else if (!modelOrderAllowsPromotion && promoteThroughDummyLayer) {
              // label/dummy 层穿透分支 (测试无 label, 完整保留逻辑).
              if (nextLayerNode.getType() === NodeType.LABEL) {
                containsLabels = true
                const nodeConnectedToNextLayer = leftToRight
                  ? nextLayerNode.getIncomingEdges()[0]!.getSource()!.getNode()!
                  : nextLayerNode.getOutgoingEdges()[0]!.getTarget()!.getNode()!
                if (nodeConnectedToNextLayer === node) {
                  const connectedNode = leftToRight
                    ? nextLayerNode.getOutgoingEdges()[0]!.getTarget()!.getNode()!
                    : nextLayerNode.getIncomingEdges()[0]!.getSource()!.getNode()!
                  if ((leftToRight
                    ? this.biLayerMap.getKey(connectedNode) - this.biLayerMap.getKey(nodeConnectedToNextLayer)
                    : this.biLayerMap.getKey(nodeConnectedToNextLayer) - this.biLayerMap.getKey(connectedNode)) <= 2) {
                    promoteThroughDummyLayer = false
                  }
                }
              }
            }
          }
          if (containsLabels && promoteThroughDummyLayer) {
            const connectedNode = leftToRight
              ? node.getOutgoingEdges()[0]!.getTarget()!.getNode()!
              : node.getIncomingEdges()[0]!.getSource()!.getNode()!
            if ((leftToRight
              ? this.biLayerMap.getKey(connectedNode) - this.biLayerMap.getKey(node)
              : this.biLayerMap.getKey(node) - this.biLayerMap.getKey(connectedNode)) <= 2
              && connectedNode.getType() === NodeType.NORMAL) {
              promoteThroughDummyLayer = false
            }
          }

          if (modelOrderAllowsPromotion || promoteThroughDummyLayer) {
            const nodesToPromote = this.promoteNodeByModelOrder(node, leftToRight)
            // Java LinkedHashSet 语义: 去重 + 插入序迭代 (iterator().next + remove + addAll).
            // TS 原 queue 不去重 → 同一节点可重复提升 → MODEL_ORDER 提升过度 (N55/N56 追到同层).
            const promoteSet = new Set(nodesToPromote)
            while (promoteSet.size > 0) {
              const nodeToPromote = promoteSet.values().next().value!
              promoteSet.delete(nodeToPromote)
              for (const n of this.promoteNodeByModelOrder(nodeToPromote, leftToRight)) promoteSet.add(n)
            }
            nodeIndex--
            somethingChanged = true
          }
        }
      }
    } while (somethingChanged)
  }

  private promoteNodeByModelOrder(node: LNode, leftToRight: boolean): Set<LNode> {
    const oldLayerId = this.biLayerMap.getKey(node)
    this.biLayerMap.put(leftToRight ? oldLayerId + 1 : oldLayerId - 1, node)

    const nodesToPromote = new Set<LNode>()
    for (const edge of leftToRight ? node.getOutgoingEdges() : node.getIncomingEdges()) {
      const nextNode = leftToRight ? edge.getTarget()!.getNode()! : edge.getSource()!.getNode()!
      if (this.biLayerMap.getKey(nextNode) === this.biLayerMap.getKey(node)) {
        nodesToPromote.add(nextNode)
      }
    }
    return nodesToPromote
  }

  private setNewLayeringModelOrder(layeredGraph: LGraph): void {
    const layerList: Layer[] = []
    layeredGraph.getLayers().length = 0
    const keySet = this.biLayerMap.keys().sort((a, b) => a - b)
    for (const layerIndex of keySet) {
      const layerNodes = this.biLayerMap.getValues(layerIndex)
      if (layerNodes.length > 0) {
        const newLayer = new Layer(layeredGraph)
        layerList.push(newLayer)
        newLayer.id = layerIndex
        for (const node of layerNodes) node.setLayer(newLayer)
      }
    }
    layeredGraph.getLayers().push(...layerList)
  }
}
