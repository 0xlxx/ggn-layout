#!/usr/bin/env node
/**
 * 包产物「类型解析」门禁。
 *
 * 为什么不用 `attw --ignore-rules no-resolution`：那是**整体**抑制 `NoResolution`，
 * 会让将来任何子路径 `exports` 写错也一并变绿。本脚本只豁免明确的
 * `node10`（EOL，且本包 engines.node >= 20）列，其余列出现任何问题一律 fail。
 */
import { readFileSync } from 'node:fs'

import { captureStdout, npmEnv } from './npm-utils.mjs'

const ATTW_VERSION = '0.18.5'
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

// attw 会自己走打包流程, 要隔离父级 npm 的 dry-run/provenance 配置;
// 输出约 130 KB, 必须绕开 execFileSync 的管道, 否则会以 ~25% 概率被截断到 64 KiB。
// 有 node10 问题时 attw 以非零码退出, 但 stdout 仍是完整 JSON, captureStdout 照常返回。
const { stdout: raw } = captureStdout(
  'npx',
  ['--yes', `@arethetypeswrong/cli@${ATTW_VERSION}`, '--pack', '.', '--format', 'json'],
  { env: npmEnv() },
)

if (raw.trim() === '') {
  console.error(`✗ attw ${ATTW_VERSION} 没有输出任何内容，无法解析分析结果`)
  process.exit(1)
}

const { packageVersion, problems = [] } = JSON.parse(raw).analysis

if (packageVersion !== pkg.version) {
  console.error(`✗ attw 分析的是 ggn-layout@${packageVersion}, 与 package.json 的 ${pkg.version} 不一致`)
  process.exit(1)
}

// 唯一豁免：node10 列解析不到子路径 exports（该运行时 EOL 且不在支持范围内）。
const exempt = (problem) => problem.resolutionKind === 'node10' && problem.kind === 'NoResolution'
const fatal = problems.filter((problem) => !exempt(problem))

if (fatal.length > 0) {
  console.error(`✗ 类型解析门禁失败：${fatal.length} 个非 node10 问题`)
  for (const problem of fatal) {
    console.error(`  - [${problem.resolutionKind}] ${problem.entrypoint}: ${problem.kind}`)
  }
  process.exit(1)
}

console.log(
  `✓ attw ${ATTW_VERSION}: ggn-layout@${packageVersion} 无解析问题` +
    (problems.length > 0 ? `（已豁免 ${problems.length} 个 node10 NoResolution）` : ''),
)
