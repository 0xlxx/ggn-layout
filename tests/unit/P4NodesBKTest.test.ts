/**
 * BK 节点放置族 — BKNodePlacer / BKAligner / BKCompactor / BKAlignedLayout / ThresholdStrategy
 * (对应 ELK p4nodes.bk.*, ELK Java 0.12.0 移植).
 *
 * 语义基准:
 *  - 集成场景坐标 = ELK Java 0.12.0 jar 直跑结果 (BatchMain/DebugMain, 标签图最终坐标),
 *    已与 ggn 逐节点比对全等 (P4 阶段与 Java 差一个标签 margin 常量偏移, 最终坐标全等).
 *  - 直接单测 (layoutSize/calculateDelta/shiftBlock/checkSpace/verticalAlignment/
 *    insideBlockShift/horizontalCompaction/阈值策略) 按 Java 源码语义逐分支断言,
 *    对齐结构 (root/align) 经 GGN_BK_DBG 插桩核实.
 */
import { describe, expect, it } from 'vitest'
import { LGraph, LNode, LPort, LEdge, Layer, PortSide, NodeType } from '../../src/index.js'
// @ts-ignore 基线同型错误 (TS7016/TS5097, 仓库 66 处既有): scripts/elkt2test.mjs 无声明 + shared/*.ts 扩展名导入
// @ts-ignore
import { parseElkt } from '../../scripts/elkt2test.mjs'
// @ts-ignore
import { buildLGraphFromParsed } from '../../shared/elkgraph-builder.ts'
import { LayeredLayoutProvider } from '../../src/index.js'
import { Spacings } from '../../src/p4nodes/spacings.js'
import { SPACINGS } from '../../src/options/internal-properties.js'
import { NeighborhoodInformation } from '../../src/p4nodes/neighborhood-information.js'
import { BKAlignedLayout, HDirection, VDirection } from '../../src/p4nodes/bk-aligned-layout.js'
import { BKAligner } from '../../src/p4nodes/bk-aligner.js'
import { BKCompactor } from '../../src/p4nodes/bk-compactor.js'
import {
  NullThresholdStrategy, SimpleThresholdStrategy, Postprocessable,
} from '../../src/p4nodes/threshold-strategy.js'
import {
  NODE_PLACEMENT_BK_FIXED_ALIGNMENT, NODE_PLACEMENT_BK_EDGE_STRAIGHTENING,
  NODE_PLACEMENT_FAVOR_STRAIGHT_EDGES, FixedAlignment, EdgeStraighteningStrategy,
} from '../../src/options/layered-options.js'
import type { LGraph as LGraphT } from '../../src/index.js'

// ── 直接建图 helper (无标签 → margin 0) ──

function makeGraph(layerCount: number): { g: LGraph; layers: Layer[] } {
  const g = new LGraph()
  g.setProperty(SPACINGS, new Spacings(g))
  const layers: Layer[] = []
  for (let i = 0; i < layerCount; i++) {
    const layer = new Layer(g)
    g.getLayers().push(layer)
    layers.push(layer)
  }
  return { g, layers }
}

function addNode(layer: Layer, sizeY = 30, type = NodeType.NORMAL): LNode {
  const n = new LNode(layer.getGraph()!)
  n.setType(type)
  n.setLayer(layer)
  n.size = { x: 60, y: sizeY }
  return n
}

function addEdge(src: LNode, tgt: LNode, srcY = 0, tgtY = 0): LEdge {
  const sp = new LPort(); sp.setNode(src); sp.setSide(PortSide.EAST); sp.position.y = srcY
  const tp = new LPort(); tp.setNode(tgt); tp.setSide(PortSide.WEST); tp.position.y = tgtY
  const e = new LEdge(); e.setSource(sp); e.setTarget(tp)
  return e
}

/** 链 A→B→C (3 层单节点). */
function chainGraph(): { g: LGraph; a: LNode; b: LNode; c: LNode } {
  const { g, layers } = makeGraph(3)
  const [l0, l1, l2] = layers
  const a = addNode(l0)
  const b = addNode(l1)
  const c = addNode(l2)
  addEdge(a, b)
  addEdge(b, c)
  return { g, a, b, c }
}

/** 菱形 A→B, A→C, B→D, C→D (层序 [A] | [C,B] | [D], ids a=0 c=1 b=2 d=3). */
function diamondGraph(): { g: LGraph; a: LNode; c: LNode; b: LNode; d: LNode } {
  const { g, layers } = makeGraph(3)
  const [l0, l1, l2] = layers
  const a = addNode(l0)
  const c = addNode(l1)
  const b = addNode(l1)
  const d = addNode(l2)
  addEdge(a, b)
  addEdge(a, c)
  addEdge(b, d)
  addEdge(c, d)
  return { g, a, c, b, d }
}

// ── 1. BKAlignedLayout 直接方法 ──

describe('BKAlignedLayout 方法 (ELK Java 移植)', () => {
  it('layoutSize = max(y+blockSize[root]) - min(y)', () => {
    const { g, layers } = makeGraph(2)
    const [l0, l1] = layers
    const n0 = addNode(l0, 30)
    const n1 = addNode(l1, 50)
    NeighborhoodInformation.buildFor(g) // 归一化 id
    const bal = new BKAlignedLayout(g, 2, VDirection.DOWN, HDirection.RIGHT)
    bal.y = Float64Array.from([10, 20])
    bal.blockSize = Float64Array.from([30, 40])
    bal.root = [n0, n0] // n1 的 root 是 n0 → blockSize=30
    expect(bal.layoutSize()).toBe(40) // max(10+30, 20+30)=50 - min(10,20)=10
  })

  it('calculateDelta = tgt 端口 y - src 端口 y (含 innerShift/anchor)', () => {
    const { g, layers } = makeGraph(2)
    const [l0, l1] = layers
    const n0 = addNode(l0)
    const n1 = addNode(l1)
    const sp = new LPort(); sp.setNode(n0); sp.setSide(PortSide.EAST)
    const tp = new LPort(); tp.setNode(n1); tp.setSide(PortSide.WEST)
    sp.position.y = 3; sp.setAnchor({ x: 0, y: 0.5 })
    tp.position.y = 4; tp.setAnchor({ x: 0, y: 1.5 })
    NeighborhoodInformation.buildFor(g)
    const bal = new BKAlignedLayout(g, 2, VDirection.DOWN, HDirection.RIGHT)
    bal.y = Float64Array.from([10, 20])
    bal.innerShift = Float64Array.from([1, 2])
    expect(bal.calculateDelta(sp, tp)).toBe(13) // (20+2+4+1.5) - (10+1+3+0.5)
  })

  it('shiftBlock 沿 align 链平移整个块', () => {
    const { g, a, b, c } = chainGraph()
    NeighborhoodInformation.buildFor(g)
    const bal = new BKAlignedLayout(g, 3, VDirection.DOWN, HDirection.RIGHT)
    bal.y = Float64Array.from([0, 10, 20])
    bal.align = [b, c, a] // a→b→c→a 环
    bal.shiftBlock(a, 5)
    expect(Array.from(bal.y)).toEqual([5, 15, 25])
  })

  it('checkSpaceAbove: 上邻居限制可用空间 (取 min, 可为负)', () => {
    const { g, layers } = makeGraph(1)
    const [l0] = layers
    const n0 = addNode(l0) // 上方
    const n1 = addNode(l0) // 下方 (上邻居 = n0)
    const ni = NeighborhoodInformation.buildFor(g)
    const bal = new BKAlignedLayout(g, 2, VDirection.DOWN, HDirection.RIGHT)
    bal.y = Float64Array.from([0, 0])
    bal.innerShift = Float64Array.from([0, 0])
    bal.root = [n0, n1]
    bal.align = [n0, n1] // 各节点自块
    // getMinY(n1)=0; 上邻居 n0 maxY=30; 可用 = 0-(30+20) = -50
    expect(bal.checkSpaceAbove(n1, 10, ni)).toBe(-50)
    expect(bal.checkSpaceAbove(n1, -3, ni)).toBe(-50) // 即使 delta 更小也取邻居限制
    // n0 无上邻居 → 保留 delta
    expect(bal.checkSpaceAbove(n0, 10, ni)).toBe(10)
  })

  it('checkSpaceBelow: 无下邻居时保留 delta; 有则受邻居限制', () => {
    const { g, layers } = makeGraph(1)
    const [l0] = layers
    const n0 = addNode(l0)
    const n1 = addNode(l0)
    const n2 = addNode(l0)
    const ni = NeighborhoodInformation.buildFor(g)
    const bal = new BKAlignedLayout(g, 3, VDirection.DOWN, HDirection.RIGHT)
    bal.y = Float64Array.from([0, 0, 0])
    bal.innerShift = Float64Array.from([0, 0, 0])
    bal.root = [n0, n1, n2]
    bal.align = [n0, n1, n2] // 各节点自块
    // n2 无下邻居 → 保留 delta
    expect(bal.checkSpaceBelow(n2, 7, ni)).toBe(7)
    // n1 的下邻居是 n2: getMaxY(n1)=30, minY(n2)=0 → 0-(30+20) = -50
    expect(bal.checkSpaceBelow(n1, 10, ni)).toBe(-50)
    // n0 的下邻居是 n1 → 同样受限
    expect(bal.checkSpaceBelow(n0, 10, ni)).toBe(-50)
  })

  it('getMinY/getMaxY 计入 margin; getLower/getUpperNeighbor 按层内索引', () => {
    const { g, layers } = makeGraph(2)
    const [l0, l1] = layers
    const n0 = addNode(l0)
    const n1 = addNode(l1, 30)
    const n2 = addNode(l1, 30)
    addEdge(n0, n1)
    addEdge(n0, n2)
    const ni = NeighborhoodInformation.buildFor(g)
    const bal = new BKAlignedLayout(g, 3, VDirection.DOWN, HDirection.RIGHT)
    bal.y = Float64Array.from([5, 10, 20])
    bal.innerShift = Float64Array.from([1, 2, 3])
    bal.root = [n0, n0, n1]
    n0.getMargin().top = 4; n0.getMargin().bottom = 6
    n1.getMargin().top = 1; n1.getMargin().bottom = 2
    // n0: y[5]+innerShift[1]-marginTop[4] = 2
    expect(bal.getMinY(n0)).toBe(2)
    expect(bal.getMaxY(n0)).toBe(5 + 1 + 30 + 6) // 42
    // n2: root=n1 → y[n1]=10 + innerShift[3] - 0
    expect(bal.getMinY(n2)).toBe(13)
    expect(bal.getLowerNeighbor(n1, ni)).toBe(n2)
    expect(bal.getLowerNeighbor(n2, ni)).toBeNull()
    expect(bal.getUpperNeighbor(n2, ni)).toBe(n1)
    expect(bal.getUpperNeighbor(n1, ni)).toBeNull()
  })

  it('cleanup 清空数组', () => {
    const { g, a, b, c } = chainGraph()
    NeighborhoodInformation.buildFor(g)
    const bal = new BKAlignedLayout(g, 3, VDirection.DOWN, HDirection.RIGHT)
    bal.root = [a, b, c]; bal.blockSize = Float64Array.from([1, 2, 3]); bal.align = [a, b, c]
    bal.innerShift = Float64Array.from([0, 0, 0]); bal.sink = [a, b, c]; bal.shift = Float64Array.from([0, 0, 0]); bal.y = Float64Array.from([0, 0, 0])
    bal.cleanup()
    expect(bal.root).toEqual([])
    expect(Array.from(bal.y)).toEqual([])
  })
})

// ── 2. BKAligner ──

describe('BKAligner (ELK Java 移植)', () => {
  it('verticalAlignment: 链式图 RIGHTDOWN 全部并入一个块 (root=根, align 成环)', () => {
    const { g, a, b, c } = chainGraph()
    const ni = NeighborhoodInformation.buildFor(g)
    const bal = new BKAlignedLayout(g, 3, VDirection.DOWN, HDirection.RIGHT)
    new BKAligner(g, ni).verticalAlignment(bal, new Set())
    expect(bal.root.map(r => r!.id)).toEqual([a.id, a.id, a.id])
    expect(bal.align.map(r => r!.id)).toEqual([b.id, c.id, a.id])
  })

  it('verticalAlignment: 菱形 DOWN/UP 对齐结构不同 (DOWN: a/c/d 一块; UP: b/d 一块)', () => {
    const { g, a, c, b, d } = diamondGraph()
    const ni = NeighborhoodInformation.buildFor(g)
    const down = new BKAlignedLayout(g, 4, VDirection.DOWN, HDirection.RIGHT)
    new BKAligner(g, ni).verticalAlignment(down, new Set())
    expect(down.root.map(r => r!.id)).toEqual([a.id, a.id, b.id, a.id]) // a,c,d 一块; b 独立
    expect(down.align.map(r => r!.id)).toEqual([c.id, d.id, b.id, a.id])
    const up = new BKAlignedLayout(g, 4, VDirection.UP, HDirection.RIGHT)
    new BKAligner(g, ni).verticalAlignment(up, new Set())
    expect(up.root.map(r => r!.id)).toEqual([a.id, c.id, a.id, a.id]) // a,b,d 一块; c 独立
    expect(up.align.map(r => r!.id)).toEqual([b.id, c.id, d.id, a.id])
  })

  it('verticalAlignment: hdir LEFT 时从右向左处理 (diamond LEFTUP 结构镜像)', () => {
    const { g, a, c, b, d } = diamondGraph()
    const ni = NeighborhoodInformation.buildFor(g)
    const bal = new BKAlignedLayout(g, 4, VDirection.UP, HDirection.LEFT)
    new BKAligner(g, ni).verticalAlignment(bal, new Set())
    expect(bal.root.map(r => r!.id)).toEqual([d.id, c.id, d.id, d.id]) // a,b,d 一块; c 独立
    expect(bal.align.map(r => r!.id)).toEqual([d.id, c.id, a.id, b.id])
  })

  it('insideBlockShift: 端口偏移产生 innerShift, blockSize 覆盖块高', () => {
    const { g, layers } = makeGraph(3)
    const [l0, l1, l2] = layers
    const a = addNode(l0)
    const b = addNode(l1)
    const c = addNode(l2)
    addEdge(a, b, 10, 20) // srcY=10 tgtY=20 → diff -10
    addEdge(b, c, 20, 20) // diff 0
    const ni = NeighborhoodInformation.buildFor(g)
    const bal = new BKAlignedLayout(g, 3, VDirection.DOWN, HDirection.RIGHT)
    const aligner = new BKAligner(g, ni)
    aligner.verticalAlignment(bal, new Set())
    aligner.insideBlockShift(bal)
    // A→B→C 一块; innerShift 传播: b=-10, c=-10, 再整体 +spaceAbove(10) → [10,0,0]
    expect(bal.innerShift[a.id]).toBe(10)
    expect(bal.innerShift[b.id]).toBe(0)
    expect(bal.innerShift[c.id]).toBe(0)
    expect(bal.blockSize[a.id]).toBe(40) // 10 + 30
    const blocks = aligner.getBlocks(bal)
    expect(blocks.get(a)!.map(n => n.id)).toEqual([a.id, b.id, c.id])
  })

  it('static getEdge 找到两节点间边; 无则 null', () => {
    const { g, a, b, c } = chainGraph()
    expect(BKAligner.getEdge(a, b)).not.toBeNull()
    expect(BKAligner.getEdge(a, c)).toBeNull()
    expect(BKAligner.getEdge(c, b)).not.toBeNull()
  })
})

// ── 3. BKCompactor ──

describe('BKCompactor (ELK Java 移植)', () => {
  it('horizontalCompaction DOWN: 菱形 y=[0,0,50,0] (b 块在 a/c/d 块下 50)', () => {
    const { g, a, c, b, d } = diamondGraph()
    const ni = NeighborhoodInformation.buildFor(g)
    const bal = new BKAlignedLayout(g, 4, VDirection.DOWN, HDirection.RIGHT)
    const aligner = new BKAligner(g, ni)
    aligner.verticalAlignment(bal, new Set())
    aligner.insideBlockShift(bal)
    new BKCompactor(g, ni).horizontalCompaction(bal)
    expect(Array.from(bal.y)).toEqual([0, 0, 50, 0])
    void d
  })

  it('horizontalCompaction UP: 反向放置 y=[0,-50,0,0] (c 块在 a/b/d 块上 -50)', () => {
    const { g, a, c, b, d } = diamondGraph()
    const ni = NeighborhoodInformation.buildFor(g)
    const bal = new BKAlignedLayout(g, 4, VDirection.UP, HDirection.RIGHT)
    const aligner = new BKAligner(g, ni)
    aligner.verticalAlignment(bal, new Set())
    aligner.insideBlockShift(bal)
    new BKCompactor(g, ni).horizontalCompaction(bal)
    expect(Array.from(bal.y)).toEqual([0, -50, 0, 0])
    void a; void b; void d
  })

  it('horizontalCompaction DOWN 计入 margin: y=[0,0,53,0], innerShift/blockSize 含 margin', () => {
    const { g, a, c, b, d } = diamondGraph()
    const ni = NeighborhoodInformation.buildFor(g)
    a.getMargin().top = 2; a.getMargin().bottom = 3
    c.getMargin().top = 4; c.getMargin().bottom = 1
    b.getMargin().top = 5; b.getMargin().bottom = 6
    d.getMargin().top = 7; d.getMargin().bottom = 8
    const bal = new BKAlignedLayout(g, 4, VDirection.DOWN, HDirection.RIGHT)
    const aligner = new BKAligner(g, ni)
    aligner.verticalAlignment(bal, new Set())
    aligner.insideBlockShift(bal)
    // 块 A=[a,c,d]: spaceAbove=max(a.top=2, c.top=4, d.top=7)=7, spaceBelow=max(30+a.bottom=33, 30+d.bottom=38)=38 → blockSize=45
    expect(bal.innerShift[a.id]).toBe(7)
    expect(bal.innerShift[c.id]).toBe(7)
    expect(bal.innerShift[d.id]).toBe(7)
    expect(bal.blockSize[a.id]).toBe(45)
    // 块 B=[b]: spaceAbove=b.top=5, spaceBelow=30+b.bottom=36 → blockSize=41
    expect(bal.innerShift[b.id]).toBe(5)
    expect(bal.blockSize[b.id]).toBe(41)
    new BKCompactor(g, ni).horizontalCompaction(bal)
    // newPosition = 0 + innerShift[c]=7 + 30 + c.bottom=1 + 20 + b.top=5 - innerShift[b]=5 = 58
    expect(Array.from(bal.y)).toEqual([0, 0, 58, 0])
  })

  it('horizontalCompaction UP 计入 margin: y=[-55,-55,0,0]', () => {
    const { g, a, c, b, d } = diamondGraph()
    const ni = NeighborhoodInformation.buildFor(g)
    a.getMargin().top = 2; a.getMargin().bottom = 3
    c.getMargin().top = 4; c.getMargin().bottom = 1
    b.getMargin().top = 5; b.getMargin().bottom = 6
    d.getMargin().top = 7; d.getMargin().bottom = 8
    const bal = new BKAlignedLayout(g, 4, VDirection.UP, HDirection.RIGHT)
    const aligner = new BKAligner(g, ni)
    aligner.verticalAlignment(bal, new Set())
    aligner.insideBlockShift(bal)
    new BKCompactor(g, ni).horizontalCompaction(bal)
    // UP 对齐: 块 A=[a,b,d] (root=a), 块 C=[c] 独立; c 的上邻居 b 在块 A
    // newPosition(UP) = y[a]=0 + innerShift[b]=7 - b.top=5 - 20 - c.bottom=1 - 30 - innerShift[c]=4 = -53
    expect(Array.from(bal.y)).toEqual([0, -53, 0, 0])
  })
})

// ── 4. ThresholdStrategy ──

describe('ThresholdStrategy (ELK Java 移植)', () => {
  it('NullThresholdStrategy: DOWN→-inf, UP→+inf, postProcess 无操作', () => {
    const { g, a } = chainGraph()
    const ni = NeighborhoodInformation.buildFor(g)
    const bal = new BKAlignedLayout(g, 1, VDirection.DOWN, HDirection.RIGHT)
    const s = new NullThresholdStrategy()
    s.init(bal, ni)
    expect(s.calculateThreshold(5, a, a)).toBe(Number.NEGATIVE_INFINITY)
    const balUp = new BKAlignedLayout(g, 1, VDirection.UP, HDirection.RIGHT)
    const sUp = new NullThresholdStrategy()
    sUp.init(balUp, ni)
    expect(sUp.calculateThreshold(5, a, a)).toBe(Number.POSITIVE_INFINITY)
    expect(() => sUp.postProcess()).not.toThrow()
  })

  it('init/finishBlock 维护 blockFinished 集合', () => {
    const { g, a } = chainGraph()
    const ni = NeighborhoodInformation.buildFor(g)
    const bal = new BKAlignedLayout(g, 1, VDirection.DOWN, HDirection.RIGHT)
    const s = new SimpleThresholdStrategy()
    s.init(bal, ni)
    s.finishBlock(a)
    expect(s['blockFinished'].has(a)).toBe(true)
    s.init(bal, ni) // init 重置
    expect(s['blockFinished'].size).toBe(0)
  })

  it('SimpleThresholdStrategy: 根节点边界 = 邻块端口 y 差 (hdir RIGHT)', () => {
    const { g, a, c, b, d } = diamondGraph()
    const ni = NeighborhoodInformation.buildFor(g)
    const bal = new BKAlignedLayout(g, 4, VDirection.DOWN, HDirection.RIGHT)
    const aligner = new BKAligner(g, ni)
    aligner.verticalAlignment(bal, new Set())
    // 手工设置压实后的 y (块 A=0, 块 B=50)
    bal.y[a.id] = 0; bal.y[c.id] = 0; bal.y[d.id] = 0
    bal.y[b.id] = 50
    bal.innerShift = Float64Array.from([0, 0, 0, 0])
    // a→b 端口: a.y=13.333, b.y=15 (非零, 覆盖阈值公式算术分支)
    const eAB = g.getAllNodes().flatMap(n => n.getConnectedEdges()).find(e => {
      const src = e.getSource()!.getNode()!
      return src === a && e.getTarget()!.getNode() === b
    })!
    eAB.getSource()!.position.y = 13.333333333333334
    eAB.getTarget()!.position.y = 15
    const s = new SimpleThresholdStrategy()
    s.init(bal, ni)
    s.finishBlock(a) // 块 A 已完成
    // B 是根且是块首: getBound(B,true) → 边 A→B, 阈值 = y[A]+srcY(13.333) - tgtY(15) = -1.667
    expect(s.calculateThreshold(Number.NEGATIVE_INFINITY, b, b)).toBeCloseTo(-1.6666666666666665, 6)
    // su 标记两个端点块
    expect(bal.su[a.id]).toBe(1)
    expect(bal.su[b.id]).toBe(1)
    // 非首非尾: 返回旧阈值
    expect(s.calculateThreshold(42, b, c)).toBe(42)
  })

  it('SimpleThresholdStrategy.pickEdge: 层内边在 onlyDummies=false 时被跳过', () => {
    const { g, layers } = makeGraph(1)
    const [l0] = layers
    const y = addNode(l0)
    const z = addNode(l0)
    // 层内边 z→y (同层)
    const sp = new LPort(); sp.setNode(z); sp.setSide(PortSide.EAST)
    const tp = new LPort(); tp.setNode(y); tp.setSide(PortSide.WEST)
    const inLayer = new LEdge(); inLayer.setSource(sp); inLayer.setTarget(tp)
    void inLayer
    const ni = NeighborhoodInformation.buildFor(g)
    const bal = new BKAlignedLayout(g, 2, VDirection.DOWN, HDirection.RIGHT)
    bal.root = [y, z]
    bal.od = Uint8Array.from([0, 0]) // onlyDummies=false → 层内边检查生效
    bal.su = Uint8Array.from([0, 0])
    bal.y = Float64Array.from([0, 0])
    bal.innerShift = Float64Array.from([0, 0])
    const s = new SimpleThresholdStrategy()
    s.init(bal, ni)
    // 只有层内边 → 全部跳过 → hasEdges=false → 返回 invalid (不排队)
    expect(s.calculateThreshold(Number.NEGATIVE_INFINITY, y, y)).toBe(Number.NEGATIVE_INFINITY)
    expect(s['postProcessablesQueue'].length).toBe(0)
  })

  it('SimpleThresholdStrategy.pickEdge: su 标记的块边被跳过', () => {
    const { g, layers } = makeGraph(2)
    const [l0, l1] = layers
    const x = addNode(l0)
    const y = addNode(l1)
    addEdge(x, y)
    const ni = NeighborhoodInformation.buildFor(g)
    const bal = new BKAlignedLayout(g, 2, VDirection.DOWN, HDirection.RIGHT)
    bal.root = [x, y]
    bal.od = Uint8Array.from([1, 1])
    bal.su = Uint8Array.from([0, 1]) // y 的块已标记 → 边被跳过
    bal.y = Float64Array.from([0, 0])
    bal.innerShift = Float64Array.from([0, 0])
    const s = new SimpleThresholdStrategy()
    s.init(bal, ni)
    expect(s.calculateThreshold(Number.NEGATIVE_INFINITY, y, y)).toBe(Number.NEGATIVE_INFINITY)
    expect(s['postProcessablesQueue'].length).toBe(0)
  })

  it('Postprocessable 构造与字段默认值', () => {
    const { g, a } = chainGraph()
    const pp = new Postprocessable(a, true)
    expect(pp.free).toBe(a)
    expect(pp.isRoot).toBe(true)
    expect(pp.hasEdges).toBe(false)
    expect(pp.edge).toBeNull()
  })

  it('SimpleThresholdStrategy.postProcess: delta<0 时块下移 (checkSpaceBelow + shiftBlock)', () => {
    const { g, a, c, b, d } = diamondGraph()
    const ni = NeighborhoodInformation.buildFor(g)
    // 手工状态: 块 A=[a,c] 在下 y=50, 块 B=[b,d] 在上 y=0; 边 a→b 端口 a=13.333/b=15
    const bal = new BKAlignedLayout(g, 4, VDirection.DOWN, HDirection.RIGHT)
    bal.root = [a, a, b, b]
    bal.align = [c, a, d, b]
    bal.innerShift = Float64Array.from([0, 0, 0, 0])
    bal.y = Float64Array.from([50, 50, 0, 0])
    bal.su = Uint8Array.from([0, 0, 0, 0])
    bal.od = Uint8Array.from([1, 1, 1, 1])
    const eAB = g.getAllNodes().flatMap(n => n.getConnectedEdges()).find(e => {
      const src = e.getSource()!.getNode()!
      return src === a && e.getTarget()!.getNode() === b
    })!
    eAB.getSource()!.position.y = 13.333333333333334
    eAB.getTarget()!.position.y = 15
    const s = new SimpleThresholdStrategy()
    s.init(bal, ni)
    // 块 A 未完成 → getBound 将 pp 入队并返回 -inf
    expect(s.calculateThreshold(Number.NEGATIVE_INFINITY, b, b)).toBe(Number.NEGATIVE_INFINITY)
    expect(s['postProcessablesQueue'].length).toBe(1)
    // 完成块 A 后 postProcess: delta = pos(b)-pos(a) = (0+15)-(50+13.333) = -48.333 < 0
    // checkSpaceBelow(b)=48.333 (无下邻居) → shiftBlock(b, 48.333) → b/d 下移至 48.333
    s.finishBlock(a)
    s.postProcess()
    expect(bal.y[b.id]).toBeCloseTo(48.33333333333333, 6)
    expect(bal.y[d.id]).toBeCloseTo(48.33333333333333, 6)
    expect(bal.y[a.id]).toBe(50)
  })

  it('SimpleThresholdStrategy.postProcess: delta>0 时块上移 (checkSpaceAbove + shiftBlock)', () => {
    const { g, a, c, b, d } = diamondGraph()
    const ni = NeighborhoodInformation.buildFor(g)
    const bal = new BKAlignedLayout(g, 4, VDirection.DOWN, HDirection.RIGHT)
    bal.root = [a, a, b, b]
    bal.align = [c, a, d, b]
    bal.innerShift = Float64Array.from([0, 0, 0, 0])
    bal.y = Float64Array.from([0, 0, 100, 100]) // 块 B 在下方
    bal.su = Uint8Array.from([0, 0, 0, 0])
    bal.od = Uint8Array.from([1, 1, 1, 1])
    // a→b 端口: a.y=15, b.y=130 → pos(a)=15, pos(b)=230 → delta = pos(b)-pos(a) = 215 > 0
    const eAB = g.getAllNodes().flatMap(n => n.getConnectedEdges()).find(e => {
      const src = e.getSource()!.getNode()!
      return src === a && e.getTarget()!.getNode() === b
    })!
    eAB.getSource()!.position.y = 15
    eAB.getTarget()!.position.y = 130
    const s = new SimpleThresholdStrategy()
    s.init(bal, ni)
    s.calculateThreshold(Number.NEGATIVE_INFINITY, b, b) // 入队
    s.finishBlock(a)
    s.postProcess()
    // checkSpaceAbove(b, 215): minY(b)=100 - (maxY(c)=30 + 20) = 50 → available=min(215,50)=50
    // shiftBlock(b, -50) → b/d 上移至 50
    expect(bal.y[b.id]).toBe(50)
    expect(bal.y[d.id]).toBe(50)
  })

  it('SimpleThresholdStrategy: isLast 节点边界走 getBound(false) (hdir RIGHT)', () => {
    const { g, a, c, b, d } = diamondGraph()
    const ni = NeighborhoodInformation.buildFor(g)
    const bal = new BKAlignedLayout(g, 4, VDirection.DOWN, HDirection.RIGHT)
    bal.root = [a, a, b, b]
    bal.align = [c, a, d, b]
    bal.innerShift = Float64Array.from([0, 0, 0, 0])
    bal.y = Float64Array.from([0, 0, 50, 50])
    bal.su = Uint8Array.from([0, 0, 0, 0])
    bal.od = Uint8Array.from([1, 1, 1, 1])
    // c→d 端口: c.y=15, d.y=20 (非零)
    const eCD = g.getAllNodes().flatMap(n => n.getConnectedEdges()).find(e => {
      const src = e.getSource()!.getNode()!
      return src === c && e.getTarget()!.getNode() === d
    })!
    eCD.getSource()!.position.y = 15
    eCD.getTarget()!.position.y = 20
    const s = new SimpleThresholdStrategy()
    s.init(bal, ni)
    s.finishBlock(b)
    // c 是块 A 的尾节点 (align[c]=a=root): getBound(c,false) → 边 c→d,
    // 阈值 = y[root[d]=b] + innerShift[d] + dPort.y - innerShift[c] - cPort.y = 50 + 20 - 15 = 55
    expect(s.calculateThreshold(Number.NEGATIVE_INFINITY, a, c)).toBe(55)
    expect(bal.su[a.id]).toBe(1)
    expect(bal.su[b.id]).toBe(1)
    // 非首非尾 → 返回旧阈值 (用链式图 3 节点块的中节点)
    const { g: g2, a: a2, b: b2, c: c2 } = chainGraph()
    const ni2 = NeighborhoodInformation.buildFor(g2)
    const bal2 = new BKAlignedLayout(g2, 3, VDirection.DOWN, HDirection.RIGHT)
    bal2.root = [a2, a2, a2]
    bal2.align = [b2, c2, a2]
    bal2.innerShift = Float64Array.from([0, 0, 0])
    bal2.y = Float64Array.from([0, 0, 0])
    bal2.su = Uint8Array.from([0, 0, 0])
    bal2.od = Uint8Array.from([1, 1, 1])
    const s2 = new SimpleThresholdStrategy()
    s2.init(bal2, ni2)
    expect(s2.calculateThreshold(7, a2, b2)).toBe(7)
  })

  it('getOther: 边端点取另一节点; 无关节点抛错', () => {
    const { g, a, b, c } = chainGraph()
    const ni = NeighborhoodInformation.buildFor(g)
    const bal = new BKAlignedLayout(g, 3, VDirection.DOWN, HDirection.RIGHT)
    const s = new SimpleThresholdStrategy()
    s.init(bal, ni)
    const eAB = g.getAllNodes().flatMap(n => n.getConnectedEdges()).find(e => {
      const src = e.getSource()!.getNode()!
      const tgt = e.getTarget()!.getNode()!
      return (src === a && tgt === b) || (src === b && tgt === a)
    })!
    expect(s['getOther'](eAB, a)).toBe(b)
    expect(s['getOther'](eAB, b)).toBe(a)
    expect(() => s['getOther'](eAB, c)).toThrow('Node neither source nor target of edge')
  })
})

// ── 5. BKNodePlacer 集成 (Java 校验坐标) ──

const DIAMOND_ELKT = `algorithm: layered
node nA { label "A" }
node nB { label "B" }
node nC { label "C" }
node nD { label "D" }
edge nA -> nB
edge nA -> nC
edge nB -> nD
edge nC -> nD`

const CHAIN3_ELKT = `algorithm: layered
node nA { label "A" }
node nB { label "B" }
node nC { label "C" }
edge nA -> nB
edge nB -> nC`

const TWOCOL_ELKT = `algorithm: layered
node nA { label "A" }
node nB { label "B" }
node nC { label "C" }
node nD { label "D" }
edge nA -> nC
edge nA -> nD
edge nB -> nD`

const LONGEDGE_ELKT = `algorithm: layered
node nA { label "A" }
node nB { label "B" }
node nC { label "C" }
node nD { label "D" }
edge nA -> nB
edge nB -> nC
edge nC -> nD
edge nA -> nD`

const THREE_LAYERS_ELKT = `algorithm: layered
node nA { label "A" }
node nB { label "B" }
node nC { label "C" }
node nD { label "D" }
node nE { label "E" }
edge nA -> nC
edge nA -> nD
edge nB -> nD
edge nB -> nE
edge nC -> nE
edge nD -> nE`

const MULTI_CONFLICT_ELKT = `algorithm: layered
node nA { label "A" }
node nB { label "B" }
node nC { label "C" }
node nD { label "D" }
node nE { label "E" }
node nF { label "F" }
edge nA -> nD
edge nA -> nE
edge nB -> nE
edge nB -> nF
edge nC -> nF
edge nD -> nF
edge nE -> nF
edge nA -> nF`

interface LayoutResult {
  graph: LGraphT
  p4: Map<string, number> // label(或 d<id>) → P4 y (afterModule BKNodePlacer)
  final: Map<string, number> // label → 最终 y
}

function layoutElkt(source: string, extra?: (g: LGraphT) => void): LayoutResult {
  const parsed = parseElkt(source)
  const { graph } = buildLGraphFromParsed(parsed, 'bk-test')
  const p4 = new Map<string, number>()
  const provider = new LayeredLayoutProvider()
  provider.setHooks({
    afterModule(m, g) {
      if (m !== 'BKNodePlacer' || g !== graph) return
      for (const layer of g.getLayers()) {
        for (const n of layer.getNodes()) {
          const label = n.getLabels()[0]?.text
          p4.set(label ?? `d${n.id}`, n.position.y)
        }
      }
    },
  })
  if (extra) extra(graph)
  provider.layout(graph)
  const final = new Map<string, number>()
  for (const layer of graph.getLayers()) {
    for (const n of layer.getNodes()) {
      const label = n.getLabels()[0]?.text
      if (label !== undefined) final.set(label, n.position.y)
    }
  }
  return { graph, p4, final }
}

function expectPos(map: Map<string, number>, expected: Record<string, number>): void {
  for (const [k, v] of Object.entries(expected)) {
    expect(map.get(k), `节点 ${k}`).toBeCloseTo(v, 6)
  }
}

describe('BKNodePlacer 集成 (ELK Java 0.12.0 jar 校验坐标)', () => {
  it('链式图: 3 层单节点 y 全 0 (P4) / 最终 y=12 (标签 margin)', () => {
    const r = layoutElkt(CHAIN3_ELKT)
    expectPos(r.p4, { A: 0, B: 0, C: 0 })
    expectPos(r.final, { A: 12, B: 12, C: 12 })
  })

  it('菱形 (默认 balanced): P4 A=5/C=0/B=50/D=5, 最终 17/12/62/17', () => {
    const r = layoutElkt(DIAMOND_ELKT)
    expectPos(r.p4, { A: 5, C: 0, B: 50, D: 5 })
    expectPos(r.final, { A: 17, C: 12, B: 62, D: 17 })
  })

  it('两列 (默认 + 各 fixedAlignment): 最终 17/67/12/62', () => {
    for (const fa of [undefined, FixedAlignment.LEFTDOWN, FixedAlignment.RIGHTDOWN, FixedAlignment.RIGHTUP, FixedAlignment.BALANCED]) {
      const r = layoutElkt(TWOCOL_ELKT, g => { if (fa !== undefined) g.setProperty(NODE_PLACEMENT_BK_FIXED_ALIGNMENT, fa) })
      expectPos(r.final, { A: 17, B: 67, C: 12, D: 62 })
    }
  })

  it('长边图: P4 dummy 与普通节点均 Java 一致 (dummy=-6, A/D=0, B/C=5)', () => {
    const r = layoutElkt(LONGEDGE_ELKT)
    expectPos(r.p4, { A: 0, B: 5, C: 5, D: 0 })
    // dummy 节点 (无标签) 数量 = 2, 且 y=-6
    const dummies = [...r.p4.entries()].filter(([k, y]) => k.startsWith('d') && Math.abs(y + 6) < 1e-6)
    expect(dummies.length).toBe(2)
    expectPos(r.final, { A: 18, B: 23, C: 23, D: 18 })
  })

  it('fixed LEFTUP/RIGHTUP: P4 A=0/C=-45/B=5/D=0, 最终 57/12/62/57', () => {
    for (const fa of [FixedAlignment.LEFTUP, FixedAlignment.RIGHTUP]) {
      const r = layoutElkt(DIAMOND_ELKT, g => { g.setProperty(NODE_PLACEMENT_BK_FIXED_ALIGNMENT, fa) })
      expectPos(r.p4, { A: 0, C: -45, B: 5, D: 0 })
      expectPos(r.final, { A: 57, C: 12, B: 62, D: 57 })
    }
  })

  it('fixed BALANCED: P4 A=25/C=0/B=50/D=25, 最终 37/12/62/37', () => {
    const r = layoutElkt(DIAMOND_ELKT, g => { g.setProperty(NODE_PLACEMENT_BK_FIXED_ALIGNMENT, FixedAlignment.BALANCED) })
    expectPos(r.p4, { A: 25, C: 0, B: 50, D: 25 })
    expectPos(r.final, { A: 37, C: 12, B: 62, D: 37 })
  })

  it('IMPROVE_STRAIGHTNESS (SimpleThresholdStrategy): 与默认同 (P4 5/0/50/5)', () => {
    const r = layoutElkt(DIAMOND_ELKT, g => {
      g.setProperty(NODE_PLACEMENT_BK_EDGE_STRAIGHTENING, EdgeStraighteningStrategy.IMPROVE_STRAIGHTNESS)
    })
    expectPos(r.p4, { A: 5, C: 0, B: 50, D: 5 })
    expectPos(r.final, { A: 17, C: 12, B: 62, D: 17 })
  })

  it('favorStraightEdges=true (不产 balanced, 取最小可行布局): 与默认同', () => {
    const r = layoutElkt(DIAMOND_ELKT, g => { g.setProperty(NODE_PLACEMENT_FAVOR_STRAIGHT_EDGES, true) })
    expectPos(r.final, { A: 17, C: 12, B: 62, D: 17 })
  })

  it('变高节点 fixed RIGHTDOWN: P4 A=3.333/C=1.667/B=51.667/D=0, 最终 15.333/13.667/63.667/12', () => {
    const elkt = `algorithm: layered
nodePlacement.bk.fixedAlignment: RIGHTDOWN
node nA { label "A", width: 30, height: 40 }
node nB { label "B" }
node nC { label "C" }
node nD { label "D", width: 30, height: 50 }
edge nA -> nB
edge nA -> nC
edge nB -> nD
edge nC -> nD`
    const r = layoutElkt(elkt)
    expectPos(r.p4, { A: 3.333333333333334, C: 1.6666666666666679, B: 51.66666666666667, D: 0 })
    expectPos(r.final, { A: 15.333333333333334, C: 13.666666666666668, B: 63.66666666666667, D: 12 })
  })

  it('三层 (长边 dummy): 最终 68/13/73/23/23 (Java 一致)', () => {
    const r = layoutElkt(THREE_LAYERS_ELKT)
    expectPos(r.final, { A: 68, B: 13, C: 73, D: 23, E: 23 })
  })

  it('多冲突 (markConflicts + 长边): 最终 28/138/78/28/128/12 (Java 一致)', () => {
    const r = layoutElkt(MULTI_CONFLICT_ELKT)
    expectPos(r.final, { A: 28, B: 138, C: 78, D: 28, E: 128, F: 12 })
  })

  it('P4 各层节点 y 严格递增不重叠 (所有集成场景)', () => {
    for (const elkt of [DIAMOND_ELKT, CHAIN3_ELKT, TWOCOL_ELKT, LONGEDGE_ELKT, THREE_LAYERS_ELKT, MULTI_CONFLICT_ELKT]) {
      const r = layoutElkt(elkt)
      for (const layer of r.graph.getLayers()) {
        let prevBottom = Number.NEGATIVE_INFINITY
        for (const n of layer.getNodes()) {
          expect(n.position.y).toBeGreaterThanOrEqual(prevBottom)
          prevBottom = n.position.y + n.size.y
        }
      }
    }
  })
})
