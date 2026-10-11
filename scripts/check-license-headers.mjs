#!/usr/bin/env node
/**
 * 许可头门禁。
 *
 * 本包是 Eclipse Layout Kernel (ELK) v0.12.0 的 1:1 TypeScript 移植：`src/**` 与
 * `shared/**` 的实现均为 ELK 衍生作品，以 EPL-2.0 授权。EPL-2.0 §3.1 / §3.3 要求在
 * 再分发时保留版权与许可声明，§3.1(a) 要求随程序声明源码获取途径（见
 * THIRD_PARTY_NOTICES.md）；`dist/**` 的每个产物由 tsdown 注入同一份归属 banner。
 *
 * 本脚本保证：
 *   1. `src/**`、`shared/**` 的每个 `.ts` 都有 EPL-2.0 SPDX 头 + ELK 归属行；
 *   2. 无法承载注释头的新文件（非 `.ts`）必须登记，不能静默溜过门禁；
 *   3. `dist/**` 存在时，每个发布产物都带归属 banner（防止 minify/配置回退把声明吃掉）；
 *   4. `package.json` / `LICENSE` / `README.md` / `THIRD_PARTY_NOTICES.md` 的
 *      许可口径互相一致（避免 0.1.0 那种「元数据说 MIT、实际是 EPL 衍生」的错配）。
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

const SOURCE_DIRS = ['src', 'shared', 'schema']
const SPDX_SOURCE = 'SPDX-License-Identifier: EPL-2.0'
const ATTRIBUTION = 'Portions derived from the Eclipse Layout Kernel (ELK)'
// 许可口径的单一真源是 package.json 的 `license` 字段：banner / LICENSE / README /
// THIRD_PARTY_NOTICES 全部由它派生，门禁不再各写一份字面量。否则 banner 与元数据
// 会各按自己的字符串校验，中间那条边没人守，就能静默漂移（本轮复审的 P1-1 即此类）。
const PACKAGE_LICENSE = JSON.parse(readFileSync('package.json', 'utf8')).license
const DIST_SPDX = `SPDX-License-Identifier: ${PACKAGE_LICENSE}`
const DIST_EXTS = ['.js', '.cjs', '.d.ts', '.d.cts']

/**
 * 无法写入注释头的文件：必须显式登记，说明它的许可归属落在哪里。
 * 新增非 `.ts` 源码文件时，这里不加条目就会让 CI 变红。
 */
const NON_TS_SOURCES = new Map([
  [
    'schema/layout-input.schema.json',
    'JSON 无注释语法；归属与许可按 src/** 同一口径（EPL-2.0）在 THIRD_PARTY_NOTICES.md 登记',
  ],
])

const problems = []

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return walk(full)
    return [full]
  })
}

let epl = 0
let skipped = 0
for (const dir of SOURCE_DIRS) {
  for (const file of walk(dir).sort()) {
    if (!file.endsWith('.ts')) {
      if (!NON_TS_SOURCES.has(file)) {
        problems.push(`${file}: 非 .ts 文件无法带 SPDX 头，必须登记到 NON_TS_SOURCES 并在 THIRD_PARTY_NOTICES.md 说明归属`)
      } else {
        skipped++
      }
      continue
    }
    // 头部可能很长（含上游版权行），放宽到 4 KiB。
    const head = readFileSync(file, 'utf8').slice(0, 4096)
    if (!head.includes(SPDX_SOURCE)) {
      problems.push(`${file}: 缺少 \`${SPDX_SOURCE}\`（ELK 衍生实现一律 EPL-2.0）`)
      continue
    }
    if (!head.includes(ATTRIBUTION)) {
      problems.push(`${file}: 缺少 ELK 归属行 \`${ATTRIBUTION}\``)
      continue
    }
    epl++
  }
}

if (existsSync('dist')) {
  for (const file of walk('dist').sort()) {
    if (!DIST_EXTS.some((ext) => file.endsWith(ext))) continue
    const head = readFileSync(file, 'utf8').slice(0, 2048)
    if (!head.includes(DIST_SPDX)) {
      problems.push(`${file}: 发布产物缺少归属 banner（\`${DIST_SPDX}\`）`)
    }
  }
}

// ── 许可口径一致性：元数据 / LICENSE / README / NOTICE 必须同一口径 ──

if (typeof PACKAGE_LICENSE !== 'string' || PACKAGE_LICENSE.length === 0) {
  problems.push('package.json 缺少 `license` 字段 —— 它是许可口径的单一真源')
}
for (const [file, marker] of [
  ['LICENSE', PACKAGE_LICENSE],
  ['README.md', PACKAGE_LICENSE],
  ['THIRD_PARTY_NOTICES.md', PACKAGE_LICENSE],
]) {
  if (!readFileSync(file, 'utf8').includes(marker)) {
    problems.push(`${file}: 未声明统一许可口径 \`${PACKAGE_LICENSE}\``)
  }
}

if (problems.length > 0) {
  console.error(`✗ 许可检查失败（${problems.length} 处）：`)
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exit(1)
}

const distNote = existsSync('dist') ? '，dist 产物 banner 齐全' : ''
console.log(`✓ 许可检查通过（EPL-2.0 源码 ${epl} 个，登记的非 .ts ${skipped} 个${distNote}）`)
