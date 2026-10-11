/*
 * Copyright (c) 2026 GGN contributors.
 * Portions derived from the Eclipse Layout Kernel (ELK), Copyright (c) Kiel University and others.
 *
 * This file is part of ggn-layout, a TypeScript port of ELK v0.12.0.
 * Upstream attribution and source range: see THIRD_PARTY_NOTICES.md.
 *
 * SPDX-License-Identifier: EPL-2.0
 * License text: LICENSES/EPL-2.0.txt.
 */
/**
 * Grid (ELK alg.topdownpacking Grid.java 接口 + GridElkNode 的 2D 存储).
 *
 * 与 Java 一致的语义:
 *   - setGridSize 初始化 rows 个全 null 行 (每行 cols 个);
 *   - put 是「插入」到 col 下标 (ArrayList.add(col, item)) — 后续元素右移, 行列表因此增长;
 *     放置总是按列序 0,1,2,… 填充, 非空项连续位于行首, 尾部为 null;
 *   - getRow 返回实际行列表 (含尾部 null), getColumn 按行序抽取指定列.
 */
export class Grid<T> {
  private grid: (T | null)[][] = []
  private rows = 0
  private cols = 0

  /** 存储 item 到 (col,row); 越界抛错 (Java IndexOutOfBoundsException). */
  put(col: number, row: number, item: T): void {
    if (col >= this.cols || row >= this.rows) {
      throw new Error(`The grid has a size of (${this.cols} x ${this.rows}). The requested index of (${col} x ${row}) is out of bounds.`)
    }
    this.grid[row]!.splice(col, 0, item)
  }

  /** 返回 (col,row) 处的 item; 越界抛错. */
  get(col: number, row: number): T | null {
    if (col >= this.cols || row >= this.rows) {
      throw new Error(`The grid has a size of (${this.cols} x ${this.rows}). The requested index of (${col} x ${row}) is out of bounds.`)
    }
    return this.grid[row]![col] ?? null
  }

  /** 返回指定行 (含尾部 null, Java getRow 直接返回 backing list). */
  getRow(row: number): (T | null)[] {
    if (row >= this.rows) {
      throw new Error(`The grid has a size of (${this.cols} x ${this.rows}). The requested row ${row}) is out of bounds.`)
    }
    return this.grid[row]!
  }

  /** 返回指定列 (按行序; Java getColumn 构建新列表). */
  getColumn(col: number): (T | null)[] {
    if (col >= this.cols) {
      throw new Error(`The grid has a size of (${this.cols} x ${this.rows}). The requested column ${col}) is out of bounds.`)
    }
    const resultList: (T | null)[] = []
    for (let i = 0; i < this.rows; i++) resultList.push(this.grid[i]![col] ?? null)
    return resultList
  }

  getColumns(): number { return this.cols }

  getRows(): number { return this.rows }

  setGridSize(cols: number, rows: number): void {
    this.cols = cols
    this.rows = rows
    this.grid = []
    for (let i = 0; i < rows; i++) {
      const row: (T | null)[] = []
      for (let j = 0; j < cols; j++) row.push(null)
      this.grid.push(row)
    }
  }
}
