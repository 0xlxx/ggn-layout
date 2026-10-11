/**
 * 门禁: 发布构建的 process.env define 必须覆盖 src/shared 里所有实际使用.
 *
 * 背景: 浏览器 bundle 里 `process` 是 undefined, 任何未 define 的 `process.env.X`
 * 都会在执行到该分支时抛 ReferenceError, 同时保留死码. tsdown.config.ts 的
 * GGN_DEFINE 必须把每个 `process.env.X` 映射为 undefined (等价未设置).
 *
 * 用法: node scripts/check-process-env-defines.mjs [--fix-config]
 * exit 0 = 全覆盖; exit 1 = 有缺失.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) yield* walk(p)
    else if (p.endsWith('.ts')) yield p
  }
}

/** 去掉注释后返回可匹配代码文本（避免把注释里的 process.env.GGN_* 当引用）. */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function usedEnvNames() {
  const names = new Set()
  for (const dir of ['src', 'shared']) {
    for (const file of walk(join(ROOT, dir))) {
      const src = stripComments(readFileSync(file, 'utf8'))
      for (const m of src.matchAll(/process\.env\.([A-Za-z_][A-Za-z0-9_]*)/g)) names.add(m[1])
    }
  }
  return names
}

function definedEnvNames() {
  const cfg = readFileSync(join(ROOT, 'tsdown.config.ts'), 'utf8')
  return new Set([...cfg.matchAll(/process\.env\.([A-Za-z_][A-Za-z0-9_]*)/g)].map(m => m[1]))
}

const used = usedEnvNames()
const defined = definedEnvNames()
const missing = [...used].filter(n => !defined.has(n))

if (missing.length > 0) {
  console.error('[check-process-env-defines] tsdown.config.ts 缺失以下 define:')
  for (const n of missing) console.error('  process.env.' + n)
  console.error('请在 tsdown.config.ts 的 GGN_DEFINE 中补: ' + missing.map(n => `['process.env.${n}', 'undefined']`).join(', '))
  process.exit(1)
}

console.log(`[check-process-env-defines] OK: ${used.size} 个 process.env.X 全部被 define (${defined.size} 条).`)
