/**
 * 高层 API 契约 BDD（P0 集成层）。
 *
 * 覆盖：layoutElkJson 接线后的行为契约——
 *   1. 合法输入正常布局（含全限定端口 id，对齐 carTracking 形态）；
 *   2. 非法输入抛结构化 LayoutError（code/path/retryable），不再静默丢弃；
 *   3. 校验/布局不修改调用方输入（纯函数，任意路径）；
 *   4. options 级未支持算法也走结构化错误；
 *   5. 错误可 JSON 序列化。
 */
import { describe, expect, it } from 'vitest'
import { layoutElkJson, validateLayoutInput, assertValidLayoutInput, LayoutError, LayoutErrorCode } from '../../src/api/index.js'
import type { ElkNode } from '../../src/api/index.js'

function minimalGraph(): ElkNode {
  return {
    id: 'root',
    layoutOptions: { 'org.eclipse.elk.direction': 'RIGHT' },
    children: [
      { id: 'A', width: 40, height: 20 },
      { id: 'B', width: 40, height: 20 },
    ],
    edges: [{ id: 'e0', sources: ['A'], targets: ['B'] }],
  }
}

describe('layoutElkJson 集成契约', () => {
  it('合法最小图：正常布局，输入不被修改', () => {
    const input = minimalGraph()
    const before = JSON.stringify(input)
    const out = layoutElkJson(input)
    expect(JSON.stringify(input)).toBe(before)
    expect(out.children![0]!.x).toBeGreaterThanOrEqual(0)
    expect(out.edges![0]!.sections![0]).toBeDefined()
  })

  it('全限定端口 id（carTracking 形态 NNx.Pyy）能通过校验并布局', () => {
    // 端口 id 自身即含节点前缀（ELK JSON 常见形态，如 carTracking.json）。
    const input: ElkNode = {
      id: 'root',
      children: [
        {
          id: 'NN1',
          width: 60, height: 30,
          ports: [{ id: 'NN1.P1', x: 0, y: 0, width: 4, height: 4 }, { id: 'NN1.P2', x: 56, y: 26, width: 4, height: 4 }],
        },
        { id: 'NN2', width: 60, height: 30, ports: [{ id: 'NN2.P3', x: 0, y: 0, width: 4, height: 4 }] },
      ],
      edges: [{ id: 'e0', sources: ['NN1.P2'], targets: ['NN2.P3'] }],
    }
    expect(() => layoutElkJson(input)).not.toThrow()
  })

  it('缺子节点 id → LayoutError MISSING_ID，path 指向 children 索引', () => {
    const input = { id: 'root', children: [{ width: 40, height: 20 }] } as unknown as ElkNode
    try {
      layoutElkJson(input)
      expect.unreachable('should throw')
    } catch (err) {
      expect(err).toBeInstanceOf(LayoutError)
      const e = err as LayoutError
      expect(e.code).toBe(LayoutErrorCode.MISSING_ID)
      expect(e.path).toContain('children[0]')
      expect(e.retryable).toBe(false)
    }
  })

  it('重复节点 id → DUPLICATE_ID', () => {
    const input = { id: 'root', children: [{ id: 'A' }, { id: 'A' }] } as unknown as ElkNode
    expect(() => layoutElkJson(input)).toThrowError(/DUPLICATE_ID/)
  })

  it('负尺寸 → NEGATIVE_SIZE', () => {
    const input = { id: 'root', children: [{ id: 'A', width: -5, height: 20 }] } as unknown as ElkNode
    expect(() => layoutElkJson(input)).toThrowError(/NEGATIVE_SIZE.*children\[0\]\.width/)
  })

  it('悬空边端点 → DANGLING_ENDPOINT（不再静默丢边）', () => {
    const input = { id: 'root', children: [{ id: 'A', width: 40, height: 20 }], edges: [{ sources: ['A'], targets: ['NO_SUCH'] }] } as unknown as ElkNode
    expect(() => layoutElkJson(input)).toThrowError(/DANGLING_ENDPOINT/)
  })

  it('hyperedge（多端点）→ MULTI_ENDPOINTS，显式拒绝而非静默截断', () => {
    const input = {
      id: 'root',
      children: [
        { id: 'A', width: 40, height: 20 },
        { id: 'B', width: 40, height: 20 },
        { id: 'C', width: 40, height: 20 },
      ],
      edges: [{ sources: ['A', 'B'], targets: ['C'] }],
    } as unknown as ElkNode
    expect(() => layoutElkJson(input)).toThrowError(/MULTI_ENDPOINTS/)
  })

  it('输入声明的未支持算法 → UNSUPPORTED_ALGORITHM，消息含节点 id（/ZZZ/ 兼容）', () => {
    const input = { id: 'root', children: [{ id: 'ZZZ', layoutOptions: { 'org.eclipse.elk.algorithm': 'org.eclipse.elk.unknownAlg' } }] } as unknown as ElkNode
    try {
      layoutElkJson(input)
      expect.unreachable('should throw')
    } catch (err) {
      const e = err as LayoutError
      expect(e.code).toBe(LayoutErrorCode.UNSUPPORTED_ALGORITHM)
      expect(e.phase).toBe('validate')
      expect(e.message).toContain('ZZZ')
    }
  })

  it('options 级未支持算法 → 统一 LayoutError（dispatch 路径）', () => {
    const input = { id: 'root', children: [{ id: 'A', width: 40, height: 20 }] } as unknown as ElkNode
    expect(() =>
      layoutElkJson(input, { layoutOptions: { 'org.eclipse.elk.algorithm': 'org.eclipse.elk.zzzAlg' } }),
    ).toThrowError(/UNSUPPORTED_ALGORITHM/)
  })

  it('black-box 路径（box 子树）输入不被修改', () => {
    const input: ElkNode = {
      id: 'root',
      children: [
        {
          id: 'box1',
          layoutOptions: { 'org.eclipse.elk.algorithm': 'box' },
          children: [
            { id: 'b1', width: 30, height: 20 },
            { id: 'b2', width: 30, height: 20 },
          ],
        },
        { id: 'N', width: 40, height: 20 },
      ],
      edges: [],
    }
    const before = JSON.stringify(input)
    layoutElkJson(input)
    expect(JSON.stringify(input)).toBe(before)
  })

  it('root 非 layered（fixed）路径输入不被修改，且返回全新对象', () => {
    const input: ElkNode = {
      id: 'root',
      layoutOptions: { 'org.eclipse.elk.algorithm': 'fixed', 'org.eclipse.elk.position': '[x=10,y=20]' },
      children: [{ id: 'A', width: 40, height: 20, layoutOptions: { 'org.eclipse.elk.position': '[x=5,y=5]' } }],
      edges: [],
    }
    const before = JSON.stringify(input)
    const out = layoutElkJson(input)
    expect(JSON.stringify(input)).toBe(before)
    expect(out).not.toBe(input)
  })
})

describe('validateLayoutInput / assertValidLayoutInput', () => {
  it('合法输入 → 零 issue；assertValid 不抛', () => {
    expect(validateLayoutInput(minimalGraph())).toEqual([])
    expect(() => assertValidLayoutInput(minimalGraph())).not.toThrow()
  })

  it('校验不修改输入', () => {
    const input = minimalGraph()
    const before = JSON.stringify(input)
    validateLayoutInput(input)
    expect(JSON.stringify(input)).toBe(before)
  })

  it('非法输入全部 issue 返回；assertValid 抛首个', () => {
    const input = {
      id: 'root',
      children: [{ id: 'A', width: -1 }, { width: 10 }],
      edges: [{ sources: ['A'], targets: ['MISSING'] }],
    } as unknown as ElkNode
    const issues = validateLayoutInput(input)
    const codes = issues.map((i) => i.code)
    expect(codes).toContain(LayoutErrorCode.NEGATIVE_SIZE)
    expect(codes).toContain(LayoutErrorCode.MISSING_ID)
    expect(codes).toContain(LayoutErrorCode.DANGLING_ENDPOINT)
    for (const issue of issues) expect(issue.retryable).toBe(false)
  })

  it('LayoutError.toJSON() 可序列化且字段稳定', () => {
    try {
      assertValidLayoutInput({ id: 'root', children: [{ id: 'A', width: -1 }] } as unknown as ElkNode)
      expect.unreachable('should throw')
    } catch (err) {
      const json = JSON.parse(JSON.stringify(err))
      expect(json.name).toBe('LayoutError')
      expect(json.code).toBe(LayoutErrorCode.NEGATIVE_SIZE)
      expect(json.retryable).toBe(false)
      expect(json.path).toContain('width')
    }
  })
})
