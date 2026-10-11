/*
 * Copyright (c) 2026 GGN contributors.
 *
 * This file is part of ggn-layout. It is original work of the GGN project and
 * is made available under the terms of the MIT License.
 *
 * SPDX-License-Identifier: MIT
 * License text: LICENSE.
 */
import { layoutElkJson } from './elk-json.js'
import type { ElkLayoutOptions, LayoutInput, LayoutOutput } from './elk-json.js'
import { LayoutError, LayoutErrorCode } from './errors.js'

/** Result for one input in a sequential batch layout. */
export interface LayoutBatchItem {
  index: number
  ok: boolean
  /** 成功时布局输出；失败时为 undefined. */
  output?: LayoutOutput
  /** 失败时布局错误；成功时为 undefined. */
  error?: LayoutError
}

/** Aggregate result for `layoutJsonBatch`; item order matches input order. */
export interface LayoutBatchResult {
  items: LayoutBatchItem[]
  okCount: number
  errorCount: number
}

/** 把非 LayoutError 异常包装为可诊断的 INTERNAL_ERROR（保留原始 name/message/stack）。 */
function asInternalError(error: unknown, index: number): LayoutError {
  const originalName = error instanceof Error ? error.name : typeof error
  const originalMessage = error instanceof Error ? error.message : String(error)
  const stack = error instanceof Error ? error.stack : undefined
  return new LayoutError(
    LayoutErrorCode.INTERNAL_ERROR,
    `inputs[${index}]`,
    `布局内部错误: ${originalMessage}`,
    { phase: 'batch', details: { originalName, originalMessage, stack } },
  )
}

/**
 * 顺序批量布局多个图，每个输入独立失败隔离。
 *
 * 纯函数：不修改任何输入；顺序稳定；单个图失败不阻断后续图。
 * 批次级取消：`options.control.signal` 已 abort 时停止处理后续输入，
 * 剩余项以 `LayoutErrorCode.ABORTED` 填充（不再启动布局）。
 */
export function layoutJsonBatch(inputs: readonly LayoutInput[], options?: ElkLayoutOptions): LayoutBatchResult {
  const items: LayoutBatchItem[] = []
  let okCount = 0

  for (let index = 0; index < inputs.length; index += 1) {
    if (options?.control?.signal?.aborted) {
      for (let rest = index; rest < inputs.length; rest += 1) {
        items.push({
          index: rest,
          ok: false,
          error: new LayoutError(LayoutErrorCode.ABORTED, `inputs[${rest}]`, '批次因取消信号终止', { phase: 'batch' }),
        })
      }
      break
    }
    try {
      const output = layoutElkJson(inputs[index]!, options) as LayoutOutput
      items.push({ index, ok: true, output })
      okCount += 1
    } catch (error) {
      items.push({ index, ok: false, error: error instanceof LayoutError ? error : asInternalError(error, index) })
    }
  }

  return { items, okCount, errorCount: items.length - okCount }
}
