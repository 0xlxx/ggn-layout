/**
 * PortSideProcessor (对应 ELK intermediate.PortSideProcessor).
 * P2 后 P3 前: 为端口定侧 (in/out → WEST/EAST); 断环前定侧语义 (revAware) 保留反转边原侧.
 * 现代 TS: 模块级纯函数.
 */
import type { LGraph } from '../graph/lgraph.js'
import type { LNode } from '../graph/lnode.js'
import type { LPort } from '../graph/lport.js'
import { PortSide, PortConstraints, Direction } from '../graph/enums.js'
import { PORT_DUMMY, EXT_PORT_SIDE, REVERSED } from '../options/internal-properties.js'
import { PORT_CONSTRAINTS, FEEDBACK_EDGES } from '../options/layered-options.js'
import { sideFromDirection, oppositeSide } from '../graph/lgraph-util.js'

export function processPortSides(layeredGraph: LGraph): void {
  // ELK 断环前定侧 (jar 实证: PortSideProcessor 在 ModelOrderCycleBreaker 之前) 对 REV 边保留原侧
  // → EAST 输入/WEST 输出 inverted-port (Issue871). 仅 FEEDBACK_EDGES=true 时启用: ggn 对 inverted
  // 边 (无 dummy) 的 BK/路由处理未与 jar 对齐, 全局启用会回归 noFeedback 等.
  const revAware = layeredGraph.getProperty(FEEDBACK_EDGES)
  for (const node of layeredGraph.getLayerlessNodes()) processNode(node, revAware)
  for (const layer of layeredGraph.getLayers()) {
    for (const node of layer.getNodes()) processNode(node, revAware)
  }
}

function processNode(node: LNode, revAware: boolean): void {
  if (PortConstraints.isSideFixed(node.getProperty(PORT_CONSTRAINTS))) {
    for (const port of node.getPorts()) {
      if (port.getSide() === PortSide.UNDEFINED) setPortSide(port, revAware)
    }
  } else {
    for (const port of node.getPorts()) setPortSide(port, revAware)
    node.setProperty(PORT_CONSTRAINTS, PortConstraints.FIXED_SIDE)
  }
}

export function setPortSide(port: LPort, revAware = false, direction: Direction = Direction.RIGHT): void {
  const portDummy = port.getProperty(PORT_DUMMY) as LNode | null
  if (portDummy !== null && portDummy !== undefined) {
    port.setSideInferred(portDummy.getProperty(EXT_PORT_SIDE))
    return
  }
  let netFlow = 0
  if (revAware) {
    // REV 边反向计 (ELK 断环前定侧语义: 反转边保留原侧 → EAST 输入/WEST 输出 inverted-port).
    for (const e of port.getIncomingEdges()) netFlow += e.getProperty<boolean>(REVERSED) ? -1 : 1
    for (const e of port.getOutgoingEdges()) netFlow -= e.getProperty<boolean>(REVERSED) ? -1 : 1
  } else {
    netFlow = port.getNetFlow()
  }
  // ELK Java 导入期 ensureDefinedPortSide (javap ElkGraphImporter 实证): FREE 端口按 netFlow 定侧,
  // 输出侧 = PortSide.fromDirection(direction) (RIGHT→EAST / DOWN→SOUTH / LEFT→WEST / UP→NORTH),
  // 输入侧 = opposed. 此前 ggn 恒定 EAST/WEST (LTR 语义) → DOWN/UP 下 FREE 端口侧错误 →
  // applyNestedGraphMinimumSizes 的 cell 计算 PORT_LABELS 贡献方向错 (304 实证, 2026-08-16 P1-1).
  // 默认 direction=RIGHT 保持原调用 (PortSideProcessor P2 后 canonical LTR 用 EAST/WEST 正确).
  const outSide = sideFromDirection(direction)
  const side = netFlow < 0 ? outSide : oppositeSide(outSide)
  if (process.env.GGN_PS_DBG) console.error(`[PS] port=${port.id} netFlow=${netFlow} set=${side} dir=${direction}`)
  port.setSideInferred(side)
}
