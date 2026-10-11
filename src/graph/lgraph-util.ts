/**
 * LGraphUtil (对应 ELK graph.LGraphUtil 的 compound 相关部分).
 */
import type { LGraph } from './lgraph.js'
import type { LEdge } from './ledge.js'
import { LNode } from './lnode.js'
import { LPort } from './lport.js'
import type { KVector } from './enums.js'
import { PortSide, Direction, NodeType, PortConstraints, LayerConstraint, EdgeConstraint, InLayerConstraint } from './enums.js'
import { EXT_PORT_SIZE, EXT_PORT_SIDE, PORT_DUMMY, ORIGIN, TARGET_OFFSET } from '../options/internal-properties.js'
import { PORT_BORDER_OFFSET, DIRECTION, ASPECT_RATIO, PORT_CONSTRAINTS, PORT_SIDE, PORT_ANCHOR, INSIDE_SELF_LOOPS_YO, HIERARCHY_HANDLING } from '../options/layered-options.js'
import { PORT_RATIO_OR_POSITION } from '../options/internal-properties.js'

/** 端口侧 → 布局方向 (ELK PortSide.fromDirection 辅助). */
export function sideFromDirection(direction: Direction, opposedFlag = false): PortSide {
  let side: PortSide
  switch (direction) {
    case Direction.RIGHT: side = PortSide.EAST; break
    case Direction.LEFT: side = PortSide.WEST; break
    case Direction.DOWN: side = PortSide.SOUTH; break
    case Direction.UP: side = PortSide.NORTH; break
    default: side = PortSide.EAST; break
  }
  return opposedFlag ? oppositeSide(side) : side
}

export function oppositeSide(side: PortSide): PortSide {
  switch (side) {
    case PortSide.NORTH: return PortSide.SOUTH
    case PortSide.SOUTH: return PortSide.NORTH
    case PortSide.EAST: return PortSide.WEST
    case PortSide.WEST: return PortSide.EAST
    default: return PortSide.UNDEFINED
  }
}

/** 布局方向 (ELK LGraphUtil.getDirection). */
export function getDirection(graph: LGraph): Direction {
  const direction = graph.getProperty(DIRECTION)
  if (direction === Direction.UNDEFINED) {
    const aspectRatio = graph.getProperty(ASPECT_RATIO)
    return aspectRatio >= 1 ? Direction.RIGHT : Direction.DOWN
  }
  return direction
}

/** node 是否是 ancestor 的后代 (含自身? ELK: 不含自身, 用于层级判断). */
export function isDescendant(node: LNode, ancestor: LNode | null): boolean {
  // ELK: 从父节点开始, 自身不算后代.
  let current: LNode | null = node.getGraph()?.getParentNode() ?? null
  while (current !== null) {
    if (current === ancestor) return true
    current = current.getGraph()?.getParentNode() ?? null
  }
  return false
}

/**
 * 边的最终端点 (对齐 ELK ElkGraphLayoutTransferrer):
 * 跨层级边 (目标在源嵌套图内) 统一到引用图坐标系 —
 *   源端点 = 源端口 position + anchor (相对源节点, 即引用图坐标);
 *   目标端点 = 目标端口绝对锚点 + TARGET_OFFSET (ELK 输出层在合并时设置).
 * 非跨层级边: 两端都是绝对锚点 (单层 LGraph 语义).
 */
/** 递归父链绝对坐标 (多层嵌套; 对应 ELK 输出层递归 getAbsoluteAnchor + graph offset). */
function recursiveAnchor(port: LPort): KVector {
  let x = port.getPosition().x + port.getAnchor().x
  let y = port.getPosition().y + port.getAnchor().y
  let node: LNode | null = port.getNode()
  while (node !== null) {
    x += node.position.x
    y += node.position.y
    const g = node.getGraph()
    node = g?.getParentNode() ?? null
  }
  return { x, y }
}

/** 递归锚点到指定祖先停止 (不含 stopNode 的 pos): 用于反向跨层级边,
 * 端点取「边所属图 (stopNode 内容) 坐标」— 与路由弯点同坐标系 (对齐 ELK section start/end).
 * stopNode 为 null 时走到最顶层 (root 容器, 真绝对坐标). */
function recursiveAnchorTo(port: LPort, stopNode: LNode | null): KVector {
  let x = port.getPosition().x + port.getAnchor().x
  let y = port.getPosition().y + port.getAnchor().y
  let node: LNode | null = port.getNode()
  while (node !== null && node !== stopNode) {
    x += node.position.x
    y += node.position.y
    const g = node.getGraph()
    node = g?.getParentNode() ?? null
  }
  return { x, y }
}

/** 两节点的最深公共祖先节点 (ELK 边挂载容器); 无共同祖先节点 (仅根容器) → null. */
export function lcaNodeOf(a: LNode, b: LNode): LNode | null {
  const ancestors = new Set<LNode>()
  let n: LNode | null = a
  while (n !== null) { ancestors.add(n); n = n.getGraph()?.getParentNode() ?? null }
  n = b
  while (n !== null) { if (ancestors.has(n)) return n; n = n.getGraph()?.getParentNode() ?? null }
  return null
}

export function getEdgeEndpoints(e: LEdge): { source: KVector; target: KVector } {
  const srcPort = e.getSource()!
  const tgtPort = e.getTarget()!
  const srcNode = srcPort.getNode()!
  const tgtNode = tgtPort.getNode()!
  let source: KVector
  let target: KVector
  if (srcNode === tgtNode && e.getProperty(INSIDE_SELF_LOOPS_YO)) {
    // inside 自环端点规则 (jar 实证, ELK ElkGraphLayoutTransferrer L263 sourcePoint =
    // ledge.getSource().getAbsoluteAnchor()):
    //   - INCLUDE_CHILDREN (compound 路径): CompoundGraphPreprocessor.processInsideSelfLoops 把
    //     yo 自环换成嵌套图里的外部端口 dummy 边, 最终端点 = 端口**绝对锚点** (端口位置由
    //     层级端口布局调整到位) — inside_outside P1 s22 / 167 P1 s42 / 548 P1 s12 实证.
    //   - SEPARATE_CHILDREN (simple 路径): RecursiveGraphLayoutEngine 对节点内容单独跑 layered,
    //     端口变内容图外部端口 dummy 并贴节点边界, 最终端点 = 节点**边界点** (端口内边投影) —
    //     298 P2 WEST s32,34 非 (12,34) 锚点, P5 SOUTH t44,56 非 (44,76) 实证.
    // ggn 的 HIERARCHY_HANDLING 只设在根图 (buildLGraphFromParsed), 子图 getProperty 不继承,
    // 需沿父链上溯到根判断当前布局运行的层级处理模式.
    const n = srcNode
    let g: LGraph | null = n.getGraph()
    let includeChildren = false
    while (g !== null) {
      if (g.getProperty(HIERARCHY_HANDLING) === 'INCLUDE_CHILDREN') { includeChildren = true; break }
      g = g.getParentNode()?.getGraph() ?? null
    }
    if (includeChildren) {
      source = srcPort.getAbsoluteAnchor()
      target = tgtPort.getAbsoluteAnchor()
    } else {
      // 边界点 = 端口**内边** (靠节点边界侧): WEST pos.x+size.x / EAST pos.x / NORTH pos.y+size.y /
      // SOUTH pos.y — 端口可部分在节点外 (298 P2 x=-20) 或内 (273 P2 x=0), 内边始终在边界.
      const boundary = (side: PortSide, port: LPort): KVector => {
        switch (side) {
          case PortSide.WEST: return { x: n.position.x + port.getPosition().x + port.getSize().x, y: n.position.y + port.getPosition().y + port.getSize().y / 2 }
          case PortSide.EAST: return { x: n.position.x + port.getPosition().x, y: n.position.y + port.getPosition().y + port.getSize().y / 2 }
          case PortSide.NORTH: return { x: n.position.x + port.getPosition().x + port.getSize().x / 2, y: n.position.y + port.getPosition().y + port.getSize().y }
          case PortSide.SOUTH: return { x: n.position.x + port.getPosition().x + port.getSize().x / 2, y: n.position.y + port.getPosition().y }
          default: return port.getAbsoluteAnchor()
        }
      }
      source = boundary(srcPort.getSide(), srcPort)
      target = boundary(tgtPort.getSide(), tgtPort)
    }
  } else if (isDescendant(tgtNode, srcNode)) {
    // 正向跨层级 (目标在源嵌套图内): 源端口相对源节点 (引用图 = 源节点子图) 坐标
    source = {
      x: srcPort.getPosition().x + srcPort.getAnchor().x,
      y: srcPort.getPosition().y + srcPort.getAnchor().y,
    }
    const tgtAbs = tgtPort.getAbsoluteAnchor()
    const off = e.getProperty(TARGET_OFFSET)
    target = off ? { x: tgtAbs.x + off.x, y: tgtAbs.y + off.y } : tgtAbs
  } else if (isDescendant(srcNode, tgtNode)) {
    // 反向跨层级 (源在目标嵌套图内): 端点取「边所属图 (tgtNode 内容) 坐标」—
    // 与路由弯点同坐标系 (对齐 ELK section start/end; recursiveAnchor 到根图会多含
    // tgtNode 在父图的位置, 导致正交检查假失败, 例 Zigbee edge 192 srcAnchor (129,149) vs (109,137)).
    source = recursiveAnchorTo(srcPort, tgtNode)
    target = recursiveAnchorTo(tgtPort, tgtNode)
  } else if (srcNode === tgtNode) {
    // 普通自环 (非 inside): 端点 = 端口绝对锚点 (挂载容器 = 节点所在图的父容器,
    // 节点位置相对该容器 — 288/352 的 spline 自环 jar 实证).
    source = srcPort.getAbsoluteAnchor()
    const tgtAbs = tgtPort.getAbsoluteAnchor()
    const off = e.getProperty(TARGET_OFFSET)
    target = off ? { x: tgtAbs.x + off.x, y: tgtAbs.y + off.y } : tgtAbs
  } else {
    // 普通/跨分支层级边: 端点取「边挂载容器 (src/tgt 最深公共祖先节点) 内容」坐标系 —
    // 与提取层 lcaNode (elk-json.ts) 的挂载容器一致 (ELK calculateHierarchicalOffset 语义:
    // section 起点 = 源端口锚点 + 层级偏移到 COORDINATE_SYSTEM_ORIGIN).
    // 例 288b NN7.N2.N1->NN7.N4: 源锚点 (72,27) 在 N2 内容坐标, 挂 N7.edges 需 + N2.pos →
    // (180.33,50.33) jar 一致; 352 NN2.M1->NN3 同理 (258,22)→(365,44).
    const container = lcaNodeOf(srcNode, tgtNode)
    source = recursiveAnchorTo(srcPort, container)
    // 注意: 不叠加 TARGET_OFFSET — CompoundGraphPostprocessor 设置的 tOffset 是给旧路径
    // (tgtPort.getAbsoluteAnchor() 只含 tgtNode 自身位置) 补父链用的; recursiveAnchorTo 已走到
    // 挂载容器, 再叠加会双计父节点位置 (288a NA1->NA2.B1: (120.33,39)+(108.33,12)=(228.67,51) 错).
    target = recursiveAnchorTo(tgtPort, container)
  }
  return { source, target }
}

/** 坐标转换: 把相对 oldGraph 的点变换为相对 newGraph (ELK changeCoordSystem). */
export function changeCoordSystem(point: KVector, oldGraph: LGraph, newGraph: LGraph): KVector {
  if (oldGraph === newGraph) return point

  // to absolute coordinates
  let graph: LGraph | null = oldGraph
  let node: LNode | null = null
  do {
    const offset = graph!.getOffset()
    point.x += offset.x
    point.y += offset.y
    node = graph!.getParentNode()
    if (node !== null) {
      const padding = graph!.getPadding()
      point.x += padding.left
      point.y += padding.top
      point.x += node.getPosition().x
      point.y += node.getPosition().y
      graph = node.getGraph()
    }
  } while (node !== null)

  // to relative coordinates (of newGraph)
  graph = newGraph
  do {
    const offset = graph!.getOffset()
    point.x -= offset.x
    point.y -= offset.y
    node = graph!.getParentNode()
    if (node !== null) {
      const padding = graph!.getPadding()
      point.x -= padding.left
      point.y -= padding.top
      point.x -= node.getPosition().x
      point.y -= node.getPosition().y
      graph = node.getGraph()
    }
  } while (node !== null)

  return point
}

/** 偏移向量: sourceGraph 相对 targetGraph (changeCoordSystem 作用于 (0,0)). */
export function coordSystemOffset(sourceGraph: LGraph, targetGraph: LGraph): KVector {
  const v: KVector = { x: 0, y: 0 }
  return changeCoordSystem(v, sourceGraph, targetGraph)
}

/**
 * 创建外部端口 dummy 节点 (ELK LGraphUtil.createExternalPortDummy).
 */
export function createExternalPortDummy(
  propertyHolder: { getProperty<T>(p: unknown): T; setProperty(p: unknown, v: unknown): void },
  portConstraints: PortConstraints,
  portSide: PortSide,
  netFlow: number,
  portNodeSize: KVector | null,
  portPosition: KVector | null,
  portSize: KVector,
  layoutDirection: Direction,
  layeredGraph: LGraph,
): LNode {
  let finalExternalPortSide = portSide

  const dummy = new LNode(layeredGraph)
  dummy.setType(NodeType.EXTERNAL_PORT)
  dummy.setProperty(EXT_PORT_SIDE, finalExternalPortSide)
  dummy.setProperty(EXT_PORT_SIZE, portSize)
  dummy.setProperty(PORT_CONSTRAINTS, PortConstraints.FIXED_POS)
  const portBorderOffset = propertyHolder.getProperty<number>(PORT_BORDER_OFFSET)
  dummy.setProperty(PORT_BORDER_OFFSET, portBorderOffset)

  const dummyPort = new LPort()
  dummyPort.setNode(dummy)

  if (!PortConstraints.isSideFixed(portConstraints)) {
    if (netFlow >= 0) {
      finalExternalPortSide = sideFromDirection(layoutDirection)
    } else {
      finalExternalPortSide = oppositeSide(sideFromDirection(layoutDirection))
    }
    if (process.env.GGN_EP_SIDE) console.error(`[EP-SIDE] set side=${finalExternalPortSide} netFlow=${netFlow} holder=${propertyHolder instanceof LPort ? 'LPort' : 'other'}`)
    propertyHolder.setProperty(PORT_SIDE, finalExternalPortSide)
    // ggn 的 LPort.getSide() 读 side 字段 (非属性): 必须同步更新, 否则 CGP 定的侧被后续
    // PortSideProcessor 按 netFlow 重算覆盖 (inside_outside 实证: P1 应为 WEST (inside 自环 source),
    // ggn 得 EAST → 自环方向翻转). ELK 在 import 时读 ElkPort 的 PORT_SIDE 属性设 LPort.side.
    if (propertyHolder instanceof LPort) {
      // ELK import 时从 ElkPort 读侧设 LPort.side (视为已定侧, 后续不重算). ggn 用 setSide
      // (explicit) 防止 PortSideProcessor 按 netFlow 覆盖 (inside_outside: CGP 定 source=WEST).
      propertyHolder.setSide(finalExternalPortSide)
    }
  }

  // ELK LGraphUtil.createExternalPortDummy: FIXED_RATIO/FIXED_POS 端口设 PORT_RATIO_OR_POSITION
  // (W/E 用 portPosition.y, N/S 用 portPosition.x; FIXED_RATIO 除以节点尺寸). 缺此属性 →
  // HierarchicalPortPositionProcessor 用 null → NaN (548 FIXED_POS inside 自环 dummy 实证).
  if (PortConstraints.isRatioFixed(portConstraints) || PortConstraints.isPosFixed(portConstraints)) {
    let informationAboutIt = 0
    switch (finalExternalPortSide) {
      case PortSide.WEST:
      case PortSide.EAST:
        informationAboutIt = portPosition?.y ?? 0
        if (PortConstraints.isRatioFixed(portConstraints)) {
          informationAboutIt /= (portNodeSize?.y ?? 1)
        }
        break
      case PortSide.NORTH:
      case PortSide.SOUTH:
        informationAboutIt = portPosition?.x ?? 0
        if (PortConstraints.isRatioFixed(portConstraints)) {
          informationAboutIt /= (portNodeSize?.x ?? 1)
        }
        break
    }
    dummy.setProperty(PORT_RATIO_OR_POSITION, informationAboutIt)
  }

  const anchor: KVector = { x: portSize.x / 2, y: portSize.y / 2 }
  let explicitAnchor = false
  if (propertyHolder.getProperty<boolean>(PORT_ANCHOR) !== undefined) {
    const a = propertyHolder.getProperty<KVector>(PORT_ANCHOR)
    if (a !== undefined && a !== null) {
      anchor.x = a.x
      anchor.y = a.y
      explicitAnchor = true
    }
  }

  switch (finalExternalPortSide) {
    case PortSide.WEST:
      dummy.setLayerConstraint(LayerConstraint.FIRST_SEPARATE)
      dummy.setEdgeConstraint(EdgeConstraint.OUTGOING_ONLY)
      dummy.size.y = portSize.y
      if (portBorderOffset < 0) dummy.size.x = -portBorderOffset
      dummyPort.setSide(PortSide.EAST)
      if (!explicitAnchor) anchor.x = portSize.x
      anchor.x -= portSize.x
      break
    case PortSide.EAST:
      dummy.setLayerConstraint(LayerConstraint.LAST_SEPARATE)
      dummy.setEdgeConstraint(EdgeConstraint.INCOMING_ONLY)
      dummy.size.y = portSize.y
      if (portBorderOffset < 0) dummy.size.x = -portBorderOffset
      dummyPort.setSide(PortSide.WEST)
      if (!explicitAnchor) anchor.x = 0
      break
    case PortSide.NORTH:
      dummy.setInLayerConstraint(InLayerConstraint.TOP)
      dummy.size.x = portSize.x
      if (portBorderOffset < 0) dummy.size.y = -portBorderOffset
      dummyPort.setSide(PortSide.SOUTH)
      if (!explicitAnchor) anchor.y = portSize.y
      anchor.y -= portSize.y
      break
    case PortSide.SOUTH:
      dummy.setInLayerConstraint(InLayerConstraint.BOTTOM)
      dummy.size.x = portSize.x
      if (portBorderOffset < 0) dummy.size.y = -portBorderOffset
      dummyPort.setSide(PortSide.NORTH)
      if (!explicitAnchor) anchor.y = 0
      break
    default:
      break
  }

  // ELK LGraphUtil.createExternalPortDummy: anchor 作为属性存到 dummy, 端口 position 设为 anchor.
  // (LPort.setSide 会在 !explicitlySuppliedPortAnchor 时重置 port.anchor → 不能只 setAnchor,
  //  BKAligner 用 position.y + anchor.y 算 portPosDiff, position 不会被 setSide 重置.)
  dummyPort.getPosition().x = anchor.x
  dummyPort.getPosition().y = anchor.y
  dummy.setProperty(PORT_ANCHOR, { x: anchor.x, y: anchor.y })
  if (portPosition !== null && portPosition !== undefined) {
    dummy.getPosition().x = portPosition.x
    dummy.getPosition().y = portPosition.y
  }
  dummy.setProperty(EXT_PORT_SIDE, finalExternalPortSide)

  return dummy
}

/** 端口的净流 (ELK CompoundGraphPreprocessor.calculateNetFlow 简化: 无 self loop 支持). */
export function calculateNetFlow(port: LPort): number {
  const node = port.getNode()!
  let outputPortVote = 0
  let inputPortVote = 0

  for (const outgoingEdge of port.getOutgoingEdges()) {
    const isSelfLoop = outgoingEdge.isSelfLoop()
    const targetNode = outgoingEdge.getTarget()!.getNode()!
    if (isSelfLoop) {
      outputPortVote++
    } else if (targetNode.getGraph()!.getParentNode() === node) {
      inputPortVote++
    } else {
      outputPortVote++
    }
  }
  for (const incomingEdge of port.getIncomingEdges()) {
    const isSelfLoop = incomingEdge.isSelfLoop()
    const sourceNode = incomingEdge.getSource()!.getNode()!
    if (isSelfLoop) {
      inputPortVote++
    } else if (sourceNode.getGraph()!.getParentNode() === node) {
      outputPortVote++
    } else {
      inputPortVote++
    }
  }
  return outputPortVote - inputPortVote
}

export { PORT_DUMMY as PORT_DUMMY_REF, ORIGIN as ORIGIN_REF }

/** ELK LGraphUtil.calcPortSide: 从端口位置计算侧 (方向相关). */
export function calcPortSide(port: LPort, direction: Direction): PortSide {
  const node = port.getNode()!
  const nodeWidth = node.size.x
  const nodeHeight = node.size.y
  if (nodeWidth <= 0 && nodeHeight <= 0) return PortSide.UNDEFINED
  const xpos = port.getPosition().x
  const ypos = port.getPosition().y
  const width = port.size.x
  const height = port.size.y
  switch (direction) {
    case Direction.LEFT:
    case Direction.RIGHT:
      if (xpos < 0) return PortSide.WEST
      else if (xpos + width > nodeWidth) return PortSide.EAST
      break
    case Direction.UP:
    case Direction.DOWN:
      if (ypos < 0) return PortSide.NORTH
      else if (ypos + height > nodeHeight) return PortSide.SOUTH
      break
  }
  const widthPercent = (xpos + width / 2) / nodeWidth
  const heightPercent = (ypos + height / 2) / nodeHeight
  if (widthPercent + heightPercent <= 1 && widthPercent - heightPercent <= 0) return PortSide.WEST
  else if (widthPercent + heightPercent >= 1 && widthPercent - heightPercent >= 0) return PortSide.EAST
  else if (heightPercent < 0.5) return PortSide.NORTH
  else return PortSide.SOUTH
}

/** ELK LGraphUtil.calcPortOffset: 端口相对节点边框的外扩量 (0 = 贴边框). */
export function calcPortOffset(port: LPort, side: PortSide): number {
  const node = port.getNode()
  const pos = port.getPosition()
  switch (side) {
    case PortSide.NORTH: return -(pos.y + port.size.y)
    case PortSide.EAST: return pos.x - (node?.size.x ?? 0)
    case PortSide.SOUTH: return pos.y - (node?.size.y ?? 0)
    case PortSide.WEST: return -(pos.x + port.size.x)
  }
  return 0
}

/** ELK LGraphUtil.initializePort: FIXED_POS/FIXED_RATIO 端口侧缺失时按位置计算 + 锚点. */
export function initializePort(port: LPort, portConstraints: PortConstraints, direction: Direction): void {
  let portSide = port.getSide()
  // ELK LGraphUtil.initializePort: 所有 side-fixed 约束 (FIXED_SIDE/FIXED_ORDER/FIXED_POS/FIXED_RATIO)
  // 端口侧 UNDEFINED 时按位置计算 (isSideFixed)。
  const needsSide = PortConstraints.isSideFixed(portConstraints)
  if (portSide === PortSide.UNDEFINED && needsSide) {
    portSide = calcPortSide(port, direction)
    // 位置推断侧 (ELK ensureDefinedPortSide 语义), 非用户显式 → 不置 explicitSide (340 等保留输入位置).
    port.setSideInferred(portSide)
    // ELK LGraphUtil.initializePort (0.12.0 字节码确认): 位置非 (0,0) 且未显式设置 offset 时,
    // 从端口位置推导 PORT_BORDER_OFFSET (LabelAndNodeSizeProcessor 用 offset 还原输入 y;
    // portConstraints 实测: FIXED_SIDE + 位置推断侧端口 (10,-10)/(15,40) → offset 2/10 → 保留 y=-10/40).
    if (!port.hasProperty(PORT_BORDER_OFFSET) && portSide !== PortSide.UNDEFINED
      && (port.getPosition().x !== 0 || port.getPosition().y !== 0)) {
      port.setProperty(PORT_BORDER_OFFSET, calcPortOffset(port, portSide))
    }
  }
  const portSize = port.size
  const portAnchor = port.getAnchor()
  if (portSide !== PortSide.UNDEFINED) {
    switch (portSide) {
      case PortSide.NORTH: portAnchor.x = portSize.x / 2; break
      case PortSide.EAST: portAnchor.x = portSize.x; portAnchor.y = portSize.y / 2; break
      case PortSide.SOUTH: portAnchor.x = portSize.x / 2; portAnchor.y = portSize.y; break
      case PortSide.WEST: portAnchor.y = portSize.y / 2; break
    }
  } else {
    portAnchor.x = portSize.x / 2
    portAnchor.y = portSize.y / 2
  }
}
