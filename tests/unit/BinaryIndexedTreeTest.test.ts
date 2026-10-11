/**
 * 移植自 ELK Java: p3order/counting/BinaryIndexedTreeTest.java
 */
import { describe, expect, it } from 'vitest'
import { BinaryIndexedTree } from '../../src/p3order/counting.js'

describe('BinaryIndexedTree (ELK Java 移植)', () => {
  it('sumBefore', () => {
    const ft = new BinaryIndexedTree(5)
    ft.add(1); ft.add(2); ft.add(1)
    expect(ft.rank(1)).toBe(0)
    expect(ft.rank(2)).toBe(2)
  })

  it('size', () => {
    const ft = new BinaryIndexedTree(5)
    ft.add(2); ft.add(1); ft.add(1)
    expect(ft.size()).toBe(3)
  })

  it('removeAll', () => {
    const ft = new BinaryIndexedTree(5)
    ft.add(0); ft.add(2); ft.add(1); ft.add(1)
    ft.removeAll(1)
    expect(ft.size()).toBe(2)
    expect(ft.rank(2)).toBe(1)
    ft.removeAll(1)
    expect(ft.size()).toBe(2)
    expect(ft.rank(2)).toBe(1)
  })
})

/**
 * 性质/随机属性测试 (writer C): 固定种子随机 add/removeAll 序列,
 * rank(x) = 严格小于 x 的元素数, size/isEmpty 与独立模型一致.
 */
import { JavaRandom } from '../../src/util/java-random.js'

describe('BinaryIndexedTree 性质/随机属性测试', () => {
  it.each([1, 2, 3, 4, 5])('seed=%i: rank/size/isEmpty 与独立模型一致 (随机操作序列)', (seed) => {
    const r = new JavaRandom(seed)
    const maxNum = 20
    const tree = new BinaryIndexedTree(maxNum)
    const model = new Array<number>(maxNum).fill(0)
    for (let k = 0; k < 200; k++) {
      const idx = r.nextInt(maxNum)
      if (r.nextBoolean()) {
        tree.add(idx)
        model[idx]!++
      } else {
        tree.removeAll(idx)
        model[idx] = 0
      }
      for (const x of [0, 1, 5, 10, 19, 20]) {
        let expected = 0
        for (let i = 0; i < Math.min(x, maxNum); i++) expected += model[i]!
        expect(tree.rank(x), `seed=${seed} step=${k} x=${x}`).toBe(expected)
      }
      expect(tree.size()).toBe(model.reduce((a, b) => a + b, 0))
      expect(tree.isEmpty()).toBe(tree.size() === 0)
    }
  })

  it.each([1, 2, 3])('seed=%i: clear 后全部清零', (seed) => {
    const r = new JavaRandom(seed)
    const tree = new BinaryIndexedTree(10)
    for (let k = 0; k < 50; k++) tree.add(r.nextInt(10))
    tree.clear()
    expect(tree.size()).toBe(0)
    expect(tree.isEmpty()).toBe(true)
    for (let x = 0; x <= 10; x++) expect(tree.rank(x)).toBe(0)
  })

  it('rank 单调不减 (插入后)', () => {
    const tree = new BinaryIndexedTree(8)
    const r = new JavaRandom(7)
    for (let k = 0; k < 100; k++) tree.add(r.nextInt(8))
    for (let x = 0; x <= 8; x++) {
      if (x > 0) expect(tree.rank(x)).toBeGreaterThanOrEqual(tree.rank(x - 1))
    }
  })
})
