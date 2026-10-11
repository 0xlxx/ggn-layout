/**
 * layout Web Worker 客户端 (布局算法在后台线程执行, 不阻塞主线程).
 *
 * 用法 (Vite 应用):
 *   import LayoutWorker from '@ggn/layout/layout-worker?worker'
 *   const client = createLayoutWorker(() => new LayoutWorker())
 *   const out = await client.layout(input, { direction: 'RIGHT' })
 *
 * 设计:
 *  - 库只提供「宿主脚本 (layout-worker) + 客户端封装」, worker 的创建/打包交给应用
 *    (Vite ?worker / ?worker&url 均可), 避免库内自引用 worker 的构建耦合.
 *  - 消息协议基于 requestId, 支持并发多个 layout; progress 阶段进度透传;
 *    发送前剥离 control (AbortSignal/回调函数不可结构化克隆, 宿主侧会重建).
 *  - 取消 = 终止 worker 线程 (布局是同步纯函数, abort 消息必然排在 layout 消息之后,
 *    无法到达; terminate 是唯一即时生效的手段). 传入工厂函数时, 取消后自动重建 worker,
 *    后续请求继续可用; 传入实例时, 取消后 client 失效 (后续请求 reject).
 */
import { LayoutError, LayoutErrorCode } from './errors.js'
import type { LayoutInput, ElkLayoutOptions, LayoutOutput } from './elk-json.js'
import type { LayoutControl, LayoutProgressEvent } from './control.js'

/** worker 可 postMessage 的最小接口 (兼容浏览器 Worker 与 node worker_threads). */
export interface WorkerLike {
  postMessage(message: unknown): void
  addEventListener?(type: 'message', listener: (event: { data: unknown }) => void): void
  removeEventListener?(type: 'message', listener: (event: { data: unknown }) => void): void
  /** node worker_threads Worker 用 on/off (EventEmitter 风格). */
  on?(type: 'message', listener: (value: unknown) => void): void
  off?(type: 'message', listener: (value: unknown) => void): void
  terminate?(): void
}

/** 统一绑定/解绑消息监听 (DOM addEventListener 或 EventEmitter on). */
function attachMessage(w: WorkerLike, listener: (event: { data: unknown }) => void): () => void {
  if (w.addEventListener) {
    w.addEventListener('message', listener)
    return () => w.removeEventListener?.('message', listener)
  }
  const wrapped = (value: unknown): void => listener({ data: value })
  w.on?.('message', wrapped)
  return () => w.off?.('message', wrapped)
}

/** worker 创建工厂 (支持取消后自动重建). */
export type WorkerFactory = () => WorkerLike

/** 跨线程错误契约 (对齐 LayoutError 结构, 序列化自宿主的 serializeError). */
export interface LayoutWorkerError {
  code: string
  message: string
  path?: string
  retryable?: boolean
  phase?: string
  details?: unknown
}

/** 主线程 → worker (注意: control 不跨线程, 见 createLayoutWorker 文档). */
export type LayoutWorkerRequest = {
  type: 'layout'
  id: number
  input: LayoutInput
  options?: Omit<ElkLayoutOptions, 'control'>
}

/** worker → 主线程. */
export type LayoutWorkerResponse =
  | { type: 'result'; id: number; output: LayoutOutput }
  | { type: 'error'; id: number; error: LayoutWorkerError }
  | { type: 'progress'; id: number; progress: LayoutProgressEvent }

/** 异步布局客户端. */
export interface LayoutWorkerClient {
  /** 在 worker 线程执行布局; control.signal 触发取消 (终止并重建 worker), onProgress 透传阶段进度. */
  layout(input: LayoutInput, options?: ElkLayoutOptions & { control?: LayoutControl }): Promise<LayoutOutput>
  /** 终止底层 worker (未完成请求全部 reject). 之后 client 不可再用. */
  dispose(): void
}

const ABORT_MESSAGE = '布局已中止 (LayoutControl.signal)'
const KILLED_MESSAGE = 'worker 已终止 (另一个请求被取消或 client dispose)'

export function createLayoutWorker(workerOrFactory: WorkerLike | WorkerFactory): LayoutWorkerClient {
  interface Pending {
    resolve: (out: LayoutOutput) => void
    reject: (err: Error) => void
    control?: LayoutControl
    cleanup?: () => void
  }
  let worker: WorkerLike | null = typeof workerOrFactory === 'function' ? null : workerOrFactory
  const factory = typeof workerOrFactory === 'function' ? workerOrFactory : null
  let disposed = false
  let nextId = 1
  let detachMessage = (): void => {}
  const pending = new Map<number, Pending>()

  const ensureWorker = (): WorkerLike => {
    if (worker === null) {
      if (factory === null) throw new Error('LayoutWorkerClient 已 dispose')
      worker = factory()
      detachMessage = attachMessage(worker, onMessage)
    }
    return worker
  }

  const onMessage = (event: { data: unknown }): void => {
    const msg = event.data as {
      type?: string
      id?: number
      output?: LayoutOutput
      error?: LayoutWorkerError
      progress?: LayoutProgressEvent
    }
    if (typeof msg !== 'object' || msg === null || typeof msg.id !== 'number') return
    const id = msg.id
    const p = pending.get(id)
    if (!p) return
    switch (msg.type) {
      case 'result':
        pending.delete(id)
        p.cleanup?.()
        p.resolve(msg.output!)
        break
      case 'error':
        pending.delete(id)
        p.cleanup?.()
        p.reject(new LayoutErrorImpl(msg.error!))
        break
      case 'progress':
        // 不清除 abort listener: progress 可能先于 result, 取消契约在布局完成前始终有效.
        p.control?.onProgress?.(msg.progress!)
        break
      default:
        // 协议不匹配 (宿主版本过旧/未知类型): 防悬挂.
        pending.delete(id)
        p.cleanup?.()
        p.reject(new Error(`未知 worker 响应类型: ${String(msg.type)}`))
    }
  }

  /** 终止当前 worker; abortId 的请求 reject 为「已中止」, 其余 reject 为「worker 已终止」. */
  const kill = (abortId: number | null, abortErr: Error): void => {
    if (worker !== null) {
      detachMessage()
      worker.terminate?.()
      worker = null
    }
    if (abortId !== null) {
      const p = pending.get(abortId)
      if (p) {
        pending.delete(abortId)
        p.cleanup?.()
        p.reject(abortErr)
      }
    }
    for (const p of pending.values()) {
      p.cleanup?.()
      p.reject(new Error(abortId === null ? 'LayoutWorkerClient disposed' : KILLED_MESSAGE))
    }
    pending.clear()
  }

  if (worker !== null) detachMessage = attachMessage(worker, onMessage)

  return {
    layout(input, options) {
      return new Promise<LayoutOutput>((resolve, reject) => {
        if (disposed) {
          reject(new Error('LayoutWorkerClient 已 dispose'))
          return
        }
        if (options?.control?.signal?.aborted) {
          reject(new Error(ABORT_MESSAGE))
          return
        }
        let w: WorkerLike
        try {
          w = ensureWorker()
        } catch (e) {
          reject(e as Error)
          return
        }
        const id = nextId++
        // control 不跨线程: 剥离后再 postMessage (AbortSignal/回调不可结构化克隆,
        // 且宿主侧本就自建 control). signal 仅用于主线程侧取消 (kill worker).
        const { control, ...rest } = options ?? {}
        const entry: Pending = { resolve, reject, control }
        if (control?.signal) {
          const onAbort = (): void => kill(id, new Error(ABORT_MESSAGE))
          control.signal.addEventListener('abort', onAbort, { once: true })
          entry.cleanup = () => control.signal!.removeEventListener('abort', onAbort)
        }
        pending.set(id, entry)
        try {
          w.postMessage({ type: 'layout', id, input, options: rest })
        } catch (e) {
          pending.delete(id)
          entry.cleanup?.()
          reject(e as Error)
        }
      })
    },
    dispose() {
      if (disposed) return
      disposed = true
      kill(null, new Error('LayoutWorkerClient disposed'))
    },
  }
}

/** 跨线程还原的 LayoutError (对齐同步 API 的错误契约: instanceof LayoutError + 结构化字段). */
class LayoutErrorImpl extends LayoutError {
  constructor(err: LayoutWorkerError) {
    super(
      (err.code as LayoutErrorCode) ?? LayoutErrorCode.INVALID_INPUT,
      err.path ?? 'root',
      err.message,
      { phase: err.phase, details: err.details },
    )
    // 宿主 message 已是完整文本 (含 code/path 前缀, 与同步 API 同构); 覆盖构造器拼接结果,
    // 避免二次拼接产生重复前缀.
    this.message = err.message
    // LayoutError 构造器固定 retryable=false; 跨线程携带的 retryable 需还原.
    ;(this as { retryable: boolean }).retryable = err.retryable ?? false
  }
}
