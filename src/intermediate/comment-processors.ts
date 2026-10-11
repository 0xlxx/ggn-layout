/**
 * Comment box 支持 (对应 ELK intermediate.CommentPreprocessor / CommentNodeMarginCalculator /
 * CommentPostprocessor).
 *
 * comment box (node 设 commentBox: true) 通过一条边连接真实节点; 布局时:
 *  1. CommentPreprocessor (P1 前): 把 comment 分配给真实节点的 TOP/BOTTOM_COMMENTS, 从图移除 comment 节点;
 *  2. CommentNodeMarginCalculator (P4 前): 为真实节点加 margin 预留 comment 空间;
 *  3. CommentPostprocessor (P5 后): 在预留空间放置 comment box, 重连边.
 */
import type { LGraph } from '../graph/lgraph.js'
import type { LNode } from '../graph/lnode.js'
import type { LPort } from '../graph/lport.js'
import type { LEdge } from '../graph/ledge.js'
import { PortSide } from '../graph/enums.js'
import { TOP_COMMENTS, BOTTOM_COMMENTS, COMMENT_CONN_PORT, PORT_DUMMY } from '../options/internal-properties.js'
import { COMMENT_BOX, SPACING_COMMENT_COMMENT, SPACING_COMMENT_NODE } from '../options/layered-options.js'

/** 检测图是否有 comment box (设置 COMMENTS 图属性, ELK GraphConfigurator). */
export function detectComments(graph: LGraph): boolean {
  return graph.getLayerlessNodes().some(n => n.getProperty(COMMENT_BOX))
}

/** ELK CommentPreprocessor: 分配 comment 到真实节点 TOP/BOTTOM, 移除 comment 节点. */
export function processCommentPreprocessing(layeredGraph: LGraph): void {
  if (process.env.GGN_CM_DBG) console.error('[CM] preprocess nodes=', layeredGraph.getLayerlessNodes().map(n => n.id + ':' + n.getProperty(COMMENT_BOX)).join(','))
  for (const node of [...layeredGraph.getLayerlessNodes()]) {
    if (!node.getProperty(COMMENT_BOX)) continue
    let edgeCount = 0
    let edge: LEdge | null = null
    let oppositePort: LPort | null = null
    for (const port of node.getPorts()) {
      edgeCount += port.getDegree()
      if (port.getIncomingEdges().length === 1) {
        edge = port.getIncomingEdges()[0]!
        oppositePort = edge.getSource()!
      }
      if (port.getOutgoingEdges().length === 1) {
        edge = port.getOutgoingEdges()[0]!
        oppositePort = edge.getTarget()!
      }
    }
    if (edgeCount === 1 && oppositePort !== null && oppositePort.getDegree() === 1
      && !oppositePort.getNode()!.getProperty(COMMENT_BOX)) {
      processBox(node, edge!, oppositePort, oppositePort.getNode()!)
      // 从 layerlessNodes 移除 comment 节点 (ELK nodeIter.remove).
      const idx = layeredGraph.getLayerlessNodes().indexOf(node)
      if (idx !== -1) layeredGraph.getLayerlessNodes().splice(idx, 1)
    } else {
      // 反向连接异常的边 (ELK 同逻辑).
      const revEdges: LEdge[] = []
      for (const port of node.getPorts()) {
        for (const out of port.getOutgoingEdges()) {
          if (out.getTarget()!.getNode()!.getOutgoingEdges().length > 0) revEdges.push(out)
        }
        for (const inc of port.getIncomingEdges()) {
          if (inc.getSource()!.getNode()!.getIncomingEdges().length > 0) revEdges.push(inc)
        }
      }
      for (const re of revEdges) re.reverse(layeredGraph, true)
    }
  }
}

function processBox(box: LNode, edge: LEdge, oppositePort: LPort, realNode: LNode): void {
  let topFirst = false
  let onlyTop = false
  let onlyBottom = false
  const pc = realNode.getProperty('org.eclipse.elk.portConstraints') as string
  const isSideFixed = pc !== undefined && pc !== null && (String(pc).includes('FIXED'))
  if (isSideFixed) {
    let hasNorth = false
    let hasSouth = false
    for (const port of realNode.getPorts()) {
      for (const p2 of port.getConnectedPorts()) {
        if (!p2.getNode()!.getProperty(COMMENT_BOX)) {
          if (port.getSide() === PortSide.NORTH) { hasNorth = true; break }
          if (port.getSide() === PortSide.SOUTH) { hasSouth = true; break }
        }
      }
    }
    onlyTop = hasSouth && !hasNorth
    onlyBottom = hasNorth && !hasSouth
  }
  if (!onlyTop && !onlyBottom && realNode.getLabels().length > 0) {
    let labelPos = 0
    for (const label of realNode.getLabels()) labelPos += label.position.y + label.size.y / 2
    labelPos /= realNode.getLabels().length
    topFirst = labelPos >= realNode.size.y / 2
  } else {
    topFirst = !onlyBottom
  }

  let boxList: LNode[] | null = null
  if (topFirst) {
    const topBoxes = realNode.getProperty(TOP_COMMENTS)
    if (topBoxes === undefined || topBoxes === null) {
      boxList = []
      realNode.setProperty(TOP_COMMENTS, boxList)
    } else if (onlyTop) {
      boxList = topBoxes
    } else {
      const bottomBoxes = realNode.getProperty(BOTTOM_COMMENTS)
      if (bottomBoxes === undefined || bottomBoxes === null) {
        boxList = []
        realNode.setProperty(BOTTOM_COMMENTS, boxList)
      } else {
        boxList = topBoxes.length <= bottomBoxes.length ? topBoxes : bottomBoxes
      }
    }
  } else {
    const bottomBoxes = realNode.getProperty(BOTTOM_COMMENTS)
    if (bottomBoxes === undefined || bottomBoxes === null) {
      boxList = []
      realNode.setProperty(BOTTOM_COMMENTS, boxList)
    } else if (onlyBottom) {
      boxList = bottomBoxes
    } else {
      const topBoxes = realNode.getProperty(TOP_COMMENTS)
      if (topBoxes === undefined || topBoxes === null) {
        boxList = []
        realNode.setProperty(TOP_COMMENTS, boxList)
      } else {
        boxList = bottomBoxes.length <= topBoxes.length ? bottomBoxes : topBoxes
      }
    }
  }
  boxList.push(box)
  box.setProperty(COMMENT_CONN_PORT, oppositePort)
  // detach edge + opposite port
  if (edge.getTarget() === oppositePort) {
    edge.setTarget(null)
    if (oppositePort.getDegree() === 0) (oppositePort.setNode as (n: LNode | null) => void)(null)
    removeHierarchicalPortDummyNode(oppositePort)
  } else {
    edge.setSource(null)
    if (oppositePort.getDegree() === 0) (oppositePort.setNode as (n: LNode | null) => void)(null)
  }
  edge.getBendPoints().length = 0
}

function removeHierarchicalPortDummyNode(oppositePort: LPort): void {
  const dummy = oppositePort.getProperty(PORT_DUMMY) as LNode | null
  if (dummy !== null && dummy !== undefined) {
    const layer = dummy.getLayer()
    if (layer !== null) {
      const nodes = layer.getNodes()
      const i = nodes.indexOf(dummy)
      if (i !== -1) nodes.splice(i, 1)
      if (nodes.length === 0) {
        const layers = dummy.getGraph()!.getLayers()
        const li = layers.indexOf(layer)
        if (li !== -1) layers.splice(li, 1)
      }
    }
  }
}

/** ELK CommentNodeMarginCalculator: 为带 comment 的节点预留 margin. */
export function processCommentNodeMargins(layeredGraph: LGraph): void {
  for (const layer of layeredGraph.getLayers()) {
    for (const node of layer.getNodes()) processNodeComments(node)
  }
}

/** 单节点补充 comment margin (post-P5 margin 重算后调用, 保留 comment 空间). */
export function addCommentMarginToNode(node: LNode): void {
  processNodeComments(node)
}

function processNodeComments(node: LNode): void {
  if (process.env.GGN_CM_DBG) console.error('[CM] margin node=' + node.id + ' top/bottom comments=' + (node.getProperty(TOP_COMMENTS)?.length ?? 0) + '/' + (node.getProperty(BOTTOM_COMMENTS)?.length ?? 0))
  const margin = node.getMargin()
  const topBoxes = node.getProperty(TOP_COMMENTS)
  const bottomBoxes = node.getProperty(BOTTOM_COMMENTS)
  if ((topBoxes === undefined || topBoxes === null) && (bottomBoxes === undefined || bottomBoxes === null)) return
  const commentCommentSpacing = node.getGraph()?.getProperty(SPACING_COMMENT_COMMENT) ?? 10
  const commentNodeSpacing = node.getGraph()?.getProperty(SPACING_COMMENT_NODE) ?? 10
  let topWidth = 0
  if (topBoxes !== undefined && topBoxes !== null) {
    let maxHeight = 0
    for (const box of topBoxes) {
      maxHeight = Math.max(maxHeight, box.size.y)
      topWidth += box.size.x
    }
    topWidth += commentCommentSpacing * (topBoxes.length - 1)
    margin.top += maxHeight + commentNodeSpacing
  }
  let bottomWidth = 0
  if (bottomBoxes !== undefined && bottomBoxes !== null) {
    let maxHeight = 0
    for (const box of bottomBoxes) {
      maxHeight = Math.max(maxHeight, box.size.y)
      bottomWidth += box.size.x
    }
    bottomWidth += commentCommentSpacing * (bottomBoxes.length - 1)
    margin.bottom += maxHeight + commentNodeSpacing
  }
  const maxCommentWidth = Math.max(topWidth, bottomWidth)
  if (maxCommentWidth > node.size.x) {
    const protrusion = (maxCommentWidth - node.size.x) / 2
    margin.left = Math.max(margin.left, protrusion)
    margin.right = Math.max(margin.right, protrusion)
  }
}

/** ELK CommentPostprocessor: 在预留空间放置 comment box + 重连边 + 加回 layer (获 offset). */
export function processCommentPost(layeredGraph: LGraph): void {
  for (const layer of layeredGraph.getLayers()) {
    const boxes: LNode[] = []
    for (const node of layer.getNodes()) {
      const topBoxes = node.getProperty(TOP_COMMENTS)
      const bottomBoxes = node.getProperty(BOTTOM_COMMENTS)
      if ((topBoxes === undefined || topBoxes === null) && (bottomBoxes === undefined || bottomBoxes === null)) continue
      placeComments(node, topBoxes ?? null, bottomBoxes ?? null)
      if (topBoxes !== undefined && topBoxes !== null) boxes.push(...topBoxes)
      if (bottomBoxes !== undefined && bottomBoxes !== null) boxes.push(...bottomBoxes)
    }
    // ELK: comment box 加回 layer → 后续 offset+padding 生效 (comment 位置差 12 实证).
    for (const box of boxes) {
      if (!layer.getNodes().includes(box)) layer.getNodes().push(box)
    }
  }
}

function placeComments(node: LNode, topBoxes: LNode[] | null, bottomBoxes: LNode[] | null): void {
  const nodePos = node.position
  const nodeSize = node.size
  const margin = node.getMargin()
  const commentCommentSpacing = node.getGraph()?.getProperty(SPACING_COMMENT_COMMENT) ?? 10

  if (topBoxes !== null && topBoxes !== undefined) {
    let boxesWidth = commentCommentSpacing * (topBoxes.length - 1)
    let maxHeight = 0
    for (const box of topBoxes) {
      boxesWidth += box.size.x
      maxHeight = Math.max(maxHeight, box.size.y)
    }
    let x = nodePos.x - (boxesWidth - nodeSize.x) / 2
    const baseLine = nodePos.y - margin.top + maxHeight
    const anchorInc = nodeSize.x / (topBoxes.length + 1)
    let anchorX = anchorInc
    for (const box of topBoxes) {
      box.position.x = x
      box.position.y = baseLine - box.size.y
      x += box.size.x + commentCommentSpacing
      const boxPort = getBoxPort(box)
      if (boxPort !== null) {
        boxPort.getPosition().x = box.size.x / 2 - boxPort.getAnchor().x
        boxPort.getPosition().y = box.size.y
      }
      const nodePort = box.getProperty(COMMENT_CONN_PORT)
      if (nodePort !== null && nodePort !== undefined && nodePort.getDegree() === 1) {
        nodePort.getPosition().x = anchorX - nodePort.getAnchor().x
        nodePort.getPosition().y = 0
        nodePort.setNode(node)
      }
      anchorX += anchorInc
    }
  }
  if (bottomBoxes !== null && bottomBoxes !== undefined) {
    let boxesWidth = commentCommentSpacing * (bottomBoxes.length - 1)
    let maxHeight = 0
    for (const box of bottomBoxes) {
      boxesWidth += box.size.x
      maxHeight = Math.max(maxHeight, box.size.y)
    }
    let x = nodePos.x - (boxesWidth - nodeSize.x) / 2
    const baseLine = nodePos.y + nodeSize.y + margin.bottom - maxHeight
    const anchorInc = nodeSize.x / (bottomBoxes.length + 1)
    let anchorX = anchorInc
    for (const box of bottomBoxes) {
      box.position.x = x
      box.position.y = baseLine
      x += box.size.x + commentCommentSpacing
      const boxPort = getBoxPort(box)
      if (boxPort !== null) {
        boxPort.getPosition().x = box.size.x / 2 - boxPort.getAnchor().x
        boxPort.getPosition().y = 0
      }
      const nodePort = box.getProperty(COMMENT_CONN_PORT)
      if (nodePort !== null && nodePort !== undefined && nodePort.getDegree() === 1) {
        nodePort.getPosition().x = anchorX - nodePort.getAnchor().x
        nodePort.getPosition().y = nodeSize.y
        nodePort.setNode(node)
      }
      anchorX += anchorInc
    }
  }
}

/** 取 comment box 的连接端口, 重连边 (ELK CommentPostprocessor.getBoxPort). */
function getBoxPort(commentBox: LNode): LPort | null {
  const nodePort = commentBox.getProperty(COMMENT_CONN_PORT)
  for (const port of commentBox.getPorts()) {
    for (const edge of port.getOutgoingEdges()) {
      if (nodePort !== null && nodePort !== undefined) edge.setTarget(nodePort)
      return port
    }
    for (const edge of port.getIncomingEdges()) {
      if (nodePort !== null && nodePort !== undefined) edge.setSource(nodePort)
      return port
    }
  }
  return null
}
