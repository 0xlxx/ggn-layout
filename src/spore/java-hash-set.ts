/**
 * Java HashSet/HashMap 迭代序模拟 — spore 坐标全等的关键.
 *
 * ELK 里 graph.tEdges 是 java.util.HashSet<TEdge>; NaiveMinST 对它做稳定排序,
 * 同权边按 HashSet 迭代序取第一条 → 迭代序直接影响生成树 → 最终坐标.
 * Java HashSet 迭代序 = 桶序 (hash 经 HashMap.hash 扩散后 & (capacity-1)) + 桶内插入序,
 * 容量 16 起, 0.75 负载因子扩容 (×2 全量 rehash).
 *
 * 本模块提供:
 * - javaDoubleHash / javaIntReverse / kvectorJavaHash: Java Double/KVector hashCode 语义.
 * - JavaHashSet<T>: 带 equals/javaHash 的集合, 迭代序与 Java HashSet 一致.
 * - JavaHashMap<K,V>: 同构 (spore 未直接用, 保留对称实现给未来移植).
 */

/** Java Double.hashCode: (int)(doubleToLongBits ^ (doubleToLongBits >>> 32)). */
const _buf = new ArrayBuffer(8)
const _dv = new DataView(_buf)
export function javaDoubleHash(d: number): number {
  _dv.setFloat64(0, d, false)
  const hi = _dv.getUint32(0, false)
  const lo = _dv.getUint32(4, false)
  return (hi ^ lo) | 0
}

/** Java Integer.reverse (32 位逐位反转). */
export function javaIntReverse(i: number): number {
  let x = i | 0
  x = (((x & 0x55555555) << 1) | ((x >>> 1) & 0x55555555)) | 0
  x = (((x & 0x33333333) << 2) | ((x >>> 2) & 0x33333333)) | 0
  x = (((x & 0x0f0f0f0f) << 4) | ((x >>> 4) & 0x0f0f0f0f)) | 0
  x = (((x & 0x00ff00ff) << 8) | ((x >>> 8) & 0x00ff00ff)) | 0
  return ((x << 16) | (x >>> 16)) | 0
}

/** Java KVector.hashCode (Double.hashCode(x) + Integer.reverse(Double.hashCode(y)), int 溢出). */
export function kvectorJavaHash(x: number, y: number): number {
  return (javaDoubleHash(x) + javaIntReverse(javaDoubleHash(y))) | 0
}

/** Java HashMap.hash 扩散. */
function spread(h: number): number {
  return (h ^ (h >>> 16)) | 0
}

/** 需支持 Java 相等/hash 语义的元素. */
export interface JavaHashable {
  /** Java hashCode() (int). */
  javaHash(): number
  /** Java equals(). */
  javaEquals(other: unknown): boolean
}

const DEFAULT_CAPACITY = 16
const LOAD_FACTOR = 0.75

/** 迭代序与 Java HashSet 一致的集合. */
export class JavaHashSet<T extends JavaHashable> implements Iterable<T> {
  private buckets: T[][] = Array.from({ length: DEFAULT_CAPACITY }, () => [])
  private capacity = DEFAULT_CAPACITY
  private threshold = Math.floor(DEFAULT_CAPACITY * LOAD_FACTOR)
  size = 0

  add(item: T): boolean {
    const hash = spread(item.javaHash())
    const idx = hash & (this.capacity - 1)
    const bucket = this.buckets[idx]!
    for (const e of bucket) if (e.javaEquals(item)) return false
    bucket.push(item)
    this.size++
    if (this.size > this.threshold) this.resize(this.capacity * 2)
    return true
  }

  addAll(items: Iterable<T>): void {
    for (const it of items) this.add(it)
  }

  has(item: T): boolean {
    const hash = spread(item.javaHash())
    const bucket = this.buckets[hash & (this.capacity - 1)]!
    for (let i = 0; i < bucket.length; i++) {
      if (bucket[i]!.javaEquals(item)) return true
    }
    return false
  }

  delete(item: T): boolean {
    const hash = spread(item.javaHash())
    const idx = hash & (this.capacity - 1)
    const bucket = this.buckets[idx]!
    for (let i = 0; i < bucket.length; i++) {
      if (bucket[i]!.javaEquals(item)) {
        bucket.splice(i, 1)
        this.size--
        return true
      }
    }
    return false
  }

  clear(): void {
    this.buckets = Array.from({ length: DEFAULT_CAPACITY }, () => [])
    this.capacity = DEFAULT_CAPACITY
    this.threshold = Math.floor(DEFAULT_CAPACITY * LOAD_FACTOR)
    this.size = 0
  }

  private resize(newCapacity: number): void {
    const oldBuckets = this.buckets
    this.capacity = newCapacity
    this.threshold = Math.floor(newCapacity * LOAD_FACTOR)
    this.buckets = Array.from({ length: newCapacity }, () => [])
    for (const bucket of oldBuckets) {
      for (const item of bucket) {
        const idx = spread(item.javaHash()) & (newCapacity - 1)
        this.buckets[idx]!.push(item)
      }
    }
  }

  *[Symbol.iterator](): Iterator<T> {
    for (const bucket of this.buckets) {
      for (const item of bucket) yield item
    }
  }

  toArray(): T[] {
    const result: T[] = []
    for (const bucket of this.buckets) {
      for (let i = 0; i < bucket.length; i++) result.push(bucket[i]!)
    }
    return result
  }

  /** 与迭代器同序的顺序遍历快路径 (避免 generator 恢复开销). */
  forEach(visitor: (item: T) => void): void {
    for (const bucket of this.buckets) {
      for (let i = 0; i < bucket.length; i++) visitor(bucket[i]!)
    }
  }
}

/** 与 Java HashSet 同构的 Map (迭代序一致). */
export class JavaHashMap<K extends JavaHashable, V> implements Iterable<[K, V]> {
  private buckets: [K, V][][] = Array.from({ length: DEFAULT_CAPACITY }, () => [])
  private capacity = DEFAULT_CAPACITY
  private threshold = Math.floor(DEFAULT_CAPACITY * LOAD_FACTOR)
  size = 0

  set(key: K, value: V): void {
    const hash = spread(key.javaHash())
    const idx = hash & (this.capacity - 1)
    const bucket = this.buckets[idx]!
    for (let i = 0; i < bucket.length; i++) {
      if (bucket[i]![0].javaEquals(key)) {
        bucket[i] = [key, value]
        return
      }
    }
    bucket.push([key, value])
    this.size++
    if (this.size > this.threshold) this.resize(this.capacity * 2)
  }

  get(key: K): V | undefined {
    const hash = spread(key.javaHash())
    const bucket = this.buckets[hash & (this.capacity - 1)]!
    for (const [k, v] of bucket) if (k.javaEquals(key)) return v
    return undefined
  }

  has(key: K): boolean {
    return this.get(key) !== undefined
  }

  private resize(newCapacity: number): void {
    const oldBuckets = this.buckets
    this.capacity = newCapacity
    this.threshold = Math.floor(newCapacity * LOAD_FACTOR)
    this.buckets = Array.from({ length: newCapacity }, () => [])
    for (const bucket of oldBuckets) {
      for (const entry of bucket) {
        const idx = spread(entry[0].javaHash()) & (newCapacity - 1)
        this.buckets[idx]!.push(entry)
      }
    }
  }

  *[Symbol.iterator](): Iterator<[K, V]> {
    for (const bucket of this.buckets) {
      for (const entry of bucket) yield entry
    }
  }
}
