/**
 * 移植自 ELK Java: intermediate/greedyswitch/GreedySwitchProcessorTest.java
 * 参数化 ONE_SIDED / TWO_SIDED, 完整跑 LayerSweepCrossingMinimizer.process 验证层顺序。
 */
import { describe, expect, it } from 'vitest'
import { PortSide } from '../../src/index.js'
import { LayerSweepCrossingMinimizer } from '../../src/p3order/layer-sweep-crossing-minimizer.js'
import { CrossMinType } from '../../src/p3order/port-distributors.js'
import { NullProgressMonitor } from '../../src/layered-layout-provider.js'
import { TestGraphCreator, NorthSouthEdgeTestGraphCreator } from './helpers/TestGraphCreator.js'

const TYPES = [CrossMinType.ONE_SIDED_GREEDY_SWITCH, CrossMinType.TWO_SIDED_GREEDY_SWITCH]

describe('GreedySwitchProcessor (ELK Java 移植)', () => {
  it.each(TYPES)('shouldSwitchCross (%s)', (greedyType) => {
    const tg = new TestGraphCreator()
    tg.getCrossFormedGraph()
    const expectedLayerOne = greedyType === CrossMinType.ONE_SIDED_GREEDY_SWITCH
      ? tg.copyOfNodesInLayer(0) : tg.copyOfSwitchOrderOfNodesInLayer(0, 1, 0)
    const expectedLayerTwo = greedyType === CrossMinType.ONE_SIDED_GREEDY_SWITCH
      ? tg.copyOfSwitchOrderOfNodesInLayer(0, 1, 1) : tg.copyOfNodesInLayer(1)
    process(tg, greedyType as CrossMinType)
    expect(tg.copyOfNodesInLayer(0)).toEqual(expectedLayerOne)
    expect(tg.copyOfNodesInLayer(1)).toEqual(expectedLayerTwo)
  })

  it.each(TYPES)('constraintsPreventSwitchInSecondLayer (%s)', (greedyType) => {
    const tg = new TestGraphCreator()
    tg.getCrossFormedGraphWithConstraintsInSecondLayer()
    const expectedLayerOne = tg.copyOfSwitchOrderOfNodesInLayer(0, 1, 0)
    const expectedLayerTwo = tg.copyOfNodesInLayer(1)
    process(tg, greedyType as CrossMinType)
    expect(tg.copyOfNodesInLayer(0)).toEqual(expectedLayerOne)
    expect(tg.copyOfNodesInLayer(1)).toEqual(expectedLayerTwo)
  })

  it.each(TYPES)('constraintsPreventAnySwitch (%s)', (greedyType) => {
    const tg = new TestGraphCreator()
    tg.getCrossFormedGraphConstraintsPreventAnySwitch()
    const expectedLayerOne = tg.copyOfNodesInLayer(0)
    const expectedLayerTwo = tg.copyOfNodesInLayer(1)
    process(tg, greedyType as CrossMinType)
    expect(tg.copyOfNodesInLayer(0)).toEqual(expectedLayerOne)
    expect(tg.copyOfNodesInLayer(1)).toEqual(expectedLayerTwo)
  })

  it.each(TYPES)('layoutUnitConstraintPreventsSwitch (%s)', (greedyType) => {
    const tg = new TestGraphCreator()
    tg.getNodesInDifferentLayoutUnitsPreventSwitch()
    const expectedLayerTwo = tg.copyOfNodesInLayer(1)
    process(tg, greedyType as CrossMinType)
    expect(tg.copyOfNodesInLayer(1)).toEqual(expectedLayerTwo)
  })

  it.each(TYPES)('oneNode (%s)', (greedyType) => {
    const tg = new TestGraphCreator()
    tg.getOneNodeGraph()
    tg.copyOfSwitchOrderOfNodesInLayer(0, 0, 0)
    process(tg, greedyType as CrossMinType)  // should cause no errors
  })

  it.each(TYPES)('inLayerSwitchable (%s)', (greedyType) => {
    const tg = new TestGraphCreator()
    tg.getInLayerEdgesGraph()
    const expectedOrder = tg.copyOfSwitchOrderOfNodesInLayer(0, 1, 1)
    process(tg, greedyType as CrossMinType)
    expect(tg.copyOfNodesInLayer(1)).toEqual(expectedOrder)
  })

  it.each(TYPES)('multipleEdgesBetweenSameNodes (%s)', (greedyType) => {
    const tg = new TestGraphCreator()
    tg.getMultipleEdgesBetweenSameNodesGraph()
    const expectedLayerOne = greedyType === CrossMinType.ONE_SIDED_GREEDY_SWITCH
      ? tg.copyOfNodesInLayer(0) : tg.copyOfSwitchOrderOfNodesInLayer(0, 1, 0)
    const expectedLayerTwo = greedyType === CrossMinType.ONE_SIDED_GREEDY_SWITCH
      ? tg.copyOfSwitchOrderOfNodesInLayer(0, 1, 1) : tg.copyOfNodesInLayer(1)
    process(tg, greedyType as CrossMinType)
    expect(tg.copyOfNodesInLayer(0)).toEqual(expectedLayerOne)
    expect(tg.copyOfNodesInLayer(1)).toEqual(expectedLayerTwo)
  })

  it.each(TYPES)('selfLoops (%s)', (greedyType) => {
    const tg = new TestGraphCreator()
    const leftLayer = tg.makeLayer()
    const rightLayer = tg.makeLayer()
    const topLeft = tg.addNodeToLayer(leftLayer)
    const bottomLeft = tg.addNodeToLayer(leftLayer)
    const topRight = tg.addNodeToLayer(rightLayer)
    const bottomRight = tg.addNodeToLayer(rightLayer)
    const topLeftPort = tg.addPortOnSide(topLeft, PortSide.EAST)
    const bottomLeftPort = tg.addPortOnSide(bottomLeft, PortSide.EAST)
    tg.setUpIds()
    for (const layer of tg.getGraph().getLayers()) {
      for (const node of layer.getNodes()) {
        tg.selfLoopOn(node, PortSide.EAST); tg.selfLoopOn(node, PortSide.EAST); tg.selfLoopOn(node, PortSide.EAST)
        tg.selfLoopOn(node, PortSide.WEST); tg.selfLoopOn(node, PortSide.WEST); tg.selfLoopOn(node, PortSide.WEST)
      }
    }
    const topRightPort = tg.addPortOnSide(topRight, PortSide.WEST)
    const bottomRightPort = tg.addPortOnSide(bottomRight, PortSide.WEST)
    tg.addEdgeBetweenPorts(topLeftPort, bottomRightPort)
    tg.addEdgeBetweenPorts(bottomLeftPort, topRightPort)
    const expectedLayerOne = greedyType === CrossMinType.ONE_SIDED_GREEDY_SWITCH
      ? tg.copyOfNodesInLayer(0) : tg.copyOfSwitchOrderOfNodesInLayer(0, 1, 0)
    const expectedLayerTwo = greedyType === CrossMinType.ONE_SIDED_GREEDY_SWITCH
      ? tg.copyOfSwitchOrderOfNodesInLayer(0, 1, 1) : tg.copyOfNodesInLayer(1)
    process(tg, greedyType as CrossMinType)
    expect(tg.copyOfNodesInLayer(0)).toEqual(expectedLayerOne)
    expect(tg.copyOfNodesInLayer(1)).toEqual(expectedLayerTwo)
  })

  it.each(TYPES)('northSouthPortCrossing (%s)', (greedyType) => {
    const tg = new NorthSouthEdgeTestGraphCreator()
    tg.getNorthSouthDownwardCrossingGraph()
    const layerIndex = 0
    const expectedTwoSided = tg.copyOfNodesInLayer(layerIndex)
    const expectedOneSided = tg.copyOfSwitchOrderOfNodesInLayer(1, 2, layerIndex)
    process(tg, greedyType as CrossMinType)
    if (greedyType === CrossMinType.ONE_SIDED_GREEDY_SWITCH) {
      expect(tg.copyOfNodesInLayer(layerIndex)).toEqual(expectedOneSided)
    } else {
      expect(tg.copyOfNodesInLayer(layerIndex)).toEqual(expectedTwoSided)
    }
  })

  it.each(TYPES)('moreComplex (%s)', (greedyType) => {
    const tg = new TestGraphCreator()
    tg.getMoreComplexThreeLayerGraph()
    const expectedLayerTwo = tg.copyOfNodesInLayer(1)
    const expectedLayerThree = tg.copyOfSwitchOrderOfNodesInLayer(0, 1, 2)
    process(tg, greedyType as CrossMinType)
    expect(tg.copyOfNodesInLayer(1)).toEqual(expectedLayerTwo)
    expect(tg.copyOfNodesInLayer(2)).toEqual(expectedLayerThree)
  })

  it.each(TYPES)('switchOnlyForOneSided (%s)', (greedyType) => {
    const tg = new TestGraphCreator()
    tg.getSwitchOnlyOneSided()
    const layerIndex = 1
    const expectedOneSided = tg.copyOfSwitchOrderOfNodesInLayer(0, 1, layerIndex)
    const expectedTwoSided = tg.copyOfNodesInLayer(layerIndex)
    process(tg, greedyType as CrossMinType)
    if (greedyType === CrossMinType.ONE_SIDED_GREEDY_SWITCH) {
      expect(tg.copyOfNodesInLayer(layerIndex)).toEqual(expectedOneSided)
    } else {
      expect(tg.copyOfNodesInLayer(layerIndex)).toEqual(expectedTwoSided)
    }
  })

  it.each(TYPES)('doesNotWorsenCrossAmount (%s)', (greedyType) => {
    const tg = new TestGraphCreator()
    tg.getGraphWhichCouldBeWorsenedBySwitch()
    const expectedFirstLayer = tg.copyOfNodesInLayer(0)
    const expectedSecondLayer = tg.copyOfNodesInLayer(1)
    process(tg, greedyType as CrossMinType)
    expect(tg.copyOfNodesInLayer(0)).toEqual(expectedFirstLayer)
    expect(tg.copyOfNodesInLayer(1)).toEqual(expectedSecondLayer)
  })

  it.each(TYPES)('switchMoreThanOnce (%s)', (greedyType) => {
    const tg = new TestGraphCreator()
    const leftNodes = tg.addNodesToLayer(2, tg.makeLayer())
    const rightNodes = tg.addNodesToLayer(4, tg.makeLayer())
    const leftTopPort = tg.addPortOnSide(leftNodes[0]!, PortSide.EAST)
    const leftLowerPort = tg.addPortOnSide(leftNodes[1]!, PortSide.EAST)
    const rightTopPort = tg.addPortOnSide(rightNodes[0]!, PortSide.WEST)
    tg.addEdgeBetweenPorts(leftLowerPort, rightTopPort)
    tg.eastWestEdgeFromTo(leftLowerPort, rightNodes[2]!)
    tg.addEdgeBetweenPorts(leftTopPort, rightTopPort)
    tg.eastWestEdgeFromTo(leftTopPort, rightNodes[1]!)
    tg.eastWestEdgeFromTo(leftTopPort, rightNodes[3]!)
    tg.setUpIds()

    const oneSidedFirstLayer = tg.copyOfNodesInLayer(0)
    const oneSidedFirstSwitchSecondLayer = tg.copyOfSwitchOrderOfNodesInLayer(0, 1, 1)
    const oneSidedSecondSwitchSecondLayer = tg.getCopyWithSwitchedOrder(2, 3, oneSidedFirstSwitchSecondLayer)
    const oneSidedThirdSwitchSecondLayer = tg.getCopyWithSwitchedOrder(1, 2, oneSidedSecondSwitchSecondLayer)

    const twoSidedFirstLayer = tg.copyOfSwitchOrderOfNodesInLayer(0, 1, 0)
    const twoSidedFirstSwitchSecondLayer = tg.copyOfSwitchOrderOfNodesInLayer(1, 2, 1)
    const twoSidedSecondSwitchSecondLayer = tg.getCopyWithSwitchedOrder(0, 1, twoSidedFirstSwitchSecondLayer)

    process(tg, greedyType as CrossMinType)
    if (greedyType === CrossMinType.ONE_SIDED_GREEDY_SWITCH) {
      expect(tg.copyOfNodesInLayer(0)).toEqual(oneSidedFirstLayer)
      expect(tg.copyOfNodesInLayer(1)).toEqual(oneSidedThirdSwitchSecondLayer)
    } else {
      expect(tg.copyOfNodesInLayer(0)).toEqual(twoSidedFirstLayer)
      expect(tg.copyOfNodesInLayer(1)).toEqual(twoSidedSecondSwitchSecondLayer)
    }
  })
})

function process(tg: TestGraphCreator, greedyType: CrossMinType): void {
  const switcher = new LayerSweepCrossingMinimizer(greedyType)
  switcher.process(tg.getGraph(), new NullProgressMonitor())
}

/**
 * ─── T4X2 补测: GreedySwitchHeuristic 接口/调试钩子/约束分支 (变异杀灭) ───
 */
import { vi } from 'vitest'
import { GraphInfoHolder } from '../../src/p3order/graph-info-holder.js'
import { GreedySwitchHeuristic } from '../../src/intermediate/greedyswitch/greedy-switch-heuristic.js'

describe('GreedySwitchHeuristic (T4X2 补充)', () => {
  it('接口语义: TWO_SIDED alwaysImproves=true / isDeterministic=true', () => {
    const tg = new TestGraphCreator()
    tg.addNodeToLayer(tg.makeLayer())
    tg.setUpIds()
    const gData = new GraphInfoHolder(tg.getGraph(), CrossMinType.TWO_SIDED_GREEDY_SWITCH, [])
    const h = gData.crossMinimizer as GreedySwitchHeuristic
    expect(h.alwaysImproves()).toBe(true)
    expect(h.isDeterministic()).toBe(true)
  })

  it('接口语义: ONE_SIDED alwaysImproves=false', () => {
    const tg = new TestGraphCreator()
    tg.addNodeToLayer(tg.makeLayer())
    tg.setUpIds()
    const gData = new GraphInfoHolder(tg.getGraph(), CrossMinType.ONE_SIDED_GREEDY_SWITCH, [])
    const h = gData.crossMinimizer as GreedySwitchHeuristic
    expect(h.alwaysImproves()).toBe(false)
    expect(h.isDeterministic()).toBe(true)
  })

  it('initAfterTraversal: portPositions 长度 = 端口总数', () => {
    const tg = new TestGraphCreator()
    tg.getCrossFormedGraph()
    tg.setUpIds()
    const gData = new GraphInfoHolder(tg.getGraph(), CrossMinType.TWO_SIDED_GREEDY_SWITCH, [])
    const h = gData.crossMinimizer as unknown as { portPositions: unknown[] }
    let nPorts = 0
    for (const layer of tg.getGraph().getLayers()) for (const node of layer.getNodes()) nPorts += node.getPorts().length
    expect(h.portPositions).toHaveLength(nPorts)
  })

  it('minimizeCrossings: 有交换改善时返回 true (improved ||= 语义)', () => {
    const tg = new TestGraphCreator()
    tg.getCrossFormedGraph()
    tg.setUpIds()
    const gData = new GraphInfoHolder(tg.getGraph(), CrossMinType.TWO_SIDED_GREEDY_SWITCH, [])
    const h = gData.crossMinimizer as GreedySwitchHeuristic
    const improved = h.minimizeCrossings(gData.currentNodeOrder, 0, true, false)
    expect(improved).toBe(true)
  })

  it('minimizeCrossings: 无交换空间时返回 false', () => {
    const tg = new TestGraphCreator()
    tg.getOneNodeGraph()
    tg.setUpIds()
    const gData = new GraphInfoHolder(tg.getGraph(), CrossMinType.TWO_SIDED_GREEDY_SWITCH, [])
    const h = gData.crossMinimizer as GreedySwitchHeuristic
    const improved = h.minimizeCrossings(gData.currentNodeOrder, 0, true, false)
    expect(improved).toBe(false)
  })

  it.each(TYPES)('successor 约束阻止受益交换 (%s): 层 0 顺序不变', (greedyType) => {
    const tg = new TestGraphCreator()
    tg.getCrossFormedGraph()
    const layer0 = tg.getGraph().getLayers()[0]!.getNodes()
    tg.setInLayerOrderConstraint(layer0[0]!, layer0[1]!)
    tg.setUpIds()
    const expectedLayerZero = tg.copyOfNodesInLayer(0)
    process(tg, greedyType as CrossMinType)
    expect(tg.copyOfNodesInLayer(0)).toEqual(expectedLayerZero)
  })
})

describe('GreedySwitchHeuristic — GGN_SD_DBG 调试钩子', () => {
  it('GGN_SD_DBG=1: minimize/step1-5/parts/decide 调试输出齐全', () => {
    ;(globalThis as { process?: { env: Record<string, string | undefined> } }).process!.env.GGN_SD_DBG = '1'
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const tg = new TestGraphCreator()
      tg.getCrossFormedGraph()
      tg.setUpIds()
      process(tg, CrossMinType.TWO_SIDED_GREEDY_SWITCH)
      const all = spy.mock.calls.map(c => String(c[0])).join('\n')
      expect(all).toContain('SD minimize layer=')
      expect(all).toContain('SD step1 constraints')
      expect(all).toContain('SD step2 left')
      expect(all).toContain('SD step3 right')
      expect(all).toContain('SD step4 ns')
      expect(all).toContain('SD step5 matrix')
      expect(all).toContain('SD parts')
      expect(all).toContain('SD decide')
    } finally {
      spy.mockRestore()
      delete (globalThis as { process?: { env: Record<string, string | undefined> } }).process!.env.GGN_SD_DBG
    }
  })

  it('GGN_SD_DBG 未设: 无 SD 调试输出', () => {
    delete (globalThis as { process?: { env: Record<string, string | undefined> } }).process!.env.GGN_SD_DBG
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const tg = new TestGraphCreator()
      tg.getCrossFormedGraph()
      tg.setUpIds()
      process(tg, CrossMinType.TWO_SIDED_GREEDY_SWITCH)
      expect(spy).not.toHaveBeenCalled()
    } finally {
      spy.mockRestore()
    }
  })
})
