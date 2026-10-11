/**
 * 已移植布局算法注册表（单一事实来源）。
 *
 * dispatch（elk-json.ts）与输入校验（validate.ts）共用同一份支持清单，
 * 避免两处清单不一致导致 "校验通过但分派失败" 或反之。
 * 命名规范：新公共符号不含 "ELK"（用户指令）。
 */

/** 规范化算法 id: 去前缀 (org.eclipse.elk./elk.), 小写. */
export function normalizeAlgorithm(value: string): string {
  return value.trim().toLowerCase().replace(/^org\.eclipse\.elk\./, '').replace(/^elk\./, '')
}

/** layered (org.eclipse.elk.layered). */
export const LAYERED_ALG_IDS = new Set(['layered', 'elk.layered', 'org.eclipse.elk.layered'])
/** core 算法 (org.eclipse.elk.core.util topdown provider). */
export const CORE_ALG_IDS = new Set(['box', 'elk.box', 'org.eclipse.elk.box', 'fixed', 'elk.fixed', 'org.eclipse.elk.fixed', 'random', 'elk.random', 'org.eclipse.elk.random'])
/** force/stress 算法 (org.eclipse.elk.alg.force). */
export const FORCE_ALG_IDS = new Set(['stress', 'elk.stress', 'org.eclipse.elk.stress', 'force', 'elk.force', 'org.eclipse.elk.force'])
/** rectpacking 算法 (org.eclipse.elk.alg.rectpacking). */
export const RECTPACKING_ALG_IDS = new Set(['rectpacking', 'elk.rectpacking', 'org.eclipse.elk.rectpacking'])
/** topdownpacking 算法 (org.eclipse.elk.alg.topdownpacking). */
export const TOPDOWN_ALG_IDS = new Set(['topdownpacking', 'elk.topdownpacking', 'org.eclipse.elk.topdownpacking'])
/** spore 算法 (org.eclipse.elk.alg.spore). */
export const SPORE_ALG_IDS = new Set(['sporeoverlap', 'elk.sporeoverlap', 'org.eclipse.elk.sporeoverlap', 'sporecompaction', 'elk.sporecompaction', 'org.eclipse.elk.sporecompaction'])
/** radial 算法 (org.eclipse.elk.alg.radial). */
export const RADIAL_ALG_IDS = new Set(['radial', 'elk.radial', 'org.eclipse.elk.radial'])
/** vertiflex 算法 (org.eclipse.elk.alg.vertiflex). */
export const VERTIFLEX_ALG_IDS = new Set(['vertiflex', 'elk.vertiflex', 'org.eclipse.elk.vertiflex', 'org.eclipse.elk.alg.vertiflex'])
/** disco 算法 (org.eclipse.elk.alg.disco). */
export const DISCO_ALG_IDS = new Set(['disco', 'elk.disco', 'org.eclipse.elk.disco'])
/** mrtree 算法 (org.eclipse.elk.alg.mrtree). */
export const MRTREE_ALG_IDS = new Set(['mrtree', 'elk.mrtree', 'org.eclipse.elk.mrtree', 'org.eclipse.elk.alg.mrtree'])

/** 规范化后的全部已支持算法 id（校验用）。 */
export const SUPPORTED_ALGORITHMS: ReadonlySet<string> = new Set([
  ...new Set([
    ...[...LAYERED_ALG_IDS, ...CORE_ALG_IDS, ...FORCE_ALG_IDS, ...RECTPACKING_ALG_IDS, ...TOPDOWN_ALG_IDS,
      ...SPORE_ALG_IDS, ...RADIAL_ALG_IDS, ...VERTIFLEX_ALG_IDS, ...DISCO_ALG_IDS, ...MRTREE_ALG_IDS].map(normalizeAlgorithm),
  ]),
])

/** 值是否为已支持算法（支持原始 id / elk.* / org.eclipse.elk.* 前缀，大小写不敏感）。 */
export function isSupportedAlgorithm(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '' && SUPPORTED_ALGORITHMS.has(normalizeAlgorithm(value))
}
