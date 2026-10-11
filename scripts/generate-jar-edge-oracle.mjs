#!/usr/bin/env bun
/**
 * 边路由 oracle 生成器 (L1 SSOT = ELK Java 0.12.0 jar).
 *
 * 跑全部 elkt 模型 (examples/tests/tickets, 默认 ORTHOGONAL 边路由)
 * → EdgeOracleMain (ELK Java) → 解析每条边 (源/目标节点索引 + 世界坐标弯点) → oracle JSON.
 *
 * 用法: bun scripts/generate-jar-edge-oracle.mjs [--out test-resources/edge-oracle.json]
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join, resolve, relative } from 'node:path'
import { tmpdir } from 'node:os'
import { globSync } from 'glob'
import { parseElkt, elktToElkJson } from './elkt2test.mjs'

const ROOT = resolve(import.meta.dirname, '..')
const MODEL_ROOT = join(ROOT, 'test-resources/elk-models')
const outIdx = process.argv.indexOf('--out')
const OUT = outIdx >= 0 ? resolve(process.argv[outIdx + 1]) : join(ROOT, 'test-resources/edge-oracle.json')

const files = globSync('**/*.elkt', { cwd: MODEL_ROOT })
  .filter(f => !f.includes('realworld'))
  .sort()

const dir = mkdtempSync(join(tmpdir(), 'edge-oracle-'))
const meta = []
try {
  for (const rel of files) {
    const source = readFileSync(join(MODEL_ROOT, rel), 'utf8')
    const graphData = parseElkt(source)
    const json = JSON.stringify(elktToElkJson(graphData))
    const name = rel.replace(/[\\/]/g, '__').replace(/\.elkt$/, '')
    writeFileSync(join(dir, name + '.json'), json)
    meta.push({ name, rel, ids: graphData.nodes })
  }
  const dbg = join(ROOT, 'scripts/elk-java-debug')
  const java = process.env.ELK_JAVA_HOME || '/opt/homebrew/opt/openjdk@21/bin/java'
  let stdout
  try {
    stdout = execSync(`"${java}" -cp "${join(dbg, 'out-edge')}:${join(dbg, 'lib')}/*" EdgeOracleMain "${dir}"/*.json`, {
      encoding: 'utf8', maxBuffer: 512 * 1024 * 1024, shell: '/bin/zsh', stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (e) {
    stdout = e.stdout ?? ''
  }
  // 解析: FILE <name> / EDGE src->tgt start=(..) bp=(..) end=(..) / END <name>
  const oracle = {}
  const reBp = /bp=\(([\d.-]+),([\d.-]+)\)/g
  let cur = null
  for (const line of stdout.split('\n')) {
    if (line.startsWith('FILE ')) {
      const name = line.slice(5).trim().replace(/\.json$/, '')
      cur = meta.find(m => m.name === name)
      if (cur) oracle[cur.rel] = { edges: [] }
      continue
    }
    if (line.startsWith('EDGE ') && cur) {
      const m = line.match(/^EDGE (\S+)->(\S+) start=\(([\d.-]+),([\d.-]+)\)(.*)end=\(([\d.-]+),([\d.-]+)\)$/)
      if (!m) continue
      const srcIdx = cur.ids.indexOf(m[1].replace(/^N/, ''))
      const tgtIdx = cur.ids.indexOf(m[2].replace(/^N/, ''))
      if (srcIdx === -1 || tgtIdx === -1) continue
      const pts = []
      reBp.lastIndex = 0
      let bm
      while ((bm = reBp.exec(m[5])) !== null) pts.push([Number(bm[1]), Number(bm[2])])
      oracle[cur.rel].edges.push({ s: srcIdx, t: tgtIdx, start: [Number(m[3]), Number(m[4])], pts, end: [Number(m[6]), Number(m[7])] })
    }
  }
  writeFileSync(OUT, JSON.stringify(oracle, null, 0))
  console.log(`[edge-oracle] ${Object.keys(oracle).length} 图 → ${OUT}`)
} finally {
  rmSync(dir, { recursive: true, force: true })
}
