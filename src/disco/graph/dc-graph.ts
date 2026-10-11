/**
 * DCGraph — alg.disco.graph.DCGraph (0.12.0).
 * 连通分量压缩的中间图结构: 分量集合 + 压缩后尺寸 + 原图属性 (布局选项).
 * Java 继承 MapPropertyHolder — TS 侧以 layoutOptions 快照承载 (copyProperties 语义).
 */
import { KVector } from '../../force/kvector.js'
import { DCComponent } from './dc-component.js'
import type { DCElement } from './dc-element.js'

export class DCGraph {
  /** 全部连通分量 (插入序, Java LinkedHashSet). */
  private components: Set<DCComponent> = new Set()
  /** 压缩后的宽高. */
  private dimensions: KVector | null = null
  /** 原 KGraph 的 insets 对应物. */
  private inset = 0.0

  /** 布局选项 (来自源 ElkNode layoutOptions/properties, 含 org.eclipse.elk.disco.* 与 polyomino 公共选项). */
  layoutOptions: Record<string, unknown>

  constructor(components: Iterable<Iterable<DCElement>>, inset = 0.0, layoutOptions: Record<string, unknown> = {}) {
    for (const elements of components) {
      const component = new DCComponent()
      component.addElements(elements)
      this.components.add(component)
    }
    this.inset = inset
    this.layoutOptions = layoutOptions
  }

  getComponents(): Set<DCComponent> {
    return this.components
  }

  getDimensions(): KVector {
    return this.dimensions!
  }

  setDimensions(dimensions: KVector): void {
    this.dimensions = dimensions
  }

  getInset(): number {
    return this.inset
  }
}
