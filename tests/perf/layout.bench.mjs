/**
 * layout 内核性能基准 (阶段 0).
 *
 * 场景: realworld ptolemy 图集 (test-resources/elk-models/realworld, 550 图),
 *       按节点数分规模 (small <50 / medium 50-199 / large >=200).
 * 指标: 每轮迭代完整重建 LGraph (parse 缓存 hit + build) + LayeredLayoutProvider.layout,
 *       即「构建 + 布局」端到端耗时 (vitest bench / Tinybench 自动 warmup + 统计).
 *
 * 运行:
 *   cd packages/layout
 *   bunx vitest bench tests/perf/layout.bench.mjs
 *   bunx vitest bench tests/perf/layout.bench.mjs --run --outputJson bench-results/layout-baseline.json
 *
 * CI 回归 (移植收口后挂接): 复用 scripts/check-bench-regression.mjs (默认 10% 阈值).
 */
import { bench, describe } from 'vitest'
import { LayeredLayoutProvider } from '../../src/index.ts'
import { buildLGraphFromParsed, parseElktCached, scanRealworld, loadRealworldSource } from '../../scripts/elkt-build.mjs'

const CACHE_DIR = new URL('../../bench-results/cache', import.meta.url).pathname
const SCALES = [
  ['small', 1, 49],
  ['medium', 50, 199],
  ['large', 200, Infinity],
]

const provider = new LayeredLayoutProvider()

for (const [scale, min, max] of SCALES) {
  const metas = scanRealworld({ min, max, limit: 3 })
  if (metas.length === 0) continue
  describe(`layout realworld ${scale} (${min}-${max} 节点)`, () => {
    for (const meta of metas) {
      const source = loadRealworldSource(meta.name)
      const label = `${meta.name} (${meta.nodeCount}n)`
      bench(`build+layout: ${label}`, () => {
        const parsed = parseElktCached(source, meta.name, CACHE_DIR)
        const { graph } = buildLGraphFromParsed(parsed, meta.name)
        provider.layout(graph)
      })
    }
  })
}
