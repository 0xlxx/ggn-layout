/**
 * mutation 定向补测 — 精确值/分支覆盖 (第 2 轮幸存变异体).
 *
 * 策略: 对"元素越界撑大父盒"固定布局、固定 seed 的随机边投影/弯点、装箱换行、
 * 建图 skip 键/端口 0 值/方向默认侧/LCA 合并端口、公开 API 选项覆盖/黑盒嵌套合并
 * 等分支给精确断言, 使对应变异体行为改变即可被杀死.
 */
import { describe, it, expect } from 'vitest'
import { fixedLayout, boxLayout, randomLayout } from '../../src/api/core-providers.js'
import { buildLGraphFromParsed, elkJsonToParsed, shortOptKeys } from '../../shared/elkgraph-builder.js'
import { buildGraph, layoutElkJson, type ElkNode } from '../../src/api/index.js'
import { MERGE_EDGES, DIRECTION, EDGE_THICKNESS, PORT_INDEX } from '../../src/options/layered-options.js'

const node = (partial: Record<string, any> & { id: string }): ElkNode => {
  const { id, children, edges, layoutOptions, ...rest } = partial
  return { id, children: children ?? [], edges: edges ?? [], layoutOptions, ...rest }
}
const parsedOf = (o: Record<string, unknown>) => o as unknown as Parameters<typeof buildLGraphFromParsed>[0]

describe('fixedLayout 越界元素精确撑大 (maxx/maxy 由标签/端口/弯点决定)', () => {
  it('标签超出节点盒 → 父尺寸按标签边界', () => {
    const root = node({ id: 'r', children: [node({ id: 'a', width: 10, height: 10, layoutOptions: { 'org.eclipse.elk.position': '(0.0,0.0)' }, labels: [{ text: 'L', x: 100, y: 200, width: 10, height: 20 }] })] })
    fixedLayout(root)
    expect(root.width).toBe(140) // max(10, 0+100+10)=110 + 15*2
    expect(root.height).toBe(250) // max(10, 0+200+20)=220 + 15*2
  })

  it('端口超出节点盒 → 父尺寸按端口边界', () => {
    const root = node({ id: 'r', children: [node({ id: 'a', width: 10, height: 10, layoutOptions: { 'org.eclipse.elk.position': '(0.0,0.0)' }, ports: [{ id: 'p', x: 50, y: 60, width: 10, height: 20 }] })] })
    fixedLayout(root)
    expect(root.width).toBe(90) // 50+10=60 + 30
    expect(root.height).toBe(110) // 60+20=80 + 30
  })

  it('端口标签超出端口 → 计入 max', () => {
    const root = node({ id: 'r', children: [node({ id: 'a', width: 10, height: 10, layoutOptions: { 'org.eclipse.elk.position': '(0.0,0.0)' }, ports: [{ id: 'p', x: 5, y: 5, width: 5, height: 5, labels: [{ text: 'PL', x: 100, y: 100, width: 10, height: 10 }] }] })] })
    fixedLayout(root)
    // portx=5, porty=5; port label → 5+100+10=115 / 5+100+10=115
    expect(root.width).toBe(115 + 30)
    expect(root.height).toBe(115 + 30)
  })

  it('边弯点端点越界 → 计入 max (多弯点含中间点)', () => {
    const root = node({ id: 'r', children: [node({ id: 'a', width: 10, height: 10, edges: [{ sources: ['a'], targets: ['b'], layoutOptions: { 'org.eclipse.elk.bendPoints': [{ x: 5, y: 5 }, { x: 300, y: 200 }, { x: 400, y: 250 }] } }] })] })
    fixedLayout(root)
    expect(root.width).toBe(400 + 30)
    expect(root.height).toBe(250 + 30)
  })
})

describe('randomLayout 固定 seed 精确 section (投影分支 + 弯点序列)', () => {
  it('seed=1 a→b: startPoint/endPoint/bendPoints 精确', () => {
    const root = node({ id: 'r', layoutOptions: { 'org.eclipse.elk.randomSeed': '1' }, children: [node({ id: 'a', width: 50, height: 50 }), node({ id: 'b', width: 30, height: 20 })] })
    root.children![0]!.edges = [{ sources: ['a'], targets: ['b'] }]
    randomLayout(root)
    const sec = root.children![0]!.edges![0]!.sections![0]!
    expect(sec.startPoint.x).toBeCloseTo(58.626465351680395, 5)
    expect(sec.startPoint.y).toBeCloseTo(34.98151167878534, 5)
    expect(sec.endPoint.x).toBeCloseTo(61.55289407905305, 5)
    expect(sec.endPoint.y).toBeCloseTo(40, 5)
    expect(sec.bendPoints!.map(b => b.x)).toEqual([
      59.60292697120037, 59.68620034752737, 60.42575693415384,
    ])
    expect(sec.bendPoints!.map(b => b.y)).toEqual([
      35.66230047572887, 38.02952578422654, 39.25644929249914,
    ])
  })

  it('seed=3 b→a (target 右下): 投影到源右边界', () => {
    const root = node({ id: 'r', layoutOptions: { 'org.eclipse.elk.randomSeed': '3' }, children: [node({ id: 'a', width: 50, height: 50 }), node({ id: 'b', width: 30, height: 20 })] })
    root.children![1]!.edges = [{ sources: ['b'], targets: ['a'] }]
    randomLayout(root)
    const sec = root.children![1]!.edges![0]!.sections![0]!
    expect(sec.startPoint.x).toBeCloseTo(50.34882533679605, 5)
    expect(sec.startPoint.y).toBeCloseTo(40, 5)
    expect(sec.endPoint.x).toBeCloseTo(58.63716059795658, 5)
    expect(sec.endPoint.y).toBeCloseTo(48.04470952234237, 5)
    expect(sec.bendPoints).toHaveLength(4)
  })

  it('seed=5 a→a 自环: 源点在盒内 → 投影到右边界', () => {
    const root = node({ id: 'r', layoutOptions: { 'org.eclipse.elk.randomSeed': '5' }, children: [node({ id: 'a', width: 50, height: 50 }), node({ id: 'b', width: 30, height: 20 })] })
    root.children![0]!.edges = [{ sources: ['a'], targets: ['a'] }]
    randomLayout(root)
    const sec = root.children![0]!.edges![0]!.sections![0]!
    const ax = root.children![0]!.x!
    expect(sec.startPoint.x).toBeCloseTo(ax + 50, 5) // sourceX + sourceWidth
    expect(sec.startPoint.y).toBeCloseTo(40, 5)
    expect(sec.endPoint.y).toBeCloseTo(65, 5) // targetY + targetHeight (盒内)
    expect(sec.bendPoints).toHaveLength(2)
  })
})

describe('boxLayout 换行/最小高/标准差精确', () => {
  it('三盒两行 (面积升序 c,b,a): 精确位置与父尺寸', () => {
    const root = node({ id: 'r', children: [node({ id: 'a', width: 100, height: 50 }), node({ id: 'b', width: 60, height: 60 }), node({ id: 'c', width: 40, height: 40 })] })
    boxLayout(root)
    const m = Object.fromEntries(root.children!.map(c => [c.id!, c]))
    expect([m['c']!.x, m['c']!.y]).toEqual([15, 15])
    expect([m['b']!.x, m['b']!.y]).toEqual([70, 15])
    expect([m['a']!.x, m['a']!.y]).toEqual([15, 90]) // 换行到第 2 行
    expect([root.width, root.height]).toEqual([145, 155])
  })

  it('minTotalHeight 触发时 totalHeight 精确 = min', () => {
    const root = node({
      id: 'r',
      layoutOptions: { 'org.eclipse.elk.nodeSize.constraints': '[MINIMUM_SIZE]', 'org.eclipse.elk.nodeSize.minimum': '(60.0, 60.0)' },
      children: [node({ id: 'a', width: 10, height: 10 })],
    })
    boxLayout(root)
    expect(root.height).toBe(60)
  })
})

describe('elkgraph-builder 分支定向', () => {
  it('nodeProps skip 键不落属性; 合法选项落属性', () => {
    const parsed = parsedOf({
      nodes: ['n1'],
      edges: [],
      hierarchy: new Map(),
      graphProps: {},
      nodeProps: new Map([['n1', {
        _x: 1, ports: [{ id: 'p0', w: 8, h: 8 }], children: [], labels: [{ text: 'L', width: 5, height: 3 }],
        width: 9, height: 8, 'spacing.nodeNode': 30,
      }]]),
    })
    const g = buildLGraphFromParsed(parsed)
    const n = g.nodeOf.get(0)!
    expect(n.getProperty('org.eclipse.elk.spacing.nodeNode')).toBe(30)
    expect(n.getProperty('_x')).toBeUndefined()
    expect(n.getProperty('ports')).toBeUndefined()
    expect(n.getProperty('children')).toBeUndefined()
    expect(n.getProperty('labels')).toBeUndefined()
    expect(n.size).toEqual({ x: 9, y: 8 }) // width/height 消耗为尺寸
    expect(n.getPorts()).toHaveLength(1)
    expect(n.getLabels()).toHaveLength(1)
  })

  it('端口 index=0 / borderOffset=0 被保留 (非 null/undefined 即设置)', () => {
    const parsed = parsedOf({
      nodes: ['a', 'b'],
      edges: [['a', 'p0', 'b', null, false, [], null]],
      hierarchy: new Map(),
      graphProps: {},
      nodeProps: new Map([
        ['a', { ports: [{ id: 'p0', w: 8, h: 8, index: 0, borderOffset: 0 }] }],
        ['b', {}],
      ]),
    })
    const g = buildLGraphFromParsed(parsed)
    const p = g.nodeOf.get(0)!.getPorts()[0]!
    expect(p.getProperty(PORT_INDEX)).toBe(0)
    expect(p.getProperty('org.eclipse.elk.port.borderOffset')).toBe(0)
  })

  it('方向默认侧: LEFT→WEST / DOWN→SOUTH / UP→NORTH', () => {
    for (const [dir, outSide, inSide] of [['LEFT', 'WEST', 'EAST'], ['DOWN', 'SOUTH', 'NORTH'], ['UP', 'NORTH', 'SOUTH']] as const) {
      const parsed = parsedOf({
        nodes: ['a', 'b'],
        edges: [['a', null, 'b', null, false, [], null]],
        hierarchy: new Map(),
        graphProps: { direction: dir },
        nodeProps: new Map([['a', {}], ['b', {}]]),
      })
      const g = buildLGraphFromParsed(parsed)
      const a = g.nodeOf.get(0)!
      const b = g.nodeOf.get(1)!
      expect(a.getPorts()[0]!.getSide()).toBe(outSide)
      expect(b.getPorts()[0]!.getSide()).toBe(inSide)
    }
  })

  it('LCA 图 MERGE_EDGES → 容器内边创建合并端口 (非 root)', () => {
    const parsed = parsedOf({
      nodes: ['P', 'a', 'b'],
      edges: [['a', null, 'b', null, false, [], null]],
      hierarchy: new Map([['P', ['a', 'b']]]),
      graphProps: {},
      nodeProps: new Map([['P', { mergeEdges: 'true' }], ['a', {}], ['b', {}]]),
    })
    const g = buildLGraphFromParsed(parsed)
    const nested = g.nodeOf.get(0)!.getNestedGraph()!
    expect(nested.getProperty(MERGE_EDGES)).toBe(true)
    const a = g.nodeOf.get(1)!
    const b = g.nodeOf.get(2)!
    // 合并端口: 源/目标各 1 个 (每侧共享收集端口)
    expect(a.getPorts().length).toBe(1)
    expect(b.getPorts().length).toBe(1)
  })

  it('图级 MERGE_EDGES 布尔 true 生效; 显式端口存在时不合并', () => {
    const parsed = parsedOf({
      nodes: ['a', 'b'],
      edges: [['a', null, 'b', null, false, [], null]],
      hierarchy: new Map(),
      graphProps: { mergeEdges: 'true' },
      nodeProps: new Map([['a', {}], ['b', {}]]),
    })
    const g = buildLGraphFromParsed(parsed)
    expect(g.graph.getProperty(MERGE_EDGES)).toBe(true)
    expect(g.nodeOf.get(0)!.getPorts().length).toBe(1)
    // 显式端口: 复用 p0, 不额外创建
    const parsed2 = parsedOf({
      nodes: ['a', 'b'],
      edges: [['a', 'p0', 'b', null, false, [], null]],
      hierarchy: new Map(),
      graphProps: { mergeEdges: 'true' },
      nodeProps: new Map([['a', { ports: [{ id: 'p0', w: 8, h: 8 }] }], ['b', {}]]),
    })
    const g2 = buildLGraphFromParsed(parsed2)
    expect(g2.nodeOf.get(0)!.getPorts()).toHaveLength(1)
  })

  it('thickness=0 保留; labels=[] 不落标签', () => {
    const parsed = parsedOf({
      nodes: ['a', 'b'],
      edges: [['a', null, 'b', null, false, [], 0]],
      hierarchy: new Map(),
      graphProps: {},
      nodeProps: new Map([['a', {}], ['b', {}]]),
    })
    const g = buildLGraphFromParsed(parsed)
    const e = g.nodeOf.get(0)!.getPorts()[0]!.getOutgoingEdges()[0]!
    expect(e.getProperty(EDGE_THICKNESS)).toBe(0)
    expect(e.getLabels()).toHaveLength(0)
  })

  it('hasHierarchy 返回值: 有层级 true / 无层级 false', () => {
    const flat = buildLGraphFromParsed(parsedOf({ nodes: ['a'], edges: [], hierarchy: new Map(), graphProps: {}, nodeProps: new Map([['a', {}]]) }))
    expect(flat.hasHierarchy).toBe(false)
    const hier = buildLGraphFromParsed(parsedOf({ nodes: ['P', 'a'], edges: [], hierarchy: new Map([['P', ['a']]]), graphProps: {}, nodeProps: new Map([['P', {}], ['a', {}]]) }))
    expect(hier.hasHierarchy).toBe(true)
  })

  it('shortOptKeys: 长键/短前缀/未知键', () => {
    const k: Record<string, unknown> = shortOptKeys({ 'org.eclipse.elk.spacing.nodeNode': 10, 'layered.spacing.edgeNode': 5, foo: 1 })
    expect(k['spacing.nodeNode']).toBe(10)
    expect(k['spacing.edgeNode']).toBe(5)
    expect(k.foo).toBe(1)
  })

  it('elkJsonToParsed: 端口无 index/side/borderOffset 时缺省字段不设', () => {
    const parsed = elkJsonToParsed({ id: 'root', children: [{ id: 'N1', ports: [{ id: 'N1.p1' }] }] })
    const p = parsed.nodeProps.get('1')!.ports![0]!
    expect(p.side).toBeUndefined()
    expect(p.index).toBeUndefined()
    expect(p.borderOffset).toBeUndefined()
    expect(p.labels).toBeUndefined()
  })
})

describe('elk-json API 定向', () => {
  it('options.layoutOptions 覆盖 root.layoutOptions (Object.assign 顺序)', () => {
    const built = buildGraph(
      { id: 'root', layoutOptions: { 'org.eclipse.elk.direction': 'DOWN' }, children: [{ id: 'a' }] } as ElkNode,
      { layoutOptions: { 'org.eclipse.elk.direction': 'RIGHT' } },
    )
    expect(built.graph.getProperty(DIRECTION)).toBe('RIGHT')
  })

  it('options.layoutOptions 短键经 shortOptKeys 应用 (无 options.direction)', () => {
    const built = buildGraph(
      { id: 'root', children: [{ id: 'a' }] } as ElkNode,
      { layoutOptions: { 'org.eclipse.elk.direction': 'UP' } },
    )
    expect(built.graph.getProperty(DIRECTION)).toBe('UP')
  })

  it('graphToNodeId 含嵌套图映射', () => {
    const built = buildGraph({
      id: 'root',
      children: [{ id: 'P', children: [{ id: 'x' }] }],
    } as ElkNode)
    const rootGraph = built.graph
    const nested = [...rootGraph.getAllNodes()][0]!.getNestedGraph()!
    expect(built.graphToNodeId.get(rootGraph)).toBe('root')
    expect(built.graphToNodeId.get(nested)).toBe('P')
  })

  it('无弯点边 → sections[0] 无 bendPoints 键', () => {
    const out = layoutElkJson({
      id: 'root',
      layoutOptions: { 'org.eclipse.elk.direction': 'RIGHT' },
      children: [{ id: 'A', width: 40, height: 20 }, { id: 'B', width: 40, height: 20 }],
      edges: [{ sources: ['A'], targets: ['B'] }],
    } as ElkNode)
    const sec = out.edges![0]!.sections![0]!
    expect(sec.bendPoints).toBeUndefined()
    expect(sec.startPoint).toBeDefined()
    expect(sec.endPoint).toBeDefined()
  })

  it('算法分派: options 级 elk.algorithm 短键 / 嵌套黑盒合并 (box 含 fixed)', () => {
    const out = layoutElkJson(
      {
        id: 'root',
        children: [{
          id: 'N1',
          layoutOptions: { 'elk.algorithm': 'box' },
          children: [{
            id: 'N2',
            layoutOptions: { 'org.eclipse.elk.algorithm': 'org.eclipse.elk.fixed', 'org.eclipse.elk.position': '(1.0,2.0)' },
            children: [{ id: 'N3', width: 10, height: 10 }],
          }],
        }],
      } as ElkNode,
    )
    const n1 = out.children![0]!
    // N2 (fixed) 合并回 N1 输出, 且被 fixed 布局 (x=1,y=2 或由 box 重排)
    const n2 = n1.children!.find(c => c.id === 'N2')!
    expect(n2).toBeDefined()
    expect(n2.children!.find(c => c.id === 'N3')).toBeDefined()
  })

  it('算法为空字符串 → 不分派 (默认 layered, 不抛错)', () => {
    const out = layoutElkJson({
      id: 'root',
      children: [{ id: 'a', layoutOptions: { 'org.eclipse.elk.algorithm': '' } }],
    } as ElkNode)
    expect(out.children![0]!.x).toBe(12)
  })

  it('未移植算法报错信息含节点 id', () => {
    // 用真正未移植的算法 id (stress 已移植 R09; leaf 节点不触发 provider).
    const input = { id: 'root', children: [{ id: 'ZZZ', layoutOptions: { 'org.eclipse.elk.algorithm': 'org.eclipse.elk.unknownAlg' } }] }
    expect(() => layoutElkJson(input as ElkNode)).toThrow(/ZZZ/)
  })
})
