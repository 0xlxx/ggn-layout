/**
 * NubsSelfLoop (对应 ELK p5edges.splines.NubsSelfLoop) — 自环 NUB 样条构造器.
 *
 * 参考值来源: ELK Java 0.12.0 jar (org.eclipse.elk.alg.layered-0.12.0) 实测
 * (scripts/elk-java-debug NubsSelfLoopProbe), 与本仓库 tmp/elk master 源码逐位一致.
 * 不变量:
 *  - 端点锚定: 原始控制点首/末 = source/target 端口绝对锚点 (position + anchor).
 *  - 控制点方向: side 自环中间 CP 沿端口侧方向外移; corner 自环第二 CP 位于拐角公式确定的位置.
 *  - 与 jar 弯点一致: getBezierCP() 输出与 jar 逐点一致 (容差 1e-9).
 */
import { describe, expect, it } from 'vitest'
import { LPort } from '../../src/graph/lport.js'
import { PortSide, type KVector } from '../../src/graph/enums.js'
import { NubsSelfLoop } from '../../src/p5edges/splines/nubs-self-loop.js'

function port(side: PortSide, x: number, y: number, w = 8, h = 8): LPort {
  const p = new LPort()
  // setSide 依据当前 size 计算 anchor (与 ELK LPort.setSide 一致), 先设 size 再定侧.
  p.getSize().x = w
  p.getSize().y = h
  p.setSide(side)
  p.getPosition().x = x
  p.getPosition().y = y
  return p
}

/** 端口绝对锚点 (position + anchor; EAST 端口 anchor=(w, h/2), WEST=(0, h/2) 等). */
function anchor(p: LPort): KVector {
  return { x: p.getPosition().x + p.getAnchor().x, y: p.getPosition().y + p.getAnchor().y }
}

function expectClose(actual: KVector[], expected: KVector[], msg: string): void {
  expect(actual.length, `${msg}: 点数`).toBe(expected.length)
  for (let i = 0; i < expected.length; i++) {
    const a = actual[i]!
    const e = expected[i]!
    expect(a.x, `${msg}[${i}].x`).toBeCloseTo(e.x, 9)
    expect(a.y, `${msg}[${i}].y`).toBeCloseTo(e.y, 9)
  }
}

describe('NubsSelfLoop (ELK p5edges.splines.NubsSelfLoop 移植)', () => {
  it('createSideSelfLoop: 端点锚定 + 控制点沿端口侧方向 + 与 jar 弯点一致', () => {
    const src = port(PortSide.EAST, 200, 30)
    const tgt = port(PortSide.EAST, 200, 90)
    const nubs = NubsSelfLoop.createSideSelfLoop(src, tgt, 40)

    // 端点锚定: 原始 CP 首/末 = 端口绝对锚点
    const cps = nubs.getControlPoints()
    expect(anchor(src)).toEqual({ x: 208, y: 34 })
    expect(anchor(tgt)).toEqual({ x: 208, y: 94 })
    expect(cps[0]).toEqual({ x: 208, y: 34 })
    expect(cps[cps.length - 1]).toEqual({ x: 208, y: 94 })

    // 控制点方向: EAST 侧 → 中间 CP 全部在端口右侧 (x > 端口 x), 与节点侧一致
    for (const cp of cps.slice(1, -1)) expect(cp.x, '中间 CP x 应外移').toBeGreaterThan(208)

    // 与 jar 弯点一致 (NubsSelfLoopProbe SIDE, size 先于 setSide → 真实 anchor)
    expectClose(nubs.getBezierCP(), [
      { x: 248, y: 34 }, { x: 263, y: 49 }, { x: 263, y: 64 }, { x: 263, y: 79 }, { x: 248, y: 94 },
    ], 'SIDE bezier')
  })

  it('createCornerSelfLoop: 端点锚定 + 第二 CP 由拐角公式确定 + 与 jar 弯点一致', () => {
    const src = port(PortSide.WEST, 10, 60)
    const tgt = port(PortSide.NORTH, 100, 5)
    const nubs = NubsSelfLoop.createCornerSelfLoop(src, tgt, 25, 20)

    const cps = nubs.getControlPoints()
    expect(cps[0]).toEqual(anchor(src))
    expect(cps[cps.length - 1]).toEqual(anchor(tgt))

    // 与 jar 弯点一致 (NubsSelfLoopProbe CORNER)
    expectClose(nubs.getBezierCP(), [
      { x: -22.5, y: 64 },
      { x: -46.625, y: 6.25 },
      { x: -15, y: -15 },
      { x: 16.625, y: -36.25 },
      { x: 104, y: -21 },
    ], 'CORNER bezier')
  })

  it('createAcrossSelfLoop: 中间 CP = 两拐角 CP 中点 + 与 jar 弯点一致', () => {
    const src = port(PortSide.WEST, 10, 50)
    const tgt = port(PortSide.EAST, 190, 50)
    const nubs = NubsSelfLoop.createAcrossSelfLoop(
      src, tgt,
      { x: 0, y: 40 },
      [{ x: 200, y: 40 }, { x: 200, y: 60 }],
      { x: 190, y: 60 },
    )

    const cps = nubs.getControlPoints()
    expect(cps[0]).toEqual(anchor(src))
    expect(cps[cps.length - 1]).toEqual(anchor(tgt))
    // middleCP = (thirdCP + fourthCP) / 2
    expect(cps[3]).toEqual({ x: 200, y: 50 })

    // 与 jar 弯点一致 (NubsSelfLoopProbe ACROSS)
    expectClose(nubs.getBezierCP(), [
      { x: 0, y: 40 }, { x: 100, y: 40 }, { x: 150, y: 41.666666666666664 },
      { x: 200, y: 43.33333333333333 }, { x: 200, y: 46.666666666666664 },
      { x: 200, y: 50 }, { x: 200, y: 53.33333333333333 },
      { x: 200, y: 56.666666666666664 }, { x: 197.5, y: 58.33333333333333 },
      { x: 195, y: 60 }, { x: 190, y: 60 },
    ], 'ACROSS bezier')
  })

  it('createThreeSideSelfLoop: 3 拐角点直通 + 与 jar 弯点一致', () => {
    const src = port(PortSide.WEST, 10, 50)
    const tgt = port(PortSide.EAST, 190, 50)
    const nubs = NubsSelfLoop.createThreeSideSelfLoop(
      src, tgt,
      { x: 0, y: 40 },
      [{ x: 200, y: 40 }, { x: 200, y: 10 }, { x: 0, y: 10 }],
      { x: 10, y: 60 },
    )

    const cps = nubs.getControlPoints()
    expect(cps[0]).toEqual(anchor(src))
    expect(cps[cps.length - 1]).toEqual(anchor(tgt))

    // 与 jar 弯点一致 (NubsSelfLoopProbe THREE)
    expectClose(nubs.getBezierCP(), [
      { x: 0, y: 40 }, { x: 100, y: 40 }, { x: 150, y: 35 }, { x: 200, y: 30 },
      { x: 200, y: 20 }, { x: 166.66666666666666, y: 15 }, { x: 133.33333333333331, y: 10 },
      { x: 66.66666666666666, y: 10 }, { x: 35.83333333333333, y: 22.5 },
      { x: 5, y: 35 }, { x: 10, y: 60 },
    ], 'THREE bezier')
  })

  it('createFourSideSelfLoop: 4 拐角点直通 + 与 jar 弯点一致', () => {
    const src = port(PortSide.WEST, 10, 50)
    const tgt = port(PortSide.EAST, 190, 50)
    const nubs = NubsSelfLoop.createFourSideSelfLoop(
      src, tgt,
      { x: 0, y: 40 },
      [{ x: 200, y: 40 }, { x: 200, y: 10 }, { x: 0, y: 10 }, { x: 0, y: 70 }],
      { x: 10, y: 60 },
    )

    const cps = nubs.getControlPoints()
    expect(cps[0]).toEqual(anchor(src))
    expect(cps[cps.length - 1]).toEqual(anchor(tgt))

    // 与 jar 弯点一致 (NubsSelfLoopProbe FOUR)
    expectClose(nubs.getBezierCP(), [
      { x: 0, y: 40 }, { x: 100, y: 40 }, { x: 150, y: 35 }, { x: 200, y: 30 },
      { x: 200, y: 19.999999999999996 }, { x: 166.66666666666663, y: 14.999999999999996 },
      { x: 133.33333333333331, y: 10 }, { x: 66.66666666666669, y: 10 },
      { x: 33.33333333333335, y: 19.999999999999996 }, { x: 0, y: 29.999999999999996 },
      { x: 0, y: 50.00000000000001 }, { x: 2.5000000000000018, y: 57.50000000000001 },
      { x: 5.000000000000002, y: 65 }, { x: 10, y: 60 },
    ], 'FOUR bezier')
  })

  it('直接构造 (clamped, dim 3): 与 jar 弯点一致', () => {
    const nubs = new NubsSelfLoop(3, [
      { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 10 }, { x: 30, y: 10 }, { x: 40, y: 0 },
    ])
    expectClose(nubs.getBezierCP(), [
      { x: 10, y: 0 }, { x: 15, y: 5 }, { x: 20, y: 7.5 }, { x: 25, y: 10 }, { x: 30, y: 10 },
    ], 'DIRECT bezier')
  })

  it('firstLabelPosition 访问器 (历史自环 label 放置 API)', () => {
    const nubs = new NubsSelfLoop(3, [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 10 }, { x: 30, y: 10 }, { x: 40, y: 0 }])
    expect(nubs.getFirstLabelPosition()).toEqual({ x: 0, y: 0 })
    nubs.setFirstLabelPosition({ x: 12, y: 34 })
    expect(nubs.getFirstLabelPosition()).toEqual({ x: 12, y: 34 })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 补充: 拐角自环其余侧组合 (分支全覆盖) + boolean 构造器 + 非法 cornerBendPoints 错误分支
// ─────────────────────────────────────────────────────────────────────────────

describe('NubsSelfLoop 补充分支', () => {
  /** 独立复算拐角第二 CP (corner 公式): source/target 侧分支. */
  function cornerSecondCP(
    sourceSide: PortSide, targetSide: PortSide,
    sourcePos: KVector, targetPos: KVector, firstCP: KVector, thirdCP: KVector,
    sourceHeight: number, targetHeight: number,
  ): KVector {
    let cornerX = 0
    let cornerY = 0
    switch (sourceSide) {
      case PortSide.WEST: cornerX = 2 * (sourcePos.x - sourceHeight) - 0.5 * (firstCP.x + thirdCP.x); break
      case PortSide.EAST: cornerX = 2 * (sourcePos.x + sourceHeight) - 0.5 * (firstCP.x + thirdCP.x); break
      case PortSide.NORTH: cornerY = 2 * (sourcePos.y - sourceHeight) - 0.5 * (firstCP.y + thirdCP.y); break
      case PortSide.SOUTH: cornerY = 2 * (sourcePos.y + sourceHeight) - 0.5 * (firstCP.y + thirdCP.y); break
      default: break
    }
    switch (targetSide) {
      case PortSide.WEST: cornerX = 2 * (targetPos.x - targetHeight) - 0.5 * (thirdCP.x + firstCP.x); break
      case PortSide.EAST: cornerX = 2 * (targetPos.x + targetHeight) - 0.5 * (thirdCP.x + firstCP.x); break
      case PortSide.NORTH: cornerY = 2 * (targetPos.y - targetHeight) - 0.5 * (thirdCP.y + firstCP.y); break
      case PortSide.SOUTH: cornerY = 2 * (targetPos.y + targetHeight) - 0.5 * (thirdCP.y + firstCP.y); break
      default: break
    }
    return { x: cornerX, y: cornerY }
  }

  function cornerDir(side: PortSide): KVector {
    const d = side === PortSide.NORTH ? (3 * Math.PI) / 2
      : side === PortSide.EAST ? 0
      : side === PortSide.SOUTH ? Math.PI / 2
      : Math.PI
    return { x: Math.cos(d), y: Math.sin(d) }
  }

  it.each([
    [PortSide.EAST, PortSide.SOUTH],
    [PortSide.NORTH, PortSide.EAST],
    [PortSide.SOUTH, PortSide.WEST],
  ] as const)('createCornerSelfLoop %s→%s: 端点锚定 + 第二 CP 拐角公式', (sourceSide, targetSide) => {
    const src = port(sourceSide, 100, 60)
    const tgt = port(targetSide, 180, 20)
    const sh = 25
    const th = 20
    const nubs = NubsSelfLoop.createCornerSelfLoop(src, tgt, sh, th)

    const cps = nubs.getControlPoints()
    const sourcePos = anchor(src)
    const targetPos = anchor(tgt)
    // 端点锚定
    expect(cps[0]).toEqual(sourcePos)
    expect(cps[cps.length - 1]).toEqual(targetPos)
    // 首/末 CP 沿各自侧方向外移 FRACTION×height (FRACTION=1.3)
    const firstCP = { x: sourcePos.x + cornerDir(sourceSide).x * 1.3 * sh, y: sourcePos.y + cornerDir(sourceSide).y * 1.3 * sh }
    const thirdCP = { x: targetPos.x + cornerDir(targetSide).x * 1.3 * th, y: targetPos.y + cornerDir(targetSide).y * 1.3 * th }
    expect(cps[1]!.x).toBeCloseTo(firstCP.x, 9)
    expect(cps[1]!.y).toBeCloseTo(firstCP.y, 9)
    expect(cps[3]!.x).toBeCloseTo(thirdCP.x, 9)
    expect(cps[3]!.y).toBeCloseTo(thirdCP.y, 9)
    // 第二 CP = 拐角公式
    const second = cornerSecondCP(sourceSide, targetSide, sourcePos, targetPos, firstCP, thirdCP, sh, th)
    expect(cps[2]!.x).toBeCloseTo(second.x, 9)
    expect(cps[2]!.y).toBeCloseTo(second.y, 9)
    // bezier 输出 5 点 (5 原始 CP clamped cubic → 2 段)
    expect(nubs.getBezierCP()).toHaveLength(5)
  })

  it('boolean 构造器 (clamped, dim, vecs) 与 number 构造器等价', () => {
    const pts = [
      { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 10 }, { x: 30, y: 10 }, { x: 40, y: 0 },
    ]
    const a = new NubsSelfLoop(true, 3, pts)
    const b = new NubsSelfLoop(3, pts)
    expect(a.getBezierCP()).toEqual(b.getBezierCP())
  })

  it('createAcrossSelfLoop: cornerBendPoints 长度 ≠ 2 抛 AssertionError', () => {
    const src = port(PortSide.WEST, 10, 50)
    const tgt = port(PortSide.EAST, 190, 50)
    expect(() => NubsSelfLoop.createAcrossSelfLoop(
      src, tgt, { x: 0, y: 40 }, [{ x: 200, y: 40 }], { x: 190, y: 60 },
    )).toThrow(/AssertionError: cornerBendPoints.size\(\) == 2/)
  })

  it('createThreeSideSelfLoop: cornerBendPoints 长度 ≠ 3 抛 AssertionError', () => {
    const src = port(PortSide.WEST, 10, 50)
    const tgt = port(PortSide.EAST, 190, 50)
    expect(() => NubsSelfLoop.createThreeSideSelfLoop(
      src, tgt, { x: 0, y: 40 }, [{ x: 200, y: 40 }, { x: 200, y: 10 }], { x: 10, y: 60 },
    )).toThrow(/AssertionError: cornerBendPoints.size\(\) == 3/)
  })

  it('createFourSideSelfLoop: cornerBendPoints 长度 ≠ 4 抛 AssertionError', () => {
    const src = port(PortSide.WEST, 10, 50)
    const tgt = port(PortSide.EAST, 190, 50)
    expect(() => NubsSelfLoop.createFourSideSelfLoop(
      src, tgt, { x: 0, y: 40 }, [{ x: 200, y: 40 }, { x: 200, y: 10 }, { x: 0, y: 10 }], { x: 10, y: 60 },
    )).toThrow(/AssertionError: cornerBendPoints.size\(\) == 4/)
  })
})
