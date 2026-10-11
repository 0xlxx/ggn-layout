import ELK from 'elkjs/lib/elk.bundled.js'
const HIERARCHY = {"1":[2]}
const DIMS = [[60,30],[60,30],[60,30]]
const NODE_PORTS = [[],[],[]]
const PORT_CONSTRAINTS = [null,null,null]
const EDGE_IDX = [[1,null,null,1,null,null],[0,null,null,2,null,null]]
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
const elkChildren = Array.from({ length: DIMS.length }, (_, i) => i).filter(i => !Object.values(HIERARCHY).flat().includes(i)).map(i => buildElkHierarchy(i, HIERARCHY, DIMS, NODE_PORTS, PORT_CONSTRAINTS))
const elk = new ELK()
const elkRes = await elk.layout({
  id: 'root',
  layoutOptions: { 'elk.algorithm': 'layered', 'elk.direction': 'RIGHT', 'elk.randomSeed': '1', ...(Object.keys(HIERARCHY).length > 0 ? { 'elk.hierarchyHandling': 'INCLUDE_CHILDREN' } : {}) },
  children: elkChildren,
  edges: EDGE_IDX.map(([s, , sp, t, , tp], i) => ({ id: 'e' + i, sources: [sp ? 'N' + s + '.' + sp : 'N' + s], targets: [tp ? 'N' + t + '.' + tp : 'N' + t] })),
})
console.log(JSON.stringify(elkRes, null, 1))
