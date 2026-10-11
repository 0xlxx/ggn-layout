/**
 * HierarchicalPortConstraintProcessor (ggn 移植) 单元测试.
 *
 * SSOT: ELK Java 0.12.0
 *   plugins/org.eclipse.elk.alg.layered/src/org/eclipse/elk/alg/layered/intermediate/
 *     HierarchicalPortConstraintProcessor.java
 *
 * 覆盖:
 *   - E/W 分支 (processEasternAndWesternPortDummies): FIXED_ORDER/FIXED_RATIO/FIXED_POS 时
 *     对首/末层 E/W 外部端口 dummy 按 PORT_RATIO_OR_POSITION 排序并建立 in-layer successor 约束.
 *   - N/S 分支 (processNorthernAndSouthernPortDummies): pc=FIXED_SIDE 及以上时, 为与 N/S 外部端口
 *     dummy 相邻的普通节点创建临时替换 dummy, 重连边, 原 dummy 移除并记录到 EXT_PORT_REPLACED_DUMMIES.
 *
 * 说明: src 已修复 (Layer 改为值导入), N/S dummy 位于首/末层会按 ELK 语义新建首/末层
 * (HierarchicalPortConstraintProcessor.java:305-327); 用例断言 .not.toThrow() 与新建层成功.
 */
import { describe, expect, it } from 'vitest'
import { LGraph, LNode, LPort, LEdge, PortSide, PortConstraints, NodeType } from '../../src/index.js'
import { Layer } from '../../src/graph/layer.js'
import { HierarchicalPortConstraintProcessor } from '../../src/intermediate/hierarchical-port-constraint-processor.js'
import {
  EXT_PORT_SIDE, PORT_RATIO_OR_POSITION, EXT_PORT_REPLACED_DUMMY, EXT_PORT_REPLACED_DUMMIES,
  IN_LAYER_SUCCESSOR_CONSTRAINTS,
} from '../../src/options/internal-properties.js'
import { PORT_CONSTRAINTS, ALIGNMENT } from '../../src/options/layered-options.js'

// ── 构造 helper ──

function makeLayer(g: LGraph): Layer {
  const l = new Layer(g)
  g.getLayers().push(l)
  return l
}

/** 外部端口 dummy (EXTERNAL_PORT + EXT_PORT_SIDE + 一个端口, 端口侧 = 外部侧). */
function makeExtPort(g: LGraph, layer: Layer, side: PortSide, ratio = 0.5): LNode {
  const n = new LNode(g)
  n.setType(NodeType.EXTERNAL_PORT)
  n.setProperty(EXT_PORT_SIDE, side)
  n.setProperty(PORT_RATIO_OR_POSITION, ratio)
  n.setProperty(IN_LAYER_SUCCESSOR_CONSTRAINTS, [])
  const p = new LPort()
  p.setNode(n)
  p.setSide(side)
  n.setLayer(layer)
  return n
}

function makeNormalNode(g: LGraph, layer: Layer): LNode {
  const n = new LNode(g)
  n.setType(NodeType.NORMAL)
  n.size = { x: 30, y: 20 }
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

describe('HierarchicalPortConstraintProcessor (ELK Java 0.12.0 移植)', () => {
  // ─────────────────────────────────────────────────────────────
  // E/W 分支
  // ─────────────────────────────────────────────────────────────
  describe('processEasternAndWesternPortDummies', () => {
    it('pc 非 order-fixed (FREE): E/W 与 N/S 分支均直接返回, 图不变', () => {
      const g = new LGraph()
      g.setProperty(PORT_CONSTRAINTS, PortConstraints.FREE)
      const l0 = makeLayer(g)
      const west = makeExtPort(g, l0, PortSide.WEST, 0.5)
      const east = makeExtPort(g, l0, PortSide.EAST, 0.3)

      new HierarchicalPortConstraintProcessor().process(g)

      // 不变量: 无 successor 约束、原 dummy 仍在层内、无 EXT_PORT_REPLACED_DUMMIES
      expect(west.getProperty(IN_LAYER_SUCCESSOR_CONSTRAINTS)).toHaveLength(0)
      expect(east.getProperty(IN_LAYER_SUCCESSOR_CONSTRAINTS)).toHaveLength(0)
      expect(west.getLayer()).toBe(l0)
      expect(east.getLayer()).toBe(l0)
      expect(g.getProperty(EXT_PORT_REPLACED_DUMMIES)).toBeUndefined()
      expectNoDanglingEdges(g)
    })

    it('pc=FIXED_ORDER 但无 layer: 直接返回, 不抛错 (N/S 分支设 EXT_PORT_REPLACED_DUMMIES=[])', () => {
      const g = new LGraph()
      g.setProperty(PORT_CONSTRAINTS, PortConstraints.FIXED_ORDER)
      expect(() => new HierarchicalPortConstraintProcessor().process(g)).not.toThrow()
      expect(g.getLayers()).toHaveLength(0)
      expect(g.getProperty(EXT_PORT_REPLACED_DUMMIES)).toEqual([])
    })

    it('FIXED_ORDER: 首/末层 E/W dummy 按 ratio 升序建立 successor 约束 (跳过 N/S 与普通节点)', () => {
      const g = new LGraph()
      g.setProperty(PORT_CONSTRAINTS, PortConstraints.FIXED_ORDER)
      const l0 = makeLayer(g)
      const l1 = makeLayer(g)
      const l2 = makeLayer(g)
      // 首层: WEST 0.5, WEST 0.2, NORTH (非 E/W), 普通节点
      const west05 = makeExtPort(g, l0, PortSide.WEST, 0.5)
      const west02 = makeExtPort(g, l0, PortSide.WEST, 0.2)
      const north = makeExtPort(g, l0, PortSide.NORTH, 0.9)
      const normal = makeNormalNode(g, l0)
      void normal
      const mid = makeNormalNode(g, l1)
      // 末层: EAST 0.7, EAST 0.1, SOUTH
      const east07 = makeExtPort(g, l2, PortSide.EAST, 0.7)
      const east01 = makeExtPort(g, l2, PortSide.EAST, 0.1)
      const south = makeExtPort(g, l2, PortSide.SOUTH, 0.4)
      void mid
      void south

      new HierarchicalPortConstraintProcessor().process(g)

      // 排序后: WEST 0.2 < WEST 0.5 → west02.successors = [west05]; west05 无后继.
      expect(west02.getProperty(IN_LAYER_SUCCESSOR_CONSTRAINTS)).toEqual([west05])
      expect(west05.getProperty(IN_LAYER_SUCCESSOR_CONSTRAINTS)).toHaveLength(0)
      // 末层: EAST 0.1 < EAST 0.7 → east01.successors = [east07]
      expect(east01.getProperty(IN_LAYER_SUCCESSOR_CONSTRAINTS)).toEqual([east07])
      expect(east07.getProperty(IN_LAYER_SUCCESSOR_CONSTRAINTS)).toHaveLength(0)
      // N/S dummy 不参与 E/W 约束 (continue, 不重置 lastHierarchicalDummy)
      expect(north.getProperty(IN_LAYER_SUCCESSOR_CONSTRAINTS)).toHaveLength(0)

      // 不变量 #1: 无悬挂边
      expectNoDanglingEdges(g)
    })

    it('FIXED_RATIO: E/W 排序同样生效 (isOrderFixed 包含 FIXED_RATIO)', () => {
      const g = new LGraph()
      g.setProperty(PORT_CONSTRAINTS, PortConstraints.FIXED_RATIO)
      const l0 = makeLayer(g)
      const l1 = makeLayer(g)
      const westHigh = makeExtPort(g, l0, PortSide.WEST, 0.9)
      const westLow = makeExtPort(g, l0, PortSide.WEST, 0.1)
      const normal = makeNormalNode(g, l0)
      const eastA = makeExtPort(g, l1, PortSide.EAST, 0.3)
      const eastB = makeExtPort(g, l1, PortSide.EAST, 0.6)
      void normal

      new HierarchicalPortConstraintProcessor().process(g)

      expect(westLow.getProperty(IN_LAYER_SUCCESSOR_CONSTRAINTS)).toEqual([westHigh])
      expect(westHigh.getProperty(IN_LAYER_SUCCESSOR_CONSTRAINTS)).toHaveLength(0)
      expect(eastA.getProperty(IN_LAYER_SUCCESSOR_CONSTRAINTS)).toEqual([eastB])
      expect(eastB.getProperty(IN_LAYER_SUCCESSOR_CONSTRAINTS)).toHaveLength(0)
    })

    it('FIXED_POS: E/W 排序同样生效 (isOrderFixed 包含 FIXED_POS, ELK PortConstraints.isOrderFixed)', () => {
      const g = new LGraph()
      g.setProperty(PORT_CONSTRAINTS, PortConstraints.FIXED_POS)
      const l0 = makeLayer(g)
      const l1 = makeLayer(g)
      const westHigh = makeExtPort(g, l0, PortSide.WEST, 70) // position 70
      const westLow = makeExtPort(g, l0, PortSide.WEST, 30) // position 30
      const eastA = makeExtPort(g, l1, PortSide.EAST, 40)
      const eastB = makeExtPort(g, l1, PortSide.EAST, 10)

      new HierarchicalPortConstraintProcessor().process(g)

      // 按 PORT_RATIO_OR_POSITION (此处即 position) 升序建立 successor 约束
      expect(westLow.getProperty(IN_LAYER_SUCCESSOR_CONSTRAINTS)).toEqual([westHigh])
      expect(westHigh.getProperty(IN_LAYER_SUCCESSOR_CONSTRAINTS)).toHaveLength(0)
      expect(eastB.getProperty(IN_LAYER_SUCCESSOR_CONSTRAINTS)).toEqual([eastA])
      expect(eastA.getProperty(IN_LAYER_SUCCESSOR_CONSTRAINTS)).toHaveLength(0)
    })

    it('E/W 与 N/S 交错: successor 链跨过 N/S dummy 不断开 (lastHierarchicalDummy 不因 N/S 重置)', () => {
      const g = new LGraph()
      g.setProperty(PORT_CONSTRAINTS, PortConstraints.FIXED_ORDER)
      const l0 = makeLayer(g)
      const l1 = makeLayer(g)
      // 首层: WEST 0.1, NORTH 0.9, WEST 0.3, 普通节点 → 排序后 [WEST 0.1, WEST 0.3, NORTH 0.9]
      const west01 = makeExtPort(g, l0, PortSide.WEST, 0.1)
      const north09 = makeExtPort(g, l0, PortSide.NORTH, 0.9)
      const west03 = makeExtPort(g, l0, PortSide.WEST, 0.3)
      const normal = makeNormalNode(g, l0)
      void normal
      const east = makeExtPort(g, l1, PortSide.EAST, 0.5)
      void east

      new HierarchicalPortConstraintProcessor().process(g)

      // NORTH(0.9) 排在 WEST(0.3) 之后 (同按 ratio 排序), 但 continue 不参与链也不重置 last
      expect(west01.getProperty(IN_LAYER_SUCCESSOR_CONSTRAINTS)).toEqual([west03])
      expect(west03.getProperty(IN_LAYER_SUCCESSOR_CONSTRAINTS)).toHaveLength(0)
      expect(north09.getProperty(IN_LAYER_SUCCESSOR_CONSTRAINTS)).toHaveLength(0)
    })
  })

  // ─────────────────────────────────────────────────────────────
  // N/S 分支
  // ─────────────────────────────────────────────────────────────
  describe('processNorthernAndSouthernPortDummies', () => {
    /**
     * 5 层图, N/S dummy 只出现在中间层 (避免触发 src 的 `new Layer` bug):
     *   L0[b0], L1[dNorth(NORTH), b1], L2[b2], L3[dSouth(SOUTH), b3], L4[b4]
     * 边:
     *   e1: dNorth→b1 (同层, 前置替换 dummy 放入 list[1] → 层 L0)
     *   e2: b2→dSouth (L2→L3, 后置替换 dummy 放入 list[3] → 层 L2)
     *   e3: dSouth→b3 (同层, 前置替换 dummy 复用 e2 的 dummy → 层 L2)
     */
    function makeNSGraph(): { g: LGraph; dNorth: LNode; dSouth: LNode; b0: LNode; b1: LNode; b2: LNode; b3: LNode; e1: LEdge; e2: LEdge; e3: LEdge } {
      const g = new LGraph()
      g.setProperty(PORT_CONSTRAINTS, PortConstraints.FIXED_SIDE)
      const l0 = makeLayer(g)
      const l1 = makeLayer(g)
      const l2 = makeLayer(g)
      const l3 = makeLayer(g)
      const l4 = makeLayer(g)
      const b0 = makeNormalNode(g, l0)
      const dNorth = makeExtPort(g, l1, PortSide.NORTH)
      const b1 = makeNormalNode(g, l1)
      const b2 = makeNormalNode(g, l2)
      const dSouth = makeExtPort(g, l3, PortSide.SOUTH)
      const b3 = makeNormalNode(g, l3)
      const b4 = makeNormalNode(g, l4)
      void b0
      void b4

      const e1 = edgeBetween(dNorth.getPorts()[0]!, addPortOnSide(b1, PortSide.WEST))
      const e2 = edgeBetween(addPortOnSide(b2, PortSide.EAST), dSouth.getPorts()[0]!)
      const e3 = edgeBetween(dSouth.getPorts()[0]!, addPortOnSide(b3, PortSide.WEST))
      return { g, dNorth, dSouth, b0, b1, b2, b3, e1, e2, e3 }
    }

    it('FIXED_SIDE: 创建临时替换 dummy, 重连边, 移除原 dummy, 记录 EXT_PORT_REPLACED_DUMMIES', () => {
      const { g, dNorth, dSouth, b1, b2, b3, e1, e2, e3 } = makeNSGraph()

      new HierarchicalPortConstraintProcessor().process(g)

      // 不变量 #1: 无悬挂边
      expectNoDanglingEdges(g)

      // 原 dummy 被移除 (getLayer() === null)
      expect(dNorth.getLayer()).toBeNull()
      expect(dSouth.getLayer()).toBeNull()

      // EXT_PORT_REPLACED_DUMMIES 记录原 dummy (ELK 语义, 遍历顺序)
      expect(g.getProperty(EXT_PORT_REPLACED_DUMMIES)).toEqual([dNorth, dSouth])

      // 层数不变 (无新首/末层): 5 层
      expect(g.getLayers()).toHaveLength(5)
      const layers = g.getLayers()

      // e1: dNorth→b1 的前置 dummy (prev list[1]) 放入 L0
      const dummyN = e1.getSource()!.getNode()!
      expect(dummyN.getLayer()).toBe(layers[0]!)
      // e3: dSouth→b3 的前置 dummy (prev list[3]) 放入 L2
      const dummyX = e3.getSource()!.getNode()!
      expect(dummyX.getLayer()).toBe(layers[2]!)
      // e2: b2→dSouth 的后置 dummy (next list[4]) 放入 L3; e3 用的是另一 dummy, 不复用
      const dummyS = e2.getTarget()!.getNode()!
      expect(dummyS.getLayer()).toBe(layers[3]!)
      expect(dummyX).not.toBe(dummyS)
      expect(e3.getTarget()!.getNode()).toBe(b3)

      // 临时 dummy 属性: EXTERNAL_PORT + 继承 EXT_PORT_SIDE + EXT_PORT_REPLACED_DUMMY + FIXED_POS + CENTER
      expect(dummyN.getType()).toBe(NodeType.EXTERNAL_PORT)
      expect(dummyN.getProperty(EXT_PORT_REPLACED_DUMMY)).toBe(dNorth)
      expect(dummyN.getProperty(EXT_PORT_SIDE)).toBe(PortSide.NORTH)
      expect(dummyX.getProperty(EXT_PORT_REPLACED_DUMMY)).toBe(dSouth)
      expect(dummyX.getProperty(EXT_PORT_SIDE)).toBe(PortSide.SOUTH)
      expect(dummyS.getProperty(EXT_PORT_REPLACED_DUMMY)).toBe(dSouth)
      expect(dummyS.getProperty(EXT_PORT_SIDE)).toBe(PortSide.SOUTH)
      for (const d of [dummyN, dummyX, dummyS]) {
        expect(d.getProperty(PORT_CONSTRAINTS)).toBe(PortConstraints.FIXED_POS)
        expect(d.getProperty(ALIGNMENT)).toBe('CENTER')
        // 端口侧守恒: WEST 入 + EAST 出 (HPC createDummy)
        expect(d.getPorts()[0]!.getSide()).toBe(PortSide.WEST)
        expect(d.getPorts()[1]!.getSide()).toBe(PortSide.EAST)
      }

      // 边重连: e1 源 = dummyN 输出端口; e2 目标 = dummyS 输入端口; e3 源 = dummyX 输出端口
      expect(e1.getSource()).toBe(dummyN.getPorts()[1])
      expect(e1.getTarget()!.getNode()).toBe(b1)
      expect(e2.getSource()!.getNode()).toBe(b2)
      expect(e2.getTarget()).toBe(dummyS.getPorts()[0])
      expect(e3.getSource()).toBe(dummyX.getPorts()[1])

      // 不变量 #2 (dummy 数量守恒): 恰好 3 个临时 dummy (去重)
      const tempDummies = [...new Set(g.getAllNodes().filter(n =>
        n.getType() === NodeType.EXTERNAL_PORT && n.hasProperty(EXT_PORT_REPLACED_DUMMY)))]
      expect(tempDummies).toHaveLength(3)
      expect(tempDummies).toEqual([dummyN, dummyX, dummyS])
    })

    it('origin 解析: EXT_PORT_REPLACED_DUMMY 作为 map 键; 不同层各自创建 dummy (每层独立 map)', () => {
      const g = new LGraph()
      g.setProperty(PORT_CONSTRAINTS, PortConstraints.FIXED_SIDE)
      const l0 = makeLayer(g)
      const l1 = makeLayer(g)
      const l2 = makeLayer(g)
      const originAnchor = new LNode(g)
      const dNorth = makeExtPort(g, l1, PortSide.NORTH)
      dNorth.setProperty(EXT_PORT_REPLACED_DUMMY, originAnchor)
      const b1 = makeNormalNode(g, l1)
      const b2 = makeNormalNode(g, l2)
      void originAnchor
      // e1: 同层 L1; e2: L2 节点连到 L1 的 dNorth
      const e1 = edgeBetween(dNorth.getPorts()[0]!, addPortOnSide(b1, PortSide.WEST))
      const e2 = edgeBetween(dNorth.getPorts()[0]!, addPortOnSide(b2, PortSide.WEST))

      new HierarchicalPortConstraintProcessor().process(g)

      // 两层独立 map → 2 个临时 dummy (去重计数; dNorth 自身也带 EXT_PORT_REPLACED_DUMMY, 故按指向过滤)
      const tempDummies = [...new Set(g.getAllNodes().filter(n =>
        n.getType() === NodeType.EXTERNAL_PORT && n.getProperty(EXT_PORT_REPLACED_DUMMY) === dNorth))]
      expect(tempDummies).toHaveLength(2)
      for (const d of tempDummies) expect(d.getProperty(EXT_PORT_REPLACED_DUMMY)).toBe(dNorth)
      // e1 与 e2 的源节点不同 (不同层 dummy)
      expect(e1.getSource()!.getNode()).not.toBe(e2.getSource()!.getNode())
      expect(e1.getSource()!.getNode()!.getLayer()).toBe(l0)
      expect(e2.getSource()!.getNode()!.getLayer()).toBe(l1)
      expectNoDanglingEdges(g)
    })

    it('无 N/S dummy 的图: 不创建临时 dummy, EXT_PORT_REPLACED_DUMMIES = []', () => {
      const g = new LGraph()
      g.setProperty(PORT_CONSTRAINTS, PortConstraints.FIXED_SIDE)
      const l0 = makeLayer(g)
      const l1 = makeLayer(g)
      const a = makeNormalNode(g, l0)
      const b = makeNormalNode(g, l1)
      edgeBetween(addPortOnSide(a, PortSide.EAST), addPortOnSide(b, PortSide.WEST))

      new HierarchicalPortConstraintProcessor().process(g)

      expect(g.getProperty(EXT_PORT_REPLACED_DUMMIES)).toEqual([])
      expect(g.getLayers()).toHaveLength(2)
      expect([...new Set(g.getAllNodes())].filter(n => n.hasProperty(EXT_PORT_REPLACED_DUMMY))).toHaveLength(0)
      expectNoDanglingEdges(g)
    })

    it('N/S dummy 位于首层: 成功新建首层容纳前置 dummy (ELK 语义; 曾因 import type Layer 崩溃)', () => {
      const g = new LGraph()
      g.setProperty(PORT_CONSTRAINTS, PortConstraints.FIXED_SIDE)
      const l0 = makeLayer(g)
      const dNorth = makeExtPort(g, l0, PortSide.NORTH)
      const b = makeNormalNode(g, l0)
      edgeBetween(dNorth.getPorts()[0]!, addPortOnSide(b, PortSide.WEST))

      // ELK Java: 成功, 新建首层容纳前置 dummy.
      expect(() => new HierarchicalPortConstraintProcessor().process(g)).not.toThrow()
      expect(g.getProperty(EXT_PORT_REPLACED_DUMMIES)).toHaveLength(1)
      expectNoDanglingEdges(g)
    })
    it('N/S dummy 同时位于首层与末层: 新建首层 + 新建末层 (ELK :310-327)', () => {
      const g = new LGraph()
      g.setProperty(PORT_CONSTRAINTS, PortConstraints.FIXED_SIDE)
      const l0 = makeLayer(g)
      const l1 = makeLayer(g)
      const dNorth = makeExtPort(g, l0, PortSide.NORTH)
      const bFirst = makeNormalNode(g, l0)
      const bLast = makeNormalNode(g, l1)
      const dSouth = makeExtPort(g, l1, PortSide.SOUTH)
      const e1 = edgeBetween(dNorth.getPorts()[0]!, addPortOnSide(bFirst, PortSide.WEST))
      const e2 = edgeBetween(addPortOnSide(bLast, PortSide.EAST), dSouth.getPorts()[0]!)
      void e1
      void e2

      new HierarchicalPortConstraintProcessor().process(g)

      // 层数 2 → 前置 dummy 放入 list[0] (新建首层), 后置 dummy 放入 list[2] (新建末层)
      expect(g.getLayers()).toHaveLength(4)
      expect(g.getProperty(EXT_PORT_REPLACED_DUMMIES)).toHaveLength(2)
      // 原 N/S dummy 全部移出层
      expect(dNorth.getLayer()).toBeNull()
      expect(dSouth.getLayer()).toBeNull()
      // 前置 dummy 在首层, 后置 dummy 在末层
      const tempDummies = [...new Set(g.getAllNodes().filter(n =>
        n.getType() === NodeType.EXTERNAL_PORT && n.hasProperty(EXT_PORT_REPLACED_DUMMY)))]
      expect(tempDummies).toHaveLength(2)
      const prevDummy = e1.getSource()!.getNode()!
      const nextDummy = e2.getTarget()!.getNode()!
      expect(prevDummy.getLayer()).toBe(g.getLayers()[0])
      expect(nextDummy.getLayer()).toBe(g.getLayers()[g.getLayers().length - 1])
      expectNoDanglingEdges(g)
    })

    it('不变量: 处理后所有可达节点坐标有限, 临时 dummy 端口侧守恒 (WEST 入 / EAST 出)', () => {
      const g = new LGraph()
      g.setProperty(PORT_CONSTRAINTS, PortConstraints.FIXED_SIDE)
      const l0 = makeLayer(g)
      const l1 = makeLayer(g)
      const dNorth = makeExtPort(g, l0, PortSide.NORTH)
      const b = makeNormalNode(g, l0)
      const e1 = edgeBetween(dNorth.getPorts()[0]!, addPortOnSide(b, PortSide.WEST))

      new HierarchicalPortConstraintProcessor().process(g)

      const tempDummies = [...new Set(g.getAllNodes().filter(n =>
        n.getType() === NodeType.EXTERNAL_PORT && n.hasProperty(EXT_PORT_REPLACED_DUMMY)))]
      expect(tempDummies).toHaveLength(1)
      for (const d of tempDummies) {
        expect(Number.isFinite(d.getPosition().x)).toBe(true)
        expect(Number.isFinite(d.getPosition().y)).toBe(true)
        // 端口侧守恒: HPC createDummy 建 WEST 入 + EAST 出 (ELK :377-383)
        expect(d.getPorts()[0]!.getSide()).toBe(PortSide.WEST)
        expect(d.getPorts()[1]!.getSide()).toBe(PortSide.EAST)
      }
      // 原 N/S dummy 全部移出层且记录在 EXT_PORT_REPLACED_DUMMIES (数量守恒: 1 原 dummy → 1 条记录)
      expect(dNorth.getLayer()).toBeNull()
      expect(g.getProperty(EXT_PORT_REPLACED_DUMMIES)).toHaveLength(1)
      expectNoDanglingEdges(g)
      void e1
    })
  })
})
