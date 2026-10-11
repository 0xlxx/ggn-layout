export default {
  testRunner: 'vitest',
  plugins: ['@stryker-mutator/vitest-runner'],
  mutate: ['src/intermediate/cell-system.ts'],
  vitest: { configFile: 'vitest.mutation-cell.config.ts', related: false },
  thresholds: { high: 80, low: 70, break: null },
  reporters: ['clear-text', 'progress'],
  tempDirName: 'stryker-cell-tmp',
  concurrency: 4,
  ignoreStatic: true,
}
