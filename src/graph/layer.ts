/**
 * Layer (对应 ELK graph.Layer).
 */
import type { LGraph } from './lgraph.js'
import type { LNode } from './lnode.js'
import type { KVector } from './enums.js'

export class Layer {
  id = 0
  private owner: LGraph | null = null
  private size: KVector = { x: 0, y: 0 }
  private nodes: LNode[] = []

  constructor(graph: LGraph | null = null) {
    // ELK Java: Layer 构造器不自动加入 graph (只保存 owner), 由调用方显式 add.
    this.owner = graph
  }

  getGraph(): LGraph | null {
    return this.owner
  }

  getSize(): KVector {
    return this.size
  }

  getNodes(): LNode[] {
    return this.nodes
  }

  getIndex(): number {
    if (this.owner === null) return -1
    return this.owner.getLayers().indexOf(this)
  }
}
