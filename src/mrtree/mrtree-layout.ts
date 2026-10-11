/*
 * Copyright (c) 2026 GGN contributors.
 * Portions derived from the Eclipse Layout Kernel (ELK), Copyright (c) Kiel University and others.
 *
 * This file is part of ggn-layout, a TypeScript port of ELK v0.12.0.
 * Upstream attribution and source range: see THIRD_PARTY_NOTICES.md.
 *
 * SPDX-License-Identifier: EPL-2.0
 * License text: LICENSES/EPL-2.0.txt.
 */
/**
 * mrtree 布局主入口 — ELK alg.mrtree TreeLayoutProvider + MrTree 0.12.0.
 *
 * TreeLayoutProvider.layout: importGraph → split (连通分量) → 每分量 doLayout →
 *   pack → applyLayout.
 * MrTree.doLayout 管线 (AlgorithmAssembler 按 IntermediateProcessorStrategy
 *   枚举 ordinal 排序; 同 slot 内枚举序执行):
 *   P1  DFSTreeifyer
 *   →   RootProcessor, FanProcessor, LevelProcessor   (P2 前)
 *   P2  NodeOrderer
 *   →   NeighborsProcessor, LevelHeightProcessor      (P3 前)
 *   P3  NodePlacer (Walker)
 *   →   DirectionProcessor, NodePositionProcessor, CompactionProcessor,
 *       LevelCoordinatesProcessor, GraphBoundsProcessor  (P4 前)
 *   P4  EdgeRouter
 *   →   Untreeifyer                                    (P4 后)
 *
 * 输出直接写回 ElkNode JSON (子节点位置 + 容器尺寸 + 边 sections).
 */
import type { ElkNode } from '../api/elk-json.js'
import { ElkGraphImporter } from './elk-graph-importer.js'
import { ComponentsProcessor } from './components-processor.js'
import { dfsTreeifyer } from './p1treeify/dfs-treeifyer.js'
import { nodeOrderer } from './p2order/node-orderer.js'
import { nodePlacer } from './p3place/node-placer.js'
import { edgeRouter } from './p4route/edge-router.js'
import { rootProcessor } from './intermediate/root-processor.js'
import { fanProcessor } from './intermediate/fan-processor.js'
import { levelProcessor } from './intermediate/level-processor.js'
import { neighborsProcessor } from './intermediate/neighbors-processor.js'
import { levelHeightProcessor } from './intermediate/level-height-processor.js'
import { directionProcessor } from './intermediate/direction-processor.js'
import { nodePositionProcessor } from './intermediate/node-position-processor.js'
import { compactionProcessor } from './intermediate/compaction-processor.js'
import { levelCoordinatesProcessor } from './intermediate/level-coordinates-processor.js'
import { graphBoundsProcessor } from './intermediate/graph-bounds-processor.js'
import { untreeifyer } from './intermediate/untreeifyer.js'

/**
 * mrtree 布局 (org.eclipse.elk.mrtree).
 * 直接操作 ElkNode JSON 子图 (children/edges), 输出节点位置 + 边 sections.
 */
export function mrtreeLayout(elkGraph: ElkNode): ElkNode {
  // build tGraph
  const graphImporter = new ElkGraphImporter()
  const tGraph = graphImporter.importGraph(elkGraph)

  // split the input graph into components
  const componentsProcessor = new ComponentsProcessor()
  const components = componentsProcessor.split(tGraph)

  // perform the actual layout on the components
  for (const comp of components) {
    doLayout(comp)
  }

  // pack the components back into one graph
  const packed = componentsProcessor.pack(components)

  // apply the layout results to the original graph
  graphImporter.applyLayout(packed)
  return elkGraph
}

/** MrTree 管线 (AlgorithmAssembler 装配结果, 顺序固定). */
function doLayout(tgraph: ReturnType<ElkGraphImporter['importGraph']>): void {
  // P1: treeification
  dfsTreeifyer(tgraph)
  // before P2 (NodeOrderer config: ROOT/FAN/LEVEL)
  rootProcessor(tgraph)
  fanProcessor(tgraph)
  levelProcessor(tgraph)
  // P2: node ordering
  nodeOrderer(tgraph)
  // before P3 (NodePlacer config: NEIGHBORS/LEVEL_HEIGHT, 枚举序)
  neighborsProcessor(tgraph)
  levelHeightProcessor(tgraph)
  // P3: node placement
  nodePlacer(tgraph)
  // before P4 (NodePlacer: DIRECTION/NODE_POSITION + EdgeRouter: LEVEL_COORDS/COMPACTION/GRAPH_BOUNDS, 枚举序)
  directionProcessor(tgraph)
  nodePositionProcessor(tgraph)
  compactionProcessor(tgraph)
  levelCoordinatesProcessor(tgraph)
  graphBoundsProcessor(tgraph)
  // P4: edge routing
  edgeRouter(tgraph)
  // after P4: detreeify
  untreeifyer(tgraph)
}
