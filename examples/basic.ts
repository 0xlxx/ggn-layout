// 运行：bunx tsx examples/basic.ts
import { layoutElkJson } from '../src/public.js'

const input = {
  id: 'root',
  children: [
    { id: 'A', width: 40, height: 24 },
    { id: 'B', width: 40, height: 24 },
  ],
  edges: [{ id: 'A-to-B', sources: ['A'], targets: ['B'] }],
}

const output = layoutElkJson(input)
console.log(JSON.stringify(output, null, 2))
