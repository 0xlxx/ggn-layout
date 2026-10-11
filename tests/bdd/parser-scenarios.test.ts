/**
 * elkt 解析器 (scripts/elkt2test.mjs parseElkt) 行为规格 — 直接 vitest 写法.
 *
 * 与 .feature + 正则 step 注册表相比:
 *   - 场景即类型化数据行 + it.each → vitest UI 渲染成可读用例名, 保持"表格即规格"的直观;
 *   - 无正则/无全局 step 注册表 → 重构友好, 参数类型安全, 报错直接指向断言行;
 *   - 断言只覆盖可从 elkt 源码直接验证的结构/属性, 不依赖外部布局 oracle.
 *
 * 语义基准: ELK 文本格式语法 (ElkGraph.xtext):
 *   - label 的 id 可选 (`label "text"` 与 `label id: "text"` 均合法);
 *   - 端口 `index: -1` 表示未定义 (ELK PORT_INDEX 默认 -1), 解析器不注入显式约束;
 *   - 嵌套节点 id 用 `父.子` 全限定, 层级由 node 块嵌套表达。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { globSync } from 'glob'
import { parseElkt, elktToElkJson } from '../../scripts/elkt2test.mjs'
import { buildLGraphFromParsed, elkJsonToParsed } from '../../shared/elkgraph-builder.js'
import { PORT_INDEX } from '../../src/options/layered-options.js'

const MODEL_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../test-resources/elk-models')

function parse(model: string) {
  return parseElkt(readFileSync(join(MODEL_ROOT, model), 'utf8'))
}

/** 结构计数用例表 (数值来自 elkt 源码可直接核对). */
interface StructureCase {
  name: string
  file: string
  nodes: number
  edges: number
  hierarchy: number
  ports: number
}
const structureCases: StructureCase[] = [
  { name: 'direction — 四个方向容器', file: 'examples/general/direction.elkt', nodes: 12, edges: 4, hierarchy: 4, ports: 0 },
  { name: 'mixingDirection — 混合方向容器', file: 'examples/general/mixingDirection.elkt', nodes: 7, edges: 3, hierarchy: 3, ports: 0 },
  { name: '411a — N-S 端口锚点 (NORTH)', file: 'tickets/layered/411_north_south_port_anchor_a.elkt', nodes: 3, edges: 2, hierarchy: 0, ports: 2 },
  { name: '411b — N-S 端口锚点 (SOUTH+NORTH)', file: 'tickets/layered/411_north_south_port_anchor_b.elkt', nodes: 3, edges: 3, hierarchy: 0, ports: 3 },
  { name: '628 — 层级感知处理器', file: 'tickets/layered/628_hierarchyAwareLayoutProcessor.elkt', nodes: 4, edges: 1, hierarchy: 2, ports: 0 },
  { name: 'heateropentank — 层级 Ptolemey 模型', file: 'realworld/ptolemy/hierarchical/algebraic_heateropentank_HeaterOpenTank.elkt', nodes: 17, edges: 44, hierarchy: 5, ports: 52 },
  { name: 'blindCommunication — 层级 Ptolemey 模型', file: 'realworld/ptolemy/hierarchical/pn_blindcommunication_BlindCommunication.elkt', nodes: 51, edges: 66, hierarchy: 6, ports: 119 },
]

describe('elkt 解析器 (parseElkt)', () => {
  it.each(structureCases)('结构: $name', ({ file, nodes, edges, hierarchy, ports }) => {
    const g = parse(file)
    expect(g.nodes).toHaveLength(nodes)
    expect(g.edges).toHaveLength(edges)
    expect(g.hierarchy.size).toBe(hierarchy)
    const portCount = [...g.nodeProps.values()].reduce((n, p) => n + (p.ports?.length ?? 0), 0)
    expect(portCount).toBe(ports)

    // 引用完整性: 边端点 / 层级容器与子节点 / 节点属性 全部存在.
    const nodeSet = new Set(g.nodes)
    for (const [s, , t] of g.edges) {
      expect(nodeSet.has(s as string), `边端点 ${s} 不存在`).toBe(true)
      expect(nodeSet.has(t as string), `边端点 ${t} 不存在`).toBe(true)
    }
    for (const [parent, kids] of g.hierarchy) {
      expect(nodeSet.has(parent), `容器 ${parent} 不存在`).toBe(true)
      for (const k of kids) expect(nodeSet.has(k), `子节点 ${k} 不存在`).toBe(true)
    }
    for (const n of g.nodes) expect(g.nodeProps.has(n), `节点 ${n} 无属性`).toBe(true)
  })

  it('容器节点: 方向 + nodeLabels.placement + 默认尺寸', () => {
    const g = parse('examples/general/direction.elkt')
    const props = (id: string) => g.nodeProps.get(id)!
    expect(props('leftToRight').direction).toBe('RIGHT')
    expect(props('leftToRight')['nodeLabels.placement']).toBe('H_LEFT V_TOP OUTSIDE')
    expect(props('topToBottom').direction).toBe('DOWN')
    expect(props('bottomToTop').direction).toBe('UP')
    expect(props('leftToRight.n1').width).toBe(60)
    expect(props('leftToRight.n1').height).toBe(30)
  })

  it('容器标签简写 (label "text", id 可选)', () => {
    const g = parse('examples/general/direction.elkt')
    const labelTexts = (id: string) => (g.nodeProps.get(id)!.labels ?? []).map(l => l.text)
    expect(labelTexts('leftToRight')).toEqual(['leftToRight'])
    expect(labelTexts('topToBottom')).toEqual(['topToBottom'])
  })

  it('端口声明: 411a 的 N3 端口侧 (FIXED_SIDE)', () => {
    const g = parse('tickets/layered/411_north_south_port_anchor_a.elkt')
    const ports = g.nodeProps.get('N3')!.ports ?? []
    expect(ports.map(p => [p.id, p.side])).toEqual([
      ['P3_1', 'NORTH'],
      ['P3_2', 'NORTH'],
    ])
  })

  it('端口 index 语义: 显式 index 保留 (含负数)', () => {
    const g = parse('realworld/ptolemy/hierarchical/pn_blindcommunication_BlindCommunication.elkt')
    const ports = g.nodeProps.get('N1')!.ports ?? []
    const byId = (id: string) => ports.find(p => p.id === id)!
    expect(byId('P1').index).toBe(0)
    expect(byId('P1').side).toBe('EAST')
    expect(byId('P2').side).toBe('WEST')
    // elkt `index: -1` = ELK 显式未定义索引编码: PORT_INDEX 默认 null, 显式 -1 会参与排序
    // (elkg 里同样显式存 -1) → 解析器保留原始值, 不丢弃.
    expect(byId('P2').index).toBe(-1)
  })

  // ── 顶层算法属性 (graphProps) ──
  describe('顶层算法属性', () => {
    it('spacing/策略选项完整解析 (nodesEdges)', () => {
      const g = parse('examples/general/spacing/nodesEdges.elkt')
      const p = g.graphProps
      expect(p['algorithm']).toBe('layered')
      expect(p['nodePlacement.strategy']).toBe('NETWORK_SIMPLEX')
      expect(p['crossingMinimization.semiInteractive']).toBe('true')
      expect(p['spacing.nodeNode']).toBe('70')
      expect(p['spacing.nodeNodeBetweenLayers']).toBe('25')
      expect(p['spacing.edgeNode']).toBe('25')
      expect(p['spacing.edgeNodeBetweenLayers']).toBe('20')
      expect(p['spacing.edgeEdge']).toBe('20')
      expect(p['spacing.edgeEdgeBetweenLayers']).toBe('15')
    })

    it('方向与边标签选项解析 (082)', () => {
      const g = parse('tickets/layered/082_unfortunateEdgeLabelSideSelection.elkt')
      expect(g.graphProps['direction']).toBe('DOWN')
      expect(g.graphProps['edgeLabels.sideSelection']).toBe('SMART_DOWN')
    })

    it('层级处理选项解析 (628)', () => {
      const g = parse('tickets/layered/628_hierarchyAwareLayoutProcessor.elkt')
      expect(g.graphProps['hierarchyHandling']).toBe('INCLUDE_CHILDREN')
    })
  })

  // ── 节点属性 (node options) ──
  describe('节点属性', () => {
    it('portConstraints / nodeSize.constraints 解析 (insideSelfLoops)', () => {
      const g = parse('examples/edges/insideSelfLoops.elkt')
      expect(g.nodeProps.get('parent')!.portConstraints).toBe('FIXED_SIDE')
      const sized = g.nodeProps.get('parentWithSize')!
      expect(sized.width).toBe(200)
      expect(sized.height).toBe(100)
      expect(sized.portConstraints).toBe('FIXED_SIDE')
      expect(sized['nodeSize.constraints']).toBe('MINIMUM_SIZE')
    })
  })

  // ── 端口详细布局 (x/y/w/h/borderOffset) ──
  describe('端口详细布局', () => {
    it.each([
      { file: 'tickets/layered/905_beginLableBellowEdge.elkt', node: 'N1', port: 'P1', x: -22, y: 73, w: 30, h: 30, bo: -8 },
      { file: 'tickets/layered/273_insideSelfLoopsWithLabels.elkt', node: 'N1.N2', port: 'P2', side: 'WEST', x: 0, y: 55, w: 20, h: 16, bo: -20 },
      { file: 'tickets/layered/273_insideSelfLoopsWithLabels.elkt', node: 'N1.N2', port: 'P5', side: 'EAST', x: 0, y: 55, w: 20, h: 16, bo: -20 },
    ])('端口 $node / $port: position/size/borderOffset', ({ file, node, port, x, y, w, h, bo, side }) => {
      const g = parse(file)
      const p = g.nodeProps.get(node)!.ports!.find(q => q.id === port)!
      expect(p.x).toBe(x)
      expect(p.y).toBe(y)
      expect(p.w).toBe(w)
      expect(p.h).toBe(h)
      expect(p.borderOffset).toBe(bo)
      if (side !== undefined) expect(p.side).toBe(side)
    })
  })

  // ── 边端点解析 (节点/端口/自环/层级作用域) ──
  describe('边端点解析', () => {
    it('边连到具名端口 (599)', () => {
      const g = parse('tickets/layered/599_unimportantPortIndex.elkt')
      expect(g.edges).toHaveLength(1)
      const [s, sp, t, tp] = g.edges[0]!
      expect([s, sp, t, tp]).toEqual(['N1', 'P1', 'N2', 'P2_1'])
    })

    it('自环边保留端点端口 (insideSelfLoops)', () => {
      const g = parse('examples/edges/insideSelfLoops.elkt')
      const edges = g.edges.map(e => [e[0], e[1], e[2], e[3], e[4]])
      expect(edges).toEqual([
        ['parent', 'p1', 'parent', 'p2', false],
        ['parent', 'p1', 'parent', 'p2', true],
        ['parentWithSize', 'p1', 'parentWithSize', 'p2', false],
        ['parentWithSize', 'p1', 'parentWithSize', 'p2', true],
      ])
    })

    it('层级作用域: 子节点内的边引用容器端口 (148)', () => {
      const g = parse('tickets/layered/148_hierarchicalPortsPlacedOnTopOfEachOther.elkt')
      expect(g.edges).toHaveLength(1)
      const [s, sp, t, tp] = g.edges[0]!
      expect([s, sp, t, tp]).toEqual(['N1.N2', null, 'N1', 'P3'])
      // N1.P3 是容器 N1 的具名端口
      expect(g.nodeProps.get('N1')!.ports!.some(q => q.id === 'P3')).toBe(true)
    })
  })

  // ── 边标签与元数据 (text/width/height/placement/yo/thickness) ──
  describe('边标签与元数据', () => {
    it('905: 三个边标签 (CENTER/TAIL/HEAD) + thickness', () => {
      const g = parse('tickets/layered/905_beginLableBellowEdge.elkt')
      expect(g.edges).toHaveLength(1)
      const labels = g.edges[0]![5] as { text: string; width: number; height: number; placement?: string }[]
      expect(labels.map(l => [l.text, l.width, l.height, l.placement])).toEqual([
        ['center', 43, 21, 'CENTER'],
        ['begin', 39, 21, 'TAIL'],
        ['end', 26, 21, 'HEAD'],
      ])
      expect(g.edges[0]![6]).toBe(2) // edge.thickness
    })

    it('273: 自环边 insideSelfLoops.yo=true + 边标签', () => {
      const g = parse('tickets/layered/273_insideSelfLoopsWithLabels.elkt')
      expect(g.edges).toHaveLength(1)
      const [s, sp, t, tp, yo, labels] = g.edges[0]!
      expect([s, sp, t, tp, yo]).toEqual(['N1.N2', 'P2', 'N1.N2', 'P5', true])
      const ls = labels as { text: string; width: number; height: number; placement?: string }[]
      expect(ls.map(l => [l.text, l.width, l.height])).toEqual([['test_label', 47, 21]])
      // 无 edgeLabels.placement → 初始 null (解析器默认值).
      expect((ls[0] as { placement?: string | null }).placement).toBeNull()
    })
  })

  // ── 节点标签布局 (label id: "text" { layout [ size, position ] }) ──
  describe('节点标签布局', () => {
    it('905: 容器标签带 size/position/placement', () => {
      const g = parse('tickets/layered/905_beginLableBellowEdge.elkt')
      const labels = g.nodeProps.get('N1')!.labels ?? []
      expect(labels).toHaveLength(1)
      const l = labels[0]!
      expect(l.text).toBe(' ')
      expect(l.width).toBe(8)
      expect(l.height).toBe(21)
      expect(l.x).toBe(139)
      expect(l.y).toBe(5)
      expect(l.placement).toBe('[H_CENTER, V_TOP, INSIDE]')
    })
  })

  // ── 多层层级结构 (嵌套深度与尺寸) ──
  describe('多层层级结构', () => {
    it('628: 三层嵌套层级 + 尺寸', () => {
      const g = parse('tickets/layered/628_hierarchyAwareLayoutProcessor.elkt')
      expect([...g.hierarchy.entries()]).toEqual([
        ['l1', ['l1.l2_1', 'l1.l2_2']],
        ['l1.l2_1', ['l1.l2_1.l3']],
      ])
      expect(g.nodeProps.get('l1')!.width).toBe(60)
      expect(g.nodeProps.get('l1')!.height).toBe(30)
      expect(g.nodeProps.get('l1.l2_1')!.width).toBe(20)
      expect(g.nodeProps.get('l1.l2_1')!.height).toBe(100)
      expect(g.nodeProps.get('l1.l2_1.l3')!.width).toBe(20)
      expect(g.nodeProps.get('l1.l2_2')!.width).toBe(20)
      // 子节点 id 全限定 (父.名), 引用完整性已由结构场景覆盖.
    })
  })

  // ── portIds 集合 ──
  describe('portIds 集合', () => {
    it('411a: 仅登记具名端口', () => {
      const g = parse('tickets/layered/411_north_south_port_anchor_a.elkt')
      expect([...g.portIds].sort()).toEqual(['P3_1', 'P3_2'])
    })

    it('blindCommunication: 端口 id 数与端口总数一致', () => {
      const g = parse('realworld/ptolemy/hierarchical/pn_blindcommunication_BlindCommunication.elkt')
      const declared = [...g.nodeProps.values()].reduce((n, p) => n + (p.ports?.length ?? 0), 0)
      expect(g.portIds.size).toBe(declared)
      expect(g.portIds.size).toBe(119)
    })
  })

  // ── 作用域内未限定名解析 ──
  describe('作用域内未限定名解析', () => {
    it('direction: 容器内 `n1→n2` 解析为限定端点', () => {
      const g = parse('examples/general/direction.elkt')
      expect(g.edges.map(e => [e[0], e[2]])).toEqual([
        ['leftToRight.n1', 'leftToRight.n2'],
        ['topToBottom.n1', 'topToBottom.n2'],
        ['rightToLeft.n1', 'rightToLeft.n2'],
        ['bottomToTop.n1', 'bottomToTop.n2'],
      ])
    })
  })

  // ── 普通节点简写标签 ──
  describe('普通节点简写标签', () => {
    it('nodesEdges: 每个节点一个简写标签 (文本 = 节点名)', () => {
      const g = parse('examples/general/spacing/nodesEdges.elkt')
      for (const id of ['n1', 'n2', 'n3', 'n4', 'n5', 'n6']) {
        const labels = g.nodeProps.get(id)!.labels ?? []
        // 简写 `label \"1\"` → 文本是节点名去掉 n 前缀.
        expect(labels.map(l => l.text), `节点 ${id} 标签`).toEqual([id.slice(1)])
      }
    })
  })

  // ── 全量模型不变量扫描 (900 图) ──
  describe('全量模型不变量扫描', () => {
    it('全部 elkt: parse 不崩溃 + 结构不变量', () => {
      const files = globSync(join(MODEL_ROOT, '**/*.elkt')).sort()
      expect(files.length).toBeGreaterThan(800)
      const problems: string[] = []
      const add = (kind: string, msg: string) => {
        if (problems.length < 50) problems.push(`[${kind}] ${msg}`)
      }
      for (const f of files) {
        const rel = f.slice(MODEL_ROOT.length + 1)
        let g
        try {
          g = parse(f.replace(MODEL_ROOT + '/', ''))
        } catch (e) {
          add('parse-throw', `${rel}: ${String(e).slice(0, 120)}`)
          continue
        }
        const nodeSet = new Set(g.nodes)
        if (nodeSet.size !== g.nodes.length) add('dup-node', rel)

        // 边端点 (含端口引用) 全部可解析
        for (const [s, sp, t, tp] of g.edges) {
          if (!nodeSet.has(s as string)) add('edge-src', `${rel}: ${s}`)
          if (!nodeSet.has(t as string)) add('edge-tgt', `${rel}: ${t}`)
          if (sp !== null && !(g.nodeProps.get(s as string)?.ports ?? []).some(q => q.id === sp)) add('edge-src-port', `${rel}: ${s}.${sp}`)
          if (tp !== null && !(g.nodeProps.get(t as string)?.ports ?? []).some(q => q.id === tp)) add('edge-tgt-port', `${rel}: ${t}.${tp}`)
        }

        // 层级: 子节点存在 + 每子节点唯一父 + 无环
        const parentOf = new Map<string, string>()
        for (const [parent, kids] of g.hierarchy) {
          if (!nodeSet.has(parent)) { add('hier-parent', `${rel}: ${parent}`); continue }
          for (const k of kids) {
            if (!nodeSet.has(k)) { add('hier-child', `${rel}: ${k}`); continue }
            if (parentOf.has(k)) add('hier-multi-parent', `${rel}: ${k}`)
            parentOf.set(k, parent)
          }
        }
        for (const n of g.nodes) {
          let cur = n, depth = 0
          const seen = new Set<string>()
          while (parentOf.has(cur)) {
            if (seen.has(cur) || ++depth > g.nodes.length) { add('hier-cycle', `${rel}: ${n}`); break }
            seen.add(cur)
            cur = parentOf.get(cur)!
          }
        }

        // 节点内端口 id 唯一 + 数值有限
        for (const [id, p] of g.nodeProps) {
          const portIds = (p.ports ?? []).map(q => q.id)
          if (new Set(portIds).size !== portIds.length) add('port-dup', `${rel}: ${id}`)
          if (!Number.isFinite(p.width) || !Number.isFinite(p.height)) add('size-nan', `${rel}: ${id}`)
          for (const q of p.ports ?? []) {
            for (const k of ['x', 'y', 'w', 'h', 'index', 'borderOffset'] as const) {
              if (q[k] !== undefined && !Number.isFinite(q[k] as number)) add('port-num', `${rel}: ${id}.${q.id} ${k}`)
            }
          }
          for (const l of p.labels ?? []) {
            if (!Number.isFinite(l.width) || !Number.isFinite(l.height)) add('label-num', `${rel}: ${id}`)
          }
        }
      }
      expect(problems, problems.join('\n')).toEqual([])
    })
  })
})

describe('双路径同源 (elkt parse ↔ elkg JSON 往返 → LGraph)', () => {
  it('411a: parseElkt→build 与 elktToElkJson→elkJsonToParsed→build 结构等价', () => {
    const src = parse('tickets/layered/411_north_south_port_anchor_a.elkt')
    const p2 = elkJsonToParsed(elktToElkJson(src) as Parameters<typeof elkJsonToParsed>[0], { stripNPrefix: true })
    // 节点集 / 边端点 / 层级一致
    expect([...p2.nodes].sort()).toEqual([...src.nodes].sort())
    const ep = (e: unknown[]) => (e as unknown[]).slice(0, 4)
    expect([...p2.edges].map(ep).sort()).toEqual([...src.edges].map(ep).sort())
    expect(p2.hierarchy.size).toBe(src.hierarchy.size)
    // build 后按节点 id 归一化比对 (尺寸 / 端口侧 / 端口 index)
    const norm = (parsed: { nodes: string[] }, g: ReturnType<typeof buildLGraphFromParsed>) => {
      const byId = new Map<string, { size: { x: number; y: number }; sides: string[]; indexes: (number | null)[] }>()
      for (const [i, n] of g.nodeOf) {
        const id = parsed.nodes[i]!
        byId.set(id, {
          size: n.size,
          sides: n.getPorts().map((p: any) => p.getSide() ?? ''),
          indexes: n.getPorts().map((p: any) => p.getProperty(PORT_INDEX) ?? null),
        })
      }
      return byId
    }
    const a = norm(src, buildLGraphFromParsed(src))
    const b = norm(p2, buildLGraphFromParsed(p2))
    expect(a.size).toBe(b.size)
    for (const [id, na] of a) {
      expect(b.get(id), `节点 ${id} 双路径结构不等`).toEqual(na)
    }
  })
})
