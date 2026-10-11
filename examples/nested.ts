// 运行：bunx tsx examples/nested.ts
import { layoutElkJson } from '../src/public.js'

const input = {
  id: 'root',
  children: [
    {
      id: 'group',
      children: [
        { id: 'X', width: 36, height: 24 },
        { id: 'Y', width: 36, height: 24 },
      ],
      edges: [{ id: 'X-to-Y', sources: ['X'], targets: ['Y'] }],
    },
    { id: 'B', width: 40, height: 24 },
  ],
  edges: [{ id: 'X-to-B', sources: ['group.X'], targets: ['B'] }],
}

const output = layoutElkJson(input, { hierarchyHandling: 'INCLUDE_CHILDREN' })
console.log(JSON.stringify(output, null, 2))
