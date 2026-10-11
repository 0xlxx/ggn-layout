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
 * ComponentsProcessor (对应 ELK components.ComponentsProcessor + SimpleRowGraphPlacer).
 * 按连通分量拆分布局, 布局后按行排列合并回原图.
 */
import { LGraph } from '../graph/lgraph.js'
import type { LNode } from '../graph/lnode.js'
import { PortConstraints } from '../graph/enums.js'
import { ASPECT_RATIO, SEPARATE_CONNECTED_COMPONENTS, PORT_CONSTRAINTS, HIERARCHY_HANDLING, SPACING_COMPONENT_COMPONENT, CONSIDER_MODEL_ORDER_COMPONENTS } from '../options/layered-options.js'
import { GraphProperties, GRAPH_PROPERTIES, MODEL_ORDER } from '../options/internal-properties.js'
import { ComponentOrderingStrategy } from './component-ordering-strategy.js'
import { ModelOrderRowGraphPlacer } from './model-order-row-graph-placer.js'
import { ComponentGroupGraphPlacer } from './component-group-graph-placer.js'
import { COMPACTION_CONNECTED_COMPONENTS, ComponentsCompactor } from './components-compactor.js'

/** 分量间距默认 (ELK SPACING_COMPONENT_COMPONENT 默认 20); 实际值在 combine 里读图属性. */
export const COMPONENT_SPACING = 20

export class ComponentsProcessor {
  /**
   * 把图按无向连通性拆分为独立分量 (每个分量一个新 LGraph, 节点移入).
   * 不满足拆分条件时返回 [graph] (单分量, 原图).
   */
  split(graph: LGraph): LGraph[] {
    // INCLUDE_CHILDREN → 一律不拆: ELK 在 INCLUDE 时由 provider 分派到 doCompoundLayout
    // (hierarchicalLayout), 该路径从不调用 split (ElkLayered.java 注释 "Connected components
    // processing is currently not supported") — 与图是否扁平无关 (jar 实证: 扁平 INCLUDE 双分量
    // 整图布局 a1=(62,72)/b1=(12,112) vs split+combine a1=(12,12) 差异). ComponentsProcessor.split
    // 本身虽不看 HIERARCHY_HANDLING (纯连通性), 但 ggn 的 layout 分派按 parentNodes 而非
    // HIERARCHY_HANDLING, 扁平 INCLUDE 根图会走到本方法 — 此处必须顶住 "Java 在 INCLUDE 时
    // 根本不调 split" 的语义, 直接返回整图. 黑盒叶子 (rectpacking/box 子树) 由调用方
    // (doCompoundLayout INCLUDE → doHierarchicalLayout) 兜底, 不进 split.
    // SEPARATE_CHILDREN: 可拆 — ELK 根图按连通分量独立布局 (inside-self-loop 每节点一分量,
    // 自环绕节点外扩 → 分量尺寸含自环, §40). SEPARATE 子图同样走 split (Java provider doLayout→split;
    // 仅 INCLUDE 子图不拆).
    // ELK ComponentsProcessor.split: 仅当请求拆分 (SEPARATE_CONNECTED_COMPONENTS 默认 true)
    // 且 (无外部端口 或 端口约束兼容 (非 FIXED_ORDER)) 时拆分.
    const isInclude = graph.getProperty(HIERARCHY_HANDLING) === 'INCLUDE_CHILDREN'
    if (isInclude) return [graph]
    const separate = graph.getProperty(SEPARATE_CONNECTED_COMPONENTS) !== false
    const hasExtPorts = graph.getProperty(GRAPH_PROPERTIES).has(GraphProperties.EXTERNAL_PORTS)
    const pc = graph.getProperty(PORT_CONSTRAINTS)
    const compatiblePortConstraints = !PortConstraints.isOrderFixed(pc)
    if (!separate || (hasExtPorts && !compatiblePortConstraints)) return [graph]
    const result = this.splitInner(graph)
    // 模型序分量排序 (ELK ComponentsProcessor.split): 最小节点 model order 升序.
    if (graph.getProperty(CONSIDER_MODEL_ORDER_COMPONENTS) !== ComponentOrderingStrategy.NONE) {
      result.sort((g1, g2) => minimalModelOrder(g1) - minimalModelOrder(g2))
    }
    return result
  }

  private splitInner(graph: LGraph): LGraph[] {
    // 独立 visited Set (ELK 用节点内部状态; 这里 node.id 是 P3 的数组索引, 不能复用).
    const visited = new Set<LNode>()

    const result: LGraph[] = []
    for (const node of graph.getLayerlessNodes()) {
      if (visited.has(node)) continue
      const componentNodes: LNode[] = []
      this.dfs(node, componentNodes, visited)
      if (componentNodes.length > 0) {
        const newGraph = new LGraph()
        newGraph.copyProperties(graph)
        newGraph.getPadding().left = graph.getPadding().left
        newGraph.getPadding().top = graph.getPadding().top
        newGraph.getPadding().right = graph.getPadding().right
        newGraph.getPadding().bottom = graph.getPadding().bottom
        for (const n of componentNodes) {
          newGraph.getLayerlessNodes().push(n)
          n.setGraph(newGraph)
        }
        result.push(newGraph)
      }
    }
    return result.length > 0 ? result : [graph]
  }

  private dfs(node: LNode, component: LNode[], visited: Set<LNode>): void {
    if (visited.has(node)) return
    visited.add(node)
    component.push(node)
    for (const port of node.getPorts()) {
      for (const otherPort of port.getConnectedPorts()) {
        const otherNode = otherPort.getNode()
        if (otherNode !== null) this.dfs(otherNode, component, visited)
      }
    }
  }

  /**
   * 把已布局的分量合并回 target (单分量直接移动, 多分量按行排列).
   */
  combine(components: LGraph[], target: LGraph): void {
    // ELK ComponentsProcessor.combine: 委托给 split 选定的 graphPlacer.
    // 外部端口 + MODEL_ORDER → ModelOrderRowGraphPlacer (模型序行放置, 含 ComponentsCompactor 装配);
    // 非外部端口 / GROUP_MODEL_ORDER → 内置 SimpleRowGraphPlacer 路径; 外部端口 NONE/其他 → CGGP (R05 已移植).
    if (target.getProperty(GRAPH_PROPERTIES).has(GraphProperties.EXTERNAL_PORTS)) {
      const ordering = target.getProperty(CONSIDER_MODEL_ORDER_COMPONENTS)
      // ELK ComponentsProcessor.split: extPorts 时 GROUP_MODEL_ORDER → CGMOGP / MODEL_ORDER → MORGP / 其余 → CGGP.
      if (ordering === ComponentOrderingStrategy.MODEL_ORDER) {
        new ModelOrderRowGraphPlacer().combine(components, target)
        return
      }
      if (ordering !== ComponentOrderingStrategy.GROUP_MODEL_ORDER) {
        // NONE / INSIDE_PORT_SIDE_GROUPS → ComponentGroupGraphPlacer (9 扇区放置, R05).
        new ComponentGroupGraphPlacer().combine(components, target)
        return
      }
      // GROUP_MODEL_ORDER: CGMOGP 细化待补, 暂落行放置路径 (语料无触发).
    }
    // 原图节点引用清理: 节点已在分量中 (split 时 setGraph), 合并前清空目标列表.
    target.getLayerlessNodes().length = 0
    if (components.length === 1) {
      const source = components[0]!
      if (source !== target) {
        this.moveGraph(target, source, 0, 0)
      }
      return
    }
    if (components.length === 0) return

    // 分量间距 (ELK SimpleRowGraphPlacer: target.getProperty(SPACING_COMPONENT_COMPONENT)).
    const componentSpacing = target.getProperty(SPACING_COMPONENT_COMPONENT)
    // 排序 (ELK SimpleRowGraphPlacer.sortComponents): NONE → 优先级/面积 (PRIORITY 默认 0, 简化按面积升序);
    // 非 NONE → split 已按模型序排好, 保持原序.
    const sorted = target.getProperty(CONSIDER_MODEL_ORDER_COMPONENTS) === ComponentOrderingStrategy.NONE
      ? [...components].sort((g1, g2) => g1.getSize().x * g1.getSize().y - g2.getSize().x * g2.getSize().y)
      : [...components]

    // 最大行宽 = max(最大分量宽, sqrt(总面积)) (ELK SimpleRowGraphPlacer).
    let maxRowWidth = 0
    let totalArea = 0
    for (const g of sorted) {
      const s = g.getSize()
      maxRowWidth = Math.max(maxRowWidth, s.x)
      totalArea += s.x * s.y
    }
    // ELK SimpleRowGraphPlacer: maxRowWidth = max(maxWidth, (float)sqrt(totalArea) * aspectRatio).
    const aspectRatio = target.getProperty(ASPECT_RATIO)
    maxRowWidth = Math.max(maxRowWidth, Math.sqrt(totalArea) * aspectRatio)

    // 行排列 (ELK placeComponents): 超宽换行, offsetGraph 平移分量.
    let xpos = 0, ypos = 0, highestBox = 0, broadestRow = componentSpacing
    for (const g of sorted) {
      if (process.env.GGN_COMP_DBG) console.error(`[COMP] size=(${g.getSize().x},${g.getSize().y}) offset=(${g.getOffset().x},${g.getOffset().y}) nodes=${g.getLayerlessNodes().map(n => n.id).join(',')}`)
      const size = g.getSize()
      if (xpos + size.x > maxRowWidth) {
        xpos = 0
        ypos += highestBox + componentSpacing
        highestBox = 0
      }
      const offset = g.getOffset()
      this.offsetGraph(g, xpos + offset.x, ypos + offset.y)
      offset.x = 0
      offset.y = 0
      broadestRow = Math.max(broadestRow, xpos + size.x)
      highestBox = Math.max(highestBox, size.y)
      xpos += size.x + componentSpacing
    }
    target.getSize().x = broadestRow
    target.getSize().y = ypos + highestBox

    // 分量压缩 (ELK SimpleRowGraphPlacer.combine): 请求压缩时折叠分量, 用最终偏移平移.
    if (components[0]!.getProperty(COMPACTION_CONNECTED_COMPONENTS)) {
      const compactor = new ComponentsCompactor()
      compactor.compact(components, target.getSize(), componentSpacing)
      for (const h of components) {
        const off = h.getOffset()
        off.x = compactor.getOffset().x
        off.y = compactor.getOffset().y
      }
      const gs = target.getSize()
      gs.x = compactor.getGraphSize().x
      gs.y = compactor.getGraphSize().y
    }

    // 合并节点到 target (ELK moveGraphs).
    for (const g of sorted) {
      this.moveGraph(target, g, 0, 0)
    }
  }

  private moveGraph(destGraph: LGraph, sourceGraph: LGraph, offsetX: number, offsetY: number): void {
    const gx = offsetX + sourceGraph.getOffset().x
    const gy = offsetY + sourceGraph.getOffset().y
    // 节点与边弯点同步平移 (ELK moveGraph 语义; 之前只移节点 → 多分量图弯点错位, edge__and_port_labels 实证).
    const seenEdges = new Set<object>()
    for (const node of sourceGraph.getLayerlessNodes()) {
      node.position.x += gx
      node.position.y += gy
      for (const port of node.getPorts()) {
        for (const edge of port.getConnectedEdges()) {
          if (seenEdges.has(edge)) continue
          seenEdges.add(edge)
          for (const bp of edge.getBendPoints()) {
            bp.x += gx
            bp.y += gy
          }
        }
      }
      destGraph.getLayerlessNodes().push(node)
      node.setGraph(destGraph)
    }
    sourceGraph.getOffset().x = 0
    sourceGraph.getOffset().y = 0
  }

  private offsetGraph(graph: LGraph, offsetX: number, offsetY: number): void {
    // 节点与边弯点同步平移 (ELK SimpleRowGraphPlacer 分量放置; 之前只移节点 → 多分量图
    // 分量内边的弯点漏平移, 差分量间距 — edge__and_port_labels/endLabelsWithPorts 实证).
    const seenEdges = new Set<object>()
    for (const node of graph.getLayerlessNodes()) {
      node.position.x += offsetX
      node.position.y += offsetY
      for (const port of node.getPorts()) {
        for (const edge of port.getConnectedEdges()) {
          if (seenEdges.has(edge)) continue
          seenEdges.add(edge)
          for (const bp of edge.getBendPoints()) {
            bp.x += offsetX
            bp.y += offsetY
          }
        }
      }
    }
  }
}

/** 分量最小 model order (ELK LGraphUtil.getMinimalModelOrder); 无 MODEL_ORDER 节点 → MAX_SAFE_INTEGER. */
function minimalModelOrder(graph: LGraph): number {
  let order = Number.MAX_SAFE_INTEGER
  for (const node of graph.getLayerlessNodes()) {
    if (node.hasProperty(MODEL_ORDER)) {
      order = Math.min(order, node.getProperty(MODEL_ORDER))
    }
  }
  return order
}

/** 供 SimpleRowGraphPlacer 使用: 分量尺寸 (布局后). */
export function computeComponentSize(graph: LGraph): void {
  let minX = Number.POSITIVE_INFINITY, minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY, maxY = Number.NEGATIVE_INFINITY
  for (const node of graph.getLayerlessNodes()) {
    // 分量尺寸含端口外扩 (elkjs: 端口在节点外时计入分量宽/高).
    const margin = node.getMargin()
    let nx0 = node.position.x - margin.left
    let ny0 = node.position.y - margin.top
    let nx1 = node.position.x + node.size.x + margin.right
    let ny1 = node.position.y + node.size.y + margin.bottom
    for (const port of node.getPorts()) {
      const p = port.getPosition()
      const s = port.getSize()
      nx0 = Math.min(nx0, node.position.x + p.x)
      ny0 = Math.min(ny0, node.position.y + p.y)
      nx1 = Math.max(nx1, node.position.x + p.x + s.x)
      ny1 = Math.max(ny1, node.position.y + p.y + s.y)
    }
    minX = Math.min(minX, nx0)
    minY = Math.min(minY, ny0)
    maxX = Math.max(maxX, nx1)
    maxY = Math.max(maxY, ny1)
  }
  if (Number.isFinite(minX)) {
    // 只增不减: LSAGHC 已算出含自环 spline 外扩的图尺寸 (fixedSide/128 实证 98.67 vs 内容边界 76);
    // 这里仅当端口/内容超出该尺寸时再外扩 (ELK 用 LSAGHC 尺寸排布, 覆盖会缩小分量 → 行间距错).
    graph.getSize().x = Math.max(graph.getSize().x, maxX - minX)
    graph.getSize().y = Math.max(graph.getSize().y, maxY - minY)
  }
}
