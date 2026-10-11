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
 * 节点比较器 (ELK alg.vertiflex p2relative.NodeComparator).
 *
 * 按 y 坐标排序, 相等时按模型序 (NODE_MODEL_ORDER, 越小越靠前); invert=true
 * 时 y 降序 (模型序仍升序). Java TimSort 稳定排序, JS Array.sort 同为稳定.
 */
import type { ElkNode } from '../../api/elk-json.js'
import type { InternalProperties } from '../internal-properties.js'

/** Java Double.compare: -0.0 < 0.0; NaN 不出现于布局坐标, 简化为 0 处理. */
function doubleCompare(a: number, b: number): number {
  if (a < b) return -1
  if (a > b) return 1
  if (a === 0 && b === 0) {
    if (1 / a < 1 / b) return -1
    if (1 / a > 1 / b) return 1
  }
  return 0
}

export class NodeComparator {
  private invert = false

  /** 默认构造. */
  constructor()
  /** 反转比较器构造. */
  constructor(invert: boolean)
  constructor(invert = false) {
    this.invert = invert
  }

  compare(a: ElkNode, b: ElkNode, props: InternalProperties): number {
    let sortYresult: number
    if (!this.invert) {
      sortYresult = doubleCompare(a.y ?? 0, b.y ?? 0)
    } else {
      sortYresult = doubleCompare(b.y ?? 0, a.y ?? 0)
    }
    if (sortYresult === 0) {
      return props.getNodeModelOrder(a) - props.getNodeModelOrder(b)
    } else {
      return sortYresult
    }
  }
}
