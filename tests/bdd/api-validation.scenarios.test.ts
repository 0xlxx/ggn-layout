import { describe, expect, it } from 'vitest'
import {
  LayoutError,
  LayoutErrorCode,
  assertValidLayoutInput,
  validateLayoutInput,
} from '../../src/api/index.js'

const issueFor = (input: unknown, code: LayoutErrorCode) => {
  const issue = validateLayoutInput(input).find((candidate) => candidate.code === code)
  expect(issue, ).toBeDefined()
  expect(issue?.retryable).toBe(false)
  expect(issue?.message).toContain(code)
  expect(issue?.message).toContain(issue?.path ?? '')
  return issue!
}

describe('layout input validation scenarios', () => {
  it.each([
    { name: 'null root', input: null, code: LayoutErrorCode.INVALID_INPUT, path: 'root' },
    { name: 'array root', input: [], code: LayoutErrorCode.INVALID_INPUT, path: 'root' },
    { name: 'missing root id', input: {}, code: LayoutErrorCode.INVALID_INPUT, path: 'root' },
    { name: 'empty root id', input: { id: '   ' }, code: LayoutErrorCode.INVALID_INPUT, path: 'root' },
  ])('', ({ input, code, path }) => {
    const issue = issueFor(input, code)
    expect(issue.path).toBe(path)
  })

  it('reports a missing child id at the child path', () => {
    const issue = issueFor({ id: 'root', children: [{ width: 10 }] }, LayoutErrorCode.MISSING_ID)
    expect(issue.path).toBe('children[0]')
  })

  it('reports a duplicate id at the later node path', () => {
    const issue = issueFor(
      { id: 'root', children: [{ id: 'same' }, { id: 'same' }] },
      LayoutErrorCode.DUPLICATE_ID,
    )
    expect(issue.path).toBe('children[1]')
  })

  it.each([
    { name: 'negative width', value: -1, field: 'width', code: LayoutErrorCode.NEGATIVE_SIZE },
    { name: 'negative height', value: -1, field: 'height', code: LayoutErrorCode.NEGATIVE_SIZE },
    { name: 'NaN width', value: Number.NaN, field: 'width', code: LayoutErrorCode.NON_FINITE_SIZE },
    { name: 'Infinity height', value: Number.POSITIVE_INFINITY, field: 'height', code: LayoutErrorCode.NON_FINITE_SIZE },
  ])('', ({ value, field, code }) => {
    const issue = issueFor({ id: 'root', [field]: value }, code)
    expect(issue.path).toBe(field)
  })

  it('reports missing or empty edge endpoints', () => {
    const issues = validateLayoutInput({
      id: 'root',
      children: [{ id: 'a' }, { id: 'b' }],
      edges: [{ sources: [], targets: ['b'] }, { sources: ['a'], targets: undefined }],
    })
    const endpointIssues = issues.filter((issue) => issue.code === LayoutErrorCode.EMPTY_ENDPOINTS)
    expect(endpointIssues.map((issue) => issue.path)).toEqual(['edges[0].sources', 'edges[1].targets'])
    expect(endpointIssues.every((issue) => issue.retryable === false)).toBe(true)
    expect(endpointIssues.every((issue) => issue.message.includes('EMPTY_ENDPOINTS'))).toBe(true)
  })

  it('reports a dangling node and port endpoint reference', () => {
    // 端点解析与 builder.resolveRef 一致：ref 是节点 id，或最后一个点号前缀是节点 id
    // （"a.out" 按节点 a + 隐式端口解析，不算 dangling；"missing"/"missing.port" 才是）。
    const issues = validateLayoutInput({
      id: 'root',
      children: [{ id: 'a', ports: [{ id: 'out' }] }, { id: 'b' }],
      edges: [{ sources: ['a.out'], targets: ['missing'] }, { sources: ['missing.port'], targets: ['b'] }],
    })
    const dangling = issues.filter((issue) => issue.code === LayoutErrorCode.DANGLING_ENDPOINT)
    expect(dangling.map((issue) => issue.path)).toEqual(['edges[0].targets[0]', 'edges[1].sources[0]'])
    expect(dangling.every((issue) => issue.retryable === false)).toBe(true)
    expect(dangling.every((issue) => issue.message.includes('DANGLING_ENDPOINT'))).toBe(true)
  })

  it('reports an unsupported algorithm on a node', () => {
    const issue = issueFor(
      { id: 'root', layoutOptions: { 'org.eclipse.elk.algorithm': 'not-a-provider' } },
      LayoutErrorCode.UNSUPPORTED_ALGORITHM,
    )
    expect(issue.path).toBe('layoutOptions.org.eclipse.elk.algorithm')
  })

  it('accepts a legal minimal graph', () => {
    expect(validateLayoutInput({ id: 'root' })).toEqual([])
  })

  it('does not modify the input', () => {
    const input = {
      id: 'root',
      width: 20,
      children: [{ id: 'child', ports: [{ id: 'in', width: 4 }] }],
      edges: [{ sources: ['child.in'], targets: ['root'] }],
    }
    const before = structuredClone(input)
    validateLayoutInput(input)
    expect(input).toEqual(before)
  })

  it('asserts valid and invalid inputs with a serializable structured error', () => {
    expect(() => assertValidLayoutInput({ id: 'root' })).not.toThrow()

    try {
      assertValidLayoutInput({ id: 'root', width: -1 })
      throw new Error('expected assertion to throw')
    } catch (error) {
      expect(error).toBeInstanceOf(LayoutError)
      const layoutError = error as LayoutError
      expect(layoutError.code).toBe(LayoutErrorCode.NEGATIVE_SIZE)
      expect(layoutError.path).toBe('width')
      expect(layoutError.retryable).toBe(false)
      expect(layoutError.message).toContain('NEGATIVE_SIZE')
      expect(layoutError.message).toContain('width')
      expect(() => JSON.stringify(layoutError.toJSON())).not.toThrow()
      expect(layoutError.toJSON()).toMatchObject({
        name: 'LayoutError',
        code: LayoutErrorCode.NEGATIVE_SIZE,
        path: 'width',
        retryable: false,
      })
    }
  })
})
