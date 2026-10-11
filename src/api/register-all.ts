/**
 * 完整算法注册 (副作用模块): 注册全部非 layered provider.
 *
 * 完整入口 (src/index.ts / src/api/index.ts) import 本模块 → 全部算法可用 (向后兼容).
 * layered-only 子入口 (src/api/layered.ts) 不 import 本模块 → 非 layered provider 代码
 * 可被 tree-shaker 移除 (仅当 consumer 只用 layered).
 */
import { boxLayout, fixedLayout, randomLayout } from './core-providers.js'
import { stressLayout, forceLayout } from '../force/stress-layout.js'
import { rectPackingLayout } from '../rectpacking/rect-packing-layout.js'
import { topdownPackingLayout } from '../topdownpacking/topdown-packing-layout.js'
import { sporeOverlapLayout, sporeCompactionLayout } from '../spore/spore-layout.js'
import { radialLayout } from '../radial/radial-layout.js'
import { vertiFlexLayout } from '../vertiflex/vertiflex-layout.js'
import { discoLayout } from '../disco/disco-layout.js'
import { mrtreeLayout } from '../mrtree/mrtree-layout.js'
import { registerAlg } from './registry.js'

// 与 elk-json.ts runCoreProviders 原 switch 的 case 一一对应 (id = 规范化算法 id).
registerAlg('box', boxLayout)
registerAlg('fixed', fixedLayout)
registerAlg('random', randomLayout)
registerAlg('stress', stressLayout)
registerAlg('force', forceLayout)
registerAlg('rectpacking', rectPackingLayout)
registerAlg('topdownpacking', topdownPackingLayout)
registerAlg('sporeoverlap', sporeOverlapLayout)
registerAlg('sporecompaction', sporeCompactionLayout)
registerAlg('radial', radialLayout)
registerAlg('vertiflex', vertiFlexLayout)
registerAlg('disco', discoLayout)
registerAlg('mrtree', mrtreeLayout)
