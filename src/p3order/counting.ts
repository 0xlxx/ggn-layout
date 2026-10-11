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
 * P3 counting 模块: BinaryIndexedTree / CrossMinUtil / CrossingsCounter / AllCrossingsCounter.
 * 对应 ELK p3order/counting/, 1:1 移植 (变量名与 Java 一致).
 *
 * M4 行级对齐核实 (2026-08-11): 与 CrossingsCounter.java (632 行) 逐符号 diff,
 * 无缺失方法/分支. 保留差异均为防御性守卫 (防遗留 portPositions 越界/死循环),
 * 语义与 Java 空索引数组一致: countCrossingsBetweenLayers 的 included 集合过滤、
 * countInLayerCrossingsOnPorts 的越界跳过、BinaryIndexedTree RangeError、positionOf ?? 0.
 *
 * P3 sweep 优化 (2026-08-12, p3-sweep 簇, 位级等价):
 * - BinaryIndexedTree 改 Int32Array + reset() 原地清零复用, 避免每轮计数重建数组.
 * - CrossingsCounter: 直接遍历 incoming/outgoing 替代 getConnectedEdges() 合并数组分配;
 *   initPositions 内联侧过滤 (免 getPortSideView / [...].reverse() 分配); nodeCardinalities 复用.
 * - 所有遍历/求和/排序顺序与改动前逐位一致 (ORDERED 红线遵守).
 */
import type { LNode } from '../graph/lnode.js'
import type { LPort } from '../graph/lport.js'
import type { LEdge } from '../graph/ledge.js'
import { PortSide, NodeType } from '../graph/enums.js'
import { PORT_DUMMY, ORIGIN, IN_LAYER_LAYOUT_UNIT } from '../options/internal-properties.js'

// ═══════════════════════ BinaryIndexedTree ═══════════════════════

export class BinaryIndexedTree {
  private binarySums: Int32Array
  private numsPerIndex: Int32Array
  private count = 0
  private maxNum: number

  constructor(maxNum: number) {
    this.maxNum = maxNum
    this.binarySums = new Int32Array(maxNum + 1)
    this.numsPerIndex = new Int32Array(maxNum)
  }

  add(index: number): void {
    // ELK int[] 对非法索引抛 AIOOBE; JS 数组对 -1/NaN 会死循环 (i += i & -i 恒 0), 这里显式防护.
    if (!Number.isInteger(index) || index < 0 || index >= this.numsPerIndex.length) throw new RangeError(`BinaryIndexedTree.add(${index})`)
    this.count++
    this.numsPerIndex[index]++
    let i = index + 1
    while (i < this.binarySums.length) {
      this.binarySums[i]++
      i += i & -i
    }
  }

  /** rank(index) = 严格小于 index 的元素个数. */
  rank(index: number): number {
    let i = index
    let sum = 0
    while (i > 0) {
      sum += this.binarySums[i]
      i -= i & -i
    }
    return sum
  }

  size(): number {
    return this.count
  }

  removeAll(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= this.numsPerIndex.length) throw new RangeError(`BinaryIndexedTree.removeAll(${index})`)
    const numEntries = this.numsPerIndex[index]
    if (numEntries === 0) return
    this.numsPerIndex[index] = 0
    this.count -= numEntries
    let i = index + 1
    while (i < this.binarySums.length) {
      this.binarySums[i] -= numEntries
      i += i & -i
    }
  }

  /** 复用入口: 重置为容量 maxNum 的空树 (容量不变时原地清零, 免重新分配; 语义 = new BinaryIndexedTree(maxNum)). */
  reset(maxNum: number): void {
    if (maxNum !== this.maxNum) {
      this.maxNum = maxNum
      this.binarySums = new Int32Array(maxNum + 1)
      this.numsPerIndex = new Int32Array(maxNum)
    } else {
      this.binarySums.fill(0)
      this.numsPerIndex.fill(0)
    }
    this.count = 0
  }

  clear(): void {
    this.binarySums.fill(0)
    this.numsPerIndex.fill(0)
    this.count = 0
  }

  isEmpty(): boolean {
    return this.count === 0
  }
}

// ═══════════════════════ CrossMinUtil ═══════════════════════

/** 北→南、东→西 顺序的端口 (对应 ELK CrossMinUtil.inNorthSouthEastWestOrder). */
export function inNorthSouthEastWestOrder(node: LNode, side: PortSide): LPort[] {
  switch (side) {
    case PortSide.EAST:
    case PortSide.NORTH:
      return node.getPortSideView(side)
    case PortSide.SOUTH:
    case PortSide.WEST:
      return [...node.getPortSideView(side)].reverse()
    default:
      return []
  }
}

// ═══════════════════════ CrossingsCounter ═══════════════════════

export interface Pair<T1, T2> {
  first: T1
  second: T2
}

export function pair<T1, T2>(first: T1, second: T2): Pair<T1, T2> {
  return { first, second }
}

export class CrossingsCounter {
  private portPositions: number[]
  private indexTree: BinaryIndexedTree | null = null
  private ends: number[] = []
  private nodeCardinalities: number[] = []
  /** 复用: countCrossingsBetweenLayers 的 included 集合 (仅 .has 查询, 顺序无关). */
  private includedSet = new Set<LPort>()
  /** 复用: included 成员判定 stamp 数组 (等价 includedSet, 数组读替代 Set 哈希; 按 port.id 索引).
   * Uint32Array: 单布局内 countCrossingsBetweenLayers 可达数千次, Uint8 会 256 环绕导致误判. */
  private includedStamp: Uint32Array | null = null
  private includedStampValue = 0
  /** 复用: init* 返回的端口数组 (调用方只在本方法栈内消费, 无跨调用保留 → 免每次分配). */
  private scratchPortsCCW: LPort[] = []
  private scratchPortsInLayer: LPort[] = []
  private scratchPortsNS: LPort[] = []
  private scratchStackNS: LNode[] = []
  /** 复用: countNorthSouthCrossingsOnPorts 的 target/degree 平行数组 (免 Pair 对象分配). */
  private nsTargets: LPort[] = []
  private nsDegrees: number[] = []
  /** countCrossingsOnPorts 的固定拓扑缓存: 全部对端 (incoming→outgoing 原序). */
  private othersByPort: LPort[][] = []
  /** countInLayerCrossingsOnPorts 的固定拓扑缓存: 层内对端 (incoming→outgoing 原序). */
  private inLayerOthersByPort: LPort[][] = []
  /** countInLayerCrossingsOnPorts 的固定拓扑缓存: 层间边数. */
  private betweenLayerDegreeByPort: number[] = []

  private static readonly INDEXING_SIDE = PortSide.WEST
  private static readonly STACK_SIDE = PortSide.EAST

  constructor(portPositions: number[]) {
    this.portPositions = portPositions
  }

  countCrossingsBetweenLayers(leftLayerNodes: LNode[], rightLayerNodes: LNode[]): number {
    const ports = this.initPortPositionsCounterClockwise(leftLayerNodes, rightLayerNodes)
    this.indexTree ??= new BinaryIndexedTree(ports.length)
    this.indexTree.reset(ports.length)
    // 只跳过 "otherEnd 不在本次层间端口集合 (left EAST ∪ right WEST)" 的边:
    // 同侧层内边 (otherEnd 在集合) Java 会计数, 必须保留; 异侧层内边/集合外端口
    // Java positionOf=0/遗留不计数, 显式集合判断等价且防遗留值越界.
    // included 仅作哨兵 (countCrossingsOnPorts 用 includedStamp 判定成员, Set 不再构建).
    const included = this.includedSet
    this.includedStamp ??= new Uint32Array(this.portPositions.length)
    let stamp = ++this.includedStampValue
    if (stamp >= 0x100000000) {
      // Uint32Array 存储值在 2^32 处环绕 → 整体重置 (对抗审阅 R35: 单实例调用量 ~1e5 不可达, 防御未来长生命周期复用)
      this.includedStamp!.fill(0)
      this.includedStampValue = 1
      stamp = 1
    }
    for (const p of ports) this.includedStamp![p.id] = stamp
    return this.countCrossingsOnPorts(ports, included)
  }

  countInLayerCrossingsOnSide(nodes: LNode[], side: PortSide): number {
    const ports = this.initPortPositionsForInLayerCrossings(nodes, side)
    return this.countInLayerCrossingsOnPorts(ports)
  }

  countNorthSouthPortCrossingsInLayer(layer: LNode[]): number {
    const ports = this.initPositionsForNorthSouthCounting(layer)
    this.indexTree ??= new BinaryIndexedTree(ports.length)
    this.indexTree.reset(ports.length)
    const r = this.countNorthSouthCrossingsOnPorts(ports)
    if (process.env.GGN_NS_DBG) {
      const names = layer.map(n => {
        if (n.getType() === NodeType.NORTH_SOUTH_PORT) {
          const op = n.getPorts()[0]?.getProperty<unknown>(ORIGIN)
          return 'd(' + (op !== null && op !== undefined ? String((op as { id?: unknown })?.id ?? op) : '?') + ')'
        }
        const nps = n.getPortSideView(PortSide.NORTH).map(p => 'N' + (p.id ?? '?'))
        const sps = n.getPortSideView(PortSide.SOUTH).map(p => 'S' + (p.id ?? '?'))
        return (n.getLabels()[0]?.text ?? 'N?') + '{' + nps.join(',') + sps.join(',') + '}'
      }).join(',')
      console.error(`GGN_NS_LAYER ${names} => ${r}`)
    }
    return r
  }

  countCrossingsBetweenPortsInBothOrders(upperPort: LPort, lowerPort: LPort): Pair<number, number> {
    const ports = this.connectedPortsSortedByPosition(upperPort, lowerPort)
    const upperLowerCrossings = this.countCrossingsOnPorts(ports)
    this.indexTree!.clear()
    this.switchPorts(upperPort, lowerPort)
    ports.sort((a, b) => this.positionOf(a) - this.positionOf(b))
    const lowerUpperCrossings = this.countCrossingsOnPorts(ports)
    this.indexTree!.clear()
    this.switchPorts(lowerPort, upperPort)
    return pair(upperLowerCrossings, lowerUpperCrossings)
  }

  countInLayerCrossingsBetweenNodesInBothOrders(upperNode: LNode, lowerNode: LNode, side: PortSide): Pair<number, number> {
    const ports = this.connectedInLayerPortsSortedByPosition(upperNode, lowerNode, side)
    const upperLowerCrossings = this.countInLayerCrossingsOnPorts(ports)
    this.switchNodes(upperNode, lowerNode, side)
    this.indexTree!.clear()
    ports.sort((a, b) => this.positionOf(a) - this.positionOf(b))
    const lowerUpperCrossings = this.countInLayerCrossingsOnPorts(ports)
    this.switchNodes(lowerNode, upperNode, side)
    this.indexTree!.clear()
    return pair(upperLowerCrossings, lowerUpperCrossings)
  }

  initForCountingBetween(leftLayerNodes: LNode[], rightLayerNodes: LNode[]): void {
    const ports = this.initPortPositionsCounterClockwise(leftLayerNodes, rightLayerNodes)
    this.indexTree ??= new BinaryIndexedTree(ports.length)
    this.indexTree.reset(ports.length)
  }

  initPortPositionsForInLayerCrossings(nodes: LNode[], side: PortSide): LPort[] {
    const ports = this.scratchPortsInLayer
    ports.length = 0
    this.initPositions(nodes, ports, side, true, true)
    this.indexTree ??= new BinaryIndexedTree(ports.length)
    this.indexTree.reset(ports.length)
    return ports
  }

  switchPorts(topPort: LPort, bottomPort: LPort): void {
    const topPortPos = this.portPositions[topPort.id]
    this.portPositions[topPort.id] = this.portPositions[bottomPort.id]
    this.portPositions[bottomPort.id] = topPortPos
  }

  switchNodes(wasUpperNode: LNode, wasLowerNode: LNode, side: PortSide): void {
    let ports = inNorthSouthEastWestOrder(wasUpperNode, side)
    for (const port of ports) {
      this.portPositions[port.id] = this.positionOf(port) + this.nodeCardinalities[wasLowerNode.id]
    }
    ports = inNorthSouthEastWestOrder(wasLowerNode, side)
    for (const port of ports) {
      this.portPositions[port.id] = this.positionOf(port) - this.nodeCardinalities[wasUpperNode.id]
    }
  }

  // ── 私有: 计数核心 ──

  private connectedPortsSortedByPosition(upperPort: LPort, lowerPort: LPort): LPort[] {
    const ports = new Set<LPort>()
    for (const port of [upperPort, lowerPort]) {
      ports.add(port)
      for (const edge of port.getIncomingEdges()) {
        if (!this.isPortSelfLoop(edge)) ports.add(this.otherEndOf(edge, port))
      }
      for (const edge of port.getOutgoingEdges()) {
        if (!this.isPortSelfLoop(edge)) ports.add(this.otherEndOf(edge, port))
      }
    }
    return [...ports].sort((a, b) => this.positionOf(a) - this.positionOf(b))
  }

  private connectedInLayerPortsSortedByPosition(upperNode: LNode, lowerNode: LNode, side: PortSide): LPort[] {
    const ports = new Set<LPort>()
    for (const node of [upperNode, lowerNode]) {
      for (const port of inNorthSouthEastWestOrder(node, side)) {
        for (const edge of port.getIncomingEdges()) {
          if (!edge.isSelfLoop()) {
            ports.add(port)
            if (this.isInLayer(edge)) ports.add(this.otherEndOf(edge, port))
          }
        }
        for (const edge of port.getOutgoingEdges()) {
          if (!edge.isSelfLoop()) {
            ports.add(port)
            if (this.isInLayer(edge)) ports.add(this.otherEndOf(edge, port))
          }
        }
      }
    }
    return [...ports].sort((a, b) => this.positionOf(a) - this.positionOf(b))
  }

  /** 构建/复用端口对端缓存 (边结构在 counter 生命周期内固定). */
  private getOthers(port: LPort): LPort[] {
    const cached = this.othersByPort[port.id]
    if (cached !== undefined) return cached
    const others: LPort[] = []
    const incoming = port.getIncomingEdges()
    for (let edgeIx = 0; edgeIx < incoming.length; edgeIx++) {
      const edge = incoming[edgeIx]!
      others.push(port === edge.getSource() ? edge.getTarget()! : edge.getSource()!)
    }
    const outgoing = port.getOutgoingEdges()
    for (let edgeIx = 0; edgeIx < outgoing.length; edgeIx++) {
      const edge = outgoing[edgeIx]!
      others.push(port === edge.getSource() ? edge.getTarget()! : edge.getSource()!)
    }
    this.othersByPort[port.id] = others
    return others
  }

  private countCrossingsOnPorts(ports: Iterable<LPort>, included?: Set<LPort>): number {
    let crossings = 0
    const indexTree = this.indexTree!
    const ends = this.ends
    const portPositions = this.portPositions
    const includedStamp = included === undefined ? null : this.includedStamp!
    const includedStampValue = this.includedStampValue
    for (const port of ports) {
      const portPosition = portPositions[port.id] ?? 0
      indexTree.removeAll(portPosition)
      const others = this.getOthers(port)
      for (let otherIx = 0; otherIx < others.length; otherIx++) {
        const other = others[otherIx]!
        // otherEnd 不在本次端口集合 (异侧层内边/跨层端) → Java positionOf=0/遗留不计数;
        // 显式集合判断等价且防 BinaryIndexedTree.add 遗留值越界 (stamp 数组替代 Set.has).
        if (includedStamp !== null && includedStamp[other.id] !== includedStampValue) continue
        const endPosition = portPositions[other.id] ?? 0
        if (endPosition > portPosition) {
          crossings += indexTree.rank(endPosition)
          ends.push(endPosition)
        }
      }
      while (ends.length > 0) indexTree.add(ends.pop()!)
    }
    return crossings
  }

  /** 构建/复用层内边拓扑缓存 (边结构与层归属在 counter 生命周期内固定). */
  private getInLayerOthers(port: LPort): LPort[] {
    const cached = this.inLayerOthersByPort[port.id]
    if (cached !== undefined) return cached
    const others: LPort[] = []
    let betweenLayerEdges = 0
    const incoming = port.getIncomingEdges()
    for (let edgeIx = 0; edgeIx < incoming.length; edgeIx++) {
      const edge = incoming[edgeIx]!
      if (edge.getSource()!.getNode()!.getLayer() === edge.getTarget()!.getNode()!.getLayer()) {
        others.push(port === edge.getSource() ? edge.getTarget()! : edge.getSource()!)
      } else {
        betweenLayerEdges++
      }
    }
    const outgoing = port.getOutgoingEdges()
    for (let edgeIx = 0; edgeIx < outgoing.length; edgeIx++) {
      const edge = outgoing[edgeIx]!
      if (edge.getSource()!.getNode()!.getLayer() === edge.getTarget()!.getNode()!.getLayer()) {
        others.push(port === edge.getSource() ? edge.getTarget()! : edge.getSource()!)
      } else {
        betweenLayerEdges++
      }
    }
    this.inLayerOthersByPort[port.id] = others
    this.betweenLayerDegreeByPort[port.id] = betweenLayerEdges
    return others
  }

  private countInLayerCrossingsOnPorts(ports: Iterable<LPort>): number {
    let crossings = 0
    const indexTree = this.indexTree!
    const ends = this.ends
    const portPositions = this.portPositions
    const maxIndex = indexTree['numsPerIndex'].length
    const debug = process.env.GGN_CC_DBG
    for (const port of ports) {
      if (debug) console.error('CC port', port.id, 'pos', portPositions[port.id] ?? 0, 'edges', port.getConnectedEdges().map(e => (e.getSource()!.id ?? '?') + '->' + (e.getTarget()!.id ?? '?')))
      const portPosition = portPositions[port.id] ?? 0
      indexTree.removeAll(portPosition)
      const inLayerOthers = this.getInLayerOthers(port)
      for (let otherIx = 0; otherIx < inLayerOthers.length; otherIx++) {
        const other = inLayerOthers[otherIx]!
        const endPosition = portPositions[other.id] ?? 0
        // 异侧层内边 (source EAST -> target WEST 同层): otherEnd 不在本侧端口集合,
        // positionOf 读到遗留值 → BIT.add 越界. ELK Java 层内边同侧 (otherEnd 必在集合),
        // 跳过不改变 Java 语义等价.
        if (endPosition > portPosition && endPosition < maxIndex) {
          crossings += indexTree.rank(endPosition)
          ends.push(endPosition)
        }
      }
      crossings += indexTree.size() * this.betweenLayerDegreeByPort[port.id]!
      while (ends.length > 0) indexTree.add(ends.pop()!)
    }
    return crossings
  }

  private countNorthSouthCrossingsOnPorts(ports: Iterable<LPort>): number {
    let crossings = 0
    const indexTree = this.indexTree!
    const ends = this.ends
    const portPositions = this.portPositions
    const targets = this.nsTargets
    const degrees = this.nsDegrees
    for (const port of ports) {
      const portPosition = portPositions[port.id] ?? 0
      indexTree.removeAll(portPosition)
      targets.length = 0
      degrees.length = 0

      switch (port.getNode()!.getType()) {
        case NodeType.NORMAL: {
          const dummy = port.getProperty<LNode | null>(PORT_DUMMY)
          if (dummy) {
            for (const p of dummy.getPorts()) {
              targets.push(p)
              degrees.push(p.getDegree())
            }
          }
          break
        }
        case NodeType.LONG_EDGE: {
          const other = port.getNode()!.getPorts().find(p => p !== port)
          if (other) {
            targets.push(other)
            degrees.push(other.getDegree())
          }
          break
        }
        case NodeType.NORTH_SOUTH_PORT: {
          const dummyPort = port.getProperty(ORIGIN) as LPort | null
          if (dummyPort) {
            targets.push(dummyPort)
            degrees.push(port.getDegree())
          }
          break
        }
        default:
          break
      }

      for (let i = 0; i < targets.length; i++) {
        const endPosition = portPositions[targets[i]!.id] ?? 0
        if (endPosition > portPosition) {
          crossings += indexTree.rank(endPosition) * degrees[i]!
          ends.push(endPosition)
        }
      }
      while (ends.length > 0) indexTree.add(ends.pop()!)
    }
    return crossings
  }

  // ── 私有: 位置初始化 ──

  private initPositions(nodes: LNode[], ports: LPort[], side: PortSide, topDown: boolean, getCardinalities: boolean): void {
    let numPorts = ports.length
    if (getCardinalities && this.nodeCardinalities.length < nodes.length) {
      this.nodeCardinalities = new Array<number>(nodes.length)
    }
    // 原 getPorts: side===EAST ? (topDown ? view : reverse(view)) : (topDown ? reverse(view) : view)
    // 内联为按方向遍历 node.getPorts() 并过滤 side, 免 getPortSideView / [...].reverse() 分配.
    const forward = side === PortSide.EAST ? topDown : !topDown
    if (topDown) {
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i]!
        const nodePorts = node.getPorts()
        let count = 0
        if (forward) {
          for (let k = 0; k < nodePorts.length; k++) {
            const port = nodePorts[k]!
            if (port.getSide() === side) {
              this.portPositions[port.id] = numPorts++
              ports.push(port)
              count++
            }
          }
        } else {
          for (let k = nodePorts.length - 1; k >= 0; k--) {
            const port = nodePorts[k]!
            if (port.getSide() === side) {
              this.portPositions[port.id] = numPorts++
              ports.push(port)
              count++
            }
          }
        }
        if (getCardinalities) this.nodeCardinalities[node.id] = count
      }
    } else {
      for (let i = nodes.length - 1; i >= 0; i--) {
        const node = nodes[i]!
        const nodePorts = node.getPorts()
        let count = 0
        if (forward) {
          for (let k = 0; k < nodePorts.length; k++) {
            const port = nodePorts[k]!
            if (port.getSide() === side) {
              this.portPositions[port.id] = numPorts++
              ports.push(port)
              count++
            }
          }
        } else {
          for (let k = nodePorts.length - 1; k >= 0; k--) {
            const port = nodePorts[k]!
            if (port.getSide() === side) {
              this.portPositions[port.id] = numPorts++
              ports.push(port)
              count++
            }
          }
        }
        if (getCardinalities) this.nodeCardinalities[node.id] = count
      }
    }
  }

  private initPortPositionsCounterClockwise(leftLayerNodes: LNode[], rightLayerNodes: LNode[]): LPort[] {
    const ports = this.scratchPortsCCW
    ports.length = 0
    this.initPositions(leftLayerNodes, ports, PortSide.EAST, true, false)
    this.initPositions(rightLayerNodes, ports, PortSide.WEST, false, false)
    return ports
  }

  private initPositionsForNorthSouthCounting(nodes: LNode[]): LPort[] {
    const ports = this.scratchPortsNS
    ports.length = 0
    const stack = this.scratchStackNS
    stack.length = 0
    let lastLayoutUnit: LNode | null = null
    let index = 0
    for (let i = 0; i < nodes.length; ++i) {
      const current = nodes[i]!
      if (this.isLayoutUnitChanged(lastLayoutUnit, current)) {
        index = this.emptyStack(stack, ports, CrossingsCounter.STACK_SIDE, index)
      }
      if (current.hasProperty(IN_LAYER_LAYOUT_UNIT)) {
        lastLayoutUnit = current.getProperty<LNode>(IN_LAYER_LAYOUT_UNIT)
      }
      switch (current.getType()) {
        case NodeType.NORMAL:
          for (const p of current.getPorts()) {
            if (p.getSide() === PortSide.NORTH && p.hasProperty(PORT_DUMMY)) {
              this.portPositions[p.id] = index++
              ports.push(p)
            }
          }
          index = this.emptyStack(stack, ports, CrossingsCounter.STACK_SIDE, index)
          for (const p of current.getPorts()) {
            if (p.getSide() === PortSide.SOUTH && p.hasProperty(PORT_DUMMY)) {
              this.portPositions[p.id] = index++
              ports.push(p)
            }
          }
          break
        case NodeType.NORTH_SOUTH_PORT: {
          const idxPort = this.firstPortOnSide(current, CrossingsCounter.INDEXING_SIDE)
          if (idxPort !== null) {
            this.portPositions[idxPort.id] = index++
            ports.push(idxPort)
          }
          if (this.countPortsOnSide(current, CrossingsCounter.STACK_SIDE) > 0) {
            stack.push(current)
          }
          break
        }
        case NodeType.LONG_EDGE:
          for (const p of current.getPorts()) {
            if (p.getSide() === PortSide.WEST) {
              this.portPositions[p.id] = index++
              ports.push(p)
            }
          }
          for (let e = 0, nEast = this.countPortsOnSide(current, PortSide.EAST); e < nEast; e++) stack.push(current)
          break
        default:
          break
      }
    }
    this.emptyStack(stack, ports, CrossingsCounter.STACK_SIDE, index)
    return ports
  }

  private emptyStack(stack: LNode[], ports: LPort[], side: PortSide, startIndex: number): number {
    let index = startIndex
    while (stack.length > 0) {
      const dummy = stack.pop()!
      const p = this.firstPortOnSide(dummy, side)!
      this.portPositions[p.id] = index++
      ports.push(p)
    }
    return index
  }

  /** 侧端口视图 (对应 ELK getPortSideView 反向逻辑; 测试契约保留, 生产路径已内联免分配). */
  private getPorts(node: LNode, side: PortSide, topDown: boolean): LPort[] {
    if (side === PortSide.EAST) {
      return topDown ? node.getPortSideView(side) : [...node.getPortSideView(side)].reverse()
    }
    return topDown ? [...node.getPortSideView(side)].reverse() : node.getPortSideView(side)
  }

  /** 节点上指定侧的第一个端口 (对应 getPortSideView(side)[0], 免数组分配). */
  private firstPortOnSide(node: LNode, side: PortSide): LPort | null {
    const all = node.getPorts()
    for (let k = 0; k < all.length; k++) {
      if (all[k]!.getSide() === side) return all[k]!
    }
    return null
  }

  /** 节点上指定侧的端口数 (对应 getPortSideView(side).length, 免数组分配). */
  private countPortsOnSide(node: LNode, side: PortSide): number {
    const all = node.getPorts()
    let n = 0
    for (let k = 0; k < all.length; k++) {
      if (all[k]!.getSide() === side) n++
    }
    return n
  }

  private start(nodes: LNode[], topDown: boolean): number {
    return topDown ? 0 : nodes.length - 1
  }

  private end(i: number, topDown: boolean, nodes: LNode[]): boolean {
    return topDown ? i < nodes.length : i >= 0
  }

  private step(topDown: boolean): number {
    return topDown ? 1 : -1
  }

  private isInLayer(edge: LEdge): boolean {
    return edge.getSource()!.getNode()!.getLayer() === edge.getTarget()!.getNode()!.getLayer()
  }

  private positionOf(port: LPort): number {
    // ELK int[] 默认 0; ggn number[] 未初始化是 undefined, 这里对齐 Java 语义 (position 0).
    return this.portPositions[port.id] ?? 0
  }

  private otherEndOf(edge: LEdge, fromPort: LPort): LPort {
    return fromPort === edge.getSource() ? edge.getTarget()! : edge.getSource()!
  }

  private isPortSelfLoop(edge: LEdge): boolean {
    return edge.getSource() === edge.getTarget()
  }

  private isLayoutUnitChanged(lastUnit: LNode | null, node: LNode): boolean {
    if (lastUnit === null || lastUnit === node || !node.hasProperty(IN_LAYER_LAYOUT_UNIT)) return false
    return node.getProperty<LNode>(IN_LAYER_LAYOUT_UNIT) !== lastUnit
  }
}
