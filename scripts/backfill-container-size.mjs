/**
 * 给 elkt 容器节点补显式 size (默认 60x30).
 *
 * 背景: elkg 容器无尺寸, parseElkt 隐式默认 60x30 (布局等价, 已由 oracle/verify 证明).
 * 本脚本把隐式默认写成 elkt 显式 `layout [ size: 60, 30 ]`, 让 elkt 自包含.
 *
 * 用法: bun scripts/backfill-container-size.mjs [glob]
 *   默认 glob: **\/*.elkt (全部 900)
 * 只补"容器节点" (hierarchy 中有子节点的) 且源码块内无 size/width/height 的.
 * 注: 补完后 parseElkt 输出不变 (60x30 同默认) → hash 不变, oracle 无需重新生成.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { globSync } from 'glob'
import { parseElkt } from './elkt2test.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const MODEL_ROOT = join(ROOT, 'test-resources/elk-models')
const GLOB = process.argv[2] ?? '**/*.elkt'

const files = globSync(join(MODEL_ROOT, GLOB)).sort()
const countBraces = (s) => (s.match(/\{/g) ?? []).length - (s.match(/\}/g) ?? []).length

let totalFiles = 0, totalInserted = 0
for (const f of files) {
  const src = readFileSync(f, 'utf8')
  const graphData = parseElkt(src)
  // 容器 = hierarchy 的 parent (全限定 id)
  const containers = new Set(graphData.hierarchy.keys())
  if (containers.size === 0) continue

  const lines = src.split('\n')
  // 嵌套节点栈: 用全局括号深度跟踪 node 块闭合 (label/port 子块的 } 不弹 node)
  const stack = [] // { name(短名), openDepth }
  const inserts = [] // { lineIdx, indent }
  let depth = 0
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const beforeDepth = depth
    depth += countBraces(line)
    const m = line.match(/^\s*node\s+([\w.-]+)/)
    const isNodeLine = !!m
    if (isNodeLine) {
      const name = m[1]
      const full = stack.length ? stack.map(s => s.name).join('.') + '.' + name : name
      const indent = (line.match(/^\s*/) ?? [''])[0]

      // 检查该节点块内 (到子节点声明前) 是否有 size/width/height
      let braces = countBraces(line)
      let j = i
      let found = /size\s*:\s*[\d.]+\s*,\s*[\d.]+|width\s*:\s*[\d.]+|height\s*:\s*[\d.]+/.test(line)
      while (!found && braces > 0 && j < lines.length - 1) {
        j++
        const t = lines[j]
        // 嵌套子节点声明: 当前节点自身属性在子节点之前 (elkt 惯例) → 停止扫描, 避免子节点 size 误判
        if (/^\s*node\s+[\w.-]+/.test(t) && !/size\s*:\s*[\d.]+\s*,\s*[\d.]+|width\s*:\s*[\d.]+|height\s*:\s*[\d.]+/.test(t)) break
        if (/size\s*:\s*[\d.]+\s*,\s*[\d.]+|width\s*:\s*[\d.]+|height\s*:\s*[\d.]+/.test(t)) found = true
        braces += countBraces(t)
      }
      if (containers.has(full) && !found) {
        // 插入缩进: 优先复用节点块内下一非空行的缩进 (方向示例用 4 空格, realworld 用 tab)
        let refIndent = indent + '\t'
        for (let k = i + 1; k <= j && k < lines.length; k++) {
          const t = lines[k]
          if (t.trim() && !t.trim().startsWith('}')) { refIndent = (t.match(/^\s*/) ?? [''])[0]; break }
        }
        inserts.push({ lineIdx: i, indent: refIndent })
      }
      if (line.includes('{')) stack.push({ name, openDepth: beforeDepth })
    }
    // 全局深度回落到某 node 的 openDepth → 该 node 块已闭合
    while (stack.length && depth <= stack[stack.length - 1].openDepth) stack.pop()
  }

  if (inserts.length > 0) {
    // 从后往前插入, 行号不偏移
    for (const ins of inserts.reverse()) {
      lines.splice(ins.lineIdx + 1, 0, `${ins.indent}layout [ size: 60, 30 ]`)
    }
    writeFileSync(f, lines.join('\n'))
    totalFiles++
    totalInserted += inserts.length
  }
}
console.log(`补全完成: ${totalFiles} 个文件 / ${totalInserted} 处容器补 size`)
console.log(`范围: ${files.length} 个 elkt`)
