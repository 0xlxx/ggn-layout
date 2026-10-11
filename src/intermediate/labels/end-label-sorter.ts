/**
 * EndLabelSorter (对应 ELK intermediate.EndLabelSorter).
 *
 * P5 后: 按边源/目标节点在层内的顺序排序各端口 label cell 里的端标签,
 * 避免同端口多条边的端标签顺序看似随机.
 *
 * 前提: 无长边 dummy / label dummy / NS dummy 剩余 (LongEdgeJoiner 之后).
 */
import type { LGraph } from '../../graph/lgraph.js'
import type { LNode } from '../../graph/lnode.js'
import type { LPort } from '../../graph/lport.js'
import type { LEdge } from '../../graph/ledge.js'
import { NodeType } from '../../graph/enums.js'
import { END_LABELS } from '../../options/internal-properties.js'
import type { LabelCell, LabelEntry } from './label-cell.js'

export function processEndLabelSort(layeredGraph: LGraph): void {
  for (const layer of layeredGraph.getLayers()) {
    for (const node of layer.getNodes()) {
      if (node.getType() === NodeType.NORMAL) {
        processNode(node)
      }
    }
  }
}

function processNode(node: LNode): void {
  let initializeMethodCalled = false
  const endLabels = node.getProperty(END_LABELS)
  if (endLabels === undefined || endLabels === null || !(endLabels instanceof Map)) return

  const labelCellMap = endLabels as Map<LPort, unknown>
  for (const port of node.getPorts()) {
    if (needsSorting(port)) {
      if (!initializeMethodCalled) {
        initialize(node.getGraph())
        initializeMethodCalled = true
      }
      sort(port, labelCellMap.get(port) as LabelCell)
    }
  }
}

/** 端口若有 ≥2 条带端标签的边则需排序 (ELK needsSorting). */
function needsSorting(port: LPort): boolean {
  let edgesWithEndLabels = 0
  for (const inEdge of port.getIncomingEdges()) {
    if (inEdge.getLabels().some(label => label.placement === 'HEAD')) edgesWithEndLabels++
  }
  for (const outEdge of port.getOutgoingEdges()) {
    if (outEdge.getLabels().some(label => label.placement === 'TAIL')) edgesWithEndLabels++
  }
  return edgesWithEndLabels >= 2
}

/** 给全部节点/端口赋递增 id (ELK EndLabelSorter.initialize). */
function initialize(graph: LGraph | null): void {
  if (graph === null) return
  let nextElementID = 0
  for (const layer of graph.getLayers()) {
    for (const node of layer.getNodes()) {
      node.id = nextElementID++
      for (const port of node.getPorts()) {
        port.id = nextElementID++
      }
    }
  }
}

/** 排序给定端口 label cell 中的标签 (直接重排 cell 的 label 列表, 不重算尺寸). */
function sort(port: LPort, portLabelCell: LabelCell | undefined): void {
  if (portLabelCell === undefined) return
  const labelGroups = createLabelGroups(portLabelCell)
  labelGroups.sort(LABEL_GROUP_COMPARATOR)

  const entries = portLabelCell.getEntries()
  entries.length = 0
  for (const group of labelGroups) {
    entries.push(...group.entries)
  }
}

/** 把同一边的标签聚成组 (ELK createLabelGroups). */
function createLabelGroups(portLabelCell: LabelCell): LabelGroup[] {
  const edgeToGroupMap = new Map<LEdge | null, LabelGroup>()
  for (const entry of portLabelCell.getEntries()) {
    const edge = entry.edge
    let group = edgeToGroupMap.get(edge)
    if (group === undefined) {
      group = new LabelGroup(edge)
      edgeToGroupMap.set(edge, group)
    }
    group.entries.push(entry)
  }
  return [...edgeToGroupMap.values()]
}

/** 同一边标签组 (ELK LabelGroup). */
class LabelGroup {
  readonly edge: LEdge | null
  readonly entries: LabelEntry[] = []

  constructor(edge: LEdge | null) {
    this.edge = edge
  }
}

/** 组比较器: 源端口 id → 目标节点 id → 目标端口 id (倒序, WEST 端口自底向上). */
const LABEL_GROUP_COMPARATOR = (group1: LabelGroup, group2: LabelGroup): number => {
  const e1 = group1.edge
  const e2 = group2.edge
  if (e1 === null || e2 === null) return 0
  const s1 = e1.getSource()
  const s2 = e2.getSource()
  if (s1 !== null && s2 !== null) {
    const sourcePortDiff = s1.id - s2.id
    if (sourcePortDiff !== 0) return sourcePortDiff
  }
  const t1 = e1.getTarget()
  const t2 = e2.getTarget()
  if (t1 !== null && t2 !== null) {
    const n1 = t1.getNode()
    const n2 = t2.getNode()
    const targetNodeDiff = (n1?.id ?? 0) - (n2?.id ?? 0)
    if (targetNodeDiff !== 0) return targetNodeDiff
    // 目标端口倒序 (ELK: western ports 自底向上, 不倒序会与期望相反)
    return t2.id - t1.id
  }
  return 0
}
