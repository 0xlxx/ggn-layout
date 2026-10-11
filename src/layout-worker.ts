/**
 * layout worker 宿主脚本.
 *
 * 由应用打包为独立 worker 入口:
 *   Vite: import LayoutWorker from 'ggn-layout/layout-worker?worker'
 *   Node (worker_threads): new Worker(new URL('ggn-layout/dist/layout-worker.js', import.meta.url))
 *
 * 导出纯 handler (handleWorkerMessage) 便于单元测试; 浏览器环境自动注册 self.onmessage.
 * 布局在 worker 线程同步执行 (layoutElkJson 纯同步), 阶段进度经 postMessage 透传主线程.
 * 取消语义: 主线程侧终止 worker (见 api/worker.ts), 本文件无需 abort 消息处理.
 */
import { layoutElkJson } from './api/elk-json.js'
import { LayoutError } from './api/errors.js'
import type { LayoutInput, ElkLayoutOptions, LayoutOutput } from './api/elk-json.js'
import type { LayoutWorkerError } from './api/worker.js'
import type { LayoutProgressEvent } from './api/control.js'

type Post = (message: unknown) => void

/** 处理一条来自主线程的消息 (纯函数, 便于注入 fake post). */
export function handleWorkerMessage(message: unknown, post: Post): void {
  if (typeof message !== 'object' || message === null) return
  const msg = message as { type?: string; id?: number }
  if (msg.type !== 'layout' || typeof msg.id !== 'number') return
  const { input, options } = msg as { input: LayoutInput; options?: ElkLayoutOptions }
  try {
    const output = layoutElkJson(input, {
      ...options,
      control: { onProgress: (progress: LayoutProgressEvent) => post({ type: 'progress', id: msg.id!, progress }) },
    })
    post({ type: 'result', id: msg.id, output })
  } catch (e) {
    post({ type: 'error', id: msg.id, error: serializeError(e) })
  }
}

function serializeError(e: unknown): LayoutWorkerError {
  if (e instanceof LayoutError) {
    return {
      code: String(e.code),
      message: e.message,
      path: e.path,
      retryable: e.retryable,
      phase: e.phase,
      details: e.details,
    }
  }
  return { code: 'INTERNAL_ERROR', message: e instanceof Error ? e.message : String(e) }
}

if (typeof self !== 'undefined' && typeof (self as { postMessage?: unknown }).postMessage === 'function') {
  const selfRef = self as unknown as { onmessage: unknown }
  selfRef.onmessage = (event: { data: unknown }): void => {
    handleWorkerMessage(event.data, (m) => (self as unknown as { postMessage: (m: unknown) => void }).postMessage(m))
  }
}

export type { LayoutInput, ElkLayoutOptions, LayoutOutput }
