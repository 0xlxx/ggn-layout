/**
 * BarycenterHeuristic (对应 ELK p3order.BarycenterHeuristic).
 */
import type { LNode } from '../graph/lnode.js'
import type { Layer } from '../graph/layer.js'
import { NodeType } from '../graph/enums.js'
import { BARYCENTER_ASSOCIATES } from '../options/internal-properties.js'
import { ForsterConstraintResolver } from './forster-constraint-resolver.js'
import type { ICrossingMinimizationHeuristic } from './interfaces.js'
import { type AbstractBarycenterPortDistributor } from './port-distributors.js'
import { PortType } from '../graph/enums.js'

export class BarycenterState {
  node: LNode
  summedWeight = 0
  degree = 0
  barycenter: number | null = null
  visited = false
  /** 当前 sweep 的 visited 世代 (替代每轮全量清零). */
  visitedGeneration = -1
  /** P3 初始化后稳定的方向邻接: >=0 为同层 node.id, <0 为 -(port.id+1). */
  forwardAdjacency: number[] = []
  backwardAdjacency: number[] = []

  constructor(node: LNode) {
    this.node = node
  }
}

interface Random {
  nextBoolean(): boolean
  nextDouble(): number
  nextFloat(): number
}

const RANDOM_AMOUNT = 0.07

/** R49: 是否为有子的 black-box 节点 (buildGraph 标记 SEPARATE_CHILDREN, 对齐 Java
 * RecursiveGraphLayoutEngine L208). leaf 带算法节点不标记 (Java 当普通 layered 节点). */
function isSeparateBlackBox(node: LNode): boolean {
  return node.getAllProperties().get('org.eclipse.elk.hierarchyHandling') === 'SEPARATE_CHILDREN'
}

/** 节点是否无任何连接边 (孤立). 与 MedianHeuristic 同判定. */
function isIsolated(node: LNode): boolean {
  const ports = node.getPorts()
  for (let i = 0; i < ports.length; i++) {
    const port = ports[i]!
    if (port.getIncomingEdges().length > 0 || port.getOutgoingEdges().length > 0) return false
  }
  return true
}

export class BarycenterHeuristic implements ICrossingMinimizationHeuristic {
  readonly skipInitAtPortLevel = true
  readonly skipInitAtEdgeLevel = true
  protected portRanks!: number[]
  protected readonly random: Random
  protected constraintResolver: ForsterConstraintResolver
  protected barycenterState: BarycenterState[][]
  protected readonly portDistributor: AbstractBarycenterPortDistributor
  /** 当前排序层的 barycenter 状态数组 (node.id → state); 避免比较器走 WeakMap. */
  private barycenterSortStates: BarycenterState[] | null = null
  /** 层对象 → 状态数组; 避免热路径反复做 Layer.getIndex() 线性查找. */
  private readonly layerStates = new WeakMap<Layer, BarycenterState[]>()
  /** 每次 minimizeLayer 入口快照, 避免 GGN_BD_DBG 在每节点热路径反复读 env. */
  private debugBarycenter = false
  /** 每轮 calculateBarycenters 递增, 旧世代状态天然视为未访问. */
  private barycenterVisitGeneration = 0
  /** fillInUnknown preOrdered 分支的下一已定义值缓存 (按层复用). */
  private nextBarycenterScratch: (number | null)[] = []
  /** P3 生命周期内不变的 barycenter associates 快照 (无关联时热路径完全跳过). */
  private readonly barycenterAssociates = new WeakMap<LNode, LNode[]>()
  private hasBarycenterAssociates = false
  /** SEPARATE_CHILDREN black-box 快照 (多数图层无需逐节点查属性). */
  private readonly separateBlackBoxes = new WeakSet<LNode>()
  private hasSeparateBlackBoxes = false

  constructor(
    constraintResolver: ForsterConstraintResolver,
    random: Random,
    portDistributor: AbstractBarycenterPortDistributor,
    graph: LNode[][],
  ) {
    this.constraintResolver = constraintResolver
    this.random = random
    this.portDistributor = portDistributor
    this.barycenterState = constraintResolver.getBarycenterStates()
    // P3 预处理器完成后属性已稳定: 一次性建索引, 避免每 sweep 逐节点属性查找.
    for (let layerIx = 0; layerIx < graph.length; layerIx++) {
      const layer = graph[layerIx]!
      for (let nodeIx = 0; nodeIx < layer.length; nodeIx++) {
        const node = layer[nodeIx]!
        const associates = node.getProperty<LNode[] | null>(BARYCENTER_ASSOCIATES)
        if (associates !== null && associates !== undefined && associates.length > 0) {
          this.barycenterAssociates.set(node, associates)
          this.hasBarycenterAssociates = true
        }
        if (isSeparateBlackBox(node)) {
          this.separateBlackBoxes.add(node)
          this.hasSeparateBlackBoxes = true
        }
      }
    }
  }

  /** 公开仅因测试需要 (单层内排序, 非接口方法). */
  minimizeLayer(layer: LNode[], preOrdered: boolean, randomize: boolean, forward: boolean): void {
    this.debugBarycenter = process.env.GGN_BD_DBG !== undefined
    if (randomize) {
      this.randomizeBarycenters(layer)
    } else {
      this.calculateBarycenters(layer, forward)
      this.fillInUnknownBarycenters(layer, preOrdered)
    }

    if (layer.length > 1) {
      this.barycenterSortStates = this.statesForLayer(layer)
      layer.sort(this.barycenterIndexStateComparator)
      this.barycenterSortStates = null
      if (process.env.GGN_P3_DBG) {
        const sb = layer.map(nn => {
          const b = this.stateOf(nn).barycenter
          let label: string
          if (nn.getType() === NodeType.NORTH_SOUTH_PORT) {
            const parts: string[] = []
            for (const pp of nn.getPorts()) {
              for (const e of pp.getConnectedEdges()) {
                const other = e.getSource()!.getNode() === nn ? e.getTarget()!.getNode() : e.getSource()!.getNode()
                const t = other?.getLabels()[0]?.text
                if (t) parts.push(t)
              }
            }
            label = 'd' + (parts.length > 0 ? parts.join('+') : String(nn.id))
          } else {
            label = nn.getLabels()[0]?.text ?? String(nn.id)
          }
          return `${label}(${b === null ? 'null' : b.toFixed(4)})`
        }).join(' ')
        console.error(`GGN BARY layer=${layer[0]!.getLayer()!.getIndex()} fwd=${forward} preOrdered=${preOrdered} randomize=${randomize} after=[${sb}]`)
      }
      this.constraintResolver.processConstraints(layer)
    }
  }

  protected randomizeBarycenters(nodes: LNode[]): void {
    for (let nodeIx = 0; nodeIx < nodes.length; nodeIx++) {
      const node = nodes[nodeIx]!
      // R49 P0: forward-first sweep 首层走 randomize 分支, **孤立** black-box 也必须排层尾
      // (Java 两遍布局 box 后加入层尾, 与 random 无关) → 赋最大 bc 确定性层尾.
      // 有连接的 black-box (isIsolated=false) 正常随机参与排序 (Java 对连接 black-box 层首, 实测).
      const v = this.hasSeparateBlackBoxes && this.separateBlackBoxes.has(node) && isIsolated(node)
        ? Number.MAX_VALUE : this.random.nextDouble()
      const state = this.stateOf(node)
      state.barycenter = v
      state.summedWeight = v
      state.degree = 1
    }
  }

  protected fillInUnknownBarycenters(nodes: LNode[], preOrdered: boolean): void {
    if (nodes.length === 0) return
    const states = this.statesForLayer(nodes)
    // R49: 孤立 black-box (bc 仍为 null) 排层尾 — Java 两遍布局 box 后加入层尾的近似.
    // 有连接的 black-box bc 非 null (有邻居) 正常参与排序. 赋 Number.MAX_VALUE 保证绝对层尾
    // (普通孤立节点随机 bc 上界 < MAX_VALUE, P1-1: 原 maxBc+1 会被重算 maxBary 反超).
    if (this.hasSeparateBlackBoxes) {
      for (let nodeIx = 0; nodeIx < nodes.length; nodeIx++) {
        const node = nodes[nodeIx]!
        const state = states[node.id]!
        if (state.barycenter === null && this.separateBlackBoxes.has(node) && isIsolated(node)) {
          state.barycenter = Number.MAX_VALUE
          state.summedWeight = Number.MAX_VALUE
          state.degree = 1
        }
      }
    }
    if (preOrdered) {
      const nextDefined = this.nextBarycenterScratch
      nextDefined.length = nodes.length
      let next: number | null = null
      for (let i = nodes.length - 1; i >= 0; i--) {
        nextDefined[i] = next
        const b = states[nodes[i]!.id]!.barycenter
        if (b !== null) next = b
      }

      let lastValue: number = -1
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i]!
        const state = states[node.id]!
        let value: number | null = state.barycenter
        if (value === null) {
          let nextValue = lastValue + 1
          const candidate = nextDefined[i]!
          if (candidate !== null) nextValue = candidate
          value = (lastValue + nextValue) / 2
          state.barycenter = value
          state.summedWeight = value
          state.degree = 1
        }
        lastValue = value
      }
    } else {
      let maxBary = 0
      for (let nodeIx = 0; nodeIx < nodes.length; nodeIx++) {
        const b = states[nodes[nodeIx]!.id]!.barycenter
        if (b !== null) maxBary = Math.max(maxBary, b)
      }
      maxBary += 2
      for (let nodeIx = 0; nodeIx < nodes.length; nodeIx++) {
        const node = nodes[nodeIx]!
        const state = states[node.id]!
        if (state.barycenter === null) {
          const rv = this.random.nextFloat()
          const value = rv * maxBary - 1
          state.barycenter = value
          state.summedWeight = value
          state.degree = 1
        }
      }
    }
  }

  protected calculateBarycenters(nodes: LNode[], forward: boolean): void {
    if (nodes.length === 0) return
    const generation = ++this.barycenterVisitGeneration
    const states = this.statesForLayer(nodes)
    for (let nodeIx = 0; nodeIx < nodes.length; nodeIx++) {
      this.calculateBarycenter(nodes[nodeIx]!, forward, generation, states)
    }
  }

  private calculateBarycenter(
    node: LNode,
    forward: boolean,
    generation: number,
    states: BarycenterState[],
  ): void {
    const state = states[node.id]!
    if (state.visitedGeneration === generation) return
    state.visitedGeneration = generation

    state.degree = 0
    state.summedWeight = 0.0
    state.barycenter = null
    const nodeLayer = node.getLayer()

    const adjacency = forward ? state.forwardAdjacency : state.backwardAdjacency
    {
      for (let edgeIx = 0; edgeIx < adjacency.length; edgeIx++) {
        const fixed = adjacency[edgeIx]!
        if (fixed >= 0) {
          const fixedNode = states[fixed]!.node
          const fixedState = states[fixed]!
          this.calculateBarycenter(fixedNode, forward, generation, states)
          state.degree += fixedState.degree
          state.summedWeight += fixedState.summedWeight
        } else {
          state.summedWeight += this.portRanks[-fixed - 1]!
          state.degree++
        }
      }
    }

    if (this.hasBarycenterAssociates) {
      const barycenterAssociates = this.barycenterAssociates.get(node)
      if (barycenterAssociates !== undefined) {
        for (let associateIx = 0; associateIx < barycenterAssociates.length; associateIx++) {
          const associate = barycenterAssociates[associateIx]!
          if (associate.getLayer() === nodeLayer) {
            const associateState = states[associate.id]!
            this.calculateBarycenter(associate, forward, generation, states)
            state.degree += associateState.degree
            state.summedWeight += associateState.summedWeight
          }
        }
      }
    }

    if (state.degree > 0) {
      const pert = this.random.nextFloat()
      state.summedWeight += pert * RANDOM_AMOUNT - RANDOM_AMOUNT / 2
      state.barycenter = state.summedWeight / state.degree
      if (this.debugBarycenter) {
        const label = node.getType().toString() === "NORMAL" ? (node.getLabels()[0]?.text ?? node.id) : node.id
        const parts: string[] = []
        for (const p of node.getPorts()) {
          for (const e of p.getSuccessorPorts()) {
            const other = e.getNode()
            const l = other?.getType().toString() === "NORMAL" ? (other?.getLabels()[0]?.text ?? other?.id) : other?.id
            parts.push(p.id + "->" + l + ":" + (this.portRanks[e.id] ?? "?"))
          }
          for (const e of p.getPredecessorPorts()) {
            const other = e.getNode()
            const l = other?.getType().toString() === "NORMAL" ? (other?.getLabels()[0]?.text ?? other?.id) : other?.id
            parts.push(l + "->" + p.id + ":" + (this.portRanks[e.id] ?? "?"))
          }
        }
        console.error(`GGN_BD ${label} L${node.getLayer()?.getIndex()} degree=${this.stateOf(node).degree} sw=${this.stateOf(node).summedWeight.toFixed(4)} bc=${this.stateOf(node).barycenter!.toFixed(4)} [${parts.join(" ")}]`)
      }
    }
  }

  private statesForLayer(nodes: LNode[]): BarycenterState[] {
    const layer = nodes[0]!.getLayer()!
    return this.layerStates.get(layer) ?? this.barycenterState[layer.getIndex()]!
  }

  protected stateOf(node: LNode): BarycenterState {
    // P3 期间节点不换层, 状态按节点身份注册 (ForsterConstraintResolver.nodeState), 免 getLayer().getIndex() 热路径.
    return this.constraintResolver.stateOf(node)
  }

  private readonly barycenterIndexStateComparator = (n1: LNode, n2: LNode): number => {
    const states = this.barycenterSortStates!
    const s1 = states[n1.id]!
    const s2 = states[n2.id]!
    if (s1.barycenter !== null && s2.barycenter !== null) {
      return s1.barycenter - s2.barycenter
    } else if (s1.barycenter !== null) {
      return -1
    } else if (s2.barycenter !== null) {
      return 1
    }
    return 0
  }

  protected barycenterStateComparator = (n1: LNode, n2: LNode): number => {
    const s1 = this.stateOf(n1)
    const s2 = this.stateOf(n2)
    if (s1.barycenter !== null && s2.barycenter !== null) {
      return s1.barycenter - s2.barycenter
    } else if (s1.barycenter !== null) {
      return -1
    } else if (s2.barycenter !== null) {
      return 1
    }
    return 0
  }

  minimizeCrossings(order: LNode[][], freeLayerIndex: number, forwardSweep: boolean, isFirstSweep: boolean): boolean {
    if (!this.isFirstLayer(order, freeLayerIndex, forwardSweep)) {
      const fixedLayer = order[freeLayerIndex - this.changeIndex(forwardSweep)]!
      this.portDistributor.calculatePortRanksForLayer(fixedLayer, this.portTypeFor(forwardSweep))
    }

    const firstNodeInLayer = order[freeLayerIndex]![0]!
    const preOrdered = !isFirstSweep || this.isExternalPortDummy(firstNodeInLayer)

    // 原地最小化: minimizeLayer 本身就地排序/改写 (processConstraints 清空重填),
    // 原 copy+writeback 与直接传 order[freeLayerIndex] 结果逐位一致, 免每层拷贝.
    this.minimizeLayer(order[freeLayerIndex]!, preOrdered, false, forwardSweep)

    return false
  }

  setFirstLayerOrder(order: LNode[][], isForwardSweep: boolean): boolean {
    const startIndex = this.startIndex(isForwardSweep, order.length)
    if (process.env.GGN_P3_DBG) console.error(`GGN setFirstLayerOrder fwd=${isForwardSweep} layers=${order.length} startIdx=${startIndex} nodes=${order[startIndex]!.length}`)
    // 原地最小化 (与 minimizeCrossings 同理由: minimizeLayer 就地改写, 免拷贝).
    this.minimizeLayer(order[startIndex]!, false, true, isForwardSweep)
    return false
  }

  private isFirstLayer(order: LNode[][], freeLayerIndex: number, forwardSweep: boolean): boolean {
    return forwardSweep ? freeLayerIndex === 0 : freeLayerIndex === order.length - 1
  }

  private changeIndex(forwardSweep: boolean): number {
    return forwardSweep ? 1 : -1
  }

  private startIndex(isForwardSweep: boolean, length: number): number {
    return isForwardSweep ? 0 : length - 1
  }

  private isExternalPortDummy(node: LNode): boolean {
    return node.getType() === NodeType.EXTERNAL_PORT
  }

  private portTypeFor(isForwardSweep: boolean): PortType {
    return isForwardSweep ? PortType.OUTPUT : PortType.INPUT
  }

  alwaysImproves(): boolean {
    return false
  }

  isDeterministic(): boolean {
    return false
  }

  initAtLayerLevel(l: number, nodeOrder: LNode[][]): void {
    this.barycenterState[l] = new Array<BarycenterState>(nodeOrder[l]!.length)
  }

  initAtNodeLevel(l: number, n: number, nodeOrder: LNode[][]): void {
    const state = new BarycenterState(nodeOrder[l]![n]!)
    this.barycenterState[l]![n] = state
    this.constraintResolver.registerNodeState(nodeOrder[l]![n]!, state)
  }

  initAtPortLevel(): void {}

  initAtEdgeLevel(): void {}

  initAfterTraversal(): void {
    this.portRanks = this.portDistributor.getPortRanks()
    for (let layerIx = 0; layerIx < this.barycenterState.length; layerIx++) {
      const states = this.barycenterState[layerIx]!
      if (states.length > 0) {
        const layer = states[0]!.node.getLayer()
        if (layer !== null) this.layerStates.set(layer, states)
      }
    }
    this.buildBarycenterAdjacency()
  }

  /** P3 初始化后建一次方向邻接; sweep 热路径只扫描整数数组. */
  private buildBarycenterAdjacency(): void {
    for (let layerIx = 0; layerIx < this.barycenterState.length; layerIx++) {
      const states = this.barycenterState[layerIx]!
      for (let nodeIx = 0; nodeIx < states.length; nodeIx++) {
        const node = states[nodeIx]!.node
        const nodeLayer = node.getLayer()
        const forward: number[] = []
        const backward: number[] = []
        const ports = node.getPorts()
        for (let portIx = 0; portIx < ports.length; portIx++) {
          const port = ports[portIx]!
          for (const edge of port.getIncomingEdges()) {
            const fixedPort = edge.getSource()
            if (fixedPort === null) continue
            const fixedNode = fixedPort.getNode()!
            if (fixedNode.getLayer() === nodeLayer) {
              if (fixedNode !== node) forward.push(fixedNode.id)
            } else {
              forward.push(-(fixedPort.id + 1))
            }
          }
          for (const edge of port.getOutgoingEdges()) {
            const fixedPort = edge.getTarget()
            if (fixedPort === null) continue
            const fixedNode = fixedPort.getNode()!
            if (fixedNode.getLayer() === nodeLayer) {
              if (fixedNode !== node) backward.push(fixedNode.id)
            } else {
              backward.push(-(fixedPort.id + 1))
            }
          }
        }
        states[nodeIx]!.forwardAdjacency = forward
        states[nodeIx]!.backwardAdjacency = backward
      }
    }
  }
}
