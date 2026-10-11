/**
 * 自环管线调试块 (GGN_SL_DBG / GGN_SL_DBG2 / GGN_DSL_DBG / GGN_SLR_DBG) 覆盖测试.
 *
 * 目的: 变异测试中 src/intermediate/loops 大量 Survived 变异体位于 env 门控调试块
 * (条件翻转 true/false、字符串置空、块删除). 本文件:
 *  - env 置位: 断言 console.error 精确/子串输出 (杀死 →false / 字符串置空 / 块删除 变异体)
 *  - env 清空: 断言无调试输出 (杀死 →true 变异体)
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NodeType } from '../../src/index.js'
import { PortRestorer } from '../../src/intermediate/loops/ordering/port-restorer.js'
import { processSelfLoopRouter } from '../../src/intermediate/self-loop-router.js'
import { processDummySelfLoops } from '../../src/intermediate/dummy-self-loop-processor.js'
import { SelfLoopPortRestorer } from '../../src/intermediate/self-loop-port-restorer.js'
import {
  makeGraph, makeLayer, makeNode, makePorts, makeEdge, installHolder, hideSelfLoopPorts,
} from './helpers/SelfLoopGraphBuilder.js'

declare const process: { env: Record<string, string | undefined> }
const DBG_ENVS = ['GGN_SL_DBG', 'GGN_SL_DBG2', 'GGN_DSL_DBG', 'GGN_SLR_DBG'] as const

afterEach(() => {
  vi.restoreAllMocks()
  for (const k of DBG_ENVS) delete process.env[k]
})

function captureError(): { calls: string[] } {
  const calls: string[] = []
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    calls.push(args.map(String).join(' '))
  })
  return { calls }
}

function oneSideHolder(ordering: string | undefined = undefined): ReturnType<typeof installHolder> {
  const graph = makeGraph(ordering === undefined ? {} : { ordering })
  const node = makeNode(graph)
  const [p0, p1] = makePorts(node, 2, 0, 0, 0)
  makeEdge(p0, p1)
  const holder = installHolder(node)
  for (const loop of holder.getSLHyperLoops()) loop.computePortsPerSide()
  return holder
}

function routedGraph(): void {
  const graph = makeGraph()
  const layer = makeLayer(graph)
  const node = makeNode(graph, layer, { x: 50, y: 50 })
  const [p0, p1] = makePorts(node, 2, 0, 0, 0)
  makeEdge(p0, p1)
  const holder = installHolder(node)
  for (const loop of holder.getSLHyperLoops()) loop.computePortsPerSide()
  processSelfLoopRouter(graph)
  void holder
}

describe('自环调试块: env 置位输出精确串', () => {
  it('PortRestorer GGN_SL_DBG: targetAreas / before / after 三段', () => {
    const holder = oneSideHolder()
    hideSelfLoopPorts(holder, [...holder.getSLPortMap().values()].map(sl => sl.getLPort()))
    process.env.GGN_SL_DBG = '1'
    const { calls } = captureError()
    new PortRestorer().restorePorts(holder)
    const joined = calls.join('\n')
    expect(joined).toContain('GGN PR targetAreas=[NORTH-1:')
    expect(joined).toContain('GGN PR before restore ports=')
    expect(joined).toContain('GGN PR after restore ports=')
    expect(calls.length).toBe(3)
  })

  it('RoutingDirector GGN_SL_DBG: loop type 与端口序列', () => {
    process.env.GGN_SL_DBG = '1'
    const { calls } = captureError()
    routedGraph()
    expect(calls.length).toBeGreaterThanOrEqual(1)
    expect(calls.join('\n')).toContain('GGN SL loop type=ONE_SIDE ports=')
  })

  it('OrthogonalSelfLoopRouter GGN_SL_DBG + GGN_SL_DBG2: dir/left/right/bps 与 margin', () => {
    process.env.GGN_SL_DBG = '1'
    process.env.GGN_SL_DBG2 = '1'
    const { calls } = captureError()
    routedGraph()
    const joined = calls.join('\n')
    expect(joined).toContain('GGN SLR dir=0 left=')
    expect(joined).toContain('GGN SLR2 after update margin=')
  })

  it('DummySelfLoopProcessor GGN_DSL_DBG: [DSL] 与 [DSL-END] 端口快照', () => {
    const graph = makeGraph()
    const layer = makeLayer(graph)
    const node = makeNode(graph, layer)
    const [n1, n2, e1, e2, w1, w2] = makePorts(node, 2, 2, 0, 2)
    makeEdge(n1, w1)
    makeEdge(e1, w1)
    makeEdge(e2, w2)
    process.env.GGN_DSL_DBG = '1'
    const { calls } = captureError()
    processDummySelfLoops(graph)
    const joined = calls.join('\n')
    expect(joined).toContain('[DSL] ')
    expect(joined).toContain('ports=')
    expect(joined).toContain('[DSL-END] ')
  })

  it('SelfLoopPortRestorer GGN_SLR_DBG: node/hidden/ports', () => {
    const graph = makeGraph()
    const layer = makeLayer(graph)
    const node = makeNode(graph, layer)
    const [p0, p1] = makePorts(node, 2, 0, 0, 0)
    makeEdge(p0, p1)
    const holder = installHolder(node)
    for (const loop of holder.getSLHyperLoops()) loop.computePortsPerSide()
    process.env.GGN_SLR_DBG = '1'
    const { calls } = captureError()
    new SelfLoopPortRestorer().process(graph)
    expect(calls.join('\n')).toMatch(/\[SLR\] node=\d+ hidden=false ports=/)
  })
})

describe('自环调试块: env 清空无输出', () => {
  it('GGN_SL_DBG 未置位: PortRestorer/RoutingDirector/Orthogonal 均无调试输出', () => {
    const { calls } = captureError()
    const holder = oneSideHolder()
    hideSelfLoopPorts(holder, [...holder.getSLPortMap().values()].map(sl => sl.getLPort()))
    new PortRestorer().restorePorts(holder)
    routedGraph()
    expect(calls).toHaveLength(0)
  })

  it('GGN_DSL_DBG 未置位: 无调试输出', () => {
    const graph = makeGraph()
    const layer = makeLayer(graph)
    const node = makeNode(graph, layer)
    const [e1, e2, w1, w2] = makePorts(node, 0, 2, 0, 2)
    makeEdge(e1, w1)
    makeEdge(w2, e2)
    const { calls } = captureError()
    processDummySelfLoops(graph)
    expect(calls).toHaveLength(0)
  })

  it('GGN_SLR_DBG 未置位: 无调试输出', () => {
    const graph = makeGraph()
    const layer = makeLayer(graph)
    const node = makeNode(graph, layer)
    const [p0, p1] = makePorts(node, 2, 0, 0, 0)
    makeEdge(p0, p1)
    installHolder(node)
    const { calls } = captureError()
    new SelfLoopPortRestorer().process(graph)
    expect(calls).toHaveLength(0)
  })
})

describe('自环调试块: 非 NORMAL 节点 / 无 holder 节点被跳过', () => {
  it('非 NORMAL 节点 (dummy) 无自环处理, 不输出', () => {
    const graph = makeGraph()
    const layer = makeLayer(graph)
    const dummy = makeNode(graph, layer)
    dummy.setType(NodeType.LONG_EDGE)
    const [p0, p1] = makePorts(dummy, 2, 0, 0, 0)
    makeEdge(p0, p1)
    process.env.GGN_SL_DBG = '1'
    process.env.GGN_SLR_DBG = '1'
    const { calls } = captureError()
    processSelfLoopRouter(graph)
    new SelfLoopPortRestorer().process(graph)
    // dummy 节点不是 NORMAL → 无 holder → 不进入自环管线
    expect(calls.join('\n')).not.toContain('GGN SL loop type=')
    expect(calls.join('\n')).not.toContain('[SLR] node=')
  })
})
