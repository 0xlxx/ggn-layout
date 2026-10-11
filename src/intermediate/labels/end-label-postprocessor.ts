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
 * EndLabelPostprocessor (对应 ELK intermediate.EndLabelPostprocessor).
 *
 * P5 后: 节点最终坐标已知, 把 label cell 矩形平移到世界坐标并给标签赋最终坐标,
 * 最后清除节点的 END_LABELS 属性.
 */
import type { LGraph } from '../../graph/lgraph.js'
import type { LNode } from '../../graph/lnode.js'
import type { LPort } from '../../graph/lport.js'
import { NodeType } from '../../graph/enums.js'
import { END_LABELS } from '../../options/internal-properties.js'
import type { LabelCell } from './label-cell.js'

export function processEndLabelPostprocessing(layeredGraph: LGraph): void {
  for (const layer of layeredGraph.getLayers()) {
    for (const node of layer.getNodes()) {
      if ((node.getType() === NodeType.NORMAL || node.getType() === NodeType.EXTERNAL_PORT)
        && node.hasProperty(END_LABELS)) {
        processNode(node)
      }
    }
  }
}

function processNode(node: LNode): void {
  const endLabelCells = node.getProperty(END_LABELS) as Map<LPort, unknown>
  if (endLabelCells === undefined || endLabelCells === null) return

  const nodePos = node.getPosition()
  for (const cell of endLabelCells.values()) {
    const labelCell = cell as LabelCell
    const cellRect = labelCell.cellRectangle
    cellRect.x += nodePos.x
    cellRect.y += nodePos.y
    labelCell.applyLabelLayout()
  }

  // 清除 label cells
  node.setProperty(END_LABELS, null)
}
