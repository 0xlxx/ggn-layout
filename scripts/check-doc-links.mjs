#!/usr/bin/env node
/**
 * 随包文档的「包内链接」门禁。
 *
 * 以 `npm pack --dry-run` 的真实打包清单为准（而不是 git 工作树），
 * 确保 npm 用户 / AI agent 在 tarball 里点开的相对链接都能落地。
 * 指向仓库内部（未随包发布）的文件必须改成绝对 URL 或去掉链接。
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const [tarball] = JSON.parse(
  execFileSync('npm', ['pack', '--dry-run', '--json'], { encoding: 'utf8' }),
)
const files = new Set(tarball.files.map((entry) => entry.path))

// 目录链接（如 examples/）也算有效，这里收集所有被打包路径的祖先目录。
const dirs = new Set()
for (const file of files) {
  for (let dir = path.dirname(file); dir !== '.' && dir !== '/'; dir = path.dirname(dir)) {
    dirs.add(dir)
  }
}

const markdown = [...files].filter((file) => file.endsWith('.md'))
const broken = []

for (const file of markdown) {
  const lines = readFileSync(file, 'utf8').split('\n')
  lines.forEach((line, index) => {
    const linkPattern = /\]\(([^)\s]+)\)/g
    let match
    while ((match = linkPattern.exec(line)) !== null) {
      const raw = match[1]
      if (/^(https?:|mailto:|#)/.test(raw)) continue
      const target = raw.split('#')[0]
      if (target === '') continue
      const resolved = path.normalize(path.join(path.dirname(file), target))
      if (files.has(resolved)) continue
      if (dirs.has(resolved.replace(/\/$/, ''))) continue
      broken.push(`${file}:${index + 1}  ->  ${raw}`)
    }
  })
}

if (broken.length > 0) {
  console.error(`✗ 随包文档存在 ${broken.length} 处包内断链：`)
  for (const entry of broken) console.error(`  - ${entry}`)
  console.error('  修法：改成绝对 GitHub URL，或去掉指向仓库内部文件的链接。')
  process.exit(1)
}

console.log(`✓ 随包文档链接检查通过（${markdown.length} 个 markdown 文件，0 处包内断链）`)
