/**
 * CommentPostprocessorTest — ELK Java v0.12.0 移植 (LayoutTestRunner 框架).
 * 原文件: test/org.eclipse.elk.alg.layered.test/.../intermediate/CommentPostprocessorTest.java
 * 资源: tests/layered/comment_boxes/**
 * 断言 (@Test(ElkNode), when='layout'): CommentPostprocessor 放置注释框后,
 *   顶部/底部注释相对节点的 spacing 正确、注释间 spacing 正确、且在节点上方/下方居中.
 *
 * ggn 缺口: ggn 未实现 CommentPostprocessor 及 comment 机制 (src 中无任何 comment 处理器 /
 * COMMENT_BOX 属性), 注释框不会被放置 → 断言无法触发 → it.skip, 不伪造通过.
 */
import { describe, expect, it } from 'vitest'
import { resolveModels, limitModels, runAll, summarizeFailures } from './framework/runner.js'
import type { LGraph, LNode } from '../../src/index.js'

const MODELS = limitModels(resolveModels('tests/layered/comment_boxes/**'))

const TOLERANCE = 0.1

/** 对应 Java testSpacings: 检查与节点相连的注释框的 spacing/居中 (Java 已移植语义). */
function checkCommentSpacings(g: LGraph): string[] {
  const problems: string[] = []
  const commentCommentSpacing = g.getProperty<number>('org.eclipse.elk.spacing.commentComment') ?? 0
  const commentNodeSpacing = g.getProperty<number>('org.eclipse.elk.spacing.commentNode') ?? 0

  for (const node of g.getLayerlessNodes()) {
    if (node.getProperty<boolean>('org.eclipse.elk.commentBox')) continue
    const comments = gatherConnectedCommentsSortedByX(node)
    let nextTopX = Number.NaN
    let nextBottomX = Number.NaN
    let topCommentsWidth = 0
    let bottomCommentsWidth = 0
    for (const comment of comments) {
      if (comment.getPosition().y < node.getPosition().y) {
        const expectedY = node.getPosition().y - commentNodeSpacing - comment.getSize().y
        if (Math.abs(expectedY - comment.getPosition().y) >= TOLERANCE) {
          problems.push(`comment ${comment.getId()} 顶部 y=${comment.getPosition().y} 期望 ${expectedY}`)
        }
        if (!Number.isNaN(nextTopX) && Math.abs(nextTopX - comment.getPosition().x) >= TOLERANCE) {
          problems.push(`comment ${comment.getId()} 顶部 x=${comment.getPosition().x} 期望 ${nextTopX}`)
        }
        nextTopX = comment.getPosition().x + comment.getSize().x + commentCommentSpacing
        topCommentsWidth += comment.getSize().x + commentCommentSpacing
      } else {
        const expectedY = node.getPosition().y + node.getSize().y + commentNodeSpacing
        if (Math.abs(expectedY - comment.getPosition().y) >= TOLERANCE) {
          problems.push(`comment ${comment.getId()} 底部 y=${comment.getPosition().y} 期望 ${expectedY}`)
        }
        if (!Number.isNaN(nextBottomX) && Math.abs(nextBottomX - comment.getPosition().x) >= TOLERANCE) {
          problems.push(`comment ${comment.getId()} 底部 x=${comment.getPosition().x} 期望 ${nextBottomX}`)
        }
        nextBottomX = comment.getPosition().x + comment.getSize().x + commentCommentSpacing
        bottomCommentsWidth += comment.getSize().x + commentCommentSpacing
      }
    }
    if (topCommentsWidth > 0) {
      topCommentsWidth -= commentCommentSpacing
      const center = node.getPosition().x + node.getSize().x / 2
      const actualCenter = nextTopX - commentCommentSpacing - topCommentsWidth / 2
      if (Math.abs(center - actualCenter) >= TOLERANCE) {
        problems.push(`node ${node.getId()} 顶部注释未居中: center=${center} actual=${actualCenter}`)
      }
    }
    if (bottomCommentsWidth > 0) {
      bottomCommentsWidth -= commentCommentSpacing
      const center = node.getPosition().x + node.getSize().x / 2
      const actualCenter = nextBottomX - commentCommentSpacing - bottomCommentsWidth / 2
      if (Math.abs(center - actualCenter) >= TOLERANCE) {
        problems.push(`node ${node.getId()} 底部注释未居中: center=${center} actual=${actualCenter}`)
      }
    }
  }
  return problems
}

/** 收集与 node 相连 (入边源/出边目标) 且是 comment box 的节点, 按 x 排序 (Java gatherConnectedCommentsSortedByX). */
function gatherConnectedCommentsSortedByX(node: LNode): LNode[] {
  const comments: LNode[] = []
  for (const e of node.getIncomingEdges()) {
    const src = e.getSource()?.getNode()
    if (src && src.getProperty<boolean>('org.eclipse.elk.commentBox')) comments.push(src)
  }
  for (const e of node.getOutgoingEdges()) {
    const tgt = e.getTarget()?.getNode()
    if (tgt && tgt.getProperty<boolean>('org.eclipse.elk.commentBox')) comments.push(tgt)
  }
  comments.sort((a, b) => a.getPosition().x - b.getPosition().x)
  return comments
}

const LAYOUT_ASSERTS = [
  {
    module: 'layout',
    when: 'layout' as const,
    check: (g: LGraph): string[] => checkCommentSpacings(g),
  },
]

describe('CommentPostprocessorTest (ELK Java 移植, tests/layered/comment_boxes)', () => {
  // ggn 未实现 CommentPostprocessor: 无 comment 处理器/COMMENT_BOX 属性, 注释框不会被放置,
  // Java 的 spacing/居中断言无法触发. 保留完整移植断言, 待 ggn 实现后启用.
  it.skip(`CommentPostprocessor 后置 spacing 断言: 全部 ${MODELS.length} 图 (ggn 未实现 CommentPostprocessor)`, () => {
    const results = runAll(MODELS, LAYOUT_ASSERTS)
    const failed = results.filter(r => r.problems.length > 0 || r.error)
    expect(failed.length, summarizeFailures(results, 'CommentPostprocessor spacing')).toBe(0)
  })
})
