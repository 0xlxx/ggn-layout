import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// 本地工作区把包自引用 `ggn-layout` / `ggn-layout/*` 解析到 src（与 tsconfig `paths` 对齐），
// 让未构建 dist 也能跑测试；发布包的 `exports` 只暴露 dist，不再向消费者泄漏源码。
const src = (p: string) => fileURLToPath(new URL(`./src/${p}`, import.meta.url))

export default defineConfig({
  resolve: {
    alias: [
      { find: 'ggn-layout/options', replacement: src('options.ts') },
      { find: 'ggn-layout/api', replacement: src('api/index.ts') },
      { find: 'ggn-layout/core', replacement: src('core.ts') },
      { find: 'ggn-layout/layered', replacement: src('api/layered.ts') },
      { find: 'ggn-layout/layout-worker', replacement: src('layout-worker.ts') },
      { find: 'ggn-layout', replacement: src('index.ts') },
    ],
  },
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
