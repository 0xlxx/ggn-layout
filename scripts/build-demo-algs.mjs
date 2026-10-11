/**
 * 生成 demo-vite/data/algs_*.json — 非 layered 算法示例 (标准 ELK JSON).
 *
 * 覆盖已移植算法 (org.eclipse.elk.*): box / fixed / random / stress / force /
 * rectpacking / topdownpacking / sporeoverlap / radial / vertiflex / disco / mrtree.
 * root 直接用算法 (layoutElkJson 分派); 输入来自各算法 BDD 测试已验证的语料.
 *
 * 用法: bun scripts/build-demo-algs.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'demo-vite', 'data')
mkdirSync(OUT, { recursive: true })

const ALGS = [
  { out: 'algs_box.json', title: 'Box', alg: 'org.eclipse.elk.box', opts: {}, input: { children: [{ id: 'a', width: 60, height: 40 }, { id: 'b', width: 40, height: 60 }, { id: 'c', width: 50, height: 50 }, { id: 'd', width: 30, height: 30 }] } },
  { out: 'algs_fixed.json', title: 'Fixed', alg: 'org.eclipse.elk.fixed', opts: {}, input: { children: [{ id: 'a', x: 10, y: 20, width: 60, height: 40 }, { id: 'b', x: 90, y: 30, width: 40, height: 60 }, { id: 'c', x: 40, y: 110, width: 50, height: 50 }] } },
  { out: 'algs_random.json', title: 'Random', alg: 'org.eclipse.elk.random', opts: {}, input: { children: [{ id: 'a', width: 50, height: 30 }, { id: 'b', width: 40, height: 40 }, { id: 'c', width: 30, height: 50 }, { id: 'd', width: 60, height: 30 }] } },
  { out: 'algs_stress.json', title: 'Stress', alg: 'org.eclipse.elk.stress', opts: {}, input: { children: [{ id: 'a', width: 40, height: 40 }, { id: 'b', width: 40, height: 40 }, { id: 'c', width: 40, height: 40 }, { id: 'd', width: 40, height: 40 }, { id: 'e', width: 40, height: 40 }], edges: [{ sources: ['a'], targets: ['b'] }, { sources: ['a'], targets: ['c'] }, { sources: ['b'], targets: ['d'] }, { sources: ['c'], targets: ['d'] }, { sources: ['d'], targets: ['e'] }] } },
  { out: 'algs_force.json', title: 'Force (FR)', alg: 'org.eclipse.elk.force', opts: {}, input: { children: [{ id: 'a', width: 40, height: 40 }, { id: 'b', width: 40, height: 40 }, { id: 'c', width: 40, height: 40 }, { id: 'd', width: 40, height: 40 }], edges: [{ sources: ['a'], targets: ['b'] }, { sources: ['a'], targets: ['c'] }, { sources: ['b'], targets: ['d'] }] } },
  { out: 'algs_rectpacking.json', title: 'Rect Packing', alg: 'org.eclipse.elk.rectpacking', opts: { 'org.eclipse.elk.rectpacking.trybox': 'true' }, input: { children: [{ id: 'a', width: 100, height: 100 }, { id: 'b', width: 20, height: 20 }, { id: 'c', width: 20, height: 20 }, { id: 'd', width: 40, height: 40 }] } },
  { out: 'algs_topdown.json', title: 'Topdown Packing', alg: 'org.eclipse.elk.topdownpacking', opts: {}, input: { children: [{ id: 'a', width: 60, height: 40 }, { id: 'b', width: 50, height: 50 }, { id: 'c', width: 40, height: 60 }, { id: 'd', width: 30, height: 30 }] } },
  { out: 'algs_spore.json', title: 'Spore (Overlap Removal)', alg: 'org.eclipse.elk.sporeoverlap', opts: {}, input: { children: [{ id: 'a', x: 10, y: 10, width: 80, height: 50 }, { id: 'b', x: 60, y: 40, width: 60, height: 60 }, { id: 'c', x: 20, y: 70, width: 50, height: 50 }, { id: 'd', x: 100, y: 20, width: 40, height: 80 }] } },
  { out: 'algs_radial.json', title: 'Radial', alg: 'org.eclipse.elk.radial', opts: {}, input: { children: [{ id: 'r', width: 40, height: 40 }, { id: 'c1', width: 30, height: 30 }, { id: 'c2', width: 50, height: 50 }, { id: 'c3', width: 30, height: 30 }, { id: 'c4', width: 40, height: 40 }], edges: [{ sources: ['r'], targets: ['c1'] }, { sources: ['r'], targets: ['c2'] }, { sources: ['r'], targets: ['c3'] }, { sources: ['r'], targets: ['c4'] }] } },
  { out: 'algs_vertiflex.json', title: 'VertiFlex', alg: 'org.eclipse.elk.vertiflex', opts: {}, input: { children: [{ id: 'a', width: 60, height: 40 }, { id: 'b', width: 50, height: 50 }, { id: 'c', width: 40, height: 60 }, { id: 'd', width: 70, height: 30 }] } },
  { out: 'algs_disco.json', title: 'DisCo', alg: 'org.eclipse.elk.disco', opts: {}, input: { children: [{ id: 'g1', width: 60, height: 40 }, { id: 'g2', width: 80, height: 60 }, { id: 'g3', width: 50, height: 50 }, { id: 'g4', width: 40, height: 70 }] } },
  { out: 'algs_mrtree.json', title: 'MrTree', alg: 'org.eclipse.elk.mrtree', opts: { 'org.eclipse.elk.direction': 'DOWN' }, input: { children: [{ id: 'a', width: 80, height: 40 }, { id: 'b', width: 40, height: 30 }, { id: 'c', width: 40, height: 30 }, { id: 'd', width: 50, height: 60 }, { id: 'e', width: 40, height: 30 }, { id: 'f', width: 40, height: 30 }, { id: 'g', width: 40, height: 30 }], edges: [{ sources: ['a'], targets: ['b'] }, { sources: ['a'], targets: ['c'] }, { sources: ['b'], targets: ['d'] }, { sources: ['c'], targets: ['e'] }, { sources: ['c'], targets: ['f'] }, { sources: ['d'], targets: ['g'] }] } },
]

for (const a of ALGS) {
  // 边补 id (ELK JSON 严格要求: Every element must have an id; 之前缺 id 导致 Java 导入报错)
  const input = { ...a.input }
  if (input.edges) input.edges = input.edges.map((e, i) => ({ id: `e${i}`, ...e }))
  const json = {
    id: 'root',
    layoutOptions: { 'org.eclipse.elk.algorithm': a.alg, 'org.eclipse.elk.randomSeed': '1', ...a.opts },
    ...input,
  }
  writeFileSync(resolve(OUT, a.out), JSON.stringify(json, null, 1))
  console.log(`✓ ${a.out}  (${a.title}, ${a.input.children.length} nodes / ${a.input.edges?.length ?? 0} edges)`)
}
console.log(`\n${ALGS.length} 个非 layered 算法示例已生成 → ${OUT}`)
