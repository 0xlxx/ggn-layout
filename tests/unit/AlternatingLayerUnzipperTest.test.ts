/**
 * 移植自 ELK Java: intermediate/AlternatingLayerUnzipperTest.java
 * LAYER_UNZIPPING_STRATEGY=ALTERNATING + model order 的层拆分验证.
 */
import { describe, expect, it } from 'vitest'
import { LGraph, LNode, LPort, LEdge, Direction } from '../../src/index.js'
import { DIRECTION, EDGE_ROUTING } from '../../src/options/layered-options.js'
import {
  CONSIDER_MODEL_ORDER_STRATEGY, CROSSING_MINIMIZATION_STRATEGY,
  LAYER_UNZIPPING_STRATEGY, LAYER_UNZIPPING_LAYER_SPLIT, LAYER_UNZIPPING_RESET_ON_LONG_EDGES,
  OrderingStrategy, LayerUnzippingStrategy,
} from '../../src/options/layered-options.js'
import { MODEL_ORDER, RANDOM } from '../../src/options/internal-properties.js'
import { JavaRandom } from '../../src/util/java-random.js'
import { LayeredLayoutProvider } from '../../src/layered-layout-provider.js'
import { NullProgressMonitor } from '../../src/layered-layout-provider.js'

let nodeMo = 0
function resetMo(): void { nodeMo = 0 }

function createGraph(): LGraph {
  const g = new LGraph()
  g.setProperty(EDGE_ROUTING, 'ORTHOGONAL')
  g.setProperty(DIRECTION, Direction.RIGHT)
  g.setProperty(RANDOM, new JavaRandom(1) as any)
  g.setProperty(CONSIDER_MODEL_ORDER_STRATEGY, OrderingStrategy.PREFER_EDGES)
  g.setProperty(CROSSING_MINIMIZATION_STRATEGY, 'NONE')
  g.setProperty(LAYER_UNZIPPING_STRATEGY, LayerUnzippingStrategy.ALTERNATING)
  return g
}

function makeNode(g: LGraph): LNode {
  const n = new LNode(g)
  n.size = { x: 30, y: 30 }
  n.setProperty(MODEL_ORDER, nodeMo++)
  return n
}

function edgeBetween(from: LNode, to: LNode): LEdge {
  const fp = new LPort(); fp.setNode(from)
  const tp = new LPort(); tp.setNode(to)
  const e = new LEdge(); e.setSource(fp); e.setTarget(tp)
  return e
}

function layout(g: LGraph): void {
  new LayeredLayoutProvider().layout(g, new NullProgressMonitor())
}

describe('AlternatingLayerUnzipper (ELK Java 移植)', () => {
  it('simpleTwoSplit', () => {
    resetMo(); const g = createGraph()
    const n1 = makeNode(g), n2 = makeNode(g), n3 = makeNode(g), n4 = makeNode(g), nF = makeNode(g)
    edgeBetween(n1, n2); edgeBetween(n1, n3); edgeBetween(n1, n4)
    edgeBetween(n2, nF); edgeBetween(n3, nF); edgeBetween(n4, nF)
    n2.setProperty(LAYER_UNZIPPING_LAYER_SPLIT, 2)
    layout(g)
    expect(n1.getPosition().x).toBeLessThan(n2.getPosition().x)
    expect(n1.getPosition().x).toBeLessThan(n4.getPosition().x)
    expect(n2.getPosition().x).toBeLessThan(n3.getPosition().x)
    expect(n4.getPosition().x).toBeLessThan(n3.getPosition().x)
    expect(n3.getPosition().x).toBeLessThan(nF.getPosition().x)
  })

  it('simpleThreeSplit', () => {
    resetMo(); const g = createGraph()
    const n1 = makeNode(g), n2 = makeNode(g), n3 = makeNode(g), n4 = makeNode(g), n5 = makeNode(g), nF = makeNode(g)
    edgeBetween(n1, n2); edgeBetween(n1, n3); edgeBetween(n1, n4); edgeBetween(n1, n5)
    edgeBetween(n2, nF); edgeBetween(n3, nF); edgeBetween(n4, nF); edgeBetween(n5, nF)
    n2.setProperty(LAYER_UNZIPPING_LAYER_SPLIT, 3)
    layout(g)
    expect(n1.getPosition().x).toBeLessThan(n2.getPosition().x)
    expect(n1.getPosition().x).toBeLessThan(n5.getPosition().x)
    expect(n2.getPosition().x).toBeLessThan(n3.getPosition().x)
    expect(n3.getPosition().x).toBeLessThan(n4.getPosition().x)
    expect(n5.getPosition().x).toBeLessThan(n4.getPosition().x)
    expect(n4.getPosition().x).toBeLessThan(nF.getPosition().x)
  })

  it('danglingOutgoing', () => {
    resetMo(); const g = createGraph()
    const n1 = makeNode(g), n2 = makeNode(g), n3 = makeNode(g), n4 = makeNode(g), n5 = makeNode(g)
    edgeBetween(n1, n2); edgeBetween(n1, n3); edgeBetween(n1, n4); edgeBetween(n1, n5)
    n2.setProperty(LAYER_UNZIPPING_LAYER_SPLIT, 2)
    layout(g)
    expect(n1.getPosition().x).toBeLessThan(n2.getPosition().x)
    expect(n1.getPosition().x).toBeLessThan(n4.getPosition().x)
    expect(n2.getPosition().x).toBeLessThan(n3.getPosition().x)
    expect(n2.getPosition().x).toBeLessThan(n5.getPosition().x)
    expect(n4.getPosition().x).toBeLessThan(n3.getPosition().x)
    expect(n4.getPosition().x).toBeLessThan(n5.getPosition().x)
  })

  it('danglingIncoming', () => {
    resetMo(); const g = createGraph()
    const n1 = makeNode(g), n2 = makeNode(g), n3 = makeNode(g), n4 = makeNode(g), n5 = makeNode(g), nF = makeNode(g)
    edgeBetween(n1, nF); edgeBetween(n2, nF); edgeBetween(n3, nF); edgeBetween(n4, nF); edgeBetween(n5, nF)
    n2.setProperty(LAYER_UNZIPPING_LAYER_SPLIT, 2)
    layout(g)
    expect(n1.getPosition().x).toBeLessThan(n2.getPosition().x)
    expect(n1.getPosition().x).toBeLessThan(n4.getPosition().x)
    expect(n3.getPosition().x).toBeLessThan(n2.getPosition().x)
    expect(n3.getPosition().x).toBeLessThan(n4.getPosition().x)
    expect(n5.getPosition().x).toBeLessThan(n2.getPosition().x)
    expect(n5.getPosition().x).toBeLessThan(n4.getPosition().x)
    expect(n2.getPosition().x).toBeLessThan(nF.getPosition().x)
    expect(n4.getPosition().x).toBeLessThan(nF.getPosition().x)
  })

  it('multipleLayersSplit', () => {
    resetMo(); const g = createGraph()
    const n1 = makeNode(g), n2 = makeNode(g), n3 = makeNode(g), n4 = makeNode(g)
    const n21 = makeNode(g), n22 = makeNode(g), n23 = makeNode(g)
    edgeBetween(n1, n21); edgeBetween(n2, n21); edgeBetween(n2, n22)
    edgeBetween(n3, n21); edgeBetween(n3, n22); edgeBetween(n4, n22); edgeBetween(n4, n23)
    n1.setProperty(LAYER_UNZIPPING_LAYER_SPLIT, 2)
    n21.setProperty(LAYER_UNZIPPING_LAYER_SPLIT, 2)
    layout(g)
    expect(n1.getPosition().x).toBeLessThan(n2.getPosition().x)
    expect(n1.getPosition().x).toBeLessThan(n4.getPosition().x)
    expect(n3.getPosition().x).toBeLessThan(n2.getPosition().x)
    expect(n3.getPosition().x).toBeLessThan(n4.getPosition().x)
    expect(n2.getPosition().x).toBeLessThan(n21.getPosition().x)
    expect(n2.getPosition().x).toBeLessThan(n23.getPosition().x)
    expect(n4.getPosition().x).toBeLessThan(n21.getPosition().x)
    expect(n4.getPosition().x).toBeLessThan(n23.getPosition().x)
    expect(n21.getPosition().x).toBeLessThan(n22.getPosition().x)
    expect(n23.getPosition().x).toBeLessThan(n22.getPosition().x)
  })

  it('multipleIncomingEdges', () => {
    resetMo(); const g = createGraph()
    const n1 = makeNode(g), n2 = makeNode(g), n3 = makeNode(g), n4 = makeNode(g), nF = makeNode(g)
    for (let i = 0; i < 5; i++) edgeBetween(n1, n2)
    for (let i = 0; i < 4; i++) edgeBetween(n1, n3)
    edgeBetween(n1, n4)
    edgeBetween(n2, nF); edgeBetween(n3, nF); edgeBetween(n4, nF)
    n2.setProperty(LAYER_UNZIPPING_LAYER_SPLIT, 2)
    layout(g)
    expect(n1.getPosition().x).toBeLessThan(n2.getPosition().x)
    expect(n1.getPosition().x).toBeLessThan(n4.getPosition().x)
    expect(n2.getPosition().x).toBeLessThan(n3.getPosition().x)
    expect(n4.getPosition().x).toBeLessThan(n3.getPosition().x)
    expect(n3.getPosition().x).toBeLessThan(nF.getPosition().x)
  })

  it('multipleOutgoingEdges', () => {
    resetMo(); const g = createGraph()
    const n1 = makeNode(g), n2 = makeNode(g), n3 = makeNode(g), n4 = makeNode(g), nF = makeNode(g)
    edgeBetween(n1, n2); edgeBetween(n1, n3); edgeBetween(n1, n4)
    for (let i = 0; i < 4; i++) edgeBetween(n2, nF)
    edgeBetween(n3, nF)
    for (let i = 0; i < 4; i++) edgeBetween(n4, nF)
    n2.setProperty(LAYER_UNZIPPING_LAYER_SPLIT, 2)
    layout(g)
    expect(n1.getPosition().x).toBeLessThan(n2.getPosition().x)
    expect(n1.getPosition().x).toBeLessThan(n4.getPosition().x)
    expect(n2.getPosition().x).toBeLessThan(n3.getPosition().x)
    expect(n4.getPosition().x).toBeLessThan(n3.getPosition().x)
    expect(n3.getPosition().x).toBeLessThan(nF.getPosition().x)
  })

  it('mixedDanglingIncoming', () => {
    resetMo(); const g = createGraph()
    const n1 = makeNode(g), n2 = makeNode(g), n3 = makeNode(g), n4 = makeNode(g)
    const n5 = makeNode(g), n6 = makeNode(g), n7 = makeNode(g)
    edgeBetween(n1, n3); edgeBetween(n1, n4); edgeBetween(n2, n5)
    edgeBetween(n3, n5); edgeBetween(n3, n6); edgeBetween(n4, n7)
    n2.setProperty(LAYER_UNZIPPING_LAYER_SPLIT, 2)
    n5.setProperty(LAYER_UNZIPPING_LAYER_SPLIT, 2)
    layout(g)
    expect(n1.getPosition().x).toBeLessThan(n2.getPosition().x)
    expect(n1.getPosition().x).toBeLessThan(n4.getPosition().x)
    expect(n2.getPosition().x).toBeLessThan(n3.getPosition().x)
    expect(n4.getPosition().x).toBeLessThan(n3.getPosition().x)
    expect(n3.getPosition().x).toBeLessThan(n5.getPosition().x)
    expect(n3.getPosition().x).toBeLessThan(n7.getPosition().x)
    expect(n5.getPosition().x).toBeLessThan(n6.getPosition().x)
    expect(n7.getPosition().x).toBeLessThan(n6.getPosition().x)
  })

  it('mixedDanglingOutgoing', () => {
    resetMo(); const g = createGraph()
    const n1 = makeNode(g), n2 = makeNode(g), n3 = makeNode(g), n4 = makeNode(g)
    const n5 = makeNode(g), n6 = makeNode(g), n7 = makeNode(g)
    edgeBetween(n1, n2); edgeBetween(n1, n3); edgeBetween(n1, n4)
    edgeBetween(n3, n5); edgeBetween(n3, n6); edgeBetween(n4, n7)
    n2.setProperty(LAYER_UNZIPPING_LAYER_SPLIT, 2)
    n5.setProperty(LAYER_UNZIPPING_LAYER_SPLIT, 2)
    layout(g)
    expect(n1.getPosition().x).toBeLessThan(n2.getPosition().x)
    expect(n1.getPosition().x).toBeLessThan(n4.getPosition().x)
    expect(n2.getPosition().x).toBeLessThan(n3.getPosition().x)
    expect(n4.getPosition().x).toBeLessThan(n3.getPosition().x)
    expect(n3.getPosition().x).toBeLessThan(n5.getPosition().x)
    expect(n3.getPosition().x).toBeLessThan(n7.getPosition().x)
    expect(n5.getPosition().x).toBeLessThan(n6.getPosition().x)
    expect(n7.getPosition().x).toBeLessThan(n6.getPosition().x)
  })

  it('mixedTwoThreeLayerSplit', () => {
    resetMo(); const g = createGraph()
    const n1 = makeNode(g), n2 = makeNode(g), n3 = makeNode(g), n4 = makeNode(g)
    const n21 = makeNode(g), n22 = makeNode(g), n23 = makeNode(g)
    edgeBetween(n1, n21); edgeBetween(n2, n21); edgeBetween(n2, n22)
    edgeBetween(n3, n21); edgeBetween(n3, n22); edgeBetween(n4, n22); edgeBetween(n4, n23)
    n1.setProperty(LAYER_UNZIPPING_LAYER_SPLIT, 3)
    n21.setProperty(LAYER_UNZIPPING_LAYER_SPLIT, 2)
    layout(g)
    expect(n1.getPosition().x).toBeLessThan(n2.getPosition().x)
    expect(n2.getPosition().x).toBeLessThan(n3.getPosition().x)
    expect(n4.getPosition().x).toBeLessThan(n2.getPosition().x)
    expect(n3.getPosition().x).toBeLessThan(n21.getPosition().x)
    expect(n3.getPosition().x).toBeLessThan(n23.getPosition().x)
    expect(n21.getPosition().x).toBeLessThan(n22.getPosition().x)
    expect(n23.getPosition().x).toBeLessThan(n22.getPosition().x)
  })

  it('resetOnLongEdges', () => {
    resetMo(); const g = createGraph()
    const n1 = makeNode(g), n2 = makeNode(g), n3 = makeNode(g), n4 = makeNode(g), n5 = makeNode(g)
    edgeBetween(n1, n2); edgeBetween(n1, n3); edgeBetween(n1, n5); edgeBetween(n1, n4); edgeBetween(n4, n5)
    n2.setProperty(LAYER_UNZIPPING_LAYER_SPLIT, 2)
    n2.setProperty(LAYER_UNZIPPING_RESET_ON_LONG_EDGES, true)
    layout(g)
    expect(n1.getPosition().x).toBeLessThan(n2.getPosition().x)
    expect(n1.getPosition().x).toBeLessThan(n4.getPosition().x)
    expect(n2.getPosition().x).toBeLessThan(n3.getPosition().x)
    expect(n3.getPosition().x).toBeLessThan(n5.getPosition().x)
    expect(n4.getPosition().x).toBeLessThan(n3.getPosition().x)
  })

  it('noResetOnLongEdges', () => {
    resetMo(); const g = createGraph()
    const n1 = makeNode(g), n2 = makeNode(g), n3 = makeNode(g), n4 = makeNode(g), n5 = makeNode(g), n6 = makeNode(g)
    edgeBetween(n1, n2); edgeBetween(n1, n3); edgeBetween(n1, n5); edgeBetween(n1, n4)
    edgeBetween(n4, n5); edgeBetween(n1, n6)
    n2.setProperty(LAYER_UNZIPPING_LAYER_SPLIT, 2)
    n2.setProperty(LAYER_UNZIPPING_RESET_ON_LONG_EDGES, false)
    layout(g)
    expect(n1.getPosition().x).toBeLessThan(n2.getPosition().x)
    expect(n1.getPosition().x).toBeLessThan(n6.getPosition().x)
    expect(n2.getPosition().x).toBeLessThan(n3.getPosition().x)
    expect(n2.getPosition().x).toBeLessThan(n4.getPosition().x)
    expect(n3.getPosition().x).toBeLessThan(n5.getPosition().x)
    expect(n4.getPosition().x).toBeLessThan(n5.getPosition().x)
    expect(n6.getPosition().x).toBeLessThan(n3.getPosition().x)
    expect(n6.getPosition().x).toBeLessThan(n4.getPosition().x)
  })
})
