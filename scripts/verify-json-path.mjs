/**
 * JSON 路径等价回归 (LGraph 级快照) — P3 (elktToElkJson → elkJsonToParsed) 与 P2 (parseElkt 直建)
 * 经 buildLGraphFromParsed 后产生**布局输入一致**的 LGraph.
 *
 * 升级 (2026-08-10, B7): 旧版只比中间结构 + OPT_MAP 键白名单 + 字符串归一化, 会吞掉:
 *   - B1: 图级 nodeSize.minimum 值类型 (P2=字符串 / P3=对象);
 *   - B2: randomSeed (P3 注入 1 / P2 未注入);
 *   - 边 yo/labels/thickness 等.  现改为 LGraph 级快照: 图属性 + 逐节点
 *   (尺寸/属性/端口/标签) + 边 (端点/属性/标签) 深比较 (coerceVal 后的最终值).
 *
 * 用途: 改 parseElkt / elktToElkJson / elkJsonToParsed / buildLGraphFromParsed / OPT_MAP / coerceVal 后跑一次,
 *       防止两条 ggn 建图路径不一致.
 * 用法: bun scripts/verify-json-path.mjs
 */
import { readFileSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { globSync } from 'glob'
import { parseElkt, elktToElkJson } from './elkt2test.mjs'
import { buildLGraphFromParsed, elkJsonToParsed } from '../shared/elkgraph-builder.ts'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const MODEL_ROOT = join(ROOT, 'test-resources/elk-models')
// 内部/环境相关键, 不参与对比 (Set 对象身份、布局期才赋值、跨图共享默认).
const SKIP_GRAPH_PROPS = new Set(['org.eclipse.elk.internal.GRAPH_PROPERTIES'])

/** 规范化任意值 (Set → 排序数组; 对象 → 排序键; 递归), 供 JSON 深比较. */
const canonVal = (v) => {
  if (v instanceof Set) return [...v].map(canonVal).sort()
  if (Array.isArray(v)) return v.map(canonVal)
  if (v && typeof v === 'object') {
    const out = {}
    for (const k of Object.keys(v).sort()) out[k] = canonVal(v[k])
    return out
  }
  return v
}
const canonProps = (holder) => {
  const out = {}
  for (const [k, v] of holder.getAllProperties()) {
    if (SKIP_GRAPH_PROPS.has(k)) continue
    out[k] = canonVal(v)
  }
  return out
}

/** buildLGraphFromParsed 结果 → 可比较快照 (nodeOf 索引序 = 输入模型序). */
function graphSnapshot({ graph, nodeOf, nodeCount }) {
  const nodes = []
  for (let i = 0; i < nodeCount; i++) {
    const n = nodeOf.get(i)
    const portIdx = new Map(n.getPorts().map((p, pi) => [p, pi]))
    nodes.push({
      root: n.getGraph() === graph,
      size: canonVal(n.size),
      props: canonProps(n),
      ports: n.getPorts().map((p) => ({
        side: p.getSide(),
        size: canonVal(p.size),
        pos: { x: p.getPosition().x, y: p.getPosition().y },
        props: canonProps(p),
        labels: p.getLabels().map((l) => canonVal({ text: l.text, size: l.size, pos: l.position })),
      })),
      labels: n.getLabels().map((l) => canonVal({ text: l.text, size: l.size, pos: l.position, placement: l.placement })),
      portIdx,
    })
  }
  const edges = []
  for (let i = 0; i < nodeCount; i++) {
    const n = nodeOf.get(i)
    for (const p of n.getPorts()) {
      for (const e of p.getOutgoingEdges()) {
        const tgt = e.getTarget()
        const tgtNode = tgt.getNode?.() ?? tgt.getOwner?.()
        const tgtIdx = [...nodeOf.values()].indexOf(tgtNode)
        edges.push({
          src: i,
          sp: nodes[i].portIdx.get(p),
          tgt: tgtIdx,
          tp: tgtNode ? nodes[tgtIdx].portIdx.get(tgt) : -1,
          props: canonProps(e),
          labels: e.getLabels().map((l) => canonVal({ text: l.text, size: l.size, pos: l.position, placement: l.placement })),
        })
      }
    }
  }
  // 边顺序可能因建图遍历不同而不同 (同一端点集) → 排序后比较 (多重性保留, 计数一致).
  edges.sort((a, b) => JSON.stringify(a) < JSON.stringify(b) ? -1 : 1)
  return { graphProps: canonProps(graph), nodes, edges }
}

const files = globSync(join(MODEL_ROOT, '**/*.elkt')).sort()
let diff = 0
for (const f of files) {
  const rel = f.slice(f.lastIndexOf('elk-models/') + 11)
  const parsed = parseElkt(readFileSync(f, 'utf8'))
  const p2 = graphSnapshot(buildLGraphFromParsed(parsed))
  const p3 = graphSnapshot(buildLGraphFromParsed(elkJsonToParsed(elktToElkJson(parsed))))
  const a = JSON.stringify(p2)
  const b = JSON.stringify(p3)
  if (a !== b) {
    diff++
    if (diff <= 8) {
      // 定位首个差异点 (逐层打印, 便于修 bug)
      const keys = ['graphProps', 'nodes', 'edges']
      for (const k of keys) {
        if (JSON.stringify(p2[k]) !== JSON.stringify(p3[k])) {
          console.log(`DIFF ${rel} @ ${k}: P2=${JSON.stringify(p2[k]).slice(0, 400)}`)
          console.log(`                         P3=${JSON.stringify(p3[k]).slice(0, 400)}`)
          break
        }
      }
    }
  }
}
console.log(diff === 0 ? `✅ 全部 ${files.length} elkt: P3 (JSON 往返) 与 P2 (直建) LGraph 级输入一致` : `❌ ${diff} 个不一致`)
process.exit(diff === 0 ? 0 : 1)
