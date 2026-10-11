/**
 * 校验 demo-vite/data/*.json 与当前 parser 是否一致 (防数据过期).
 * 对比 manifest.json 记录的 srcHash/jsonHash 与当前 parseElkt+elktToElkJson 输出.
 * 不一致 → demo 数据过期, 需重跑 bun run demo:data.
 *
 * 用法: bun scripts/verify-demo-data.mjs
 */
import { readFileSync, existsSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { parseElkt, elktToElkJson, elktHash } from './elkt2test.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DATA = join(ROOT, 'demo-vite/data')
const MODEL_ROOT = join(ROOT, 'test-resources/elk-models')
const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16)

const manifestPath = join(DATA, 'manifest.json')
if (!existsSync(manifestPath)) {
  console.error('❌ 缺 demo-vite/data/manifest.json — 请先跑 bun run demo:data')
  process.exit(1)
}
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
let stale = 0
for (const [out, rec] of Object.entries(manifest.models)) {
  const src = readFileSync(join(MODEL_ROOT, rec.src), 'utf8')
  const g = parseElkt(src)
  const json = JSON.stringify(elktToElkJson(g))
  const srcHash = elktHash(g)
  const jsonHash = sha(json)
  const dataOk = existsSync(join(DATA, out))
  if (!dataOk || srcHash !== rec.srcHash || jsonHash !== rec.jsonHash) {
    stale++
    console.log(`⚠ ${out}: 过期 (parser 已变, 重跑 bun run demo:data)`)
  }
}
console.log(stale === 0
  ? `✅ demo-vite/data 与当前 parser 一致 (${Object.keys(manifest.models).length} 个模型, ${manifest.generated})`
  : `❌ ${stale} 个模型数据过期`)
process.exit(stale === 0 ? 0 : 1)
