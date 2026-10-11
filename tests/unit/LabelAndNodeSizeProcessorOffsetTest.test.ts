/**
 * 移植自 ELK Java: intermediate/LabelAndNodeSizeProcessorOffsetTest.java
 * 5 种 PortConstraints × 4 侧端口, offset=0, 断言 LabelAndNodeSizeProcessor 后端口贴节点边框:
 * NORTH.y=-portHeight, SOUTH.y=nodeHeight, EAST.x=nodeWidth, WEST.x=-portWidth.
 */
import { describe, expect, it } from 'vitest'
import { LGraph, LNode, LPort, PortSide, PortConstraints } from '../../src/index.js'
import { processLabelAndNodeSize } from '../../src/intermediate/label-and-node-size-processor.js'
import { Layer } from '../../src/graph/layer.js'
import { PORT_CONSTRAINTS, PORT_BORDER_OFFSET, SPACING_PORT_PORT } from '../../src/options/layered-options.js'

function makeNode(g: LGraph, pc: PortConstraints): LNode {
  const n = new LNode(g)
  n.size = { x: 100, y: 100 }
  n.setProperty(PORT_CONSTRAINTS, pc)
  for (const [side, x, y] of [
    [PortSide.NORTH, 50, -300], [PortSide.SOUTH, 50, 300],
    [PortSide.EAST, 300, 50], [PortSide.WEST, -300, 50],
  ] as [PortSide, number, number][]) {
    const p = new LPort()
    p.setNode(n)
    p.setSide(side)
    p.setProperty(PORT_BORDER_OFFSET, 0)
    p.getPosition().x = x
    p.getPosition().y = y
  }
  return n
}

describe('LabelAndNodeSizeProcessorOffsetTest (ELK Java 移植)', () => {
  for (const pc of [PortConstraints.FREE, PortConstraints.FIXED_SIDE, PortConstraints.FIXED_ORDER,
    PortConstraints.FIXED_RATIO, PortConstraints.FIXED_POS]) {
    // FIXED_RATIO/FIXED_POS: 显式侧端口 E/W x 恒在边框 (jar 意图), 推断侧保留 (340 等不回归).
    it(`ports touch border (${pc})`, () => {
      const g = new LGraph()
      g.setProperty(SPACING_PORT_PORT, 10)
      const n = makeNode(g, pc)
      // LabelAndNodeSizeProcessor 期望输入是分层图 (Layer 遍历); 单节点放入一层.
      const layer = new Layer(g)
      n.setLayer(layer)
      g.getLayers().push(layer)
      processLabelAndNodeSize(g)
      for (const port of n.getPorts()) {
        const side = port.getSide()
        const msg = `Port (${side}) does not touch border of node with port constraints ${pc}`
        if (side === PortSide.NORTH) expect(port.getPosition().y, msg).toBeCloseTo(-port.size.y, 6)
        if (side === PortSide.SOUTH) expect(port.getPosition().y, msg).toBeCloseTo(n.size.y, 6)
        if (side === PortSide.EAST) expect(port.getPosition().x, msg).toBeCloseTo(n.size.x, 6)
        if (side === PortSide.WEST) expect(port.getPosition().x, msg).toBeCloseTo(-port.size.x, 6)
      }
    })
  }
})
