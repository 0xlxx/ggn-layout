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
 * intermediate-edge-angle — ELK alg.radial.intermediate.EdgeAngleCalculator.
 *
 * 计算根节点各出边的角度并保存在目标节点上 (ROTATION_TARGET_ANGLE, 内存属性),
 * 供后续子布局作为入边对齐依据. 仅在 top-down 场景有意义.
 */
import type { ElkNode } from '../api/elk-json.js'
import { ROTATION_TARGET_ANGLE, setGraphProperty, getGraphProperty } from './options.js'
import { findNodeById, nodeIdOfRef, outgoingEdges } from './radial-util.js'
import { INTERNAL_ROOT_NODE } from './radial-layout.js'

/** 计算出边角度 (Java EdgeAngleCalculator.process). */
export function edgeAngleCalculator(graph: ElkNode): void {
  const root = getGraphProperty<ElkNode>(graph, INTERNAL_ROOT_NODE, undefined as unknown as ElkNode)
  for (const edge of outgoingEdges(graph, root)) {
    const section = edge.sections?.[0]
    if (section === undefined) continue
    const start = section.startPoint
    const end = section.endPoint
    if (start === undefined || end === undefined) continue

    const edgeVector = { x: end.x - start.x, y: end.y - start.y }
    const angle = Math.atan2(edgeVector.y, edgeVector.x)

    const target = findNodeById(graph, nodeIdOfRef(graph, String(edge.targets?.[0] ?? '')) ?? '')
    if (target !== undefined) {
      setGraphProperty(target, ROTATION_TARGET_ANGLE, angle)
    }
  }
}
