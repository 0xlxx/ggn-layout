import { it } from 'vitest'
import ELK from 'elkjs/lib/elk.bundled.js'
const elk = new ELK()
it('gg1 elkjs', async () => {
  const r = await elk.layout({
    id: 'root',
    layoutOptions: { 'elk.algorithm': 'layered', 'elk.direction': 'RIGHT', 'elk.hierarchyHandling': 'INCLUDE_CHILDREN' },
    children: [
      { id: 'G1', width: 84, height: 84, children: [{ id: 'A', width: 60, height: 30 }] },
      { id: 'G2', width: 84, height: 84, children: [{ id: 'B', width: 60, height: 30 }] },
    ],
    edges: [{ id: 'e1', sources: ['B'], targets: ['A'] }],
  })
  const flat: any[] = []
  const walk = (ns: any[]) => { for (const n of ns) { flat.push({ id: n.id, x: Math.round(n.x), y: Math.round(n.y) }); if (n.children) walk(n.children) } }
  walk(r.children)
  console.log('elkjs:', JSON.stringify(flat))
  console.log('sections:', JSON.stringify(r.edges?.map((e: any) => ({ s: e.sections?.map((s: any) => ({ start: s.startPoint, end: s.endPoint, bps: s.bendPoints })) }))))
})
