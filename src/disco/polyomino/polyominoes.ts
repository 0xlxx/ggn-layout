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
 * Polyominoes — alg.common.polyomino.structures.Polyominoes (0.12.0).
 * 持有若干 polyomino 及其放置网格; 可选 ProfileFill 填充孔洞.
 */
import { ProfileFill } from './profile-fill.js'
import { PlanarGrid } from './planar-grid.js'
import type { Polyomino } from './polyomino.js'

export class Polyominoes<P extends Polyomino> {
  private polys: P[] = []
  private grid: PlanarGrid

  /** PolyominoOptions.POLYOMINO_LOW_LEVEL_SORT (packPolyominoes 时读取, Java getProperty 语义). */
  lowLevelSort: string
  /** PolyominoOptions.POLYOMINO_HIGH_LEVEL_SORT. */
  highLevelSort: string
  /** PolyominoOptions.POLYOMINO_TRAVERSAL_STRATEGY. */
  traversalStrategy: string

  constructor(polys: Iterable<P>, aspectRatio: number, fill = false, lowLevelSort = 'BY_SIZE_AND_SHAPE',
    highLevelSort = 'NUM_OF_EXTERNAL_SIDES_THAN_NUM_OF_EXTENSIONS_LAST', traversalStrategy = 'QUADRANTS_LINE_BY_LINE') {
    this.lowLevelSort = lowLevelSort
    this.highLevelSort = highLevelSort
    this.traversalStrategy = traversalStrategy
    let gridWidth = 0
    let gridHeight = 0

    for (const poly of polys) {
      if (fill) {
        ProfileFill.fillPolyomino(poly)
      }
      this.polys.push(poly)
      gridWidth += poly.getWidth()
      gridHeight += poly.getHeight()
    }

    // Add width and height of the future center polyomino once again, for avoiding
    // Indices Out of bounds (might get better, see last todo)
    if (this.polys.length > 0) {
      const poly = this.polys[0]
      gridWidth += poly.getWidth()
      gridHeight += poly.getHeight()
    }

    // Make the area 4 times greater for the case that all polyominoes can only be placed in one quadrant of the
    // coordinate system
    gridWidth *= 2
    gridHeight *= 2

    // Adjust grid size for desired aspect ratio
    if (aspectRatio > 1.0) {
      gridWidth = Math.ceil(gridWidth * aspectRatio)
    } else {
      gridHeight = Math.ceil(gridHeight / aspectRatio)
    }

    this.grid = new PlanarGrid(gridWidth, gridHeight)
  }

  getPolyominoes(): P[] {
    return this.polys
  }

  getGrid(): PlanarGrid {
    return this.grid
  }
}
