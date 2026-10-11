#!/usr/bin/env bun
/**
 * bench 回归门禁 (CI 一站式):
 *   1. layered small/medium/large 各跑 bench 30 次，对比 baseline-<scale>.json；
 *   2. 非 layered 全表跑 quick 档，对比 baseline-nonlayered.json。
 * 任一维度回退超阈值 (+10% 且绝对增量超下限) 即失败；只拦变慢。
 * layered 绝对下限 0.5ms；非 layered quick 受慢算法抖动影响，绝对下限 40ms。
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const dir = mkdtempSync(join(tmpdir(), "ggn-bench-gate-"));
let failed = false;

for (const scale of ["small", "medium", "large"]) {
  const out = join(dir, `current-${scale}.json`);
  const bench = spawnSync(
    "bun",
    ["scripts/perf-run.mjs", "--bench", "30", "--scale", scale, "--out", out],
    {
      cwd: process.cwd(),
      stdio: "inherit",
    },
  );
  if (bench.status !== 0) {
    failed = true;
    continue;
  }
  const check = spawnSync(
    "bun",
    ["scripts/check-bench-regression.mjs", "--dir", "bench-results", "--current", out],
    {
      cwd: process.cwd(),
      stdio: "inherit",
    },
  );
  if (check.status !== 0) failed = true;
}

const nonLayeredOut = join(dir, "current-nonlayered.json");
const nonLayeredBench = spawnSync(
  "bun",
  ["scripts/perf-nonlayered.mjs", "--quick", "--json", nonLayeredOut],
  {
    cwd: process.cwd(),
    stdio: "inherit",
  },
);
if (nonLayeredBench.status !== 0) {
  failed = true;
} else {
  const check = spawnSync(
    "bun",
    [
      "scripts/check-bench-regression.mjs",
      "--baseline",
      "bench-results/baseline-nonlayered.json",
      "--current",
      nonLayeredOut,
      "--min-delta-ms",
      "40",
    ],
    { cwd: process.cwd(), stdio: "inherit" },
  );
  if (check.status !== 0) failed = true;
}

process.exit(failed ? 1 : 0);
