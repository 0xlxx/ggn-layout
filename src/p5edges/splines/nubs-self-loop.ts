/*
 * Copyright (c) 2026 GGN contributors.
 * Portions derived from the Eclipse Layout Kernel (ELK), Copyright (c) Kiel University and others.
 *
 * This file is part of ggn-layout, a TypeScript port of ELK v0.12.0.
 * Upstream attribution and source range: see THIRD_PARTY_NOTICES.md.
 *
 * SPDX-License-Identifier: EPL-2.0
 * License text: LICENSES/EPL-2.0.txt.
 */
/**
 * NubsSelfLoop (对应 ELK p5edges.splines.NubsSelfLoop) — 自环 NUB 样条构造器.
 *
 * 移植范围: NubsSelfLoop.java 全部公开 API:
 *   - 构造器 (clamped/uniform, 维度 3) extends NubSpline
 *   - createSideSelfLoop / createCornerSelfLoop / createAcrossSelfLoop /
 *     createThreeSideSelfLoop / createFourSideSelfLoop 静态自环构造器
 *   - firstLabelPosition 访问器 (历史自环 label 放置用, 现行 ELK 管线未消费)
 *
 * 接入: SplineEdgeRouter.selfLoopsLayer 处理路径 (旧 ELK SplineEdgeRouter 966490b7 与旧
 * SplineSelfLoopRouter 629b5f4c 曾直接调用本类; 现行 ELK 0.12.0 自环由
 * intermediate.loops.routing.SplineSelfLoopRouter 用 NubSpline 直接生成, 本类保留为
 * 自环样条的构造 API, 供路由层对未预路由的自环做收尾). 纯函数 + 延迟计算:
 * 构造不立即转 Bezier, getBezierCP 时才计算.
 */
import { PortSide, type KVector } from '../../graph/enums.js'
import type { LPort } from '../../graph/lport.js'
import { portSideToDirection } from './splines-math.js'
import { NubSpline } from './nub-spline.js'

/** 第二/四控制点相对期望高度的比例 (越大 → 中间控制点越低). */
const FRACTION = 1.3
/** 避免 magic number 警告. */
const HALF = 0.5

/** KVector 纯函数辅助 (本模块内联, 与 ELK KVector 语义一致). */
function addV(a: KVector, b: KVector): KVector { return { x: a.x + b.x, y: a.y + b.y } }
function subV(a: KVector, b: KVector): KVector { return { x: a.x - b.x, y: a.y - b.y } }
function scaleV(v: KVector, s: number): KVector { return { x: v.x * s, y: v.y * s } }
function lengthV(v: KVector): number { return Math.hypot(v.x, v.y) }
/** new KVector(angle): 角度 → 单位方向向量 (KVector(double) 构造语义). */
function unitVector(angle: number): KVector { return { x: Math.cos(angle), y: Math.sin(angle) } }

/** 端口绝对锚点 = port.position + port.anchor (对应 getPosition().clone().add(getAnchor())). */
function absoluteAnchor(port: LPort): KVector {
  const pos = port.getPosition()
  const anchor = port.getAnchor()
  return { x: pos.x + anchor.x, y: pos.y + anchor.y }
}

/**
 * 自环 NUB 样条: 均匀/钳制三次 B-Spline 的自环构造器集合.
 * 用静态 create* 方法获取实例 (对应 ELK NubsSelfLoop 注释语义).
 */
export class NubsSelfLoop extends NubSpline {
  /** 第一条自环 label 的位置 (可被修改). */
  private firstLabelPosition: KVector = { x: 0, y: 0 }

  constructor(dimension: number, kVectors: KVector[])
  constructor(clamped: boolean, dimension: number, kVectors: KVector[])
  constructor(clampedOrDim: boolean | number, dimensionOrVecs: number | KVector[], kVectors?: KVector[]) {
    if (typeof clampedOrDim === 'boolean') {
      super(clampedOrDim, dimensionOrVecs as number, kVectors!)
    } else {
      super(true, clampedOrDim, dimensionOrVecs as KVector[])
    }
  }

  getFirstLabelPosition(): KVector {
    return this.firstLabelPosition
  }

  setFirstLabelPosition(position: KVector): void {
    this.firstLabelPosition = position
  }

  /**
   * 生成节点直边侧的自环 NUB (source/target 端口位于同一侧).
   * 控制点: 首/末锚定源/目标端口锚点, 中间控制点沿端口侧方向外移 length.
   *
   * @param source 自环起始端口.
   * @param target 自环终止端口.
   * @param length 样条离开节点侧面的估计距离.
   */
  static createSideSelfLoop(source: LPort, target: LPort, length: number): NubsSelfLoop {
    const direction = portSideToDirection(source.getSide())
    const sourcePos = absoluteAnchor(source)
    const targetPos = absoluteAnchor(target)

    // 源/目标点旁的三个控制点
    const firstCP = addV(sourcePos, scaleV(unitVector(direction), length))
    const thirdCP = addV(targetPos, scaleV(unitVector(direction), length))
    const mid = scaleV(subV(firstCP, thirdCP), 1 / 2)
    const secondCP = addV(addV(thirdCP, mid), scaleV(unitVector(direction), lengthV(mid)))

    return new NubsSelfLoop(3, [sourcePos, firstCP, secondCP, thirdCP, targetPos])
  }

  /**
   * 生成节点拐角处的自环 NUB (source/target 端口位于相邻两侧).
   * 第一/三控制点在各自侧方向外移 FRACTION×height, 第二控制点由两侧 corner 公式确定.
   *
   * @param source 自环起始端口.
   * @param target 自环终止端口.
   * @param sourceHeight 样条离开源侧面的估计距离.
   * @param targetHeight 样条离开目标侧面的估计距离.
   */
  static createCornerSelfLoop(source: LPort, target: LPort, sourceHeight: number, targetHeight: number): NubsSelfLoop {
    // 源/目标方向的弧度
    const sourceDir = portSideToDirection(source.getSide())
    const targetDir = portSideToDirection(target.getSide())

    // 源/目标端口位置
    const sourcePos = absoluteAnchor(source)
    const targetPos = absoluteAnchor(target)

    // 首/末 CP 位于距 source/target 指定距离 (FRACTION×height) 与指定方向处
    const firstCP = addV(sourcePos, scaleV(unitVector(sourceDir), FRACTION * sourceHeight))
    const thirdCP = addV(targetPos, scaleV(unitVector(targetDir), FRACTION * targetHeight))

    // 第二 CP 位于从拐角到 cpCorner 向量按固定比例处
    let cornerX = 0.0
    let cornerY = 0.0

    switch (source.getSide()) {
      case PortSide.WEST:
        cornerX = 2 * (sourcePos.x - sourceHeight) - HALF * (firstCP.x + thirdCP.x)
        break
      case PortSide.EAST:
        cornerX = 2 * (sourcePos.x + sourceHeight) - HALF * (firstCP.x + thirdCP.x)
        break
      case PortSide.NORTH:
        cornerY = 2 * (sourcePos.y - sourceHeight) - HALF * (firstCP.y + thirdCP.y)
        break
      case PortSide.SOUTH:
        cornerY = 2 * (sourcePos.y + sourceHeight) - HALF * (firstCP.y + thirdCP.y)
        break
      default:
        break
    }

    switch (target.getSide()) {
      case PortSide.WEST:
        cornerX = 2 * (targetPos.x - targetHeight) - HALF * (thirdCP.x + firstCP.x)
        break
      case PortSide.EAST:
        cornerX = 2 * (targetPos.x + targetHeight) - HALF * (thirdCP.x + firstCP.x)
        break
      case PortSide.NORTH:
        cornerY = 2 * (targetPos.y - targetHeight) - HALF * (thirdCP.y + firstCP.y)
        break
      case PortSide.SOUTH:
        cornerY = 2 * (targetPos.y + targetHeight) - HALF * (thirdCP.y + firstCP.y)
        break
      default:
        break
    }

    const secondCP: KVector = { x: cornerX, y: cornerY }

    return new NubsSelfLoop(3, [sourcePos, firstCP, secondCP, thirdCP, targetPos])
  }

  /**
   * 生成跨越相对两侧的自环 NUB. 途中基本弯点已由调用方算好.
   * cornerBendPoints 恰含 2 个点, 取其中点作为中间控制点.
   */
  static createAcrossSelfLoop(
    source: LPort, target: LPort,
    sourceBendPoint: KVector, cornerBendPoints: KVector[], targetBendPoint: KVector,
  ): NubsSelfLoop {
    const sourcePos = absoluteAnchor(source)
    const targetPos = absoluteAnchor(target)

    if (cornerBendPoints.length !== 2) throw new Error('AssertionError: cornerBendPoints.size() == 2')
    const thirdCP = cornerBendPoints[0]!
    const fourthCP = cornerBendPoints[1]!

    // 计算 (第三与第四之间) 的中间控制点
    const middleCP = scaleV(addV(fourthCP, thirdCP), HALF)

    return new NubsSelfLoop(3, [sourcePos, sourceBendPoint, thirdCP, middleCP, fourthCP, targetBendPoint, targetPos])
  }

  /**
   * 生成跨越三个侧面的自环 NUB. 途中基本弯点已由调用方算好.
   * cornerBendPoints 恰含 3 个点.
   */
  static createThreeSideSelfLoop(
    source: LPort, target: LPort,
    sourceBendPoint: KVector, cornerBendPoints: KVector[], targetBendPoint: KVector,
  ): NubsSelfLoop {
    const sourcePos = absoluteAnchor(source)
    const targetPos = absoluteAnchor(target)

    if (cornerBendPoints.length !== 3) throw new Error('AssertionError: cornerBendPoints.size() == 3')
    const thirdCP = cornerBendPoints[0]!
    const fourthCP = cornerBendPoints[1]!
    const fifthCP = cornerBendPoints[2]!

    return new NubsSelfLoop(3, [sourcePos, sourceBendPoint, thirdCP, fourthCP, fifthCP, targetBendPoint, targetPos])
  }

  /**
   * 生成跨越四个侧面的自环 NUB. 途中基本弯点已由调用方算好.
   * cornerBendPoints 恰含 4 个点.
   */
  static createFourSideSelfLoop(
    source: LPort, target: LPort,
    sourceBendPoint: KVector, cornerBendPoints: KVector[], targetBendPoint: KVector,
  ): NubsSelfLoop {
    const sourcePos = absoluteAnchor(source)
    const targetPos = absoluteAnchor(target)

    if (cornerBendPoints.length !== 4) throw new Error('AssertionError: cornerBendPoints.size() == 4')
    const thirdCP = cornerBendPoints[0]!
    const fourthCP = cornerBendPoints[1]!
    const fifthCP = cornerBendPoints[2]!
    const sixthCP = cornerBendPoints[3]!

    return new NubsSelfLoop(3, [sourcePos, sourceBendPoint, thirdCP, fourthCP, fifthCP, sixthCP, targetBendPoint, targetPos])
  }
}
