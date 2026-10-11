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
