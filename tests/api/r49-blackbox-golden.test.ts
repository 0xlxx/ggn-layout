/**
 * R49 黄金向量测试 (ELK Java 0.12.0 seed=1 固定输出为 SSOT).
 *
 * 背景: 孤立 black-box 节点 (有独立算法的子图, 如 box) 在 layered 布局中的处理 —
 * Java RecursiveGraphLayoutEngine 对 SEPARATE_CHILDREN 子图**两遍布局** (box 第二遍加入层尾),
 * ggn 采用**单遍黑盒** (box 作为 layered 叶子). 本测试验证修复后的确定性对齐部分:
 *   1. P3 层内排序: 孤立 black-box 排**层尾** (Java golden: n1 上 box 下) — R49 修复点
 *   2. box 子树 (box 算法部分) 与 golden 一致: 尺寸 + b1 位置
 *   3. 边结构: e0 存在且水平
 * 已知限制 (R52): n1/n2 精确 x 受 black-box 层宽参与差异 (Java 两遍独占层 vs ggn 单遍共享层)
 *   影响, 不做精确断言 — 断言相对关系 (n1 在 box 前, n2 在 n1 右侧).
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import { layoutElkJson, type ElkNode } from '../../src/api/index.js'

const GOLDEN = JSON.parse(fs.readFileSync(new URL('./fixtures/r49-blackbox-golden.json', import.meta.url), 'utf8')) as ElkNode

/** R49 输入: root > {n1,n2,box(box 算法, 含 b1)}, e0: n1→n2, box 孤立. */
function r49Input(): ElkNode {
  return {
    id: 'root',
    layoutOptions: { 'org.eclipse.elk.randomSeed': '1' },  // 全键: 短键 elk.randomSeed 被 shortOptKeys 忽略 (既有 bug)
    children: [
      { id: 'n1', width: 40, height: 20 },
      { id: 'n2', width: 40, height: 20 },
      { id: 'box', layoutOptions: { 'org.eclipse.elk.algorithm': 'org.eclipse.elk.box' }, children: [{ id: 'b1', width: 30, height: 30 }] },
    ],
    edges: [{ id: 'e0', sources: ['n1'], targets: ['n2'] }],
  }
}

const deepCopy = <T,>(o: T): T => JSON.parse(JSON.stringify(o)) as T

describe('R49 孤立 black-box 黄金向量 (vs ELK Java 0.12.0 seed=1)', () => {
  it('P3 层内排序: 孤立 black-box 排层尾 (n1 在 box 上方, 对齐 golden)', () => {
    const out = layoutElkJson(deepCopy(r49Input()))
    const n1 = out.children!.find((c) => c.id === 'n1')!
    const box = out.children!.find((c) => c.id === 'box')!
    // 层内顺序: n1 (层0 首位) 的 y < box (层0 层尾) 的 y — RIGHT 方向层内垂直排列
    expect(n1.y! < box.y!, '孤立 black-box 应排层尾 (n1 在 box 上方)').toBe(true)
    // golden 同: n1 y=12 < box y=52
    const gn1 = GOLDEN.children!.find((c) => c.id === 'n1')!
    const gbox = GOLDEN.children!.find((c) => c.id === 'box')!
    expect(gn1.y! < gbox.y!).toBe(true)
  })

  it('box 子树与 golden 一致: 尺寸 + b1 位置 (box 算法部分)', () => {
    const out = layoutElkJson(deepCopy(r49Input()))
    const box = out.children!.find((c) => c.id === 'box')!
    const gbox = GOLDEN.children!.find((c) => c.id === 'box')!
    expect(Math.abs(box.width! - gbox.width!)).toBeLessThanOrEqual(0.05)
    expect(Math.abs(box.height! - gbox.height!)).toBeLessThanOrEqual(0.05)
    const b1 = box.children!.find((c) => c.id === 'b1')!
    const gb1 = gbox.children!.find((c) => c.id === 'b1')!
    expect(Math.abs(b1.x! - gb1.x!)).toBeLessThanOrEqual(0.05)
    expect(Math.abs(b1.y! - gb1.y!)).toBeLessThanOrEqual(0.05)
    expect(gbox.width).toBe(60)
    expect(gbox.height).toBe(60)
  })

  it('边结构: e0 (n1→n2) 存在且水平', () => {
    const out = layoutElkJson(deepCopy(r49Input()))
    const e0 = out.edges!.find((e) => e.sources?.[0] === 'n1' && e.targets?.[0] === 'n2')!
    const s = e0.sections![0]!
    expect(s.startPoint.y).toBe(s.endPoint.y) // 水平
    expect(s.startPoint.x).toBeLessThan(s.endPoint.x) // 从左到右
  })

  it('层分配: n1/box 同层 (层0), n2 在右侧层 (层1) — 相对关系', () => {
    const out = layoutElkJson(deepCopy(r49Input()))
    const n1 = out.children!.find((c) => c.id === 'n1')!
    const n2 = out.children!.find((c) => c.id === 'n2')!
    const box = out.children!.find((c) => c.id === 'box')!
    // RIGHT 方向: 层沿 x, 层1 (n2) 在层0 (n1/box) 右侧
    expect(n2.x! > n1.x!).toBe(true)
    expect(n2.x! > box.x!).toBe(true)
  })
})

describe('R49 补充 (Plato 审阅覆盖)', () => {
  it('普通孤立 c + black-box box: box 绝对层尾 (seed 无关, 混合场景)', () => {
    for (const seed of ['1', '2', '3']) {
      const input: ElkNode = {
        id: 'root',
        layoutOptions: { 'org.eclipse.elk.randomSeed': seed },
        children: [
          { id: 'n1', width: 40, height: 20 },
          { id: 'n2', width: 40, height: 20 },
          { id: 'c', width: 30, height: 30 },
          { id: 'box', layoutOptions: { 'org.eclipse.elk.algorithm': 'org.eclipse.elk.box' }, children: [{ id: 'b1', width: 30, height: 30 }] },
        ],
        edges: [{ id: 'e0', sources: ['n1'], targets: ['n2'] }],
      }
      const out = layoutElkJson(deepCopy(input))
      const box = out.children!.find((x) => x.id === 'box')!
      const c = out.children!.find((x) => x.id === 'c')!
      const n1 = out.children!.find((x) => x.id === 'n1')!
      expect(box.y! > c.y!, `seed=${seed} box 应排 c 后`).toBe(true)
      expect(box.y! > n1.y!, `seed=${seed} box 应排 n1 后`).toBe(true)
    }
  })

  it('leaf 带算法节点 (无子) 不排层尾 (Java 当普通节点, R50 跳过 provider)', () => {
    const input: ElkNode = {
      id: 'root',
      layoutOptions: { 'org.eclipse.elk.randomSeed': '1' },
      children: [
        { id: 'n1', width: 40, height: 20 },
        { id: 'n2', width: 40, height: 20 },
        { id: 'leafBox', layoutOptions: { 'org.eclipse.elk.algorithm': 'org.eclipse.elk.box' } },
      ],
      edges: [{ id: 'e0', sources: ['n1'], targets: ['n2'] }],
    }
    const out = layoutElkJson(deepCopy(input))
    const leaf = out.children!.find((x) => x.id === 'leafBox')!
    // leafBox 无子 → 不标记 SEPARATE_CHILDREN → 普通孤立节点随机位 (不强制层尾)
    expect(leaf.y!).toBeLessThan(out.children!.find((x) => x.id === 'n1')!.y!)
  })
})

describe('R49 connectedBox (Plato P1 回归)', () => {
  it('有连接的 black-box 正常参与排序, 不强制层尾 (多 seed)', () => {
    for (const seed of ['1', '2', '3']) {
      const input: ElkNode = {
        id: 'root',
        layoutOptions: { 'org.eclipse.elk.randomSeed': seed },
        children: [
          { id: 'n1', width: 40, height: 20 },
          { id: 'n2', width: 40, height: 20 },
          { id: 'box', layoutOptions: { 'org.eclipse.elk.algorithm': 'org.eclipse.elk.box' }, children: [{ id: 'b1', width: 30, height: 30 }] },
        ],
        edges: [{ id: 'e0', sources: ['n1'], targets: ['n2'] }, { id: 'e1', sources: ['n2'], targets: ['box'] }],
      }
      const out = layoutElkJson(deepCopy(input))
      const box = out.children!.find((x) => x.id === 'box')!
      // 有连接 box 参与分层 (层2), 应在 n2 右侧 — 不是被压到 n1 后的层尾
      const n2 = out.children!.find((x) => x.id === 'n2')!
      expect(box.x! > n2.x!, `seed=${seed} 有连接 box 应在 n2 右侧层 (参与分层)`).toBe(true)
    }
  })
})
