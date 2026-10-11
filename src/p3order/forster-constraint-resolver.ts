/**
 * ForsterConstraintResolver (对应 ELK p3order.ForsterConstraintResolver).
 * 解析层内后继约束 (NSPP 产生) 与布局单元: 约束图 + 违反检测 + 组融合.
 *
 * 现代 TS: Map<LNode, ConstraintGroup> 替代 ELK 的 [layer][id] 二维数组.
 */
import type { LNode } from '../graph/lnode.js'
import { NodeType } from '../graph/enums.js'
import { IN_LAYER_SUCCESSOR_CONSTRAINTS, IN_LAYER_LAYOUT_UNIT, IN_LAYER_SUCCESSOR_CONSTRAINTS_BETWEEN_NON_DUMMIES } from '../options/internal-properties.js'
import { BarycenterState } from './barycenter-heuristic.js'

/** 只读共享空数组 (buildConstraintsGraph 的 ?? [] 兜底仅被 for-of 迭代, 从不改写 → 免每节点分配). */
const EMPTY_NODES: LNode[] = []

export class ConstraintGroup {
  nodes: LNode[]
  /** 当前 groups 数组下标 (findViolatedConstraint 每次按数组顺序刷新). */
  index = -1
  /** findViolatedConstraint 开始时的组首节点 barycenter 快照. */
  barycenter: number | null = null
  private outgoing: ConstraintGroup[] | null = null
  private incoming: ConstraintGroup[] | null = null
  incomingCount = 0
  private summedWeight: number
  private degree: number

  constructor(nodeOrGroup1: LNode | ConstraintGroup, group2?: ConstraintGroup) {
    if (group2 !== undefined) {
      const g1 = nodeOrGroup1 as ConstraintGroup
      const g2 = group2
      this.nodes = new Array<LNode>(g1.nodes.length + g2.nodes.length)
      let nodeIx = 0
      for (let i = 0; i < g1.nodes.length; i++) this.nodes[nodeIx++] = g1.nodes[i]!
      for (let i = 0; i < g2.nodes.length; i++) this.nodes[nodeIx++] = g2.nodes[i]!

      if (g1.outgoing !== null) {
        const outgoing: ConstraintGroup[] = []
        for (let i = 0; i < g1.outgoing.length; i++) {
          const candidate = g1.outgoing[i]!
          if (candidate !== g2) outgoing.push(candidate)
        }
        if (g2.outgoing !== null) {
          for (let i = 0; i < g2.outgoing.length; i++) {
            const candidate = g2.outgoing[i]!
            if (candidate === g1) continue
            if (outgoing.includes(candidate)) {
              candidate.incomingCount--
            } else {
              outgoing.push(candidate)
            }
          }
        }
        this.outgoing = outgoing
      } else if (g2.outgoing !== null) {
        const outgoing: ConstraintGroup[] = []
        for (let i = 0; i < g2.outgoing.length; i++) {
          const candidate = g2.outgoing[i]!
          if (candidate !== g1) outgoing.push(candidate)
        }
        this.outgoing = outgoing
      }

      this.summedWeight = g1.summedWeight + g2.summedWeight
      this.degree = g1.degree + g2.degree
    } else {
      this.nodes = [nodeOrGroup1 as LNode]
      this.summedWeight = 0
      this.degree = 0
    }
  }

  getSummedWeight(): number { return this.summedWeight }
  getDegree(): number { return this.degree }

  getOutgoing(): ConstraintGroup[] {
    this.outgoing ??= []
    return this.outgoing
  }

  getIncoming(): ConstraintGroup[] {
    this.incoming ??= []
    return this.incoming
  }

  resetOutgoing(): void { this.outgoing = null }
  resetIncoming(): void { this.incoming = null }
  hasOutgoing(): boolean { return this.outgoing !== null && this.outgoing.length > 0 }
  hasIncoming(): boolean { return this.incoming !== null && this.incoming.length > 0 }

  /** 组内首个节点的 barycenter (ELK getBarycenter). */
  getBarycenter(stateOf: (n: LNode) => BarycenterState): number | null {
    return stateOf(this.nodes[0]!).barycenter
  }
}

export class ForsterConstraintResolver {
  readonly skipInitAtLayerLevel = true
  readonly skipInitAtPortLevel = true
  readonly skipInitAtEdgeLevel = true
  readonly skipInitAfterTraversal = true
  private barycenterStates: BarycenterState[][]
  /** P3 sweep: 节点身份→状态 (免 getLayer().getIndex() 热路径; P3 期间节点不换层, init 时一次注册). */
  private nodeState = new WeakMap<LNode, BarycenterState>()
  private groups = new Map<LNode, ConstraintGroup>()
  private layoutUnits = new Map<LNode, LNode[]>()
  private constraintsBetweenNonDummies: boolean
  /** 复用: processConstraintsStage 的 groups 工作数组 (每层一次 stage, 无嵌套 → 免每调用分配). */
  private scratchGroups: ConstraintGroup[] = []

  constructor(currentNodeOrder: LNode[][]) {
    this.barycenterStates = currentNodeOrder.map(layer => layer.map(n => {
      const state = new BarycenterState(n)
      this.nodeState.set(n, state)
      return state
    }))
    this.constraintsBetweenNonDummies = currentNodeOrder.length > 0 && currentNodeOrder[0]!.length > 0
      ? currentNodeOrder[0]![0]!.getGraph()!.getProperty(IN_LAYER_SUCCESSOR_CONSTRAINTS_BETWEEN_NON_DUMMIES)
      : false
  }

  getBarycenterStates(): BarycenterState[][] {
    return this.barycenterStates
  }

  /** BarycenterHeuristic.initAtNodeLevel 创建真实状态后注册 (覆盖构造器占位状态). */
  registerNodeState(node: LNode, state: BarycenterState): void {
    this.nodeState.set(node, state)
  }

  initAtLayerLevel(_l: number, _nodeOrder: LNode[][]): void {}

  initAtNodeLevel(l: number, n: number, nodeOrder: LNode[][]): void {
    this.initNode(nodeOrder[l]![n]!, true)
  }

  /** 对应 ELK 私有 initAtNodeLevel(LNode, boolean) 重载. */
  private initNode(node: LNode, fullInit: boolean): void {
    this.groups.set(node, new ConstraintGroup(node))
    if (fullInit) {
      const layoutUnit = node.getProperty(IN_LAYER_LAYOUT_UNIT)
      if (layoutUnit !== null) {
        const list = this.layoutUnits.get(layoutUnit)
        if (list === undefined) this.layoutUnits.set(layoutUnit, [node])
        else list.push(node)
      }
    }
  }

  initAtPortLevel(): void {}
  initAtEdgeLevel(): void {}
  initAfterTraversal(): void {}

  stateOf(node: LNode): BarycenterState {
    // P3 期间节点不换层, state 在 init 阶段按 层→节点 顺序注册; 与 [layer][id] 数组布局等价.
    return this.nodeState.get(node)!
  }

  processConstraints(nodes: LNode[]): void {
    if (this.constraintsBetweenNonDummies) {
      this.processConstraintsStage(nodes, true)
      for (const node of nodes) {
        this.initNode(node, false)
      }
    }
    this.processConstraintsStage(nodes, false)
  }

  private processConstraintsStage(nodes: LNode[], onlyNormal: boolean): void {
    const groups = this.scratchGroups
    groups.length = 0
    for (let i = 0; i < nodes.length; i++) groups.push(this.groups.get(nodes[i]!)!)
    this.buildConstraintsGraph(groups, onlyNormal)

    let violated = this.findViolatedConstraint(groups)
    let dbgIt = 0
    while (violated !== null) {
      if (process.env.GGN_FORSTER_DBG) {
        dbgIt++
        const gname = (g: ConstraintGroup): string => g.nodes.map(n => {
          if (n.getType() === NodeType.NORTH_SOUTH_PORT) {
            const parts: string[] = []
            for (const pp of n.getPorts()) {
              for (const e of pp.getConnectedEdges()) {
                const other = e.getSource()!.getNode() === n ? e.getTarget()!.getNode() : e.getSource()!.getNode()
                const t = other?.getLabels()[0]?.text
                if (t) parts.push(t)
              }
            }
            return 'd' + (parts.length > 0 ? parts.join('+') : String(n.id))
          }
          return n.getLabels()[0]?.text ?? String(n.id)
        }).join(',')
        const gb = (g: ConstraintGroup): number => g.getBarycenter(n => this.stateOf(n)) ?? NaN
        console.error(`GGN_FORSTER onlyNormal=${onlyNormal} iter=${dbgIt} violated=${gname(violated[0])}(${gb(violated[0]).toFixed(4)}) -> ${gname(violated[1])}(${gb(violated[1]).toFixed(4)}) groups=[${groups.map(g => gname(g) + '(' + gb(g).toFixed(4) + ')').join(' ')}]`)
      }
      this.handleViolatedConstraint(violated[0]!, violated[1]!, groups)
      violated = this.findViolatedConstraint(groups)
    }

    nodes.length = 0
    for (const group of groups) {
      // getBarycenter 只读组首节点, 组内所有节点赋同一值; 提升到组外免每节点重复调用+闭包分配.
      const bc = group.barycenter
      for (const node of group.nodes) {
        nodes.push(node)
        this.stateOf(node).barycenter = bc
      }
    }
  }

  private buildConstraintsGraph(groups: ConstraintGroup[], onlyNormal: boolean): void {
    for (const group of groups) {
      group.resetOutgoing()
      group.incomingCount = 0
    }

    let lastNonDummy: LNode | null = null
    for (const group of groups) {
      const node = group.nodes[0]!
      if (onlyNormal && node.getType() !== NodeType.NORMAL) continue

      for (const successor of node.getProperty<LNode[] | null>(IN_LAYER_SUCCESSOR_CONSTRAINTS) ?? EMPTY_NODES) {
        if (!onlyNormal || successor.getType() === NodeType.NORMAL) {
          const succ = this.groups.get(successor)
          if (succ === undefined) {
            const sLayer = successor.getLayer()
            const nLayer = node.getLayer()
            console.error(`GGN_FORSTER BUG: successor id=${successor.id} label=${successor.getLabels()[0]?.text ?? '?'} type=${successor.getType()} layer=${sLayer?.getIndex() ?? 'UNDEF'} graphParent=${successor.getGraph()?.getParentNode() ? 'nested' : 'root'} | node id=${node.id} label=${node.getLabels()[0]?.text ?? '?'} type=${node.getType()} layer=${nLayer?.getIndex() ?? 'UNDEF'} graphParent=${node.getGraph()?.getParentNode() ? 'nested' : 'root'} | graphNodeCount=${successor.getGraph()?.getAllNodes().length}`)
            continue
          }
          group.getOutgoing().push(succ)
          succ.incomingCount++
        }
      }

      if (!onlyNormal && node.getType() === NodeType.NORMAL) {
        if (lastNonDummy !== null) {
          // ELK Java: layoutUnits 是 Multimap, key 缺失返回空集合 → 无 layout unit 的普通节点不加保序边.
          // (ggn 之前用 ?? [node] 回退, 会给普通节点加"相邻保序边", 与后继约束成环导致约束无法解析 — 移植分歧 bug)
          const lastUnits = this.layoutUnits.get(lastNonDummy) ?? EMPTY_NODES
          const currentUnits = this.layoutUnits.get(node) ?? EMPTY_NODES
          for (const lu of lastUnits) {
            for (const cu of currentUnits) {
              const g1 = this.groups.get(lu)!
              const g2 = this.groups.get(cu)!
              g1.getOutgoing().push(g2)
              g2.incomingCount++
            }
          }
        }
        lastNonDummy = node
      }
    }
  }

  private findViolatedConstraint(groups: ConstraintGroup[]): [ConstraintGroup, ConstraintGroup] | null {
    const stateOf = (n: LNode) => this.stateOf(n)
    // groups 在本次调用内不增删; 下标直接写回对象 (等价 Array.indexOf 首次命中, 免 Map 分配/哈希).
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i]!
      g.index = i
      g.barycenter = stateOf(g.nodes[0]!).barycenter
    }
    const active: ConstraintGroup[] = []
    for (const group of groups) {
      group.resetIncoming()
      if (group.hasOutgoing() && group.incomingCount === 0) {
        active.push(group)
      }
    }

    let head = 0
    while (head < active.length) {
      const group = active[head++]!
      if (group.hasIncoming()) {
        const gb = group.barycenter!
        for (const predecessor of group.getIncoming()) {
          const pb = predecessor.barycenter!
          if (pb === gb) {
            if (predecessor.index > group.index) return [predecessor, group]
          } else if (pb > gb) {
            return [predecessor, group]
          }
        }
      }
      for (const successor of group.getOutgoing()) {
        successor.getIncoming().unshift(group)
        if (successor.incomingCount === successor.getIncoming().length) {
          active.push(successor)
        }
      }
    }
    return null
  }

  private handleViolatedConstraint(g1: ConstraintGroup, g2: ConstraintGroup, groups: ConstraintGroup[]): void {
    const stateOf = (n: LNode) => this.stateOf(n)
    const newNodeGroup = new ConstraintGroup(g1, g2)
    // ELK ConstraintGroup merge constructor: setBarycenter 把合并后 barycenter 写回组内所有节点 state
    // (ggn 之前缺这一步 → 合并组 getBarycenter 返回首节点原值, 与 ELK 的加权/平均 barycenter 分歧).
    const b1 = g1.barycenter
    const b2 = g2.barycenter
    let merged: number | null = null
    const sw = g1.getSummedWeight() + g2.getSummedWeight()
    const deg = g1.getDegree() + g2.getDegree()
    if (deg > 0) merged = sw / deg
    else if (b1 !== null && b2 !== null) merged = (b1 + b2) / 2
    else if (b1 !== null) merged = b1
    else if (b2 !== null) merged = b2
    if (merged !== null) {
      for (const n of newNodeGroup.nodes) this.stateOf(n).barycenter = merged
    }
    newNodeGroup.barycenter = merged

    let alreadyInserted = false
    for (let i = 0; i < groups.length; i++) {
      const group = groups[i]!
      if (group === g1 || group === g2) {
        groups.splice(i, 1)
        i--
      } else if (!alreadyInserted && (group.getBarycenter(stateOf) ?? 0) > (newNodeGroup.getBarycenter(stateOf) ?? 0)) {
        groups.splice(i, 0, newNodeGroup)
        alreadyInserted = true
      } else if (group.hasOutgoing()) {
        const outgoing = group.getOutgoing()
        let remove1 = true
        let remove2 = true
        let removed = false
        for (let j = 0; j < outgoing.length;) {
          const candidate = outgoing[j]!
          if (remove1 && candidate === g1) {
            outgoing.splice(j, 1)
            remove1 = false
            removed = true
          } else if (remove2 && candidate === g2) {
            outgoing.splice(j, 1)
            remove2 = false
            removed = true
          } else {
            j++
          }
        }
        if (removed) {
          outgoing.push(newNodeGroup)
          newNodeGroup.incomingCount++
        }
      }
    }
    if (!alreadyInserted) {
      groups.push(newNodeGroup)
    }
  }
}
