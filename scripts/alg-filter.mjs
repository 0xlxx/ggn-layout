/**
 * 算法族判定 — 共享纯模块 (无副作用, verify-bit-exact.mjs / verify-elkg-java-layout.ts 共用).
 *
 * 语义 (审阅整合 + 第 0 步实验定稿):
 *   只按**根节点**显式算法判定是否跳过 (不递归 children):
 *     - 根无显式算法 → ELK 默认 layered → 保留比较
 *     - 根显式 layered / core (box/fixed/random, ggn 已移植) → 保留比较
 *     - 根显式其他非 layered 算法 (force/rectpacking/topdownpacking/sporeOverlap/
 *       radial/vertiflex/disco/mrtree) → 跳过 (ggn 未移植, 对比无效)
 *     - 根显式未知算法 → 跳过 (无法确认是 layered, 保守处理)
 *   嵌套节点非 layered 算法 → 黑盒, 不参与判定:
 *     jar 强制 root=layered、ggn 也按 layered 跑; hierarchicalLayoutMixing /
 *     665 / 588 / 912 / 931 / 932 / 930 等即「根 layered + 嵌套非 layered」形态,
 *     是 layered 管线的重要覆盖, 必须保留在比较范围.
 *
 * 为什么不做递归 (旧实现缺陷):
 *   旧 isLayered 递归 children, 且只在「算法未知」时返回 false — 已知非 layered
 *   算法 (rectpacking/topdownpacking/sporeOverlap) 的**根**模型会滑入比较:
 *   5 个 (interactiveLayout_mixedHierarchy / interactiveRectpacking_{hierarchy,oneBigNode}
 *   / 900_topdownpacking_basic / 910_spore_overlap_basic), 输出差 1e2~2.6e2, 污染统计.
 *   反之若简单「补全递归检测」会把根 layered + 嵌套非 layered 的模型误杀 (342/348 变差).
 *   正解 = 只按根显式算法判定, 两处脚本数字与「第 0 步实验」一致 (跳过恰为 5).
 */

export const LAYERED_ALGS = new Set(['layered', 'elk.layered', 'org.eclipse.elk.layered'])
export const CORE_ALGS = new Set([
  'box', 'elk.box', 'org.eclipse.elk.box',
  'fixed', 'elk.fixed', 'org.eclipse.elk.fixed',
  'random', 'elk.random', 'org.eclipse.elk.random',
])
/** ggn 未移植的已识别非 layered 算法 — 根显式声明任一个 → 跳过. */
export const NON_LAYERED_ALGS = new Set([
  // force / stress
  'stress', 'elk.stress', 'org.eclipse.elk.stress',
  'force', 'elk.force', 'org.eclipse.elk.force',
  // rectpacking
  'rectpacking', 'elk.rectpacking', 'org.eclipse.elk.rectpacking',
  // topdownpacking
  'topdownpacking', 'elk.topdownpacking', 'org.eclipse.elk.topdownpacking',
  // sporeOverlap / sporeCompaction
  'sporeOverlap', 'elk.sporeOverlap', 'org.eclipse.elk.sporeOverlap',
  'sporeCompaction', 'elk.sporeCompaction', 'org.eclipse.elk.sporeCompaction',
  // radial
  'radial', 'elk.radial', 'org.eclipse.elk.radial',
  // vertiflex
  'vertiflex', 'elk.vertiflex', 'org.eclipse.elk.vertiflex', 'org.eclipse.elk.alg.vertiflex',
  // disco
  'disco', 'elk.disco', 'org.eclipse.elk.disco',
  // mrtree
  'mrtree', 'elk.mrtree', 'org.eclipse.elk.mrtree', 'org.eclipse.elk.alg.mrtree',
])

/** 根节点显式算法 (elktToElkJson 只发射 org.eclipse.elk.algorithm; elk.algorithm 兜底). */
export function rootAlgorithm(node) {
  return node?.layoutOptions?.['org.eclipse.elk.algorithm'] ?? node?.layoutOptions?.['elk.algorithm']
}

/** 该 ELK JSON 是否属于 layered 比较范围 (根显式非 layered → false). */
export function isLayered(input) {
  const alg = rootAlgorithm(input)
  if (alg === undefined) return true
  const s = String(alg)
  if (LAYERED_ALGS.has(s) || CORE_ALGS.has(s)) return true
  return false
}
