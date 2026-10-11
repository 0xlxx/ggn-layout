// 运行：bunx tsx examples/coords-modes.ts
import { layoutElkJson } from '../src/public.js'

const input = {
  id: 'root',
  children: [
    {
      id: 'group',
      children: [{ id: 'A', width: 32, height: 20 }, { id: 'B', width: 32, height: 20 }],
      edges: [{ id: 'A-to-B', sources: ['A'], targets: ['B'] }],
    },
    { id: 'C', width: 32, height: 20 },
  ],
  edges: [{ id: 'A-to-C', sources: ['group.A'], targets: ['C'] }],
}

const output = layoutElkJson(input, {
  layoutOptions: {
    'org.eclipse.elk.json.shapeCoords': 'ROOT',
    'org.eclipse.elk.json.edgeCoords': 'ROOT',
  },
})
console.log(JSON.stringify(output, null, 2))
