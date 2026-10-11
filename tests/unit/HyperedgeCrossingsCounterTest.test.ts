/**
 * HyperedgeCrossingsCounter 移植单测 (ELK p3order.counting.HyperedgeCrossingsCounter).
 * 性质: 普通边时结果与 CrossingsCounter 精确一致 (ELK 文档保证); 超边 (度>1 端口) 时用区域重叠估算.
 */
import { describe, expect, it } from 'vitest'
import { LGraph, LNode, LPort, LEdge, PortSide, Layer as GLayer } from '../../src/index.js'
import { CrossingsCounter } from '../../src/p3order/counting.js'
import { HyperedgeCrossingsCounter } from '../../src/p3order/counting/hyperedge-crossings-counter.js'

function makeLayer(g: LGraph): GLayer {
  const l = new GLayer(g)
  g.getLayers().push(l)
  return l
}

function addNode(g: LGraph, layer: GLayer): LNode {
  const n = new LNode(g)
  n.size = { x: 10, y: 10 }
  n.setLayer(layer)
  return n
}

function addPort(n: LNode, side: PortSide): LPort {
  const p = new LPort()
  p.setNode(n)
  p.setSide(side)
  return p
}

function edge(s: LPort, t: LPort): void {
  const e = new LEdge()
  e.setSource(s)
  e.setTarget(t)
}

function countBoth(left: LNode[], right: LNode[], nPorts: number): { normal: number; hyper: number } {
  const portPos = new Array<number>(nPorts)
  const cc = new CrossingsCounter(portPos)
  const hec = new HyperedgeCrossingsCounter([], [], portPos)
  const normal = cc.countCrossingsBetweenLayers(left, right)
  const hyper = hec.countCrossings(left, right)
  return { normal, hyper }
}

describe('HyperedgeCrossingsCounter (ELK Java 移植)', () => {
  it('普通边 (无度>1 端口): 与普通计数精确一致', () => {
    const g = new LGraph()
    const l0 = makeLayer(g)
    const l1 = makeLayer(g)
    const A = addNode(g, l0), B = addNode(g, l0)
    const C = addNode(g, l1), D = addNode(g, l1)
    const pA = addPort(A, PortSide.EAST), pB = addPort(B, PortSide.EAST)
    const pC = addPort(C, PortSide.WEST), pD = addPort(D, PortSide.WEST)
    edge(pA, pD); edge(pB, pC)  // A→D 与 B→C 交叉 (每端口度 1)
    let id = 0
    for (const n of [A, B, C, D]) for (const p of n.getPorts()) p.id = id++
    const { normal, hyper } = countBoth([A, B], [C, D], id)
    expect(normal).toBe(1)
    expect(hyper).toBe(1)
  })

  it('无交叉时都为 0', () => {
    const g = new LGraph()
    const l0 = makeLayer(g)
    const l1 = makeLayer(g)
    const A = addNode(g, l0), B = addNode(g, l0)
    const C = addNode(g, l1), D = addNode(g, l1)
    const pA = addPort(A, PortSide.EAST), pB = addPort(B, PortSide.EAST)
    const pC = addPort(C, PortSide.WEST), pD = addPort(D, PortSide.WEST)
    edge(pA, pC); edge(pB, pD)
    let id = 0
    for (const n of [A, B, C, D]) for (const p of n.getPorts()) p.id = id++
    const { normal, hyper } = countBoth([A, B], [C, D], id)
    expect(normal).toBe(0)
    expect(hyper).toBe(0)
  })

  it('超边 (A 一个端口度 2): 计数不抛异常且非负', () => {
    const g = new LGraph()
    const l0 = makeLayer(g)
    const l1 = makeLayer(g)
    const A = addNode(g, l0), B = addNode(g, l0)
    const C = addNode(g, l1), D = addNode(g, l1)
    const pA1 = addPort(A, PortSide.EAST), pA2 = addPort(A, PortSide.EAST)
    const pB = addPort(B, PortSide.EAST)
    const pC = addPort(C, PortSide.WEST), pD = addPort(D, PortSide.WEST)
    edge(pA1, pC); edge(pA2, pD); edge(pB, pC)
    let id = 0
    for (const n of [A, B, C, D]) for (const p of n.getPorts()) p.id = id++
    const portPos = new Array<number>(id)
    const hec = new HyperedgeCrossingsCounter([], [], portPos)
    const hyper = hec.countCrossings([A, B], [C, D])
    expect(hyper).toBeGreaterThanOrEqual(0)
  })

  // ── 超边区域重叠/合并/平局路径 (精确计数, 探测脚本实证) ──

  /** 构造 2 层图, 返回 [left, right, 端口数]. */
  function build2Layer(
    leftNodes: number, rightNodes: number,
    wire: (l: LNode[], r: LNode[]) => void,
  ): { left: LNode[]; right: LNode[]; nPorts: number } {
    const g = new LGraph()
    const l0 = makeLayer(g)
    const l1 = makeLayer(g)
    const left = Array.from({ length: leftNodes }, () => addNode(g, l0))
    const right = Array.from({ length: rightNodes }, () => addNode(g, l1))
    wire(left, right)
    let id = 0
    for (const n of [...left, ...right]) for (const p of n.getPorts()) p.id = id++
    return { left, right, nPorts: id }
  }

  function hyperOf(b: { left: LNode[]; right: LNode[]; nPorts: number }): number {
    return new HyperedgeCrossingsCounter([], [], new Array<number>(b.nPorts)).countCrossings(b.left, b.right)
  }

  it('超边 + 一条普通边: 区域估算 1', () => {
    const b = build2Layer(2, 2, (l, r) => {
      const p = addPort(l[0]!, PortSide.EAST)
      edge(p, addPort(r[0]!, PortSide.WEST))
      edge(p, addPort(r[1]!, PortSide.WEST))
      edge(addPort(l[1]!, PortSide.EAST), addPort(r[1]!, PortSide.WEST))
    })
    expect(hyperOf(b)).toBe(1)
  })

  it('两超边区域重叠: 估算 2', () => {
    const b = build2Layer(2, 2, (l, r) => {
      const p1 = addPort(l[0]!, PortSide.EAST)
      const p2 = addPort(l[1]!, PortSide.EAST)
      edge(p1, addPort(r[0]!, PortSide.WEST))
      edge(p1, addPort(r[1]!, PortSide.WEST))
      edge(p2, addPort(r[0]!, PortSide.WEST))
      edge(p2, addPort(r[1]!, PortSide.WEST))
    })
    expect(hyperOf(b)).toBe(2)
  })

  it('超边经第三条边合并 (sourceHE≠targetHE): 0', () => {
    const b = build2Layer(2, 2, (l, r) => {
      const p1 = addPort(l[0]!, PortSide.EAST)
      const p2 = addPort(l[0]!, PortSide.EAST)
      const q1 = addPort(r[0]!, PortSide.WEST)
      const q2 = addPort(r[1]!, PortSide.WEST)
      edge(p1, q1)
      edge(p2, q2)
      edge(p1, q2) // 连接两个已有超边 → 合并分支
    })
    expect(hyperOf(b)).toBe(0)
  })

  it('同一源端口两个超边 (upperLeft 平局, compareTo 决胜): 0', () => {
    const b = build2Layer(1, 3, (l, r) => {
      const p = addPort(l[0]!, PortSide.EAST)
      edge(p, addPort(r[0]!, PortSide.WEST))
      edge(p, addPort(r[1]!, PortSide.WEST))
      edge(p, addPort(r[1]!, PortSide.WEST))
      edge(p, addPort(r[2]!, PortSide.WEST))
    })
    expect(hyperOf(b)).toBe(0)
  })

  it('左层 NORTH 出端口参与超边: 2', () => {
    const b = build2Layer(1, 2, (l, r) => {
      const pn = addPort(l[0]!, PortSide.NORTH)
      const p = addPort(l[0]!, PortSide.EAST)
      edge(pn, addPort(r[0]!, PortSide.WEST))
      edge(p, addPort(r[0]!, PortSide.WEST))
      edge(p, addPort(r[1]!, PortSide.WEST))
    })
    expect(hyperOf(b)).toBe(2)
  })

  it('右层 NORTH 输入端口在超边计数中隔离: 0', () => {
    const b = build2Layer(1, 1, (l, r) => {
      const p = addPort(l[0]!, PortSide.EAST)
      edge(p, addPort(r[0]!, PortSide.NORTH))
      edge(p, addPort(r[0]!, PortSide.NORTH))
      edge(addPort(l[0]!, PortSide.EAST), addPort(r[0]!, PortSide.WEST))
    })
    expect(hyperOf(b)).toBe(0)
  })

  it('三端口超边: 1', () => {
    const b = build2Layer(2, 3, (l, r) => {
      const p = addPort(l[0]!, PortSide.EAST)
      edge(p, addPort(r[2]!, PortSide.WEST))
      edge(p, addPort(r[1]!, PortSide.WEST))
      edge(p, addPort(r[0]!, PortSide.WEST))
      edge(addPort(l[1]!, PortSide.EAST), addPort(r[2]!, PortSide.WEST))
    })
    expect(hyperOf(b)).toBe(1)
  })

  it('超边与普通边混合时超边路径不改变普通计数 (度 1 端口边)', () => {
    // 所有端口度 1 → hyperedge 集合为空 (port2HyperedgeMap 无键), 但 countCrossings 仍走
    // sourceCount/targetCount 赋值 → 与普通计数一致
    const g = new LGraph()
    const l0 = makeLayer(g)
    const l1 = makeLayer(g)
    const A = addNode(g, l0), B = addNode(g, l0)
    const C = addNode(g, l1), D = addNode(g, l1)
    const pA = addPort(A, PortSide.EAST), pB = addPort(B, PortSide.EAST)
    const pC = addPort(C, PortSide.WEST), pD = addPort(D, PortSide.WEST)
    edge(pA, pD); edge(pB, pC)
    let id = 0
    for (const n of [A, B, C, D]) for (const p of n.getPorts()) p.id = id++
    const portPos = new Array<number>(id)
    const hec = new HyperedgeCrossingsCounter([], [], portPos)
    expect(hec.countCrossings([A, B], [C, D])).toBe(1)
  })
})
