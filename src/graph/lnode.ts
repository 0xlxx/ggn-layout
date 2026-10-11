/**
 * LNode (对应 ELK graph.LNode).
 */
import { LShape } from './lshape.js'
import { NodeType, PortSide, PortType, LayerConstraint, type InLayerConstraint, type EdgeConstraint, type PortConstraints } from './enums.js'
import type { LPort } from './lport.js'
import type { LEdge } from './ledge.js'
import type { Layer } from './layer.js'
import type { LGraph } from './lgraph.js'

/** 节点标签 (对应 ELK LLabel 的 text + 位置尺寸). */
export interface LLabel {
  text: string
  position: { x: number; y: number }
  size: { x: number; y: number }
  /** nodeLabels.placement (如 [H_CENTER, V_TOP, INSIDE] / OUTSIDE) — ELK NodeLabelsPlacement. */
  placement?: string
}

/** 节点边距 (对应 ELK LMargin). */
export interface LMargin {
  left: number
  top: number
  right: number
  bottom: number
}

export class LNode extends LShape {
  private graph: LGraph | null = null
  private layer: Layer | null = null
  private type: NodeType = NodeType.NORMAL
  private ports: LPort[] = []
  private labels: LLabel[] = []
  private nestedGraph: LGraph | null = null
  private margin: LMargin = { left: 0, top: 0, right: 0, bottom: 0 }
  private padding: { left: number; top: number; right: number; bottom: number } = { left: 0, top: 0, right: 0, bottom: 0 }
  private layerConstraint: LayerConstraint | null = null
  private inLayerConstraint: InLayerConstraint | null = null
  private edgeConstraint: EdgeConstraint | null = null
  private portConstraints: PortConstraints | null = null

  constructor(graph: LGraph | null = null) {
    super()
    this.graph = graph
    if (graph) graph.getLayerlessNodes().push(this)
  }

  getGraph(): LGraph | null {
    if (this.graph === null && this.layer !== null) return this.layer.getGraph()
    return this.graph
  }

  setGraph(newGraph: LGraph | null): void {
    this.graph = newGraph
  }

  getLayer(): Layer | null {
    return this.layer
  }

  setLayer(thelayer: Layer | null): void {
    if (this.layer !== null) {
      const nodes = this.layer.getNodes()
      const idx = nodes.indexOf(this)
      if (idx !== -1) nodes.splice(idx, 1)
    }
    this.layer = thelayer
    if (this.layer !== null) this.layer.getNodes().push(this)
  }

  /** setLayer(index, newLayer): 插入到层内指定位置. */
  setLayerAt(index: number, newlayer: Layer): void {
    if (this.layer !== null) {
      const nodes = this.layer.getNodes()
      const idx = nodes.indexOf(this)
      if (idx !== -1) nodes.splice(idx, 1)
    }
    this.layer = newlayer
    newlayer.getNodes().splice(index, 0, this)
  }

  getType(): NodeType {
    return this.type
  }

  setType(type: NodeType): void {
    this.type = type
  }

  getPorts(): LPort[]
  getPorts(side: PortSide): LPort[]
  getPorts(type: PortType): LPort[]
  getPorts(sideOrType?: PortSide | PortType): LPort[] {
    if (sideOrType === undefined) return this.ports
    if (typeof sideOrType === 'string' && (sideOrType === PortSide.NORTH || sideOrType === PortSide.EAST || sideOrType === PortSide.SOUTH || sideOrType === PortSide.WEST)) {
      // PortSide: 该侧端口
      return this.ports.filter(p => p.getSide() === sideOrType)
    }
    // PortType: 按边方向过滤 (对应 ELK getPorts(PortType) — 只按 INPUT/OUTPUT 谓词, 不按 side).
    const type = sideOrType as PortType
    if (type === PortType.INPUT) return this.ports.filter(p => p.getIncomingEdges().length > 0)
    if (type === PortType.OUTPUT) return this.ports.filter(p => p.getOutgoingEdges().length > 0)
    return []
  }

  /** 该侧端口视图 (对应 ELK getPortSideView). */
  getPortSideView(side: PortSide): LPort[] {
    // p3order/GreedyPortDistributor 会原地交换该 getter 的返回值。该调用点在
    // src/p3order/** 内，不能在此 scope 收敛，因此必须保留 fresh snapshot 契约。
    return this.ports.filter(p => p.getSide() === side)
  }

  /** 整体替换端口列表 (分区后处理器移除 PARTITION_DUMMY 端口用). */
  setPorts(ports: LPort[]): void {
    this.ports = ports
  }

  getLabels(): LLabel[] {
    return this.labels
  }

  setLabels(labels: LLabel[]): void {
    this.labels = labels
  }

  getNestedGraph(): LGraph | null {
    return this.nestedGraph
  }

  setNestedGraph(nestedGraph: LGraph | null): void {
    this.nestedGraph = nestedGraph
  }

  getMargin(): LMargin {
    return this.margin
  }

  getPadding(): { left: number; top: number; right: number; bottom: number } {
    return this.padding
  }

  getLayerConstraint(): LayerConstraint | null {
    if (this.layerConstraint !== null) return this.layerConstraint
    // 回退 property (输入注入 org.eclipse.elk.layered.layering.layerConstraint — ELK 语义以 property 为准).
    const prop = this.getProperty<unknown>('org.eclipse.elk.layered.layering.layerConstraint')
    if (typeof prop === 'string') {
      const c = (LayerConstraint as Record<string, LayerConstraint>)[prop]
      if (c !== undefined) return c
    }
    return null
  }

  setLayerConstraint(c: LayerConstraint): void {
    this.layerConstraint = c
    // 同步写回 property (ELK getProperty 语义; GraphTransformer 交换侧时保持一致).
    this.setProperty('org.eclipse.elk.layered.layering.layerConstraint', c)
  }

  getInLayerConstraint(): InLayerConstraint | null {
    return this.inLayerConstraint
  }

  setInLayerConstraint(c: InLayerConstraint): void {
    this.inLayerConstraint = c
  }

  getEdgeConstraint(): EdgeConstraint | null {
    return this.edgeConstraint
  }

  setEdgeConstraint(c: EdgeConstraint): void {
    this.edgeConstraint = c
  }

  getPortConstraints(): PortConstraints | null {
    return this.portConstraints
  }

  setPortConstraints(c: PortConstraints): void {
    this.portConstraints = c
  }

  /** 节点在层内的索引 (线性查找, 对应 ELK getIndex). */
  getIndex(): number {
    if (this.layer === null) return -1
    return this.layer.getNodes().indexOf(this)
  }

  getOutgoingEdges(): LEdge[] {
    let count = 0
    for (const port of this.ports) count += port.getOutgoingEdges().length
    const result = new Array<LEdge>(count)
    let index = 0
    for (const port of this.ports) {
      for (const edge of port.getOutgoingEdges()) result[index++] = edge
    }
    return result
  }

  getIncomingEdges(): LEdge[] {
    let count = 0
    for (const port of this.ports) count += port.getIncomingEdges().length
    const result = new Array<LEdge>(count)
    let index = 0
    for (const port of this.ports) {
      for (const edge of port.getIncomingEdges()) result[index++] = edge
    }
    return result
  }

  /** 所有连接边 (入边 + 出边). */
  getConnectedEdges(): LEdge[] {
    const result: LEdge[] = []
    for (const port of this.ports) result.push(...port.getIncomingEdges(), ...port.getOutgoingEdges())
    return result
  }
}
