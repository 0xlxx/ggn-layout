import { defineConfig } from 'vitest/config'

/**
 * vitest UI 专用配置: 只跑核心测试集 (elk-java-unit + bdd),
 * 排除 realworld/调试测试 (避免海量 stdout 塞满 UI) 与 coverage 目录冲突.
 * 启动: bun x vitest --ui --coverage --config vitest.ui.config.ts --watch
 */
export default defineConfig({
  test: {
    include: [
      'tests/unit/**/*.test.ts',
      'tests/bdd/**/*.test.ts',
    ],
    environment: 'node',
    globals: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts'],
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: 'coverage-ui',
      reportOnFailure: true,
    },
  },
})
