/**
 * 嵌套调用 npm / npx 时的三个坑，都在 2026-10-11 的 release dry-run 里真实踩到过：
 *
 * 1. `npm pack --json` 的输出结构随 npm 大版本变过：
 *    npm ≤ 11 是数组 `[{ filename }]`，npm ≥ 12 是以包名为键的对象
 *    `{ "ggn-layout": { filename } }`。而 release.yml 用 `npm install -g npm@latest`、
 *    CI 用 Node 自带 npm，两者大版本不同 → 必须归一化，避免「CI 绿、release 红」。
 *
 * 2. npm 会把自身配置以 `npm_config_*` 注入子进程环境。父级 `npm publish --dry-run`
 *    会导出 `npm_config_dry_run=true`，导致我们脚本里嵌套的 `npm pack` **静默不产出
 *    tarball**，也会让 `npx` **只建目录不装包**。因此嵌套调用 npm/npx 时必须剥掉
 *    这类会改变语义的变量。
 *
 * 3. Node 的同步 spawn 在大输出（超过 64 KiB 管道容量）下会截断 stdout。attw 的
 *    `--format json` 约 130 KB，实测约 25% 概率被截到恰好 65536 字节，表现为
 *    `JSON.parse` 报 `Unterminated string in JSON at position 65536` —— 一个
 *    「跑十次挂两次」的偶发门禁。要拿大输出就走 captureStdout()，别用管道。
 */
import { execFileSync } from 'node:child_process'
import { closeSync, mkdtempSync, openSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** @returns {Array<{ filename: string }>} */
export function parsePackJson(output) {
  const parsed = JSON.parse(output)
  const entries = Array.isArray(parsed) ? parsed : Object.values(parsed)
  if (entries.length === 0 || typeof entries[0]?.filename !== 'string') {
    throw new Error(`无法解析 npm pack --json 输出: ${String(output).slice(0, 200)}`)
  }
  return entries
}

/** 继承当前环境，但剥离父级 npm 传入的、会改写子命令语义的配置。 */
export function npmEnv(extra = {}) {
  const env = { ...process.env, ...extra }
  for (const key of Object.keys(env)) {
    if (/^npm_config_(dry[-_]run|provenance)$/i.test(key)) delete env[key]
  }
  return env
}

/**
 * 同步执行子进程并取回它的 stdout —— 绕开管道，直接重定向到临时文件。
 *
 * 见文件头第 3 条：`execFileSync` 的管道在输出超过 64 KiB 时可能被截断，
 * 而「输出很大」恰恰是本仓库这些门禁的常态（attw 的 JSON 约 130 KB）。
 *
 * 子进程以非零码退出时**不抛异常**，仍把 stdout 返回给调用方：attw 这类工具
 * 用非零退出码表达「发现了问题」，但 stdout 依然是完整可解析的 JSON。
 * 只有「进程压根没起来」（如 ENOENT）才向上抛。
 *
 * @returns {{ stdout: string, status: number }}
 */
export function captureStdout(command, args, options = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'ggn-capture-'))
  const stdoutPath = join(dir, 'stdout')
  const fd = openSync(stdoutPath, 'w')
  let status = 0
  try {
    execFileSync(command, args, {
      cwd: options.cwd,
      env: options.env,
      // stdin 关掉, stderr 原样透传(进度/告警), stdout 落到文件而不是管道.
      stdio: ['ignore', fd, 'inherit'],
    })
  } catch (error) {
    if (typeof error.status !== 'number') throw error
    status = error.status
  } finally {
    closeSync(fd)
  }
  const stdout = readFileSync(stdoutPath, 'utf8')
  rmSync(dir, { recursive: true, force: true })
  return { stdout, status }
}
