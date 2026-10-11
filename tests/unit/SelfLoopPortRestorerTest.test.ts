/**
 * SelfLoopPortRestorer (ELK intermediate.SelfLoopPortRestorer) 语义单元测试.
 * SSOT: ELK Java 0.12.0 SelfLoopPortRestorer.java + PortSideAssigner/PortRestorer 组合流程.
 *  - 未隐藏端口: else 分支只 computeSelfLoopTypes, 绝不改端口侧 (SelfLoopPortRestorer.java:66-69)
 *  - 隐藏 + FIXED_SIDE: 端口侧在导入期已确定 (LGraphUtil.createPort), 只恢复 (SelfLoopPortRestorer.java:58-60)
 *  - 隐藏 + UNDEFINED/FREE: PortSideAssigner 先分配侧, 再恢复 (SelfLoopPortRestorer.java:56-58)
 */
import { describe, expect, it } from 'vitest'
import { LNode, LPort, PortSide, Direction } from '../../src/index.js'
import { SelfLoopPortRestorer } from '../../src/intermediate/self-loop-port-restorer.js'
import { ORIGINAL_PORT_CONSTRAINTS, SELF_LOOP_HOLDER } from '../../src/options/internal-properties.js'
import { makeGraph, makeLayer, makeNode, makePorts, makeEdge, installHolder, hideSelfLoopPorts } from './helpers/SelfLoopGraphBuilder.js'
import { expectGraphConservation } from './helpers/conservation.js'

/** 3 端口节点: p0→p1→p2 链式自环. p0 纯出, p1 出入各一, p2 纯入. */
function buildPortNode(direction: Direction, distribution = 'NORTH', sides: PortSide[] | null = null) {
  const graph = makeGraph({ direction, distribution })
  const layer = makeLayer(graph)
  const node = makeNode(graph, layer)
  const ports: LPort[] = []
  for (let i = 0; i < 3; i++) {
    const p = new LPort()
    p.setNode(node)
    if (sides !== null) p.setSide(sides[i]!)
    ports.push(p)
  }
  makeEdge(ports[0]!, ports[1]!)
  makeEdge(ports[1]!, ports[2]!)
  const holder = installHolder(node)
  return { graph, node, ports, holder }
}

describe('SelfLoopPortRestorer (ELK Java 移植)', () => {
  it('未隐藏端口: 只计算 selfLoopType, 不改端口侧 (Java else 分支)', () => {
    // 模拟 ELK importer: 端口侧已在导入期确定 (RIGHT → 输出 EAST / 输入 WEST)
    const { graph, node, ports } = buildPortNode(Direction.RIGHT, 'NORTH', [PortSide.EAST, PortSide.EAST, PortSide.WEST])
    new SelfLoopPortRestorer().process(graph)
    // 端口侧保持不变
    expect(ports[0]!.getSide()).toBe(PortSide.EAST)
    expect(ports[1]!.getSide()).toBe(PortSide.EAST)
    expect(ports[2]!.getSide()).toBe(PortSide.WEST)
    expect(node.getPorts()).toHaveLength(3)
    // computeSelfLoopTypes 效果: {EAST, WEST} → TWO_SIDES_OPPOSING
    const holder = node.getProperty(SELF_LOOP_HOLDER) as import('../../src/intermediate/loops/self-loop-holder.js').SelfLoopHolder
    expect(holder.getSLHyperLoops()[0]!.getSelfLoopType()).toBe('TWO_SIDES_OPPOSING')
  })

  it('未隐藏端口 (DOWN 方向): 侧保持导入值不变', () => {
    const { graph, ports } = buildPortNode(Direction.DOWN, 'NORTH', [PortSide.SOUTH, PortSide.SOUTH, PortSide.NORTH])
    new SelfLoopPortRestorer().process(graph)
    expect(ports[0]!.getSide()).toBe(PortSide.SOUTH)
    expect(ports[1]!.getSide()).toBe(PortSide.SOUTH)
    expect(ports[2]!.getSide()).toBe(PortSide.NORTH)
  })

  it('隐藏端口 + FREE: assignPortSides → 恢复端口 (分布 NORTH 全部到北侧)', () => {
    const { graph, node, ports, holder } = buildPortNode(Direction.RIGHT, 'NORTH', [PortSide.UNDEFINED, PortSide.UNDEFINED, PortSide.UNDEFINED])
    node.setProperty(ORIGINAL_PORT_CONSTRAINTS, 'FREE')
    hideSelfLoopPorts(holder, ports)
    expect(node.getPorts()).toHaveLength(0)
    new SelfLoopPortRestorer().process(graph)
    expect(node.getPorts()).toHaveLength(3)
    for (const p of node.getPorts()) expect(p.getSide()).toBe(PortSide.NORTH)
    for (const slPort of holder.getSLPortMap().values()) expect(slPort.isHidden()).toBe(false)
    expect(holder.arePortsHiddenFlag()).toBe(false)
    expectGraphConservation(graph)
  })

  it('隐藏端口 + FIXED_SIDE: 侧已在导入期确定, 只恢复端口 (不兜底赋侧)', () => {
    // 模拟 ELK importer: RIGHT 方向输出 EAST / 输入 WEST
    const { graph, node, ports, holder } = buildPortNode(Direction.RIGHT, 'NORTH', [PortSide.EAST, PortSide.EAST, PortSide.WEST])
    node.setProperty(ORIGINAL_PORT_CONSTRAINTS, 'FIXED_SIDE')
    hideSelfLoopPorts(holder, ports)
    new SelfLoopPortRestorer().process(graph)
    // 恢复顺序 = 原端口顺序 (side 由导入期确定, 非 ggn 兜底)
    const sides = node.getPorts().map(p => p.getSide())
    expect(sides).toEqual([PortSide.EAST, PortSide.EAST, PortSide.WEST])
    expectGraphConservation(graph)
  })

  it('UNDEFINED 原约束等价 FREE (fallthrough)', () => {
    const { graph, node, ports, holder } = buildPortNode(Direction.RIGHT, 'NORTH', [PortSide.UNDEFINED, PortSide.UNDEFINED, PortSide.UNDEFINED])
    node.setProperty(ORIGINAL_PORT_CONSTRAINTS, 'UNDEFINED')
    hideSelfLoopPorts(holder, ports)
    new SelfLoopPortRestorer().process(graph)
    expect(node.getPorts()).toHaveLength(3)
    for (const p of node.getPorts()) expect(p.getSide()).toBe(PortSide.NORTH)
  })

  it('非法原约束 → throw (ggn 更严防御; Java default 是 assert false 默认静默)', () => {
    const { graph, node, ports, holder } = buildPortNode(Direction.RIGHT, 'NORTH', [PortSide.EAST, PortSide.EAST, PortSide.WEST])
    node.setProperty(ORIGINAL_PORT_CONSTRAINTS, 'FIXED_ORDER')
    hideSelfLoopPorts(holder, ports)
    expect(() => new SelfLoopPortRestorer().process(graph)).toThrow('Unexpected port constraints')
  })

  it('跳过非 NORMAL / 无 holder 节点', () => {
    const graph = makeGraph()
    const layer = makeLayer(graph)
    const normal = makeNode(graph, layer)
    const [n1, n2] = makePorts(normal, 0, 2, 0, 0)
    makeEdge(n1, n2)
    installHolder(normal)
    const other = new LNode(graph)
    other.setType('LONG_EDGE' as never)
    other.setLayer(layer)
    new SelfLoopPortRestorer().process(graph)
    expect(graph.getLayers()[0]!.getNodes()).toContain(normal)
    expect(graph.getLayers()[0]!.getNodes()).toContain(other)
  })
})


// 未使用变量守卫 (TS 严格模式)
void Direction

describe('SelfLoopPortRestorer 无 holder 跳过 (Java 防御分支)', () => {
  it('NORMAL 节点无 holder: process 跳过, 不抛错、不改端口', () => {
    const graph = makeGraph({ direction: Direction.RIGHT, distribution: 'NORTH' })
    const layer = makeLayer(graph)
    const node = makeNode(graph, layer)
    // 节点含自环边但从未 install holder (等价于 importer 未挂 SELF_LOOP_HOLDER)
    const [p0, p1] = makePorts(node, 0, 2, 0, 0)
    p0.setSide(PortSide.EAST)
    p1.setSide(PortSide.WEST)
    makeEdge(p0, p1)
    // 未 install holder: 属性缺失 → getProperty 返回 undefined (MapPropertyHolder)
    expect(node.getProperty(SELF_LOOP_HOLDER)).toBeUndefined()
    // 不应抛错 (slHolder === null || undefined → continue)
    expect(() => new SelfLoopPortRestorer().process(graph)).not.toThrow()
    expect(node.getPorts()).toHaveLength(2)
    expect(node.getPorts()[0]!.getSide()).toBe(PortSide.EAST)
    expect(node.getPorts()[1]!.getSide()).toBe(PortSide.WEST)
  })

  it('NORMAL 节点无 holder 且端口含 UNDEFINED: 同样跳过 (不兜底赋侧)', () => {
    const graph = makeGraph({ direction: Direction.RIGHT, distribution: 'NORTH' })
    const layer = makeLayer(graph)
    const node = makeNode(graph, layer)
    const p0 = new LPort(); p0.setNode(node)
    const p1 = new LPort(); p1.setNode(node)
    makeEdge(p0, p1)
    expect(node.getPorts()[0]!.getSide()).toBe(PortSide.UNDEFINED)
    new SelfLoopPortRestorer().process(graph)
    // 未隐藏 + 无 holder → 侧保持 UNDEFINED 不动
    expect(node.getPorts()[0]!.getSide()).toBe(PortSide.UNDEFINED)
    expect(node.getPorts()[1]!.getSide()).toBe(PortSide.UNDEFINED)
  })
})

describe('SelfLoopPortRestorer 非 NORMAL 跳过 (ELK Java 移植)', () => {
  it('非 NORMAL 节点携带 holder: 跳过, 端口保持隐藏不恢复', () => {
    const { graph, node, ports, holder } = buildPortNode(Direction.RIGHT, 'NORTH', [PortSide.UNDEFINED, PortSide.UNDEFINED, PortSide.UNDEFINED])
    node.setProperty(ORIGINAL_PORT_CONSTRAINTS, 'FREE')
    hideSelfLoopPorts(holder, ports)
    node.setType('LONG_EDGE' as never)
    new SelfLoopPortRestorer().process(graph)
    // 跳过: 端口未被恢复, hidden 标记保持
    expect(node.getPorts()).toHaveLength(0)
    expect(holder.arePortsHiddenFlag()).toBe(true)
  })
})
