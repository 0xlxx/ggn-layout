import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // tests/debug/* 是一次性调试探针 (模块轨迹 / src-dist 对照 / 依赖 /tmp 产物), 不进门禁;
    // 需要时显式运行: npx vitest run tests/debug/<file>. (R71)
    exclude: ['tests/debug/**'],
    environment: 'node',
    globals: true,
    // 框架移植测试 (ELK LayoutTestRunner 型) 单 it 跑数百图布局, 放宽超时.
    testTimeout: 120000,
    hookTimeout: 120000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/index.ts',
        'src/**/*.d.ts',
      ],
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: 'coverage',
      reportOnFailure: true,
    },
  },
})
