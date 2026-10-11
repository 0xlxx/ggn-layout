/**
 * elkt → layout LGraph 构建 (性能基准共享模块).
 *
 * 构建语义与 elkt2test 生成的测试完全一致 (ELK 1:1: LGraph/LNode/LPort/LEdge +
 * nestedGraph + 属性). 供 perf-run.mjs 与 tests/perf/*.bench.ts 复用.
 *
 * 三段成本分离 (避免 elkt 字符串解析噪声污染内核基准):
 *   parse  — elkt 源码 → 中间结构 (parseElkt, 脚本侧, 非内核)
 *   build  — 中间结构 → LGraph (内核侧构建)
 *   layout — LayeredLayoutProvider.layout (内核侧布局)
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { parseElkt } from './elkt2test.mjs'
import { buildLGraphFromParsed } from '../shared/elkgraph-builder.ts'



/** 父索引 → 子索引列表 (与 elkt2test.buildHierarchy 一致). */


/** ELK calcPortSide (RIGHT 方向): 从端口位置推断侧 (elkt 无 ^port.side 时). */


/** ELK 风格: 创建简单边 (对应 ElkGraphUtil.createSimpleEdge). 端口序号已声明时复用.
 * 匿名端口按 ELK LGraphUtil.createPort 语义赋方向默认输出/输入侧 (createPort :433-462),
 * 否则自环隐式端口以 UNDEFINED 进入 SelfLoopType.fromPortSides 会抛 IllegalArgumentException. */


/** 对侧 (PortSide.opposed). */

/**
 * 从 parseElkt 的中间结果构建 LGraph (不含 elkt 字符串解析).
 * @returns {{ graph: LGraph, nodeOf: Map<number, LNode>, nodeCount: number, edgeCount: number, hasHierarchy: boolean, name: string }}
 */


/** 完整链路: elkt 源码 → LGraph (含解析; 端到端场景). */
export function buildLGraphFromElkt(source, name = 'graph') {
  return buildLGraphFromParsed(parseElkt(source), name)
}

/** parseElkt 结果中 Map → plain object (JSON 可序列化). */
function serializeParsed(parsed) {
  return {
    ...parsed,
    nodeProps: Object.fromEntries(parsed.nodeProps),
    hierarchy: Object.fromEntries(parsed.hierarchy),
  }
}

/** plain object → Map (恢复 parseElkt 返回结构). */
function reviveParsed(raw) {
  return {
    ...raw,
    nodeProps: new Map(Object.entries(raw.nodeProps ?? {})),
    hierarchy: new Map(Object.entries(raw.hierarchy ?? {})),
  }
}

/**
 * parseElkt 结果缓存: 避免 --cpu 模式下字符串解析噪声污染 CPU profile.
 * miss 时解析并写缓存, hit 时 JSON.parse 恢复 (快一个量级).
 * @param {string} source elkt 源码
 * @param {string} name 图名 (缓存 key)
 * @param {string} cacheDir 缓存目录 (如 bench-results/cache)
 */
export function parseElktCached(source, name, cacheDir) {
  const safeName = name.replace(/[^A-Za-z0-9_-]/g, '_')
  const cachePath = join(cacheDir, `${safeName}.parsed.json`)
  try {
    const raw = JSON.parse(readFileSync(cachePath, 'utf8'))
    // 完整性校验: 旧版误用 JSON.stringify(Map) 会写入空 nodeProps ({}), 视为无效自动重建.
    if (!raw || typeof raw.nodeProps !== 'object' || raw.nodeProps === null || Object.keys(raw.nodeProps).length === 0) {
      throw new Error('invalid cache (empty nodeProps)')
    }
    return reviveParsed(raw)
  } catch {
    const parsed = parseElkt(source)
    mkdirSync(cacheDir, { recursive: true })
    writeFileSync(cachePath, JSON.stringify(serializeParsed(parsed)), 'utf8')
    return parsed
  }
}

const REALWORLD_DIR = join(import.meta.dirname, '../test-resources/elk-models/realworld')

/** 按 scanRealworld 返回的 name (相对 realworld 的路径, 无 .elkt 后缀) 读取源码. */
export function loadRealworldSource(name) {
  return readFileSync(join(REALWORLD_DIR, name + '.elkt'), 'utf8')
}

const META_CACHE_PATH = join(import.meta.dirname, '../bench-results/cache/realworld-meta.json')

/**
 * 扫描 realworld 图集, 返回 { path, name, nodeCount } 元数据.
 * 元数据缓存到 bench-results/cache/realworld-meta.json, 避免每次扫描对 550 个 elkt
 * 全量 parseElkt (会污染 CPU profile / 拖慢 perf-run 启动).
 * @param {{ limit?: number, subdir?: 'flattened'|'hierarchical'|null, min?: number, max?: number }} [opts]
 */
export function scanRealworld(opts = {}) {
  const { limit = Infinity, subdir = null, min = 0, max = Infinity } = opts
  let allMeta
  try {
    allMeta = JSON.parse(readFileSync(META_CACHE_PATH, 'utf8'))
  } catch {
    const files = []
    const collect = (d) => {
      for (const entry of readdirSync(d, { withFileTypes: true })) {
        const full = join(d, entry.name)
        if (entry.isDirectory()) collect(full)
        else if (entry.name.endsWith('.elkt')) files.push(full)
      }
    }
    collect(REALWORLD_DIR)
    allMeta = files.map((path) => {
      const { nodes } = parseElkt(readFileSync(path, 'utf8'))
      return { path, name: path.replace(REALWORLD_DIR + '/', '').replace(/\.elkt$/, ''), nodeCount: nodes.length }
    })
    mkdirSync(join(import.meta.dirname, '../bench-results/cache'), { recursive: true })
    writeFileSync(META_CACHE_PATH, JSON.stringify(allMeta), 'utf8')
  }
  const filtered = allMeta.filter(m => m.nodeCount >= min && m.nodeCount <= max)
  filtered.sort((a, b) => a.nodeCount - b.nodeCount)
  return filtered.slice(0, limit)
}

// ── ELK JSON 入口: 与 elkjs 同输入, 保证 demo/差分对比两端一致 ──

/** layoutOptions 长键 → elkt 短键.
 * 先反查 OPT_MAP: ggn 长键 → elkt 短键 (别名如 spacing.labelPort → labelPortHorizontal,
 * 保证 buildLGraphFromParsed 按 OPT_MAP 短键应用, 与 parseElkt 路径一致);
 * 查不到 (端口/标签子属性) 再去 org.eclipse.elk./layered. 前缀. */
function shortOptKeys(o) {
  const out = {}
  for (const [k, v] of Object.entries(o)) {
    let short = null
    for (const [ek, m] of Object.entries(OPT_MAP)) if (m.ggn === k) { short = ek; break }
    out[short ?? k.replace(/^org\.eclipse\.elk\./, '').replace(/^layered\./, '')] = v
  }
  return out
}

/**
 * ELK JSON → parseElkt 中间结构 (nodes/edges/hierarchy/graphProps/nodeProps, 键统一短键).
 * 输入: elktToElkJson 输出 (或任何标准 ELK JSON: { id, layoutOptions, children, edges }).
 * id 保持 JSON 原样 (elktToElkJson 为 'N'+原始id), 与 edges 端点引用同体系 → 直接喂 buildLGraphFromParsed.
 */


/** 从 ELK JSON 构建 LGraph (与 elkjs 同输入). 复用 buildLGraphFromParsed 建图逻辑. */

