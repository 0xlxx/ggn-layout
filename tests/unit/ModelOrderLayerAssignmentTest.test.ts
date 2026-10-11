/**
 * 移植自 ELK Java: p2layers/ModelOrderLayerAssignmentTest.java
 * LONGEST_PATH 分层 + MODEL_ORDER 节点提升 (左/右) 的精确坐标验证.
 */
import { describe, expect, it } from 'vitest'
import { LGraph, LNode, LPort, LEdge, Direction } from '../../src/index.js'
import {
  CONSIDER_MODEL_ORDER_STRATEGY, LAYERING_STRATEGY, LAYERING_NODE_PROMOTION_STRATEGY,
  DIRECTION, SPACING_NODE_NODE, SPACING_NODE_NODE_BETWEEN_LAYERS, OrderingStrategy,
} from '../../src/options/layered-options.js'
import { MODEL_ORDER } from '../../src/options/internal-properties.js'
import { LayeredLayoutProvider, NullProgressMonitor } from '../../src/layered-layout-provider.js'

type Case = {
  layering: string
  promotion: string
  edges: [string, string][]
  expect: Record<string, { x?: number, y?: number }>
}

const CASES: Case[] = [
  {
    layering: 'LONGEST_PATH_SOURCE', promotion: 'MODEL_ORDER_LEFT_TO_RIGHT',
    edges: [['n1','n2'],['n1','n4'],['n1','n4'],['n2','n3'],['n3','n5'],['n4','n5']],
    expect: { n1:{x:0,y:7.5}, n2:{x:60,y:0}, n3:{x:110,y:0}, n4:{x:110,y:40}, n5:{x:160,y:5} },
  },
  {
    layering: 'LONGEST_PATH', promotion: 'MODEL_ORDER_RIGHT_TO_LEFT',
    edges: [['n1','n2'],['n1','n3'],['n2','n5'],['n2','n5'],['n3','n4'],['n4','n5']],
    expect: { n1:{x:0,y:5}, n2:{x:50,y:0}, n3:{x:50,y:40}, n4:{x:100,y:40}, n5:{x:150,y:6} },
  },
  {
    layering: 'LONGEST_PATH_SOURCE', promotion: 'MODEL_ORDER_LEFT_TO_RIGHT',
    edges: [['n1','n2'],['n1','n4'],['n1','n4'],['n1','n5'],['n2','n3'],['n3','n6'],['n4','n6'],['n5','n6']],
    expect: { n1:{x:0,y:9}, n2:{x:70,y:0}, n3:{x:120,y:0}, n4:{x:120,y:40}, n5:{x:120,y:80}, n6:{x:170,y:40} },
  },
  {
    layering: 'LONGEST_PATH', promotion: 'MODEL_ORDER_RIGHT_TO_LEFT',
    edges: [['n1','n2'],['n1','n3'],['n1','n4'],['n2','n6'],['n2','n6'],['n3','n6'],['n4','n5'],['n5','n6']],
    expect: { n1:{x:0,y:7.5}, n2:{x:60,y:0}, n3:{x:60,y:40}, n4:{x:60,y:80}, n5:{x:110,y:80}, n6:{x:170,y:9} },
  },
  {
    layering: 'LONGEST_PATH_SOURCE', promotion: 'MODEL_ORDER_LEFT_TO_RIGHT',
    edges: [['n1','n2'],['n1','n4'],['n1','n4'],['n2','n3']],
    expect: { n1:{x:0,y:7.5}, n2:{x:60,y:0}, n3:{x:110,y:0}, n4:{x:110,y:40} },
  },
  {
    layering: 'LONGEST_PATH', promotion: 'MODEL_ORDER_RIGHT_TO_LEFT',
    edges: [['n1','n4'],['n1','n4'],['n2','n3'],['n3','n4']],
    expect: { n1:{x:0,y:0}, n2:{x:0,y:40}, n3:{x:50,y:40}, n4:{x:100,y:6} },
  },
  {
    layering: 'LONGEST_PATH', promotion: 'MODEL_ORDER_RIGHT_TO_LEFT',
    edges: [['n1','n2'],['n1','n3'],['n3','n4']],
    expect: { n1:{x:0,y:5}, n2:{x:50,y:0}, n3:{x:50,y:40}, n4:{x:100,y:40} },
  },
]

function runCase(c: Case): Record<string, { x: number, y: number }> {
  let mo = 0
  const g = new LGraph()
  g.setProperty(DIRECTION, Direction.RIGHT)
  g.setProperty(CONSIDER_MODEL_ORDER_STRATEGY, OrderingStrategy.PREFER_EDGES)
  g.setProperty(LAYERING_STRATEGY, c.layering)
  g.setProperty(LAYERING_NODE_PROMOTION_STRATEGY, c.promotion)
  g.setPadding({ left: 0, top: 0, right: 0, bottom: 0 })
  g.setProperty(SPACING_NODE_NODE, 10)
  g.setProperty(SPACING_NODE_NODE_BETWEEN_LAYERS, 20)

  const nodeOf = new Map<string, LNode>()
  // 按 n1..n6 声明顺序建节点 (ELK 测试创建顺序 = MODEL_ORDER).
  const names = new Set<string>()
  for (const [s, t] of c.edges) { names.add(s); names.add(t) }
  const orderedNames = [...names].sort((a, b) => {
    const na = Number(a.slice(1)), nb = Number(b.slice(1))
    return na - nb
  })
  for (const name of orderedNames) {
    const n = new LNode(g)
    n.size = { x: 30, y: 30 }
    n.setProperty(MODEL_ORDER, mo++)
    nodeOf.set(name, n)
  }
  for (const [s, t] of c.edges) {
    const fp = new LPort(); fp.setNode(nodeOf.get(s)!)
    const tp = new LPort(); tp.setNode(nodeOf.get(t)!)
    const e = new LEdge(); e.setSource(fp); e.setTarget(tp)
    void e
  }
  new LayeredLayoutProvider().layout(g, new NullProgressMonitor())
  const result: Record<string, { x: number, y: number }> = {}
  for (const [name, n] of nodeOf) {
    result[name] = { x: n.getPosition().x, y: n.getPosition().y }
  }
  return result
}

describe('ModelOrderLayerAssignmentTest (ELK Java 移植)', () => {
  it.each(CASES)('%s + %s', (c) => {
    const result = runCase(c)
    for (const [nodeName, expected] of Object.entries(c.expect)) {
      if (expected.x !== undefined) expect(result[nodeName]!.x, `${nodeName} x`).toBeCloseTo(expected.x, 1)
      if (expected.y !== undefined) expect(result[nodeName]!.y, `${nodeName} y`).toBeCloseTo(expected.y, 1)
    }
  })
})
