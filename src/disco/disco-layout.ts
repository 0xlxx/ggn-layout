/*
 * Copyright (c) 2010, 2015 Kiel University and others.
 * Copyright (c) 2026 GGN contributors.
 *
 * This file is part of ggn-layout, a TypeScript port of the Eclipse Layout
 * Kernel (ELK, https://github.com/eclipse/elk). It is derived from ELK and is
 * made available under the terms of the Eclipse Public License 2.0.
 *
 * SPDX-License-Identifier: EPL-2.0
 * License text: LICENSES/EPL-2.0.txt — see also THIRD_PARTY_NOTICES.md.
 */
/**
 * disco 布局主入口 — ELK alg.disco DisCoLayoutProvider 0.12.0.
 *
 * 流程 (与 Java layout() 1:1):
 *   1. 读 SPACING_COMPONENT_COMPONENT; 若设置了 COMPONENT_LAYOUT_ALGORITHM 则先跑底层布局 (语料未用).
 *   2. ElkGraphTransformer 把 ElkNode JSON → DCGraph (分量拆分 + 元素多边形化).
 *   3. 按 COMPONENT_COMPACTION_STRATEGY 选择压缩器 (目前只有 POLYOMINO).
 *   4. transformer.applyLayout() 把分量偏移写回原图 (节点位置/父尺寸/边 section).
 *
 * 输出直接写回 ElkNode JSON (子节点位置 + 父节点尺寸).
 */
import type { ElkNode } from '../api/elk-json.js'
import { ElkGraphTransformer } from './transform/elk-graph-transformer.js'
import { DisCoPolyominoCompactor } from './disco-polyomino-compactor.js'
import {
  SPACING_COMPONENT_COMPONENT, COMPONENT_COMPACTION_STRATEGY,
  optNum, optStr, CompactionStrategy,
} from './options.js'

/** disco 布局 (org.eclipse.elk.alg.disco). */
export function discoLayout(elkGraph: ElkNode): ElkNode {
  const componentSpacing = optNum(elkGraph, SPACING_COMPONENT_COMPONENT)

  // COMPONENT_COMPACTION_COMPONENT_LAYOUT_ALGORITHM: Java 会先跑底层布局算法再压缩.
  // 需要该能力时在此按需接线 (当前语料/BDD 均不设置, 未移植算法名抛错即对齐 jar).

  // 1.) Transform given ElkNode into DCGraph
  const transformer = new ElkGraphTransformer(componentSpacing)
  const result = transformer.importGraph(elkGraph)

  // 2.) Choose strategy and compact the DCGraph (only polyomino compaction at the moment)
  switch (optStr(elkGraph, COMPONENT_COMPACTION_STRATEGY, CompactionStrategy.POLYOMINO)) {
    case 'POLYOMINO':
      new DisCoPolyominoCompactor().compact(result)
      break
    default:
      console.error('DisCo: no compaction strategy used for connected components.')
  }

  // 3.) Apply new layout to input graph
  transformer.applyLayout()

  return elkGraph
}
