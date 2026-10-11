/**
 * PortSideAssigner (ELK intermediate.loops.ordering.PortSideAssigner) 语义单元测试.
 * SSOT: ELK Java 0.12.0 PortSideAssigner.java (selfLoopDistribution: NORTH/NORTH_SOUTH/EQUALLY).
 */
import { describe, expect, it } from 'vitest'
import { LNode, LPort, PortSide } from '../../src/index.js'
import { PortSideAssigner } from '../../src/intermediate/loops/ordering/port-side-assigner.js'
import { SELF_LOOP_DISTRIBUTION } from '../../src/options/layered-options.js'
import {
  makeGraph, makeLayer, makeNode, makePorts, makeEdge, installHolder, hideSelfLoopPorts,
} from './helpers/SelfLoopGraphBuilder.js'

/** 创建 holder: edges 为 (srcIdx, tgtIdx) 端口索引对; 返回端口与每环 slPorts. */
function buildNode(portSides: [PortSide, number][], edges: [number, number][]): { node: LNode; ports: LPort[]; holder: ReturnType<typeof installHolder> } {
  const graph = makeGraph()
  const layer = makeLayer(graph)
  const node = makeNode(graph, layer)
  const bySide = new Map<PortSide, LPort[]>()
  const ports: LPort[] = []
  for (const [side, count] of portSides) {
    const list: LPort[] = []
    for (let i = 0; i < count; i++) {
      const p = new LPort()
      p.setNode(node)
      p.setSide(side)
      list.push(p)
      ports.push(p)
    }
    bySide.set(side, list)
  }
  for (const [s, t] of edges) {
    makeEdge(ports[s]!, ports[t]!)
  }
  return { node, ports, holder: installHolder(node) }
}

describe('PortSideAssigner (ELK Java 移植)', () => {
  it('NORTH 分布: 所有隐藏端口 → NORTH', () => {
    const graph = makeGraph({ distribution: 'NORTH' })
    const layer = makeLayer(graph)
    const node = makeNode(graph, layer)
    const [p1, p2, p3] = makePorts(node, 0, 3, 0, 0)
    makeEdge(p1, p2)
    makeEdge(p2, p3)
    const holder = installHolder(node)
    hideSelfLoopPorts(holder, [p1, p2]) // p3 不隐藏
    new PortSideAssigner().assignPortSides(holder)
    expect(p1.getSide()).toBe(PortSide.NORTH)
    expect(p2.getSide()).toBe(PortSide.NORTH)
    expect(p3.getSide()).toBe(PortSide.EAST) // 非隐藏端口不变
  })

  it('NORTH_SOUTH 分布: 贪心均衡 (隐藏端口数少的侧优先)', () => {
    const graph = makeGraph({ distribution: 'NORTH_SOUTH' })
    const layer = makeLayer(graph)
    const node = makeNode(graph, layer)
    const other = makeNode(graph, layer)
    const [o1] = makePorts(other, 0, 0, 0, 1)
    // L0: pA 隐藏 (SL-only), pB 非隐藏 (有常规边)
    const [pA, pB] = makePorts(node, 0, 2, 0, 0)
    makeEdge(pA, pB)
    makeEdge(pB, o1)
    // L1: pC,pD 全隐藏
    const [pC, pD] = makePorts(node, 0, 0, 2, 0)
    makeEdge(pC, pD)
    // L2: pE 隐藏, pF 非隐藏
    const [pE, pF] = makePorts(node, 0, 0, 0, 2)
    makeEdge(pE, pF)
    makeEdge(pF, o1)

    const holder = installHolder(node)
    hideSelfLoopPorts(holder, [pA, pC, pD, pE])

    new PortSideAssigner().assignPortSides(holder)

    // L0 隐藏 1 → NORTH (north=1); L1 隐藏 2 → north>south → SOUTH (south=2); L2 隐藏 1 → north(1)<=south(2) → NORTH
    expect(pA.getSide()).toBe(PortSide.NORTH)
    expect(pB.getSide()).toBe(PortSide.EAST) // 非隐藏不变
    expect(pC.getSide()).toBe(PortSide.SOUTH)
    expect(pD.getSide()).toBe(PortSide.SOUTH)
    expect(pE.getSide()).toBe(PortSide.NORTH)
    expect(pF.getSide()).toBe(PortSide.WEST) // 非隐藏不变
  })

  it('EQUALLY 分布: 按端口数降序分配 8 个 target, 含 corner 排序', () => {
    const graph = makeGraph({ distribution: 'EQUALLY' })
    const layer = makeLayer(graph)
    const node = makeNode(graph, layer)
    // L0: 3 端口 (2 隐藏 + 1 非隐藏) → NORTH; L1..L4: 2 端口隐藏 → SOUTH/EAST/WEST/NW
    const [pA, pB, pC] = makePorts(node, 0, 3, 0, 0)
    makeEdge(pA, pB)
    makeEdge(pB, pC)
    const [pD, pE] = makePorts(node, 0, 0, 2, 0)
    makeEdge(pD, pE)
    const [pF, pG] = makePorts(node, 0, 0, 0, 2)
    makeEdge(pF, pG)
    const [pH, pI] = makePorts(node, 2, 0, 0, 0)
    makeEdge(pH, pI)
    const [pJ, pK] = makePorts(node, 0, 2, 0, 0)
    makeEdge(pJ, pK)
    // pC 非隐藏: 给它一条到另一节点的常规边
    const other = makeNode(graph, layer)
    const [o1] = makePorts(other, 0, 0, 0, 1)
    makeEdge(pC, o1)

    const holder = installHolder(node)
    hideSelfLoopPorts(holder, [pA, pB, pD, pE, pF, pG, pH, pI, pJ, pK])

    new PortSideAssigner().assignPortSides(holder)

    // 环顺序: L0 {pA,pB,pC} (3 端口) → NORTH target (secondHalfStart=1: [pA]→N? 不对, 见下)
    // target NORTH: first half [0] = pA → NORTH; second half [1,2] = pB → NORTH, pC 非隐藏跳过
    expect(pA.getSide()).toBe(PortSide.NORTH)
    expect(pB.getSide()).toBe(PortSide.NORTH)
    expect(pC.getSide()).toBe(PortSide.EAST)
    // L1 → SOUTH
    expect(pD.getSide()).toBe(PortSide.SOUTH)
    expect(pE.getSide()).toBe(PortSide.SOUTH)
    // L2 → EAST
    expect(pF.getSide()).toBe(PortSide.EAST)
    expect(pG.getSide()).toBe(PortSide.EAST)
    // L3 → WEST
    expect(pH.getSide()).toBe(PortSide.WEST)
    expect(pI.getSide()).toBe(PortSide.WEST)
    // L4 → NW corner: [pJ] → WEST, [pK] → NORTH
    expect(pJ.getSide()).toBe(PortSide.WEST)
    expect(pK.getSide()).toBe(PortSide.NORTH)
  })

  it('非法分布 → throw', () => {
    const graph = makeGraph()
    const layer = makeLayer(graph)
    const node = makeNode(graph, layer)
    const [a, b] = makePorts(node, 0, 2, 0, 0)
    makeEdge(a, b)
    const holder = installHolder(node)
    hideSelfLoopPorts(holder, [a, b])
    node.getGraph()!.setProperty(SELF_LOOP_DISTRIBUTION, 'BOGUS' as never)
    expect(() => new PortSideAssigner().assignPortSides(holder)).toThrow('Unexpected distribution')
  })
})

describe('PortSideAssigner 不变量与边界 (ELK Java 移植)', () => {
  it('EQUALLY 超过 8 个环: assignmentTargets[currLoop % 8] 循环回绕', () => {
    const graph = makeGraph({ distribution: 'EQUALLY' })
    const layer = makeLayer(graph)
    const node = makeNode(graph, layer)
    // 9 个互不相连的 2 端口自环 → 9 个独立超环; install 一次即构建全部
    const pairs: [ReturnType<typeof makePorts>[0], ReturnType<typeof makePorts>[1]][] = []
    for (let i = 0; i < 9; i++) {
      const [a, b] = makePorts(node, 0, 2, 0, 0)
      makeEdge(a, b)
      pairs.push([a, b])
    }
    const holder = installHolder(node)
    expect(holder.getSLHyperLoops()).toHaveLength(9)
    // 注意: hideSelfLoopPorts 会 splice node.getPorts() (live 数组), 必须先拷贝
    const allPorts = [...node.getPorts()]
    hideSelfLoopPorts(holder, allPorts)
    new PortSideAssigner().assignPortSides(holder)
    // 第 9 个环 (currLoop=8) → ASSIGNMENT_TARGETS[8 % 8] = NORTH
    const sides = allPorts.map(p => p.getSide())
    // 前 8 个环: NORTH,SOUTH,EAST,WEST,NW,NE,SW,SE; 第 9 个回绕 NORTH
    const expected = [
      PortSide.NORTH, PortSide.NORTH,
      PortSide.SOUTH, PortSide.SOUTH,
      PortSide.EAST, PortSide.EAST,
      PortSide.WEST, PortSide.WEST,
      PortSide.WEST, PortSide.NORTH, // NW corner
      PortSide.NORTH, PortSide.EAST, // NE corner
      PortSide.SOUTH, PortSide.WEST, // SW corner
      PortSide.EAST, PortSide.SOUTH, // SE corner
      PortSide.NORTH, PortSide.NORTH, // 第 9 个 → NORTH
    ]
    expect(sides).toEqual(expected)
  })

  it('assignPortSides 后所有隐藏端口侧均为已定义侧 (无 UNDEFINED)', () => {
    const graph = makeGraph({ distribution: 'EQUALLY' })
    const layer = makeLayer(graph)
    const node = makeNode(graph, layer)
    const [a, b, c, d] = makePorts(node, 0, 4, 0, 0)
    makeEdge(a, b)
    makeEdge(c, d)
    const holder = installHolder(node)
    hideSelfLoopPorts(holder, [a, b, c, d])
    new PortSideAssigner().assignPortSides(holder)
    for (const slPort of holder.getSLPortMap().values()) {
      if (slPort.isHidden()) {
        expect(slPort.getLPort().getSide()).not.toBe(PortSide.UNDEFINED)
      }
    }
  })
})

describe('PortSideAssigner EQUALLY 细节 (ELK Java 移植)', () => {
  it('EQUALLY 按端口数降序排序: 环创建顺序为升序时仍按降序分配 target', () => {
    const graph = makeGraph({ distribution: 'EQUALLY' })
    const layer = makeLayer(graph)
    const node = makeNode(graph, layer)
    // 先创建 2 端口环, 再创建 3 端口链环 → 原始顺序 [2p, 3p]
    const [a, b] = makePorts(node, 0, 2, 0, 0)
    makeEdge(a, b)
    const [c, d, e] = makePorts(node, 0, 3, 0, 0)
    makeEdge(c, d)
    makeEdge(d, e)
    const holder = installHolder(node)
    // 原始顺序: 2 端口环在前
    expect(holder.getSLHyperLoops().map(l => l.getSLPorts().length)).toEqual([2, 3])
    const allPorts = [...node.getPorts()]
    hideSelfLoopPorts(holder, allPorts)
    new PortSideAssigner().assignPortSides(holder)
    // 排序后 3 端口环 idx0 → NORTH, 2 端口环 idx1 → SOUTH
    expect(a.getSide()).toBe(PortSide.SOUTH)
    expect(b.getSide()).toBe(PortSide.SOUTH)
    expect(c.getSide()).toBe(PortSide.NORTH)
    expect(d.getSide()).toBe(PortSide.NORTH)
    expect(e.getSide()).toBe(PortSide.NORTH)
  })

  it('EQUALLY corner target: 按 netFlow 升序切分 (源在前 → firstSide)', () => {
    const graph = makeGraph({ distribution: 'EQUALLY' })
    const layer = makeLayer(graph)
    const node = makeNode(graph, layer)
    // 前 4 个 4 端口链环 → NORTH/SOUTH/EAST/WEST
    const loops: LPort[][] = []
    for (let i = 0; i < 4; i++) {
      const ps = makePorts(node, 0, 4, 0, 0)
      makeEdge(ps[0]!, ps[1]!)
      makeEdge(ps[1]!, ps[2]!)
      makeEdge(ps[2]!, ps[3]!)
      loops.push(ps)
    }
    // 第 5 个 4 端口环 (idx4 → NW corner), 端口 netFlow 非升序:
    // 边 x→y, y→z, w→y → netFlows x=-1, y=+1, z=+1, w=-1; slPorts 原始顺序 [x,y,z,w]
    const [x, y, z, w] = makePorts(node, 0, 4, 0, 0)
    makeEdge(x, y)
    makeEdge(y, z)
    makeEdge(w, y)
    const holder = installHolder(node)
    expect(holder.getSLHyperLoops()).toHaveLength(5)
    const allPorts = [...node.getPorts()]
    hideSelfLoopPorts(holder, allPorts)
    new PortSideAssigner().assignPortSides(holder)
    // 5 环全部 4 端口 → 排序稳定, 第 5 环 idx4 → NW (WEST, NORTH)
    // netFlow 升序 [-1,-1,+1,+1] → 前半 [x,w] → WEST; 后半 [y,z] → NORTH
    expect(x.getSide()).toBe(PortSide.WEST)
    expect(w.getSide()).toBe(PortSide.WEST)
    expect(y.getSide()).toBe(PortSide.NORTH)
    expect(z.getSide()).toBe(PortSide.NORTH)
  })

  it('EQUALLY corner target: 原始顺序已升序时结果不变 (排序幂等)', () => {
    const graph = makeGraph({ distribution: 'EQUALLY' })
    const layer = makeLayer(graph)
    const node = makeNode(graph, layer)
    for (let i = 0; i < 4; i++) {
      const ps = makePorts(node, 0, 4, 0, 0)
      makeEdge(ps[0]!, ps[1]!)
      makeEdge(ps[1]!, ps[2]!)
      makeEdge(ps[2]!, ps[3]!)
    }
    // 第 5 环: 正常链 x→y→z→w → netFlows [-1,0,+1,+1]? 实际 [-1,0,0,+1] 升序
    const [x, y, z, w] = makePorts(node, 0, 4, 0, 0)
    makeEdge(x, y)
    makeEdge(y, z)
    makeEdge(z, w)
    const holder = installHolder(node)
    const allPorts = [...node.getPorts()]
    hideSelfLoopPorts(holder, allPorts)
    new PortSideAssigner().assignPortSides(holder)
    // 升序 [-1,0,0,+1] → 前半 [x,y] → WEST; 后半 [z,w] → NORTH
    expect(x.getSide()).toBe(PortSide.WEST)
    expect(y.getSide()).toBe(PortSide.WEST)
    expect(z.getSide()).toBe(PortSide.NORTH)
    expect(w.getSide()).toBe(PortSide.NORTH)
  })

  it('EQUALLY: 非隐藏端口在第一半不被赋侧 (isHidden 守卫)', () => {
    const graph = makeGraph({ distribution: 'EQUALLY' })
    const layer = makeLayer(graph)
    const node = makeNode(graph, layer)
    const other = makeNode(graph, layer)
    // p0 可见 (带外部边, 侧 EAST), p1 隐藏
    const p0 = new LPort(); p0.setNode(node); p0.setSide(PortSide.EAST)
    const p1 = new LPort(); p1.setNode(node); p1.setSide(PortSide.EAST)
    makeEdge(p0, p1) // 自环
    const o1 = makePorts(other, 0, 0, 0, 1)[0]!
    makeEdge(p0, o1) // 外部边 → p0 不隐藏
    const holder = installHolder(node)
    hideSelfLoopPorts(holder, [p1])
    new PortSideAssigner().assignPortSides(holder)
    // 单环 → NORTH target: 第一半 [p0] 非隐藏 → 保持 EAST; 第二半 [p1] → NORTH
    expect(p0.getSide()).toBe(PortSide.EAST)
    expect(p1.getSide()).toBe(PortSide.NORTH)
  })
})
