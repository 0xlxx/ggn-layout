/**
 * `npm pack --json` 的输出结构随 npm 大版本变过：
 *   - npm ≤ 11：数组 `[{ filename, ... }]`
 *   - npm ≥ 12：以包名为键的对象 `{ "ggn-layout": { filename, ... } }`
 *
 * 而 `release.yml` 用 `npm install -g npm@latest` 发布、CI 用 Node 自带 npm，
 * 两者大版本不一致。统一在这里归一化，避免「CI 绿、release 红」
 * （2026-10-11 由 release dry-run 实测暴露）。
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
