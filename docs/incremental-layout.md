# 增量布局使用指南 (Incremental Layout)

> 适用: `ggn-layout` JSON API (`layoutElkJson`)。场景: 图结构编辑后重布局, 要求节点尽量保持
> 在上一轮位置 (编辑器拖拽、实时协作、CI 可视化等)。
>
> 参考实现: `demo-vite/main.ts` (增量布局 Playground, 浏览器可跑); 行为验收:
> `tests/api/interactive-seed.test.ts`、`tests/unit/InteractiveLayererTest.test.ts`。

## 1. 原理

ELK 交互式布局把「上一轮布局输出坐标」作为本轮输入, 配合三个 INTERACTIVE 策略:

| 阶段 | 策略 | 读什么 | 效果 |
|------|------|--------|------|
| P1 断环 | `cycleBreaking.strategy: INTERACTIVE` | `LNode.position` | 环内按位置判定反馈边, 断环结果稳定 |
| P2 分层 | `layering.strategy: INTERACTIVE` | `LNode.position.x` | 按输入 x 分 span (重叠合并), 层数/层序稳定 |
| P3 排序 | `crossingMinimization.semiInteractive: true` | `org.eclipse.elk.position` 属性 | 层内按输入 y 升序, 节点相对顺序稳定 |

输入节点 `x/y` 会被种子到 `LNode.position` (对齐 Java `ElkGraphImporter.transformNode:913-914`,
2026-08-13 修复, 见 PROGRESS.md 当日条目)。旧版 dist 未重建时此行为缺失。

## 2. 最小流程

```ts
import { layoutElkJson } from 'ggn-layout'

const INCREMENTAL_OPTS = {
  'org.eclipse.elk.layered.layering.strategy': 'INTERACTIVE',
  'org.eclipse.elk.layered.cycleBreaking.strategy': 'INTERACTIVE',
  'org.eclipse.elk.layered.crossingMinimization.semiInteractive': 'true',
  'org.eclipse.elk.interactiveLayout': 'true',
}
const ROOT_COORDS = {
  'org.eclipse.elk.json.shapeCoords': 'ROOT',
  'org.eclipse.elk.json.edgeCoords': 'ROOT',
}

// 1) 首次: 全量布局 (默认 NETWORK_SIMPLEX), 保存每个节点的输出坐标
let lastPos: Map<string, { x: number; y: number }> = new Map()
const baseline = layoutElkJson(graph, { layoutOptions: ROOT_COORDS })
for (const n of baseline.children ?? []) lastPos.set(n.id, { x: n.x ?? 0, y: n.y ?? 0 })

// 2) 编辑图 (增删节点/边) 后: 增量重布局
function relayout(graph: ElkNode): ElkNode {
  const input = structuredClone(graph)
  for (const node of input.children ?? []) {
    const p = lastPos.get(node.id)
    if (!p) continue // 新节点: 用拖拽放置的 x/y (见 §4)
    node.x = p.x
    node.y = p.y
    // semi-interactive 层内序依赖 POSITION 属性 (字符串 "(x, y)")
    node.layoutOptions = {
      ...(node.layoutOptions ?? {}),
      'org.eclipse.elk.position': `(${p.x}, ${p.y})`,
    }
  }
  const out = layoutElkJson(input, { layoutOptions: { ...ROOT_COORDS, ...INCREMENTAL_OPTS } })
  lastPos = new Map((out.children ?? []).map((n) => [n.id, { x: n.x ?? 0, y: n.y ?? 0 }]))
  return out
}
```

要点:
- **ROOT 坐标模式**: 输出 x/y 直接是全局坐标, 回灌无需父偏移累加 (嵌套图同适用)。
- **深拷贝**: `layoutElkJson` 本身不改输入, 但你的 `graph` 常被多次编辑复用, 注入坐标前 clone
  一次, 避免把「上一轮坐标」写回源图。
- **无结构变化时重跑增量布局 → 位移 ≈ 0** (布局稳定), 可据此做 UI 节流/脏检测。

## 3. 位移度量 (UI 反馈)

```ts
function totalMove(out: ElkNode, prev: Map<string, { x: number; y: number }>): number {
  let d = 0
  for (const n of out.children ?? []) {
    const p = prev.get(n.id)
    if (p) d += Math.hypot((n.x ?? 0) - p.x, (n.y ?? 0) - p.y)
  }
  return d
}
```
增量布局时旧节点位移应远小于全量布局 (demo 实测: 加节点 0–120px vs 全量 905px)。

## 4. 新节点与特殊情形

- **新节点 (无历史坐标)**: 放在期望位置 (拖拽点/画布边缘), x 决定它落入哪个 span/层;
  拓扑修正会把反向边的目标移到下一层 (级联)。
- **删除节点**: 只需从图里移除; 其余节点回灌旧坐标后基本不动。
- **输入 x 重叠的节点合并到同一层** (span 合并, 触碰 `end === start` 不合并)。
- **非 INTERACTIVE 策略不受输入坐标影响** — 想回到全量重排, 去掉节点 x/y 与
  `org.eclipse.elk.position`, 清空 INCREMENTAL_OPTS 即可 (默认 NETWORK_SIMPLEX)。

## 5. Worker 版本 (大图不阻塞主线程)

1000+ 节点或高频重布局时, 把布局移到 Web Worker:

```ts
import { createLayoutWorker } from 'ggn-layout'
// Vite: 直接打包宿主脚本为独立 worker chunk
import LayoutWorker from 'ggn-layout/layout-worker?worker'

const client = createLayoutWorker(() => new LayoutWorker())
const out = await client.layout(input, { layoutOptions: INCREMENTAL_OPTS })  // 异步 Promise

client.dispose()  // 终止 worker
```

要点:
- 包导出 `ggn-layout/layout-worker` 子路径 (宿主脚本: 收消息 → `layoutElkJson` → 回传),
  客户端 `createLayoutWorker` 提供 requestId 并发、`onProgress` 阶段进度透传。
- **取消 = 终止 worker**: 布局是同步纯函数, abort 消息必然排在 layout 消息之后、永远无效;
  传工厂函数时取消后自动重建 worker, 后续请求继续可用 (demo 实测: 布局耗时 ~6ms vs 主线程同款,
  交互零卡顿)。
- 增量布局选项与主线程完全一致 (输入 x/y + INCREMENTAL_OPTS)。

## 6. 已知限制

- `interactiveLayout: true` 内部已触发 ConstraintsPostprocessor (写 `layering.layerId` /
  `crossingMinimization.positionId` 到节点属性), 但当前 JSON 输出**不序列化**这两个属性 —
  需要层号时用输出 x 序推断, 或自行改 `api/elk-json.ts` 的 `emit()` 补充序列化。
- elkjs 交叉验证: 选项名 `org.eclipse.elk.*` 对 elkjs 需改写为 `elk.*` (demo 有完整改写逻辑)。
- 增量稳定性以「层数/相对顺序」为准, 不保证像素级不变 (P4 节点放置会重算 x 间距)。
- worker 宿主面向浏览器 (self.onmessage); Node `worker_threads` 需自行桥接 `parentPort`。

## 7. 验证命令

```bash
cd packages/layout
./node_modules/.bin/vitest run tests/api/interactive-seed.test.ts tests/api/worker.test.ts tests/unit/InteractiveLayererTest.test.ts
# 浏览器 demo (增量 Playground, 主线程/Worker 切换): pnpm demo  (vite demo-vite, http://localhost:5199)
```
