#!/usr/bin/env bun
/**
 * build-demo-elkjs — 基于 elkjs 渲染的 demo 页生成器.
 *
 * 与 build-demo.mjs 的区别: 边路由直接取自 elkjs 的 sections/bendPoints,
 * 由 scripts/render-elkjs.mjs 渲染成 SVG。因此边合并 (trunk) 与 ELK 官方一致。
 *
 * 用法:
 *   node scripts/render-elkjs.mjs <model> ...   # 先生成 SVG (或直接跑本脚本内部调用)
 *   bun scripts/build-demo-elkjs.mjs            # 重新生成 demo/index.html
 *
 * 输出: demo/index.html (纯静态, 浏览器直接打开)
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const RENDER_DIR = join(import.meta.dirname, '../bench-results/render-elkjs')
const OUT = join(import.meta.dirname, '../demo/index.html')

// 图清单: 渲染文件名前缀 / 标题 / 副标题 / 测试状态
const GALLERY = [
  {
    file: 'hierarchicalEdges.elkjs.svg',
    title: 'Hierarchical Edges',
    subtitle: '层级嵌套 · INCLUDE_CHILDREN',
    status: 'passed',
    note: 'elkjs 渲染',
  },
  {
    file: 'direction.elkjs.svg',
    title: 'Direction',
    subtitle: '布局方向 · RIGHT',
    status: 'passed',
    note: 'elkjs 渲染',
  },
  {
    file: 'mixingDirection.elkjs.svg',
    title: 'Mixing Direction',
    subtitle: '混合方向 · 子块独立朝向',
    status: 'passed',
    note: 'elkjs 渲染',
  },
  {
    file: 'pn_blindcommunication_BlindCommunication.elkjs.svg',
    title: 'Blind Communication',
    subtitle: 'realworld · 51 节点层级图',
    status: 'passed',
    note: 'elkjs 渲染',
  },
  {
    file: 'aspect_cartrackingattackmodeling_CarTrackingAttackModeling.elkjs.svg',
    title: 'Car Tracking',
    subtitle: 'realworld · 50 节点扁平图',
    status: 'passed',
    note: 'elkjs 渲染',
  },
  {
    file: 'wireless_intersections_Intersections.elkjs.svg',
    title: 'Intersections',
    subtitle: 'realworld · 220 节点大图',
    status: 'passed',
    note: 'elkjs 渲染',
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
  const svg = readFileSync(join(RENDER_DIR, g.file), 'utf8')
  const { nodes, edges } = statSvg(svg)
  const badge = `<span class="badge badge-pass">✓ ${esc(g.note)}</span>`
  return `<article class="card">
  <div class="card-head">
    <h3>${esc(g.title)}</h3>
    ${badge}
  </div>
  <p class="card-sub">${esc(g.subtitle)}</p>
  <div class="card-fig">${svg}</div>
  <div class="card-meta">
    <span>${nodes} 节点</span><span>${edges} 边</span>
  </div>
</article>`
}).join('\n')

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>layout · elkjs 渲染预览</title>
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
    --wip: #f59e0b;
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
      radial-gradient(900px 500px at -10% 20%, rgba(129,140,248,0.08), transparent 55%),
      var(--bg);
    background-size: 44px 44px, 44px 44px, auto, auto, auto;
    color: var(--ink);
    font-family: var(--sans);
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
  }
  .wrap { max-width: 1180px; margin: 0 auto; padding: 48px 24px 72px; }

  /* Hero */
  header.hero { display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 40px; align-items: center; margin-bottom: 48px; }
  .eyebrow {
    font-family: var(--mono); font-size: 12px; letter-spacing: 0.18em; text-transform: uppercase;
    color: var(--accent); margin: 0 0 14px;
  }
  h1 { font-family: var(--mono); font-size: clamp(28px, 4vw, 44px); line-height: 1.15; margin: 0 0 16px; font-weight: 650; letter-spacing: -0.02em; }
  h1 .dim { color: var(--ink-dim); font-weight: 400; }
  .hero p.lead { color: var(--ink-dim); max-width: 46ch; margin: 0 0 22px; font-size: 15px; }
  .stats { display: flex; gap: 26px; font-family: var(--mono); }
  .stat .num { font-size: 26px; font-weight: 650; color: var(--ink); }
  .stat .num em { font-style: normal; color: var(--accent); }
  .stat .lbl { font-size: 11px; color: var(--ink-dim); letter-spacing: 0.08em; text-transform: uppercase; }
  .hero-fig {
    background: var(--panel); border: 1px solid var(--line); border-radius: 18px; padding: 14px;
    box-shadow: 0 24px 60px rgba(0,0,0,0.45);
  }
  .hero-fig svg { display: block; width: 100%; height: auto; border-radius: 10px; }
  .hero-fig figcaption { font-family: var(--mono); font-size: 11px; color: var(--ink-dim); margin-top: 10px; text-align: right; }

  /* Legend */
  .legend { display: flex; flex-wrap: wrap; gap: 18px; padding: 14px 18px; border: 1px solid var(--line); border-radius: 12px; background: var(--panel-2); margin-bottom: 36px; font-size: 13px; color: var(--ink-dim); }
  .legend .sw { display: inline-block; width: 12px; height: 12px; border-radius: 3px; margin-right: 7px; vertical-align: -1px; border: 1px solid rgba(0,0,0,0.12); }
  .legend b { color: var(--ink); font-weight: 600; }

  /* Grid */
  .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 22px; }
  @media (max-width: 860px) { .grid { grid-template-columns: 1fr; } header.hero { grid-template-columns: 1fr; } }
  .card {
    background: var(--panel); border: 1px solid var(--line); border-radius: 18px; padding: 20px;
    transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
  }
  .card:hover { transform: translateY(-4px); box-shadow: 0 18px 44px rgba(0,0,0,0.4); border-color: rgba(56,189,248,0.35); }
  .card-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
  .card h3 { font-family: var(--mono); font-size: 16px; margin: 0; font-weight: 650; }
  .card-sub { color: var(--ink-dim); font-size: 12.5px; margin: 6px 0 14px; }
  .badge { font-family: var(--mono); font-size: 11px; padding: 3px 9px; border-radius: 99px; white-space: nowrap; }
  .badge-pass { color: var(--pass); background: rgba(16,185,129,0.12); border: 1px solid rgba(16,185,129,0.3); }
  .badge-wip { color: var(--wip); background: rgba(245,158,11,0.10); border: 1px solid rgba(245,158,11,0.28); }
  .card-fig { background: #fff; border-radius: 10px; padding: 6px; overflow: hidden; }
  .card-fig svg { display: block; width: 100%; height: auto; transition: transform 0.3s ease; }
  .card:hover .card-fig svg { transform: scale(1.02); }
  .card-meta { display: flex; gap: 16px; margin-top: 12px; font-family: var(--mono); font-size: 11.5px; color: var(--ink-dim); }
  .card-meta span::before { content: "▸ "; color: var(--accent); }

  footer { margin-top: 48px; color: var(--ink-dim); font-size: 12px; font-family: var(--mono); border-top: 1px solid var(--line); padding-top: 18px; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
  @media (prefers-reduced-motion: reduce) { * { transition: none !important; } .card:hover { transform: none; } }
</style>
</head>
<body>
<div class="wrap">

  <header class="hero">
    <div>
      <p class="eyebrow">elkjs · 官方布局引擎</p>
      <h1>layout<br><span class="dim">elkjs 渲染预览</span></h1>
      <p class="lead">直接用官方 elkjs 布局 (layered)，边路由取 elkjs sections/bendPoints 渲染。trunk 合并与 ELK 官方一致，无自研路由偏差。</p>
      <div class="stats">
        <div class="stat"><div class="num"><em>6</em>/6</div><div class="lbl">elkjs 渲染图</div></div>
        <div class="stat"><div class="num">100%</div><div class="lbl">边路由来自 elkjs</div></div>
        <div class="stat"><div class="num">0</div><div class="lbl">自研路由偏差</div></div>
      </div>
    </div>
    <figure class="hero-fig">
      ${readFileSync(join(RENDER_DIR, GALLERY[5].file), 'utf8')}
      <figcaption>220 节点 realworld 图 · elkjs 官方布局</figcaption>
    </figure>
  </header>

  <div class="legend">
    <span><span class="sw" style="background:#e8f4fd;border-color:#4a90d9"></span><b>普通节点</b></span>
    <span><span class="sw" style="background:#fef3c7;border-color:#d97706"></span><b>容器节点</b>（compound）</span>
    <span><span class="sw" style="background:transparent;border-color:#4a90d9"></span><b>有向边</b>（elkjs sections 正交路由）</span>
    <span style="margin-left:auto">渲染: <b>elkjs layout 输出</b> · 世界坐标投影</span>
  </div>

  <div class="grid">
${cards}
  </div>

  <footer>
    <span>generated by scripts/build-demo-elkjs.mjs</span>
    <span>render: scripts/render-elkjs.mjs · layout: elkjs (official)</span>
  </footer>

</div>
</body>
</html>
`

mkdirSync(join(import.meta.dirname, '../demo'), { recursive: true })
writeFileSync(OUT, html, 'utf8')
console.log(`已生成 ${OUT} (${(html.length / 1024).toFixed(0)} KB, ${GALLERY.length} 张图)`)
