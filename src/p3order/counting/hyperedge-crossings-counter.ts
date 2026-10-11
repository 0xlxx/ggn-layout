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
 * HyperedgeCrossingsCounter (对应 ELK p3order.counting.HyperedgeCrossingsCounter).
 * 超边交叉计数 (Spönemann, Schulze, Rüegg, von Hanxleden, DIAGRAMS 2014):
 * 对端口度 > 1 的层间边用超边区域重叠估算交叉数 (普通边也精确).
 *
 * 优化: 超边数实际很小 (large ptolemy 中位数 5 / 最大 15). 左上连通分量与遍历顺序无关,
 * 因此按左层缓存超边端口组; 每轮只重算边界并按等价逐对公式累计:
 *   上边界逆序对 + 左边界区间对 + 右边界区间对.
 * 公式与 corner 比较器的 tie 语义逐项等价; 只改变计算路径, 不改变计数结果.
 */
import type { LEdge } from '../../graph/ledge.js'
import type { LNode } from '../../graph/lnode.js'
import type { LPort } from '../../graph/lport.js'
import type { Layer } from '../../graph/layer.js'
import { PortSide } from '../../graph/enums.js'

export class HyperedgeCrossingsCounter {
  private readonly portPos: number[]
  /** 右层端口入边(来自异层)谓词缓存 (P3 sweep 期间边不变; 值 2=未知 / 1=有 / 0=无). */
  private inInterlayerCache: Uint8Array | null = null
  /** 左层端口出边(到异层)缓存. */
  private outInterlayerEdges: LEdge[][] | null = null
  /** 左层对象 → 超边连通分量端口组 (Layer.id 可能恒为 0, 必须按对象身份缓存). */
  private hyperedgeGroupsByLayer = new WeakMap<Layer, LPort[][]>()
  /** 复用的超边边界 [upperLeft, lowerLeft, upperRight, lowerRight]. */
  private bounds = new Int32Array(0)

  /**
   * @param inLayerEdgeCount 每层层内边数 (含 N/S dummy 虚拟连接) — 未使用 (对齐 ELK 签名).
   * @param hasNorthSouthPorts 层是否含 N/S 端口 dummy — 未使用 (对齐 ELK 签名).
   * @param portPos 端口位置数组 (与 CrossingsCounter 共享).
   */
  constructor(_inLayerEdgeCount: number[], _hasNorthSouthPorts: boolean[], portPos: number[]) {
    this.portPos = portPos
  }

  private getOutInterlayerEdges(port: LPort, nodeLayer: Layer | null): LEdge[] {
    const outInterlayerEdges = (this.outInterlayerEdges ??= [])
    let edges = outInterlayerEdges[port.id]
    if (edges === undefined) {
      edges = []
      const outgoing = port.getOutgoingEdges()
      for (let edgeIx = 0; edgeIx < outgoing.length; edgeIx++) {
        const edge = outgoing[edgeIx]!
        if (nodeLayer !== edge.getTarget()!.getNode()!.getLayer()) edges.push(edge)
      }
      outInterlayerEdges[port.id] = edges
    }
    return edges
  }

  private getIncomingInterlayerFlag(port: LPort, nodeLayer: Layer | null): number {
    const inInterlayerCache = (this.inInterlayerCache ??= new Uint8Array(this.portPos.length).fill(2))
    let inFlag = inInterlayerCache[port.id]!
    if (inFlag !== 2) return inFlag
    inFlag = 0
    const incoming = port.getIncomingEdges()
    for (let edgeIx = 0; edgeIx < incoming.length; edgeIx++) {
      const edge = incoming[edgeIx]!
      if (nodeLayer !== edge.getSource()!.getNode()!.getLayer()) {
        inFlag = 1
        break
      }
    }
    inInterlayerCache[port.id] = inFlag
    return inFlag
  }

  /** 构建左层所有层间边的连通分量；每个分量即一条超边，端口组与顺序无关. */
  private buildHyperedgeGroups(leftLayer: LNode[]): LPort[][] {
    const parent = new Map<number, number>()
    const portById = new Map<number, LPort>()
    const find = (start: number): number => {
      let root = start
      while (parent.get(root) !== root) root = parent.get(root)!
      let current = start
      while (parent.get(current) !== current) {
        const next = parent.get(current)!
        parent.set(current, root)
        current = next
      }
      return root
    }
    const union = (a: number, b: number): void => {
      const rootA = find(a)
      const rootB = find(b)
      if (rootA !== rootB) parent.set(rootB, rootA)
    }
    for (let nodeIx = 0; nodeIx < leftLayer.length; nodeIx++) {
      const node = leftLayer[nodeIx]!
      const nodeLayer = node.getLayer()
      const nodePorts = node.getPorts()
      for (let portIx = 0; portIx < nodePorts.length; portIx++) {
        const sourcePort = nodePorts[portIx]!
        const interlayerEdges = this.getOutInterlayerEdges(sourcePort, nodeLayer)
        if (interlayerEdges.length === 0) continue
        if (!parent.has(sourcePort.id)) {
          parent.set(sourcePort.id, sourcePort.id)
          portById.set(sourcePort.id, sourcePort)
        }
        for (let edgeIx = 0; edgeIx < interlayerEdges.length; edgeIx++) {
          const targetPort = interlayerEdges[edgeIx]!.getTarget()!
          if (!parent.has(targetPort.id)) {
            parent.set(targetPort.id, targetPort.id)
            portById.set(targetPort.id, targetPort)
          }
          union(sourcePort.id, targetPort.id)
        }
      }
    }
    const groupsByRoot = new Map<number, LPort[]>()
    for (const [portId] of parent) {
      const root = find(portId)
      let group = groupsByRoot.get(root)
      if (group === undefined) {
        group = []
        groupsByRoot.set(root, group)
      }
      group.push(portById.get(portId)!)
    }
    return [...groupsByRoot.values()]
  }

  private getHyperedgeGroups(leftLayer: LNode[]): LPort[][] {
    const layer = leftLayer[0]!.getLayer()!
    let groups = this.hyperedgeGroupsByLayer.get(layer)
    if (groups === undefined) {
      groups = this.buildHyperedgeGroups(leftLayer)
      this.hyperedgeGroupsByLayer.set(layer, groups)
    }
    return groups
  }

  countCrossings(leftLayer: LNode[], rightLayer: LNode[]): number {
    const hyperedges = this.getHyperedgeGroups(leftLayer)

    // 给左层端口赋索引 (顺序 north - east - south - west)
    let sourceCount = 0
    for (let nodeIx = 0; nodeIx < leftLayer.length; nodeIx++) {
      const node = leftLayer[nodeIx]!
      const nodeLayer = node.getLayer()
      const nodePorts = node.getPorts()
      for (let portIx = 0; portIx < nodePorts.length; portIx++) {
        const sourcePort = nodePorts[portIx]!
        if (this.getOutInterlayerEdges(sourcePort, nodeLayer).length > 0) this.portPos[sourcePort.id] = sourceCount++
      }
    }

    // 给右层端口赋索引 (顺序 north - west - south - east)
    let targetCount = 0
    for (let nodeIx = 0; nodeIx < rightLayer.length; nodeIx++) {
      const node = rightLayer[nodeIx]!
      const nodeLayer = node.getLayer()
      let northInputPorts = 0
      const rightPorts = node.getPorts()
      for (let portIx = 0; portIx < rightPorts.length; portIx++) {
        const port = rightPorts[portIx]!
        if (port.getSide() !== PortSide.NORTH) break
        if (this.getIncomingInterlayerFlag(port, nodeLayer) === 1) northInputPorts++
      }
      let otherInputPorts = 0
      for (let i = rightPorts.length - 1; i >= 0; i--) {
        const port = rightPorts[i]!
        if (this.getIncomingInterlayerFlag(port, nodeLayer) === 1) {
          if (port.getSide() === PortSide.NORTH) {
            this.portPos[port.id] = targetCount
            targetCount++
          } else {
            this.portPos[port.id] = targetCount + northInputPorts + otherInputPorts
            otherInputPorts++
          }
        }
      }
      targetCount += otherInputPorts
    }

    // 每条超边的上下界
    const numHyperedges = hyperedges.length
    if (this.bounds.length < numHyperedges * 4) this.bounds = new Int32Array(numHyperedges * 4)
    const bounds = this.bounds
    const leftLayerRef = leftLayer[0]!.getLayer()
    const rightLayerRef = rightLayer[0]!.getLayer()
    for (let heIx = 0; heIx < numHyperedges; heIx++) {
      const ports = hyperedges[heIx]!
      let upperLeft = sourceCount
      let lowerLeft = 0
      let upperRight = targetCount
      let lowerRight = 0
      for (let portIx = 0; portIx < ports.length; portIx++) {
        const port = ports[portIx]!
        const pos = this.portPos[port.id]!
        const portLayer = port.getNode()!.getLayer()
        if (portLayer === leftLayerRef) {
          if (pos < upperLeft) upperLeft = pos
          if (pos > lowerLeft) lowerLeft = pos
        } else if (portLayer === rightLayerRef) {
          if (pos < upperRight) upperRight = pos
          if (pos > lowerRight) lowerRight = pos
        }
      }
      const offset = heIx * 4
      bounds[offset] = upperLeft
      bounds[offset + 1] = lowerLeft
      bounds[offset + 2] = upperRight
      bounds[offset + 3] = lowerRight
    }

    // 逐对直接计算: 上边界逆序对 + 左右边界区间对 (超边数中位数 5, O(k^2)).
    let crossings = 0
    for (let i = 0; i < numHyperedges; i++) {
      const iOffset = i * 4
      const aUpperLeft = bounds[iOffset]!
      const aLowerLeft = bounds[iOffset + 1]!
      const aUpperRight = bounds[iOffset + 2]!
      const aLowerRight = bounds[iOffset + 3]!
      for (let j = i + 1; j < numHyperedges; j++) {
        const jOffset = j * 4
        const bUpperLeft = bounds[jOffset]!
        const bLowerLeft = bounds[jOffset + 1]!
        const bUpperRight = bounds[jOffset + 2]!
        const bLowerRight = bounds[jOffset + 3]!

        if ((aUpperLeft < bUpperLeft && aUpperRight > bUpperRight)
          || (bUpperLeft < aUpperLeft && bUpperRight > aUpperRight)) {
          crossings++
        }

        const leftLo = aUpperLeft > bUpperLeft ? aUpperLeft : bUpperLeft
        const leftHi = aLowerLeft < bLowerLeft ? aLowerLeft : bLowerLeft
        if (leftLo < leftHi
          || (aUpperLeft === aLowerLeft && bUpperLeft < aUpperLeft && aUpperLeft < bLowerLeft)
          || (bUpperLeft === bLowerLeft && aUpperLeft < bUpperLeft && bUpperLeft < aLowerLeft)) {
          crossings++
        }

        const rightLo = aUpperRight > bUpperRight ? aUpperRight : bUpperRight
        const rightHi = aLowerRight < bLowerRight ? aLowerRight : bLowerRight
        if (rightLo < rightHi
          || (aUpperRight === aLowerRight && bUpperRight < aUpperRight && aUpperRight < bLowerRight)
          || (bUpperRight === bLowerRight && aUpperRight < bUpperRight && bUpperRight < aLowerRight)) {
          crossings++
        }
      }
    }
    return crossings
  }
}
