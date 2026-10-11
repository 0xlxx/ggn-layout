/**
 * 边标签行为 + 节点标签行为 (NodeLabelPlacer) — 直接 vitest BDD (由 labels.feature 迁移).
 */
import { describe, it, expect } from 'vitest'
import { Harness, expectEdgeLabelFinite, expectEdgeLabelSizes, expectNoOverlap, worldPosNode } from './bdd-helpers.js'

describe('边标签行为', () => {
  it('CENTER 边标签被放置且坐标有限', () => {
    const h = new Harness().node('A', 'B').edgeWithLabel('A→B', 'CENTER').layout()
    expectEdgeLabelFinite(h)
    expectEdgeLabelSizes(h)
  })

  it.each(['HEAD', 'TAIL'])('HEAD/TAIL 端标签被放置: %s', (placement) => {
    const h = new Harness().node('A', 'B').edgeWithLabel('A→B', placement).layout()
    expectEdgeLabelFinite(h)
    expectEdgeLabelSizes(h)
  })

  it('带标签的边布局后节点不重叠', () => {
    const h = new Harness().node('A', 'B', 'C')
      .edgeWithLabel('A→B', 'CENTER')
      .edgeWithLabel('B→C', 'TAIL')
      .layout()
    expectNoOverlap(h)
  })
})

// ── 节点标签 (NodeLabelPlacer) ──

/** 给节点加标签 (默认 50x14, 对应 ELK label 盒). */
function withNodeLabel(h: Harness, name: string, text: string, placement?: string,
  size = { x: 50, y: 14 }): Harness {
  const n = h.nodes.get(name)!
  n.getLabels().push({ text, position: { x: 0, y: 0 }, size, placement })
  return h
}

/** 标签世界坐标盒 (节点世界坐标 + label 相对位置). */
function labelWorldBox(h: Harness, name: string): { x: number; y: number; w: number; h: number } {
  const n = h.nodes.get(name)!
  const l = n.getLabels()[0]!
  const p = worldPosNode(n)
  return { x: p.x + l.position.x, y: p.y + l.position.y, w: l.size.x, h: l.size.y }
}

describe('节点标签行为 (NodeLabelPlacer)', () => {
  it('OUTSIDE V_TOP label 放节点外上方: y = -labelH - nodeLabelSpacing, x 水平居中', () => {
    const h = withNodeLabel(new Harness().node('A'), 'A', 'L', 'OUTSIDE V_TOP H_CENTER').layout()
    const n = h.nodes.get('A')!
    const l = n.getLabels()[0]!
    // 节点 60x30, label 50x14, nodeLabelSpacing 默认 5 (ELK SPACING_LABEL_NODE).
    expect(l.position.y).toBe(-14 - 5)
    expect(l.position.x).toBe((60 - 50) / 2)
  })

  it('OUTSIDE V_TOP margin.top 生效: labelH + nodeLabelSpacing', () => {
    const h = withNodeLabel(new Harness().node('A'), 'A', 'L', 'OUTSIDE V_TOP H_CENTER').layout()
    expect(h.nodes.get('A')!.getMargin().top).toBe(14 + 5)
  })

  it('OUTSIDE V_TOP 布局后 label 仍完全在节点外且节点无重叠', () => {
    const h = withNodeLabel(new Harness().node('A', 'B').edge('A→B'), 'A', 'L', 'OUTSIDE V_TOP H_CENTER').layout()
    const n = h.nodes.get('A')!
    const np = worldPosNode(n)
    const box = labelWorldBox(h, 'A')
    expect(box.y + box.h).toBeLessThanOrEqual(np.y - 5 + 1e-6)
    expectNoOverlap(h)
  })

  it('OUTSIDE V_BOTTOM label 放节点下方: y = nodeH + nodeLabelSpacing, margin.bottom 生效', () => {
    const h = withNodeLabel(new Harness().node('A'), 'A', 'L', 'OUTSIDE V_BOTTOM H_CENTER').layout()
    const n = h.nodes.get('A')!
    expect(n.getLabels()[0]!.position.y).toBe(30 + 5)
    expect(n.getMargin().bottom).toBe(14 + 5)
  })

  it('OUTSIDE H_PRIORITY H_LEFT label 放节点左侧: x = -labelW - spacing, margin.left 生效', () => {
    const h = withNodeLabel(new Harness().node('A'), 'A', 'L', 'OUTSIDE H_PRIORITY H_LEFT V_TOP').layout()
    const n = h.nodes.get('A')!
    expect(n.getLabels()[0]!.position.x).toBe(-50 - 5)
    expect(n.getMargin().left).toBe(50 + 5)
  })

  it('图级 SPACING_LABEL_NODE 生效于 margin (ELK melk targets parents, jar 实证)', () => {
    const h = new Harness().node('A')
    h.root.setProperty('org.eclipse.elk.spacing.labelNode', 12)
    withNodeLabel(h, 'A', 'L', 'OUTSIDE V_TOP H_CENTER').layout()
    const n = h.nodes.get('A')!
    // margin 在 P3 计算 (NodeMarginCalculator): 图级 12 → margin.top = 14 + 12.
    expect(n.getMargin().top).toBe(14 + 12)
    // label 最终位置由布局后重放决定 (layered-layout-provider recenterNodeLabelsRecursive,
    // 节点级解析; 图级 labelNode 在该处未回退 — 既有行为, 不在本簇 scope).
    const box = labelWorldBox(h, 'A')
    expect(box.y + box.h).toBeLessThanOrEqual(worldPosNode(n).y - 1 + 1e-6)
  })

  it('节点级 SPACING_LABEL_NODE 全链路生效: label 位置与 margin 同步', () => {
    const h = new Harness().node('A')
    h.nodes.get('A')!.setProperty('org.eclipse.elk.spacing.labelNode', 12)
    withNodeLabel(h, 'A', 'L', 'OUTSIDE V_TOP H_CENTER').layout()
    const n = h.nodes.get('A')!
    expect(n.getLabels()[0]!.position.y).toBe(-14 - 12)
    expect(n.getMargin().top).toBe(14 + 12)
  })
})

