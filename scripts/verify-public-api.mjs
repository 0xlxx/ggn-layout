#!/usr/bin/env bun
/**
 * 公共 API 与发布边界导出集合门禁（真实运行时枚举，非正则）。
 *
 * 运行：bun scripts/verify-public-api.mjs
 * 断言：
 *   1. public.ts 的值导出 == manifest.publicValues；
 *   2. internal.ts ⊇ manifest.internalValues；
 *   3. index.ts 兼容层 ⊇ public ∪ internal 的旧根导出；
 *   4. options.ts 的值导出 == manifest.optionsValues；
 *   5. root 兼容层包含公共、内部以及 options 门面中属于旧根内部边界的符号。
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const manifest = JSON.parse(readFileSync(new URL('../docs/api-manifest.json', import.meta.url), 'utf8'))

const publicMod = await import(new URL('../src/public.ts', import.meta.url).href)
const internalMod = await import(new URL('../src/internal.ts', import.meta.url).href)
const optionsMod = await import(new URL('../src/options.ts', import.meta.url).href)
const rootMod = await import(new URL('../src/index.ts', import.meta.url).href)

const keys = (moduleNamespace) => Object.keys(moduleNamespace)
  .filter((key) => key !== 'default')
  .sort()
const sort = (values) => [...new Set(values)].sort()

const pKeys = keys(publicMod)
const iKeys = keys(internalMod)
const oKeys = keys(optionsMod)
const rKeys = keys(rootMod)
const checks = []

function check(name, ok, detail) {
  checks.push({ name, ok, ...(detail === undefined ? {} : { detail }) })
}

check('public-values-exact', JSON.stringify(pKeys) === JSON.stringify(sort(manifest.publicValues)), {
  public: pKeys,
  expected: sort(manifest.publicValues),
})

const missingInternal = sort(manifest.internalValues).filter((key) => !iKeys.includes(key))
check('internal-contains-all', missingInternal.length === 0, { missingInternal })

const missingRoot = sort([...manifest.publicValues, ...manifest.internalValues])
  .filter((key) => !rKeys.includes(key))
check('root-compat-contains-all', missingRoot.length === 0, { missingRoot })

check('public-has-no-lowlevel', !pKeys.some((key) => [
  'buildGraph', 'extractGraph', 'LGraph', 'LNode', 'Property',
].includes(key)), { publicKeys: pKeys })

check('options-values-exact', JSON.stringify(oKeys) === JSON.stringify(sort(manifest.optionsValues)), {
  options: oKeys,
  expected: sort(manifest.optionsValues),
})

// HIERARCHY_HANDLING is the only options value intentionally retained by the
// historical root through internal.ts. Algorithm helpers remain options-only.
const rootRequired = sort([
  ...manifest.publicValues,
  ...manifest.internalValues,
  ...manifest.optionsValues.filter((key) => manifest.internalValues.includes(key)),
])
const missingRootRequired = rootRequired.filter((key) => !rKeys.includes(key))
check('root-contains-public-internal-options', missingRootRequired.length === 0, {
  missingRoot: missingRootRequired,
})

const ok = checks.every((item) => item.ok)
console.log(JSON.stringify({ ok, checks, root }, null, 2))
if (!ok) process.exit(1)
