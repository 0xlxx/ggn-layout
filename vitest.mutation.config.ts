import { defineConfig } from 'vitest/config'


/** Stryker 专用 vitest 配置: 只跑 elk-java-unit 移植单测 (避免 realworld/差分测试拖慢 + 初始失败). */
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/api/**/*.test.ts',
  'tests/bdd/cell-system.scenarios.test.ts', 'tests/bdd/north-south-ports.scenarios.test.ts',
  'tests/bdd/labels.scenarios.test.ts', 'tests/bdd/port-labels.scenarios.test.ts',
  'tests/bdd/linear-segments.scenarios.test.ts', 'tests/bdd/components-strategies.scenarios.test.ts',
  'tests/bdd/compound-ports.scenarios.test.ts', 'tests/bdd/spline-selfloop.scenarios.test.ts',
  'tests/bdd/orthogonal-routing.scenarios.test.ts', 'tests/bdd/parser-scenarios.test.ts',
  'tests/bdd/layerers.scenarios.test.ts', 'tests/bdd/compaction.scenarios.test.ts',
  'tests/bdd/strategy-registration.scenarios.test.ts', 'tests/bdd/core-layout.scenarios.test.ts'],
    // 排除已知失败/慢测 (realworld 550 图全量扫描 + 非 layered 算法如 elk.stress):
    //  - Basic* / *ProcessorTest / *SorterTest: realworld 全量图集 (慢, 且非本次 mutate 范围)
    //  - Issue665/Issue700: 依赖 elk.stress 算法 (未移植, checkAlgorithmSupported 抛错)
    //  - LayoutInvariantsTest: M4 全量不变量扫描 (348 图, 慢)
    exclude: [
      'tests/unit/Basic*.test.ts',
      'tests/unit/InLayerConstraintProcessorTest.test.ts',
      'tests/unit/InvertedPortProcessorTest.test.ts',
      'tests/unit/LabelSideSelectorTest.test.ts',
      'tests/unit/LayerSizeAndGraphHeigthCalculatorTest.test.ts',
      'tests/unit/LongEdgeSplitterTest.test.ts',
      'tests/unit/NodeMarginCalculatorTest.test.ts',
      'tests/unit/NodePromotionTest.test.ts',
      'tests/unit/PortListSorterTest.test.ts',
      'tests/unit/PortSideProcessorTest.test.ts',
      'tests/unit/ReversedEdgeRestorerTest.test.ts',
      'tests/unit/Issue665Test.test.ts',
      'tests/unit/Issue700Test.test.ts',
      'tests/unit/LayoutInvariantsTest.test.ts',
    ],
    environment: 'node',
    globals: true,
  },
})
