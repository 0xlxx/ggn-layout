/**
 * HierarchicalPortOrthogonalEdgeRouter (ggn 移植) 单元测试.
 *
 * SSOT: ELK Java 0.12.0
 *   plugins/org.eclipse.elk.alg.layered/src/org/eclipse/elk/alg/layered/intermediate/
 *     HierarchicalPortOrthogonalEdgeRouter.java
 *
 * 覆盖 process() 的 Step1-6 与 routeEdges 的 offset/size 调整语义, 并在每条用例后附加
 * 算法性质不变量断言 (边守恒/无悬挂边、N/S 位置在内容区外、offset/size 一致性、坐标有限、
 * 端口侧修正、弯点对齐)。
 *
 * 当前实现状态 (2026-08-07):
 *   - Step1 restoreNorthSouthDummies / Step2 setNorthSouthDummyCoordinates /
 *     Step3 countRoutingSlots + offset/size 调整 / Step4 removeTemporaryNorthSouthDummies
 *     (重连 + 弯点迁移, ELK 精确语义) / Step5 fixExternalPortCoordinates /
 *     Step6 correctSlantedEdgeSegments 均已实现, process() 按 ELK Step1-6 顺序调用.
 *
 * 坐标系适配 (非语义差异): Step2 northY
 *   ggn = 0 - offset.y (pre-padding 坐标系, padding 由 resizeParentNode 单独计入);
 *   ELK = -padding.top - offset.y (content 坐标系, HierarchicalPortOrthogonalEdgeRouter.java:288).
 *   经各自 resize 后 dummy 均落在父节点顶边, 最终父尺寸与端口位置一致 (194 实证).
 *   测试断言 ggn 坐标系值 + 语义等价关系 (NORTH y < 0 内容区外, SOUTH y > size.y).
 */
import { describe, expect, it } from 'vitest'
import { LGraph, LNode, LPort, LEdge, PortSide, PortConstraints, NodeType } from '../../src/index.js'
import { Layer } from '../../src/graph/layer.js'
import {
  EXT_PORT_SIDE, EXT_PORT_SIZE, EXT_PORT_REPLACED_DUMMY, EXT_PORT_REPLACED_DUMMIES,
  PORT_RATIO_OR_POSITION, RANDOM, ORIGIN,
} from '../../src/options/internal-properties.js'
import {
  PORT_CONSTRAINTS, PORT_ANCHOR, SPACING_NODE_NODE, SPACING_EDGE_EDGE, SPACING_PORT_PORT,
} from '../../src/options/layered-options.js'
import { JavaRandom } from '../../src/util/java-random.js'
import {
  collectNorthSouthDummies, restoreNorthSouthDummies, connectNodeToDummy,
  setNorthSouthDummyCoordinates, calculateNorthSouthDummyPositions,
  countRoutingSlots, removeTemporaryNorthSouthDummies, fixExternalPortCoordinates,
  correctSlantedEdgeSegments,
  processHierarchicalPortOrthogonalRouting,
} from '../../src/intermediate/hierarchical-port-orthogonal-edge-router.js'

// ── 构造 helper ──

function makeLayer(g: LGraph): Layer {
  const l = new Layer(g)
  g.getLayers().push(l)
  return l
}

/** 外部端口 dummy (EXTERNAL_PORT + EXT_PORT_SIDE + 一个端口, 端口初始侧 = 外部侧). */
function makeExtPort(g: LGraph, side: PortSide): LNode {
  const n = new LNode(g)
  n.setType(NodeType.EXTERNAL_PORT)
  n.setProperty(EXT_PORT_SIDE, side)
  const p = new LPort()
  p.setNode(n)
  p.setSide(side)
  return n
}

/** HPC 创建的临时替换 dummy (WEST 入端口 + EAST 出端口 + EXT_PORT_REPLACED_DUMMY). */
function makeTempDummy(g: LGraph, layer: Layer, side: PortSide, original: LNode): LNode {
  const n = new LNode(g)
  n.setType(NodeType.EXTERNAL_PORT)
  n.setProperty(EXT_PORT_SIDE, side)
  n.setProperty(EXT_PORT_REPLACED_DUMMY, original)
  const inP = new LPort()
  inP.setNode(n)
  inP.setSide(PortSide.WEST)
  const outP = new LPort()
  outP.setNode(n)
  outP.setSide(PortSide.EAST)
  n.setLayer(layer)
  return n
}

function makeNormalNode(g: LGraph, layer: Layer): LNode {
  const n = new LNode(g)
  n.setType(NodeType.NORMAL)
  n.size = { x: 40, y: 20 }
  n.setLayer(layer)
  return n
}

function addPortOnSide(node: LNode, side: PortSide): LPort {
  const p = new LPort()
  p.setNode(node)
  p.setSide(side)
  return p
}

function edgeBetween(source: LPort, target: LPort): LEdge {
  const e = new LEdge()
  e.setSource(source)
  e.setTarget(target)
  return e
}

/** 不变量 #4: 坐标有限 (无 NaN/Infinity). */
function expectFinitePositions(nodes: LNode[]): void {
  for (const n of nodes) {
    expect(Number.isFinite(n.getPosition().x)).toBe(true)
    expect(Number.isFinite(n.getPosition().y)).toBe(true)
  }
}

/** 不变量 #1: 图中所有可达边 source/target 均非 null (无悬挂边). */
function expectNoDanglingEdges(g: LGraph): void {
  const seen = new Set<LEdge>()
  for (const node of g.getAllNodes()) {
    for (const port of node.getPorts()) {
      for (const e of port.getConnectedEdges()) {
        if (seen.has(e)) continue
        seen.add(e)
        expect(e.getSource()).not.toBeNull()
        expect(e.getTarget()).not.toBeNull()
      }
    }
  }
}

describe('HierarchicalPortOrthogonalEdgeRouter (ELK Java 0.12.0 移植)', () => {
  // ─────────────────────────────────────────────────────────────
  // Step1: restoreNorthSouthDummies
  // ─────────────────────────────────────────────────────────────
  describe('Step1 restoreNorthSouthDummies', () => {
    it('恢复被 HPC 移除的原始 N/S dummy: 端口侧翻转 + 临时 dummy 与原 dummy 建边 + 归入末层', () => {
      const g = new LGraph()
      const l0 = makeLayer(g)
      const l1 = makeLayer(g)
      const origNorth = makeExtPort(g, PortSide.NORTH)
      const origSouth = makeExtPort(g, PortSide.SOUTH)
      const tempNorth = makeTempDummy(g, l0, PortSide.NORTH, origNorth)
      const tempSouth = makeTempDummy(g, l1, PortSide.SOUTH, origSouth)
      g.setProperty(EXT_PORT_REPLACED_DUMMIES, [origNorth, origSouth])

      const restored = restoreNorthSouthDummies(g)

      // 返回值顺序 = EXT_PORT_REPLACED_DUMMIES 顺序
      expect(restored).toHaveLength(2)
      expect(restored[0]).toBe(origNorth)
      expect(restored[1]).toBe(origSouth)

      // 不变量 #5 (端口侧修正): NORTH 原始 dummy 端口侧 → SOUTH, SOUTH → NORTH,
      // 保证后续路由方向正确 (ELK restoreDummy).
      expect(origNorth.getPorts()[0]!.getSide()).toBe(PortSide.SOUTH)
      expect(origSouth.getPorts()[0]!.getSide()).toBe(PortSide.NORTH)

      // 临时 dummy 与原始 dummy 之间建了边 (ELK connectNodeToDummy):
      // 新端口侧 = 临时 dummy 的 EXT_PORT_SIDE, 边源 = 临时 dummy 新端口, 目标 = 原 dummy 端口.
      const northEdge = origNorth.getPorts()[0]!.getIncomingEdges()[0]!
      expect(northEdge.getSource()).not.toBeNull()
      expect(northEdge.getSource()!.getNode()).toBe(tempNorth)
      expect(northEdge.getSource()!.getSide()).toBe(PortSide.NORTH)
      const southEdge = origSouth.getPorts()[0]!.getIncomingEdges()[0]!
      expect(southEdge.getSource()).not.toBeNull()
      expect(southEdge.getSource()!.getNode()).toBe(tempSouth)
      expect(southEdge.getSource()!.getSide()).toBe(PortSide.SOUTH)

      // 原始 dummy 被归入最后一层 (ELK: 层归属无所谓, 取最后一层).
      const lastLayer = g.getLayers()[g.getLayers().length - 1]!
      expect(origNorth.getLayer()).toBe(lastLayer)
      expect(origSouth.getLayer()).toBe(lastLayer)

      // 不变量 #1 + #4: 无悬挂边 + 坐标有限
      expectNoDanglingEdges(g)
      expectFinitePositions([origNorth, origSouth, tempNorth, tempSouth])
    })

    it('无 EXT_PORT_REPLACED_DUMMIES 时返回空列表且不改动图', () => {
      const g = new LGraph()
      makeLayer(g)
      const restored = restoreNorthSouthDummies(g)
      expect(restored).toHaveLength(0)
      expect(g.getLayers()[0]!.getNodes()).toHaveLength(0)
    })
  })

  // ─────────────────────────────────────────────────────────────
  // Step2: setNorthSouthDummyCoordinates / calculateNorthSouthDummyPositions
  // ─────────────────────────────────────────────────────────────
  describe('Step2 setNorthSouthDummyCoordinates', () => {
    it('FIXED_SIDE: x = 连接端口平均 - anchor.x, y 用 offset (northY 当前不含 padding)', () => {
      const g = new LGraph()
      g.getSize().x = 100
      g.getSize().y = 50
      g.getOffset().y = 10
      g.setProperty(PORT_CONSTRAINTS, PortConstraints.FIXED_SIDE)
      const l0 = makeLayer(g)
      const l1 = makeLayer(g)
      const origNorth = makeExtPort(g, PortSide.NORTH)
      const origSouth = makeExtPort(g, PortSide.SOUTH)
      origNorth.setProperty(PORT_ANCHOR, { x: 5, y: 0 })
      origSouth.setProperty(PORT_ANCHOR, { x: 3, y: 0 })
      const tempNorth = makeTempDummy(g, l0, PortSide.NORTH, origNorth)
      const tempSouth = makeTempDummy(g, l1, PortSide.SOUTH, origSouth)
      tempNorth.getPosition().x = 10
      tempSouth.getPosition().x = 30
      g.setProperty(EXT_PORT_REPLACED_DUMMIES, [origNorth, origSouth])
      const restored = restoreNorthSouthDummies(g)

      setNorthSouthDummyCoordinates(g, restored)

      // x: 连接端口绝对 x 平均 - anchor.x (temp 新端口 position/anchor 均为 0)
      expect(origNorth.getPosition().x).toBeCloseTo(10 - 5, 6)
      expect(origSouth.getPosition().x).toBeCloseTo(30 - 3, 6)

      // y (FIXED_SIDE):
      //   southY = size.y + padding.top + padding.bottom - offset.y
      //          = 50 + 12 + 12 - 10 = 64 (ggn 与 ELK 一致)
      expect(origSouth.getPosition().y).toBeCloseTo(50 + 12 + 12 - 10, 6)
      // 坐标系适配 (非语义差异): ggn pre-padding 坐标
      // northY = -offset.y = -10; ELK content 坐标 = -padding.top - offset.y = -22.
      // 二者经各自 resize (ggn pad-min / ELK getActualSize+offset) 后 dummy 均落在父节点顶边,
      // 最终父尺寸与端口位置一致 (194 实证). 断言 ggn 坐标系值 + 语义等价关系:
      //   northY_ggn = -offset.y 且 ggn 的父尺寸含该 dummy 边界 (resize 单独加 padding).
      expect(origNorth.getPosition().y).toBeCloseTo(0 - 10, 6)

      // 不变量 #2: NORTH y < 0 (内容区上方), SOUTH y > size.y (内容区下方)
      expect(origNorth.getPosition().y).toBeLessThan(0)
      expect(origSouth.getPosition().y).toBeGreaterThan(g.getSize().y)

      // 不变量 #2: FIXED_SIDE 下 x 在 [0, graphWidth] 内 (graphWidth = size.x + padding)
      const graphWidth = g.getSize().x + g.getPadding().left + g.getPadding().right
      for (const d of [origNorth, origSouth]) {
        expect(d.getPosition().x).toBeGreaterThanOrEqual(0)
        expect(d.getPosition().x).toBeLessThanOrEqual(graphWidth)
      }

      // 不变量 #4: 坐标有限
      expectFinitePositions([origNorth, origSouth, tempNorth, tempSouth])
    })

    it('calculateNorthSouthDummyPositions: 无连接端口时 x = 0', () => {
      const g = new LGraph()
      const dummy = makeExtPort(g, PortSide.NORTH)
      calculateNorthSouthDummyPositions(dummy)
      expect(dummy.getPosition().x).toBe(0)
      expectFinitePositions([dummy])
    })

    it('calculateNorthSouthDummyPositions: 多连接端口取平均再减 anchor.x', () => {
      const g = new LGraph()
      const l0 = makeLayer(g)
      const a = makeNormalNode(g, l0)
      const b = makeNormalNode(g, l0)
      a.getPosition().x = 10
      b.getPosition().x = 30
      const dummy = makeExtPort(g, PortSide.NORTH)
      dummy.setProperty(PORT_ANCHOR, { x: 4, y: 0 })
      const pa = addPortOnSide(a, PortSide.EAST)
      const pb = addPortOnSide(b, PortSide.EAST)
      const pd = dummy.getPorts()[0]!
      edgeBetween(pa, pd)
      edgeBetween(pb, pd)

      calculateNorthSouthDummyPositions(dummy)
      // posSum = 10 + 30 = 40, degree = 2 → 20 - anchor.x(4) = 16
      expect(dummy.getPosition().x).toBeCloseTo(16, 6)
      expectFinitePositions([dummy, a, b])
    })
  })

  // ─────────────────────────────────────────────────────────────
  // Step3: countRoutingSlots
  // ─────────────────────────────────────────────────────────────
  describe('Step3 countRoutingSlots', () => {
    it('直线边 (temp 端口绝对 x == 原始 dummy 端口绝对 x) → north/south slots = 0', () => {
      const g = new LGraph()
      g.setProperty(RANDOM, new JavaRandom(0))
      g.setProperty(PORT_CONSTRAINTS, PortConstraints.FIXED_SIDE)
      const l0 = makeLayer(g)
      const l1 = makeLayer(g)
      const origNorth = makeExtPort(g, PortSide.NORTH)
      const origSouth = makeExtPort(g, PortSide.SOUTH)
      const tempNorth = makeTempDummy(g, l0, PortSide.NORTH, origNorth)
      const tempSouth = makeTempDummy(g, l1, PortSide.SOUTH, origSouth)
      tempNorth.getPosition().x = 10
      origNorth.getPosition().x = 10
      tempSouth.getPosition().x = 30
      origSouth.getPosition().x = 30
      g.setProperty(EXT_PORT_REPLACED_DUMMIES, [origNorth, origSouth])
      const restored = restoreNorthSouthDummies(g)

      const slots = countRoutingSlots(g, restored)
      expect(slots.northSlots).toBe(0)
      expect(slots.southSlots).toBe(0)

      // 不变量 #4: 计数过程不产生非有限坐标
      expectFinitePositions([origNorth, origSouth, tempNorth, tempSouth])
    })

    it('非直线边 (两端 x 不同) → north/south slots = 1', () => {
      const g = new LGraph()
      g.setProperty(RANDOM, new JavaRandom(0))
      g.setProperty(PORT_CONSTRAINTS, PortConstraints.FIXED_SIDE)
      const l0 = makeLayer(g)
      const l1 = makeLayer(g)
      const origNorth = makeExtPort(g, PortSide.NORTH)
      const origSouth = makeExtPort(g, PortSide.SOUTH)
      const tempNorth = makeTempDummy(g, l0, PortSide.NORTH, origNorth)
      const tempSouth = makeTempDummy(g, l1, PortSide.SOUTH, origSouth)
      tempNorth.getPosition().x = 10
      origNorth.getPosition().x = 50
      tempSouth.getPosition().x = 30
      origSouth.getPosition().x = 70
      g.setProperty(EXT_PORT_REPLACED_DUMMIES, [origNorth, origSouth])
      const restored = restoreNorthSouthDummies(g)

      const slots = countRoutingSlots(g, restored)
      expect(slots.northSlots).toBe(1)
      expect(slots.southSlots).toBe(1)

      // 不变量 #4: 计数过程不产生非有限坐标
      expectFinitePositions([origNorth, origSouth, tempNorth, tempSouth])
    })
  })

  // ─────────────────────────────────────────────────────────────
  // Step4: removeTemporaryNorthSouthDummies (ELK 语义)
  // ─────────────────────────────────────────────────────────────
  describe('Step4 removeTemporaryNorthSouthDummies', () => {
    it('ELK: 临时 dummy 入/出边重连到原始 dummy (replacedDummyPort) + 弯点迁移, 无悬挂边', () => {
      const g = new LGraph()
      const l0 = makeLayer(g)
      const origNorth = makeExtPort(g, PortSide.NORTH)
      const tempNorth = makeTempDummy(g, l0, PortSide.NORTH, origNorth)
      tempNorth.getPosition().x = 5
      tempNorth.getPosition().y = 7
      // 入边: 普通节点 A → 临时 dummy WEST 端口 (HPC 重定向后的形态)
      const a = makeNormalNode(g, l0)
      const aPort = addPortOnSide(a, PortSide.EAST)
      const tempInPort = tempNorth.getPorts().find(p => p.getSide() === PortSide.WEST)!
      const aToTemp = edgeBetween(aPort, tempInPort)
      // 出边: 临时 dummy EAST 端口 → 普通节点 C (HPC 重定向后的形态)
      const c = makeNormalNode(g, l0)
      const tempOutPort = tempNorth.getPorts().find(p => p.getSide() === PortSide.EAST)!
      const tempToC = edgeBetween(tempOutPort, addPortOnSide(c, PortSide.WEST))
      // Step1 建的 origin 边: 临时 dummy 新端口 (NORTH) → 原始 dummy 端口
      connectNodeToDummy(tempNorth, origNorth)
      const tempToOrig = origNorth.getPorts()[0]!.getIncomingEdges()[0]!

      removeTemporaryNorthSouthDummies(g)

      // 临时 dummy 已从所有 layer 移除 (ELK node.setLayer(null)).
      expect(tempNorth.getLayer()).toBeNull()

      // 临时 dummy 与原始 dummy 之间的 origin 边被断开 (ELK nodeToOriginEdge source/target = null).
      expect(tempToOrig.getSource()).toBeNull()
      expect(tempToOrig.getTarget()).toBeNull()

      // 不变量 #1 (边守恒): 原入边重连到 replacedDummyPort, source/target 均非 null.
      const replacedDummyPort = origNorth.getPorts()[0]!
      expect(aToTemp.getTarget()).toBe(replacedDummyPort)
      expect(aToTemp.getSource()).toBe(aPort)
      // 原出边重连: source ← replacedDummyPort, target 仍指向 C.
      expect(tempToC.getSource()).toBe(replacedDummyPort)
      expect(tempToC.getTarget()).not.toBeNull()

      // 弯点迁移 (ELK removeTemporaryNorthSouthDummies):
      //   incomingEdgeBendPoints = origin 边弯点 + 开头插 (originPort.pos + node.pos)
      //   outgoingEdgeBendPoints = 反转 origin 弯点 + 末尾 (originPort.pos + node.pos)
      // origin 边无弯点时, 两者都只有 firstBendPoint = (nodeOriginPort.pos + node.pos).
      // nodeOriginPort 为 connectNodeToDummy 新建端口 (position 0,0), node 位置 (5,7).
      const firstBendPoint = { x: 5, y: 7 }
      expect(aToTemp.getBendPoints()).toEqual([firstBendPoint])
      expect(tempToC.getBendPoints()).toEqual([firstBendPoint])

      // 不变量 #1: 临时 dummy 各端口不再挂边; 图中无可达悬挂边
      const tempEdges = tempNorth.getPorts().flatMap(p => [...p.getIncomingEdges(), ...p.getOutgoingEdges()])
      expect(tempEdges).toHaveLength(0)
      expectNoDanglingEdges(g)
    })
  })

  // ─────────────────────────────────────────────────────────────
  // Step5: fixExternalPortCoordinates
  // ─────────────────────────────────────────────────────────────
  describe('Step5 fixExternalPortCoordinates', () => {
    it('E/W dummy x 修正 + 首/末层 N/S dummy y 重设 (ELK fixCoordinates)', () => {
      const g = new LGraph()
      g.getSize().x = 100
      g.getSize().y = 100
      g.getOffset().x = 5
      g.getOffset().y = 7
      const l0 = makeLayer(g)
      const l1 = makeLayer(g)
      const west = makeExtPort(g, PortSide.WEST)
      west.setLayer(l0)
      const east = makeExtPort(g, PortSide.EAST)
      east.setLayer(l1)
      const origNorth = makeExtPort(g, PortSide.NORTH)
      origNorth.setLayer(l0)
      const origSouth = makeExtPort(g, PortSide.SOUTH)
      origSouth.setLayer(l1)
      const westY = west.getPosition().y
      const eastY = east.getPosition().y

      fixExternalPortCoordinates(g)

      // E/W x (ELK fixCoordinates 迭代 1):
      //   WEST = -offset.x - padding.left = -5 - 12 = -17
      //   EAST = size.x + padding.right - offset.x = 100 + 12 - 5 = 107
      expect(west.getPosition().x).toBeCloseTo(-5 - 12, 6)
      expect(east.getPosition().x).toBeCloseTo(100 + 12 - 5, 6)

      // N/S y (ELK fixCoordinates 迭代 2, ggn 坐标系):
      //   NORTH = -offset.y = -7; SOUTH = size.y + pad.top + pad.bottom - offset.y = 100+12+12-7 = 117
      expect(origNorth.getPosition().y).toBeCloseTo(-7, 6)
      expect(origSouth.getPosition().y).toBeCloseTo(100 + 12 + 12 - 7, 6)

      // 不变量: E/W dummy 只改 x, 不碰 y
      expect(west.getPosition().y).toBe(westY)
      expect(east.getPosition().y).toBe(eastY)
      // 不变量 #4: 坐标有限
      expectFinitePositions([west, east, origNorth, origSouth])
    })
  })

  // ─────────────────────────────────────────────────────────────
  // Step6: correctSlantedEdgeSegments
  // ─────────────────────────────────────────────────────────────
  describe('Step6 correctSlantedEdgeSegments', () => {
    it('ELK: E/W dummy 出入边首/末弯点 y 修正为端口 absoluteAnchor.y', () => {
      const g = new LGraph()
      g.getSize().x = 100
      const l0 = makeLayer(g)
      const l1 = makeLayer(g)
      const west = makeExtPort(g, PortSide.WEST)
      west.setLayer(l0)
      const b = makeNormalNode(g, l1)
      // 源端: west dummy 出边, 首弯点 y 与源端口 absoluteAnchor.y 不一致 (倾斜段)
      const outEdge = edgeBetween(west.getPorts()[0]!, addPortOnSide(b, PortSide.EAST))
      outEdge.getBendPoints().push({ x: -5, y: 99 }, { x: 30, y: 99 })
      // 目标端: 另一条边进入 west dummy, 末弯点 y 与目标端口 absoluteAnchor.y 不一致
      const inEdge = edgeBetween(addPortOnSide(b, PortSide.WEST), west.getPorts()[0]!)
      inEdge.getBendPoints().push({ x: 10, y: 98 }, { x: 20, y: 98 })

      // 修正前: 首/末弯点与锚点不一致 (模拟 fixCoordinates 引入的斜线段)
      const anchorY = west.getPorts()[0]!.getAbsoluteAnchor().y
      expect(outEdge.getBendPoints()[0]!.y).not.toBeCloseTo(anchorY, 6)

      correctSlantedEdgeSegments(g)

      // 不变量 #6 (弯点对齐): 出边首弯点 y = 源端口 absoluteAnchor.y,
      //                      入边末弯点 y = 目标端口 absoluteAnchor.y
      expect(outEdge.getBendPoints()[0]!.y).toBeCloseTo(anchorY, 6)
      expect(inEdge.getBendPoints()[inEdge.getBendPoints().length - 1]!.y).toBeCloseTo(anchorY, 6)
      // 不变量 #4: 坐标有限
      expectFinitePositions([west, b])
    })

    it('多条边/多弯点/源与目标侧均有斜段: 只修正首末弯点 y, 中间弯点不动', () => {
      const g = new LGraph()
      g.getSize().x = 100
      const l0 = makeLayer(g)
      const l1 = makeLayer(g)
      const west = makeExtPort(g, PortSide.WEST)
      west.setLayer(l0)
      const east = makeExtPort(g, PortSide.EAST)
      east.setLayer(l1)
      const b = makeNormalNode(g, l1)
      // 源侧: west dummy 出两条边, 各有 3 个弯点 (首弯点 y 与锚点不一致, 中间弯点保持)
      const out1 = edgeBetween(west.getPorts()[0]!, addPortOnSide(b, PortSide.EAST))
      out1.getBendPoints().push({ x: -5, y: 11 }, { x: 20, y: 55 }, { x: 40, y: 55 })
      const out2 = edgeBetween(west.getPorts()[0]!, addPortOnSide(b, PortSide.EAST))
      out2.getBendPoints().push({ x: -5, y: 22 }, { x: 25, y: 66 }, { x: 45, y: 66 })
      // 目标侧: east dummy 入边, 末弯点 y 与锚点不一致
      const inEdge = edgeBetween(addPortOnSide(b, PortSide.WEST), east.getPorts()[0]!)
      inEdge.getBendPoints().push({ x: 60, y: 33 }, { x: 90, y: 44 })

      const westAnchorY = west.getPorts()[0]!.getAbsoluteAnchor().y
      const eastAnchorY = east.getPorts()[0]!.getAbsoluteAnchor().y

      correctSlantedEdgeSegments(g)

      // 出边首弯点 = 源端口 absoluteAnchor.y; 中间弯点不被触碰
      for (const e of [out1, out2]) {
        expect(e.getBendPoints()[0]!.y).toBeCloseTo(westAnchorY, 6)
        expect(e.getBendPoints()[1]!.y).not.toBeCloseTo(westAnchorY, 6)
      }
      // 入边末弯点 = 目标端口 absoluteAnchor.y
      expect(inEdge.getBendPoints()[inEdge.getBendPoints().length - 1]!.y).toBeCloseTo(eastAnchorY, 6)
      expect(inEdge.getBendPoints()[0]!.y).not.toBeCloseTo(eastAnchorY, 6)
      // 不变量: 边数守恒 (不增删边)
      expect(out1.getBendPoints()).toHaveLength(3)
      expect(out2.getBendPoints()).toHaveLength(3)
      expect(inEdge.getBendPoints()).toHaveLength(2)
      expectFinitePositions([west, east, b])
    })
  })

  // ─────────────────────────────────────────────────────────────
  // process: Step3 routeEdges 的 offset/size 调整语义
  // ─────────────────────────────────────────────────────────────
  describe('processHierarchicalPortOrthogonalRouting offset/size 语义', () => {
    function makeNSGraph(north: boolean, south: boolean, straight: boolean): LGraph {
      const g = new LGraph()
      g.setProperty(RANDOM, new JavaRandom(0))
      g.setProperty(PORT_CONSTRAINTS, PortConstraints.FIXED_SIDE)
      g.getSize().x = 100
      g.getSize().y = 50
      const l0 = makeLayer(g)
      const l1 = makeLayer(g)
      const replaced: LNode[] = []
      if (north) {
        const origNorth = makeExtPort(g, PortSide.NORTH)
        origNorth.setProperty(PORT_ANCHOR, straight ? { x: 0, y: 0 } : { x: 20, y: 0 })
        const tempNorth = makeTempDummy(g, l0, PortSide.NORTH, origNorth)
        tempNorth.getPosition().x = 10
        // straight: anchor=0 → 原始 dummy x = 10 → 与 temp 端口 x 相同 → 0 槽;
        // 非直线: anchor=20 → 原始 dummy x = -10 → 两端 x 不同 → 1 槽
        replaced.push(origNorth)
      }
      if (south) {
        const origSouth = makeExtPort(g, PortSide.SOUTH)
        origSouth.setProperty(PORT_ANCHOR, straight ? { x: 0, y: 0 } : { x: 20, y: 0 })
        const tempSouth = makeTempDummy(g, l1, PortSide.SOUTH, origSouth)
        tempSouth.getPosition().x = 10
        replaced.push(origSouth)
      }
      g.setProperty(EXT_PORT_REPLACED_DUMMIES, replaced)
      return g
    }

    it('north slots>0: offset.y 与 size.y 同增 h = nodeSpacing + (slots-1)*edgeSpacing', () => {
      const g = makeNSGraph(true, false, false)
      const offY0 = g.getOffset().y
      const sizeY0 = g.getSize().y
      const nodeSpacing = g.getProperty(SPACING_NODE_NODE)
      const edgeSpacing = g.getProperty(SPACING_EDGE_EDGE)
      const expectedSlots = 1 // 非直线: temp 端口 x=10, 原始 dummy x=-10
      const h = nodeSpacing + (expectedSlots - 1) * edgeSpacing

      processHierarchicalPortOrthogonalRouting(g)

      // 不变量 #3: offset.y 与 size.y 同增 h (ELK routeEdges north 分支)
      expect(g.getOffset().y).toBeCloseTo(offY0 + h, 6)
      expect(g.getSize().y).toBeCloseTo(sizeY0 + h, 6)
      expect(Number.isFinite(g.getOffset().y)).toBe(true)
      expect(Number.isFinite(g.getSize().y)).toBe(true)
    })

    it('south slots>0: 仅 size.y 增 h, offset.y 不变', () => {
      const g = makeNSGraph(false, true, false)
      const offY0 = g.getOffset().y
      const sizeY0 = g.getSize().y
      const nodeSpacing = g.getProperty(SPACING_NODE_NODE)
      const edgeSpacing = g.getProperty(SPACING_EDGE_EDGE)
      const h = nodeSpacing + (1 - 1) * edgeSpacing // slots=1

      processHierarchicalPortOrthogonalRouting(g)

      expect(g.getOffset().y).toBe(offY0)
      expect(g.getSize().y).toBeCloseTo(sizeY0 + h, 6)
    })

    it('north+south 同时非直线: offset.y += hN, size.y += hN + hS', () => {
      const g = makeNSGraph(true, true, false)
      const sizeY0 = g.getSize().y
      const nodeSpacing = g.getProperty(SPACING_NODE_NODE)
      const edgeSpacing = g.getProperty(SPACING_EDGE_EDGE)
      const h = nodeSpacing + (1 - 1) * edgeSpacing

      processHierarchicalPortOrthogonalRouting(g)

      expect(g.getOffset().y).toBeCloseTo(h, 6)
      expect(g.getSize().y).toBeCloseTo(sizeY0 + h + h, 6)
    })

    it('slots=0 (直线): offset/size 不变', () => {
      const g = makeNSGraph(true, true, true)
      const offY0 = g.getOffset().y
      const sizeY0 = g.getSize().y

      processHierarchicalPortOrthogonalRouting(g)

      expect(g.getOffset().y).toBe(offY0)
      expect(g.getSize().y).toBe(sizeY0)
    })

    it('不变量: process 后所有节点坐标有限, 临时 dummy 移出所有 layer, offset/size 非负有限, 无悬挂边', () => {
      const g = makeNSGraph(true, true, false)
      // 额外加一条内部节点 → 临时 dummy 的入边, 验证 Step4 重连后无悬挂边
      const l0 = g.getLayers()[0]!
      const a = makeNormalNode(g, l0)
      const tempNorth = g.getAllNodes().find(n =>
        n.getType() === NodeType.EXTERNAL_PORT
        && n.getProperty(EXT_PORT_SIDE) === PortSide.NORTH
        && n.hasProperty(EXT_PORT_REPLACED_DUMMY))!
      const tempInPort = tempNorth.getPorts().find(p => p.getSide() === PortSide.WEST)!
      const aToTemp = edgeBetween(addPortOnSide(a, PortSide.EAST), tempInPort)
      const tempSouth = g.getAllNodes().find(n =>
        n.getType() === NodeType.EXTERNAL_PORT
        && n.getProperty(EXT_PORT_SIDE) === PortSide.SOUTH
        && n.hasProperty(EXT_PORT_REPLACED_DUMMY))!

      processHierarchicalPortOrthogonalRouting(g)

      // 不变量 #4: 所有节点坐标有限
      expectFinitePositions(g.getAllNodes())
      // 不变量 #1: 临时 dummy 不在任何 layer (getLayer() === null); 重连后无悬挂边
      expect(tempNorth.getLayer()).toBeNull()
      expect(tempSouth.getLayer()).toBeNull()
      expect(aToTemp.getTarget()).not.toBeNull()
      expectNoDanglingEdges(g)
      // 不变量 #3: offset/size 非负且有限
      expect(Number.isFinite(g.getOffset().y)).toBe(true)
      expect(Number.isFinite(g.getSize().y)).toBe(true)
      expect(g.getOffset().y).toBeGreaterThanOrEqual(0)
      expect(g.getSize().y).toBeGreaterThanOrEqual(0)
    })
  })

  // ─────────────────────────────────────────────────────────────
  // 覆盖补齐: collectNorthSouthDummies / 早退 / FIXED_RATIO / FIXED_POS / FIXED_ORDER / FREE / 边界
  // ─────────────────────────────────────────────────────────────
  describe('collectNorthSouthDummies / 早退 / 约束分支补齐', () => {
    it('collectNorthSouthDummies: 收集所有层的 N/S 外部端口 dummy (E/W 与普通节点跳过)', () => {
      const g = new LGraph()
      const l0 = makeLayer(g)
      const l1 = makeLayer(g)
      const north = makeExtPort(g, PortSide.NORTH)
      north.setLayer(l0)
      const south = makeExtPort(g, PortSide.SOUTH)
      south.setLayer(l1)
      const east = makeExtPort(g, PortSide.EAST)
      east.setLayer(l1)
      const normal = makeNormalNode(g, l0)

      const ns = [...new Set(collectNorthSouthDummies(g))]

      // 注意: ggn 的 layerlessNodes 与 layer 节点列表重叠, 故按唯一节点去重
      expect(ns).toEqual([north, south])
      expect(ns).not.toContain(east)
      expect(ns).not.toContain(normal)
    })

    it('process 早退: 无 EXT_PORT_REPLACED_DUMMIES 时不改动图', () => {
      const g = new LGraph()
      makeLayer(g)
      const size0 = g.getSize().y
      processHierarchicalPortOrthogonalRouting(g)
      expect(g.getSize().y).toBe(size0)
      expect(g.getLayers()[0]!.getNodes()).toHaveLength(0)
    })

    it('Step2 FIXED_RATIO: x = graphWidth * ratio - anchor.x; anchor 缺省时 offset=0', () => {
      const g = new LGraph()
      g.setProperty(PORT_CONSTRAINTS, PortConstraints.FIXED_RATIO)
      g.getSize().x = 100
      g.getSize().y = 50
      g.getOffset().y = 10
      const north = makeExtPort(g, PortSide.NORTH)
      north.setProperty(PORT_RATIO_OR_POSITION, 0.5)
      north.setProperty(PORT_ANCHOR, { x: 10, y: 0 })
      const south = makeExtPort(g, PortSide.SOUTH)
      south.setProperty(PORT_RATIO_OR_POSITION, 0.25)
      // 不设 PORT_ANCHOR → anchor 缺省 → offset=0
      setNorthSouthDummyCoordinates(g, [north, south])

      const graphWidth = 100 + 12 + 12
      expect(north.getPosition().x).toBeCloseTo(graphWidth * 0.5 - 10, 6)
      expect(south.getPosition().x).toBeCloseTo(graphWidth * 0.25, 6)
      expect(north.getPosition().y).toBeCloseTo(0 - 10, 6)
      expect(south.getPosition().y).toBeCloseTo(50 + 12 + 12 - 10, 6)
      expectFinitePositions([north, south])
    })

    it('Step2 FIXED_POS: x = position - anchor.x; 图宽按需扩展', () => {
      const g = new LGraph()
      g.setProperty(PORT_CONSTRAINTS, PortConstraints.FIXED_POS)
      g.getSize().x = 100
      g.getSize().y = 50
      const north = makeExtPort(g, PortSide.NORTH)
      north.setProperty(PORT_RATIO_OR_POSITION, 40)
      north.setProperty(PORT_ANCHOR, { x: 5, y: 0 })
      north.size.x = 20
      const south = makeExtPort(g, PortSide.SOUTH)
      south.setProperty(PORT_RATIO_OR_POSITION, 95)
      south.size.x = 20
      // 不设 PORT_ANCHOR → offset=0
      setNorthSouthDummyCoordinates(g, [north, south])

      expect(north.getPosition().x).toBeCloseTo(40 - 5, 6)
      expect(south.getPosition().x).toBeCloseTo(95, 6)
      // graphSize.x = max(100, 95 + 20/2=105) = 105
      expect(g.getSize().x).toBeCloseTo(105, 6)
      expectFinitePositions([north, south])
    })

    it('Step2 未知约束 (UNDEFINED): 默认分支不设 x, 只设 y; E/W dummy 在列表中也跳过', () => {
      const g = new LGraph()
      g.setProperty(PORT_CONSTRAINTS, PortConstraints.UNDEFINED)
      g.getSize().x = 100
      g.getSize().y = 50
      g.getOffset().y = 3
      const north = makeExtPort(g, PortSide.NORTH)
      north.getPosition().x = 12
      const east = makeExtPort(g, PortSide.EAST)
      east.getPosition().x = 77
      setNorthSouthDummyCoordinates(g, [north, east])

      // UNDEFINED → default break → x 不变; y 仍按 side 设置
      expect(north.getPosition().x).toBe(12)
      expect(north.getPosition().y).toBeCloseTo(0 - 3, 6)
      expect(east.getPosition().x).toBe(77)
      expect(east.getPosition().y).toBe(0) // 非 N/S → 不设 y
    })

    it('Step2 FIXED_ORDER: 先算连接端口平均 x, 再按 PORT_RATIO_OR_POSITION 排序并保证递增间距', () => {
      const g = new LGraph()
      g.setProperty(PORT_CONSTRAINTS, PortConstraints.FIXED_ORDER)
      g.getSize().x = 100
      g.getSize().y = 50
      g.getOffset().y = 5
      g.setProperty(SPACING_PORT_PORT, 5)
      const l0 = makeLayer(g)
      // FIXED_ORDER 先走 calculateNorthSouthDummyPositions (连接端口平均 x)
      const n1 = makeExtPort(g, PortSide.NORTH)
      n1.setProperty(PORT_RATIO_OR_POSITION, 0.9)
      n1.size.x = 10
      const n2 = makeExtPort(g, PortSide.NORTH)
      n2.setProperty(PORT_RATIO_OR_POSITION, 0.1)
      n2.size.x = 10
      const hi = makeNormalNode(g, l0); hi.getPosition().x = 90
      const lo = makeNormalNode(g, l0); lo.getPosition().x = 5
      edgeBetween(addPortOnSide(hi, PortSide.EAST), n1.getPorts()[0]!)
      edgeBetween(addPortOnSide(lo, PortSide.EAST), n2.getPorts()[0]!)

      setNorthSouthDummyCoordinates(g, [n1, n2])

      // n1.x = 90 (连接端口平均), n2.x = 5; 排序后 n2(0.1) 在前保持 5, n1(0.9) 后置且不早于 5+10+5
      expect(n2.getPosition().x).toBeCloseTo(5, 6)
      expect(n1.getPosition().x).toBeGreaterThanOrEqual(5 + 10 + 5)
      // 不变量 #2: N/S y 在内容区外
      expect(n2.getPosition().y).toBeLessThan(0)
      expectFinitePositions([n1, n2])
    })

    it('Step2 FREE: calculateNorthSouthDummyPositions 后 ensureUniquePositions 把重叠 dummy 推离 (delta<0 分支)', () => {
      const g = new LGraph()
      g.setProperty(PORT_CONSTRAINTS, PortConstraints.FREE)
      g.getSize().x = 100
      g.getSize().y = 50
      g.setProperty(SPACING_PORT_PORT, 5)
      const l0 = makeLayer(g)
      const a = makeExtPort(g, PortSide.NORTH)
      a.size.x = 10
      const b = makeExtPort(g, PortSide.NORTH)
      b.size.x = 10
      const p1 = makeNormalNode(g, l0); p1.getPosition().x = 10
      const p2 = makeNormalNode(g, l0); p2.getPosition().x = 10
      edgeBetween(addPortOnSide(p1, PortSide.EAST), a.getPorts()[0]!)
      edgeBetween(addPortOnSide(p2, PortSide.EAST), b.getPorts()[0]!)

      setNorthSouthDummyCoordinates(g, [a, b])

      // a 保持 10 (第一个), b 被推到 nextValid + margin.left = 10+10+5
      expect(a.getPosition().x).toBeCloseTo(10, 6)
      expect(b.getPosition().x).toBeGreaterThanOrEqual(10 + 10 + 5)
      expectFinitePositions([a, b])
    })

    it('Step2 FREE + 空列表: ensureUniquePositions 早退 (length===0)', () => {
      const g = new LGraph()
      g.setProperty(PORT_CONSTRAINTS, PortConstraints.FREE)
      g.getSize().x = 100
      expect(() => setNorthSouthDummyCoordinates(g, [])).not.toThrow()
    })

    it('Step2 FIXED_ORDER + 空列表: restoreProperOrder 早退 (length===0)', () => {
      const g = new LGraph()
      g.setProperty(PORT_CONSTRAINTS, PortConstraints.FIXED_ORDER)
      expect(() => setNorthSouthDummyCoordinates(g, [])).not.toThrow()
    })

    it('countRoutingSlots: 无端口 dummy → sourcesOf/sourceSideOf 空, 槽数 0', () => {
      const g = new LGraph()
      g.setProperty(RANDOM, new JavaRandom(0))
      g.setProperty(PORT_CONSTRAINTS, PortConstraints.FIXED_SIDE)
      const noPortDummy = new LNode(g)
      noPortDummy.setType(NodeType.EXTERNAL_PORT)
      noPortDummy.setProperty(EXT_PORT_SIDE, PortSide.NORTH)
      const slots = countRoutingSlots(g, [noPortDummy])
      expect(slots.northSlots).toBe(0)
      expect(slots.southSlots).toBe(0)
    })

    it('removeTemporaryNorthSouthDummies: 临时 dummy 缺 origin 端口或缺 origin 边时跳过', () => {
      const g = new LGraph()
      const l0 = makeLayer(g)
      // 只有 W/E 端口, 无 default-side origin 端口 → continue
      const tempNoOrigin = makeTempDummy(g, l0, PortSide.NORTH, makeExtPort(g, PortSide.NORTH))
      tempNoOrigin.getPorts().forEach(p => p.setSide(p.getSide() === PortSide.WEST ? PortSide.WEST : PortSide.EAST))
      // 有 origin 端口但无 origin 边 → continue
      const tempNoEdge = makeTempDummy(g, l0, PortSide.NORTH, makeExtPort(g, PortSide.NORTH))
      const origPort = new LPort()
      origPort.setNode(tempNoEdge)
      origPort.setSide(PortSide.SOUTH)

      expect(() => removeTemporaryNorthSouthDummies(g)).not.toThrow()
      // 两个临时 dummy 仍在层内 (未被移除)
      expect(tempNoOrigin.getLayer()).toBe(l0)
      expect(tempNoEdge.getLayer()).toBe(l0)
    })

    it('removeTemporaryNorthSouthDummies: origin 边带弯点时入/出边弯点迁移 (ELK 语义)', () => {
      const g = new LGraph()
      const l0 = makeLayer(g)
      const origNorth = makeExtPort(g, PortSide.NORTH)
      const tempNorth = makeTempDummy(g, l0, PortSide.NORTH, origNorth)
      const a = makeNormalNode(g, l0)
      const c = makeNormalNode(g, l0)
      const aToTemp = edgeBetween(addPortOnSide(a, PortSide.EAST), tempNorth.getPorts().find(p => p.getSide() === PortSide.WEST)!)
      const tempToC = edgeBetween(tempNorth.getPorts().find(p => p.getSide() === PortSide.EAST)!, addPortOnSide(c, PortSide.WEST))
      connectNodeToDummy(tempNorth, origNorth)
      const tempToOrig = origNorth.getPorts()[0]!.getIncomingEdges()[0]!
      // origin 边带弯点
      tempToOrig.getBendPoints().push({ x: 100, y: 200 }, { x: 300, y: 400 })

      removeTemporaryNorthSouthDummies(g)

      // 入边弯点 = origin 弯点 + 开头插 (0,0)+(node.pos)
      const first = { x: tempNorth.getPosition().x, y: tempNorth.getPosition().y }
      expect(aToTemp.getBendPoints()).toEqual([first, { x: 100, y: 200 }, { x: 300, y: 400 }])
      // 出边弯点 = 反转 origin 弯点 + 末尾 first
      expect(tempToC.getBendPoints()).toEqual([{ x: 300, y: 400 }, { x: 100, y: 200 }, first])
      expect(tempToOrig.getSource()).toBeNull()
      expect(tempToOrig.getTarget()).toBeNull()
      expectNoDanglingEdges(g)
    })

    it('fixExternalPortCoordinates 空图层: 早退', () => {
      const g = new LGraph()
      expect(() => fixExternalPortCoordinates(g)).not.toThrow()
    })

    it('fixLayerExternalPorts FIXED_RATIO: y = size.y*ratio - anchorY - (pad.top+offset.y); 图高按需增长', () => {
      const g = new LGraph()
      g.setProperty(PORT_CONSTRAINTS, PortConstraints.FIXED_RATIO)
      g.getSize().x = 100
      g.getSize().y = 100
      g.getOffset().x = 5
      g.getOffset().y = 7
      const l0 = makeLayer(g)
      const l1 = makeLayer(g)
      const west = makeExtPort(g, PortSide.WEST)
      west.setLayer(l0)
      west.setProperty(PORT_RATIO_OR_POSITION, 2.0) // ratio 2.0 → 需要 2 倍图高
      west.setProperty(PORT_ANCHOR, { x: 0, y: 4 })
      west.setProperty(EXT_PORT_SIZE, { x: 0, y: 10 })
      const east = makeExtPort(g, PortSide.EAST)
      east.setLayer(l1)
      east.setProperty(PORT_RATIO_OR_POSITION, 0.5)
      east.setProperty(PORT_ANCHOR, { x: 0, y: 2 })
      east.setProperty(EXT_PORT_SIZE, { x: 0, y: 10 })
      const sizeY0 = g.getSize().y

      fixExternalPortCoordinates(g)

      // WEST x = -offset.x - pad.left = -5-12 = -17
      expect(west.getPosition().x).toBeCloseTo(-17, 6)
      // y = 100*2 - 4 = 196; required = 196+10 = 206 > actual(124) → size.y += 206-124 = 82
      expect(west.getPosition().y).toBeCloseTo(196 - 12 - 7, 6)
      expect(g.getSize().y).toBeCloseTo(sizeY0 + (206 - 124), 6)
      // EAST 用新图高 (182) 重算: y = 182*0.5 - 2 - 12 - 7
      expect(east.getPosition().y).toBeCloseTo(182 * 0.5 - 2 - 12 - 7, 6)
      expectFinitePositions([west, east])
    })

    it('fixLayerExternalPorts FIXED_POS: y = pos - anchorY - (pad.top+offset.y); EXT_PORT_SIZE 缺省时从 ORIGIN 端口取', () => {
      const g = new LGraph()
      g.setProperty(PORT_CONSTRAINTS, PortConstraints.FIXED_POS)
      g.getSize().x = 100
      g.getSize().y = 80
      g.getOffset().x = 2
      g.getOffset().y = 3
      const l0 = makeLayer(g)
      const l1 = makeLayer(g)
      // 无 EXT_PORT_SIZE, ORIGIN 是 LPort
      const west = makeExtPort(g, PortSide.WEST)
      west.setLayer(l0)
      west.setProperty(PORT_RATIO_OR_POSITION, 50)
      west.setProperty(PORT_ANCHOR, { x: 0, y: 6 })
      const originPort = new LPort()
      originPort.getSize().x = 4
      originPort.getSize().y = 8
      west.setProperty(ORIGIN, originPort)
      // 无 EXT_PORT_SIZE, ORIGIN 非 LPort → {0,0}
      const east = makeExtPort(g, PortSide.EAST)
      east.setLayer(l1)
      east.setProperty(PORT_RATIO_OR_POSITION, 20)
      east.setProperty(PORT_ANCHOR, { x: 0, y: 2 })
      east.setProperty(ORIGIN, { some: 'object' })

      fixExternalPortCoordinates(g)

      expect(west.getPosition().x).toBeCloseTo(-2 - 12, 6)
      expect(west.getPosition().y).toBeCloseTo(50 - 6 - 12 - 3, 6)
      expect(east.getPosition().x).toBeCloseTo(100 + 12 - 2, 6)
      expect(east.getPosition().y).toBeCloseTo(20 - 2 - 12 - 3, 6)
      expectFinitePositions([west, east])
    })

    it('correctSlantedEdgeSegments 空图层: 早退; 无边弯点的边跳过', () => {
      const g = new LGraph()
      expect(() => correctSlantedEdgeSegments(g)).not.toThrow()

      const g2 = new LGraph()
      g2.getSize().x = 100
      const l0 = makeLayer(g2)
      const l1 = makeLayer(g2)
      const west = makeExtPort(g2, PortSide.WEST)
      west.setLayer(l0)
      const b = makeNormalNode(g2, l1)
      const outEdge = edgeBetween(west.getPorts()[0]!, addPortOnSide(b, PortSide.EAST))
      expect(outEdge.getBendPoints()).toHaveLength(0)
      correctSlantedEdgeSegments(g2)
      expect(outEdge.getBendPoints()).toHaveLength(0)
    })
  })
})
