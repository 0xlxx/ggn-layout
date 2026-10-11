#!/usr/bin/env bun
/**
 * progress — layout 移植进度仪表盘.
 *
 * 多维指标 (用户 2026-08-08 定):
 *   1. E2E 696 坐标一致率 (唯一权威 = ELK Java jar oracle)
 *   2. elk-java-unit 单测数 (语义测试增长)
 *   3. 覆盖率 (Lines/Branches)
 *   4. 失败簇分布 (N-S/自环/splines/复合/...)
 *   5. 历史趋势 (每轮 696 通过数)
 *
 * 用法: bun scripts/progress.mjs [--cov coverage/coverage-summary.json]
 * 可选 --failures <json> 用已有失败集 (否则 collect-all).
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'

// ── 1. E2E 696 ──
let failures = []
const failArg = process.argv.indexOf('--failures')
if (failArg >= 0 && existsSync(process.argv[failArg + 1])) {
  failures = JSON.parse(readFileSync(process.argv[failArg + 1], 'utf8'))
} else {
  const out = execSync('node scripts/diff-failures.mjs collect-all /tmp/f-progress.json', { encoding: 'utf8' })
  failures = JSON.parse(readFileSync('/tmp/f-progress.json', 'utf8'))
}
const pass = 696 - failures.length
const pct = (pass / 696 * 100).toFixed(1)

// ── 2. 单测数 ──
// 默认快速模式: 数测试文件内 it/it.skip 条数 (不跑 vitest, 避免全量 realworld 布局慢);
// GGN_FULL=1 时跑 vitest 全量并解析 JSON (有失败时退出码非 0, 解析 e.stdout).
const FULL = process.env.GGN_FULL === '1'
let unitTests = 0
let unitPassed = 0
let unitFailed = 0
if (FULL) {
  try {
    const run = () => execSync('bun x vitest run tests/unit tests/bdd --reporter=json 2>/dev/null', { encoding: 'utf8' })
    let out = ''
    try { out = run() } catch (e) { out = e.stdout ?? '' }
    const d = JSON.parse(out.slice(out.indexOf('{')))
    unitTests = d.numTotalTests ?? 0
    unitPassed = d.numPassedTests ?? 0
    unitFailed = d.numFailedTests ?? 0
  } catch { unitTests = -1 }
} else {
  // 快速模式: 统计 it( 与 it.skip( 数量 (近似; 动态 it.each 展开数不计).
  const files = readdirSync('tests/unit').filter(f => f.endsWith('.test.ts'))
  let total = 0
  for (const f of files) {
    const txt = readFileSync(`tests/unit/${f}`, 'utf8')
    total += (txt.match(/\bit\(/g) ?? []).length + (txt.match(/\bit\.each\(/g) ?? []).length
  }
  unitTests = total
}

// ── 3. 覆盖率 ──
let lines = 0, branches = 0, stmts = 0
const covArg = process.argv.indexOf('--cov')
const covPath = covArg >= 0 ? process.argv[covArg + 1] : 'coverage/coverage-summary.json'
if (existsSync(covPath)) {
  const c = JSON.parse(readFileSync(covPath, 'utf8'))
  lines = c.total.lines.pct; branches = c.total.branches.pct; stmts = c.total.statements.pct
}

// ── 4. 失败簇分布 ──
const clusters = { 'N-S族': 0, 'insideSelfLoops': 0, '复合放置': 0, 'splines': 0, '自环': 0, '其他': 0 }
for (const f of failures) {
  const g = f.replace('elkt 生成: ', '').split(' ')[0]
  if (/hierarchy09|194|compound0[345]|all_four|northSouthPorts_down_down/.test(g)) clusters['N-S族']++
  else if (/insideSelfLoops|insidePortLabels|548/.test(g)) clusters['insideSelfLoops']++
  else if (/portConstraints|502|collapsing/.test(g)) clusters['复合放置']++
  else if (/splines|sloppy|hyperedges/.test(g)) clusters['splines']++
  else if (/self_loops/.test(g)) clusters['自环']++
  else clusters['其他']++
}

// ── 6. 边路由 E2E (两阶段: 先节点位置, 后边弯点; SSOT = jar) ──
// 用户 2026-08-08: 边路由位置依赖节点位置, 应等节点位置通过后再验证边路由.
let edgePass = 0, edgeTotal = 0, edgePct = 0
let nodePass = 0, nodeTotal = 0, nodePct = 0
let pureEdgeFail = 0
try {
  const reg = JSON.parse(readFileSync('test-resources/edge-e2e-registry.json', 'utf8'))
  const vals = Object.values(reg.cases)
  edgeTotal = vals.length
  edgePass = vals.filter(c => c.ok).length
  edgePct = (edgePass / edgeTotal * 100).toFixed(1)
  nodeTotal = vals.length
  nodePass = vals.filter(c => c.nodesOk).length
  nodePct = (nodePass / nodeTotal * 100).toFixed(1)
  pureEdgeFail = vals.filter(c => !c.ok && c.nodesOk).length
} catch { /* 注册表缺失时静默 */ }

// ── 5. 历史趋势 (从 PROGRESS 提取) ──
let history = []
if (existsSync('PROGRESS.md')) {
  const prog = readFileSync('PROGRESS.md', 'utf8')
  // 提取明确的趋势 (如 "22→19" 或 "→ 17 失败"), 按 PROGRESS 顺序 (顶部新), 反转得旧→新
  for (const m of prog.matchAll(/(\d+)\s*→\s*(\d+)\s*失败/g)) {
    const a = Number(m[1]), b = Number(m[2])
    if (a >= 0 && a <= 25 && b >= 0 && b <= 25) { history.push(a); if (b !== a) history.push(b) }
  }
  history = [...new Set(history)].reverse()
  // 末尾追加当前
  if (history[history.length - 1] !== failures.length) history.push(failures.length)
}

// ── 7. ELK Java 单测移植率 (原仓库 v0.12.0 org.eclipse.elk.alg.layered.test 91 个 Test 类) ──
// 与 tests/unit/*.test.ts 文件名比对 (含 framework runner/helper, 不参与计数).
const ELK_JAVA_TEST_CLASSES = [
  // p1cycles/p2layers/p3order/p4nodes/p5edges
  'BasicCycleBreakerTest','BasicLayerAssignmentTest','BasicModelOrderTest','ModelOrderLayerAssignmentTest','AbstractBarycenterPortDistributorTest',
  'BarycenterHeuristicTest','BasicCrossingMinimizationTest','ForsterConstraintResolverTest','GreedyPortDistributorTest',
  'LayerSweepCrossingMinimizerTest','LayerSweepHierarchicalTwoSidedGreedySwitchTest','LayerSweepTypeDeciderTest',
  'ModelOrderBarycenterHeuristicTest','AllCrossingsCounterTest','BinaryIndexedTreeTest','CrossingsCounterTest',
  'NorthSouthEdgeAllCrossingsCounterTest','BasicNodePlacementTest','BasicEdgeRouterTest',
  // components/compaction
  'ComponentGroupTest','CompactionTest','RectlinearConvexHullTest',
  // intermediate
  'AllowNonFlowPortsToSwitchSidesTest','AlternatingLayerUnzipperTest','BasicConsiderModelOrderTest',
  'CommentPostprocessorTest','ConcreteSortByInputModelTest','EdgeAndLayerConstraintEdgeReverserTest',
  'EndLabelSorterTest','InLayerConstraintProcessorTest','InvertedPortProcessorTest',
  'LabelAndNodeSizeProcessorOffsetTest','LabelDummyRemoverTest','LabelSideSelectorTest',
  'LayerConstraintProcessorTest','LayerSizeAndGraphHeigthCalculatorTest','LongEdgeJoinerTest',
  'LongEdgeSplitterTest','NodeMarginCalculatorTest','NodePromotionTest','NorthSouthPortPostprocessorTest',
  'NorthSouthPortPreprocessorTest','PartitionPostProcessorTest','PartitionTest','PortListSorterTest',
  'PortSideProcessorTest','ReversedEdgeRestorerTest','SelfLoopPreprocessorTest','SortByInputModelProcessorTest',
  // greedy switch
  'BetweenLayerEdgeTwoNodeCrossingsCounterTest','GreedySwitchProcessorTest','InLayerEdgeTwoNodeCrossingCounterTest',
  'NorthSouthEdgeNeighbouringNodeCrossingsCounterTest','SwitchDeciderTest',
  // loops
  'SelfLoopHolderTest','PolylineSelfLoopRouterTest',
  // issues
  'Issue143And318Test','Issue316Test','Issue405Test','Issue405_2Test','Issue433Test','Issue444Test','Issue445Test',
  'Issue447Test','Issue455Test','Issue463Test','Issue471Test','Issue476Test','Issue502Test','Issue515Test',
  'Issue541Test','Issue546Test','Issue548Test','Issue552Test','Issue562Test','Issue587Test','Issue596Test',
  'Issue603Test','Issue628Test','Issue665Test','Issue680Test','Issue682Test','Issue700Test','Issue701Test',
  'Issue726Test','Issue734Test','Issue870Test','Issue871Test','Issue905Test',
  // 整图
  'OverallLayoutTest','LayeredSpacingTest',
]
const ported = ELK_JAVA_TEST_CLASSES.filter(n => existsSync(`tests/unit/${n}.test.ts`)).length
const portedPct = (ported / ELK_JAVA_TEST_CLASSES.length * 100).toFixed(1)

console.log('=== layout 移植进度 ===')
console.log(`E2E 696 一致率 : ${pass}/696 (${pct}%)  [${failures.length} 失败]`)
console.log(`边路由 E2E 一致率: ${edgeTotal > 0 ? edgePass + '/' + edgeTotal + ' (' + edgePct + '%)' : '?'}  [正交弯点, 图×方向]`)
console.log(`  节点位置(前置)   : ${nodeTotal > 0 ? nodePass + '/' + nodeTotal + ' (' + nodePct + '%)' : '?'}  [纯边路由失败 ${pureEdgeFail} 个待修]`)
console.log(`elk-java-unit   : ${FULL
  ? (unitTests > 0 ? unitPassed + '/' + unitTests + ' 通过 (' + (unitTests ? (unitPassed / unitTests * 100).toFixed(1) : '?') + '%)' : '?')
  : (unitTests > 0 ? `~${unitTests} it 用例 (快速模式, GGN_FULL=1 跑全量)` : '?')} 语义测试`)
console.log(`ELK Java 单测移植: ${ported}/${ELK_JAVA_TEST_CLASSES.length} 类 (${portedPct}%)  [${ELK_JAVA_TEST_CLASSES.length - ported} 类待移植]`)
console.log(`覆盖率          : Lines ${lines.toFixed(1)}% / Branches ${branches.toFixed(1)}% / Stmts ${stmts.toFixed(1)}%`)
console.log(`失败簇分布      : ${Object.entries(clusters).filter(([, v]) => v > 0).map(([k, v]) => `${k}=${v}`).join(', ')}`)
if (history.length) console.log(`历史失败数      : ${history.join(' → ')}`)
console.log('')
console.log('目标: 696 全过 (accepted 冻结清单除外) + elk-java-unit 全绿 + 变异 covered ≥80%')
