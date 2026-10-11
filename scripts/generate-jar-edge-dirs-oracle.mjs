#!/usr/bin/env bun
/**
 * 边路由 四方向 oracle 生成器 (L1 SSOT = ELK Java 0.12.0 jar).
 *
 * 正交路由 E2E 方向维度: 对每张「平坦 + 正交 + 非自环 + 非交互」图,
 * 分别以 RIGHT/LEFT/DOWN/UP 四种方向跑 ELK Java jar, 输出每条边弯点 oracle.
 * 这样能捕获「某方向对、其余方向错」的边路由回归 (坐标差分查不到).
 *
 * 用法: bun scripts/generate-jar-edge-dirs-oracle.mjs [--out test-resources/edge-dirs-oracle.json]
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { globSync } from 'glob'
import { parseElkt, elktToElkJson } from './elkt2test.mjs'

const ROOT = resolve(import.meta.dirname, '..')
const MODEL_ROOT = join(ROOT, 'test-resources/elk-models')
const outIdx = process.argv.indexOf('--out')
const OUT = outIdx >= 0 ? resolve(process.argv[outIdx + 1]) : join(ROOT, 'test-resources/edge-dirs-oracle.json')
const DIRS = ['RIGHT', 'LEFT', 'DOWN', 'UP']

const files = globSync('**/*.elkt', { cwd: MODEL_ROOT })
  .filter(f => !f.includes('realworld'))
  .sort()

const dir = mkdtempSync(join(tmpdir(), 'edge-dirs-oracle-'))
const meta = []
try {
  for (const rel of files) {
    const source = readFileSync(join(MODEL_ROOT, rel), 'utf8')
    const graphData = parseElkt(source)
    // 生成 平坦/层级 + 正交 + 非交互 + 有边 的方向变体 (含自环).
    // 层级图 2026-08-08 分层锁步修复后纳入 (外部端口不再被父图转置错侧).
    const er = String(graphData.graphProps.edgeRouting ?? 'ORTHOGONAL').toUpperCase()
    if (er !== 'ORTHOGONAL' && er !== 'UNDEFINED') continue
    if (rel.includes('interactive')) continue
    if (graphData.edges.length === 0) continue
    for (const d of DIRS) {
      const json = JSON.stringify(elktToElkJson(graphData, { direction: d }))
      const name = rel.replace(/[\\/]/g, '__').replace(/\.elkt$/, '') + '__D_' + d
      writeFileSync(join(dir, name + '.json'), json)
      meta.push({ name, rel, dir: d, ids: graphData.nodes })
    }
  }
  const dbg = join(ROOT, 'scripts/elk-java-debug')
  const java = process.env.ELK_JAVA_HOME || '/opt/homebrew/opt/openjdk@21/bin/java'
  const oracle = {}
  const reBp = /bp=\(([\d.-]+),([\d.-]+)\)/g

  // 逐文件 JVM (ELK Java 0.12.0 存在批量类加载顺序污染 — 同图在不同批量序列下结果不同,
  // 见 PROGRESS 深夜48). 每图每方向一个独立 JVM = ELK 的规范每图行为, 确定且可复现.
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const execFileP = promisify(execFile)
  const CP = `${join(dbg, 'out-edge')}:${join(dbg, 'lib')}/*`
  const poolSize = 6
  let cursor = 0
  const worker = async () => {
    while (true) {
      const jobIdx = cursor++
      const job = meta[jobIdx]
      if (!job) return
      const jsonPath = join(dir, job.name + '.json')
      let stdout = ''
      try {
        const r = await execFileP(java, ['-cp', CP, 'EdgeMain', jsonPath], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
        stdout = r.stdout
      } catch (e) {
        stdout = e.stdout ?? ''
      }
      // 解析单文件输出: FILE 行缺失 = jar 崩溃 (跳过, 与批量模式一致 — 崩溃图不入 oracle).
      if (!stdout.includes('FILE ')) continue
      const entry = oracle[job.rel + '::' + job.dir] = { edges: [], nodes: {} }
      const nodeStack = []
      for (const line of stdout.split('\n')) {
        const indent = (line.match(/^\s*/) ?? [''])[0].length
        const nm = line.match(/^\s*NODE (\S+) x=([\d.-]+) y=([\d.-]+)/)
        if (nm) {
          const depth = Math.max(0, Math.floor(indent / 2))
          while (nodeStack.length > depth) nodeStack.pop()
          const parent = nodeStack.length > 0 ? nodeStack[nodeStack.length - 1] : { x: 0, y: 0 }
          const wx = parent.x + Number(nm[2]), wy = parent.y + Number(nm[3])
          const full = nm[1].replace(/^N/, '')
          const leaf = full.split('.').pop()
          let idx = job.ids.indexOf(full)
          if (idx === -1) idx = job.ids.indexOf(leaf)
          if (idx !== -1) entry.nodes[idx] = [wx, wy]
          nodeStack.push({ x: wx, y: wy })
          continue
        }
        const m = line.match(/^EDGE (\S+)->(\S+) start=\(([\d.-]+),([\d.-]+)\)(.*)end=\(([\d.-]+),([\d.-]+)\)$/)
        if (m) {
          const srcIdx = job.ids.indexOf(m[1].replace(/^N/, ''))
          const tgtIdx = job.ids.indexOf(m[2].replace(/^N/, ''))
          if (srcIdx === -1 || tgtIdx === -1) continue
          const pts = []
          reBp.lastIndex = 0
          let bm
          while ((bm = reBp.exec(m[5])) !== null) pts.push([Number(bm[1]), Number(bm[2])])
          entry.edges.push({ s: srcIdx, t: tgtIdx, start: [Number(m[3]), Number(m[4])], pts, end: [Number(m[6]), Number(m[7])] })
        }
      }
    }
  }
  await Promise.all(Array.from({ length: poolSize }, worker))

  writeFileSync(OUT, JSON.stringify(oracle, null, 0))
  console.log(`[edge-dirs-oracle] ${Object.keys(oracle).length} 个 (图×方向) → ${OUT}`)
} finally {
  rmSync(dir, { recursive: true, force: true })
}
