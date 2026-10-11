/**
 * CGroup (对应 ELK compaction.oned.CGroup) — 组内相对距离保持的容器.
 * 语义: 构造时首个节点为 reference; addCNode 双归属抛错; removeCNode 清除归属.
 */
import { describe, expect, it } from 'vitest'
import { CGroup } from '../../src/compaction/oned/cgroup.js'
import { CNode } from '../../src/compaction/oned/cnode.js'

class TestCNode extends CNode {
  getHorizontalSpacing(): number { return 0 }
  getVerticalSpacing(): number { return 0 }
  applyElementPosition(): void {}
  getElementPosition(): number { return this.hitbox.x }
}

describe('CGroup (ELK Java 移植)', () => {
  it('空构造: 无 reference, 集合为空', () => {
    const g = new CGroup()
    expect(g.reference).toBeNull()
    expect(g.cNodes.size).toBe(0)
    expect(g.incomingConstraints.size).toBe(0)
    expect(g.outDegree).toBe(0)
    expect(g.delta).toBe(0)
    expect(g.deltaNormalized).toBe(0)
    expect(g.reposition).toBe(true)
  })

  it('构造器把首个节点设为 reference 并加入集合', () => {
    const a = new TestCNode()
    const b = new TestCNode()
    const g = new CGroup(a, b)
    expect(g.reference).toBe(a)
    expect(g.cNodes.size).toBe(2)
    expect(a.cGroup).toBe(g)
    expect(b.cGroup).toBe(g)
  })

  it('addCNode 设置归属', () => {
    const a = new TestCNode()
    const g = new CGroup()
    g.addCNode(a)
    expect(g.cNodes.has(a)).toBe(true)
    expect(a.cGroup).toBe(g)
  })

  it('addCNode 双归属抛错', () => {
    const a = new TestCNode()
    const g1 = new CGroup(a)
    const g2 = new CGroup()
    expect(() => g2.addCNode(a)).toThrow('CNode belongs to another CGroup.')
    // 语义: 归属检查在 add 之前, 抛错后节点不加入 g2, 归属不变
    expect(g2.cNodes.has(a)).toBe(false)
    expect(a.cGroup).toBe(g1)
  })

  it('removeCNode 移除成员并清空归属', () => {
    const a = new TestCNode()
    const g = new CGroup(a)
    expect(g.removeCNode(a)).toBe(true)
    expect(g.cNodes.size).toBe(0)
    expect(a.cGroup).toBeNull()
  })

  it('removeCNode 非成员返回 false 且不影响归属', () => {
    const a = new TestCNode()
    const b = new TestCNode()
    const g = new CGroup(a)
    expect(g.removeCNode(b)).toBe(false)
    expect(g.cNodes.has(a)).toBe(true)
    expect(b.cGroup).toBeNull()
  })

  it('removeCNode 非成员 (属于其他组): 返回 false 且其他组归属不变', () => {
    const a = new TestCNode()
    const b = new TestCNode()
    const g = new CGroup(a)
    const g2 = new CGroup(b)
    expect(g.removeCNode(b)).toBe(false)
    expect(b.cGroup).toBe(g2)
    expect(g2.cNodes.has(b)).toBe(true)
    expect(g.cNodes.has(a)).toBe(true)
  })
})
