/**
 * GraphTransformer (ggn 移植) 单元测试.
 *
 * SSOT: ELK Java 0.12.0
 *   plugins/org.eclipse.elk.alg.layered/src/org/eclipse/elk/alg/layered/intermediate/
 *     GraphTransformer.java
 *
 * 语义 (mode 命名与 ELK 一致; 布局前 TO_INPUT_DIRECTION 变换到内部 LTR, 布局后 TO_INTERNAL_LTR 变回):
 *   READING_DIRECTION: LEFT → mirrorX; DOWN → transpose; UP → transpose+mirrorY (入) / mirrorY+transpose (出)
 *   ROTATION:          LEFT → mirrorX+mirrorY; DOWN → mirrorX+transpose (入) / transpose+mirrorX (出);
 *                      UP   → transpose+mirrorX (入) / mirrorX+transpose (出)
 * 不变量: 变换往返 (TO_INPUT_DIRECTION → TO_INTERNAL_LTR) 恢复原始坐标/侧; 端口侧守恒; 坐标有限.
 */
import { describe, expect, it } from 'vitest'
import { LGraph, LNode, LPort, LEdge, PortSide, Direction, NodeType, LayerConstraint, InLayerConstraint } from '../../src/index.js'
import { Layer } from '../../src/graph/layer.js'
import { GraphTransformer, TransformMode } from '../../src/intermediate/graph-transformer.js'
import { EXT_PORT_SIDE } from '../../src/options/internal-properties.js'
import {
  DIRECTION, DIRECTION_CONGRUENCY, NODE_LABELS_PADDING, PORT_INDEX, JUNCTION_POINTS,
} from '../../src/options/layered-options.js'

// ── 构造 helper: 完整图 (节点/端口/边/弯点/标签) ──

type Built = {
  g: LGraph
  a: LNode
  b: LNode
  ext: LNode
  ext2: LNode
  ext3: LNode
  ext4: LNode
  ext5: LNode
  ext6: LNode
  pE: LPort
  pW: LPort
  pN: LPort
  pS: LPort
  e: LEdge
}

function buildGraph(opts: { size?: { x: number; y: number }; labelsPadding?: boolean } = {}): Built {
  const g = new LGraph()
  const s = opts.size ?? { x: 100, y: 60 }
  g.getSize().x = s.x
  g.getSize().y = s.y
  g.getOffset().x = 5
  g.getOffset().y = 7
  g.setPadding({ left: 1, top: 2, right: 3, bottom: 4 })
  if (opts.labelsPadding !== false) {
    g.setProperty(NODE_LABELS_PADDING, { top: 1, right: 2, bottom: 3, left: 4 })
  }

  // layerless 节点 A
  const a = new LNode(g)
  a.position = { x: 10, y: 20 }
  a.size = { x: 30, y: 40 }
  a.getPadding().left = 1; a.getPadding().top = 2; a.getPadding().right = 3; a.getPadding().bottom = 4
  a.getMargin().left = 1; a.getMargin().top = 2; a.getMargin().right = 3; a.getMargin().bottom = 4
  a.setLabels([{ text: 'A', position: { x: 2, y: 3 }, size: { x: 8, y: 9 } }])

  // 四侧端口 (先设 size 再 setSide, 保证 anchor 与侧一致)
  const pE = new LPort(); pE.setNode(a); pE.getSize().x = 5; pE.getSize().y = 6; pE.setSide(PortSide.EAST); pE.getPosition().x = 30; pE.getPosition().y = 10
  pE.setLabels([{ text: 'pE', position: { x: 1, y: 2 }, size: { x: 3, y: 4 } }])
  const pW = new LPort(); pW.setNode(a); pW.setSide(PortSide.WEST); pW.getPosition().x = 0; pW.getPosition().y = 12
  const pN = new LPort(); pN.setNode(a); pN.setSide(PortSide.NORTH); pN.getPosition().x = 8; pN.getPosition().y = 0
  const pS = new LPort(); pS.setNode(a); pS.setSide(PortSide.SOUTH); pS.getPosition().x = 9; pS.getPosition().y = 40
  pW.setProperty(PORT_INDEX, 3)
  pN.setProperty(PORT_INDEX, -2)
  const pU = new LPort(); pU.setNode(a); pU.setSide(PortSide.UNDEFINED); pU.getPosition().x = 1; pU.getPosition().y = 1

  // 分层节点 B
  const l0 = new Layer(g)
  g.getLayers().push(l0)
  const b = new LNode(g)
  b.setLayer(l0)
  b.position = { x: 60, y: 10 }
  b.size = { x: 20, y: 30 }
  const pB = new LPort(); pB.setNode(b); pB.setSide(PortSide.WEST)

  // 外部端口 dummy (每个只带一种约束, 覆盖 transposeLayerConstraint 各分支且可往返恢复)
  const ext = new LNode(g)
  ext.setType(NodeType.EXTERNAL_PORT)
  ext.setProperty(EXT_PORT_SIDE, PortSide.WEST)
  ext.setLayerConstraint(LayerConstraint.FIRST_SEPARATE)
  ext.position = { x: 0, y: 0 }
  ext.size = { x: 10, y: 10 }
  const ext2 = new LNode(g)
  ext2.setType(NodeType.EXTERNAL_PORT)
  ext2.setProperty(EXT_PORT_SIDE, PortSide.SOUTH)
  ext2.setInLayerConstraint(InLayerConstraint.BOTTOM)
  ext2.position = { x: 0, y: 20 }
  ext2.size = { x: 10, y: 10 }
  const ext3 = new LNode(g)
  ext3.setType(NodeType.EXTERNAL_PORT)
  ext3.setProperty(EXT_PORT_SIDE, PortSide.NORTH)
  ext3.setInLayerConstraint(InLayerConstraint.TOP)
  ext3.position = { x: 0, y: 40 }
  ext3.size = { x: 10, y: 10 }
  const ext4 = new LNode(g)
  ext4.setType(NodeType.EXTERNAL_PORT)
  ext4.setProperty(EXT_PORT_SIDE, PortSide.EAST)
  ext4.setLayerConstraint(LayerConstraint.LAST_SEPARATE)
  ext4.position = { x: 0, y: 60 }
  ext4.size = { x: 10, y: 10 }
  const ext5 = new LNode(g)
  ext5.setType(NodeType.EXTERNAL_PORT)
  ext5.setProperty(EXT_PORT_SIDE, PortSide.WEST)
  ext5.setLayerConstraint(LayerConstraint.FIRST)
  ext5.position = { x: 0, y: 80 }
  ext5.size = { x: 10, y: 10 }
  const ext6 = new LNode(g)
  ext6.setType(NodeType.EXTERNAL_PORT)
  ext6.setProperty(EXT_PORT_SIDE, PortSide.EAST)
  ext6.setLayerConstraint(LayerConstraint.LAST)
  ext6.position = { x: 0, y: 100 }
  ext6.size = { x: 10, y: 10 }

  // 边 A→B: 弯点 + junction points + 边标签
  const e = new LEdge()
  e.setSource(pE)
  e.setTarget(pB)
  e.getBendPoints().push({ x: 1, y: 2 }, { x: 3, y: 4 })
  e.setProperty(JUNCTION_POINTS, [{ x: 5, y: 6 }])
  e.getLabels().push({ text: 'e', position: { x: 7, y: 8 }, size: { x: 9, y: 10 } })

  return { g, a, b, ext, ext2, ext3, ext4, ext5, ext6, pE, pW, pN, pS, e }
}

function snap(v: unknown): string {
  return v === null || v === undefined ? 'NONE' : String(v)
}

function snapshot(g: LGraph): string {
  const parts: string[] = []
  for (const n of [...new Set(g.getAllNodes())]) {
    parts.push(`${n.id}:${n.getType()}:${n.position.x},${n.position.y}:${n.size.x},${n.size.y}:${snap(n.getLayerConstraint())}:${snap(n.getInLayerConstraint())}:${n.getProperty(EXT_PORT_SIDE)}`)
    for (const p of n.getPorts()) {
      parts.push(`  p:${p.getSide()}:${p.getPosition().x},${p.getPosition().y}:${p.getAnchor().x},${p.getAnchor().y}:${p.getProperty(PORT_INDEX)}`)
    }
  }
  parts.push(`g:${g.getOffset().x},${g.getOffset().y}:${g.getSize().x},${g.getSize().y}:${g.getPadding().left},${g.getPadding().top},${g.getPadding().right},${g.getPadding().bottom}`)
  return parts.join('|')
}

describe('GraphTransformer (ELK Java 0.12.0 移植)', () => {
  describe('READING_DIRECTION', () => {
    it('LEFT: 只 mirrorX — 端口侧 E↔W, N/S 不变; 外部端口 side 镜像; 层约束 FIRST↔LAST', () => {
      const { g, a, pE, pW, pN, pS, ext, ext4, ext5, ext6, e } = buildGraph()
      g.setProperty(DIRECTION, Direction.LEFT)
      g.setProperty(DIRECTION_CONGRUENCY, 'READING_DIRECTION')

      new GraphTransformer(TransformMode.TO_INPUT_DIRECTION).process(g)

      // 端口侧守恒: E↔W
      expect(pE.getSide()).toBe(PortSide.WEST)
      expect(pW.getSide()).toBe(PortSide.EAST)
      expect(pN.getSide()).toBe(PortSide.NORTH)
      expect(pS.getSide()).toBe(PortSide.SOUTH)
      // mirrorX 坐标: offset = (size.x - offset.x) - offset.x = 100-5-5 = 90
      // A.position.x = 90 - size.x(30) - old(10) = 50
      expect(a.position.x).toBeCloseTo(50, 6)
      // 端口 position.x = nodeSize.x - port.size.x - old = 30 - 5 - 30 = -5
      expect(pE.getPosition().x).toBeCloseTo(-5, 6)
      // anchor.x = port.size.x - old anchor.x (EAST anchor.x=5 → 0)
      expect(pE.getAnchor().x).toBeCloseTo(0, 6)
      // PORT_INDEX 取反
      expect(pW.getProperty(PORT_INDEX)).toBe(-3)
      expect(pN.getProperty(PORT_INDEX)).toBe(2)
      // 外部端口 side + 层约束
      expect(ext.getProperty(EXT_PORT_SIDE)).toBe(PortSide.EAST)
      expect(ext.getLayerConstraint()).toBe(LayerConstraint.LAST_SEPARATE)
      expect(ext4.getLayerConstraint()).toBe(LayerConstraint.FIRST_SEPARATE)
      expect(ext5.getLayerConstraint()).toBe(LayerConstraint.LAST)
      expect(ext6.getLayerConstraint()).toBe(LayerConstraint.FIRST)
      // 边弯点/标签 mirrorX
      expect(e.getBendPoints()[0]!.x).toBeCloseTo(90 - 1, 6)
      expect(e.getBendPoints()[1]!.x).toBeCloseTo(90 - 3, 6)
      const jps = e.getProperty(JUNCTION_POINTS) as { x: number; y: number }[]
      expect(jps![0]!.x).toBeCloseTo(90 - 5, 6)
      expect(e.getLabels()[0]!.position.x).toBeCloseTo(90 - 9 - 7, 6) // offset - label.size.x - old.x (ELK mirrorX)
      // NODE_LABELS_PADDING left/right 交换
      expect(g.getProperty(NODE_LABELS_PADDING)).toEqual({ top: 1, right: 4, bottom: 3, left: 2 })
    })

    it('DOWN: transpose — 端口侧 N↔W, S↔E; 坐标 (x,y) 交换; 图 offset/size/padding 转置', () => {
      const { g, a, pE, pW, pN, pS, ext, ext2, e } = buildGraph()
      g.setProperty(DIRECTION, Direction.DOWN)
      g.setProperty(DIRECTION_CONGRUENCY, 'READING_DIRECTION')

      new GraphTransformer(TransformMode.TO_INPUT_DIRECTION).process(g)

      expect(pN.getSide()).toBe(PortSide.WEST)
      expect(pW.getSide()).toBe(PortSide.NORTH)
      expect(pS.getSide()).toBe(PortSide.EAST)
      expect(pE.getSide()).toBe(PortSide.SOUTH)
      // UNDEFINED 端口侧转置后保持 UNDEFINED (transposePortSide default)
      expect(a.getPorts().find(p => p.getSide() === PortSide.UNDEFINED)).toBeDefined()
      expect(a.position.x).toBeCloseTo(20, 6)
      expect(a.position.y).toBeCloseTo(10, 6)
      expect(g.getOffset().x).toBeCloseTo(7, 6)
      expect(g.getOffset().y).toBeCloseTo(5, 6)
      expect(g.getSize().x).toBeCloseTo(60, 6)
      expect(g.getSize().y).toBeCloseTo(100, 6)
      expect(g.getPadding()).toEqual({ left: 2, top: 1, right: 4, bottom: 3 })
      // 外部端口 side 转置: WEST→NORTH
      expect(ext.getProperty(EXT_PORT_SIDE)).toBe(PortSide.NORTH)
      // FIRST_SEPARATE → NONE + inLayer TOP (transposeLayerConstraint)
      expect(ext.getLayerConstraint()).toBe(LayerConstraint.NONE)
      expect(ext.getInLayerConstraint()).toBe(InLayerConstraint.TOP)
      // BOTTOM → LAST_SEPARATE + NONE
      expect(ext2.getLayerConstraint()).toBe(LayerConstraint.LAST_SEPARATE)
      expect(ext2.getInLayerConstraint()).toBe(InLayerConstraint.NONE)
      // 边弯点转置 + junction points 转置 + 边标签尺寸转置
      expect(e.getBendPoints()[0]).toEqual({ x: 2, y: 1 })
      expect(e.getBendPoints()[1]).toEqual({ x: 4, y: 3 })
      const jps = e.getProperty(JUNCTION_POINTS) as { x: number; y: number }[]
      expect(jps![0]).toEqual({ x: 6, y: 5 })
      expect(e.getLabels()[0]!.position).toEqual({ x: 8, y: 7 })
      expect(e.getLabels()[0]!.size).toEqual({ x: 10, y: 9 })
      // NODE_LABELS_PADDING 转置
      expect(g.getProperty(NODE_LABELS_PADDING)).toEqual({ top: 4, right: 3, bottom: 2, left: 1 })
    })

    it('UP: 往返恢复 (入=mirrorY+transpose, 出=transpose+mirrorY)', () => {
      const { g } = buildGraph()
      g.setProperty(DIRECTION, Direction.UP)
      g.setProperty(DIRECTION_CONGRUENCY, 'READING_DIRECTION')
      const before = snapshot(g)

      new GraphTransformer(TransformMode.TO_INPUT_DIRECTION).process(g)
      const mid = snapshot(g)
      expect(mid).not.toBe(before)

      new GraphTransformer(TransformMode.TO_INTERNAL_LTR).process(g)
      const after = snapshot(g)
      expect(after).toBe(before)
    })
  })

  describe('ROTATION', () => {
    it('LEFT: mirrorX+mirrorY 往返恢复; N/S 端口侧互换', () => {
      const { g, pN, pS, ext, ext2, ext3, ext4 } = buildGraph()
      g.setProperty(DIRECTION, Direction.LEFT)
      g.setProperty(DIRECTION_CONGRUENCY, 'ROTATION')
      const before = snapshot(g)

      new GraphTransformer(TransformMode.TO_INPUT_DIRECTION).process(g)
      // mirrorX: E↔W; mirrorY: N↔S
      expect(pN.getSide()).toBe(PortSide.SOUTH)
      expect(pS.getSide()).toBe(PortSide.NORTH)
      expect(ext.getProperty(EXT_PORT_SIDE)).toBe(PortSide.EAST)
      expect(ext.getLayerConstraint()).toBe(LayerConstraint.LAST_SEPARATE)
      expect(ext4.getLayerConstraint()).toBe(LayerConstraint.FIRST_SEPARATE)
      // mirrorY: inLayer TOP↔BOTTOM
      expect(ext2.getInLayerConstraint()).toBe(InLayerConstraint.TOP)
      expect(ext3.getInLayerConstraint()).toBe(InLayerConstraint.BOTTOM)

      new GraphTransformer(TransformMode.TO_INTERNAL_LTR).process(g)
      expect(snapshot(g)).toBe(before)
    })

    it('DOWN: 入=mirrorX+transpose, 出=transpose+mirrorX (往返恢复; 中间态端口侧/EXT_PORT_SIDE 显式断言)', () => {
      const { g, pN, pW, pS, pE, ext, ext2 } = buildGraph()
      g.setProperty(DIRECTION, Direction.DOWN)
      g.setProperty(DIRECTION_CONGRUENCY, 'ROTATION')
      const before = snapshot(g)

      new GraphTransformer(TransformMode.TO_INPUT_DIRECTION).process(g)
      // 中间态 (mirrorX+transpose): N→(mirrorX:N)→(transpose:W); W→(E)→(S); S→(S)→(E); E→(W)→(N)
      expect(pN.getSide()).toBe(PortSide.WEST)
      expect(pW.getSide()).toBe(PortSide.SOUTH)
      expect(pS.getSide()).toBe(PortSide.EAST)
      expect(pE.getSide()).toBe(PortSide.NORTH)
      // EXT_PORT_SIDE 同理: WEST→(mirrorX EAST)→(transpose SOUTH)
      expect(ext.getProperty(EXT_PORT_SIDE)).toBe(PortSide.SOUTH)
      expect(ext2.getProperty(EXT_PORT_SIDE)).toBe(PortSide.EAST) // SOUTH→(mirrorX:S)→(transpose:E)
      new GraphTransformer(TransformMode.TO_INTERNAL_LTR).process(g)
      expect(snapshot(g)).toBe(before)
    })

    it('UP: 入=transpose+mirrorX, 出=mirrorX+transpose (往返恢复; 中间态端口侧/EXT_PORT_SIDE 显式断言)', () => {
      const { g, pN, pW, pS, pE, ext, ext2 } = buildGraph()
      g.setProperty(DIRECTION, Direction.UP)
      g.setProperty(DIRECTION_CONGRUENCY, 'ROTATION')
      const before = snapshot(g)

      new GraphTransformer(TransformMode.TO_INPUT_DIRECTION).process(g)
      // 中间态 (transpose+mirrorX): N→(transpose:W)→(mirrorX:E); W→(N)→(N); S→(E)→(W); E→(S)→(S)
      expect(pN.getSide()).toBe(PortSide.EAST)
      expect(pW.getSide()).toBe(PortSide.NORTH)
      expect(pS.getSide()).toBe(PortSide.WEST)
      expect(pE.getSide()).toBe(PortSide.SOUTH)
      expect(ext.getProperty(EXT_PORT_SIDE)).toBe(PortSide.NORTH) // WEST→(transpose:N)→(mirrorX:N)
      expect(ext2.getProperty(EXT_PORT_SIDE)).toBe(PortSide.WEST) // SOUTH→(transpose:E)→(mirrorX:W)
      new GraphTransformer(TransformMode.TO_INTERNAL_LTR).process(g)
      expect(snapshot(g)).toBe(before)
    })
  })

  describe('空图 / 无端口图', () => {
    it('空图: 各方向 process 不抛错且往返保持', () => {
      for (const dir of [Direction.LEFT, Direction.DOWN, Direction.UP]) {
        const g = new LGraph()
        g.setProperty(DIRECTION, dir)
        g.setProperty(DIRECTION_CONGRUENCY, 'READING_DIRECTION')
        const before = snapshot(g)
        new GraphTransformer(TransformMode.TO_INPUT_DIRECTION).process(g)
        new GraphTransformer(TransformMode.TO_INTERNAL_LTR).process(g)
        expect(snapshot(g)).toBe(before)
      }
    })

    it('无端口节点: 节点坐标/尺寸/标签正常变换, 不抛错', () => {
      const g = new LGraph()
      g.setProperty(DIRECTION, Direction.DOWN)
      g.setProperty(DIRECTION_CONGRUENCY, 'READING_DIRECTION')
      g.getSize().x = 100
      g.getSize().y = 60
      const n = new LNode(g)
      n.position = { x: 10, y: 20 }
      n.size = { x: 30, y: 40 }
      n.setLabels([{ text: 'A', position: { x: 2, y: 3 }, size: { x: 8, y: 9 } }])

      new GraphTransformer(TransformMode.TO_INPUT_DIRECTION).process(g)

      expect(n.position.x).toBeCloseTo(20, 6)
      expect(n.position.y).toBeCloseTo(10, 6)
      expect(n.size.x).toBeCloseTo(40, 6)
      expect(n.size.y).toBeCloseTo(30, 6)
      expect(n.getLabels()[0]!.position).toEqual({ x: 3, y: 2 })
      expect(n.getLabels()[0]!.size).toEqual({ x: 9, y: 8 })
      // 往返恢复
      new GraphTransformer(TransformMode.TO_INTERNAL_LTR).process(g)
      expect(n.position.x).toBeCloseTo(10, 6)
      expect(n.position.y).toBeCloseTo(20, 6)
    })
  })

  describe('无变换', () => {
    it('UNDEFINED / RIGHT: 不变换', () => {
      for (const dir of [Direction.UNDEFINED, Direction.RIGHT]) {
        const { g } = buildGraph()
        g.setProperty(DIRECTION, dir)
        g.setProperty(DIRECTION_CONGRUENCY, 'ROTATION')
        const before = snapshot(g)
        new GraphTransformer(TransformMode.TO_INPUT_DIRECTION).process(g)
        new GraphTransformer(TransformMode.TO_INTERNAL_LTR).process(g)
        expect(snapshot(g)).toBe(before)
      }
    })
  })

  describe('offset 计算分支 (graph size = 0)', () => {
    it('mirrorX/mirrorY 从节点计算 offset (size=0); NODE_LABELS_PADDING 未设置时跳过', () => {
      const { g, a } = buildGraph({ size: { x: 0, y: 0 }, labelsPadding: false })
      g.setProperty(DIRECTION, Direction.LEFT)
      g.setProperty(DIRECTION_CONGRUENCY, 'ROTATION')
      // 无 NODE_LABELS_PADDING → mirrorAllX/Y 跳过 padding 处理
      const before = snapshot(g)
      new GraphTransformer(TransformMode.TO_INPUT_DIRECTION).process(g)
      // offset = max(node.position + size + margin.right) - offset.x
      // A: 10+30+3=43, B: 60+20+0=80, ext: 0+10+0=10 → offset=80-5=75
      expect(a.position.x).toBeCloseTo(75 - a.size.x - 10, 6)
      expect(snapshot(g)).not.toBe(before)
    })
  })
})
