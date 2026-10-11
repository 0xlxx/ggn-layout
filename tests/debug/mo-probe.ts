/** 一次性探针 (R72): 定位 ModelOrderBarycenterHeuristic 与 BarycenterHeuristic 在一张图/两张图上的一致性.
 *
 * 关键: `initAtNodeLevel` 会把 `node.id` 按层内位置重写, 因此用构建期标签
 * (L<层>p<原始位置>) 作为身份, 而不是 node.id.
 *
 * 用法: bun tests/debug/mo-probe.ts
 */
import { NodeRelativePortDistributor } from '../../src/p3order/port-distributors.js'
import { ForsterConstraintResolver } from '../../src/p3order/forster-constraint-resolver.js'
import { BarycenterHeuristic } from '../../src/p3order/barycenter-heuristic.js'
import { ModelOrderBarycenterHeuristic } from '../../src/p3order/ModelOrderBarycenterHeuristic.js'
import { initInitializables } from '../../src/p3order/all-crossings-counter.js'
import { JavaRandom } from '../../src/util/java-random.js'
import { randomLayeredGraph } from '../unit/helpers/PropertyTestGraphs.js'
import { PortType } from '../../src/graph/enums.js'
import type { LNode } from '../../src/graph/lnode.js'

type Nodes = LNode[][]
type Labeled = { nodes: Nodes; label: Map<LNode, string> }

function build(seed: number): Labeled {
  const { graph } = randomLayeredGraph(seed, { numLayers: 3, nodesPerLayer: 4 })
  const nodes = graph.toNodeArray()
  const label = new Map<LNode, string>()
  nodes.forEach((layer, li) => layer.forEach((n, ni) => label.set(n, `L${li}p${ni}`)))
  return { nodes, label }
}

function setup(nodes: Nodes) {
  const portDist = new NodeRelativePortDistributor(nodes.length)
  const cr = new ForsterConstraintResolver(nodes)
  initInitializables([portDist, cr], nodes)
  return { portDist, cr }
}

function runWith(b: Labeled, ctor: typeof BarycenterHeuristic, seed: number): { input: string; out: string; bc: string } {
  const { portDist, cr } = setup(b.nodes)
  portDist.calculatePortRanksForLayer(b.nodes[0]!, PortType.OUTPUT)
  const cm = new ctor(cr, new JavaRandom(seed) as never, portDist, b.nodes)
  initInitializables([cm], b.nodes)
  const list = [...b.nodes[1]!]
  const input = list.map(n => b.label.get(n)!).join(',')
  cm.minimizeLayer(list, false, false, true)
  const out = list.map(n => b.label.get(n)!).join(',')
  const bc = list
    .map(n => `${b.label.get(n)}=${(cm as unknown as { stateOf(x: LNode): { barycenter: number | null } }).stateOf(n).barycenter?.toFixed(6)}`)
    .join(' ')
  return { input, out, bc }
}

console.log(`# runtime=${typeof Bun !== 'undefined' ? `bun/${Bun.version}` : `node/${process.version}`} arch=${process.arch} platform=${process.platform}`)
const SEEDS = Number(process.env.PROBE_SEEDS ?? 20)
console.log('seed | fresh bary == fresh moBary | shared bary | shared moBary')
let freshBad = 0
let sharedBad = 0
for (let seed = 1; seed <= SEEDS; seed++) {
  // (a) 每个启发式各自重建图 — 语义正确的比较
  const fb = runWith(build(seed), BarycenterHeuristic, seed).out
  const fm = runWith(build(seed), ModelOrderBarycenterHeuristic, seed).out
  // (b) 共用同一张图跑两次 — 现有测试的写法
  const shared = build(seed)
  const sb = runWith(shared, BarycenterHeuristic, seed).out
  const sm = runWith(shared, ModelOrderBarycenterHeuristic, seed).out
  if (fb !== fm) freshBad++
  if (sb !== sm) sharedBad++
  if (seed <= 6 || fb !== fm || sb !== sm) {
    console.log(`${String(seed).padStart(4)} | ${fb} == ${fm} ${fb === fm} | ${sb} | ${sm} ${sb === sm}`)
  }
}
console.log(`\nSUMMARY fresh mismatches=${freshBad}/${SEEDS}  shared mismatches=${sharedBad}/${SEEDS}`)

// 细节: seed=5 的重心值与重心顺序
const b5 = build(5)
const rB = runWith(b5, BarycenterHeuristic, 5)
console.log(`\nseed=5 (fresh) bary  : input=${rB.input} out=${rB.out}\n            bc=${rB.bc}`)
const b5m = build(5)
const rM = runWith(b5m, ModelOrderBarycenterHeuristic, 5)
console.log(`seed=5 (fresh) moBary: input=${rM.input} out=${rM.out}\n            bc=${rM.bc}`)

// 污染诊断 (共用图): 第二次运行看到的「输入顺序」与重心值, 判断是否被第一次运行改写.
const diag = build(5)
const d1 = runWith(diag, BarycenterHeuristic, 5)
const d2 = runWith(diag, ModelOrderBarycenterHeuristic, 5)
console.log(`\nDIAG shared seed=5 run1(bary)   in=${d1.input} out=${d1.out}\n     bc=${d1.bc}`)
console.log(`DIAG shared seed=5 run2(moBary) in=${d2.input} out=${d2.out}\n     bc=${d2.bc}`)
