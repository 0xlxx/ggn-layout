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
 * stress / force 布局入口 (ELK alg.force 0.12.0: StressLayoutProvider + ForceLayoutProvider).
 *
 * StressLayoutProvider.layout:
 *   1. 非 interactive → ForceLayoutProvider 先做初始坐标 (NodeMicroLayout + force 迭代);
 *   2. importGraph → FGraph → 分量拆分 → StressMajorization 迭代 → 重组 → applyLayout.
 * ForceLayoutProvider.layout: NodeMicroLayout + force 模型迭代 (Eades / FR) → applyLayout.
 */
import type { ElkNode } from '../api/elk-json.js'
import { JavaRandom } from '../util/java-random.js'
import { FGraph } from './graph.js'
import { ElkGraphImporter } from './elk-graph-importer.js'
import { ComponentsProcessor } from './components-processor.js'
import { StressMajorization } from './stress-majorization.js'
import { createForceModel, AbstractForceModel } from './force-models.js'
import { FORCE_MODEL, RANDOM_SEED, INTERACTIVE, OMIT_NODE_MICRO_LAYOUT, ForceModelStrategy, jsonOpt } from './options.js'
import { RANDOM } from './internal-properties.js'

/** force 内部 RANDOM 属性 (ELK ForceLayoutProvider.setOptions). */
function setOptions(fgraph: FGraph, elkGraph: ElkNode): void {
  const seed = Number(jsonOpt(elkGraph, RANDOM_SEED) ?? 1)
  fgraph.setProperty(RANDOM, seed === 0 ? new JavaRandom() : new JavaRandom(seed))
}

/** NodeMicroLayout (ELK alg.common NodeMicroLayout) — 见 ../common/node-micro-layout.ts.
 * 2026-08-15: 由空壳补齐为完整移植 (对齐 Java ForceLayoutProvider 布局前 NodeMicroLayout.execute:
 * 节点尺寸含 NODE_LABELS 约束、端口/标签微布局). 修复黑盒 + NODE_LABELS 容器尺寸丢失. */
import { nodeMicroLayout } from '../common/node-micro-layout.js'

/** ForceLayoutProvider.layout (stress 初始坐标). */
export function forceLayout(elkGraph: ElkNode): ElkNode {
  if (!(jsonOpt(elkGraph, OMIT_NODE_MICRO_LAYOUT) ?? false)) nodeMicroLayout(elkGraph)

  const importer = new ElkGraphImporter()
  let fgraph = importer.importGraph(elkGraph)
  setOptions(fgraph, elkGraph)

  const model: AbstractForceModel = createForceModel(
    (jsonOpt(elkGraph, FORCE_MODEL) as ForceModelStrategy) ?? ForceModelStrategy.FRUCHTERMAN_REINGOLD,
  )

  const components = new ComponentsProcessor().split(fgraph)
  for (const comp of components) model.layout(comp)
  fgraph = new ComponentsProcessor().recombine(components)

  importer.applyLayout(fgraph)
  return elkGraph
}

/** StressLayoutProvider.layout (org.eclipse.elk.stress). */
export function stressLayout(elkGraph: ElkNode): ElkNode {
  const interactive = jsonOpt(elkGraph, INTERACTIVE) ?? false
  if (!interactive) {
    forceLayout(elkGraph)
  } else if (!(jsonOpt(elkGraph, OMIT_NODE_MICRO_LAYOUT) ?? false)) {
    nodeMicroLayout(elkGraph)
  }

  const importer = new ElkGraphImporter()
  let fgraph = importer.importGraph(elkGraph)
  const components = new ComponentsProcessor().split(fgraph)
  const sm = new StressMajorization()
  for (const subGraph of components) {
    if (subGraph.getNodes().length <= 1) continue
    sm.initialize(subGraph)
    sm.execute()
    for (const label of subGraph.getLabels()) label.refreshPosition()
  }
  fgraph = new ComponentsProcessor().recombine(components)
  importer.applyLayout(fgraph)
  return elkGraph
}
