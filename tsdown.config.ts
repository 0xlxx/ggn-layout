import { readFileSync } from 'node:fs'
import { defineConfig } from 'tsdown'

// 许可口径的单一真源是 package.json 的 `license` 字段: banner 与各文档都由它派生,
// 不再各写一份字面量, 以免两边静默漂移 (见 scripts/check-license-headers.mjs 的交叉校验).
// 本包是 ELK 的衍生作品, 派生部分 EPL-2.0、GGN 新增部分 MIT, 消费方两者都要满足.
const { license: LICENSE_SPDX } = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as { license: string }

// 每个输出 chunk 顶部保留归属声明. minify 会吃掉源码里的注释, 必须走 banner 才能落到 dist.
const LICENSE_BANNER = `/**
 * ggn-layout — TypeScript port of the Eclipse Layout Kernel (ELK) layered layout algorithms.
 *
 * Copyright (c) 2026 GGN contributors.
 * Portions derived from ELK (https://github.com/eclipse/elk), Copyright (c) Kiel University
 * and others, are licensed under the Eclipse Public License 2.0 (EPL-2.0);
 * GGN-original portions are licensed under MIT.
 * See LICENSES/EPL-2.0.txt, LICENSE and THIRD_PARTY_NOTICES.md.
 *
 * SPDX-License-Identifier: ${LICENSE_SPDX}
 */`

// 61 个 GGN_* debug 开关 define 为 undefined (与默认未设置完全等价) → bundler 消除 dead debug 分支 (R40 bundle 瘦身).
const GGN_DEFINE = Object.fromEntries([
  ['process.env.GGN_API_DBG', 'undefined'],
  ['process.env.GGN_BD_DBG', 'undefined'],
  ['process.env.GGN_BK_BLOCKS', 'undefined'],
  ['process.env.GGN_BK_DBG', 'undefined'],
  ['process.env.GGN_BK_FORCE', 'undefined'],
  ['process.env.GGN_BK_FULL', 'undefined'],
  ['process.env.GGN_BK_IN', 'undefined'],
  ['process.env.GGN_BK_IS', 'undefined'],
  ['process.env.GGN_CC_DBG', 'undefined'],
  ['process.env.GGN_CELL_DBG', 'undefined'],
  ['process.env.GGN_CGP_DBG', 'undefined'],
  ['process.env.GGN_CG_DBG', 'undefined'],
  ['process.env.GGN_CM_DBG', 'undefined'],
  ['process.env.GGN_COMPACT_DBG', 'undefined'],
  ['process.env.GGN_COMP_DBG', 'undefined'],
  ['process.env.GGN_DSL_DBG', 'undefined'],
  ['process.env.GGN_EP_DBG', 'undefined'],
  ['process.env.GGN_EP_SIDE', 'undefined'],
  ['process.env.GGN_FORSTER_DBG', 'undefined'],
  ['process.env.GGN_GCB', 'undefined'],
  ['process.env.GGN_GPD_DBG', 'undefined'],
  ['process.env.GGN_GREEDY_HIER', 'undefined'],
  ['process.env.GGN_GREEDY_OFF', 'undefined'],
  ['process.env.GGN_HIER_ORTHO', 'undefined'],
  ['process.env.GGN_HM_DBG', 'undefined'],
  ['process.env.GGN_HOR_DBG', 'undefined'],
  ['process.env.GGN_ICB_DBG', 'undefined'],
  ['process.env.GGN_INC_DBG', 'undefined'],
  ['process.env.GGN_INIT_ORDER', 'undefined'],
  ['process.env.GGN_LDR', 'undefined'],
  ['process.env.GGN_LDR_DBG', 'undefined'],
  ['process.env.GGN_LS_DBG', 'undefined'],
  ['process.env.GGN_MO_DBG', 'undefined'],
  ['process.env.GGN_MR_DBG', 'undefined'],
  ['process.env.GGN_NR', 'undefined'],
  ['process.env.GGN_NS_DBG', 'undefined'],
  ['process.env.GGN_OER_DBG', 'undefined'],
  ['process.env.GGN_P', 'undefined'],
  ['process.env.GGN_PC_DBG', 'undefined'],
  ['process.env.GGN_PD', 'undefined'],
  ['process.env.GGN_PH_DBG', 'undefined'],
  ['process.env.GGN_PIPE_DBG', 'undefined'],
  ['process.env.GGN_POST_DBG', 'undefined'],
  ['process.env.GGN_PPL_DBG', 'undefined'],
  ['process.env.GGN_PROP_DBG', 'undefined'],
  ['process.env.GGN_PS_DBG', 'undefined'],
  ['process.env.GGN_RANK_DBG', 'undefined'],
  ['process.env.GGN_REV_DBG', 'undefined'],
  ['process.env.GGN_RND_DBG', 'undefined'],
  ['process.env.GGN_RP_DBG', 'undefined'],
  ['process.env.GGN_SD_DBG', 'undefined'],
  ['process.env.GGN_SEG_DBG', 'undefined'],
  ['process.env.GGN_SIDE_DBG', 'undefined'],
  ['process.env.GGN_SLR_DBG', 'undefined'],
  ['process.env.GGN_SL_DBG', 'undefined'],
  ['process.env.GGN_SPLINES_DBG', 'undefined'],
  ['process.env.GGN_SPLIT_DBG', 'undefined'],
  ['process.env.GGN_SWEEP_DBG', 'undefined'],
  ['process.env.GGN_SWEEP_WHO', 'undefined'],
  ['process.env.GGN_VP_DBG', 'undefined'],
  // 补齐: 之前漏 define 的实际 process.env 引用 (缺失会让浏览器产物保留 process.env.X → ReferenceError 风险).
  ['process.env.GGN_EP_DBG2', 'undefined'],
  ['process.env.GGN_LDR2', 'undefined'],
  ['process.env.GGN_P3_DBG', 'undefined'],
  ['process.env.GGN_SL_DBG2', 'undefined'],
  ['process.env.IPP_DEBUG', 'undefined'],
])

export default defineConfig({
  entry: ['src/index.ts', 'src/api/index.ts', 'src/api/layered.ts', 'src/core.ts', 'src/options.ts', 'src/layout-worker.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  fixedExtension: false,
  clean: true,
  minify: true,
  banner: LICENSE_BANNER,
  // 刻意不发 sourcemap：本包是 ELK 的 1:1 移植，.map 会把整份上游衍生源码连同绝对路径
  // 一起塞进 npm tarball（体积翻数倍，且把移植过程暴露在制品里）。调试需求由仓库内
  // 源码 + `bun run build` 本地重建满足。tsdown 默认即不产出，这里显式写死以免将来
  // 有人改默认值时静默翻转（对应 `files` 白名单里也没有任何 `*.map` 兜底）。
  sourcemap: false,
  // 注意: package.json 不得声明「白名单式」的 sideEffects 数组 —— 构建期 rolldown 会据此把
  // 其他模块判为无副作用, 从而把 src/api/index.ts 的裸副作用 `import './register-all.js'`
  // 整块摇掉, 完整入口退化成 layered 入口 (非 layered 算法全部「未注册」). 该回归由
  // `bun run smoke:pack` (CI 中执行) 拦截; 细节见 docs/PORTING.md §6.18.
  define: GGN_DEFINE,
})
