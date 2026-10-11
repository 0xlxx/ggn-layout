import { describe, expect, it } from 'vitest'
import { layoutElkJson, type ElkLayoutOptions, type ElkNode } from '../../src/api/elk-json.js'
import '../../src/api/register-all.js' // 非 layered provider 注册 (测试需全部算法)

const deepCopy = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T

function layeredGraph(): ElkNode {
  return {
    id: 'root',
    layoutOptions: { 'org.eclipse.elk.direction': 'RIGHT' },
    children: [
      { id: 'A', width: 40, height: 20 },
      { id: 'B', width: 40, height: 20 },
    ],
    edges: [{ id: 'layered-edge', sources: ['A'], targets: ['B'] }],
  }
}

function blackBoxGraph(): ElkNode {
  return {
    id: 'root',
    layoutOptions: { 'org.eclipse.elk.direction': 'RIGHT' },
    children: [
      {
        id: 'box',
        layoutOptions: { 'org.eclipse.elk.algorithm': 'box' },
        children: [
          { id: 'box.a', width: 30, height: 30 },
          { id: 'box.b', width: 30, height: 30 },
        ],
      },
      { id: 'outside', width: 30, height: 30 },
    ],
    edges: [{ id: 'box-edge', sources: ['box.a'], targets: ['box.b'] }],
  }
}

function rootFixedGraph(): ElkNode {
  return {
    id: 'root',
    layoutOptions: {
      'org.eclipse.elk.algorithm': 'fixed',
      'org.eclipse.elk.nodeSize.fixedGraphSize': 'true',
    },
    children: [
      {
        id: 'fixed-a',
        width: 20,
        height: 20,
        layoutOptions: { 'org.eclipse.elk.position': '(10.0, 20.0)' },
      },
      {
        id: 'fixed-b',
        width: 20,
        height: 20,
        layoutOptions: { 'org.eclipse.elk.position': '(60.0, 20.0)' },
      },
    ],
  }
}

function metadataGraph(): ElkNode {
  return {
    id: 'root',
    layoutOptions: { 'org.eclipse.elk.direction': 'RIGHT' },
    children: [
      {
        id: 'source',
        width: 40,
        height: 20,
        ports: [{
          id: 'source.out',
          width: 8,
          height: 8,
          properties: { 'org.eclipse.elk.port.side': 'EAST' },
        }],
        labels: [{ text: 'Source', width: 24, height: 10 }],
        properties: { domain: 'input' },
        layoutOptions: { 'org.eclipse.elk.portConstraints': 'FIXED_SIDE' },
        customNodeField: { kind: 'source' },
      },
      {
        id: 'target',
        width: 40,
        height: 20,
        ports: [{
          id: 'target.in',
          width: 8,
          height: 8,
          properties: { 'org.eclipse.elk.port.side': 'WEST' },
        }],
        labels: [{ text: 'Target', width: 24, height: 10 }],
        properties: { domain: 'output' },
        layoutOptions: { 'org.eclipse.elk.portConstraints': 'FIXED_SIDE' },
        customNodeField: { kind: 'target' },
      },
    ],
    edges: [
      {
        id: 'edge-first',
        sources: ['source.out'],
        targets: ['target.in'],
        layoutOptions: { 'org.eclipse.elk.edgeRouting': 'ORTHOGONAL' },
        properties: { channel: 'control' },
        customEdgeField: { order: 1 },
      },
      {
        id: 'edge-second',
        sources: ['source.out'],
        targets: ['target.in'],
        layoutOptions: { 'org.eclipse.elk.edgeRouting': 'POLYLINE' },
        properties: { channel: 'data' },
        customEdgeField: { order: 2 },
      },
    ],
  }
}

type PurityScenario = {
  name: string
  makeInput: () => ElkNode
  options?: ElkLayoutOptions
}

const purityScenarios: PurityScenario[] = [
  { name: 'layered 路径', makeInput: layeredGraph },
  { name: 'black-box 子树 box 路径', makeInput: blackBoxGraph },
  { name: 'root=fixed 非 layered 路径', makeInput: rootFixedGraph },
]

describe('layoutElkJson 纯度与输出保真', () => {
  it.each(purityScenarios)(' 不修改输入且返回新对象', ({ makeInput, options }) => {
    const input = makeInput()
    const before = deepCopy(input)

    const output = layoutElkJson(input, options)

    expect(input).toEqual(before)
    expect(output).not.toBe(input)
  })

  it('同一输入与 options 连续调用结果确定且输入保持不变', () => {
    const input = layeredGraph()
    const options: ElkLayoutOptions = { randomSeed: 7, direction: 'RIGHT' }
    const before = deepCopy(input)

    const first = layoutElkJson(input, options)
    const second = layoutElkJson(input, options)

    expect(second).toEqual(first)
    expect(input).toEqual(before)
  })

  it('保留节点与边元数据，并按声明顺序匹配平行边', () => {
    const input = metadataGraph()
    const before = deepCopy(input)
    const output = layoutElkJson(input)
    const source = output.children?.find((node) => node.id === 'source')
    const target = output.children?.find((node) => node.id === 'target')

    expect(output.layoutOptions).toEqual(input.layoutOptions)
    expect(source).toMatchObject({
      ports: input.children?.[0]?.ports,
      labels: input.children?.[0]?.labels,
      properties: input.children?.[0]?.properties,
      layoutOptions: input.children?.[0]?.layoutOptions,
      customNodeField: input.children?.[0]?.customNodeField,
    })
    expect(target).toMatchObject({
      ports: input.children?.[1]?.ports,
      labels: input.children?.[1]?.labels,
      properties: input.children?.[1]?.properties,
      layoutOptions: input.children?.[1]?.layoutOptions,
      customNodeField: input.children?.[1]?.customNodeField,
    })

    expect(output.edges?.map((edge) => edge.id)).toEqual(['edge-first', 'edge-second'])
    expect(output.edges?.map((edge) => edge.layoutOptions)).toEqual([
      input.edges?.[0]?.layoutOptions,
      input.edges?.[1]?.layoutOptions,
    ])
    expect(output.edges?.map((edge) => edge.properties)).toEqual([
      input.edges?.[0]?.properties,
      input.edges?.[1]?.properties,
    ])
    expect(output.edges?.map((edge) => edge.customEdgeField)).toEqual([
      input.edges?.[0]?.customEdgeField,
      input.edges?.[1]?.customEdgeField,
    ])
    expect(input).toEqual(before)
  })

  it('小图坐标保持既有 RIGHT 语义', () => {
    const output = layoutElkJson(layeredGraph())
    const nodes = output.children!

    expect(nodes[0]).toMatchObject({ id: 'A', x: 12, y: 12, width: 40, height: 20 })
    expect(nodes[1]).toMatchObject({ id: 'B', x: 72, y: 12, width: 40, height: 20 })
    expect(output.edges?.[0]?.sections?.[0]).toMatchObject({
      startPoint: { x: 52, y: 22 },
      endPoint: { x: 72, y: 22 },
    })
  })
})
