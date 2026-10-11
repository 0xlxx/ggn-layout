/**
 * P1-B: P3 (JSON 往返) 路径的 jar oracle 差分测试生成器.
 *
 * 背景 (data-paths-review.md): 最强验证 (jar 坐标差分) 此前只挂 P2 直建路径;
 * P3 (elktToElkJson → elkJsonToParsed → buildLGraphFromElkJson) 是 demo/对外 API 的真实消费路径,
 * 但只有 4 个手写 API 用例 + 6 个 demo (对照 elkjs 非 jar). 本脚本为全部 oracle 模型生成
 * json_path_batch.test.ts: 同一 ELK JSON → buildLGraphFromElkJson → layout → 与 jar oracle 逐节点差分.
 *
 * 用途: bun scripts/elkt2test-json.mjs
 *   （生成 tests/oracle/generated/json_path_batch.test.ts, 独立运行: vitest run tests/oracle/generated/json_path_batch.test.ts）
 * 注意: 生成后若改 shared/elkgraph-builder / opt-map / elkt2test 需重新生成 (与 elkt2test.mjs 同频).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { basename, join, relative, resolve } from 'node:path'
import { globSync } from 'glob'
import { parseElkt, elktToElkJson, elktHash } from './elkt2test.mjs'

const OUT_DIR = resolve(import.meta.dirname, '../tests/oracle/generated/')
const MODEL_ROOT = resolve(import.meta.dirname, '../test-resources/elk-models/')
const ORACLE_DIR = resolve(import.meta.dirname, '../test-resources/jar-oracle/')
const TOLERANCE = Number(process.env.ELK_TOLERANCE ?? 2)

const patterns = process.argv.slice(2).length > 0
  ? process.argv.slice(2)
  : ['examples/**/*.elkt', 'tests/**/*.elkt', 'tickets/**/*.elkt']

const files = patterns.flatMap((p) => globSync(join(MODEL_ROOT, p))).filter((f) => !f.includes('/realworld/')).sort()

const blocks = []
let crashCount = 0
for (const file of files) {
  const rel = relative(MODEL_ROOT, resolve(file)).replace(/\.elkt$/, '')
  const name = rel.replace(/[\\/]/g, '__')
  const source = readFileSync(file, 'utf8')
  const graph = parseElkt(source)
  const elkJson = JSON.stringify(elktToElkJson(graph))
  const isForceAlg = (v) => /^(?:elk\.|org\.eclipse\.elk\.)?(?:stress|force|rectpacking)$/.test(String(v ?? '').trim())
  if (isForceAlg(graph.graphProps.algorithm) || [...graph.nodeProps.values()].some((props) => isForceAlg(props.algorithm))) {
    blocks.push(`describe('elkt 生成 (P3 JSON): ${name}', () => {
  // 含非 layered 算法 (stress/force): P3 路径不适用, 差分由 verify-elkg-java-layout (api 路径) 覆盖.
  it.skip('差分由 verify api 路径覆盖 (stress/force)', () => {})
})`)
    continue
  }
  const hash = elktHash(graph)
  const names = graph.nodes
  const isBig = names.length > 150
  const namesJs = JSON.stringify(names)

  let oracleErr = null
  try {
    const oj = JSON.parse(readFileSync(join(ORACLE_DIR, `${name}.json`), 'utf8'))
    oracleErr = oj.err ?? null
  } catch { oracleErr = null }

  if (oracleErr !== null) {
    // 复刻 P2 crash 测试的错误匹配 (异常短类名 + 消息尾段).
    const errPhrase = oracleErr.replace(/\s+/g, ' ').trim()
    const excM = errPhrase.match(/^([\w.]+)\s+(.*)$/)
    const excShort = excM ? (excM[1].split('.').pop() ?? '') : 'ERROR'
    const msgFull = excM ? excM[2] : errPhrase
    // 算法不支持错误: 稳定前缀 (同 elkt2test.mjs).
    const algoM = msgFull.match(/^Layout algorithm '([^']+)' not found/)
    const msgTail = algoM ? `Layout algorithm '${algoM[1]}' not found` : msgFull.slice(-60)
    const escaped = msgTail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const errReJson = JSON.stringify(escaped)
    blocks.push(`/**
 * elkt 生成 (P3 JSON 路径): ${name} — jar 自身报错复刻
 */
describe('elkt 生成 (P3 JSON): ${name}', () => {
  const ELK_JSON = ${JSON.stringify(elkJson)}
  it('P3 复刻 jar 报错', () => {
    expect(() => {
      const { graph } = buildLGraphFromElkJson(JSON.parse(ELK_JSON))
      new LayeredLayoutProvider().layout(graph)
    }).toThrow(new RegExp(${errReJson}))
  })
})
`)
    crashCount++
    continue
  }

  blocks.push(`/**
 * elkt 生成 (P3 JSON 路径): ${name}
 * 图: ${graph.nodes.length} 节点 / ${graph.edges.length} 边 / ${graph.hierarchy.size} 层级块
 */
describe('elkt 生成 (P3 JSON): ${name}', () => {
  const ELK_JSON = ${JSON.stringify(elkJson)}
  const NAMES: string[] = ${namesJs}
  it('${isBig ? 'P3 布局完成 (大图跳过差分)' : 'P3 坐标级差分: 与 jar 0.12.0 1:1 对齐'}', () => {
    const { graph, nodeOf } = buildLGraphFromElkJson(JSON.parse(ELK_JSON))
    new LayeredLayoutProvider().layout(graph)
    if (${isBig ? 'true' : 'false'}) {
      for (const n of nodeOf.values()) {
        expect(Number.isFinite(n.position.x)).toBe(true)
        expect(Number.isFinite(n.position.y)).toBe(true)
      }
      return
    }
    const oracle = JSON.parse(readFileSync(new URL('../test-resources/jar-oracle/${name}.json', import.meta.url), 'utf8'))
    expect(oracle.hash, 'jar oracle 过期/缺失, 请重跑 node scripts/generate-jar-oracle.mjs').toBe('${hash}')
    const variants = oracle.variants ?? []
    for (let i = 0; i < NAMES.length; i++) {
      const gn = nodeOf.get(i)!
      const nm = 'N' + NAMES[i]
      const cands = [oracle.coords[nm], ...variants.map((v) => v.coords[nm])].filter(Boolean)
      expect(cands.length, nm + ' 缺少 jar oracle 坐标').toBeGreaterThan(0)
      const bestX = Math.min(...cands.map((c) => Math.abs(gn.position.x - c.x)))
      const bestY = Math.min(...cands.map((c) => Math.abs(gn.position.y - c.y)))
      expect(bestX, nm + ' x').toBeLessThanOrEqual(${TOLERANCE})
      expect(bestY, nm + ' y').toBeLessThanOrEqual(${TOLERANCE})
    }
  })
})
`)
}

mkdirSync(OUT_DIR, { recursive: true })
const header = `import { readFileSync } from 'node:fs'
import { buildLGraphFromElkJson } from '../shared/elkgraph-builder.ts'
import { LayeredLayoutProvider } from '../src/layered-layout-provider.js'

`
const outFile = join(OUT_DIR, 'json_path_batch.test.ts')
writeFileSync(outFile, header + blocks.join('\n'))
console.log(`生成 ${outFile} (${blocks.length} 图, 其中 crash 复刻 ${crashCount})`)
