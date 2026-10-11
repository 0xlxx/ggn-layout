/**
 * 跨引擎回归配置 (JavaScriptCore / Bun) — 背景见 docs/PORTING.md §6.17.
 *
 * 为什么需要: ggn 是 ELK Java 的 1:1 移植, 但 JS 没有 Java `Collections.sort` 的契约保障 ——
 * 比较器一旦不自洽, `Array#sort` 的结果会随引擎/版本漂移 (实测 V8 与 JavaScriptCore 给出不同层内序)。
 * 单引擎 CI 拦不住这类缺陷, 因此用 Bun (JSC) 复跑一遍纯算法单测作为第二道防线。
 *
 * 为什么只跑 tests/unit: elkjs 的 `new ELK()` 依赖 `Worker` (浏览器/Node 提供, Bun 无),
 * elkjs 差分测试在 Bun 下必然 `undefined is not a constructor`; 它们由 Node 侧主门禁
 * (`test:ci`) 负责。下面 6 个 tests/unit 文件同样 import elkjs, 一并排除。
 */
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    exclude: [
      'tests/unit/ConcreteSortByInputModelTest.test.ts',
      'tests/unit/OrthogonalEdgeRoutingBendPointsTest.test.ts',
      'tests/unit/OrthogonalSelfLoopRouterTest.test.ts',
      'tests/unit/PaddingOptionTest.test.ts',
      'tests/unit/RoutingDirectorSelfLoopTest.test.ts',
      'tests/unit/RoutingDirectorTest.test.ts',
    ],
    environment: 'node',
    globals: true,
    testTimeout: 120000,
    hookTimeout: 120000,
  },
})
