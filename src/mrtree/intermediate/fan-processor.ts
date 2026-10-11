/**
 * mrtree FanProcessor — ELK alg.mrtree.intermediate.FanProcessor 0.12.0.
 * 层级 id 分配 (块 id + 索引), 计算 FAN (最大兄弟数) 与 DESCENDANTS.
 */
import { TGraph, TNode, P_ROOT, P_ID, P_FAN, P_DESCENDANTS, getBool, getProp, setProp } from '../graph.js'

export function fanProcessor(tGraph: TGraph): void {
  const gloFanMap = new Map<string, number>()
  const gloDescMap = new Map<string, number>()

  const root = tGraph.getNodes().find((tNode) => getBool(tNode, P_ROOT, false))
  if (root === undefined) return
  calculateFan([root], gloFanMap, gloDescMap)
  for (const tNode of tGraph.getNodes()) {
    const key = getProp(tNode, P_ID, '')
    const fan = gloFanMap.get(key) ?? 0
    setProp(tNode, P_FAN, fan)
    const desc = 1 + (gloDescMap.get(key) ?? 0)
    setProp(tNode, P_DESCENDANTS, desc)
  }
}

function calculateFan(currentLevel: TNode[], gloFanMap: Map<string, number>, gloDescMap: Map<string, number>): void {
  if (currentLevel.length === 0) return
  const nextLevel: TNode[] = []
  let id: string | null = null
  let pId: string | null = null
  const digits = Math.floor(Math.log10(currentLevel.length)) + 1
  let index = 0
  for (const tNode of currentLevel) {
    if (pId !== getProp(tNode, P_ID, '')) {
      pId = getProp(tNode, P_ID, '')
      index = 0
    }
    if (pId !== null) {
      id = pId + formatRight(index++, digits)
    } else {
      id = formatRight(index++, digits)
    }
    setProp(tNode, P_ID, id)
    for (const tChild of tNode.getChildren()) {
      nextLevel.push(tChild)
      setProp(tChild, P_ID, id)
    }
  }
  const locFanMap = new Map<string, number>()
  for (let i = 0; i < (id as string).length - digits; i++) {
    for (const tNode of currentLevel) {
      const key = getProp(tNode, P_ID, '').substring(0, i + 1)
      const blockSize = (locFanMap.get(key) ?? 0) + 1
      locFanMap.set(key, blockSize)
    }
  }
  for (const [locKey, locValue] of locFanMap) {
    let gloValue = gloDescMap.get(locKey) ?? 0
    gloDescMap.set(locKey, locValue + gloValue)
    gloValue = gloFanMap.get(locKey) ?? 0
    if (gloValue < locValue) {
      gloFanMap.set(locKey, locValue)
    }
  }
  calculateFan(nextLevel, gloFanMap, gloDescMap)
}

/** 右对齐补零 (Java FanProcessor.formatRight). */
export function formatRight(value: number, len: number): string {
  let s = `${value}`
  while (s.length < len) s = `0${s}`
  return s
}
