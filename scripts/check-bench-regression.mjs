#!/usr/bin/env bun
/**
 * check-bench-regression — 端到端 bench 回归门禁 (CI).
 *
 * 对比 perf-run --bench 输出 (bench-results/baseline-*.json) 或
 * perf-nonlayered 输出 (bench-results/baseline-nonlayered.json)。
 * 只拦变慢：相对基线回退超过阈值，且绝对增量超过 --min-delta-ms 才失败。
 *
 * 用法:
 *   bun scripts/check-bench-regression.mjs --baseline <base.json> --current <cur.json> [--threshold 0.10] [--metric layout|total] [--min-delta-ms 0.5]
 *   bun scripts/check-bench-regression.mjs --dir bench-results --current /tmp/cur-<scale>.json  # layered 按 scale 自动匹配
 *
 * 退出码: 0 = 全部通过; 1 = 存在回归; 2 = 参数 / 基线结构错误。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

function parseArgs(argv) {
  const opts = { baseline: null, current: null, threshold: 0.1, metric: "layout", minDeltaMs: 0.5 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--baseline") opts.baseline = argv[++i];
    else if (a === "--current") opts.current = argv[++i];
    else if (a === "--threshold") opts.threshold = Number(argv[++i]);
    else if (a === "--metric") opts.metric = argv[++i];
    else if (a === "--min-delta-ms") opts.minDeltaMs = Number(argv[++i]);
    else if (a === "--dir") opts.dir = argv[++i];
  }
  return opts;
}

function loadJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    console.error(
      `无法读取 JSON: ${path}\n${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(2);
  }
}

function isNonLayered(data) {
  return (
    Array.isArray(data) &&
    data.length > 0 &&
    data.every((entry) => entry && typeof entry.alg === "string" && Number.isFinite(entry.med))
  );
}

function formatPct(value) {
  return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}%`;
}

function formatMs(value) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}ms`;
}

const opts = parseArgs(process.argv.slice(2));
if (!opts.current) {
  console.error(
    "用法: --current <cur.json> [--baseline <base.json>|--dir <基准目录>] [--threshold 0.10] [--metric layout|total] [--min-delta-ms 0.5]",
  );
  process.exit(2);
}

const cur = loadJson(opts.current);
const nonLayered = isNonLayered(cur);
const scale = cur.graph?.includes("wireless_personalareanetwork")
  ? "small"
  : cur.graph?.includes("pickstates")
    ? "medium"
    : cur.graph?.includes("trilateration")
      ? "large"
      : null;

let basePath = opts.baseline;
if (!basePath && opts.dir) {
  basePath = nonLayered
    ? join(opts.dir, "baseline-nonlayered.json")
    : scale
      ? join(opts.dir, "baseline-" + scale + ".json")
      : null;
}
if (!basePath) {
  console.error("无法确定基线文件: 传 --baseline 或 --dir (layered 的 current 图需可识别 scale)");
  process.exit(2);
}

const base = loadJson(basePath);
const thresholdPct = opts.threshold * 100;
const header = `阈值 +${thresholdPct.toFixed(0)}%, 绝对增量下限 ${opts.minDeltaMs.toFixed(2)}ms`;

if (nonLayered) {
  if (!isNonLayered(base)) {
    console.error("基线格式错误: 非 layered 基线必须是含 alg/med 的 JSON 数组");
    process.exit(2);
  }
  const baseByAlg = new Map(base.map((entry) => [entry.alg, entry]));
  const curByAlg = new Map(cur.map((entry) => [entry.alg, entry]));
  const regressions = [];
  const suppressed = [];

  if (
    base.length !== cur.length ||
    baseByAlg.size !== curByAlg.size ||
    [...baseByAlg.keys()].some((alg) => !curByAlg.has(alg))
  ) {
    const missing = [...baseByAlg.keys()].filter((alg) => !curByAlg.has(alg));
    const added = [...curByAlg.keys()].filter((alg) => !baseByAlg.has(alg));
    console.error(`非 layered 覆盖集不一致: baseline=${base.length}, current=${cur.length}`);
    if (missing.length) console.error(`  当前缺失: ${missing.join(", ")}`);
    if (added.length) console.error(`  新增未登记: ${added.join(", ")}`);
    process.exit(2);
  }

  for (const curr of cur) {
    const baseline = baseByAlg.get(curr.alg);
    if (
      baseline.nodes !== curr.nodes ||
      baseline.iters !== curr.iters ||
      baseline.repeats !== curr.repeats
    ) {
      console.error(
        `基线配置不一致 (${curr.alg}): baseline nodes=${baseline.nodes} iters=${baseline.iters} repeats=${baseline.repeats}; current nodes=${curr.nodes} iters=${curr.iters} repeats=${curr.repeats}`,
      );
      process.exit(2);
    }
    const baselineMs = baseline.cpuMed ?? baseline.med;
    const currentMs = curr.cpuMed ?? curr.med;
    const deltaMs = currentMs - baselineMs;
    const deltaPct = deltaMs / baselineMs;
    const row = { alg: curr.alg, baselineMs, currentMs, deltaMs, deltaPct };
    if (deltaPct > opts.threshold && deltaMs > opts.minDeltaMs) regressions.push(row);
    else if (deltaPct > opts.threshold) suppressed.push(row);
  }

  console.log("=== bench 回归门禁（非 layered quick / CPU 中位）===");
  console.log(`算法: ${cur.length} 项  ${header}`);
  if (regressions.length > 0) {
    console.log(`❌ 回归: ${regressions.length} 个算法慢于基线超阈值`);
    for (const r of regressions) {
      console.log(
        `   ${r.alg}: ${r.baselineMs.toFixed(2)}ms → ${r.currentMs.toFixed(2)}ms  ${formatPct(r.deltaPct)} / ${formatMs(r.deltaMs)}`,
      );
    }
    process.exit(1);
  }
  if (suppressed.length > 0)
    console.log(`ℹ️ 噪声抑制: ${suppressed.length} 项超百分比阈值但绝对增量未超过下限`);
  console.log("✅ 通过: 无回归");
  process.exit(0);
}

const m = opts.metric;
if (!cur[m] || !base[m]) {
  console.error("指标不存在: " + m);
  process.exit(2);
}
const curMean = cur[m].mean;
const baseMean = base[m].mean;
const deltaMs = curMean - baseMean;
const deltaPct = deltaMs / baseMean;
const regressed = deltaPct > opts.threshold && deltaMs > opts.minDeltaMs;

console.log("=== bench 回归门禁 ===");
console.log("图: " + cur.graph + " (" + cur.nodeCount + " 节点, scale=" + scale + ")");
console.log(
  "指标: " + m + ".mean  基线=" + baseMean.toFixed(2) + "ms  当前=" + curMean.toFixed(2) + "ms",
);
console.log("变化: " + formatPct(deltaPct) + " / " + formatMs(deltaMs) + "  (" + header + ")");
if (regressed) {
  console.log("❌ 回归: 当前慢于基线超阈值");
  process.exit(1);
}
if (deltaPct > opts.threshold) console.log("ℹ️ 噪声抑制: 超百分比阈值但绝对增量未超过下限");
console.log("✅ 通过: 无回归");
process.exit(0);
