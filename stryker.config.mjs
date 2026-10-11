/**
 * Stryker Mutation Testing 配置 — layout 移植代码 (ELK Java 0.12.0 1:1 移植).
 *
 * 运行: bun run --filter @ggn/layout mutation
 * 报告: reports/mutation/index.html
 *
 * 范围: elk-java-unit 移植单测覆盖的模块 (P3 交叉最小化 / intermediate 处理器 / 自环 / compaction)。
 * 阈值: 初始 70% 杀灭率 (M5 验收口径)。dry run 只跑 elk-java-unit (vitest.mutation.config.ts)。
 */
export default {
  testRunner: 'vitest',
  plugins: ['@stryker-mutator/vitest-runner'],
  mutate: [
    'src/p3order/**/*.ts',
    'src/intermediate/greedyswitch/**/*.ts',
    'src/intermediate/sort-by-input-model-processor.ts',
    'src/intermediate/cell-system.ts',
    'src/intermediate/preserveorder/**/*.ts',
    'src/intermediate/self-loop-preprocessor.ts',
    'src/intermediate/loops/**/*.ts',
    'src/compaction/recthull/**/*.ts',
    'src/compaction/oned/**/*.ts',
    'src/p4nodes/network-simplex-placer.ts',
    'src/p4nodes/spacings.ts',
    'src/p5edges/orthogonal/orthogonal-routing-generator.ts',
    'src/intermediate/hierarchical-port-orthogonal-edge-router.ts',
    'src/util/java-random.ts',
    'src/options/layered-spacings.ts',
    'src/api/elk-json.ts',
    'shared/elkgraph-builder.ts',
  ],
  vitest: {
    configFile: 'vitest.mutation.config.ts',
    // 关闭 related 模式: vitest 4 + 沙箱路径下 related 发现失效 → dry-run 跑全量 (含失败测试).
    // related: false 后 dry-run 只跑 mutation 配置内的干净测试集 (tests/unit 排除 realworld 等).
    related: false,
  },
  thresholds: { high: 80, low: 70, break: null },
  reporters: ['html', 'clear-text', 'progress', 'json'],
  htmlReporter: { fileName: 'reports/mutation/index.html' },
  tempDirName: 'stryker-tmp',
  concurrency: 4,
  ignoreStatic: true,
}
