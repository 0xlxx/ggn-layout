/**
 * 图遍历/断言通用工具 (对应 ELK alg.test GraphTestUtils 的常用部分).
 */
import type { LGraph, LNode } from '../../../src/index.js'

/** 遍历层级内所有节点 (含嵌套图), 回调父节点链用于绝对坐标计算. */
export function* allNodes(g: LGraph): Generator<{ node: LNode; parents: LNode[] }> {
  const stack: { graph: LGraph; parents: LNode[] }[] = [{ graph: g, parents: [] }]
  while (stack.length > 0) {
    const { graph, parents } = stack.pop()!
    for (const n of graph.getAllNodes()) {
      yield { node: n, parents }
      if (n.getNestedGraph()) stack.push({ graph: n.getNestedGraph()!, parents: [...parents, n] })
    }
  }
}

/** 节点绝对坐标 (含父偏移). */
export function absolutePos(n: LNode, parents: LNode[]): { x: number; y: number } {
  let x = n.position.x
  let y = n.position.y
  for (const p of parents) {
    x += p.position.x
    y += p.position.y
  }
  return { x, y }
}

/** 检查同一节点同侧端口矩形是否重叠 (绝对坐标). */
export function checkPortOverlaps(node: LNode, parents: LNode[]): string[] {
  const problems: string[] = []
  const origin = absolutePos(node, parents)
  const rects: { side: string; r: { x0: number; y0: number; x1: number; y1: number } }[] = []
  for (const p of node.getPorts()) {
    // 层级外部端口 (side=UNDEFINED, 属于父图坐标系) 跳过: 其最终位置在父图边界,
    // 由 HierarchicalPortPositionProcessor 投影, 不在子图节点边框上.
    if (p.getSide() === undefined || String(p.getSide()) === 'UNDEFINED') continue
    const px = origin.x + p.getPosition().x
    const py = origin.y + p.getPosition().y
    rects.push({
      side: String(p.getSide()),
      r: { x0: px, y0: py, x1: px + p.size.x, y1: py + p.size.y },
    })
  }
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i]!, b = rects[j]!
      if (a.side !== b.side) continue
      if (a.r.x0 < b.r.x1 && b.r.x0 < a.r.x1 && a.r.y0 < b.r.y1 && b.r.y0 < a.r.y1) {
        problems.push(`node ${node.id}: 同侧 ${a.side} 端口重叠 (${a.r.x0},${a.r.y0})-(${a.r.x1},${a.r.y1}) vs (${b.r.x0},${b.r.y0})-(${b.r.x1},${b.r.y1})`)
      }
    }
  }
  return problems
}

/** 检查层级节点 (有子图) 的标签完全包含在节点内 (对应 Issue316 ensureNodesBigEnoughForLabels). */
export function checkLabelsInsideNode(node: LNode): string[] {
  const problems: string[] = []
  if (!node.getNestedGraph()) return problems
  for (const label of node.getLabels()) {
    const x = label.position.x
    const y = label.position.y
    if (x < 0 || y < 0 || x + label.size.x > node.size.x || y + label.size.y > node.size.y) {
      problems.push(`node ${node.id} 标签 (${x},${y}) ${label.size.x}x${label.size.y} 超出节点 ${node.size.x}x${node.size.y}`)
    }
  }
  return problems
}
