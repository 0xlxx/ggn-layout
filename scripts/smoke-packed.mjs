#!/usr/bin/env node
/**
 * 发布产物冒烟门禁: `npm pack` → 安装到临时消费方目录 → 通过 package `exports`
 * 真实解析导入, 分别跑 ESM / CJS 双份产物.
 *
 * 拦截的回归 (均为「构建/打包正确、产物坏掉」这一类的静默失败):
 *   1. 完整入口 `ggn-layout` 的裸副作用 `import './register-all.js'` 被 tree-shaker 摇掉 →
 *      除 layered 外的 13 个算法全部抛 `LayoutError: 布局算法 'X' 未注册`.
 *      (历史事故: package.json 声明白名单式 `sideEffects` 时触发; 见 docs/PORTING.md §6.18)
 *   2. layered 子入口把非 layered provider 实现也拉进模块图 → tree-shaking 收益归零.
 *   3. package.json 的 `sideEffects` 声明过激 (白名单) 时, **下游打包器**会把承载算法注册的 chunk
 *      摇掉: 未打包直接 import 仍然正常, 只有把它 bundle 起来才会崩 —— 故必须真的过一遍 bundler.
 *
 * 退出码 0 表示双入口 / 双格式 / 双维度 (可运行 + 体积分层) 全部通过.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const workDir = mkdtempSync(join(tmpdir(), 'ggn-layout-smoke-'))
const consumerDir = join(workDir, 'consumer')

/** layered 入口必须比完整入口小至少这么多字节, 否则说明非 layered provider 被带进了 layered 图. */
const MIN_LAYERING_GAP_BYTES = 100_000

/** mrtree: 树化 DFS 布局, 与算法选项表无关的纯 provider 实现. */
const MRTREE_INPUT = {
  id: 'root',
  layoutOptions: { 'org.eclipse.elk.algorithm': 'org.eclipse.elk.mrtree', 'org.eclipse.elk.direction': 'DOWN' },
  children: [
    { id: 'a', width: 80, height: 40 },
    { id: 'b', width: 60, height: 30 },
    { id: 'c', width: 60, height: 30 },
  ],
  edges: [
    { id: 'a-b', sources: ['a'], targets: ['b'] },
    { id: 'a-c', sources: ['a'], targets: ['c'] },
  ],
}

/** layered: 分层布局, 子入口必须能独立跑通. */
const LAYERED_INPUT = {
  id: 'root',
  layoutOptions: { 'org.eclipse.elk.algorithm': 'org.eclipse.elk.layered', 'org.eclipse.elk.direction': 'RIGHT' },
  children: [
    { id: 'a', width: 40, height: 24 },
    { id: 'b', width: 40, height: 24 },
  ],
  edges: [{ id: 'a-b', sources: ['a'], targets: ['b'] }],
}

const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { cwd: repoRoot, stdio: ['ignore', 'inherit', 'inherit'], ...opts })

const hasCommand = (cmd) => {
  try {
    execFileSync('sh', ['-c', `command -v ${cmd}`], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

/** 子进程探针: 失败时只回显尾部, 避免 Node 把整份 chunk 源码打进来. */
function runProbe(script) {
  try {
    const out = execFileSync(process.execPath, [script], {
      cwd: consumerDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    process.stdout.write(out)
  } catch (error) {
    // Node 打印 ESM 报错时会把整行源码带出来 (单行可达数百 KB) → 逐行截断.
    const tail = (s) =>
      String(s ?? '')
        .split('\n')
        .filter(Boolean)
        .slice(-6)
        .map((line) => (line.length > 300 ? `${line.slice(0, 300)}…` : line))
        .join('\n')
    throw new Error(`探针 ${script} 失败\n${tail(error.stdout)}\n${tail(error.stderr)}`)
  }
}

const fail = (message) => {
  console.error(`\n✖ 产物冒烟失败: ${message}`)
  process.exitCode = 1
}

/** 收集 ESM 静态 import 的传递闭包 (tsdown 产出的相对 specifier), 返回总字节数. */
function importClosureBytes(entryFile, seen = new Set()) {
  const absolute = statSync(entryFile).isDirectory() ? null : entryFile
  if (absolute === null || seen.has(absolute)) return 0
  seen.add(absolute)
  const source = readFileSync(absolute, 'utf8')
  let bytes = statSync(absolute).size
  const specifiers = [...source.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map((m) => m[1])
  for (const specifier of specifiers) {
    if (!specifier.startsWith('.')) continue
    bytes += importClosureBytes(resolve(dirname(absolute), specifier), seen)
  }
  return bytes
}

try {
  // 1) 打包 (npm pack 的 prepack 生命周期不在此触发, 需先确保 dist 已构建)
  if (!existsSync(join(repoRoot, 'dist', 'index.js'))) {
    throw new Error('dist/index.js 不存在 —— 请先 `bun run build`')
  }
  const packOutput = execFileSync('npm', ['pack', '--json', '--pack-destination', workDir], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
  const [{ filename }] = JSON.parse(packOutput)
  const tarball = join(workDir, filename)

  // 2) 安装到干净消费方目录, 走真实 exports 解析 (而非直接 import dist 相对路径)
  mkdirSync(consumerDir, { recursive: true })
  execFileSync('npm', ['init', '-y'], { cwd: consumerDir, stdio: 'ignore' })
  execFileSync('npm', ['install', '--no-save', '--no-audit', '--no-fund', tarball], {
    cwd: consumerDir,
    stdio: 'ignore',
  })
  const installed = join(consumerDir, 'node_modules', 'ggn-layout')

  // 3) ESM: 完整入口 (非 layered 算法) + layered 子入口
  writeFileSync(join(consumerDir, 'probe.mjs'), `import { layoutElkJson } from 'ggn-layout'
import { layoutElkJson as layered } from 'ggn-layout/layered'
const assert = (ok, msg) => { if (!ok) { console.error('✖ ' + msg); process.exit(1) } }
const tree = layoutElkJson(${JSON.stringify(MRTREE_INPUT)})
assert(tree.children?.length === 3, '完整入口 mrtree 未返回 3 个节点')
const placed = tree.children.filter((n) => Number.isFinite(n.x) && Number.isFinite(n.y))
assert(placed.length === 3, '完整入口 mrtree 未给出节点几何: ' + JSON.stringify(tree.children))
const l = layered(${JSON.stringify(LAYERED_INPUT)})
assert(l.children?.length === 2 && Number.isFinite(l.children[0].x), 'layered 子入口未给出节点几何')
console.log('✔ ESM: ggn-layout 完整入口 (mrtree) + ggn-layout/layered 均可用')
`)
  runProbe(join(consumerDir, 'probe.mjs'))

  // 4) CJS: 双条件 types/require 产物
  writeFileSync(join(consumerDir, 'probe.cjs'), `const { layoutElkJson } = require('ggn-layout')
const { layoutElkJson: layered } = require('ggn-layout/layered')
const tree = layoutElkJson(${JSON.stringify(MRTREE_INPUT)})
if (!(tree.children?.length === 3 && Number.isFinite(tree.children[0].x))) { console.error('✖ CJS 完整入口 mrtree 不可用'); process.exit(1) }
const l = layered(${JSON.stringify(LAYERED_INPUT)})
if (!(l.children?.length === 2 && Number.isFinite(l.children[0].x))) { console.error('✖ CJS layered 子入口不可用'); process.exit(1) }
console.log('✔ CJS: ggn-layout 完整入口 (mrtree) + ggn-layout/layered 均可用')
`)
  runProbe(join(consumerDir, 'probe.cjs'))

  // 5) 体积分层: layered 图必须显著小于完整入口图 (provider 实现未泄漏进 layered)
  const fullBytes = importClosureBytes(join(installed, 'dist', 'index.js'))
  const layeredBytes = importClosureBytes(join(installed, 'dist', 'api', 'layered.js'))
  const gap = fullBytes - layeredBytes
  if (gap < MIN_LAYERING_GAP_BYTES) {
    fail(
      `layered 入口未与完整入口拉开差距: full=${fullBytes}B layered=${layeredBytes}B gap=${gap}B (期望 ≥ ${MIN_LAYERING_GAP_BYTES}B)`,
    )
  } else {
    console.log(`✔ 体积分层: full=${fullBytes}B layered=${layeredBytes}B gap=${gap}B (≥ ${MIN_LAYERING_GAP_BYTES}B)`)
  }

  // 6) 下游 bundler 的 tree-shaking: 消费方只 import layoutElkJson 时, 承载 register-all 的 chunk
  //    仍必须被打包器保留, 否则打包后的应用跑非 layered 算法会抛「未注册」.
  if (!hasCommand('bun')) {
    console.warn('⚠ 跳过「下游打包器」检查: 未找到 bun')
  } else {
    writeFileSync(join(consumerDir, 'bundle-entry.mjs'), `import { layoutElkJson } from 'ggn-layout'
const out = layoutElkJson(${JSON.stringify(MRTREE_INPUT)})
if (!(out.children?.length === 3 && Number.isFinite(out.children[0].x))) {
  console.error('✖ 打包后的完整入口 mrtree 不可用 (register-all 被 bundler 摇掉?)'); process.exit(1)
}
console.log('✔ 下游 bundler: 打包后的 ggn-layout 仍可运行非 layered 算法')
`)
    execFileSync('bun', ['build', 'bundle-entry.mjs', '--target=node', '--minify', '--outfile=bundled.mjs'], {
      cwd: consumerDir,
      stdio: 'ignore',
    })
    runProbe(join(consumerDir, 'bundled.mjs'))
  }
} catch (error) {
  fail(error?.message ?? String(error))
} finally {
  rmSync(workDir, { recursive: true, force: true })
}
