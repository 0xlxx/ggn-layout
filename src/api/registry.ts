/**
 * 算法 provider 注册表 (tree-shaking 基础设施).
 *
 * elk-json.ts 的 runCoreProviders 通过本注册表分派非 layered 算法, 不再静态 import
 * 全部 provider. 完整入口 (src/index.ts / src/api/register-all.ts) 注册全部算法保持
 * 向后兼容; layered-only 子入口 (src/api/layered.ts) 不注册非 layered → 只 import
 * 子入口的 consumer 可 tree-shake 掉 mrtree/disco/force/radial/... 的 provider 代码.
 *
 * 未注册算法在分派时抛明确错误 (提示用完整入口).
 */
import type { ElkNode } from './elk-json.js'

export type AlgProvider = (node: ElkNode) => void

const registry = new Map<string, AlgProvider>()

/** 注册算法 provider (按规范化 id; 同 id 重复注册覆盖). */
export function registerAlg(id: string, fn: AlgProvider): void {
  registry.set(id, fn)
}

/** 取 provider (未注册返回 undefined). */
export function getAlg(id: string): AlgProvider | undefined {
  return registry.get(id)
}

/** 是否已注册. */
export function hasAlg(id: string): boolean {
  return registry.has(id)
}
