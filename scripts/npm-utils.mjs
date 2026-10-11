/**
 * 嵌套调用 npm 时的两个坑，都在 2026-10-11 的 release dry-run 里真实踩到过：
 *
 * 1. `npm pack --json` 的输出结构随 npm 大版本变过：
 *    npm ≤ 11 是数组 `[{ filename }]`，npm ≥ 12 是以包名为键的对象
 *    `{ "ggn-layout": { filename } }`。而 release.yml 用 `npm install -g npm@latest`、
 *    CI 用 Node 自带 npm，两者大版本不同 → 必须归一化，避免「CI 绿、release 红」。
 *
 * 2. npm 会把自身配置以 `npm_config_*` 注入子进程环境。父级 `npm publish --dry-run`
 *    会导出 `npm_config_dry_run=true`，导致我们脚本里嵌套的 `npm pack` **静默不产出
 *    tarball**。因此嵌套调用 npm 时必须剥掉这类会改变语义的变量。
 */

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
