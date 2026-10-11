#!/usr/bin/env node
/**
 * 发布链路工具链版本门禁。
 *
 * `ci.yml` 与 `release.yml` 各自声明 `env.NPM_VERSION`，两份必须：
 *   1. 完全相同 —— `npm pack` 的行为与 `npm pack --json` 的输出结构随 npm 大版本变过
 *      （2026-10-11 实测：npm 12 把该输出从数组改成按包名索引的对象，曾让 release 卡在
 *      `smoke:pack`）。CI 用 A 版本、release 用 B 版本就会出现「CI 绿而 release 红」。
 *   2. 是精确版本 —— 发布 job 持有 `id-token`（可换 npm 身份）与 `contents` 写权限，
 *      浮动版本（`latest` / `^` / `~` / 范围）等于把该身份交给不可复现的工具链。
 *
 * 升级请走显式 PR，并同时改两处。
 */
import { readFileSync } from 'node:fs'

const WORKFLOWS = ['.github/workflows/ci.yml', '.github/workflows/release.yml']
const ENV_LINE = /^[ \t]*NPM_VERSION:[ \t]*(.+?)[ \t]*$/mu
const EXACT_SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/

const problems = []
const found = []

for (const file of WORKFLOWS) {
  const match = ENV_LINE.exec(readFileSync(file, 'utf8'))
  if (!match) {
    problems.push(`${file}: 未声明 \`env.NPM_VERSION\``)
    continue
  }
  found.push({ file, version: match[1] })
}

for (const { file, version } of found) {
  if (!EXACT_SEMVER.test(version)) {
    problems.push(`${file}: NPM_VERSION=\`${version}\` 不是精确版本（禁 latest / ^ / ~ / 范围）`)
  }
}

const distinct = [...new Set(found.map((item) => item.version))]
if (distinct.length > 1) {
  problems.push(
    `NPM_VERSION 不一致：${found.map((item) => `${item.file}=\`${item.version}\``).join(' vs ')}` +
      ' —— 两处必须同步升级',
  )
}

if (problems.length > 0) {
  console.error(`✗ 工作流工具链门禁失败（${problems.length} 处）：`)
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exit(1)
}

console.log(`✓ 工作流工具链一致：NPM_VERSION=${distinct[0]}（${found.length} 处声明）`)
