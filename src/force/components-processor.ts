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
 * ComponentsProcessor — ELK alg.force.ComponentsProcessor 0.12.0.
 * 连通分量拆分 (DFS) + 贪心行装箱重组.
 */
import { FGraph, FNode, FEdge } from './graph.js'
import { KVector } from './kvector.js'
import { SEPARATE_CONNECTED_COMPONENTS, SPACING_NODE_NODE, PRIORITY, optOf, DEFAULTS } from './options.js'
import { BB_UPLEFT, BB_LOWRIGHT } from './internal-properties.js'

export class ComponentsProcessor {
  split(graph: FGraph): FGraph[] {
    const separate = optOf(graph, SEPARATE_CONNECTED_COMPONENTS, DEFAULTS[SEPARATE_CONNECTED_COMPONENTS])
    if (!separate) return [graph]

    const n = graph.getNodes().length
    const visited = new Array<boolean>(n).fill(false)
    const incidence: FEdge[][] = Array.from({ length: n }, () => [])
    for (const edge of graph.getEdges()) {
      incidence[edge.getSource().id].push(edge)
      incidence[edge.getTarget().id].push(edge)
    }

    const components: FGraph[] = []
    for (const node of graph.getNodes()) {
      const comp = this.dfs(node, null, null, visited, incidence)
      if (comp !== null) {
        comp.copyProperties(graph)
        components.push(comp)
      }
    }
    if (components.length > 1) {
      for (const comp of components) {
        let id = 0
        for (const node of comp.getNodes()) node.id = id++
      }
    }
    return components
  }

  private dfs(
    node: FNode,
    last: FNode | null,
    graph: FGraph | null,
    visited: boolean[],
    incidence: FEdge[][],
  ): FGraph | null {
    if (!visited[node.id]) {
      visited[node.id] = true
      let component = graph
      if (component === null) component = new FGraph()
      component.getNodes().push(node)
      for (const edge of incidence[node.id]) {
        if (edge.getTarget() === last || edge.getSource() === last) continue
        if (edge.getSource() !== node) this.dfs(edge.getSource(), node, component, visited, incidence)
        if (edge.getTarget() !== node) this.dfs(edge.getTarget(), node, component, visited, incidence)
        component.getEdges().push(edge)
        component.getLabels().push(...edge.getLabels())
      }
      return component
    }
    return null
  }

  recombine(components: FGraph[]): FGraph {
    if (components.length === 1) return components[0]
    if (components.length <= 0) return new FGraph()

    for (const graph of components) {
      let priority = 0
      let minx = Number.MAX_SAFE_INTEGER
      let miny = Number.MAX_SAFE_INTEGER
      let maxx = Number.MIN_SAFE_INTEGER
      let maxy = Number.MIN_SAFE_INTEGER
      for (const node of graph.getNodes()) {
        priority += optOf(node, PRIORITY, DEFAULTS[PRIORITY])
        minx = Math.min(minx, node.getPosition().x - node.getSize().x / 2)
        miny = Math.min(miny, node.getPosition().y - node.getSize().y / 2)
        maxx = Math.max(maxx, node.getPosition().x + node.getSize().x / 2)
        maxy = Math.max(maxy, node.getPosition().y + node.getSize().y / 2)
      }
      graph.setProperty(PRIORITY, priority)
      graph.setProperty(BB_UPLEFT, new KVector(minx, miny))
      graph.setProperty(BB_LOWRIGHT, new KVector(maxx, maxy))
    }

    components.sort((g1, g2) => {
      const prio = optOf(g2, PRIORITY, 0) - optOf(g1, PRIORITY, 0)
      if (prio === 0) {
        const size1 = (g1.getProperty<{ x: number; y: number }>(BB_LOWRIGHT).x - g1.getProperty<{ x: number; y: number }>(BB_UPLEFT).x)
          * (g1.getProperty<{ x: number; y: number }>(BB_LOWRIGHT).y - g1.getProperty<{ x: number; y: number }>(BB_UPLEFT).y)
        const size2 = (g2.getProperty<{ x: number; y: number }>(BB_LOWRIGHT).x - g2.getProperty<{ x: number; y: number }>(BB_UPLEFT).x)
          * (g2.getProperty<{ x: number; y: number }>(BB_LOWRIGHT).y - g2.getProperty<{ x: number; y: number }>(BB_UPLEFT).y)
        return size1 - size2
      }
      return prio
    })

    const result = new FGraph()
    result.copyProperties(components[0])

    let maxRowWidth = 0
    let totalArea = 0
    for (const graph of components) {
      const size = this.sizeOf(graph)
      maxRowWidth = Math.max(maxRowWidth, size.x)
      totalArea += size.x * size.y
    }
    maxRowWidth = Math.max(maxRowWidth, Math.sqrt(totalArea))
    const spacing: number = optOf(result, SPACING_NODE_NODE, DEFAULTS[SPACING_NODE_NODE])

    let xpos = 0
    let ypos = 0
    let highestBox = 0
    let broadestRow = spacing
    for (const graph of components) {
      const size = this.sizeOf(graph)
      if (xpos + size.x > maxRowWidth) {
        xpos = 0
        ypos += highestBox + spacing
        highestBox = 0
      }
      this.moveGraph(result, graph, xpos, ypos)
      broadestRow = Math.max(broadestRow, xpos + size.x)
      highestBox = Math.max(highestBox, size.y)
      xpos += size.x + spacing
    }
    return result
  }

  private sizeOf(g: FGraph): { x: number; y: number } {
    const lo = g.getProperty<{ x: number; y: number }>(BB_LOWRIGHT)
    const up = g.getProperty<{ x: number; y: number }>(BB_UPLEFT)
    return { x: lo.x - up.x, y: lo.y - up.y }
  }

  private moveGraph(destGraph: FGraph, sourceGraph: FGraph, offsetx: number, offsety: number): void {
    const graphOffset = new KVector(offsetx, offsety)
    graphOffset.sub(sourceGraph.getProperty<{ x: number; y: number }>(BB_UPLEFT) as KVector)
    for (const node of sourceGraph.getNodes()) {
      node.getPosition().add(graphOffset)
      destGraph.getNodes().push(node)
    }
    for (const edge of sourceGraph.getEdges()) {
      for (const bp of edge.getBendpoints()) bp.getPosition().add(graphOffset)
      destGraph.getEdges().push(edge)
    }
    for (const label of sourceGraph.getLabels()) {
      label.getPosition().add(graphOffset)
      destGraph.getLabels().push(label)
    }
  }
}
