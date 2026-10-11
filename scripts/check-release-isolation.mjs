#!/usr/bin/env node
/**
 * 发布 job 隔离门禁。
 *
 * `release.yml` 把「构建/测试」与「发布」拆成两个 job，发布 job 是本仓唯一持有
 * `id-token: write`（可换 npm Trusted Publishing 身份 + provenance）与 `contents: write`
 * 的地方。它的安全前提是**不执行提交里的任何代码**：不 checkout、不装依赖、不跑脚本，
 * 只对 build job 用不可变产物换来的 tarball 调 npm。
 *
 * 这条前提一旦被无声改掉（例如有人为了补回 `gitHead` 顺手加回 `actions/checkout`，
 * 或把某个 `node scripts/*.mjs` 挪进发布 job），一个被污染的提交/依赖就能拿到发布身份。
 * 校验「已发布版本来源提交」的步骤因此被刻意写成**内联**脚本（见 release.yml 注释）。
 *
 * 本门禁把上述不变量固化为可执行断言；改动请走显式 PR 并同步本文件注释。
 */
import { readFileSync } from 'node:fs'

// 可选 argv[2] 覆盖工作流路径，便于对门禁自身做负例测试。
const workflow = process.argv[2] ?? '.github/workflows/release.yml'
const text = readFileSync(workflow, 'utf8')
const lines = text.split('\n')

// job 名在 YAML 里位于两个空格缩进（`jobs:` 下的一级键）。
const JOB_HEADER = /^ {2}([A-Za-z0-9_-]+):\s*$/
const jobsStart = lines.findIndex((line) => /^jobs:\s*$/.test(line))
if (jobsStart === -1) {
  console.error(`✗ 发布隔离门禁失败：${workflow} 里找不到顶层 \`jobs:\``)
  process.exit(1)
}

/** 取某个 job 的完整文本块（从它到下一个 job 名之前）。 */
function jobBlock(name) {
  const start = lines.findIndex((line) => JOB_HEADER.exec(line)?.[1] === name)
  if (start === -1) return null
  let end = lines.length
  for (let i = start + 1; i < lines.length; i++) {
    if (JOB_HEADER.test(lines[i])) {
      end = i
      break
    }
  }
  return lines.slice(start, end).join('\n')
}

const jobNames = []
for (let i = jobsStart + 1; i < lines.length; i++) {
  const match = JOB_HEADER.exec(lines[i])
  if (match) jobNames.push(match[1])
}

const OIDC_GRANT = /id-token:\s*write/
const CHECKOUT = /actions\/checkout@/

const problems = []

if (!jobNames.includes('publish')) {
  problems.push('找不到 `publish` job —— 发布链路结构变了，请同步本门禁')
}

for (const name of jobNames) {
  const block = jobBlock(name) ?? ''
  const hasOidc = OIDC_GRANT.test(block)

  if (name === 'publish') {
    if (!hasOidc) problems.push('`publish` job 未声明 `id-token: write`（Trusted Publishing 需要）')
    if (CHECKOUT.test(block)) {
      problems.push(
        '`publish` job 出现了 `actions/checkout` —— 发布 job 不得 checkout/执行仓库代码，' +
          '否则该提交的代码可以拿到 npm 发布身份',
      )
    }
  } else if (hasOidc) {
    problems.push(`\`${name}\` job 声明了 \`id-token: write\` —— 只有 \`publish\` 可以持有 OIDC 身份`)
  }
}

if (problems.length > 0) {
  console.error(`✗ 发布隔离门禁失败（${problems.length} 处）：`)
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exit(1)
}

console.log(`✓ 发布 job 隔离成立：仅 \`publish\` 持有 id-token，且不 checkout 仓库代码（共 ${jobNames.length} 个 job）`)
