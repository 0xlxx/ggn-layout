#!/usr/bin/env node
/**
 * 包产物「lint」门禁（publint）。
 *
 * 为什么要包一层脚本、而不在 package.json 里直接写 `npx --yes publint`：
 * npm 会把自身配置以 `npm_config_*` 注入子进程。父级 `npm publish --dry-run`
 * 导出的 `npm_config_dry_run=true` 会被 `npx`(npm exec) 继承，于是它「安装」
 * 依赖时也走 dry-run —— 只建出 `_npx/<hash>/` 目录却不落任何文件，紧接着执行
 * 该包就报 `ENOENT ... _npx/<hash>/package.json`。表现为「CI 绿、发布演练红」。
 * 因此这里与 smoke-packed / check-attw / check-doc-links 一样，用 npmEnv() 隔离。
 */
import { execFileSync } from 'node:child_process'

import { npmEnv } from './npm-utils.mjs'

const PUBLINT_VERSION = '0.3.25'

try {
  const out = execFileSync('npx', ['--yes', `publint@${PUBLINT_VERSION}`], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
    env: npmEnv(),
  })
  process.stdout.write(out)
  console.log(`✓ publint ${PUBLINT_VERSION}: 包产物 lint 通过`)
} catch (error) {
  if (error.stdout) process.stdout.write(error.stdout)
  console.error(`✗ publint ${PUBLINT_VERSION}: 包产物 lint 失败`)
  process.exit(error.status ?? 1)
}
