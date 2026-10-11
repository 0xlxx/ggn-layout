/**
 * BowyerWatsonTriangulation — ELK alg.common.BowyerWatsonTriangulation 0.12.0.
 *
 * Bowyer-Watson Delaunay 三角剖分: 增量插入顶点, 移除圆内含新顶点的三角形,
 * 用空洞边界与新顶点重新三角化. 返回无重复边的边集合.
 *
 * 前提: 所有顶点互异 (ElkGraphImporter 对重合中心点做了随机微移).
 * 集合语义对齐 Java: TTriangle/TEdge 用 JavaHashSet (哈希桶迭代序与 Java 一致,
 * 保证下游 NaiveMinST 稳定排序的同权 tie-break 与 jar 全等).
 */
import { KVector } from '../force/kvector.js'
import { vkey } from './geometry.js'
import { TEdge } from './graph.js'
import { JavaHashSet, kvectorJavaHash } from './java-hash-set.js'
import type { JavaHashable } from './java-hash-set.js'

/** 三角形: 顶点 a/b/c + 三边 + 外接圆 (Java TTriangle). */
class TTriangle implements JavaHashable {
  a: KVector
  b: KVector
  c: KVector
  tEdges: TEdge[]
  vertices: KVector[]
  circumcenter: KVector

  constructor(a: KVector, b: KVector, c: KVector) {
    this.a = a
    this.b = b
    this.c = c
    this.tEdges = [new TEdge(a, b), new TEdge(b, c), new TEdge(c, a)]
    this.vertices = [a, b, c]
    this.circumcenter = this.calculateCircumcenter()
  }

  /** 外接圆圆心 (Java TTriangle.calculateCircumcenter). */
  calculateCircumcenter(): KVector {
    const ab = this.b.clone().sub(this.a)
    const ac = this.c.clone().sub(this.a)
    const bc = this.c.clone().sub(this.b)
    const e = ab.x * (this.a.x + this.b.x) + ab.y * (this.a.y + this.b.y)
    const f = ac.x * (this.a.x + this.c.x) + ac.y * (this.a.y + this.c.y)
    const g = 2 * (ab.x * bc.y - ab.y * bc.x)
    const px = (ac.y * e - ab.y * f) / g
    const py = (ab.x * f - ac.x * e) / g
    return new KVector(px, py)
  }

  /** 顶点 v 是否在外接圆内 (fuzzy, Java DoubleMath.fuzzyCompare < 0). */
  inCircumcircle(v: KVector): boolean {
    return this.circumcenter.distance(v) < this.circumcenter.distance(this.a) - 0.0001
  }

  /** 边是否属于该三角形 (无向边相等, Java TTriangle.contains(TEdge)). */
  containsEdge(edge: TEdge): boolean {
    return this.tEdges.some((te) => te.javaEquals(edge))
  }

  /** 顶点是否属于该三角形 (精确相等, Java TTriangle.contains(KVector)). */
  containsVertex(w: KVector): boolean {
    return this.vertices.some((v) => vkey(v) === vkey(w))
  }

  /** Java TTriangle.equals: 顶点集相同 (与顺序无关). */
  javaEquals(other: unknown): boolean {
    if (!(other instanceof TTriangle)) return false
    return this.containsVertex(other.a) && this.containsVertex(other.b) && this.containsVertex(other.c)
  }

  /** Java TTriangle.hashCode = KVector.hashCode(a) + b + c (int 溢出). */
  javaHash(): number {
    return (
      kvectorJavaHash(this.a.x, this.a.y)
      + kvectorJavaHash(this.b.x, this.b.y)
      + kvectorJavaHash(this.c.x, this.c.y)
    ) | 0
  }
}

/**
 * 对点集做 Delaunay 三角剖分.
 * @param vertices 输入点 (须互异)
 * @returns 三角剖分边集合 (Java HashSet<TEdge> 迭代序)
 */
export function triangulate(vertices: KVector[]): JavaHashSet<TEdge> {
  /* 包围盒 */
  let topleftX = Number.POSITIVE_INFINITY
  let topleftY = Number.POSITIVE_INFINITY
  let bottomrightX = Number.NEGATIVE_INFINITY
  let bottomrightY = Number.NEGATIVE_INFINITY
  for (const v of vertices) {
    topleftX = Math.min(topleftX, v.x)
    topleftY = Math.min(topleftY, v.y)
    bottomrightX = Math.max(bottomrightX, v.x)
    bottomrightY = Math.max(bottomrightY, v.y)
  }
  const sizeX = bottomrightX - topleftX
  const sizeY = bottomrightY - topleftY

  // 超级三角形 (wiggleroom 50 保证无顶点贴近边, 避免外接圆过大导致 double 精度问题)
  const wiggleroom = 50
  const sa = new KVector(topleftX - wiggleroom, topleftY - sizeX - wiggleroom)
  const sb = new KVector(topleftX - wiggleroom, bottomrightY + sizeX + wiggleroom)
  const sc = new KVector(bottomrightX + sizeY / 2 + wiggleroom, topleftY + sizeY / 2)
  const superTriangle = new TTriangle(sa, sb, sc)

  // Bowyer-Watson (Java HashSet<TTriangle>)
  const triangulation = new JavaHashSet<TTriangle>()
  triangulation.add(superTriangle)

  for (const vertex of vertices) {
    // 收集外接圆含新顶点的无效三角形
    const invalidTriangles: TTriangle[] = []
    triangulation.forEach((triangle) => {
      if (triangle.inCircumcircle(vertex)) invalidTriangles.push(triangle)
    })

    // 无效三角形的边界边 (不被其它无效三角形共享)
    const boundary: TEdge[] = []
    for (const triangle of invalidTriangles) {
      for (const tEdge of triangle.tEdges) {
        let onBoundary = true
        for (const other of invalidTriangles) {
          if (other !== triangle && other.containsEdge(tEdge)) {
            onBoundary = false
            break
          }
        }
        if (onBoundary) boundary.push(tEdge)
      }
    }

    // 移除无效三角形
    for (const tri of invalidTriangles) triangulation.delete(tri)

    // 用边界重新三角化
    for (const tEdge of boundary) {
      triangulation.add(new TTriangle(vertex, tEdge.u, tEdge.v))
    }
  }

  // 收集边 (Java HashSet<TEdge>) 并移除与超级三角形相连的边
  const tEdges = new JavaHashSet<TEdge>()
  triangulation.forEach((triangle) => {
    for (const te of triangle.tEdges) tEdges.add(te)
  })
  for (const te of tEdges.toArray()) {
    if (superTriangle.containsVertex(te.u) || superTriangle.containsVertex(te.v)) {
      tEdges.delete(te)
    }
  }
  return tEdges
}
