/**
 * EdgeAndLayerConstraintEdgeReverser (ggn 移植) 单元测试.
 *
 * SSOT: ELK Java 0.12.0
 *   plugins/org.eclipse.elk.alg.layered/src/org/eclipse/elk/alg/layered/intermediate/
 *     EdgeAndLayerConstraintEdgeReverser.java
 *
 * 语义:
 *   - FIRST/FIRST_SEPARATE 节点 → EDGE_CONSTRAINT=OUTGOING_ONLY, 反转入边 (reverseEdges OUTPUT);
 *   - LAST/LAST_SEPARATE 节点 → EDGE_CONSTRAINT=OUTGOING_ONLY, 反转出边 (reverseEdges INPUT);
 *   - FIXED_SIDE 且所有端口均为「反向」(EAST netFlow>0 / WEST netFlow<0, 且对端无 FIRST/LAST 约束)
 *     的节点 → 反转全部边 (feedback node 语义).
 *   - 守卫: 已反转边不二次反转; LAST→LABEL / LAST→LAST_SEPARATE 不反转出边;
 *     FIRST←LABEL / FIRST←FIRST_SEPARATE 不反转入边.
 */
import { describe, expect, it } from 'vitest'
import { LGraph, LNode, LPort, LEdge, PortSide, PortConstraints, NodeType, LayerConstraint } from '../../src/index.js'
import { EdgeAndLayerConstraintEdgeReverser } from '../../src/intermediate/edge-and-layer-constraint-edge-reverser.js'
import { REVERSED } from '../../src/options/internal-properties.js'
import { EDGE_CONSTRAINT, PORT_CONSTRAINTS } from '../../src/options/layered-options.js'
import { EdgeConstraint } from '../../src/graph/enums.js'

function makeNode(g: LGraph, lc: LayerConstraint | null = null, pc: PortConstraints = PortConstraints.FREE): LNode {
  const n = new LNode(g)
  n.setType(NodeType.NORMAL)
  if (lc !== null) n.setLayerConstraint(lc)
  n.setProperty(PORT_CONSTRAINTS, pc)
  return n
}

function addPort(n: LNode, side: PortSide): LPort {
  const p = new LPort()
  p.setNode(n)
  p.setSide(side)
  return p
}

function edge(from: LPort, to: LPort): LEdge {
  const e = new LEdge()
  e.setSource(from)
  e.setTarget(to)
  return e
}

function reversedOf(e: LEdge): boolean {
  return e.getProperty(REVERSED)
}

describe('EdgeAndLayerConstraintEdgeReverser (ELK Java 0.12.0 移植)', () => {
  it('FIRST 节点: EDGE_CONSTRAINT=OUTGOING_ONLY, 反转入边 (reverseEdges OUTPUT)', () => {
    const g = new LGraph()
    const first = makeNode(g, LayerConstraint.FIRST)
    const other = makeNode(g)
    const inEdge = edge(addPort(other, PortSide.EAST), addPort(first, PortSide.WEST))
    const outEdge = edge(addPort(first, PortSide.EAST), addPort(other, PortSide.WEST))

    new EdgeAndLayerConstraintEdgeReverser().process(g)

    expect(first.getProperty(EDGE_CONSTRAINT)).toBe(EdgeConstraint.OUTGOING_ONLY)
    // 入边被反转 (现在源=first 端口)
    expect(reversedOf(inEdge)).toBe(true)
    expect(inEdge.getSource()!.getNode()).toBe(first)
    // 出边保持
    expect(reversedOf(outEdge)).toBe(false)
    // 不变量: 无悬挂边
    expect(inEdge.getTarget()).not.toBeNull()
    expect(outEdge.getSource()).not.toBeNull()
  })

  it('LAST 节点: EDGE_CONSTRAINT=OUTGOING_ONLY, 反转出边 (reverseEdges INPUT)', () => {
    const g = new LGraph()
    const last = makeNode(g, LayerConstraint.LAST)
    const other = makeNode(g)
    const outEdge = edge(addPort(last, PortSide.EAST), addPort(other, PortSide.WEST))
    const inEdge = edge(addPort(other, PortSide.EAST), addPort(last, PortSide.WEST))

    new EdgeAndLayerConstraintEdgeReverser().process(g)

    expect(last.getProperty(EDGE_CONSTRAINT)).toBe(EdgeConstraint.OUTGOING_ONLY)
    expect(reversedOf(outEdge)).toBe(true)
    expect(outEdge.getTarget()!.getNode()).toBe(last)
    expect(reversedOf(inEdge)).toBe(false)
  })

  it('FIRST_SEPARATE / LAST_SEPARATE: 映射与 FIRST/LAST 相同', () => {
    const g = new LGraph()
    const fs = makeNode(g, LayerConstraint.FIRST_SEPARATE)
    const ls = makeNode(g, LayerConstraint.LAST_SEPARATE)
    const other = makeNode(g)
    const fsIn = edge(addPort(other, PortSide.EAST), addPort(fs, PortSide.WEST))
    const lsOut = edge(addPort(ls, PortSide.EAST), addPort(other, PortSide.WEST))

    new EdgeAndLayerConstraintEdgeReverser().process(g)

    expect(fs.getProperty(EDGE_CONSTRAINT)).toBe(EdgeConstraint.OUTGOING_ONLY)
    expect(ls.getProperty(EDGE_CONSTRAINT)).toBe(EdgeConstraint.OUTGOING_ONLY)
    expect(reversedOf(fsIn)).toBe(true)
    expect(reversedOf(lsOut)).toBe(true)
  })

  it('守卫: LAST 节点的出边指向 LABEL / LAST_SEPARATE 时不反转', () => {
    const g = new LGraph()
    const last = makeNode(g, LayerConstraint.LAST)
    const label = makeNode(g)
    label.setType(NodeType.LABEL)
    const lsNode = makeNode(g, LayerConstraint.LAST_SEPARATE)
    const eLabel = edge(addPort(last, PortSide.EAST), addPort(label, PortSide.WEST))
    const eLs = edge(addPort(last, PortSide.EAST), addPort(lsNode, PortSide.WEST))

    new EdgeAndLayerConstraintEdgeReverser().process(g)

    expect(reversedOf(eLabel)).toBe(false)
    expect(reversedOf(eLs)).toBe(false)
  })

  it('守卫: FIRST 节点的入边来自 LABEL / FIRST_SEPARATE 时不反转', () => {
    const g = new LGraph()
    const first = makeNode(g, LayerConstraint.FIRST)
    const label = makeNode(g)
    label.setType(NodeType.LABEL)
    const fsNode = makeNode(g, LayerConstraint.FIRST_SEPARATE)
    const eLabel = edge(addPort(label, PortSide.EAST), addPort(first, PortSide.WEST))
    const eFs = edge(addPort(fsNode, PortSide.EAST), addPort(first, PortSide.WEST))

    new EdgeAndLayerConstraintEdgeReverser().process(g)

    expect(reversedOf(eLabel)).toBe(false)
    expect(reversedOf(eFs)).toBe(false)
  })

  it('守卫: 已反转边不二次反转 (REVERSED=true)', () => {
    const g = new LGraph()
    const last = makeNode(g, LayerConstraint.LAST)
    const other = makeNode(g)
    const e = edge(addPort(last, PortSide.EAST), addPort(other, PortSide.WEST))
    e.setProperty(REVERSED, true)

    new EdgeAndLayerConstraintEdgeReverser().process(g)

    expect(reversedOf(e)).toBe(true)
    expect(e.getSource()!.getNode()).toBe(last) // 未再次反转
  })

  it('FIXED_SIDE + 全部反向端口 (EAST netFlow>0, WEST netFlow<0): 反转全部边 (feedback node)', () => {
    const g = new LGraph()
    const fb = makeNode(g, null, PortConstraints.FIXED_SIDE)
    const eastPort = addPort(fb, PortSide.EAST)
    const westPort = addPort(fb, PortSide.WEST)
    const left = makeNode(g)
    const right = makeNode(g)
    const eEast = edge(addPort(left, PortSide.EAST), eastPort)   // EAST 入边 netFlow=1>0
    const eWest = edge(westPort, addPort(right, PortSide.WEST))  // WEST 出边 netFlow=-1<0

    new EdgeAndLayerConstraintEdgeReverser().process(g)

    // 全部边反转 (UNDEFINED 分支: 出边与入边都处理)
    expect(reversedOf(eEast)).toBe(true)
    expect(reversedOf(eWest)).toBe(true)
    expect(eEast.getSource()!.getNode()).toBe(fb)
    expect(eWest.getTarget()!.getNode()).toBe(fb)
  })

  it('FIXED_SIDE 但端口不全部反向: 不反转 (EAST netFlow=0)', () => {
    const g = new LGraph()
    const fb = makeNode(g, null, PortConstraints.FIXED_SIDE)
    const eastPort = addPort(fb, PortSide.EAST)
    const other = makeNode(g)
    const e = edge(addPort(other, PortSide.EAST), eastPort) // EAST 1 入
    const e2 = edge(eastPort, addPort(other, PortSide.WEST)) // EAST 1 出 → netFlow = 1-1 = 0, 非反向
    void e
    void e2

    new EdgeAndLayerConstraintEdgeReverser().process(g)

    expect(reversedOf(e)).toBe(false)
    expect(reversedOf(e2)).toBe(false)
  })

  it('FIXED_SIDE 端口对端带层约束 → allPortsReversed=false (不反转)', () => {
    const g = new LGraph()
    const fb = makeNode(g, null, PortConstraints.FIXED_SIDE)
    const eastPort = addPort(fb, PortSide.EAST)
    const lastNode = makeNode(g, LayerConstraint.LAST)
    // EAST 出边指向 LAST → 不允许
    const e = edge(eastPort, addPort(lastNode, PortSide.WEST))

    new EdgeAndLayerConstraintEdgeReverser().process(g)

    expect(reversedOf(e)).toBe(false)
  })

  it('FIXED_SIDE 端口入边来自 FIRST → allPortsReversed=false (不反转)', () => {
    const g = new LGraph()
    const fb = makeNode(g, null, PortConstraints.FIXED_SIDE)
    const eastPort = addPort(fb, PortSide.EAST)
    const firstNode = makeNode(g, LayerConstraint.FIRST)
    const e = edge(addPort(firstNode, PortSide.EAST), eastPort)

    new EdgeAndLayerConstraintEdgeReverser().process(g)

    expect(reversedOf(e)).toBe(false)
  })

  it('非 FIXED_SIDE 节点 / 无端口节点: 跳过 all-ports-reversed 检查', () => {
    const g = new LGraph()
    const freeNode = makeNode(g, null, PortConstraints.FREE)
    addPort(freeNode, PortSide.EAST)
    const noPortNode = makeNode(g, null, PortConstraints.FIXED_SIDE)

    expect(() => new EdgeAndLayerConstraintEdgeReverser().process(g)).not.toThrow()
    void noPortNode
  })

  it('无层约束的普通节点: 进入 remainingNodes, 内层处理无副作用', () => {
    const g = new LGraph()
    const a = makeNode(g)
    const b = makeNode(g)
    const e = edge(addPort(a, PortSide.EAST), addPort(b, PortSide.WEST))

    new EdgeAndLayerConstraintEdgeReverser().process(g)

    expect(reversedOf(e)).toBe(false)
    expect(a.getProperty(EDGE_CONSTRAINT)).toBeUndefined()
    expect(b.getProperty(EDGE_CONSTRAINT)).toBeUndefined()
  })

  it('FIXED_SIDE EAST 端口反向 (netFlow>0) 但出边指向 LAST → allPortsReversed=false (出边守卫)', () => {
    const g = new LGraph()
    const fb = makeNode(g, null, PortConstraints.FIXED_SIDE)
    const eastPort = addPort(fb, PortSide.EAST)
    const lastNode = makeNode(g, LayerConstraint.LAST)
    const a = makeNode(g)
    // EAST 端口: 2 入 + 1 出 → netFlow=1>0 (反向), 但出边指向 LAST → 不反转
    const in1 = edge(addPort(a, PortSide.EAST), eastPort)
    const in2 = edge(addPort(a, PortSide.EAST), eastPort)
    const out = edge(eastPort, addPort(lastNode, PortSide.WEST))

    new EdgeAndLayerConstraintEdgeReverser().process(g)

    expect(reversedOf(in1)).toBe(false)
    expect(reversedOf(in2)).toBe(false)
    expect(reversedOf(out)).toBe(false)
  })

  it('canReverseOutgoingEdge: 目标节点为 null 时不反转 (LAST 节点悬空出边)', () => {
    const g = new LGraph()
    const last = makeNode(g, LayerConstraint.LAST)
    const other = makeNode(g)
    const e = edge(addPort(last, PortSide.EAST), addPort(other, PortSide.WEST))
    e.setTarget(null) // 悬空出边仍留在源端口 outgoingEdges

    new EdgeAndLayerConstraintEdgeReverser().process(g)

    expect(reversedOf(e)).toBe(false)
  })

  it('canReverseIncomingEdge: 源节点为 null 时不反转 (FIRST 节点悬空入边)', () => {
    const g = new LGraph()
    const first = makeNode(g, LayerConstraint.FIRST)
    const other = makeNode(g)
    const e = edge(addPort(other, PortSide.EAST), addPort(first, PortSide.WEST))
    e.setSource(null)

    new EdgeAndLayerConstraintEdgeReverser().process(g)

    expect(reversedOf(e)).toBe(false)
  })

  it('FIXED_SIDE EAST+WEST 混合: EAST 反向 (netFlow>0) 但 WEST 未反向 → allPortsReversed=false, 全部不反转', () => {
    const g = new LGraph()
    const fb = makeNode(g, null, PortConstraints.FIXED_SIDE)
    const eastPort = addPort(fb, PortSide.EAST)
    const westPort = addPort(fb, PortSide.WEST)
    const left = makeNode(g)
    const right = makeNode(g)
    // EAST: 2 入 → netFlow=2>0 (反向); WEST: 1 出 + 1 入 → netFlow=0 (未反向)
    const eEast1 = edge(addPort(left, PortSide.EAST), eastPort)
    const eEast2 = edge(addPort(left, PortSide.EAST), eastPort)
    const eWestOut = edge(westPort, addPort(right, PortSide.WEST))
    const eWestIn = edge(addPort(right, PortSide.EAST), westPort)

    new EdgeAndLayerConstraintEdgeReverser().process(g)

    // 存在未反向端口 → 全部不反转 (ELK: allPortsReversed 必须所有端口都反向)
    expect(reversedOf(eEast1)).toBe(false)
    expect(reversedOf(eEast2)).toBe(false)
    expect(reversedOf(eWestOut)).toBe(false)
    expect(reversedOf(eWestIn)).toBe(false)
  })

  it('不变量: process 后边数守恒、无悬挂边、REVERSED 标记与真实反转一致', () => {
    function countEdges(g: LGraph): number {
      let n = 0
      const seen = new Set<LEdge>()
      for (const node of g.getAllNodes()) {
        for (const port of node.getPorts()) {
          for (const e of port.getConnectedEdges()) {
            if (!seen.has(e)) { seen.add(e); n++ }
          }
        }
      }
      return n
    }
    function expectConsistent(g: LGraph, edgeCount: number): void {
      expect(countEdges(g)).toBe(edgeCount)
      const seen = new Set<LEdge>()
      for (const node of g.getAllNodes()) {
        for (const port of node.getPorts()) {
          for (const e of port.getConnectedEdges()) {
            if (seen.has(e)) continue
            seen.add(e)
            expect(e.getSource()).not.toBeNull()
            expect(e.getTarget()).not.toBeNull()
            // REVERSED=true 的边真实方向与标记一致 (端口连接守恒由 LEdge.reverse 保证)
            if (e.getProperty(REVERSED)) {
              expect(e.getSource()!.getConnectedEdges()).toContain(e)
              expect(e.getTarget()!.getConnectedEdges()).toContain(e)
            }
          }
        }
      }
    }

    // 混合图: FIRST 节点 (反转入边) + LAST 节点 (反转出边) + feedback 节点 (反转全部)
    const g = new LGraph()
    const first = makeNode(g, LayerConstraint.FIRST)
    const last = makeNode(g, LayerConstraint.LAST)
    const fb = makeNode(g, null, PortConstraints.FIXED_SIDE)
    const eastPort = addPort(fb, PortSide.EAST)
    const westPort = addPort(fb, PortSide.WEST)
    const a = makeNode(g)
    const b = makeNode(g)
    const c = makeNode(g)
    const e1 = edge(addPort(a, PortSide.EAST), addPort(first, PortSide.WEST))  // FIRST 入边 → 反转
    const e2 = edge(addPort(last, PortSide.EAST), addPort(b, PortSide.WEST))    // LAST 出边 → 反转
    const e3 = edge(addPort(c, PortSide.EAST), eastPort)                        // fb EAST 入 → 反转
    const e4 = edge(westPort, addPort(c, PortSide.WEST))                        // fb WEST 出 → 反转
    const edgeCount = countEdges(g)

    new EdgeAndLayerConstraintEdgeReverser().process(g)

    expect(reversedOf(e1)).toBe(true)
    expect(reversedOf(e2)).toBe(true)
    expect(reversedOf(e3)).toBe(true)
    expect(reversedOf(e4)).toBe(true)
    expectConsistent(g, edgeCount)
  })
})
