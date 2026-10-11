/**
 * LShape 与 LGraphElement (对应 ELK graph.LShape / LGraphElement).
 */
import { MapPropertyHolder } from './properties.js'
import type { KVector } from './enums.js'

let nextId = 0

/** 图元素: id + 属性表 (对应 ELK LGraphElement). */
export class LGraphElement extends MapPropertyHolder {
  id = nextId++

  getId(): number {
    return this.id
  }
}

/** 图形元素基类: 位置 + 尺寸 (对应 ELK LShape, 继承 LGraphElement). */
export class LShape extends LGraphElement {
  position: KVector = { x: 0, y: 0 }
  size: KVector = { x: 0, y: 0 }

  getPosition(): KVector {
    return this.position
  }

  getSize(): KVector {
    return this.size
  }
}
