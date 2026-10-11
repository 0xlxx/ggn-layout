/**
 * ComponentGroupGraphPlacer (对应 ELK layered components.ComponentGroupGraphPlacer).
 * 组件默认放置器 (外部端口 + 分离 + 排序 NONE): 按外部端口侧组合分扇区 (3 列 × 3 行),
 * 16 种侧集合分别排行/列, 再按扇区偏移; 可选 ConnectedComponents 压缩 (ORTHOGONAL).
 * Java 行为 1:1: NORTH_WEST / NORTH_EAST_WEST / NORTH_SOUTH_WEST 由尺寸计算放置器落在组左上角
 * (Java 未对其 offsetGraphs — 保留原语义).
 */
import type { LGraph } from '../graph/lgraph.js'
import { type KVector } from '../graph/enums.js'
import { EDGE_ROUTING, EdgeRouting, SPACING_COMPONENT_COMPONENT } from '../options/layered-options.js'
import { AbstractGraphPlacer } from './abstract-graph-placer.js'
import { ComponentGroup, S } from './component-group.js'
import { COMPACTION_CONNECTED_COMPONENTS, ComponentsCompactor } from './components-compactor.js'

export class ComponentGroupGraphPlacer extends AbstractGraphPlacer {
  private componentGroups: ComponentGroup[] = []

  override combine(components: LGraph[], target: LGraph): void {
    this.componentGroups = []
    target.getLayerlessNodes().length = 0

    if (components.length === 0) {
      target.getSize().x = 0
      target.getSize().y = 0
      return
    }

    const firstComponent = components[0]!
    target.copyProperties(firstComponent)

    for (const component of components) this.addComponent(component)

    let offsetX = 0
    let offsetY = 0
    const componentSpacing = firstComponent.getProperty(SPACING_COMPONENT_COMPONENT)

    for (const group of this.componentGroups) {
      const groupSize = this.placeComponents(group, componentSpacing)
      this.offsetGraphs(group.getComponents(), offsetX, offsetY)
      offsetX += groupSize.x
      offsetY += groupSize.y
    }

    // 组尺寸含右侧/底部附加 spacing, 需减去.
    target.getSize().x = offsetX - componentSpacing
    target.getSize().y = offsetY - componentSpacing

    if (firstComponent.getProperty(COMPACTION_CONNECTED_COMPONENTS)
      && firstComponent.getProperty(EDGE_ROUTING) === EdgeRouting.ORTHOGONAL) {
      for (const h of components) this.offsetGraph(h, h.getOffset().x, h.getOffset().y)
      const compactor = new ComponentsCompactor()
      compactor.compact(components, target.getSize(), componentSpacing)
      for (const h of components) {
        h.getOffset().x = compactor.getOffset().x
        h.getOffset().y = compactor.getOffset().y
      }
      target.getSize().x = compactor.getGraphSize().x
      target.getSize().y = compactor.getGraphSize().y
    }

    for (const group of this.componentGroups) {
      this.moveGraphs(target, group.getComponents(), 0, 0)
    }
  }

  private addComponent(component: LGraph): void {
    for (const group of this.componentGroups) {
      if (group.add(component)) return
    }
    this.componentGroups.push(new ComponentGroup(component))
  }

  /** 扇区放置: 各侧集合排行/列 → 3×3 扇区偏移 → 组尺寸. */
  private placeComponents(group: ComponentGroup, spacing: number): KVector {
    const sizeC = this.placeComponentsInRows(group.getComponentsFor(S.NONE), spacing)
    const sizeN = this.placeComponentsHorizontally(group.getComponentsFor(S.NORTH), spacing)
    const sizeS = this.placeComponentsHorizontally(group.getComponentsFor(S.SOUTH), spacing)
    const sizeW = this.placeComponentsVertically(group.getComponentsFor(S.WEST), spacing)
    const sizeE = this.placeComponentsVertically(group.getComponentsFor(S.EAST), spacing)
    const sizeNW = this.placeComponentsHorizontally(group.getComponentsFor(S.NORTH_WEST), spacing)
    const sizeNE = this.placeComponentsHorizontally(group.getComponentsFor(S.NORTH_EAST), spacing)
    const sizeSW = this.placeComponentsHorizontally(group.getComponentsFor(S.SOUTH_WEST), spacing)
    const sizeSE = this.placeComponentsHorizontally(group.getComponentsFor(S.EAST_SOUTH), spacing)
    const sizeWE = this.placeComponentsVertically(group.getComponentsFor(S.EAST_WEST), spacing)
    const sizeNS = this.placeComponentsHorizontally(group.getComponentsFor(S.NORTH_SOUTH), spacing)
    const sizeNWE = this.placeComponentsHorizontally(group.getComponentsFor(S.NORTH_EAST_WEST), spacing)
    const sizeSWE = this.placeComponentsHorizontally(group.getComponentsFor(S.EAST_SOUTH_WEST), spacing)
    const sizeWNS = this.placeComponentsVertically(group.getComponentsFor(S.NORTH_SOUTH_WEST), spacing)
    const sizeENS = this.placeComponentsVertically(group.getComponentsFor(S.NORTH_EAST_SOUTH), spacing)
    const sizeNESW = this.placeComponentsHorizontally(group.getComponentsFor(S.NORTH_EAST_SOUTH_WEST), spacing)

    const colLeftWidth = Math.max(sizeNW.x, sizeW.x, sizeSW.x, sizeWNS.x)
    const colMidWidth = Math.max(sizeN.x, sizeC.x, sizeS.x, sizeNESW.x)
    const colNsWidth = sizeNS.x
    const colRightWidth = Math.max(sizeNE.x, sizeE.x, sizeSE.x, sizeENS.x)
    const rowTopHeight = Math.max(sizeNW.y, sizeN.y, sizeNE.y, sizeNWE.y)
    const rowMidHeight = Math.max(sizeW.y, sizeC.y, sizeE.y, sizeNESW.y)
    const rowWeHeight = sizeWE.y
    const rowBottomHeight = Math.max(sizeSW.y, sizeS.y, sizeSE.y, sizeSWE.y)

    this.offsetGraphs(group.getComponentsFor(S.NONE), colLeftWidth + colNsWidth, rowTopHeight + rowWeHeight)
    this.offsetGraphs(group.getComponentsFor(S.NORTH_EAST_SOUTH_WEST), colLeftWidth + colNsWidth, rowTopHeight + rowWeHeight)
    this.offsetGraphs(group.getComponentsFor(S.NORTH), colLeftWidth + colNsWidth, 0)
    this.offsetGraphs(group.getComponentsFor(S.SOUTH), colLeftWidth + colNsWidth, rowTopHeight + rowWeHeight + rowMidHeight)
    this.offsetGraphs(group.getComponentsFor(S.WEST), 0, rowTopHeight + rowWeHeight)
    this.offsetGraphs(group.getComponentsFor(S.EAST), colLeftWidth + colNsWidth + colMidWidth, rowTopHeight + rowWeHeight)
    this.offsetGraphs(group.getComponentsFor(S.NORTH_EAST), colLeftWidth + colNsWidth + colMidWidth, 0)
    this.offsetGraphs(group.getComponentsFor(S.SOUTH_WEST), 0, rowTopHeight + rowWeHeight + rowMidHeight)
    this.offsetGraphs(group.getComponentsFor(S.EAST_SOUTH), colLeftWidth + colNsWidth + colMidWidth, rowTopHeight + rowWeHeight + rowMidHeight)
    this.offsetGraphs(group.getComponentsFor(S.EAST_WEST), 0, rowTopHeight)
    this.offsetGraphs(group.getComponentsFor(S.NORTH_SOUTH), colLeftWidth, 0)
    this.offsetGraphs(group.getComponentsFor(S.EAST_SOUTH_WEST), 0, rowTopHeight + rowWeHeight + rowMidHeight)
    this.offsetGraphs(group.getComponentsFor(S.NORTH_EAST_SOUTH), colLeftWidth + colNsWidth + colMidWidth, 0)

    const componentSize: KVector = { x: 0, y: 0 }
    componentSize.x = Math.max(
      colLeftWidth + colMidWidth + colNsWidth + colRightWidth,
      sizeWE.x, sizeNWE.x, sizeSWE.x)
    componentSize.y = Math.max(
      rowTopHeight + rowMidHeight + rowWeHeight + rowBottomHeight,
      sizeNS.y, sizeWNS.y, sizeENS.y)
    return componentSize
  }

  private placeComponentsHorizontally(components: LGraph[], spacing: number): KVector {
    const size: KVector = { x: 0, y: 0 }
    for (const component of components) {
      this.offsetGraph(component, size.x, 0)
      size.x += component.getSize().x + spacing
      size.y = Math.max(size.y, component.getSize().y)
    }
    if (size.y > 0) size.y += spacing
    return size
  }

  private placeComponentsVertically(components: LGraph[], spacing: number): KVector {
    const size: KVector = { x: 0, y: 0 }
    for (const component of components) {
      this.offsetGraph(component, 0, size.y)
      size.y += component.getSize().y + spacing
      size.x = Math.max(size.x, component.getSize().x)
    }
    if (size.x > 0) size.x += spacing
    return size
  }

  /** 行放置 (代码取自 SimpleRowGraphPlacer). */
  private placeComponentsInRows(components: LGraph[], spacing: number): KVector {
    if (components.length === 0) return { x: 0, y: 0 }
    let maxRowWidth = 0
    let totalArea = 0
    for (const component of components) {
      const cs = component.getSize()
      maxRowWidth = Math.max(maxRowWidth, cs.x)
      totalArea += cs.x * cs.y
    }
    maxRowWidth = Math.max(maxRowWidth, Math.sqrt(totalArea))
    let xpos = 0
    let ypos = 0
    let highestBox = 0
    let broadestRow = spacing
    for (const graph of components) {
      const size = graph.getSize()
      if (xpos + size.x > maxRowWidth) {
        xpos = 0
        ypos += highestBox + spacing
        highestBox = 0
      }
      this.offsetGraph(graph, xpos, ypos)
      broadestRow = Math.max(broadestRow, xpos + size.x)
      highestBox = Math.max(highestBox, size.y)
      xpos += size.x + spacing
    }
    return { x: broadestRow + spacing, y: ypos + highestBox + spacing }
  }
}
