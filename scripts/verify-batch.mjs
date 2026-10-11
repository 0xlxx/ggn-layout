#!/usr/bin/env node
/**
 * 批次验证脚本 (加速 + 隔离 writer 验证).
 *
 * 用法:
 *   bun run scripts/verify-batch.mjs <batch> [--full]
 *   bun run scripts/verify-batch.mjs list
 *
 * 每个 writer 完成后只跑自己批次的测试 (vitest 按文件 glob 过滤),
 * 避免全量套件互相干扰; --full 追加跑 696 collect-all diff 门禁.
 * 批次定义与 scripts/mutate-batch.mjs 共用同一映射 (从该文件导入).
 */
import { execSync } from 'node:child_process'

const BATCH_TESTS = {
  loops: ['SelfLoop', 'LabelPlacer', 'PortSideAssigner', 'PortSideUtil', 'RoutingSlotAssigner',
    'RoutingDirector', 'OrthogonalSelfLoopRouter', 'PortRestorer', 'DummySelfLoopProcessor',
    'NorthSouthPortPostprocessor', 'SelfHyperLoop', 'LabelDummyRemover'],
  p3order: ['LayerSweep', 'BarycenterHeuristic', 'ForsterConstraintResolver', 'GreedyPortDistributor',
    'GreedySwitchProcessor', 'CrossingsCounter', 'AllCrossingsCounter', 'HyperedgeCrossingsCounter',
    'LayerSweepTypeDecider', 'InteractiveCrossingMinimizer', 'SwitchDecider', 'PortDistributor',
    'InLayerEdgeTwoNodeCrossingCounter', 'BetweenLayerEdgeTwoNodeCrossingsCounter', 'JavaRandom'],
  compaction: ['Compaction', 'Quadruplet', 'CGroup', 'CompareFuzzy', 'CompactionAlgs',
    'OneDimensionalCompactor', 'RectlinearConvexHull'],
  networksimplex: ['NGraph', 'NNode', 'NEdge', 'NetworkSimplex', 'NetworkSimplexPlacer'],
  'hier-port': ['HierarchicalPort', 'GraphTransformer', 'EdgeAndLayerConstraintEdgeReverser'],
  p1cycles: ['GreedyModelOrderCycleBreaker', 'GroupModelOrderCalculator', 'ModelOrder', 'GreedySwitchProcessor'],
  preserveorder: ['ModelOrder', 'CMGroupModelOrder', 'SortByInputModelProcessor'],
  greedyswitch: ['GreedySwitchProcessor', 'LayerSweepHierarchicalTwoSidedGreedySwitch'],
  graph: ['JavaRandom', 'LayeredSpacingsBuilder', 'LGraphUtilMerge', 'ModelOrderNodeComparator', 'ModelOrderPortComparator'],
}

const argv = process.argv.slice(2)
const batch = argv[0]
const full = argv.includes('--full')

if (!batch || batch === 'list' || argv.includes('list')) {
  console.log('可用批次:')
  for (const [name, tests] of Object.entries(BATCH_TESTS)) console.log(`  ${name.padEnd(16)} 测试文件 ${tests.length} 个关键字`)
  process.exit(batch === 'list' ? 0 : 1)
}
const keywords = BATCH_TESTS[batch]
if (!keywords) { console.error(`未知批次: ${batch}`); process.exit(1) }

// 构造 vitest 文件过滤器 (glob: 匹配文件名含任一关键字)
const globs = keywords.map(k => `tests/unit/*${k}*.test.ts`).join(' ')
const cmd = `bun x vitest run ${globs}`
console.log(`[verify-batch] ${batch}: ${cmd}`)
execSync(cmd, { stdio: 'inherit', shell: '/bin/zsh' })

if (full) {
  console.log(`\n[verify-batch] ${batch} --full: 696 collect-all + gate`)
  execSync('node scripts/diff-failures.mjs collect-all /tmp/failures-batch.json && node scripts/diff-failures.mjs check /tmp/failures-batch.json', { stdio: 'inherit', shell: '/bin/zsh' })
}
