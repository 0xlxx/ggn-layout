/**
 * 重新生成 demo-vite/data/*.json — 标准 ELK JSON (elktToElkJson 输出).
 *
 * 背景: demo 对比 elkjs 与 layout, 要求**两端同输入** (同一个 ELK JSON):
 *   elkjs: elk.layout(json) (原生)
 *   ggn:   layoutElkJson(json) (demo-vite/main.ts 经 src/public.ts 公共入口)
 * 存标准 ELK JSON, 避免手写 buildElkJson 转换 (曾有 port.index ?? 0 老 bug).
 *
 * 用法: bun scripts/build-demo-data.mjs
 * 输出: demo-vite/data/*.json (标准 ELK JSON: { id, layoutOptions, children, edges })
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseElkt, elktToElkJson, elktHash } from './elkt2test.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const MODEL_ROOT = join(ROOT, 'test-resources/elk-models')
const OUT = join(ROOT, 'demo-vite', 'data')

/** demo-vite/main.ts 的示例图: 输出文件名 → elkt 源. */
const MODELS = [
  { out: 'examples_hierarchy_hierarchicalEdges.json', src: 'examples/hierarchy/hierarchicalEdges.elkt' },
  { out: 'examples_general_direction.json', src: 'examples/general/direction.elkt' },
  { out: 'examples_general_mixingDirection.json', src: 'examples/general/mixingDirection.elkt' },
  { out: 'ptolemy_hierarchical_pn_blindcommunication_BlindCommunication.json', src: 'realworld/ptolemy/hierarchical/pn_blindcommunication_BlindCommunication.elkt' },
  { out: 'ptolemy_flattened_aspect_cartrackingattackmodeling_CarTrackingAttackModeling.json', src: 'realworld/ptolemy/flattened/aspect_cartrackingattackmodeling_CarTrackingAttackModeling.elkt' },
  { out: 'ptolemy_flattened_wireless_intersections_Intersections.json', src: 'realworld/ptolemy/flattened/wireless_intersections_Intersections.elkt' },
  { out: 'ptolemy_hierarchical_ptango_optimizationadvisor_OptimizationAdvisor.json', src: 'realworld/ptolemy/hierarchical/ptango_optimizationadvisor_OptimizationAdvisor.elkt' },
  { out: 'ptolemy_flattened_pn_countermachine_CounterMachine.json', src: 'realworld/ptolemy/flattened/pn_countermachine_CounterMachine.elkt' },
  { out: 'ptolemy_hierarchical_gr_robotarm_RobotArm.json', src: 'realworld/ptolemy/hierarchical/gr_robotarm_RobotArm.elkt' },
  { out: 'ptolemy_flattened_dt_pickstates_pickstates.json', src: 'realworld/ptolemy/flattened/dt_pickstates_pickstates.elkt' },
  { out: 'ptolemy_hierarchical_continuous_starmac_Starmac.json', src: 'realworld/ptolemy/hierarchical/continuous_starmac_Starmac.elkt' },
  { out: 'ptolemy_flattened_ptides_printingpress_PrintingPress.json', src: 'realworld/ptolemy/flattened/ptides_printingpress_PrintingPress.elkt' },
]

import { createHash } from 'node:crypto'

const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16)

mkdirSync(OUT, { recursive: true })
const manifest = { generated: new Date().toISOString(), models: {} }
for (const m of MODELS) {
  const src = readFileSync(join(MODEL_ROOT, m.src), 'utf8')
  const g = parseElkt(src)
  const json = JSON.stringify(elktToElkJson(g)) // 标准 ELK JSON
  writeFileSync(join(OUT, m.out), json)
  // 防过期 manifest: 源 elkt 的 parseElkt hash + 生成的 ELK JSON hash (改 parser 后 verify 会提示重生成)
  manifest.models[m.out] = { src: m.src, srcHash: elktHash(g), jsonHash: sha(json) }
  console.log(`✓ ${m.out}  (${g.nodes.length} nodes / ${g.edges.length} edges / ${g.hierarchy.size} containers / ${(json.length / 1024).toFixed(1)} KB)`)
}
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n')
console.log(`→ ${OUT} (+ manifest.json)`)
