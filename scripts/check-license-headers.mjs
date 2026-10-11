#!/usr/bin/env node
/**
 * 许可头门禁。
 *
 * `src/**` 里的算法实现是 ELK（EPL-2.0）的衍生作品，EPL-2.0 §3.1 要求在再分发时
 * 保留版权与许可声明。本仓库把声明落在每个源文件的首部 SPDX 头里（见
 * THIRD_PARTY_NOTICES.md），这个脚本保证新增文件不会漏掉、也不会被打错标签。
 *
 * 口径（与 THIRD_PARTY_NOTICES.md「本仓库自有内容」一节对应）：
 *   - GGN 自有的对外 API / 校验与错误契约 / worker 外壳 → MIT
 *   - 其余 `src/**`（ELK 移植部分）                        → EPL-2.0
 *
 * 非 `.ts` 文件（如 `src/api/layout-input.schema.json`）无法承载注释，跳过。
 */
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

/** GGN 自有文件（对应 THIRD_PARTY_NOTICES.md「本仓库自有内容」），其余一律按 ELK 衍生算。 */
const MIT_FILES = new Set([
  'src/index.ts',
  'src/public.ts',
  'src/internal.ts',
  'src/options.ts',
  'src/globals.d.ts',
  'src/layout-worker.ts',
])
const isMitFile = (file) => MIT_FILES.has(file) || file.startsWith('src/api/')

const SPDX = /SPDX-License-Identifier:\s*(\S+)/

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return walk(full)
    return entry.name.endsWith('.ts') ? [full] : []
  })
}

const problems = []
let mit = 0
let epl = 0

for (const file of walk('src').sort()) {
  const head = readFileSync(file, 'utf8').slice(0, 1024)
  const match = head.match(SPDX)
  if (!match) {
    problems.push(`${file}: 缺少 SPDX-License-Identifier 头`)
    continue
  }
  const expected = isMitFile(file) ? 'MIT' : 'EPL-2.0'
  if (match[1] !== expected) {
    problems.push(`${file}: SPDX 头是 ${match[1]}, 期望 ${expected}（见 THIRD_PARTY_NOTICES.md 来源范围）`)
    continue
  }
  expected === 'MIT' ? mit++ : epl++
}

if (problems.length > 0) {
  console.error(`✗ 许可头检查失败（${problems.length} 处）：`)
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exit(1)
}

console.log(`✓ 许可头检查通过（EPL-2.0 ${epl} 个, MIT ${mit} 个）`)
