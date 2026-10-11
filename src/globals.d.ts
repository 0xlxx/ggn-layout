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
 * 运行时全局 `process` 的最小类型声明。
 *
 * 源码中的 `process.env.GGN_*` 均为调试开关，发布构建（tsdown define）会把它们
 * 替换成 `undefined` 并消除死分支，因此浏览器 bundle 永远不会真正访问 `process`。
 * 这里只声明库内实际用到的形状（`env` 的字符串索引），避免引入整个 @types/node
 * 而掩盖浏览器不可用的 Node 全局对象。
 */
export {}

declare global {
  const process: {
    env: Record<string, string | undefined>
  }
}
