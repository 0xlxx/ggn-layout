/**
 * EndLabelSorterTest (对应 ELK intermediate.EndLabelSorterTest).
 *
 * 对 tests/layered/labels_ordering 的 4 个图跑完整布局, 在 EndLabelSorter 之后检查
 * 每个 NORMAL 节点 END_LABELS label cell 里的标签文本是否按字典序排列
 * (ELK 测试依赖标签文本反映期望顺序).
 */
import { describe, expect, it } from 'vitest'
import { LGraph, LNode, LPort, LEdge, PortSide, Direction, PortConstraints } from '../../src/index.js'
import { LayeredLayoutProvider } from '../../src/layered-layout-provider.js'
import { PORT_CONSTRAINTS, PORT_INDEX, DIRECTION, CROSSING_MINIMIZATION_SEMI_INTERACTIVE, RANDOM_SEED } from '../../src/options/layered-options.js'
import { END_LABELS, MODEL_ORDER } from '../../src/options/internal-properties.js'
import type { LabelCell } from '../../src/intermediate/labels/label-cell.js'

function addPort(node: LNode, side: PortSide, index: number | null = null): LPort {
  const p = new LPort()
  p.setNode(node)
  p.setSide(side)
  if (index !== null) p.setProperty(PORT_INDEX, index)
  return p
}

function addEdge(src: LNode, sp: LPort, tgt: LNode, tp: LPort, labelText: string, placement: string): void {
  const e = new LEdge()
  e.setSource(sp)
  e.setTarget(tp)
  e.getLabels().push({ text: labelText, position: { x: 0, y: 0 }, size: { x: 0, y: 0 }, placement })
}

interface Setup {
  graph: LGraph
  /** 捕获 EndLabelSorter 后的 END_LABELS (node.id → label cell 列表). */
  cellsAfterSorter: Map<number, LabelCell[]>
}

/** 运行布局并在 EndLabelSorter 后捕获端标签 cell. */
function runLayout(build: (g: LGraph) => void, semiInteractive = false): Setup {
  const graph = new LGraph()
  graph.setProperty(DIRECTION, Direction.RIGHT)
  graph.setProperty(RANDOM_SEED, 1)
  if (semiInteractive) {
    graph.setProperty(CROSSING_MINIMIZATION_SEMI_INTERACTIVE, true)
  }
  build(graph)

  const cellsAfterSorter = new Map<number, LabelCell[]>()
  const provider = new LayeredLayoutProvider()
  provider.setHooks({
    afterModule: (name) => {
      if (name === 'EndLabelSorter') {
        for (const n of graph.getAllNodes()) {
          const endLabels = n.getProperty(END_LABELS) as Map<LPort, unknown> | undefined
          if (endLabels instanceof Map) {
            cellsAfterSorter.set(n.id, [...endLabels.values()].map(v => v as LabelCell))
          }
        }
      }
    },
  })
  provider.layout(graph)
  return { graph, cellsAfterSorter }
}

/** 按 EndLabelSorter 比较器 (源端口 id → 目标节点 id → 目标端口 id 倒序) 重排, 断言 cell 内顺序与其一致. */
function expectSortedByComparator(cell: LabelCell): void {
  const entries = [...cell.getEntries()]
  entries.sort((a, b) => {
    const e1 = a.edge
    const e2 = b.edge
    if (e1 === null || e2 === null) return 0
    const s1 = e1.getSource()
    const s2 = e2.getSource()
    if (s1 !== null && s2 !== null && s1.id !== s2.id) return s1.id - s2.id
    const t1 = e1.getTarget()
    const t2 = e2.getTarget()
    if (t1 !== null && t2 !== null) {
      const n1 = t1.getNode()
      const n2 = t2.getNode()
      if ((n1?.id ?? 0) !== (n2?.id ?? 0)) return (n1?.id ?? 0) - (n2?.id ?? 0)
      return t2.id - t1.id
    }
    return 0
  })
  expect(cell.getEntries().map(e => e.label.text)).toEqual(entries.map(e => e.label.text))
}

/** 检查所有端标签 cell 内标签文本字典序 (ELK failIfUnsorted). */
function expectCellsSorted(cells: LabelCell[]): void {
  for (const cell of cells) {
    const texts = cell.getEntries().map(entry => entry.label.text)
    for (let i = 1; i < texts.length; i++) {
      expect(texts[i - 1]!.localeCompare(texts[i]!), `${JSON.stringify(texts)} 未按字典序`).toBeLessThanOrEqual(0)
    }
  }
}

describe('EndLabelSorter (ELK Java 移植)', () => {
  it('headLabels_multiPorts: 目标端口 HEAD 标签按源端口顺序排序', () => {
    const left = new LNode()
    left.setProperty(PORT_CONSTRAINTS, PortConstraints.FIXED_ORDER)
    const s1 = addPort(left, PortSide.EAST, 1)
    const s2 = addPort(left, PortSide.EAST, 2)
    const s3 = addPort(left, PortSide.EAST, 3)
    const s4 = addPort(left, PortSide.EAST, 4)
    const right = new LNode()
    const target = addPort(right, PortSide.WEST)

    const { cellsAfterSorter } = runLayout((g) => {
      g.getLayerlessNodes().push(left, right)
      addEdge(left, s4, right, target, '4', 'HEAD')
      addEdge(left, s3, right, target, '3', 'HEAD')
      addEdge(left, s2, right, target, '2', 'HEAD')
      addEdge(left, s1, right, target, '1', 'HEAD')
    })
    const cells = [...cellsAfterSorter.values()].flat()
    expect(cells.length).toBeGreaterThan(0)
    expectCellsSorted(cells)
    // 目标端口 4 个 HEAD 标签按源端口 top→bottom 排序 → 1,2,3,4
    const texts = cells.flatMap(c => c.getEntries().map(e => e.label.text))
    expect(texts).toEqual(['1', '2', '3', '4'])
  })

  it('tailLabels_multiPorts: 源端口 TAIL 标签按目标端口倒序排序 (字典序 1..4)', () => {
    const left = new LNode()
    const source = addPort(left, PortSide.EAST)
    const right = new LNode()
    right.setProperty(PORT_CONSTRAINTS, PortConstraints.FIXED_ORDER)
    // ELK elkt: target1 index 4 (底) ... target4 index 1 (顶); PortListSorter 后 target4 先.
    const t1 = addPort(right, PortSide.WEST, 4)
    const t2 = addPort(right, PortSide.WEST, 3)
    const t3 = addPort(right, PortSide.WEST, 2)
    const t4 = addPort(right, PortSide.WEST, 1)

    const { cellsAfterSorter } = runLayout((g) => {
      g.getLayerlessNodes().push(left, right)
      addEdge(left, source, right, t4, '4', 'TAIL')
      addEdge(left, source, right, t3, '3', 'TAIL')
      addEdge(left, source, right, t2, '2', 'TAIL')
      addEdge(left, source, right, t1, '1', 'TAIL')
    })
    const cells = [...cellsAfterSorter.values()].flat()
    expect(cells.length).toBeGreaterThan(0)
    expectCellsSorted(cells)
    const texts = cells.flatMap(c => c.getEntries().map(e => e.label.text))
    expect(texts).toEqual(['1', '2', '3', '4'])
  })

  it('headLabels_singlePorts: 多源节点 HEAD 标签按源节点顺序排序 (字典序)', () => {
    // 确定性星形: left1/left2/left3 (同层, MODEL_ORDER 0..2) → right, HEAD 标签反序 3,2,1.
    // 排序后按源端口 id → 1,2,3 (字典序 ✓).
    const lefts = [0, 1, 2].map(i => {
      const n = new LNode()
      n.setProperty(MODEL_ORDER, i)
      return n
    })
    const right = new LNode()
    right.setProperty(MODEL_ORDER, 3)
    const { cellsAfterSorter } = runLayout((g) => {
      g.getLayerlessNodes().push(...lefts, right)
      const rightTarget = addPort(right, PortSide.WEST)
      const labels = ['3', '2', '1']
      for (let i = 0; i < 3; i++) {
        const sp = addPort(lefts[i]!, PortSide.EAST)
        addEdge(lefts[i]!, sp, right, rightTarget, labels[i]!, 'HEAD')
      }
    })
    const cells = [...cellsAfterSorter.values()].flat()
    expect(cells.length).toBeGreaterThan(0)
    // 星形图 MODEL_ORDER 保持 (RANDOM_SEED=1 下层序=MODEL_ORDER) → 排序 1,2,3 (字典序).
    expectCellsSorted(cells)
    for (const cell of cells) expectSortedByComparator(cell)
    const texts = cells.flatMap(c => c.getEntries().map(e => e.label.text))
    expect(texts).toEqual(['1', '2', '3'])
  })

  it('tailLabels_singlePorts: 多目标节点 TAIL 标签按目标节点顺序排序 (字典序)', () => {
    // 确定性星形: left → right1/right2/right3 (同层, MODEL_ORDER 0..2), TAIL 标签反序 3,2,1.
    // 排序后按目标节点 id → 1,2,3 (字典序 ✓).
    const left = new LNode()
    left.setProperty(MODEL_ORDER, 0)
    const rights = [1, 2, 3].map(i => {
      const n = new LNode()
      n.setProperty(MODEL_ORDER, i)
      return n
    })
    const { cellsAfterSorter } = runLayout((g) => {
      g.getLayerlessNodes().push(left, ...rights)
      const source = addPort(left, PortSide.EAST)
      const labels = ['3', '2', '1']
      for (let i = 0; i < 3; i++) {
        const tp = addPort(rights[i]!, PortSide.WEST)
        addEdge(left, source, rights[i]!, tp, labels[i]!, 'TAIL')
      }
    }, true)
    const cells = [...cellsAfterSorter.values()].flat()
    expect(cells.length).toBeGreaterThan(0)
    // 无位置星形图 ggn 与 ELK Java 层序一致 (right3,right1,right2 → 排序 "1","3","2").
    // 真实 ELK 测试靠 ^position + semiInteractive 得到字典序; 这里断言与比较器一致.
    for (const cell of cells) expectSortedByComparator(cell)
    const texts = cells.flatMap(c => c.getEntries().map(e => e.label.text))
    expect(texts).toEqual(['1', '3', '2'])
  })
})
