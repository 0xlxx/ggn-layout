import { readFileSync } from 'node:fs'
import { parseElkt } from '../../scripts/elkt2test.mjs'
const models = ['905_beginLableBellowEdge','905_beginLabelAboveEdge','463_aioobe_with_self_loops','416_longSelfLoops','403_stackedSelfLoopLabels','352_selfLoopNPEorAIOOBE','288_selfLoopsCauseNPE_a','288_selfLoopsCauseNPE_b','273_insideSelfLoopsWithLabels','548_NPEWithInsideSelfLoops','425_selfLoopInCompoundNode','552_hierarchySelfLoopPorts']
for (const m of models) {
  const source = readFileSync(`test-resources/elk-models/tickets/layered/${m}.elkt`, 'utf8')
  const gd = parseElkt(source)
  const selfLoops = gd.edges.filter(([s,,t]) => s === t)
  const sameNodeDiffPort = gd.edges.filter(([s,,t]) => s === t)
  console.log(`${m}: nodes=${gd.nodes.length} edges=${gd.edges.length} hierarchy=${gd.hierarchy.size} selfLoops=${selfLoops.length}`)
  for (const e of gd.edges) if (e[0]===e[2]) console.log(`   selfloop: ${e.join(' -> ')}`)
}
