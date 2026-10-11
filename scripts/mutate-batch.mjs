#!/usr/bin/env node
/**
 * 分批变异测试 (分而治之, 降低 CPU/时长占用).
 *
 * 用法:
 *   bun run scripts/mutate-batch.mjs <batch> [--concurrency N] [--dry]
 *   bun run scripts/mutate-batch.mjs list
 *
 * 每个 batch = 一个模块族 (对应 writer 子代理的分工). 只变异该族文件,
 * 且只跑该族相关测试 → 变异体数/时长大幅下降, CPU 占用可控.
 *
 * 流程 (用户 2026-08-08 定):
 *   writer 写完一批测试 → 跑该批变异 → 幸存变异体反馈 writer 补测 → 下一批.
 *   变异杀灭率 = 该批测试的"语义验证程度" (比行覆盖率更严格).
 *
 * 底层: stryker run stryker.config.mjs --mutate <globs> --testFiles <globs> --concurrency N
 * 增量: --incremental --incrementalFile /tmp/mutate-<batch>-incr.json (二次运行只测变更变异体)
 */
import { execSync } from 'node:child_process'

// 批次定义: batch → { mutate: string[] (逗号分隔传给 --mutate), tests: string[] (逗号分隔传给 --testFiles) }
// testFiles 匹配 tests/unit/ 下相关测试 (用 glob 简写: 相对 tests/ 目录).
const BATCHES = {  p2layers: {
    mutate: ['src/p2layers/**/*.ts'],
    tests: ['ModelOrderLayerAssignmentTest.test.ts', 'tests/bdd/layerers.scenarios.test.ts', 'P2LayerersKillTest.test.ts'],
  },
  p4nodes: {
    mutate: ['src/p4nodes/**/*.ts'],
    tests: ['tests/bdd/linear-segments.scenarios.test.ts', 'tests/bdd/core-layout.scenarios.test.ts', 'NetworkSimplexPlacerTest.test.ts',
      'P4NodesBKTest.test.ts', 'P4NodesSimpleInteractiveTest.test.ts', 'P4NodesNeighborhoodSpacingsTest.test.ts'],
  },
  labels: {
    mutate: ['src/intermediate/labels/**/*.ts', 'src/intermediate/label-*.ts', 'src/intermediate/node-margin-calculator.ts', 'src/intermediate/cell-system.ts'],
    tests: ['LabelAndNodeSizeProcessorOffsetTest.test.ts', 'LabelDummyRemoverTest.test.ts', 'EndLabelSorterTest.test.ts',
      'tests/bdd/labels.scenarios.test.ts', 'tests/bdd/port-labels.scenarios.test.ts', 'tests/bdd/cell-system.scenarios.test.ts',
      'labels-kill-node-label-placer.test.ts', 'labels-kill-label-cell.test.ts', 'labels-kill-end-label-postprocessor.test.ts',
      'labels-kill-end-label-sorter.test.ts', 'labels-kill-rectangle-strip.test.ts', 'labels-kill-label-dummy.test.ts',
      'labels-kill-label-side-selector.test.ts', 'labels-kill-end-label-preprocessor.test.ts',
      'labels-kill-label-and-node-size.test.ts', 'labels-kill-label-dummy-switcher.test.ts',
      'labels-kill-cell-system.test.ts'],
  },
  components: {
    mutate: ['src/components/**/*.ts'],
    tests: ['ComponentGroupTest.test.ts', 'tests/bdd/components-strategies.scenarios.test.ts'],
  },
  compound: {
    mutate: ['src/compound/**/*.ts'],
    tests: ['HierarchicalEdgeRoutingTest.test.ts', 'tests/bdd/compound-ports.scenarios.test.ts',
      'CrossHierarchyEdgeTest.test.ts', 'CompoundGraphPreprocessorTest.test.ts', 'CompoundGraphPostprocessorTest.test.ts'],
  },
  splines: {
    mutate: ['src/p5edges/splines/**/*.ts'],
    tests: ['NubsSelfLoopTest.test.ts', 'SelfLoopNubSplineTest.test.ts', 'NubSplineP5Test.test.ts',
      'SplinesMathTest.test.ts', 'SplineSegmentTest.test.ts', 'SplineEdgeRouterTest.test.ts',
      'tests/bdd/spline-selfloop.scenarios.test.ts'],
  },
  orthogonal: {
    mutate: ['src/p5edges/orthogonal/**/*.ts', 'src/p5edges/orthogonal-edge-router.ts'],
    tests: ['OrthogonalEdgeRoutingBendPointsTest.test.ts', 'HyperEdgeSegmentTest.test.ts', 'HyperEdgeSegmentDependencyTest.test.ts',
      'HyperEdgeSegmentSplitterTest.test.ts', 'HyperEdgeCycleDetectorTest.test.ts', 'OrthogonalRoutingGeneratorTest.test.ts',
      'OrthogonalEdgeRouterTest.test.ts', 'tests/bdd/orthogonal-routing.scenarios.test.ts'],
  },
  cell: {
    mutate: ['src/intermediate/cell-system.ts'],
    tests: ['LabelAndNodeSizeProcessorOffsetTest.test.ts', 'CellSystemPlacementTest.test.ts',
      'tests/bdd/cell-system.scenarios.test.ts', 'tests/bdd/port-labels.scenarios.test.ts'],
  },
  api: {
    mutate: ['src/api/**/*.ts', 'shared/elkgraph-builder.ts'],
    tests: ['tests/bdd/parser-scenarios.test.ts', 'tests/bdd/core-layout.scenarios.test.ts', 'tests/bdd/core-providers.scenarios.test.ts', 'tests/api/**/*.test.ts'],
  },

  loops: {
    mutate: ['src/intermediate/loops/**/*.ts', 'src/intermediate/self-loop-*.ts', 'src/intermediate/dummy-self-loop-processor.ts'],
    tests: ['SelfLoop*.test.ts', 'SelfHyperLoopLabelsTest.test.ts', 'LabelPlacerTest.test.ts', 'PortSideAssignerTest.test.ts', 'PortSideUtilTest.test.ts',
      'RoutingSlotAssignerTest.test.ts', 'RoutingDirectorSelfLoopTest.test.ts', 'RoutingDirectorTest.test.ts',
      'OrthogonalSelfLoopRouterTest.test.ts', 'PortRestorerTest.test.ts', 'DummySelfLoopProcessorTest.test.ts',
      'NorthSouthPortPostprocessorTest.test.ts'],
  },
  p3order: {
    mutate: ['src/p3order/**/*.ts', 'src/p3order/counting/**/*.ts'],
    tests: ['LayerSweep*.test.ts', 'BarycenterHeuristicTest.test.ts', 'ForsterConstraintResolverTest.test.ts',
      'GreedyPortDistributorTest.test.ts', 'GreedySwitchProcessorTest.test.ts', 'PortDistributor*.test.ts',
      'CrossingsCounterTest.test.ts', 'AllCrossingsCounterTest.test.ts', 'HyperedgeCrossingsCounterTest.test.ts',
      'LayerSweepTypeDeciderTest.test.ts', 'InteractiveCrossingMinimizerTest.test.ts', 'SwitchDeciderTest.test.ts',
      'InLayerEdgeTwoNodeCrossingCounterTest.test.ts', 'BetweenLayerEdgeTwoNodeCrossingsCounterTest.test.ts'],
  },
  compaction: {
    mutate: ['src/compaction/**/*.ts'],
    tests: ['CompactionTest.test.ts', 'QuadrupletTest.test.ts', 'CGroupTest.test.ts', 'CompareFuzzyTest.test.ts',
      'CompactionAlgsTest.test.ts', 'OneDimensionalCompactorTest.test.ts', 'RectlinearConvexHullTest.test.ts'],
  },
  networksimplex: {
    mutate: ['src/networksimplex/**/*.ts', 'src/p4nodes/network-simplex-placer.ts'],
    tests: ['NGraphTest.test.ts', 'NNodeTest.test.ts', 'NEdgeTest.test.ts', 'NetworkSimplexTest.test.ts',
      'NetworkSimplexPlacerTest.test.ts'],
  },
  'hier-port': {
    mutate: ['src/intermediate/hierarchical-port-*.ts', 'src/intermediate/graph-transformer.ts',
      'src/intermediate/edge-and-layer-constraint-edge-reverser.ts'],
    tests: ['HierarchicalPort*.test.ts', 'GraphTransformerTest.test.ts', 'EdgeAndLayerConstraintEdgeReverserTest.test.ts'],
  },
  p1cycles: {
    mutate: ['src/p1cycles/**/*.ts'],
    tests: ['GreedyModelOrderCycleBreakerTest.test.ts', 'GroupModelOrderCalculatorTest.test.ts',
      'ModelOrder*.test.ts,!ModelOrderBarycenterHeuristicTest.test.ts', 'GreedySwitchProcessorTest.test.ts'],
  },
  preserveorder: {
    mutate: ['src/intermediate/preserveorder/**/*.ts'],
    tests: ['ModelOrder*.test.ts', 'CMGroupModelOrderTest.test.ts', 'SortByInputModelProcessorTest.test.ts'],
  },
  greedyswitch: {
    mutate: ['src/intermediate/greedyswitch/**/*.ts'],
    tests: ['GreedySwitchProcessorTest.test.ts', 'LayerSweepHierarchicalTwoSidedGreedySwitchTest.test.ts',
      'SwitchDeciderTest.test.ts', 'BetweenLayerEdgeTwoNodeCrossingsCounterTest.test.ts',
      'NorthSouthEdgeNeighbouringNodeCrossingsCounterTest.test.ts', 'InLayerEdgeTwoNodeCrossingCounterTest.test.ts',
      'NorthSouthEdgeAllCrossingsCounterTest.test.ts'],
  },
  graph: {
    mutate: ['src/graph/**/*.ts', 'src/util/java-random.ts', 'src/options/layered-spacings.ts'],
    tests: ['JavaRandomTest.test.ts', 'LayeredSpacingsBuilderTest.test.ts', 'LGraphUtilMergeTest.test.ts',
      'ModelOrderNodeComparatorTest.test.ts', 'ModelOrderPortComparatorTest.test.ts'],
  },
}

const argv = process.argv.slice(2)
const batchName = argv[0]
const concurrencyIdx = argv.indexOf('--concurrency')
const concurrency = concurrencyIdx >= 0 ? Number(argv[concurrencyIdx + 1]) : 6
const dry = argv.includes('--dry')

if (!batchName || batchName === 'list' || argv.includes('list')) {
  console.log('可用批次:')
  for (const [name, b] of Object.entries(BATCHES)) {
    console.log(`  ${name.padEnd(16)} mutate ${b.mutate.length} 组, 测试 ${b.tests.length} 个文件`)
  }
  process.exit(batchName === 'list' ? 0 : 1)
}

const b = BATCHES[batchName]
if (!b) {
  console.error(`未知批次: ${batchName}`)
  process.exit(1)
}

const mutate = b.mutate.join(',')
const tests = b.tests.map(t => t.startsWith('tests/') ? t : `tests/unit/${t}`).join(',')
const incrFile = `/tmp/mutate-${batchName}-incr.json`
const cmd = `bun x stryker run stryker.config.mjs --mutate "${mutate}" --testFiles "${tests}" --concurrency ${concurrency} --incremental --incrementalFile ${incrFile}`
console.log(`[mutate-batch] ${batchName}: 变异 ${b.mutate.join(' | ')}`)
console.log(`[mutate-batch] 测试: ${b.tests.length} 个文件 | concurrency=${concurrency}${dry ? ' (DRY: 只打印命令)' : ''}`)
if (dry) {
  console.log(cmd)
  process.exit(0)
}
execSync(cmd, { stdio: 'inherit', shell: '/bin/zsh' })
