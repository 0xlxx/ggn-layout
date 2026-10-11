#!/usr/bin/env bun
/**
 * build-demo-compare — 静态并排对比 demo 生成器.
 *
 * 目的: 视觉对比 layout (自研移植) 与 elkjs (官方) 的布局/边路由产出.
 * 渲染层是几十行的简单 SVG 渲染器 (scripts/render-elk.mjs / scripts/render-elkjs.mjs),
 * 边路由完全取自各引擎自身的 bendPoints, 不做任何二次路由。
 *
 * 前置:
 *   bun scripts/render-elk.mjs  --graph <elkt>      # 生成 layout SVG → bench-results/render/
 *   node scripts/render-elkjs.mjs <elkt>            # 生成 elkjs SVG       → bench-results/render-elkjs/
 *
 * 用法:
 *   bun scripts/build-demo-compare.mjs              # 重新生成 demo/index.html
 *
 * 输出: demo/index.html (纯静态, 浏览器直接打开)
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const ELK_DIR = join(import.meta.dirname, '../bench-results/render')
const ELKJS_DIR = join(import.meta.dirname, '../bench-results/render-elkjs')
const OUT = join(import.meta.dirname, '../demo/index.html')

// 图清单: layout SVG 文件名 / elkjs SVG 文件名 / 标题 / 副标题
const GALLERY = [
  {
    layout: 'test-resources_elk-models_examples_hierarchy_hierarchicalEdges.svg',
    elkjs: 'hierarchicalEdges.elkjs.svg',
    title: 'Hierarchical Edges',
    sub: '层级嵌套 · INCLUDE_CHILDREN',
  },
  {
    layout: 'test-resources_elk-models_examples_general_direction.svg',
    elkjs: 'direction.elkjs.svg',
    title: 'Direction',
    sub: '布局方向 · RIGHT',
  },
  {
    layout: 'test-resources_elk-models_examples_general_mixingDirection.svg',
    elkjs: 'mixingDirection.elkjs.svg',
    title: 'Mixing Direction',
    sub: '混合方向 · 子块独立朝向',
  },
  {
    layout: 'ptolemy_hierarchical_pn_blindcommunication_BlindCommunication.svg',
    elkjs: 'pn_blindcommunication_BlindCommunication.elkjs.svg',
    title: 'Blind Communication',
    sub: 'realworld · 51 节点层级图',
  },
  {
    layout: 'ptolemy_flattened_aspect_cartrackingattackmodeling_CarTrackingAttackModeling.svg',
    elkjs: 'aspect_cartrackingattackmodeling_CarTrackingAttackModeling.elkjs.svg',
    title: 'Car Tracking',
    sub: 'realworld · 50 节点扁平图',
  },
  {
    layout: 'ptolemy_flattened_wireless_intersections_Intersections.svg',
    elkjs: 'wireless_intersections_Intersections.elkjs.svg',
    title: 'Intersections',
    sub: 'realworld · 220 节点大图',
  },
]

function statSvg(svg) {
  const rects = (svg.match(/<rect /g) ?? []).length - 1
  const polylines = (svg.match(/<polyline /g) ?? []).length
  return { nodes: rects, edges: Math.floor(polylines / 2) }
}

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const cards = GALLERY.map((g) => {
  const l = readFileSync(join(ELK_DIR, g.layout), 'utf8')
  // elkjs 侧重新着色: 边/节点描边蓝 → 绿, 便于并排视觉区分两个引擎.
  let e = readFileSync(join(ELKJS_DIR, g.elkjs), 'utf8')
  e = e.replace(/stroke="#4a90d9"/g, 'stroke="#10b981"').replace(/stroke="#d97706"/g, 'stroke="#059669"')
  const ls = statSvg(l), es = statSvg(e)
  const aspect = (svg) => {
    const m = svg.match(/viewBox="([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+)"/)
    if (!m) return 1
    const w = parseFloat(m[3]), h = parseFloat(m[4])
    return h > 0 ? w / h : 1
  }
  const lWide = aspect(l) > 3 ? ' wide' : ''
  const eWide = aspect(e) > 3 ? ' wide' : ''
  return `<article class="card">
  <div class="card-head">
    <h3>${esc(g.title)}</h3>
    <span class="badge">并排对比</span>
  </div>
  <p class="card-sub">${esc(g.sub)}</p>
  <div class="pair">
    <div class="fig">
      <div class="fig-label layout">layout</div>
      <div class="fig-body${lWide}">${l}</div>
      <div class="fig-meta">${ls.nodes} 节点 / ${ls.edges} 边</div>
    </div>
    <div class="fig">
      <div class="fig-label elkjs">elkjs</div>
      <div class="fig-body${eWide}">${e}</div>
      <div class="fig-meta">${es.nodes} 节点 / ${es.edges} 边</div>
    </div>
  </div>
</article>`
}).join('\n')

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>layout vs elkjs · 并排对比</title>
<style>
  :root {
    --bg: #0a0e17;
    --panel: #101828;
    --panel-2: #0d1422;
    --line: rgba(148, 163, 184, 0.14);
    --ink: #e5e7eb;
    --ink-dim: #8b98ab;
    --accent: #38bdf8;
    --accent-2: #818cf8;
    --pass: #10b981;
    --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    --sans: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", "Segoe UI", sans-serif;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    background:
      linear-gradient(rgba(148,163,184,0.045) 1px, transparent 1px),
      linear-gradient(90deg, rgba(148,163,184,0.045) 1px, transparent 1px),
      radial-gradient(1200px 600px at 80% -10%, rgba(56,189,248,0.10), transparent 60%),
      var(--bg);
    background-size: 44px 44px, 44px 44px, auto, auto;
    color: var(--ink);
    font-family: var(--sans);
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
  }
  .wrap { max-width: 1280px; margin: 0 auto; padding: 48px 24px 72px; }
  .eyebrow { font-family: var(--mono); font-size: 12px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--accent); margin: 0 0 14px; }
  h1 { font-family: var(--mono); font-size: clamp(26px, 4vw, 40px); line-height: 1.15; margin: 0 0 14px; font-weight: 650; }
  h1 .dim { color: var(--ink-dim); font-weight: 400; }
  .lead { color: var(--ink-dim); max-width: 64ch; margin: 0 0 28px; font-size: 15px; }
  .grid { display: grid; grid-template-columns: 1fr; gap: 28px; }
  .card { background: var(--panel); border: 1px solid var(--line); border-radius: 18px; padding: 20px; }
  .card-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
  .card h3 { font-family: var(--mono); font-size: 16px; margin: 0; font-weight: 650; }
  .card-sub { color: var(--ink-dim); font-size: 12.5px; margin: 6px 0 14px; }
  .badge { font-family: var(--mono); font-size: 11px; padding: 3px 9px; border-radius: 99px; color: var(--accent); background: rgba(56,189,248,0.12); border: 1px solid rgba(56,189,248,0.3); white-space: nowrap; }
  .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  @media (max-width: 900px) { .pair { grid-template-columns: 1fr; } }
  .fig { background: var(--panel-2); border: 1px solid var(--line); border-radius: 12px; overflow: hidden; }
  .fig-label { font-family: var(--mono); font-size: 11px; padding: 7px 12px; border-bottom: 1px solid var(--line); }
  .fig-label.layout { color: #38bdf8; background: rgba(56,189,248,0.07); }
  .fig-label.elkjs { color: #10b981; background: rgba(16,185,129,0.07); }
  .fig-body { background: #fff; padding: 8px; overflow-x: auto; overflow-y: hidden; }
  .fig-body svg { display: block; height: auto; max-width: none; }
  .fig-body.wide svg { width: auto; max-height: 420px; }
  .fig-body:not(.wide) svg { width: 100%; }
  .fig-meta { font-family: var(--mono); font-size: 11px; color: var(--ink-dim); padding: 6px 12px; border-top: 1px solid var(--line); }
  footer { margin-top: 40px; color: var(--ink-dim); font-size: 12px; font-family: var(--mono); border-top: 1px solid var(--line); padding-top: 16px; }
</style>
</head>
<body>
<div class="wrap">
  <p class="eyebrow">layout vs elkjs · 并排对比</p>
  <h1>渲染对比<br><span class="dim">自研移植 vs 官方 elkjs</span></h1>
  <p class="lead">同一模型分别用 layout（自研 TypeScript 移植）和 elkjs（官方）布局。两张图均为各自引擎输出的原始坐标与边路由（bendPoints），不做二次路由——边是否合并完全由引擎决定。</p>
  <div class="grid">
${cards}
  </div>
  <footer>generated by scripts/build-demo-compare.mjs · layout: scripts/render-elk.mjs + scripts/render-elkjs.mjs</footer>
</div>
</body>
</html>
`

mkdirSync(join(import.meta.dirname, '../demo'), { recursive: true })
writeFileSync(OUT, html, 'utf8')
console.log(`已生成 ${OUT} (${(html.length / 1024).toFixed(0)} KB, ${GALLERY.length} 张对比)`)
