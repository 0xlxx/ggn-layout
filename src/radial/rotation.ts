/**
 * rotation — ELK alg.radial.intermediate.rotation
 * (IRadialRotator / AngleRotation / GeneralRotator).
 *
 * 把整个布局绕原点旋转到目标角度; 可选额外楔形空间: 在目标角度的基础上再旋转,
 * 使经过目标角度的直线穿过首末节点楔形的正中间.
 */
import type { ElkNode } from '../api/elk-json.js'
import { ROTATION_TARGET_ANGLE, ROTATION_COMPUTE_ADDITIONAL_WEDGE_SPACE, optBool, optNum, getGraphProperty } from './options.js'
import { findNodeById, nodeIdOfRef, outgoingEdges, TWO_PI } from './radial-util.js'
import { INTERNAL_ROOT_NODE } from './radial-layout.js'

/** 径向布局旋转器 (Java IRadialRotator). */
export interface IRadialRotator {
  rotate(graph: ElkNode): void
}

/** 绕原点旋转到目标角度 (Java AngleRotation). */
export class AngleRotation implements IRadialRotator {
  private graph: ElkNode

  constructor(graph: ElkNode) {
    this.graph = graph
  }

  rotate(graph: ElkNode): void {
    let targetAngle = optNum(graph, ROTATION_TARGET_ANGLE)

    if (optBool(graph, ROTATION_COMPUTE_ADDITIONAL_WEDGE_SPACE)) {
      // Using the target angle as our base alignment we want to further rotate the layout such that a line
      // following the target angle runs directly through the middle of the wedge between the first and last node.
      const root = getGraphProperty<ElkNode>(graph, INTERNAL_ROOT_NODE, undefined as unknown as ElkNode)

      const rootEdges = outgoingEdges(this.graph, root)
      const lastTarget = rootEdges[rootEdges.length - 1]!
      const firstTarget = rootEdges[0]!
      const lastNode = findNodeById(this.graph, nodeIdOfRef(this.graph, String(lastTarget.targets?.[0] ?? '')) ?? '')!
      const firstNode = findNodeById(this.graph, nodeIdOfRef(this.graph, String(firstTarget.targets?.[0] ?? '')) ?? '')!
      const lastVector = { x: (lastNode.x ?? 0) + (lastNode.width ?? 0) / 2, y: (lastNode.y ?? 0) + (lastNode.height ?? 0) / 2 }
      const firstVector = { x: (firstNode.x ?? 0) + (firstNode.width ?? 0) / 2, y: (firstNode.y ?? 0) + (firstNode.height ?? 0) / 2 }

      // we shift all angles into the range (0,pi] to avoid dealing with negative angles.
      let alpha = targetAngle
      if (alpha <= 0) {
        alpha += TWO_PI
      }

      let wedgeAngle = angleBetween(lastVector, firstVector)
      if (wedgeAngle <= 0) {
        wedgeAngle += TWO_PI
      }

      let alignmentAngle = Math.atan2(lastVector.y, lastVector.x)
      if (alignmentAngle <= 0) {
        alignmentAngle += TWO_PI
      }

      // alpha (originally targetAngle) is the angle of the incoming edge that we wish to align ourselves with.
      // wedgeAngle is the angle between the first and last nodes of our own layout. For the case of a single
      // node this is 360 degrees.
      // alignmentAngle is the angle of the vector pointing to the last node i.e. the end part of the segment
      // we rotate the entire layout by subtracting the incoming angle alpha and we add half the wedge angle back
      // to make the alignment go through the center of the wedge. Finally, we need to do a transformation to
      // make all this work in our downward facing coordinate system. So everything is inverted and we need subtract
      // the result from 180 degrees.
      targetAngle = Math.PI - (alignmentAngle - alpha + wedgeAngle / 2)
    }

    // rotate all nodes around the origin, because the root node is positioned at the origin
    // nodes are positioned with their center on the radius so use that for the rotation
    for (const node of graph.children ?? []) {
      const pos = rotateVector({ x: (node.x ?? 0) + (node.width ?? 0) / 2, y: (node.y ?? 0) + (node.height ?? 0) / 2 }, targetAngle)
      node.x = pos.x - (node.width ?? 0) / 2
      node.y = pos.y - (node.height ?? 0) / 2
    }
  }
}

/** 向量旋转 (Java KVector.rotate). */
function rotateVector(v: { x: number; y: number }, angle: number): { x: number; y: number } {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return { x: v.x * cos - v.y * sin, y: v.x * sin + v.y * cos }
}

/** 两向量夹角 (Java KVector.angle: atan2(cross, dot)). */
function angleBetween(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const cross = a.x * b.y - a.y * b.x
  const dot = a.x * b.x + a.y * b.y
  return Math.atan2(cross, dot)
}

/** 旋转布局处理器 (Java GeneralRotator.process). */
export function generalRotator(graph: ElkNode): void {
  const rotator = new AngleRotation(graph)
  rotator.rotate(graph)
}
