/** InteractiveLayerer (对应 ELK p2layers.InteractiveLayerer): 按节点 position.x 分层. */
import type { LGraph } from '../graph/lgraph.js'
import type { LNode } from '../graph/lnode.js'
import type { LEdge } from '../graph/ledge.js'
import { Layer } from '../graph/layer.js'
import { PortType } from '../graph/enums.js'
import type { IElkProgressMonitor } from '../layered-layout-provider.js'

class LayerSpan {
  start = 0
  end = 0
  nodes: LNode[] = []
}

export function processInteractiveLayering(layeredGraph: LGraph, _monitor: IElkProgressMonitor): void {
    const spans: LayerSpan[] = []

    // 第一遍: 按 position.x 把节点分配到 span (重叠的 span 合并).
    for (const node of layeredGraph.getLayerlessNodes()) {
      const start = node.getPosition().x
      const end = Math.max(start + 1, node.getPosition().x + node.size.x)
      let span: LayerSpan | null = null
      let i = 0
      for (; i < spans.length; i++) {
        const next = spans[i]!
        if (next.start >= end) break
        if (next.end > start) {
          if (span === null) {
            next.nodes.push(node)
            next.start = Math.min(next.start, start)
            next.end = Math.max(next.end, end)
            span = next
          } else {
            span.nodes.push(...next.nodes)
            span.end = Math.max(span.end, next.end)
            spans.splice(i, 1)
            i--
          }
        }
      }
      if (span === null) {
        const ns = new LayerSpan()
        ns.start = start
        ns.end = end
        ns.nodes.push(node)
        spans.splice(i, 0, ns)
      }
    }

    // 第二遍: 每个 span 建一层, 节点放入.
    const layers = layeredGraph.getLayers()
    let layerId = 0
    for (const s of spans) {
      const layer = new Layer(layeredGraph)
      layer.id = layerId++
      layers.push(layer)
      for (const node of s.nodes) {
        node.setLayer(layer)
        node.id = 0
      }
    }

    // 第三遍: 边目标所在层 <= 源层时, 目标移到下一层 (保证层序).
    for (const node of layeredGraph.getLayerlessNodes()) {
      if (node.id !== 0) continue
      const toCheck = checkNode(node, layeredGraph)
      while (toCheck.size > 0) {
        const n = toCheck.values().next().value as LNode
        toCheck.delete(n)
        for (const nn of checkNode(n, layeredGraph)) toCheck.add(nn)
      }
    }

    // 移除空层, 清空 layerless.
    for (let i = layers.length - 1; i >= 0; i--) {
      if (layers[i]!.getNodes().length === 0) layers.splice(i, 1)
    }
    layeredGraph.getLayerlessNodes().length = 0
  }

function checkNode(node: LNode, layeredGraph: LGraph): Set<LNode> {
    node.id = 1
    const nodeLayer = node.getLayer()
    const toCheck = new Set<LNode>()
    for (const port of node.getPorts(PortType.OUTPUT)) {
      for (const edge of port.getOutgoingEdges()) {
        const targetNode = (edge as LEdge).getTarget()!.getNode()!
        if (targetNode === node) continue
        const targetLayer = targetNode.getLayer()
        if (targetLayer === null || nodeLayer === null) continue
        if (targetLayer.id <= nodeLayer.id) {
          const newLayerId = nodeLayer.id + 1
          let newLayer: Layer
          if (newLayerId === layeredGraph.getLayers().length) {
            newLayer = new Layer(layeredGraph)
            newLayer.id = newLayerId
            layeredGraph.getLayers().push(newLayer)
          } else {
            newLayer = layeredGraph.getLayers()[newLayerId]!
          }
          targetNode.setLayer(newLayer)
          toCheck.add(targetNode)
        }
      }
    }
    return toCheck
  }
