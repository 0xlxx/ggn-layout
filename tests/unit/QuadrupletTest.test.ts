/**
 * Quadruplet (对应 ELK compaction.oned.Quadruplet) — 4 方向锁/间距忽略标记.
 * 语义: setDirection/get 按 Direction 映射 left/right/up/down; 未知方向 no-op / false.
 */
import { describe, expect, it } from 'vitest'
import { Direction } from '../../src/index.js'
import { Quadruplet } from '../../src/compaction/oned/quadruplet.js'

describe('Quadruplet (ELK Java 移植)', () => {
  it('默认构造: 四个方向均为 false', () => {
    const q = new Quadruplet()
    expect(q.left).toBe(false)
    expect(q.right).toBe(false)
    expect(q.up).toBe(false)
    expect(q.down).toBe(false)
    expect(q.get(Direction.LEFT)).toBe(false)
    expect(q.get(Direction.RIGHT)).toBe(false)
    expect(q.get(Direction.UP)).toBe(false)
    expect(q.get(Direction.DOWN)).toBe(false)
  })

  it('四参构造初始化对应方向', () => {
    const q = new Quadruplet(true, false, true, false)
    expect(q.left).toBe(true)
    expect(q.right).toBe(false)
    expect(q.up).toBe(true)
    expect(q.down).toBe(false)
    // get 与字段一致
    expect(q.get(Direction.LEFT)).toBe(true)
    expect(q.get(Direction.RIGHT)).toBe(false)
    expect(q.get(Direction.UP)).toBe(true)
    expect(q.get(Direction.DOWN)).toBe(false)
  })

  it('set 覆盖全部四个方向', () => {
    const q = new Quadruplet()
    q.set(false, true, false, true)
    expect(q.left).toBe(false)
    expect(q.right).toBe(true)
    expect(q.up).toBe(false)
    expect(q.down).toBe(true)
  })

  it('setDirection 按 Direction 设置对应字段', () => {
    const q = new Quadruplet()
    q.setDirection(true, Direction.LEFT)
    expect(q.left).toBe(true)
    q.setDirection(false, Direction.RIGHT)
    expect(q.right).toBe(false)
    q.setDirection(true, Direction.UP)
    expect(q.up).toBe(true)
    q.setDirection(false, Direction.DOWN)
    expect(q.down).toBe(false)
  })

  it('setDirection 未知方向为 no-op (default 分支)', () => {
    const q = new Quadruplet(false, false, false, false)
    q.setDirection(true, Direction.UNDEFINED)
    expect(q.left).toBe(false)
    expect(q.right).toBe(false)
    expect(q.up).toBe(false)
    expect(q.down).toBe(false)
  })

  it('get 未知方向返回 false (default 分支)', () => {
    const q = new Quadruplet(true, true, true, true)
    expect(q.get(Direction.UNDEFINED)).toBe(false)
  })

  it('独立实例互不影响', () => {
    const q1 = new Quadruplet(true, true, true, true)
    const q2 = new Quadruplet()
    q2.setDirection(true, Direction.LEFT)
    expect(q1.get(Direction.RIGHT)).toBe(true)
    expect(q2.get(Direction.RIGHT)).toBe(false)
    expect(q2.get(Direction.LEFT)).toBe(true)
  })
})
