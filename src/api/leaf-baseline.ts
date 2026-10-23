/*
 * Copyright (c) 2026 GGN contributors.
 * Portions derived from the Eclipse Layout Kernel (ELK), Copyright (c) Kiel University and others.
 *
 * This file is part of ggn-layout, a TypeScript port of ELK v0.12.0.
 * Upstream attribution and source range: see THIRD_PARTY_NOTICES.md.
 *
 * SPDX-License-Identifier: EPL-2.0
 * License text: LICENSES/EPL-2.0.txt.
 */
/**
 * 叶子基线对齐（GGN 自有后处理，非 ELK 移植；默认关闭，只有显式开启才运行）。
 *
 * 分层布局把交叉轴（横向布局里就是 y）当副产物：同一层的节点按**中心**对齐，容器内部的
 * 孩子再被自己的上内边距往下推 —— 嵌套越深的叶子越低，同一张图里叶子的底边因此参差不齐。
 * ELK 没有跨层基线约束（`nodePlacement.*` / `alignment` 各档实测都不改变这一点），所以这里在
 * 布局完成之后、坐标投影之前，按「所有叶子底边共线」重算纵轴。
 *
 * 做法（自底向上，全部在**相对父节点**坐标系里完成）：
 *   1. 叶子：整体平移，使底边落到同一条基线；
 *   2. 容器：整体平移，使**最高的孩子**与自己上沿的距离等于布局器原本给出的上内边距
 *      （`topInset`）—— 也就是原样保留布局器给这个容器定的内边距，只把「孩子占的纵向
 *      范围」重新算一遍，容器高度 = 上内边距 + 孩子外沿 + 下内边距；
 *   3. 根的基线归一化（所有孩子整体平移），保证内容外沿相对根的位置不变。
 *
 * 这是「叶子共线」这个约束在树形输入下的**闭式解**：纵轴没有互相冲突的自由度，一次后序
 * 递推就够（对应文献里的 non-layered tidy tree：横轴给定、纵轴由树算），不需要 QP/分离约束
 * 求解器。只有在「同一层的兄弟也要被拉到同一条线」时约束才会打架 —— 那些节点的横轴区间
 * 互相重叠，纵向却没有位置可分。这时**原样返回**（见 makesNodesOverlap），宁可不对齐也不
 * 生成布局器没有的重叠。
 *
 * 不变量：横轴（x/width）一个数都不动；内边距取自布局结果本身（不解析 padding 字符串、
 * 不假设任何具体选项），因此对任何 provider 的输出都成立。
 *
 * 已知边界：只调整**节点几何**。边 sections 仍是布局器按旧几何算出的结果，不再与对齐后
 * 的端点吻合 —— 用于「边只表达顺序、不参与绘制」的成分图这类场景（如
 * fast-english 的句子结构图），需要边贴合节点时请勿开启。
 *
 * 黑盒子树（`box`/`fixed`/`rectpacking` 等非 layered 算法，其内部几何由自己的 provider
 * 决定）必须经 `opaqueIds` 声明为**原子叶子**：它们内部各块本来就在同一条纵轴上按顺序
 * 堆叠，穿透进去把它们拉到同一条基线会让同列兄弟互相重叠。
 */
import type { ElkNode } from './elk-json.js'

/** 对齐前的纵轴快照。多趟算法要靠它区分「原始值」与「已平移值」。 */
interface NodeSnapshot {
  /** 相对父节点的原始 y（缺省 0）。 */
  y: number
  /** 原始高度（缺省 0）。子容器的高度会被重算，故必须留底。 */
  height: number
  /** 原始全局 y（逐层累加父偏移）。叶子靠它算出「落到基线要移动多少」。 */
  globalY: number
  children: ElkNode[]
}

/** 预演出来的新纵轴几何（相对父节点）。 */
interface NodePlan {
  /** 新「相对父节点 y」。 */
  y: number
  /** 新高度。叶子沿用原高度，容器按孩子外沿 + 原内边距重算。 */
  height: number
}

/** 预演后的全局矩形 + 父指针，用来检查新几何有没有制造重叠。 */
interface PlannedRect {
  node: ElkNode
  x0: number
  x1: number
  y0: number
  y1: number
  parent: ElkNode | null
}

const EPS = 1e-9

/**
 * 原样收录整棵输出树的纵轴快照（此时还没有任何改写）。
 *
 * `opaqueIds` 里的节点按原子叶子收录：只记自己、不递归子节点。坐标是**相对父节点**的，
 * 父节点整体平移时子树自然跟着走，所以这里既不需要、也不应该改它们的内部几何。
 */
function snapshotTree(node: ElkNode, globalY: number, into: Map<ElkNode, NodeSnapshot>, opaqueIds?: ReadonlySet<string>): void {
  const y = node.y ?? 0
  const children = opaqueIds?.has(node.id) === true ? [] : (node.children ?? [])
  into.set(node, { y, height: node.height ?? 0, globalY, children })
  for (const child of children) snapshotTree(child, globalY + (child.y ?? 0), into, opaqueIds)
}

/**
 * 每个节点需要整体平移多少（全局量，正数向下）。
 *
 * 叶子由「底边落到基线」直接定；容器由「最高孩子的落点 + 自己的上内边距」反推，
 * 所以容器的位移只取决于子树，与兄弟无关 —— 这正是「像括号一样一层层往上鼓」的来源。
 * 基线取 0 即可：把 B 换成 B+t 只会让所有位移同时加 t，而下文一律用位移之差，
 * 几何与 B 无关。
 */
function computeShifts(node: ElkNode, snap: Map<ElkNode, NodeSnapshot>, into: Map<ElkNode, number>): number {
  const self = snap.get(node)!
  if (self.children.length === 0) {
    const shift = -(self.globalY + self.height)
    into.set(node, shift)
    return shift
  }
  let highest = Number.POSITIVE_INFINITY
  let topInset = Number.POSITIVE_INFINITY
  for (const child of self.children) {
    const childSnap = snap.get(child)!
    highest = Math.min(highest, childSnap.y + computeShifts(child, snap, into))
    topInset = Math.min(topInset, childSnap.y)
  }
  const shift = highest - topInset
  into.set(node, shift)
  return shift
}

/**
 * 预演一遍自顶向下的落笔：算出每个节点新的「相对父节点 y」与新高度，但**不写回树**。
 *
 * 顺序与原实现一致：先递归子树（子容器高度先定型），再摆孩子，最后定自己的高度。
 * 孩子的新 y = 原始 y + 自身位移 − 父位移（位移是全局量，父位移是归一化常数）。
 * 高度用原始内边距 + 孩子新外沿重算，于是容器永远恰好裹住孩子。
 */
function planShifts(
  node: ElkNode,
  shift: number,
  snap: Map<ElkNode, NodeSnapshot>,
  shifts: Map<ElkNode, number>,
  into: Map<ElkNode, NodePlan>,
): NodePlan {
  const self = snap.get(node)!
  if (self.children.length === 0) {
    const plan: NodePlan = { y: self.y, height: self.height }
    into.set(node, plan)
    return plan
  }
  for (const child of self.children) planShifts(child, shifts.get(child)!, snap, shifts, into)
  for (const child of self.children) {
    into.get(child)!.y = snap.get(child)!.y + shifts.get(child)! - shift
  }
  let topInset = Number.POSITIVE_INFINITY
  let bottomInset = Number.NEGATIVE_INFINITY
  for (const child of self.children) {
    const childSnap = snap.get(child)!
    topInset = Math.min(topInset, childSnap.y)
    bottomInset = Math.max(bottomInset, childSnap.y + childSnap.height)
  }
  bottomInset = self.height - bottomInset
  let newTop = Number.POSITIVE_INFINITY
  let newBottom = Number.NEGATIVE_INFINITY
  for (const child of self.children) {
    const childPlan = into.get(child)!
    newTop = Math.min(newTop, childPlan.y)
    newBottom = Math.max(newBottom, childPlan.y + childPlan.height)
  }
  const plan: NodePlan = { y: self.y, height: topInset + (newBottom - newTop) + bottomInset }
  into.set(node, plan)
  return plan
}

/**
 * 把预演结果写回树。只改快照收录过的节点：叶子不重算高度（沿用布局器给的），
 * 黑盒子树的内部几何（不在快照里）原样不动。
 */
function commitPlan(node: ElkNode, plan: Map<ElkNode, NodePlan>, snap: Map<ElkNode, NodeSnapshot>): void {
  const self = snap.get(node)!
  for (const child of self.children) {
    child.y = plan.get(child)!.y
    commitPlan(child, plan, snap)
  }
  if (self.children.length > 0) node.height = plan.get(node)!.height
}

/** 按预演结果算出每个节点的全局矩形（横轴原样，纵向走 plan）。 */
function collectRects(
  node: ElkNode,
  parentX: number,
  parentY: number,
  parent: ElkNode | null,
  plan: Map<ElkNode, NodePlan>,
  snap: Map<ElkNode, NodeSnapshot>,
  into: PlannedRect[],
): void {
  const p = plan.get(node)
  if (p === undefined) return
  const x0 = parentX + (node.x ?? 0)
  const y0 = parentY + p.y
  into.push({ node, x0, x1: x0 + (node.width ?? 0), y0, y1: y0 + p.height, parent })
  for (const child of snap.get(node)!.children) collectRects(child, x0, y0, node, plan, snap, into)
}

/** a 是不是 b 的祖先（父子/爷孙关系不算重叠，嵌套本来就是包含）。 */
function isAncestor(a: ElkNode, b: ElkNode, parentOf: Map<ElkNode, ElkNode | null>): boolean {
  for (let p = parentOf.get(b) ?? null; p !== null; p = parentOf.get(p) ?? null) {
    if (p === a) return true
  }
  return false
}

/**
 * 新几何会不会把两个本来错开的节点叠在一起？
 *
 * 布局器的基本不变量是「横轴区间重叠的两个节点（互不为祖先）纵向必须分开」。对齐要动的
 * 恰好是纵轴，所以只在横轴区间重叠、又不是祖先关系的一对节点上检查（按 x0 排序后一次扫描，
 * 后面的 b 只会更靠右，扫到不再重叠就可以停）。
 */
function makesNodesOverlap(rects: readonly PlannedRect[]): boolean {
  const parentOf = new Map<ElkNode, ElkNode | null>()
  for (const rect of rects) parentOf.set(rect.node, rect.parent)
  const byX = [...rects].sort((a, b) => a.x0 - b.x0)
  for (let i = 0; i < byX.length; i++) {
    const a = byX[i]!
    for (let j = i + 1; j < byX.length; j++) {
      const b = byX[j]!
      if (b.x0 >= a.x1 - EPS) break
      if (a.y1 <= b.y0 + EPS || b.y1 <= a.y0 + EPS) continue
      if (isAncestor(a.node, b.node, parentOf) || isAncestor(b.node, a.node, parentOf)) continue
      return true
    }
  }
  return false
}

/**
 * 把整棵输出树里所有叶子节点的**底边**对齐到同一条水平线，并自底向上重算各容器的高度。
 *
 * 原地修改传入的树（`layoutElkJson` 内部在输出副本上调用，消费方不受影响）；横轴一律不动。
 * 调用方负责判断方向是否有意义（纵向布局里纵轴是分层轴，拉平会破坏层结构）。
 *
 * 先预演、再做一次可行性检查，只有新几何不会制造重叠才落笔；否则整棵树保持原样。
 *
 * @param opaqueIds 不透明子树（黑盒子树）的节点 id：按原子叶子参与对齐，内部几何不动。
 */
export function alignLeafBaseline(root: ElkNode, opaqueIds?: ReadonlySet<string>): void {
  const snap = new Map<ElkNode, NodeSnapshot>()
  snapshotTree(root, 0, snap, opaqueIds)
  const shifts = new Map<ElkNode, number>()
  const rootShift = computeShifts(root, snap, shifts)
  const plan = new Map<ElkNode, NodePlan>()
  planShifts(root, rootShift, snap, shifts, plan)
  const rects: PlannedRect[] = []
  collectRects(root, 0, 0, null, plan, snap, rects)
  if (makesNodesOverlap(rects)) return
  commitPlan(root, plan, snap)
}
