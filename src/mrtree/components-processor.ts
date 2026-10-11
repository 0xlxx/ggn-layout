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
 * mrtree ComponentsProcessor — ELK alg.mrtree.ComponentsProcessor 0.12.0.
 *
 * split: DFS 连通分量拆分 (SEPARATE_CONNECTED_COMPONENTS null/true 时), 多分量重编号 id.
 * pack: 优先级+面积排序, 逐行放置 (aspectRatio), moveGraph 平移, 属性合并,
 *   GraphBoundsProcessor 重算包围盒, 归一化到 padding.
 */
import { KVector } from '../force/kvector.js'
import { TGraph, TNode, TEdge, P_BB_UPLEFT, P_BB_LOWRIGHT, P_GRAPH_XMIN, P_GRAPH_YMIN, getProp, setProp } from './graph.js'
import { graphBoundsProcessor } from './intermediate/graph-bounds-processor.js'
import {
  ASPECT_RATIO, PRIORITY, SPACING_NODE_NODE, SEPARATE_CONNECTED_COMPONENTS,
  optPadding, DEFAULTS,
} from './options.js'

export class ComponentsProcessor {
  private incidence: TEdge[][] = []
  private visited: boolean[] = []

  private initialize(graph: TGraph): void {
    const n = graph.getNodes().length
    this.incidence = Array.from({ length: n }, () => [])
    this.visited = new Array<boolean>(n).fill(false)

    // create incidence lists
    for (const node of graph.getNodes()) {
      this.incidence[node.id] = []
    }
    // add edges to incidence lists
    for (const edge of graph.getEdges()) {
      this.incidence[edge.getSource().id].push(edge)
      this.incidence[edge.getTarget().id].push(edge)
    }
  }

  split(graph: TGraph): TGraph[] {
    const separate = getProp(graph, SEPARATE_CONNECTED_COMPONENTS, DEFAULTS[SEPARATE_CONNECTED_COMPONENTS] as boolean)
    if (separate) {
      this.initialize(graph)

      // perform DFS starting on each node, collecting connected components
      const components: TGraph[] = []
      for (const node of graph.getNodes()) {
        const comp = this.dfs(node, null)
        if (comp !== null) {
          Object.assign(comp.props, graph.props)
          components.push(comp)
        }
      }
      this.incidence = []
      this.visited = []

      // redistribute identifier numbers to each component
      if (components.length > 1) {
        for (const comp of components) {
          let id = 0
          for (const node of comp.getNodes()) node.id = id++
        }
      }
      return components
    }
    return [graph]
  }

  private dfs(node: TNode, graph: TGraph | null): TGraph | null {
    // check if node was visited earlier
    if (!this.visited[node.id]) {
      // if not it is visited now
      this.visited[node.id] = true
      // create new component if necessary
      let component = graph
      if (component === null) {
        component = new TGraph()
      }
      // add the node to the component
      component.getNodes().push(node)
      // follow all edges from this node
      for (const edge of this.incidence[node.id]) {
        if (edge.getSource() !== node) {
          this.dfs(edge.getSource(), component)
        }
        if (edge.getTarget() !== node) {
          this.dfs(edge.getTarget(), component)
        }
        // add the edges to the component (两端各 add 一次, pack 时 distinct 去重 — Java 语义)
        component.getEdges().push(edge)
      }
      return component
    }
    // if the node was visited before skip it
    return null
  }

  pack(components: TGraph[]): TGraph {
    if (components.length === 1) {
      this.applyPaddingAndNormalizePositions(components[0])
      return components[0]
    }
    if (components.length <= 0) {
      return new TGraph()
    }

    // assign priorities and sizes
    for (const graph of components) {
      let priority = 0
      let minx = 2147483647
      let miny = 2147483647
      let maxx = -2147483648
      let maxy = -2147483648
      for (const node of graph.getNodes()) {
        priority += getProp(node, PRIORITY, 1)
        minx = Math.min(minx, node.getPosition().x)
        miny = Math.min(miny, node.getPosition().y)
        maxx = Math.max(maxx, node.getPosition().x + node.getSize().x)
        maxy = Math.max(maxy, node.getPosition().y + node.getSize().y)
      }
      setProp(graph, PRIORITY, priority)
      setProp(graph, P_BB_UPLEFT, new KVector(minx, miny))
      setProp(graph, P_BB_LOWRIGHT, new KVector(maxx, maxy))
    }

    // sort the components by their priority and size (降序)
    components.sort((g1, g2) => {
      const prio = getProp(g2, PRIORITY, 0) - getProp(g1, PRIORITY, 0)
      if (prio === 0) {
        const size1 = getProp(g2, P_BB_LOWRIGHT, new KVector()).clone()
        size1.sub(getProp(g2, P_BB_UPLEFT, new KVector()))
        const size2 = getProp(g1, P_BB_LOWRIGHT, new KVector()).clone()
        size2.sub(getProp(g1, P_BB_UPLEFT, new KVector()))
        return size1.x * size1.y - size2.x * size2.y
      }
      return prio
    })

    const result = new TGraph()
    Object.assign(result.props, components[0].props)

    // determine the maximal row width by the maximal box width and the total area
    let maxRowWidth = 0
    let totalArea = 0
    for (const graph of components) {
      const size = getProp(graph, P_BB_LOWRIGHT, new KVector()).clone()
      size.sub(getProp(graph, P_BB_UPLEFT, new KVector()))
      maxRowWidth = Math.max(maxRowWidth, size.x)
      totalArea += size.x * size.y
    }
    maxRowWidth = Math.max(maxRowWidth, Math.sqrt(totalArea) * getProp(result, ASPECT_RATIO, 1.6))
    const spacing = getProp(result, SPACING_NODE_NODE, 20)

    // place nodes iteratively into rows
    let xpos = 0
    let ypos = 0
    let highestBox = 0
    let broadestRow = spacing
    for (const graph of components) {
      const size = getProp(graph, P_BB_LOWRIGHT, new KVector()).clone()
      size.sub(getProp(graph, P_BB_UPLEFT, new KVector()))
      if (xpos + size.x > maxRowWidth) {
        // place the graph into the next row
        xpos = 0
        ypos += highestBox + spacing
        highestBox = 0
      }
      this.moveGraph(result, graph, xpos, ypos)
      broadestRow = Math.max(broadestRow, xpos + size.x)
      highestBox = Math.max(highestBox, size.y)
      xpos += size.x + spacing
    }

    // 属性合并 (Java: 首次设置 + 非默认值覆盖; 各组件 props 复制自同一原图,
    // 仅 BB_UPLEFT/LOWRIGHT/PRIORITY 等逐组件值不同, 后者随后被重置/不使用)
    for (const [key, value] of Object.entries(components[0].props)) {
      setProp(result, key, value)
    }

    // We need to recompute the graphs bounds, since each component only knows its own bounds
    graphBoundsProcessor(result)
    // Move the resulting graph to 0,0 and apply padding
    this.applyPaddingAndNormalizePositions(result)

    return result
  }

  private applyPaddingAndNormalizePositions(g: TGraph): void {
    const padding = optPadding(g as unknown as { layoutOptions?: Record<string, unknown> })
    setProp(g, P_BB_UPLEFT, new KVector(0, 0))
    this.moveGraph(
      new TGraph(), g,
      padding.left - getProp(g, P_GRAPH_XMIN, 0),
      padding.top - getProp(g, P_GRAPH_YMIN, 0),
    )
  }

  private moveGraph(destGraph: TGraph, sourceGraph: TGraph, offsetx: number, offsety: number): void {
    const graphOffset = new KVector(offsetx, offsety)
    graphOffset.sub(getProp(sourceGraph, P_BB_UPLEFT, new KVector()))

    for (const node of sourceGraph.getNodes()) {
      node.getPosition().add(graphOffset)
      destGraph.getNodes().push(node)
    }

    // distinct (Java stream().distinct(): 同一对象引用去重)
    const seen = new Set<TEdge>()
    for (const edge of sourceGraph.getEdges()) {
      if (seen.has(edge)) continue
      seen.add(edge)
      for (const bendpoint of edge.getBendPoints()) {
        bendpoint.add(graphOffset)
      }
      destGraph.getEdges().push(edge)
    }
  }
}
