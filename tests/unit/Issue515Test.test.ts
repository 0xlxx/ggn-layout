/**
 * Issue515Test — ELK Java v0.12.0 移植 (LayoutTestRunner 框架).
 * 原文件: .../issues/Issue515Test.java
 * 资源: tickets/layered/515*.elkt
 * 断言 (@Test, when='layout'): 边路径任一段不与任何节点盒相交.
 */
import { describe, expect, it } from 'vitest'
import { resolveModels, limitModels, runAll, summarizeFailures } from './framework/runner.js'
import { allEdgeRoutes } from './framework/orthogonal.js'
import { allNodes, absolutePos } from './framework/graph-utils.js'
import type { LGraph } from '../../src/index.js'

const MODELS = limitModels(resolveModels('tickets/layered/**/*.elkt').filter(f => /\/515.+\.elkt$/.test(f)))

/** ELK DoubleMath.fuzzyEquals: |a - b| <= tolerance. */
function fuzzyEquals(a: number, b: number, tol: number): boolean {
  return Math.abs(a - b) <= tol
}

/** ELK DoubleMath.fuzzyCompare: a < b - tol → -1; a > b + tol → 1; 否则 0. */
function fuzzyCompare(a: number, b: number, tol: number): number {
  if (a < b - tol) return -1
  if (a > b + tol) return 1
  return 0
}

/** 两条线段是否相交 (对应 ELK ElkMath.intersects(l11,l12,l21,l22)); "touching" (端点落在线上) 不算. */
function segIntersects(ax1: number, ay1: number, ax2: number, ay2: number,
  bx1: number, by1: number, bx2: number, by2: number): boolean {
  const u0x = ax1, u0y = ay1
  const v0x = ax2 - ax1, v0y = ay2 - ay1
  const u1x = bx1, u1y = by1
  const v1x = bx2 - bx1, v1y = by2 - by1
  const d = v1x * v0y - v0x * v1y
  if (fuzzyEquals(0, d, 1e-5)) return false
  const s = (1 / d) * ((u0x - u1x) * v0y - (u0y - u1y) * v0x)
  const t = (1 / d) * -(-(u0x - u1x) * v1y + (u0y - u1y) * v1x)
  return fuzzyCompare(0, s, 1e-5) < 0 && fuzzyCompare(s, 1, 1e-5) < 0
    && fuzzyCompare(0, t, 1e-5) < 0 && fuzzyCompare(t, 1, 1e-5) < 0
}

/** 线段与轴对齐矩形相交 (对应 ELK ElkMath.intersects(rect, p1, p2)). */
function segmentIntersectsRect(x1: number, y1: number, x2: number, y2: number, r: { x: number; y: number; w: number; h: number }): boolean {
  const rx0 = r.x, rx1 = r.x + r.w, ry0 = r.y, ry1 = r.y + r.h
  const inside = (px: number, py: number) => px > rx0 && px < rx1 && py > ry0 && py < ry1
  // 两点都在矩形内部 (严格, 边界算 outside) → 不假设相交
  if (inside(x1, y1) && inside(x2, y2)) return false
  // 线段与矩形 4 条边相交
  return segIntersects(rx0, ry0, rx1, ry0, x1, y1, x2, y2)  // top
    || segIntersects(rx1, ry0, rx1, ry1, x1, y1, x2, y2)    // right
    || segIntersects(rx1, ry1, rx0, ry1, x1, y1, x2, y2)    // bottom
    || segIntersects(rx0, ry1, rx0, ry0, x1, y1, x2, y2)    // left
}

const LAYOUT_ASSERTS = [
  {
    module: 'layout',
    when: 'layout' as const,
    check: (g: LGraph): string[] => {
      const problems: string[] = []
      // Java @Test(ElkNode) 检查根图 children (输出图, dummy 已移除); TS 内部 LGraph 保留
      // LONG_EDGE/EXTERNAL_PORT 等 dummy → 只统计 NORMAL 叶子节点.
      const boxes = [...allNodes(g)].filter(({ node }) => !node.getNestedGraph() && node.getType() === 'NORMAL').map(({ node, parents }) => {
        const p = absolutePos(node, parents)
        return { x: p.x, y: p.y, w: node.size.x, h: node.size.y }
      })
      for (const { id, pts } of allEdgeRoutes(g)) {
        for (let i = 1; i < pts.length; i++) {
          const a = pts[i - 1]!, b = pts[i]!
          for (const box of boxes) {
            if (segmentIntersectsRect(a.x, a.y, b.x, b.y, box)) {
              problems.push(`edge ${id} 段 (${a.x},${a.y})->(${b.x},${b.y}) 与节点盒 (${box.x},${box.y}) ${box.w}x${box.h} 相交`)
            }
          }
        }
      }
      return problems
    },
  },
]

describe('Issue515Test (ELK Java 移植)', () => {
  it(`边不与节点盒相交: ${MODELS.length} 图`, () => {
    const results = runAll(MODELS, LAYOUT_ASSERTS)
    const failed = results.filter(r => r.problems.length > 0 || r.error)
    const msg = summarizeFailures(results, 'Issue515 边-节点相交')
    expect(failed.length, msg).toBe(0)
  })
})
