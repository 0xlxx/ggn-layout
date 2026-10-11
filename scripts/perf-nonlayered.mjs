#!/usr/bin/env bun
/**
 * 非 layered 算法性能工具（补 perf 覆盖黑洞）。
 *
 * 背景：perf-run.mjs / compare-elkjs-perf.mjs / check:bench 只覆盖 layered；
 * register-all 的 13 个非 layered 算法（box/fixed/random/stress/force/rectpacking/
 * topdownpacking/sporeoverlap/sporecompaction/radial/vertiflex/disco/mrtree）此前零性能数据。
 *
 * 用法:
 *   bun scripts/perf-nonlayered.mjs                      # 全表（各算法一个代表性规模）
 *   bun scripts/perf-nonlayered.mjs --quick              # CI 档：慢算法小规模 / 少 iter / 3 轮中位数
 *   bun scripts/perf-nonlayered.mjs --alg sporeoverlap --nodes 500 --iters 5
 *   bun scripts/perf-nonlayered.mjs --scale sporeoverlap # 规模曲线（观察复杂度）
 *   bun scripts/perf-nonlayered.mjs --quick --json out.json
 *
 * 说明：同进程 warm 后取中位数；结构化输入生成器保证 --nodes 改变规模时仍无悬空边。
 * 跨进程对比才是可信协议。
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { layoutElkJson } from "../src/index.ts";

// ── 参数 ──
const argv = process.argv.slice(2);
const opt = {
  alg: null,
  nodes: null,
  iters: null,
  repeats: null,
  scale: null,
  json: null,
  quick: false,
};
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--alg") opt.alg = argv[++i];
  else if (a === "--nodes") opt.nodes = Number(argv[++i]);
  else if (a === "--iters") opt.iters = Number(argv[++i]);
  else if (a === "--repeats") opt.repeats = Number(argv[++i]);
  else if (a === "--scale") opt.scale = argv[++i];
  else if (a === "--json") opt.json = argv[++i];
  else if (a === "--quick") opt.quick = true;
}

// ── 输入生成器（确定性，无随机源依赖）──
function rng(seed) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}
function tree(n) {
  const children = [];
  for (let i = 0; i < n; i++) children.push({ id: "n" + i, width: 40, height: 30 });
  const edges = [];
  for (let i = 1; i < n; i++)
    edges.push({ id: "e" + i, sources: ["n" + ((i - 1) >> 2)], targets: ["n" + i] });
  return { children, edges };
}
function star(n) {
  const children = [];
  for (let i = 0; i < n; i++) children.push({ id: "n" + i, width: 40, height: 30 });
  const edges = [];
  for (let i = 1; i < n; i++) edges.push({ id: "e" + i, sources: ["n0"], targets: ["n" + i] });
  return { children, edges };
}
function graph(n, E, seed = 12345) {
  const rnd = rng(seed);
  const children = [];
  for (let i = 0; i < n; i++) children.push({ id: "n" + i, width: 40, height: 40 });
  const edges = [];
  for (let i = 0; i < E; i++) {
    const a = Math.floor(rnd() * n),
      b = Math.floor(rnd() * n);
    if (a !== b) edges.push({ id: "e" + i, sources: ["n" + a], targets: ["n" + b] });
  }
  return { children, edges };
}
function rects(n, seed = 999) {
  const rnd = rng(seed);
  const children = [];
  for (let i = 0; i < n; i++)
    children.push({
      id: "n" + i,
      width: 20 + Math.floor(rnd() * 80),
      height: 20 + Math.floor(rnd() * 80),
    });
  return { children };
}
/** 已放置节点（spore 类需要坐标）；spread 控制密度。 */
function placed(n, spread, seed = 777) {
  const rnd = rng(seed);
  const children = [];
  for (let i = 0; i < n; i++)
    children.push({
      id: "n" + i,
      x: Math.floor(rnd() * spread),
      y: Math.floor(rnd() * spread),
      width: 20 + Math.floor(rnd() * 60),
      height: 20 + Math.floor(rnd() * 60),
    });
  return { children };
}
const density = (n) => Math.round(Math.sqrt(n) * 40);

// ── 算法表：id / ELK 算法名 / 输入生成器 / 默认规模 / 默认迭代 / CI quick 档 ──
const ALGS = {
  box: { elk: "org.eclipse.elk.box", make: (n) => rects(n), nodes: 1000, iters: 20 },
  fixed: {
    elk: "org.eclipse.elk.fixed",
    make: (n) => placed(n, density(n)),
    nodes: 1000,
    iters: 20,
  },
  random: { elk: "org.eclipse.elk.random", make: (n) => rects(n), nodes: 1000, iters: 20 },
  rectpacking: { elk: "org.eclipse.elk.rectpacking", make: (n) => rects(n), nodes: 200, iters: 10 },
  topdownpacking: {
    elk: "org.eclipse.elk.topdownpacking",
    make: (n) => rects(n),
    nodes: 200,
    iters: 10,
  },
  sporeoverlap: {
    elk: "org.eclipse.elk.sporeoverlap",
    make: (n) => placed(n, density(n)),
    nodes: 500,
    iters: 3,
  },
  sporecompaction: {
    elk: "org.eclipse.elk.sporecompaction",
    make: (n) => placed(n, density(n)),
    nodes: 500,
    iters: 3,
  },
  radial: { elk: "org.eclipse.elk.radial", make: (n) => star(n), nodes: 500, iters: 10 },
  vertiflex: { elk: "org.eclipse.elk.vertiflex", make: (n) => rects(n), nodes: 200, iters: 10 },
  disco: { elk: "org.eclipse.elk.disco", make: (n) => placed(n, density(n)), nodes: 200, iters: 3 },
  mrtree: { elk: "org.eclipse.elk.mrtree", make: (n) => tree(n), nodes: 2000, iters: 5 },
  stress: { elk: "org.eclipse.elk.stress", make: (n) => graph(n, n * 2), nodes: 200, iters: 3 },
  force: { elk: "org.eclipse.elk.force", make: (n) => graph(n, n * 2), nodes: 200, iters: 3 },
};
const QUICK = {
  box: { nodes: 1000, iters: 30 },
  fixed: { nodes: 1000, iters: 30 },
  random: { nodes: 1000, iters: 30 },
  rectpacking: { nodes: 300, iters: 20 },
  topdownpacking: { nodes: 300, iters: 20 },
  vertiflex: { nodes: 300, iters: 20 },
  radial: { nodes: 500, iters: 15 },
  mrtree: { nodes: 500, iters: 5 },
  sporeoverlap: { nodes: 100, iters: 3 },
  sporecompaction: { nodes: 100, iters: 3 },
  disco: { nodes: 50, iters: 3 },
  stress: { nodes: 60, iters: 3 },
  force: { nodes: 60, iters: 3 },
};
/** 规模曲线：同一密度下的 n 序列（只对有争议的算法开）。 */
const SCALE_N = {
  sporeoverlap: [125, 250, 500],
  sporecompaction: [125, 250, 500],
  disco: [50, 100, 200],
  mrtree: [500, 2000, 5000],
  stress: [100, 200, 400],
  force: [100, 200, 400],
};

function makeInput(alg, body) {
  return {
    id: "root",
    layoutOptions: {
      "org.eclipse.elk.algorithm": ALGS[alg].elk,
      "org.eclipse.elk.randomSeed": "1",
    },
    ...body,
  };
}
function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[sorted.length >> 1];
}
function aggregateMetric(runs, key, minKey, maxKey) {
  const med = median(runs.map((r) => r[key]));
  const cv =
    runs.length > 2
      ? Math.sqrt(runs.reduce((s, r) => s + (r[key] - med) ** 2, 0) / runs.length) / med
      : 0;
  return {
    med,
    cv,
    min: Math.min(...runs.map((r) => r[minKey])),
    max: Math.max(...runs.map((r) => r[maxKey])),
  };
}
function aggregateRuns(runs) {
  const wall = aggregateMetric(runs, "med", "min", "max");
  const cpu = aggregateMetric(runs, "cpuMed", "cpuMin", "cpuMax");
  return {
    ...runs[0],
    med: wall.med,
    min: wall.min,
    max: wall.max,
    cv: wall.cv,
    cpuMed: cpu.med,
    cpuMin: cpu.min,
    cpuMax: cpu.max,
    cpuCv: cpu.cv,
    repeats: runs.length,
  };
}
function timeIt(alg, body, iters, profile) {
  const input = makeInput(alg, body);
  layoutElkJson(structuredClone(input)); // warmup
  const ts = [];
  const cpus = [];
  for (let i = 0; i < iters; i++) {
    const inputCopy = structuredClone(input);
    const cpuStart = process.cpuUsage();
    const t = performance.now();
    layoutElkJson(inputCopy);
    const wallMs = performance.now() - t;
    const usage = process.cpuUsage(cpuStart);
    ts.push(wallMs);
    cpus.push((usage.user + usage.system) / 1000);
  }
  ts.sort((a, b) => a - b);
  cpus.sort((a, b) => a - b);
  const med = ts[ts.length >> 1];
  const cpuMed = cpus[cpus.length >> 1];
  const cv =
    ts.length > 2 ? Math.sqrt(ts.reduce((s, x) => s + (x - med) ** 2, 0) / ts.length) / med : 0;
  const cpuCv =
    cpus.length > 2
      ? Math.sqrt(cpus.reduce((s, x) => s + (x - cpuMed) ** 2, 0) / cpus.length) / cpuMed
      : 0;
  return {
    alg,
    elk: ALGS[alg].elk,
    profile,
    nodes: body.children.length,
    iters,
    med,
    min: ts[0],
    max: ts[ts.length - 1],
    cv,
    cpuMed,
    cpuMin: cpus[0],
    cpuMax: cpus[cpus.length - 1],
    cpuCv,
  };
}

// ── 执行 ──
const results = [];
if (opt.scale) {
  const alg = opt.scale;
  if (!ALGS[alg]) {
    console.error(`未知算法: ${alg}`);
    process.exit(1);
  }
  let prev = null;
  for (const n of SCALE_N[alg] ?? []) {
    const r = timeIt(alg, ALGS[alg].make(n), opt.iters ?? 3, "scale");
    const ratio = prev ? `  ×${(r.med / prev).toFixed(2)} (n 翻倍)` : "";
    console.log(
      `${alg.padEnd(16)} N=${String(n).padStart(5)}  ${r.med.toFixed(1).padStart(9)}ms${ratio}`,
    );
    results.push(r);
    prev = r.med;
  }
} else {
  const names = opt.alg ? [opt.alg] : Object.keys(ALGS);
  for (const alg of names) {
    if (!ALGS[alg]) {
      console.error(`未知算法: ${alg}`);
      process.exit(1);
    }
    const profile = opt.quick ? QUICK[alg] : ALGS[alg];
    const n = opt.nodes ?? profile.nodes;
    const iters = opt.iters ?? profile.iters;
    const repeats = Math.max(1, opt.repeats ?? (opt.quick ? 3 : 1));
    const runs = [];
    for (let repeat = 0; repeat < repeats; repeat++)
      runs.push(timeIt(alg, ALGS[alg].make(n), iters, opt.quick ? "quick" : "full"));
    results.push(aggregateRuns(runs));
  }
}
const mode = opt.scale ? "scale" : opt.quick ? "quick" : "full";
const repeats = opt.scale ? 1 : Math.max(1, opt.repeats ?? (opt.quick ? 3 : 1));
console.log(`profile: ${mode} (repeats=${repeats})`);
console.log(
  "算法".padEnd(18),
  "节点".padStart(6),
  "wall(ms)".padStart(11),
  "CPU(ms)".padStart(11),
  "CPU-CV".padStart(8),
);
for (const r of [...results].sort((a, b) => (b.cpuMed ?? b.med) - (a.cpuMed ?? a.med))) {
  const cpuCv = r.cpuCv ?? r.cv;
  console.log(
    r.alg.padEnd(18),
    String(r.nodes).padStart(6),
    r.med.toFixed(2).padStart(11),
    (r.cpuMed ?? r.med).toFixed(2).padStart(11),
    (cpuCv * 100).toFixed(1).padStart(7) + "%",
  );
}
if (opt.json) {
  mkdirSync(dirname(opt.json), { recursive: true });
  writeFileSync(opt.json, JSON.stringify(results, null, 2) + "\n");
  console.log(`→ ${opt.json}`);
}
