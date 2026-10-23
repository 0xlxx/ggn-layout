/**
 * GGN 扩展 `leafBaseline`（叶子基线对齐）契约测试。
 *
 * 该选项是布局**完成后**的纵轴后处理：把所有叶子的底边拉到同一条水平线，并自底向上
 * 按「布局器原本给出的内边距」重算各容器高度。横轴（x/width）与默认关闭时的输出都不许变。
 *
 * 覆盖：
 *   1. 横向布局：叶子底边共线；横轴逐位不变。
 *   2. 容器不变量：高度 == 原上内边距 + 孩子纵向外沿 + 原下内边距（不解析 padding 字符串）。
 *   3. 嵌套越深越往上鼓（括号效果）。
 *   4. 关闭（缺省 / false）与纵向（DOWN/UP）都是逐位不变。
 *   5. 坐标投影（shapeCoords: ROOT）后仍共线 —— 对齐必须在投影之前完成。
 *   6. 纯函数：不修改传入的 input。
 */
import { describe, expect, it } from 'vitest'
import { layoutElkJson, type ElkLayoutOptions, type LayoutInput, type LayoutOutput } from '../../src/api/index.js'

const PAD = '[top=36,left=13,bottom=13,right=13]'
const ROOT_PAD = '[top=10,left=10,bottom=10,right=10]'

const leaf = (id: string, width = 60, height = 51): LayoutInput => ({ id, width, height })

/** 兄弟链式边：只钉顺序，不参与绘制（fast-english 句式图的做法）。 */
const chain = (ids: readonly string[]) =>
  ids.slice(1).map((id, i) => ({ id: `${ids[i]}--${id}`, sources: [ids[i]!], targets: [id] }))

/**
 * 仿 fast-english 句法成分树：S > [Det, N, V, NP[Det, N]]，根部还有一层 group 包裹，
 * 用来验证「叶子位于不同嵌套深度」这一关键场景。
 */
function structureInput(): LayoutInput {
  return {
    id: 'structure',
    children: [
      leaf('s-0'),
      leaf('s-1'),
      {
        id: 's-2',
        layoutOptions: { 'org.eclipse.elk.padding': PAD },
        children: [leaf('s-2-0'), leaf('s-2-1')],
        edges: chain(['s-2-0', 's-2-1']),
      },
      {
        id: 's-3',
        layoutOptions: { 'org.eclipse.elk.padding': PAD },
        children: [
          leaf('s-3-0'),
          {
            id: 's-3-1',
            layoutOptions: { 'org.eclipse.elk.padding': PAD },
            children: [leaf('s-3-1-0'), leaf('s-3-1-1')],
            edges: chain(['s-3-1-0', 's-3-1-1']),
          },
        ],
        edges: chain(['s-3-0', 's-3-1']),
      },
    ],
    edges: chain(['s-0', 's-1', 's-2', 's-3']),
  }
}

/**
 * 带黑盒子树的成分图：`box` 是非 layered 算法，内部三个块由 box provider 自己纵向堆叠，
 * 对 layered 来说它是一块不可穿透的原子叶子。
 */
function blackBoxInput(): LayoutInput {
  return {
    id: 'structure',
    children: [
      leaf('s-0'),
      leaf('s-1'),
      {
        id: 'box',
        layoutOptions: { 'org.eclipse.elk.algorithm': 'org.eclipse.elk.box' },
        children: [leaf('b0'), leaf('b1'), leaf('b2')],
      },
    ],
    edges: chain(['s-0', 's-1', 'box']),
  }
}

/**
 * 兄弟之间**没有**链式边的成分图：所有孩子留在同一层，横轴区间互相重叠，只能靠纵轴分开。
 * 这正是「叶子共线」约束会打架的输入 —— 对齐必须原样返回，不能把它们叠成一坨。
 */
function sameLayerInput(): LayoutInput {
  return {
    id: 'structure',
    children: [
      leaf('a'),
      leaf('b'),
      {
        id: 'g',
        layoutOptions: { 'org.eclipse.elk.padding': PAD },
        children: [leaf('g0'), leaf('g1')],
      },
    ],
  }
}

type LayoutOptionsFull = ElkLayoutOptions & { responseFormat?: 'full' | 'concise' }
const opts = (extra: Partial<LayoutOptionsFull> = {}): LayoutOptionsFull => ({
  direction: 'RIGHT',
  hierarchyHandling: 'INCLUDE_CHILDREN',
  layoutOptions: { 'org.eclipse.elk.padding': ROOT_PAD },
  ...extra,
})

/** 节点 id → 全局纵轴（默认 PARENT 坐标：逐层累加父偏移）。 */
function globalTops(root: LayoutOutput): Map<string, number> {
  const out = new Map<string, number>()
  const walk = (node: LayoutOutput, parentTop: number): void => {
    const top = parentTop + (node.y ?? 0)
    out.set(node.id, top)
    for (const child of node.children ?? []) walk(child, top)
  }
  walk(root, 0)
  return out
}

/** 叶子 id（无 children 的节点）。 */
function leafIds(root: LayoutOutput): string[] {
  const ids: string[] = []
  const walk = (node: LayoutOutput): void => {
    if ((node.children?.length ?? 0) === 0) ids.push(node.id)
    for (const child of node.children ?? []) walk(child)
  }
  walk(root)
  return ids
}

/** 节点 id → 该节点（含嵌套）。 */
function index(root: LayoutOutput): Map<string, LayoutOutput> {
  const out = new Map<string, LayoutOutput>()
  const walk = (node: LayoutOutput): void => {
    out.set(node.id, node)
    for (const child of node.children ?? []) walk(child)
  }
  walk(root)
  return out
}

/** 容器 id → { 原上内边距, 原下内边距 }（相对孩子坐标，取布局器自己给出的值）。 */
function insets(root: LayoutOutput): Map<string, { top: number; bottom: number }> {
  const out = new Map<string, { top: number; bottom: number }>()
  const walk = (node: LayoutOutput): void => {
    const children = node.children ?? []
    if (children.length > 0) {
      const tops = children.map((c) => c.y ?? 0)
      const bottoms = children.map((c) => (c.y ?? 0) + (c.height ?? 0))
      out.set(node.id, {
        top: Math.min(...tops),
        bottom: (node.height ?? 0) - Math.max(...bottoms),
      })
    }
    for (const child of children) walk(child)
  }
  walk(root)
  return out
}

describe('leafBaseline（叶子基线对齐）', () => {
  it('横向布局：所有叶子底边落在同一条线上', () => {
    const plain = layoutElkJson(structureInput(), opts())
    const aligned = layoutElkJson(structureInput(), opts({ leafBaseline: true }))

    // 前提：不开选项时确实是参差的（否则这条测试没有意义）。
    const plainTops = globalTops(plain)
    const plainIndex = index(plain)
    const plainBottoms = leafIds(plain).map((id) => plainTops.get(id)! + (plainIndex.get(id)!.height ?? 0))
    expect(new Set(plainBottoms).size).toBeGreaterThan(1)

    const tops = globalTops(aligned)
    const nodes = index(aligned)
    const bottoms = leafIds(aligned).map((id) => tops.get(id)! + (nodes.get(id)!.height ?? 0))
    expect(bottoms.length).toBeGreaterThan(1)
    expect(new Set(bottoms).size).toBe(1)
  })

  it('横轴逐位不变：x / width 与不开该选项时完全一致', () => {
    const plain = index(layoutElkJson(structureInput(), opts()))
    const aligned = index(layoutElkJson(structureInput(), opts({ leafBaseline: true })))

    expect([...aligned.keys()].sort()).toEqual([...plain.keys()].sort())
    for (const [id, node] of aligned) {
      expect(node.x, `${id}.x`).toBe(plain.get(id)!.x)
      expect(node.width, `${id}.width`).toBe(plain.get(id)!.width)
    }
  })

  it('容器自底向上重算：高度 == 原上内边距 + 孩子外沿 + 原下内边距', () => {
    const plain = layoutElkJson(structureInput(), opts())
    const aligned = layoutElkJson(structureInput(), opts({ leafBaseline: true }))
    const pads = insets(plain)
    const nodes = index(aligned)

    expect(pads.size).toBeGreaterThan(0)
    for (const [id, pad] of pads) {
      const children = nodes.get(id)!.children ?? []
      const tops = children.map((c) => c.y ?? 0)
      const bottoms = children.map((c) => (c.y ?? 0) + (c.height ?? 0))
      // 上内边距原样保留：最高的孩子到容器上沿的距离不变。
      expect(Math.min(...tops), `${id} 上内边距`).toBeCloseTo(pad.top, 10)
      expect(
        nodes.get(id)!.height,
        `${id} 高度 = 上内边距 + 孩子外沿 + 下内边距`,
      ).toBeCloseTo(pad.top + (Math.max(...bottoms) - Math.min(...tops)) + pad.bottom, 10)
    }
  })

  it('组块像括号一样一层层往上长：越外层上沿越高，且都高于叶子线', () => {
    const aligned = layoutElkJson(structureInput(), opts({ leafBaseline: true }))
    const tops = globalTops(aligned)
    const leafTop = tops.get('s-0')!
    // s-3 套着 s-3-1，s-3-1 再套着两个叶子 —— 每往外一层就再往上鼓一截。
    expect(tops.get('s-3')!).toBeLessThan(tops.get('s-3-1')!)
    expect(tops.get('s-3-1')!).toBeLessThan(leafTop)
    expect(tops.get('s-2')!).toBeLessThan(leafTop)
  })

  it('默认关闭：不传选项与显式 false 的输出逐位一致', () => {
    const omitted = layoutElkJson(structureInput(), opts())
    const disabled = layoutElkJson(structureInput(), opts({ leafBaseline: false }))
    expect(JSON.stringify(disabled)).toBe(JSON.stringify(omitted))
  })

  it('纵向布局（DOWN）忽略该选项：纵轴是分层轴，不能被拉平', () => {
    for (const direction of ['DOWN', 'UP'] as const) {
      const plain = layoutElkJson(structureInput(), opts({ direction }))
      const withOption = layoutElkJson(structureInput(), opts({ direction, leafBaseline: true }))
      expect(JSON.stringify(withOption), direction).toBe(JSON.stringify(plain))
    }
  })

  it('shapeCoords: ROOT 下同样共线（对齐在坐标投影之前完成）', () => {
    const extra = { layoutOptions: { 'org.eclipse.elk.padding': ROOT_PAD, 'org.eclipse.elk.json.shapeCoords': 'ROOT' } }
    const aligned = layoutElkJson(structureInput(), opts({ ...extra, leafBaseline: true }))
    // ROOT 投影下 y 已经是全局坐标，直接读。
    const nodes = index(aligned)
    const bottoms = leafIds(aligned).map((id) => (nodes.get(id)!.y ?? 0) + (nodes.get(id)!.height ?? 0))
    expect(new Set(bottoms).size).toBe(1)
  })

  it('只有一个叶子时几何完全不动', () => {
    const input: LayoutInput = { id: 'root', children: [leaf('a'), leaf('b')], edges: chain(['a', 'b']) }
    const plain = layoutElkJson(input, opts())
    const aligned = layoutElkJson(input, opts({ leafBaseline: true }))
    expect(JSON.stringify(aligned)).toBe(JSON.stringify(plain))
  })

  it('黑盒子树按原子叶子参与：内部几何逐位不变，不会被穿透拉平', () => {
    const plain = layoutElkJson(blackBoxInput(), opts())
    const aligned = layoutElkJson(blackBoxInput(), opts({ leafBaseline: true }))

    const plainBox = index(plain).get('box')!
    const alignedBox = index(aligned).get('box')!
    // 前提：黑盒子树确实把自己那套几何带回了输出，否则这条测试没有意义。
    expect((plainBox.children ?? []).length).toBe(3)

    // 内部几何（相对黑盒节点）逐位不变 —— 穿透进去的话，同列堆叠的三个兄弟会被拉到
    // 同一条基线上，直接重叠。
    expect(JSON.stringify(alignedBox.children)).toBe(JSON.stringify(plainBox.children))
    const innerBottoms = (alignedBox.children ?? []).map((c) => (c.y ?? 0) + (c.height ?? 0))
    expect(new Set(innerBottoms).size).toBe(3)

    // 黑盒节点自己作为原子叶子参与对齐：与其它叶子底边共线。
    const tops = globalTops(aligned)
    const nodes = index(aligned)
    const bottoms = ['s-0', 's-1', 'box'].map((id) => tops.get(id)! + (nodes.get(id)!.height ?? 0))
    expect(new Set(bottoms).size).toBe(1)
  })

  it('同层兄弟（横轴重叠）会互相压叠时原样返回：绝不制造布局器没有的重叠', () => {
    const plain = layoutElkJson(sameLayerInput(), opts())
    const aligned = layoutElkJson(sameLayerInput(), opts({ leafBaseline: true }))

    // 前提：这个 fixture 里兄弟确实留在同一层（横轴区间重叠），否则这条测试没有意义。
    const nodes = index(plain)
    expect(nodes.get('a')!.x).toBeLessThan(nodes.get('g')!.x! + nodes.get('g')!.width!)

    expect(JSON.stringify(aligned)).toBe(JSON.stringify(plain))
  })

  it('纯函数：不修改传入的 input', () => {
    const input = structureInput()
    const before = JSON.stringify(input)
    layoutElkJson(input, opts({ leafBaseline: true }))
    expect(JSON.stringify(input)).toBe(before)
  })
})
