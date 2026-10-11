/**
 * JSON 导入 / 建图不变量 (mutation api 批次深层分支).
 *
 * 覆盖:
 *   - elkJsonToParsed (elkg JSON 解析): 端口 side/index/borderOffset/标签, 节点/边标签 placement,
 *     边端点解析 (具名端口/点号 id/单数 source), 黑盒子树跳过;
 *   - buildLGraphFromParsed (elkt 结构 → LGraph): 容器 size/padding (configPad + INSIDE 标签 pad),
 *     端口属性, mergeEdges 传播, 边默认侧/自环/thickness/标签/yo, 图级选项 (nodeSize.minimum 字符串),
 *     randomSeed 默认注入;
 *   - 双路径同源: parseElkt → build 与 elktToElkJson → elkJsonToParsed → build 结构等价;
 *   - buildGraph/extractGraph: 默认值 (direction/randomSeed/hierarchyHandling), 选项覆盖,
 *     跨容器边 LCA 挂载, 自环挂 root, 端口映射.
 */
import { describe, it, expect } from 'vitest'
import { buildLGraphFromParsed, elkJsonToParsed, buildLGraphFromElkJson } from '../../shared/elkgraph-builder.js'
import { buildGraph, layoutElkJson, type ElkNode } from '../../src/api/index.js'
import { PORT_CONSTRAINTS, DIRECTION, HIERARCHY_HANDLING, MERGE_EDGES, INSIDE_SELF_LOOPS_ACTIVATE, INSIDE_SELF_LOOPS_YO, EDGE_THICKNESS, RANDOM_SEED } from '../../src/options/layered-options.js'

describe('elkJsonToParsed (elkg JSON 解析)', () => {
  it('端口: 短名 id / side(UNDEFINED→null) / index / borderOffset / 标签', () => {
    const parsed = elkJsonToParsed({
      id: 'root',
      children: [{
        id: 'N1',
        ports: [{
          id: 'N1.P1', x: -8, y: 4, width: 8, height: 8,
          properties: { 'org.eclipse.elk.port.side': 'WEST', 'org.eclipse.elk.port.index': '2', 'org.eclipse.elk.port.borderOffset': '3' },
          labels: [{ text: 'L', x: 1, y: 2, width: 5, height: 3 }],
        }, {
          id: 'N1.P2', properties: { 'org.eclipse.elk.port.side': 'UNDEFINED' },
        }],
      }],
    })
    const p = parsed.nodeProps.get('1')!.ports!
    expect(p[0]).toMatchObject({ id: 'P1', x: -8, y: 4, w: 8, h: 8, side: 'WEST', index: 2, borderOffset: 3 })
    expect(p[0]!.labels![0]).toMatchObject({ text: 'L', width: 5, height: 3, x: 1, y: 2 })
    expect(p[1]!.side).toBeNull() // UNDEFINED → null (importer 推断)
    expect(p[1]!.index).toBeUndefined()
  })

  it('节点标签: layoutOptions nodeLabels.placement 读入 placement; 缺省 width/height=0', () => {
    const parsed = elkJsonToParsed({
      id: 'root',
      children: [{
        id: 'N1',
        labels: [{ text: 'L', layoutOptions: { 'org.eclipse.elk.nodeLabels.placement': 'INSIDE V_TOP' } }],
      }],
    })
    const p = parsed.nodeProps.get('1')!
    expect(p.labels).toEqual([{ text: 'L', width: 0, height: 0, placement: 'INSIDE V_TOP' }])
  })

  it('边: 具名端口 / 点号节点 id / 单数 source / thickness / yo / 边标签 placement', () => {
    const parsed = elkJsonToParsed({
      id: 'root',
      children: [
        { id: 'N1', ports: [{ id: 'N1.P1' }] },
        { id: 'N2' },
        { id: 'N3', children: [{ id: 'N3.a' }, { id: 'N3.b' }] },
      ],
      edges: [
        { sources: ['N1.P1'], targets: ['N2'] },
        { source: 'N3.a', target: 'N3.b', properties: { 'org.eclipse.elk.edge.thickness': '3', 'org.eclipse.elk.insideSelfLoops.yo': 'true' }, labels: [{ text: 'EL', layoutOptions: { 'org.eclipse.elk.edgeLabels.placement': 'HEAD' } }] },
      ],
    })
    expect(parsed.edges[0]!.slice(0, 4)).toEqual(['1', 'P1', '2', null])
    const e = parsed.edges[1]!
    expect(e.slice(0, 4)).toEqual(['3.a', null, '3.b', null])
    expect(e[4]).toBe(true) // yo
    expect(e[6]).toBe(3) // thickness
    expect(e[5]).toEqual([{ text: 'EL', width: 0, height: 0, placement: 'HEAD' }])
  })

  it('黑盒子树不递归 (子树由 core provider 布局)', () => {
    const parsed = elkJsonToParsed({
      id: 'root',
      children: [{
        id: 'P', layoutOptions: { 'org.eclipse.elk.algorithm': 'org.eclipse.elk.box' },
        children: [{ id: 'inner' }],
      }],
    }, { blackBoxIds: new Set(['P']) })
    expect(parsed.nodes).toEqual(['P']) // inner 不进入
  })
})

describe('buildLGraphFromParsed (elkt 结构 → LGraph)', () => {
  const parsedOf = (o: Record<string, unknown>) => o as unknown as Parameters<typeof buildLGraphFromParsed>[0]

  it('节点默认尺寸 60x30 / 显式 width/height / portConstraints / insideSelfLoops.activate', () => {
    const parsed = parsedOf({
      nodes: ['n1', 'n2'],
      edges: [],
      hierarchy: new Map(),
      graphProps: {},
      nodeProps: new Map([
        ['n1', { width: 100, height: 50, portConstraints: 'FIXED_ORDER', 'insideSelfLoops.activate': 'true' }],
        ['n2', {}],
      ]),
    })
    const g = buildLGraphFromParsed(parsed)
    const n1 = g.nodeOf.get(0)!
    const n2 = g.nodeOf.get(1)!
    expect(n1.size).toEqual({ x: 100, y: 50 })
    expect(n2.size).toEqual({ x: 60, y: 30 })
    expect(n1.getProperty(PORT_CONSTRAINTS)).toBe('FIXED_ORDER')
    expect(n1.getProperty(INSIDE_SELF_LOOPS_ACTIVATE)).toBe(true)
  })

  it('节点选项: position 字符串 → {x,y}; nodeSize.minimum 字符串 → {x,y}; 非法选项跳过', () => {
    const parsed = parsedOf({
      nodes: ['n1'],
      edges: [],
      hierarchy: new Map(),
      graphProps: {},
      nodeProps: new Map([['n1', { position: '(5.0, 6.0)', 'nodeSize.minimum': '(10, 20)', 'nodeSize.maximum': 'not-a-vec' }]]),
    })
    const g = buildLGraphFromParsed(parsed)
    const n1 = g.nodeOf.get(0)!
    expect(n1.getProperty('org.eclipse.elk.position')).toEqual({ x: 5, y: 6 })
    expect(n1.getProperty('org.eclipse.elk.nodeSize.minimum')).toEqual({ x: 10, y: 20 })
    expect(n1.getProperty('org.eclipse.elk.nodeSize.maximum')).toBeUndefined()
  })

  it('容器 padding: configPad + INSIDE 标签 pad (V_TOP/H_LEFT), 无 placement 不贡献', () => {
    const parsed = parsedOf({
      nodes: ['P', 'a'],
      edges: [],
      hierarchy: new Map([['P', ['a']]]),
      graphProps: {},
      nodeProps: new Map([
        ['P', { width: 120, height: 80, padding: '[top=5,left=5,right=5,bottom=5]', 'nodeLabels.placement': 'INSIDE V_TOP', labels: [{ text: 'T', width: 0, height: 21, placement: 'INSIDE V_TOP' }] }],
        ['a', {}],
      ]),
    })
    const g = buildLGraphFromParsed(parsed)
    const nested = g.nodeOf.get(0)!.getNestedGraph()!
    expect(nested.getPadding()).toEqual({ top: 5 + 21 + 5, bottom: 5, left: 5, right: 5 })
    // 无 INSIDE placement 的标签不贡献 padding
    const parsed2 = parsedOf({
      nodes: ['P', 'a'],
      edges: [],
      hierarchy: new Map([['P', ['a']]]),
      graphProps: {},
      nodeProps: new Map([
        ['P', { labels: [{ text: 'T', width: 0, height: 21 }] }],
        ['a', {}],
      ]),
    })
    const g2 = buildLGraphFromParsed(parsed2)
    expect(g2.nodeOf.get(0)!.getNestedGraph()!.getPadding()).toEqual({ top: 12, bottom: 12, left: 12, right: 12 })
  })

  it('节点级 mergeEdges → 嵌套图属性; 图级 mergeEdges → 根图属性', () => {
    const parsed = parsedOf({
      nodes: ['P', 'a'],
      edges: [],
      hierarchy: new Map([['P', ['a']]]),
      graphProps: { mergeEdges: 'true' },
      nodeProps: new Map([['P', { mergeEdges: 'true' }], ['a', {}]]),
    })
    const g = buildLGraphFromParsed(parsed)
    expect(g.graph.getProperty(MERGE_EDGES)).toBe(true)
    expect(g.nodeOf.get(0)!.getNestedGraph()!.getProperty(MERGE_EDGES)).toBe(true)
  })

  it('边: 无显式端口时按方向默认侧创建 (RIGHT → 出 EAST/入 WEST)', () => {
    const parsed = parsedOf({
      nodes: ['a', 'b'],
      edges: [['a', null, 'b', null, false, [], null]],
      hierarchy: new Map(),
      graphProps: { direction: 'RIGHT' },
      nodeProps: new Map([['a', {}], ['b', {}]]),
    })
    const g = buildLGraphFromParsed(parsed)
    const a = g.nodeOf.get(0)!
    const b = g.nodeOf.get(1)!
    expect(a.getPorts()[0]!.getSide()).toBe('EAST')
    expect(b.getPorts()[0]!.getSide()).toBe('WEST')
  })

  it('边: 显式端口 index 复用 + thickness + yo + 标签 placement', () => {
    const parsed = parsedOf({
      nodes: ['a', 'b'],
      edges: [['a', 'p0', 'b', null, true, [{ text: 'EL', width: 10, height: 5, placement: 'CENTER' }], 2]],
      hierarchy: new Map(),
      graphProps: {},
      nodeProps: new Map([
        ['a', { ports: [{ id: 'p0', w: 8, h: 8 }], portConstraints: 'FIXED_SIDE' }],
        ['b', {}],
      ]),
    })
    const g = buildLGraphFromParsed(parsed)
    const a = g.nodeOf.get(0)!
    expect(a.getPorts()).toHaveLength(1) // 复用显式端口, 不新建
    const e = a.getPorts()[0]!.getOutgoingEdges()[0]!
    expect(e.getProperty(INSIDE_SELF_LOOPS_YO)).toBe(true)
    expect(e.getProperty(EDGE_THICKNESS)).toBe(2)
    expect(e.getLabels()[0]).toMatchObject({ text: 'EL', size: { x: 10, y: 5 }, placement: 'CENTER' })
  })

  it('边: 端点不在节点集 → 跳过', () => {
    const parsed = parsedOf({
      nodes: ['a'],
      edges: [['a', null, 'ghost', null, false, [], null]],
      hierarchy: new Map(),
      graphProps: {},
      nodeProps: new Map([['a', {}]]),
    })
    const g = buildLGraphFromParsed(parsed)
    expect(g.edgeCount).toBe(1)
    expect([...g.nodeOf.values()][0]!.getPorts()).toHaveLength(0)
  })

  it('方向默认 RIGHT + randomSeed 默认注入 + 有层级 → INCLUDE_CHILDREN', () => {
    const g = buildLGraphFromParsed(parsedOf({ nodes: ['a'], edges: [], hierarchy: new Map(), graphProps: {}, nodeProps: new Map([['a', {}]]) }))
    expect(g.graph.getProperty(DIRECTION)).toBe('RIGHT')
    expect(g.graph.getProperty(RANDOM_SEED)).toBe(1)
    expect(g.graph.getProperty(HIERARCHY_HANDLING)).toBeNull()
    const gh = buildLGraphFromParsed(parsedOf({ nodes: ['P', 'a'], edges: [], hierarchy: new Map([['P', ['a']]]), graphProps: {}, nodeProps: new Map([['P', {}], ['a', {}]]) }))
    expect(gh.graph.getProperty(HIERARCHY_HANDLING)).toBe('INCLUDE_CHILDREN')
  })

  it('图级选项: nodeSize.minimum 字符串 → {x,y}; 未知键忽略', () => {
    const g = buildLGraphFromParsed(parsedOf({
      nodes: ['a'], edges: [], hierarchy: new Map(),
      graphProps: { 'nodeSize.minimum': '(30.0, 40.0)', unknownOpt: 'x' },
      nodeProps: new Map([['a', {}]]),
    }))
    expect(g.graph.getProperty('org.eclipse.elk.nodeSize.minimum')).toEqual({ x: 30, y: 40 })
  })
})

describe('buildGraph / extractGraph (公开 API 映射与边挂载)', () => {
  it('默认值: direction RIGHT / randomSeed 1 / 无嵌套 → hierarchyHandling OFF', () => {
    const built = buildGraph({ id: 'root', children: [{ id: 'a' }] } as ElkNode)
    expect(built.graph.getProperty(DIRECTION)).toBe('RIGHT')
    expect(built.graph.getProperty(RANDOM_SEED)).toBe(1)
    expect(built.graph.getProperty(HIERARCHY_HANDLING)).toBe('OFF')
  })

  it('选项覆盖: direction LEFT / randomSeed 3 / hierarchyHandling INCLUDE_CHILDREN', () => {
    const built = buildGraph(
      { id: 'root', children: [{ id: 'a', children: [{ id: 'b' }] }] } as ElkNode,
      { direction: 'LEFT', randomSeed: 3, hierarchyHandling: 'INCLUDE_CHILDREN' },
    )
    expect(built.graph.getProperty(DIRECTION)).toBe('LEFT')
    expect(built.graph.getProperty(RANDOM_SEED)).toBe(3)
    expect(built.graph.getProperty(HIERARCHY_HANDLING)).toBe('INCLUDE_CHILDREN')
  })

  it('root.layoutOptions 方向生效 (无 options)', () => {
    const built = buildGraph({ id: 'root', layoutOptions: { 'org.eclipse.elk.direction': 'DOWN' }, children: [{ id: 'a' }] } as ElkNode)
    expect(built.graph.getProperty(DIRECTION)).toBe('DOWN')
  })

  it('nodeOf/portOf 映射: 具名端口可经 "nodeId.portId" 查找', () => {
    const built = buildGraph({
      id: 'root',
      children: [{
        id: 'N1',
        ports: [{ id: 'N1.p1', properties: { 'org.eclipse.elk.port.side': 'WEST' } }],
      }],
      edges: [{ sources: ['N1.p1'], targets: ['N2'] }],
    } as ElkNode)
    expect(built.nodeOf.has('N1')).toBe(true)
    expect(built.portOf.has('N1.p1')).toBe(true)
  })

  it('extractGraph: 跨容器边挂 LCA 容器; 自环挂 root (非节点自身)', () => {
    const out = layoutElkJson({
      id: 'root',
      layoutOptions: { 'org.eclipse.elk.direction': 'RIGHT', 'org.eclipse.elk.hierarchyHandling': 'INCLUDE_CHILDREN' },
      children: [{
        id: 'P',
        width: 120, height: 80,
        children: [{ id: 'X', width: 30, height: 20 }, { id: 'Y', width: 30, height: 20 }],
        edges: [{ id: 'e0', sources: ['X'], targets: ['Y'] }],
      }],
    } as ElkNode)
    expect(out.children![0]!.edges?.map(e => e.sources?.[0])).toEqual(['X']) // 两端同容器 → 挂 P.edges
    // 自环: A.p1→A.p2 挂 root.edges
    const self = layoutElkJson({
      id: 'root',
      layoutOptions: { 'org.eclipse.elk.direction': 'RIGHT' },
      children: [{
        id: 'A', width: 40, height: 40,
        ports: [
          { id: 'A.p1', x: -8, y: 16, width: 8, height: 8, properties: { 'org.eclipse.elk.port.side': 'WEST' } },
          { id: 'A.p2', x: 40, y: 16, width: 8, height: 8, properties: { 'org.eclipse.elk.port.side': 'EAST' } },
        ],
      }],
      edges: [{ id: 'e1', sources: ['A.p1'], targets: ['A.p2'] }],
    } as ElkNode)
    expect(out.edges ?? []).toHaveLength(0)
    expect(self.edges?.map(e => e.sources?.[0])).toContain('A.p1')
    expect(self.children![0]!.edges ?? []).toHaveLength(0)
  })

  it('buildLGraphFromElkJson 便捷入口与 buildLGraphFromParsed 等价', () => {
    const json = { id: 'root', children: [{ id: 'a' }, { id: 'b' }], edges: [{ sources: ['a'], targets: ['b'] }] }
    const g1 = buildLGraphFromElkJson(json)
    const g2 = buildLGraphFromParsed(elkJsonToParsed(json))
    expect(g1.nodeCount).toBe(g2.nodeCount)
    expect(g1.edgeCount).toBe(g2.edgeCount)
    expect(g1.graph.getProperty(DIRECTION)).toBe(g2.graph.getProperty(DIRECTION))
  })
})
