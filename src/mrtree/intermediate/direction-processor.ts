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
 * mrtree DirectionProcessor — ELK alg.mrtree.intermediate.DirectionProcessor 0.12.0.
 * 按方向变换 (XCOOR/YCOOR 旋转/镜像): UP 取反 y; RIGHT 交换; LEFT 交换+取反 x.
 */
import { TGraph, P_XCOOR, P_YCOOR, getInt, setProp } from '../graph.js'
import { DIRECTION } from '../options.js'

export function directionProcessor(tGraph: TGraph): void {
  const d = tGraph.props[DIRECTION] as string | undefined
  if (d === 'DOWN' || d === undefined || d === null) return
  for (const n of tGraph.getNodes()) {
    let x = getInt(n, P_XCOOR, 0)
    let y = getInt(n, P_YCOOR, 0)
    switch (d.toUpperCase()) {
      case 'UP':
        y *= -1
        break
      case 'RIGHT': {
        const tmp = x
        x = y
        y = tmp
        break
      }
      case 'LEFT': {
        const tmp2 = x
        x = -y
        y = tmp2
        break
      }
    }
    setProp(n, P_XCOOR, x)
    setProp(n, P_YCOOR, y)
  }
}
