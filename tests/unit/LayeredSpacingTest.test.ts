/**
 * 移植自 ELK Java: LayeredSpacingTest.java
 * LayeredSpacings 间距配置: 默认比例 / 布局生效 / 属性覆盖语义.
 */
import { describe, expect, it } from 'vitest'
import { LGraph, LNode, LPort, LEdge, Direction } from '../../src/index.js'
import { Property } from '../../src/graph/properties.js'
import { DIRECTION, EDGE_ROUTING } from '../../src/options/layered-options.js'
import {
  SPACING_EDGE_EDGE, SPACING_EDGE_LABEL, SPACING_EDGE_NODE, SPACING_LABEL_LABEL,
  SPACING_LABEL_NODE, SPACING_LABEL_PORT_HORIZONTAL, SPACING_LABEL_PORT_VERTICAL,
  SPACING_NODE_SELF_LOOP, SPACING_PORT_PORT, SPACING_EDGE_EDGE_BETWEEN_LAYERS,
  SPACING_EDGE_NODE_BETWEEN_LAYERS, SPACING_NODE_NODE_BETWEEN_LAYERS, SPACING_NODE_NODE,
} from '../../src/options/layered-options.js'
import { layeredSpacingsWithBaseValue } from '../../src/options/layered-spacings.js'
import { LayeredLayoutProvider, NullProgressMonitor } from '../../src/layered-layout-provider.js'

const DOUBLE_EQ_EPSILON = 10e-5

function createSimpleGraph(): LGraph {
  const g = new LGraph()
  const n1 = new LNode(g); n1.size = { x: 30, y: 30 }
  const n2 = new LNode(g); n2.size = { x: 30, y: 30 }
  const p1 = new LPort(); p1.setNode(n1)
  const p2 = new LPort(); p2.setNode(n2)
  const e = new LEdge(); e.setSource(p1); e.setTarget(p2)
  void e
  return g
}

describe('LayeredSpacingTest (ELK Java 移植)', () => {
  describe('WithFactorAndValueTest', () => {
    const OPTIONS = [
      SPACING_EDGE_EDGE, SPACING_EDGE_LABEL, SPACING_EDGE_NODE, SPACING_LABEL_LABEL,
      SPACING_LABEL_NODE, SPACING_LABEL_PORT_HORIZONTAL, SPACING_LABEL_PORT_VERTICAL,
      SPACING_NODE_SELF_LOOP, SPACING_PORT_PORT,
      SPACING_EDGE_EDGE_BETWEEN_LAYERS, SPACING_EDGE_NODE_BETWEEN_LAYERS, SPACING_NODE_NODE_BETWEEN_LAYERS,
    ]
    it.each(OPTIONS.map(o => [o.getId()]))('factor 默认比例正确 (%s)', (id) => {
      const option = OPTIONS.find(o => o.getId() === id)!
      const builder = layeredSpacingsWithBaseValue(33.0)
      const value = builder.getFactors().get(option)!
      expect(value).toBeCloseTo(option.getDefault() / SPACING_NODE_NODE.getDefault(), DOUBLE_EQ_EPSILON)
    })
  })

  describe('AfterLayoutTest', () => {
    it('testSpacingNodeNodeBetweenLayers: 层间距=66', () => {
      const g = createSimpleGraph()
      g.setProperty(DIRECTION, Direction.RIGHT)
      g.setProperty(EDGE_ROUTING, 'ORTHOGONAL')
      layeredSpacingsWithBaseValue(33.0)
        .withFactor(SPACING_NODE_NODE_BETWEEN_LAYERS, 2.0)
        .apply(g)
      new LayeredLayoutProvider().layout(g, new NullProgressMonitor())
      const [n1, n2] = g.getAllNodes()
      const gap = n2!.getPosition().x - (n1!.getPosition().x + n1!.size.x)
      expect(gap).toBeCloseTo(66, DOUBLE_EQ_EPSILON)
    })
  })

  describe('SpacingOverrides', () => {
    const PROPERTY_WITH_DIFFERENT_DEFAULT = new Property<number>(
      SPACING_EDGE_NODE.getId(), SPACING_EDGE_NODE.getDefault() + 3.0)

    it('testExtractsCorrectDefaultForLayeredProperty', () => {
      const node = createSimpleGraph().getAllNodes()[0]!
      expect(node.getProperty(SPACING_EDGE_NODE)).toBeCloseTo(SPACING_EDGE_NODE.getDefault(), DOUBLE_EQ_EPSILON)
    })

    it('testExtractsCorrectDefaultForInheritingProperty', () => {
      const node = createSimpleGraph().getAllNodes()[0]!
      expect(node.getProperty(PROPERTY_WITH_DIFFERENT_DEFAULT))
        .toBeCloseTo(SPACING_EDGE_NODE.getDefault() + 3.0, DOUBLE_EQ_EPSILON)
    })

    it('testExtractsCorrectDefaultValueAfterSpacingConfiguration', () => {
      const node = createSimpleGraph().getAllNodes()[0]!
      const builder = layeredSpacingsWithBaseValue(35.0)
      builder.apply(node)
      expect(node.hasProperty(SPACING_EDGE_NODE)).toBe(true)
      const expected = 35.0 * builder.getFactors().get(SPACING_EDGE_NODE)!
      expect(node.getProperty(PROPERTY_WITH_DIFFERENT_DEFAULT)).toBeCloseTo(expected, DOUBLE_EQ_EPSILON)
      expect(node.getProperty(SPACING_EDGE_NODE)).toBeCloseTo(expected, DOUBLE_EQ_EPSILON)
    })
  })
})
