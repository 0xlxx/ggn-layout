/**
 * L1 jar oracle 生成器 (M3 待办落地).
 *
 * 流程:
 *   1. 扫描 test-resources/elk-models 下 examples/tests/tickets 全部 elkt (排除 realworld);
 *   2. 每个 elkt → ELK JSON (与 scripts/probe.mjs export 同一导出逻辑, canonical org.eclipse.elk.* key);
 *   3. ELK JSON 内容 sha256 → 模型 hash (注释/空白不影响; 模型变更 → hash 变 → oracle 需重生成);
 *   4. 全部 ELK JSON 写入临时目录, 单 JVM 跑 BatchMain 批量布局;
 *   5. 解析 stdout → 每个模型写 test-resources/jar-oracle/<hash>.json + index.json.
 *
 * 用法: node scripts/generate-jar-oracle.mjs [--out <dir>] [--glob <pattern>]
 * 默认 --out test-resources/jar-oracle; --glob 覆盖模型 glob (默认 examples|tests|tickets 全部).
 *
 * 输出格式 (oracle):
 *   { file, hash, nodes: N, edges: M, eps: 1,
 *     coords: { "N<idx>": { x, y }, ... } }   // 相对父块坐标 (与 ggn 子图坐标语义一致)
 */
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, statSync, existsSync } from 'node:fs'
import { join, resolve, relative, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { execSync } from 'node:child_process'
import { globSync } from 'glob'
import { parseElkt, elktToElkJson, elktHash } from './elkt2test.mjs'

const ROOT = resolve(import.meta.dirname, '..')
const MODEL_ROOT = join(ROOT, 'test-resources/elk-models')
const DEFAULT_OUT = join(ROOT, 'test-resources/jar-oracle')

const argv = process.argv.slice(2)
const outIdx = argv.indexOf('--out')
const OUT_DIR = outIdx >= 0 ? resolve(argv[outIdx + 1]) : DEFAULT_OUT
const globIdx = argv.indexOf('--glob')
const patterns = globIdx >= 0
  ? [argv[globIdx + 1]]
  : ['examples/**/*.elkt', 'tests/**/*.elkt', 'tickets/**/*.elkt']

// ── 主流程 ──
const files = patterns.flatMap(p => globSync(join(MODEL_ROOT, p)))
  .filter(f => !f.includes('/realworld/'))
  .sort()
console.log(`[oracle] 模型数: ${files.length}`)

mkdirSync(OUT_DIR, { recursive: true })
const batchDir = mkdtempSync(join(tmpdir(), 'elk-oracle-'))
const meta = [] // { name, file, hash, rel, nodes, edges }
try {
  // 1) 导出全部 ELK JSON + 计算 hash; 文件名用 hash 避免重名/便于 BatchMain 解析
  for (const file of files) {
    const source = readFileSync(file, 'utf8')
    const graphData = parseElkt(source)
    const json = JSON.stringify(elktToElkJson(graphData))
    const hash = elktHash(graphData)
    const rel = relative(MODEL_ROOT, file).replace(/\.elkt$/, '')
    const graph = rel.replace(/[\\/]/g, '__')
    writeFileSync(join(batchDir, graph + '.json'), json)
    meta.push({
      name: graph + '.json',           // batch 输入文件名 (图名唯一, 避免 hash 碰撞覆盖)
      rel,
      graph,
      hash,
      nodes: graphData.nodes.length,
      edges: graphData.edges.length,
      ids: graphData.nodes,
    })
  }

  // 2) 编译 BatchMain (如需要) + 单 JVM 批量布局
  const dbg = join(ROOT, 'scripts/elk-java-debug')
  const lib = join(dbg, 'lib')
  const out = join(dbg, 'out')
  const javaHome = process.env.ELK_JAVA_HOME || '/opt/homebrew/opt/openjdk@21'
  const javac = join(javaHome, 'bin/javac')
  const java = join(javaHome, 'bin/java')
  const outEdge = join(dbg, 'out-edge')
  const bmClass = join(out, 'BatchMain.class')
  const bmSrc = join(dbg, 'BatchMain.java')
  if (!existsSync(bmClass) || statSync(bmSrc).mtimeMs > statSync(bmClass).mtimeMs) {
    execSync(`"${javac}" -d "${out}" -cp "${lib}/*" -source 17 -target 17 "${bmSrc}"`, { stdio: 'inherit' })
  }
  // 2b) 逐文件 JVM (ELK 批量类加载污染 — 见 PROGRESS 深夜48): 每模型独立 JVM, 确定且可复现.
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const execFileP = promisify(execFile)
  const perFileDir = mkdtempSync(join(tmpdir(), 'elk-oracle-single-'))
  const poolSize = 6
  let cursor = 0
  const worker = async () => {
    while (true) {
      const jobIdx = cursor++
      const m = meta[jobIdx]
      if (!m) return
      const srcFile = join(batchDir, m.name)
      const singleDir = join(perFileDir, String(jobIdx))
      mkdirSync(singleDir, { recursive: true })
      writeFileSync(join(singleDir, m.name), readFileSync(srcFile))
      let stdout = ''
      try {
        const r = await execFileP(java, ['-cp', `${outEdge}:${lib}/*`, 'EdgeMain', join(singleDir, m.name)], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
        // EdgeMain 把 ERR 打到 stderr (进程仍退出 0) — 必须合并, 否则报错模型 ERR 全丢.
        stdout = (r.stdout ?? '') + '\n' + (r.stderr ?? '')
      } catch (e) {
        stdout = ((e.stdout ?? '') + '\n' + (e.stderr ?? '')).trim()
      }
      m.stdout = stdout
    }
  }
  await Promise.all(Array.from({ length: poolSize }, worker))
  const stdout = meta.map(m => m.stdout ?? '').join('\n')

  // 3) 解析 stdout (EdgeMain): FILE <name> / NODE <indent><id> x=.. y=.. / ERR <name> ...
  //    EdgeMain NODE 行输出相对父块坐标 (与 BatchMain 一致), 与 E2E edge-dirs oracle 同 harness.
  const byName = new Map(meta.map(m => [m.name, m]))
  const reCoord = /^\s*NODE (\S+)\s+x=([\d.-]+)\s+y=([\d.-]+)/
  let cur = null, errs = [], ok = 0
  const seenFile = new Set()
  for (const line of stdout.split('\n')) {
    if (line.startsWith('FILE ')) {
      cur = line.slice(5).trim()
      const rec = byName.get(cur)
      if (rec) rec.coords = rec.coords ?? {}
      continue
    }
    if (line.startsWith('ERR ')) {
      const raw = line.slice(4)
      const sp = raw.indexOf(' ')
      const name = raw.slice(0, sp).replace(/:$/, '')
      errs.push({ name, msg: raw.slice(sp + 1) })
      cur = null
      continue
    }
    if (cur) {
      const m = reCoord.exec(line)
      if (m) { byName.get(cur).coords[m[1]] = { x: Number(m[2]), y: Number(m[3]) }; seenFile.add(cur) }
    }
  }
  ok = seenFile.size
  const noEnd = meta.filter(m => !seenFile.has(m.name)).map(m => m.rel)
  if (noEnd.length) {
    console.log(`[oracle] 未采到坐标 (${noEnd.length}):`)
    for (const r of noEnd.slice(0, 30)) console.log('  ' + r)
  }

  // 3b) BatchMain 变体 (ELK 类加载顺序: 单文件 JVM vs 批量 JVM 结果可能不同 — 302 实证:
  // EdgeMain y=23.33 vs BatchMain/elkjs y=12). BatchMain 单 JVM 跑全部, 与 elkjs 同变体;
  // 差异模型写 variants (测试模板 oracle.variants ?? [] 任一匹配即通过).
  let batchCoords = null
  try {
    const r = await execFileP(java, ['-cp', `${out}:${lib}/*`, 'BatchMain', batchDir], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    const byNameB = new Map(meta.map(m => [m.name, {}]))
    const reB = /^\s*([\w.]+)\s+x=([\d.-]+)\s+y=([\d.-]+)/
    let curB = null
    for (const line of (r.stdout ?? '').split('\n')) {
      if (line.startsWith('FILE ')) { curB = line.slice(5).trim(); continue }
      if (line.startsWith('END ') || line.startsWith('ERR ')) { curB = null; continue }
      if (curB) {
        const mB = reB.exec(line)
        if (mB && byNameB.has(curB)) byNameB.get(curB)[mB[1]] = { x: Number(mB[2]), y: Number(mB[3]) }
      }
    }
    batchCoords = byNameB
    const differs = meta.filter(m => m.coords && batchCoords.has(m.name) && Object.keys(batchCoords.get(m.name)).some(
      id => { const a = m.coords[id], b = batchCoords.get(m.name)[id]; return a && b && (Math.abs(a.x - b.x) > 1e-6 || Math.abs(a.y - b.y) > 1e-6) }))
    if (differs.length) console.log(`[oracle] BatchMain 变体差异 ${differs.length} 个: ${differs.map(d => d.graph).join(', ')}`)
  } catch (e) {
    console.log('[oracle] BatchMain 变体运行失败 (跳过): ' + String(e?.message ?? e).slice(0, 120))
  }

  // 4) 写 oracle 文件 + index
  const index = []
  let missing = 0
  for (const m of meta) {
    const expected = m.ids.map(id => 'N' + id)
    const bad = !m.coords || expected.some(id => !m.coords[id])
    if (bad) {
      // ELK jar 自身报错图: 写 err oracle (err 字段), elkt2test 据此生成 expected-crash 测试.
      const errRec = errs.find(e => e.name === m.name || e.name === m.graph || e.name === m.rel || e.name.endsWith('/' + m.name))
      if (errRec) {
        const errOracle = { file: m.rel, graph: m.graph, hash: m.hash, err: errRec.msg }
        writeFileSync(join(OUT_DIR, m.graph + '.json'), JSON.stringify(errOracle) + '\n')
        index.push({ rel: m.rel, graph: m.graph, hash: m.hash, err: errOracle.err })
      }
      missing++
      continue
    }
    const oracle = { file: m.rel, graph: m.graph, hash: m.hash, nodes: m.nodes, edges: m.edges, eps: 1, coords: m.coords }
    // 类加载顺序变体 (BatchMain/elkjs): 与 EdgeMain 不同时记录, 测试任一匹配.
    if (batchCoords && batchCoords.has(m.name)) {
      const bc = batchCoords.get(m.name)
      const differs = expected.some(id => {
        const a = m.coords[id], b = bc[id]
        return a && b && (Math.abs(a.x - b.x) > 1e-6 || Math.abs(a.y - b.y) > 1e-6)
      })
      if (differs) oracle.variants = [{ coords: bc }]
    }
    writeFileSync(join(OUT_DIR, m.graph + '.json'), JSON.stringify(oracle) + '\n')
    index.push({ rel: m.rel, graph: m.graph, hash: m.hash, nodes: m.nodes, edges: m.edges })
  }
  writeFileSync(join(OUT_DIR, 'index.json'), JSON.stringify({ generated: new Date().toISOString(), eps: 1, entries: index }, null, 1) + '\n')

  console.log(`[oracle] OK ${ok} / 总数 ${files.length} | 缺坐标 ${missing} | ERR ${errs.length}`)
  for (const e of errs.slice(0, 20)) console.log(`  ERR ${e.name}: ${e.msg}`)
  if (missing) {
    console.log('[oracle] 缺坐标模型(前 20):')
    for (const m of meta.filter(m => !m.coords || m.ids.some(id => !m.coords['N' + id])).slice(0, 20)) console.log('  ' + m.rel)
  }
} finally {
  rmSync(batchDir, { recursive: true, force: true })
  if (typeof perFileDir !== 'undefined') rmSync(perFileDir, { recursive: true, force: true })
}

