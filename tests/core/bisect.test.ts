import ELK from 'elkjs/lib/elk.bundled.js'
import { LGraph, LNode, LPort, LEdge, NodeType } from '../../src/index.js'
import { LayeredLayoutProvider } from '../../src/layered-layout-provider.js'
import { PORT_CONSTRAINTS as PORT_CONSTRAINTS_KEY, PORT_INDEX as PORT_INDEX_KEY, HIERARCHY_HANDLING as HIERARCHY_HANDLING_KEY, DIRECTION as DIRECTION_KEY } from '../../src/options/layered-options.js'

const newElk = () => new ELK()

/** ELK 风格: 创建简单边 (对应 ElkGraphUtil.createSimpleEdge). 端口序号已声明时复用. */
function createSimpleEdge(src: LNode, tgt: LNode, spIdx: number | null = null, tpIdx: number | null = null): LEdge {
  const sp = spIdx !== null && spIdx < src.getPorts().length ? src.getPorts()[spIdx]! : (() => { const p = new LPort(); p.setNode(src); return p })()
  const tp = tpIdx !== null && tpIdx < tgt.getPorts().length ? tgt.getPorts()[tpIdx]! : (() => { const p = new LPort(); p.setNode(tgt); return p })()
  const e = new LEdge(); e.setSource(sp); e.setTarget(tp)
  return e
}

/** 递归构建 elkjs 层级结构. */
function buildElkHierarchy(idx: number, hierarchy: Record<number, number[]>, dims: [number, number][], nodePorts: { id: string; x: number; y: number; w: number; h: number; side: string | null; index: number | null }[][], portConstraints: (string | null)[], built: Set<number> = new Set()): any {
  const [w, h] = dims[idx]
  const node: any = { id: 'N' + idx, width: w, height: h }
  // 与 ggn 侧一致: 节点级 portConstraints (elkt 语义). 之前缺失导致 elkjs 用 FREE 而 ggn 用 FIXED.
  if (portConstraints[idx]) {
    node.layoutOptions = { 'elk.portConstraints': portConstraints[idx] }
  }
  const ports = nodePorts[idx] ?? []
  if (ports.length > 0) {
    node.ports = ports.map((p: any) => ({ id: 'N' + idx + '.' + p.id, width: p.w, height: p.h, x: p.x, y: p.y, properties: { 'port.side': p.side ?? 'UNDEFINED', 'port.index': String(p.index ?? 0), 'port.x': String(p.x), 'port.y': String(p.y) } }))
  }
  // 层级子节点按 first-parent-wins 去重 (与 ggn 构建侧一致; ELK 模型禁止重复 id,
  // jar 对重复 id 抛 IllegalArgumentException — elkjs 宽松容忍但那是无效模型).
  const kids = (hierarchy[idx] ?? []).filter(k => !built.has(k))
  for (const k of kids) built.add(k)
  if (kids.length > 0) node.children = kids.map(k => buildElkHierarchy(k, hierarchy, dims, nodePorts, portConstraints, built))
  return node
}
describe('elkt 生成: tickets__layered__701_portLabels', () => {
  const HIERARCHY: Record<number, number[]> = {"0":[1,3],"1":[2],"8":[2],"9":[2],"10":[3,3],"11":[3,3],"13":[14,3],"14":[2],"15":[2],"16":[2]}
  const EDGE_IDX: [number, number | null, string | null, number, number | null, string | null][] = [[3,null,null,11,0,"P1"],[17,null,null,3,null,null],[2,0,"P1",18,null,null],[12,0,"P1",5,null,null],[3,null,null,11,0,"P1"],[17,null,null,3,null,null],[2,0,"P1",18,null,null],[12,0,"P1",5,null,null],[0,null,null,13,null,null]]
  const DIMS: [number, number][] = [[1000,1000],[400,200],[150,100],[85,50],[100,50],[180,50],[100,50],[100,50],[400,200],[850,600],[120,100],[120,100],[200,200],[1000,1000],[400,200],[400,200],[400,600],[60,30],[60,30]]
  const PORT_IDS: string[] = ["P1","P2"]
  const PORT_CONSTRAINTS: (string | null)[] = [null,null,null,null,"FIXED_SIDE",null,"FIXED_SIDE","FIXED_SIDE",null,null,"FIXED_SIDE","FIXED_SIDE",null,null,null,null,null,null,null]
  const NODE_PORTS: { id: string; x: number; y: number; w: number; h: number; side: string | null; index: number | null }[][] = [[],[],[{"id":"P1","x":-39.5,"y":21,"w":99,"h":17,"side":null,"index":null}],[],[{"id":"P1","x":-40,"y":21,"w":100,"h":36,"side":"EAST","index":null}],[],[{"id":"P1","x":-101,"y":-7,"w":100,"h":34,"side":"WEST","index":null}],[{"id":"P1","x":-40,"y":21,"w":100,"h":17,"side":"WEST","index":null}],[],[{"id":"P2","x":-40,"y":-18,"w":80,"h":17,"side":"SOUTH","index":null}],[{"id":"P1","x":-40,"y":21,"w":100,"h":17,"side":"EAST","index":null}],[{"id":"P1","x":-40,"y":21,"w":100,"h":17,"side":"EAST","index":null}],[{"id":"P1","x":-40,"y":21,"w":100,"h":17,"side":null,"index":null}],[],[],[],[{"id":"P2","x":-40,"y":-18,"w":80,"h":17,"side":"SOUTH","index":null}],[],[]]
  const NODE_LABELS: { text: string; width: number; height: number }[][] = [[{"text":"ContainerWithFixedLabels","width":0,"height":0}],[{"text":"Container_OneBorderNode_LabelFixedPartiallyInside","width":0,"height":0}],[{"text":"MyNode1","width":0,"height":0}],[{"text":"MyNode2","width":0,"height":0}],[{"text":"MyNode2Bis","width":0,"height":0}],[{"text":"MyNode3","width":0,"height":0}],[{"text":"MyNode4","width":0,"height":0}],[{"text":"MyNode4Bis","width":0,"height":0}],[{"text":"Container_OneBorderNode_LabelFixedOutside","width":0,"height":0}],[{"text":"Container_SeveralBorderNodes_LabelFixedPartiallyInside","width":0,"height":0}],[{"text":"MyCont2","width":0,"height":0}],[{"text":"MyCont3","width":0,"height":0}],[{"text":"MyCont4","width":0,"height":0}],[{"text":"ContainerWithLabelsInsideAndOutside","width":0,"height":0}],[{"text":"Container_OneBorderNode_LabelInside","width":0,"height":0}],[{"text":"Container_OneBorderNode_LabelOutside","width":0,"height":0}],[{"text":"Container_SeveralBorderNodes_LabelInsideAndOutside","width":0,"height":0}],[],[]]

  it('布局完成且无重叠', () => {
    const graph = new LGraph()
    const graphNodes: LNode[] = []
    const nodeOf = new Map<number, LNode>()
    const nestedGraphs = new Map<number, LGraph>()
    // 只有容器节点 (有子节点的) 才拥有 nestedGraph (ELK 模型).
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      nestedGraphs.set(p, new LGraph())
    }
    for (let i = 0; i < DIMS.length; i++) {
      const parentIdx = Object.entries(HIERARCHY).find(([, kids]) => kids.includes(i))?.[0]
      const g = parentIdx !== undefined ? nestedGraphs.get(Number(parentIdx))! : graph
      const n = new LNode(g)
      n.size = { x: DIMS[i][0], y: DIMS[i][1] }
      if (PORT_CONSTRAINTS[i]) {
        n.setProperty(PORT_CONSTRAINTS_KEY, PORT_CONSTRAINTS[i] as any)
      }
      for (const portDesc of NODE_PORTS[i]) {
        const port = new LPort()
        port.setNode(n)
        port.getPosition().x = portDesc.x
        port.getPosition().y = portDesc.y
        port.size = { x: portDesc.w, y: portDesc.h }
        if (portDesc.side) port.setSide(portDesc.side as any)
        if (portDesc.index !== null) port.setProperty(PORT_INDEX_KEY, portDesc.index)
      }
      if (NODE_LABELS[i].length > 0) {
        n.setLabels(NODE_LABELS[i].map((l) => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height } })))
      }
      nodeOf.set(i, n)
      graphNodes.push(n)
    }
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      const parent = nodeOf.get(p)!
      const nested = nestedGraphs.get(p)!
      parent.setNestedGraph(nested)
      nested.setParentNode(parent)
    }
    for (const [s, sp, , t, tp] of EDGE_IDX) createSimpleEdge(nodeOf.get(s)!, nodeOf.get(t)!, sp, tp)
    if (Object.keys(HIERARCHY).length > 0) {
      graph.setProperty(HIERARCHY_HANDLING_KEY, 'INCLUDE_CHILDREN')
    }
    graph.setProperty(DIRECTION_KEY, 'RIGHT')

    new LayeredLayoutProvider().layout(graph)

    for (const n of graphNodes) {
      expect(Number.isFinite(n.position.x)).toBe(true)
      expect(Number.isFinite(n.position.y)).toBe(true)
    }
    // 世界坐标 (子图节点坐标相对父, 重叠检查必须累加祖先位置).
    const worldOf = (n: LNode): { x: number; y: number } => {
      let wx = n.position.x, wy = n.position.y
      let g = n.getGraph()
      while (g !== null && g !== graph) {
        const parent = g.getParentNode()
        if (parent === null) break
        wx += parent.position.x
        wy += parent.position.y
        g = parent.getGraph()
      }
      return { x: wx, y: wy }
    }
    // 祖先-后代 (父包含子) 不算重叠.
    const isAncestor = (anc: LNode, desc: LNode): boolean => {
      let g = desc.getGraph()
      while (g !== null && g !== graph) {
        const parent = g.getParentNode()
        if (parent === anc) return true
        if (parent === null) break
        g = parent.getGraph()
      }
      return false
    }
    for (let i = 0; i < graphNodes.length; i++) {
      for (let j = i + 1; j < graphNodes.length; j++) {
        const a = graphNodes[i], b = graphNodes[j]
        if (PORT_IDS.includes(a.id.toString()) || PORT_IDS.includes(b.id.toString())) continue
        if (isAncestor(a, b) || isAncestor(b, a)) continue
        const pa = worldOf(a), pb = worldOf(b)
        const overlapX = pa.x < pb.x + b.size.x && pa.x + a.size.x > pb.x
        const overlapY = pa.y < pb.y + b.size.y && pa.y + a.size.y > pb.y
        expect(overlapX && overlapY, 'overlap').toBe(false)
      }
    }
  })

  it('坐标级差分: 与 elkjs 1:1 对齐', async () => {
    const graph = new LGraph()
    const nodeOf = new Map<number, LNode>()
    const nestedGraphs = new Map<number, LGraph>()
    // 只有容器节点 (有子节点的) 才拥有 nestedGraph (ELK 模型).
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      nestedGraphs.set(p, new LGraph())
    }
    for (let i = 0; i < DIMS.length; i++) {
      const parentIdx = Object.entries(HIERARCHY).find(([, kids]) => kids.includes(i))?.[0]
      const g = parentIdx !== undefined ? nestedGraphs.get(Number(parentIdx))! : graph
      const n = new LNode(g)
      n.size = { x: DIMS[i][0], y: DIMS[i][1] }
      if (PORT_CONSTRAINTS[i]) {
        n.setProperty(PORT_CONSTRAINTS_KEY, PORT_CONSTRAINTS[i] as any)
      }
      for (const portDesc of NODE_PORTS[i]) {
        const port = new LPort()
        port.setNode(n)
        port.getPosition().x = portDesc.x
        port.getPosition().y = portDesc.y
        port.size = { x: portDesc.w, y: portDesc.h }
        if (portDesc.side) port.setSide(portDesc.side as any)
        if (portDesc.index !== null) port.setProperty(PORT_INDEX_KEY, portDesc.index)
      }
      if (NODE_LABELS[i].length > 0) {
        n.setLabels(NODE_LABELS[i].map((l) => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height } })))
      }
      nodeOf.set(i, n)
    }
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      const parent = nodeOf.get(p)!
      const nested = nestedGraphs.get(p)!
      parent.setNestedGraph(nested)
      nested.setParentNode(parent)
    }
    for (const [s, sp, , t, tp] of EDGE_IDX) createSimpleEdge(nodeOf.get(s)!, nodeOf.get(t)!, sp, tp)
    if (Object.keys(HIERARCHY).length > 0) {
      graph.setProperty(HIERARCHY_HANDLING_KEY, 'INCLUDE_CHILDREN')
    }
    graph.setProperty(DIRECTION_KEY, 'RIGHT')

    new LayeredLayoutProvider().layout(graph)

    if (false) {
      for (const n of nodeOf.values()) {
        expect(Number.isFinite(n.position.x)).toBe(true)
        expect(Number.isFinite(n.position.y)).toBe(true)
      }
      return
    }

    const elkBuilt = new Set<number>()
    const elkChildren = Array.from({ length: DIMS.length }, (_, i) => i)
      .filter(i => !Object.values(HIERARCHY).flat().includes(i))
      .map(i => buildElkHierarchy(i, HIERARCHY, DIMS, NODE_PORTS, PORT_CONSTRAINTS, elkBuilt)) as any[]
    const elk = newElk()
    const elkRes = await elk.layout({
      id: 'root',
      layoutOptions: { 'elk.algorithm': 'layered', 'elk.direction': 'RIGHT', 'elk.randomSeed': '1', ...(true ? { 'elk.hierarchyHandling': 'INCLUDE_CHILDREN' } : {}) },
      children: elkChildren,
      edges: EDGE_IDX.map(([s, , sp, t, , tp], i) => ({ id: 'e' + i, sources: [sp ? 'N' + s + '.' + sp : 'N' + s], targets: [tp ? 'N' + t + '.' + tp : 'N' + t] })),
    })

    // 坐标级差分: 每个节点的世界坐标与 elkjs 一致 (容差 1).
    // elkjs 返回的坐标是相对父块的 (INCLUDE_CHILDREN 时子节点坐标是块内坐标).
    const elkPos = new Map<string, { x: number; y: number }>()
    const walk = (list: any[], parentX: number, parentY: number) => {
      for (const c of list) {
        const wx = parentX + c.x, wy = parentY + c.y
        elkPos.set(c.id, { x: wx, y: wy })
        if (c.children) walk(c.children, wx, wy)
      }
    }
    walk(elkRes.children ?? [], 0, 0)

    // ggn 子图节点坐标是相对父节点的 (与 elkjs 一致): 差分前做世界坐标累加.
    const ggnPos = new Map<number, { x: number; y: number }>()
    // ggn 子图实际结构 = first-parent-wins (每索引只归属第一个父容器, 与 elkjs 去重后同构).
    // 不能按 HIERARCHY 原样递归: 重复条目 (701 的 N2/N3 同时出现在多个容器) 会让同一节点
    // 在非实际父容器下重复累加世界坐标.
    const parentOf = (i: number): number | undefined => {
      const e = Object.entries(HIERARCHY).find(([, kids]) => kids.includes(i))
      return e ? Number(e[0]) : undefined
    }
    const walkGgn = (ids: number[], px: number, py: number) => {
      for (const id of ids) {
        const n = nodeOf.get(id)!
        const wx = px + n.position.x, wy = py + n.position.y
        ggnPos.set(id, { x: wx, y: wy })
        const kids = DIMS.map((_, i) => i).filter(i => parentOf(i) === id)
        if (kids.length > 0) walkGgn(kids, wx, wy)
      }
    }
    walkGgn(Object.keys(HIERARCHY).length > 0
      ? DIMS.map((_, i) => i).filter(i => !Object.values(HIERARCHY).flat().includes(i))
      : DIMS.map((_, i) => i), 0, 0)

    for (let i = 0; i < DIMS.length; i++) {
      const n = nodeOf.get(i)!
      const el = elkPos.get('N' + i)!
      const gn = ggnPos.get(i)!
      if (Math.abs(gn.x - el.x) > 1) console.log('DIFFX', 'N' + i, 'ggn', gn.x, 'elk', el.x)
      if (Math.abs(gn.y - el.y) > 1) console.log('DIFFY', 'N' + i, 'ggn', gn.y, 'elk', el.y)
      expect(Math.abs(gn.x - el.x), 'N' + i + ' x').toBeLessThanOrEqual(1)
      expect(Math.abs(gn.y - el.y), 'N' + i + ' y').toBeLessThanOrEqual(1)
    }
  })
})

describe('elkt 生成: tickets__layered__316_wrongGraphSizeWithIncludeChildren', () => {
  const HIERARCHY: Record<number, number[]> = {"0":[1]}
  const EDGE_IDX: [number, number | null, string | null, number, number | null, string | null][] = []
  const DIMS: [number, number][] = [[60,30],[200,40]]
  const PORT_IDS: string[] = ["P1","P2"]
  const PORT_CONSTRAINTS: (string | null)[] = [null,null]
  const NODE_PORTS: { id: string; x: number; y: number; w: number; h: number; side: string | null; index: number | null }[][] = [[{"id":"P1","x":0,"y":0,"w":40,"h":200,"side":null,"index":null},{"id":"P2","x":0,"y":0,"w":50,"h":200,"side":null,"index":null}],[]]
  const NODE_LABELS: { text: string; width: number; height: number }[][] = [[],[]]

  it('布局完成且无重叠', () => {
    const graph = new LGraph()
    const graphNodes: LNode[] = []
    const nodeOf = new Map<number, LNode>()
    const nestedGraphs = new Map<number, LGraph>()
    // 只有容器节点 (有子节点的) 才拥有 nestedGraph (ELK 模型).
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      nestedGraphs.set(p, new LGraph())
    }
    for (let i = 0; i < DIMS.length; i++) {
      const parentIdx = Object.entries(HIERARCHY).find(([, kids]) => kids.includes(i))?.[0]
      const g = parentIdx !== undefined ? nestedGraphs.get(Number(parentIdx))! : graph
      const n = new LNode(g)
      n.size = { x: DIMS[i][0], y: DIMS[i][1] }
      if (PORT_CONSTRAINTS[i]) {
        n.setProperty(PORT_CONSTRAINTS_KEY, PORT_CONSTRAINTS[i] as any)
      }
      for (const portDesc of NODE_PORTS[i]) {
        const port = new LPort()
        port.setNode(n)
        port.getPosition().x = portDesc.x
        port.getPosition().y = portDesc.y
        port.size = { x: portDesc.w, y: portDesc.h }
        if (portDesc.side) port.setSide(portDesc.side as any)
        if (portDesc.index !== null) port.setProperty(PORT_INDEX_KEY, portDesc.index)
      }
      if (NODE_LABELS[i].length > 0) {
        n.setLabels(NODE_LABELS[i].map((l) => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height } })))
      }
      nodeOf.set(i, n)
      graphNodes.push(n)
    }
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      const parent = nodeOf.get(p)!
      const nested = nestedGraphs.get(p)!
      parent.setNestedGraph(nested)
      nested.setParentNode(parent)
    }
    for (const [s, sp, , t, tp] of EDGE_IDX) createSimpleEdge(nodeOf.get(s)!, nodeOf.get(t)!, sp, tp)
    if (Object.keys(HIERARCHY).length > 0) {
      graph.setProperty(HIERARCHY_HANDLING_KEY, 'INCLUDE_CHILDREN')
    }
    graph.setProperty(DIRECTION_KEY, 'RIGHT')

    new LayeredLayoutProvider().layout(graph)
    for (const n of nodeOf.values()) console.log('FULL', n.id, 'pos', n.position.x, n.position.y, 'size', n.size.x, n.size.y, 'ports', n.getPorts().map(p => `${p.id}@${p.getPosition().x},${p.getPosition().y}:${p.getSide()}`).join(' '))
    console.log('POSCHECK', [...nodeOf.entries()].map(([k, n]) => `${k}:${n.position.x.toFixed(1)},${n.position.y.toFixed(1)}`).join(' '))

    for (const n of graphNodes) {
      expect(Number.isFinite(n.position.x)).toBe(true)
      expect(Number.isFinite(n.position.y)).toBe(true)
    }
    // 世界坐标 (子图节点坐标相对父, 重叠检查必须累加祖先位置).
    const worldOf = (n: LNode): { x: number; y: number } => {
      let wx = n.position.x, wy = n.position.y
      let g = n.getGraph()
      while (g !== null && g !== graph) {
        const parent = g.getParentNode()
        if (parent === null) break
        wx += parent.position.x
        wy += parent.position.y
        g = parent.getGraph()
      }
      return { x: wx, y: wy }
    }
    // 祖先-后代 (父包含子) 不算重叠.
    const isAncestor = (anc: LNode, desc: LNode): boolean => {
      let g = desc.getGraph()
      while (g !== null && g !== graph) {
        const parent = g.getParentNode()
        if (parent === anc) return true
        if (parent === null) break
        g = parent.getGraph()
      }
      return false
    }
    for (let i = 0; i < graphNodes.length; i++) {
      for (let j = i + 1; j < graphNodes.length; j++) {
        const a = graphNodes[i], b = graphNodes[j]
        if (PORT_IDS.includes(a.id.toString()) || PORT_IDS.includes(b.id.toString())) continue
        if (isAncestor(a, b) || isAncestor(b, a)) continue
        const pa = worldOf(a), pb = worldOf(b)
        const overlapX = pa.x < pb.x + b.size.x && pa.x + a.size.x > pb.x
        const overlapY = pa.y < pb.y + b.size.y && pa.y + a.size.y > pb.y
        expect(overlapX && overlapY, 'overlap').toBe(false)
      }
    }
  })

  it('坐标级差分: 与 elkjs 1:1 对齐', async () => {
    const graph = new LGraph()
    const nodeOf = new Map<number, LNode>()
    const nestedGraphs = new Map<number, LGraph>()
    // 只有容器节点 (有子节点的) 才拥有 nestedGraph (ELK 模型).
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      nestedGraphs.set(p, new LGraph())
    }
    for (let i = 0; i < DIMS.length; i++) {
      const parentIdx = Object.entries(HIERARCHY).find(([, kids]) => kids.includes(i))?.[0]
      const g = parentIdx !== undefined ? nestedGraphs.get(Number(parentIdx))! : graph
      const n = new LNode(g)
      n.size = { x: DIMS[i][0], y: DIMS[i][1] }
      if (PORT_CONSTRAINTS[i]) {
        n.setProperty(PORT_CONSTRAINTS_KEY, PORT_CONSTRAINTS[i] as any)
      }
      for (const portDesc of NODE_PORTS[i]) {
        const port = new LPort()
        port.setNode(n)
        port.getPosition().x = portDesc.x
        port.getPosition().y = portDesc.y
        port.size = { x: portDesc.w, y: portDesc.h }
        if (portDesc.side) port.setSide(portDesc.side as any)
        if (portDesc.index !== null) port.setProperty(PORT_INDEX_KEY, portDesc.index)
      }
      if (NODE_LABELS[i].length > 0) {
        n.setLabels(NODE_LABELS[i].map((l) => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height } })))
      }
      nodeOf.set(i, n)
    }
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      const parent = nodeOf.get(p)!
      const nested = nestedGraphs.get(p)!
      parent.setNestedGraph(nested)
      nested.setParentNode(parent)
    }
    for (const [s, sp, , t, tp] of EDGE_IDX) createSimpleEdge(nodeOf.get(s)!, nodeOf.get(t)!, sp, tp)
    if (Object.keys(HIERARCHY).length > 0) {
      graph.setProperty(HIERARCHY_HANDLING_KEY, 'INCLUDE_CHILDREN')
    }
    graph.setProperty(DIRECTION_KEY, 'RIGHT')

    new LayeredLayoutProvider().layout(graph)

    if (false) {
      for (const n of nodeOf.values()) {
        expect(Number.isFinite(n.position.x)).toBe(true)
        expect(Number.isFinite(n.position.y)).toBe(true)
      }
      return
    }

    const elkBuilt = new Set<number>()
    const elkChildren = Array.from({ length: DIMS.length }, (_, i) => i)
      .filter(i => !Object.values(HIERARCHY).flat().includes(i))
      .map(i => buildElkHierarchy(i, HIERARCHY, DIMS, NODE_PORTS, PORT_CONSTRAINTS, elkBuilt)) as any[]
    const elk = newElk()
    const elkRes = await elk.layout({
      id: 'root',
      layoutOptions: { 'elk.algorithm': 'layered', 'elk.direction': 'RIGHT', 'elk.randomSeed': '1', ...(true ? { 'elk.hierarchyHandling': 'INCLUDE_CHILDREN' } : {}) },
      children: elkChildren,
      edges: EDGE_IDX.map(([s, , sp, t, , tp], i) => ({ id: 'e' + i, sources: [sp ? 'N' + s + '.' + sp : 'N' + s], targets: [tp ? 'N' + t + '.' + tp : 'N' + t] })),
    })

    // 坐标级差分: 每个节点的世界坐标与 elkjs 一致 (容差 1).
    // elkjs 返回的坐标是相对父块的 (INCLUDE_CHILDREN 时子节点坐标是块内坐标).
    const elkPos = new Map<string, { x: number; y: number }>()
    const walk = (list: any[], parentX: number, parentY: number) => {
      for (const c of list) {
        const wx = parentX + c.x, wy = parentY + c.y
        elkPos.set(c.id, { x: wx, y: wy })
        if (c.children) walk(c.children, wx, wy)
      }
    }
    walk(elkRes.children ?? [], 0, 0)

    // ggn 子图节点坐标是相对父节点的 (与 elkjs 一致): 差分前做世界坐标累加.
    const ggnPos = new Map<number, { x: number; y: number }>()
    // ggn 子图实际结构 = first-parent-wins (每索引只归属第一个父容器, 与 elkjs 去重后同构).
    // 不能按 HIERARCHY 原样递归: 重复条目 (701 的 N2/N3 同时出现在多个容器) 会让同一节点
    // 在非实际父容器下重复累加世界坐标.
    const parentOf = (i: number): number | undefined => {
      const e = Object.entries(HIERARCHY).find(([, kids]) => kids.includes(i))
      return e ? Number(e[0]) : undefined
    }
    const walkGgn = (ids: number[], px: number, py: number) => {
      for (const id of ids) {
        const n = nodeOf.get(id)!
        const wx = px + n.position.x, wy = py + n.position.y
        ggnPos.set(id, { x: wx, y: wy })
        const kids = DIMS.map((_, i) => i).filter(i => parentOf(i) === id)
        if (kids.length > 0) walkGgn(kids, wx, wy)
      }
    }
    walkGgn(Object.keys(HIERARCHY).length > 0
      ? DIMS.map((_, i) => i).filter(i => !Object.values(HIERARCHY).flat().includes(i))
      : DIMS.map((_, i) => i), 0, 0)

    for (let i = 0; i < DIMS.length; i++) {
      const n = nodeOf.get(i)!
      const el = elkPos.get('N' + i)!
      const gn = ggnPos.get(i)!
      if (Math.abs(gn.x - el.x) > 1) console.log('DIFFX', 'N' + i, 'ggn', gn.x, 'elk', el.x)
      if (Math.abs(gn.y - el.y) > 1) console.log('DIFFY', 'N' + i, 'ggn', gn.y, 'elk', el.y)
      expect(Math.abs(gn.x - el.x), 'N' + i + ' x').toBeLessThanOrEqual(1)
      expect(Math.abs(gn.y - el.y), 'N' + i + ' y').toBeLessThanOrEqual(1)
    }
  })
})
