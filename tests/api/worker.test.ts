/**
 * worker 版本协议测试: 客户端 (createLayoutWorker) × 宿主 (handleWorkerMessage) 配对.
 *
 * fake worker 模拟真实异步 (queueMicrotask + 结构化克隆不做——但发送消息内容的
 * 可克隆性由「剥离 control」用例显式验证) 与真实行为 (terminate 后丢弃消息).
 *
 * 覆盖: 正常布局 / 错误还原 (含 path/retryable) / 并发 / progress / 取消 (terminate +
 * 工厂重建) / dispose / control 剥离 / postMessage 抛错清理 / 未知响应防悬挂 / 宿主防御.
 */
import { describe, expect, it } from 'vitest'
import { createLayoutWorker, type WorkerLike } from '../../src/api/worker.js'
import { handleWorkerMessage } from '../../src/layout-worker.js'

interface FakeWorker {
  worker: WorkerLike
  emit: (data: unknown) => void
  delivered: () => unknown[]
}

/** 宿主 handler 直连 client: postMessage 双向转发 (queueMicrotask 模拟异步; result 可延迟). */
function makeFakeWorker(handler: (msg: unknown, post: (m: unknown) => void) => void, opts: { resultDelayMs?: number } = {}): FakeWorker {
  const listeners: ((e: { data: unknown }) => void)[] = []
  const delivered: unknown[] = []
  let terminated = false
  return {
    emit(data) {
      for (const l of [...listeners]) l({ data })
    },
    delivered: () => delivered,
    worker: {
      postMessage(msg) {
        if (terminated) return
        delivered.push(msg)
        queueMicrotask(() => handler(msg, (resp) => {
          if (terminated) return
          const deliver = (): void => {
            if (terminated) return
            for (const l of listeners) l({ data: resp })
          }
          if ((resp as { type?: string }).type === 'result' && opts.resultDelayMs !== undefined) {
            setTimeout(deliver, opts.resultDelayMs)
          } else {
            deliver()
          }
        }))
      },
      addEventListener(_type, listener) {
        listeners.push(listener)
      },
      removeEventListener(_type, listener) {
        const i = listeners.indexOf(listener)
        if (i !== -1) listeners.splice(i, 1)
      },
      terminate() {
        terminated = true
        listeners.length = 0
      },
    },
  }
}

const SIMPLE_GRAPH = {
  id: 'root',
  children: [
    { id: 'a', width: 30, height: 30 },
    { id: 'b', width: 30, height: 30 },
  ],
  edges: [{ id: 'e1', sources: ['a'], targets: ['b'] }],
}

describe('layout worker 协议', () => {
  it('正常布局: result 返回完整输出', async () => {
    const client = createLayoutWorker(makeFakeWorker(handleWorkerMessage).worker)
    const out = await client.layout(SIMPLE_GRAPH, { direction: 'RIGHT' })
    expect(out.id).toBe('root')
    expect(out.children!.length).toBe(2)
    const ax = out.children!.find((c) => c.id === 'a')!.x!
    const bx = out.children!.find((c) => c.id === 'b')!.x!
    expect(ax).toBeLessThan(bx)
    expect(out.edges![0]!.sections![0]!.startPoint).toBeTruthy()
  })

  it('错误: LayoutError 结构化还原 (instanceof + code + path + retryable + message 无重复前缀)', async () => {
    const client = createLayoutWorker(makeFakeWorker(handleWorkerMessage).worker)
    const err = await client.layout({ id: '' }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(Error)
    expect((err as { name: string }).name).toBe('LayoutError')
    expect(err).toMatchObject({ code: 'INVALID_INPUT' })
    expect(typeof (err as { path?: string }).path).toBe('string')
    // message 与同步 API 完全一致 (含既有 2 层前缀, 无 worker 叠前缀回归)
    const msg = (err as { message: string }).message
    expect(msg).toBe('INVALID_INPUT at root: INVALID_INPUT at root: root input must have a non-empty string id')
  })

  it('并发请求: 独立 resolve, requestId 递增', async () => {
    const f = makeFakeWorker(handleWorkerMessage)
    const client = createLayoutWorker(f.worker)
    const [o1, o2] = await Promise.all([
      client.layout(SIMPLE_GRAPH, { direction: 'RIGHT' }),
      client.layout(SIMPLE_GRAPH, { direction: 'LEFT' }),
    ])
    expect(o1.children!.length).toBe(2)
    expect(o2.children!.length).toBe(2)
    const ids = (f.delivered() as { id: number }[]).filter((m) => (m as { type?: string }).type === 'layout').map((m) => m.id)
    expect(ids).toEqual([1, 2])
  })

  it('progress: 阶段进度透传到主线程 control.onProgress', async () => {
    const client = createLayoutWorker(makeFakeWorker(handleWorkerMessage).worker)
    const phases: string[] = []
    await client.layout(SIMPLE_GRAPH, {
      control: { onProgress: (ev) => phases.push(ev.phase) },
    })
    expect(phases.length).toBeGreaterThan(0)
    expect(phases[0]).toBe('validate')
  })

  it('发送的消息不含 control (AbortSignal/回调不可结构化克隆)', async () => {
    const f = makeFakeWorker(handleWorkerMessage)
    const client = createLayoutWorker(f.worker)
    await client.layout(SIMPLE_GRAPH, { control: { onProgress: () => {} } })
    const layoutMsg = f.delivered().find((m) => (m as { type?: string }).type === 'layout') as { options?: Record<string, unknown> }
    expect(layoutMsg.options).not.toHaveProperty('control')
  })

  it('取消: control.signal → terminate worker, 在途请求 reject', async () => {
    const f = makeFakeWorker(handleWorkerMessage)
    const client = createLayoutWorker(f.worker)
    const ac = new AbortController()
    const promise = client.layout(SIMPLE_GRAPH, { control: { signal: ac.signal } })
    ac.abort()
    await expect(promise).rejects.toThrow(/中止/)
    // 取消后布局已完成的消息被丢弃 (terminate 语义), 无后续 resolve 污染
    await new Promise((r) => setTimeout(r, 20))
  })

  it('收到 progress 后再 abort: 取消仍有效 (abort listener 不被 progress 提前移除)', async () => {
    const f = makeFakeWorker(handleWorkerMessage, { resultDelayMs: 50 })
    const client = createLayoutWorker(f.worker)
    const ac = new AbortController()
    let progressSeen = false
    const promise = client.layout(SIMPLE_GRAPH, {
      control: {
        signal: ac.signal,
        onProgress: () => { progressSeen = true },
      },
    })
    // progress 同步到达 (先于延迟的 result) → 布局仍在途
    await new Promise((r) => setTimeout(r, 10))
    expect(progressSeen).toBe(true)
    ac.abort()
    await expect(promise).rejects.toThrow(/中止/)
    // 延迟到达的 result 被 terminate 语义丢弃, 无后续 resolve 污染
    await new Promise((r) => setTimeout(r, 70))
  })

  it('并发取消: 仅触发者收「已中止」, 无辜请求收「worker 已终止」', async () => {
    const f = makeFakeWorker(handleWorkerMessage)
    const client = createLayoutWorker(f.worker)
    const ac = new AbortController()
    const victim = client.layout(SIMPLE_GRAPH)
    const triggered = client.layout(SIMPLE_GRAPH, { control: { signal: ac.signal } })
    ac.abort()
    await expect(triggered).rejects.toThrow(/中止/)
    await expect(victim).rejects.toThrow(/worker 已终止/)
  })

  it('工厂模式: 取消后自动重建 worker, 后续请求可用', async () => {
    let creations = 0
    const client = createLayoutWorker(() => { creations++; return makeFakeWorker(handleWorkerMessage).worker })
    const ac = new AbortController()
    const p1 = client.layout(SIMPLE_GRAPH, { control: { signal: ac.signal } })
    ac.abort()
    await expect(p1).rejects.toThrow(/中止/)
    expect(creations).toBe(1)
    const out = await client.layout(SIMPLE_GRAPH)
    expect(out.children!.length).toBe(2)
    expect(creations).toBe(2)
  })

  it('dispose: 工厂/实例模式均 reject 且不可再用', async () => {
    let creations = 0
    const client = createLayoutWorker(() => { creations++; return makeFakeWorker(handleWorkerMessage).worker })
    const p = client.layout(SIMPLE_GRAPH)
    client.dispose()
    await expect(p).rejects.toThrow(/dispose/)
    await expect(client.layout(SIMPLE_GRAPH)).rejects.toThrow(/dispose/)
    expect(creations).toBe(1) // dispose 后不重建
  })

  it('postMessage 抛错: pending 清理 + reject', async () => {
    const f = makeFakeWorker(handleWorkerMessage)
    f.worker.postMessage = () => { throw new Error('worker dead') }
    const client = createLayoutWorker(f.worker)
    await expect(client.layout(SIMPLE_GRAPH)).rejects.toThrow('worker dead')
  })

  it('未知响应类型: reject 而非永久悬挂', async () => {
    const f = makeFakeWorker(handleWorkerMessage)
    const client = createLayoutWorker(f.worker)
    const promise = client.layout(SIMPLE_GRAPH)
    f.emit({ type: 'bogus', id: 1 })
    await expect(promise).rejects.toThrow(/未知 worker 响应类型/)
  })

  it('未知 id 的响应被丢弃 (不影响在途请求)', async () => {
    const f = makeFakeWorker(handleWorkerMessage)
    const client = createLayoutWorker(f.worker)
    const p1 = client.layout(SIMPLE_GRAPH)
    const p2 = client.layout(SIMPLE_GRAPH)
    f.emit({ type: 'bogus', id: 999 }) // 未知 id: 丢弃
    f.emit({ type: 'result', id: 999, output: { id: 'x' } }) // 未知 id: 丢弃
    const [o1, o2] = await Promise.all([p1, p2])
    expect(o1.children!.length).toBe(2)
    expect(o2.children!.length).toBe(2)
  })

  it('非 layout 消息被宿主静默忽略', () => {
    const posted: unknown[] = []
    handleWorkerMessage({ type: 'unknown', id: 1 }, (m) => posted.push(m))
    handleWorkerMessage('junk', (m) => posted.push(m))
    expect(posted).toEqual([])
  })
})
