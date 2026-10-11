import { readFileSync } from 'node:fs'
import { buildLGraphFromElkJson } from '../../../shared/elkgraph-builder.ts'
import { LGraph, LNode, LPort, LEdge, NodeType } from '../../../src/index.js'
import { PortSide, PortType } from '../../../src/graph/enums.js'
import { createMergedPort } from '../../../src/graph/lgraph-util-merge.js'
import { LayeredLayoutProvider } from '../../../src/layered-layout-provider.js'
import { PORT_CONSTRAINTS as PORT_CONSTRAINTS_KEY, PORT_INDEX as PORT_INDEX_KEY, HIERARCHY_HANDLING as HIERARCHY_HANDLING_KEY, DIRECTION as DIRECTION_KEY, INSIDE_SELF_LOOPS_ACTIVATE as INSIDE_SELF_LOOPS_ACTIVATE_KEY, INSIDE_SELF_LOOPS_YO as INSIDE_SELF_LOOPS_YO_KEY, PORT_BORDER_OFFSET as PORT_BORDER_OFFSET_KEY, MERGE_EDGES as MERGE_EDGES_KEY } from '../../../src/options/layered-options.js'
import { MODEL_ORDER as MODEL_ORDER_KEY } from '../../../src/options/internal-properties.js'

// M5/mergeEdges: 每个测试块在创建边前设置 (ELK LGraphUtil.createPort 合并分支).
let __mergeEdges = false
let __defaultSide: PortSide = PortSide.EAST

/** 建边端口: mergeEdges 且非 FIXED_SIDE 时共享收集端口, 否则创建匿名端口.
 * 匿名端口按 ELK LGraphUtil.createPort 语义赋方向默认输出/输入侧 (createPort :433-462),
 * 否则自环隐式端口以 UNDEFINED 进入 SelfLoopType.fromPortSides 会抛 IllegalArgumentException.
 * merge 逐侧: 源侧用边所在图 (LCA) 的 MERGE_EDGES, 目标侧用目标节点所在图 (ELK createPort 语义). */
function mkEdgePort(node: LNode, type: PortType, merge: boolean): LPort {
  if (merge && node.getProperty(PORT_CONSTRAINTS_KEY) !== 'FIXED_SIDE') {
    return createMergedPort(node, type, __defaultSide, true, false)
  }
  const p = new LPort(); p.setNode(node)
  p.setSide(type === PortType.OUTPUT ? __defaultSide : opposedSide(__defaultSide))
  return p
}

/** 对侧 (PortSide.opposed). */
function opposedSide(side: PortSide): PortSide {
  switch (side) {
    case PortSide.NORTH: return PortSide.SOUTH
    case PortSide.SOUTH: return PortSide.NORTH
    case PortSide.EAST: return PortSide.WEST
    case PortSide.WEST: return PortSide.EAST
    default: return PortSide.UNDEFINED
  }
}

/** ELK 风格: 创建简单边 (对应 ElkGraphUtil.createSimpleEdge). 端口序号已声明时复用. */
function createSimpleEdge(src: LNode, tgt: LNode, spIdx: number | null = null, tpIdx: number | null = null, srcMerge = false, tgtMerge = false): LEdge {
  const sp = spIdx !== null && spIdx < src.getPorts().length ? src.getPorts()[spIdx]! : mkEdgePort(src, PortType.OUTPUT, srcMerge)
  const tp = tpIdx !== null && tpIdx < tgt.getPorts().length ? tgt.getPorts()[tpIdx]! : mkEdgePort(tgt, PortType.INPUT, tgtMerge)
  const e = new LEdge(); e.setSource(sp); e.setTarget(tp)
  return e
}

/**
 * elkt 生成: examples__ports__portConstraints
 * 图: 9 节点 / 6 边 / 0 层级块
 * 差分: 坐标级 (1:1 ELK 对齐)
 */

describe('elkt 生成: examples__ports__portConstraints', () => {
  const HIERARCHY: Record<number, number[]> = {"0":[1,2],"3":[4,5],"6":[7,8]}
  const EDGE_IDX: [number, number | null, string | null, number, number | null, string | null][] = [[1,0,"p1",2,0,"p1"],[1,1,"p2",2,1,"p2"],[4,0,"p1",5,0,"p1"],[4,1,"p2",5,1,"p2"],[7,0,"p1",8,0,"p1"],[7,1,"p2",8,1,"p2"]]
  const EDGE_YO: boolean[] = [false,false,false,false,false,false]
  const EDGE_LABELS: { text: string; width: number; height: number; placement: string | null }[][] = [[],[],[],[],[],[]]
  const DIMS: [number, number][] = [[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30]]
  const NAMES: string[] = ["freePorts","freePorts.n1","freePorts.n2","fixedSide","fixedSide.n1","fixedSide.n2","fixedPosition","fixedPosition.n1","fixedPosition.n2"]
  const PORT_IDS: string[] = ["p1","p2"]
  const PORT_CONSTRAINTS: (string | null)[] = [null,"FREE","FREE",null,"FIXED_SIDE","FIXED_SIDE",null,"FIXED_POS","FIXED_SIDE"]
  const NODE_PORTS: { id: string; x: number; y: number; w: number; h: number; side: string | null; index: number | null; borderOffset: number | null; labels: { text: string; x: number; y: number; width: number; height: number }[] }[][] = [[],[{"id":"p1","x":0,"y":0,"w":8,"h":8,"side":null,"index":null,"borderOffset":null,"labels":[]},{"id":"p2","x":0,"y":0,"w":8,"h":8,"side":null,"index":null,"borderOffset":null,"labels":[]}],[{"id":"p1","x":0,"y":0,"w":8,"h":8,"side":null,"index":null,"borderOffset":null,"labels":[]},{"id":"p2","x":0,"y":0,"w":8,"h":8,"side":null,"index":null,"borderOffset":null,"labels":[]}],[],[{"id":"p1","x":0,"y":0,"w":8,"h":8,"side":"WEST","index":null,"borderOffset":null,"labels":[]},{"id":"p2","x":0,"y":0,"w":8,"h":8,"side":"EAST","index":null,"borderOffset":null,"labels":[]}],[{"id":"p1","x":0,"y":0,"w":8,"h":8,"side":"WEST","index":null,"borderOffset":null,"labels":[]},{"id":"p2","x":0,"y":0,"w":8,"h":8,"side":"NORTH","index":null,"borderOffset":null,"labels":[]}],[],[{"id":"p1","x":-5,"y":5,"w":8,"h":8,"side":null,"index":null,"borderOffset":null,"labels":[]},{"id":"p2","x":35,"y":10,"w":8,"h":8,"side":null,"index":null,"borderOffset":null,"labels":[]}],[{"id":"p1","x":10,"y":-10,"w":8,"h":8,"side":null,"index":null,"borderOffset":null,"labels":[]},{"id":"p2","x":15,"y":40,"w":8,"h":8,"side":null,"index":null,"borderOffset":null,"labels":[]}]]
  const NODE_ACTIVATE: boolean[] = [false,false,false,false,false,false,false,false,false]
  const NODE_LABELS: { text: string; width: number; height: number; placement: string | null }[][] = [[],[],[],[],[],[],[],[],[]]
  const LABEL_PAD: ({ top: number; left: number; right: number; bottom: number } | null)[] = [{"top":12,"bottom":12,"left":12,"right":12},null,null,{"top":12,"bottom":12,"left":12,"right":12},null,null,{"top":12,"bottom":12,"left":12,"right":12},null,null]
  const NODE_OPTS: [string, unknown][][] = [[],[],[],[],[],[],[],[],[]]

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
      n.setProperty(MODEL_ORDER_KEY, i)
      if (PORT_CONSTRAINTS[i]) {
        n.setProperty(PORT_CONSTRAINTS_KEY, PORT_CONSTRAINTS[i] as any)
      }
      for (const [k, v] of NODE_OPTS[i]) {
        n.setProperty(k, v as any)
      }
      for (const portDesc of NODE_PORTS[i]) {
        const port = new LPort()
        port.setNode(n)
        port.getPosition().x = portDesc.x
        port.getPosition().y = portDesc.y
        port.size = { x: portDesc.w, y: portDesc.h }
        if (portDesc.side) port.setSide(portDesc.side as any)
        if (portDesc.index !== null) port.setProperty(PORT_INDEX_KEY, portDesc.index)
        if (portDesc.borderOffset !== null) port.setProperty(PORT_BORDER_OFFSET_KEY, portDesc.borderOffset)
        if (portDesc.labels.length > 0) {
          port.setLabels(portDesc.labels.map((l) => ({ text: l.text, position: { x: l.x, y: l.y }, size: { x: l.width, y: l.height } })))
        }
      }
      if (NODE_ACTIVATE[i]) {
        n.setProperty(INSIDE_SELF_LOOPS_ACTIVATE_KEY, true)
      }
      if (NODE_LABELS[i].length > 0) {
        n.setLabels(NODE_LABELS[i].map((l) => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })))
      }
      nodeOf.set(i, n)
      graphNodes.push(n)
    }
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      const parent = nodeOf.get(p)!
      const nested = nestedGraphs.get(p)!
      parent.setNestedGraph(nested)
      nested.setParentNode(parent)
      // ★ 容器节点 label 占位 (SSOT: LABEL_PAD[i] = 子图 padding.top, 对齐 buildLGraphFromParsed)
      if (LABEL_PAD[p] !== undefined && LABEL_PAD[p] !== null) nested.setPadding(LABEL_PAD[p])
      // ★ 节点级 mergeEdges → 嵌套图 (ELK createLGraph copyProperties; LGraphUtil.createPort 读图属性)
      if (NODE_OPTS[p]?.some(([k]) => k === 'org.eclipse.elk.layered.mergeEdges')) nested.setProperty(MERGE_EDGES_KEY, true)
    }
    __mergeEdges = false
    __defaultSide = PortSide.EAST
    if (__mergeEdges) graph.setProperty(MERGE_EDGES_KEY, true)
    // 边所在图 (LCA) 的 MERGE_EDGES (ELK ElkGraphImporter 源侧读边所在图; 目标侧读目标节点所在图).
    const __parentOf = new Map<number, number>()
    for (const [__p, __kids] of Object.entries(HIERARCHY)) for (const __k of __kids) __parentOf.set(__k, Number(__p))
    const __lcaMerge = (a: number, b: number): boolean => {
      const seen = new Set<number>()
      let x: number | undefined = a
      while (x !== undefined) { seen.add(x); x = __parentOf.get(x) }
      let y: number | undefined = b
      while (y !== undefined && !seen.has(y)) y = __parentOf.get(y)
      if (y === undefined) return graph.getProperty(MERGE_EDGES_KEY) === true
      const __py = __parentOf.get(y)
      const __g = __py === undefined ? graph : nestedGraphs.get(__py)!
      return __g.getProperty(MERGE_EDGES_KEY) === true
    }
    EDGE_IDX.forEach(([s, sp, , t, tp], ei) => {
      const __srcMerge = __lcaMerge(s, t)
      const __tgtMerge = nodeOf.get(t)!.getGraph()?.getProperty(MERGE_EDGES_KEY) === true
      const e = createSimpleEdge(nodeOf.get(s)!, nodeOf.get(t)!, sp, tp, __srcMerge, __tgtMerge)
      e.setProperty(MODEL_ORDER_KEY, ei)
      if (EDGE_YO[ei]) e.setProperty(INSIDE_SELF_LOOPS_YO_KEY, true)
      for (const l of EDGE_LABELS[ei]) {
        e.getLabels().push({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })
      }
    })
    if (Object.keys(HIERARCHY).length > 0) {
      graph.setProperty(HIERARCHY_HANDLING_KEY, 'INCLUDE_CHILDREN')
    }
    graph.setProperty(DIRECTION_KEY, 'RIGHT')
    graph.setProperty('org.eclipse.elk.aspectRatio', 0.1)
    graph.setProperty('org.eclipse.elk.randomSeed', 1)

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

  it('坐标级差分: 与 jar 0.12.0 1:1 对齐', () => {
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
      n.setProperty(MODEL_ORDER_KEY, i)
      if (PORT_CONSTRAINTS[i]) {
        n.setProperty(PORT_CONSTRAINTS_KEY, PORT_CONSTRAINTS[i] as any)
      }
      for (const [k, v] of NODE_OPTS[i]) {
        n.setProperty(k, v as any)
      }
      for (const portDesc of NODE_PORTS[i]) {
        const port = new LPort()
        port.setNode(n)
        port.getPosition().x = portDesc.x
        port.getPosition().y = portDesc.y
        port.size = { x: portDesc.w, y: portDesc.h }
        if (portDesc.side) port.setSide(portDesc.side as any)
        if (portDesc.index !== null) port.setProperty(PORT_INDEX_KEY, portDesc.index)
        if (portDesc.borderOffset !== null) port.setProperty(PORT_BORDER_OFFSET_KEY, portDesc.borderOffset)
        if (portDesc.labels.length > 0) {
          port.setLabels(portDesc.labels.map((l) => ({ text: l.text, position: { x: l.x, y: l.y }, size: { x: l.width, y: l.height } })))
        }
      }
      if (NODE_ACTIVATE[i]) {
        n.setProperty(INSIDE_SELF_LOOPS_ACTIVATE_KEY, true)
      }
      if (NODE_LABELS[i].length > 0) {
        n.setLabels(NODE_LABELS[i].map((l) => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })))
      }
      nodeOf.set(i, n)
    }
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      const parent = nodeOf.get(p)!
      const nested = nestedGraphs.get(p)!
      parent.setNestedGraph(nested)
      nested.setParentNode(parent)
      // ★ 容器节点 label 占位 (SSOT: LABEL_PAD[i] = 子图 padding.top, 对齐 buildLGraphFromParsed)
      if (LABEL_PAD[p] !== undefined && LABEL_PAD[p] !== null) nested.setPadding(LABEL_PAD[p])
      // ★ 节点级 mergeEdges → 嵌套图 (ELK createLGraph copyProperties; LGraphUtil.createPort 读图属性)
      if (NODE_OPTS[p]?.some(([k]) => k === 'org.eclipse.elk.layered.mergeEdges')) nested.setProperty(MERGE_EDGES_KEY, true)
    }
    __mergeEdges = false
    __defaultSide = PortSide.EAST
    if (__mergeEdges) graph.setProperty(MERGE_EDGES_KEY, true)
    // 边所在图 (LCA) 的 MERGE_EDGES (ELK ElkGraphImporter 源侧读边所在图; 目标侧读目标节点所在图).
    const __parentOf = new Map<number, number>()
    for (const [__p, __kids] of Object.entries(HIERARCHY)) for (const __k of __kids) __parentOf.set(__k, Number(__p))
    const __lcaMerge = (a: number, b: number): boolean => {
      const seen = new Set<number>()
      let x: number | undefined = a
      while (x !== undefined) { seen.add(x); x = __parentOf.get(x) }
      let y: number | undefined = b
      while (y !== undefined && !seen.has(y)) y = __parentOf.get(y)
      if (y === undefined) return graph.getProperty(MERGE_EDGES_KEY) === true
      const __py = __parentOf.get(y)
      const __g = __py === undefined ? graph : nestedGraphs.get(__py)!
      return __g.getProperty(MERGE_EDGES_KEY) === true
    }
    EDGE_IDX.forEach(([s, sp, , t, tp], ei) => {
      const __srcMerge = __lcaMerge(s, t)
      const __tgtMerge = nodeOf.get(t)!.getGraph()?.getProperty(MERGE_EDGES_KEY) === true
      const e = createSimpleEdge(nodeOf.get(s)!, nodeOf.get(t)!, sp, tp, __srcMerge, __tgtMerge)
      e.setProperty(MODEL_ORDER_KEY, ei)
      if (EDGE_YO[ei]) e.setProperty(INSIDE_SELF_LOOPS_YO_KEY, true)
      for (const l of EDGE_LABELS[ei]) {
        e.getLabels().push({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })
      }
    })
    if (Object.keys(HIERARCHY).length > 0) {
      graph.setProperty(HIERARCHY_HANDLING_KEY, 'INCLUDE_CHILDREN')
    }
    graph.setProperty(DIRECTION_KEY, 'RIGHT')
    graph.setProperty('org.eclipse.elk.aspectRatio', 0.1)
    graph.setProperty('org.eclipse.elk.randomSeed', 1)

    new LayeredLayoutProvider().layout(graph)

    if (false) {
      for (const n of nodeOf.values()) {
        expect(Number.isFinite(n.position.x)).toBe(true)
        expect(Number.isFinite(n.position.y)).toBe(true)
      }
      return
    }

    // L1 (M3): 与 ELK Java 0.12.0 jar oracle 坐标级差分 (容差 ε = 2).
    // oracle 坐标相对父块 (jar getX/getY); ggn 子图节点坐标同样相对父 → 直接对比, 无需世界坐标累加.
    const oracle = JSON.parse(readFileSync(new URL('../../../test-resources/jar-oracle/examples__ports__portConstraints.json', import.meta.url), 'utf8'))
    expect(oracle.hash, 'jar oracle 过期/缺失, 请重跑 node scripts/generate-jar-oracle.mjs').toBe('b56cb59ea0743f44')
    // ELK 类加载顺序变体 (EdgeMain vs BatchMain): oracle.variants 记录另一变体, 任一匹配即通过.
    const variants = oracle.variants ?? []
    for (let i = 0; i < DIMS.length; i++) {
      const gn = nodeOf.get(i)!
      const nm = 'N' + NAMES[i]
      const cands = [oracle.coords[nm], ...variants.map((v) => v.coords[nm])].filter(Boolean)
      expect(cands.length, nm + ' 缺少 jar oracle 坐标').toBeGreaterThan(0)
      const bestX = Math.min(...cands.map((c) => Math.abs(gn.position.x - c.x)))
      const bestY = Math.min(...cands.map((c) => Math.abs(gn.position.y - c.y)))
      expect(bestX, nm + ' x').toBeLessThanOrEqual(2)
      expect(bestY, nm + ' y').toBeLessThanOrEqual(2)
    }
  })
})

/**
 * elkt 生成: examples__ports__allowNonFlowPortsToSwitchSides
 * 图: 2 节点 / 3 边 / 0 层级块
 * 差分: 坐标级 (1:1 ELK 对齐)
 */

describe('elkt 生成: examples__ports__allowNonFlowPortsToSwitchSides', () => {
  const HIERARCHY: Record<number, number[]> = {}
  const EDGE_IDX: [number, number | null, string | null, number, number | null, string | null][] = [[0,0,"pns1",1,0,"pe1"],[0,1,"pns2",1,2,"pe3"],[0,null,null,1,1,"pe2"]]
  const EDGE_YO: boolean[] = [false,false,false]
  const EDGE_LABELS: { text: string; width: number; height: number; placement: string | null }[][] = [[],[],[]]
  const DIMS: [number, number][] = [[60,30],[60,30]]
  const NAMES: string[] = ["n3","n4"]
  const PORT_IDS: string[] = ["pns1","pns2","pe1","pe2","pe3"]
  const PORT_CONSTRAINTS: (string | null)[] = ["FIXED_SIDE","FIXED_ORDER"]
  const NODE_PORTS: { id: string; x: number; y: number; w: number; h: number; side: string | null; index: number | null; borderOffset: number | null; labels: { text: string; x: number; y: number; width: number; height: number }[] }[][] = [[{"id":"pns1","x":0,"y":0,"w":8,"h":8,"side":"NORTH","index":null,"borderOffset":null,"labels":[]},{"id":"pns2","x":0,"y":0,"w":8,"h":8,"side":"NORTH","index":null,"borderOffset":null,"labels":[]}],[{"id":"pe1","x":0,"y":0,"w":8,"h":8,"side":"WEST","index":1,"borderOffset":null,"labels":[]},{"id":"pe2","x":0,"y":0,"w":8,"h":8,"side":"WEST","index":2,"borderOffset":null,"labels":[]},{"id":"pe3","x":0,"y":0,"w":8,"h":8,"side":"WEST","index":3,"borderOffset":null,"labels":[]}]]
  const NODE_ACTIVATE: boolean[] = [false,false]
  const NODE_LABELS: { text: string; width: number; height: number; placement: string | null }[][] = [[],[]]
  const LABEL_PAD: ({ top: number; left: number; right: number; bottom: number } | null)[] = [null,null]
  const NODE_OPTS: [string, unknown][][] = [[],[]]

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
      n.setProperty(MODEL_ORDER_KEY, i)
      if (PORT_CONSTRAINTS[i]) {
        n.setProperty(PORT_CONSTRAINTS_KEY, PORT_CONSTRAINTS[i] as any)
      }
      for (const [k, v] of NODE_OPTS[i]) {
        n.setProperty(k, v as any)
      }
      for (const portDesc of NODE_PORTS[i]) {
        const port = new LPort()
        port.setNode(n)
        port.getPosition().x = portDesc.x
        port.getPosition().y = portDesc.y
        port.size = { x: portDesc.w, y: portDesc.h }
        if (portDesc.side) port.setSide(portDesc.side as any)
        if (portDesc.index !== null) port.setProperty(PORT_INDEX_KEY, portDesc.index)
        if (portDesc.borderOffset !== null) port.setProperty(PORT_BORDER_OFFSET_KEY, portDesc.borderOffset)
        if (portDesc.labels.length > 0) {
          port.setLabels(portDesc.labels.map((l) => ({ text: l.text, position: { x: l.x, y: l.y }, size: { x: l.width, y: l.height } })))
        }
      }
      if (NODE_ACTIVATE[i]) {
        n.setProperty(INSIDE_SELF_LOOPS_ACTIVATE_KEY, true)
      }
      if (NODE_LABELS[i].length > 0) {
        n.setLabels(NODE_LABELS[i].map((l) => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })))
      }
      nodeOf.set(i, n)
      graphNodes.push(n)
    }
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      const parent = nodeOf.get(p)!
      const nested = nestedGraphs.get(p)!
      parent.setNestedGraph(nested)
      nested.setParentNode(parent)
      // ★ 容器节点 label 占位 (SSOT: LABEL_PAD[i] = 子图 padding.top, 对齐 buildLGraphFromParsed)
      if (LABEL_PAD[p] !== undefined && LABEL_PAD[p] !== null) nested.setPadding(LABEL_PAD[p])
      // ★ 节点级 mergeEdges → 嵌套图 (ELK createLGraph copyProperties; LGraphUtil.createPort 读图属性)
      if (NODE_OPTS[p]?.some(([k]) => k === 'org.eclipse.elk.layered.mergeEdges')) nested.setProperty(MERGE_EDGES_KEY, true)
    }
    __mergeEdges = false
    __defaultSide = PortSide.EAST
    if (__mergeEdges) graph.setProperty(MERGE_EDGES_KEY, true)
    // 边所在图 (LCA) 的 MERGE_EDGES (ELK ElkGraphImporter 源侧读边所在图; 目标侧读目标节点所在图).
    const __parentOf = new Map<number, number>()
    for (const [__p, __kids] of Object.entries(HIERARCHY)) for (const __k of __kids) __parentOf.set(__k, Number(__p))
    const __lcaMerge = (a: number, b: number): boolean => {
      const seen = new Set<number>()
      let x: number | undefined = a
      while (x !== undefined) { seen.add(x); x = __parentOf.get(x) }
      let y: number | undefined = b
      while (y !== undefined && !seen.has(y)) y = __parentOf.get(y)
      if (y === undefined) return graph.getProperty(MERGE_EDGES_KEY) === true
      const __py = __parentOf.get(y)
      const __g = __py === undefined ? graph : nestedGraphs.get(__py)!
      return __g.getProperty(MERGE_EDGES_KEY) === true
    }
    EDGE_IDX.forEach(([s, sp, , t, tp], ei) => {
      const __srcMerge = __lcaMerge(s, t)
      const __tgtMerge = nodeOf.get(t)!.getGraph()?.getProperty(MERGE_EDGES_KEY) === true
      const e = createSimpleEdge(nodeOf.get(s)!, nodeOf.get(t)!, sp, tp, __srcMerge, __tgtMerge)
      e.setProperty(MODEL_ORDER_KEY, ei)
      if (EDGE_YO[ei]) e.setProperty(INSIDE_SELF_LOOPS_YO_KEY, true)
      for (const l of EDGE_LABELS[ei]) {
        e.getLabels().push({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })
      }
    })
    if (Object.keys(HIERARCHY).length > 0) {
      graph.setProperty(HIERARCHY_HANDLING_KEY, 'INCLUDE_CHILDREN')
    }
    graph.setProperty(DIRECTION_KEY, 'RIGHT')
    graph.setProperty('org.eclipse.elk.algorithm', "layered")
    graph.setProperty('org.eclipse.elk.randomSeed', 1)

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

  it('坐标级差分: 与 jar 0.12.0 1:1 对齐', () => {
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
      n.setProperty(MODEL_ORDER_KEY, i)
      if (PORT_CONSTRAINTS[i]) {
        n.setProperty(PORT_CONSTRAINTS_KEY, PORT_CONSTRAINTS[i] as any)
      }
      for (const [k, v] of NODE_OPTS[i]) {
        n.setProperty(k, v as any)
      }
      for (const portDesc of NODE_PORTS[i]) {
        const port = new LPort()
        port.setNode(n)
        port.getPosition().x = portDesc.x
        port.getPosition().y = portDesc.y
        port.size = { x: portDesc.w, y: portDesc.h }
        if (portDesc.side) port.setSide(portDesc.side as any)
        if (portDesc.index !== null) port.setProperty(PORT_INDEX_KEY, portDesc.index)
        if (portDesc.borderOffset !== null) port.setProperty(PORT_BORDER_OFFSET_KEY, portDesc.borderOffset)
        if (portDesc.labels.length > 0) {
          port.setLabels(portDesc.labels.map((l) => ({ text: l.text, position: { x: l.x, y: l.y }, size: { x: l.width, y: l.height } })))
        }
      }
      if (NODE_ACTIVATE[i]) {
        n.setProperty(INSIDE_SELF_LOOPS_ACTIVATE_KEY, true)
      }
      if (NODE_LABELS[i].length > 0) {
        n.setLabels(NODE_LABELS[i].map((l) => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })))
      }
      nodeOf.set(i, n)
    }
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      const parent = nodeOf.get(p)!
      const nested = nestedGraphs.get(p)!
      parent.setNestedGraph(nested)
      nested.setParentNode(parent)
      // ★ 容器节点 label 占位 (SSOT: LABEL_PAD[i] = 子图 padding.top, 对齐 buildLGraphFromParsed)
      if (LABEL_PAD[p] !== undefined && LABEL_PAD[p] !== null) nested.setPadding(LABEL_PAD[p])
      // ★ 节点级 mergeEdges → 嵌套图 (ELK createLGraph copyProperties; LGraphUtil.createPort 读图属性)
      if (NODE_OPTS[p]?.some(([k]) => k === 'org.eclipse.elk.layered.mergeEdges')) nested.setProperty(MERGE_EDGES_KEY, true)
    }
    __mergeEdges = false
    __defaultSide = PortSide.EAST
    if (__mergeEdges) graph.setProperty(MERGE_EDGES_KEY, true)
    // 边所在图 (LCA) 的 MERGE_EDGES (ELK ElkGraphImporter 源侧读边所在图; 目标侧读目标节点所在图).
    const __parentOf = new Map<number, number>()
    for (const [__p, __kids] of Object.entries(HIERARCHY)) for (const __k of __kids) __parentOf.set(__k, Number(__p))
    const __lcaMerge = (a: number, b: number): boolean => {
      const seen = new Set<number>()
      let x: number | undefined = a
      while (x !== undefined) { seen.add(x); x = __parentOf.get(x) }
      let y: number | undefined = b
      while (y !== undefined && !seen.has(y)) y = __parentOf.get(y)
      if (y === undefined) return graph.getProperty(MERGE_EDGES_KEY) === true
      const __py = __parentOf.get(y)
      const __g = __py === undefined ? graph : nestedGraphs.get(__py)!
      return __g.getProperty(MERGE_EDGES_KEY) === true
    }
    EDGE_IDX.forEach(([s, sp, , t, tp], ei) => {
      const __srcMerge = __lcaMerge(s, t)
      const __tgtMerge = nodeOf.get(t)!.getGraph()?.getProperty(MERGE_EDGES_KEY) === true
      const e = createSimpleEdge(nodeOf.get(s)!, nodeOf.get(t)!, sp, tp, __srcMerge, __tgtMerge)
      e.setProperty(MODEL_ORDER_KEY, ei)
      if (EDGE_YO[ei]) e.setProperty(INSIDE_SELF_LOOPS_YO_KEY, true)
      for (const l of EDGE_LABELS[ei]) {
        e.getLabels().push({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })
      }
    })
    if (Object.keys(HIERARCHY).length > 0) {
      graph.setProperty(HIERARCHY_HANDLING_KEY, 'INCLUDE_CHILDREN')
    }
    graph.setProperty(DIRECTION_KEY, 'RIGHT')
    graph.setProperty('org.eclipse.elk.algorithm', "layered")
    graph.setProperty('org.eclipse.elk.randomSeed', 1)

    new LayeredLayoutProvider().layout(graph)

    if (false) {
      for (const n of nodeOf.values()) {
        expect(Number.isFinite(n.position.x)).toBe(true)
        expect(Number.isFinite(n.position.y)).toBe(true)
      }
      return
    }

    // L1 (M3): 与 ELK Java 0.12.0 jar oracle 坐标级差分 (容差 ε = 2).
    // oracle 坐标相对父块 (jar getX/getY); ggn 子图节点坐标同样相对父 → 直接对比, 无需世界坐标累加.
    const oracle = JSON.parse(readFileSync(new URL('../../../test-resources/jar-oracle/examples__ports__allowNonFlowPortsToSwitchSides.json', import.meta.url), 'utf8'))
    expect(oracle.hash, 'jar oracle 过期/缺失, 请重跑 node scripts/generate-jar-oracle.mjs').toBe('bb4448cd3649b19c')
    // ELK 类加载顺序变体 (EdgeMain vs BatchMain): oracle.variants 记录另一变体, 任一匹配即通过.
    const variants = oracle.variants ?? []
    for (let i = 0; i < DIMS.length; i++) {
      const gn = nodeOf.get(i)!
      const nm = 'N' + NAMES[i]
      const cands = [oracle.coords[nm], ...variants.map((v) => v.coords[nm])].filter(Boolean)
      expect(cands.length, nm + ' 缺少 jar oracle 坐标').toBeGreaterThan(0)
      const bestX = Math.min(...cands.map((c) => Math.abs(gn.position.x - c.x)))
      const bestY = Math.min(...cands.map((c) => Math.abs(gn.position.y - c.y)))
      expect(bestX, nm + ' x').toBeLessThanOrEqual(2)
      expect(bestY, nm + ' y').toBeLessThanOrEqual(2)
    }
  })
})

/**
 * elkt 生成: examples__edges__insideSelfLoops
 * 图: 2 节点 / 4 边 / 0 层级块
 * 差分: 坐标级 (1:1 ELK 对齐)
 */

describe('elkt 生成: examples__edges__insideSelfLoops', () => {
  const HIERARCHY: Record<number, number[]> = {}
  const EDGE_IDX: [number, number | null, string | null, number, number | null, string | null][] = [[0,0,"p1",0,1,"p2"],[0,0,"p1",0,1,"p2"],[1,0,"p1",1,1,"p2"],[1,0,"p1",1,1,"p2"]]
  const EDGE_YO: boolean[] = [false,true,false,true]
  const EDGE_LABELS: { text: string; width: number; height: number; placement: string | null }[][] = [[],[],[],[]]
  const DIMS: [number, number][] = [[60,30],[200,100]]
  const NAMES: string[] = ["parent","parentWithSize"]
  const PORT_IDS: string[] = ["p1","p2"]
  const PORT_CONSTRAINTS: (string | null)[] = ["FIXED_SIDE","FIXED_SIDE"]
  const NODE_PORTS: { id: string; x: number; y: number; w: number; h: number; side: string | null; index: number | null; borderOffset: number | null; labels: { text: string; x: number; y: number; width: number; height: number }[] }[][] = [[{"id":"p1","x":0,"y":0,"w":8,"h":8,"side":"WEST","index":null,"borderOffset":null,"labels":[]},{"id":"p2","x":0,"y":0,"w":8,"h":8,"side":"EAST","index":null,"borderOffset":null,"labels":[]}],[{"id":"p1","x":0,"y":0,"w":8,"h":8,"side":"WEST","index":null,"borderOffset":null,"labels":[]},{"id":"p2","x":0,"y":0,"w":8,"h":8,"side":"EAST","index":null,"borderOffset":null,"labels":[]}]]
  const NODE_ACTIVATE: boolean[] = [true,true]
  const NODE_LABELS: { text: string; width: number; height: number; placement: string | null }[][] = [[],[]]
  const LABEL_PAD: ({ top: number; left: number; right: number; bottom: number } | null)[] = [null,null]
  const NODE_OPTS: [string, unknown][][] = [[],[["org.eclipse.elk.nodeSize.minimum",{"x":100,"y":50}],["org.eclipse.elk.nodeSize.constraints",["MINIMUM_SIZE"]]]]

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
      n.setProperty(MODEL_ORDER_KEY, i)
      if (PORT_CONSTRAINTS[i]) {
        n.setProperty(PORT_CONSTRAINTS_KEY, PORT_CONSTRAINTS[i] as any)
      }
      for (const [k, v] of NODE_OPTS[i]) {
        n.setProperty(k, v as any)
      }
      for (const portDesc of NODE_PORTS[i]) {
        const port = new LPort()
        port.setNode(n)
        port.getPosition().x = portDesc.x
        port.getPosition().y = portDesc.y
        port.size = { x: portDesc.w, y: portDesc.h }
        if (portDesc.side) port.setSide(portDesc.side as any)
        if (portDesc.index !== null) port.setProperty(PORT_INDEX_KEY, portDesc.index)
        if (portDesc.borderOffset !== null) port.setProperty(PORT_BORDER_OFFSET_KEY, portDesc.borderOffset)
        if (portDesc.labels.length > 0) {
          port.setLabels(portDesc.labels.map((l) => ({ text: l.text, position: { x: l.x, y: l.y }, size: { x: l.width, y: l.height } })))
        }
      }
      if (NODE_ACTIVATE[i]) {
        n.setProperty(INSIDE_SELF_LOOPS_ACTIVATE_KEY, true)
      }
      if (NODE_LABELS[i].length > 0) {
        n.setLabels(NODE_LABELS[i].map((l) => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })))
      }
      nodeOf.set(i, n)
      graphNodes.push(n)
    }
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      const parent = nodeOf.get(p)!
      const nested = nestedGraphs.get(p)!
      parent.setNestedGraph(nested)
      nested.setParentNode(parent)
      // ★ 容器节点 label 占位 (SSOT: LABEL_PAD[i] = 子图 padding.top, 对齐 buildLGraphFromParsed)
      if (LABEL_PAD[p] !== undefined && LABEL_PAD[p] !== null) nested.setPadding(LABEL_PAD[p])
      // ★ 节点级 mergeEdges → 嵌套图 (ELK createLGraph copyProperties; LGraphUtil.createPort 读图属性)
      if (NODE_OPTS[p]?.some(([k]) => k === 'org.eclipse.elk.layered.mergeEdges')) nested.setProperty(MERGE_EDGES_KEY, true)
    }
    __mergeEdges = false
    __defaultSide = PortSide.EAST
    if (__mergeEdges) graph.setProperty(MERGE_EDGES_KEY, true)
    // 边所在图 (LCA) 的 MERGE_EDGES (ELK ElkGraphImporter 源侧读边所在图; 目标侧读目标节点所在图).
    const __parentOf = new Map<number, number>()
    for (const [__p, __kids] of Object.entries(HIERARCHY)) for (const __k of __kids) __parentOf.set(__k, Number(__p))
    const __lcaMerge = (a: number, b: number): boolean => {
      const seen = new Set<number>()
      let x: number | undefined = a
      while (x !== undefined) { seen.add(x); x = __parentOf.get(x) }
      let y: number | undefined = b
      while (y !== undefined && !seen.has(y)) y = __parentOf.get(y)
      if (y === undefined) return graph.getProperty(MERGE_EDGES_KEY) === true
      const __py = __parentOf.get(y)
      const __g = __py === undefined ? graph : nestedGraphs.get(__py)!
      return __g.getProperty(MERGE_EDGES_KEY) === true
    }
    EDGE_IDX.forEach(([s, sp, , t, tp], ei) => {
      const __srcMerge = __lcaMerge(s, t)
      const __tgtMerge = nodeOf.get(t)!.getGraph()?.getProperty(MERGE_EDGES_KEY) === true
      const e = createSimpleEdge(nodeOf.get(s)!, nodeOf.get(t)!, sp, tp, __srcMerge, __tgtMerge)
      e.setProperty(MODEL_ORDER_KEY, ei)
      if (EDGE_YO[ei]) e.setProperty(INSIDE_SELF_LOOPS_YO_KEY, true)
      for (const l of EDGE_LABELS[ei]) {
        e.getLabels().push({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })
      }
    })
    if (Object.keys(HIERARCHY).length > 0) {
      graph.setProperty(HIERARCHY_HANDLING_KEY, 'INCLUDE_CHILDREN')
    }
    graph.setProperty(DIRECTION_KEY, 'RIGHT')
    graph.setProperty('org.eclipse.elk.randomSeed', 1)

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

  it('坐标级差分: 与 jar 0.12.0 1:1 对齐', () => {
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
      n.setProperty(MODEL_ORDER_KEY, i)
      if (PORT_CONSTRAINTS[i]) {
        n.setProperty(PORT_CONSTRAINTS_KEY, PORT_CONSTRAINTS[i] as any)
      }
      for (const [k, v] of NODE_OPTS[i]) {
        n.setProperty(k, v as any)
      }
      for (const portDesc of NODE_PORTS[i]) {
        const port = new LPort()
        port.setNode(n)
        port.getPosition().x = portDesc.x
        port.getPosition().y = portDesc.y
        port.size = { x: portDesc.w, y: portDesc.h }
        if (portDesc.side) port.setSide(portDesc.side as any)
        if (portDesc.index !== null) port.setProperty(PORT_INDEX_KEY, portDesc.index)
        if (portDesc.borderOffset !== null) port.setProperty(PORT_BORDER_OFFSET_KEY, portDesc.borderOffset)
        if (portDesc.labels.length > 0) {
          port.setLabels(portDesc.labels.map((l) => ({ text: l.text, position: { x: l.x, y: l.y }, size: { x: l.width, y: l.height } })))
        }
      }
      if (NODE_ACTIVATE[i]) {
        n.setProperty(INSIDE_SELF_LOOPS_ACTIVATE_KEY, true)
      }
      if (NODE_LABELS[i].length > 0) {
        n.setLabels(NODE_LABELS[i].map((l) => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })))
      }
      nodeOf.set(i, n)
    }
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      const parent = nodeOf.get(p)!
      const nested = nestedGraphs.get(p)!
      parent.setNestedGraph(nested)
      nested.setParentNode(parent)
      // ★ 容器节点 label 占位 (SSOT: LABEL_PAD[i] = 子图 padding.top, 对齐 buildLGraphFromParsed)
      if (LABEL_PAD[p] !== undefined && LABEL_PAD[p] !== null) nested.setPadding(LABEL_PAD[p])
      // ★ 节点级 mergeEdges → 嵌套图 (ELK createLGraph copyProperties; LGraphUtil.createPort 读图属性)
      if (NODE_OPTS[p]?.some(([k]) => k === 'org.eclipse.elk.layered.mergeEdges')) nested.setProperty(MERGE_EDGES_KEY, true)
    }
    __mergeEdges = false
    __defaultSide = PortSide.EAST
    if (__mergeEdges) graph.setProperty(MERGE_EDGES_KEY, true)
    // 边所在图 (LCA) 的 MERGE_EDGES (ELK ElkGraphImporter 源侧读边所在图; 目标侧读目标节点所在图).
    const __parentOf = new Map<number, number>()
    for (const [__p, __kids] of Object.entries(HIERARCHY)) for (const __k of __kids) __parentOf.set(__k, Number(__p))
    const __lcaMerge = (a: number, b: number): boolean => {
      const seen = new Set<number>()
      let x: number | undefined = a
      while (x !== undefined) { seen.add(x); x = __parentOf.get(x) }
      let y: number | undefined = b
      while (y !== undefined && !seen.has(y)) y = __parentOf.get(y)
      if (y === undefined) return graph.getProperty(MERGE_EDGES_KEY) === true
      const __py = __parentOf.get(y)
      const __g = __py === undefined ? graph : nestedGraphs.get(__py)!
      return __g.getProperty(MERGE_EDGES_KEY) === true
    }
    EDGE_IDX.forEach(([s, sp, , t, tp], ei) => {
      const __srcMerge = __lcaMerge(s, t)
      const __tgtMerge = nodeOf.get(t)!.getGraph()?.getProperty(MERGE_EDGES_KEY) === true
      const e = createSimpleEdge(nodeOf.get(s)!, nodeOf.get(t)!, sp, tp, __srcMerge, __tgtMerge)
      e.setProperty(MODEL_ORDER_KEY, ei)
      if (EDGE_YO[ei]) e.setProperty(INSIDE_SELF_LOOPS_YO_KEY, true)
      for (const l of EDGE_LABELS[ei]) {
        e.getLabels().push({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })
      }
    })
    if (Object.keys(HIERARCHY).length > 0) {
      graph.setProperty(HIERARCHY_HANDLING_KEY, 'INCLUDE_CHILDREN')
    }
    graph.setProperty(DIRECTION_KEY, 'RIGHT')
    graph.setProperty('org.eclipse.elk.randomSeed', 1)

    new LayeredLayoutProvider().layout(graph)

    if (false) {
      for (const n of nodeOf.values()) {
        expect(Number.isFinite(n.position.x)).toBe(true)
        expect(Number.isFinite(n.position.y)).toBe(true)
      }
      return
    }

    // L1 (M3): 与 ELK Java 0.12.0 jar oracle 坐标级差分 (容差 ε = 2).
    // oracle 坐标相对父块 (jar getX/getY); ggn 子图节点坐标同样相对父 → 直接对比, 无需世界坐标累加.
    const oracle = JSON.parse(readFileSync(new URL('../../../test-resources/jar-oracle/examples__edges__insideSelfLoops.json', import.meta.url), 'utf8'))
    expect(oracle.hash, 'jar oracle 过期/缺失, 请重跑 node scripts/generate-jar-oracle.mjs').toBe('d9ca028da6011059')
    // ELK 类加载顺序变体 (EdgeMain vs BatchMain): oracle.variants 记录另一变体, 任一匹配即通过.
    const variants = oracle.variants ?? []
    for (let i = 0; i < DIMS.length; i++) {
      const gn = nodeOf.get(i)!
      const nm = 'N' + NAMES[i]
      const cands = [oracle.coords[nm], ...variants.map((v) => v.coords[nm])].filter(Boolean)
      expect(cands.length, nm + ' 缺少 jar oracle 坐标').toBeGreaterThan(0)
      const bestX = Math.min(...cands.map((c) => Math.abs(gn.position.x - c.x)))
      const bestY = Math.min(...cands.map((c) => Math.abs(gn.position.y - c.y)))
      expect(bestX, nm + ' x').toBeLessThanOrEqual(2)
      expect(bestY, nm + ' y').toBeLessThanOrEqual(2)
    }
  })
})

/**
 * elkt 生成: examples__user-hints__interactive-constraints__interactiveLayeredLayout_nodeSizes
 * 图: 2 节点 / 0 边 / 0 层级块
 * 差分: 坐标级 (1:1 ELK 对齐)
 */

describe('elkt 生成: examples__user-hints__interactive-constraints__interactiveLayeredLayout_nodeSizes', () => {
  const HIERARCHY: Record<number, number[]> = {}
  const EDGE_IDX: [number, number | null, string | null, number, number | null, string | null][] = []
  const EDGE_YO: boolean[] = []
  const EDGE_LABELS: { text: string; width: number; height: number; placement: string | null }[][] = []
  const DIMS: [number, number][] = [[200,200],[60,30]]
  const NAMES: string[] = ["n1","n2"]
  const PORT_IDS: string[] = []
  const PORT_CONSTRAINTS: (string | null)[] = [null,null]
  const NODE_PORTS: { id: string; x: number; y: number; w: number; h: number; side: string | null; index: number | null; borderOffset: number | null; labels: { text: string; x: number; y: number; width: number; height: number }[] }[][] = [[],[]]
  const NODE_ACTIVATE: boolean[] = [false,false]
  const NODE_LABELS: { text: string; width: number; height: number; placement: string | null }[][] = [[{"text":"n1","width":0,"height":0,"placement":null}],[{"text":"n2","width":0,"height":0,"placement":null}]]
  const LABEL_PAD: ({ top: number; left: number; right: number; bottom: number } | null)[] = [null,null]
  const NODE_OPTS: [string, unknown][][] = [[["org.eclipse.elk.layered.crossingMinimization.positionChoiceConstraint",0]],[["org.eclipse.elk.layered.crossingMinimization.positionChoiceConstraint",1]]]

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
      n.setProperty(MODEL_ORDER_KEY, i)
      if (PORT_CONSTRAINTS[i]) {
        n.setProperty(PORT_CONSTRAINTS_KEY, PORT_CONSTRAINTS[i] as any)
      }
      for (const [k, v] of NODE_OPTS[i]) {
        n.setProperty(k, v as any)
      }
      for (const portDesc of NODE_PORTS[i]) {
        const port = new LPort()
        port.setNode(n)
        port.getPosition().x = portDesc.x
        port.getPosition().y = portDesc.y
        port.size = { x: portDesc.w, y: portDesc.h }
        if (portDesc.side) port.setSide(portDesc.side as any)
        if (portDesc.index !== null) port.setProperty(PORT_INDEX_KEY, portDesc.index)
        if (portDesc.borderOffset !== null) port.setProperty(PORT_BORDER_OFFSET_KEY, portDesc.borderOffset)
        if (portDesc.labels.length > 0) {
          port.setLabels(portDesc.labels.map((l) => ({ text: l.text, position: { x: l.x, y: l.y }, size: { x: l.width, y: l.height } })))
        }
      }
      if (NODE_ACTIVATE[i]) {
        n.setProperty(INSIDE_SELF_LOOPS_ACTIVATE_KEY, true)
      }
      if (NODE_LABELS[i].length > 0) {
        n.setLabels(NODE_LABELS[i].map((l) => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })))
      }
      nodeOf.set(i, n)
      graphNodes.push(n)
    }
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      const parent = nodeOf.get(p)!
      const nested = nestedGraphs.get(p)!
      parent.setNestedGraph(nested)
      nested.setParentNode(parent)
      // ★ 容器节点 label 占位 (SSOT: LABEL_PAD[i] = 子图 padding.top, 对齐 buildLGraphFromParsed)
      if (LABEL_PAD[p] !== undefined && LABEL_PAD[p] !== null) nested.setPadding(LABEL_PAD[p])
      // ★ 节点级 mergeEdges → 嵌套图 (ELK createLGraph copyProperties; LGraphUtil.createPort 读图属性)
      if (NODE_OPTS[p]?.some(([k]) => k === 'org.eclipse.elk.layered.mergeEdges')) nested.setProperty(MERGE_EDGES_KEY, true)
    }
    __mergeEdges = false
    __defaultSide = PortSide.EAST
    if (__mergeEdges) graph.setProperty(MERGE_EDGES_KEY, true)
    // 边所在图 (LCA) 的 MERGE_EDGES (ELK ElkGraphImporter 源侧读边所在图; 目标侧读目标节点所在图).
    const __parentOf = new Map<number, number>()
    for (const [__p, __kids] of Object.entries(HIERARCHY)) for (const __k of __kids) __parentOf.set(__k, Number(__p))
    const __lcaMerge = (a: number, b: number): boolean => {
      const seen = new Set<number>()
      let x: number | undefined = a
      while (x !== undefined) { seen.add(x); x = __parentOf.get(x) }
      let y: number | undefined = b
      while (y !== undefined && !seen.has(y)) y = __parentOf.get(y)
      if (y === undefined) return graph.getProperty(MERGE_EDGES_KEY) === true
      const __py = __parentOf.get(y)
      const __g = __py === undefined ? graph : nestedGraphs.get(__py)!
      return __g.getProperty(MERGE_EDGES_KEY) === true
    }
    EDGE_IDX.forEach(([s, sp, , t, tp], ei) => {
      const __srcMerge = __lcaMerge(s, t)
      const __tgtMerge = nodeOf.get(t)!.getGraph()?.getProperty(MERGE_EDGES_KEY) === true
      const e = createSimpleEdge(nodeOf.get(s)!, nodeOf.get(t)!, sp, tp, __srcMerge, __tgtMerge)
      e.setProperty(MODEL_ORDER_KEY, ei)
      if (EDGE_YO[ei]) e.setProperty(INSIDE_SELF_LOOPS_YO_KEY, true)
      for (const l of EDGE_LABELS[ei]) {
        e.getLabels().push({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })
      }
    })
    if (Object.keys(HIERARCHY).length > 0) {
      graph.setProperty(HIERARCHY_HANDLING_KEY, 'INCLUDE_CHILDREN')
    }
    graph.setProperty(DIRECTION_KEY, 'RIGHT')
    graph.setProperty('org.eclipse.elk.interactiveLayout', true)
    graph.setProperty('org.eclipse.elk.separateConnectedComponents', false)
    graph.setProperty('org.eclipse.elk.direction', "RIGHT")
    graph.setProperty('org.eclipse.elk.randomSeed', 1)

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

  it('坐标级差分: 与 jar 0.12.0 1:1 对齐', () => {
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
      n.setProperty(MODEL_ORDER_KEY, i)
      if (PORT_CONSTRAINTS[i]) {
        n.setProperty(PORT_CONSTRAINTS_KEY, PORT_CONSTRAINTS[i] as any)
      }
      for (const [k, v] of NODE_OPTS[i]) {
        n.setProperty(k, v as any)
      }
      for (const portDesc of NODE_PORTS[i]) {
        const port = new LPort()
        port.setNode(n)
        port.getPosition().x = portDesc.x
        port.getPosition().y = portDesc.y
        port.size = { x: portDesc.w, y: portDesc.h }
        if (portDesc.side) port.setSide(portDesc.side as any)
        if (portDesc.index !== null) port.setProperty(PORT_INDEX_KEY, portDesc.index)
        if (portDesc.borderOffset !== null) port.setProperty(PORT_BORDER_OFFSET_KEY, portDesc.borderOffset)
        if (portDesc.labels.length > 0) {
          port.setLabels(portDesc.labels.map((l) => ({ text: l.text, position: { x: l.x, y: l.y }, size: { x: l.width, y: l.height } })))
        }
      }
      if (NODE_ACTIVATE[i]) {
        n.setProperty(INSIDE_SELF_LOOPS_ACTIVATE_KEY, true)
      }
      if (NODE_LABELS[i].length > 0) {
        n.setLabels(NODE_LABELS[i].map((l) => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })))
      }
      nodeOf.set(i, n)
    }
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      const parent = nodeOf.get(p)!
      const nested = nestedGraphs.get(p)!
      parent.setNestedGraph(nested)
      nested.setParentNode(parent)
      // ★ 容器节点 label 占位 (SSOT: LABEL_PAD[i] = 子图 padding.top, 对齐 buildLGraphFromParsed)
      if (LABEL_PAD[p] !== undefined && LABEL_PAD[p] !== null) nested.setPadding(LABEL_PAD[p])
      // ★ 节点级 mergeEdges → 嵌套图 (ELK createLGraph copyProperties; LGraphUtil.createPort 读图属性)
      if (NODE_OPTS[p]?.some(([k]) => k === 'org.eclipse.elk.layered.mergeEdges')) nested.setProperty(MERGE_EDGES_KEY, true)
    }
    __mergeEdges = false
    __defaultSide = PortSide.EAST
    if (__mergeEdges) graph.setProperty(MERGE_EDGES_KEY, true)
    // 边所在图 (LCA) 的 MERGE_EDGES (ELK ElkGraphImporter 源侧读边所在图; 目标侧读目标节点所在图).
    const __parentOf = new Map<number, number>()
    for (const [__p, __kids] of Object.entries(HIERARCHY)) for (const __k of __kids) __parentOf.set(__k, Number(__p))
    const __lcaMerge = (a: number, b: number): boolean => {
      const seen = new Set<number>()
      let x: number | undefined = a
      while (x !== undefined) { seen.add(x); x = __parentOf.get(x) }
      let y: number | undefined = b
      while (y !== undefined && !seen.has(y)) y = __parentOf.get(y)
      if (y === undefined) return graph.getProperty(MERGE_EDGES_KEY) === true
      const __py = __parentOf.get(y)
      const __g = __py === undefined ? graph : nestedGraphs.get(__py)!
      return __g.getProperty(MERGE_EDGES_KEY) === true
    }
    EDGE_IDX.forEach(([s, sp, , t, tp], ei) => {
      const __srcMerge = __lcaMerge(s, t)
      const __tgtMerge = nodeOf.get(t)!.getGraph()?.getProperty(MERGE_EDGES_KEY) === true
      const e = createSimpleEdge(nodeOf.get(s)!, nodeOf.get(t)!, sp, tp, __srcMerge, __tgtMerge)
      e.setProperty(MODEL_ORDER_KEY, ei)
      if (EDGE_YO[ei]) e.setProperty(INSIDE_SELF_LOOPS_YO_KEY, true)
      for (const l of EDGE_LABELS[ei]) {
        e.getLabels().push({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })
      }
    })
    if (Object.keys(HIERARCHY).length > 0) {
      graph.setProperty(HIERARCHY_HANDLING_KEY, 'INCLUDE_CHILDREN')
    }
    graph.setProperty(DIRECTION_KEY, 'RIGHT')
    graph.setProperty('org.eclipse.elk.interactiveLayout', true)
    graph.setProperty('org.eclipse.elk.separateConnectedComponents', false)
    graph.setProperty('org.eclipse.elk.direction', "RIGHT")
    graph.setProperty('org.eclipse.elk.randomSeed', 1)

    new LayeredLayoutProvider().layout(graph)

    if (false) {
      for (const n of nodeOf.values()) {
        expect(Number.isFinite(n.position.x)).toBe(true)
        expect(Number.isFinite(n.position.y)).toBe(true)
      }
      return
    }

    // L1 (M3): 与 ELK Java 0.12.0 jar oracle 坐标级差分 (容差 ε = 2).
    // oracle 坐标相对父块 (jar getX/getY); ggn 子图节点坐标同样相对父 → 直接对比, 无需世界坐标累加.
    const oracle = JSON.parse(readFileSync(new URL('../../../test-resources/jar-oracle/examples__user-hints__interactive-constraints__interactiveLayeredLayout_nodeSizes.json', import.meta.url), 'utf8'))
    expect(oracle.hash, 'jar oracle 过期/缺失, 请重跑 node scripts/generate-jar-oracle.mjs').toBe('ef2638fb298750d6')
    // ELK 类加载顺序变体 (EdgeMain vs BatchMain): oracle.variants 记录另一变体, 任一匹配即通过.
    const variants = oracle.variants ?? []
    for (let i = 0; i < DIMS.length; i++) {
      const gn = nodeOf.get(i)!
      const nm = 'N' + NAMES[i]
      const cands = [oracle.coords[nm], ...variants.map((v) => v.coords[nm])].filter(Boolean)
      expect(cands.length, nm + ' 缺少 jar oracle 坐标').toBeGreaterThan(0)
      const bestX = Math.min(...cands.map((c) => Math.abs(gn.position.x - c.x)))
      const bestY = Math.min(...cands.map((c) => Math.abs(gn.position.y - c.y)))
      expect(bestX, nm + ' x').toBeLessThanOrEqual(2)
      expect(bestY, nm + ' y').toBeLessThanOrEqual(2)
    }
  })
})

/**
 * elkt 生成: examples__user-hints__interactive-constraints__interactiveLayereredLayout_layerConstraint
 * 图: 2 节点 / 1 边 / 0 层级块
 * 差分: 坐标级 (1:1 ELK 对齐)
 */

describe('elkt 生成: examples__user-hints__interactive-constraints__interactiveLayereredLayout_layerConstraint', () => {
  const HIERARCHY: Record<number, number[]> = {}
  const EDGE_IDX: [number, number | null, string | null, number, number | null, string | null][] = [[0,null,null,1,null,null]]
  const EDGE_YO: boolean[] = [false]
  const EDGE_LABELS: { text: string; width: number; height: number; placement: string | null }[][] = [[]]
  const DIMS: [number, number][] = [[60,30],[60,30]]
  const NAMES: string[] = ["n1","n2"]
  const PORT_IDS: string[] = []
  const PORT_CONSTRAINTS: (string | null)[] = [null,null]
  const NODE_PORTS: { id: string; x: number; y: number; w: number; h: number; side: string | null; index: number | null; borderOffset: number | null; labels: { text: string; x: number; y: number; width: number; height: number }[] }[][] = [[],[]]
  const NODE_ACTIVATE: boolean[] = [false,false]
  const NODE_LABELS: { text: string; width: number; height: number; placement: string | null }[][] = [[],[]]
  const LABEL_PAD: ({ top: number; left: number; right: number; bottom: number } | null)[] = [null,null]
  const NODE_OPTS: [string, unknown][][] = [[["org.eclipse.elk.layered.crossingMinimization.positionChoiceConstraint",0],["org.eclipse.elk.layered.layering.layerChoiceConstraint",999999999]],[]]

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
      n.setProperty(MODEL_ORDER_KEY, i)
      if (PORT_CONSTRAINTS[i]) {
        n.setProperty(PORT_CONSTRAINTS_KEY, PORT_CONSTRAINTS[i] as any)
      }
      for (const [k, v] of NODE_OPTS[i]) {
        n.setProperty(k, v as any)
      }
      for (const portDesc of NODE_PORTS[i]) {
        const port = new LPort()
        port.setNode(n)
        port.getPosition().x = portDesc.x
        port.getPosition().y = portDesc.y
        port.size = { x: portDesc.w, y: portDesc.h }
        if (portDesc.side) port.setSide(portDesc.side as any)
        if (portDesc.index !== null) port.setProperty(PORT_INDEX_KEY, portDesc.index)
        if (portDesc.borderOffset !== null) port.setProperty(PORT_BORDER_OFFSET_KEY, portDesc.borderOffset)
        if (portDesc.labels.length > 0) {
          port.setLabels(portDesc.labels.map((l) => ({ text: l.text, position: { x: l.x, y: l.y }, size: { x: l.width, y: l.height } })))
        }
      }
      if (NODE_ACTIVATE[i]) {
        n.setProperty(INSIDE_SELF_LOOPS_ACTIVATE_KEY, true)
      }
      if (NODE_LABELS[i].length > 0) {
        n.setLabels(NODE_LABELS[i].map((l) => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })))
      }
      nodeOf.set(i, n)
      graphNodes.push(n)
    }
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      const parent = nodeOf.get(p)!
      const nested = nestedGraphs.get(p)!
      parent.setNestedGraph(nested)
      nested.setParentNode(parent)
      // ★ 容器节点 label 占位 (SSOT: LABEL_PAD[i] = 子图 padding.top, 对齐 buildLGraphFromParsed)
      if (LABEL_PAD[p] !== undefined && LABEL_PAD[p] !== null) nested.setPadding(LABEL_PAD[p])
      // ★ 节点级 mergeEdges → 嵌套图 (ELK createLGraph copyProperties; LGraphUtil.createPort 读图属性)
      if (NODE_OPTS[p]?.some(([k]) => k === 'org.eclipse.elk.layered.mergeEdges')) nested.setProperty(MERGE_EDGES_KEY, true)
    }
    __mergeEdges = false
    __defaultSide = PortSide.EAST
    if (__mergeEdges) graph.setProperty(MERGE_EDGES_KEY, true)
    // 边所在图 (LCA) 的 MERGE_EDGES (ELK ElkGraphImporter 源侧读边所在图; 目标侧读目标节点所在图).
    const __parentOf = new Map<number, number>()
    for (const [__p, __kids] of Object.entries(HIERARCHY)) for (const __k of __kids) __parentOf.set(__k, Number(__p))
    const __lcaMerge = (a: number, b: number): boolean => {
      const seen = new Set<number>()
      let x: number | undefined = a
      while (x !== undefined) { seen.add(x); x = __parentOf.get(x) }
      let y: number | undefined = b
      while (y !== undefined && !seen.has(y)) y = __parentOf.get(y)
      if (y === undefined) return graph.getProperty(MERGE_EDGES_KEY) === true
      const __py = __parentOf.get(y)
      const __g = __py === undefined ? graph : nestedGraphs.get(__py)!
      return __g.getProperty(MERGE_EDGES_KEY) === true
    }
    EDGE_IDX.forEach(([s, sp, , t, tp], ei) => {
      const __srcMerge = __lcaMerge(s, t)
      const __tgtMerge = nodeOf.get(t)!.getGraph()?.getProperty(MERGE_EDGES_KEY) === true
      const e = createSimpleEdge(nodeOf.get(s)!, nodeOf.get(t)!, sp, tp, __srcMerge, __tgtMerge)
      e.setProperty(MODEL_ORDER_KEY, ei)
      if (EDGE_YO[ei]) e.setProperty(INSIDE_SELF_LOOPS_YO_KEY, true)
      for (const l of EDGE_LABELS[ei]) {
        e.getLabels().push({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })
      }
    })
    if (Object.keys(HIERARCHY).length > 0) {
      graph.setProperty(HIERARCHY_HANDLING_KEY, 'INCLUDE_CHILDREN')
    }
    graph.setProperty(DIRECTION_KEY, 'RIGHT')
    graph.setProperty('org.eclipse.elk.interactiveLayout', true)
    graph.setProperty('org.eclipse.elk.direction', "RIGHT")
    graph.setProperty('org.eclipse.elk.randomSeed', 1)

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

  it('坐标级差分: 与 jar 0.12.0 1:1 对齐', () => {
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
      n.setProperty(MODEL_ORDER_KEY, i)
      if (PORT_CONSTRAINTS[i]) {
        n.setProperty(PORT_CONSTRAINTS_KEY, PORT_CONSTRAINTS[i] as any)
      }
      for (const [k, v] of NODE_OPTS[i]) {
        n.setProperty(k, v as any)
      }
      for (const portDesc of NODE_PORTS[i]) {
        const port = new LPort()
        port.setNode(n)
        port.getPosition().x = portDesc.x
        port.getPosition().y = portDesc.y
        port.size = { x: portDesc.w, y: portDesc.h }
        if (portDesc.side) port.setSide(portDesc.side as any)
        if (portDesc.index !== null) port.setProperty(PORT_INDEX_KEY, portDesc.index)
        if (portDesc.borderOffset !== null) port.setProperty(PORT_BORDER_OFFSET_KEY, portDesc.borderOffset)
        if (portDesc.labels.length > 0) {
          port.setLabels(portDesc.labels.map((l) => ({ text: l.text, position: { x: l.x, y: l.y }, size: { x: l.width, y: l.height } })))
        }
      }
      if (NODE_ACTIVATE[i]) {
        n.setProperty(INSIDE_SELF_LOOPS_ACTIVATE_KEY, true)
      }
      if (NODE_LABELS[i].length > 0) {
        n.setLabels(NODE_LABELS[i].map((l) => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })))
      }
      nodeOf.set(i, n)
    }
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      const parent = nodeOf.get(p)!
      const nested = nestedGraphs.get(p)!
      parent.setNestedGraph(nested)
      nested.setParentNode(parent)
      // ★ 容器节点 label 占位 (SSOT: LABEL_PAD[i] = 子图 padding.top, 对齐 buildLGraphFromParsed)
      if (LABEL_PAD[p] !== undefined && LABEL_PAD[p] !== null) nested.setPadding(LABEL_PAD[p])
      // ★ 节点级 mergeEdges → 嵌套图 (ELK createLGraph copyProperties; LGraphUtil.createPort 读图属性)
      if (NODE_OPTS[p]?.some(([k]) => k === 'org.eclipse.elk.layered.mergeEdges')) nested.setProperty(MERGE_EDGES_KEY, true)
    }
    __mergeEdges = false
    __defaultSide = PortSide.EAST
    if (__mergeEdges) graph.setProperty(MERGE_EDGES_KEY, true)
    // 边所在图 (LCA) 的 MERGE_EDGES (ELK ElkGraphImporter 源侧读边所在图; 目标侧读目标节点所在图).
    const __parentOf = new Map<number, number>()
    for (const [__p, __kids] of Object.entries(HIERARCHY)) for (const __k of __kids) __parentOf.set(__k, Number(__p))
    const __lcaMerge = (a: number, b: number): boolean => {
      const seen = new Set<number>()
      let x: number | undefined = a
      while (x !== undefined) { seen.add(x); x = __parentOf.get(x) }
      let y: number | undefined = b
      while (y !== undefined && !seen.has(y)) y = __parentOf.get(y)
      if (y === undefined) return graph.getProperty(MERGE_EDGES_KEY) === true
      const __py = __parentOf.get(y)
      const __g = __py === undefined ? graph : nestedGraphs.get(__py)!
      return __g.getProperty(MERGE_EDGES_KEY) === true
    }
    EDGE_IDX.forEach(([s, sp, , t, tp], ei) => {
      const __srcMerge = __lcaMerge(s, t)
      const __tgtMerge = nodeOf.get(t)!.getGraph()?.getProperty(MERGE_EDGES_KEY) === true
      const e = createSimpleEdge(nodeOf.get(s)!, nodeOf.get(t)!, sp, tp, __srcMerge, __tgtMerge)
      e.setProperty(MODEL_ORDER_KEY, ei)
      if (EDGE_YO[ei]) e.setProperty(INSIDE_SELF_LOOPS_YO_KEY, true)
      for (const l of EDGE_LABELS[ei]) {
        e.getLabels().push({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })
      }
    })
    if (Object.keys(HIERARCHY).length > 0) {
      graph.setProperty(HIERARCHY_HANDLING_KEY, 'INCLUDE_CHILDREN')
    }
    graph.setProperty(DIRECTION_KEY, 'RIGHT')
    graph.setProperty('org.eclipse.elk.interactiveLayout', true)
    graph.setProperty('org.eclipse.elk.direction', "RIGHT")
    graph.setProperty('org.eclipse.elk.randomSeed', 1)

    new LayeredLayoutProvider().layout(graph)

    if (false) {
      for (const n of nodeOf.values()) {
        expect(Number.isFinite(n.position.x)).toBe(true)
        expect(Number.isFinite(n.position.y)).toBe(true)
      }
      return
    }

    // L1 (M3): 与 ELK Java 0.12.0 jar oracle 坐标级差分 (容差 ε = 2).
    // oracle 坐标相对父块 (jar getX/getY); ggn 子图节点坐标同样相对父 → 直接对比, 无需世界坐标累加.
    const oracle = JSON.parse(readFileSync(new URL('../../../test-resources/jar-oracle/examples__user-hints__interactive-constraints__interactiveLayereredLayout_layerConstraint.json', import.meta.url), 'utf8'))
    expect(oracle.hash, 'jar oracle 过期/缺失, 请重跑 node scripts/generate-jar-oracle.mjs').toBe('e16086d72a997915')
    // ELK 类加载顺序变体 (EdgeMain vs BatchMain): oracle.variants 记录另一变体, 任一匹配即通过.
    const variants = oracle.variants ?? []
    for (let i = 0; i < DIMS.length; i++) {
      const gn = nodeOf.get(i)!
      const nm = 'N' + NAMES[i]
      const cands = [oracle.coords[nm], ...variants.map((v) => v.coords[nm])].filter(Boolean)
      expect(cands.length, nm + ' 缺少 jar oracle 坐标').toBeGreaterThan(0)
      const bestX = Math.min(...cands.map((c) => Math.abs(gn.position.x - c.x)))
      const bestY = Math.min(...cands.map((c) => Math.abs(gn.position.y - c.y)))
      expect(bestX, nm + ' x').toBeLessThanOrEqual(2)
      expect(bestY, nm + ' y').toBeLessThanOrEqual(2)
    }
  })
})

/**
 * elkt 生成: examples__user-hints__interactive-constraints__interactiveLayeredLayout_hierarchy_pseudo_positions
 * 图: 4 节点 / 2 边 / 0 层级块
 * 差分: 坐标级 (1:1 ELK 对齐)
 */

describe('elkt 生成: examples__user-hints__interactive-constraints__interactiveLayeredLayout_hierarchy_pseudo_positions', () => {
  const HIERARCHY: Record<number, number[]> = {"1":[2,3]}
  const EDGE_IDX: [number, number | null, string | null, number, number | null, string | null][] = [[2,null,null,3,null,null],[0,null,null,1,null,null]]
  const EDGE_YO: boolean[] = [false,false]
  const EDGE_LABELS: { text: string; width: number; height: number; placement: string | null }[][] = [[],[]]
  const DIMS: [number, number][] = [[60,30],[60,30],[60,30],[60,30]]
  const NAMES: string[] = ["n1","n2","n2.n2_1","n2.n2_2"]
  const PORT_IDS: string[] = []
  const PORT_CONSTRAINTS: (string | null)[] = [null,null,null,null]
  const NODE_PORTS: { id: string; x: number; y: number; w: number; h: number; side: string | null; index: number | null; borderOffset: number | null; labels: { text: string; x: number; y: number; width: number; height: number }[] }[][] = [[],[],[],[]]
  const NODE_ACTIVATE: boolean[] = [false,false,false,false]
  const NODE_LABELS: { text: string; width: number; height: number; placement: string | null }[][] = [[{"text":"n1","width":0,"height":0,"placement":null}],[{"text":"n2","width":0,"height":0,"placement":null}],[{"text":"n2_1","width":0,"height":0,"placement":null}],[{"text":"n2_2","width":0,"height":0,"placement":null}]]
  const LABEL_PAD: ({ top: number; left: number; right: number; bottom: number } | null)[] = [null,{"top":12,"bottom":12,"left":12,"right":12},null,null]
  const NODE_OPTS: [string, unknown][][] = [[],[["org.eclipse.elk.direction","RIGHT"],["org.eclipse.elk.layered.cycleBreaking.strategy","INTERACTIVE"],["org.eclipse.elk.layered.layering.strategy","INTERACTIVE"]],[],[["org.eclipse.elk.layered.layering.layerChoiceConstraint",0]]]

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
      n.setProperty(MODEL_ORDER_KEY, i)
      if (PORT_CONSTRAINTS[i]) {
        n.setProperty(PORT_CONSTRAINTS_KEY, PORT_CONSTRAINTS[i] as any)
      }
      for (const [k, v] of NODE_OPTS[i]) {
        n.setProperty(k, v as any)
      }
      for (const portDesc of NODE_PORTS[i]) {
        const port = new LPort()
        port.setNode(n)
        port.getPosition().x = portDesc.x
        port.getPosition().y = portDesc.y
        port.size = { x: portDesc.w, y: portDesc.h }
        if (portDesc.side) port.setSide(portDesc.side as any)
        if (portDesc.index !== null) port.setProperty(PORT_INDEX_KEY, portDesc.index)
        if (portDesc.borderOffset !== null) port.setProperty(PORT_BORDER_OFFSET_KEY, portDesc.borderOffset)
        if (portDesc.labels.length > 0) {
          port.setLabels(portDesc.labels.map((l) => ({ text: l.text, position: { x: l.x, y: l.y }, size: { x: l.width, y: l.height } })))
        }
      }
      if (NODE_ACTIVATE[i]) {
        n.setProperty(INSIDE_SELF_LOOPS_ACTIVATE_KEY, true)
      }
      if (NODE_LABELS[i].length > 0) {
        n.setLabels(NODE_LABELS[i].map((l) => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })))
      }
      nodeOf.set(i, n)
      graphNodes.push(n)
    }
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      const parent = nodeOf.get(p)!
      const nested = nestedGraphs.get(p)!
      parent.setNestedGraph(nested)
      nested.setParentNode(parent)
      // ★ 容器节点 label 占位 (SSOT: LABEL_PAD[i] = 子图 padding.top, 对齐 buildLGraphFromParsed)
      if (LABEL_PAD[p] !== undefined && LABEL_PAD[p] !== null) nested.setPadding(LABEL_PAD[p])
      // ★ 节点级 mergeEdges → 嵌套图 (ELK createLGraph copyProperties; LGraphUtil.createPort 读图属性)
      if (NODE_OPTS[p]?.some(([k]) => k === 'org.eclipse.elk.layered.mergeEdges')) nested.setProperty(MERGE_EDGES_KEY, true)
    }
    __mergeEdges = false
    __defaultSide = PortSide.EAST
    if (__mergeEdges) graph.setProperty(MERGE_EDGES_KEY, true)
    // 边所在图 (LCA) 的 MERGE_EDGES (ELK ElkGraphImporter 源侧读边所在图; 目标侧读目标节点所在图).
    const __parentOf = new Map<number, number>()
    for (const [__p, __kids] of Object.entries(HIERARCHY)) for (const __k of __kids) __parentOf.set(__k, Number(__p))
    const __lcaMerge = (a: number, b: number): boolean => {
      const seen = new Set<number>()
      let x: number | undefined = a
      while (x !== undefined) { seen.add(x); x = __parentOf.get(x) }
      let y: number | undefined = b
      while (y !== undefined && !seen.has(y)) y = __parentOf.get(y)
      if (y === undefined) return graph.getProperty(MERGE_EDGES_KEY) === true
      const __py = __parentOf.get(y)
      const __g = __py === undefined ? graph : nestedGraphs.get(__py)!
      return __g.getProperty(MERGE_EDGES_KEY) === true
    }
    EDGE_IDX.forEach(([s, sp, , t, tp], ei) => {
      const __srcMerge = __lcaMerge(s, t)
      const __tgtMerge = nodeOf.get(t)!.getGraph()?.getProperty(MERGE_EDGES_KEY) === true
      const e = createSimpleEdge(nodeOf.get(s)!, nodeOf.get(t)!, sp, tp, __srcMerge, __tgtMerge)
      e.setProperty(MODEL_ORDER_KEY, ei)
      if (EDGE_YO[ei]) e.setProperty(INSIDE_SELF_LOOPS_YO_KEY, true)
      for (const l of EDGE_LABELS[ei]) {
        e.getLabels().push({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })
      }
    })
    if (Object.keys(HIERARCHY).length > 0) {
      graph.setProperty(HIERARCHY_HANDLING_KEY, 'INCLUDE_CHILDREN')
    }
    graph.setProperty(DIRECTION_KEY, 'RIGHT')
    graph.setProperty('org.eclipse.elk.direction', "RIGHT")
    graph.setProperty('org.eclipse.elk.layered.cycleBreaking.strategy', "INTERACTIVE")
    graph.setProperty('org.eclipse.elk.layered.layering.strategy', "INTERACTIVE")
    graph.setProperty('org.eclipse.elk.randomSeed', 1)

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

  it('坐标级差分: 与 jar 0.12.0 1:1 对齐', () => {
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
      n.setProperty(MODEL_ORDER_KEY, i)
      if (PORT_CONSTRAINTS[i]) {
        n.setProperty(PORT_CONSTRAINTS_KEY, PORT_CONSTRAINTS[i] as any)
      }
      for (const [k, v] of NODE_OPTS[i]) {
        n.setProperty(k, v as any)
      }
      for (const portDesc of NODE_PORTS[i]) {
        const port = new LPort()
        port.setNode(n)
        port.getPosition().x = portDesc.x
        port.getPosition().y = portDesc.y
        port.size = { x: portDesc.w, y: portDesc.h }
        if (portDesc.side) port.setSide(portDesc.side as any)
        if (portDesc.index !== null) port.setProperty(PORT_INDEX_KEY, portDesc.index)
        if (portDesc.borderOffset !== null) port.setProperty(PORT_BORDER_OFFSET_KEY, portDesc.borderOffset)
        if (portDesc.labels.length > 0) {
          port.setLabels(portDesc.labels.map((l) => ({ text: l.text, position: { x: l.x, y: l.y }, size: { x: l.width, y: l.height } })))
        }
      }
      if (NODE_ACTIVATE[i]) {
        n.setProperty(INSIDE_SELF_LOOPS_ACTIVATE_KEY, true)
      }
      if (NODE_LABELS[i].length > 0) {
        n.setLabels(NODE_LABELS[i].map((l) => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })))
      }
      nodeOf.set(i, n)
    }
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      const parent = nodeOf.get(p)!
      const nested = nestedGraphs.get(p)!
      parent.setNestedGraph(nested)
      nested.setParentNode(parent)
      // ★ 容器节点 label 占位 (SSOT: LABEL_PAD[i] = 子图 padding.top, 对齐 buildLGraphFromParsed)
      if (LABEL_PAD[p] !== undefined && LABEL_PAD[p] !== null) nested.setPadding(LABEL_PAD[p])
      // ★ 节点级 mergeEdges → 嵌套图 (ELK createLGraph copyProperties; LGraphUtil.createPort 读图属性)
      if (NODE_OPTS[p]?.some(([k]) => k === 'org.eclipse.elk.layered.mergeEdges')) nested.setProperty(MERGE_EDGES_KEY, true)
    }
    __mergeEdges = false
    __defaultSide = PortSide.EAST
    if (__mergeEdges) graph.setProperty(MERGE_EDGES_KEY, true)
    // 边所在图 (LCA) 的 MERGE_EDGES (ELK ElkGraphImporter 源侧读边所在图; 目标侧读目标节点所在图).
    const __parentOf = new Map<number, number>()
    for (const [__p, __kids] of Object.entries(HIERARCHY)) for (const __k of __kids) __parentOf.set(__k, Number(__p))
    const __lcaMerge = (a: number, b: number): boolean => {
      const seen = new Set<number>()
      let x: number | undefined = a
      while (x !== undefined) { seen.add(x); x = __parentOf.get(x) }
      let y: number | undefined = b
      while (y !== undefined && !seen.has(y)) y = __parentOf.get(y)
      if (y === undefined) return graph.getProperty(MERGE_EDGES_KEY) === true
      const __py = __parentOf.get(y)
      const __g = __py === undefined ? graph : nestedGraphs.get(__py)!
      return __g.getProperty(MERGE_EDGES_KEY) === true
    }
    EDGE_IDX.forEach(([s, sp, , t, tp], ei) => {
      const __srcMerge = __lcaMerge(s, t)
      const __tgtMerge = nodeOf.get(t)!.getGraph()?.getProperty(MERGE_EDGES_KEY) === true
      const e = createSimpleEdge(nodeOf.get(s)!, nodeOf.get(t)!, sp, tp, __srcMerge, __tgtMerge)
      e.setProperty(MODEL_ORDER_KEY, ei)
      if (EDGE_YO[ei]) e.setProperty(INSIDE_SELF_LOOPS_YO_KEY, true)
      for (const l of EDGE_LABELS[ei]) {
        e.getLabels().push({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })
      }
    })
    if (Object.keys(HIERARCHY).length > 0) {
      graph.setProperty(HIERARCHY_HANDLING_KEY, 'INCLUDE_CHILDREN')
    }
    graph.setProperty(DIRECTION_KEY, 'RIGHT')
    graph.setProperty('org.eclipse.elk.direction', "RIGHT")
    graph.setProperty('org.eclipse.elk.layered.cycleBreaking.strategy', "INTERACTIVE")
    graph.setProperty('org.eclipse.elk.layered.layering.strategy', "INTERACTIVE")
    graph.setProperty('org.eclipse.elk.randomSeed', 1)

    new LayeredLayoutProvider().layout(graph)

    if (false) {
      for (const n of nodeOf.values()) {
        expect(Number.isFinite(n.position.x)).toBe(true)
        expect(Number.isFinite(n.position.y)).toBe(true)
      }
      return
    }

    // L1 (M3): 与 ELK Java 0.12.0 jar oracle 坐标级差分 (容差 ε = 2).
    // oracle 坐标相对父块 (jar getX/getY); ggn 子图节点坐标同样相对父 → 直接对比, 无需世界坐标累加.
    const oracle = JSON.parse(readFileSync(new URL('../../../test-resources/jar-oracle/examples__user-hints__interactive-constraints__interactiveLayeredLayout_hierarchy_pseudo_positions.json', import.meta.url), 'utf8'))
    expect(oracle.hash, 'jar oracle 过期/缺失, 请重跑 node scripts/generate-jar-oracle.mjs').toBe('73be273c8a3eeb39')
    // ELK 类加载顺序变体 (EdgeMain vs BatchMain): oracle.variants 记录另一变体, 任一匹配即通过.
    const variants = oracle.variants ?? []
    for (let i = 0; i < DIMS.length; i++) {
      const gn = nodeOf.get(i)!
      const nm = 'N' + NAMES[i]
      const cands = [oracle.coords[nm], ...variants.map((v) => v.coords[nm])].filter(Boolean)
      expect(cands.length, nm + ' 缺少 jar oracle 坐标').toBeGreaterThan(0)
      const bestX = Math.min(...cands.map((c) => Math.abs(gn.position.x - c.x)))
      const bestY = Math.min(...cands.map((c) => Math.abs(gn.position.y - c.y)))
      expect(bestX, nm + ' x').toBeLessThanOrEqual(2)
      expect(bestY, nm + ' y').toBeLessThanOrEqual(2)
    }
  })
})

describe('elkt 生成: examples__user-hints__interactive-constraints__interactiveRectpacking_oneBigNode', () => {
  // 含非 layered 算法 (stress/force): P2 图级路径不适用, 差分由 verify-elkg-java-layout (api 路径) 覆盖.
  it.skip('差分由 verify api 路径覆盖 (stress/force)', () => {})
})
/**
 * elkt 生成: examples__user-hints__interactive-constraints__interactiveLayeredLayout_hierarchyDirection
 * 图: 14 节点 / 8 边 / 0 层级块
 * 差分: 坐标级 (1:1 ELK 对齐)
 */

describe('elkt 生成: examples__user-hints__interactive-constraints__interactiveLayeredLayout_hierarchyDirection', () => {
  const HIERARCHY: Record<number, number[]> = {"0":[1,4],"1":[2,3],"9":[10,13],"10":[11,12]}
  const EDGE_IDX: [number, number | null, string | null, number, number | null, string | null][] = [[2,null,null,3,null,null],[5,null,null,9,null,null],[0,null,null,9,null,null],[7,null,null,9,null,null],[0,null,null,6,null,null],[9,null,null,6,null,null],[5,null,null,8,null,null],[8,null,null,0,null,null]]
  const EDGE_YO: boolean[] = [false,false,false,false,false,false,false,false]
  const EDGE_LABELS: { text: string; width: number; height: number; placement: string | null }[][] = [[],[],[],[],[],[],[],[]]
  const DIMS: [number, number][] = [[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30]]
  const NAMES: string[] = ["n1","n1.n11","n1.n11.n111","n1.n11.n112","n1.n12","n2","n3","n4","n5","n6","n6.n61","n6.n61.n611","n6.n61.n612","n6.n62"]
  const PORT_IDS: string[] = []
  const PORT_CONSTRAINTS: (string | null)[] = [null,null,null,null,null,null,null,null,null,null,null,null,null,null]
  const NODE_PORTS: { id: string; x: number; y: number; w: number; h: number; side: string | null; index: number | null; borderOffset: number | null; labels: { text: string; x: number; y: number; width: number; height: number }[] }[][] = [[],[],[],[],[],[],[],[],[],[],[],[],[],[]]
  const NODE_ACTIVATE: boolean[] = [false,false,false,false,false,false,false,false,false,false,false,false,false,false]
  const NODE_LABELS: { text: string; width: number; height: number; placement: string | null }[][] = [[{"text":"n1","width":0,"height":0,"placement":null}],[{"text":"n11","width":0,"height":0,"placement":null}],[{"text":"n111","width":0,"height":0,"placement":null}],[{"text":"n112","width":0,"height":0,"placement":null}],[{"text":"n12","width":0,"height":0,"placement":null}],[{"text":"n2","width":0,"height":0,"placement":null}],[{"text":"n3","width":0,"height":0,"placement":null}],[{"text":"n4","width":0,"height":0,"placement":null}],[{"text":"n5","width":0,"height":0,"placement":null}],[{"text":"n6","width":0,"height":0,"placement":null}],[{"text":"n61","width":0,"height":0,"placement":null}],[{"text":"n611","width":0,"height":0,"placement":null}],[{"text":"n612","width":0,"height":0,"placement":null}],[{"text":"n62","width":0,"height":0,"placement":null}]]
  const LABEL_PAD: ({ top: number; left: number; right: number; bottom: number } | null)[] = [{"top":12,"bottom":12,"left":12,"right":12},{"top":12,"bottom":12,"left":12,"right":12},null,null,null,null,null,null,null,{"top":12,"bottom":12,"left":12,"right":12},{"top":12,"bottom":12,"left":12,"right":12},null,null,null]
  const NODE_OPTS: [string, unknown][][] = [[["org.eclipse.elk.interactiveLayout",true],["org.eclipse.elk.direction","DOWN"],["org.eclipse.elk.separateConnectedComponents",false]],[["org.eclipse.elk.interactiveLayout",true],["org.eclipse.elk.direction","UP"]],[],[],[["org.eclipse.elk.layered.crossingMinimization.positionChoiceConstraint",0]],[],[],[],[],[["org.eclipse.elk.interactiveLayout",true],["org.eclipse.elk.separateConnectedComponents",false],["org.eclipse.elk.direction","LEFT"]],[["org.eclipse.elk.interactiveLayout",true],["org.eclipse.elk.direction","RIGHT"]],[],[],[["org.eclipse.elk.layered.layering.layerChoiceConstraint",1]]]

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
      n.setProperty(MODEL_ORDER_KEY, i)
      if (PORT_CONSTRAINTS[i]) {
        n.setProperty(PORT_CONSTRAINTS_KEY, PORT_CONSTRAINTS[i] as any)
      }
      for (const [k, v] of NODE_OPTS[i]) {
        n.setProperty(k, v as any)
      }
      for (const portDesc of NODE_PORTS[i]) {
        const port = new LPort()
        port.setNode(n)
        port.getPosition().x = portDesc.x
        port.getPosition().y = portDesc.y
        port.size = { x: portDesc.w, y: portDesc.h }
        if (portDesc.side) port.setSide(portDesc.side as any)
        if (portDesc.index !== null) port.setProperty(PORT_INDEX_KEY, portDesc.index)
        if (portDesc.borderOffset !== null) port.setProperty(PORT_BORDER_OFFSET_KEY, portDesc.borderOffset)
        if (portDesc.labels.length > 0) {
          port.setLabels(portDesc.labels.map((l) => ({ text: l.text, position: { x: l.x, y: l.y }, size: { x: l.width, y: l.height } })))
        }
      }
      if (NODE_ACTIVATE[i]) {
        n.setProperty(INSIDE_SELF_LOOPS_ACTIVATE_KEY, true)
      }
      if (NODE_LABELS[i].length > 0) {
        n.setLabels(NODE_LABELS[i].map((l) => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })))
      }
      nodeOf.set(i, n)
      graphNodes.push(n)
    }
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      const parent = nodeOf.get(p)!
      const nested = nestedGraphs.get(p)!
      parent.setNestedGraph(nested)
      nested.setParentNode(parent)
      // ★ 容器节点 label 占位 (SSOT: LABEL_PAD[i] = 子图 padding.top, 对齐 buildLGraphFromParsed)
      if (LABEL_PAD[p] !== undefined && LABEL_PAD[p] !== null) nested.setPadding(LABEL_PAD[p])
      // ★ 节点级 mergeEdges → 嵌套图 (ELK createLGraph copyProperties; LGraphUtil.createPort 读图属性)
      if (NODE_OPTS[p]?.some(([k]) => k === 'org.eclipse.elk.layered.mergeEdges')) nested.setProperty(MERGE_EDGES_KEY, true)
    }
    __mergeEdges = false
    __defaultSide = PortSide.EAST
    if (__mergeEdges) graph.setProperty(MERGE_EDGES_KEY, true)
    // 边所在图 (LCA) 的 MERGE_EDGES (ELK ElkGraphImporter 源侧读边所在图; 目标侧读目标节点所在图).
    const __parentOf = new Map<number, number>()
    for (const [__p, __kids] of Object.entries(HIERARCHY)) for (const __k of __kids) __parentOf.set(__k, Number(__p))
    const __lcaMerge = (a: number, b: number): boolean => {
      const seen = new Set<number>()
      let x: number | undefined = a
      while (x !== undefined) { seen.add(x); x = __parentOf.get(x) }
      let y: number | undefined = b
      while (y !== undefined && !seen.has(y)) y = __parentOf.get(y)
      if (y === undefined) return graph.getProperty(MERGE_EDGES_KEY) === true
      const __py = __parentOf.get(y)
      const __g = __py === undefined ? graph : nestedGraphs.get(__py)!
      return __g.getProperty(MERGE_EDGES_KEY) === true
    }
    EDGE_IDX.forEach(([s, sp, , t, tp], ei) => {
      const __srcMerge = __lcaMerge(s, t)
      const __tgtMerge = nodeOf.get(t)!.getGraph()?.getProperty(MERGE_EDGES_KEY) === true
      const e = createSimpleEdge(nodeOf.get(s)!, nodeOf.get(t)!, sp, tp, __srcMerge, __tgtMerge)
      e.setProperty(MODEL_ORDER_KEY, ei)
      if (EDGE_YO[ei]) e.setProperty(INSIDE_SELF_LOOPS_YO_KEY, true)
      for (const l of EDGE_LABELS[ei]) {
        e.getLabels().push({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })
      }
    })
    if (Object.keys(HIERARCHY).length > 0) {
      graph.setProperty(HIERARCHY_HANDLING_KEY, 'INCLUDE_CHILDREN')
    }
    graph.setProperty(DIRECTION_KEY, 'RIGHT')
    graph.setProperty('org.eclipse.elk.interactiveLayout', true)
    graph.setProperty('org.eclipse.elk.direction', "RIGHT")
    graph.setProperty('org.eclipse.elk.randomSeed', 1)

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

  it('坐标级差分: 与 jar 0.12.0 1:1 对齐', () => {
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
      n.setProperty(MODEL_ORDER_KEY, i)
      if (PORT_CONSTRAINTS[i]) {
        n.setProperty(PORT_CONSTRAINTS_KEY, PORT_CONSTRAINTS[i] as any)
      }
      for (const [k, v] of NODE_OPTS[i]) {
        n.setProperty(k, v as any)
      }
      for (const portDesc of NODE_PORTS[i]) {
        const port = new LPort()
        port.setNode(n)
        port.getPosition().x = portDesc.x
        port.getPosition().y = portDesc.y
        port.size = { x: portDesc.w, y: portDesc.h }
        if (portDesc.side) port.setSide(portDesc.side as any)
        if (portDesc.index !== null) port.setProperty(PORT_INDEX_KEY, portDesc.index)
        if (portDesc.borderOffset !== null) port.setProperty(PORT_BORDER_OFFSET_KEY, portDesc.borderOffset)
        if (portDesc.labels.length > 0) {
          port.setLabels(portDesc.labels.map((l) => ({ text: l.text, position: { x: l.x, y: l.y }, size: { x: l.width, y: l.height } })))
        }
      }
      if (NODE_ACTIVATE[i]) {
        n.setProperty(INSIDE_SELF_LOOPS_ACTIVATE_KEY, true)
      }
      if (NODE_LABELS[i].length > 0) {
        n.setLabels(NODE_LABELS[i].map((l) => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })))
      }
      nodeOf.set(i, n)
    }
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      const parent = nodeOf.get(p)!
      const nested = nestedGraphs.get(p)!
      parent.setNestedGraph(nested)
      nested.setParentNode(parent)
      // ★ 容器节点 label 占位 (SSOT: LABEL_PAD[i] = 子图 padding.top, 对齐 buildLGraphFromParsed)
      if (LABEL_PAD[p] !== undefined && LABEL_PAD[p] !== null) nested.setPadding(LABEL_PAD[p])
      // ★ 节点级 mergeEdges → 嵌套图 (ELK createLGraph copyProperties; LGraphUtil.createPort 读图属性)
      if (NODE_OPTS[p]?.some(([k]) => k === 'org.eclipse.elk.layered.mergeEdges')) nested.setProperty(MERGE_EDGES_KEY, true)
    }
    __mergeEdges = false
    __defaultSide = PortSide.EAST
    if (__mergeEdges) graph.setProperty(MERGE_EDGES_KEY, true)
    // 边所在图 (LCA) 的 MERGE_EDGES (ELK ElkGraphImporter 源侧读边所在图; 目标侧读目标节点所在图).
    const __parentOf = new Map<number, number>()
    for (const [__p, __kids] of Object.entries(HIERARCHY)) for (const __k of __kids) __parentOf.set(__k, Number(__p))
    const __lcaMerge = (a: number, b: number): boolean => {
      const seen = new Set<number>()
      let x: number | undefined = a
      while (x !== undefined) { seen.add(x); x = __parentOf.get(x) }
      let y: number | undefined = b
      while (y !== undefined && !seen.has(y)) y = __parentOf.get(y)
      if (y === undefined) return graph.getProperty(MERGE_EDGES_KEY) === true
      const __py = __parentOf.get(y)
      const __g = __py === undefined ? graph : nestedGraphs.get(__py)!
      return __g.getProperty(MERGE_EDGES_KEY) === true
    }
    EDGE_IDX.forEach(([s, sp, , t, tp], ei) => {
      const __srcMerge = __lcaMerge(s, t)
      const __tgtMerge = nodeOf.get(t)!.getGraph()?.getProperty(MERGE_EDGES_KEY) === true
      const e = createSimpleEdge(nodeOf.get(s)!, nodeOf.get(t)!, sp, tp, __srcMerge, __tgtMerge)
      e.setProperty(MODEL_ORDER_KEY, ei)
      if (EDGE_YO[ei]) e.setProperty(INSIDE_SELF_LOOPS_YO_KEY, true)
      for (const l of EDGE_LABELS[ei]) {
        e.getLabels().push({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })
      }
    })
    if (Object.keys(HIERARCHY).length > 0) {
      graph.setProperty(HIERARCHY_HANDLING_KEY, 'INCLUDE_CHILDREN')
    }
    graph.setProperty(DIRECTION_KEY, 'RIGHT')
    graph.setProperty('org.eclipse.elk.interactiveLayout', true)
    graph.setProperty('org.eclipse.elk.direction', "RIGHT")
    graph.setProperty('org.eclipse.elk.randomSeed', 1)

    new LayeredLayoutProvider().layout(graph)

    if (false) {
      for (const n of nodeOf.values()) {
        expect(Number.isFinite(n.position.x)).toBe(true)
        expect(Number.isFinite(n.position.y)).toBe(true)
      }
      return
    }

    // L1 (M3): 与 ELK Java 0.12.0 jar oracle 坐标级差分 (容差 ε = 2).
    // oracle 坐标相对父块 (jar getX/getY); ggn 子图节点坐标同样相对父 → 直接对比, 无需世界坐标累加.
    const oracle = JSON.parse(readFileSync(new URL('../../../test-resources/jar-oracle/examples__user-hints__interactive-constraints__interactiveLayeredLayout_hierarchyDirection.json', import.meta.url), 'utf8'))
    expect(oracle.hash, 'jar oracle 过期/缺失, 请重跑 node scripts/generate-jar-oracle.mjs').toBe('22ce23a79827fc61')
    // ELK 类加载顺序变体 (EdgeMain vs BatchMain): oracle.variants 记录另一变体, 任一匹配即通过.
    const variants = oracle.variants ?? []
    for (let i = 0; i < DIMS.length; i++) {
      const gn = nodeOf.get(i)!
      const nm = 'N' + NAMES[i]
      const cands = [oracle.coords[nm], ...variants.map((v) => v.coords[nm])].filter(Boolean)
      expect(cands.length, nm + ' 缺少 jar oracle 坐标').toBeGreaterThan(0)
      const bestX = Math.min(...cands.map((c) => Math.abs(gn.position.x - c.x)))
      const bestY = Math.min(...cands.map((c) => Math.abs(gn.position.y - c.y)))
      expect(bestX, nm + ' x').toBeLessThanOrEqual(2)
      expect(bestY, nm + ' y').toBeLessThanOrEqual(2)
    }
  })
})

describe('elkt 生成: examples__user-hints__interactive-constraints__interactiveRectpacking_hierarchy', () => {
  // 含非 layered 算法 (stress/force): P2 图级路径不适用, 差分由 verify-elkg-java-layout (api 路径) 覆盖.
  it.skip('差分由 verify api 路径覆盖 (stress/force)', () => {})
})
/**
 * elkt 生成: examples__user-hints__interactive-constraints__interactiveLayeredLayout_separateComponents
 * 图: 4 节点 / 1 边 / 0 层级块
 * 差分: 坐标级 (1:1 ELK 对齐)
 */

describe('elkt 生成: examples__user-hints__interactive-constraints__interactiveLayeredLayout_separateComponents', () => {
  const HIERARCHY: Record<number, number[]> = {}
  const EDGE_IDX: [number, number | null, string | null, number, number | null, string | null][] = [[0,null,null,1,null,null]]
  const EDGE_YO: boolean[] = [false]
  const EDGE_LABELS: { text: string; width: number; height: number; placement: string | null }[][] = [[]]
  const DIMS: [number, number][] = [[60,30],[60,30],[60,30],[60,30]]
  const NAMES: string[] = ["n1","n2","n3","n4"]
  const PORT_IDS: string[] = []
  const PORT_CONSTRAINTS: (string | null)[] = [null,null,null,null]
  const NODE_PORTS: { id: string; x: number; y: number; w: number; h: number; side: string | null; index: number | null; borderOffset: number | null; labels: { text: string; x: number; y: number; width: number; height: number }[] }[][] = [[],[],[],[]]
  const NODE_ACTIVATE: boolean[] = [false,false,false,false]
  const NODE_LABELS: { text: string; width: number; height: number; placement: string | null }[][] = [[{"text":"n1","width":0,"height":0,"placement":null}],[{"text":"n2","width":0,"height":0,"placement":null}],[{"text":"n3","width":0,"height":0,"placement":null}],[{"text":"n4","width":0,"height":0,"placement":null}]]
  const LABEL_PAD: ({ top: number; left: number; right: number; bottom: number } | null)[] = [null,null,null,null]
  const NODE_OPTS: [string, unknown][][] = [[["org.eclipse.elk.layered.layering.layerChoiceConstraint",3],["org.eclipse.elk.layered.crossingMinimization.positionChoiceConstraint",0]],[["org.eclipse.elk.layered.crossingMinimization.positionChoiceConstraint",0],["org.eclipse.elk.layered.layering.layerChoiceConstraint",2]],[["org.eclipse.elk.layered.layering.layerChoiceConstraint",1],["org.eclipse.elk.layered.crossingMinimization.positionChoiceConstraint",0]],[["org.eclipse.elk.layered.layering.layerChoiceConstraint",2],["org.eclipse.elk.layered.crossingMinimization.positionChoiceConstraint",0]]]

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
      n.setProperty(MODEL_ORDER_KEY, i)
      if (PORT_CONSTRAINTS[i]) {
        n.setProperty(PORT_CONSTRAINTS_KEY, PORT_CONSTRAINTS[i] as any)
      }
      for (const [k, v] of NODE_OPTS[i]) {
        n.setProperty(k, v as any)
      }
      for (const portDesc of NODE_PORTS[i]) {
        const port = new LPort()
        port.setNode(n)
        port.getPosition().x = portDesc.x
        port.getPosition().y = portDesc.y
        port.size = { x: portDesc.w, y: portDesc.h }
        if (portDesc.side) port.setSide(portDesc.side as any)
        if (portDesc.index !== null) port.setProperty(PORT_INDEX_KEY, portDesc.index)
        if (portDesc.borderOffset !== null) port.setProperty(PORT_BORDER_OFFSET_KEY, portDesc.borderOffset)
        if (portDesc.labels.length > 0) {
          port.setLabels(portDesc.labels.map((l) => ({ text: l.text, position: { x: l.x, y: l.y }, size: { x: l.width, y: l.height } })))
        }
      }
      if (NODE_ACTIVATE[i]) {
        n.setProperty(INSIDE_SELF_LOOPS_ACTIVATE_KEY, true)
      }
      if (NODE_LABELS[i].length > 0) {
        n.setLabels(NODE_LABELS[i].map((l) => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })))
      }
      nodeOf.set(i, n)
      graphNodes.push(n)
    }
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      const parent = nodeOf.get(p)!
      const nested = nestedGraphs.get(p)!
      parent.setNestedGraph(nested)
      nested.setParentNode(parent)
      // ★ 容器节点 label 占位 (SSOT: LABEL_PAD[i] = 子图 padding.top, 对齐 buildLGraphFromParsed)
      if (LABEL_PAD[p] !== undefined && LABEL_PAD[p] !== null) nested.setPadding(LABEL_PAD[p])
      // ★ 节点级 mergeEdges → 嵌套图 (ELK createLGraph copyProperties; LGraphUtil.createPort 读图属性)
      if (NODE_OPTS[p]?.some(([k]) => k === 'org.eclipse.elk.layered.mergeEdges')) nested.setProperty(MERGE_EDGES_KEY, true)
    }
    __mergeEdges = false
    __defaultSide = PortSide.EAST
    if (__mergeEdges) graph.setProperty(MERGE_EDGES_KEY, true)
    // 边所在图 (LCA) 的 MERGE_EDGES (ELK ElkGraphImporter 源侧读边所在图; 目标侧读目标节点所在图).
    const __parentOf = new Map<number, number>()
    for (const [__p, __kids] of Object.entries(HIERARCHY)) for (const __k of __kids) __parentOf.set(__k, Number(__p))
    const __lcaMerge = (a: number, b: number): boolean => {
      const seen = new Set<number>()
      let x: number | undefined = a
      while (x !== undefined) { seen.add(x); x = __parentOf.get(x) }
      let y: number | undefined = b
      while (y !== undefined && !seen.has(y)) y = __parentOf.get(y)
      if (y === undefined) return graph.getProperty(MERGE_EDGES_KEY) === true
      const __py = __parentOf.get(y)
      const __g = __py === undefined ? graph : nestedGraphs.get(__py)!
      return __g.getProperty(MERGE_EDGES_KEY) === true
    }
    EDGE_IDX.forEach(([s, sp, , t, tp], ei) => {
      const __srcMerge = __lcaMerge(s, t)
      const __tgtMerge = nodeOf.get(t)!.getGraph()?.getProperty(MERGE_EDGES_KEY) === true
      const e = createSimpleEdge(nodeOf.get(s)!, nodeOf.get(t)!, sp, tp, __srcMerge, __tgtMerge)
      e.setProperty(MODEL_ORDER_KEY, ei)
      if (EDGE_YO[ei]) e.setProperty(INSIDE_SELF_LOOPS_YO_KEY, true)
      for (const l of EDGE_LABELS[ei]) {
        e.getLabels().push({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })
      }
    })
    if (Object.keys(HIERARCHY).length > 0) {
      graph.setProperty(HIERARCHY_HANDLING_KEY, 'INCLUDE_CHILDREN')
    }
    graph.setProperty(DIRECTION_KEY, 'RIGHT')
    graph.setProperty('org.eclipse.elk.interactiveLayout', true)
    graph.setProperty('org.eclipse.elk.direction', "RIGHT")
    graph.setProperty('org.eclipse.elk.separateConnectedComponents', false)
    graph.setProperty('org.eclipse.elk.randomSeed', 1)

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

  it('坐标级差分: 与 jar 0.12.0 1:1 对齐', () => {
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
      n.setProperty(MODEL_ORDER_KEY, i)
      if (PORT_CONSTRAINTS[i]) {
        n.setProperty(PORT_CONSTRAINTS_KEY, PORT_CONSTRAINTS[i] as any)
      }
      for (const [k, v] of NODE_OPTS[i]) {
        n.setProperty(k, v as any)
      }
      for (const portDesc of NODE_PORTS[i]) {
        const port = new LPort()
        port.setNode(n)
        port.getPosition().x = portDesc.x
        port.getPosition().y = portDesc.y
        port.size = { x: portDesc.w, y: portDesc.h }
        if (portDesc.side) port.setSide(portDesc.side as any)
        if (portDesc.index !== null) port.setProperty(PORT_INDEX_KEY, portDesc.index)
        if (portDesc.borderOffset !== null) port.setProperty(PORT_BORDER_OFFSET_KEY, portDesc.borderOffset)
        if (portDesc.labels.length > 0) {
          port.setLabels(portDesc.labels.map((l) => ({ text: l.text, position: { x: l.x, y: l.y }, size: { x: l.width, y: l.height } })))
        }
      }
      if (NODE_ACTIVATE[i]) {
        n.setProperty(INSIDE_SELF_LOOPS_ACTIVATE_KEY, true)
      }
      if (NODE_LABELS[i].length > 0) {
        n.setLabels(NODE_LABELS[i].map((l) => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })))
      }
      nodeOf.set(i, n)
    }
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      const parent = nodeOf.get(p)!
      const nested = nestedGraphs.get(p)!
      parent.setNestedGraph(nested)
      nested.setParentNode(parent)
      // ★ 容器节点 label 占位 (SSOT: LABEL_PAD[i] = 子图 padding.top, 对齐 buildLGraphFromParsed)
      if (LABEL_PAD[p] !== undefined && LABEL_PAD[p] !== null) nested.setPadding(LABEL_PAD[p])
      // ★ 节点级 mergeEdges → 嵌套图 (ELK createLGraph copyProperties; LGraphUtil.createPort 读图属性)
      if (NODE_OPTS[p]?.some(([k]) => k === 'org.eclipse.elk.layered.mergeEdges')) nested.setProperty(MERGE_EDGES_KEY, true)
    }
    __mergeEdges = false
    __defaultSide = PortSide.EAST
    if (__mergeEdges) graph.setProperty(MERGE_EDGES_KEY, true)
    // 边所在图 (LCA) 的 MERGE_EDGES (ELK ElkGraphImporter 源侧读边所在图; 目标侧读目标节点所在图).
    const __parentOf = new Map<number, number>()
    for (const [__p, __kids] of Object.entries(HIERARCHY)) for (const __k of __kids) __parentOf.set(__k, Number(__p))
    const __lcaMerge = (a: number, b: number): boolean => {
      const seen = new Set<number>()
      let x: number | undefined = a
      while (x !== undefined) { seen.add(x); x = __parentOf.get(x) }
      let y: number | undefined = b
      while (y !== undefined && !seen.has(y)) y = __parentOf.get(y)
      if (y === undefined) return graph.getProperty(MERGE_EDGES_KEY) === true
      const __py = __parentOf.get(y)
      const __g = __py === undefined ? graph : nestedGraphs.get(__py)!
      return __g.getProperty(MERGE_EDGES_KEY) === true
    }
    EDGE_IDX.forEach(([s, sp, , t, tp], ei) => {
      const __srcMerge = __lcaMerge(s, t)
      const __tgtMerge = nodeOf.get(t)!.getGraph()?.getProperty(MERGE_EDGES_KEY) === true
      const e = createSimpleEdge(nodeOf.get(s)!, nodeOf.get(t)!, sp, tp, __srcMerge, __tgtMerge)
      e.setProperty(MODEL_ORDER_KEY, ei)
      if (EDGE_YO[ei]) e.setProperty(INSIDE_SELF_LOOPS_YO_KEY, true)
      for (const l of EDGE_LABELS[ei]) {
        e.getLabels().push({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })
      }
    })
    if (Object.keys(HIERARCHY).length > 0) {
      graph.setProperty(HIERARCHY_HANDLING_KEY, 'INCLUDE_CHILDREN')
    }
    graph.setProperty(DIRECTION_KEY, 'RIGHT')
    graph.setProperty('org.eclipse.elk.interactiveLayout', true)
    graph.setProperty('org.eclipse.elk.direction', "RIGHT")
    graph.setProperty('org.eclipse.elk.separateConnectedComponents', false)
    graph.setProperty('org.eclipse.elk.randomSeed', 1)

    new LayeredLayoutProvider().layout(graph)

    if (false) {
      for (const n of nodeOf.values()) {
        expect(Number.isFinite(n.position.x)).toBe(true)
        expect(Number.isFinite(n.position.y)).toBe(true)
      }
      return
    }

    // L1 (M3): 与 ELK Java 0.12.0 jar oracle 坐标级差分 (容差 ε = 2).
    // oracle 坐标相对父块 (jar getX/getY); ggn 子图节点坐标同样相对父 → 直接对比, 无需世界坐标累加.
    const oracle = JSON.parse(readFileSync(new URL('../../../test-resources/jar-oracle/examples__user-hints__interactive-constraints__interactiveLayeredLayout_separateComponents.json', import.meta.url), 'utf8'))
    expect(oracle.hash, 'jar oracle 过期/缺失, 请重跑 node scripts/generate-jar-oracle.mjs').toBe('1c152d821435bfd7')
    // ELK 类加载顺序变体 (EdgeMain vs BatchMain): oracle.variants 记录另一变体, 任一匹配即通过.
    const variants = oracle.variants ?? []
    for (let i = 0; i < DIMS.length; i++) {
      const gn = nodeOf.get(i)!
      const nm = 'N' + NAMES[i]
      const cands = [oracle.coords[nm], ...variants.map((v) => v.coords[nm])].filter(Boolean)
      expect(cands.length, nm + ' 缺少 jar oracle 坐标').toBeGreaterThan(0)
      const bestX = Math.min(...cands.map((c) => Math.abs(gn.position.x - c.x)))
      const bestY = Math.min(...cands.map((c) => Math.abs(gn.position.y - c.y)))
      expect(bestX, nm + ' x').toBeLessThanOrEqual(2)
      expect(bestY, nm + ' y').toBeLessThanOrEqual(2)
    }
  })
})

/**
 * elkt 生成: examples__user-hints__interactive-constraints__interactiveLayeredLayout_nodeSizes_pseudo_positions
 * 图: 2 节点 / 0 边 / 0 层级块
 * 差分: 坐标级 (1:1 ELK 对齐)
 */

describe('elkt 生成: examples__user-hints__interactive-constraints__interactiveLayeredLayout_nodeSizes_pseudo_positions', () => {
  const HIERARCHY: Record<number, number[]> = {}
  const EDGE_IDX: [number, number | null, string | null, number, number | null, string | null][] = []
  const EDGE_YO: boolean[] = []
  const EDGE_LABELS: { text: string; width: number; height: number; placement: string | null }[][] = []
  const DIMS: [number, number][] = [[200,200],[60,30]]
  const NAMES: string[] = ["n1","n2"]
  const PORT_IDS: string[] = []
  const PORT_CONSTRAINTS: (string | null)[] = [null,null]
  const NODE_PORTS: { id: string; x: number; y: number; w: number; h: number; side: string | null; index: number | null; borderOffset: number | null; labels: { text: string; x: number; y: number; width: number; height: number }[] }[][] = [[],[]]
  const NODE_ACTIVATE: boolean[] = [false,false]
  const NODE_LABELS: { text: string; width: number; height: number; placement: string | null }[][] = [[{"text":"n1","width":0,"height":0,"placement":null}],[{"text":"n2","width":0,"height":0,"placement":null}]]
  const LABEL_PAD: ({ top: number; left: number; right: number; bottom: number } | null)[] = [null,null]
  const NODE_OPTS: [string, unknown][][] = [[],[]]

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
      n.setProperty(MODEL_ORDER_KEY, i)
      if (PORT_CONSTRAINTS[i]) {
        n.setProperty(PORT_CONSTRAINTS_KEY, PORT_CONSTRAINTS[i] as any)
      }
      for (const [k, v] of NODE_OPTS[i]) {
        n.setProperty(k, v as any)
      }
      for (const portDesc of NODE_PORTS[i]) {
        const port = new LPort()
        port.setNode(n)
        port.getPosition().x = portDesc.x
        port.getPosition().y = portDesc.y
        port.size = { x: portDesc.w, y: portDesc.h }
        if (portDesc.side) port.setSide(portDesc.side as any)
        if (portDesc.index !== null) port.setProperty(PORT_INDEX_KEY, portDesc.index)
        if (portDesc.borderOffset !== null) port.setProperty(PORT_BORDER_OFFSET_KEY, portDesc.borderOffset)
        if (portDesc.labels.length > 0) {
          port.setLabels(portDesc.labels.map((l) => ({ text: l.text, position: { x: l.x, y: l.y }, size: { x: l.width, y: l.height } })))
        }
      }
      if (NODE_ACTIVATE[i]) {
        n.setProperty(INSIDE_SELF_LOOPS_ACTIVATE_KEY, true)
      }
      if (NODE_LABELS[i].length > 0) {
        n.setLabels(NODE_LABELS[i].map((l) => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })))
      }
      nodeOf.set(i, n)
      graphNodes.push(n)
    }
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      const parent = nodeOf.get(p)!
      const nested = nestedGraphs.get(p)!
      parent.setNestedGraph(nested)
      nested.setParentNode(parent)
      // ★ 容器节点 label 占位 (SSOT: LABEL_PAD[i] = 子图 padding.top, 对齐 buildLGraphFromParsed)
      if (LABEL_PAD[p] !== undefined && LABEL_PAD[p] !== null) nested.setPadding(LABEL_PAD[p])
      // ★ 节点级 mergeEdges → 嵌套图 (ELK createLGraph copyProperties; LGraphUtil.createPort 读图属性)
      if (NODE_OPTS[p]?.some(([k]) => k === 'org.eclipse.elk.layered.mergeEdges')) nested.setProperty(MERGE_EDGES_KEY, true)
    }
    __mergeEdges = false
    __defaultSide = PortSide.EAST
    if (__mergeEdges) graph.setProperty(MERGE_EDGES_KEY, true)
    // 边所在图 (LCA) 的 MERGE_EDGES (ELK ElkGraphImporter 源侧读边所在图; 目标侧读目标节点所在图).
    const __parentOf = new Map<number, number>()
    for (const [__p, __kids] of Object.entries(HIERARCHY)) for (const __k of __kids) __parentOf.set(__k, Number(__p))
    const __lcaMerge = (a: number, b: number): boolean => {
      const seen = new Set<number>()
      let x: number | undefined = a
      while (x !== undefined) { seen.add(x); x = __parentOf.get(x) }
      let y: number | undefined = b
      while (y !== undefined && !seen.has(y)) y = __parentOf.get(y)
      if (y === undefined) return graph.getProperty(MERGE_EDGES_KEY) === true
      const __py = __parentOf.get(y)
      const __g = __py === undefined ? graph : nestedGraphs.get(__py)!
      return __g.getProperty(MERGE_EDGES_KEY) === true
    }
    EDGE_IDX.forEach(([s, sp, , t, tp], ei) => {
      const __srcMerge = __lcaMerge(s, t)
      const __tgtMerge = nodeOf.get(t)!.getGraph()?.getProperty(MERGE_EDGES_KEY) === true
      const e = createSimpleEdge(nodeOf.get(s)!, nodeOf.get(t)!, sp, tp, __srcMerge, __tgtMerge)
      e.setProperty(MODEL_ORDER_KEY, ei)
      if (EDGE_YO[ei]) e.setProperty(INSIDE_SELF_LOOPS_YO_KEY, true)
      for (const l of EDGE_LABELS[ei]) {
        e.getLabels().push({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })
      }
    })
    if (Object.keys(HIERARCHY).length > 0) {
      graph.setProperty(HIERARCHY_HANDLING_KEY, 'INCLUDE_CHILDREN')
    }
    graph.setProperty(DIRECTION_KEY, 'RIGHT')
    graph.setProperty('org.eclipse.elk.direction', "RIGHT")
    graph.setProperty('org.eclipse.elk.separateConnectedComponents', false)
    graph.setProperty('org.eclipse.elk.layered.cycleBreaking.strategy', "INTERACTIVE")
    graph.setProperty('org.eclipse.elk.layered.layering.strategy', "INTERACTIVE")
    graph.setProperty('org.eclipse.elk.randomSeed', 1)

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

  it('坐标级差分: 与 jar 0.12.0 1:1 对齐', () => {
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
      n.setProperty(MODEL_ORDER_KEY, i)
      if (PORT_CONSTRAINTS[i]) {
        n.setProperty(PORT_CONSTRAINTS_KEY, PORT_CONSTRAINTS[i] as any)
      }
      for (const [k, v] of NODE_OPTS[i]) {
        n.setProperty(k, v as any)
      }
      for (const portDesc of NODE_PORTS[i]) {
        const port = new LPort()
        port.setNode(n)
        port.getPosition().x = portDesc.x
        port.getPosition().y = portDesc.y
        port.size = { x: portDesc.w, y: portDesc.h }
        if (portDesc.side) port.setSide(portDesc.side as any)
        if (portDesc.index !== null) port.setProperty(PORT_INDEX_KEY, portDesc.index)
        if (portDesc.borderOffset !== null) port.setProperty(PORT_BORDER_OFFSET_KEY, portDesc.borderOffset)
        if (portDesc.labels.length > 0) {
          port.setLabels(portDesc.labels.map((l) => ({ text: l.text, position: { x: l.x, y: l.y }, size: { x: l.width, y: l.height } })))
        }
      }
      if (NODE_ACTIVATE[i]) {
        n.setProperty(INSIDE_SELF_LOOPS_ACTIVATE_KEY, true)
      }
      if (NODE_LABELS[i].length > 0) {
        n.setLabels(NODE_LABELS[i].map((l) => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })))
      }
      nodeOf.set(i, n)
    }
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      const parent = nodeOf.get(p)!
      const nested = nestedGraphs.get(p)!
      parent.setNestedGraph(nested)
      nested.setParentNode(parent)
      // ★ 容器节点 label 占位 (SSOT: LABEL_PAD[i] = 子图 padding.top, 对齐 buildLGraphFromParsed)
      if (LABEL_PAD[p] !== undefined && LABEL_PAD[p] !== null) nested.setPadding(LABEL_PAD[p])
      // ★ 节点级 mergeEdges → 嵌套图 (ELK createLGraph copyProperties; LGraphUtil.createPort 读图属性)
      if (NODE_OPTS[p]?.some(([k]) => k === 'org.eclipse.elk.layered.mergeEdges')) nested.setProperty(MERGE_EDGES_KEY, true)
    }
    __mergeEdges = false
    __defaultSide = PortSide.EAST
    if (__mergeEdges) graph.setProperty(MERGE_EDGES_KEY, true)
    // 边所在图 (LCA) 的 MERGE_EDGES (ELK ElkGraphImporter 源侧读边所在图; 目标侧读目标节点所在图).
    const __parentOf = new Map<number, number>()
    for (const [__p, __kids] of Object.entries(HIERARCHY)) for (const __k of __kids) __parentOf.set(__k, Number(__p))
    const __lcaMerge = (a: number, b: number): boolean => {
      const seen = new Set<number>()
      let x: number | undefined = a
      while (x !== undefined) { seen.add(x); x = __parentOf.get(x) }
      let y: number | undefined = b
      while (y !== undefined && !seen.has(y)) y = __parentOf.get(y)
      if (y === undefined) return graph.getProperty(MERGE_EDGES_KEY) === true
      const __py = __parentOf.get(y)
      const __g = __py === undefined ? graph : nestedGraphs.get(__py)!
      return __g.getProperty(MERGE_EDGES_KEY) === true
    }
    EDGE_IDX.forEach(([s, sp, , t, tp], ei) => {
      const __srcMerge = __lcaMerge(s, t)
      const __tgtMerge = nodeOf.get(t)!.getGraph()?.getProperty(MERGE_EDGES_KEY) === true
      const e = createSimpleEdge(nodeOf.get(s)!, nodeOf.get(t)!, sp, tp, __srcMerge, __tgtMerge)
      e.setProperty(MODEL_ORDER_KEY, ei)
      if (EDGE_YO[ei]) e.setProperty(INSIDE_SELF_LOOPS_YO_KEY, true)
      for (const l of EDGE_LABELS[ei]) {
        e.getLabels().push({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })
      }
    })
    if (Object.keys(HIERARCHY).length > 0) {
      graph.setProperty(HIERARCHY_HANDLING_KEY, 'INCLUDE_CHILDREN')
    }
    graph.setProperty(DIRECTION_KEY, 'RIGHT')
    graph.setProperty('org.eclipse.elk.direction', "RIGHT")
    graph.setProperty('org.eclipse.elk.separateConnectedComponents', false)
    graph.setProperty('org.eclipse.elk.layered.cycleBreaking.strategy', "INTERACTIVE")
    graph.setProperty('org.eclipse.elk.layered.layering.strategy', "INTERACTIVE")
    graph.setProperty('org.eclipse.elk.randomSeed', 1)

    new LayeredLayoutProvider().layout(graph)

    if (false) {
      for (const n of nodeOf.values()) {
        expect(Number.isFinite(n.position.x)).toBe(true)
        expect(Number.isFinite(n.position.y)).toBe(true)
      }
      return
    }

    // L1 (M3): 与 ELK Java 0.12.0 jar oracle 坐标级差分 (容差 ε = 2).
    // oracle 坐标相对父块 (jar getX/getY); ggn 子图节点坐标同样相对父 → 直接对比, 无需世界坐标累加.
    const oracle = JSON.parse(readFileSync(new URL('../../../test-resources/jar-oracle/examples__user-hints__interactive-constraints__interactiveLayeredLayout_nodeSizes_pseudo_positions.json', import.meta.url), 'utf8'))
    expect(oracle.hash, 'jar oracle 过期/缺失, 请重跑 node scripts/generate-jar-oracle.mjs').toBe('640e2012aa3526c1')
    // ELK 类加载顺序变体 (EdgeMain vs BatchMain): oracle.variants 记录另一变体, 任一匹配即通过.
    const variants = oracle.variants ?? []
    for (let i = 0; i < DIMS.length; i++) {
      const gn = nodeOf.get(i)!
      const nm = 'N' + NAMES[i]
      const cands = [oracle.coords[nm], ...variants.map((v) => v.coords[nm])].filter(Boolean)
      expect(cands.length, nm + ' 缺少 jar oracle 坐标').toBeGreaterThan(0)
      const bestX = Math.min(...cands.map((c) => Math.abs(gn.position.x - c.x)))
      const bestY = Math.min(...cands.map((c) => Math.abs(gn.position.y - c.y)))
      expect(bestX, nm + ' x').toBeLessThanOrEqual(2)
      expect(bestY, nm + ' y').toBeLessThanOrEqual(2)
    }
  })
})

/**
 * elkt 生成: examples__user-hints__interactive-constraints__interactiveLayeredLayout_motor_pseudo_positions
 * 图: 6 节点 / 9 边 / 0 层级块
 * 差分: 坐标级 (1:1 ELK 对齐)
 */

describe('elkt 生成: examples__user-hints__interactive-constraints__interactiveLayeredLayout_motor_pseudo_positions', () => {
  const HIERARCHY: Record<number, number[]> = {}
  const EDGE_IDX: [number, number | null, string | null, number, number | null, string | null][] = [[0,null,null,1,null,null],[0,null,null,2,null,null],[1,null,null,3,null,null],[2,null,null,4,null,null],[3,null,null,5,null,null],[4,null,null,5,null,null],[5,null,null,0,null,null],[5,null,null,0,null,null],[3,null,null,5,null,null]]
  const EDGE_YO: boolean[] = [false,false,false,false,false,false,false,false,false]
  const EDGE_LABELS: { text: string; width: number; height: number; placement: string | null }[][] = [[],[],[],[],[],[],[],[],[]]
  const DIMS: [number, number][] = [[60,30],[60,30],[60,30],[60,30],[60,30],[60,30]]
  const NAMES: string[] = ["Pause","Accel","Deccel","CheckMax","CheckMin","SetPeriod"]
  const PORT_IDS: string[] = []
  const PORT_CONSTRAINTS: (string | null)[] = [null,null,null,null,null,null]
  const NODE_PORTS: { id: string; x: number; y: number; w: number; h: number; side: string | null; index: number | null; borderOffset: number | null; labels: { text: string; x: number; y: number; width: number; height: number }[] }[][] = [[],[],[],[],[],[]]
  const NODE_ACTIVATE: boolean[] = [false,false,false,false,false,false]
  const NODE_LABELS: { text: string; width: number; height: number; placement: string | null }[][] = [[{"text":"Pause","width":0,"height":0,"placement":null}],[{"text":"Accel","width":0,"height":0,"placement":null}],[{"text":"Deccel","width":0,"height":0,"placement":null}],[{"text":"CheckMax","width":0,"height":0,"placement":null}],[{"text":"CheckMin","width":0,"height":0,"placement":null}],[{"text":"SetPeriod","width":0,"height":0,"placement":null}]]
  const LABEL_PAD: ({ top: number; left: number; right: number; bottom: number } | null)[] = [null,null,null,null,null,null]
  const NODE_OPTS: [string, unknown][][] = [[["org.eclipse.elk.position",{"x":300,"y":0}]],[["org.eclipse.elk.position",{"x":200,"y":0}]],[["org.eclipse.elk.position",{"x":200,"y":100}]],[["org.eclipse.elk.position",{"x":100,"y":0}]],[["org.eclipse.elk.position",{"x":100,"y":100}]],[]]

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
      n.setProperty(MODEL_ORDER_KEY, i)
      if (PORT_CONSTRAINTS[i]) {
        n.setProperty(PORT_CONSTRAINTS_KEY, PORT_CONSTRAINTS[i] as any)
      }
      for (const [k, v] of NODE_OPTS[i]) {
        n.setProperty(k, v as any)
      }
      for (const portDesc of NODE_PORTS[i]) {
        const port = new LPort()
        port.setNode(n)
        port.getPosition().x = portDesc.x
        port.getPosition().y = portDesc.y
        port.size = { x: portDesc.w, y: portDesc.h }
        if (portDesc.side) port.setSide(portDesc.side as any)
        if (portDesc.index !== null) port.setProperty(PORT_INDEX_KEY, portDesc.index)
        if (portDesc.borderOffset !== null) port.setProperty(PORT_BORDER_OFFSET_KEY, portDesc.borderOffset)
        if (portDesc.labels.length > 0) {
          port.setLabels(portDesc.labels.map((l) => ({ text: l.text, position: { x: l.x, y: l.y }, size: { x: l.width, y: l.height } })))
        }
      }
      if (NODE_ACTIVATE[i]) {
        n.setProperty(INSIDE_SELF_LOOPS_ACTIVATE_KEY, true)
      }
      if (NODE_LABELS[i].length > 0) {
        n.setLabels(NODE_LABELS[i].map((l) => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })))
      }
      nodeOf.set(i, n)
      graphNodes.push(n)
    }
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      const parent = nodeOf.get(p)!
      const nested = nestedGraphs.get(p)!
      parent.setNestedGraph(nested)
      nested.setParentNode(parent)
      // ★ 容器节点 label 占位 (SSOT: LABEL_PAD[i] = 子图 padding.top, 对齐 buildLGraphFromParsed)
      if (LABEL_PAD[p] !== undefined && LABEL_PAD[p] !== null) nested.setPadding(LABEL_PAD[p])
      // ★ 节点级 mergeEdges → 嵌套图 (ELK createLGraph copyProperties; LGraphUtil.createPort 读图属性)
      if (NODE_OPTS[p]?.some(([k]) => k === 'org.eclipse.elk.layered.mergeEdges')) nested.setProperty(MERGE_EDGES_KEY, true)
    }
    __mergeEdges = false
    __defaultSide = PortSide.EAST
    if (__mergeEdges) graph.setProperty(MERGE_EDGES_KEY, true)
    // 边所在图 (LCA) 的 MERGE_EDGES (ELK ElkGraphImporter 源侧读边所在图; 目标侧读目标节点所在图).
    const __parentOf = new Map<number, number>()
    for (const [__p, __kids] of Object.entries(HIERARCHY)) for (const __k of __kids) __parentOf.set(__k, Number(__p))
    const __lcaMerge = (a: number, b: number): boolean => {
      const seen = new Set<number>()
      let x: number | undefined = a
      while (x !== undefined) { seen.add(x); x = __parentOf.get(x) }
      let y: number | undefined = b
      while (y !== undefined && !seen.has(y)) y = __parentOf.get(y)
      if (y === undefined) return graph.getProperty(MERGE_EDGES_KEY) === true
      const __py = __parentOf.get(y)
      const __g = __py === undefined ? graph : nestedGraphs.get(__py)!
      return __g.getProperty(MERGE_EDGES_KEY) === true
    }
    EDGE_IDX.forEach(([s, sp, , t, tp], ei) => {
      const __srcMerge = __lcaMerge(s, t)
      const __tgtMerge = nodeOf.get(t)!.getGraph()?.getProperty(MERGE_EDGES_KEY) === true
      const e = createSimpleEdge(nodeOf.get(s)!, nodeOf.get(t)!, sp, tp, __srcMerge, __tgtMerge)
      e.setProperty(MODEL_ORDER_KEY, ei)
      if (EDGE_YO[ei]) e.setProperty(INSIDE_SELF_LOOPS_YO_KEY, true)
      for (const l of EDGE_LABELS[ei]) {
        e.getLabels().push({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })
      }
    })
    if (Object.keys(HIERARCHY).length > 0) {
      graph.setProperty(HIERARCHY_HANDLING_KEY, 'INCLUDE_CHILDREN')
    }
    graph.setProperty(DIRECTION_KEY, 'RIGHT')
    graph.setProperty('org.eclipse.elk.direction', "RIGHT")
    graph.setProperty('org.eclipse.elk.layered.cycleBreaking.strategy', "INTERACTIVE")
    graph.setProperty('org.eclipse.elk.layered.layering.strategy', "INTERACTIVE")
    graph.setProperty('org.eclipse.elk.layered.crossingMinimization.semiInteractive', true)
    graph.setProperty('org.eclipse.elk.separateConnectedComponents', false)
    graph.setProperty('org.eclipse.elk.randomSeed', 1)

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

  it('坐标级差分: 与 jar 0.12.0 1:1 对齐', () => {
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
      n.setProperty(MODEL_ORDER_KEY, i)
      if (PORT_CONSTRAINTS[i]) {
        n.setProperty(PORT_CONSTRAINTS_KEY, PORT_CONSTRAINTS[i] as any)
      }
      for (const [k, v] of NODE_OPTS[i]) {
        n.setProperty(k, v as any)
      }
      for (const portDesc of NODE_PORTS[i]) {
        const port = new LPort()
        port.setNode(n)
        port.getPosition().x = portDesc.x
        port.getPosition().y = portDesc.y
        port.size = { x: portDesc.w, y: portDesc.h }
        if (portDesc.side) port.setSide(portDesc.side as any)
        if (portDesc.index !== null) port.setProperty(PORT_INDEX_KEY, portDesc.index)
        if (portDesc.borderOffset !== null) port.setProperty(PORT_BORDER_OFFSET_KEY, portDesc.borderOffset)
        if (portDesc.labels.length > 0) {
          port.setLabels(portDesc.labels.map((l) => ({ text: l.text, position: { x: l.x, y: l.y }, size: { x: l.width, y: l.height } })))
        }
      }
      if (NODE_ACTIVATE[i]) {
        n.setProperty(INSIDE_SELF_LOOPS_ACTIVATE_KEY, true)
      }
      if (NODE_LABELS[i].length > 0) {
        n.setLabels(NODE_LABELS[i].map((l) => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })))
      }
      nodeOf.set(i, n)
    }
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      const parent = nodeOf.get(p)!
      const nested = nestedGraphs.get(p)!
      parent.setNestedGraph(nested)
      nested.setParentNode(parent)
      // ★ 容器节点 label 占位 (SSOT: LABEL_PAD[i] = 子图 padding.top, 对齐 buildLGraphFromParsed)
      if (LABEL_PAD[p] !== undefined && LABEL_PAD[p] !== null) nested.setPadding(LABEL_PAD[p])
      // ★ 节点级 mergeEdges → 嵌套图 (ELK createLGraph copyProperties; LGraphUtil.createPort 读图属性)
      if (NODE_OPTS[p]?.some(([k]) => k === 'org.eclipse.elk.layered.mergeEdges')) nested.setProperty(MERGE_EDGES_KEY, true)
    }
    __mergeEdges = false
    __defaultSide = PortSide.EAST
    if (__mergeEdges) graph.setProperty(MERGE_EDGES_KEY, true)
    // 边所在图 (LCA) 的 MERGE_EDGES (ELK ElkGraphImporter 源侧读边所在图; 目标侧读目标节点所在图).
    const __parentOf = new Map<number, number>()
    for (const [__p, __kids] of Object.entries(HIERARCHY)) for (const __k of __kids) __parentOf.set(__k, Number(__p))
    const __lcaMerge = (a: number, b: number): boolean => {
      const seen = new Set<number>()
      let x: number | undefined = a
      while (x !== undefined) { seen.add(x); x = __parentOf.get(x) }
      let y: number | undefined = b
      while (y !== undefined && !seen.has(y)) y = __parentOf.get(y)
      if (y === undefined) return graph.getProperty(MERGE_EDGES_KEY) === true
      const __py = __parentOf.get(y)
      const __g = __py === undefined ? graph : nestedGraphs.get(__py)!
      return __g.getProperty(MERGE_EDGES_KEY) === true
    }
    EDGE_IDX.forEach(([s, sp, , t, tp], ei) => {
      const __srcMerge = __lcaMerge(s, t)
      const __tgtMerge = nodeOf.get(t)!.getGraph()?.getProperty(MERGE_EDGES_KEY) === true
      const e = createSimpleEdge(nodeOf.get(s)!, nodeOf.get(t)!, sp, tp, __srcMerge, __tgtMerge)
      e.setProperty(MODEL_ORDER_KEY, ei)
      if (EDGE_YO[ei]) e.setProperty(INSIDE_SELF_LOOPS_YO_KEY, true)
      for (const l of EDGE_LABELS[ei]) {
        e.getLabels().push({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })
      }
    })
    if (Object.keys(HIERARCHY).length > 0) {
      graph.setProperty(HIERARCHY_HANDLING_KEY, 'INCLUDE_CHILDREN')
    }
    graph.setProperty(DIRECTION_KEY, 'RIGHT')
    graph.setProperty('org.eclipse.elk.direction', "RIGHT")
    graph.setProperty('org.eclipse.elk.layered.cycleBreaking.strategy', "INTERACTIVE")
    graph.setProperty('org.eclipse.elk.layered.layering.strategy', "INTERACTIVE")
    graph.setProperty('org.eclipse.elk.layered.crossingMinimization.semiInteractive', true)
    graph.setProperty('org.eclipse.elk.separateConnectedComponents', false)
    graph.setProperty('org.eclipse.elk.randomSeed', 1)

    new LayeredLayoutProvider().layout(graph)

    if (false) {
      for (const n of nodeOf.values()) {
        expect(Number.isFinite(n.position.x)).toBe(true)
        expect(Number.isFinite(n.position.y)).toBe(true)
      }
      return
    }

    // L1 (M3): 与 ELK Java 0.12.0 jar oracle 坐标级差分 (容差 ε = 2).
    // oracle 坐标相对父块 (jar getX/getY); ggn 子图节点坐标同样相对父 → 直接对比, 无需世界坐标累加.
    const oracle = JSON.parse(readFileSync(new URL('../../../test-resources/jar-oracle/examples__user-hints__interactive-constraints__interactiveLayeredLayout_motor_pseudo_positions.json', import.meta.url), 'utf8'))
    expect(oracle.hash, 'jar oracle 过期/缺失, 请重跑 node scripts/generate-jar-oracle.mjs').toBe('c3a4ac5322f14a01')
    // ELK 类加载顺序变体 (EdgeMain vs BatchMain): oracle.variants 记录另一变体, 任一匹配即通过.
    const variants = oracle.variants ?? []
    for (let i = 0; i < DIMS.length; i++) {
      const gn = nodeOf.get(i)!
      const nm = 'N' + NAMES[i]
      const cands = [oracle.coords[nm], ...variants.map((v) => v.coords[nm])].filter(Boolean)
      expect(cands.length, nm + ' 缺少 jar oracle 坐标').toBeGreaterThan(0)
      const bestX = Math.min(...cands.map((c) => Math.abs(gn.position.x - c.x)))
      const bestY = Math.min(...cands.map((c) => Math.abs(gn.position.y - c.y)))
      expect(bestX, nm + ' x').toBeLessThanOrEqual(2)
      expect(bestY, nm + ' y').toBeLessThanOrEqual(2)
    }
  })
})

/**
 * elkt 生成: examples__user-hints__interactive-constraints__interactiveLayeredLayout_snake
 * 图: 12 节点 / 11 边 / 0 层级块
 * 差分: 坐标级 (1:1 ELK 对齐)
 */

describe('elkt 生成: examples__user-hints__interactive-constraints__interactiveLayeredLayout_snake', () => {
  const HIERARCHY: Record<number, number[]> = {}
  const EDGE_IDX: [number, number | null, string | null, number, number | null, string | null][] = [[0,null,null,1,null,null],[1,null,null,2,null,null],[2,null,null,3,null,null],[3,null,null,4,null,null],[4,null,null,5,null,null],[5,null,null,6,null,null],[6,null,null,7,null,null],[7,null,null,8,null,null],[8,null,null,9,null,null],[9,null,null,10,null,null],[10,null,null,11,null,null]]
  const EDGE_YO: boolean[] = [false,false,false,false,false,false,false,false,false,false,false]
  const EDGE_LABELS: { text: string; width: number; height: number; placement: string | null }[][] = [[],[],[],[],[],[],[],[],[],[],[]]
  const DIMS: [number, number][] = [[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30]]
  const NAMES: string[] = ["n1","n2","n3","n4","n5","n6","n7","n8","n9","n10","n11","n12"]
  const PORT_IDS: string[] = []
  const PORT_CONSTRAINTS: (string | null)[] = [null,null,null,null,null,null,null,null,null,null,null,null]
  const NODE_PORTS: { id: string; x: number; y: number; w: number; h: number; side: string | null; index: number | null; borderOffset: number | null; labels: { text: string; x: number; y: number; width: number; height: number }[] }[][] = [[],[],[],[],[],[],[],[],[],[],[],[]]
  const NODE_ACTIVATE: boolean[] = [false,false,false,false,false,false,false,false,false,false,false,false]
  const NODE_LABELS: { text: string; width: number; height: number; placement: string | null }[][] = [[{"text":"n1","width":0,"height":0,"placement":null}],[{"text":"n2","width":0,"height":0,"placement":null}],[{"text":"n3","width":0,"height":0,"placement":null}],[{"text":"n4","width":0,"height":0,"placement":null}],[{"text":"n5","width":0,"height":0,"placement":null}],[{"text":"n6","width":0,"height":0,"placement":null}],[{"text":"n7","width":0,"height":0,"placement":null}],[{"text":"n8","width":0,"height":0,"placement":null}],[{"text":"n9","width":0,"height":0,"placement":null}],[{"text":"n10","width":0,"height":0,"placement":null}],[{"text":"n11","width":0,"height":0,"placement":null}],[{"text":"n12","width":0,"height":0,"placement":null}]]
  const LABEL_PAD: ({ top: number; left: number; right: number; bottom: number } | null)[] = [null,null,null,null,null,null,null,null,null,null,null,null]
  const NODE_OPTS: [string, unknown][][] = [[],[],[["org.eclipse.elk.layered.layering.layerChoiceConstraint",0]],[],[["org.eclipse.elk.layered.layering.layerChoiceConstraint",0]],[],[["org.eclipse.elk.layered.layering.layerChoiceConstraint",0]],[],[],[],[["org.eclipse.elk.layered.layering.layerChoiceConstraint",0]],[["org.eclipse.elk.layered.crossingMinimization.positionChoiceConstraint",1],["org.eclipse.elk.layered.layering.layerChoiceConstraint",3]]]

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
      n.setProperty(MODEL_ORDER_KEY, i)
      if (PORT_CONSTRAINTS[i]) {
        n.setProperty(PORT_CONSTRAINTS_KEY, PORT_CONSTRAINTS[i] as any)
      }
      for (const [k, v] of NODE_OPTS[i]) {
        n.setProperty(k, v as any)
      }
      for (const portDesc of NODE_PORTS[i]) {
        const port = new LPort()
        port.setNode(n)
        port.getPosition().x = portDesc.x
        port.getPosition().y = portDesc.y
        port.size = { x: portDesc.w, y: portDesc.h }
        if (portDesc.side) port.setSide(portDesc.side as any)
        if (portDesc.index !== null) port.setProperty(PORT_INDEX_KEY, portDesc.index)
        if (portDesc.borderOffset !== null) port.setProperty(PORT_BORDER_OFFSET_KEY, portDesc.borderOffset)
        if (portDesc.labels.length > 0) {
          port.setLabels(portDesc.labels.map((l) => ({ text: l.text, position: { x: l.x, y: l.y }, size: { x: l.width, y: l.height } })))
        }
      }
      if (NODE_ACTIVATE[i]) {
        n.setProperty(INSIDE_SELF_LOOPS_ACTIVATE_KEY, true)
      }
      if (NODE_LABELS[i].length > 0) {
        n.setLabels(NODE_LABELS[i].map((l) => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })))
      }
      nodeOf.set(i, n)
      graphNodes.push(n)
    }
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      const parent = nodeOf.get(p)!
      const nested = nestedGraphs.get(p)!
      parent.setNestedGraph(nested)
      nested.setParentNode(parent)
      // ★ 容器节点 label 占位 (SSOT: LABEL_PAD[i] = 子图 padding.top, 对齐 buildLGraphFromParsed)
      if (LABEL_PAD[p] !== undefined && LABEL_PAD[p] !== null) nested.setPadding(LABEL_PAD[p])
      // ★ 节点级 mergeEdges → 嵌套图 (ELK createLGraph copyProperties; LGraphUtil.createPort 读图属性)
      if (NODE_OPTS[p]?.some(([k]) => k === 'org.eclipse.elk.layered.mergeEdges')) nested.setProperty(MERGE_EDGES_KEY, true)
    }
    __mergeEdges = false
    __defaultSide = PortSide.EAST
    if (__mergeEdges) graph.setProperty(MERGE_EDGES_KEY, true)
    // 边所在图 (LCA) 的 MERGE_EDGES (ELK ElkGraphImporter 源侧读边所在图; 目标侧读目标节点所在图).
    const __parentOf = new Map<number, number>()
    for (const [__p, __kids] of Object.entries(HIERARCHY)) for (const __k of __kids) __parentOf.set(__k, Number(__p))
    const __lcaMerge = (a: number, b: number): boolean => {
      const seen = new Set<number>()
      let x: number | undefined = a
      while (x !== undefined) { seen.add(x); x = __parentOf.get(x) }
      let y: number | undefined = b
      while (y !== undefined && !seen.has(y)) y = __parentOf.get(y)
      if (y === undefined) return graph.getProperty(MERGE_EDGES_KEY) === true
      const __py = __parentOf.get(y)
      const __g = __py === undefined ? graph : nestedGraphs.get(__py)!
      return __g.getProperty(MERGE_EDGES_KEY) === true
    }
    EDGE_IDX.forEach(([s, sp, , t, tp], ei) => {
      const __srcMerge = __lcaMerge(s, t)
      const __tgtMerge = nodeOf.get(t)!.getGraph()?.getProperty(MERGE_EDGES_KEY) === true
      const e = createSimpleEdge(nodeOf.get(s)!, nodeOf.get(t)!, sp, tp, __srcMerge, __tgtMerge)
      e.setProperty(MODEL_ORDER_KEY, ei)
      if (EDGE_YO[ei]) e.setProperty(INSIDE_SELF_LOOPS_YO_KEY, true)
      for (const l of EDGE_LABELS[ei]) {
        e.getLabels().push({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })
      }
    })
    if (Object.keys(HIERARCHY).length > 0) {
      graph.setProperty(HIERARCHY_HANDLING_KEY, 'INCLUDE_CHILDREN')
    }
    graph.setProperty(DIRECTION_KEY, 'RIGHT')
    graph.setProperty('org.eclipse.elk.interactiveLayout', true)
    graph.setProperty('org.eclipse.elk.direction', "RIGHT")
    graph.setProperty('org.eclipse.elk.randomSeed', 1)

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

  it('坐标级差分: 与 jar 0.12.0 1:1 对齐', () => {
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
      n.setProperty(MODEL_ORDER_KEY, i)
      if (PORT_CONSTRAINTS[i]) {
        n.setProperty(PORT_CONSTRAINTS_KEY, PORT_CONSTRAINTS[i] as any)
      }
      for (const [k, v] of NODE_OPTS[i]) {
        n.setProperty(k, v as any)
      }
      for (const portDesc of NODE_PORTS[i]) {
        const port = new LPort()
        port.setNode(n)
        port.getPosition().x = portDesc.x
        port.getPosition().y = portDesc.y
        port.size = { x: portDesc.w, y: portDesc.h }
        if (portDesc.side) port.setSide(portDesc.side as any)
        if (portDesc.index !== null) port.setProperty(PORT_INDEX_KEY, portDesc.index)
        if (portDesc.borderOffset !== null) port.setProperty(PORT_BORDER_OFFSET_KEY, portDesc.borderOffset)
        if (portDesc.labels.length > 0) {
          port.setLabels(portDesc.labels.map((l) => ({ text: l.text, position: { x: l.x, y: l.y }, size: { x: l.width, y: l.height } })))
        }
      }
      if (NODE_ACTIVATE[i]) {
        n.setProperty(INSIDE_SELF_LOOPS_ACTIVATE_KEY, true)
      }
      if (NODE_LABELS[i].length > 0) {
        n.setLabels(NODE_LABELS[i].map((l) => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })))
      }
      nodeOf.set(i, n)
    }
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      const parent = nodeOf.get(p)!
      const nested = nestedGraphs.get(p)!
      parent.setNestedGraph(nested)
      nested.setParentNode(parent)
      // ★ 容器节点 label 占位 (SSOT: LABEL_PAD[i] = 子图 padding.top, 对齐 buildLGraphFromParsed)
      if (LABEL_PAD[p] !== undefined && LABEL_PAD[p] !== null) nested.setPadding(LABEL_PAD[p])
      // ★ 节点级 mergeEdges → 嵌套图 (ELK createLGraph copyProperties; LGraphUtil.createPort 读图属性)
      if (NODE_OPTS[p]?.some(([k]) => k === 'org.eclipse.elk.layered.mergeEdges')) nested.setProperty(MERGE_EDGES_KEY, true)
    }
    __mergeEdges = false
    __defaultSide = PortSide.EAST
    if (__mergeEdges) graph.setProperty(MERGE_EDGES_KEY, true)
    // 边所在图 (LCA) 的 MERGE_EDGES (ELK ElkGraphImporter 源侧读边所在图; 目标侧读目标节点所在图).
    const __parentOf = new Map<number, number>()
    for (const [__p, __kids] of Object.entries(HIERARCHY)) for (const __k of __kids) __parentOf.set(__k, Number(__p))
    const __lcaMerge = (a: number, b: number): boolean => {
      const seen = new Set<number>()
      let x: number | undefined = a
      while (x !== undefined) { seen.add(x); x = __parentOf.get(x) }
      let y: number | undefined = b
      while (y !== undefined && !seen.has(y)) y = __parentOf.get(y)
      if (y === undefined) return graph.getProperty(MERGE_EDGES_KEY) === true
      const __py = __parentOf.get(y)
      const __g = __py === undefined ? graph : nestedGraphs.get(__py)!
      return __g.getProperty(MERGE_EDGES_KEY) === true
    }
    EDGE_IDX.forEach(([s, sp, , t, tp], ei) => {
      const __srcMerge = __lcaMerge(s, t)
      const __tgtMerge = nodeOf.get(t)!.getGraph()?.getProperty(MERGE_EDGES_KEY) === true
      const e = createSimpleEdge(nodeOf.get(s)!, nodeOf.get(t)!, sp, tp, __srcMerge, __tgtMerge)
      e.setProperty(MODEL_ORDER_KEY, ei)
      if (EDGE_YO[ei]) e.setProperty(INSIDE_SELF_LOOPS_YO_KEY, true)
      for (const l of EDGE_LABELS[ei]) {
        e.getLabels().push({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })
      }
    })
    if (Object.keys(HIERARCHY).length > 0) {
      graph.setProperty(HIERARCHY_HANDLING_KEY, 'INCLUDE_CHILDREN')
    }
    graph.setProperty(DIRECTION_KEY, 'RIGHT')
    graph.setProperty('org.eclipse.elk.interactiveLayout', true)
    graph.setProperty('org.eclipse.elk.direction', "RIGHT")
    graph.setProperty('org.eclipse.elk.randomSeed', 1)

    new LayeredLayoutProvider().layout(graph)

    if (false) {
      for (const n of nodeOf.values()) {
        expect(Number.isFinite(n.position.x)).toBe(true)
        expect(Number.isFinite(n.position.y)).toBe(true)
      }
      return
    }

    // L1 (M3): 与 ELK Java 0.12.0 jar oracle 坐标级差分 (容差 ε = 2).
    // oracle 坐标相对父块 (jar getX/getY); ggn 子图节点坐标同样相对父 → 直接对比, 无需世界坐标累加.
    const oracle = JSON.parse(readFileSync(new URL('../../../test-resources/jar-oracle/examples__user-hints__interactive-constraints__interactiveLayeredLayout_snake.json', import.meta.url), 'utf8'))
    expect(oracle.hash, 'jar oracle 过期/缺失, 请重跑 node scripts/generate-jar-oracle.mjs').toBe('085eaf5c8ec65669')
    // ELK 类加载顺序变体 (EdgeMain vs BatchMain): oracle.variants 记录另一变体, 任一匹配即通过.
    const variants = oracle.variants ?? []
    for (let i = 0; i < DIMS.length; i++) {
      const gn = nodeOf.get(i)!
      const nm = 'N' + NAMES[i]
      const cands = [oracle.coords[nm], ...variants.map((v) => v.coords[nm])].filter(Boolean)
      expect(cands.length, nm + ' 缺少 jar oracle 坐标').toBeGreaterThan(0)
      const bestX = Math.min(...cands.map((c) => Math.abs(gn.position.x - c.x)))
      const bestY = Math.min(...cands.map((c) => Math.abs(gn.position.y - c.y)))
      expect(bestX, nm + ' x').toBeLessThanOrEqual(2)
      expect(bestY, nm + ' y').toBeLessThanOrEqual(2)
    }
  })
})

/**
 * elkt 生成: examples__user-hints__interactive-constraints__interactiveLayeredLayout_separateComponents_pseudo_positions
 * 图: 4 节点 / 1 边 / 0 层级块
 * 差分: 坐标级 (1:1 ELK 对齐)
 */

describe('elkt 生成: examples__user-hints__interactive-constraints__interactiveLayeredLayout_separateComponents_pseudo_positions', () => {
  const HIERARCHY: Record<number, number[]> = {}
  const EDGE_IDX: [number, number | null, string | null, number, number | null, string | null][] = [[0,null,null,1,null,null]]
  const EDGE_YO: boolean[] = [false]
  const EDGE_LABELS: { text: string; width: number; height: number; placement: string | null }[][] = [[]]
  const DIMS: [number, number][] = [[60,30],[60,30],[60,30],[60,30]]
  const NAMES: string[] = ["n1","n2","n3","n4"]
  const PORT_IDS: string[] = []
  const PORT_CONSTRAINTS: (string | null)[] = [null,null,null,null]
  const NODE_PORTS: { id: string; x: number; y: number; w: number; h: number; side: string | null; index: number | null; borderOffset: number | null; labels: { text: string; x: number; y: number; width: number; height: number }[] }[][] = [[],[],[],[]]
  const NODE_ACTIVATE: boolean[] = [false,false,false,false]
  const NODE_LABELS: { text: string; width: number; height: number; placement: string | null }[][] = [[{"text":"n1","width":0,"height":0,"placement":null}],[{"text":"n2","width":0,"height":0,"placement":null}],[{"text":"n3","width":0,"height":0,"placement":null}],[{"text":"n4","width":0,"height":0,"placement":null}]]
  const LABEL_PAD: ({ top: number; left: number; right: number; bottom: number } | null)[] = [null,null,null,null]
  const NODE_OPTS: [string, unknown][][] = [[["org.eclipse.elk.position",{"x":300,"y":100}]],[["org.eclipse.elk.position",{"x":200,"y":100}]],[["org.eclipse.elk.position",{"x":100,"y":0}]],[["org.eclipse.elk.position",{"x":200,"y":0}]]]

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
      n.setProperty(MODEL_ORDER_KEY, i)
      if (PORT_CONSTRAINTS[i]) {
        n.setProperty(PORT_CONSTRAINTS_KEY, PORT_CONSTRAINTS[i] as any)
      }
      for (const [k, v] of NODE_OPTS[i]) {
        n.setProperty(k, v as any)
      }
      for (const portDesc of NODE_PORTS[i]) {
        const port = new LPort()
        port.setNode(n)
        port.getPosition().x = portDesc.x
        port.getPosition().y = portDesc.y
        port.size = { x: portDesc.w, y: portDesc.h }
        if (portDesc.side) port.setSide(portDesc.side as any)
        if (portDesc.index !== null) port.setProperty(PORT_INDEX_KEY, portDesc.index)
        if (portDesc.borderOffset !== null) port.setProperty(PORT_BORDER_OFFSET_KEY, portDesc.borderOffset)
        if (portDesc.labels.length > 0) {
          port.setLabels(portDesc.labels.map((l) => ({ text: l.text, position: { x: l.x, y: l.y }, size: { x: l.width, y: l.height } })))
        }
      }
      if (NODE_ACTIVATE[i]) {
        n.setProperty(INSIDE_SELF_LOOPS_ACTIVATE_KEY, true)
      }
      if (NODE_LABELS[i].length > 0) {
        n.setLabels(NODE_LABELS[i].map((l) => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })))
      }
      nodeOf.set(i, n)
      graphNodes.push(n)
    }
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      const parent = nodeOf.get(p)!
      const nested = nestedGraphs.get(p)!
      parent.setNestedGraph(nested)
      nested.setParentNode(parent)
      // ★ 容器节点 label 占位 (SSOT: LABEL_PAD[i] = 子图 padding.top, 对齐 buildLGraphFromParsed)
      if (LABEL_PAD[p] !== undefined && LABEL_PAD[p] !== null) nested.setPadding(LABEL_PAD[p])
      // ★ 节点级 mergeEdges → 嵌套图 (ELK createLGraph copyProperties; LGraphUtil.createPort 读图属性)
      if (NODE_OPTS[p]?.some(([k]) => k === 'org.eclipse.elk.layered.mergeEdges')) nested.setProperty(MERGE_EDGES_KEY, true)
    }
    __mergeEdges = false
    __defaultSide = PortSide.EAST
    if (__mergeEdges) graph.setProperty(MERGE_EDGES_KEY, true)
    // 边所在图 (LCA) 的 MERGE_EDGES (ELK ElkGraphImporter 源侧读边所在图; 目标侧读目标节点所在图).
    const __parentOf = new Map<number, number>()
    for (const [__p, __kids] of Object.entries(HIERARCHY)) for (const __k of __kids) __parentOf.set(__k, Number(__p))
    const __lcaMerge = (a: number, b: number): boolean => {
      const seen = new Set<number>()
      let x: number | undefined = a
      while (x !== undefined) { seen.add(x); x = __parentOf.get(x) }
      let y: number | undefined = b
      while (y !== undefined && !seen.has(y)) y = __parentOf.get(y)
      if (y === undefined) return graph.getProperty(MERGE_EDGES_KEY) === true
      const __py = __parentOf.get(y)
      const __g = __py === undefined ? graph : nestedGraphs.get(__py)!
      return __g.getProperty(MERGE_EDGES_KEY) === true
    }
    EDGE_IDX.forEach(([s, sp, , t, tp], ei) => {
      const __srcMerge = __lcaMerge(s, t)
      const __tgtMerge = nodeOf.get(t)!.getGraph()?.getProperty(MERGE_EDGES_KEY) === true
      const e = createSimpleEdge(nodeOf.get(s)!, nodeOf.get(t)!, sp, tp, __srcMerge, __tgtMerge)
      e.setProperty(MODEL_ORDER_KEY, ei)
      if (EDGE_YO[ei]) e.setProperty(INSIDE_SELF_LOOPS_YO_KEY, true)
      for (const l of EDGE_LABELS[ei]) {
        e.getLabels().push({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })
      }
    })
    if (Object.keys(HIERARCHY).length > 0) {
      graph.setProperty(HIERARCHY_HANDLING_KEY, 'INCLUDE_CHILDREN')
    }
    graph.setProperty(DIRECTION_KEY, 'RIGHT')
    graph.setProperty('org.eclipse.elk.direction', "RIGHT")
    graph.setProperty('org.eclipse.elk.layered.cycleBreaking.strategy', "INTERACTIVE")
    graph.setProperty('org.eclipse.elk.layered.layering.strategy', "INTERACTIVE")
    graph.setProperty('org.eclipse.elk.layered.crossingMinimization.semiInteractive', true)
    graph.setProperty('org.eclipse.elk.separateConnectedComponents', false)
    graph.setProperty('org.eclipse.elk.randomSeed', 1)

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

  it('坐标级差分: 与 jar 0.12.0 1:1 对齐', () => {
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
      n.setProperty(MODEL_ORDER_KEY, i)
      if (PORT_CONSTRAINTS[i]) {
        n.setProperty(PORT_CONSTRAINTS_KEY, PORT_CONSTRAINTS[i] as any)
      }
      for (const [k, v] of NODE_OPTS[i]) {
        n.setProperty(k, v as any)
      }
      for (const portDesc of NODE_PORTS[i]) {
        const port = new LPort()
        port.setNode(n)
        port.getPosition().x = portDesc.x
        port.getPosition().y = portDesc.y
        port.size = { x: portDesc.w, y: portDesc.h }
        if (portDesc.side) port.setSide(portDesc.side as any)
        if (portDesc.index !== null) port.setProperty(PORT_INDEX_KEY, portDesc.index)
        if (portDesc.borderOffset !== null) port.setProperty(PORT_BORDER_OFFSET_KEY, portDesc.borderOffset)
        if (portDesc.labels.length > 0) {
          port.setLabels(portDesc.labels.map((l) => ({ text: l.text, position: { x: l.x, y: l.y }, size: { x: l.width, y: l.height } })))
        }
      }
      if (NODE_ACTIVATE[i]) {
        n.setProperty(INSIDE_SELF_LOOPS_ACTIVATE_KEY, true)
      }
      if (NODE_LABELS[i].length > 0) {
        n.setLabels(NODE_LABELS[i].map((l) => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })))
      }
      nodeOf.set(i, n)
    }
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      const parent = nodeOf.get(p)!
      const nested = nestedGraphs.get(p)!
      parent.setNestedGraph(nested)
      nested.setParentNode(parent)
      // ★ 容器节点 label 占位 (SSOT: LABEL_PAD[i] = 子图 padding.top, 对齐 buildLGraphFromParsed)
      if (LABEL_PAD[p] !== undefined && LABEL_PAD[p] !== null) nested.setPadding(LABEL_PAD[p])
      // ★ 节点级 mergeEdges → 嵌套图 (ELK createLGraph copyProperties; LGraphUtil.createPort 读图属性)
      if (NODE_OPTS[p]?.some(([k]) => k === 'org.eclipse.elk.layered.mergeEdges')) nested.setProperty(MERGE_EDGES_KEY, true)
    }
    __mergeEdges = false
    __defaultSide = PortSide.EAST
    if (__mergeEdges) graph.setProperty(MERGE_EDGES_KEY, true)
    // 边所在图 (LCA) 的 MERGE_EDGES (ELK ElkGraphImporter 源侧读边所在图; 目标侧读目标节点所在图).
    const __parentOf = new Map<number, number>()
    for (const [__p, __kids] of Object.entries(HIERARCHY)) for (const __k of __kids) __parentOf.set(__k, Number(__p))
    const __lcaMerge = (a: number, b: number): boolean => {
      const seen = new Set<number>()
      let x: number | undefined = a
      while (x !== undefined) { seen.add(x); x = __parentOf.get(x) }
      let y: number | undefined = b
      while (y !== undefined && !seen.has(y)) y = __parentOf.get(y)
      if (y === undefined) return graph.getProperty(MERGE_EDGES_KEY) === true
      const __py = __parentOf.get(y)
      const __g = __py === undefined ? graph : nestedGraphs.get(__py)!
      return __g.getProperty(MERGE_EDGES_KEY) === true
    }
    EDGE_IDX.forEach(([s, sp, , t, tp], ei) => {
      const __srcMerge = __lcaMerge(s, t)
      const __tgtMerge = nodeOf.get(t)!.getGraph()?.getProperty(MERGE_EDGES_KEY) === true
      const e = createSimpleEdge(nodeOf.get(s)!, nodeOf.get(t)!, sp, tp, __srcMerge, __tgtMerge)
      e.setProperty(MODEL_ORDER_KEY, ei)
      if (EDGE_YO[ei]) e.setProperty(INSIDE_SELF_LOOPS_YO_KEY, true)
      for (const l of EDGE_LABELS[ei]) {
        e.getLabels().push({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })
      }
    })
    if (Object.keys(HIERARCHY).length > 0) {
      graph.setProperty(HIERARCHY_HANDLING_KEY, 'INCLUDE_CHILDREN')
    }
    graph.setProperty(DIRECTION_KEY, 'RIGHT')
    graph.setProperty('org.eclipse.elk.direction', "RIGHT")
    graph.setProperty('org.eclipse.elk.layered.cycleBreaking.strategy', "INTERACTIVE")
    graph.setProperty('org.eclipse.elk.layered.layering.strategy', "INTERACTIVE")
    graph.setProperty('org.eclipse.elk.layered.crossingMinimization.semiInteractive', true)
    graph.setProperty('org.eclipse.elk.separateConnectedComponents', false)
    graph.setProperty('org.eclipse.elk.randomSeed', 1)

    new LayeredLayoutProvider().layout(graph)

    if (false) {
      for (const n of nodeOf.values()) {
        expect(Number.isFinite(n.position.x)).toBe(true)
        expect(Number.isFinite(n.position.y)).toBe(true)
      }
      return
    }

    // L1 (M3): 与 ELK Java 0.12.0 jar oracle 坐标级差分 (容差 ε = 2).
    // oracle 坐标相对父块 (jar getX/getY); ggn 子图节点坐标同样相对父 → 直接对比, 无需世界坐标累加.
    const oracle = JSON.parse(readFileSync(new URL('../../../test-resources/jar-oracle/examples__user-hints__interactive-constraints__interactiveLayeredLayout_separateComponents_pseudo_positions.json', import.meta.url), 'utf8'))
    expect(oracle.hash, 'jar oracle 过期/缺失, 请重跑 node scripts/generate-jar-oracle.mjs').toBe('34875dee2bee1fec')
    // ELK 类加载顺序变体 (EdgeMain vs BatchMain): oracle.variants 记录另一变体, 任一匹配即通过.
    const variants = oracle.variants ?? []
    for (let i = 0; i < DIMS.length; i++) {
      const gn = nodeOf.get(i)!
      const nm = 'N' + NAMES[i]
      const cands = [oracle.coords[nm], ...variants.map((v) => v.coords[nm])].filter(Boolean)
      expect(cands.length, nm + ' 缺少 jar oracle 坐标').toBeGreaterThan(0)
      const bestX = Math.min(...cands.map((c) => Math.abs(gn.position.x - c.x)))
      const bestY = Math.min(...cands.map((c) => Math.abs(gn.position.y - c.y)))
      expect(bestX, nm + ' x').toBeLessThanOrEqual(2)
      expect(bestY, nm + ' y').toBeLessThanOrEqual(2)
    }
  })
})

/**
 * elkt 生成: examples__user-hints__interactive-constraints__interactiveLayeredLayout_simpleDirectionTest
 * 图: 4 节点 / 5 边 / 0 层级块
 * 差分: 坐标级 (1:1 ELK 对齐)
 */

describe('elkt 生成: examples__user-hints__interactive-constraints__interactiveLayeredLayout_simpleDirectionTest', () => {
  const HIERARCHY: Record<number, number[]> = {}
  const EDGE_IDX: [number, number | null, string | null, number, number | null, string | null][] = [[0,null,null,1,null,null],[0,null,null,1,null,null],[1,null,null,2,null,null],[1,null,null,2,null,null],[1,null,null,3,null,null]]
  const EDGE_YO: boolean[] = [false,false,false,false,false]
  const EDGE_LABELS: { text: string; width: number; height: number; placement: string | null }[][] = [[],[],[],[],[]]
  const DIMS: [number, number][] = [[60,30],[60,30],[60,30],[60,30]]
  const NAMES: string[] = ["n1","n2","n3","n4"]
  const PORT_IDS: string[] = []
  const PORT_CONSTRAINTS: (string | null)[] = [null,null,null,null]
  const NODE_PORTS: { id: string; x: number; y: number; w: number; h: number; side: string | null; index: number | null; borderOffset: number | null; labels: { text: string; x: number; y: number; width: number; height: number }[] }[][] = [[],[],[],[]]
  const NODE_ACTIVATE: boolean[] = [false,false,false,false]
  const NODE_LABELS: { text: string; width: number; height: number; placement: string | null }[][] = [[{"text":"n1","width":0,"height":0,"placement":null}],[{"text":"n2","width":0,"height":0,"placement":null}],[{"text":"n3","width":0,"height":0,"placement":null}],[{"text":"n4","width":0,"height":0,"placement":null}]]
  const LABEL_PAD: ({ top: number; left: number; right: number; bottom: number } | null)[] = [null,null,null,null]
  const NODE_OPTS: [string, unknown][][] = [[],[],[],[]]

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
      n.setProperty(MODEL_ORDER_KEY, i)
      if (PORT_CONSTRAINTS[i]) {
        n.setProperty(PORT_CONSTRAINTS_KEY, PORT_CONSTRAINTS[i] as any)
      }
      for (const [k, v] of NODE_OPTS[i]) {
        n.setProperty(k, v as any)
      }
      for (const portDesc of NODE_PORTS[i]) {
        const port = new LPort()
        port.setNode(n)
        port.getPosition().x = portDesc.x
        port.getPosition().y = portDesc.y
        port.size = { x: portDesc.w, y: portDesc.h }
        if (portDesc.side) port.setSide(portDesc.side as any)
        if (portDesc.index !== null) port.setProperty(PORT_INDEX_KEY, portDesc.index)
        if (portDesc.borderOffset !== null) port.setProperty(PORT_BORDER_OFFSET_KEY, portDesc.borderOffset)
        if (portDesc.labels.length > 0) {
          port.setLabels(portDesc.labels.map((l) => ({ text: l.text, position: { x: l.x, y: l.y }, size: { x: l.width, y: l.height } })))
        }
      }
      if (NODE_ACTIVATE[i]) {
        n.setProperty(INSIDE_SELF_LOOPS_ACTIVATE_KEY, true)
      }
      if (NODE_LABELS[i].length > 0) {
        n.setLabels(NODE_LABELS[i].map((l) => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })))
      }
      nodeOf.set(i, n)
      graphNodes.push(n)
    }
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      const parent = nodeOf.get(p)!
      const nested = nestedGraphs.get(p)!
      parent.setNestedGraph(nested)
      nested.setParentNode(parent)
      // ★ 容器节点 label 占位 (SSOT: LABEL_PAD[i] = 子图 padding.top, 对齐 buildLGraphFromParsed)
      if (LABEL_PAD[p] !== undefined && LABEL_PAD[p] !== null) nested.setPadding(LABEL_PAD[p])
      // ★ 节点级 mergeEdges → 嵌套图 (ELK createLGraph copyProperties; LGraphUtil.createPort 读图属性)
      if (NODE_OPTS[p]?.some(([k]) => k === 'org.eclipse.elk.layered.mergeEdges')) nested.setProperty(MERGE_EDGES_KEY, true)
    }
    __mergeEdges = false
    __defaultSide = PortSide.WEST
    if (__mergeEdges) graph.setProperty(MERGE_EDGES_KEY, true)
    // 边所在图 (LCA) 的 MERGE_EDGES (ELK ElkGraphImporter 源侧读边所在图; 目标侧读目标节点所在图).
    const __parentOf = new Map<number, number>()
    for (const [__p, __kids] of Object.entries(HIERARCHY)) for (const __k of __kids) __parentOf.set(__k, Number(__p))
    const __lcaMerge = (a: number, b: number): boolean => {
      const seen = new Set<number>()
      let x: number | undefined = a
      while (x !== undefined) { seen.add(x); x = __parentOf.get(x) }
      let y: number | undefined = b
      while (y !== undefined && !seen.has(y)) y = __parentOf.get(y)
      if (y === undefined) return graph.getProperty(MERGE_EDGES_KEY) === true
      const __py = __parentOf.get(y)
      const __g = __py === undefined ? graph : nestedGraphs.get(__py)!
      return __g.getProperty(MERGE_EDGES_KEY) === true
    }
    EDGE_IDX.forEach(([s, sp, , t, tp], ei) => {
      const __srcMerge = __lcaMerge(s, t)
      const __tgtMerge = nodeOf.get(t)!.getGraph()?.getProperty(MERGE_EDGES_KEY) === true
      const e = createSimpleEdge(nodeOf.get(s)!, nodeOf.get(t)!, sp, tp, __srcMerge, __tgtMerge)
      e.setProperty(MODEL_ORDER_KEY, ei)
      if (EDGE_YO[ei]) e.setProperty(INSIDE_SELF_LOOPS_YO_KEY, true)
      for (const l of EDGE_LABELS[ei]) {
        e.getLabels().push({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })
      }
    })
    if (Object.keys(HIERARCHY).length > 0) {
      graph.setProperty(HIERARCHY_HANDLING_KEY, 'INCLUDE_CHILDREN')
    }
    graph.setProperty(DIRECTION_KEY, 'LEFT')
    graph.setProperty('org.eclipse.elk.interactiveLayout', true)
    graph.setProperty('org.eclipse.elk.direction', "LEFT")
    graph.setProperty('org.eclipse.elk.randomSeed', 1)

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

  it('坐标级差分: 与 jar 0.12.0 1:1 对齐', () => {
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
      n.setProperty(MODEL_ORDER_KEY, i)
      if (PORT_CONSTRAINTS[i]) {
        n.setProperty(PORT_CONSTRAINTS_KEY, PORT_CONSTRAINTS[i] as any)
      }
      for (const [k, v] of NODE_OPTS[i]) {
        n.setProperty(k, v as any)
      }
      for (const portDesc of NODE_PORTS[i]) {
        const port = new LPort()
        port.setNode(n)
        port.getPosition().x = portDesc.x
        port.getPosition().y = portDesc.y
        port.size = { x: portDesc.w, y: portDesc.h }
        if (portDesc.side) port.setSide(portDesc.side as any)
        if (portDesc.index !== null) port.setProperty(PORT_INDEX_KEY, portDesc.index)
        if (portDesc.borderOffset !== null) port.setProperty(PORT_BORDER_OFFSET_KEY, portDesc.borderOffset)
        if (portDesc.labels.length > 0) {
          port.setLabels(portDesc.labels.map((l) => ({ text: l.text, position: { x: l.x, y: l.y }, size: { x: l.width, y: l.height } })))
        }
      }
      if (NODE_ACTIVATE[i]) {
        n.setProperty(INSIDE_SELF_LOOPS_ACTIVATE_KEY, true)
      }
      if (NODE_LABELS[i].length > 0) {
        n.setLabels(NODE_LABELS[i].map((l) => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })))
      }
      nodeOf.set(i, n)
    }
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      const parent = nodeOf.get(p)!
      const nested = nestedGraphs.get(p)!
      parent.setNestedGraph(nested)
      nested.setParentNode(parent)
      // ★ 容器节点 label 占位 (SSOT: LABEL_PAD[i] = 子图 padding.top, 对齐 buildLGraphFromParsed)
      if (LABEL_PAD[p] !== undefined && LABEL_PAD[p] !== null) nested.setPadding(LABEL_PAD[p])
      // ★ 节点级 mergeEdges → 嵌套图 (ELK createLGraph copyProperties; LGraphUtil.createPort 读图属性)
      if (NODE_OPTS[p]?.some(([k]) => k === 'org.eclipse.elk.layered.mergeEdges')) nested.setProperty(MERGE_EDGES_KEY, true)
    }
    __mergeEdges = false
    __defaultSide = PortSide.WEST
    if (__mergeEdges) graph.setProperty(MERGE_EDGES_KEY, true)
    // 边所在图 (LCA) 的 MERGE_EDGES (ELK ElkGraphImporter 源侧读边所在图; 目标侧读目标节点所在图).
    const __parentOf = new Map<number, number>()
    for (const [__p, __kids] of Object.entries(HIERARCHY)) for (const __k of __kids) __parentOf.set(__k, Number(__p))
    const __lcaMerge = (a: number, b: number): boolean => {
      const seen = new Set<number>()
      let x: number | undefined = a
      while (x !== undefined) { seen.add(x); x = __parentOf.get(x) }
      let y: number | undefined = b
      while (y !== undefined && !seen.has(y)) y = __parentOf.get(y)
      if (y === undefined) return graph.getProperty(MERGE_EDGES_KEY) === true
      const __py = __parentOf.get(y)
      const __g = __py === undefined ? graph : nestedGraphs.get(__py)!
      return __g.getProperty(MERGE_EDGES_KEY) === true
    }
    EDGE_IDX.forEach(([s, sp, , t, tp], ei) => {
      const __srcMerge = __lcaMerge(s, t)
      const __tgtMerge = nodeOf.get(t)!.getGraph()?.getProperty(MERGE_EDGES_KEY) === true
      const e = createSimpleEdge(nodeOf.get(s)!, nodeOf.get(t)!, sp, tp, __srcMerge, __tgtMerge)
      e.setProperty(MODEL_ORDER_KEY, ei)
      if (EDGE_YO[ei]) e.setProperty(INSIDE_SELF_LOOPS_YO_KEY, true)
      for (const l of EDGE_LABELS[ei]) {
        e.getLabels().push({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })
      }
    })
    if (Object.keys(HIERARCHY).length > 0) {
      graph.setProperty(HIERARCHY_HANDLING_KEY, 'INCLUDE_CHILDREN')
    }
    graph.setProperty(DIRECTION_KEY, 'LEFT')
    graph.setProperty('org.eclipse.elk.interactiveLayout', true)
    graph.setProperty('org.eclipse.elk.direction', "LEFT")
    graph.setProperty('org.eclipse.elk.randomSeed', 1)

    new LayeredLayoutProvider().layout(graph)

    if (false) {
      for (const n of nodeOf.values()) {
        expect(Number.isFinite(n.position.x)).toBe(true)
        expect(Number.isFinite(n.position.y)).toBe(true)
      }
      return
    }

    // L1 (M3): 与 ELK Java 0.12.0 jar oracle 坐标级差分 (容差 ε = 2).
    // oracle 坐标相对父块 (jar getX/getY); ggn 子图节点坐标同样相对父 → 直接对比, 无需世界坐标累加.
    const oracle = JSON.parse(readFileSync(new URL('../../../test-resources/jar-oracle/examples__user-hints__interactive-constraints__interactiveLayeredLayout_simpleDirectionTest.json', import.meta.url), 'utf8'))
    expect(oracle.hash, 'jar oracle 过期/缺失, 请重跑 node scripts/generate-jar-oracle.mjs').toBe('801f5c46c2ef2d8b')
    // ELK 类加载顺序变体 (EdgeMain vs BatchMain): oracle.variants 记录另一变体, 任一匹配即通过.
    const variants = oracle.variants ?? []
    for (let i = 0; i < DIMS.length; i++) {
      const gn = nodeOf.get(i)!
      const nm = 'N' + NAMES[i]
      const cands = [oracle.coords[nm], ...variants.map((v) => v.coords[nm])].filter(Boolean)
      expect(cands.length, nm + ' 缺少 jar oracle 坐标').toBeGreaterThan(0)
      const bestX = Math.min(...cands.map((c) => Math.abs(gn.position.x - c.x)))
      const bestY = Math.min(...cands.map((c) => Math.abs(gn.position.y - c.y)))
      expect(bestX, nm + ' x').toBeLessThanOrEqual(2)
      expect(bestY, nm + ' y').toBeLessThanOrEqual(2)
    }
  })
})

/**
 * elkt 生成: examples__user-hints__interactive-constraints__interactiveLayeredLayout_circle
 * 图: 3 节点 / 3 边 / 0 层级块
 * 差分: 坐标级 (1:1 ELK 对齐)
 */

describe('elkt 生成: examples__user-hints__interactive-constraints__interactiveLayeredLayout_circle', () => {
  const HIERARCHY: Record<number, number[]> = {}
  const EDGE_IDX: [number, number | null, string | null, number, number | null, string | null][] = [[0,null,null,1,null,null],[1,null,null,2,null,null],[2,null,null,0,null,null]]
  const EDGE_YO: boolean[] = [false,false,false]
  const EDGE_LABELS: { text: string; width: number; height: number; placement: string | null }[][] = [[],[],[]]
  const DIMS: [number, number][] = [[60,30],[60,30],[60,30]]
  const NAMES: string[] = ["n1","n2","n3"]
  const PORT_IDS: string[] = []
  const PORT_CONSTRAINTS: (string | null)[] = [null,null,null]
  const NODE_PORTS: { id: string; x: number; y: number; w: number; h: number; side: string | null; index: number | null; borderOffset: number | null; labels: { text: string; x: number; y: number; width: number; height: number }[] }[][] = [[],[],[]]
  const NODE_ACTIVATE: boolean[] = [false,false,false]
  const NODE_LABELS: { text: string; width: number; height: number; placement: string | null }[][] = [[{"text":"n1","width":0,"height":0,"placement":null}],[{"text":"n2","width":0,"height":0,"placement":null}],[{"text":"n3","width":0,"height":0,"placement":null}]]
  const LABEL_PAD: ({ top: number; left: number; right: number; bottom: number } | null)[] = [null,null,null]
  const NODE_OPTS: [string, unknown][][] = [[["org.eclipse.elk.layered.layering.layerChoiceConstraint",1]],[],[]]

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
      n.setProperty(MODEL_ORDER_KEY, i)
      if (PORT_CONSTRAINTS[i]) {
        n.setProperty(PORT_CONSTRAINTS_KEY, PORT_CONSTRAINTS[i] as any)
      }
      for (const [k, v] of NODE_OPTS[i]) {
        n.setProperty(k, v as any)
      }
      for (const portDesc of NODE_PORTS[i]) {
        const port = new LPort()
        port.setNode(n)
        port.getPosition().x = portDesc.x
        port.getPosition().y = portDesc.y
        port.size = { x: portDesc.w, y: portDesc.h }
        if (portDesc.side) port.setSide(portDesc.side as any)
        if (portDesc.index !== null) port.setProperty(PORT_INDEX_KEY, portDesc.index)
        if (portDesc.borderOffset !== null) port.setProperty(PORT_BORDER_OFFSET_KEY, portDesc.borderOffset)
        if (portDesc.labels.length > 0) {
          port.setLabels(portDesc.labels.map((l) => ({ text: l.text, position: { x: l.x, y: l.y }, size: { x: l.width, y: l.height } })))
        }
      }
      if (NODE_ACTIVATE[i]) {
        n.setProperty(INSIDE_SELF_LOOPS_ACTIVATE_KEY, true)
      }
      if (NODE_LABELS[i].length > 0) {
        n.setLabels(NODE_LABELS[i].map((l) => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })))
      }
      nodeOf.set(i, n)
      graphNodes.push(n)
    }
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      const parent = nodeOf.get(p)!
      const nested = nestedGraphs.get(p)!
      parent.setNestedGraph(nested)
      nested.setParentNode(parent)
      // ★ 容器节点 label 占位 (SSOT: LABEL_PAD[i] = 子图 padding.top, 对齐 buildLGraphFromParsed)
      if (LABEL_PAD[p] !== undefined && LABEL_PAD[p] !== null) nested.setPadding(LABEL_PAD[p])
      // ★ 节点级 mergeEdges → 嵌套图 (ELK createLGraph copyProperties; LGraphUtil.createPort 读图属性)
      if (NODE_OPTS[p]?.some(([k]) => k === 'org.eclipse.elk.layered.mergeEdges')) nested.setProperty(MERGE_EDGES_KEY, true)
    }
    __mergeEdges = false
    __defaultSide = PortSide.EAST
    if (__mergeEdges) graph.setProperty(MERGE_EDGES_KEY, true)
    // 边所在图 (LCA) 的 MERGE_EDGES (ELK ElkGraphImporter 源侧读边所在图; 目标侧读目标节点所在图).
    const __parentOf = new Map<number, number>()
    for (const [__p, __kids] of Object.entries(HIERARCHY)) for (const __k of __kids) __parentOf.set(__k, Number(__p))
    const __lcaMerge = (a: number, b: number): boolean => {
      const seen = new Set<number>()
      let x: number | undefined = a
      while (x !== undefined) { seen.add(x); x = __parentOf.get(x) }
      let y: number | undefined = b
      while (y !== undefined && !seen.has(y)) y = __parentOf.get(y)
      if (y === undefined) return graph.getProperty(MERGE_EDGES_KEY) === true
      const __py = __parentOf.get(y)
      const __g = __py === undefined ? graph : nestedGraphs.get(__py)!
      return __g.getProperty(MERGE_EDGES_KEY) === true
    }
    EDGE_IDX.forEach(([s, sp, , t, tp], ei) => {
      const __srcMerge = __lcaMerge(s, t)
      const __tgtMerge = nodeOf.get(t)!.getGraph()?.getProperty(MERGE_EDGES_KEY) === true
      const e = createSimpleEdge(nodeOf.get(s)!, nodeOf.get(t)!, sp, tp, __srcMerge, __tgtMerge)
      e.setProperty(MODEL_ORDER_KEY, ei)
      if (EDGE_YO[ei]) e.setProperty(INSIDE_SELF_LOOPS_YO_KEY, true)
      for (const l of EDGE_LABELS[ei]) {
        e.getLabels().push({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })
      }
    })
    if (Object.keys(HIERARCHY).length > 0) {
      graph.setProperty(HIERARCHY_HANDLING_KEY, 'INCLUDE_CHILDREN')
    }
    graph.setProperty(DIRECTION_KEY, 'RIGHT')
    graph.setProperty('org.eclipse.elk.interactiveLayout', true)
    graph.setProperty('org.eclipse.elk.direction', "RIGHT")
    graph.setProperty('org.eclipse.elk.randomSeed', 1)

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

  it('坐标级差分: 与 jar 0.12.0 1:1 对齐', () => {
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
      n.setProperty(MODEL_ORDER_KEY, i)
      if (PORT_CONSTRAINTS[i]) {
        n.setProperty(PORT_CONSTRAINTS_KEY, PORT_CONSTRAINTS[i] as any)
      }
      for (const [k, v] of NODE_OPTS[i]) {
        n.setProperty(k, v as any)
      }
      for (const portDesc of NODE_PORTS[i]) {
        const port = new LPort()
        port.setNode(n)
        port.getPosition().x = portDesc.x
        port.getPosition().y = portDesc.y
        port.size = { x: portDesc.w, y: portDesc.h }
        if (portDesc.side) port.setSide(portDesc.side as any)
        if (portDesc.index !== null) port.setProperty(PORT_INDEX_KEY, portDesc.index)
        if (portDesc.borderOffset !== null) port.setProperty(PORT_BORDER_OFFSET_KEY, portDesc.borderOffset)
        if (portDesc.labels.length > 0) {
          port.setLabels(portDesc.labels.map((l) => ({ text: l.text, position: { x: l.x, y: l.y }, size: { x: l.width, y: l.height } })))
        }
      }
      if (NODE_ACTIVATE[i]) {
        n.setProperty(INSIDE_SELF_LOOPS_ACTIVATE_KEY, true)
      }
      if (NODE_LABELS[i].length > 0) {
        n.setLabels(NODE_LABELS[i].map((l) => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })))
      }
      nodeOf.set(i, n)
    }
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      const parent = nodeOf.get(p)!
      const nested = nestedGraphs.get(p)!
      parent.setNestedGraph(nested)
      nested.setParentNode(parent)
      // ★ 容器节点 label 占位 (SSOT: LABEL_PAD[i] = 子图 padding.top, 对齐 buildLGraphFromParsed)
      if (LABEL_PAD[p] !== undefined && LABEL_PAD[p] !== null) nested.setPadding(LABEL_PAD[p])
      // ★ 节点级 mergeEdges → 嵌套图 (ELK createLGraph copyProperties; LGraphUtil.createPort 读图属性)
      if (NODE_OPTS[p]?.some(([k]) => k === 'org.eclipse.elk.layered.mergeEdges')) nested.setProperty(MERGE_EDGES_KEY, true)
    }
    __mergeEdges = false
    __defaultSide = PortSide.EAST
    if (__mergeEdges) graph.setProperty(MERGE_EDGES_KEY, true)
    // 边所在图 (LCA) 的 MERGE_EDGES (ELK ElkGraphImporter 源侧读边所在图; 目标侧读目标节点所在图).
    const __parentOf = new Map<number, number>()
    for (const [__p, __kids] of Object.entries(HIERARCHY)) for (const __k of __kids) __parentOf.set(__k, Number(__p))
    const __lcaMerge = (a: number, b: number): boolean => {
      const seen = new Set<number>()
      let x: number | undefined = a
      while (x !== undefined) { seen.add(x); x = __parentOf.get(x) }
      let y: number | undefined = b
      while (y !== undefined && !seen.has(y)) y = __parentOf.get(y)
      if (y === undefined) return graph.getProperty(MERGE_EDGES_KEY) === true
      const __py = __parentOf.get(y)
      const __g = __py === undefined ? graph : nestedGraphs.get(__py)!
      return __g.getProperty(MERGE_EDGES_KEY) === true
    }
    EDGE_IDX.forEach(([s, sp, , t, tp], ei) => {
      const __srcMerge = __lcaMerge(s, t)
      const __tgtMerge = nodeOf.get(t)!.getGraph()?.getProperty(MERGE_EDGES_KEY) === true
      const e = createSimpleEdge(nodeOf.get(s)!, nodeOf.get(t)!, sp, tp, __srcMerge, __tgtMerge)
      e.setProperty(MODEL_ORDER_KEY, ei)
      if (EDGE_YO[ei]) e.setProperty(INSIDE_SELF_LOOPS_YO_KEY, true)
      for (const l of EDGE_LABELS[ei]) {
        e.getLabels().push({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })
      }
    })
    if (Object.keys(HIERARCHY).length > 0) {
      graph.setProperty(HIERARCHY_HANDLING_KEY, 'INCLUDE_CHILDREN')
    }
    graph.setProperty(DIRECTION_KEY, 'RIGHT')
    graph.setProperty('org.eclipse.elk.interactiveLayout', true)
    graph.setProperty('org.eclipse.elk.direction', "RIGHT")
    graph.setProperty('org.eclipse.elk.randomSeed', 1)

    new LayeredLayoutProvider().layout(graph)

    if (false) {
      for (const n of nodeOf.values()) {
        expect(Number.isFinite(n.position.x)).toBe(true)
        expect(Number.isFinite(n.position.y)).toBe(true)
      }
      return
    }

    // L1 (M3): 与 ELK Java 0.12.0 jar oracle 坐标级差分 (容差 ε = 2).
    // oracle 坐标相对父块 (jar getX/getY); ggn 子图节点坐标同样相对父 → 直接对比, 无需世界坐标累加.
    const oracle = JSON.parse(readFileSync(new URL('../../../test-resources/jar-oracle/examples__user-hints__interactive-constraints__interactiveLayeredLayout_circle.json', import.meta.url), 'utf8'))
    expect(oracle.hash, 'jar oracle 过期/缺失, 请重跑 node scripts/generate-jar-oracle.mjs').toBe('eda659f8c8fe1ca3')
    // ELK 类加载顺序变体 (EdgeMain vs BatchMain): oracle.variants 记录另一变体, 任一匹配即通过.
    const variants = oracle.variants ?? []
    for (let i = 0; i < DIMS.length; i++) {
      const gn = nodeOf.get(i)!
      const nm = 'N' + NAMES[i]
      const cands = [oracle.coords[nm], ...variants.map((v) => v.coords[nm])].filter(Boolean)
      expect(cands.length, nm + ' 缺少 jar oracle 坐标').toBeGreaterThan(0)
      const bestX = Math.min(...cands.map((c) => Math.abs(gn.position.x - c.x)))
      const bestY = Math.min(...cands.map((c) => Math.abs(gn.position.y - c.y)))
      expect(bestX, nm + ' x').toBeLessThanOrEqual(2)
      expect(bestY, nm + ' y').toBeLessThanOrEqual(2)
    }
  })
})

/**
 * elkt 生成: examples__user-hints__interactive-constraints__interactiveLayeredLayout_simpleDirectionTest_pseudo_positions
 * 图: 4 节点 / 5 边 / 0 层级块
 * 差分: 坐标级 (1:1 ELK 对齐)
 */

describe('elkt 生成: examples__user-hints__interactive-constraints__interactiveLayeredLayout_simpleDirectionTest_pseudo_positions', () => {
  const HIERARCHY: Record<number, number[]> = {}
  const EDGE_IDX: [number, number | null, string | null, number, number | null, string | null][] = [[0,null,null,1,null,null],[0,null,null,1,null,null],[1,null,null,2,null,null],[1,null,null,2,null,null],[1,null,null,3,null,null]]
  const EDGE_YO: boolean[] = [false,false,false,false,false]
  const EDGE_LABELS: { text: string; width: number; height: number; placement: string | null }[][] = [[],[],[],[],[]]
  const DIMS: [number, number][] = [[60,30],[60,30],[60,30],[60,30]]
  const NAMES: string[] = ["n1","n2","n3","n4"]
  const PORT_IDS: string[] = []
  const PORT_CONSTRAINTS: (string | null)[] = [null,null,null,null]
  const NODE_PORTS: { id: string; x: number; y: number; w: number; h: number; side: string | null; index: number | null; borderOffset: number | null; labels: { text: string; x: number; y: number; width: number; height: number }[] }[][] = [[],[],[],[]]
  const NODE_ACTIVATE: boolean[] = [false,false,false,false]
  const NODE_LABELS: { text: string; width: number; height: number; placement: string | null }[][] = [[{"text":"n1","width":0,"height":0,"placement":null}],[{"text":"n2","width":0,"height":0,"placement":null}],[{"text":"n3","width":0,"height":0,"placement":null}],[{"text":"n4","width":0,"height":0,"placement":null}]]
  const LABEL_PAD: ({ top: number; left: number; right: number; bottom: number } | null)[] = [null,null,null,null]
  const NODE_OPTS: [string, unknown][][] = [[],[],[],[]]

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
      n.setProperty(MODEL_ORDER_KEY, i)
      if (PORT_CONSTRAINTS[i]) {
        n.setProperty(PORT_CONSTRAINTS_KEY, PORT_CONSTRAINTS[i] as any)
      }
      for (const [k, v] of NODE_OPTS[i]) {
        n.setProperty(k, v as any)
      }
      for (const portDesc of NODE_PORTS[i]) {
        const port = new LPort()
        port.setNode(n)
        port.getPosition().x = portDesc.x
        port.getPosition().y = portDesc.y
        port.size = { x: portDesc.w, y: portDesc.h }
        if (portDesc.side) port.setSide(portDesc.side as any)
        if (portDesc.index !== null) port.setProperty(PORT_INDEX_KEY, portDesc.index)
        if (portDesc.borderOffset !== null) port.setProperty(PORT_BORDER_OFFSET_KEY, portDesc.borderOffset)
        if (portDesc.labels.length > 0) {
          port.setLabels(portDesc.labels.map((l) => ({ text: l.text, position: { x: l.x, y: l.y }, size: { x: l.width, y: l.height } })))
        }
      }
      if (NODE_ACTIVATE[i]) {
        n.setProperty(INSIDE_SELF_LOOPS_ACTIVATE_KEY, true)
      }
      if (NODE_LABELS[i].length > 0) {
        n.setLabels(NODE_LABELS[i].map((l) => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })))
      }
      nodeOf.set(i, n)
      graphNodes.push(n)
    }
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      const parent = nodeOf.get(p)!
      const nested = nestedGraphs.get(p)!
      parent.setNestedGraph(nested)
      nested.setParentNode(parent)
      // ★ 容器节点 label 占位 (SSOT: LABEL_PAD[i] = 子图 padding.top, 对齐 buildLGraphFromParsed)
      if (LABEL_PAD[p] !== undefined && LABEL_PAD[p] !== null) nested.setPadding(LABEL_PAD[p])
      // ★ 节点级 mergeEdges → 嵌套图 (ELK createLGraph copyProperties; LGraphUtil.createPort 读图属性)
      if (NODE_OPTS[p]?.some(([k]) => k === 'org.eclipse.elk.layered.mergeEdges')) nested.setProperty(MERGE_EDGES_KEY, true)
    }
    __mergeEdges = false
    __defaultSide = PortSide.WEST
    if (__mergeEdges) graph.setProperty(MERGE_EDGES_KEY, true)
    // 边所在图 (LCA) 的 MERGE_EDGES (ELK ElkGraphImporter 源侧读边所在图; 目标侧读目标节点所在图).
    const __parentOf = new Map<number, number>()
    for (const [__p, __kids] of Object.entries(HIERARCHY)) for (const __k of __kids) __parentOf.set(__k, Number(__p))
    const __lcaMerge = (a: number, b: number): boolean => {
      const seen = new Set<number>()
      let x: number | undefined = a
      while (x !== undefined) { seen.add(x); x = __parentOf.get(x) }
      let y: number | undefined = b
      while (y !== undefined && !seen.has(y)) y = __parentOf.get(y)
      if (y === undefined) return graph.getProperty(MERGE_EDGES_KEY) === true
      const __py = __parentOf.get(y)
      const __g = __py === undefined ? graph : nestedGraphs.get(__py)!
      return __g.getProperty(MERGE_EDGES_KEY) === true
    }
    EDGE_IDX.forEach(([s, sp, , t, tp], ei) => {
      const __srcMerge = __lcaMerge(s, t)
      const __tgtMerge = nodeOf.get(t)!.getGraph()?.getProperty(MERGE_EDGES_KEY) === true
      const e = createSimpleEdge(nodeOf.get(s)!, nodeOf.get(t)!, sp, tp, __srcMerge, __tgtMerge)
      e.setProperty(MODEL_ORDER_KEY, ei)
      if (EDGE_YO[ei]) e.setProperty(INSIDE_SELF_LOOPS_YO_KEY, true)
      for (const l of EDGE_LABELS[ei]) {
        e.getLabels().push({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })
      }
    })
    if (Object.keys(HIERARCHY).length > 0) {
      graph.setProperty(HIERARCHY_HANDLING_KEY, 'INCLUDE_CHILDREN')
    }
    graph.setProperty(DIRECTION_KEY, 'LEFT')
    graph.setProperty('org.eclipse.elk.direction', "LEFT")
    graph.setProperty('org.eclipse.elk.layered.cycleBreaking.strategy', "INTERACTIVE")
    graph.setProperty('org.eclipse.elk.layered.layering.strategy', "INTERACTIVE")
    graph.setProperty('org.eclipse.elk.layered.crossingMinimization.semiInteractive', true)
    graph.setProperty('org.eclipse.elk.separateConnectedComponents', false)
    graph.setProperty('org.eclipse.elk.randomSeed', 1)

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

  it('坐标级差分: 与 jar 0.12.0 1:1 对齐', () => {
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
      n.setProperty(MODEL_ORDER_KEY, i)
      if (PORT_CONSTRAINTS[i]) {
        n.setProperty(PORT_CONSTRAINTS_KEY, PORT_CONSTRAINTS[i] as any)
      }
      for (const [k, v] of NODE_OPTS[i]) {
        n.setProperty(k, v as any)
      }
      for (const portDesc of NODE_PORTS[i]) {
        const port = new LPort()
        port.setNode(n)
        port.getPosition().x = portDesc.x
        port.getPosition().y = portDesc.y
        port.size = { x: portDesc.w, y: portDesc.h }
        if (portDesc.side) port.setSide(portDesc.side as any)
        if (portDesc.index !== null) port.setProperty(PORT_INDEX_KEY, portDesc.index)
        if (portDesc.borderOffset !== null) port.setProperty(PORT_BORDER_OFFSET_KEY, portDesc.borderOffset)
        if (portDesc.labels.length > 0) {
          port.setLabels(portDesc.labels.map((l) => ({ text: l.text, position: { x: l.x, y: l.y }, size: { x: l.width, y: l.height } })))
        }
      }
      if (NODE_ACTIVATE[i]) {
        n.setProperty(INSIDE_SELF_LOOPS_ACTIVATE_KEY, true)
      }
      if (NODE_LABELS[i].length > 0) {
        n.setLabels(NODE_LABELS[i].map((l) => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })))
      }
      nodeOf.set(i, n)
    }
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      const parent = nodeOf.get(p)!
      const nested = nestedGraphs.get(p)!
      parent.setNestedGraph(nested)
      nested.setParentNode(parent)
      // ★ 容器节点 label 占位 (SSOT: LABEL_PAD[i] = 子图 padding.top, 对齐 buildLGraphFromParsed)
      if (LABEL_PAD[p] !== undefined && LABEL_PAD[p] !== null) nested.setPadding(LABEL_PAD[p])
      // ★ 节点级 mergeEdges → 嵌套图 (ELK createLGraph copyProperties; LGraphUtil.createPort 读图属性)
      if (NODE_OPTS[p]?.some(([k]) => k === 'org.eclipse.elk.layered.mergeEdges')) nested.setProperty(MERGE_EDGES_KEY, true)
    }
    __mergeEdges = false
    __defaultSide = PortSide.WEST
    if (__mergeEdges) graph.setProperty(MERGE_EDGES_KEY, true)
    // 边所在图 (LCA) 的 MERGE_EDGES (ELK ElkGraphImporter 源侧读边所在图; 目标侧读目标节点所在图).
    const __parentOf = new Map<number, number>()
    for (const [__p, __kids] of Object.entries(HIERARCHY)) for (const __k of __kids) __parentOf.set(__k, Number(__p))
    const __lcaMerge = (a: number, b: number): boolean => {
      const seen = new Set<number>()
      let x: number | undefined = a
      while (x !== undefined) { seen.add(x); x = __parentOf.get(x) }
      let y: number | undefined = b
      while (y !== undefined && !seen.has(y)) y = __parentOf.get(y)
      if (y === undefined) return graph.getProperty(MERGE_EDGES_KEY) === true
      const __py = __parentOf.get(y)
      const __g = __py === undefined ? graph : nestedGraphs.get(__py)!
      return __g.getProperty(MERGE_EDGES_KEY) === true
    }
    EDGE_IDX.forEach(([s, sp, , t, tp], ei) => {
      const __srcMerge = __lcaMerge(s, t)
      const __tgtMerge = nodeOf.get(t)!.getGraph()?.getProperty(MERGE_EDGES_KEY) === true
      const e = createSimpleEdge(nodeOf.get(s)!, nodeOf.get(t)!, sp, tp, __srcMerge, __tgtMerge)
      e.setProperty(MODEL_ORDER_KEY, ei)
      if (EDGE_YO[ei]) e.setProperty(INSIDE_SELF_LOOPS_YO_KEY, true)
      for (const l of EDGE_LABELS[ei]) {
        e.getLabels().push({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })
      }
    })
    if (Object.keys(HIERARCHY).length > 0) {
      graph.setProperty(HIERARCHY_HANDLING_KEY, 'INCLUDE_CHILDREN')
    }
    graph.setProperty(DIRECTION_KEY, 'LEFT')
    graph.setProperty('org.eclipse.elk.direction', "LEFT")
    graph.setProperty('org.eclipse.elk.layered.cycleBreaking.strategy', "INTERACTIVE")
    graph.setProperty('org.eclipse.elk.layered.layering.strategy', "INTERACTIVE")
    graph.setProperty('org.eclipse.elk.layered.crossingMinimization.semiInteractive', true)
    graph.setProperty('org.eclipse.elk.separateConnectedComponents', false)
    graph.setProperty('org.eclipse.elk.randomSeed', 1)

    new LayeredLayoutProvider().layout(graph)

    if (false) {
      for (const n of nodeOf.values()) {
        expect(Number.isFinite(n.position.x)).toBe(true)
        expect(Number.isFinite(n.position.y)).toBe(true)
      }
      return
    }

    // L1 (M3): 与 ELK Java 0.12.0 jar oracle 坐标级差分 (容差 ε = 2).
    // oracle 坐标相对父块 (jar getX/getY); ggn 子图节点坐标同样相对父 → 直接对比, 无需世界坐标累加.
    const oracle = JSON.parse(readFileSync(new URL('../../../test-resources/jar-oracle/examples__user-hints__interactive-constraints__interactiveLayeredLayout_simpleDirectionTest_pseudo_positions.json', import.meta.url), 'utf8'))
    expect(oracle.hash, 'jar oracle 过期/缺失, 请重跑 node scripts/generate-jar-oracle.mjs').toBe('90f47512d26383ff')
    // ELK 类加载顺序变体 (EdgeMain vs BatchMain): oracle.variants 记录另一变体, 任一匹配即通过.
    const variants = oracle.variants ?? []
    for (let i = 0; i < DIMS.length; i++) {
      const gn = nodeOf.get(i)!
      const nm = 'N' + NAMES[i]
      const cands = [oracle.coords[nm], ...variants.map((v) => v.coords[nm])].filter(Boolean)
      expect(cands.length, nm + ' 缺少 jar oracle 坐标').toBeGreaterThan(0)
      const bestX = Math.min(...cands.map((c) => Math.abs(gn.position.x - c.x)))
      const bestY = Math.min(...cands.map((c) => Math.abs(gn.position.y - c.y)))
      expect(bestX, nm + ' x').toBeLessThanOrEqual(2)
      expect(bestY, nm + ' y').toBeLessThanOrEqual(2)
    }
  })
})

/**
 * elkt 生成: examples__user-hints__interactive-constraints__interactiveLayeredLayout_sortingTask
 * 图: 9 节点 / 9 边 / 0 层级块
 * 差分: 坐标级 (1:1 ELK 对齐)
 */

describe('elkt 生成: examples__user-hints__interactive-constraints__interactiveLayeredLayout_sortingTask', () => {
  const HIERARCHY: Record<number, number[]> = {}
  const EDGE_IDX: [number, number | null, string | null, number, number | null, string | null][] = [[1,null,null,3,null,null],[1,null,null,4,null,null],[3,null,null,0,null,null],[3,null,null,6,null,null],[4,null,null,6,null,null],[4,null,null,7,null,null],[5,null,null,2,null,null],[8,null,null,2,null,null],[2,null,null,7,null,null]]
  const EDGE_YO: boolean[] = [false,false,false,false,false,false,false,false,false]
  const EDGE_LABELS: { text: string; width: number; height: number; placement: string | null }[][] = [[],[],[],[],[],[],[],[],[]]
  const DIMS: [number, number][] = [[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30]]
  const NAMES: string[] = ["A","AA","AAA","B","BB","BBB","C","CC","CCC"]
  const PORT_IDS: string[] = []
  const PORT_CONSTRAINTS: (string | null)[] = [null,null,null,null,null,null,null,null,null]
  const NODE_PORTS: { id: string; x: number; y: number; w: number; h: number; side: string | null; index: number | null; borderOffset: number | null; labels: { text: string; x: number; y: number; width: number; height: number }[] }[][] = [[],[],[],[],[],[],[],[],[]]
  const NODE_ACTIVATE: boolean[] = [false,false,false,false,false,false,false,false,false]
  const NODE_LABELS: { text: string; width: number; height: number; placement: string | null }[][] = [[{"text":"A","width":0,"height":0,"placement":null}],[{"text":"AA","width":0,"height":0,"placement":null}],[{"text":"AAA","width":0,"height":0,"placement":null}],[{"text":"B","width":0,"height":0,"placement":null}],[{"text":"BB","width":0,"height":0,"placement":null}],[{"text":"BBB","width":0,"height":0,"placement":null}],[{"text":"C","width":0,"height":0,"placement":null}],[{"text":"CC","width":0,"height":0,"placement":null}],[{"text":"CCC","width":0,"height":0,"placement":null}]]
  const LABEL_PAD: ({ top: number; left: number; right: number; bottom: number } | null)[] = [null,null,null,null,null,null,null,null,null]
  const NODE_OPTS: [string, unknown][][] = [[["org.eclipse.elk.layered.layering.layerChoiceConstraint",0],["org.eclipse.elk.layered.crossingMinimization.positionChoiceConstraint",0]],[["org.eclipse.elk.layered.layering.layerChoiceConstraint",0],["org.eclipse.elk.layered.crossingMinimization.positionChoiceConstraint",1]],[["org.eclipse.elk.layered.layering.layerChoiceConstraint",0],["org.eclipse.elk.layered.crossingMinimization.positionChoiceConstraint",2]],[["org.eclipse.elk.layered.layering.layerChoiceConstraint",1],["org.eclipse.elk.layered.crossingMinimization.positionChoiceConstraint",0]],[["org.eclipse.elk.layered.layering.layerChoiceConstraint",1],["org.eclipse.elk.layered.crossingMinimization.positionChoiceConstraint",1]],[["org.eclipse.elk.layered.layering.layerChoiceConstraint",1],["org.eclipse.elk.layered.crossingMinimization.positionChoiceConstraint",2]],[["org.eclipse.elk.layered.layering.layerChoiceConstraint",2],["org.eclipse.elk.layered.crossingMinimization.positionChoiceConstraint",0]],[["org.eclipse.elk.layered.layering.layerChoiceConstraint",2],["org.eclipse.elk.layered.crossingMinimization.positionChoiceConstraint",1]],[["org.eclipse.elk.layered.layering.layerChoiceConstraint",2],["org.eclipse.elk.layered.crossingMinimization.positionChoiceConstraint",2]]]

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
      n.setProperty(MODEL_ORDER_KEY, i)
      if (PORT_CONSTRAINTS[i]) {
        n.setProperty(PORT_CONSTRAINTS_KEY, PORT_CONSTRAINTS[i] as any)
      }
      for (const [k, v] of NODE_OPTS[i]) {
        n.setProperty(k, v as any)
      }
      for (const portDesc of NODE_PORTS[i]) {
        const port = new LPort()
        port.setNode(n)
        port.getPosition().x = portDesc.x
        port.getPosition().y = portDesc.y
        port.size = { x: portDesc.w, y: portDesc.h }
        if (portDesc.side) port.setSide(portDesc.side as any)
        if (portDesc.index !== null) port.setProperty(PORT_INDEX_KEY, portDesc.index)
        if (portDesc.borderOffset !== null) port.setProperty(PORT_BORDER_OFFSET_KEY, portDesc.borderOffset)
        if (portDesc.labels.length > 0) {
          port.setLabels(portDesc.labels.map((l) => ({ text: l.text, position: { x: l.x, y: l.y }, size: { x: l.width, y: l.height } })))
        }
      }
      if (NODE_ACTIVATE[i]) {
        n.setProperty(INSIDE_SELF_LOOPS_ACTIVATE_KEY, true)
      }
      if (NODE_LABELS[i].length > 0) {
        n.setLabels(NODE_LABELS[i].map((l) => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })))
      }
      nodeOf.set(i, n)
      graphNodes.push(n)
    }
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      const parent = nodeOf.get(p)!
      const nested = nestedGraphs.get(p)!
      parent.setNestedGraph(nested)
      nested.setParentNode(parent)
      // ★ 容器节点 label 占位 (SSOT: LABEL_PAD[i] = 子图 padding.top, 对齐 buildLGraphFromParsed)
      if (LABEL_PAD[p] !== undefined && LABEL_PAD[p] !== null) nested.setPadding(LABEL_PAD[p])
      // ★ 节点级 mergeEdges → 嵌套图 (ELK createLGraph copyProperties; LGraphUtil.createPort 读图属性)
      if (NODE_OPTS[p]?.some(([k]) => k === 'org.eclipse.elk.layered.mergeEdges')) nested.setProperty(MERGE_EDGES_KEY, true)
    }
    __mergeEdges = false
    __defaultSide = PortSide.EAST
    if (__mergeEdges) graph.setProperty(MERGE_EDGES_KEY, true)
    // 边所在图 (LCA) 的 MERGE_EDGES (ELK ElkGraphImporter 源侧读边所在图; 目标侧读目标节点所在图).
    const __parentOf = new Map<number, number>()
    for (const [__p, __kids] of Object.entries(HIERARCHY)) for (const __k of __kids) __parentOf.set(__k, Number(__p))
    const __lcaMerge = (a: number, b: number): boolean => {
      const seen = new Set<number>()
      let x: number | undefined = a
      while (x !== undefined) { seen.add(x); x = __parentOf.get(x) }
      let y: number | undefined = b
      while (y !== undefined && !seen.has(y)) y = __parentOf.get(y)
      if (y === undefined) return graph.getProperty(MERGE_EDGES_KEY) === true
      const __py = __parentOf.get(y)
      const __g = __py === undefined ? graph : nestedGraphs.get(__py)!
      return __g.getProperty(MERGE_EDGES_KEY) === true
    }
    EDGE_IDX.forEach(([s, sp, , t, tp], ei) => {
      const __srcMerge = __lcaMerge(s, t)
      const __tgtMerge = nodeOf.get(t)!.getGraph()?.getProperty(MERGE_EDGES_KEY) === true
      const e = createSimpleEdge(nodeOf.get(s)!, nodeOf.get(t)!, sp, tp, __srcMerge, __tgtMerge)
      e.setProperty(MODEL_ORDER_KEY, ei)
      if (EDGE_YO[ei]) e.setProperty(INSIDE_SELF_LOOPS_YO_KEY, true)
      for (const l of EDGE_LABELS[ei]) {
        e.getLabels().push({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })
      }
    })
    if (Object.keys(HIERARCHY).length > 0) {
      graph.setProperty(HIERARCHY_HANDLING_KEY, 'INCLUDE_CHILDREN')
    }
    graph.setProperty(DIRECTION_KEY, 'RIGHT')
    graph.setProperty('org.eclipse.elk.interactiveLayout', true)
    graph.setProperty('org.eclipse.elk.direction', "RIGHT")
    graph.setProperty('org.eclipse.elk.randomSeed', 1)

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

  it('坐标级差分: 与 jar 0.12.0 1:1 对齐', () => {
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
      n.setProperty(MODEL_ORDER_KEY, i)
      if (PORT_CONSTRAINTS[i]) {
        n.setProperty(PORT_CONSTRAINTS_KEY, PORT_CONSTRAINTS[i] as any)
      }
      for (const [k, v] of NODE_OPTS[i]) {
        n.setProperty(k, v as any)
      }
      for (const portDesc of NODE_PORTS[i]) {
        const port = new LPort()
        port.setNode(n)
        port.getPosition().x = portDesc.x
        port.getPosition().y = portDesc.y
        port.size = { x: portDesc.w, y: portDesc.h }
        if (portDesc.side) port.setSide(portDesc.side as any)
        if (portDesc.index !== null) port.setProperty(PORT_INDEX_KEY, portDesc.index)
        if (portDesc.borderOffset !== null) port.setProperty(PORT_BORDER_OFFSET_KEY, portDesc.borderOffset)
        if (portDesc.labels.length > 0) {
          port.setLabels(portDesc.labels.map((l) => ({ text: l.text, position: { x: l.x, y: l.y }, size: { x: l.width, y: l.height } })))
        }
      }
      if (NODE_ACTIVATE[i]) {
        n.setProperty(INSIDE_SELF_LOOPS_ACTIVATE_KEY, true)
      }
      if (NODE_LABELS[i].length > 0) {
        n.setLabels(NODE_LABELS[i].map((l) => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })))
      }
      nodeOf.set(i, n)
    }
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      const parent = nodeOf.get(p)!
      const nested = nestedGraphs.get(p)!
      parent.setNestedGraph(nested)
      nested.setParentNode(parent)
      // ★ 容器节点 label 占位 (SSOT: LABEL_PAD[i] = 子图 padding.top, 对齐 buildLGraphFromParsed)
      if (LABEL_PAD[p] !== undefined && LABEL_PAD[p] !== null) nested.setPadding(LABEL_PAD[p])
      // ★ 节点级 mergeEdges → 嵌套图 (ELK createLGraph copyProperties; LGraphUtil.createPort 读图属性)
      if (NODE_OPTS[p]?.some(([k]) => k === 'org.eclipse.elk.layered.mergeEdges')) nested.setProperty(MERGE_EDGES_KEY, true)
    }
    __mergeEdges = false
    __defaultSide = PortSide.EAST
    if (__mergeEdges) graph.setProperty(MERGE_EDGES_KEY, true)
    // 边所在图 (LCA) 的 MERGE_EDGES (ELK ElkGraphImporter 源侧读边所在图; 目标侧读目标节点所在图).
    const __parentOf = new Map<number, number>()
    for (const [__p, __kids] of Object.entries(HIERARCHY)) for (const __k of __kids) __parentOf.set(__k, Number(__p))
    const __lcaMerge = (a: number, b: number): boolean => {
      const seen = new Set<number>()
      let x: number | undefined = a
      while (x !== undefined) { seen.add(x); x = __parentOf.get(x) }
      let y: number | undefined = b
      while (y !== undefined && !seen.has(y)) y = __parentOf.get(y)
      if (y === undefined) return graph.getProperty(MERGE_EDGES_KEY) === true
      const __py = __parentOf.get(y)
      const __g = __py === undefined ? graph : nestedGraphs.get(__py)!
      return __g.getProperty(MERGE_EDGES_KEY) === true
    }
    EDGE_IDX.forEach(([s, sp, , t, tp], ei) => {
      const __srcMerge = __lcaMerge(s, t)
      const __tgtMerge = nodeOf.get(t)!.getGraph()?.getProperty(MERGE_EDGES_KEY) === true
      const e = createSimpleEdge(nodeOf.get(s)!, nodeOf.get(t)!, sp, tp, __srcMerge, __tgtMerge)
      e.setProperty(MODEL_ORDER_KEY, ei)
      if (EDGE_YO[ei]) e.setProperty(INSIDE_SELF_LOOPS_YO_KEY, true)
      for (const l of EDGE_LABELS[ei]) {
        e.getLabels().push({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })
      }
    })
    if (Object.keys(HIERARCHY).length > 0) {
      graph.setProperty(HIERARCHY_HANDLING_KEY, 'INCLUDE_CHILDREN')
    }
    graph.setProperty(DIRECTION_KEY, 'RIGHT')
    graph.setProperty('org.eclipse.elk.interactiveLayout', true)
    graph.setProperty('org.eclipse.elk.direction', "RIGHT")
    graph.setProperty('org.eclipse.elk.randomSeed', 1)

    new LayeredLayoutProvider().layout(graph)

    if (false) {
      for (const n of nodeOf.values()) {
        expect(Number.isFinite(n.position.x)).toBe(true)
        expect(Number.isFinite(n.position.y)).toBe(true)
      }
      return
    }

    // L1 (M3): 与 ELK Java 0.12.0 jar oracle 坐标级差分 (容差 ε = 2).
    // oracle 坐标相对父块 (jar getX/getY); ggn 子图节点坐标同样相对父 → 直接对比, 无需世界坐标累加.
    const oracle = JSON.parse(readFileSync(new URL('../../../test-resources/jar-oracle/examples__user-hints__interactive-constraints__interactiveLayeredLayout_sortingTask.json', import.meta.url), 'utf8'))
    expect(oracle.hash, 'jar oracle 过期/缺失, 请重跑 node scripts/generate-jar-oracle.mjs').toBe('f9d468baeab0ffeb')
    // ELK 类加载顺序变体 (EdgeMain vs BatchMain): oracle.variants 记录另一变体, 任一匹配即通过.
    const variants = oracle.variants ?? []
    for (let i = 0; i < DIMS.length; i++) {
      const gn = nodeOf.get(i)!
      const nm = 'N' + NAMES[i]
      const cands = [oracle.coords[nm], ...variants.map((v) => v.coords[nm])].filter(Boolean)
      expect(cands.length, nm + ' 缺少 jar oracle 坐标').toBeGreaterThan(0)
      const bestX = Math.min(...cands.map((c) => Math.abs(gn.position.x - c.x)))
      const bestY = Math.min(...cands.map((c) => Math.abs(gn.position.y - c.y)))
      expect(bestX, nm + ' x').toBeLessThanOrEqual(2)
      expect(bestY, nm + ' y').toBeLessThanOrEqual(2)
    }
  })
})

describe('elkt 生成: examples__user-hints__interactive-constraints__interactiveLayout_mixedHierarchy', () => {
  // 含非 layered 算法 (stress/force): P2 图级路径不适用, 差分由 verify-elkg-java-layout (api 路径) 覆盖.
  it.skip('差分由 verify api 路径覆盖 (stress/force)', () => {})
})
/**
 * elkt 生成: examples__user-hints__interactive-constraints__interactiveLayeredLayout_hierarchyDirection_pseudo_positions
 * 图: 14 节点 / 8 边 / 0 层级块
 * 差分: 坐标级 (1:1 ELK 对齐)
 */

describe('elkt 生成: examples__user-hints__interactive-constraints__interactiveLayeredLayout_hierarchyDirection_pseudo_positions', () => {
  const HIERARCHY: Record<number, number[]> = {"0":[1,4],"1":[2,3],"9":[10,13],"10":[11,12]}
  const EDGE_IDX: [number, number | null, string | null, number, number | null, string | null][] = [[2,null,null,3,null,null],[5,null,null,9,null,null],[0,null,null,9,null,null],[7,null,null,9,null,null],[0,null,null,6,null,null],[9,null,null,6,null,null],[5,null,null,8,null,null],[8,null,null,0,null,null]]
  const EDGE_YO: boolean[] = [false,false,false,false,false,false,false,false]
  const EDGE_LABELS: { text: string; width: number; height: number; placement: string | null }[][] = [[],[],[],[],[],[],[],[]]
  const DIMS: [number, number][] = [[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30]]
  const NAMES: string[] = ["n1","n1.n11","n1.n11.n111","n1.n11.n112","n1.n12","n2","n3","n4","n5","n6","n6.n61","n6.n61.n611","n6.n61.n612","n6.n62"]
  const PORT_IDS: string[] = []
  const PORT_CONSTRAINTS: (string | null)[] = [null,null,null,null,null,null,null,null,null,null,null,null,null,null]
  const NODE_PORTS: { id: string; x: number; y: number; w: number; h: number; side: string | null; index: number | null; borderOffset: number | null; labels: { text: string; x: number; y: number; width: number; height: number }[] }[][] = [[],[],[],[],[],[],[],[],[],[],[],[],[],[]]
  const NODE_ACTIVATE: boolean[] = [false,false,false,false,false,false,false,false,false,false,false,false,false,false]
  const NODE_LABELS: { text: string; width: number; height: number; placement: string | null }[][] = [[{"text":"n1","width":0,"height":0,"placement":null}],[{"text":"n11","width":0,"height":0,"placement":null}],[{"text":"n111","width":0,"height":0,"placement":null}],[{"text":"n112","width":0,"height":0,"placement":null}],[{"text":"n12","width":0,"height":0,"placement":null}],[{"text":"n2","width":0,"height":0,"placement":null}],[{"text":"n3","width":0,"height":0,"placement":null}],[{"text":"n4","width":0,"height":0,"placement":null}],[{"text":"n5","width":0,"height":0,"placement":null}],[{"text":"n6","width":0,"height":0,"placement":null}],[{"text":"n61","width":0,"height":0,"placement":null}],[{"text":"n611","width":0,"height":0,"placement":null}],[{"text":"n612","width":0,"height":0,"placement":null}],[{"text":"n62","width":0,"height":0,"placement":null}]]
  const LABEL_PAD: ({ top: number; left: number; right: number; bottom: number } | null)[] = [{"top":12,"bottom":12,"left":12,"right":12},{"top":12,"bottom":12,"left":12,"right":12},null,null,null,null,null,null,null,{"top":12,"bottom":12,"left":12,"right":12},{"top":12,"bottom":12,"left":12,"right":12},null,null,null]
  const NODE_OPTS: [string, unknown][][] = [[["org.eclipse.elk.direction","DOWN"],["org.eclipse.elk.layered.cycleBreaking.strategy","INTERACTIVE"],["org.eclipse.elk.layered.layering.strategy","INTERACTIVE"],["org.eclipse.elk.layered.crossingMinimization.semiInteractive",true],["org.eclipse.elk.separateConnectedComponents",false]],[["org.eclipse.elk.direction","UP"],["org.eclipse.elk.layered.cycleBreaking.strategy","INTERACTIVE"],["org.eclipse.elk.layered.layering.strategy","INTERACTIVE"],["org.eclipse.elk.layered.crossingMinimization.semiInteractive",true],["org.eclipse.elk.separateConnectedComponents",false]],[],[],[],[],[],[],[],[["org.eclipse.elk.separateConnectedComponents",false],["org.eclipse.elk.layered.cycleBreaking.strategy","INTERACTIVE"],["org.eclipse.elk.layered.layering.strategy","INTERACTIVE"],["org.eclipse.elk.direction","LEFT"]],[["org.eclipse.elk.direction","RIGHT"]],[],[],[]]

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
      n.setProperty(MODEL_ORDER_KEY, i)
      if (PORT_CONSTRAINTS[i]) {
        n.setProperty(PORT_CONSTRAINTS_KEY, PORT_CONSTRAINTS[i] as any)
      }
      for (const [k, v] of NODE_OPTS[i]) {
        n.setProperty(k, v as any)
      }
      for (const portDesc of NODE_PORTS[i]) {
        const port = new LPort()
        port.setNode(n)
        port.getPosition().x = portDesc.x
        port.getPosition().y = portDesc.y
        port.size = { x: portDesc.w, y: portDesc.h }
        if (portDesc.side) port.setSide(portDesc.side as any)
        if (portDesc.index !== null) port.setProperty(PORT_INDEX_KEY, portDesc.index)
        if (portDesc.borderOffset !== null) port.setProperty(PORT_BORDER_OFFSET_KEY, portDesc.borderOffset)
        if (portDesc.labels.length > 0) {
          port.setLabels(portDesc.labels.map((l) => ({ text: l.text, position: { x: l.x, y: l.y }, size: { x: l.width, y: l.height } })))
        }
      }
      if (NODE_ACTIVATE[i]) {
        n.setProperty(INSIDE_SELF_LOOPS_ACTIVATE_KEY, true)
      }
      if (NODE_LABELS[i].length > 0) {
        n.setLabels(NODE_LABELS[i].map((l) => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })))
      }
      nodeOf.set(i, n)
      graphNodes.push(n)
    }
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      const parent = nodeOf.get(p)!
      const nested = nestedGraphs.get(p)!
      parent.setNestedGraph(nested)
      nested.setParentNode(parent)
      // ★ 容器节点 label 占位 (SSOT: LABEL_PAD[i] = 子图 padding.top, 对齐 buildLGraphFromParsed)
      if (LABEL_PAD[p] !== undefined && LABEL_PAD[p] !== null) nested.setPadding(LABEL_PAD[p])
      // ★ 节点级 mergeEdges → 嵌套图 (ELK createLGraph copyProperties; LGraphUtil.createPort 读图属性)
      if (NODE_OPTS[p]?.some(([k]) => k === 'org.eclipse.elk.layered.mergeEdges')) nested.setProperty(MERGE_EDGES_KEY, true)
    }
    __mergeEdges = false
    __defaultSide = PortSide.EAST
    if (__mergeEdges) graph.setProperty(MERGE_EDGES_KEY, true)
    // 边所在图 (LCA) 的 MERGE_EDGES (ELK ElkGraphImporter 源侧读边所在图; 目标侧读目标节点所在图).
    const __parentOf = new Map<number, number>()
    for (const [__p, __kids] of Object.entries(HIERARCHY)) for (const __k of __kids) __parentOf.set(__k, Number(__p))
    const __lcaMerge = (a: number, b: number): boolean => {
      const seen = new Set<number>()
      let x: number | undefined = a
      while (x !== undefined) { seen.add(x); x = __parentOf.get(x) }
      let y: number | undefined = b
      while (y !== undefined && !seen.has(y)) y = __parentOf.get(y)
      if (y === undefined) return graph.getProperty(MERGE_EDGES_KEY) === true
      const __py = __parentOf.get(y)
      const __g = __py === undefined ? graph : nestedGraphs.get(__py)!
      return __g.getProperty(MERGE_EDGES_KEY) === true
    }
    EDGE_IDX.forEach(([s, sp, , t, tp], ei) => {
      const __srcMerge = __lcaMerge(s, t)
      const __tgtMerge = nodeOf.get(t)!.getGraph()?.getProperty(MERGE_EDGES_KEY) === true
      const e = createSimpleEdge(nodeOf.get(s)!, nodeOf.get(t)!, sp, tp, __srcMerge, __tgtMerge)
      e.setProperty(MODEL_ORDER_KEY, ei)
      if (EDGE_YO[ei]) e.setProperty(INSIDE_SELF_LOOPS_YO_KEY, true)
      for (const l of EDGE_LABELS[ei]) {
        e.getLabels().push({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })
      }
    })
    if (Object.keys(HIERARCHY).length > 0) {
      graph.setProperty(HIERARCHY_HANDLING_KEY, 'INCLUDE_CHILDREN')
    }
    graph.setProperty(DIRECTION_KEY, 'RIGHT')
    graph.setProperty('org.eclipse.elk.direction', "RIGHT")
    graph.setProperty('org.eclipse.elk.randomSeed', 1)

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

  it('坐标级差分: 与 jar 0.12.0 1:1 对齐', () => {
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
      n.setProperty(MODEL_ORDER_KEY, i)
      if (PORT_CONSTRAINTS[i]) {
        n.setProperty(PORT_CONSTRAINTS_KEY, PORT_CONSTRAINTS[i] as any)
      }
      for (const [k, v] of NODE_OPTS[i]) {
        n.setProperty(k, v as any)
      }
      for (const portDesc of NODE_PORTS[i]) {
        const port = new LPort()
        port.setNode(n)
        port.getPosition().x = portDesc.x
        port.getPosition().y = portDesc.y
        port.size = { x: portDesc.w, y: portDesc.h }
        if (portDesc.side) port.setSide(portDesc.side as any)
        if (portDesc.index !== null) port.setProperty(PORT_INDEX_KEY, portDesc.index)
        if (portDesc.borderOffset !== null) port.setProperty(PORT_BORDER_OFFSET_KEY, portDesc.borderOffset)
        if (portDesc.labels.length > 0) {
          port.setLabels(portDesc.labels.map((l) => ({ text: l.text, position: { x: l.x, y: l.y }, size: { x: l.width, y: l.height } })))
        }
      }
      if (NODE_ACTIVATE[i]) {
        n.setProperty(INSIDE_SELF_LOOPS_ACTIVATE_KEY, true)
      }
      if (NODE_LABELS[i].length > 0) {
        n.setLabels(NODE_LABELS[i].map((l) => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })))
      }
      nodeOf.set(i, n)
    }
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      const parent = nodeOf.get(p)!
      const nested = nestedGraphs.get(p)!
      parent.setNestedGraph(nested)
      nested.setParentNode(parent)
      // ★ 容器节点 label 占位 (SSOT: LABEL_PAD[i] = 子图 padding.top, 对齐 buildLGraphFromParsed)
      if (LABEL_PAD[p] !== undefined && LABEL_PAD[p] !== null) nested.setPadding(LABEL_PAD[p])
      // ★ 节点级 mergeEdges → 嵌套图 (ELK createLGraph copyProperties; LGraphUtil.createPort 读图属性)
      if (NODE_OPTS[p]?.some(([k]) => k === 'org.eclipse.elk.layered.mergeEdges')) nested.setProperty(MERGE_EDGES_KEY, true)
    }
    __mergeEdges = false
    __defaultSide = PortSide.EAST
    if (__mergeEdges) graph.setProperty(MERGE_EDGES_KEY, true)
    // 边所在图 (LCA) 的 MERGE_EDGES (ELK ElkGraphImporter 源侧读边所在图; 目标侧读目标节点所在图).
    const __parentOf = new Map<number, number>()
    for (const [__p, __kids] of Object.entries(HIERARCHY)) for (const __k of __kids) __parentOf.set(__k, Number(__p))
    const __lcaMerge = (a: number, b: number): boolean => {
      const seen = new Set<number>()
      let x: number | undefined = a
      while (x !== undefined) { seen.add(x); x = __parentOf.get(x) }
      let y: number | undefined = b
      while (y !== undefined && !seen.has(y)) y = __parentOf.get(y)
      if (y === undefined) return graph.getProperty(MERGE_EDGES_KEY) === true
      const __py = __parentOf.get(y)
      const __g = __py === undefined ? graph : nestedGraphs.get(__py)!
      return __g.getProperty(MERGE_EDGES_KEY) === true
    }
    EDGE_IDX.forEach(([s, sp, , t, tp], ei) => {
      const __srcMerge = __lcaMerge(s, t)
      const __tgtMerge = nodeOf.get(t)!.getGraph()?.getProperty(MERGE_EDGES_KEY) === true
      const e = createSimpleEdge(nodeOf.get(s)!, nodeOf.get(t)!, sp, tp, __srcMerge, __tgtMerge)
      e.setProperty(MODEL_ORDER_KEY, ei)
      if (EDGE_YO[ei]) e.setProperty(INSIDE_SELF_LOOPS_YO_KEY, true)
      for (const l of EDGE_LABELS[ei]) {
        e.getLabels().push({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })
      }
    })
    if (Object.keys(HIERARCHY).length > 0) {
      graph.setProperty(HIERARCHY_HANDLING_KEY, 'INCLUDE_CHILDREN')
    }
    graph.setProperty(DIRECTION_KEY, 'RIGHT')
    graph.setProperty('org.eclipse.elk.direction', "RIGHT")
    graph.setProperty('org.eclipse.elk.randomSeed', 1)

    new LayeredLayoutProvider().layout(graph)

    if (false) {
      for (const n of nodeOf.values()) {
        expect(Number.isFinite(n.position.x)).toBe(true)
        expect(Number.isFinite(n.position.y)).toBe(true)
      }
      return
    }

    // L1 (M3): 与 ELK Java 0.12.0 jar oracle 坐标级差分 (容差 ε = 2).
    // oracle 坐标相对父块 (jar getX/getY); ggn 子图节点坐标同样相对父 → 直接对比, 无需世界坐标累加.
    const oracle = JSON.parse(readFileSync(new URL('../../../test-resources/jar-oracle/examples__user-hints__interactive-constraints__interactiveLayeredLayout_hierarchyDirection_pseudo_positions.json', import.meta.url), 'utf8'))
    expect(oracle.hash, 'jar oracle 过期/缺失, 请重跑 node scripts/generate-jar-oracle.mjs').toBe('a492fe5236e22c02')
    // ELK 类加载顺序变体 (EdgeMain vs BatchMain): oracle.variants 记录另一变体, 任一匹配即通过.
    const variants = oracle.variants ?? []
    for (let i = 0; i < DIMS.length; i++) {
      const gn = nodeOf.get(i)!
      const nm = 'N' + NAMES[i]
      const cands = [oracle.coords[nm], ...variants.map((v) => v.coords[nm])].filter(Boolean)
      expect(cands.length, nm + ' 缺少 jar oracle 坐标').toBeGreaterThan(0)
      const bestX = Math.min(...cands.map((c) => Math.abs(gn.position.x - c.x)))
      const bestY = Math.min(...cands.map((c) => Math.abs(gn.position.y - c.y)))
      expect(bestX, nm + ' x').toBeLessThanOrEqual(2)
      expect(bestY, nm + ' y').toBeLessThanOrEqual(2)
    }
  })
})

/**
 * elkt 生成: examples__user-hints__interactive-constraints__interactiveLayeredLayout_motor
 * 图: 6 节点 / 9 边 / 0 层级块
 * 差分: 坐标级 (1:1 ELK 对齐)
 */

describe('elkt 生成: examples__user-hints__interactive-constraints__interactiveLayeredLayout_motor', () => {
  const HIERARCHY: Record<number, number[]> = {}
  const EDGE_IDX: [number, number | null, string | null, number, number | null, string | null][] = [[0,null,null,1,null,null],[0,null,null,2,null,null],[1,null,null,3,null,null],[2,null,null,4,null,null],[3,null,null,5,null,null],[4,null,null,5,null,null],[5,null,null,0,null,null],[5,null,null,0,null,null],[3,null,null,5,null,null]]
  const EDGE_YO: boolean[] = [false,false,false,false,false,false,false,false,false]
  const EDGE_LABELS: { text: string; width: number; height: number; placement: string | null }[][] = [[],[],[],[],[],[],[],[],[]]
  const DIMS: [number, number][] = [[60,30],[60,30],[60,30],[60,30],[60,30],[60,30]]
  const NAMES: string[] = ["Pause","Accel","Deccel","CheckMax","CheckMin","SetPeriod"]
  const PORT_IDS: string[] = []
  const PORT_CONSTRAINTS: (string | null)[] = [null,null,null,null,null,null]
  const NODE_PORTS: { id: string; x: number; y: number; w: number; h: number; side: string | null; index: number | null; borderOffset: number | null; labels: { text: string; x: number; y: number; width: number; height: number }[] }[][] = [[],[],[],[],[],[]]
  const NODE_ACTIVATE: boolean[] = [false,false,false,false,false,false]
  const NODE_LABELS: { text: string; width: number; height: number; placement: string | null }[][] = [[{"text":"Pause","width":0,"height":0,"placement":null}],[{"text":"Accel","width":0,"height":0,"placement":null}],[{"text":"Deccel","width":0,"height":0,"placement":null}],[{"text":"CheckMax","width":0,"height":0,"placement":null}],[{"text":"CheckMin","width":0,"height":0,"placement":null}],[{"text":"SetPeriod","width":0,"height":0,"placement":null}]]
  const LABEL_PAD: ({ top: number; left: number; right: number; bottom: number } | null)[] = [null,null,null,null,null,null]
  const NODE_OPTS: [string, unknown][][] = [[["org.eclipse.elk.layered.crossingMinimization.positionChoiceConstraint",0],["org.eclipse.elk.layered.layering.layerChoiceConstraint",3]],[["org.eclipse.elk.layered.layering.layerChoiceConstraint",2],["org.eclipse.elk.layered.crossingMinimization.positionChoiceConstraint",0]],[["org.eclipse.elk.layered.layering.layerChoiceConstraint",2],["org.eclipse.elk.layered.crossingMinimization.positionChoiceConstraint",1]],[["org.eclipse.elk.layered.crossingMinimization.positionChoiceConstraint",0],["org.eclipse.elk.layered.layering.layerChoiceConstraint",1]],[["org.eclipse.elk.layered.crossingMinimization.positionChoiceConstraint",1],["org.eclipse.elk.layered.layering.layerChoiceConstraint",1]],[]]

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
      n.setProperty(MODEL_ORDER_KEY, i)
      if (PORT_CONSTRAINTS[i]) {
        n.setProperty(PORT_CONSTRAINTS_KEY, PORT_CONSTRAINTS[i] as any)
      }
      for (const [k, v] of NODE_OPTS[i]) {
        n.setProperty(k, v as any)
      }
      for (const portDesc of NODE_PORTS[i]) {
        const port = new LPort()
        port.setNode(n)
        port.getPosition().x = portDesc.x
        port.getPosition().y = portDesc.y
        port.size = { x: portDesc.w, y: portDesc.h }
        if (portDesc.side) port.setSide(portDesc.side as any)
        if (portDesc.index !== null) port.setProperty(PORT_INDEX_KEY, portDesc.index)
        if (portDesc.borderOffset !== null) port.setProperty(PORT_BORDER_OFFSET_KEY, portDesc.borderOffset)
        if (portDesc.labels.length > 0) {
          port.setLabels(portDesc.labels.map((l) => ({ text: l.text, position: { x: l.x, y: l.y }, size: { x: l.width, y: l.height } })))
        }
      }
      if (NODE_ACTIVATE[i]) {
        n.setProperty(INSIDE_SELF_LOOPS_ACTIVATE_KEY, true)
      }
      if (NODE_LABELS[i].length > 0) {
        n.setLabels(NODE_LABELS[i].map((l) => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })))
      }
      nodeOf.set(i, n)
      graphNodes.push(n)
    }
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      const parent = nodeOf.get(p)!
      const nested = nestedGraphs.get(p)!
      parent.setNestedGraph(nested)
      nested.setParentNode(parent)
      // ★ 容器节点 label 占位 (SSOT: LABEL_PAD[i] = 子图 padding.top, 对齐 buildLGraphFromParsed)
      if (LABEL_PAD[p] !== undefined && LABEL_PAD[p] !== null) nested.setPadding(LABEL_PAD[p])
      // ★ 节点级 mergeEdges → 嵌套图 (ELK createLGraph copyProperties; LGraphUtil.createPort 读图属性)
      if (NODE_OPTS[p]?.some(([k]) => k === 'org.eclipse.elk.layered.mergeEdges')) nested.setProperty(MERGE_EDGES_KEY, true)
    }
    __mergeEdges = false
    __defaultSide = PortSide.EAST
    if (__mergeEdges) graph.setProperty(MERGE_EDGES_KEY, true)
    // 边所在图 (LCA) 的 MERGE_EDGES (ELK ElkGraphImporter 源侧读边所在图; 目标侧读目标节点所在图).
    const __parentOf = new Map<number, number>()
    for (const [__p, __kids] of Object.entries(HIERARCHY)) for (const __k of __kids) __parentOf.set(__k, Number(__p))
    const __lcaMerge = (a: number, b: number): boolean => {
      const seen = new Set<number>()
      let x: number | undefined = a
      while (x !== undefined) { seen.add(x); x = __parentOf.get(x) }
      let y: number | undefined = b
      while (y !== undefined && !seen.has(y)) y = __parentOf.get(y)
      if (y === undefined) return graph.getProperty(MERGE_EDGES_KEY) === true
      const __py = __parentOf.get(y)
      const __g = __py === undefined ? graph : nestedGraphs.get(__py)!
      return __g.getProperty(MERGE_EDGES_KEY) === true
    }
    EDGE_IDX.forEach(([s, sp, , t, tp], ei) => {
      const __srcMerge = __lcaMerge(s, t)
      const __tgtMerge = nodeOf.get(t)!.getGraph()?.getProperty(MERGE_EDGES_KEY) === true
      const e = createSimpleEdge(nodeOf.get(s)!, nodeOf.get(t)!, sp, tp, __srcMerge, __tgtMerge)
      e.setProperty(MODEL_ORDER_KEY, ei)
      if (EDGE_YO[ei]) e.setProperty(INSIDE_SELF_LOOPS_YO_KEY, true)
      for (const l of EDGE_LABELS[ei]) {
        e.getLabels().push({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })
      }
    })
    if (Object.keys(HIERARCHY).length > 0) {
      graph.setProperty(HIERARCHY_HANDLING_KEY, 'INCLUDE_CHILDREN')
    }
    graph.setProperty(DIRECTION_KEY, 'RIGHT')
    graph.setProperty('org.eclipse.elk.interactiveLayout', true)
    graph.setProperty('org.eclipse.elk.direction', "RIGHT")
    graph.setProperty('org.eclipse.elk.randomSeed', 1)

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

  it('坐标级差分: 与 jar 0.12.0 1:1 对齐', () => {
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
      n.setProperty(MODEL_ORDER_KEY, i)
      if (PORT_CONSTRAINTS[i]) {
        n.setProperty(PORT_CONSTRAINTS_KEY, PORT_CONSTRAINTS[i] as any)
      }
      for (const [k, v] of NODE_OPTS[i]) {
        n.setProperty(k, v as any)
      }
      for (const portDesc of NODE_PORTS[i]) {
        const port = new LPort()
        port.setNode(n)
        port.getPosition().x = portDesc.x
        port.getPosition().y = portDesc.y
        port.size = { x: portDesc.w, y: portDesc.h }
        if (portDesc.side) port.setSide(portDesc.side as any)
        if (portDesc.index !== null) port.setProperty(PORT_INDEX_KEY, portDesc.index)
        if (portDesc.borderOffset !== null) port.setProperty(PORT_BORDER_OFFSET_KEY, portDesc.borderOffset)
        if (portDesc.labels.length > 0) {
          port.setLabels(portDesc.labels.map((l) => ({ text: l.text, position: { x: l.x, y: l.y }, size: { x: l.width, y: l.height } })))
        }
      }
      if (NODE_ACTIVATE[i]) {
        n.setProperty(INSIDE_SELF_LOOPS_ACTIVATE_KEY, true)
      }
      if (NODE_LABELS[i].length > 0) {
        n.setLabels(NODE_LABELS[i].map((l) => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })))
      }
      nodeOf.set(i, n)
    }
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      const parent = nodeOf.get(p)!
      const nested = nestedGraphs.get(p)!
      parent.setNestedGraph(nested)
      nested.setParentNode(parent)
      // ★ 容器节点 label 占位 (SSOT: LABEL_PAD[i] = 子图 padding.top, 对齐 buildLGraphFromParsed)
      if (LABEL_PAD[p] !== undefined && LABEL_PAD[p] !== null) nested.setPadding(LABEL_PAD[p])
      // ★ 节点级 mergeEdges → 嵌套图 (ELK createLGraph copyProperties; LGraphUtil.createPort 读图属性)
      if (NODE_OPTS[p]?.some(([k]) => k === 'org.eclipse.elk.layered.mergeEdges')) nested.setProperty(MERGE_EDGES_KEY, true)
    }
    __mergeEdges = false
    __defaultSide = PortSide.EAST
    if (__mergeEdges) graph.setProperty(MERGE_EDGES_KEY, true)
    // 边所在图 (LCA) 的 MERGE_EDGES (ELK ElkGraphImporter 源侧读边所在图; 目标侧读目标节点所在图).
    const __parentOf = new Map<number, number>()
    for (const [__p, __kids] of Object.entries(HIERARCHY)) for (const __k of __kids) __parentOf.set(__k, Number(__p))
    const __lcaMerge = (a: number, b: number): boolean => {
      const seen = new Set<number>()
      let x: number | undefined = a
      while (x !== undefined) { seen.add(x); x = __parentOf.get(x) }
      let y: number | undefined = b
      while (y !== undefined && !seen.has(y)) y = __parentOf.get(y)
      if (y === undefined) return graph.getProperty(MERGE_EDGES_KEY) === true
      const __py = __parentOf.get(y)
      const __g = __py === undefined ? graph : nestedGraphs.get(__py)!
      return __g.getProperty(MERGE_EDGES_KEY) === true
    }
    EDGE_IDX.forEach(([s, sp, , t, tp], ei) => {
      const __srcMerge = __lcaMerge(s, t)
      const __tgtMerge = nodeOf.get(t)!.getGraph()?.getProperty(MERGE_EDGES_KEY) === true
      const e = createSimpleEdge(nodeOf.get(s)!, nodeOf.get(t)!, sp, tp, __srcMerge, __tgtMerge)
      e.setProperty(MODEL_ORDER_KEY, ei)
      if (EDGE_YO[ei]) e.setProperty(INSIDE_SELF_LOOPS_YO_KEY, true)
      for (const l of EDGE_LABELS[ei]) {
        e.getLabels().push({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })
      }
    })
    if (Object.keys(HIERARCHY).length > 0) {
      graph.setProperty(HIERARCHY_HANDLING_KEY, 'INCLUDE_CHILDREN')
    }
    graph.setProperty(DIRECTION_KEY, 'RIGHT')
    graph.setProperty('org.eclipse.elk.interactiveLayout', true)
    graph.setProperty('org.eclipse.elk.direction', "RIGHT")
    graph.setProperty('org.eclipse.elk.randomSeed', 1)

    new LayeredLayoutProvider().layout(graph)

    if (false) {
      for (const n of nodeOf.values()) {
        expect(Number.isFinite(n.position.x)).toBe(true)
        expect(Number.isFinite(n.position.y)).toBe(true)
      }
      return
    }

    // L1 (M3): 与 ELK Java 0.12.0 jar oracle 坐标级差分 (容差 ε = 2).
    // oracle 坐标相对父块 (jar getX/getY); ggn 子图节点坐标同样相对父 → 直接对比, 无需世界坐标累加.
    const oracle = JSON.parse(readFileSync(new URL('../../../test-resources/jar-oracle/examples__user-hints__interactive-constraints__interactiveLayeredLayout_motor.json', import.meta.url), 'utf8'))
    expect(oracle.hash, 'jar oracle 过期/缺失, 请重跑 node scripts/generate-jar-oracle.mjs').toBe('bee7f92be2b1b11a')
    // ELK 类加载顺序变体 (EdgeMain vs BatchMain): oracle.variants 记录另一变体, 任一匹配即通过.
    const variants = oracle.variants ?? []
    for (let i = 0; i < DIMS.length; i++) {
      const gn = nodeOf.get(i)!
      const nm = 'N' + NAMES[i]
      const cands = [oracle.coords[nm], ...variants.map((v) => v.coords[nm])].filter(Boolean)
      expect(cands.length, nm + ' 缺少 jar oracle 坐标').toBeGreaterThan(0)
      const bestX = Math.min(...cands.map((c) => Math.abs(gn.position.x - c.x)))
      const bestY = Math.min(...cands.map((c) => Math.abs(gn.position.y - c.y)))
      expect(bestX, nm + ' x').toBeLessThanOrEqual(2)
      expect(bestY, nm + ' y').toBeLessThanOrEqual(2)
    }
  })
})

/**
 * elkt 生成: examples__user-hints__interactive-constraints__interactiveLayeredLayout_circle_pseudo_positions
 * 图: 3 节点 / 3 边 / 0 层级块
 * 差分: 坐标级 (1:1 ELK 对齐)
 */

describe('elkt 生成: examples__user-hints__interactive-constraints__interactiveLayeredLayout_circle_pseudo_positions', () => {
  const HIERARCHY: Record<number, number[]> = {}
  const EDGE_IDX: [number, number | null, string | null, number, number | null, string | null][] = [[0,null,null,1,null,null],[1,null,null,2,null,null],[2,null,null,0,null,null]]
  const EDGE_YO: boolean[] = [false,false,false]
  const EDGE_LABELS: { text: string; width: number; height: number; placement: string | null }[][] = [[],[],[]]
  const DIMS: [number, number][] = [[60,30],[60,30],[60,30]]
  const NAMES: string[] = ["n1","n2","n3"]
  const PORT_IDS: string[] = []
  const PORT_CONSTRAINTS: (string | null)[] = [null,null,null]
  const NODE_PORTS: { id: string; x: number; y: number; w: number; h: number; side: string | null; index: number | null; borderOffset: number | null; labels: { text: string; x: number; y: number; width: number; height: number }[] }[][] = [[],[],[]]
  const NODE_ACTIVATE: boolean[] = [false,false,false]
  const NODE_LABELS: { text: string; width: number; height: number; placement: string | null }[][] = [[{"text":"n1","width":0,"height":0,"placement":null}],[{"text":"n2","width":0,"height":0,"placement":null}],[{"text":"n3","width":0,"height":0,"placement":null}]]
  const LABEL_PAD: ({ top: number; left: number; right: number; bottom: number } | null)[] = [null,null,null]
  const NODE_OPTS: [string, unknown][][] = [[],[],[]]

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
      n.setProperty(MODEL_ORDER_KEY, i)
      if (PORT_CONSTRAINTS[i]) {
        n.setProperty(PORT_CONSTRAINTS_KEY, PORT_CONSTRAINTS[i] as any)
      }
      for (const [k, v] of NODE_OPTS[i]) {
        n.setProperty(k, v as any)
      }
      for (const portDesc of NODE_PORTS[i]) {
        const port = new LPort()
        port.setNode(n)
        port.getPosition().x = portDesc.x
        port.getPosition().y = portDesc.y
        port.size = { x: portDesc.w, y: portDesc.h }
        if (portDesc.side) port.setSide(portDesc.side as any)
        if (portDesc.index !== null) port.setProperty(PORT_INDEX_KEY, portDesc.index)
        if (portDesc.borderOffset !== null) port.setProperty(PORT_BORDER_OFFSET_KEY, portDesc.borderOffset)
        if (portDesc.labels.length > 0) {
          port.setLabels(portDesc.labels.map((l) => ({ text: l.text, position: { x: l.x, y: l.y }, size: { x: l.width, y: l.height } })))
        }
      }
      if (NODE_ACTIVATE[i]) {
        n.setProperty(INSIDE_SELF_LOOPS_ACTIVATE_KEY, true)
      }
      if (NODE_LABELS[i].length > 0) {
        n.setLabels(NODE_LABELS[i].map((l) => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })))
      }
      nodeOf.set(i, n)
      graphNodes.push(n)
    }
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      const parent = nodeOf.get(p)!
      const nested = nestedGraphs.get(p)!
      parent.setNestedGraph(nested)
      nested.setParentNode(parent)
      // ★ 容器节点 label 占位 (SSOT: LABEL_PAD[i] = 子图 padding.top, 对齐 buildLGraphFromParsed)
      if (LABEL_PAD[p] !== undefined && LABEL_PAD[p] !== null) nested.setPadding(LABEL_PAD[p])
      // ★ 节点级 mergeEdges → 嵌套图 (ELK createLGraph copyProperties; LGraphUtil.createPort 读图属性)
      if (NODE_OPTS[p]?.some(([k]) => k === 'org.eclipse.elk.layered.mergeEdges')) nested.setProperty(MERGE_EDGES_KEY, true)
    }
    __mergeEdges = false
    __defaultSide = PortSide.EAST
    if (__mergeEdges) graph.setProperty(MERGE_EDGES_KEY, true)
    // 边所在图 (LCA) 的 MERGE_EDGES (ELK ElkGraphImporter 源侧读边所在图; 目标侧读目标节点所在图).
    const __parentOf = new Map<number, number>()
    for (const [__p, __kids] of Object.entries(HIERARCHY)) for (const __k of __kids) __parentOf.set(__k, Number(__p))
    const __lcaMerge = (a: number, b: number): boolean => {
      const seen = new Set<number>()
      let x: number | undefined = a
      while (x !== undefined) { seen.add(x); x = __parentOf.get(x) }
      let y: number | undefined = b
      while (y !== undefined && !seen.has(y)) y = __parentOf.get(y)
      if (y === undefined) return graph.getProperty(MERGE_EDGES_KEY) === true
      const __py = __parentOf.get(y)
      const __g = __py === undefined ? graph : nestedGraphs.get(__py)!
      return __g.getProperty(MERGE_EDGES_KEY) === true
    }
    EDGE_IDX.forEach(([s, sp, , t, tp], ei) => {
      const __srcMerge = __lcaMerge(s, t)
      const __tgtMerge = nodeOf.get(t)!.getGraph()?.getProperty(MERGE_EDGES_KEY) === true
      const e = createSimpleEdge(nodeOf.get(s)!, nodeOf.get(t)!, sp, tp, __srcMerge, __tgtMerge)
      e.setProperty(MODEL_ORDER_KEY, ei)
      if (EDGE_YO[ei]) e.setProperty(INSIDE_SELF_LOOPS_YO_KEY, true)
      for (const l of EDGE_LABELS[ei]) {
        e.getLabels().push({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })
      }
    })
    if (Object.keys(HIERARCHY).length > 0) {
      graph.setProperty(HIERARCHY_HANDLING_KEY, 'INCLUDE_CHILDREN')
    }
    graph.setProperty(DIRECTION_KEY, 'RIGHT')
    graph.setProperty('org.eclipse.elk.direction', "RIGHT")
    graph.setProperty('org.eclipse.elk.layered.cycleBreaking.strategy', "INTERACTIVE")
    graph.setProperty('org.eclipse.elk.layered.layering.strategy', "INTERACTIVE")
    graph.setProperty('org.eclipse.elk.randomSeed', 1)

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

  it('坐标级差分: 与 jar 0.12.0 1:1 对齐', () => {
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
      n.setProperty(MODEL_ORDER_KEY, i)
      if (PORT_CONSTRAINTS[i]) {
        n.setProperty(PORT_CONSTRAINTS_KEY, PORT_CONSTRAINTS[i] as any)
      }
      for (const [k, v] of NODE_OPTS[i]) {
        n.setProperty(k, v as any)
      }
      for (const portDesc of NODE_PORTS[i]) {
        const port = new LPort()
        port.setNode(n)
        port.getPosition().x = portDesc.x
        port.getPosition().y = portDesc.y
        port.size = { x: portDesc.w, y: portDesc.h }
        if (portDesc.side) port.setSide(portDesc.side as any)
        if (portDesc.index !== null) port.setProperty(PORT_INDEX_KEY, portDesc.index)
        if (portDesc.borderOffset !== null) port.setProperty(PORT_BORDER_OFFSET_KEY, portDesc.borderOffset)
        if (portDesc.labels.length > 0) {
          port.setLabels(portDesc.labels.map((l) => ({ text: l.text, position: { x: l.x, y: l.y }, size: { x: l.width, y: l.height } })))
        }
      }
      if (NODE_ACTIVATE[i]) {
        n.setProperty(INSIDE_SELF_LOOPS_ACTIVATE_KEY, true)
      }
      if (NODE_LABELS[i].length > 0) {
        n.setLabels(NODE_LABELS[i].map((l) => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })))
      }
      nodeOf.set(i, n)
    }
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      const parent = nodeOf.get(p)!
      const nested = nestedGraphs.get(p)!
      parent.setNestedGraph(nested)
      nested.setParentNode(parent)
      // ★ 容器节点 label 占位 (SSOT: LABEL_PAD[i] = 子图 padding.top, 对齐 buildLGraphFromParsed)
      if (LABEL_PAD[p] !== undefined && LABEL_PAD[p] !== null) nested.setPadding(LABEL_PAD[p])
      // ★ 节点级 mergeEdges → 嵌套图 (ELK createLGraph copyProperties; LGraphUtil.createPort 读图属性)
      if (NODE_OPTS[p]?.some(([k]) => k === 'org.eclipse.elk.layered.mergeEdges')) nested.setProperty(MERGE_EDGES_KEY, true)
    }
    __mergeEdges = false
    __defaultSide = PortSide.EAST
    if (__mergeEdges) graph.setProperty(MERGE_EDGES_KEY, true)
    // 边所在图 (LCA) 的 MERGE_EDGES (ELK ElkGraphImporter 源侧读边所在图; 目标侧读目标节点所在图).
    const __parentOf = new Map<number, number>()
    for (const [__p, __kids] of Object.entries(HIERARCHY)) for (const __k of __kids) __parentOf.set(__k, Number(__p))
    const __lcaMerge = (a: number, b: number): boolean => {
      const seen = new Set<number>()
      let x: number | undefined = a
      while (x !== undefined) { seen.add(x); x = __parentOf.get(x) }
      let y: number | undefined = b
      while (y !== undefined && !seen.has(y)) y = __parentOf.get(y)
      if (y === undefined) return graph.getProperty(MERGE_EDGES_KEY) === true
      const __py = __parentOf.get(y)
      const __g = __py === undefined ? graph : nestedGraphs.get(__py)!
      return __g.getProperty(MERGE_EDGES_KEY) === true
    }
    EDGE_IDX.forEach(([s, sp, , t, tp], ei) => {
      const __srcMerge = __lcaMerge(s, t)
      const __tgtMerge = nodeOf.get(t)!.getGraph()?.getProperty(MERGE_EDGES_KEY) === true
      const e = createSimpleEdge(nodeOf.get(s)!, nodeOf.get(t)!, sp, tp, __srcMerge, __tgtMerge)
      e.setProperty(MODEL_ORDER_KEY, ei)
      if (EDGE_YO[ei]) e.setProperty(INSIDE_SELF_LOOPS_YO_KEY, true)
      for (const l of EDGE_LABELS[ei]) {
        e.getLabels().push({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })
      }
    })
    if (Object.keys(HIERARCHY).length > 0) {
      graph.setProperty(HIERARCHY_HANDLING_KEY, 'INCLUDE_CHILDREN')
    }
    graph.setProperty(DIRECTION_KEY, 'RIGHT')
    graph.setProperty('org.eclipse.elk.direction', "RIGHT")
    graph.setProperty('org.eclipse.elk.layered.cycleBreaking.strategy', "INTERACTIVE")
    graph.setProperty('org.eclipse.elk.layered.layering.strategy', "INTERACTIVE")
    graph.setProperty('org.eclipse.elk.randomSeed', 1)

    new LayeredLayoutProvider().layout(graph)

    if (false) {
      for (const n of nodeOf.values()) {
        expect(Number.isFinite(n.position.x)).toBe(true)
        expect(Number.isFinite(n.position.y)).toBe(true)
      }
      return
    }

    // L1 (M3): 与 ELK Java 0.12.0 jar oracle 坐标级差分 (容差 ε = 2).
    // oracle 坐标相对父块 (jar getX/getY); ggn 子图节点坐标同样相对父 → 直接对比, 无需世界坐标累加.
    const oracle = JSON.parse(readFileSync(new URL('../../../test-resources/jar-oracle/examples__user-hints__interactive-constraints__interactiveLayeredLayout_circle_pseudo_positions.json', import.meta.url), 'utf8'))
    expect(oracle.hash, 'jar oracle 过期/缺失, 请重跑 node scripts/generate-jar-oracle.mjs').toBe('8756e567a30a7af8')
    // ELK 类加载顺序变体 (EdgeMain vs BatchMain): oracle.variants 记录另一变体, 任一匹配即通过.
    const variants = oracle.variants ?? []
    for (let i = 0; i < DIMS.length; i++) {
      const gn = nodeOf.get(i)!
      const nm = 'N' + NAMES[i]
      const cands = [oracle.coords[nm], ...variants.map((v) => v.coords[nm])].filter(Boolean)
      expect(cands.length, nm + ' 缺少 jar oracle 坐标').toBeGreaterThan(0)
      const bestX = Math.min(...cands.map((c) => Math.abs(gn.position.x - c.x)))
      const bestY = Math.min(...cands.map((c) => Math.abs(gn.position.y - c.y)))
      expect(bestX, nm + ' x').toBeLessThanOrEqual(2)
      expect(bestY, nm + ' y').toBeLessThanOrEqual(2)
    }
  })
})

/**
 * elkt 生成: examples__user-hints__interactive-constraints__interactiveLayeredLayout_snake_pseudo_positions
 * 图: 12 节点 / 11 边 / 0 层级块
 * 差分: 坐标级 (1:1 ELK 对齐)
 */

describe('elkt 生成: examples__user-hints__interactive-constraints__interactiveLayeredLayout_snake_pseudo_positions', () => {
  const HIERARCHY: Record<number, number[]> = {}
  const EDGE_IDX: [number, number | null, string | null, number, number | null, string | null][] = [[0,null,null,1,null,null],[1,null,null,2,null,null],[2,null,null,3,null,null],[3,null,null,4,null,null],[4,null,null,5,null,null],[5,null,null,6,null,null],[6,null,null,7,null,null],[7,null,null,8,null,null],[8,null,null,9,null,null],[9,null,null,10,null,null],[10,null,null,11,null,null]]
  const EDGE_YO: boolean[] = [false,false,false,false,false,false,false,false,false,false,false]
  const EDGE_LABELS: { text: string; width: number; height: number; placement: string | null }[][] = [[],[],[],[],[],[],[],[],[],[],[]]
  const DIMS: [number, number][] = [[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30]]
  const NAMES: string[] = ["n1","n2","n3","n4","n5","n6","n7","n8","n9","n10","n11","n12"]
  const PORT_IDS: string[] = []
  const PORT_CONSTRAINTS: (string | null)[] = [null,null,null,null,null,null,null,null,null,null,null,null]
  const NODE_PORTS: { id: string; x: number; y: number; w: number; h: number; side: string | null; index: number | null; borderOffset: number | null; labels: { text: string; x: number; y: number; width: number; height: number }[] }[][] = [[],[],[],[],[],[],[],[],[],[],[],[]]
  const NODE_ACTIVATE: boolean[] = [false,false,false,false,false,false,false,false,false,false,false,false]
  const NODE_LABELS: { text: string; width: number; height: number; placement: string | null }[][] = [[{"text":"n1","width":0,"height":0,"placement":null}],[{"text":"n2","width":0,"height":0,"placement":null}],[{"text":"n3","width":0,"height":0,"placement":null}],[{"text":"n4","width":0,"height":0,"placement":null}],[{"text":"n5","width":0,"height":0,"placement":null}],[{"text":"n6","width":0,"height":0,"placement":null}],[{"text":"n7","width":0,"height":0,"placement":null}],[{"text":"n8","width":0,"height":0,"placement":null}],[{"text":"n9","width":0,"height":0,"placement":null}],[{"text":"n10","width":0,"height":0,"placement":null}],[{"text":"n11","width":0,"height":0,"placement":null}],[{"text":"n12","width":0,"height":0,"placement":null}]]
  const LABEL_PAD: ({ top: number; left: number; right: number; bottom: number } | null)[] = [null,null,null,null,null,null,null,null,null,null,null,null]
  const NODE_OPTS: [string, unknown][][] = [[["org.eclipse.elk.position",{"x":0,"y":0}]],[["org.eclipse.elk.position",{"x":100,"y":0}]],[["org.eclipse.elk.position",{"x":0,"y":100}]],[["org.eclipse.elk.position",{"x":200,"y":0}]],[["org.eclipse.elk.position",{"x":0,"y":200}]],[["org.eclipse.elk.position",{"x":300,"y":0}]],[["org.eclipse.elk.position",{"x":0,"y":300}]],[["org.eclipse.elk.position",{"x":400,"y":0}]],[["org.eclipse.elk.position",{"x":500,"y":0}]],[["org.eclipse.elk.position",{"x":500,"y":0}]],[["org.eclipse.elk.position",{"x":0,"y":400}]],[["org.eclipse.elk.position",{"x":300,"y":100}]]]

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
      n.setProperty(MODEL_ORDER_KEY, i)
      if (PORT_CONSTRAINTS[i]) {
        n.setProperty(PORT_CONSTRAINTS_KEY, PORT_CONSTRAINTS[i] as any)
      }
      for (const [k, v] of NODE_OPTS[i]) {
        n.setProperty(k, v as any)
      }
      for (const portDesc of NODE_PORTS[i]) {
        const port = new LPort()
        port.setNode(n)
        port.getPosition().x = portDesc.x
        port.getPosition().y = portDesc.y
        port.size = { x: portDesc.w, y: portDesc.h }
        if (portDesc.side) port.setSide(portDesc.side as any)
        if (portDesc.index !== null) port.setProperty(PORT_INDEX_KEY, portDesc.index)
        if (portDesc.borderOffset !== null) port.setProperty(PORT_BORDER_OFFSET_KEY, portDesc.borderOffset)
        if (portDesc.labels.length > 0) {
          port.setLabels(portDesc.labels.map((l) => ({ text: l.text, position: { x: l.x, y: l.y }, size: { x: l.width, y: l.height } })))
        }
      }
      if (NODE_ACTIVATE[i]) {
        n.setProperty(INSIDE_SELF_LOOPS_ACTIVATE_KEY, true)
      }
      if (NODE_LABELS[i].length > 0) {
        n.setLabels(NODE_LABELS[i].map((l) => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })))
      }
      nodeOf.set(i, n)
      graphNodes.push(n)
    }
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      const parent = nodeOf.get(p)!
      const nested = nestedGraphs.get(p)!
      parent.setNestedGraph(nested)
      nested.setParentNode(parent)
      // ★ 容器节点 label 占位 (SSOT: LABEL_PAD[i] = 子图 padding.top, 对齐 buildLGraphFromParsed)
      if (LABEL_PAD[p] !== undefined && LABEL_PAD[p] !== null) nested.setPadding(LABEL_PAD[p])
      // ★ 节点级 mergeEdges → 嵌套图 (ELK createLGraph copyProperties; LGraphUtil.createPort 读图属性)
      if (NODE_OPTS[p]?.some(([k]) => k === 'org.eclipse.elk.layered.mergeEdges')) nested.setProperty(MERGE_EDGES_KEY, true)
    }
    __mergeEdges = false
    __defaultSide = PortSide.EAST
    if (__mergeEdges) graph.setProperty(MERGE_EDGES_KEY, true)
    // 边所在图 (LCA) 的 MERGE_EDGES (ELK ElkGraphImporter 源侧读边所在图; 目标侧读目标节点所在图).
    const __parentOf = new Map<number, number>()
    for (const [__p, __kids] of Object.entries(HIERARCHY)) for (const __k of __kids) __parentOf.set(__k, Number(__p))
    const __lcaMerge = (a: number, b: number): boolean => {
      const seen = new Set<number>()
      let x: number | undefined = a
      while (x !== undefined) { seen.add(x); x = __parentOf.get(x) }
      let y: number | undefined = b
      while (y !== undefined && !seen.has(y)) y = __parentOf.get(y)
      if (y === undefined) return graph.getProperty(MERGE_EDGES_KEY) === true
      const __py = __parentOf.get(y)
      const __g = __py === undefined ? graph : nestedGraphs.get(__py)!
      return __g.getProperty(MERGE_EDGES_KEY) === true
    }
    EDGE_IDX.forEach(([s, sp, , t, tp], ei) => {
      const __srcMerge = __lcaMerge(s, t)
      const __tgtMerge = nodeOf.get(t)!.getGraph()?.getProperty(MERGE_EDGES_KEY) === true
      const e = createSimpleEdge(nodeOf.get(s)!, nodeOf.get(t)!, sp, tp, __srcMerge, __tgtMerge)
      e.setProperty(MODEL_ORDER_KEY, ei)
      if (EDGE_YO[ei]) e.setProperty(INSIDE_SELF_LOOPS_YO_KEY, true)
      for (const l of EDGE_LABELS[ei]) {
        e.getLabels().push({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })
      }
    })
    if (Object.keys(HIERARCHY).length > 0) {
      graph.setProperty(HIERARCHY_HANDLING_KEY, 'INCLUDE_CHILDREN')
    }
    graph.setProperty(DIRECTION_KEY, 'RIGHT')
    graph.setProperty('org.eclipse.elk.direction', "RIGHT")
    graph.setProperty('org.eclipse.elk.layered.cycleBreaking.strategy', "INTERACTIVE")
    graph.setProperty('org.eclipse.elk.layered.layering.strategy', "INTERACTIVE")
    graph.setProperty('org.eclipse.elk.layered.crossingMinimization.semiInteractive', true)
    graph.setProperty('org.eclipse.elk.separateConnectedComponents', false)
    graph.setProperty('org.eclipse.elk.randomSeed', 1)

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

  it('坐标级差分: 与 jar 0.12.0 1:1 对齐', () => {
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
      n.setProperty(MODEL_ORDER_KEY, i)
      if (PORT_CONSTRAINTS[i]) {
        n.setProperty(PORT_CONSTRAINTS_KEY, PORT_CONSTRAINTS[i] as any)
      }
      for (const [k, v] of NODE_OPTS[i]) {
        n.setProperty(k, v as any)
      }
      for (const portDesc of NODE_PORTS[i]) {
        const port = new LPort()
        port.setNode(n)
        port.getPosition().x = portDesc.x
        port.getPosition().y = portDesc.y
        port.size = { x: portDesc.w, y: portDesc.h }
        if (portDesc.side) port.setSide(portDesc.side as any)
        if (portDesc.index !== null) port.setProperty(PORT_INDEX_KEY, portDesc.index)
        if (portDesc.borderOffset !== null) port.setProperty(PORT_BORDER_OFFSET_KEY, portDesc.borderOffset)
        if (portDesc.labels.length > 0) {
          port.setLabels(portDesc.labels.map((l) => ({ text: l.text, position: { x: l.x, y: l.y }, size: { x: l.width, y: l.height } })))
        }
      }
      if (NODE_ACTIVATE[i]) {
        n.setProperty(INSIDE_SELF_LOOPS_ACTIVATE_KEY, true)
      }
      if (NODE_LABELS[i].length > 0) {
        n.setLabels(NODE_LABELS[i].map((l) => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })))
      }
      nodeOf.set(i, n)
    }
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      const parent = nodeOf.get(p)!
      const nested = nestedGraphs.get(p)!
      parent.setNestedGraph(nested)
      nested.setParentNode(parent)
      // ★ 容器节点 label 占位 (SSOT: LABEL_PAD[i] = 子图 padding.top, 对齐 buildLGraphFromParsed)
      if (LABEL_PAD[p] !== undefined && LABEL_PAD[p] !== null) nested.setPadding(LABEL_PAD[p])
      // ★ 节点级 mergeEdges → 嵌套图 (ELK createLGraph copyProperties; LGraphUtil.createPort 读图属性)
      if (NODE_OPTS[p]?.some(([k]) => k === 'org.eclipse.elk.layered.mergeEdges')) nested.setProperty(MERGE_EDGES_KEY, true)
    }
    __mergeEdges = false
    __defaultSide = PortSide.EAST
    if (__mergeEdges) graph.setProperty(MERGE_EDGES_KEY, true)
    // 边所在图 (LCA) 的 MERGE_EDGES (ELK ElkGraphImporter 源侧读边所在图; 目标侧读目标节点所在图).
    const __parentOf = new Map<number, number>()
    for (const [__p, __kids] of Object.entries(HIERARCHY)) for (const __k of __kids) __parentOf.set(__k, Number(__p))
    const __lcaMerge = (a: number, b: number): boolean => {
      const seen = new Set<number>()
      let x: number | undefined = a
      while (x !== undefined) { seen.add(x); x = __parentOf.get(x) }
      let y: number | undefined = b
      while (y !== undefined && !seen.has(y)) y = __parentOf.get(y)
      if (y === undefined) return graph.getProperty(MERGE_EDGES_KEY) === true
      const __py = __parentOf.get(y)
      const __g = __py === undefined ? graph : nestedGraphs.get(__py)!
      return __g.getProperty(MERGE_EDGES_KEY) === true
    }
    EDGE_IDX.forEach(([s, sp, , t, tp], ei) => {
      const __srcMerge = __lcaMerge(s, t)
      const __tgtMerge = nodeOf.get(t)!.getGraph()?.getProperty(MERGE_EDGES_KEY) === true
      const e = createSimpleEdge(nodeOf.get(s)!, nodeOf.get(t)!, sp, tp, __srcMerge, __tgtMerge)
      e.setProperty(MODEL_ORDER_KEY, ei)
      if (EDGE_YO[ei]) e.setProperty(INSIDE_SELF_LOOPS_YO_KEY, true)
      for (const l of EDGE_LABELS[ei]) {
        e.getLabels().push({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })
      }
    })
    if (Object.keys(HIERARCHY).length > 0) {
      graph.setProperty(HIERARCHY_HANDLING_KEY, 'INCLUDE_CHILDREN')
    }
    graph.setProperty(DIRECTION_KEY, 'RIGHT')
    graph.setProperty('org.eclipse.elk.direction', "RIGHT")
    graph.setProperty('org.eclipse.elk.layered.cycleBreaking.strategy', "INTERACTIVE")
    graph.setProperty('org.eclipse.elk.layered.layering.strategy', "INTERACTIVE")
    graph.setProperty('org.eclipse.elk.layered.crossingMinimization.semiInteractive', true)
    graph.setProperty('org.eclipse.elk.separateConnectedComponents', false)
    graph.setProperty('org.eclipse.elk.randomSeed', 1)

    new LayeredLayoutProvider().layout(graph)

    if (false) {
      for (const n of nodeOf.values()) {
        expect(Number.isFinite(n.position.x)).toBe(true)
        expect(Number.isFinite(n.position.y)).toBe(true)
      }
      return
    }

    // L1 (M3): 与 ELK Java 0.12.0 jar oracle 坐标级差分 (容差 ε = 2).
    // oracle 坐标相对父块 (jar getX/getY); ggn 子图节点坐标同样相对父 → 直接对比, 无需世界坐标累加.
    const oracle = JSON.parse(readFileSync(new URL('../../../test-resources/jar-oracle/examples__user-hints__interactive-constraints__interactiveLayeredLayout_snake_pseudo_positions.json', import.meta.url), 'utf8'))
    expect(oracle.hash, 'jar oracle 过期/缺失, 请重跑 node scripts/generate-jar-oracle.mjs').toBe('c4b4aa121a437c29')
    // ELK 类加载顺序变体 (EdgeMain vs BatchMain): oracle.variants 记录另一变体, 任一匹配即通过.
    const variants = oracle.variants ?? []
    for (let i = 0; i < DIMS.length; i++) {
      const gn = nodeOf.get(i)!
      const nm = 'N' + NAMES[i]
      const cands = [oracle.coords[nm], ...variants.map((v) => v.coords[nm])].filter(Boolean)
      expect(cands.length, nm + ' 缺少 jar oracle 坐标').toBeGreaterThan(0)
      const bestX = Math.min(...cands.map((c) => Math.abs(gn.position.x - c.x)))
      const bestY = Math.min(...cands.map((c) => Math.abs(gn.position.y - c.y)))
      expect(bestX, nm + ' x').toBeLessThanOrEqual(2)
      expect(bestY, nm + ' y').toBeLessThanOrEqual(2)
    }
  })
})

/**
 * elkt 生成: examples__user-hints__interactive-constraints__interactiveLayeredLayout_hierarchy
 * 图: 4 节点 / 2 边 / 0 层级块
 * 差分: 坐标级 (1:1 ELK 对齐)
 */

describe('elkt 生成: examples__user-hints__interactive-constraints__interactiveLayeredLayout_hierarchy', () => {
  const HIERARCHY: Record<number, number[]> = {"1":[2,3]}
  const EDGE_IDX: [number, number | null, string | null, number, number | null, string | null][] = [[2,null,null,3,null,null],[0,null,null,1,null,null]]
  const EDGE_YO: boolean[] = [false,false]
  const EDGE_LABELS: { text: string; width: number; height: number; placement: string | null }[][] = [[],[]]
  const DIMS: [number, number][] = [[60,30],[60,30],[60,30],[60,30]]
  const NAMES: string[] = ["n1","n2","n2.n2_1","n2.n2_2"]
  const PORT_IDS: string[] = []
  const PORT_CONSTRAINTS: (string | null)[] = [null,null,null,null]
  const NODE_PORTS: { id: string; x: number; y: number; w: number; h: number; side: string | null; index: number | null; borderOffset: number | null; labels: { text: string; x: number; y: number; width: number; height: number }[] }[][] = [[],[],[],[]]
  const NODE_ACTIVATE: boolean[] = [false,false,false,false]
  const NODE_LABELS: { text: string; width: number; height: number; placement: string | null }[][] = [[{"text":"n1","width":0,"height":0,"placement":null}],[{"text":"n2","width":0,"height":0,"placement":null}],[{"text":"n2_1","width":0,"height":0,"placement":null}],[{"text":"n2_2","width":0,"height":0,"placement":null}]]
  const LABEL_PAD: ({ top: number; left: number; right: number; bottom: number } | null)[] = [null,{"top":12,"bottom":12,"left":12,"right":12},null,null]
  const NODE_OPTS: [string, unknown][][] = [[],[["org.eclipse.elk.direction","RIGHT"],["org.eclipse.elk.layered.layering.layerChoiceConstraint",0]],[],[["org.eclipse.elk.layered.layering.layerChoiceConstraint",0]]]

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
      n.setProperty(MODEL_ORDER_KEY, i)
      if (PORT_CONSTRAINTS[i]) {
        n.setProperty(PORT_CONSTRAINTS_KEY, PORT_CONSTRAINTS[i] as any)
      }
      for (const [k, v] of NODE_OPTS[i]) {
        n.setProperty(k, v as any)
      }
      for (const portDesc of NODE_PORTS[i]) {
        const port = new LPort()
        port.setNode(n)
        port.getPosition().x = portDesc.x
        port.getPosition().y = portDesc.y
        port.size = { x: portDesc.w, y: portDesc.h }
        if (portDesc.side) port.setSide(portDesc.side as any)
        if (portDesc.index !== null) port.setProperty(PORT_INDEX_KEY, portDesc.index)
        if (portDesc.borderOffset !== null) port.setProperty(PORT_BORDER_OFFSET_KEY, portDesc.borderOffset)
        if (portDesc.labels.length > 0) {
          port.setLabels(portDesc.labels.map((l) => ({ text: l.text, position: { x: l.x, y: l.y }, size: { x: l.width, y: l.height } })))
        }
      }
      if (NODE_ACTIVATE[i]) {
        n.setProperty(INSIDE_SELF_LOOPS_ACTIVATE_KEY, true)
      }
      if (NODE_LABELS[i].length > 0) {
        n.setLabels(NODE_LABELS[i].map((l) => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })))
      }
      nodeOf.set(i, n)
      graphNodes.push(n)
    }
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      const parent = nodeOf.get(p)!
      const nested = nestedGraphs.get(p)!
      parent.setNestedGraph(nested)
      nested.setParentNode(parent)
      // ★ 容器节点 label 占位 (SSOT: LABEL_PAD[i] = 子图 padding.top, 对齐 buildLGraphFromParsed)
      if (LABEL_PAD[p] !== undefined && LABEL_PAD[p] !== null) nested.setPadding(LABEL_PAD[p])
      // ★ 节点级 mergeEdges → 嵌套图 (ELK createLGraph copyProperties; LGraphUtil.createPort 读图属性)
      if (NODE_OPTS[p]?.some(([k]) => k === 'org.eclipse.elk.layered.mergeEdges')) nested.setProperty(MERGE_EDGES_KEY, true)
    }
    __mergeEdges = false
    __defaultSide = PortSide.EAST
    if (__mergeEdges) graph.setProperty(MERGE_EDGES_KEY, true)
    // 边所在图 (LCA) 的 MERGE_EDGES (ELK ElkGraphImporter 源侧读边所在图; 目标侧读目标节点所在图).
    const __parentOf = new Map<number, number>()
    for (const [__p, __kids] of Object.entries(HIERARCHY)) for (const __k of __kids) __parentOf.set(__k, Number(__p))
    const __lcaMerge = (a: number, b: number): boolean => {
      const seen = new Set<number>()
      let x: number | undefined = a
      while (x !== undefined) { seen.add(x); x = __parentOf.get(x) }
      let y: number | undefined = b
      while (y !== undefined && !seen.has(y)) y = __parentOf.get(y)
      if (y === undefined) return graph.getProperty(MERGE_EDGES_KEY) === true
      const __py = __parentOf.get(y)
      const __g = __py === undefined ? graph : nestedGraphs.get(__py)!
      return __g.getProperty(MERGE_EDGES_KEY) === true
    }
    EDGE_IDX.forEach(([s, sp, , t, tp], ei) => {
      const __srcMerge = __lcaMerge(s, t)
      const __tgtMerge = nodeOf.get(t)!.getGraph()?.getProperty(MERGE_EDGES_KEY) === true
      const e = createSimpleEdge(nodeOf.get(s)!, nodeOf.get(t)!, sp, tp, __srcMerge, __tgtMerge)
      e.setProperty(MODEL_ORDER_KEY, ei)
      if (EDGE_YO[ei]) e.setProperty(INSIDE_SELF_LOOPS_YO_KEY, true)
      for (const l of EDGE_LABELS[ei]) {
        e.getLabels().push({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })
      }
    })
    if (Object.keys(HIERARCHY).length > 0) {
      graph.setProperty(HIERARCHY_HANDLING_KEY, 'INCLUDE_CHILDREN')
    }
    graph.setProperty(DIRECTION_KEY, 'RIGHT')
    graph.setProperty('org.eclipse.elk.interactiveLayout', true)
    graph.setProperty('org.eclipse.elk.direction', "RIGHT")
    graph.setProperty('org.eclipse.elk.randomSeed', 1)

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

  it('坐标级差分: 与 jar 0.12.0 1:1 对齐', () => {
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
      n.setProperty(MODEL_ORDER_KEY, i)
      if (PORT_CONSTRAINTS[i]) {
        n.setProperty(PORT_CONSTRAINTS_KEY, PORT_CONSTRAINTS[i] as any)
      }
      for (const [k, v] of NODE_OPTS[i]) {
        n.setProperty(k, v as any)
      }
      for (const portDesc of NODE_PORTS[i]) {
        const port = new LPort()
        port.setNode(n)
        port.getPosition().x = portDesc.x
        port.getPosition().y = portDesc.y
        port.size = { x: portDesc.w, y: portDesc.h }
        if (portDesc.side) port.setSide(portDesc.side as any)
        if (portDesc.index !== null) port.setProperty(PORT_INDEX_KEY, portDesc.index)
        if (portDesc.borderOffset !== null) port.setProperty(PORT_BORDER_OFFSET_KEY, portDesc.borderOffset)
        if (portDesc.labels.length > 0) {
          port.setLabels(portDesc.labels.map((l) => ({ text: l.text, position: { x: l.x, y: l.y }, size: { x: l.width, y: l.height } })))
        }
      }
      if (NODE_ACTIVATE[i]) {
        n.setProperty(INSIDE_SELF_LOOPS_ACTIVATE_KEY, true)
      }
      if (NODE_LABELS[i].length > 0) {
        n.setLabels(NODE_LABELS[i].map((l) => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })))
      }
      nodeOf.set(i, n)
    }
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      const parent = nodeOf.get(p)!
      const nested = nestedGraphs.get(p)!
      parent.setNestedGraph(nested)
      nested.setParentNode(parent)
      // ★ 容器节点 label 占位 (SSOT: LABEL_PAD[i] = 子图 padding.top, 对齐 buildLGraphFromParsed)
      if (LABEL_PAD[p] !== undefined && LABEL_PAD[p] !== null) nested.setPadding(LABEL_PAD[p])
      // ★ 节点级 mergeEdges → 嵌套图 (ELK createLGraph copyProperties; LGraphUtil.createPort 读图属性)
      if (NODE_OPTS[p]?.some(([k]) => k === 'org.eclipse.elk.layered.mergeEdges')) nested.setProperty(MERGE_EDGES_KEY, true)
    }
    __mergeEdges = false
    __defaultSide = PortSide.EAST
    if (__mergeEdges) graph.setProperty(MERGE_EDGES_KEY, true)
    // 边所在图 (LCA) 的 MERGE_EDGES (ELK ElkGraphImporter 源侧读边所在图; 目标侧读目标节点所在图).
    const __parentOf = new Map<number, number>()
    for (const [__p, __kids] of Object.entries(HIERARCHY)) for (const __k of __kids) __parentOf.set(__k, Number(__p))
    const __lcaMerge = (a: number, b: number): boolean => {
      const seen = new Set<number>()
      let x: number | undefined = a
      while (x !== undefined) { seen.add(x); x = __parentOf.get(x) }
      let y: number | undefined = b
      while (y !== undefined && !seen.has(y)) y = __parentOf.get(y)
      if (y === undefined) return graph.getProperty(MERGE_EDGES_KEY) === true
      const __py = __parentOf.get(y)
      const __g = __py === undefined ? graph : nestedGraphs.get(__py)!
      return __g.getProperty(MERGE_EDGES_KEY) === true
    }
    EDGE_IDX.forEach(([s, sp, , t, tp], ei) => {
      const __srcMerge = __lcaMerge(s, t)
      const __tgtMerge = nodeOf.get(t)!.getGraph()?.getProperty(MERGE_EDGES_KEY) === true
      const e = createSimpleEdge(nodeOf.get(s)!, nodeOf.get(t)!, sp, tp, __srcMerge, __tgtMerge)
      e.setProperty(MODEL_ORDER_KEY, ei)
      if (EDGE_YO[ei]) e.setProperty(INSIDE_SELF_LOOPS_YO_KEY, true)
      for (const l of EDGE_LABELS[ei]) {
        e.getLabels().push({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })
      }
    })
    if (Object.keys(HIERARCHY).length > 0) {
      graph.setProperty(HIERARCHY_HANDLING_KEY, 'INCLUDE_CHILDREN')
    }
    graph.setProperty(DIRECTION_KEY, 'RIGHT')
    graph.setProperty('org.eclipse.elk.interactiveLayout', true)
    graph.setProperty('org.eclipse.elk.direction', "RIGHT")
    graph.setProperty('org.eclipse.elk.randomSeed', 1)

    new LayeredLayoutProvider().layout(graph)

    if (false) {
      for (const n of nodeOf.values()) {
        expect(Number.isFinite(n.position.x)).toBe(true)
        expect(Number.isFinite(n.position.y)).toBe(true)
      }
      return
    }

    // L1 (M3): 与 ELK Java 0.12.0 jar oracle 坐标级差分 (容差 ε = 2).
    // oracle 坐标相对父块 (jar getX/getY); ggn 子图节点坐标同样相对父 → 直接对比, 无需世界坐标累加.
    const oracle = JSON.parse(readFileSync(new URL('../../../test-resources/jar-oracle/examples__user-hints__interactive-constraints__interactiveLayeredLayout_hierarchy.json', import.meta.url), 'utf8'))
    expect(oracle.hash, 'jar oracle 过期/缺失, 请重跑 node scripts/generate-jar-oracle.mjs').toBe('be76b4da7f26cb90')
    // ELK 类加载顺序变体 (EdgeMain vs BatchMain): oracle.variants 记录另一变体, 任一匹配即通过.
    const variants = oracle.variants ?? []
    for (let i = 0; i < DIMS.length; i++) {
      const gn = nodeOf.get(i)!
      const nm = 'N' + NAMES[i]
      const cands = [oracle.coords[nm], ...variants.map((v) => v.coords[nm])].filter(Boolean)
      expect(cands.length, nm + ' 缺少 jar oracle 坐标').toBeGreaterThan(0)
      const bestX = Math.min(...cands.map((c) => Math.abs(gn.position.x - c.x)))
      const bestY = Math.min(...cands.map((c) => Math.abs(gn.position.y - c.y)))
      expect(bestX, nm + ' x').toBeLessThanOrEqual(2)
      expect(bestY, nm + ' y').toBeLessThanOrEqual(2)
    }
  })
})

/**
 * elkt 生成: examples__user-hints__interactive-constraints__interactiveLayeredLayout_sortingTask_pseudo_positions
 * 图: 9 节点 / 9 边 / 0 层级块
 * 差分: 坐标级 (1:1 ELK 对齐)
 */

describe('elkt 生成: examples__user-hints__interactive-constraints__interactiveLayeredLayout_sortingTask_pseudo_positions', () => {
  const HIERARCHY: Record<number, number[]> = {}
  const EDGE_IDX: [number, number | null, string | null, number, number | null, string | null][] = [[1,null,null,3,null,null],[1,null,null,4,null,null],[3,null,null,0,null,null],[3,null,null,6,null,null],[4,null,null,6,null,null],[4,null,null,7,null,null],[5,null,null,2,null,null],[8,null,null,2,null,null],[2,null,null,7,null,null]]
  const EDGE_YO: boolean[] = [false,false,false,false,false,false,false,false,false]
  const EDGE_LABELS: { text: string; width: number; height: number; placement: string | null }[][] = [[],[],[],[],[],[],[],[],[]]
  const DIMS: [number, number][] = [[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30]]
  const NAMES: string[] = ["A","AA","AAA","B","BB","BBB","C","CC","CCC"]
  const PORT_IDS: string[] = []
  const PORT_CONSTRAINTS: (string | null)[] = [null,null,null,null,null,null,null,null,null]
  const NODE_PORTS: { id: string; x: number; y: number; w: number; h: number; side: string | null; index: number | null; borderOffset: number | null; labels: { text: string; x: number; y: number; width: number; height: number }[] }[][] = [[],[],[],[],[],[],[],[],[]]
  const NODE_ACTIVATE: boolean[] = [false,false,false,false,false,false,false,false,false]
  const NODE_LABELS: { text: string; width: number; height: number; placement: string | null }[][] = [[{"text":"A","width":0,"height":0,"placement":null}],[{"text":"AA","width":0,"height":0,"placement":null}],[{"text":"AAA","width":0,"height":0,"placement":null}],[{"text":"B","width":0,"height":0,"placement":null}],[{"text":"BB","width":0,"height":0,"placement":null}],[{"text":"BBB","width":0,"height":0,"placement":null}],[{"text":"C","width":0,"height":0,"placement":null}],[{"text":"CC","width":0,"height":0,"placement":null}],[{"text":"CCC","width":0,"height":0,"placement":null}]]
  const LABEL_PAD: ({ top: number; left: number; right: number; bottom: number } | null)[] = [null,null,null,null,null,null,null,null,null]
  const NODE_OPTS: [string, unknown][][] = [[["org.eclipse.elk.position",{"x":0,"y":0}]],[["org.eclipse.elk.position",{"x":0,"y":100}]],[["org.eclipse.elk.position",{"x":0,"y":200}]],[["org.eclipse.elk.position",{"x":100,"y":0}]],[["org.eclipse.elk.position",{"x":100,"y":100}]],[["org.eclipse.elk.position",{"x":100,"y":200}]],[["org.eclipse.elk.position",{"x":200,"y":0}]],[["org.eclipse.elk.position",{"x":200,"y":100}]],[["org.eclipse.elk.position",{"x":200,"y":200}]]]

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
      n.setProperty(MODEL_ORDER_KEY, i)
      if (PORT_CONSTRAINTS[i]) {
        n.setProperty(PORT_CONSTRAINTS_KEY, PORT_CONSTRAINTS[i] as any)
      }
      for (const [k, v] of NODE_OPTS[i]) {
        n.setProperty(k, v as any)
      }
      for (const portDesc of NODE_PORTS[i]) {
        const port = new LPort()
        port.setNode(n)
        port.getPosition().x = portDesc.x
        port.getPosition().y = portDesc.y
        port.size = { x: portDesc.w, y: portDesc.h }
        if (portDesc.side) port.setSide(portDesc.side as any)
        if (portDesc.index !== null) port.setProperty(PORT_INDEX_KEY, portDesc.index)
        if (portDesc.borderOffset !== null) port.setProperty(PORT_BORDER_OFFSET_KEY, portDesc.borderOffset)
        if (portDesc.labels.length > 0) {
          port.setLabels(portDesc.labels.map((l) => ({ text: l.text, position: { x: l.x, y: l.y }, size: { x: l.width, y: l.height } })))
        }
      }
      if (NODE_ACTIVATE[i]) {
        n.setProperty(INSIDE_SELF_LOOPS_ACTIVATE_KEY, true)
      }
      if (NODE_LABELS[i].length > 0) {
        n.setLabels(NODE_LABELS[i].map((l) => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })))
      }
      nodeOf.set(i, n)
      graphNodes.push(n)
    }
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      const parent = nodeOf.get(p)!
      const nested = nestedGraphs.get(p)!
      parent.setNestedGraph(nested)
      nested.setParentNode(parent)
      // ★ 容器节点 label 占位 (SSOT: LABEL_PAD[i] = 子图 padding.top, 对齐 buildLGraphFromParsed)
      if (LABEL_PAD[p] !== undefined && LABEL_PAD[p] !== null) nested.setPadding(LABEL_PAD[p])
      // ★ 节点级 mergeEdges → 嵌套图 (ELK createLGraph copyProperties; LGraphUtil.createPort 读图属性)
      if (NODE_OPTS[p]?.some(([k]) => k === 'org.eclipse.elk.layered.mergeEdges')) nested.setProperty(MERGE_EDGES_KEY, true)
    }
    __mergeEdges = false
    __defaultSide = PortSide.EAST
    if (__mergeEdges) graph.setProperty(MERGE_EDGES_KEY, true)
    // 边所在图 (LCA) 的 MERGE_EDGES (ELK ElkGraphImporter 源侧读边所在图; 目标侧读目标节点所在图).
    const __parentOf = new Map<number, number>()
    for (const [__p, __kids] of Object.entries(HIERARCHY)) for (const __k of __kids) __parentOf.set(__k, Number(__p))
    const __lcaMerge = (a: number, b: number): boolean => {
      const seen = new Set<number>()
      let x: number | undefined = a
      while (x !== undefined) { seen.add(x); x = __parentOf.get(x) }
      let y: number | undefined = b
      while (y !== undefined && !seen.has(y)) y = __parentOf.get(y)
      if (y === undefined) return graph.getProperty(MERGE_EDGES_KEY) === true
      const __py = __parentOf.get(y)
      const __g = __py === undefined ? graph : nestedGraphs.get(__py)!
      return __g.getProperty(MERGE_EDGES_KEY) === true
    }
    EDGE_IDX.forEach(([s, sp, , t, tp], ei) => {
      const __srcMerge = __lcaMerge(s, t)
      const __tgtMerge = nodeOf.get(t)!.getGraph()?.getProperty(MERGE_EDGES_KEY) === true
      const e = createSimpleEdge(nodeOf.get(s)!, nodeOf.get(t)!, sp, tp, __srcMerge, __tgtMerge)
      e.setProperty(MODEL_ORDER_KEY, ei)
      if (EDGE_YO[ei]) e.setProperty(INSIDE_SELF_LOOPS_YO_KEY, true)
      for (const l of EDGE_LABELS[ei]) {
        e.getLabels().push({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })
      }
    })
    if (Object.keys(HIERARCHY).length > 0) {
      graph.setProperty(HIERARCHY_HANDLING_KEY, 'INCLUDE_CHILDREN')
    }
    graph.setProperty(DIRECTION_KEY, 'RIGHT')
    graph.setProperty('org.eclipse.elk.direction', "RIGHT")
    graph.setProperty('org.eclipse.elk.layered.cycleBreaking.strategy', "INTERACTIVE")
    graph.setProperty('org.eclipse.elk.layered.layering.strategy', "INTERACTIVE")
    graph.setProperty('org.eclipse.elk.layered.crossingMinimization.semiInteractive', true)
    graph.setProperty('org.eclipse.elk.separateConnectedComponents', false)
    graph.setProperty('org.eclipse.elk.randomSeed', 1)

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

  it('坐标级差分: 与 jar 0.12.0 1:1 对齐', () => {
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
      n.setProperty(MODEL_ORDER_KEY, i)
      if (PORT_CONSTRAINTS[i]) {
        n.setProperty(PORT_CONSTRAINTS_KEY, PORT_CONSTRAINTS[i] as any)
      }
      for (const [k, v] of NODE_OPTS[i]) {
        n.setProperty(k, v as any)
      }
      for (const portDesc of NODE_PORTS[i]) {
        const port = new LPort()
        port.setNode(n)
        port.getPosition().x = portDesc.x
        port.getPosition().y = portDesc.y
        port.size = { x: portDesc.w, y: portDesc.h }
        if (portDesc.side) port.setSide(portDesc.side as any)
        if (portDesc.index !== null) port.setProperty(PORT_INDEX_KEY, portDesc.index)
        if (portDesc.borderOffset !== null) port.setProperty(PORT_BORDER_OFFSET_KEY, portDesc.borderOffset)
        if (portDesc.labels.length > 0) {
          port.setLabels(portDesc.labels.map((l) => ({ text: l.text, position: { x: l.x, y: l.y }, size: { x: l.width, y: l.height } })))
        }
      }
      if (NODE_ACTIVATE[i]) {
        n.setProperty(INSIDE_SELF_LOOPS_ACTIVATE_KEY, true)
      }
      if (NODE_LABELS[i].length > 0) {
        n.setLabels(NODE_LABELS[i].map((l) => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })))
      }
      nodeOf.set(i, n)
    }
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      const parent = nodeOf.get(p)!
      const nested = nestedGraphs.get(p)!
      parent.setNestedGraph(nested)
      nested.setParentNode(parent)
      // ★ 容器节点 label 占位 (SSOT: LABEL_PAD[i] = 子图 padding.top, 对齐 buildLGraphFromParsed)
      if (LABEL_PAD[p] !== undefined && LABEL_PAD[p] !== null) nested.setPadding(LABEL_PAD[p])
      // ★ 节点级 mergeEdges → 嵌套图 (ELK createLGraph copyProperties; LGraphUtil.createPort 读图属性)
      if (NODE_OPTS[p]?.some(([k]) => k === 'org.eclipse.elk.layered.mergeEdges')) nested.setProperty(MERGE_EDGES_KEY, true)
    }
    __mergeEdges = false
    __defaultSide = PortSide.EAST
    if (__mergeEdges) graph.setProperty(MERGE_EDGES_KEY, true)
    // 边所在图 (LCA) 的 MERGE_EDGES (ELK ElkGraphImporter 源侧读边所在图; 目标侧读目标节点所在图).
    const __parentOf = new Map<number, number>()
    for (const [__p, __kids] of Object.entries(HIERARCHY)) for (const __k of __kids) __parentOf.set(__k, Number(__p))
    const __lcaMerge = (a: number, b: number): boolean => {
      const seen = new Set<number>()
      let x: number | undefined = a
      while (x !== undefined) { seen.add(x); x = __parentOf.get(x) }
      let y: number | undefined = b
      while (y !== undefined && !seen.has(y)) y = __parentOf.get(y)
      if (y === undefined) return graph.getProperty(MERGE_EDGES_KEY) === true
      const __py = __parentOf.get(y)
      const __g = __py === undefined ? graph : nestedGraphs.get(__py)!
      return __g.getProperty(MERGE_EDGES_KEY) === true
    }
    EDGE_IDX.forEach(([s, sp, , t, tp], ei) => {
      const __srcMerge = __lcaMerge(s, t)
      const __tgtMerge = nodeOf.get(t)!.getGraph()?.getProperty(MERGE_EDGES_KEY) === true
      const e = createSimpleEdge(nodeOf.get(s)!, nodeOf.get(t)!, sp, tp, __srcMerge, __tgtMerge)
      e.setProperty(MODEL_ORDER_KEY, ei)
      if (EDGE_YO[ei]) e.setProperty(INSIDE_SELF_LOOPS_YO_KEY, true)
      for (const l of EDGE_LABELS[ei]) {
        e.getLabels().push({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })
      }
    })
    if (Object.keys(HIERARCHY).length > 0) {
      graph.setProperty(HIERARCHY_HANDLING_KEY, 'INCLUDE_CHILDREN')
    }
    graph.setProperty(DIRECTION_KEY, 'RIGHT')
    graph.setProperty('org.eclipse.elk.direction', "RIGHT")
    graph.setProperty('org.eclipse.elk.layered.cycleBreaking.strategy', "INTERACTIVE")
    graph.setProperty('org.eclipse.elk.layered.layering.strategy', "INTERACTIVE")
    graph.setProperty('org.eclipse.elk.layered.crossingMinimization.semiInteractive', true)
    graph.setProperty('org.eclipse.elk.separateConnectedComponents', false)
    graph.setProperty('org.eclipse.elk.randomSeed', 1)

    new LayeredLayoutProvider().layout(graph)

    if (false) {
      for (const n of nodeOf.values()) {
        expect(Number.isFinite(n.position.x)).toBe(true)
        expect(Number.isFinite(n.position.y)).toBe(true)
      }
      return
    }

    // L1 (M3): 与 ELK Java 0.12.0 jar oracle 坐标级差分 (容差 ε = 2).
    // oracle 坐标相对父块 (jar getX/getY); ggn 子图节点坐标同样相对父 → 直接对比, 无需世界坐标累加.
    const oracle = JSON.parse(readFileSync(new URL('../../../test-resources/jar-oracle/examples__user-hints__interactive-constraints__interactiveLayeredLayout_sortingTask_pseudo_positions.json', import.meta.url), 'utf8'))
    expect(oracle.hash, 'jar oracle 过期/缺失, 请重跑 node scripts/generate-jar-oracle.mjs').toBe('1b6472ce41eff47d')
    // ELK 类加载顺序变体 (EdgeMain vs BatchMain): oracle.variants 记录另一变体, 任一匹配即通过.
    const variants = oracle.variants ?? []
    for (let i = 0; i < DIMS.length; i++) {
      const gn = nodeOf.get(i)!
      const nm = 'N' + NAMES[i]
      const cands = [oracle.coords[nm], ...variants.map((v) => v.coords[nm])].filter(Boolean)
      expect(cands.length, nm + ' 缺少 jar oracle 坐标').toBeGreaterThan(0)
      const bestX = Math.min(...cands.map((c) => Math.abs(gn.position.x - c.x)))
      const bestY = Math.min(...cands.map((c) => Math.abs(gn.position.y - c.y)))
      expect(bestX, nm + ' x').toBeLessThanOrEqual(2)
      expect(bestY, nm + ' y').toBeLessThanOrEqual(2)
    }
  })
})

/**
 * elkt 生成: examples__user-hints__model-order__modelOrderCrossingMinimization
 * 图: 60 节点 / 45 边 / 0 层级块
 * 差分: ELK 0.12.0 jar 自身报错 (UnsupportedGraphException The hierarchy aware processor NONE in ch) — ggn 须复刻报错 (expected crash)
 */

describe('elkt 生成: examples__user-hints__model-order__modelOrderCrossingMinimization', () => {
  const HIERARCHY: Record<number, number[]> = {"0":[1,2,3,4,5,6,7,8],"9":[10,11,12,13,14,15],"16":[17,18,19,20,21,22],"23":[24,25,26,27,28,29],"30":[31,32,33,34],"35":[36,37,38,39],"40":[41,42,43,44],"45":[46,47,48,49],"50":[51,52,53,54],"55":[56,57,58,59]}
  const EDGE_IDX: [number, number | null, string | null, number, number | null, string | null][] = [[1,null,null,2,null,null],[1,null,null,8,null,null],[1,null,null,5,null,null],[2,null,null,6,null,null],[3,null,null,6,null,null],[4,null,null,7,null,null],[5,null,null,7,null,null],[6,null,null,8,null,null],[7,null,null,8,null,null],[10,null,null,15,null,null],[10,null,null,11,null,null],[11,null,null,14,null,null],[12,null,null,14,null,null],[13,null,null,14,null,null],[14,null,null,15,null,null],[17,null,null,18,null,null],[17,null,null,22,null,null],[18,null,null,21,null,null],[19,null,null,21,null,null],[20,null,null,21,null,null],[21,null,null,22,null,null],[24,null,null,25,null,null],[24,null,null,29,null,null],[25,null,null,28,null,null],[26,null,null,28,null,null],[27,null,null,28,null,null],[28,null,null,29,null,null],[31,null,null,32,null,null],[31,null,null,33,null,null],[31,null,null,34,null,null],[36,null,null,37,null,null],[36,null,null,39,null,null],[36,null,null,38,null,null],[41,null,null,42,null,null],[41,null,null,44,null,null],[41,null,null,43,null,null],[46,null,null,47,null,null],[46,null,null,49,null,null],[46,null,null,48,null,null],[51,null,null,52,null,null],[51,null,null,54,null,null],[51,null,null,53,null,null],[56,null,null,57,null,null],[56,null,null,59,null,null],[56,null,null,58,null,null]]
  const EDGE_YO: boolean[] = [false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false]
  const EDGE_LABELS: { text: string; width: number; height: number; placement: string | null }[][] = [[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[]]
  const DIMS: [number, number][] = [[60,30],[20,20],[20,20],[20,20],[20,20],[20,20],[20,20],[20,20],[20,20],[60,30],[20,20],[20,20],[20,20],[20,20],[20,20],[20,20],[60,30],[20,20],[20,20],[20,20],[20,20],[20,20],[20,20],[60,30],[20,20],[20,20],[20,20],[20,20],[20,20],[20,20],[60,30],[20,20],[20,20],[20,20],[20,20],[60,30],[20,20],[20,20],[20,20],[20,20],[60,30],[20,20],[20,20],[20,20],[20,20],[60,30],[20,20],[20,20],[20,20],[20,20],[60,30],[20,20],[20,20],[20,20],[20,20],[60,30],[20,20],[20,20],[20,20],[20,20]]
  const NAMES: string[] = ["dummyNodesBetween","dummyNodesBetween.v1","dummyNodesBetween.v2","dummyNodesBetween.v3","dummyNodesBetween.v4","dummyNodesBetween.v5","dummyNodesBetween.v6","dummyNodesBetween.v7","dummyNodesBetween.v8","dummyNodesOver","dummyNodesOver.v1","dummyNodesOver.v2","dummyNodesOver.v3","dummyNodesOver.v4","dummyNodesOver.v5","dummyNodesOver.v6","dummyNodesUnder","dummyNodesUnder.v1","dummyNodesUnder.v2","dummyNodesUnder.v3","dummyNodesUnder.v4","dummyNodesUnder.v5","dummyNodesUnder.v6","dummyNodesUnderNoCM","dummyNodesUnderNoCM.v1","dummyNodesUnderNoCM.v2","dummyNodesUnderNoCM.v3","dummyNodesUnderNoCM.v4","dummyNodesUnderNoCM.v5","dummyNodesUnderNoCM.v6","noMO","noMO.v1","noMO.v2","noMO.v3","noMO.v4","preferEdges","preferEdges.v1","preferEdges.v2","preferEdges.v3","preferEdges.v4","nodesAndEdges","nodesAndEdges.v1","nodesAndEdges.v2","nodesAndEdges.v3","nodesAndEdges.v4","nodesAndEdgesPreferNodes","nodesAndEdgesPreferNodes.v1","nodesAndEdgesPreferNodes.v2","nodesAndEdgesPreferNodes.v3","nodesAndEdgesPreferNodes.v4","nodesAndEdgesForceNodeMO","nodesAndEdgesForceNodeMO.v1","nodesAndEdgesForceNodeMO.v2","nodesAndEdgesForceNodeMO.v3","nodesAndEdgesForceNodeMO.v4","nodesAndEdgesNoCM","nodesAndEdgesNoCM.v1","nodesAndEdgesNoCM.v2","nodesAndEdgesNoCM.v3","nodesAndEdgesNoCM.v4"]
  const PORT_IDS: string[] = []
  const PORT_CONSTRAINTS: (string | null)[] = [null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]
  const NODE_PORTS: { id: string; x: number; y: number; w: number; h: number; side: string | null; index: number | null; borderOffset: number | null; labels: { text: string; x: number; y: number; width: number; height: number }[] }[][] = [[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[]]
  const NODE_ACTIVATE: boolean[] = [false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false]
  const NODE_LABELS: { text: string; width: number; height: number; placement: string | null }[][] = [[{"text":"dummyNodesBetween","width":0,"height":0,"placement":null}],[{"text":"n1","width":0,"height":0,"placement":null}],[{"text":"n2","width":0,"height":0,"placement":null}],[{"text":"n3","width":0,"height":0,"placement":null}],[{"text":"n4","width":0,"height":0,"placement":null}],[{"text":"n5","width":0,"height":0,"placement":null}],[{"text":"n6","width":0,"height":0,"placement":null}],[{"text":"n7","width":0,"height":0,"placement":null}],[{"text":"n8","width":0,"height":0,"placement":null}],[{"text":"dummyNodesOver","width":0,"height":0,"placement":null}],[{"text":"n1","width":0,"height":0,"placement":null}],[{"text":"n2","width":0,"height":0,"placement":null}],[{"text":"n3","width":0,"height":0,"placement":null}],[{"text":"n4","width":0,"height":0,"placement":null}],[{"text":"n5","width":0,"height":0,"placement":null}],[{"text":"n6","width":0,"height":0,"placement":null}],[{"text":"dummyNodesUnder","width":0,"height":0,"placement":null}],[{"text":"n1","width":0,"height":0,"placement":null}],[{"text":"n2","width":0,"height":0,"placement":null}],[{"text":"n3","width":0,"height":0,"placement":null}],[{"text":"n4","width":0,"height":0,"placement":null}],[{"text":"n5","width":0,"height":0,"placement":null}],[{"text":"n6","width":0,"height":0,"placement":null}],[{"text":"dummyNodesUnderNoCM","width":0,"height":0,"placement":null}],[{"text":"n1","width":0,"height":0,"placement":null}],[{"text":"n2","width":0,"height":0,"placement":null}],[{"text":"n3","width":0,"height":0,"placement":null}],[{"text":"n4","width":0,"height":0,"placement":null}],[{"text":"n5","width":0,"height":0,"placement":null}],[{"text":"n6","width":0,"height":0,"placement":null}],[{"text":"noMO","width":0,"height":0,"placement":null}],[{"text":"n1","width":0,"height":0,"placement":null}],[{"text":"n2","width":0,"height":0,"placement":null}],[{"text":"n3","width":0,"height":0,"placement":null}],[{"text":"n4","width":0,"height":0,"placement":null}],[{"text":"preferEdges","width":0,"height":0,"placement":null}],[{"text":"n1","width":0,"height":0,"placement":null}],[{"text":"n2","width":0,"height":0,"placement":null}],[{"text":"n3","width":0,"height":0,"placement":null}],[{"text":"n4","width":0,"height":0,"placement":null}],[{"text":"nodesAndEdges","width":0,"height":0,"placement":null}],[{"text":"n1","width":0,"height":0,"placement":null}],[{"text":"n2","width":0,"height":0,"placement":null}],[{"text":"n3","width":0,"height":0,"placement":null}],[{"text":"n4","width":0,"height":0,"placement":null}],[{"text":"nodesAndEdgesPreferNodes","width":0,"height":0,"placement":null}],[{"text":"n1","width":0,"height":0,"placement":null}],[{"text":"n2","width":0,"height":0,"placement":null}],[{"text":"n3","width":0,"height":0,"placement":null}],[{"text":"n4","width":0,"height":0,"placement":null}],[{"text":"nodesAndEdgesForceNodeMO","width":0,"height":0,"placement":null}],[{"text":"n1","width":0,"height":0,"placement":null}],[{"text":"n2","width":0,"height":0,"placement":null}],[{"text":"n3","width":0,"height":0,"placement":null}],[{"text":"n4","width":0,"height":0,"placement":null}],[{"text":"nodesAndEdgesNoCM","width":0,"height":0,"placement":null}],[{"text":"n1","width":0,"height":0,"placement":null}],[{"text":"n2","width":0,"height":0,"placement":null}],[{"text":"n3","width":0,"height":0,"placement":null}],[{"text":"n4","width":0,"height":0,"placement":null}]]
  const LABEL_PAD: ({ top: number; left: number; right: number; bottom: number } | null)[] = [{"top":12,"bottom":12,"left":12,"right":12},null,null,null,null,null,null,null,null,{"top":12,"bottom":12,"left":12,"right":12},null,null,null,null,null,null,{"top":12,"bottom":12,"left":12,"right":12},null,null,null,null,null,null,{"top":12,"bottom":12,"left":12,"right":12},null,null,null,null,null,null,{"top":12,"bottom":12,"left":12,"right":12},null,null,null,null,{"top":12,"bottom":12,"left":12,"right":12},null,null,null,null,{"top":12,"bottom":12,"left":12,"right":12},null,null,null,null,{"top":12,"bottom":12,"left":12,"right":12},null,null,null,null,{"top":12,"bottom":12,"left":12,"right":12},null,null,null,null,{"top":12,"bottom":12,"left":12,"right":12},null,null,null,null]
  const NODE_OPTS: [string, unknown][][] = [[["org.eclipse.elk.layered.considerModelOrder.strategy","NODES_AND_EDGES"],["org.eclipse.elk.nodeSize.constraints",["NODE_LABELS"]],["org.eclipse.elk.nodeLabels.placement",["INSIDE","V_TOP","H_CENTER"]]],[["org.eclipse.elk.layered.layering.layerConstraint","FIRST"]],[],[],[],[],[],[],[],[["org.eclipse.elk.layered.considerModelOrder.strategy","PREFER_EDGES"],["org.eclipse.elk.direction","RIGHT"],["org.eclipse.elk.nodeSize.constraints",["NODE_LABELS"]],["org.eclipse.elk.nodeLabels.placement",["INSIDE","V_TOP","H_CENTER"]]],[],[],[],[],[],[],[["org.eclipse.elk.layered.considerModelOrder.strategy","PREFER_EDGES"],["org.eclipse.elk.direction","RIGHT"],["org.eclipse.elk.layered.considerModelOrder.longEdgeStrategy","DUMMY_NODE_UNDER"],["org.eclipse.elk.nodeSize.constraints",["NODE_LABELS"]],["org.eclipse.elk.nodeLabels.placement",["INSIDE","V_TOP","H_CENTER"]]],[],[],[],[],[],[],[["org.eclipse.elk.layered.considerModelOrder.strategy","PREFER_EDGES"],["org.eclipse.elk.direction","RIGHT"],["org.eclipse.elk.layered.crossingMinimization.strategy","NONE"],["org.eclipse.elk.layered.crossingMinimization.greedySwitch.type","OFF"],["org.eclipse.elk.nodeSize.constraints",["NODE_LABELS"]],["org.eclipse.elk.nodeLabels.placement",["INSIDE","V_TOP","H_CENTER"]]],[],[],[],[],[],[],[["org.eclipse.elk.nodeSize.constraints",["NODE_LABELS"]],["org.eclipse.elk.nodeLabels.placement",["INSIDE","V_TOP","H_CENTER"]]],[],[],[],[],[["org.eclipse.elk.layered.considerModelOrder.strategy","PREFER_EDGES"],["org.eclipse.elk.nodeSize.constraints",["NODE_LABELS"]],["org.eclipse.elk.nodeLabels.placement",["INSIDE","V_TOP","H_CENTER"]]],[],[],[],[],[["org.eclipse.elk.layered.considerModelOrder.strategy","NODES_AND_EDGES"],["org.eclipse.elk.nodeSize.constraints",["NODE_LABELS"]],["org.eclipse.elk.nodeLabels.placement",["INSIDE","V_TOP","H_CENTER"]]],[],[],[],[],[["org.eclipse.elk.layered.considerModelOrder.strategy","NODES_AND_EDGES"],["org.eclipse.elk.layered.thoroughness",100],["org.eclipse.elk.layered.considerModelOrder.crossingCounterNodeInfluence",100],["org.eclipse.elk.nodeSize.constraints",["NODE_LABELS"]],["org.eclipse.elk.nodeLabels.placement",["INSIDE","V_TOP","H_CENTER"]]],[],[],[],[],[["org.eclipse.elk.layered.considerModelOrder.strategy","NODES_AND_EDGES"],["org.eclipse.elk.layered.crossingMinimization.forceNodeModelOrder",true],["org.eclipse.elk.nodeSize.constraints",["NODE_LABELS"]],["org.eclipse.elk.nodeLabels.placement",["INSIDE","V_TOP","H_CENTER"]]],[],[],[],[],[["org.eclipse.elk.layered.considerModelOrder.strategy","NODES_AND_EDGES"],["org.eclipse.elk.layered.crossingMinimization.strategy","NONE"],["org.eclipse.elk.layered.crossingMinimization.greedySwitch.type","OFF"],["org.eclipse.elk.nodeSize.constraints",["NODE_LABELS"]],["org.eclipse.elk.nodeLabels.placement",["INSIDE","V_TOP","H_CENTER"]]],[],[],[],[]]

  it('复刻 jar 报错 (ELK 0.12.0 自身行为): UnsupportedGraphException The hierarchy aware processor NONE in ch', () => {
    const graph = new LGraph()
    const nodeOf = new Map<number, LNode>()
    const nestedGraphs = new Map<number, LGraph>()
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      nestedGraphs.set(p, new LGraph())
    }
    for (let i = 0; i < DIMS.length; i++) {
      const parentIdx = Object.entries(HIERARCHY).find(([, kids]) => kids.includes(i))?.[0]
      const g = parentIdx !== undefined ? nestedGraphs.get(Number(parentIdx))! : graph
      const n = new LNode(g)
      n.size = { x: DIMS[i][0], y: DIMS[i][1] }
      n.setProperty(MODEL_ORDER_KEY, i)
      if (PORT_CONSTRAINTS[i]) {
        n.setProperty(PORT_CONSTRAINTS_KEY, PORT_CONSTRAINTS[i] as any)
      }
      for (const [k, v] of NODE_OPTS[i]) {
        n.setProperty(k, v as any)
      }
      for (const portDesc of NODE_PORTS[i]) {
        const port = new LPort()
        port.setNode(n)
        port.getPosition().x = portDesc.x
        port.getPosition().y = portDesc.y
        port.size = { x: portDesc.w, y: portDesc.h }
        if (portDesc.side) port.setSide(portDesc.side as any)
        if (portDesc.index !== null) port.setProperty(PORT_INDEX_KEY, portDesc.index)
        if (portDesc.borderOffset !== null) port.setProperty(PORT_BORDER_OFFSET_KEY, portDesc.borderOffset)
        if (portDesc.labels.length > 0) {
          port.setLabels(portDesc.labels.map((l) => ({ text: l.text, position: { x: l.x, y: l.y }, size: { x: l.width, y: l.height } })))
        }
      }
      if (NODE_ACTIVATE[i]) {
        n.setProperty(INSIDE_SELF_LOOPS_ACTIVATE_KEY, true)
      }
      if (NODE_LABELS[i].length > 0) {
        n.setLabels(NODE_LABELS[i].map((l) => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })))
      }
      nodeOf.set(i, n)
    }
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      const parent = nodeOf.get(p)!
      const nested = nestedGraphs.get(p)!
      parent.setNestedGraph(nested)
      nested.setParentNode(parent)
      // ★ 容器节点 label 占位 (SSOT: LABEL_PAD[i] = 子图 padding.top, 对齐 buildLGraphFromParsed)
      if (LABEL_PAD[p] !== undefined && LABEL_PAD[p] !== null) nested.setPadding(LABEL_PAD[p])
      // ★ 节点级 mergeEdges → 嵌套图 (ELK createLGraph copyProperties; LGraphUtil.createPort 读图属性)
      if (NODE_OPTS[p]?.some(([k]) => k === 'org.eclipse.elk.layered.mergeEdges')) nested.setProperty(MERGE_EDGES_KEY, true)
    }
    __mergeEdges = false
    __defaultSide = PortSide.EAST
    if (__mergeEdges) graph.setProperty(MERGE_EDGES_KEY, true)
    // 边所在图 (LCA) 的 MERGE_EDGES (ELK ElkGraphImporter 源侧读边所在图; 目标侧读目标节点所在图).
    const __parentOf = new Map<number, number>()
    for (const [__p, __kids] of Object.entries(HIERARCHY)) for (const __k of __kids) __parentOf.set(__k, Number(__p))
    const __lcaMerge = (a: number, b: number): boolean => {
      const seen = new Set<number>()
      let x: number | undefined = a
      while (x !== undefined) { seen.add(x); x = __parentOf.get(x) }
      let y: number | undefined = b
      while (y !== undefined && !seen.has(y)) y = __parentOf.get(y)
      if (y === undefined) return graph.getProperty(MERGE_EDGES_KEY) === true
      const __py = __parentOf.get(y)
      const __g = __py === undefined ? graph : nestedGraphs.get(__py)!
      return __g.getProperty(MERGE_EDGES_KEY) === true
    }
    EDGE_IDX.forEach(([s, sp, , t, tp], ei) => {
      const __srcMerge = __lcaMerge(s, t)
      const __tgtMerge = nodeOf.get(t)!.getGraph()?.getProperty(MERGE_EDGES_KEY) === true
      const e = createSimpleEdge(nodeOf.get(s)!, nodeOf.get(t)!, sp, tp, __srcMerge, __tgtMerge)
      e.setProperty(MODEL_ORDER_KEY, ei)
      if (EDGE_YO[ei]) e.setProperty(INSIDE_SELF_LOOPS_YO_KEY, true)
      for (const l of EDGE_LABELS[ei]) {
        e.getLabels().push({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })
      }
    })
    if (Object.keys(HIERARCHY).length > 0) {
      graph.setProperty(HIERARCHY_HANDLING_KEY, 'INCLUDE_CHILDREN')
    }
    graph.setProperty(DIRECTION_KEY, 'RIGHT')
    graph.setProperty('org.eclipse.elk.layered.considerModelOrder.components', "MODEL_ORDER")
    graph.setProperty('org.eclipse.elk.randomSeed', 1)

    expect(() => new LayeredLayoutProvider().layout(graph)).toThrow(new RegExp(" if the root node specifies the same hierarchical processor\\."))
  })
})

/**
 * elkt 生成: examples__user-hints__model-order__modelOrderCycleBreaking
 * 图: 30 节点 / 25 边 / 0 层级块
 * 差分: ELK 0.12.0 jar 自身报错 (NullPointerException Cannot invoke "java.lang.Integer.intValu) — ggn 须复刻报错 (expected crash)
 */

describe('elkt 生成: examples__user-hints__model-order__modelOrderCycleBreaking', () => {
  const HIERARCHY: Record<number, number[]> = {"0":[1,2,3,4,5],"6":[7,8,9,10,11],"12":[13,14,15,16,17],"18":[19,20,21,22,23],"24":[25,26,27,28,29]}
  const EDGE_IDX: [number, number | null, string | null, number, number | null, string | null][] = [[2,null,null,5,null,null],[3,null,null,4,null,null],[4,null,null,5,null,null],[5,null,null,3,null,null],[5,null,null,1,null,null],[8,null,null,11,null,null],[9,null,null,10,null,null],[10,null,null,11,null,null],[11,null,null,9,null,null],[11,null,null,7,null,null],[14,null,null,17,null,null],[15,null,null,16,null,null],[16,null,null,17,null,null],[17,null,null,15,null,null],[17,null,null,13,null,null],[20,null,null,23,null,null],[21,null,null,22,null,null],[22,null,null,23,null,null],[23,null,null,21,null,null],[23,null,null,19,null,null],[26,null,null,29,null,null],[27,null,null,28,null,null],[28,null,null,29,null,null],[29,null,null,27,null,null],[29,null,null,25,null,null]]
  const EDGE_YO: boolean[] = [false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false]
  const EDGE_LABELS: { text: string; width: number; height: number; placement: string | null }[][] = [[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[]]
  const DIMS: [number, number][] = [[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30]]
  const NAMES: string[] = ["greedy","greedy.n0","greedy.n1","greedy.n2","greedy.n3","greedy.n4","greedyModelOrder","greedyModelOrder.n0","greedyModelOrder.n1","greedyModelOrder.n2","greedyModelOrder.n3","greedyModelOrder.n4","modelOrder","modelOrder.n0","modelOrder.n1","modelOrder.n2","modelOrder.n3","modelOrder.n4","greedyModelOrderCMModelOrder","greedyModelOrderCMModelOrder.n0","greedyModelOrderCMModelOrder.n1","greedyModelOrderCMModelOrder.n2","greedyModelOrderCMModelOrder.n3","greedyModelOrderCMModelOrder.n4","strictModelOrderCMModelOrder","strictModelOrderCMModelOrder.n0","strictModelOrderCMModelOrder.n1","strictModelOrderCMModelOrder.n2","strictModelOrderCMModelOrder.n3","strictModelOrderCMModelOrder.n4"]
  const PORT_IDS: string[] = []
  const PORT_CONSTRAINTS: (string | null)[] = [null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]
  const NODE_PORTS: { id: string; x: number; y: number; w: number; h: number; side: string | null; index: number | null; borderOffset: number | null; labels: { text: string; x: number; y: number; width: number; height: number }[] }[][] = [[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[]]
  const NODE_ACTIVATE: boolean[] = [false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false]
  const NODE_LABELS: { text: string; width: number; height: number; placement: string | null }[][] = [[{"text":"greedy","width":0,"height":0,"placement":null}],[{"text":"n0","width":0,"height":0,"placement":null}],[{"text":"n1","width":0,"height":0,"placement":null}],[{"text":"n2","width":0,"height":0,"placement":null}],[{"text":"n3","width":0,"height":0,"placement":null}],[{"text":"n4","width":0,"height":0,"placement":null}],[{"text":"greedyMO","width":0,"height":0,"placement":null}],[{"text":"n0","width":0,"height":0,"placement":null}],[{"text":"n1","width":0,"height":0,"placement":null}],[{"text":"n2","width":0,"height":0,"placement":null}],[{"text":"n3","width":0,"height":0,"placement":null}],[{"text":"n4","width":0,"height":0,"placement":null}],[{"text":"strictMO","width":0,"height":0,"placement":null}],[{"text":"n0","width":0,"height":0,"placement":null}],[{"text":"n1","width":0,"height":0,"placement":null}],[{"text":"n2","width":0,"height":0,"placement":null}],[{"text":"n3","width":0,"height":0,"placement":null}],[{"text":"n4","width":0,"height":0,"placement":null}],[{"text":"CB+CM","width":0,"height":0,"placement":null}],[{"text":"n0","width":0,"height":0,"placement":null}],[{"text":"n1","width":0,"height":0,"placement":null}],[{"text":"n2","width":0,"height":0,"placement":null}],[{"text":"n3","width":0,"height":0,"placement":null}],[{"text":"n4","width":0,"height":0,"placement":null}],[{"text":"strictCB+CM","width":0,"height":0,"placement":null}],[{"text":"n0","width":0,"height":0,"placement":null}],[{"text":"n1","width":0,"height":0,"placement":null}],[{"text":"n2","width":0,"height":0,"placement":null}],[{"text":"n3","width":0,"height":0,"placement":null}],[{"text":"n4","width":0,"height":0,"placement":null}]]
  const LABEL_PAD: ({ top: number; left: number; right: number; bottom: number } | null)[] = [{"top":12,"bottom":12,"left":12,"right":12},null,null,null,null,null,{"top":12,"bottom":12,"left":12,"right":12},null,null,null,null,null,{"top":12,"bottom":12,"left":12,"right":12},null,null,null,null,null,{"top":12,"bottom":12,"left":12,"right":12},null,null,null,null,null,{"top":12,"bottom":12,"left":12,"right":12},null,null,null,null,null]
  const NODE_OPTS: [string, unknown][][] = [[["org.eclipse.elk.nodeSize.constraints",["NODE_LABELS"]],["org.eclipse.elk.nodeLabels.placement",["INSIDE","V_TOP","H_CENTER"]]],[],[["org.eclipse.elk.layered.layering.layerConstraint","FIRST"]],[],[],[],[["org.eclipse.elk.layered.cycleBreaking.strategy","GREEDY_MODEL_ORDER"],["org.eclipse.elk.nodeSize.constraints",["NODE_LABELS"]],["org.eclipse.elk.nodeLabels.placement",["INSIDE","V_TOP","H_CENTER"]]],[],[["org.eclipse.elk.layered.layering.layerConstraint","FIRST"]],[],[],[],[["org.eclipse.elk.layered.cycleBreaking.strategy","MODEL_ORDER"],["org.eclipse.elk.nodeSize.constraints",["NODE_LABELS"]],["org.eclipse.elk.nodeLabels.placement",["INSIDE","V_TOP","H_CENTER"]]],[],[["org.eclipse.elk.layered.layering.layerConstraint","FIRST"]],[],[],[],[["org.eclipse.elk.layered.cycleBreaking.strategy","GREEDY_MODEL_ORDER"],["org.eclipse.elk.layered.considerModelOrder.strategy","NODES_AND_EDGES"],["org.eclipse.elk.nodeSize.constraints",["NODE_LABELS"]],["org.eclipse.elk.nodeLabels.placement",["INSIDE","V_TOP","H_CENTER"]]],[],[["org.eclipse.elk.layered.layering.layerConstraint","FIRST"]],[],[],[],[["org.eclipse.elk.layered.cycleBreaking.strategy","MODEL_ORDER"],["org.eclipse.elk.layered.considerModelOrder.strategy","NODES_AND_EDGES"],["org.eclipse.elk.nodeSize.constraints",["NODE_LABELS"]],["org.eclipse.elk.nodeLabels.placement",["INSIDE","V_TOP","H_CENTER"]]],[],[["org.eclipse.elk.layered.layering.layerConstraint","FIRST"]],[],[],[]]

  it('复刻 jar 报错 (ELK 0.12.0 自身行为): NullPointerException Cannot invoke "java.lang.Integer.intValu', () => {
    const graph = new LGraph()
    const nodeOf = new Map<number, LNode>()
    const nestedGraphs = new Map<number, LGraph>()
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      nestedGraphs.set(p, new LGraph())
    }
    for (let i = 0; i < DIMS.length; i++) {
      const parentIdx = Object.entries(HIERARCHY).find(([, kids]) => kids.includes(i))?.[0]
      const g = parentIdx !== undefined ? nestedGraphs.get(Number(parentIdx))! : graph
      const n = new LNode(g)
      n.size = { x: DIMS[i][0], y: DIMS[i][1] }
      n.setProperty(MODEL_ORDER_KEY, i)
      if (PORT_CONSTRAINTS[i]) {
        n.setProperty(PORT_CONSTRAINTS_KEY, PORT_CONSTRAINTS[i] as any)
      }
      for (const [k, v] of NODE_OPTS[i]) {
        n.setProperty(k, v as any)
      }
      for (const portDesc of NODE_PORTS[i]) {
        const port = new LPort()
        port.setNode(n)
        port.getPosition().x = portDesc.x
        port.getPosition().y = portDesc.y
        port.size = { x: portDesc.w, y: portDesc.h }
        if (portDesc.side) port.setSide(portDesc.side as any)
        if (portDesc.index !== null) port.setProperty(PORT_INDEX_KEY, portDesc.index)
        if (portDesc.borderOffset !== null) port.setProperty(PORT_BORDER_OFFSET_KEY, portDesc.borderOffset)
        if (portDesc.labels.length > 0) {
          port.setLabels(portDesc.labels.map((l) => ({ text: l.text, position: { x: l.x, y: l.y }, size: { x: l.width, y: l.height } })))
        }
      }
      if (NODE_ACTIVATE[i]) {
        n.setProperty(INSIDE_SELF_LOOPS_ACTIVATE_KEY, true)
      }
      if (NODE_LABELS[i].length > 0) {
        n.setLabels(NODE_LABELS[i].map((l) => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })))
      }
      nodeOf.set(i, n)
    }
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      const parent = nodeOf.get(p)!
      const nested = nestedGraphs.get(p)!
      parent.setNestedGraph(nested)
      nested.setParentNode(parent)
      // ★ 容器节点 label 占位 (SSOT: LABEL_PAD[i] = 子图 padding.top, 对齐 buildLGraphFromParsed)
      if (LABEL_PAD[p] !== undefined && LABEL_PAD[p] !== null) nested.setPadding(LABEL_PAD[p])
      // ★ 节点级 mergeEdges → 嵌套图 (ELK createLGraph copyProperties; LGraphUtil.createPort 读图属性)
      if (NODE_OPTS[p]?.some(([k]) => k === 'org.eclipse.elk.layered.mergeEdges')) nested.setProperty(MERGE_EDGES_KEY, true)
    }
    __mergeEdges = false
    __defaultSide = PortSide.EAST
    if (__mergeEdges) graph.setProperty(MERGE_EDGES_KEY, true)
    // 边所在图 (LCA) 的 MERGE_EDGES (ELK ElkGraphImporter 源侧读边所在图; 目标侧读目标节点所在图).
    const __parentOf = new Map<number, number>()
    for (const [__p, __kids] of Object.entries(HIERARCHY)) for (const __k of __kids) __parentOf.set(__k, Number(__p))
    const __lcaMerge = (a: number, b: number): boolean => {
      const seen = new Set<number>()
      let x: number | undefined = a
      while (x !== undefined) { seen.add(x); x = __parentOf.get(x) }
      let y: number | undefined = b
      while (y !== undefined && !seen.has(y)) y = __parentOf.get(y)
      if (y === undefined) return graph.getProperty(MERGE_EDGES_KEY) === true
      const __py = __parentOf.get(y)
      const __g = __py === undefined ? graph : nestedGraphs.get(__py)!
      return __g.getProperty(MERGE_EDGES_KEY) === true
    }
    EDGE_IDX.forEach(([s, sp, , t, tp], ei) => {
      const __srcMerge = __lcaMerge(s, t)
      const __tgtMerge = nodeOf.get(t)!.getGraph()?.getProperty(MERGE_EDGES_KEY) === true
      const e = createSimpleEdge(nodeOf.get(s)!, nodeOf.get(t)!, sp, tp, __srcMerge, __tgtMerge)
      e.setProperty(MODEL_ORDER_KEY, ei)
      if (EDGE_YO[ei]) e.setProperty(INSIDE_SELF_LOOPS_YO_KEY, true)
      for (const l of EDGE_LABELS[ei]) {
        e.getLabels().push({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })
      }
    })
    if (Object.keys(HIERARCHY).length > 0) {
      graph.setProperty(HIERARCHY_HANDLING_KEY, 'INCLUDE_CHILDREN')
    }
    graph.setProperty(DIRECTION_KEY, 'RIGHT')
    graph.setProperty('org.eclipse.elk.layered.considerModelOrder.components', "INSIDE_PORT_SIDE_GROUPS")
    graph.setProperty('org.eclipse.elk.randomSeed', 1)

    expect(() => new LayeredLayoutProvider().layout(graph)).toThrow(new RegExp("roperty\\(org\\.eclipse\\.elk\\.graph\\.properties\\.IProperty\\)\" is null"))
  })
})

/**
 * elkt 生成: examples__user-hints__model-order__modelOrderNoCrossingMin
 * 图: 5 节点 / 4 边 / 0 层级块
 * 差分: 坐标级 (1:1 ELK 对齐)
 */

describe('elkt 生成: examples__user-hints__model-order__modelOrderNoCrossingMin', () => {
  const HIERARCHY: Record<number, number[]> = {}
  const EDGE_IDX: [number, number | null, string | null, number, number | null, string | null][] = [[0,null,null,1,null,null],[0,null,null,2,null,null],[1,null,null,4,null,null],[2,null,null,3,null,null]]
  const EDGE_YO: boolean[] = [false,false,false,false]
  const EDGE_LABELS: { text: string; width: number; height: number; placement: string | null }[][] = [[],[],[],[]]
  const DIMS: [number, number][] = [[60,30],[60,30],[60,30],[60,30],[60,30]]
  const NAMES: string[] = ["n1","n2","n3","n4","n5"]
  const PORT_IDS: string[] = []
  const PORT_CONSTRAINTS: (string | null)[] = [null,null,null,null,null]
  const NODE_PORTS: { id: string; x: number; y: number; w: number; h: number; side: string | null; index: number | null; borderOffset: number | null; labels: { text: string; x: number; y: number; width: number; height: number }[] }[][] = [[],[],[],[],[]]
  const NODE_ACTIVATE: boolean[] = [false,false,false,false,false]
  const NODE_LABELS: { text: string; width: number; height: number; placement: string | null }[][] = [[{"text":"n1","width":0,"height":0,"placement":null}],[{"text":"n2","width":0,"height":0,"placement":null}],[{"text":"n3","width":0,"height":0,"placement":null}],[{"text":"n4","width":0,"height":0,"placement":null}],[{"text":"n5","width":0,"height":0,"placement":null}]]
  const LABEL_PAD: ({ top: number; left: number; right: number; bottom: number } | null)[] = [null,null,null,null,null]
  const NODE_OPTS: [string, unknown][][] = [[],[],[],[],[]]

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
      n.setProperty(MODEL_ORDER_KEY, i)
      if (PORT_CONSTRAINTS[i]) {
        n.setProperty(PORT_CONSTRAINTS_KEY, PORT_CONSTRAINTS[i] as any)
      }
      for (const [k, v] of NODE_OPTS[i]) {
        n.setProperty(k, v as any)
      }
      for (const portDesc of NODE_PORTS[i]) {
        const port = new LPort()
        port.setNode(n)
        port.getPosition().x = portDesc.x
        port.getPosition().y = portDesc.y
        port.size = { x: portDesc.w, y: portDesc.h }
        if (portDesc.side) port.setSide(portDesc.side as any)
        if (portDesc.index !== null) port.setProperty(PORT_INDEX_KEY, portDesc.index)
        if (portDesc.borderOffset !== null) port.setProperty(PORT_BORDER_OFFSET_KEY, portDesc.borderOffset)
        if (portDesc.labels.length > 0) {
          port.setLabels(portDesc.labels.map((l) => ({ text: l.text, position: { x: l.x, y: l.y }, size: { x: l.width, y: l.height } })))
        }
      }
      if (NODE_ACTIVATE[i]) {
        n.setProperty(INSIDE_SELF_LOOPS_ACTIVATE_KEY, true)
      }
      if (NODE_LABELS[i].length > 0) {
        n.setLabels(NODE_LABELS[i].map((l) => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })))
      }
      nodeOf.set(i, n)
      graphNodes.push(n)
    }
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      const parent = nodeOf.get(p)!
      const nested = nestedGraphs.get(p)!
      parent.setNestedGraph(nested)
      nested.setParentNode(parent)
      // ★ 容器节点 label 占位 (SSOT: LABEL_PAD[i] = 子图 padding.top, 对齐 buildLGraphFromParsed)
      if (LABEL_PAD[p] !== undefined && LABEL_PAD[p] !== null) nested.setPadding(LABEL_PAD[p])
      // ★ 节点级 mergeEdges → 嵌套图 (ELK createLGraph copyProperties; LGraphUtil.createPort 读图属性)
      if (NODE_OPTS[p]?.some(([k]) => k === 'org.eclipse.elk.layered.mergeEdges')) nested.setProperty(MERGE_EDGES_KEY, true)
    }
    __mergeEdges = false
    __defaultSide = PortSide.EAST
    if (__mergeEdges) graph.setProperty(MERGE_EDGES_KEY, true)
    // 边所在图 (LCA) 的 MERGE_EDGES (ELK ElkGraphImporter 源侧读边所在图; 目标侧读目标节点所在图).
    const __parentOf = new Map<number, number>()
    for (const [__p, __kids] of Object.entries(HIERARCHY)) for (const __k of __kids) __parentOf.set(__k, Number(__p))
    const __lcaMerge = (a: number, b: number): boolean => {
      const seen = new Set<number>()
      let x: number | undefined = a
      while (x !== undefined) { seen.add(x); x = __parentOf.get(x) }
      let y: number | undefined = b
      while (y !== undefined && !seen.has(y)) y = __parentOf.get(y)
      if (y === undefined) return graph.getProperty(MERGE_EDGES_KEY) === true
      const __py = __parentOf.get(y)
      const __g = __py === undefined ? graph : nestedGraphs.get(__py)!
      return __g.getProperty(MERGE_EDGES_KEY) === true
    }
    EDGE_IDX.forEach(([s, sp, , t, tp], ei) => {
      const __srcMerge = __lcaMerge(s, t)
      const __tgtMerge = nodeOf.get(t)!.getGraph()?.getProperty(MERGE_EDGES_KEY) === true
      const e = createSimpleEdge(nodeOf.get(s)!, nodeOf.get(t)!, sp, tp, __srcMerge, __tgtMerge)
      e.setProperty(MODEL_ORDER_KEY, ei)
      if (EDGE_YO[ei]) e.setProperty(INSIDE_SELF_LOOPS_YO_KEY, true)
      for (const l of EDGE_LABELS[ei]) {
        e.getLabels().push({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })
      }
    })
    if (Object.keys(HIERARCHY).length > 0) {
      graph.setProperty(HIERARCHY_HANDLING_KEY, 'INCLUDE_CHILDREN')
    }
    graph.setProperty(DIRECTION_KEY, 'RIGHT')
    graph.setProperty('org.eclipse.elk.layered.crossingMinimization.strategy', "NONE")
    graph.setProperty('org.eclipse.elk.layered.considerModelOrder.strategy', "NODES_AND_EDGES")
    graph.setProperty('org.eclipse.elk.layered.crossingMinimization.greedySwitch.type', "OFF")
    graph.setProperty('org.eclipse.elk.layered.nodePlacement.strategy', "SIMPLE")
    graph.setProperty('org.eclipse.elk.randomSeed', 1)

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

  it('坐标级差分: 与 jar 0.12.0 1:1 对齐', () => {
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
      n.setProperty(MODEL_ORDER_KEY, i)
      if (PORT_CONSTRAINTS[i]) {
        n.setProperty(PORT_CONSTRAINTS_KEY, PORT_CONSTRAINTS[i] as any)
      }
      for (const [k, v] of NODE_OPTS[i]) {
        n.setProperty(k, v as any)
      }
      for (const portDesc of NODE_PORTS[i]) {
        const port = new LPort()
        port.setNode(n)
        port.getPosition().x = portDesc.x
        port.getPosition().y = portDesc.y
        port.size = { x: portDesc.w, y: portDesc.h }
        if (portDesc.side) port.setSide(portDesc.side as any)
        if (portDesc.index !== null) port.setProperty(PORT_INDEX_KEY, portDesc.index)
        if (portDesc.borderOffset !== null) port.setProperty(PORT_BORDER_OFFSET_KEY, portDesc.borderOffset)
        if (portDesc.labels.length > 0) {
          port.setLabels(portDesc.labels.map((l) => ({ text: l.text, position: { x: l.x, y: l.y }, size: { x: l.width, y: l.height } })))
        }
      }
      if (NODE_ACTIVATE[i]) {
        n.setProperty(INSIDE_SELF_LOOPS_ACTIVATE_KEY, true)
      }
      if (NODE_LABELS[i].length > 0) {
        n.setLabels(NODE_LABELS[i].map((l) => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })))
      }
      nodeOf.set(i, n)
    }
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      const parent = nodeOf.get(p)!
      const nested = nestedGraphs.get(p)!
      parent.setNestedGraph(nested)
      nested.setParentNode(parent)
      // ★ 容器节点 label 占位 (SSOT: LABEL_PAD[i] = 子图 padding.top, 对齐 buildLGraphFromParsed)
      if (LABEL_PAD[p] !== undefined && LABEL_PAD[p] !== null) nested.setPadding(LABEL_PAD[p])
      // ★ 节点级 mergeEdges → 嵌套图 (ELK createLGraph copyProperties; LGraphUtil.createPort 读图属性)
      if (NODE_OPTS[p]?.some(([k]) => k === 'org.eclipse.elk.layered.mergeEdges')) nested.setProperty(MERGE_EDGES_KEY, true)
    }
    __mergeEdges = false
    __defaultSide = PortSide.EAST
    if (__mergeEdges) graph.setProperty(MERGE_EDGES_KEY, true)
    // 边所在图 (LCA) 的 MERGE_EDGES (ELK ElkGraphImporter 源侧读边所在图; 目标侧读目标节点所在图).
    const __parentOf = new Map<number, number>()
    for (const [__p, __kids] of Object.entries(HIERARCHY)) for (const __k of __kids) __parentOf.set(__k, Number(__p))
    const __lcaMerge = (a: number, b: number): boolean => {
      const seen = new Set<number>()
      let x: number | undefined = a
      while (x !== undefined) { seen.add(x); x = __parentOf.get(x) }
      let y: number | undefined = b
      while (y !== undefined && !seen.has(y)) y = __parentOf.get(y)
      if (y === undefined) return graph.getProperty(MERGE_EDGES_KEY) === true
      const __py = __parentOf.get(y)
      const __g = __py === undefined ? graph : nestedGraphs.get(__py)!
      return __g.getProperty(MERGE_EDGES_KEY) === true
    }
    EDGE_IDX.forEach(([s, sp, , t, tp], ei) => {
      const __srcMerge = __lcaMerge(s, t)
      const __tgtMerge = nodeOf.get(t)!.getGraph()?.getProperty(MERGE_EDGES_KEY) === true
      const e = createSimpleEdge(nodeOf.get(s)!, nodeOf.get(t)!, sp, tp, __srcMerge, __tgtMerge)
      e.setProperty(MODEL_ORDER_KEY, ei)
      if (EDGE_YO[ei]) e.setProperty(INSIDE_SELF_LOOPS_YO_KEY, true)
      for (const l of EDGE_LABELS[ei]) {
        e.getLabels().push({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })
      }
    })
    if (Object.keys(HIERARCHY).length > 0) {
      graph.setProperty(HIERARCHY_HANDLING_KEY, 'INCLUDE_CHILDREN')
    }
    graph.setProperty(DIRECTION_KEY, 'RIGHT')
    graph.setProperty('org.eclipse.elk.layered.crossingMinimization.strategy', "NONE")
    graph.setProperty('org.eclipse.elk.layered.considerModelOrder.strategy', "NODES_AND_EDGES")
    graph.setProperty('org.eclipse.elk.layered.crossingMinimization.greedySwitch.type', "OFF")
    graph.setProperty('org.eclipse.elk.layered.nodePlacement.strategy', "SIMPLE")
    graph.setProperty('org.eclipse.elk.randomSeed', 1)

    new LayeredLayoutProvider().layout(graph)

    if (false) {
      for (const n of nodeOf.values()) {
        expect(Number.isFinite(n.position.x)).toBe(true)
        expect(Number.isFinite(n.position.y)).toBe(true)
      }
      return
    }

    // L1 (M3): 与 ELK Java 0.12.0 jar oracle 坐标级差分 (容差 ε = 2).
    // oracle 坐标相对父块 (jar getX/getY); ggn 子图节点坐标同样相对父 → 直接对比, 无需世界坐标累加.
    const oracle = JSON.parse(readFileSync(new URL('../../../test-resources/jar-oracle/examples__user-hints__model-order__modelOrderNoCrossingMin.json', import.meta.url), 'utf8'))
    expect(oracle.hash, 'jar oracle 过期/缺失, 请重跑 node scripts/generate-jar-oracle.mjs').toBe('6ac861b13d70ea7b')
    // ELK 类加载顺序变体 (EdgeMain vs BatchMain): oracle.variants 记录另一变体, 任一匹配即通过.
    const variants = oracle.variants ?? []
    for (let i = 0; i < DIMS.length; i++) {
      const gn = nodeOf.get(i)!
      const nm = 'N' + NAMES[i]
      const cands = [oracle.coords[nm], ...variants.map((v) => v.coords[nm])].filter(Boolean)
      expect(cands.length, nm + ' 缺少 jar oracle 坐标').toBeGreaterThan(0)
      const bestX = Math.min(...cands.map((c) => Math.abs(gn.position.x - c.x)))
      const bestY = Math.min(...cands.map((c) => Math.abs(gn.position.y - c.y)))
      expect(bestX, nm + ' x').toBeLessThanOrEqual(2)
      expect(bestY, nm + ' y').toBeLessThanOrEqual(2)
    }
  })
})

/**
 * elkt 生成: examples__user-hints__layered__verticalOrder
 * 图: 12 节点 / 6 边 / 0 层级块
 * 差分: ELK 0.12.0 jar 自身报错 (UnsupportedGraphException The hierarchy aware processor INTERACTIV) — ggn 须复刻报错 (expected crash)
 */

describe('elkt 生成: examples__user-hints__layered__verticalOrder', () => {
  const HIERARCHY: Record<number, number[]> = {"0":[1,2,3],"4":[5,6,7],"8":[9,10,11]}
  const EDGE_IDX: [number, number | null, string | null, number, number | null, string | null][] = [[1,0,"p1",2,null,null],[1,1,"p2",3,null,null],[5,0,"p1",6,null,null],[5,1,"p2",7,null,null],[9,0,"p1",10,null,null],[9,1,"p2",11,null,null]]
  const EDGE_YO: boolean[] = [false,false,false,false,false,false]
  const EDGE_LABELS: { text: string; width: number; height: number; placement: string | null }[][] = [[],[],[],[],[],[]]
  const DIMS: [number, number][] = [[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30]]
  const NAMES: string[] = ["default","default.n1","default.n2","default.n3","semiInteractive","semiInteractive.n1","semiInteractive.n2","semiInteractive.n3","interactive","interactive.n1","interactive.n2","interactive.n3"]
  const PORT_IDS: string[] = ["p1","p2"]
  const PORT_CONSTRAINTS: (string | null)[] = [null,"FIXED_ORDER",null,null,null,"FIXED_ORDER",null,null,null,"FIXED_ORDER",null,null]
  const NODE_PORTS: { id: string; x: number; y: number; w: number; h: number; side: string | null; index: number | null; borderOffset: number | null; labels: { text: string; x: number; y: number; width: number; height: number }[] }[][] = [[],[{"id":"p1","x":0,"y":0,"w":8,"h":8,"side":"EAST","index":0,"borderOffset":null,"labels":[]},{"id":"p2","x":0,"y":0,"w":8,"h":8,"side":"EAST","index":1,"borderOffset":null,"labels":[]}],[],[],[],[{"id":"p1","x":0,"y":0,"w":8,"h":8,"side":"EAST","index":0,"borderOffset":null,"labels":[]},{"id":"p2","x":0,"y":0,"w":8,"h":8,"side":"EAST","index":1,"borderOffset":null,"labels":[]}],[],[],[],[{"id":"p1","x":0,"y":0,"w":8,"h":8,"side":"EAST","index":0,"borderOffset":null,"labels":[]},{"id":"p2","x":0,"y":0,"w":8,"h":8,"side":"EAST","index":1,"borderOffset":null,"labels":[]}],[],[]]
  const NODE_ACTIVATE: boolean[] = [false,false,false,false,false,false,false,false,false,false,false,false]
  const NODE_LABELS: { text: string; width: number; height: number; placement: string | null }[][] = [[{"text":"Default","width":43,"height":15,"placement":null}],[{"text":"1","width":0,"height":0,"placement":null}],[{"text":"2","width":0,"height":0,"placement":null}],[{"text":"3","width":0,"height":0,"placement":null}],[{"text":"Semi-Interactive","width":97,"height":15,"placement":null}],[{"text":"1","width":0,"height":0,"placement":null}],[{"text":"2","width":0,"height":0,"placement":null}],[{"text":"3","width":0,"height":0,"placement":null}],[{"text":"Interactive","width":58,"height":15,"placement":null}],[{"text":"1","width":0,"height":0,"placement":null}],[{"text":"2","width":0,"height":0,"placement":null}],[{"text":"3","width":0,"height":0,"placement":null}]]
  const LABEL_PAD: ({ top: number; left: number; right: number; bottom: number } | null)[] = [{"top":32,"bottom":12,"left":12,"right":12},null,null,null,{"top":32,"bottom":12,"left":12,"right":12},null,null,null,{"top":32,"bottom":12,"left":12,"right":12},null,null,null]
  const NODE_OPTS: [string, unknown][][] = [[["org.eclipse.elk.algorithm","layered"],["org.eclipse.elk.nodeLabels.placement",["INSIDE","V_TOP","H_CENTER"]]],[],[],[],[["org.eclipse.elk.algorithm","layered"],["org.eclipse.elk.layered.crossingMinimization.semiInteractive",true],["org.eclipse.elk.nodeLabels.placement",["INSIDE","V_TOP","H_CENTER"]]],[],[],[],[["org.eclipse.elk.algorithm","layered"],["org.eclipse.elk.layered.crossingMinimization.strategy","INTERACTIVE"],["org.eclipse.elk.nodeLabels.placement",["INSIDE","V_TOP","H_CENTER"]],["org.eclipse.elk.nodeSize.constraints",["NODE_LABELS"]]],[],[],[]]

  it('复刻 jar 报错 (ELK 0.12.0 自身行为): UnsupportedGraphException The hierarchy aware processor INTERACTIV', () => {
    const graph = new LGraph()
    const nodeOf = new Map<number, LNode>()
    const nestedGraphs = new Map<number, LGraph>()
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      nestedGraphs.set(p, new LGraph())
    }
    for (let i = 0; i < DIMS.length; i++) {
      const parentIdx = Object.entries(HIERARCHY).find(([, kids]) => kids.includes(i))?.[0]
      const g = parentIdx !== undefined ? nestedGraphs.get(Number(parentIdx))! : graph
      const n = new LNode(g)
      n.size = { x: DIMS[i][0], y: DIMS[i][1] }
      n.setProperty(MODEL_ORDER_KEY, i)
      if (PORT_CONSTRAINTS[i]) {
        n.setProperty(PORT_CONSTRAINTS_KEY, PORT_CONSTRAINTS[i] as any)
      }
      for (const [k, v] of NODE_OPTS[i]) {
        n.setProperty(k, v as any)
      }
      for (const portDesc of NODE_PORTS[i]) {
        const port = new LPort()
        port.setNode(n)
        port.getPosition().x = portDesc.x
        port.getPosition().y = portDesc.y
        port.size = { x: portDesc.w, y: portDesc.h }
        if (portDesc.side) port.setSide(portDesc.side as any)
        if (portDesc.index !== null) port.setProperty(PORT_INDEX_KEY, portDesc.index)
        if (portDesc.borderOffset !== null) port.setProperty(PORT_BORDER_OFFSET_KEY, portDesc.borderOffset)
        if (portDesc.labels.length > 0) {
          port.setLabels(portDesc.labels.map((l) => ({ text: l.text, position: { x: l.x, y: l.y }, size: { x: l.width, y: l.height } })))
        }
      }
      if (NODE_ACTIVATE[i]) {
        n.setProperty(INSIDE_SELF_LOOPS_ACTIVATE_KEY, true)
      }
      if (NODE_LABELS[i].length > 0) {
        n.setLabels(NODE_LABELS[i].map((l) => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })))
      }
      nodeOf.set(i, n)
    }
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      const parent = nodeOf.get(p)!
      const nested = nestedGraphs.get(p)!
      parent.setNestedGraph(nested)
      nested.setParentNode(parent)
      // ★ 容器节点 label 占位 (SSOT: LABEL_PAD[i] = 子图 padding.top, 对齐 buildLGraphFromParsed)
      if (LABEL_PAD[p] !== undefined && LABEL_PAD[p] !== null) nested.setPadding(LABEL_PAD[p])
      // ★ 节点级 mergeEdges → 嵌套图 (ELK createLGraph copyProperties; LGraphUtil.createPort 读图属性)
      if (NODE_OPTS[p]?.some(([k]) => k === 'org.eclipse.elk.layered.mergeEdges')) nested.setProperty(MERGE_EDGES_KEY, true)
    }
    __mergeEdges = false
    __defaultSide = PortSide.EAST
    if (__mergeEdges) graph.setProperty(MERGE_EDGES_KEY, true)
    // 边所在图 (LCA) 的 MERGE_EDGES (ELK ElkGraphImporter 源侧读边所在图; 目标侧读目标节点所在图).
    const __parentOf = new Map<number, number>()
    for (const [__p, __kids] of Object.entries(HIERARCHY)) for (const __k of __kids) __parentOf.set(__k, Number(__p))
    const __lcaMerge = (a: number, b: number): boolean => {
      const seen = new Set<number>()
      let x: number | undefined = a
      while (x !== undefined) { seen.add(x); x = __parentOf.get(x) }
      let y: number | undefined = b
      while (y !== undefined && !seen.has(y)) y = __parentOf.get(y)
      if (y === undefined) return graph.getProperty(MERGE_EDGES_KEY) === true
      const __py = __parentOf.get(y)
      const __g = __py === undefined ? graph : nestedGraphs.get(__py)!
      return __g.getProperty(MERGE_EDGES_KEY) === true
    }
    EDGE_IDX.forEach(([s, sp, , t, tp], ei) => {
      const __srcMerge = __lcaMerge(s, t)
      const __tgtMerge = nodeOf.get(t)!.getGraph()?.getProperty(MERGE_EDGES_KEY) === true
      const e = createSimpleEdge(nodeOf.get(s)!, nodeOf.get(t)!, sp, tp, __srcMerge, __tgtMerge)
      e.setProperty(MODEL_ORDER_KEY, ei)
      if (EDGE_YO[ei]) e.setProperty(INSIDE_SELF_LOOPS_YO_KEY, true)
      for (const l of EDGE_LABELS[ei]) {
        e.getLabels().push({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })
      }
    })
    if (Object.keys(HIERARCHY).length > 0) {
      graph.setProperty(HIERARCHY_HANDLING_KEY, 'INCLUDE_CHILDREN')
    }
    graph.setProperty(DIRECTION_KEY, 'RIGHT')
    graph.setProperty('org.eclipse.elk.aspectRatio', 0.1)
    graph.setProperty('org.eclipse.elk.randomSeed', 1)

    expect(() => new LayeredLayoutProvider().layout(graph)).toThrow(new RegExp(" if the root node specifies the same hierarchical processor\\."))
  })
})

/**
 * elkt 生成: examples__user-hints__layered__reverseEdge
 * 图: 8 节点 / 6 边 / 0 层级块
 * 差分: 坐标级 (1:1 ELK 对齐)
 */

describe('elkt 生成: examples__user-hints__layered__reverseEdge', () => {
  const HIERARCHY: Record<number, number[]> = {"0":[1,2,3],"4":[5,6,7]}
  const EDGE_IDX: [number, number | null, string | null, number, number | null, string | null][] = [[1,null,null,2,null,null],[2,null,null,3,null,null],[3,null,null,1,null,null],[5,null,null,6,null,null],[6,null,null,7,null,null],[7,null,null,5,null,null]]
  const EDGE_YO: boolean[] = [false,false,false,false,false,false]
  const EDGE_LABELS: { text: string; width: number; height: number; placement: string | null }[][] = [[],[],[],[],[],[]]
  const DIMS: [number, number][] = [[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30]]
  const NAMES: string[] = ["outer1","outer1.n1","outer1.n2","outer1.n3","outer2","outer2.n1","outer2.n2","outer2.n3"]
  const PORT_IDS: string[] = []
  const PORT_CONSTRAINTS: (string | null)[] = [null,null,null,null,null,null,null,null]
  const NODE_PORTS: { id: string; x: number; y: number; w: number; h: number; side: string | null; index: number | null; borderOffset: number | null; labels: { text: string; x: number; y: number; width: number; height: number }[] }[][] = [[],[],[],[],[],[],[],[]]
  const NODE_ACTIVATE: boolean[] = [false,false,false,false,false,false,false,false]
  const NODE_LABELS: { text: string; width: number; height: number; placement: string | null }[][] = [[],[{"text":"1","width":0,"height":0,"placement":null}],[{"text":"2","width":0,"height":0,"placement":null}],[{"text":"3","width":0,"height":0,"placement":null}],[],[{"text":"1","width":0,"height":0,"placement":null}],[{"text":"2","width":0,"height":0,"placement":null}],[{"text":"3","width":0,"height":0,"placement":null}]]
  const LABEL_PAD: ({ top: number; left: number; right: number; bottom: number } | null)[] = [{"top":12,"bottom":12,"left":12,"right":12},null,null,null,{"top":12,"bottom":12,"left":12,"right":12},null,null,null]
  const NODE_OPTS: [string, unknown][][] = [[],[],[],[],[],[],[],[]]

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
      n.setProperty(MODEL_ORDER_KEY, i)
      if (PORT_CONSTRAINTS[i]) {
        n.setProperty(PORT_CONSTRAINTS_KEY, PORT_CONSTRAINTS[i] as any)
      }
      for (const [k, v] of NODE_OPTS[i]) {
        n.setProperty(k, v as any)
      }
      for (const portDesc of NODE_PORTS[i]) {
        const port = new LPort()
        port.setNode(n)
        port.getPosition().x = portDesc.x
        port.getPosition().y = portDesc.y
        port.size = { x: portDesc.w, y: portDesc.h }
        if (portDesc.side) port.setSide(portDesc.side as any)
        if (portDesc.index !== null) port.setProperty(PORT_INDEX_KEY, portDesc.index)
        if (portDesc.borderOffset !== null) port.setProperty(PORT_BORDER_OFFSET_KEY, portDesc.borderOffset)
        if (portDesc.labels.length > 0) {
          port.setLabels(portDesc.labels.map((l) => ({ text: l.text, position: { x: l.x, y: l.y }, size: { x: l.width, y: l.height } })))
        }
      }
      if (NODE_ACTIVATE[i]) {
        n.setProperty(INSIDE_SELF_LOOPS_ACTIVATE_KEY, true)
      }
      if (NODE_LABELS[i].length > 0) {
        n.setLabels(NODE_LABELS[i].map((l) => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })))
      }
      nodeOf.set(i, n)
      graphNodes.push(n)
    }
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      const parent = nodeOf.get(p)!
      const nested = nestedGraphs.get(p)!
      parent.setNestedGraph(nested)
      nested.setParentNode(parent)
      // ★ 容器节点 label 占位 (SSOT: LABEL_PAD[i] = 子图 padding.top, 对齐 buildLGraphFromParsed)
      if (LABEL_PAD[p] !== undefined && LABEL_PAD[p] !== null) nested.setPadding(LABEL_PAD[p])
      // ★ 节点级 mergeEdges → 嵌套图 (ELK createLGraph copyProperties; LGraphUtil.createPort 读图属性)
      if (NODE_OPTS[p]?.some(([k]) => k === 'org.eclipse.elk.layered.mergeEdges')) nested.setProperty(MERGE_EDGES_KEY, true)
    }
    __mergeEdges = false
    __defaultSide = PortSide.EAST
    if (__mergeEdges) graph.setProperty(MERGE_EDGES_KEY, true)
    // 边所在图 (LCA) 的 MERGE_EDGES (ELK ElkGraphImporter 源侧读边所在图; 目标侧读目标节点所在图).
    const __parentOf = new Map<number, number>()
    for (const [__p, __kids] of Object.entries(HIERARCHY)) for (const __k of __kids) __parentOf.set(__k, Number(__p))
    const __lcaMerge = (a: number, b: number): boolean => {
      const seen = new Set<number>()
      let x: number | undefined = a
      while (x !== undefined) { seen.add(x); x = __parentOf.get(x) }
      let y: number | undefined = b
      while (y !== undefined && !seen.has(y)) y = __parentOf.get(y)
      if (y === undefined) return graph.getProperty(MERGE_EDGES_KEY) === true
      const __py = __parentOf.get(y)
      const __g = __py === undefined ? graph : nestedGraphs.get(__py)!
      return __g.getProperty(MERGE_EDGES_KEY) === true
    }
    EDGE_IDX.forEach(([s, sp, , t, tp], ei) => {
      const __srcMerge = __lcaMerge(s, t)
      const __tgtMerge = nodeOf.get(t)!.getGraph()?.getProperty(MERGE_EDGES_KEY) === true
      const e = createSimpleEdge(nodeOf.get(s)!, nodeOf.get(t)!, sp, tp, __srcMerge, __tgtMerge)
      e.setProperty(MODEL_ORDER_KEY, ei)
      if (EDGE_YO[ei]) e.setProperty(INSIDE_SELF_LOOPS_YO_KEY, true)
      for (const l of EDGE_LABELS[ei]) {
        e.getLabels().push({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })
      }
    })
    if (Object.keys(HIERARCHY).length > 0) {
      graph.setProperty(HIERARCHY_HANDLING_KEY, 'INCLUDE_CHILDREN')
    }
    graph.setProperty(DIRECTION_KEY, 'RIGHT')
    graph.setProperty('org.eclipse.elk.algorithm', "layered")
    graph.setProperty('org.eclipse.elk.randomSeed', 1)

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

  it('坐标级差分: 与 jar 0.12.0 1:1 对齐', () => {
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
      n.setProperty(MODEL_ORDER_KEY, i)
      if (PORT_CONSTRAINTS[i]) {
        n.setProperty(PORT_CONSTRAINTS_KEY, PORT_CONSTRAINTS[i] as any)
      }
      for (const [k, v] of NODE_OPTS[i]) {
        n.setProperty(k, v as any)
      }
      for (const portDesc of NODE_PORTS[i]) {
        const port = new LPort()
        port.setNode(n)
        port.getPosition().x = portDesc.x
        port.getPosition().y = portDesc.y
        port.size = { x: portDesc.w, y: portDesc.h }
        if (portDesc.side) port.setSide(portDesc.side as any)
        if (portDesc.index !== null) port.setProperty(PORT_INDEX_KEY, portDesc.index)
        if (portDesc.borderOffset !== null) port.setProperty(PORT_BORDER_OFFSET_KEY, portDesc.borderOffset)
        if (portDesc.labels.length > 0) {
          port.setLabels(portDesc.labels.map((l) => ({ text: l.text, position: { x: l.x, y: l.y }, size: { x: l.width, y: l.height } })))
        }
      }
      if (NODE_ACTIVATE[i]) {
        n.setProperty(INSIDE_SELF_LOOPS_ACTIVATE_KEY, true)
      }
      if (NODE_LABELS[i].length > 0) {
        n.setLabels(NODE_LABELS[i].map((l) => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })))
      }
      nodeOf.set(i, n)
    }
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      const parent = nodeOf.get(p)!
      const nested = nestedGraphs.get(p)!
      parent.setNestedGraph(nested)
      nested.setParentNode(parent)
      // ★ 容器节点 label 占位 (SSOT: LABEL_PAD[i] = 子图 padding.top, 对齐 buildLGraphFromParsed)
      if (LABEL_PAD[p] !== undefined && LABEL_PAD[p] !== null) nested.setPadding(LABEL_PAD[p])
      // ★ 节点级 mergeEdges → 嵌套图 (ELK createLGraph copyProperties; LGraphUtil.createPort 读图属性)
      if (NODE_OPTS[p]?.some(([k]) => k === 'org.eclipse.elk.layered.mergeEdges')) nested.setProperty(MERGE_EDGES_KEY, true)
    }
    __mergeEdges = false
    __defaultSide = PortSide.EAST
    if (__mergeEdges) graph.setProperty(MERGE_EDGES_KEY, true)
    // 边所在图 (LCA) 的 MERGE_EDGES (ELK ElkGraphImporter 源侧读边所在图; 目标侧读目标节点所在图).
    const __parentOf = new Map<number, number>()
    for (const [__p, __kids] of Object.entries(HIERARCHY)) for (const __k of __kids) __parentOf.set(__k, Number(__p))
    const __lcaMerge = (a: number, b: number): boolean => {
      const seen = new Set<number>()
      let x: number | undefined = a
      while (x !== undefined) { seen.add(x); x = __parentOf.get(x) }
      let y: number | undefined = b
      while (y !== undefined && !seen.has(y)) y = __parentOf.get(y)
      if (y === undefined) return graph.getProperty(MERGE_EDGES_KEY) === true
      const __py = __parentOf.get(y)
      const __g = __py === undefined ? graph : nestedGraphs.get(__py)!
      return __g.getProperty(MERGE_EDGES_KEY) === true
    }
    EDGE_IDX.forEach(([s, sp, , t, tp], ei) => {
      const __srcMerge = __lcaMerge(s, t)
      const __tgtMerge = nodeOf.get(t)!.getGraph()?.getProperty(MERGE_EDGES_KEY) === true
      const e = createSimpleEdge(nodeOf.get(s)!, nodeOf.get(t)!, sp, tp, __srcMerge, __tgtMerge)
      e.setProperty(MODEL_ORDER_KEY, ei)
      if (EDGE_YO[ei]) e.setProperty(INSIDE_SELF_LOOPS_YO_KEY, true)
      for (const l of EDGE_LABELS[ei]) {
        e.getLabels().push({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })
      }
    })
    if (Object.keys(HIERARCHY).length > 0) {
      graph.setProperty(HIERARCHY_HANDLING_KEY, 'INCLUDE_CHILDREN')
    }
    graph.setProperty(DIRECTION_KEY, 'RIGHT')
    graph.setProperty('org.eclipse.elk.algorithm', "layered")
    graph.setProperty('org.eclipse.elk.randomSeed', 1)

    new LayeredLayoutProvider().layout(graph)

    if (false) {
      for (const n of nodeOf.values()) {
        expect(Number.isFinite(n.position.x)).toBe(true)
        expect(Number.isFinite(n.position.y)).toBe(true)
      }
      return
    }

    // L1 (M3): 与 ELK Java 0.12.0 jar oracle 坐标级差分 (容差 ε = 2).
    // oracle 坐标相对父块 (jar getX/getY); ggn 子图节点坐标同样相对父 → 直接对比, 无需世界坐标累加.
    const oracle = JSON.parse(readFileSync(new URL('../../../test-resources/jar-oracle/examples__user-hints__layered__reverseEdge.json', import.meta.url), 'utf8'))
    expect(oracle.hash, 'jar oracle 过期/缺失, 请重跑 node scripts/generate-jar-oracle.mjs').toBe('1c6f13bc348528eb')
    // ELK 类加载顺序变体 (EdgeMain vs BatchMain): oracle.variants 记录另一变体, 任一匹配即通过.
    const variants = oracle.variants ?? []
    for (let i = 0; i < DIMS.length; i++) {
      const gn = nodeOf.get(i)!
      const nm = 'N' + NAMES[i]
      const cands = [oracle.coords[nm], ...variants.map((v) => v.coords[nm])].filter(Boolean)
      expect(cands.length, nm + ' 缺少 jar oracle 坐标').toBeGreaterThan(0)
      const bestX = Math.min(...cands.map((c) => Math.abs(gn.position.x - c.x)))
      const bestY = Math.min(...cands.map((c) => Math.abs(gn.position.y - c.y)))
      expect(bestX, nm + ' x').toBeLessThanOrEqual(2)
      expect(bestY, nm + ' y').toBeLessThanOrEqual(2)
    }
  })
})

/**
 * elkt 生成: examples__user-hints__layered__horizontalOrder
 * 图: 12 节点 / 6 边 / 0 层级块
 * 差分: 坐标级 (1:1 ELK 对齐)
 */

describe('elkt 生成: examples__user-hints__layered__horizontalOrder', () => {
  const HIERARCHY: Record<number, number[]> = {"0":[1,2,3],"4":[5,6,7],"8":[9,10,11]}
  const EDGE_IDX: [number, number | null, string | null, number, number | null, string | null][] = [[1,null,null,2,null,null],[2,null,null,3,null,null],[5,null,null,6,null,null],[6,null,null,7,null,null],[9,null,null,10,null,null],[10,null,null,11,null,null]]
  const EDGE_YO: boolean[] = [false,false,false,false,false,false]
  const EDGE_LABELS: { text: string; width: number; height: number; placement: string | null }[][] = [[],[],[],[],[],[]]
  const DIMS: [number, number][] = [[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30]]
  const NAMES: string[] = ["default","default.n1","default.n2","default.n3","partitions","partitions.n1","partitions.n2","partitions.n3","interactive","interactive.n1","interactive.n2","interactive.n3"]
  const PORT_IDS: string[] = []
  const PORT_CONSTRAINTS: (string | null)[] = [null,null,null,null,null,null,null,null,null,null,null,null]
  const NODE_PORTS: { id: string; x: number; y: number; w: number; h: number; side: string | null; index: number | null; borderOffset: number | null; labels: { text: string; x: number; y: number; width: number; height: number }[] }[][] = [[],[],[],[],[],[],[],[],[],[],[],[]]
  const NODE_ACTIVATE: boolean[] = [false,false,false,false,false,false,false,false,false,false,false,false]
  const NODE_LABELS: { text: string; width: number; height: number; placement: string | null }[][] = [[{"text":"Default","width":43,"height":15,"placement":null}],[{"text":"1","width":0,"height":0,"placement":null}],[{"text":"2","width":0,"height":0,"placement":null}],[{"text":"3","width":0,"height":0,"placement":null}],[{"text":"Partitions","width":56,"height":15,"placement":null}],[{"text":"1","width":0,"height":0,"placement":null}],[{"text":"2","width":0,"height":0,"placement":null}],[{"text":"3","width":0,"height":0,"placement":null}],[{"text":"Interactive","width":58,"height":15,"placement":null}],[{"text":"1","width":0,"height":0,"placement":null}],[{"text":"2","width":0,"height":0,"placement":null}],[{"text":"3","width":0,"height":0,"placement":null}]]
  const LABEL_PAD: ({ top: number; left: number; right: number; bottom: number } | null)[] = [{"top":32,"bottom":12,"left":12,"right":12},null,null,null,{"top":32,"bottom":12,"left":12,"right":12},null,null,null,{"top":32,"bottom":12,"left":12,"right":12},null,null,null]
  const NODE_OPTS: [string, unknown][][] = [[["org.eclipse.elk.algorithm","layered"],["org.eclipse.elk.nodeLabels.placement",["INSIDE","V_TOP","H_CENTER"]]],[],[],[],[["org.eclipse.elk.algorithm","layered"],["org.eclipse.elk.partitioning.activate",true],["org.eclipse.elk.nodeLabels.placement",["INSIDE","V_TOP","H_CENTER"]]],[],[],[],[["org.eclipse.elk.algorithm","layered"],["org.eclipse.elk.layered.cycleBreaking.strategy","INTERACTIVE"],["org.eclipse.elk.layered.layering.strategy","INTERACTIVE"],["org.eclipse.elk.nodeLabels.placement",["INSIDE","V_TOP","H_CENTER"]]],[],[],[]]

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
      n.setProperty(MODEL_ORDER_KEY, i)
      if (PORT_CONSTRAINTS[i]) {
        n.setProperty(PORT_CONSTRAINTS_KEY, PORT_CONSTRAINTS[i] as any)
      }
      for (const [k, v] of NODE_OPTS[i]) {
        n.setProperty(k, v as any)
      }
      for (const portDesc of NODE_PORTS[i]) {
        const port = new LPort()
        port.setNode(n)
        port.getPosition().x = portDesc.x
        port.getPosition().y = portDesc.y
        port.size = { x: portDesc.w, y: portDesc.h }
        if (portDesc.side) port.setSide(portDesc.side as any)
        if (portDesc.index !== null) port.setProperty(PORT_INDEX_KEY, portDesc.index)
        if (portDesc.borderOffset !== null) port.setProperty(PORT_BORDER_OFFSET_KEY, portDesc.borderOffset)
        if (portDesc.labels.length > 0) {
          port.setLabels(portDesc.labels.map((l) => ({ text: l.text, position: { x: l.x, y: l.y }, size: { x: l.width, y: l.height } })))
        }
      }
      if (NODE_ACTIVATE[i]) {
        n.setProperty(INSIDE_SELF_LOOPS_ACTIVATE_KEY, true)
      }
      if (NODE_LABELS[i].length > 0) {
        n.setLabels(NODE_LABELS[i].map((l) => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })))
      }
      nodeOf.set(i, n)
      graphNodes.push(n)
    }
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      const parent = nodeOf.get(p)!
      const nested = nestedGraphs.get(p)!
      parent.setNestedGraph(nested)
      nested.setParentNode(parent)
      // ★ 容器节点 label 占位 (SSOT: LABEL_PAD[i] = 子图 padding.top, 对齐 buildLGraphFromParsed)
      if (LABEL_PAD[p] !== undefined && LABEL_PAD[p] !== null) nested.setPadding(LABEL_PAD[p])
      // ★ 节点级 mergeEdges → 嵌套图 (ELK createLGraph copyProperties; LGraphUtil.createPort 读图属性)
      if (NODE_OPTS[p]?.some(([k]) => k === 'org.eclipse.elk.layered.mergeEdges')) nested.setProperty(MERGE_EDGES_KEY, true)
    }
    __mergeEdges = false
    __defaultSide = PortSide.EAST
    if (__mergeEdges) graph.setProperty(MERGE_EDGES_KEY, true)
    // 边所在图 (LCA) 的 MERGE_EDGES (ELK ElkGraphImporter 源侧读边所在图; 目标侧读目标节点所在图).
    const __parentOf = new Map<number, number>()
    for (const [__p, __kids] of Object.entries(HIERARCHY)) for (const __k of __kids) __parentOf.set(__k, Number(__p))
    const __lcaMerge = (a: number, b: number): boolean => {
      const seen = new Set<number>()
      let x: number | undefined = a
      while (x !== undefined) { seen.add(x); x = __parentOf.get(x) }
      let y: number | undefined = b
      while (y !== undefined && !seen.has(y)) y = __parentOf.get(y)
      if (y === undefined) return graph.getProperty(MERGE_EDGES_KEY) === true
      const __py = __parentOf.get(y)
      const __g = __py === undefined ? graph : nestedGraphs.get(__py)!
      return __g.getProperty(MERGE_EDGES_KEY) === true
    }
    EDGE_IDX.forEach(([s, sp, , t, tp], ei) => {
      const __srcMerge = __lcaMerge(s, t)
      const __tgtMerge = nodeOf.get(t)!.getGraph()?.getProperty(MERGE_EDGES_KEY) === true
      const e = createSimpleEdge(nodeOf.get(s)!, nodeOf.get(t)!, sp, tp, __srcMerge, __tgtMerge)
      e.setProperty(MODEL_ORDER_KEY, ei)
      if (EDGE_YO[ei]) e.setProperty(INSIDE_SELF_LOOPS_YO_KEY, true)
      for (const l of EDGE_LABELS[ei]) {
        e.getLabels().push({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })
      }
    })
    if (Object.keys(HIERARCHY).length > 0) {
      graph.setProperty(HIERARCHY_HANDLING_KEY, 'INCLUDE_CHILDREN')
    }
    graph.setProperty(DIRECTION_KEY, 'RIGHT')
    graph.setProperty('org.eclipse.elk.aspectRatio', 0.1)
    graph.setProperty('org.eclipse.elk.randomSeed', 1)

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

  it('坐标级差分: 与 jar 0.12.0 1:1 对齐', () => {
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
      n.setProperty(MODEL_ORDER_KEY, i)
      if (PORT_CONSTRAINTS[i]) {
        n.setProperty(PORT_CONSTRAINTS_KEY, PORT_CONSTRAINTS[i] as any)
      }
      for (const [k, v] of NODE_OPTS[i]) {
        n.setProperty(k, v as any)
      }
      for (const portDesc of NODE_PORTS[i]) {
        const port = new LPort()
        port.setNode(n)
        port.getPosition().x = portDesc.x
        port.getPosition().y = portDesc.y
        port.size = { x: portDesc.w, y: portDesc.h }
        if (portDesc.side) port.setSide(portDesc.side as any)
        if (portDesc.index !== null) port.setProperty(PORT_INDEX_KEY, portDesc.index)
        if (portDesc.borderOffset !== null) port.setProperty(PORT_BORDER_OFFSET_KEY, portDesc.borderOffset)
        if (portDesc.labels.length > 0) {
          port.setLabels(portDesc.labels.map((l) => ({ text: l.text, position: { x: l.x, y: l.y }, size: { x: l.width, y: l.height } })))
        }
      }
      if (NODE_ACTIVATE[i]) {
        n.setProperty(INSIDE_SELF_LOOPS_ACTIVATE_KEY, true)
      }
      if (NODE_LABELS[i].length > 0) {
        n.setLabels(NODE_LABELS[i].map((l) => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })))
      }
      nodeOf.set(i, n)
    }
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      const parent = nodeOf.get(p)!
      const nested = nestedGraphs.get(p)!
      parent.setNestedGraph(nested)
      nested.setParentNode(parent)
      // ★ 容器节点 label 占位 (SSOT: LABEL_PAD[i] = 子图 padding.top, 对齐 buildLGraphFromParsed)
      if (LABEL_PAD[p] !== undefined && LABEL_PAD[p] !== null) nested.setPadding(LABEL_PAD[p])
      // ★ 节点级 mergeEdges → 嵌套图 (ELK createLGraph copyProperties; LGraphUtil.createPort 读图属性)
      if (NODE_OPTS[p]?.some(([k]) => k === 'org.eclipse.elk.layered.mergeEdges')) nested.setProperty(MERGE_EDGES_KEY, true)
    }
    __mergeEdges = false
    __defaultSide = PortSide.EAST
    if (__mergeEdges) graph.setProperty(MERGE_EDGES_KEY, true)
    // 边所在图 (LCA) 的 MERGE_EDGES (ELK ElkGraphImporter 源侧读边所在图; 目标侧读目标节点所在图).
    const __parentOf = new Map<number, number>()
    for (const [__p, __kids] of Object.entries(HIERARCHY)) for (const __k of __kids) __parentOf.set(__k, Number(__p))
    const __lcaMerge = (a: number, b: number): boolean => {
      const seen = new Set<number>()
      let x: number | undefined = a
      while (x !== undefined) { seen.add(x); x = __parentOf.get(x) }
      let y: number | undefined = b
      while (y !== undefined && !seen.has(y)) y = __parentOf.get(y)
      if (y === undefined) return graph.getProperty(MERGE_EDGES_KEY) === true
      const __py = __parentOf.get(y)
      const __g = __py === undefined ? graph : nestedGraphs.get(__py)!
      return __g.getProperty(MERGE_EDGES_KEY) === true
    }
    EDGE_IDX.forEach(([s, sp, , t, tp], ei) => {
      const __srcMerge = __lcaMerge(s, t)
      const __tgtMerge = nodeOf.get(t)!.getGraph()?.getProperty(MERGE_EDGES_KEY) === true
      const e = createSimpleEdge(nodeOf.get(s)!, nodeOf.get(t)!, sp, tp, __srcMerge, __tgtMerge)
      e.setProperty(MODEL_ORDER_KEY, ei)
      if (EDGE_YO[ei]) e.setProperty(INSIDE_SELF_LOOPS_YO_KEY, true)
      for (const l of EDGE_LABELS[ei]) {
        e.getLabels().push({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })
      }
    })
    if (Object.keys(HIERARCHY).length > 0) {
      graph.setProperty(HIERARCHY_HANDLING_KEY, 'INCLUDE_CHILDREN')
    }
    graph.setProperty(DIRECTION_KEY, 'RIGHT')
    graph.setProperty('org.eclipse.elk.aspectRatio', 0.1)
    graph.setProperty('org.eclipse.elk.randomSeed', 1)

    new LayeredLayoutProvider().layout(graph)

    if (false) {
      for (const n of nodeOf.values()) {
        expect(Number.isFinite(n.position.x)).toBe(true)
        expect(Number.isFinite(n.position.y)).toBe(true)
      }
      return
    }

    // L1 (M3): 与 ELK Java 0.12.0 jar oracle 坐标级差分 (容差 ε = 2).
    // oracle 坐标相对父块 (jar getX/getY); ggn 子图节点坐标同样相对父 → 直接对比, 无需世界坐标累加.
    const oracle = JSON.parse(readFileSync(new URL('../../../test-resources/jar-oracle/examples__user-hints__layered__horizontalOrder.json', import.meta.url), 'utf8'))
    expect(oracle.hash, 'jar oracle 过期/缺失, 请重跑 node scripts/generate-jar-oracle.mjs').toBe('58dbe9eb52631ca6')
    // ELK 类加载顺序变体 (EdgeMain vs BatchMain): oracle.variants 记录另一变体, 任一匹配即通过.
    const variants = oracle.variants ?? []
    for (let i = 0; i < DIMS.length; i++) {
      const gn = nodeOf.get(i)!
      const nm = 'N' + NAMES[i]
      const cands = [oracle.coords[nm], ...variants.map((v) => v.coords[nm])].filter(Boolean)
      expect(cands.length, nm + ' 缺少 jar oracle 坐标').toBeGreaterThan(0)
      const bestX = Math.min(...cands.map((c) => Math.abs(gn.position.x - c.x)))
      const bestY = Math.min(...cands.map((c) => Math.abs(gn.position.y - c.y)))
      expect(bestX, nm + ' x').toBeLessThanOrEqual(2)
      expect(bestY, nm + ' y').toBeLessThanOrEqual(2)
    }
  })
})

/**
 * elkt 生成: examples__user-hints__layered__partitioning
 * 图: 24 节点 / 28 边 / 0 层级块
 * 差分: 坐标级 (1:1 ELK 对齐)
 */

describe('elkt 生成: examples__user-hints__layered__partitioning', () => {
  const HIERARCHY: Record<number, number[]> = {"0":[1,2,3,4,5,6,7,8,9,10,11],"12":[13,14,15,16,17,18,19,20,21,22,23]}
  const EDGE_IDX: [number, number | null, string | null, number, number | null, string | null][] = [[1,null,null,6,null,null],[2,null,null,7,null,null],[2,null,null,10,null,null],[3,null,null,7,null,null],[3,null,null,8,null,null],[4,null,null,10,null,null],[5,null,null,10,null,null],[5,null,null,9,null,null],[6,null,null,11,null,null],[7,null,null,10,null,null],[7,null,null,11,null,null],[8,null,null,10,null,null],[9,null,null,11,null,null],[10,null,null,11,null,null],[13,null,null,18,null,null],[14,null,null,19,null,null],[14,null,null,22,null,null],[15,null,null,19,null,null],[15,null,null,20,null,null],[16,null,null,22,null,null],[17,null,null,22,null,null],[17,null,null,21,null,null],[18,null,null,23,null,null],[19,null,null,22,null,null],[19,null,null,23,null,null],[20,null,null,22,null,null],[21,null,null,23,null,null],[22,null,null,23,null,null]]
  const EDGE_YO: boolean[] = [false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false]
  const EDGE_LABELS: { text: string; width: number; height: number; placement: string | null }[][] = [[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[]]
  const DIMS: [number, number][] = [[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30]]
  const NAMES: string[] = ["default","default.n11","default.n12","default.n13","default.n14","default.n15","default.n21","default.n22","default.n23","default.n24","default.n31","default.n41","partioning","partioning.n11","partioning.n12","partioning.n13","partioning.n14","partioning.n15","partioning.n21","partioning.n22","partioning.n23","partioning.n24","partioning.n31","partioning.n41"]
  const PORT_IDS: string[] = []
  const PORT_CONSTRAINTS: (string | null)[] = [null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]
  const NODE_PORTS: { id: string; x: number; y: number; w: number; h: number; side: string | null; index: number | null; borderOffset: number | null; labels: { text: string; x: number; y: number; width: number; height: number }[] }[][] = [[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[]]
  const NODE_ACTIVATE: boolean[] = [false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false]
  const NODE_LABELS: { text: string; width: number; height: number; placement: string | null }[][] = [[{"text":"Default","width":43,"height":15,"placement":null}],[{"text":"N11","width":24,"height":16,"placement":null}],[{"text":"N12","width":24,"height":16,"placement":null}],[{"text":"N13","width":24,"height":16,"placement":null}],[{"text":"N14","width":24,"height":16,"placement":null}],[{"text":"N15","width":24,"height":16,"placement":null}],[{"text":"N21","width":24,"height":16,"placement":null}],[{"text":"N22","width":24,"height":16,"placement":null}],[{"text":"N23","width":24,"height":16,"placement":null}],[{"text":"N24","width":24,"height":16,"placement":null}],[{"text":"N31","width":24,"height":16,"placement":null}],[{"text":"N41","width":24,"height":16,"placement":null}],[{"text":"Partitioning","width":60,"height":15,"placement":null}],[{"text":"N11","width":24,"height":16,"placement":null}],[{"text":"N12","width":24,"height":16,"placement":null}],[{"text":"N13","width":24,"height":16,"placement":null}],[{"text":"N14","width":24,"height":16,"placement":null}],[{"text":"N15","width":24,"height":16,"placement":null}],[{"text":"N21","width":24,"height":16,"placement":null}],[{"text":"N22","width":24,"height":16,"placement":null}],[{"text":"N23","width":24,"height":16,"placement":null}],[{"text":"N24","width":24,"height":16,"placement":null}],[{"text":"N31","width":24,"height":16,"placement":null}],[{"text":"N41","width":24,"height":16,"placement":null}]]
  const LABEL_PAD: ({ top: number; left: number; right: number; bottom: number } | null)[] = [{"top":32,"bottom":12,"left":12,"right":12},null,null,null,null,null,null,null,null,null,null,null,{"top":32,"bottom":12,"left":12,"right":12},null,null,null,null,null,null,null,null,null,null,null]
  const NODE_OPTS: [string, unknown][][] = [[["org.eclipse.elk.algorithm","layered"],["org.eclipse.elk.direction","DOWN"],["org.eclipse.elk.nodeLabels.placement",["H_CENTER","V_TOP","INSIDE"]],["org.eclipse.elk.nodeSize.constraints",["NODE_LABELS"]]],[["org.eclipse.elk.nodeLabels.placement",["H_CENTER","V_CENTER","INSIDE"]]],[["org.eclipse.elk.nodeLabels.placement",["H_CENTER","V_CENTER","INSIDE"]]],[["org.eclipse.elk.nodeLabels.placement",["H_CENTER","V_CENTER","INSIDE"]]],[["org.eclipse.elk.nodeLabels.placement",["H_CENTER","V_CENTER","INSIDE"]]],[["org.eclipse.elk.nodeLabels.placement",["H_CENTER","V_CENTER","INSIDE"]]],[["org.eclipse.elk.nodeLabels.placement",["H_CENTER","V_CENTER","INSIDE"]]],[["org.eclipse.elk.nodeLabels.placement",["H_CENTER","V_CENTER","INSIDE"]]],[["org.eclipse.elk.nodeLabels.placement",["H_CENTER","V_CENTER","INSIDE"]]],[["org.eclipse.elk.nodeLabels.placement",["H_CENTER","V_CENTER","INSIDE"]]],[["org.eclipse.elk.nodeLabels.placement",["H_CENTER","V_CENTER","INSIDE"]]],[["org.eclipse.elk.nodeLabels.placement",["H_CENTER","V_CENTER","INSIDE"]]],[["org.eclipse.elk.algorithm","layered"],["org.eclipse.elk.direction","DOWN"],["org.eclipse.elk.nodeLabels.placement",["H_CENTER","V_TOP","INSIDE"]],["org.eclipse.elk.nodeSize.constraints",["NODE_LABELS"]],["org.eclipse.elk.partitioning.activate",true]],[["org.eclipse.elk.partitioning.partition",1],["org.eclipse.elk.nodeLabels.placement",["H_CENTER","V_CENTER","INSIDE"]]],[["org.eclipse.elk.partitioning.partition",1],["org.eclipse.elk.nodeLabels.placement",["H_CENTER","V_CENTER","INSIDE"]]],[["org.eclipse.elk.partitioning.partition",1],["org.eclipse.elk.nodeLabels.placement",["H_CENTER","V_CENTER","INSIDE"]]],[["org.eclipse.elk.partitioning.partition",1],["org.eclipse.elk.nodeLabels.placement",["H_CENTER","V_CENTER","INSIDE"]]],[["org.eclipse.elk.partitioning.partition",1],["org.eclipse.elk.nodeLabels.placement",["H_CENTER","V_CENTER","INSIDE"]]],[["org.eclipse.elk.partitioning.partition",2],["org.eclipse.elk.nodeLabels.placement",["H_CENTER","V_CENTER","INSIDE"]]],[["org.eclipse.elk.partitioning.partition",2],["org.eclipse.elk.nodeLabels.placement",["H_CENTER","V_CENTER","INSIDE"]]],[["org.eclipse.elk.partitioning.partition",2],["org.eclipse.elk.nodeLabels.placement",["H_CENTER","V_CENTER","INSIDE"]]],[["org.eclipse.elk.partitioning.partition",2],["org.eclipse.elk.nodeLabels.placement",["H_CENTER","V_CENTER","INSIDE"]]],[["org.eclipse.elk.partitioning.partition",3],["org.eclipse.elk.nodeLabels.placement",["H_CENTER","V_CENTER","INSIDE"]]],[["org.eclipse.elk.partitioning.partition",4],["org.eclipse.elk.nodeLabels.placement",["H_CENTER","V_CENTER","INSIDE"]]]]

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
      n.setProperty(MODEL_ORDER_KEY, i)
      if (PORT_CONSTRAINTS[i]) {
        n.setProperty(PORT_CONSTRAINTS_KEY, PORT_CONSTRAINTS[i] as any)
      }
      for (const [k, v] of NODE_OPTS[i]) {
        n.setProperty(k, v as any)
      }
      for (const portDesc of NODE_PORTS[i]) {
        const port = new LPort()
        port.setNode(n)
        port.getPosition().x = portDesc.x
        port.getPosition().y = portDesc.y
        port.size = { x: portDesc.w, y: portDesc.h }
        if (portDesc.side) port.setSide(portDesc.side as any)
        if (portDesc.index !== null) port.setProperty(PORT_INDEX_KEY, portDesc.index)
        if (portDesc.borderOffset !== null) port.setProperty(PORT_BORDER_OFFSET_KEY, portDesc.borderOffset)
        if (portDesc.labels.length > 0) {
          port.setLabels(portDesc.labels.map((l) => ({ text: l.text, position: { x: l.x, y: l.y }, size: { x: l.width, y: l.height } })))
        }
      }
      if (NODE_ACTIVATE[i]) {
        n.setProperty(INSIDE_SELF_LOOPS_ACTIVATE_KEY, true)
      }
      if (NODE_LABELS[i].length > 0) {
        n.setLabels(NODE_LABELS[i].map((l) => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })))
      }
      nodeOf.set(i, n)
      graphNodes.push(n)
    }
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      const parent = nodeOf.get(p)!
      const nested = nestedGraphs.get(p)!
      parent.setNestedGraph(nested)
      nested.setParentNode(parent)
      // ★ 容器节点 label 占位 (SSOT: LABEL_PAD[i] = 子图 padding.top, 对齐 buildLGraphFromParsed)
      if (LABEL_PAD[p] !== undefined && LABEL_PAD[p] !== null) nested.setPadding(LABEL_PAD[p])
      // ★ 节点级 mergeEdges → 嵌套图 (ELK createLGraph copyProperties; LGraphUtil.createPort 读图属性)
      if (NODE_OPTS[p]?.some(([k]) => k === 'org.eclipse.elk.layered.mergeEdges')) nested.setProperty(MERGE_EDGES_KEY, true)
    }
    __mergeEdges = false
    __defaultSide = PortSide.EAST
    if (__mergeEdges) graph.setProperty(MERGE_EDGES_KEY, true)
    // 边所在图 (LCA) 的 MERGE_EDGES (ELK ElkGraphImporter 源侧读边所在图; 目标侧读目标节点所在图).
    const __parentOf = new Map<number, number>()
    for (const [__p, __kids] of Object.entries(HIERARCHY)) for (const __k of __kids) __parentOf.set(__k, Number(__p))
    const __lcaMerge = (a: number, b: number): boolean => {
      const seen = new Set<number>()
      let x: number | undefined = a
      while (x !== undefined) { seen.add(x); x = __parentOf.get(x) }
      let y: number | undefined = b
      while (y !== undefined && !seen.has(y)) y = __parentOf.get(y)
      if (y === undefined) return graph.getProperty(MERGE_EDGES_KEY) === true
      const __py = __parentOf.get(y)
      const __g = __py === undefined ? graph : nestedGraphs.get(__py)!
      return __g.getProperty(MERGE_EDGES_KEY) === true
    }
    EDGE_IDX.forEach(([s, sp, , t, tp], ei) => {
      const __srcMerge = __lcaMerge(s, t)
      const __tgtMerge = nodeOf.get(t)!.getGraph()?.getProperty(MERGE_EDGES_KEY) === true
      const e = createSimpleEdge(nodeOf.get(s)!, nodeOf.get(t)!, sp, tp, __srcMerge, __tgtMerge)
      e.setProperty(MODEL_ORDER_KEY, ei)
      if (EDGE_YO[ei]) e.setProperty(INSIDE_SELF_LOOPS_YO_KEY, true)
      for (const l of EDGE_LABELS[ei]) {
        e.getLabels().push({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })
      }
    })
    if (Object.keys(HIERARCHY).length > 0) {
      graph.setProperty(HIERARCHY_HANDLING_KEY, 'INCLUDE_CHILDREN')
    }
    graph.setProperty(DIRECTION_KEY, 'RIGHT')
    graph.setProperty('org.eclipse.elk.layered.considerModelOrder.components', "MODEL_ORDER")
    graph.setProperty('org.eclipse.elk.randomSeed', 1)

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

  it('坐标级差分: 与 jar 0.12.0 1:1 对齐', () => {
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
      n.setProperty(MODEL_ORDER_KEY, i)
      if (PORT_CONSTRAINTS[i]) {
        n.setProperty(PORT_CONSTRAINTS_KEY, PORT_CONSTRAINTS[i] as any)
      }
      for (const [k, v] of NODE_OPTS[i]) {
        n.setProperty(k, v as any)
      }
      for (const portDesc of NODE_PORTS[i]) {
        const port = new LPort()
        port.setNode(n)
        port.getPosition().x = portDesc.x
        port.getPosition().y = portDesc.y
        port.size = { x: portDesc.w, y: portDesc.h }
        if (portDesc.side) port.setSide(portDesc.side as any)
        if (portDesc.index !== null) port.setProperty(PORT_INDEX_KEY, portDesc.index)
        if (portDesc.borderOffset !== null) port.setProperty(PORT_BORDER_OFFSET_KEY, portDesc.borderOffset)
        if (portDesc.labels.length > 0) {
          port.setLabels(portDesc.labels.map((l) => ({ text: l.text, position: { x: l.x, y: l.y }, size: { x: l.width, y: l.height } })))
        }
      }
      if (NODE_ACTIVATE[i]) {
        n.setProperty(INSIDE_SELF_LOOPS_ACTIVATE_KEY, true)
      }
      if (NODE_LABELS[i].length > 0) {
        n.setLabels(NODE_LABELS[i].map((l) => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })))
      }
      nodeOf.set(i, n)
    }
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      const parent = nodeOf.get(p)!
      const nested = nestedGraphs.get(p)!
      parent.setNestedGraph(nested)
      nested.setParentNode(parent)
      // ★ 容器节点 label 占位 (SSOT: LABEL_PAD[i] = 子图 padding.top, 对齐 buildLGraphFromParsed)
      if (LABEL_PAD[p] !== undefined && LABEL_PAD[p] !== null) nested.setPadding(LABEL_PAD[p])
      // ★ 节点级 mergeEdges → 嵌套图 (ELK createLGraph copyProperties; LGraphUtil.createPort 读图属性)
      if (NODE_OPTS[p]?.some(([k]) => k === 'org.eclipse.elk.layered.mergeEdges')) nested.setProperty(MERGE_EDGES_KEY, true)
    }
    __mergeEdges = false
    __defaultSide = PortSide.EAST
    if (__mergeEdges) graph.setProperty(MERGE_EDGES_KEY, true)
    // 边所在图 (LCA) 的 MERGE_EDGES (ELK ElkGraphImporter 源侧读边所在图; 目标侧读目标节点所在图).
    const __parentOf = new Map<number, number>()
    for (const [__p, __kids] of Object.entries(HIERARCHY)) for (const __k of __kids) __parentOf.set(__k, Number(__p))
    const __lcaMerge = (a: number, b: number): boolean => {
      const seen = new Set<number>()
      let x: number | undefined = a
      while (x !== undefined) { seen.add(x); x = __parentOf.get(x) }
      let y: number | undefined = b
      while (y !== undefined && !seen.has(y)) y = __parentOf.get(y)
      if (y === undefined) return graph.getProperty(MERGE_EDGES_KEY) === true
      const __py = __parentOf.get(y)
      const __g = __py === undefined ? graph : nestedGraphs.get(__py)!
      return __g.getProperty(MERGE_EDGES_KEY) === true
    }
    EDGE_IDX.forEach(([s, sp, , t, tp], ei) => {
      const __srcMerge = __lcaMerge(s, t)
      const __tgtMerge = nodeOf.get(t)!.getGraph()?.getProperty(MERGE_EDGES_KEY) === true
      const e = createSimpleEdge(nodeOf.get(s)!, nodeOf.get(t)!, sp, tp, __srcMerge, __tgtMerge)
      e.setProperty(MODEL_ORDER_KEY, ei)
      if (EDGE_YO[ei]) e.setProperty(INSIDE_SELF_LOOPS_YO_KEY, true)
      for (const l of EDGE_LABELS[ei]) {
        e.getLabels().push({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })
      }
    })
    if (Object.keys(HIERARCHY).length > 0) {
      graph.setProperty(HIERARCHY_HANDLING_KEY, 'INCLUDE_CHILDREN')
    }
    graph.setProperty(DIRECTION_KEY, 'RIGHT')
    graph.setProperty('org.eclipse.elk.layered.considerModelOrder.components', "MODEL_ORDER")
    graph.setProperty('org.eclipse.elk.randomSeed', 1)

    new LayeredLayoutProvider().layout(graph)

    if (false) {
      for (const n of nodeOf.values()) {
        expect(Number.isFinite(n.position.x)).toBe(true)
        expect(Number.isFinite(n.position.y)).toBe(true)
      }
      return
    }

    // L1 (M3): 与 ELK Java 0.12.0 jar oracle 坐标级差分 (容差 ε = 2).
    // oracle 坐标相对父块 (jar getX/getY); ggn 子图节点坐标同样相对父 → 直接对比, 无需世界坐标累加.
    const oracle = JSON.parse(readFileSync(new URL('../../../test-resources/jar-oracle/examples__user-hints__layered__partitioning.json', import.meta.url), 'utf8'))
    expect(oracle.hash, 'jar oracle 过期/缺失, 请重跑 node scripts/generate-jar-oracle.mjs').toBe('46e33e04ac5a88c8')
    // ELK 类加载顺序变体 (EdgeMain vs BatchMain): oracle.variants 记录另一变体, 任一匹配即通过.
    const variants = oracle.variants ?? []
    for (let i = 0; i < DIMS.length; i++) {
      const gn = nodeOf.get(i)!
      const nm = 'N' + NAMES[i]
      const cands = [oracle.coords[nm], ...variants.map((v) => v.coords[nm])].filter(Boolean)
      expect(cands.length, nm + ' 缺少 jar oracle 坐标').toBeGreaterThan(0)
      const bestX = Math.min(...cands.map((c) => Math.abs(gn.position.x - c.x)))
      const bestY = Math.min(...cands.map((c) => Math.abs(gn.position.y - c.y)))
      expect(bestX, nm + ' x').toBeLessThanOrEqual(2)
      expect(bestY, nm + ' y').toBeLessThanOrEqual(2)
    }
  })
})

/**
 * elkt 生成: examples__labels__portLabelsMulti
 * 图: 2 节点 / 0 边 / 0 层级块
 * 差分: 坐标级 (1:1 ELK 对齐)
 */

describe('elkt 生成: examples__labels__portLabelsMulti', () => {
  const HIERARCHY: Record<number, number[]> = {}
  const EDGE_IDX: [number, number | null, string | null, number, number | null, string | null][] = []
  const EDGE_YO: boolean[] = []
  const EDGE_LABELS: { text: string; width: number; height: number; placement: string | null }[][] = []
  const DIMS: [number, number][] = [[170,180],[80,80]]
  const NAMES: string[] = ["Inside","Outside"]
  const PORT_IDS: string[] = ["west1","west2","east1","east2"]
  const PORT_CONSTRAINTS: (string | null)[] = ["FIXED_SIDE","FIXED_SIDE"]
  const NODE_PORTS: { id: string; x: number; y: number; w: number; h: number; side: string | null; index: number | null; borderOffset: number | null; labels: { text: string; x: number; y: number; width: number; height: number }[] }[][] = [[{"id":"west1","x":0,"y":0,"w":15,"h":15,"side":"WEST","index":null,"borderOffset":null,"labels":[]},{"id":"west2","x":0,"y":0,"w":23,"h":15,"side":"WEST","index":null,"borderOffset":null,"labels":[]},{"id":"east1","x":0,"y":0,"w":23,"h":15,"side":"EAST","index":null,"borderOffset":null,"labels":[]},{"id":"east2","x":0,"y":0,"w":23,"h":15,"side":"EAST","index":null,"borderOffset":null,"labels":[]}],[{"id":"west1","x":0,"y":0,"w":15,"h":15,"side":"WEST","index":null,"borderOffset":null,"labels":[]},{"id":"west2","x":0,"y":0,"w":23,"h":15,"side":"WEST","index":null,"borderOffset":null,"labels":[]},{"id":"east1","x":0,"y":0,"w":23,"h":15,"side":"EAST","index":null,"borderOffset":null,"labels":[]},{"id":"east2","x":0,"y":0,"w":23,"h":15,"side":"EAST","index":null,"borderOffset":null,"labels":[]}]]
  const NODE_ACTIVATE: boolean[] = [false,false]
  const NODE_LABELS: { text: string; width: number; height: number; placement: string | null }[][] = [[],[]]
  const LABEL_PAD: ({ top: number; left: number; right: number; bottom: number } | null)[] = [null,null]
  const NODE_OPTS: [string, unknown][][] = [[["org.eclipse.elk.nodeLabels.placement",["H_CENTER","V_BOTTOM","OUTSIDE"]],["org.eclipse.elk.portLabels.placement",["INSIDE"]]],[["org.eclipse.elk.nodeLabels.placement",["H_CENTER","V_BOTTOM","OUTSIDE"]],["org.eclipse.elk.portLabels.placement",["OUTSIDE"]]]]

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
      n.setProperty(MODEL_ORDER_KEY, i)
      if (PORT_CONSTRAINTS[i]) {
        n.setProperty(PORT_CONSTRAINTS_KEY, PORT_CONSTRAINTS[i] as any)
      }
      for (const [k, v] of NODE_OPTS[i]) {
        n.setProperty(k, v as any)
      }
      for (const portDesc of NODE_PORTS[i]) {
        const port = new LPort()
        port.setNode(n)
        port.getPosition().x = portDesc.x
        port.getPosition().y = portDesc.y
        port.size = { x: portDesc.w, y: portDesc.h }
        if (portDesc.side) port.setSide(portDesc.side as any)
        if (portDesc.index !== null) port.setProperty(PORT_INDEX_KEY, portDesc.index)
        if (portDesc.borderOffset !== null) port.setProperty(PORT_BORDER_OFFSET_KEY, portDesc.borderOffset)
        if (portDesc.labels.length > 0) {
          port.setLabels(portDesc.labels.map((l) => ({ text: l.text, position: { x: l.x, y: l.y }, size: { x: l.width, y: l.height } })))
        }
      }
      if (NODE_ACTIVATE[i]) {
        n.setProperty(INSIDE_SELF_LOOPS_ACTIVATE_KEY, true)
      }
      if (NODE_LABELS[i].length > 0) {
        n.setLabels(NODE_LABELS[i].map((l) => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })))
      }
      nodeOf.set(i, n)
      graphNodes.push(n)
    }
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      const parent = nodeOf.get(p)!
      const nested = nestedGraphs.get(p)!
      parent.setNestedGraph(nested)
      nested.setParentNode(parent)
      // ★ 容器节点 label 占位 (SSOT: LABEL_PAD[i] = 子图 padding.top, 对齐 buildLGraphFromParsed)
      if (LABEL_PAD[p] !== undefined && LABEL_PAD[p] !== null) nested.setPadding(LABEL_PAD[p])
      // ★ 节点级 mergeEdges → 嵌套图 (ELK createLGraph copyProperties; LGraphUtil.createPort 读图属性)
      if (NODE_OPTS[p]?.some(([k]) => k === 'org.eclipse.elk.layered.mergeEdges')) nested.setProperty(MERGE_EDGES_KEY, true)
    }
    __mergeEdges = false
    __defaultSide = PortSide.EAST
    if (__mergeEdges) graph.setProperty(MERGE_EDGES_KEY, true)
    // 边所在图 (LCA) 的 MERGE_EDGES (ELK ElkGraphImporter 源侧读边所在图; 目标侧读目标节点所在图).
    const __parentOf = new Map<number, number>()
    for (const [__p, __kids] of Object.entries(HIERARCHY)) for (const __k of __kids) __parentOf.set(__k, Number(__p))
    const __lcaMerge = (a: number, b: number): boolean => {
      const seen = new Set<number>()
      let x: number | undefined = a
      while (x !== undefined) { seen.add(x); x = __parentOf.get(x) }
      let y: number | undefined = b
      while (y !== undefined && !seen.has(y)) y = __parentOf.get(y)
      if (y === undefined) return graph.getProperty(MERGE_EDGES_KEY) === true
      const __py = __parentOf.get(y)
      const __g = __py === undefined ? graph : nestedGraphs.get(__py)!
      return __g.getProperty(MERGE_EDGES_KEY) === true
    }
    EDGE_IDX.forEach(([s, sp, , t, tp], ei) => {
      const __srcMerge = __lcaMerge(s, t)
      const __tgtMerge = nodeOf.get(t)!.getGraph()?.getProperty(MERGE_EDGES_KEY) === true
      const e = createSimpleEdge(nodeOf.get(s)!, nodeOf.get(t)!, sp, tp, __srcMerge, __tgtMerge)
      e.setProperty(MODEL_ORDER_KEY, ei)
      if (EDGE_YO[ei]) e.setProperty(INSIDE_SELF_LOOPS_YO_KEY, true)
      for (const l of EDGE_LABELS[ei]) {
        e.getLabels().push({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })
      }
    })
    if (Object.keys(HIERARCHY).length > 0) {
      graph.setProperty(HIERARCHY_HANDLING_KEY, 'INCLUDE_CHILDREN')
    }
    graph.setProperty(DIRECTION_KEY, 'RIGHT')
    graph.setProperty('org.eclipse.elk.spacing.labelPortHorizontal', 10)
    graph.setProperty('org.eclipse.elk.randomSeed', 1)

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

  it('坐标级差分: 与 jar 0.12.0 1:1 对齐', () => {
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
      n.setProperty(MODEL_ORDER_KEY, i)
      if (PORT_CONSTRAINTS[i]) {
        n.setProperty(PORT_CONSTRAINTS_KEY, PORT_CONSTRAINTS[i] as any)
      }
      for (const [k, v] of NODE_OPTS[i]) {
        n.setProperty(k, v as any)
      }
      for (const portDesc of NODE_PORTS[i]) {
        const port = new LPort()
        port.setNode(n)
        port.getPosition().x = portDesc.x
        port.getPosition().y = portDesc.y
        port.size = { x: portDesc.w, y: portDesc.h }
        if (portDesc.side) port.setSide(portDesc.side as any)
        if (portDesc.index !== null) port.setProperty(PORT_INDEX_KEY, portDesc.index)
        if (portDesc.borderOffset !== null) port.setProperty(PORT_BORDER_OFFSET_KEY, portDesc.borderOffset)
        if (portDesc.labels.length > 0) {
          port.setLabels(portDesc.labels.map((l) => ({ text: l.text, position: { x: l.x, y: l.y }, size: { x: l.width, y: l.height } })))
        }
      }
      if (NODE_ACTIVATE[i]) {
        n.setProperty(INSIDE_SELF_LOOPS_ACTIVATE_KEY, true)
      }
      if (NODE_LABELS[i].length > 0) {
        n.setLabels(NODE_LABELS[i].map((l) => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })))
      }
      nodeOf.set(i, n)
    }
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      const parent = nodeOf.get(p)!
      const nested = nestedGraphs.get(p)!
      parent.setNestedGraph(nested)
      nested.setParentNode(parent)
      // ★ 容器节点 label 占位 (SSOT: LABEL_PAD[i] = 子图 padding.top, 对齐 buildLGraphFromParsed)
      if (LABEL_PAD[p] !== undefined && LABEL_PAD[p] !== null) nested.setPadding(LABEL_PAD[p])
      // ★ 节点级 mergeEdges → 嵌套图 (ELK createLGraph copyProperties; LGraphUtil.createPort 读图属性)
      if (NODE_OPTS[p]?.some(([k]) => k === 'org.eclipse.elk.layered.mergeEdges')) nested.setProperty(MERGE_EDGES_KEY, true)
    }
    __mergeEdges = false
    __defaultSide = PortSide.EAST
    if (__mergeEdges) graph.setProperty(MERGE_EDGES_KEY, true)
    // 边所在图 (LCA) 的 MERGE_EDGES (ELK ElkGraphImporter 源侧读边所在图; 目标侧读目标节点所在图).
    const __parentOf = new Map<number, number>()
    for (const [__p, __kids] of Object.entries(HIERARCHY)) for (const __k of __kids) __parentOf.set(__k, Number(__p))
    const __lcaMerge = (a: number, b: number): boolean => {
      const seen = new Set<number>()
      let x: number | undefined = a
      while (x !== undefined) { seen.add(x); x = __parentOf.get(x) }
      let y: number | undefined = b
      while (y !== undefined && !seen.has(y)) y = __parentOf.get(y)
      if (y === undefined) return graph.getProperty(MERGE_EDGES_KEY) === true
      const __py = __parentOf.get(y)
      const __g = __py === undefined ? graph : nestedGraphs.get(__py)!
      return __g.getProperty(MERGE_EDGES_KEY) === true
    }
    EDGE_IDX.forEach(([s, sp, , t, tp], ei) => {
      const __srcMerge = __lcaMerge(s, t)
      const __tgtMerge = nodeOf.get(t)!.getGraph()?.getProperty(MERGE_EDGES_KEY) === true
      const e = createSimpleEdge(nodeOf.get(s)!, nodeOf.get(t)!, sp, tp, __srcMerge, __tgtMerge)
      e.setProperty(MODEL_ORDER_KEY, ei)
      if (EDGE_YO[ei]) e.setProperty(INSIDE_SELF_LOOPS_YO_KEY, true)
      for (const l of EDGE_LABELS[ei]) {
        e.getLabels().push({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })
      }
    })
    if (Object.keys(HIERARCHY).length > 0) {
      graph.setProperty(HIERARCHY_HANDLING_KEY, 'INCLUDE_CHILDREN')
    }
    graph.setProperty(DIRECTION_KEY, 'RIGHT')
    graph.setProperty('org.eclipse.elk.spacing.labelPortHorizontal', 10)
    graph.setProperty('org.eclipse.elk.randomSeed', 1)

    new LayeredLayoutProvider().layout(graph)

    if (false) {
      for (const n of nodeOf.values()) {
        expect(Number.isFinite(n.position.x)).toBe(true)
        expect(Number.isFinite(n.position.y)).toBe(true)
      }
      return
    }

    // L1 (M3): 与 ELK Java 0.12.0 jar oracle 坐标级差分 (容差 ε = 2).
    // oracle 坐标相对父块 (jar getX/getY); ggn 子图节点坐标同样相对父 → 直接对比, 无需世界坐标累加.
    const oracle = JSON.parse(readFileSync(new URL('../../../test-resources/jar-oracle/examples__labels__portLabelsMulti.json', import.meta.url), 'utf8'))
    expect(oracle.hash, 'jar oracle 过期/缺失, 请重跑 node scripts/generate-jar-oracle.mjs').toBe('287b59cc5d9bc597')
    // ELK 类加载顺序变体 (EdgeMain vs BatchMain): oracle.variants 记录另一变体, 任一匹配即通过.
    const variants = oracle.variants ?? []
    for (let i = 0; i < DIMS.length; i++) {
      const gn = nodeOf.get(i)!
      const nm = 'N' + NAMES[i]
      const cands = [oracle.coords[nm], ...variants.map((v) => v.coords[nm])].filter(Boolean)
      expect(cands.length, nm + ' 缺少 jar oracle 坐标').toBeGreaterThan(0)
      const bestX = Math.min(...cands.map((c) => Math.abs(gn.position.x - c.x)))
      const bestY = Math.min(...cands.map((c) => Math.abs(gn.position.y - c.y)))
      expect(bestX, nm + ' x').toBeLessThanOrEqual(2)
      expect(bestY, nm + ' y').toBeLessThanOrEqual(2)
    }
  })
})

/**
 * elkt 生成: examples__labels__nodeLabelPlacement
 * 图: 8 节点 / 0 边 / 0 层级块
 * 差分: 坐标级 (1:1 ELK 对齐)
 */

describe('elkt 生成: examples__labels__nodeLabelPlacement', () => {
  const HIERARCHY: Record<number, number[]> = {"1":[2,3,4],"5":[6,7]}
  const EDGE_IDX: [number, number | null, string | null, number, number | null, string | null][] = []
  const EDGE_YO: boolean[] = []
  const EDGE_LABELS: { text: string; width: number; height: number; placement: string | null }[][] = []
  const DIMS: [number, number][] = [[200,75],[60,30],[100,75],[100,75],[100,75],[60,30],[100,75],[100,75]]
  const NAMES: string[] = ["N1","Outside","Outside.N2","Outside.N3","Outside.N4","Inside","Inside.N5","Inside.N6"]
  const PORT_IDS: string[] = []
  const PORT_CONSTRAINTS: (string | null)[] = [null,null,null,null,null,null,null,null]
  const NODE_PORTS: { id: string; x: number; y: number; w: number; h: number; side: string | null; index: number | null; borderOffset: number | null; labels: { text: string; x: number; y: number; width: number; height: number }[] }[][] = [[],[],[],[],[],[],[],[]]
  const NODE_ACTIVATE: boolean[] = [false,false,false,false,false,false,false,false]
  const NODE_LABELS: { text: string; width: number; height: number; placement: string | null }[][] = [[{"text":"Main Node Label","width":100,"height":15,"placement":"INSIDE V_TOP H_CENTER"},{"text":"Second Node Label","width":117,"height":15,"placement":"INSIDE V_TOP H_CENTER"},{"text":"Value: 42","width":56,"height":15,"placement":"INSIDE V_BOTTOM H_LEFT"},{"text":"New Value: 73","width":88,"height":15,"placement":"INSIDE V_BOTTOM H_RIGHT"}],[],[{"text":"N2","width":17,"height":15,"placement":null}],[{"text":"N3","width":17,"height":15,"placement":null}],[{"text":"N4","width":17,"height":15,"placement":null}],[],[{"text":"N5","width":17,"height":15,"placement":null}],[{"text":"N6","width":17,"height":15,"placement":null}]]
  const LABEL_PAD: ({ top: number; left: number; right: number; bottom: number } | null)[] = [null,{"top":12,"bottom":12,"left":12,"right":12},null,null,null,{"top":12,"bottom":12,"left":12,"right":12},null,null]
  const NODE_OPTS: [string, unknown][][] = [[],[["org.eclipse.elk.aspectRatio",3]],[["org.eclipse.elk.nodeLabels.placement",["OUTSIDE","V_TOP","H_LEFT"]]],[["org.eclipse.elk.nodeLabels.placement",["OUTSIDE","V_TOP","H_CENTER"]]],[["org.eclipse.elk.nodeLabels.placement",["OUTSIDE","H_PRIORITY","V_TOP","H_LEFT"]]],[["org.eclipse.elk.aspectRatio",3]],[["org.eclipse.elk.nodeLabels.placement",["INSIDE","V_TOP","H_LEFT"]]],[["org.eclipse.elk.nodeLabels.placement",["INSIDE","V_TOP","H_CENTER"]]]]

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
      n.setProperty(MODEL_ORDER_KEY, i)
      if (PORT_CONSTRAINTS[i]) {
        n.setProperty(PORT_CONSTRAINTS_KEY, PORT_CONSTRAINTS[i] as any)
      }
      for (const [k, v] of NODE_OPTS[i]) {
        n.setProperty(k, v as any)
      }
      for (const portDesc of NODE_PORTS[i]) {
        const port = new LPort()
        port.setNode(n)
        port.getPosition().x = portDesc.x
        port.getPosition().y = portDesc.y
        port.size = { x: portDesc.w, y: portDesc.h }
        if (portDesc.side) port.setSide(portDesc.side as any)
        if (portDesc.index !== null) port.setProperty(PORT_INDEX_KEY, portDesc.index)
        if (portDesc.borderOffset !== null) port.setProperty(PORT_BORDER_OFFSET_KEY, portDesc.borderOffset)
        if (portDesc.labels.length > 0) {
          port.setLabels(portDesc.labels.map((l) => ({ text: l.text, position: { x: l.x, y: l.y }, size: { x: l.width, y: l.height } })))
        }
      }
      if (NODE_ACTIVATE[i]) {
        n.setProperty(INSIDE_SELF_LOOPS_ACTIVATE_KEY, true)
      }
      if (NODE_LABELS[i].length > 0) {
        n.setLabels(NODE_LABELS[i].map((l) => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })))
      }
      nodeOf.set(i, n)
      graphNodes.push(n)
    }
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      const parent = nodeOf.get(p)!
      const nested = nestedGraphs.get(p)!
      parent.setNestedGraph(nested)
      nested.setParentNode(parent)
      // ★ 容器节点 label 占位 (SSOT: LABEL_PAD[i] = 子图 padding.top, 对齐 buildLGraphFromParsed)
      if (LABEL_PAD[p] !== undefined && LABEL_PAD[p] !== null) nested.setPadding(LABEL_PAD[p])
      // ★ 节点级 mergeEdges → 嵌套图 (ELK createLGraph copyProperties; LGraphUtil.createPort 读图属性)
      if (NODE_OPTS[p]?.some(([k]) => k === 'org.eclipse.elk.layered.mergeEdges')) nested.setProperty(MERGE_EDGES_KEY, true)
    }
    __mergeEdges = false
    __defaultSide = PortSide.EAST
    if (__mergeEdges) graph.setProperty(MERGE_EDGES_KEY, true)
    // 边所在图 (LCA) 的 MERGE_EDGES (ELK ElkGraphImporter 源侧读边所在图; 目标侧读目标节点所在图).
    const __parentOf = new Map<number, number>()
    for (const [__p, __kids] of Object.entries(HIERARCHY)) for (const __k of __kids) __parentOf.set(__k, Number(__p))
    const __lcaMerge = (a: number, b: number): boolean => {
      const seen = new Set<number>()
      let x: number | undefined = a
      while (x !== undefined) { seen.add(x); x = __parentOf.get(x) }
      let y: number | undefined = b
      while (y !== undefined && !seen.has(y)) y = __parentOf.get(y)
      if (y === undefined) return graph.getProperty(MERGE_EDGES_KEY) === true
      const __py = __parentOf.get(y)
      const __g = __py === undefined ? graph : nestedGraphs.get(__py)!
      return __g.getProperty(MERGE_EDGES_KEY) === true
    }
    EDGE_IDX.forEach(([s, sp, , t, tp], ei) => {
      const __srcMerge = __lcaMerge(s, t)
      const __tgtMerge = nodeOf.get(t)!.getGraph()?.getProperty(MERGE_EDGES_KEY) === true
      const e = createSimpleEdge(nodeOf.get(s)!, nodeOf.get(t)!, sp, tp, __srcMerge, __tgtMerge)
      e.setProperty(MODEL_ORDER_KEY, ei)
      if (EDGE_YO[ei]) e.setProperty(INSIDE_SELF_LOOPS_YO_KEY, true)
      for (const l of EDGE_LABELS[ei]) {
        e.getLabels().push({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })
      }
    })
    if (Object.keys(HIERARCHY).length > 0) {
      graph.setProperty(HIERARCHY_HANDLING_KEY, 'INCLUDE_CHILDREN')
    }
    graph.setProperty(DIRECTION_KEY, 'RIGHT')
    graph.setProperty('org.eclipse.elk.aspectRatio', 0.1)
    graph.setProperty('org.eclipse.elk.randomSeed', 1)

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

  it('坐标级差分: 与 jar 0.12.0 1:1 对齐', () => {
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
      n.setProperty(MODEL_ORDER_KEY, i)
      if (PORT_CONSTRAINTS[i]) {
        n.setProperty(PORT_CONSTRAINTS_KEY, PORT_CONSTRAINTS[i] as any)
      }
      for (const [k, v] of NODE_OPTS[i]) {
        n.setProperty(k, v as any)
      }
      for (const portDesc of NODE_PORTS[i]) {
        const port = new LPort()
        port.setNode(n)
        port.getPosition().x = portDesc.x
        port.getPosition().y = portDesc.y
        port.size = { x: portDesc.w, y: portDesc.h }
        if (portDesc.side) port.setSide(portDesc.side as any)
        if (portDesc.index !== null) port.setProperty(PORT_INDEX_KEY, portDesc.index)
        if (portDesc.borderOffset !== null) port.setProperty(PORT_BORDER_OFFSET_KEY, portDesc.borderOffset)
        if (portDesc.labels.length > 0) {
          port.setLabels(portDesc.labels.map((l) => ({ text: l.text, position: { x: l.x, y: l.y }, size: { x: l.width, y: l.height } })))
        }
      }
      if (NODE_ACTIVATE[i]) {
        n.setProperty(INSIDE_SELF_LOOPS_ACTIVATE_KEY, true)
      }
      if (NODE_LABELS[i].length > 0) {
        n.setLabels(NODE_LABELS[i].map((l) => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })))
      }
      nodeOf.set(i, n)
    }
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      const parent = nodeOf.get(p)!
      const nested = nestedGraphs.get(p)!
      parent.setNestedGraph(nested)
      nested.setParentNode(parent)
      // ★ 容器节点 label 占位 (SSOT: LABEL_PAD[i] = 子图 padding.top, 对齐 buildLGraphFromParsed)
      if (LABEL_PAD[p] !== undefined && LABEL_PAD[p] !== null) nested.setPadding(LABEL_PAD[p])
      // ★ 节点级 mergeEdges → 嵌套图 (ELK createLGraph copyProperties; LGraphUtil.createPort 读图属性)
      if (NODE_OPTS[p]?.some(([k]) => k === 'org.eclipse.elk.layered.mergeEdges')) nested.setProperty(MERGE_EDGES_KEY, true)
    }
    __mergeEdges = false
    __defaultSide = PortSide.EAST
    if (__mergeEdges) graph.setProperty(MERGE_EDGES_KEY, true)
    // 边所在图 (LCA) 的 MERGE_EDGES (ELK ElkGraphImporter 源侧读边所在图; 目标侧读目标节点所在图).
    const __parentOf = new Map<number, number>()
    for (const [__p, __kids] of Object.entries(HIERARCHY)) for (const __k of __kids) __parentOf.set(__k, Number(__p))
    const __lcaMerge = (a: number, b: number): boolean => {
      const seen = new Set<number>()
      let x: number | undefined = a
      while (x !== undefined) { seen.add(x); x = __parentOf.get(x) }
      let y: number | undefined = b
      while (y !== undefined && !seen.has(y)) y = __parentOf.get(y)
      if (y === undefined) return graph.getProperty(MERGE_EDGES_KEY) === true
      const __py = __parentOf.get(y)
      const __g = __py === undefined ? graph : nestedGraphs.get(__py)!
      return __g.getProperty(MERGE_EDGES_KEY) === true
    }
    EDGE_IDX.forEach(([s, sp, , t, tp], ei) => {
      const __srcMerge = __lcaMerge(s, t)
      const __tgtMerge = nodeOf.get(t)!.getGraph()?.getProperty(MERGE_EDGES_KEY) === true
      const e = createSimpleEdge(nodeOf.get(s)!, nodeOf.get(t)!, sp, tp, __srcMerge, __tgtMerge)
      e.setProperty(MODEL_ORDER_KEY, ei)
      if (EDGE_YO[ei]) e.setProperty(INSIDE_SELF_LOOPS_YO_KEY, true)
      for (const l of EDGE_LABELS[ei]) {
        e.getLabels().push({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })
      }
    })
    if (Object.keys(HIERARCHY).length > 0) {
      graph.setProperty(HIERARCHY_HANDLING_KEY, 'INCLUDE_CHILDREN')
    }
    graph.setProperty(DIRECTION_KEY, 'RIGHT')
    graph.setProperty('org.eclipse.elk.aspectRatio', 0.1)
    graph.setProperty('org.eclipse.elk.randomSeed', 1)

    new LayeredLayoutProvider().layout(graph)

    if (false) {
      for (const n of nodeOf.values()) {
        expect(Number.isFinite(n.position.x)).toBe(true)
        expect(Number.isFinite(n.position.y)).toBe(true)
      }
      return
    }

    // L1 (M3): 与 ELK Java 0.12.0 jar oracle 坐标级差分 (容差 ε = 2).
    // oracle 坐标相对父块 (jar getX/getY); ggn 子图节点坐标同样相对父 → 直接对比, 无需世界坐标累加.
    const oracle = JSON.parse(readFileSync(new URL('../../../test-resources/jar-oracle/examples__labels__nodeLabelPlacement.json', import.meta.url), 'utf8'))
    expect(oracle.hash, 'jar oracle 过期/缺失, 请重跑 node scripts/generate-jar-oracle.mjs').toBe('d56d067f7fa7849a')
    // ELK 类加载顺序变体 (EdgeMain vs BatchMain): oracle.variants 记录另一变体, 任一匹配即通过.
    const variants = oracle.variants ?? []
    for (let i = 0; i < DIMS.length; i++) {
      const gn = nodeOf.get(i)!
      const nm = 'N' + NAMES[i]
      const cands = [oracle.coords[nm], ...variants.map((v) => v.coords[nm])].filter(Boolean)
      expect(cands.length, nm + ' 缺少 jar oracle 坐标').toBeGreaterThan(0)
      const bestX = Math.min(...cands.map((c) => Math.abs(gn.position.x - c.x)))
      const bestY = Math.min(...cands.map((c) => Math.abs(gn.position.y - c.y)))
      expect(bestX, nm + ' x').toBeLessThanOrEqual(2)
      expect(bestY, nm + ' y').toBeLessThanOrEqual(2)
    }
  })
})

/**
 * elkt 生成: examples__general__direction
 * 图: 12 节点 / 4 边 / 0 层级块
 * 差分: 坐标级 (1:1 ELK 对齐)
 */

describe('elkt 生成: examples__general__direction', () => {
  const HIERARCHY: Record<number, number[]> = {"0":[1,2],"3":[4,5],"6":[7,8],"9":[10,11]}
  const EDGE_IDX: [number, number | null, string | null, number, number | null, string | null][] = [[1,null,null,2,null,null],[4,null,null,5,null,null],[7,null,null,8,null,null],[10,null,null,11,null,null]]
  const EDGE_YO: boolean[] = [false,false,false,false]
  const EDGE_LABELS: { text: string; width: number; height: number; placement: string | null }[][] = [[],[],[],[]]
  const DIMS: [number, number][] = [[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30]]
  const NAMES: string[] = ["leftToRight","leftToRight.n1","leftToRight.n2","topToBottom","topToBottom.n1","topToBottom.n2","rightToLeft","rightToLeft.n1","rightToLeft.n2","bottomToTop","bottomToTop.n1","bottomToTop.n2"]
  const PORT_IDS: string[] = []
  const PORT_CONSTRAINTS: (string | null)[] = [null,null,null,null,null,null,null,null,null,null,null,null]
  const NODE_PORTS: { id: string; x: number; y: number; w: number; h: number; side: string | null; index: number | null; borderOffset: number | null; labels: { text: string; x: number; y: number; width: number; height: number }[] }[][] = [[],[],[],[],[],[],[],[],[],[],[],[]]
  const NODE_ACTIVATE: boolean[] = [false,false,false,false,false,false,false,false,false,false,false,false]
  const NODE_LABELS: { text: string; width: number; height: number; placement: string | null }[][] = [[{"text":"leftToRight","width":0,"height":0,"placement":null}],[],[],[{"text":"topToBottom","width":0,"height":0,"placement":null}],[],[],[{"text":"rightToLeft","width":0,"height":0,"placement":null}],[],[],[{"text":"bottomToTop","width":0,"height":0,"placement":null}],[],[]]
  const LABEL_PAD: ({ top: number; left: number; right: number; bottom: number } | null)[] = [{"top":12,"bottom":12,"left":12,"right":12},null,null,{"top":12,"bottom":12,"left":12,"right":12},null,null,{"top":12,"bottom":12,"left":12,"right":12},null,null,{"top":12,"bottom":12,"left":12,"right":12},null,null]
  const NODE_OPTS: [string, unknown][][] = [[["org.eclipse.elk.direction","RIGHT"],["org.eclipse.elk.nodeLabels.placement",["H_LEFT","V_TOP","OUTSIDE"]]],[],[],[["org.eclipse.elk.direction","DOWN"],["org.eclipse.elk.nodeLabels.placement",["H_LEFT","V_TOP","OUTSIDE"]]],[],[],[["org.eclipse.elk.direction","LEFT"],["org.eclipse.elk.nodeLabels.placement",["H_LEFT","V_TOP","OUTSIDE"]]],[],[],[["org.eclipse.elk.direction","UP"],["org.eclipse.elk.nodeLabels.placement",["H_LEFT","V_TOP","OUTSIDE"]]],[],[]]

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
      n.setProperty(MODEL_ORDER_KEY, i)
      if (PORT_CONSTRAINTS[i]) {
        n.setProperty(PORT_CONSTRAINTS_KEY, PORT_CONSTRAINTS[i] as any)
      }
      for (const [k, v] of NODE_OPTS[i]) {
        n.setProperty(k, v as any)
      }
      for (const portDesc of NODE_PORTS[i]) {
        const port = new LPort()
        port.setNode(n)
        port.getPosition().x = portDesc.x
        port.getPosition().y = portDesc.y
        port.size = { x: portDesc.w, y: portDesc.h }
        if (portDesc.side) port.setSide(portDesc.side as any)
        if (portDesc.index !== null) port.setProperty(PORT_INDEX_KEY, portDesc.index)
        if (portDesc.borderOffset !== null) port.setProperty(PORT_BORDER_OFFSET_KEY, portDesc.borderOffset)
        if (portDesc.labels.length > 0) {
          port.setLabels(portDesc.labels.map((l) => ({ text: l.text, position: { x: l.x, y: l.y }, size: { x: l.width, y: l.height } })))
        }
      }
      if (NODE_ACTIVATE[i]) {
        n.setProperty(INSIDE_SELF_LOOPS_ACTIVATE_KEY, true)
      }
      if (NODE_LABELS[i].length > 0) {
        n.setLabels(NODE_LABELS[i].map((l) => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })))
      }
      nodeOf.set(i, n)
      graphNodes.push(n)
    }
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      const parent = nodeOf.get(p)!
      const nested = nestedGraphs.get(p)!
      parent.setNestedGraph(nested)
      nested.setParentNode(parent)
      // ★ 容器节点 label 占位 (SSOT: LABEL_PAD[i] = 子图 padding.top, 对齐 buildLGraphFromParsed)
      if (LABEL_PAD[p] !== undefined && LABEL_PAD[p] !== null) nested.setPadding(LABEL_PAD[p])
      // ★ 节点级 mergeEdges → 嵌套图 (ELK createLGraph copyProperties; LGraphUtil.createPort 读图属性)
      if (NODE_OPTS[p]?.some(([k]) => k === 'org.eclipse.elk.layered.mergeEdges')) nested.setProperty(MERGE_EDGES_KEY, true)
    }
    __mergeEdges = false
    __defaultSide = PortSide.EAST
    if (__mergeEdges) graph.setProperty(MERGE_EDGES_KEY, true)
    // 边所在图 (LCA) 的 MERGE_EDGES (ELK ElkGraphImporter 源侧读边所在图; 目标侧读目标节点所在图).
    const __parentOf = new Map<number, number>()
    for (const [__p, __kids] of Object.entries(HIERARCHY)) for (const __k of __kids) __parentOf.set(__k, Number(__p))
    const __lcaMerge = (a: number, b: number): boolean => {
      const seen = new Set<number>()
      let x: number | undefined = a
      while (x !== undefined) { seen.add(x); x = __parentOf.get(x) }
      let y: number | undefined = b
      while (y !== undefined && !seen.has(y)) y = __parentOf.get(y)
      if (y === undefined) return graph.getProperty(MERGE_EDGES_KEY) === true
      const __py = __parentOf.get(y)
      const __g = __py === undefined ? graph : nestedGraphs.get(__py)!
      return __g.getProperty(MERGE_EDGES_KEY) === true
    }
    EDGE_IDX.forEach(([s, sp, , t, tp], ei) => {
      const __srcMerge = __lcaMerge(s, t)
      const __tgtMerge = nodeOf.get(t)!.getGraph()?.getProperty(MERGE_EDGES_KEY) === true
      const e = createSimpleEdge(nodeOf.get(s)!, nodeOf.get(t)!, sp, tp, __srcMerge, __tgtMerge)
      e.setProperty(MODEL_ORDER_KEY, ei)
      if (EDGE_YO[ei]) e.setProperty(INSIDE_SELF_LOOPS_YO_KEY, true)
      for (const l of EDGE_LABELS[ei]) {
        e.getLabels().push({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })
      }
    })
    if (Object.keys(HIERARCHY).length > 0) {
      graph.setProperty(HIERARCHY_HANDLING_KEY, 'INCLUDE_CHILDREN')
    }
    graph.setProperty(DIRECTION_KEY, 'RIGHT')
    graph.setProperty('org.eclipse.elk.randomSeed', 1)

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

  it('坐标级差分: 与 jar 0.12.0 1:1 对齐', () => {
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
      n.setProperty(MODEL_ORDER_KEY, i)
      if (PORT_CONSTRAINTS[i]) {
        n.setProperty(PORT_CONSTRAINTS_KEY, PORT_CONSTRAINTS[i] as any)
      }
      for (const [k, v] of NODE_OPTS[i]) {
        n.setProperty(k, v as any)
      }
      for (const portDesc of NODE_PORTS[i]) {
        const port = new LPort()
        port.setNode(n)
        port.getPosition().x = portDesc.x
        port.getPosition().y = portDesc.y
        port.size = { x: portDesc.w, y: portDesc.h }
        if (portDesc.side) port.setSide(portDesc.side as any)
        if (portDesc.index !== null) port.setProperty(PORT_INDEX_KEY, portDesc.index)
        if (portDesc.borderOffset !== null) port.setProperty(PORT_BORDER_OFFSET_KEY, portDesc.borderOffset)
        if (portDesc.labels.length > 0) {
          port.setLabels(portDesc.labels.map((l) => ({ text: l.text, position: { x: l.x, y: l.y }, size: { x: l.width, y: l.height } })))
        }
      }
      if (NODE_ACTIVATE[i]) {
        n.setProperty(INSIDE_SELF_LOOPS_ACTIVATE_KEY, true)
      }
      if (NODE_LABELS[i].length > 0) {
        n.setLabels(NODE_LABELS[i].map((l) => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })))
      }
      nodeOf.set(i, n)
    }
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      const parent = nodeOf.get(p)!
      const nested = nestedGraphs.get(p)!
      parent.setNestedGraph(nested)
      nested.setParentNode(parent)
      // ★ 容器节点 label 占位 (SSOT: LABEL_PAD[i] = 子图 padding.top, 对齐 buildLGraphFromParsed)
      if (LABEL_PAD[p] !== undefined && LABEL_PAD[p] !== null) nested.setPadding(LABEL_PAD[p])
      // ★ 节点级 mergeEdges → 嵌套图 (ELK createLGraph copyProperties; LGraphUtil.createPort 读图属性)
      if (NODE_OPTS[p]?.some(([k]) => k === 'org.eclipse.elk.layered.mergeEdges')) nested.setProperty(MERGE_EDGES_KEY, true)
    }
    __mergeEdges = false
    __defaultSide = PortSide.EAST
    if (__mergeEdges) graph.setProperty(MERGE_EDGES_KEY, true)
    // 边所在图 (LCA) 的 MERGE_EDGES (ELK ElkGraphImporter 源侧读边所在图; 目标侧读目标节点所在图).
    const __parentOf = new Map<number, number>()
    for (const [__p, __kids] of Object.entries(HIERARCHY)) for (const __k of __kids) __parentOf.set(__k, Number(__p))
    const __lcaMerge = (a: number, b: number): boolean => {
      const seen = new Set<number>()
      let x: number | undefined = a
      while (x !== undefined) { seen.add(x); x = __parentOf.get(x) }
      let y: number | undefined = b
      while (y !== undefined && !seen.has(y)) y = __parentOf.get(y)
      if (y === undefined) return graph.getProperty(MERGE_EDGES_KEY) === true
      const __py = __parentOf.get(y)
      const __g = __py === undefined ? graph : nestedGraphs.get(__py)!
      return __g.getProperty(MERGE_EDGES_KEY) === true
    }
    EDGE_IDX.forEach(([s, sp, , t, tp], ei) => {
      const __srcMerge = __lcaMerge(s, t)
      const __tgtMerge = nodeOf.get(t)!.getGraph()?.getProperty(MERGE_EDGES_KEY) === true
      const e = createSimpleEdge(nodeOf.get(s)!, nodeOf.get(t)!, sp, tp, __srcMerge, __tgtMerge)
      e.setProperty(MODEL_ORDER_KEY, ei)
      if (EDGE_YO[ei]) e.setProperty(INSIDE_SELF_LOOPS_YO_KEY, true)
      for (const l of EDGE_LABELS[ei]) {
        e.getLabels().push({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })
      }
    })
    if (Object.keys(HIERARCHY).length > 0) {
      graph.setProperty(HIERARCHY_HANDLING_KEY, 'INCLUDE_CHILDREN')
    }
    graph.setProperty(DIRECTION_KEY, 'RIGHT')
    graph.setProperty('org.eclipse.elk.randomSeed', 1)

    new LayeredLayoutProvider().layout(graph)

    if (false) {
      for (const n of nodeOf.values()) {
        expect(Number.isFinite(n.position.x)).toBe(true)
        expect(Number.isFinite(n.position.y)).toBe(true)
      }
      return
    }

    // L1 (M3): 与 ELK Java 0.12.0 jar oracle 坐标级差分 (容差 ε = 2).
    // oracle 坐标相对父块 (jar getX/getY); ggn 子图节点坐标同样相对父 → 直接对比, 无需世界坐标累加.
    const oracle = JSON.parse(readFileSync(new URL('../../../test-resources/jar-oracle/examples__general__direction.json', import.meta.url), 'utf8'))
    expect(oracle.hash, 'jar oracle 过期/缺失, 请重跑 node scripts/generate-jar-oracle.mjs').toBe('bf7308e69e0df1ae')
    // ELK 类加载顺序变体 (EdgeMain vs BatchMain): oracle.variants 记录另一变体, 任一匹配即通过.
    const variants = oracle.variants ?? []
    for (let i = 0; i < DIMS.length; i++) {
      const gn = nodeOf.get(i)!
      const nm = 'N' + NAMES[i]
      const cands = [oracle.coords[nm], ...variants.map((v) => v.coords[nm])].filter(Boolean)
      expect(cands.length, nm + ' 缺少 jar oracle 坐标').toBeGreaterThan(0)
      const bestX = Math.min(...cands.map((c) => Math.abs(gn.position.x - c.x)))
      const bestY = Math.min(...cands.map((c) => Math.abs(gn.position.y - c.y)))
      expect(bestX, nm + ' x').toBeLessThanOrEqual(2)
      expect(bestY, nm + ' y').toBeLessThanOrEqual(2)
    }
  })
})

/**
 * elkt 生成: examples__general__mixingDirection
 * 图: 7 节点 / 3 边 / 0 层级块
 * 差分: 坐标级 (1:1 ELK 对齐)
 */

describe('elkt 生成: examples__general__mixingDirection', () => {
  const HIERARCHY: Record<number, number[]> = {"0":[1,4],"1":[2,3],"4":[5,6]}
  const EDGE_IDX: [number, number | null, string | null, number, number | null, string | null][] = [[2,null,null,3,null,null],[5,null,null,6,null,null],[4,null,null,1,null,null]]
  const EDGE_YO: boolean[] = [false,false,false]
  const EDGE_LABELS: { text: string; width: number; height: number; placement: string | null }[][] = [[],[],[]]
  const DIMS: [number, number][] = [[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30]]
  const NAMES: string[] = ["outsideTopToBottom","outsideTopToBottom.leftToRight","outsideTopToBottom.leftToRight.n1","outsideTopToBottom.leftToRight.n2","outsideTopToBottom.bottomToTop","outsideTopToBottom.bottomToTop.n1","outsideTopToBottom.bottomToTop.n2"]
  const PORT_IDS: string[] = []
  const PORT_CONSTRAINTS: (string | null)[] = [null,null,null,null,null,null,null]
  const NODE_PORTS: { id: string; x: number; y: number; w: number; h: number; side: string | null; index: number | null; borderOffset: number | null; labels: { text: string; x: number; y: number; width: number; height: number }[] }[][] = [[],[],[],[],[],[],[]]
  const NODE_ACTIVATE: boolean[] = [false,false,false,false,false,false,false]
  const NODE_LABELS: { text: string; width: number; height: number; placement: string | null }[][] = [[{"text":"topToBottom","width":0,"height":0,"placement":null}],[{"text":"leftToRight","width":0,"height":0,"placement":null}],[],[],[{"text":"bottomToTop","width":0,"height":0,"placement":null}],[],[]]
  const LABEL_PAD: ({ top: number; left: number; right: number; bottom: number } | null)[] = [{"top":12,"bottom":12,"left":12,"right":12},{"top":12,"bottom":12,"left":12,"right":12},null,null,{"top":12,"bottom":12,"left":12,"right":12},null,null]
  const NODE_OPTS: [string, unknown][][] = [[["org.eclipse.elk.direction","DOWN"],["org.eclipse.elk.nodeLabels.placement",["H_LEFT","V_TOP","OUTSIDE"]]],[["org.eclipse.elk.direction","RIGHT"],["org.eclipse.elk.nodeLabels.placement",["H_LEFT","V_BOTTOM","OUTSIDE"]]],[],[],[["org.eclipse.elk.direction","UP"],["org.eclipse.elk.nodeLabels.placement",["H_LEFT","V_TOP","OUTSIDE"]]],[],[]]

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
      n.setProperty(MODEL_ORDER_KEY, i)
      if (PORT_CONSTRAINTS[i]) {
        n.setProperty(PORT_CONSTRAINTS_KEY, PORT_CONSTRAINTS[i] as any)
      }
      for (const [k, v] of NODE_OPTS[i]) {
        n.setProperty(k, v as any)
      }
      for (const portDesc of NODE_PORTS[i]) {
        const port = new LPort()
        port.setNode(n)
        port.getPosition().x = portDesc.x
        port.getPosition().y = portDesc.y
        port.size = { x: portDesc.w, y: portDesc.h }
        if (portDesc.side) port.setSide(portDesc.side as any)
        if (portDesc.index !== null) port.setProperty(PORT_INDEX_KEY, portDesc.index)
        if (portDesc.borderOffset !== null) port.setProperty(PORT_BORDER_OFFSET_KEY, portDesc.borderOffset)
        if (portDesc.labels.length > 0) {
          port.setLabels(portDesc.labels.map((l) => ({ text: l.text, position: { x: l.x, y: l.y }, size: { x: l.width, y: l.height } })))
        }
      }
      if (NODE_ACTIVATE[i]) {
        n.setProperty(INSIDE_SELF_LOOPS_ACTIVATE_KEY, true)
      }
      if (NODE_LABELS[i].length > 0) {
        n.setLabels(NODE_LABELS[i].map((l) => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })))
      }
      nodeOf.set(i, n)
      graphNodes.push(n)
    }
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      const parent = nodeOf.get(p)!
      const nested = nestedGraphs.get(p)!
      parent.setNestedGraph(nested)
      nested.setParentNode(parent)
      // ★ 容器节点 label 占位 (SSOT: LABEL_PAD[i] = 子图 padding.top, 对齐 buildLGraphFromParsed)
      if (LABEL_PAD[p] !== undefined && LABEL_PAD[p] !== null) nested.setPadding(LABEL_PAD[p])
      // ★ 节点级 mergeEdges → 嵌套图 (ELK createLGraph copyProperties; LGraphUtil.createPort 读图属性)
      if (NODE_OPTS[p]?.some(([k]) => k === 'org.eclipse.elk.layered.mergeEdges')) nested.setProperty(MERGE_EDGES_KEY, true)
    }
    __mergeEdges = false
    __defaultSide = PortSide.EAST
    if (__mergeEdges) graph.setProperty(MERGE_EDGES_KEY, true)
    // 边所在图 (LCA) 的 MERGE_EDGES (ELK ElkGraphImporter 源侧读边所在图; 目标侧读目标节点所在图).
    const __parentOf = new Map<number, number>()
    for (const [__p, __kids] of Object.entries(HIERARCHY)) for (const __k of __kids) __parentOf.set(__k, Number(__p))
    const __lcaMerge = (a: number, b: number): boolean => {
      const seen = new Set<number>()
      let x: number | undefined = a
      while (x !== undefined) { seen.add(x); x = __parentOf.get(x) }
      let y: number | undefined = b
      while (y !== undefined && !seen.has(y)) y = __parentOf.get(y)
      if (y === undefined) return graph.getProperty(MERGE_EDGES_KEY) === true
      const __py = __parentOf.get(y)
      const __g = __py === undefined ? graph : nestedGraphs.get(__py)!
      return __g.getProperty(MERGE_EDGES_KEY) === true
    }
    EDGE_IDX.forEach(([s, sp, , t, tp], ei) => {
      const __srcMerge = __lcaMerge(s, t)
      const __tgtMerge = nodeOf.get(t)!.getGraph()?.getProperty(MERGE_EDGES_KEY) === true
      const e = createSimpleEdge(nodeOf.get(s)!, nodeOf.get(t)!, sp, tp, __srcMerge, __tgtMerge)
      e.setProperty(MODEL_ORDER_KEY, ei)
      if (EDGE_YO[ei]) e.setProperty(INSIDE_SELF_LOOPS_YO_KEY, true)
      for (const l of EDGE_LABELS[ei]) {
        e.getLabels().push({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })
      }
    })
    if (Object.keys(HIERARCHY).length > 0) {
      graph.setProperty(HIERARCHY_HANDLING_KEY, 'INCLUDE_CHILDREN')
    }
    graph.setProperty(DIRECTION_KEY, 'RIGHT')
    graph.setProperty('org.eclipse.elk.randomSeed', 1)

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

  it('坐标级差分: 与 jar 0.12.0 1:1 对齐', () => {
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
      n.setProperty(MODEL_ORDER_KEY, i)
      if (PORT_CONSTRAINTS[i]) {
        n.setProperty(PORT_CONSTRAINTS_KEY, PORT_CONSTRAINTS[i] as any)
      }
      for (const [k, v] of NODE_OPTS[i]) {
        n.setProperty(k, v as any)
      }
      for (const portDesc of NODE_PORTS[i]) {
        const port = new LPort()
        port.setNode(n)
        port.getPosition().x = portDesc.x
        port.getPosition().y = portDesc.y
        port.size = { x: portDesc.w, y: portDesc.h }
        if (portDesc.side) port.setSide(portDesc.side as any)
        if (portDesc.index !== null) port.setProperty(PORT_INDEX_KEY, portDesc.index)
        if (portDesc.borderOffset !== null) port.setProperty(PORT_BORDER_OFFSET_KEY, portDesc.borderOffset)
        if (portDesc.labels.length > 0) {
          port.setLabels(portDesc.labels.map((l) => ({ text: l.text, position: { x: l.x, y: l.y }, size: { x: l.width, y: l.height } })))
        }
      }
      if (NODE_ACTIVATE[i]) {
        n.setProperty(INSIDE_SELF_LOOPS_ACTIVATE_KEY, true)
      }
      if (NODE_LABELS[i].length > 0) {
        n.setLabels(NODE_LABELS[i].map((l) => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })))
      }
      nodeOf.set(i, n)
    }
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      const parent = nodeOf.get(p)!
      const nested = nestedGraphs.get(p)!
      parent.setNestedGraph(nested)
      nested.setParentNode(parent)
      // ★ 容器节点 label 占位 (SSOT: LABEL_PAD[i] = 子图 padding.top, 对齐 buildLGraphFromParsed)
      if (LABEL_PAD[p] !== undefined && LABEL_PAD[p] !== null) nested.setPadding(LABEL_PAD[p])
      // ★ 节点级 mergeEdges → 嵌套图 (ELK createLGraph copyProperties; LGraphUtil.createPort 读图属性)
      if (NODE_OPTS[p]?.some(([k]) => k === 'org.eclipse.elk.layered.mergeEdges')) nested.setProperty(MERGE_EDGES_KEY, true)
    }
    __mergeEdges = false
    __defaultSide = PortSide.EAST
    if (__mergeEdges) graph.setProperty(MERGE_EDGES_KEY, true)
    // 边所在图 (LCA) 的 MERGE_EDGES (ELK ElkGraphImporter 源侧读边所在图; 目标侧读目标节点所在图).
    const __parentOf = new Map<number, number>()
    for (const [__p, __kids] of Object.entries(HIERARCHY)) for (const __k of __kids) __parentOf.set(__k, Number(__p))
    const __lcaMerge = (a: number, b: number): boolean => {
      const seen = new Set<number>()
      let x: number | undefined = a
      while (x !== undefined) { seen.add(x); x = __parentOf.get(x) }
      let y: number | undefined = b
      while (y !== undefined && !seen.has(y)) y = __parentOf.get(y)
      if (y === undefined) return graph.getProperty(MERGE_EDGES_KEY) === true
      const __py = __parentOf.get(y)
      const __g = __py === undefined ? graph : nestedGraphs.get(__py)!
      return __g.getProperty(MERGE_EDGES_KEY) === true
    }
    EDGE_IDX.forEach(([s, sp, , t, tp], ei) => {
      const __srcMerge = __lcaMerge(s, t)
      const __tgtMerge = nodeOf.get(t)!.getGraph()?.getProperty(MERGE_EDGES_KEY) === true
      const e = createSimpleEdge(nodeOf.get(s)!, nodeOf.get(t)!, sp, tp, __srcMerge, __tgtMerge)
      e.setProperty(MODEL_ORDER_KEY, ei)
      if (EDGE_YO[ei]) e.setProperty(INSIDE_SELF_LOOPS_YO_KEY, true)
      for (const l of EDGE_LABELS[ei]) {
        e.getLabels().push({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })
      }
    })
    if (Object.keys(HIERARCHY).length > 0) {
      graph.setProperty(HIERARCHY_HANDLING_KEY, 'INCLUDE_CHILDREN')
    }
    graph.setProperty(DIRECTION_KEY, 'RIGHT')
    graph.setProperty('org.eclipse.elk.randomSeed', 1)

    new LayeredLayoutProvider().layout(graph)

    if (false) {
      for (const n of nodeOf.values()) {
        expect(Number.isFinite(n.position.x)).toBe(true)
        expect(Number.isFinite(n.position.y)).toBe(true)
      }
      return
    }

    // L1 (M3): 与 ELK Java 0.12.0 jar oracle 坐标级差分 (容差 ε = 2).
    // oracle 坐标相对父块 (jar getX/getY); ggn 子图节点坐标同样相对父 → 直接对比, 无需世界坐标累加.
    const oracle = JSON.parse(readFileSync(new URL('../../../test-resources/jar-oracle/examples__general__mixingDirection.json', import.meta.url), 'utf8'))
    expect(oracle.hash, 'jar oracle 过期/缺失, 请重跑 node scripts/generate-jar-oracle.mjs').toBe('12ebdc1c5dbdcc0d')
    // ELK 类加载顺序变体 (EdgeMain vs BatchMain): oracle.variants 记录另一变体, 任一匹配即通过.
    const variants = oracle.variants ?? []
    for (let i = 0; i < DIMS.length; i++) {
      const gn = nodeOf.get(i)!
      const nm = 'N' + NAMES[i]
      const cands = [oracle.coords[nm], ...variants.map((v) => v.coords[nm])].filter(Boolean)
      expect(cands.length, nm + ' 缺少 jar oracle 坐标').toBeGreaterThan(0)
      const bestX = Math.min(...cands.map((c) => Math.abs(gn.position.x - c.x)))
      const bestY = Math.min(...cands.map((c) => Math.abs(gn.position.y - c.y)))
      expect(bestX, nm + ' x').toBeLessThanOrEqual(2)
      expect(bestY, nm + ' y').toBeLessThanOrEqual(2)
    }
  })
})

/**
 * elkt 生成: examples__general__spacing__nodesEdges
 * 图: 6 节点 / 7 边 / 0 层级块
 * 差分: 坐标级 (1:1 ELK 对齐)
 */

describe('elkt 生成: examples__general__spacing__nodesEdges', () => {
  const HIERARCHY: Record<number, number[]> = {}
  const EDGE_IDX: [number, number | null, string | null, number, number | null, string | null][] = [[0,null,null,4,null,null],[4,null,null,3,null,null],[4,null,null,2,null,null],[4,null,null,5,null,null],[4,null,null,5,null,null],[1,null,null,2,null,null],[3,null,null,5,null,null]]
  const EDGE_YO: boolean[] = [false,false,false,false,false,false,false]
  const EDGE_LABELS: { text: string; width: number; height: number; placement: string | null }[][] = [[],[],[],[],[],[],[]]
  const DIMS: [number, number][] = [[60,30],[60,30],[60,30],[60,30],[60,30],[60,30]]
  const NAMES: string[] = ["n1","n3","n5","n4","n2","n6"]
  const PORT_IDS: string[] = []
  const PORT_CONSTRAINTS: (string | null)[] = [null,null,null,null,null,null]
  const NODE_PORTS: { id: string; x: number; y: number; w: number; h: number; side: string | null; index: number | null; borderOffset: number | null; labels: { text: string; x: number; y: number; width: number; height: number }[] }[][] = [[],[],[],[],[],[]]
  const NODE_ACTIVATE: boolean[] = [false,false,false,false,false,false]
  const NODE_LABELS: { text: string; width: number; height: number; placement: string | null }[][] = [[{"text":"1","width":0,"height":0,"placement":null}],[{"text":"3","width":0,"height":0,"placement":null}],[{"text":"5","width":0,"height":0,"placement":null}],[{"text":"4","width":0,"height":0,"placement":null}],[{"text":"2","width":0,"height":0,"placement":null}],[{"text":"6","width":0,"height":0,"placement":null}]]
  const LABEL_PAD: ({ top: number; left: number; right: number; bottom: number } | null)[] = [null,null,null,null,null,null]
  const NODE_OPTS: [string, unknown][][] = [[],[["org.eclipse.elk.position",{"x":0,"y":100}]],[],[],[["org.eclipse.elk.position",{"x":0,"y":0}]],[]]

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
      n.setProperty(MODEL_ORDER_KEY, i)
      if (PORT_CONSTRAINTS[i]) {
        n.setProperty(PORT_CONSTRAINTS_KEY, PORT_CONSTRAINTS[i] as any)
      }
      for (const [k, v] of NODE_OPTS[i]) {
        n.setProperty(k, v as any)
      }
      for (const portDesc of NODE_PORTS[i]) {
        const port = new LPort()
        port.setNode(n)
        port.getPosition().x = portDesc.x
        port.getPosition().y = portDesc.y
        port.size = { x: portDesc.w, y: portDesc.h }
        if (portDesc.side) port.setSide(portDesc.side as any)
        if (portDesc.index !== null) port.setProperty(PORT_INDEX_KEY, portDesc.index)
        if (portDesc.borderOffset !== null) port.setProperty(PORT_BORDER_OFFSET_KEY, portDesc.borderOffset)
        if (portDesc.labels.length > 0) {
          port.setLabels(portDesc.labels.map((l) => ({ text: l.text, position: { x: l.x, y: l.y }, size: { x: l.width, y: l.height } })))
        }
      }
      if (NODE_ACTIVATE[i]) {
        n.setProperty(INSIDE_SELF_LOOPS_ACTIVATE_KEY, true)
      }
      if (NODE_LABELS[i].length > 0) {
        n.setLabels(NODE_LABELS[i].map((l) => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })))
      }
      nodeOf.set(i, n)
      graphNodes.push(n)
    }
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      const parent = nodeOf.get(p)!
      const nested = nestedGraphs.get(p)!
      parent.setNestedGraph(nested)
      nested.setParentNode(parent)
      // ★ 容器节点 label 占位 (SSOT: LABEL_PAD[i] = 子图 padding.top, 对齐 buildLGraphFromParsed)
      if (LABEL_PAD[p] !== undefined && LABEL_PAD[p] !== null) nested.setPadding(LABEL_PAD[p])
      // ★ 节点级 mergeEdges → 嵌套图 (ELK createLGraph copyProperties; LGraphUtil.createPort 读图属性)
      if (NODE_OPTS[p]?.some(([k]) => k === 'org.eclipse.elk.layered.mergeEdges')) nested.setProperty(MERGE_EDGES_KEY, true)
    }
    __mergeEdges = false
    __defaultSide = PortSide.EAST
    if (__mergeEdges) graph.setProperty(MERGE_EDGES_KEY, true)
    // 边所在图 (LCA) 的 MERGE_EDGES (ELK ElkGraphImporter 源侧读边所在图; 目标侧读目标节点所在图).
    const __parentOf = new Map<number, number>()
    for (const [__p, __kids] of Object.entries(HIERARCHY)) for (const __k of __kids) __parentOf.set(__k, Number(__p))
    const __lcaMerge = (a: number, b: number): boolean => {
      const seen = new Set<number>()
      let x: number | undefined = a
      while (x !== undefined) { seen.add(x); x = __parentOf.get(x) }
      let y: number | undefined = b
      while (y !== undefined && !seen.has(y)) y = __parentOf.get(y)
      if (y === undefined) return graph.getProperty(MERGE_EDGES_KEY) === true
      const __py = __parentOf.get(y)
      const __g = __py === undefined ? graph : nestedGraphs.get(__py)!
      return __g.getProperty(MERGE_EDGES_KEY) === true
    }
    EDGE_IDX.forEach(([s, sp, , t, tp], ei) => {
      const __srcMerge = __lcaMerge(s, t)
      const __tgtMerge = nodeOf.get(t)!.getGraph()?.getProperty(MERGE_EDGES_KEY) === true
      const e = createSimpleEdge(nodeOf.get(s)!, nodeOf.get(t)!, sp, tp, __srcMerge, __tgtMerge)
      e.setProperty(MODEL_ORDER_KEY, ei)
      if (EDGE_YO[ei]) e.setProperty(INSIDE_SELF_LOOPS_YO_KEY, true)
      for (const l of EDGE_LABELS[ei]) {
        e.getLabels().push({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })
      }
    })
    if (Object.keys(HIERARCHY).length > 0) {
      graph.setProperty(HIERARCHY_HANDLING_KEY, 'INCLUDE_CHILDREN')
    }
    graph.setProperty(DIRECTION_KEY, 'RIGHT')
    graph.setProperty('org.eclipse.elk.algorithm', "layered")
    graph.setProperty('org.eclipse.elk.layered.crossingMinimization.semiInteractive', true)
    graph.setProperty('org.eclipse.elk.layered.nodePlacement.strategy', "NETWORK_SIMPLEX")
    graph.setProperty('org.eclipse.elk.spacing.nodeNode', 70)
    graph.setProperty('org.eclipse.elk.layered.spacing.nodeNodeBetweenLayers', 25)
    graph.setProperty('org.eclipse.elk.spacing.edgeNode', 25)
    graph.setProperty('org.eclipse.elk.layered.spacing.edgeNodeBetweenLayers', 20)
    graph.setProperty('org.eclipse.elk.spacing.edgeEdge', 20)
    graph.setProperty('org.eclipse.elk.layered.spacing.edgeEdgeBetweenLayers', 15)
    graph.setProperty('org.eclipse.elk.randomSeed', 1)

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

  it('坐标级差分: 与 jar 0.12.0 1:1 对齐', () => {
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
      n.setProperty(MODEL_ORDER_KEY, i)
      if (PORT_CONSTRAINTS[i]) {
        n.setProperty(PORT_CONSTRAINTS_KEY, PORT_CONSTRAINTS[i] as any)
      }
      for (const [k, v] of NODE_OPTS[i]) {
        n.setProperty(k, v as any)
      }
      for (const portDesc of NODE_PORTS[i]) {
        const port = new LPort()
        port.setNode(n)
        port.getPosition().x = portDesc.x
        port.getPosition().y = portDesc.y
        port.size = { x: portDesc.w, y: portDesc.h }
        if (portDesc.side) port.setSide(portDesc.side as any)
        if (portDesc.index !== null) port.setProperty(PORT_INDEX_KEY, portDesc.index)
        if (portDesc.borderOffset !== null) port.setProperty(PORT_BORDER_OFFSET_KEY, portDesc.borderOffset)
        if (portDesc.labels.length > 0) {
          port.setLabels(portDesc.labels.map((l) => ({ text: l.text, position: { x: l.x, y: l.y }, size: { x: l.width, y: l.height } })))
        }
      }
      if (NODE_ACTIVATE[i]) {
        n.setProperty(INSIDE_SELF_LOOPS_ACTIVATE_KEY, true)
      }
      if (NODE_LABELS[i].length > 0) {
        n.setLabels(NODE_LABELS[i].map((l) => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })))
      }
      nodeOf.set(i, n)
    }
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      const parent = nodeOf.get(p)!
      const nested = nestedGraphs.get(p)!
      parent.setNestedGraph(nested)
      nested.setParentNode(parent)
      // ★ 容器节点 label 占位 (SSOT: LABEL_PAD[i] = 子图 padding.top, 对齐 buildLGraphFromParsed)
      if (LABEL_PAD[p] !== undefined && LABEL_PAD[p] !== null) nested.setPadding(LABEL_PAD[p])
      // ★ 节点级 mergeEdges → 嵌套图 (ELK createLGraph copyProperties; LGraphUtil.createPort 读图属性)
      if (NODE_OPTS[p]?.some(([k]) => k === 'org.eclipse.elk.layered.mergeEdges')) nested.setProperty(MERGE_EDGES_KEY, true)
    }
    __mergeEdges = false
    __defaultSide = PortSide.EAST
    if (__mergeEdges) graph.setProperty(MERGE_EDGES_KEY, true)
    // 边所在图 (LCA) 的 MERGE_EDGES (ELK ElkGraphImporter 源侧读边所在图; 目标侧读目标节点所在图).
    const __parentOf = new Map<number, number>()
    for (const [__p, __kids] of Object.entries(HIERARCHY)) for (const __k of __kids) __parentOf.set(__k, Number(__p))
    const __lcaMerge = (a: number, b: number): boolean => {
      const seen = new Set<number>()
      let x: number | undefined = a
      while (x !== undefined) { seen.add(x); x = __parentOf.get(x) }
      let y: number | undefined = b
      while (y !== undefined && !seen.has(y)) y = __parentOf.get(y)
      if (y === undefined) return graph.getProperty(MERGE_EDGES_KEY) === true
      const __py = __parentOf.get(y)
      const __g = __py === undefined ? graph : nestedGraphs.get(__py)!
      return __g.getProperty(MERGE_EDGES_KEY) === true
    }
    EDGE_IDX.forEach(([s, sp, , t, tp], ei) => {
      const __srcMerge = __lcaMerge(s, t)
      const __tgtMerge = nodeOf.get(t)!.getGraph()?.getProperty(MERGE_EDGES_KEY) === true
      const e = createSimpleEdge(nodeOf.get(s)!, nodeOf.get(t)!, sp, tp, __srcMerge, __tgtMerge)
      e.setProperty(MODEL_ORDER_KEY, ei)
      if (EDGE_YO[ei]) e.setProperty(INSIDE_SELF_LOOPS_YO_KEY, true)
      for (const l of EDGE_LABELS[ei]) {
        e.getLabels().push({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })
      }
    })
    if (Object.keys(HIERARCHY).length > 0) {
      graph.setProperty(HIERARCHY_HANDLING_KEY, 'INCLUDE_CHILDREN')
    }
    graph.setProperty(DIRECTION_KEY, 'RIGHT')
    graph.setProperty('org.eclipse.elk.algorithm', "layered")
    graph.setProperty('org.eclipse.elk.layered.crossingMinimization.semiInteractive', true)
    graph.setProperty('org.eclipse.elk.layered.nodePlacement.strategy', "NETWORK_SIMPLEX")
    graph.setProperty('org.eclipse.elk.spacing.nodeNode', 70)
    graph.setProperty('org.eclipse.elk.layered.spacing.nodeNodeBetweenLayers', 25)
    graph.setProperty('org.eclipse.elk.spacing.edgeNode', 25)
    graph.setProperty('org.eclipse.elk.layered.spacing.edgeNodeBetweenLayers', 20)
    graph.setProperty('org.eclipse.elk.spacing.edgeEdge', 20)
    graph.setProperty('org.eclipse.elk.layered.spacing.edgeEdgeBetweenLayers', 15)
    graph.setProperty('org.eclipse.elk.randomSeed', 1)

    new LayeredLayoutProvider().layout(graph)

    if (false) {
      for (const n of nodeOf.values()) {
        expect(Number.isFinite(n.position.x)).toBe(true)
        expect(Number.isFinite(n.position.y)).toBe(true)
      }
      return
    }

    // L1 (M3): 与 ELK Java 0.12.0 jar oracle 坐标级差分 (容差 ε = 2).
    // oracle 坐标相对父块 (jar getX/getY); ggn 子图节点坐标同样相对父 → 直接对比, 无需世界坐标累加.
    const oracle = JSON.parse(readFileSync(new URL('../../../test-resources/jar-oracle/examples__general__spacing__nodesEdges.json', import.meta.url), 'utf8'))
    expect(oracle.hash, 'jar oracle 过期/缺失, 请重跑 node scripts/generate-jar-oracle.mjs').toBe('3f4db9aa693217c1')
    // ELK 类加载顺序变体 (EdgeMain vs BatchMain): oracle.variants 记录另一变体, 任一匹配即通过.
    const variants = oracle.variants ?? []
    for (let i = 0; i < DIMS.length; i++) {
      const gn = nodeOf.get(i)!
      const nm = 'N' + NAMES[i]
      const cands = [oracle.coords[nm], ...variants.map((v) => v.coords[nm])].filter(Boolean)
      expect(cands.length, nm + ' 缺少 jar oracle 坐标').toBeGreaterThan(0)
      const bestX = Math.min(...cands.map((c) => Math.abs(gn.position.x - c.x)))
      const bestY = Math.min(...cands.map((c) => Math.abs(gn.position.y - c.y)))
      expect(bestX, nm + ' x').toBeLessThanOrEqual(2)
      expect(bestY, nm + ' y').toBeLessThanOrEqual(2)
    }
  })
})

/**
 * elkt 生成: examples__general__spacing__components
 * 图: 6 节点 / 3 边 / 0 层级块
 * 差分: 坐标级 (1:1 ELK 对齐)
 */

describe('elkt 生成: examples__general__spacing__components', () => {
  const HIERARCHY: Record<number, number[]> = {}
  const EDGE_IDX: [number, number | null, string | null, number, number | null, string | null][] = [[0,null,null,1,null,null],[2,null,null,3,null,null],[4,null,null,5,null,null]]
  const EDGE_YO: boolean[] = [false,false,false]
  const EDGE_LABELS: { text: string; width: number; height: number; placement: string | null }[][] = [[],[],[]]
  const DIMS: [number, number][] = [[60,30],[60,30],[60,30],[60,30],[60,30],[60,30]]
  const NAMES: string[] = ["n1","n2","n3","n4","n5","n6"]
  const PORT_IDS: string[] = []
  const PORT_CONSTRAINTS: (string | null)[] = [null,null,null,null,null,null]
  const NODE_PORTS: { id: string; x: number; y: number; w: number; h: number; side: string | null; index: number | null; borderOffset: number | null; labels: { text: string; x: number; y: number; width: number; height: number }[] }[][] = [[],[],[],[],[],[]]
  const NODE_ACTIVATE: boolean[] = [false,false,false,false,false,false]
  const NODE_LABELS: { text: string; width: number; height: number; placement: string | null }[][] = [[],[],[],[],[],[]]
  const LABEL_PAD: ({ top: number; left: number; right: number; bottom: number } | null)[] = [null,null,null,null,null,null]
  const NODE_OPTS: [string, unknown][][] = [[],[],[],[],[],[]]

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
      n.setProperty(MODEL_ORDER_KEY, i)
      if (PORT_CONSTRAINTS[i]) {
        n.setProperty(PORT_CONSTRAINTS_KEY, PORT_CONSTRAINTS[i] as any)
      }
      for (const [k, v] of NODE_OPTS[i]) {
        n.setProperty(k, v as any)
      }
      for (const portDesc of NODE_PORTS[i]) {
        const port = new LPort()
        port.setNode(n)
        port.getPosition().x = portDesc.x
        port.getPosition().y = portDesc.y
        port.size = { x: portDesc.w, y: portDesc.h }
        if (portDesc.side) port.setSide(portDesc.side as any)
        if (portDesc.index !== null) port.setProperty(PORT_INDEX_KEY, portDesc.index)
        if (portDesc.borderOffset !== null) port.setProperty(PORT_BORDER_OFFSET_KEY, portDesc.borderOffset)
        if (portDesc.labels.length > 0) {
          port.setLabels(portDesc.labels.map((l) => ({ text: l.text, position: { x: l.x, y: l.y }, size: { x: l.width, y: l.height } })))
        }
      }
      if (NODE_ACTIVATE[i]) {
        n.setProperty(INSIDE_SELF_LOOPS_ACTIVATE_KEY, true)
      }
      if (NODE_LABELS[i].length > 0) {
        n.setLabels(NODE_LABELS[i].map((l) => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })))
      }
      nodeOf.set(i, n)
      graphNodes.push(n)
    }
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      const parent = nodeOf.get(p)!
      const nested = nestedGraphs.get(p)!
      parent.setNestedGraph(nested)
      nested.setParentNode(parent)
      // ★ 容器节点 label 占位 (SSOT: LABEL_PAD[i] = 子图 padding.top, 对齐 buildLGraphFromParsed)
      if (LABEL_PAD[p] !== undefined && LABEL_PAD[p] !== null) nested.setPadding(LABEL_PAD[p])
      // ★ 节点级 mergeEdges → 嵌套图 (ELK createLGraph copyProperties; LGraphUtil.createPort 读图属性)
      if (NODE_OPTS[p]?.some(([k]) => k === 'org.eclipse.elk.layered.mergeEdges')) nested.setProperty(MERGE_EDGES_KEY, true)
    }
    __mergeEdges = false
    __defaultSide = PortSide.EAST
    if (__mergeEdges) graph.setProperty(MERGE_EDGES_KEY, true)
    // 边所在图 (LCA) 的 MERGE_EDGES (ELK ElkGraphImporter 源侧读边所在图; 目标侧读目标节点所在图).
    const __parentOf = new Map<number, number>()
    for (const [__p, __kids] of Object.entries(HIERARCHY)) for (const __k of __kids) __parentOf.set(__k, Number(__p))
    const __lcaMerge = (a: number, b: number): boolean => {
      const seen = new Set<number>()
      let x: number | undefined = a
      while (x !== undefined) { seen.add(x); x = __parentOf.get(x) }
      let y: number | undefined = b
      while (y !== undefined && !seen.has(y)) y = __parentOf.get(y)
      if (y === undefined) return graph.getProperty(MERGE_EDGES_KEY) === true
      const __py = __parentOf.get(y)
      const __g = __py === undefined ? graph : nestedGraphs.get(__py)!
      return __g.getProperty(MERGE_EDGES_KEY) === true
    }
    EDGE_IDX.forEach(([s, sp, , t, tp], ei) => {
      const __srcMerge = __lcaMerge(s, t)
      const __tgtMerge = nodeOf.get(t)!.getGraph()?.getProperty(MERGE_EDGES_KEY) === true
      const e = createSimpleEdge(nodeOf.get(s)!, nodeOf.get(t)!, sp, tp, __srcMerge, __tgtMerge)
      e.setProperty(MODEL_ORDER_KEY, ei)
      if (EDGE_YO[ei]) e.setProperty(INSIDE_SELF_LOOPS_YO_KEY, true)
      for (const l of EDGE_LABELS[ei]) {
        e.getLabels().push({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })
      }
    })
    if (Object.keys(HIERARCHY).length > 0) {
      graph.setProperty(HIERARCHY_HANDLING_KEY, 'INCLUDE_CHILDREN')
    }
    graph.setProperty(DIRECTION_KEY, 'RIGHT')
    graph.setProperty('org.eclipse.elk.algorithm', "layered")
    graph.setProperty('org.eclipse.elk.separateConnectedComponents', true)
    graph.setProperty('org.eclipse.elk.spacing.componentComponent', 70)
    graph.setProperty('org.eclipse.elk.randomSeed', 1)

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

  it('坐标级差分: 与 jar 0.12.0 1:1 对齐', () => {
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
      n.setProperty(MODEL_ORDER_KEY, i)
      if (PORT_CONSTRAINTS[i]) {
        n.setProperty(PORT_CONSTRAINTS_KEY, PORT_CONSTRAINTS[i] as any)
      }
      for (const [k, v] of NODE_OPTS[i]) {
        n.setProperty(k, v as any)
      }
      for (const portDesc of NODE_PORTS[i]) {
        const port = new LPort()
        port.setNode(n)
        port.getPosition().x = portDesc.x
        port.getPosition().y = portDesc.y
        port.size = { x: portDesc.w, y: portDesc.h }
        if (portDesc.side) port.setSide(portDesc.side as any)
        if (portDesc.index !== null) port.setProperty(PORT_INDEX_KEY, portDesc.index)
        if (portDesc.borderOffset !== null) port.setProperty(PORT_BORDER_OFFSET_KEY, portDesc.borderOffset)
        if (portDesc.labels.length > 0) {
          port.setLabels(portDesc.labels.map((l) => ({ text: l.text, position: { x: l.x, y: l.y }, size: { x: l.width, y: l.height } })))
        }
      }
      if (NODE_ACTIVATE[i]) {
        n.setProperty(INSIDE_SELF_LOOPS_ACTIVATE_KEY, true)
      }
      if (NODE_LABELS[i].length > 0) {
        n.setLabels(NODE_LABELS[i].map((l) => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })))
      }
      nodeOf.set(i, n)
    }
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      const parent = nodeOf.get(p)!
      const nested = nestedGraphs.get(p)!
      parent.setNestedGraph(nested)
      nested.setParentNode(parent)
      // ★ 容器节点 label 占位 (SSOT: LABEL_PAD[i] = 子图 padding.top, 对齐 buildLGraphFromParsed)
      if (LABEL_PAD[p] !== undefined && LABEL_PAD[p] !== null) nested.setPadding(LABEL_PAD[p])
      // ★ 节点级 mergeEdges → 嵌套图 (ELK createLGraph copyProperties; LGraphUtil.createPort 读图属性)
      if (NODE_OPTS[p]?.some(([k]) => k === 'org.eclipse.elk.layered.mergeEdges')) nested.setProperty(MERGE_EDGES_KEY, true)
    }
    __mergeEdges = false
    __defaultSide = PortSide.EAST
    if (__mergeEdges) graph.setProperty(MERGE_EDGES_KEY, true)
    // 边所在图 (LCA) 的 MERGE_EDGES (ELK ElkGraphImporter 源侧读边所在图; 目标侧读目标节点所在图).
    const __parentOf = new Map<number, number>()
    for (const [__p, __kids] of Object.entries(HIERARCHY)) for (const __k of __kids) __parentOf.set(__k, Number(__p))
    const __lcaMerge = (a: number, b: number): boolean => {
      const seen = new Set<number>()
      let x: number | undefined = a
      while (x !== undefined) { seen.add(x); x = __parentOf.get(x) }
      let y: number | undefined = b
      while (y !== undefined && !seen.has(y)) y = __parentOf.get(y)
      if (y === undefined) return graph.getProperty(MERGE_EDGES_KEY) === true
      const __py = __parentOf.get(y)
      const __g = __py === undefined ? graph : nestedGraphs.get(__py)!
      return __g.getProperty(MERGE_EDGES_KEY) === true
    }
    EDGE_IDX.forEach(([s, sp, , t, tp], ei) => {
      const __srcMerge = __lcaMerge(s, t)
      const __tgtMerge = nodeOf.get(t)!.getGraph()?.getProperty(MERGE_EDGES_KEY) === true
      const e = createSimpleEdge(nodeOf.get(s)!, nodeOf.get(t)!, sp, tp, __srcMerge, __tgtMerge)
      e.setProperty(MODEL_ORDER_KEY, ei)
      if (EDGE_YO[ei]) e.setProperty(INSIDE_SELF_LOOPS_YO_KEY, true)
      for (const l of EDGE_LABELS[ei]) {
        e.getLabels().push({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })
      }
    })
    if (Object.keys(HIERARCHY).length > 0) {
      graph.setProperty(HIERARCHY_HANDLING_KEY, 'INCLUDE_CHILDREN')
    }
    graph.setProperty(DIRECTION_KEY, 'RIGHT')
    graph.setProperty('org.eclipse.elk.algorithm', "layered")
    graph.setProperty('org.eclipse.elk.separateConnectedComponents', true)
    graph.setProperty('org.eclipse.elk.spacing.componentComponent', 70)
    graph.setProperty('org.eclipse.elk.randomSeed', 1)

    new LayeredLayoutProvider().layout(graph)

    if (false) {
      for (const n of nodeOf.values()) {
        expect(Number.isFinite(n.position.x)).toBe(true)
        expect(Number.isFinite(n.position.y)).toBe(true)
      }
      return
    }

    // L1 (M3): 与 ELK Java 0.12.0 jar oracle 坐标级差分 (容差 ε = 2).
    // oracle 坐标相对父块 (jar getX/getY); ggn 子图节点坐标同样相对父 → 直接对比, 无需世界坐标累加.
    const oracle = JSON.parse(readFileSync(new URL('../../../test-resources/jar-oracle/examples__general__spacing__components.json', import.meta.url), 'utf8'))
    expect(oracle.hash, 'jar oracle 过期/缺失, 请重跑 node scripts/generate-jar-oracle.mjs').toBe('93ae58c8bd7acab6')
    // ELK 类加载顺序变体 (EdgeMain vs BatchMain): oracle.variants 记录另一变体, 任一匹配即通过.
    const variants = oracle.variants ?? []
    for (let i = 0; i < DIMS.length; i++) {
      const gn = nodeOf.get(i)!
      const nm = 'N' + NAMES[i]
      const cands = [oracle.coords[nm], ...variants.map((v) => v.coords[nm])].filter(Boolean)
      expect(cands.length, nm + ' 缺少 jar oracle 坐标').toBeGreaterThan(0)
      const bestX = Math.min(...cands.map((c) => Math.abs(gn.position.x - c.x)))
      const bestY = Math.min(...cands.map((c) => Math.abs(gn.position.y - c.y)))
      expect(bestX, nm + ' x').toBeLessThanOrEqual(2)
      expect(bestY, nm + ' y').toBeLessThanOrEqual(2)
    }
  })
})

/**
 * elkt 生成: examples__general__spacing__labels
 * 图: 1 节点 / 4 边 / 0 层级块
 * 差分: 坐标级 (1:1 ELK 对齐)
 */

describe('elkt 生成: examples__general__spacing__labels', () => {
  const HIERARCHY: Record<number, number[]> = {}
  const EDGE_IDX: [number, number | null, string | null, number, number | null, string | null][] = [[0,null,null,0,null,null],[0,null,null,0,null,null],[0,null,null,0,null,null],[0,0,"p1",0,1,"p2"]]
  const EDGE_YO: boolean[] = [false,false,false,false]
  const EDGE_LABELS: { text: string; width: number; height: number; placement: string | null }[][] = [[],[],[],[]]
  const DIMS: [number, number][] = [[60,30]]
  const NAMES: string[] = ["n1"]
  const PORT_IDS: string[] = ["p1","p2"]
  const PORT_CONSTRAINTS: (string | null)[] = ["FIXED_SIDE"]
  const NODE_PORTS: { id: string; x: number; y: number; w: number; h: number; side: string | null; index: number | null; borderOffset: number | null; labels: { text: string; x: number; y: number; width: number; height: number }[] }[][] = [[{"id":"p1","x":0,"y":0,"w":8,"h":8,"side":"WEST","index":null,"borderOffset":null,"labels":[]},{"id":"p2","x":0,"y":0,"w":8,"h":8,"side":"EAST","index":null,"borderOffset":null,"labels":[]}]]
  const NODE_ACTIVATE: boolean[] = [false]
  const NODE_LABELS: { text: string; width: number; height: number; placement: string | null }[][] = [[]]
  const LABEL_PAD: ({ top: number; left: number; right: number; bottom: number } | null)[] = [null]
  const NODE_OPTS: [string, unknown][][] = [[]]

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
      n.setProperty(MODEL_ORDER_KEY, i)
      if (PORT_CONSTRAINTS[i]) {
        n.setProperty(PORT_CONSTRAINTS_KEY, PORT_CONSTRAINTS[i] as any)
      }
      for (const [k, v] of NODE_OPTS[i]) {
        n.setProperty(k, v as any)
      }
      for (const portDesc of NODE_PORTS[i]) {
        const port = new LPort()
        port.setNode(n)
        port.getPosition().x = portDesc.x
        port.getPosition().y = portDesc.y
        port.size = { x: portDesc.w, y: portDesc.h }
        if (portDesc.side) port.setSide(portDesc.side as any)
        if (portDesc.index !== null) port.setProperty(PORT_INDEX_KEY, portDesc.index)
        if (portDesc.borderOffset !== null) port.setProperty(PORT_BORDER_OFFSET_KEY, portDesc.borderOffset)
        if (portDesc.labels.length > 0) {
          port.setLabels(portDesc.labels.map((l) => ({ text: l.text, position: { x: l.x, y: l.y }, size: { x: l.width, y: l.height } })))
        }
      }
      if (NODE_ACTIVATE[i]) {
        n.setProperty(INSIDE_SELF_LOOPS_ACTIVATE_KEY, true)
      }
      if (NODE_LABELS[i].length > 0) {
        n.setLabels(NODE_LABELS[i].map((l) => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })))
      }
      nodeOf.set(i, n)
      graphNodes.push(n)
    }
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      const parent = nodeOf.get(p)!
      const nested = nestedGraphs.get(p)!
      parent.setNestedGraph(nested)
      nested.setParentNode(parent)
      // ★ 容器节点 label 占位 (SSOT: LABEL_PAD[i] = 子图 padding.top, 对齐 buildLGraphFromParsed)
      if (LABEL_PAD[p] !== undefined && LABEL_PAD[p] !== null) nested.setPadding(LABEL_PAD[p])
      // ★ 节点级 mergeEdges → 嵌套图 (ELK createLGraph copyProperties; LGraphUtil.createPort 读图属性)
      if (NODE_OPTS[p]?.some(([k]) => k === 'org.eclipse.elk.layered.mergeEdges')) nested.setProperty(MERGE_EDGES_KEY, true)
    }
    __mergeEdges = false
    __defaultSide = PortSide.EAST
    if (__mergeEdges) graph.setProperty(MERGE_EDGES_KEY, true)
    // 边所在图 (LCA) 的 MERGE_EDGES (ELK ElkGraphImporter 源侧读边所在图; 目标侧读目标节点所在图).
    const __parentOf = new Map<number, number>()
    for (const [__p, __kids] of Object.entries(HIERARCHY)) for (const __k of __kids) __parentOf.set(__k, Number(__p))
    const __lcaMerge = (a: number, b: number): boolean => {
      const seen = new Set<number>()
      let x: number | undefined = a
      while (x !== undefined) { seen.add(x); x = __parentOf.get(x) }
      let y: number | undefined = b
      while (y !== undefined && !seen.has(y)) y = __parentOf.get(y)
      if (y === undefined) return graph.getProperty(MERGE_EDGES_KEY) === true
      const __py = __parentOf.get(y)
      const __g = __py === undefined ? graph : nestedGraphs.get(__py)!
      return __g.getProperty(MERGE_EDGES_KEY) === true
    }
    EDGE_IDX.forEach(([s, sp, , t, tp], ei) => {
      const __srcMerge = __lcaMerge(s, t)
      const __tgtMerge = nodeOf.get(t)!.getGraph()?.getProperty(MERGE_EDGES_KEY) === true
      const e = createSimpleEdge(nodeOf.get(s)!, nodeOf.get(t)!, sp, tp, __srcMerge, __tgtMerge)
      e.setProperty(MODEL_ORDER_KEY, ei)
      if (EDGE_YO[ei]) e.setProperty(INSIDE_SELF_LOOPS_YO_KEY, true)
      for (const l of EDGE_LABELS[ei]) {
        e.getLabels().push({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })
      }
    })
    if (Object.keys(HIERARCHY).length > 0) {
      graph.setProperty(HIERARCHY_HANDLING_KEY, 'INCLUDE_CHILDREN')
    }
    graph.setProperty(DIRECTION_KEY, 'RIGHT')
    graph.setProperty('org.eclipse.elk.spacing.nodeSelfLoop', 30)
    graph.setProperty('org.eclipse.elk.spacing.edgeEdge', 10)
    graph.setProperty('org.eclipse.elk.randomSeed', 1)

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

  it('坐标级差分: 与 jar 0.12.0 1:1 对齐', () => {
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
      n.setProperty(MODEL_ORDER_KEY, i)
      if (PORT_CONSTRAINTS[i]) {
        n.setProperty(PORT_CONSTRAINTS_KEY, PORT_CONSTRAINTS[i] as any)
      }
      for (const [k, v] of NODE_OPTS[i]) {
        n.setProperty(k, v as any)
      }
      for (const portDesc of NODE_PORTS[i]) {
        const port = new LPort()
        port.setNode(n)
        port.getPosition().x = portDesc.x
        port.getPosition().y = portDesc.y
        port.size = { x: portDesc.w, y: portDesc.h }
        if (portDesc.side) port.setSide(portDesc.side as any)
        if (portDesc.index !== null) port.setProperty(PORT_INDEX_KEY, portDesc.index)
        if (portDesc.borderOffset !== null) port.setProperty(PORT_BORDER_OFFSET_KEY, portDesc.borderOffset)
        if (portDesc.labels.length > 0) {
          port.setLabels(portDesc.labels.map((l) => ({ text: l.text, position: { x: l.x, y: l.y }, size: { x: l.width, y: l.height } })))
        }
      }
      if (NODE_ACTIVATE[i]) {
        n.setProperty(INSIDE_SELF_LOOPS_ACTIVATE_KEY, true)
      }
      if (NODE_LABELS[i].length > 0) {
        n.setLabels(NODE_LABELS[i].map((l) => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })))
      }
      nodeOf.set(i, n)
    }
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      const parent = nodeOf.get(p)!
      const nested = nestedGraphs.get(p)!
      parent.setNestedGraph(nested)
      nested.setParentNode(parent)
      // ★ 容器节点 label 占位 (SSOT: LABEL_PAD[i] = 子图 padding.top, 对齐 buildLGraphFromParsed)
      if (LABEL_PAD[p] !== undefined && LABEL_PAD[p] !== null) nested.setPadding(LABEL_PAD[p])
      // ★ 节点级 mergeEdges → 嵌套图 (ELK createLGraph copyProperties; LGraphUtil.createPort 读图属性)
      if (NODE_OPTS[p]?.some(([k]) => k === 'org.eclipse.elk.layered.mergeEdges')) nested.setProperty(MERGE_EDGES_KEY, true)
    }
    __mergeEdges = false
    __defaultSide = PortSide.EAST
    if (__mergeEdges) graph.setProperty(MERGE_EDGES_KEY, true)
    // 边所在图 (LCA) 的 MERGE_EDGES (ELK ElkGraphImporter 源侧读边所在图; 目标侧读目标节点所在图).
    const __parentOf = new Map<number, number>()
    for (const [__p, __kids] of Object.entries(HIERARCHY)) for (const __k of __kids) __parentOf.set(__k, Number(__p))
    const __lcaMerge = (a: number, b: number): boolean => {
      const seen = new Set<number>()
      let x: number | undefined = a
      while (x !== undefined) { seen.add(x); x = __parentOf.get(x) }
      let y: number | undefined = b
      while (y !== undefined && !seen.has(y)) y = __parentOf.get(y)
      if (y === undefined) return graph.getProperty(MERGE_EDGES_KEY) === true
      const __py = __parentOf.get(y)
      const __g = __py === undefined ? graph : nestedGraphs.get(__py)!
      return __g.getProperty(MERGE_EDGES_KEY) === true
    }
    EDGE_IDX.forEach(([s, sp, , t, tp], ei) => {
      const __srcMerge = __lcaMerge(s, t)
      const __tgtMerge = nodeOf.get(t)!.getGraph()?.getProperty(MERGE_EDGES_KEY) === true
      const e = createSimpleEdge(nodeOf.get(s)!, nodeOf.get(t)!, sp, tp, __srcMerge, __tgtMerge)
      e.setProperty(MODEL_ORDER_KEY, ei)
      if (EDGE_YO[ei]) e.setProperty(INSIDE_SELF_LOOPS_YO_KEY, true)
      for (const l of EDGE_LABELS[ei]) {
        e.getLabels().push({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })
      }
    })
    if (Object.keys(HIERARCHY).length > 0) {
      graph.setProperty(HIERARCHY_HANDLING_KEY, 'INCLUDE_CHILDREN')
    }
    graph.setProperty(DIRECTION_KEY, 'RIGHT')
    graph.setProperty('org.eclipse.elk.spacing.nodeSelfLoop', 30)
    graph.setProperty('org.eclipse.elk.spacing.edgeEdge', 10)
    graph.setProperty('org.eclipse.elk.randomSeed', 1)

    new LayeredLayoutProvider().layout(graph)

    if (false) {
      for (const n of nodeOf.values()) {
        expect(Number.isFinite(n.position.x)).toBe(true)
        expect(Number.isFinite(n.position.y)).toBe(true)
      }
      return
    }

    // L1 (M3): 与 ELK Java 0.12.0 jar oracle 坐标级差分 (容差 ε = 2).
    // oracle 坐标相对父块 (jar getX/getY); ggn 子图节点坐标同样相对父 → 直接对比, 无需世界坐标累加.
    const oracle = JSON.parse(readFileSync(new URL('../../../test-resources/jar-oracle/examples__general__spacing__labels.json', import.meta.url), 'utf8'))
    expect(oracle.hash, 'jar oracle 过期/缺失, 请重跑 node scripts/generate-jar-oracle.mjs').toBe('c321b6cab57289f7')
    // ELK 类加载顺序变体 (EdgeMain vs BatchMain): oracle.variants 记录另一变体, 任一匹配即通过.
    const variants = oracle.variants ?? []
    for (let i = 0; i < DIMS.length; i++) {
      const gn = nodeOf.get(i)!
      const nm = 'N' + NAMES[i]
      const cands = [oracle.coords[nm], ...variants.map((v) => v.coords[nm])].filter(Boolean)
      expect(cands.length, nm + ' 缺少 jar oracle 坐标').toBeGreaterThan(0)
      const bestX = Math.min(...cands.map((c) => Math.abs(gn.position.x - c.x)))
      const bestY = Math.min(...cands.map((c) => Math.abs(gn.position.y - c.y)))
      expect(bestX, nm + ' x').toBeLessThanOrEqual(2)
      expect(bestY, nm + ' y').toBeLessThanOrEqual(2)
    }
  })
})

/**
 * elkt 生成: examples__general__spacing__portsSurrounding
 * 图: 2 节点 / 0 边 / 0 层级块
 * 差分: 坐标级 (1:1 ELK 对齐)
 */

describe('elkt 生成: examples__general__spacing__portsSurrounding', () => {
  const HIERARCHY: Record<number, number[]> = {}
  const EDGE_IDX: [number, number | null, string | null, number, number | null, string | null][] = []
  const EDGE_YO: boolean[] = []
  const EDGE_LABELS: { text: string; width: number; height: number; placement: string | null }[][] = []
  const DIMS: [number, number][] = [[100,100],[100,100]]
  const NAMES: string[] = ["inner","inner2"]
  const PORT_IDS: string[] = ["pw1","pw2","pn1","pn2","pe1","pe2","ps1","ps2"]
  const PORT_CONSTRAINTS: (string | null)[] = ["FIXED_SIDE","FIXED_SIDE"]
  const NODE_PORTS: { id: string; x: number; y: number; w: number; h: number; side: string | null; index: number | null; borderOffset: number | null; labels: { text: string; x: number; y: number; width: number; height: number }[] }[][] = [[{"id":"pw1","x":0,"y":0,"w":8,"h":8,"side":"WEST","index":null,"borderOffset":null,"labels":[]},{"id":"pw2","x":0,"y":0,"w":8,"h":8,"side":"WEST","index":null,"borderOffset":null,"labels":[]},{"id":"pn1","x":0,"y":0,"w":8,"h":8,"side":"NORTH","index":null,"borderOffset":null,"labels":[]},{"id":"pn2","x":0,"y":0,"w":8,"h":8,"side":"NORTH","index":null,"borderOffset":null,"labels":[]},{"id":"pe1","x":0,"y":0,"w":8,"h":8,"side":"EAST","index":null,"borderOffset":null,"labels":[]},{"id":"pe2","x":0,"y":0,"w":8,"h":8,"side":"EAST","index":null,"borderOffset":null,"labels":[]},{"id":"ps1","x":0,"y":0,"w":8,"h":8,"side":"SOUTH","index":null,"borderOffset":null,"labels":[]},{"id":"ps2","x":0,"y":0,"w":8,"h":8,"side":"SOUTH","index":null,"borderOffset":null,"labels":[]}],[{"id":"pw1","x":0,"y":0,"w":8,"h":8,"side":"WEST","index":null,"borderOffset":null,"labels":[]},{"id":"pw2","x":0,"y":0,"w":8,"h":8,"side":"WEST","index":null,"borderOffset":null,"labels":[]},{"id":"pn1","x":0,"y":0,"w":8,"h":8,"side":"NORTH","index":null,"borderOffset":null,"labels":[]},{"id":"pn2","x":0,"y":0,"w":8,"h":8,"side":"NORTH","index":null,"borderOffset":null,"labels":[]},{"id":"pe1","x":0,"y":0,"w":8,"h":8,"side":"EAST","index":null,"borderOffset":null,"labels":[]},{"id":"pe2","x":0,"y":0,"w":8,"h":8,"side":"EAST","index":null,"borderOffset":null,"labels":[]},{"id":"ps1","x":0,"y":0,"w":8,"h":8,"side":"SOUTH","index":null,"borderOffset":null,"labels":[]},{"id":"ps2","x":0,"y":0,"w":8,"h":8,"side":"SOUTH","index":null,"borderOffset":null,"labels":[]}]]
  const NODE_ACTIVATE: boolean[] = [false,false]
  const NODE_LABELS: { text: string; width: number; height: number; placement: string | null }[][] = [[],[]]
  const LABEL_PAD: ({ top: number; left: number; right: number; bottom: number } | null)[] = [null,null]
  const NODE_OPTS: [string, unknown][][] = [[["org.eclipse.elk.portAlignment.west","BEGIN"],["org.eclipse.elk.portAlignment.east","CENTER"],["org.eclipse.elk.portAlignment.north","JUSTIFIED"],["org.eclipse.elk.portAlignment.south","DISTRIBUTED"]],[["org.eclipse.elk.spacing.individual","spacing.portsSurrounding:[top=40.0,left=10.0,bottom=10.0,right=30.0]"],["org.eclipse.elk.portAlignment.west","BEGIN"],["org.eclipse.elk.portAlignment.east","CENTER"],["org.eclipse.elk.portAlignment.north","JUSTIFIED"],["org.eclipse.elk.portAlignment.south","DISTRIBUTED"]]]

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
      n.setProperty(MODEL_ORDER_KEY, i)
      if (PORT_CONSTRAINTS[i]) {
        n.setProperty(PORT_CONSTRAINTS_KEY, PORT_CONSTRAINTS[i] as any)
      }
      for (const [k, v] of NODE_OPTS[i]) {
        n.setProperty(k, v as any)
      }
      for (const portDesc of NODE_PORTS[i]) {
        const port = new LPort()
        port.setNode(n)
        port.getPosition().x = portDesc.x
        port.getPosition().y = portDesc.y
        port.size = { x: portDesc.w, y: portDesc.h }
        if (portDesc.side) port.setSide(portDesc.side as any)
        if (portDesc.index !== null) port.setProperty(PORT_INDEX_KEY, portDesc.index)
        if (portDesc.borderOffset !== null) port.setProperty(PORT_BORDER_OFFSET_KEY, portDesc.borderOffset)
        if (portDesc.labels.length > 0) {
          port.setLabels(portDesc.labels.map((l) => ({ text: l.text, position: { x: l.x, y: l.y }, size: { x: l.width, y: l.height } })))
        }
      }
      if (NODE_ACTIVATE[i]) {
        n.setProperty(INSIDE_SELF_LOOPS_ACTIVATE_KEY, true)
      }
      if (NODE_LABELS[i].length > 0) {
        n.setLabels(NODE_LABELS[i].map((l) => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })))
      }
      nodeOf.set(i, n)
      graphNodes.push(n)
    }
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      const parent = nodeOf.get(p)!
      const nested = nestedGraphs.get(p)!
      parent.setNestedGraph(nested)
      nested.setParentNode(parent)
      // ★ 容器节点 label 占位 (SSOT: LABEL_PAD[i] = 子图 padding.top, 对齐 buildLGraphFromParsed)
      if (LABEL_PAD[p] !== undefined && LABEL_PAD[p] !== null) nested.setPadding(LABEL_PAD[p])
      // ★ 节点级 mergeEdges → 嵌套图 (ELK createLGraph copyProperties; LGraphUtil.createPort 读图属性)
      if (NODE_OPTS[p]?.some(([k]) => k === 'org.eclipse.elk.layered.mergeEdges')) nested.setProperty(MERGE_EDGES_KEY, true)
    }
    __mergeEdges = false
    __defaultSide = PortSide.EAST
    if (__mergeEdges) graph.setProperty(MERGE_EDGES_KEY, true)
    // 边所在图 (LCA) 的 MERGE_EDGES (ELK ElkGraphImporter 源侧读边所在图; 目标侧读目标节点所在图).
    const __parentOf = new Map<number, number>()
    for (const [__p, __kids] of Object.entries(HIERARCHY)) for (const __k of __kids) __parentOf.set(__k, Number(__p))
    const __lcaMerge = (a: number, b: number): boolean => {
      const seen = new Set<number>()
      let x: number | undefined = a
      while (x !== undefined) { seen.add(x); x = __parentOf.get(x) }
      let y: number | undefined = b
      while (y !== undefined && !seen.has(y)) y = __parentOf.get(y)
      if (y === undefined) return graph.getProperty(MERGE_EDGES_KEY) === true
      const __py = __parentOf.get(y)
      const __g = __py === undefined ? graph : nestedGraphs.get(__py)!
      return __g.getProperty(MERGE_EDGES_KEY) === true
    }
    EDGE_IDX.forEach(([s, sp, , t, tp], ei) => {
      const __srcMerge = __lcaMerge(s, t)
      const __tgtMerge = nodeOf.get(t)!.getGraph()?.getProperty(MERGE_EDGES_KEY) === true
      const e = createSimpleEdge(nodeOf.get(s)!, nodeOf.get(t)!, sp, tp, __srcMerge, __tgtMerge)
      e.setProperty(MODEL_ORDER_KEY, ei)
      if (EDGE_YO[ei]) e.setProperty(INSIDE_SELF_LOOPS_YO_KEY, true)
      for (const l of EDGE_LABELS[ei]) {
        e.getLabels().push({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })
      }
    })
    if (Object.keys(HIERARCHY).length > 0) {
      graph.setProperty(HIERARCHY_HANDLING_KEY, 'INCLUDE_CHILDREN')
    }
    graph.setProperty(DIRECTION_KEY, 'RIGHT')
    graph.setProperty('org.eclipse.elk.nodeLabels.placement', ["INSIDE","V_TOP","H_CENTER"])
    graph.setProperty('org.eclipse.elk.spacing.portPort', 5)
    graph.setProperty('org.eclipse.elk.spacing.portsSurrounding', {"top":20,"left":5,"bottom":0,"right":15})
    graph.setProperty('org.eclipse.elk.randomSeed', 1)

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

  it('坐标级差分: 与 jar 0.12.0 1:1 对齐', () => {
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
      n.setProperty(MODEL_ORDER_KEY, i)
      if (PORT_CONSTRAINTS[i]) {
        n.setProperty(PORT_CONSTRAINTS_KEY, PORT_CONSTRAINTS[i] as any)
      }
      for (const [k, v] of NODE_OPTS[i]) {
        n.setProperty(k, v as any)
      }
      for (const portDesc of NODE_PORTS[i]) {
        const port = new LPort()
        port.setNode(n)
        port.getPosition().x = portDesc.x
        port.getPosition().y = portDesc.y
        port.size = { x: portDesc.w, y: portDesc.h }
        if (portDesc.side) port.setSide(portDesc.side as any)
        if (portDesc.index !== null) port.setProperty(PORT_INDEX_KEY, portDesc.index)
        if (portDesc.borderOffset !== null) port.setProperty(PORT_BORDER_OFFSET_KEY, portDesc.borderOffset)
        if (portDesc.labels.length > 0) {
          port.setLabels(portDesc.labels.map((l) => ({ text: l.text, position: { x: l.x, y: l.y }, size: { x: l.width, y: l.height } })))
        }
      }
      if (NODE_ACTIVATE[i]) {
        n.setProperty(INSIDE_SELF_LOOPS_ACTIVATE_KEY, true)
      }
      if (NODE_LABELS[i].length > 0) {
        n.setLabels(NODE_LABELS[i].map((l) => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })))
      }
      nodeOf.set(i, n)
    }
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      const parent = nodeOf.get(p)!
      const nested = nestedGraphs.get(p)!
      parent.setNestedGraph(nested)
      nested.setParentNode(parent)
      // ★ 容器节点 label 占位 (SSOT: LABEL_PAD[i] = 子图 padding.top, 对齐 buildLGraphFromParsed)
      if (LABEL_PAD[p] !== undefined && LABEL_PAD[p] !== null) nested.setPadding(LABEL_PAD[p])
      // ★ 节点级 mergeEdges → 嵌套图 (ELK createLGraph copyProperties; LGraphUtil.createPort 读图属性)
      if (NODE_OPTS[p]?.some(([k]) => k === 'org.eclipse.elk.layered.mergeEdges')) nested.setProperty(MERGE_EDGES_KEY, true)
    }
    __mergeEdges = false
    __defaultSide = PortSide.EAST
    if (__mergeEdges) graph.setProperty(MERGE_EDGES_KEY, true)
    // 边所在图 (LCA) 的 MERGE_EDGES (ELK ElkGraphImporter 源侧读边所在图; 目标侧读目标节点所在图).
    const __parentOf = new Map<number, number>()
    for (const [__p, __kids] of Object.entries(HIERARCHY)) for (const __k of __kids) __parentOf.set(__k, Number(__p))
    const __lcaMerge = (a: number, b: number): boolean => {
      const seen = new Set<number>()
      let x: number | undefined = a
      while (x !== undefined) { seen.add(x); x = __parentOf.get(x) }
      let y: number | undefined = b
      while (y !== undefined && !seen.has(y)) y = __parentOf.get(y)
      if (y === undefined) return graph.getProperty(MERGE_EDGES_KEY) === true
      const __py = __parentOf.get(y)
      const __g = __py === undefined ? graph : nestedGraphs.get(__py)!
      return __g.getProperty(MERGE_EDGES_KEY) === true
    }
    EDGE_IDX.forEach(([s, sp, , t, tp], ei) => {
      const __srcMerge = __lcaMerge(s, t)
      const __tgtMerge = nodeOf.get(t)!.getGraph()?.getProperty(MERGE_EDGES_KEY) === true
      const e = createSimpleEdge(nodeOf.get(s)!, nodeOf.get(t)!, sp, tp, __srcMerge, __tgtMerge)
      e.setProperty(MODEL_ORDER_KEY, ei)
      if (EDGE_YO[ei]) e.setProperty(INSIDE_SELF_LOOPS_YO_KEY, true)
      for (const l of EDGE_LABELS[ei]) {
        e.getLabels().push({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })
      }
    })
    if (Object.keys(HIERARCHY).length > 0) {
      graph.setProperty(HIERARCHY_HANDLING_KEY, 'INCLUDE_CHILDREN')
    }
    graph.setProperty(DIRECTION_KEY, 'RIGHT')
    graph.setProperty('org.eclipse.elk.nodeLabels.placement', ["INSIDE","V_TOP","H_CENTER"])
    graph.setProperty('org.eclipse.elk.spacing.portPort', 5)
    graph.setProperty('org.eclipse.elk.spacing.portsSurrounding', {"top":20,"left":5,"bottom":0,"right":15})
    graph.setProperty('org.eclipse.elk.randomSeed', 1)

    new LayeredLayoutProvider().layout(graph)

    if (false) {
      for (const n of nodeOf.values()) {
        expect(Number.isFinite(n.position.x)).toBe(true)
        expect(Number.isFinite(n.position.y)).toBe(true)
      }
      return
    }

    // L1 (M3): 与 ELK Java 0.12.0 jar oracle 坐标级差分 (容差 ε = 2).
    // oracle 坐标相对父块 (jar getX/getY); ggn 子图节点坐标同样相对父 → 直接对比, 无需世界坐标累加.
    const oracle = JSON.parse(readFileSync(new URL('../../../test-resources/jar-oracle/examples__general__spacing__portsSurrounding.json', import.meta.url), 'utf8'))
    expect(oracle.hash, 'jar oracle 过期/缺失, 请重跑 node scripts/generate-jar-oracle.mjs').toBe('abc1181eb83f40ff')
    // ELK 类加载顺序变体 (EdgeMain vs BatchMain): oracle.variants 记录另一变体, 任一匹配即通过.
    const variants = oracle.variants ?? []
    for (let i = 0; i < DIMS.length; i++) {
      const gn = nodeOf.get(i)!
      const nm = 'N' + NAMES[i]
      const cands = [oracle.coords[nm], ...variants.map((v) => v.coords[nm])].filter(Boolean)
      expect(cands.length, nm + ' 缺少 jar oracle 坐标').toBeGreaterThan(0)
      const bestX = Math.min(...cands.map((c) => Math.abs(gn.position.x - c.x)))
      const bestY = Math.min(...cands.map((c) => Math.abs(gn.position.y - c.y)))
      expect(bestX, nm + ' x').toBeLessThanOrEqual(2)
      expect(bestY, nm + ' y').toBeLessThanOrEqual(2)
    }
  })
})

/**
 * elkt 生成: examples__general__spacing__ports
 * 图: 6 节点 / 0 边 / 0 层级块
 * 差分: 坐标级 (1:1 ELK 对齐)
 */

describe('elkt 生成: examples__general__spacing__ports', () => {
  const HIERARCHY: Record<number, number[]> = {"0":[1],"2":[3,4]}
  const EDGE_IDX: [number, number | null, string | null, number, number | null, string | null][] = []
  const EDGE_YO: boolean[] = []
  const EDGE_LABELS: { text: string; width: number; height: number; placement: string | null }[][] = []
  const DIMS: [number, number][] = [[60,30],[100,100],[60,30],[40,40],[60,30],[50,50]]
  const NAMES: string[] = ["portDistribution","portDistribution.inner","resizeNode","resizeNode.notSatisfied","resizeNode.satisfied","borderOffset"]
  const PORT_IDS: string[] = ["pw1","pw2","pw3","pw4","pn1","pn2","pn3","pn4","pe1","pe2","pe3","pe4","ps1","ps2","ps3","ps4"]
  const PORT_CONSTRAINTS: (string | null)[] = [null,"FIXED_SIDE",null,"FIXED_SIDE","FIXED_SIDE","FIXED_SIDE"]
  const NODE_PORTS: { id: string; x: number; y: number; w: number; h: number; side: string | null; index: number | null; borderOffset: number | null; labels: { text: string; x: number; y: number; width: number; height: number }[] }[][] = [[],[{"id":"pw1","x":0,"y":0,"w":8,"h":8,"side":"WEST","index":null,"borderOffset":null,"labels":[]},{"id":"pw2","x":0,"y":0,"w":8,"h":8,"side":"WEST","index":null,"borderOffset":null,"labels":[]},{"id":"pw3","x":0,"y":0,"w":8,"h":8,"side":"WEST","index":null,"borderOffset":null,"labels":[]},{"id":"pw4","x":0,"y":0,"w":8,"h":8,"side":"WEST","index":null,"borderOffset":null,"labels":[]},{"id":"pn1","x":0,"y":0,"w":8,"h":8,"side":"NORTH","index":null,"borderOffset":null,"labels":[]},{"id":"pn2","x":0,"y":0,"w":8,"h":8,"side":"NORTH","index":null,"borderOffset":null,"labels":[]},{"id":"pn3","x":0,"y":0,"w":8,"h":8,"side":"NORTH","index":null,"borderOffset":null,"labels":[]},{"id":"pn4","x":0,"y":0,"w":8,"h":8,"side":"NORTH","index":null,"borderOffset":null,"labels":[]},{"id":"pe1","x":0,"y":0,"w":8,"h":8,"side":"EAST","index":null,"borderOffset":null,"labels":[]},{"id":"pe2","x":0,"y":0,"w":8,"h":8,"side":"EAST","index":null,"borderOffset":null,"labels":[]},{"id":"pe3","x":0,"y":0,"w":8,"h":8,"side":"EAST","index":null,"borderOffset":null,"labels":[]},{"id":"pe4","x":0,"y":0,"w":8,"h":8,"side":"EAST","index":null,"borderOffset":null,"labels":[]},{"id":"ps1","x":0,"y":0,"w":8,"h":8,"side":"SOUTH","index":null,"borderOffset":null,"labels":[]},{"id":"ps2","x":0,"y":0,"w":8,"h":8,"side":"SOUTH","index":null,"borderOffset":null,"labels":[]},{"id":"ps3","x":0,"y":0,"w":8,"h":8,"side":"SOUTH","index":null,"borderOffset":null,"labels":[]},{"id":"ps4","x":0,"y":0,"w":8,"h":8,"side":"SOUTH","index":null,"borderOffset":null,"labels":[]}],[],[{"id":"pw1","x":0,"y":0,"w":8,"h":8,"side":"WEST","index":null,"borderOffset":null,"labels":[]},{"id":"pw2","x":0,"y":0,"w":8,"h":8,"side":"WEST","index":null,"borderOffset":null,"labels":[]},{"id":"pw3","x":0,"y":0,"w":8,"h":8,"side":"WEST","index":null,"borderOffset":null,"labels":[]},{"id":"pw4","x":0,"y":0,"w":8,"h":8,"side":"WEST","index":null,"borderOffset":null,"labels":[]}],[{"id":"pw1","x":0,"y":0,"w":8,"h":8,"side":"WEST","index":null,"borderOffset":null,"labels":[]},{"id":"pw2","x":0,"y":0,"w":8,"h":8,"side":"WEST","index":null,"borderOffset":null,"labels":[]},{"id":"pw3","x":0,"y":0,"w":8,"h":8,"side":"WEST","index":null,"borderOffset":null,"labels":[]},{"id":"pw4","x":0,"y":0,"w":8,"h":8,"side":"WEST","index":null,"borderOffset":null,"labels":[]}],[{"id":"pw1","x":0,"y":0,"w":8,"h":8,"side":"WEST","index":null,"borderOffset":15,"labels":[]},{"id":"pw2","x":0,"y":0,"w":8,"h":8,"side":"WEST","index":null,"borderOffset":null,"labels":[]},{"id":"ps1","x":0,"y":0,"w":8,"h":8,"side":"SOUTH","index":null,"borderOffset":25,"labels":[]},{"id":"ps2","x":0,"y":0,"w":8,"h":8,"side":"SOUTH","index":null,"borderOffset":null,"labels":[]}]]
  const NODE_ACTIVATE: boolean[] = [false,false,false,false,false,false]
  const NODE_LABELS: { text: string; width: number; height: number; placement: string | null }[][] = [[{"text":"Distribution","width":66,"height":15,"placement":null}],[],[{"text":"Node Resize","width":77,"height":15,"placement":null}],[],[],[{"text":"Border Offset","width":77,"height":15,"placement":null}]]
  const LABEL_PAD: ({ top: number; left: number; right: number; bottom: number } | null)[] = [{"top":32,"bottom":12,"left":12,"right":12},null,{"top":32,"bottom":12,"left":12,"right":12},null,null,null]
  const NODE_OPTS: [string, unknown][][] = [[["org.eclipse.elk.nodeLabels.placement",["INSIDE","V_TOP","H_CENTER"]],["org.eclipse.elk.spacing.portPort",10]],[["org.eclipse.elk.portAlignment.west","BEGIN"],["org.eclipse.elk.portAlignment.north","CENTER"],["org.eclipse.elk.portAlignment.east","DISTRIBUTED"],["org.eclipse.elk.portAlignment.south","JUSTIFIED"]],[["org.eclipse.elk.nodeLabels.placement",["INSIDE","V_TOP","H_CENTER"]],["org.eclipse.elk.spacing.portPort",20]],[["org.eclipse.elk.portAlignment.default","CENTER"]],[["org.eclipse.elk.portAlignment.default","CENTER"],["org.eclipse.elk.nodeSize.minimum",{"x":40,"y":40}],["org.eclipse.elk.nodeSize.constraints",["PORTS","MINIMUM_SIZE"]]],[["org.eclipse.elk.nodeLabels.placement",["OUTSIDE","V_TOP","H_CENTER"]]]]

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
      n.setProperty(MODEL_ORDER_KEY, i)
      if (PORT_CONSTRAINTS[i]) {
        n.setProperty(PORT_CONSTRAINTS_KEY, PORT_CONSTRAINTS[i] as any)
      }
      for (const [k, v] of NODE_OPTS[i]) {
        n.setProperty(k, v as any)
      }
      for (const portDesc of NODE_PORTS[i]) {
        const port = new LPort()
        port.setNode(n)
        port.getPosition().x = portDesc.x
        port.getPosition().y = portDesc.y
        port.size = { x: portDesc.w, y: portDesc.h }
        if (portDesc.side) port.setSide(portDesc.side as any)
        if (portDesc.index !== null) port.setProperty(PORT_INDEX_KEY, portDesc.index)
        if (portDesc.borderOffset !== null) port.setProperty(PORT_BORDER_OFFSET_KEY, portDesc.borderOffset)
        if (portDesc.labels.length > 0) {
          port.setLabels(portDesc.labels.map((l) => ({ text: l.text, position: { x: l.x, y: l.y }, size: { x: l.width, y: l.height } })))
        }
      }
      if (NODE_ACTIVATE[i]) {
        n.setProperty(INSIDE_SELF_LOOPS_ACTIVATE_KEY, true)
      }
      if (NODE_LABELS[i].length > 0) {
        n.setLabels(NODE_LABELS[i].map((l) => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })))
      }
      nodeOf.set(i, n)
      graphNodes.push(n)
    }
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      const parent = nodeOf.get(p)!
      const nested = nestedGraphs.get(p)!
      parent.setNestedGraph(nested)
      nested.setParentNode(parent)
      // ★ 容器节点 label 占位 (SSOT: LABEL_PAD[i] = 子图 padding.top, 对齐 buildLGraphFromParsed)
      if (LABEL_PAD[p] !== undefined && LABEL_PAD[p] !== null) nested.setPadding(LABEL_PAD[p])
      // ★ 节点级 mergeEdges → 嵌套图 (ELK createLGraph copyProperties; LGraphUtil.createPort 读图属性)
      if (NODE_OPTS[p]?.some(([k]) => k === 'org.eclipse.elk.layered.mergeEdges')) nested.setProperty(MERGE_EDGES_KEY, true)
    }
    __mergeEdges = false
    __defaultSide = PortSide.EAST
    if (__mergeEdges) graph.setProperty(MERGE_EDGES_KEY, true)
    // 边所在图 (LCA) 的 MERGE_EDGES (ELK ElkGraphImporter 源侧读边所在图; 目标侧读目标节点所在图).
    const __parentOf = new Map<number, number>()
    for (const [__p, __kids] of Object.entries(HIERARCHY)) for (const __k of __kids) __parentOf.set(__k, Number(__p))
    const __lcaMerge = (a: number, b: number): boolean => {
      const seen = new Set<number>()
      let x: number | undefined = a
      while (x !== undefined) { seen.add(x); x = __parentOf.get(x) }
      let y: number | undefined = b
      while (y !== undefined && !seen.has(y)) y = __parentOf.get(y)
      if (y === undefined) return graph.getProperty(MERGE_EDGES_KEY) === true
      const __py = __parentOf.get(y)
      const __g = __py === undefined ? graph : nestedGraphs.get(__py)!
      return __g.getProperty(MERGE_EDGES_KEY) === true
    }
    EDGE_IDX.forEach(([s, sp, , t, tp], ei) => {
      const __srcMerge = __lcaMerge(s, t)
      const __tgtMerge = nodeOf.get(t)!.getGraph()?.getProperty(MERGE_EDGES_KEY) === true
      const e = createSimpleEdge(nodeOf.get(s)!, nodeOf.get(t)!, sp, tp, __srcMerge, __tgtMerge)
      e.setProperty(MODEL_ORDER_KEY, ei)
      if (EDGE_YO[ei]) e.setProperty(INSIDE_SELF_LOOPS_YO_KEY, true)
      for (const l of EDGE_LABELS[ei]) {
        e.getLabels().push({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })
      }
    })
    if (Object.keys(HIERARCHY).length > 0) {
      graph.setProperty(HIERARCHY_HANDLING_KEY, 'INCLUDE_CHILDREN')
    }
    graph.setProperty(DIRECTION_KEY, 'RIGHT')
    graph.setProperty('org.eclipse.elk.algorithm', "layered")
    graph.setProperty('org.eclipse.elk.aspectRatio', 4)
    graph.setProperty('org.eclipse.elk.randomSeed', 1)

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

  it('坐标级差分: 与 jar 0.12.0 1:1 对齐', () => {
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
      n.setProperty(MODEL_ORDER_KEY, i)
      if (PORT_CONSTRAINTS[i]) {
        n.setProperty(PORT_CONSTRAINTS_KEY, PORT_CONSTRAINTS[i] as any)
      }
      for (const [k, v] of NODE_OPTS[i]) {
        n.setProperty(k, v as any)
      }
      for (const portDesc of NODE_PORTS[i]) {
        const port = new LPort()
        port.setNode(n)
        port.getPosition().x = portDesc.x
        port.getPosition().y = portDesc.y
        port.size = { x: portDesc.w, y: portDesc.h }
        if (portDesc.side) port.setSide(portDesc.side as any)
        if (portDesc.index !== null) port.setProperty(PORT_INDEX_KEY, portDesc.index)
        if (portDesc.borderOffset !== null) port.setProperty(PORT_BORDER_OFFSET_KEY, portDesc.borderOffset)
        if (portDesc.labels.length > 0) {
          port.setLabels(portDesc.labels.map((l) => ({ text: l.text, position: { x: l.x, y: l.y }, size: { x: l.width, y: l.height } })))
        }
      }
      if (NODE_ACTIVATE[i]) {
        n.setProperty(INSIDE_SELF_LOOPS_ACTIVATE_KEY, true)
      }
      if (NODE_LABELS[i].length > 0) {
        n.setLabels(NODE_LABELS[i].map((l) => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })))
      }
      nodeOf.set(i, n)
    }
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      const parent = nodeOf.get(p)!
      const nested = nestedGraphs.get(p)!
      parent.setNestedGraph(nested)
      nested.setParentNode(parent)
      // ★ 容器节点 label 占位 (SSOT: LABEL_PAD[i] = 子图 padding.top, 对齐 buildLGraphFromParsed)
      if (LABEL_PAD[p] !== undefined && LABEL_PAD[p] !== null) nested.setPadding(LABEL_PAD[p])
      // ★ 节点级 mergeEdges → 嵌套图 (ELK createLGraph copyProperties; LGraphUtil.createPort 读图属性)
      if (NODE_OPTS[p]?.some(([k]) => k === 'org.eclipse.elk.layered.mergeEdges')) nested.setProperty(MERGE_EDGES_KEY, true)
    }
    __mergeEdges = false
    __defaultSide = PortSide.EAST
    if (__mergeEdges) graph.setProperty(MERGE_EDGES_KEY, true)
    // 边所在图 (LCA) 的 MERGE_EDGES (ELK ElkGraphImporter 源侧读边所在图; 目标侧读目标节点所在图).
    const __parentOf = new Map<number, number>()
    for (const [__p, __kids] of Object.entries(HIERARCHY)) for (const __k of __kids) __parentOf.set(__k, Number(__p))
    const __lcaMerge = (a: number, b: number): boolean => {
      const seen = new Set<number>()
      let x: number | undefined = a
      while (x !== undefined) { seen.add(x); x = __parentOf.get(x) }
      let y: number | undefined = b
      while (y !== undefined && !seen.has(y)) y = __parentOf.get(y)
      if (y === undefined) return graph.getProperty(MERGE_EDGES_KEY) === true
      const __py = __parentOf.get(y)
      const __g = __py === undefined ? graph : nestedGraphs.get(__py)!
      return __g.getProperty(MERGE_EDGES_KEY) === true
    }
    EDGE_IDX.forEach(([s, sp, , t, tp], ei) => {
      const __srcMerge = __lcaMerge(s, t)
      const __tgtMerge = nodeOf.get(t)!.getGraph()?.getProperty(MERGE_EDGES_KEY) === true
      const e = createSimpleEdge(nodeOf.get(s)!, nodeOf.get(t)!, sp, tp, __srcMerge, __tgtMerge)
      e.setProperty(MODEL_ORDER_KEY, ei)
      if (EDGE_YO[ei]) e.setProperty(INSIDE_SELF_LOOPS_YO_KEY, true)
      for (const l of EDGE_LABELS[ei]) {
        e.getLabels().push({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })
      }
    })
    if (Object.keys(HIERARCHY).length > 0) {
      graph.setProperty(HIERARCHY_HANDLING_KEY, 'INCLUDE_CHILDREN')
    }
    graph.setProperty(DIRECTION_KEY, 'RIGHT')
    graph.setProperty('org.eclipse.elk.algorithm', "layered")
    graph.setProperty('org.eclipse.elk.aspectRatio', 4)
    graph.setProperty('org.eclipse.elk.randomSeed', 1)

    new LayeredLayoutProvider().layout(graph)

    if (false) {
      for (const n of nodeOf.values()) {
        expect(Number.isFinite(n.position.x)).toBe(true)
        expect(Number.isFinite(n.position.y)).toBe(true)
      }
      return
    }

    // L1 (M3): 与 ELK Java 0.12.0 jar oracle 坐标级差分 (容差 ε = 2).
    // oracle 坐标相对父块 (jar getX/getY); ggn 子图节点坐标同样相对父 → 直接对比, 无需世界坐标累加.
    const oracle = JSON.parse(readFileSync(new URL('../../../test-resources/jar-oracle/examples__general__spacing__ports.json', import.meta.url), 'utf8'))
    expect(oracle.hash, 'jar oracle 过期/缺失, 请重跑 node scripts/generate-jar-oracle.mjs').toBe('aaeaac2c37485df1')
    // ELK 类加载顺序变体 (EdgeMain vs BatchMain): oracle.variants 记录另一变体, 任一匹配即通过.
    const variants = oracle.variants ?? []
    for (let i = 0; i < DIMS.length; i++) {
      const gn = nodeOf.get(i)!
      const nm = 'N' + NAMES[i]
      const cands = [oracle.coords[nm], ...variants.map((v) => v.coords[nm])].filter(Boolean)
      expect(cands.length, nm + ' 缺少 jar oracle 坐标').toBeGreaterThan(0)
      const bestX = Math.min(...cands.map((c) => Math.abs(gn.position.x - c.x)))
      const bestY = Math.min(...cands.map((c) => Math.abs(gn.position.y - c.y)))
      expect(bestX, nm + ' x').toBeLessThanOrEqual(2)
      expect(bestY, nm + ' y').toBeLessThanOrEqual(2)
    }
  })
})

/**
 * elkt 生成: examples__general__spacing__comments
 * 图: 5 节点 / 4 边 / 0 层级块
 * 差分: 坐标级 (1:1 ELK 对齐)
 */

describe('elkt 生成: examples__general__spacing__comments', () => {
  const HIERARCHY: Record<number, number[]> = {}
  const EDGE_IDX: [number, number | null, string | null, number, number | null, string | null][] = [[0,null,null,1,null,null],[0,null,null,2,null,null],[3,null,null,0,null,null],[4,null,null,0,null,null]]
  const EDGE_YO: boolean[] = [false,false,false,false]
  const EDGE_LABELS: { text: string; width: number; height: number; placement: string | null }[][] = [[],[],[],[]]
  const DIMS: [number, number][] = [[60,30],[60,30],[60,30],[60,30],[60,30]]
  const NAMES: string[] = ["n1","c1_1","c1_2","c1_3","c1_4"]
  const PORT_IDS: string[] = []
  const PORT_CONSTRAINTS: (string | null)[] = [null,null,null,null,null]
  const NODE_PORTS: { id: string; x: number; y: number; w: number; h: number; side: string | null; index: number | null; borderOffset: number | null; labels: { text: string; x: number; y: number; width: number; height: number }[] }[][] = [[],[],[],[],[]]
  const NODE_ACTIVATE: boolean[] = [false,false,false,false,false]
  const NODE_LABELS: { text: string; width: number; height: number; placement: string | null }[][] = [[],[],[],[],[]]
  const LABEL_PAD: ({ top: number; left: number; right: number; bottom: number } | null)[] = [null,null,null,null,null]
  const NODE_OPTS: [string, unknown][][] = [[],[["org.eclipse.elk.commentBox",true]],[["org.eclipse.elk.commentBox",true]],[["org.eclipse.elk.commentBox",true]],[["org.eclipse.elk.commentBox",true]]]

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
      n.setProperty(MODEL_ORDER_KEY, i)
      if (PORT_CONSTRAINTS[i]) {
        n.setProperty(PORT_CONSTRAINTS_KEY, PORT_CONSTRAINTS[i] as any)
      }
      for (const [k, v] of NODE_OPTS[i]) {
        n.setProperty(k, v as any)
      }
      for (const portDesc of NODE_PORTS[i]) {
        const port = new LPort()
        port.setNode(n)
        port.getPosition().x = portDesc.x
        port.getPosition().y = portDesc.y
        port.size = { x: portDesc.w, y: portDesc.h }
        if (portDesc.side) port.setSide(portDesc.side as any)
        if (portDesc.index !== null) port.setProperty(PORT_INDEX_KEY, portDesc.index)
        if (portDesc.borderOffset !== null) port.setProperty(PORT_BORDER_OFFSET_KEY, portDesc.borderOffset)
        if (portDesc.labels.length > 0) {
          port.setLabels(portDesc.labels.map((l) => ({ text: l.text, position: { x: l.x, y: l.y }, size: { x: l.width, y: l.height } })))
        }
      }
      if (NODE_ACTIVATE[i]) {
        n.setProperty(INSIDE_SELF_LOOPS_ACTIVATE_KEY, true)
      }
      if (NODE_LABELS[i].length > 0) {
        n.setLabels(NODE_LABELS[i].map((l) => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })))
      }
      nodeOf.set(i, n)
      graphNodes.push(n)
    }
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      const parent = nodeOf.get(p)!
      const nested = nestedGraphs.get(p)!
      parent.setNestedGraph(nested)
      nested.setParentNode(parent)
      // ★ 容器节点 label 占位 (SSOT: LABEL_PAD[i] = 子图 padding.top, 对齐 buildLGraphFromParsed)
      if (LABEL_PAD[p] !== undefined && LABEL_PAD[p] !== null) nested.setPadding(LABEL_PAD[p])
      // ★ 节点级 mergeEdges → 嵌套图 (ELK createLGraph copyProperties; LGraphUtil.createPort 读图属性)
      if (NODE_OPTS[p]?.some(([k]) => k === 'org.eclipse.elk.layered.mergeEdges')) nested.setProperty(MERGE_EDGES_KEY, true)
    }
    __mergeEdges = false
    __defaultSide = PortSide.EAST
    if (__mergeEdges) graph.setProperty(MERGE_EDGES_KEY, true)
    // 边所在图 (LCA) 的 MERGE_EDGES (ELK ElkGraphImporter 源侧读边所在图; 目标侧读目标节点所在图).
    const __parentOf = new Map<number, number>()
    for (const [__p, __kids] of Object.entries(HIERARCHY)) for (const __k of __kids) __parentOf.set(__k, Number(__p))
    const __lcaMerge = (a: number, b: number): boolean => {
      const seen = new Set<number>()
      let x: number | undefined = a
      while (x !== undefined) { seen.add(x); x = __parentOf.get(x) }
      let y: number | undefined = b
      while (y !== undefined && !seen.has(y)) y = __parentOf.get(y)
      if (y === undefined) return graph.getProperty(MERGE_EDGES_KEY) === true
      const __py = __parentOf.get(y)
      const __g = __py === undefined ? graph : nestedGraphs.get(__py)!
      return __g.getProperty(MERGE_EDGES_KEY) === true
    }
    EDGE_IDX.forEach(([s, sp, , t, tp], ei) => {
      const __srcMerge = __lcaMerge(s, t)
      const __tgtMerge = nodeOf.get(t)!.getGraph()?.getProperty(MERGE_EDGES_KEY) === true
      const e = createSimpleEdge(nodeOf.get(s)!, nodeOf.get(t)!, sp, tp, __srcMerge, __tgtMerge)
      e.setProperty(MODEL_ORDER_KEY, ei)
      if (EDGE_YO[ei]) e.setProperty(INSIDE_SELF_LOOPS_YO_KEY, true)
      for (const l of EDGE_LABELS[ei]) {
        e.getLabels().push({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })
      }
    })
    if (Object.keys(HIERARCHY).length > 0) {
      graph.setProperty(HIERARCHY_HANDLING_KEY, 'INCLUDE_CHILDREN')
    }
    graph.setProperty(DIRECTION_KEY, 'RIGHT')
    graph.setProperty('org.eclipse.elk.algorithm', "layered")
    graph.setProperty('org.eclipse.elk.spacing.commentComment', 30)
    graph.setProperty('org.eclipse.elk.spacing.commentNode', 5)
    graph.setProperty('org.eclipse.elk.randomSeed', 1)

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

  it('坐标级差分: 与 jar 0.12.0 1:1 对齐', () => {
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
      n.setProperty(MODEL_ORDER_KEY, i)
      if (PORT_CONSTRAINTS[i]) {
        n.setProperty(PORT_CONSTRAINTS_KEY, PORT_CONSTRAINTS[i] as any)
      }
      for (const [k, v] of NODE_OPTS[i]) {
        n.setProperty(k, v as any)
      }
      for (const portDesc of NODE_PORTS[i]) {
        const port = new LPort()
        port.setNode(n)
        port.getPosition().x = portDesc.x
        port.getPosition().y = portDesc.y
        port.size = { x: portDesc.w, y: portDesc.h }
        if (portDesc.side) port.setSide(portDesc.side as any)
        if (portDesc.index !== null) port.setProperty(PORT_INDEX_KEY, portDesc.index)
        if (portDesc.borderOffset !== null) port.setProperty(PORT_BORDER_OFFSET_KEY, portDesc.borderOffset)
        if (portDesc.labels.length > 0) {
          port.setLabels(portDesc.labels.map((l) => ({ text: l.text, position: { x: l.x, y: l.y }, size: { x: l.width, y: l.height } })))
        }
      }
      if (NODE_ACTIVATE[i]) {
        n.setProperty(INSIDE_SELF_LOOPS_ACTIVATE_KEY, true)
      }
      if (NODE_LABELS[i].length > 0) {
        n.setLabels(NODE_LABELS[i].map((l) => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })))
      }
      nodeOf.set(i, n)
    }
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      const parent = nodeOf.get(p)!
      const nested = nestedGraphs.get(p)!
      parent.setNestedGraph(nested)
      nested.setParentNode(parent)
      // ★ 容器节点 label 占位 (SSOT: LABEL_PAD[i] = 子图 padding.top, 对齐 buildLGraphFromParsed)
      if (LABEL_PAD[p] !== undefined && LABEL_PAD[p] !== null) nested.setPadding(LABEL_PAD[p])
      // ★ 节点级 mergeEdges → 嵌套图 (ELK createLGraph copyProperties; LGraphUtil.createPort 读图属性)
      if (NODE_OPTS[p]?.some(([k]) => k === 'org.eclipse.elk.layered.mergeEdges')) nested.setProperty(MERGE_EDGES_KEY, true)
    }
    __mergeEdges = false
    __defaultSide = PortSide.EAST
    if (__mergeEdges) graph.setProperty(MERGE_EDGES_KEY, true)
    // 边所在图 (LCA) 的 MERGE_EDGES (ELK ElkGraphImporter 源侧读边所在图; 目标侧读目标节点所在图).
    const __parentOf = new Map<number, number>()
    for (const [__p, __kids] of Object.entries(HIERARCHY)) for (const __k of __kids) __parentOf.set(__k, Number(__p))
    const __lcaMerge = (a: number, b: number): boolean => {
      const seen = new Set<number>()
      let x: number | undefined = a
      while (x !== undefined) { seen.add(x); x = __parentOf.get(x) }
      let y: number | undefined = b
      while (y !== undefined && !seen.has(y)) y = __parentOf.get(y)
      if (y === undefined) return graph.getProperty(MERGE_EDGES_KEY) === true
      const __py = __parentOf.get(y)
      const __g = __py === undefined ? graph : nestedGraphs.get(__py)!
      return __g.getProperty(MERGE_EDGES_KEY) === true
    }
    EDGE_IDX.forEach(([s, sp, , t, tp], ei) => {
      const __srcMerge = __lcaMerge(s, t)
      const __tgtMerge = nodeOf.get(t)!.getGraph()?.getProperty(MERGE_EDGES_KEY) === true
      const e = createSimpleEdge(nodeOf.get(s)!, nodeOf.get(t)!, sp, tp, __srcMerge, __tgtMerge)
      e.setProperty(MODEL_ORDER_KEY, ei)
      if (EDGE_YO[ei]) e.setProperty(INSIDE_SELF_LOOPS_YO_KEY, true)
      for (const l of EDGE_LABELS[ei]) {
        e.getLabels().push({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })
      }
    })
    if (Object.keys(HIERARCHY).length > 0) {
      graph.setProperty(HIERARCHY_HANDLING_KEY, 'INCLUDE_CHILDREN')
    }
    graph.setProperty(DIRECTION_KEY, 'RIGHT')
    graph.setProperty('org.eclipse.elk.algorithm', "layered")
    graph.setProperty('org.eclipse.elk.spacing.commentComment', 30)
    graph.setProperty('org.eclipse.elk.spacing.commentNode', 5)
    graph.setProperty('org.eclipse.elk.randomSeed', 1)

    new LayeredLayoutProvider().layout(graph)

    if (false) {
      for (const n of nodeOf.values()) {
        expect(Number.isFinite(n.position.x)).toBe(true)
        expect(Number.isFinite(n.position.y)).toBe(true)
      }
      return
    }

    // L1 (M3): 与 ELK Java 0.12.0 jar oracle 坐标级差分 (容差 ε = 2).
    // oracle 坐标相对父块 (jar getX/getY); ggn 子图节点坐标同样相对父 → 直接对比, 无需世界坐标累加.
    const oracle = JSON.parse(readFileSync(new URL('../../../test-resources/jar-oracle/examples__general__spacing__comments.json', import.meta.url), 'utf8'))
    expect(oracle.hash, 'jar oracle 过期/缺失, 请重跑 node scripts/generate-jar-oracle.mjs').toBe('3f3c624628a2f1cf')
    // ELK 类加载顺序变体 (EdgeMain vs BatchMain): oracle.variants 记录另一变体, 任一匹配即通过.
    const variants = oracle.variants ?? []
    for (let i = 0; i < DIMS.length; i++) {
      const gn = nodeOf.get(i)!
      const nm = 'N' + NAMES[i]
      const cands = [oracle.coords[nm], ...variants.map((v) => v.coords[nm])].filter(Boolean)
      expect(cands.length, nm + ' 缺少 jar oracle 坐标').toBeGreaterThan(0)
      const bestX = Math.min(...cands.map((c) => Math.abs(gn.position.x - c.x)))
      const bestY = Math.min(...cands.map((c) => Math.abs(gn.position.y - c.y)))
      expect(bestX, nm + ' x').toBeLessThanOrEqual(2)
      expect(bestY, nm + ' y').toBeLessThanOrEqual(2)
    }
  })
})

/**
 * elkt 生成: examples__general__spacing__padding
 * 图: 12 节点 / 0 边 / 0 层级块
 * 差分: 坐标级 (1:1 ELK 对齐)
 */

describe('elkt 生成: examples__general__spacing__padding', () => {
  const HIERARCHY: Record<number, number[]> = {"0":[1],"2":[3],"4":[5],"6":[7],"8":[9],"10":[11]}
  const EDGE_IDX: [number, number | null, string | null, number, number | null, string | null][] = []
  const EDGE_YO: boolean[] = []
  const EDGE_LABELS: { text: string; width: number; height: number; placement: string | null }[][] = []
  const DIMS: [number, number][] = [[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30],[60,30]]
  const NAMES: string[] = ["n1","n1.subNode","n2","n2.subNode","n3","n3.subNode","n4","n4.subNode","n5","n5.subNode","n6","n6.subNode"]
  const PORT_IDS: string[] = []
  const PORT_CONSTRAINTS: (string | null)[] = [null,null,null,null,null,null,null,null,null,null,null,null]
  const NODE_PORTS: { id: string; x: number; y: number; w: number; h: number; side: string | null; index: number | null; borderOffset: number | null; labels: { text: string; x: number; y: number; width: number; height: number }[] }[][] = [[],[],[],[],[],[],[],[],[],[],[],[]]
  const NODE_ACTIVATE: boolean[] = [false,false,false,false,false,false,false,false,false,false,false,false]
  const NODE_LABELS: { text: string; width: number; height: number; placement: string | null }[][] = [[{"text":"Node 1","width":40,"height":17,"placement":null}],[],[{"text":"Node 2","width":40,"height":17,"placement":null}],[],[{"text":"Node 3","width":40,"height":17,"placement":null}],[],[{"text":"Node 4","width":40,"height":17,"placement":null}],[],[{"text":"Node 5","width":40,"height":17,"placement":null}],[],[{"text":"Node 6","width":40,"height":17,"placement":null}],[]]
  const LABEL_PAD: ({ top: number; left: number; right: number; bottom: number } | null)[] = [{"top":12,"bottom":12,"left":12,"right":12},null,{"top":20,"bottom":20,"left":20,"right":20},null,{"top":34,"bottom":12,"left":12,"right":12},null,{"top":20,"bottom":0,"left":5,"right":35},null,{"top":0,"bottom":0,"left":5,"right":15},null,{"top":22,"bottom":0,"left":5,"right":15},null]
  const NODE_OPTS: [string, unknown][][] = [[],[],[["org.eclipse.elk.padding",{"top":20,"left":20,"bottom":20,"right":20}]],[],[["org.eclipse.elk.nodeLabels.placement",["INSIDE","V_TOP","H_CENTER"]]],[],[["org.eclipse.elk.padding",{"top":20,"left":5,"bottom":0,"right":35}]],[],[["org.eclipse.elk.padding",{"top":0,"left":5,"bottom":0,"right":15}]],[],[["org.eclipse.elk.padding",{"top":0,"left":5,"bottom":0,"right":15}],["org.eclipse.elk.nodeLabels.placement",["H_CENTER","V_TOP","INSIDE"]]],[]]

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
      n.setProperty(MODEL_ORDER_KEY, i)
      if (PORT_CONSTRAINTS[i]) {
        n.setProperty(PORT_CONSTRAINTS_KEY, PORT_CONSTRAINTS[i] as any)
      }
      for (const [k, v] of NODE_OPTS[i]) {
        n.setProperty(k, v as any)
      }
      for (const portDesc of NODE_PORTS[i]) {
        const port = new LPort()
        port.setNode(n)
        port.getPosition().x = portDesc.x
        port.getPosition().y = portDesc.y
        port.size = { x: portDesc.w, y: portDesc.h }
        if (portDesc.side) port.setSide(portDesc.side as any)
        if (portDesc.index !== null) port.setProperty(PORT_INDEX_KEY, portDesc.index)
        if (portDesc.borderOffset !== null) port.setProperty(PORT_BORDER_OFFSET_KEY, portDesc.borderOffset)
        if (portDesc.labels.length > 0) {
          port.setLabels(portDesc.labels.map((l) => ({ text: l.text, position: { x: l.x, y: l.y }, size: { x: l.width, y: l.height } })))
        }
      }
      if (NODE_ACTIVATE[i]) {
        n.setProperty(INSIDE_SELF_LOOPS_ACTIVATE_KEY, true)
      }
      if (NODE_LABELS[i].length > 0) {
        n.setLabels(NODE_LABELS[i].map((l) => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })))
      }
      nodeOf.set(i, n)
      graphNodes.push(n)
    }
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      const parent = nodeOf.get(p)!
      const nested = nestedGraphs.get(p)!
      parent.setNestedGraph(nested)
      nested.setParentNode(parent)
      // ★ 容器节点 label 占位 (SSOT: LABEL_PAD[i] = 子图 padding.top, 对齐 buildLGraphFromParsed)
      if (LABEL_PAD[p] !== undefined && LABEL_PAD[p] !== null) nested.setPadding(LABEL_PAD[p])
      // ★ 节点级 mergeEdges → 嵌套图 (ELK createLGraph copyProperties; LGraphUtil.createPort 读图属性)
      if (NODE_OPTS[p]?.some(([k]) => k === 'org.eclipse.elk.layered.mergeEdges')) nested.setProperty(MERGE_EDGES_KEY, true)
    }
    __mergeEdges = false
    __defaultSide = PortSide.EAST
    if (__mergeEdges) graph.setProperty(MERGE_EDGES_KEY, true)
    // 边所在图 (LCA) 的 MERGE_EDGES (ELK ElkGraphImporter 源侧读边所在图; 目标侧读目标节点所在图).
    const __parentOf = new Map<number, number>()
    for (const [__p, __kids] of Object.entries(HIERARCHY)) for (const __k of __kids) __parentOf.set(__k, Number(__p))
    const __lcaMerge = (a: number, b: number): boolean => {
      const seen = new Set<number>()
      let x: number | undefined = a
      while (x !== undefined) { seen.add(x); x = __parentOf.get(x) }
      let y: number | undefined = b
      while (y !== undefined && !seen.has(y)) y = __parentOf.get(y)
      if (y === undefined) return graph.getProperty(MERGE_EDGES_KEY) === true
      const __py = __parentOf.get(y)
      const __g = __py === undefined ? graph : nestedGraphs.get(__py)!
      return __g.getProperty(MERGE_EDGES_KEY) === true
    }
    EDGE_IDX.forEach(([s, sp, , t, tp], ei) => {
      const __srcMerge = __lcaMerge(s, t)
      const __tgtMerge = nodeOf.get(t)!.getGraph()?.getProperty(MERGE_EDGES_KEY) === true
      const e = createSimpleEdge(nodeOf.get(s)!, nodeOf.get(t)!, sp, tp, __srcMerge, __tgtMerge)
      e.setProperty(MODEL_ORDER_KEY, ei)
      if (EDGE_YO[ei]) e.setProperty(INSIDE_SELF_LOOPS_YO_KEY, true)
      for (const l of EDGE_LABELS[ei]) {
        e.getLabels().push({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })
      }
    })
    if (Object.keys(HIERARCHY).length > 0) {
      graph.setProperty(HIERARCHY_HANDLING_KEY, 'INCLUDE_CHILDREN')
    }
    graph.setProperty(DIRECTION_KEY, 'RIGHT')
    graph.setProperty('org.eclipse.elk.algorithm', "layered")
    graph.setProperty('org.eclipse.elk.layered.considerModelOrder.components', "MODEL_ORDER")
    graph.setProperty('org.eclipse.elk.randomSeed', 1)

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

  it('坐标级差分: 与 jar 0.12.0 1:1 对齐', () => {
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
      n.setProperty(MODEL_ORDER_KEY, i)
      if (PORT_CONSTRAINTS[i]) {
        n.setProperty(PORT_CONSTRAINTS_KEY, PORT_CONSTRAINTS[i] as any)
      }
      for (const [k, v] of NODE_OPTS[i]) {
        n.setProperty(k, v as any)
      }
      for (const portDesc of NODE_PORTS[i]) {
        const port = new LPort()
        port.setNode(n)
        port.getPosition().x = portDesc.x
        port.getPosition().y = portDesc.y
        port.size = { x: portDesc.w, y: portDesc.h }
        if (portDesc.side) port.setSide(portDesc.side as any)
        if (portDesc.index !== null) port.setProperty(PORT_INDEX_KEY, portDesc.index)
        if (portDesc.borderOffset !== null) port.setProperty(PORT_BORDER_OFFSET_KEY, portDesc.borderOffset)
        if (portDesc.labels.length > 0) {
          port.setLabels(portDesc.labels.map((l) => ({ text: l.text, position: { x: l.x, y: l.y }, size: { x: l.width, y: l.height } })))
        }
      }
      if (NODE_ACTIVATE[i]) {
        n.setProperty(INSIDE_SELF_LOOPS_ACTIVATE_KEY, true)
      }
      if (NODE_LABELS[i].length > 0) {
        n.setLabels(NODE_LABELS[i].map((l) => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })))
      }
      nodeOf.set(i, n)
    }
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      const parent = nodeOf.get(p)!
      const nested = nestedGraphs.get(p)!
      parent.setNestedGraph(nested)
      nested.setParentNode(parent)
      // ★ 容器节点 label 占位 (SSOT: LABEL_PAD[i] = 子图 padding.top, 对齐 buildLGraphFromParsed)
      if (LABEL_PAD[p] !== undefined && LABEL_PAD[p] !== null) nested.setPadding(LABEL_PAD[p])
      // ★ 节点级 mergeEdges → 嵌套图 (ELK createLGraph copyProperties; LGraphUtil.createPort 读图属性)
      if (NODE_OPTS[p]?.some(([k]) => k === 'org.eclipse.elk.layered.mergeEdges')) nested.setProperty(MERGE_EDGES_KEY, true)
    }
    __mergeEdges = false
    __defaultSide = PortSide.EAST
    if (__mergeEdges) graph.setProperty(MERGE_EDGES_KEY, true)
    // 边所在图 (LCA) 的 MERGE_EDGES (ELK ElkGraphImporter 源侧读边所在图; 目标侧读目标节点所在图).
    const __parentOf = new Map<number, number>()
    for (const [__p, __kids] of Object.entries(HIERARCHY)) for (const __k of __kids) __parentOf.set(__k, Number(__p))
    const __lcaMerge = (a: number, b: number): boolean => {
      const seen = new Set<number>()
      let x: number | undefined = a
      while (x !== undefined) { seen.add(x); x = __parentOf.get(x) }
      let y: number | undefined = b
      while (y !== undefined && !seen.has(y)) y = __parentOf.get(y)
      if (y === undefined) return graph.getProperty(MERGE_EDGES_KEY) === true
      const __py = __parentOf.get(y)
      const __g = __py === undefined ? graph : nestedGraphs.get(__py)!
      return __g.getProperty(MERGE_EDGES_KEY) === true
    }
    EDGE_IDX.forEach(([s, sp, , t, tp], ei) => {
      const __srcMerge = __lcaMerge(s, t)
      const __tgtMerge = nodeOf.get(t)!.getGraph()?.getProperty(MERGE_EDGES_KEY) === true
      const e = createSimpleEdge(nodeOf.get(s)!, nodeOf.get(t)!, sp, tp, __srcMerge, __tgtMerge)
      e.setProperty(MODEL_ORDER_KEY, ei)
      if (EDGE_YO[ei]) e.setProperty(INSIDE_SELF_LOOPS_YO_KEY, true)
      for (const l of EDGE_LABELS[ei]) {
        e.getLabels().push({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })
      }
    })
    if (Object.keys(HIERARCHY).length > 0) {
      graph.setProperty(HIERARCHY_HANDLING_KEY, 'INCLUDE_CHILDREN')
    }
    graph.setProperty(DIRECTION_KEY, 'RIGHT')
    graph.setProperty('org.eclipse.elk.algorithm', "layered")
    graph.setProperty('org.eclipse.elk.layered.considerModelOrder.components', "MODEL_ORDER")
    graph.setProperty('org.eclipse.elk.randomSeed', 1)

    new LayeredLayoutProvider().layout(graph)

    if (false) {
      for (const n of nodeOf.values()) {
        expect(Number.isFinite(n.position.x)).toBe(true)
        expect(Number.isFinite(n.position.y)).toBe(true)
      }
      return
    }

    // L1 (M3): 与 ELK Java 0.12.0 jar oracle 坐标级差分 (容差 ε = 2).
    // oracle 坐标相对父块 (jar getX/getY); ggn 子图节点坐标同样相对父 → 直接对比, 无需世界坐标累加.
    const oracle = JSON.parse(readFileSync(new URL('../../../test-resources/jar-oracle/examples__general__spacing__padding.json', import.meta.url), 'utf8'))
    expect(oracle.hash, 'jar oracle 过期/缺失, 请重跑 node scripts/generate-jar-oracle.mjs').toBe('ea18b36f199855c0')
    // ELK 类加载顺序变体 (EdgeMain vs BatchMain): oracle.variants 记录另一变体, 任一匹配即通过.
    const variants = oracle.variants ?? []
    for (let i = 0; i < DIMS.length; i++) {
      const gn = nodeOf.get(i)!
      const nm = 'N' + NAMES[i]
      const cands = [oracle.coords[nm], ...variants.map((v) => v.coords[nm])].filter(Boolean)
      expect(cands.length, nm + ' 缺少 jar oracle 坐标').toBeGreaterThan(0)
      const bestX = Math.min(...cands.map((c) => Math.abs(gn.position.x - c.x)))
      const bestY = Math.min(...cands.map((c) => Math.abs(gn.position.y - c.y)))
      expect(bestX, nm + ' x').toBeLessThanOrEqual(2)
      expect(bestY, nm + ' y').toBeLessThanOrEqual(2)
    }
  })
})

describe('elkt 生成: examples__hierarchy__hierarchicalLayoutMixing', () => {
  // 含非 layered 算法 (stress/force): P2 图级路径不适用, 差分由 verify-elkg-java-layout (api 路径) 覆盖.
  it.skip('差分由 verify api 路径覆盖 (stress/force)', () => {})
})
/**
 * elkt 生成: examples__hierarchy__hierarchicalEdges
 * 图: 5 节点 / 2 边 / 0 层级块
 * 差分: 坐标级 (1:1 ELK 对齐)
 */

describe('elkt 生成: examples__hierarchy__hierarchicalEdges', () => {
  const HIERARCHY: Record<number, number[]> = {"1":[2],"2":[3,4]}
  const EDGE_IDX: [number, number | null, string | null, number, number | null, string | null][] = [[3,null,null,4,null,null],[0,null,null,3,null,null]]
  const EDGE_YO: boolean[] = [false,false]
  const EDGE_LABELS: { text: string; width: number; height: number; placement: string | null }[][] = [[],[]]
  const DIMS: [number, number][] = [[60,30],[60,30],[60,30],[60,30],[60,30]]
  const NAMES: string[] = ["source","outside","outside.inside","outside.inside.n1","outside.inside.n2"]
  const PORT_IDS: string[] = []
  const PORT_CONSTRAINTS: (string | null)[] = [null,null,null,null,null]
  const NODE_PORTS: { id: string; x: number; y: number; w: number; h: number; side: string | null; index: number | null; borderOffset: number | null; labels: { text: string; x: number; y: number; width: number; height: number }[] }[][] = [[],[],[],[],[]]
  const NODE_ACTIVATE: boolean[] = [false,false,false,false,false]
  const NODE_LABELS: { text: string; width: number; height: number; placement: string | null }[][] = [[],[],[],[],[]]
  const LABEL_PAD: ({ top: number; left: number; right: number; bottom: number } | null)[] = [null,{"top":12,"bottom":12,"left":12,"right":12},{"top":12,"bottom":12,"left":12,"right":12},null,null]
  const NODE_OPTS: [string, unknown][][] = [[],[],[],[],[]]

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
      n.setProperty(MODEL_ORDER_KEY, i)
      if (PORT_CONSTRAINTS[i]) {
        n.setProperty(PORT_CONSTRAINTS_KEY, PORT_CONSTRAINTS[i] as any)
      }
      for (const [k, v] of NODE_OPTS[i]) {
        n.setProperty(k, v as any)
      }
      for (const portDesc of NODE_PORTS[i]) {
        const port = new LPort()
        port.setNode(n)
        port.getPosition().x = portDesc.x
        port.getPosition().y = portDesc.y
        port.size = { x: portDesc.w, y: portDesc.h }
        if (portDesc.side) port.setSide(portDesc.side as any)
        if (portDesc.index !== null) port.setProperty(PORT_INDEX_KEY, portDesc.index)
        if (portDesc.borderOffset !== null) port.setProperty(PORT_BORDER_OFFSET_KEY, portDesc.borderOffset)
        if (portDesc.labels.length > 0) {
          port.setLabels(portDesc.labels.map((l) => ({ text: l.text, position: { x: l.x, y: l.y }, size: { x: l.width, y: l.height } })))
        }
      }
      if (NODE_ACTIVATE[i]) {
        n.setProperty(INSIDE_SELF_LOOPS_ACTIVATE_KEY, true)
      }
      if (NODE_LABELS[i].length > 0) {
        n.setLabels(NODE_LABELS[i].map((l) => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })))
      }
      nodeOf.set(i, n)
      graphNodes.push(n)
    }
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      const parent = nodeOf.get(p)!
      const nested = nestedGraphs.get(p)!
      parent.setNestedGraph(nested)
      nested.setParentNode(parent)
      // ★ 容器节点 label 占位 (SSOT: LABEL_PAD[i] = 子图 padding.top, 对齐 buildLGraphFromParsed)
      if (LABEL_PAD[p] !== undefined && LABEL_PAD[p] !== null) nested.setPadding(LABEL_PAD[p])
      // ★ 节点级 mergeEdges → 嵌套图 (ELK createLGraph copyProperties; LGraphUtil.createPort 读图属性)
      if (NODE_OPTS[p]?.some(([k]) => k === 'org.eclipse.elk.layered.mergeEdges')) nested.setProperty(MERGE_EDGES_KEY, true)
    }
    __mergeEdges = false
    __defaultSide = PortSide.EAST
    if (__mergeEdges) graph.setProperty(MERGE_EDGES_KEY, true)
    // 边所在图 (LCA) 的 MERGE_EDGES (ELK ElkGraphImporter 源侧读边所在图; 目标侧读目标节点所在图).
    const __parentOf = new Map<number, number>()
    for (const [__p, __kids] of Object.entries(HIERARCHY)) for (const __k of __kids) __parentOf.set(__k, Number(__p))
    const __lcaMerge = (a: number, b: number): boolean => {
      const seen = new Set<number>()
      let x: number | undefined = a
      while (x !== undefined) { seen.add(x); x = __parentOf.get(x) }
      let y: number | undefined = b
      while (y !== undefined && !seen.has(y)) y = __parentOf.get(y)
      if (y === undefined) return graph.getProperty(MERGE_EDGES_KEY) === true
      const __py = __parentOf.get(y)
      const __g = __py === undefined ? graph : nestedGraphs.get(__py)!
      return __g.getProperty(MERGE_EDGES_KEY) === true
    }
    EDGE_IDX.forEach(([s, sp, , t, tp], ei) => {
      const __srcMerge = __lcaMerge(s, t)
      const __tgtMerge = nodeOf.get(t)!.getGraph()?.getProperty(MERGE_EDGES_KEY) === true
      const e = createSimpleEdge(nodeOf.get(s)!, nodeOf.get(t)!, sp, tp, __srcMerge, __tgtMerge)
      e.setProperty(MODEL_ORDER_KEY, ei)
      if (EDGE_YO[ei]) e.setProperty(INSIDE_SELF_LOOPS_YO_KEY, true)
      for (const l of EDGE_LABELS[ei]) {
        e.getLabels().push({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })
      }
    })
    if (Object.keys(HIERARCHY).length > 0) {
      graph.setProperty(HIERARCHY_HANDLING_KEY, 'INCLUDE_CHILDREN')
    }
    graph.setProperty(DIRECTION_KEY, 'RIGHT')
    graph.setProperty('org.eclipse.elk.algorithm', "elk.layered")
    graph.setProperty('org.eclipse.elk.hierarchyHandling', "INCLUDE_CHILDREN")
    graph.setProperty('org.eclipse.elk.randomSeed', 1)

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

  it('坐标级差分: 与 jar 0.12.0 1:1 对齐', () => {
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
      n.setProperty(MODEL_ORDER_KEY, i)
      if (PORT_CONSTRAINTS[i]) {
        n.setProperty(PORT_CONSTRAINTS_KEY, PORT_CONSTRAINTS[i] as any)
      }
      for (const [k, v] of NODE_OPTS[i]) {
        n.setProperty(k, v as any)
      }
      for (const portDesc of NODE_PORTS[i]) {
        const port = new LPort()
        port.setNode(n)
        port.getPosition().x = portDesc.x
        port.getPosition().y = portDesc.y
        port.size = { x: portDesc.w, y: portDesc.h }
        if (portDesc.side) port.setSide(portDesc.side as any)
        if (portDesc.index !== null) port.setProperty(PORT_INDEX_KEY, portDesc.index)
        if (portDesc.borderOffset !== null) port.setProperty(PORT_BORDER_OFFSET_KEY, portDesc.borderOffset)
        if (portDesc.labels.length > 0) {
          port.setLabels(portDesc.labels.map((l) => ({ text: l.text, position: { x: l.x, y: l.y }, size: { x: l.width, y: l.height } })))
        }
      }
      if (NODE_ACTIVATE[i]) {
        n.setProperty(INSIDE_SELF_LOOPS_ACTIVATE_KEY, true)
      }
      if (NODE_LABELS[i].length > 0) {
        n.setLabels(NODE_LABELS[i].map((l) => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })))
      }
      nodeOf.set(i, n)
    }
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      const parent = nodeOf.get(p)!
      const nested = nestedGraphs.get(p)!
      parent.setNestedGraph(nested)
      nested.setParentNode(parent)
      // ★ 容器节点 label 占位 (SSOT: LABEL_PAD[i] = 子图 padding.top, 对齐 buildLGraphFromParsed)
      if (LABEL_PAD[p] !== undefined && LABEL_PAD[p] !== null) nested.setPadding(LABEL_PAD[p])
      // ★ 节点级 mergeEdges → 嵌套图 (ELK createLGraph copyProperties; LGraphUtil.createPort 读图属性)
      if (NODE_OPTS[p]?.some(([k]) => k === 'org.eclipse.elk.layered.mergeEdges')) nested.setProperty(MERGE_EDGES_KEY, true)
    }
    __mergeEdges = false
    __defaultSide = PortSide.EAST
    if (__mergeEdges) graph.setProperty(MERGE_EDGES_KEY, true)
    // 边所在图 (LCA) 的 MERGE_EDGES (ELK ElkGraphImporter 源侧读边所在图; 目标侧读目标节点所在图).
    const __parentOf = new Map<number, number>()
    for (const [__p, __kids] of Object.entries(HIERARCHY)) for (const __k of __kids) __parentOf.set(__k, Number(__p))
    const __lcaMerge = (a: number, b: number): boolean => {
      const seen = new Set<number>()
      let x: number | undefined = a
      while (x !== undefined) { seen.add(x); x = __parentOf.get(x) }
      let y: number | undefined = b
      while (y !== undefined && !seen.has(y)) y = __parentOf.get(y)
      if (y === undefined) return graph.getProperty(MERGE_EDGES_KEY) === true
      const __py = __parentOf.get(y)
      const __g = __py === undefined ? graph : nestedGraphs.get(__py)!
      return __g.getProperty(MERGE_EDGES_KEY) === true
    }
    EDGE_IDX.forEach(([s, sp, , t, tp], ei) => {
      const __srcMerge = __lcaMerge(s, t)
      const __tgtMerge = nodeOf.get(t)!.getGraph()?.getProperty(MERGE_EDGES_KEY) === true
      const e = createSimpleEdge(nodeOf.get(s)!, nodeOf.get(t)!, sp, tp, __srcMerge, __tgtMerge)
      e.setProperty(MODEL_ORDER_KEY, ei)
      if (EDGE_YO[ei]) e.setProperty(INSIDE_SELF_LOOPS_YO_KEY, true)
      for (const l of EDGE_LABELS[ei]) {
        e.getLabels().push({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })
      }
    })
    if (Object.keys(HIERARCHY).length > 0) {
      graph.setProperty(HIERARCHY_HANDLING_KEY, 'INCLUDE_CHILDREN')
    }
    graph.setProperty(DIRECTION_KEY, 'RIGHT')
    graph.setProperty('org.eclipse.elk.algorithm', "elk.layered")
    graph.setProperty('org.eclipse.elk.hierarchyHandling', "INCLUDE_CHILDREN")
    graph.setProperty('org.eclipse.elk.randomSeed', 1)

    new LayeredLayoutProvider().layout(graph)

    if (false) {
      for (const n of nodeOf.values()) {
        expect(Number.isFinite(n.position.x)).toBe(true)
        expect(Number.isFinite(n.position.y)).toBe(true)
      }
      return
    }

    // L1 (M3): 与 ELK Java 0.12.0 jar oracle 坐标级差分 (容差 ε = 2).
    // oracle 坐标相对父块 (jar getX/getY); ggn 子图节点坐标同样相对父 → 直接对比, 无需世界坐标累加.
    const oracle = JSON.parse(readFileSync(new URL('../../../test-resources/jar-oracle/examples__hierarchy__hierarchicalEdges.json', import.meta.url), 'utf8'))
    expect(oracle.hash, 'jar oracle 过期/缺失, 请重跑 node scripts/generate-jar-oracle.mjs').toBe('948cc4300ce0bb2c')
    // ELK 类加载顺序变体 (EdgeMain vs BatchMain): oracle.variants 记录另一变体, 任一匹配即通过.
    const variants = oracle.variants ?? []
    for (let i = 0; i < DIMS.length; i++) {
      const gn = nodeOf.get(i)!
      const nm = 'N' + NAMES[i]
      const cands = [oracle.coords[nm], ...variants.map((v) => v.coords[nm])].filter(Boolean)
      expect(cands.length, nm + ' 缺少 jar oracle 坐标').toBeGreaterThan(0)
      const bestX = Math.min(...cands.map((c) => Math.abs(gn.position.x - c.x)))
      const bestY = Math.min(...cands.map((c) => Math.abs(gn.position.y - c.y)))
      expect(bestX, nm + ' x').toBeLessThanOrEqual(2)
      expect(bestY, nm + ' y').toBeLessThanOrEqual(2)
    }
  })
})
