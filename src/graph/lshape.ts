/*
 * Copyright (c) 2010, 2015 Kiel University and others.
 * Copyright (c) 2026 GGN contributors.
 *
 * This file is part of ggn-layout, a TypeScript port of the Eclipse Layout
 * Kernel (ELK, https://github.com/eclipse/elk). It is derived from ELK and is
 * made available under the terms of the Eclipse Public License 2.0.
 *
 * SPDX-License-Identifier: EPL-2.0
 * License text: LICENSES/EPL-2.0.txt — see also THIRD_PARTY_NOTICES.md.
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
