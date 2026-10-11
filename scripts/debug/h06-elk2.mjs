import ELK from 'elkjs/lib/elk.bundled.js'
const HIERARCHY = {"0":[1],"2":[3]}
const DIMS = [[60,30],[60,30],[60,30],[60,30]]
const NODE_PORTS = [[],[{"id":"P1","x":0,"y":0,"w":8,"h":8,"side":null,"index":null},{"id":"P2","x":0,"y":0,"w":8,"h":8,"side":null,"index":null}],[],[{"id":"P1","x":0,"y":0,"w":8,"h":8,"side":null,"index":null},{"id":"P2","x":0,"y":0,"w":8,"h":8,"side":null,"index":null}]]
const EDGE_IDX = [[1,0,"P1",1,1,"P2"],[3,0,"P1",3,1,"P2"]]
function buildElkHierarchy(idx, hierarchy, dims, nodePorts, portConstraints) {
  const [w, h] = dims[idx]
  const node = { id: 'N' + idx, width: w, height: h }
  if (portConstraints[idx]) node.layoutOptions = { 'elk.portConstraints': portConstraints[idx] }
  const ports = nodePorts[idx] ?? []
  if (ports.length > 0) {
    node.ports = ports.map((p) => ({ id: 'N' + idx + '.' + p.id, width: p.w, height: p.h, x: p.x, y: p.y, properties: { 'port.side': p.side ?? 'UNDEFINED', 'port.index': String(p.index ?? 0), 'port.x': String(p.x), 'port.y': String(p.y) } }))
  }
  const kids = hierarchy[idx] ?? []
  if (kids.length > 0) node.children = kids.map(k => buildElkHierarchy(k, hierarchy, dims, nodePorts, portConstraints))
  return node
}
const elkChildren = Array.from({ length: DIMS.length }, (_, i) => i).filter(i => !Object.values(HIERARCHY).flat().includes(i)).map(i => buildElkHierarchy(i, HIERARCHY, DIMS, NODE_PORTS, []))
const elk = new ELK()
const elkRes = await elk.layout({
  id: 'root',
  layoutOptions: { 'elk.algorithm': 'layered', 'elk.direction': 'RIGHT', 'elk.randomSeed': '1', ...(true ? { 'elk.hierarchyHandling': 'INCLUDE_CHILDREN' } : {}) },
  children: elkChildren,
  edges: EDGE_IDX.map(([s, , sp, t, , tp], i) => ({ id: 'e' + i, sources: [sp ? 'N' + s + '.' + sp : 'N' + s], targets: [tp ? 'N' + t + '.' + tp : 'N' + t] })),
})
const walk = (list, px, py) => {
  for (const c of list) {
    const wx = px + c.x, wy = py + c.y
    console.log(`${c.id}: world=(${wx.toFixed(2)}, ${wy.toFixed(2)}) inside=(${c.x}, ${c.y}) size=(${c.width}, ${c.height})`)
    if (c.children) walk(c.children, wx, wy)
  }
}
walk(elkRes.children ?? [], 0, 0)
console.log(JSON.stringify(elkRes, null, 1))
