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
 * ComponentOrderingStrategy (对应 ELK layered components.ComponentOrderingStrategy).
 * 连通分量排序策略: 决定分量按何种顺序排列 (模型序 = 输入元素顺序).
 */
export const ComponentOrderingStrategy = {
  /** 按优先级或尺寸排序 (默认). */
  NONE: 'NONE',
  /** 仅在各自的端口组内按最小节点模型序排序, 防止 ONO 对齐情形. */
  INSIDE_PORT_SIDE_GROUPS: 'INSIDE_PORT_SIDE_GROUPS',
  /** 按最小节点模型序排序 (压缩会破坏该顺序). */
  GROUP_MODEL_ORDER: 'GROUP_MODEL_ORDER',
  /** 不使用分量组, 直接排成分量行 (无子行). */
  MODEL_ORDER: 'MODEL_ORDER',
} as const

export type ComponentOrderingStrategy = typeof ComponentOrderingStrategy[keyof typeof ComponentOrderingStrategy]

/** 全部策略值 (供遍历/校验). */
export const COMPONENT_ORDERING_STRATEGIES: readonly ComponentOrderingStrategy[] = [
  ComponentOrderingStrategy.NONE,
  ComponentOrderingStrategy.INSIDE_PORT_SIDE_GROUPS,
  ComponentOrderingStrategy.GROUP_MODEL_ORDER,
  ComponentOrderingStrategy.MODEL_ORDER,
]
