/*
 * Copyright (c) 2010, 2015 Kiel University and others.
 * Copyright (c) 2026 GGN contributors.
 *
 * This file is part of ggn-layout, a TypeScript port of the Eclipse Layout
 * Kernel (ELK, https://github.com/eclipse/elk). It is derived from ELK and is
 * made available under the terms of the Eclipse Public License 2.0.
 *
 * SPDX-License-Identifier: EPL-2.0
 * License text: LICENSES/EPL-2.0.txt — see also THIRD_PARTY_NOTICES.md.
 */
/**
 * ModelOrderRowGraphPlacer (对应 ELK layered components.ModelOrderRowGraphPlacer + 父类
 * SimpleRowGraphPlacer 的 combine 骨架).
 * 模型序行放置: 不排序 (组件已按模型序排列), 行内按模型序推进;
 * NORTH 分量可突破行宽约束, 上一分量的 EAST 端口与自身 WEST 端口触发换行,
 * SOUTH 分量阻断下方所有行 (startXOfRow 前移).
 */
import { PortSide } from '../graph/enums.js'
import type { LGraph } from '../graph/lgraph.js'
import { ASPECT_RATIO, SPACING_COMPONENT_COMPONENT } from '../options/layered-options.js'
import { EXT_PORT_CONNECTIONS } from '../options/internal-properties.js'
import { AbstractGraphPlacer } from './abstract-graph-placer.js'
import { COMPACTION_CONNECTED_COMPONENTS, ComponentsCompactor } from './components-compactor.js'

/** 分量外部端口连接侧 (无则空集). */
function connections(graph: LGraph): Set<PortSide> {
  return graph.getProperty<Set<PortSide>>(EXT_PORT_CONNECTIONS) ?? new Set()
}

export class ModelOrderRowGraphPlacer extends AbstractGraphPlacer {
  /** combine: Java SimpleRowGraphPlacer.combine 骨架 (排序 → 排行 → 可选压缩 → 合并). */
  override combine(components: LGraph[], target: LGraph): void {
    if (components.length === 1) {
      const source = components[0]!
      if (source !== target) {
        target.getLayerlessNodes().length = 0
        this.moveGraph(target, source, 0, 0)
        target.copyProperties(source)
        target.getSize().x = source.getSize().x
        target.getSize().y = source.getSize().y
      }
      return
    } else if (components.length === 0) {
      target.getLayerlessNodes().length = 0
      target.getSize().x = 0
      target.getSize().y = 0
      return
    }

    // 排序 (模型序下为空操作)
    this.sortComponents(components, target)

    const firstComponent = components[0]!
    target.getLayerlessNodes().length = 0
    target.copyProperties(firstComponent)

    // 最大行宽 = max(最大分量宽, sqrt(总面积) * aspectRatio)
    let maxRowWidth = 0
    let totalArea = 0
    for (const graph of components) {
      const size = graph.getSize()
      maxRowWidth = Math.max(maxRowWidth, size.x)
      totalArea += size.x * size.y
    }
    maxRowWidth = Math.max(maxRowWidth, Math.sqrt(totalArea) * target.getProperty(ASPECT_RATIO))
    const componentSpacing = target.getProperty(SPACING_COMPONENT_COMPONENT)

    this.placeComponents(components, target, maxRowWidth, componentSpacing)

    // 若请求压缩, 执行压缩
    if (firstComponent.getProperty(COMPACTION_CONNECTED_COMPONENTS)) {
      const compactor = new ComponentsCompactor()
      compactor.compact(components, target.getSize(), componentSpacing)

      // 压缩算法绝对放置分量: 因此采用最终图偏移
      for (const h of components) {
        const offset = h.getOffset()
        offset.x = compactor.getOffset().x
        offset.y = compactor.getOffset().y
      }

      // 设置新图尺寸
      const gs = target.getSize()
      gs.x = compactor.getGraphSize().x
      gs.y = compactor.getGraphSize().y
    }

    // 最后把分量合并进目标图
    this.moveGraphs(target, components, 0, 0)
  }

  /** 排序: 空操作 — 组件已按模型序排列 (ELK ModelOrderRowGraphPlacer.sortComponents). */
  sortComponents(components: LGraph[], target: LGraph): void {
    void components
    void target
  }

  /**
   * 行放置: 保持模型序; 分量不可扩展以产生视觉提示, 行内不利用子行或堆叠
   * (结果可能有歧义).
   */
  placeComponents(components: LGraph[], target: LGraph, maxRowWidth: number, componentSpacing: number): void {
    // 迭代放置节点到行, 同时考虑模型序
    let xpos = 0, ypos = 0, highestBox = 0, broadestRow = componentSpacing
    let lastComponent: LGraph | null = null
    let startXOfRow = 0
    for (const graph of components) {
      const size = graph.getSize()
      const conn = connections(graph)
      if ((xpos + size.x > maxRowWidth && !conn.has(PortSide.NORTH))
        || (lastComponent !== null && connections(lastComponent).has(PortSide.EAST))
        || conn.has(PortSide.WEST)) {
        // 带 NORTH 连接的分量允许突破宽度约束.
        // 放入下一行:
        //   上一分量的 EAST 端口需要新行.
        //   WEST 端口需要新行.
        xpos = startXOfRow
        ypos += highestBox + componentSpacing
        highestBox = 0
      }
      const offset = graph.getOffset()
      // NORTH 端口应放置得与前序分量不重叠
      if (conn.has(PortSide.NORTH)) {
        xpos = broadestRow + componentSpacing
      }
      this.offsetGraph(graph, xpos + offset.x, ypos + offset.y)
      broadestRow = Math.max(broadestRow, xpos + size.x)
      // SOUTH 端口阻断其下方一切
      if (conn.has(PortSide.SOUTH)) {
        startXOfRow = Math.max(startXOfRow, xpos + size.x + componentSpacing)
      }
      offset.x = 0
      offset.y = 0
      highestBox = Math.max(highestBox, size.y)
      xpos += size.x + componentSpacing
      lastComponent = graph
    }

    target.getSize().x = broadestRow
    target.getSize().y = ypos + highestBox
  }
}
