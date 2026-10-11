/**
 * 边路由 E2E (正交路由, L1 SSOT = ELK Java 0.12.0 jar oracle).
 *
 * 背景: 坐标差分测试只查**节点位置**; 正交路由的弯点/路径差异正是坐标差分查不到的盲区
 * (例如层级边斜线、弯点 x 偏移等). 本测试断言每条边的**弯点**与 jar oracle 逐点一致 (ε=2).
 *
 * 用例正交: 每张图 × 每个方向 (RIGHT/LEFT/DOWN/UP) = 一个独立用例 (it.each 行).
 * 方向维度专门捕获「某方向对、其余方向错」的边路由回归 — 用户实测: 一个方向对, 三个方向全错.
 *
 * 门禁语义 (注册表 test-resources/edge-e2e-registry.json, scripts/scan-edge-e2e.mjs --write):
 *   - 当前通过 → 必须通过 (回归即失败).
 *   - 已知失败 (registry.cases[*].ok=false) → 必须仍失败; 若修复通过, 断言失败并提示移入门禁.
 *   - oracle 变更时注册表 hash 不匹配 → 报错提示重新生成 (防止静默不一致).
 *
 * 范围: 平坦/层级 + 正交路由 (含自环), 非交互. 排除 SPLINES/POLYLINE (非正交).
 * 层级图 2026-08-08 分层锁步修复后纳入 (resize 在 canonical 坐标 + 子图尺寸同步 → 方向回变换正确).
 */
import { describe, expect, it } from 'vitest'
import { DIRS, EPS, compareSafe, collectCases, loadOracle, loadRegistry, oracleHash } from '../../scripts/edge-e2e-lib.mjs'

const registry = loadRegistry()
const KNOWN = new Map(Object.entries(registry.cases).filter(([, v]) => !v.ok))
const oracle = loadOracle()
const cases = collectCases(oracle)

function checkCase(rel: string, dir: string, key: string) {
  const r = compareSafe(rel, dir, oracle)
  const known = KNOWN.get(key)
  if (known) {
    // 已知失败: 必须仍失败 (崩溃也算失败: crashed 时 fails=[]). 修复通过 → 此断言失败 → 移入门禁.
    expect(r.crashed || r.fails.length > 0, `${key} 已知失败 (${known.reason}) 现已通过 — 请移入门禁 (重跑 scan-edge-e2e.mjs --write)`).toBeTruthy()
    return
  }
  const detail = r.fails.map(f => `  ${f.edge} ggn=${JSON.stringify(f.ggn)} jar=${JSON.stringify(f.jar)}`).join('\n')
  expect(r.fails, `${key} 边弯点与 jar 不一致 (${r.matched}/${r.nEdges} 匹配, ε=${EPS}):\n${detail}`).toEqual([])
}

describe('边路由 E2E · 正交路由 (jar oracle ε=2)', () => {
  it('注册表与 oracle 同步 (重新生成: bun scripts/scan-edge-e2e.mjs --write)', () => {
    expect(registry.oracleHash, 'edge-dirs-oracle.json 已变更, 请重跑 scan-edge-e2e.mjs --write').toBe(oracleHash())
  })

  for (const dir of DIRS) {
    describe(`${dir} 方向`, () => {
      const flat = cases.filter(c => c.dir === dir && c.cat === 'flat')
      const sl = cases.filter(c => c.dir === dir && c.cat === 'selfloop')
      if (flat.length > 0) {
        it.each(flat)('平坦: $rel — 边弯点与 jar 一致', ({ rel, dir: d, key }) => checkCase(rel, d, key))
      }
      if (sl.length > 0) {
        it.each(sl)('自环: $rel — 自环边弯点与 jar 一致', ({ rel, dir: d, key }) => checkCase(rel, d, key))
      }
      const hier = cases.filter(c => c.dir === dir && c.cat === 'hier')
      if (hier.length > 0) {
        it.each(hier)('层级: $rel — 层级边弯点与 jar 一致', ({ rel, dir: d, key }) => checkCase(rel, d, key))
      }
    })
  }
})
