/**
 * HyperedgeDummyMerger (ELK intermediate.HyperedgeDummyMerger) 语义单元测试.
 * SSOT: ELK Java 0.12.0 HyperedgeDummyMerger.java.
 *
 * 重点回归 (hyperedge_labels 实证): 带标签超边的两个分支 (E2/E3) 共享源端口但 target 不同
 * (各自继续向 N3 的不同端口链). 合并只能靠「同源 + BEFORE_LABEL_DUMMY」分支:
 *   - LONG_EDGE_BEFORE_LABEL_DUMMY=true (LabelDummySwitcher 在 P3 后设置, ELK L609-643) →
 *     与同源 trunk 合并;
 *   - 未设 → 不可合并 (ggn 曾把 HyperedgeDummyMerger 排在 switcher 之前 → 属性未设 →
 *     带标签超边不共享 trunk → label detour 弯点缺失).
 * 管线顺序已修复 (layered-layout-provider.ts: switcher → sideSelector → merger).
 */
import { describe, expect, it } from 'vitest'
import { LGraph, LNode, LPort, LEdge, PortSide, NodeType } from '../../src/index.js'
import { Layer } from '../../src/graph/layer.js'
import { HyperedgeDummyMerger } from '../../src/intermediate/hyperedge-dummy-merger.js'
import {
  LONG_EDGE_SOURCE, LONG_EDGE_TARGET, LONG_EDGE_HAS_LABEL_DUMMIES, LONG_EDGE_BEFORE_LABEL_DUMMY,
} from '../../src/options/internal-properties.js'

function makeLayer(g: LGraph): Layer {
  const l = new Layer(g)
  g.getLayers().push(l) // Layer 构造器不自动加入 graph, 需显式 add (ELK 同)
  return l
}

function makePort(node: LNode, side: PortSide): LPort {
  const p = new LPort()
  p.setNode(node)
  p.setSide(side)
  return p
}

/**
 * 建「共享源、不同 target」的两条 LONG_EDGE dummy (hyperedge_labels E2/E3 第一段的真实形态):
 *   srcPort → dummy.WEST; dummy.EAST → 各自独立 target 端口.
 */
function buildSharedSourceDifferentTargets(graph: LGraph, layer: Layer,
  opts: Array<{ hasLabel: boolean; before: boolean }>): LNode[] {
  const srcNode = new LNode(graph)
  srcNode.setLayer(layer) // 源节点也入层: identifyHyperedges 只收集层内节点端口
  const srcPort = makePort(srcNode, PortSide.EAST)

  const dummies = opts.map(() => {
    const n = new LNode(graph)
    n.setType(NodeType.LONG_EDGE)
    n.setLayer(layer)
    const west = makePort(n, PortSide.WEST)
    const east = makePort(n, PortSide.EAST)
    const inE = new LEdge()
    inE.setSource(srcPort)
    inE.setTarget(west)
    return n
  })
  // 每个 dummy 一个独立 target 端口 + 出边
  opts.forEach(({ hasLabel, before }, i) => {
    const tgtNode = new LNode(graph)
    tgtNode.setLayer(layer)
    const tgtPort = makePort(tgtNode, PortSide.WEST)
    const n = dummies[i]!
    n.setProperty(LONG_EDGE_SOURCE, srcPort)
    n.setProperty(LONG_EDGE_TARGET, tgtPort)
    n.setProperty(LONG_EDGE_HAS_LABEL_DUMMIES, hasLabel)
    n.setProperty(LONG_EDGE_BEFORE_LABEL_DUMMY, before)
    const outE = new LEdge()
    outE.setSource(n.getPorts(PortSide.EAST)[0]!)
    outE.setTarget(tgtPort)
  })
  return dummies
}

function longEdgeCount(layer: Layer): number {
  return layer.getNodes().filter(n => n.getType() === NodeType.LONG_EDGE).length
}

describe('HyperedgeDummyMerger (ELK Java 移植)', () => {
  it('回归: 带标签分支 dummy (BEFORE_LABEL_DUMMY=true) 与同源 trunk 合并 (不同 target 也合并)', () => {
    const graph = new LGraph()
    const layer = makeLayer(graph)
    buildSharedSourceDifferentTargets(graph, layer, [
      { hasLabel: false, before: false }, // E3 无标签
      { hasLabel: true, before: true },   // E2 标签分支, 在标签之前 → 同源可合并
    ])
    new HyperedgeDummyMerger().process(graph)
    expect(longEdgeCount(layer)).toBe(1)
  })

  it('回归: 带标签分支 dummy 未设 BEFORE_LABEL_DUMMY → 不同 target 无法合并 (管线顺序 bug 的语义)', () => {
    const graph = new LGraph()
    const layer = makeLayer(graph)
    buildSharedSourceDifferentTargets(graph, layer, [
      { hasLabel: false, before: false },
      { hasLabel: true, before: false }, // BEFORE=false (switcher 未运行) → 同源不可合并
    ])
    new HyperedgeDummyMerger().process(graph)
    expect(longEdgeCount(layer)).toBe(2)
  })

  it('无标签同源不同 target: 端口 id 相同 (同超边) → 合并', () => {
    const graph = new LGraph()
    const layer = makeLayer(graph)
    buildSharedSourceDifferentTargets(graph, layer, [
      { hasLabel: false, before: false },
      { hasLabel: false, before: false },
    ])
    new HyperedgeDummyMerger().process(graph)
    expect(longEdgeCount(layer)).toBe(1)
  })

  it('同 target 的带标签分支 (BEFORE=false) → 按 target 合并 (ELK eligibleForTargetMerging)', () => {
    const graph = new LGraph()
    const layer = makeLayer(graph)
    // 同 target: 两条 dummy 都指向同一 target 端口
    const srcNode = new LNode(graph)
    srcNode.setLayer(layer)
    const srcPort = makePort(srcNode, PortSide.EAST)
    const tgtNode = new LNode(graph)
    tgtNode.setLayer(layer)
    const tgtPort = makePort(tgtNode, PortSide.WEST)
    const dummies = [
      { hasLabel: false, before: false },
      { hasLabel: true, before: false },
    ].map(({ hasLabel, before }) => {
      const n = new LNode(graph)
      n.setType(NodeType.LONG_EDGE)
      n.setLayer(layer)
      const west = makePort(n, PortSide.WEST)
      const east = makePort(n, PortSide.EAST)
      n.setProperty(LONG_EDGE_SOURCE, srcPort)
      n.setProperty(LONG_EDGE_TARGET, tgtPort)
      n.setProperty(LONG_EDGE_HAS_LABEL_DUMMIES, hasLabel)
      n.setProperty(LONG_EDGE_BEFORE_LABEL_DUMMY, before)
      const inE = new LEdge(); inE.setSource(srcPort); inE.setTarget(west)
      const outE = new LEdge(); outE.setSource(east); outE.setTarget(tgtPort)
      return n
    })
    void dummies
    new HyperedgeDummyMerger().process(graph)
    expect(longEdgeCount(layer)).toBe(1)
  })
})
