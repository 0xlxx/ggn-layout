/**
 * InteractiveCrossingMinimizer 移植单测 (ELK p3order.InteractiveCrossingMinimizer).
 * 验证: 层内节点按输入位置 (交互参考点) 排序; 无位置时保持模型顺序.
 */
import { describe, expect, it } from 'vitest'
import { LGraph, LNode, Layer as GLayer, LPort, LEdge, NodeType } from '../../src/index.js'
import { InteractiveCrossingMinimizer } from '../../src/p3order/interactive-crossing-minimizer.js'
import { addNodeToLayer } from './helpers/TestGraphCreator.js'

/** 把 nodes 全部放入 l0, 连成链边, 返回 layer0 顺序. */
function runOnLayer(ys: number[], refPoint?: 'CENTER' | 'TOP_LEFT'): number[] {
  const graph = new LGraph()
  const l0 = new GLayer(graph)
  graph.getLayers().push(l0)
  l0.id = 0
  const nodes: LNode[] = ys.map((y, i) => {
    const n = addNodeToLayer(graph, l0)
    n.size = { x: 10, y: 10 }
    n.position = { x: 0, y }
    return n
  })
  for (let i = 0; i < nodes.length; i++) {
    const p = new LPort(); p.setNode(nodes[i]!); p.size = { x: 0, y: 0 }
    if (i < nodes.length - 1) {
      const tp = new LPort(); tp.setNode(nodes[i + 1]!)
      const e = new LEdge(); e.setSource(p); e.setTarget(tp)
    }
  }
  if (refPoint) graph.setProperty('org.eclipse.elk.layered.interactiveReferencePoint', refPoint)
  new InteractiveCrossingMinimizer().process(graph)
  return l0.getNodes().map(n => nodes.indexOf(n))
}

describe('InteractiveCrossingMinimizer (ELK Java 移植)', () => {
  it('按输入 y 位置排序层内节点 (CENTER 参考点)', () => {
    // 插入序 [0(y=0), 1(y=100), 2(y=50)] → 期望按 y 排序 [0, 2, 1].
    expect(runOnLayer([0, 100, 50])).toEqual([0, 2, 1])
  })

  it('无输入位置 (全 0) 时保持模型顺序', () => {
    expect(runOnLayer([0, 0, 0])).toEqual([0, 1, 2])
  })

  it('TOP_LEFT 参考点用节点左上角 y 排序', () => {
    expect(runOnLayer([10, 30, 20], 'TOP_LEFT')).toEqual([0, 2, 1])
  })

  it('长边 dummy 记录 ORIGINAL_DUMMY_NODE_POSITION', () => {
    const graph = new LGraph()
    const l0 = new GLayer(graph)
    graph.getLayers().push(l0)
    const n = addNodeToLayer(graph, l0)
    n.size = { x: 10, y: 10 }
    n.setType('LONG_EDGE' as never)
    const edge = new LEdge()
    n.setProperty('org.eclipse.elk.layered.internal.origin', edge)
    new InteractiveCrossingMinimizer().process(graph)
    expect(typeof n.getProperty('org.eclipse.elk.layered.internal.originalDummyNodePosition')).toBe('number')
  })
})

// ============================================================================
// 以下为 M5 变异补测: 针对 InteractiveCrossingMinimizer.getPos 各分支的幸存变异体.
// 方法: LONG_EDGE dummy 用 ORIGINAL_DUMMY_NODE_POSITION 精确断言计算值;
//       普通节点构造"顺序翻转"输入杀死算术变异; 边界值杀条件变异.
// ============================================================================

import { PortSide } from '../../src/graph/enums.js'
import {
  ORIGIN, REVERSED, ORIGINAL_BENDPOINTS, ORIGINAL_DUMMY_NODE_POSITION,
  LONG_EDGE_SOURCE, LONG_EDGE_TARGET, IN_LAYER_SUCCESSOR_CONSTRAINTS,
} from '../../src/options/internal-properties.js'

/** 构造单层图: 返回 graph/layer 与节点列表. */
function makeSingleLayer(): { graph: LGraph; layer: GLayer; nodes: LNode[] } {
  const graph = new LGraph()
  const l0 = new GLayer(graph)
  graph.getLayers().push(l0)
  l0.id = 0
  return { graph, layer: l0, nodes: [] }
}

/** 创建 LONG_EDGE dummy 节点 (x=0 不贡献 horizPos; 设置 ORIGIN 边 + 原始弯点). */
function makeLongEdgeDummy(layer: GLayer, graph: LGraph, bendpoints: { x: number; y: number }[]): LNode {
  const n = addNodeToLayer(graph, layer)
  n.setType(NodeType.LONG_EDGE)
  n.position = { x: 0, y: 0 }
  n.size = { x: 0, y: 0 }
  const edge = new LEdge()
  edge.setProperty(ORIGINAL_BENDPOINTS, bendpoints)
  n.setProperty(ORIGIN, edge)
  return n
}

/** 在 node 上创建 side 端口并返回. */
function addPort(node: LNode, side: PortSide, anchorY = 0): LPort {
  const p = new LPort()
  p.setNode(node)
  p.setSide(side)
  if (side === PortSide.WEST) p.setAnchor({ x: 0, y: anchorY })
  if (side === PortSide.EAST) p.setAnchor({ x: node.size.x, y: anchorY })
  return p
}

describe('InteractiveCrossingMinimizer getPos 分支 (M5 变异补测)', () => {
  it('LONG_EDGE source 左侧: horizPos <= sourcePoint.x → 直接用源点 y', () => {
    // horizPos 仅由 x>0 节点贡献: normal 节点 x=100,size.x=20 → horizPos=110.
    const { graph, layer, nodes } = makeSingleLayer()
    const normal = addNodeToLayer(graph, layer)
    normal.position = { x: 100, y: 0 }
    normal.size = { x: 20, y: 10 }
    const dummy = makeLongEdgeDummy(layer, graph, [])
    const sourceNode = new LNode(graph)
    sourceNode.position = { x: 200, y: 40 }   // sourcePoint.x=200 > horizPos 110
    sourceNode.size = { x: 20, y: 10 }
    const sourcePort = addPort(sourceNode, PortSide.WEST)
    dummy.setProperty(LONG_EDGE_SOURCE, sourcePort)
    nodes.push(normal, dummy)
    new InteractiveCrossingMinimizer().process(graph)
    // getPos: 110 <= 200 → 返回 sourcePoint.y = 40
    expect(dummy.getProperty(ORIGINAL_DUMMY_NODE_POSITION)).toBe(40)
  })

  it('LONG_EDGE source 右侧 + 弯点插值: 沿折线线性插值', () => {
    const { graph, layer, nodes } = makeSingleLayer()
    const normal = addNodeToLayer(graph, layer)
    normal.position = { x: 100, y: 0 }
    normal.size = { x: 20, y: 10 }
    const dummy = makeLongEdgeDummy(layer, graph, [{ x: 200, y: 100 }])
    const sourceNode = new LNode(graph)
    sourceNode.position = { x: 100, y: 50 }   // sourcePoint.x=100 < horizPos 110 → unshift
    sourceNode.size = { x: 20, y: 10 }
    const sourcePort = addPort(sourceNode, PortSide.WEST)
    dummy.setProperty(LONG_EDGE_SOURCE, sourcePort)
    nodes.push(normal, dummy)
    new InteractiveCrossingMinimizer().process(graph)
    // bendpoints=[{100,50},{200,100}], horizPos=110: y = 50 + (110-100)/(200-100)*50 = 55
    expect(dummy.getProperty(ORIGINAL_DUMMY_NODE_POSITION)).toBeCloseTo(55, 9)
  })

  it('LONG_EDGE target 左侧: targetPoint.x <= horizPos → 直接用目标点 y', () => {
    const { graph, layer, nodes } = makeSingleLayer()
    const normal = addNodeToLayer(graph, layer)
    normal.position = { x: 100, y: 0 }
    normal.size = { x: 20, y: 10 }
    const dummy = makeLongEdgeDummy(layer, graph, [])
    const targetNode = new LNode(graph)
    targetNode.position = { x: 50, y: 70 }   // targetPoint.x=50 <= horizPos 110
    targetNode.size = { x: 20, y: 10 }
    const targetPort = addPort(targetNode, PortSide.EAST)
    dummy.setProperty(LONG_EDGE_TARGET, targetPort)
    nodes.push(normal, dummy)
    new InteractiveCrossingMinimizer().process(graph)
    // getPos: 50 <= 110 → 返回 targetPoint.y = 70
    expect(dummy.getProperty(ORIGINAL_DUMMY_NODE_POSITION)).toBe(70)
  })

  it('LONG_EDGE 无 source/target: 沿原始弯点插值 (多段折线)', () => {
    const { graph, layer, nodes } = makeSingleLayer()
    const normal = addNodeToLayer(graph, layer)
    normal.position = { x: 100, y: 0 }
    normal.size = { x: 20, y: 10 }
    // 多段折线, 验证 while 循环推进: [{50,25},{100,50},{200,100}]
    const dummy = makeLongEdgeDummy(layer, graph, [{ x: 50, y: 25 }, { x: 100, y: 50 }, { x: 200, y: 100 }])
    nodes.push(normal, dummy)
    new InteractiveCrossingMinimizer().process(graph)
    // horizPos=110: 段 [{100,50},{200,100}] 插值: 50 + (110-100)/100*50 = 55
    expect(dummy.getProperty(ORIGINAL_DUMMY_NODE_POSITION)).toBeCloseTo(55, 9)
  })

  it('LONG_EDGE REVERSED: 弯点逆序后再插值', () => {
    const { graph, layer, nodes } = makeSingleLayer()
    const normal = addNodeToLayer(graph, layer)
    normal.position = { x: 100, y: 0 }
    normal.size = { x: 20, y: 10 }
    const dummy = makeLongEdgeDummy(layer, graph, [{ x: 50, y: 0 }, { x: 100, y: 100 }, { x: 200, y: 100 }])
    ;(dummy.getProperty(ORIGIN) as LNode | null)?.setProperty(REVERSED, true)
    nodes.push(normal, dummy)
    new InteractiveCrossingMinimizer().process(graph)
    // 非反转 [{50,0},{100,100},{200,100}]@110 → 段 [{100,100},{200,100}] → 100
    // 反转 [{200,100},{100,100},{50,0}]@110 → 推进到段 [{100,100},{50,0}] → 100 + 10/-50*(-100) = 120
    expect(dummy.getProperty(ORIGINAL_DUMMY_NODE_POSITION)).toBeCloseTo(120, 9)
  })

  it('NORTH_SOUTH_PORT NORTH: 用源节点顶部 y (顺序可区分)', () => {
    const { graph, layer, nodes } = makeSingleLayer()
    const originNode = new LNode(graph)
    originNode.position = { x: 0, y: 30 }
    originNode.size = { x: 20, y: 10 }
    const originPort = addPort(originNode, PortSide.NORTH)
    // normal 节点 CENTER=35+5=40; NORTH dummy=30 → dummy 在前; 变异成 SOUTH=40 → 平局/翻转.
    const normal = addNodeToLayer(graph, layer)
    normal.position = { x: 0, y: 35 }
    normal.size = { x: 10, y: 10 }
    const dummy = addNodeToLayer(graph, layer)
    dummy.setType(NodeType.NORTH_SOUTH_PORT)
    dummy.position = { x: 0, y: 0 }
    const dp = new LPort(); dp.setNode(dummy)
    dp.setProperty(ORIGIN, originPort)
    nodes.push(normal, dummy)
    new InteractiveCrossingMinimizer().process(graph)
    // NORTH → 30 < normal CENTER 40 → dummy 在前
    expect(layer.getNodes().indexOf(dummy)).toBeLessThan(layer.getNodes().indexOf(normal))
  })

  it('NORTH_SOUTH_PORT SOUTH: 用源节点底部 y (顺序可区分)', () => {
    const { graph, layer, nodes } = makeSingleLayer()
    const originNode = new LNode(graph)
    originNode.position = { x: 0, y: 30 }
    originNode.size = { x: 20, y: 10 }
    const originPort = addPort(originNode, PortSide.SOUTH)
    // normal 节点 CENTER=45+5=50; SOUTH dummy=30+10=40 → dummy 在前.
    const normal = addNodeToLayer(graph, layer)
    normal.position = { x: 0, y: 45 }
    normal.size = { x: 10, y: 10 }
    const dummy = addNodeToLayer(graph, layer)
    dummy.setType(NodeType.NORTH_SOUTH_PORT)
    dummy.position = { x: 0, y: 0 }
    const dp = new LPort(); dp.setNode(dummy)
    dp.setProperty(ORIGIN, originPort)
    nodes.push(normal, dummy)
    new InteractiveCrossingMinimizer().process(graph)
    // SOUTH → 40 < normal CENTER 50 → dummy 在前
    expect(layer.getNodes().indexOf(dummy)).toBeLessThan(layer.getNodes().indexOf(normal))
  })

  it('successor 约束打破同 y 平局', () => {
    const { graph, layer, nodes } = makeSingleLayer()
    const a = addNodeToLayer(graph, layer)
    a.position = { x: 0, y: 20 }
    a.size = { x: 10, y: 10 }
    const b = addNodeToLayer(graph, layer)
    b.position = { x: 0, y: 20 }
    b.size = { x: 10, y: 10 }
    a.setProperty(IN_LAYER_SUCCESSOR_CONSTRAINTS, [b])  // a 必须在 b 之前 (successor = 排在后面的节点)
    nodes.push(a, b)
    new InteractiveCrossingMinimizer().process(graph)
    expect(layer.getNodes().indexOf(a)).toBeLessThan(layer.getNodes().indexOf(b))
  })

  it('CENTER 回退算术: size 不同导致 +size/2 与 -size/2 顺序翻转', () => {
    // n1: y=10.5,size=10 → 15.5; n2: y=10,size=12 → 16 → [n1,n2]
    // 变异 -size/2: 5.5 vs 4 → [n2,n1] → 翻转才能杀死算术变异.
    const { graph, layer, nodes } = makeSingleLayer()
    const n1 = addNodeToLayer(graph, layer)
    n1.position = { x: 0, y: 10.5 }
    n1.size = { x: 10, y: 10 }
    const n2 = addNodeToLayer(graph, layer)
    n2.position = { x: 0, y: 10 }
    n2.size = { x: 10, y: 12 }
    nodes.push(n1, n2)
    new InteractiveCrossingMinimizer().process(graph)
    expect(layer.getNodes().indexOf(n1)).toBeLessThan(layer.getNodes().indexOf(n2))
  })

  it('CENTER 回退算术: size 不同导致 +size/2 与 +size*2 顺序翻转', () => {
    // n1: y=90,size=40 → 110; n2: y=100,size=30 → 115 → [n1,n2]
    // 变异 +size*2: 170 vs 160 → [n2,n1] → 翻转杀死变异.
    const { graph, layer, nodes } = makeSingleLayer()
    const n1 = addNodeToLayer(graph, layer)
    n1.position = { x: 0, y: 90 }
    n1.size = { x: 10, y: 40 }
    const n2 = addNodeToLayer(graph, layer)
    n2.position = { x: 0, y: 100 }
    n2.size = { x: 10, y: 30 }
    nodes.push(n1, n2)
    new InteractiveCrossingMinimizer().process(graph)
    expect(layer.getNodes().indexOf(n1)).toBeLessThan(layer.getNodes().indexOf(n2))
  })

  it('horizPos: x=0 节点不参与平均 (x>0 过滤)', () => {
    // dummy 自身 x=0 → 不贡献; normal x=100,size.x=20 → horizPos=110.
    // 变异 >=0: dummy 贡献 0 → horizPos=(110+0)/2=55 → sourcePoint.x=80 分支翻转 (55<=80 直接返回).
    const { graph, layer, nodes } = makeSingleLayer()
    const normal = addNodeToLayer(graph, layer)
    normal.position = { x: 100, y: 0 }
    normal.size = { x: 20, y: 10 }
    const dummy = makeLongEdgeDummy(layer, graph, [{ x: 200, y: 100 }])
    const sourceNode = new LNode(graph)
    sourceNode.position = { x: 80, y: 40 }   // sourcePoint.x=80 < horizPos 110 → 插值
    sourceNode.size = { x: 20, y: 10 }
    const sourcePort = addPort(sourceNode, PortSide.WEST)
    dummy.setProperty(LONG_EDGE_SOURCE, sourcePort)
    nodes.push(normal, dummy)
    new InteractiveCrossingMinimizer().process(graph)
    // 正确 horizPos=110: 110>80 → 插值 [{80,40},{200,100}]: 40+(110-80)/120*60 = 55
    // 变异 horizPos=55: 55<=80 → 直接返回 40 → 断言 55 杀之
    expect(dummy.getProperty(ORIGINAL_DUMMY_NODE_POSITION)).toBeCloseTo(55, 9)
  })

  it('horizPos: 全层 x<=0 时不做平均 (nodeCount>0 守卫)', () => {
    // 全层节点 x=0 → nodeCount=0 → 跳过除法, horizPos=0.
    // 变异 >=0: 0/0=NaN → LONG_EDGE 插值 NaN → 断言 0<=80 直接返回 sourcePoint.y=40 杀之.
    const { graph, layer, nodes } = makeSingleLayer()
    const normal = addNodeToLayer(graph, layer)
    normal.position = { x: 0, y: 0 }
    normal.size = { x: 10, y: 10 }
    const dummy = makeLongEdgeDummy(layer, graph, [{ x: 200, y: 100 }])
    const sourceNode = new LNode(graph)
    sourceNode.position = { x: 80, y: 40 }
    sourceNode.size = { x: 20, y: 10 }
    const sourcePort = addPort(sourceNode, PortSide.WEST)
    dummy.setProperty(LONG_EDGE_SOURCE, sourcePort)
    nodes.push(normal, dummy)
    new InteractiveCrossingMinimizer().process(graph)
    // 正确 horizPos=0: 0<=80 → 返回 40
    expect(dummy.getProperty(ORIGINAL_DUMMY_NODE_POSITION)).toBe(40)
  })

  it('port.id 顺序分配 (++ 变异可区分)', () => {
    const { graph, layer, nodes } = makeSingleLayer()
    const n1 = addNodeToLayer(graph, layer)
    n1.size = { x: 10, y: 10 }
    const n2 = addNodeToLayer(graph, layer)
    n2.size = { x: 10, y: 10 }
    const p1 = addPort(n1, PortSide.WEST)
    const p2 = addPort(n1, PortSide.EAST)
    const p3 = addPort(n2, PortSide.WEST)
    nodes.push(n1, n2)
    new InteractiveCrossingMinimizer().process(graph)
    // process() 按层遍历节点端口, portCount 递增: p1=0, p2=1, p3=2
    expect([p1.id, p2.id, p3.id]).toEqual([0, 1, 2])
  })

  it('节点带水平位置 (x>0): horizPos 均分 + LONG_EDGE dummy 记录原始位置', async () => {
    const graph = new LGraph()
    const l0 = new GLayer(graph)
    graph.getLayers().push(l0)
    l0.id = 0
    const n1 = addNodeToLayer(graph, l0)
    n1.size = { x: 10, y: 10 }
    n1.position = { x: 40, y: 10 }
    const n2 = addNodeToLayer(graph, l0)
    n2.size = { x: 10, y: 10 }
    n2.position = { x: 80, y: 30 }
    graph.getLayers().push(new GLayer(graph))
    const { ORIGINAL_DUMMY_NODE_POSITION } = await import('../../src/options/internal-properties.js')
    n2.setType(NodeType.LONG_EDGE)
    new InteractiveCrossingMinimizer().process(graph)
    // 无 ORIGIN 边/弯点的 LONG_EDGE → 回退 CENTER: y + size.y/2 = 35
    expect(n2.getProperty(ORIGINAL_DUMMY_NODE_POSITION)).toBe(35)
  })

  it('空层与无位置节点: horizPos 保持 0 不崩溃', () => {
    const graph = new LGraph()
    const l0 = new GLayer(graph)
    graph.getLayers().push(l0)
    l0.id = 0
    const n = addNodeToLayer(graph, l0)
    n.size = { x: 10, y: 10 }
    // 无 position (x=0) → nodeCount=0 → horizPos 保持 0
    graph.getLayers().push(new GLayer(graph))
    new InteractiveCrossingMinimizer().process(graph)
    expect(graph.getLayers()[0]!.getNodes().length).toBe(1)
  })
})

// ============================================================================
// X1 续接: 同位置后继约束平局 (sort 比较器 includes 分支)
// ============================================================================

describe('InteractiveCrossingMinimizer 续接补测 (X1)', () => {
  it('同 y 位置: IN_LAYER_SUCCESSOR_CONSTRAINTS 决定排序 (后继在前)', () => {
    const graph = new LGraph()
    const l0 = new GLayer(graph)
    graph.getLayers().push(l0)
    l0.id = 0
    const n1 = addNodeToLayer(graph, l0)
    n1.size = { x: 10, y: 10 }
    n1.position = { x: 0, y: 20 }
    const n2 = addNodeToLayer(graph, l0)
    n2.size = { x: 10, y: 10 }
    n2.position = { x: 0, y: 20 }
    // n1 是 n2 的后继 → 排序时 n1 在前 (稳定平局打破)
    n1.setProperty(IN_LAYER_SUCCESSOR_CONSTRAINTS, [n2])
    graph.getLayers().push(new GLayer(graph))
    new InteractiveCrossingMinimizer().process(graph)
    const nodes = graph.getLayers()[0]!.getNodes()
    expect(nodes[0]).toBe(n1)
    expect(nodes[1]).toBe(n2)
  })
})
