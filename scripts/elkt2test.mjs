/**
 * elkt2test (layout 版) — 把 .elkt 图文件批量转换为 layout 的 vitest 测试.
 *
 * 与 ggn-layout 版的区别:
 *   - 图构造使用 ELK 1:1 API (LGraph/LNode/LPort/LEdge + nestedGraph)
 *   - 布局调用 LayeredLayoutProvider().layout(graph)
 *   - 差分升级为坐标级: 逐节点 x/y 与 elkjs 对比 (1:1 对齐目标)
 *
 * 用法:
 *   bun scripts/elkt2test.mjs 'test-resources/elk-models/examples/*.elkt'
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { basename, join, relative, resolve } from 'node:path'
import { globSync } from 'glob'
import { OPT_MAP, coerceVal, unescapeElkt } from '../shared/opt-map.ts'

const OUT_DIR = resolve(import.meta.dirname, '../tests/oracle/generated/')

/**
 * 坐标差分的容差 ε (px). 默认 2 (2026-08-07 从 1 提升):
 *   精度噪声分档: (0,0.01] 320 图 / (0.01,1] 4 图 (selfloop_crash 等亚像素) /
 *   (1,2] 4 图 (self_loops__south|hyperLoops、302、288, 均为自环族 **4/3=1.333 系统性精度差**);
 *   结构 bug 全 ≥4px (jar-triage 实证 4.4/10/20/40+)。ε=2 吸收精度噪声且不漏结构 bug。
 * 覆盖: ELK_TOLERANCE=1 bun scripts/elkt2test.mjs ... (收紧用)
 */
const TOLERANCE = Number(process.env.ELK_TOLERANCE ?? 2)

const MODEL_ROOT = resolve(import.meta.dirname, '../test-resources/elk-models/')
const allModelFiles = globSync(join(MODEL_ROOT, '**/*.elkt'))
const basenameCounts = new Map()
for (const modelFile of allModelFiles) {
  const base = basename(modelFile, '.elkt')
  basenameCounts.set(base, (basenameCounts.get(base) ?? 0) + 1)
}

// ── .elkt 解析 (与 ggn-layout 版一致) ──

function stripComments(line) {
  return line.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '').trim()
}

/**
 * elkt 顶层算法属性 → 三端 key 映射 (M0-B 前置参数一致性).
 * elkt 用短名 (无 org.eclipse.elk 前缀); ggn/elkjs 各自 key 体系注入.
 * ggn key 按 ggn layered-options.ts 实际 key (含历史混搭: spacing.edgeEdge/nodeNode 用 layered 前缀,
 * portPort/nodeSelfLoop 用 core 前缀). 未列入的 elkt 属性暂不注入 (保持默认, 后续补).
 */

/** elkt 顶层 layout 语法 key (非算法 option, 排除). */
const LAYOUT_KEYS = new Set(['position','size','start','end','bends','index','side','width','height','x','y','label','port','node','edge','source','target','sources','targets','properties'])

function parseElkt(source) {
  const nodes = []
  const nodeSet = new Set()
  const edges = []
  const nodeProps = new Map()
  const hierarchy = new Map()
  const graphProps = {}
  const portIds = new Set()
  const stack = []
  const edgeRaw = []
  let inGraphBlock = 0

  const lines = source.split('\n')
  for (let raw of lines) {
    const line = stripComments(raw)
    if (!line) continue

    const openCount = (line.match(/\{/g) ?? []).length
    const closeCount = (line.match(/\}/g) ?? []).length
    const net = openCount - closeCount
    for (let i = 0; i < closeCount - openCount && stack.length > 0; i++) {
      stack.pop()
      inGraphBlock = Math.max(0, inGraphBlock - 1)
    }

    if (/^\s*graph/.test(line)) {
      inGraphBlock += Math.max(net, 0)
      continue
    }
    if (inGraphBlock > 0 || stack.length === 0) {
      // M0-B: 解析 elkt 顶层算法属性 (短名, 排除 layout 语法). 值含引号/长键 (org.eclipse.elk.* 前缀).
      const gprop = line.match(/^\s*(?:elk\.)?([a-zA-Z][\w.^]*)\s*:\s*([^\s/]+(?:\s+[^\s/]+)*)/)
      if (gprop) {
        let k = gprop[1]
        if (k.startsWith('org.eclipse.elk.')) k = k.replace(/^org\.eclipse\.elk\./, '').replace(/^layered\./, '')
        if (LAYOUT_KEYS.has(k)) { /* layout 语法, 跳过 */ }
        else {
          graphProps[k] = gprop[2]
          continue
        }
      }
    }
    if (/^\s*}/.test(line)) {
      // pop 后栈顶是节点: 清其 label/port 块状态
      if (stack.length > 0 && typeof stack[stack.length - 1] === 'string') {
        const props = nodeProps.get(stack[stack.length - 1])
        if (props) {
          props._inPort = null
          props._inLabel = null
        }
      } else if (stack.length > 0) {
        // pop 后栈顶是 null: 可能是端口块内 label 子块的关闭 —
        // 递减 _inPortLabel (保持括号平衡), 不误清 _inPort (端口块仍打开).
        for (let i = stack.length - 1; i >= 0; i--) {
          if (typeof stack[i] === 'string') {
            const props = nodeProps.get(stack[i])
            if (props && (props._inPortLabel ?? 0) > 0) {
              props._inPortLabel = (props._inPortLabel ?? 0) - 1
            }
            break
          }
        }
      }
      continue
    }

    // label 块内行 (stack[last]=null): 解析 label 的 layout [ size / position ]
    // (SSOT 输入保真: 724/905 的 NODE_LABELS 尺寸/位置此前丢失 → 节点尺寸差).
    if (stack.length > 0 && stack[stack.length - 1] === null) {
      for (let i = stack.length - 1; i >= 0; i--) {
        if (typeof stack[i] === 'string') {
          const props = nodeProps.get(stack[i])
          if (props && props._inLabel !== undefined && props._inLabel !== null) {
            const l = props.labels[props._inLabel]
            if (l) {
              const sizeM = line.match(/size\s*:\s*([\d.]+)\s*,\s*([\d.]+)/)
              if (sizeM) {
                l.width = Number(sizeM[1])
                l.height = Number(sizeM[2])
              }
              const posM = line.match(/position\s*:\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)/)
              if (posM) {
                l.x = Number(posM[1])
                l.y = Number(posM[2])
              }
              const plM = line.match(/nodeLabels\.placement\s*:\s*"([^"]+)"/)
              if (plM) l.placement = plM[1]
            }
          }
          break
        }
      }
      // 继续主循环 (不 continue, 让后续分支处理; label 块内行无其他消费方)
    }

    const nodeMatch = line.match(/^\s*node\s+([\w.-]+)/)
    if (nodeMatch) {
      // 节点 id 作用域限定 (ELK elkt 语义): 嵌套节点用 父.名 全局唯一.
      // 之前全局去重导致不同容器内的同名子节点 (n1/n2) 合并成共享节点.
      const name = nodeMatch[1]
      let parentScope = null
      for (let i = stack.length - 1; i >= 0; i--) {
        if (typeof stack[i] === 'string') { parentScope = stack[i]; break }
      }
      const id = parentScope ? parentScope + '.' + name : name
      if (!nodeSet.has(id)) { nodeSet.add(id); nodes.push(id) }
      if (parentScope) {
        const ph = hierarchy.get(parentScope) ?? []
        if (!ph.includes(id)) ph.push(id)
        hierarchy.set(parentScope, ph)
      }
      const brace = line.indexOf('{')
      if (brace !== -1) {
        if (net > 0) stack.push(id)
        const props = line.slice(brace + 1)
        const size = props.match(/size\s*:\s*([\d.]+)\s*,\s*([\d.]+)/)
        const width = props.match(/width\s*:\s*([\d.]+)/)
        const height = props.match(/height\s*:\s*([\d.]+)/)
        const np = {
          width: width ? Number(width[1]) : size ? Number(size[1]) : 60,
          height: height ? Number(height[1]) : size ? Number(size[2]) : 30,
          children: [],
        }
        // B16a: 单行节点内联 label (node n1 { label "1" } / label "Default" { layout [ size: 43, 15 ] })
        const labelSizeM = line.match(/label\s+"([^"]+)"\s*\{\s*layout\s*\[\s*size\s*:\s*([\d.]+)\s*,\s*([\d.]+)/)
        if (labelSizeM) np.labels = [{ text: labelSizeM[1], width: Number(labelSizeM[2]), height: Number(labelSizeM[3]) }]
        else {
          const labelM = line.match(/label\s+"([^"]+)"/)
          if (labelM) np.labels = [{ text: labelM[1], width: 0, height: 0 }]
        }

        // B12: 单行节点声明内联选项 (node c1_1 { commentBox: true } / { portConstraints: FIXED_ORDER })
        // 旧实现只取 size/width/height, 其余选项全丢 (comments.elkt commentBox 实证 Java 有、ggn 无).
        const rest = props.replace(/\bsize\s*:\s*[\d.]+\s*,\s*[\d.]+/, '').replace(/\b(?:width|height)\s*:\s*[\d.]+/g, '')
        const optRe = /([A-Za-z][\w.]*)\s*:\s*("[^"]*"|'[^']*'|[^\s,}]+)/g
        let om
        while ((om = optRe.exec(rest)) !== null) {
          const k = om[1]
          if (LAYOUT_KEYS.has(k)) continue
          np[k] = om[2]
        }
        nodeProps.set(id, np)
      } else {
        nodeProps.set(id, { width: 60, height: 30, children: [] })
      }
      continue
    }

    const portMatch = line.match(/^\s*port\s+([\w.-]+)/)
    if (portMatch && !(stack.length > 0 && typeof stack[stack.length - 1] === 'string')) {
      portIds.add(portMatch[1])
      if (line.indexOf('{') !== -1 && net > 0) stack.push(null)
      continue
    }
    // 节点块内端口也注册到 portIds (重叠检查排除端口 id)
    if (portMatch && stack.length > 0 && typeof stack[stack.length - 1] === 'string') {
      portIds.add(portMatch[1])
    }

    // 节点块内的属性行 (portConstraints/layout/label/port 声明)
    if (stack.length > 0 && typeof stack[stack.length - 1] === 'string') {
      const nodeId = stack[stack.length - 1]
      const props = nodeProps.get(nodeId)
      // B14: ^position: "(0.0, 100.0)" / elk.^position: "0, 100" (ELK 交互布局伪位置)
      if (props) {
        const posPM = line.trim().match(/^(?:elk\.|org\.eclipse\.elk\.)?\^position\s*:\s*["']?([^"']+)["']?/)
        if (posPM) props.position = posPM[1]
      }
      if (props && line.trim() === '}') {
        props._inPort = null
        props._inLabel = null
        continue
      }
      if (props) {
        if (process.env.GGN_PARSE_DBG) console.error(`[props] node=${nodeId} inLabel=${props._inLabel} inLayout=${props._inLayout} line="${line.trim()}"`)
        // 端口块内: 一切归端口 (layout/position/size/index/side)
        if (props._inPort !== undefined && props._inPort !== null) {
          const p = props.ports[props._inPort]
          const posM = line.match(/position\s*:\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)/)
          if (posM) { p.x = Number(posM[1]); p.y = Number(posM[2]) }
          const sizeM = line.match(/size\s*:\s*([\d.]+)\s*,\s*([\d.]+)/)
          if (sizeM) { p.w = Number(sizeM[1]); p.h = Number(sizeM[2]) }
          const idxM = line.match(/index\s*:\s*(-?\d+)/)
          if (idxM) p.index = Number(idxM[1])
          const sideM = line.match(/side\s*:\s*(\w+)/)
          if (sideM) p.side = sideM[1]
          const boM = line.match(/borderOffset\s*:\s*(-?[\d.]+)/)
          if (boM) p.borderOffset = Number(boM[1])
          if (line.includes('}') && !line.includes('{')) props._inPort = null
          continue
        }
        // 多行 layout [ ... ] (SSOT 输入保真: label 块内 layout 归属 label, 非节点)
        if (/^layout\s*\[/.test(line) || props._inLayout) {
          if (process.env.GGN_PARSE_DBG && /size\s*:|position\s*:|^layout/.test(line)) console.error(`[layout] inLabel=${props._inLabel} _inLayout=${props._inLayout} line="${line.trim()}"`)
          const inLabel = props._inLabel !== undefined && props._inLabel !== null
          const label = inLabel ? props.labels[props._inLabel] : null
          const sizeM = line.match(/size\s*:\s*([\d.]+)\s*,\s*([\d.]+)/)
          if (sizeM) {
            if (label) {
              label.width = Number(sizeM[1])
              label.height = Number(sizeM[2])
            } else {
              props.width = Number(sizeM[1])
              props.height = Number(sizeM[2])
            }
          }
          const posM = line.match(/position\s*:\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)/)
          if (posM && label) {
            label.x = Number(posM[1])
            label.y = Number(posM[2])
          }
          // B14: 节点位置仅来自 ^position: 语法 (elk.^position / ^position);
          // `layout [ position ]` 是节点布局语法, Java Xtext 解析后丢弃 (interactive*_pseudo_positions 实证).
          if (line.includes(']') && !line.includes('[')) props._inLayout = false
          else if (line.includes('[') && !line.includes(']')) props._inLayout = true
          continue
        }
        // 端口声明 (节点块内)
        const portBlockM = line.match(/^\s*port\s+([\w.-]+)\s*\{?/)
        if (portBlockM) {
          const pid = portBlockM[1]
          if (!props.ports) props.ports = []
          const portDesc = { id: pid }
          const sideM = line.match(/\^?port\.side:\s*(\w+)/)
          if (sideM) portDesc.side = sideM[1]
          // 单行端口声明 (port p1 { side: WEST index: 0 }): 内联属性
          // B11: 旧正则要求 side/index 紧跟 '{' → 'port p1 { side: EAST index: 0 }' 的 index 丢失
          // (verticalOrder 实证 Java 有 index=0/1, ggn 无). 改 \b 边界匹配任意位置.
          const inlineSideM = line.match(/\bside\s*:\s*(\w+)/)
          if (!portDesc.side && inlineSideM) portDesc.side = inlineSideM[1]
          const inlineIdxM = line.match(/\bindex\s*:\s*(-?\d+)/)
          if (inlineIdxM) portDesc.index = Number(inlineIdxM[1])
          // 单行端口声明 (port p1 { layout [ position: x, y ] }): 内联 position/size
          const inlinePosM = line.match(/position\s*:\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)/)
          if (inlinePosM) {
            portDesc.x = Number(inlinePosM[1])
            portDesc.y = Number(inlinePosM[2])
          }
          const inlineSizeM = line.match(/size\s*:\s*([\d.]+)\s*,\s*([\d.]+)/)
          if (inlineSizeM) {
            portDesc.w = Number(inlineSizeM[1])
            portDesc.h = Number(inlineSizeM[2])
          }
          const inlineBoM = line.match(/borderOffset\s*:\s*(-?[\d.]+)/)
          if (inlineBoM) portDesc.borderOffset = Number(inlineBoM[1])
          props.ports.push(portDesc)
          if (line.includes('{') && !line.includes('}')) {
            props._inPort = props.ports.length - 1
            stack.push(null)
          }
          continue
        }
        // 标签声明 (elkt 语法 ElkGraph.xtext: label 的 id 可选)
        //   `label id: "text"` 与简写 `label "text"` 均合法 (examples 容器标题标签用简写).
        // 简写无 id: 先匹配, 避免落到 propMatch 被丢弃.
        const shorthandLabelM = line.match(/^\s*label\s+"([^"]*)"\s*\{?/)
        if (shorthandLabelM) {
          if (!props.labels) props.labels = []
          const lab = { text: unescapeElkt(shorthandLabelM[1]), width: 0, height: 0 }
          // B16b: 单行 label 声明内联 layout/placement (label "N2" { layout [ size: 17, 15 ] }) —
          // 行含 '}' 时不进入块模式, 内联 size/position/placement 在此解析 (nodeLabelPlacement 实证).
          const inlineSizeM = line.match(/\blayout\s*\[\s*[^\]]*size\s*:\s*([\d.]+)\s*,\s*([\d.]+)/)
          if (inlineSizeM) { lab.width = Number(inlineSizeM[1]); lab.height = Number(inlineSizeM[2]) }
          const inlinePosM = line.match(/\bposition\s*:\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)/)
          if (inlinePosM) { lab.x = Number(inlinePosM[1]); lab.y = Number(inlinePosM[2]) }
          const inlinePlM = line.match(/\bnodeLabels\.placement\s*:\s*"([^"]*)"/)
          if (inlinePlM) lab.placement = inlinePlM[1]
          props.labels.push(lab)
          if (line.includes('{') && !line.includes('}')) {
            props._inLabel = props.labels.length - 1
            stack.push(null)
          }
          continue
        }
        const labelM = line.match(/^\s*label\s+[\w.-]+\s*:\s*"([^"]*)"\s*\{?/)
        if (labelM) {
          if (!props.labels) props.labels = []
          const lab = { text: unescapeElkt(labelM[1]), width: 0, height: 0 }
          const inlineSizeM = line.match(/\blayout\s*\[\s*[^\]]*size\s*:\s*([\d.]+)\s*,\s*([\d.]+)/)
          if (inlineSizeM) { lab.width = Number(inlineSizeM[1]); lab.height = Number(inlineSizeM[2]) }
          const inlinePosM = line.match(/\bposition\s*:\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)/)
          if (inlinePosM) { lab.x = Number(inlinePosM[1]); lab.y = Number(inlinePosM[2]) }
          const inlinePlM = line.match(/\bnodeLabels\.placement\s*:\s*"([^"]*)"/)
          if (inlinePlM) lab.placement = inlinePlM[1]
          props.labels.push(lab)
          if (line.includes('{') && !line.includes('}')) {
            props._inLabel = props.labels.length - 1
            stack.push(null)
            if (process.env.GGN_PARSE_DBG) console.error(`[label] set _inLabel=${props._inLabel} line="${line.trim()}"`)
          }
          continue
        }
        if (props._inLabel !== undefined && props._inLabel !== null) {
          if (process.env.GGN_PARSE_DBG) console.error(`[inlabel] line="${line.trim()}"`)
          if (line.includes('}') && !line.includes('{')) {
            props._inLabel = null
          } else {
            // label 块的 layout [ size / position ] 是缩进行, 不触发 /^layout[/ 分支 → 在此解析
            // (SSOT 输入保真: 724/905 的 NODE_LABELS 尺寸/位置此前丢失 → 节点尺寸差).
            const l = props.labels[props._inLabel]
            if (l) {
              const sizeM = line.match(/size\s*:\s*([\d.]+)\s*,\s*([\d.]+)/)
              if (sizeM) {
                l.width = Number(sizeM[1])
                l.height = Number(sizeM[2])
              }
              const posM = line.match(/position\s*:\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)/)
              if (posM) {
                l.x = Number(posM[1])
                l.y = Number(posM[2])
              }
            }
          }
          continue
        }
        const propMatch = line.match(/^([\w.]+)\s*:\s*(.+)$/)
        if (propMatch) {
          let key = propMatch[1]
          // ELK 长键归一化: org.eclipse.elk.portConstraints → portConstraints; elk.xxx → xxx
          // (193/148/insideSelfLoops 等用长键/短前缀).
          key = key.replace(/^(org\.eclipse\.elk\.|elk\.)/, '').replace(/^layered\./, '')
          let val = propMatch[2].trim()
          // 去尾部 `}` 与 `//` 注释 (单行 node { opt: val } 语法)
          val = val.replace(/\s*\}\s*$/, '').replace(/\s*\/\/.*$/, '').trim()
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = unescapeElkt(val.slice(1, -1))
          props[key] = val
          continue
        }
      }
    }

    // null 块内行 (label/port 内容块): 归属最近节点, 按 _inLabel/_inPort 状态处理
    if (stack.length > 0 && stack[stack.length - 1] === null) {
      let owner = null
      for (let i = stack.length - 1; i >= 0; i--) {
        if (typeof stack[i] === 'string') { owner = stack[i]; break }
      }
      if (owner !== null) {
        const props = nodeProps.get(owner)
        // 端口块内 label 子块: 内容解析到 p.labels (SSOT 输入保真, 701 端口标签尺寸/位置),
        // 关闭时递减 _inPortLabel. (注意 label 的 layout position/size 只属于标签, 不覆盖端口位置/尺寸.)
        if (props && (props._inPortLabel ?? 0) > 0) {
          if (line.includes('}') && !line.includes('{')) props._inPortLabel = (props._inPortLabel ?? 0) - 1
          else {
            const p = props.ports[props._inPort]
            const pl = p?.labels?.[(p.labels?.length ?? 1) - 1]
            if (pl) {
              const sizeM = line.match(/size\s*:\s*([\d.]+)\s*,\s*([\d.]+)/)
              if (sizeM) { pl.width = Number(sizeM[1]); pl.height = Number(sizeM[2]) }
              const posM = line.match(/position\s*:\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)/)
              if (posM) { pl.x = Number(posM[1]); pl.y = Number(posM[2]) }
            }
          }
          continue
        }
        // 端口块内的 label 声明: 解析到 p.labels, push null 保持括号平衡
        if (props && props._inPort !== undefined && props._inPort !== null
            && /^\s*label\s/.test(line) && line.includes('{') && !line.includes('}')) {
          const p = props.ports[props._inPort]
          const labelM = line.match(/^\s*label\s+(?:[\w.-]+\s*:\s*)?"([^"]*)"\s*\{?/)
          const lab = { text: labelM ? unescapeElkt(labelM[1]) : '', width: 0, height: 0 }
          const inlineSizeM = line.match(/\blayout\s*\[\s*[^\]]*size\s*:\s*([\d.]+)\s*,\s*([\d.]+)/)
          if (inlineSizeM) { lab.width = Number(inlineSizeM[1]); lab.height = Number(inlineSizeM[2]) }
          const inlinePosM = line.match(/\bposition\s*:\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)/)
          if (inlinePosM) { lab.x = Number(inlinePosM[1]); lab.y = Number(inlinePosM[2]) }
          if (!p.labels) p.labels = []
          p.labels.push(lab)
          props._inPortLabel = (props._inPortLabel ?? 0) + 1
          stack.push(null)
          continue
        }
        if (props && props._inLabel !== undefined && props._inLabel !== null) {
          if (line.includes('}') && !line.includes('{')) props._inLabel = null
          continue
        }
        if (props && props._inPort !== undefined && props._inPort !== null) {
          const p = props.ports[props._inPort]
          const posM = line.match(/position\s*:\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)/)
          if (posM) { p.x = Number(posM[1]); p.y = Number(posM[2]) }
          const sizeM = line.match(/size\s*:\s*([\d.]+)\s*,\s*([\d.]+)/)
          if (sizeM) { p.w = Number(sizeM[1]); p.h = Number(sizeM[2]) }
          const idxM = line.match(/index\s*:\s*(-?\d+)/)
          if (idxM) p.index = Number(idxM[1])
          const sideM = line.match(/side\s*:\s*(\w+)/)
          if (sideM) p.side = sideM[1]
          const boM = line.match(/borderOffset\s*:\s*(-?[\d.]+)/)
          if (boM) p.borderOffset = Number(boM[1])
          if (line.includes('}') && !line.includes('{')) props._inPort = null
          continue
        }
      }
    }

    if (net > 0) stack.push(null)

    const edgeMatch = line.match(/^\s*edge(?:\s+[\w.-]+\s*:)?\s*([\w.-]+)\s*->\s*([\w.-]+)/)
    if (edgeMatch) {
      // 当前作用域 = 栈内最近节点 (edge E3: CW1 -> NC1 在 Compound 块内, CW1 是 Compound 的端口)
      let scope = null
      for (let i = stack.length - 1; i >= 0; i--) {
        if (typeof stack[i] === 'string') { scope = stack[i]; break }
      }
      const edgeEntry = [edgeMatch[1], edgeMatch[2], scope, false]
      if (line.includes('{')) {
        // 边块跟踪 (捕获边标签): 开括号行 net>=1.
        edgeEntry._inBlock = true
        edgeEntry._blockDepth = net
      }
      edgeRaw.push(edgeEntry)
    }
    // 边块内属性 (edge ... { insideSelfLoops.yo: true }) — 回填到最近一条边.
    // 边块内属性 (edge ... { yo: true } / { insideSelfLoops.yo: true }) — 回填到最近一条边.
    // (短格式 yo 用于 273/297/298/inside_outside; 长格式用于 548/examples.)
    if (/^\s*(?:org\.eclipse\.elk\.)?(?:insideSelfLoops\.)?yo\s*:\s*true/.test(line) && edgeRaw.length > 0) {
      edgeRaw[edgeRaw.length - 1][3] = true
    }
    // 边块状态机: 捕获边标签 (text / edgeLabels.placement / layout size).
    // 边块内行不参与节点/端口解析 (continue), 栈平衡由 loop 顶部 net 处理.
    {
      const lastEdge = edgeRaw[edgeRaw.length - 1]
      if (lastEdge && lastEdge._inBlock) {
        lastEdge._blockDepth += net
        if (lastEdge._blockDepth <= 0) {
          lastEdge._inBlock = false
          lastEdge._blockDepth = 0
        } else {
          const labelM = line.match(/^\s*label\s+[\w.-]+\s*:\s*"([^"]*)"\s*\{?/)
          if (labelM) {
            if (!lastEdge.labels) lastEdge.labels = []
            lastEdge.labels.push({ text: unescapeElkt(labelM[1]), width: 0, height: 0, placement: null })
            lastEdge._curLabel = lastEdge.labels.length - 1
            lastEdge._labelDepth = net
          } else if (lastEdge._curLabel !== undefined && lastEdge._curLabel !== null) {
            lastEdge._labelDepth += net
            const l = lastEdge.labels[lastEdge._curLabel]
            if (l) {
              const sizeM = line.match(/size\s*:\s*([\d.]+)\s*,\s*([\d.]+)/)
              if (sizeM) { l.width = Number(sizeM[1]); l.height = Number(sizeM[2]) }
              const plM = line.match(/edgeLabels\.placement\s*:\s*(\w+)/)
              if (plM) l.placement = plM[1]
            }
            if (lastEdge._labelDepth <= 0) lastEdge._curLabel = null
          } else {
            // SSOT 输入保真: org.eclipse.elk.^edge.thickness (905 边标签 y 差 1 的来源)
            const thickM = line.match(/edge\.thickness\s*:\s*([\d.]+)/)
            if (thickM) lastEdge._thickness = Number(thickM[1])
          }
          continue
        }
      }
    }
  }

  // 边端点路径解析 (ELK JSON 引用语义):
  // 注: 用 lastIndexOf('.') 切"节点.端口"; 端口名含点 (elkt 语法允许 [\w.-]+) 会解析错.
  //     当前语料无此情况 (已 grep 确认), 契约未扩展. 若引入含点端口名需改用节点集合反查.
  //   A           → 节点 A
  //   A.B         → 节点 A 的子节点 B, 或节点 A 的端口 B (最后一段)
  //   A.B.C       → 节点 A 的子节点 B 的端口 C (中间段必须是子节点)
  // 解析必须在全部节点/层级/端口声明之后 (hierarchy 才完整).
  const resolveEndpoint = (path, scope) => {
    const parts = path.split('.')
    // 1) 完整限定节点 id 精确命中 (顶层或 父.子 显式引用)
    if (nodeSet.has(path)) return { nodeId: path, port: null }
    // 2) 候选节点: 节点 id 末尾分段与 path 全段一致 (suffix match).
    //    未限定名 (n1/MyNode2/MyCont3.MyNode2) 都能这样解析.
    const nodeCands = []
    for (const id of nodes) {
      const segs = id.split('.')
      if (segs.length < parts.length) continue
      let ok = true
      for (let i = 0; i < parts.length; i++) {
        if (segs[segs.length - 1 - i] !== parts[parts.length - 1 - i]) { ok = false; break }
      }
      if (ok) nodeCands.push(id)
    }
    if (nodeCands.length) {
      // 偏好: 作用域内 (id 以 scope 开头) > 最短 (最接近根, 顶层名优先)
      const inScope = nodeCands.filter(id => scope && (id === scope || id.startsWith(scope + '.')))
      if (inScope.length) return { nodeId: inScope[0], port: null }
      nodeCands.sort((a, b) => a.split('.').length - b.split('.').length)
      return { nodeId: nodeCands[0], port: null }
    }
    // 3) 端口候选: 节点 id 末尾 (parts.length-1) 段 = path 前段, 最后一段是该节点端口
    if (parts.length >= 2) {
      const nodePath = parts.slice(0, -1)
      const portName = parts[parts.length - 1]
      const portCands = []
      for (const id of nodes) {
        const segs = id.split('.')
        if (segs.length < nodePath.length) continue
        let ok = true
        for (let i = 0; i < nodePath.length; i++) {
          if (segs[segs.length - 1 - i] !== nodePath[nodePath.length - 1 - i]) { ok = false; break }
        }
        if (!ok) continue
        const props = nodeProps.get(id)
        if (props?.ports?.some(p => p.id === portName)) portCands.push(id)
      }
      if (portCands.length) {
        const inScope = portCands.filter(id => scope && (id === scope || id.startsWith(scope + '.')))
        if (inScope.length) return { nodeId: inScope[0], port: portName }
        portCands.sort((a, b) => a.split('.').length - b.split('.').length)
        return { nodeId: portCands[0], port: portName }
      }
    }
    // 4) 作用域节点自身的端口 (单段端口名, 如 Compound 块内 edge: CW1 -> NC1)
    if (scope) {
      const props = nodeProps.get(scope)
      if (props?.ports?.some(p => p.id === parts[0])) return { nodeId: scope, port: parts[0] }
    }
    return null
  }

  for (let i = 0; i < edgeRaw.length; i++) {
    const [sRaw, tRaw, scope, yo] = edgeRaw[i]
    let s, sp, t, tp
    const sr = resolveEndpoint(sRaw, scope)
    const tr = resolveEndpoint(tRaw, scope)
    if (sr) { s = sr.nodeId; sp = sr.port }
    else { const p = sRaw.split('.'); s = p[p.length - 1]; sp = null }
    if (tr) { t = tr.nodeId; tp = tr.port }
    else { const p = tRaw.split('.'); t = p[p.length - 1]; tp = null }
    if (!nodeSet.has(s)) { nodeSet.add(s); nodes.push(s) }
    if (!nodeSet.has(t)) { nodeSet.add(t); nodes.push(t) }
    // 第 6 元素 = 边标签列表 (text/width/height/placement).
    edges.push([s, sp, t, tp, yo === true, edgeRaw[i].labels, edgeRaw[i]._thickness ?? null])
  }

  return { nodes, edges, hierarchy, graphProps, portIds, nodeProps }
}

// ── 图数据提取 ──

function buildHierarchy(nodes, hierarchy) {
  const result = {}
  const entries = hierarchy instanceof Map ? hierarchy.entries() : Object.entries(hierarchy)
  for (const [parent, kids] of entries) {
    const pi = nodes.indexOf(parent)
    if (pi === -1) continue
    result[pi] = kids.map(k => nodes.indexOf(k)).filter(i => i !== -1)
  }
  return result
}

function hasCycle(edges, nodeCount) {
  const adj = Array.from({ length: nodeCount }, () => [])
  for (const [s, t] of edges) if (s !== t) adj[s].push(t)
  const inPath = new Array(nodeCount).fill(false)
  const visited = new Array(nodeCount).fill(false)
  const dfs = (u) => {
    if (inPath[u]) return true
    if (visited[u]) return false
    inPath[u] = true
    visited[u] = true
    for (const v of adj[u]) if (dfs(v)) return true
    inPath[u] = false
    return false
  }
  for (let i = 0; i < nodeCount; i++) if (dfs(i)) return true
  return false
}


// ── L1 jar oracle: elkt → ELK JSON + 模型 hash (与 scripts/generate-jar-oracle.mjs 共用, 防不一致) ──
export function elktToElkJson(graphData, opts = {}) {
  const { graphProps, nodeProps, hierarchy } = graphData
  const build = (idx) => {
    const p = nodeProps.get(idx) ?? {}
    const node = { id: 'N' + idx, width: p.width ?? 60, height: p.height ?? 30 }
    // SSOT 保真: 发射 node labels (尺寸/位置, 724/905 NODE_LABELS 输入保真).
    const nodeLabels = p.labels ?? []
    if (nodeLabels.length > 0) {
      node.labels = nodeLabels.map((l) => {
        const jl = { text: l.text, width: l.width ?? 0, height: l.height ?? 0 }
        if (l.x !== undefined) { jl.x = l.x; jl.y = l.y }
        if (l.placement) jl.layoutOptions = { 'org.eclipse.elk.nodeLabels.placement': l.placement }
        return jl
      })
    }
    // B14: 节点显式位置 (ELK CoreOptions.POSITION, 交互布局伪位置) — 输入保真发射
    if (p.position !== undefined && p.position !== null) {
      node.layoutOptions ??= {}
      node.layoutOptions['org.eclipse.elk.position'] = String(p.position).replace(/^["']|["']$/g, '')
    }
    // SSOT 保真: 发射全部节点级选项 (经 OPT_MAP, canonical key = ELK JSON key).
    for (const [k, v] of Object.entries(p)) {
      if (k.startsWith('_') || k === 'ports' || k === 'children' || k === 'labels' || k === 'width' || k === 'height') continue
      const m = OPT_MAP[k]
      if (!m) continue
      let sv = String(v).trim()
      if ((sv.startsWith('"') && sv.endsWith('"')) || (sv.startsWith("'") && sv.endsWith("'"))) sv = sv.slice(1, -1)
      node.layoutOptions ??= {}
      node.layoutOptions[m.ggn] = sv
    }
    const ports = p.ports ?? []
    if (ports.length > 0) {
      node.ports = ports.map(pp => {
        const props = { 'org.eclipse.elk.port.side': pp.side ?? 'UNDEFINED' }
        // SSOT 保真: 只在显式 index 时发射, 否则省略 (ELK port.index 默认 -1 = 未定义).
        // 旧实现 `String(pp.index ?? 0)` 把"未定义 index"(elkt `index: -1`/无 index) 发射成显式 0,
        // 改变端口排序语义 (0 = 排第一) → jar 侧输入与 ggn 不一致 (对比实证 25/51 端口).
        if (pp.index !== undefined && pp.index !== null) props['org.eclipse.elk.port.index'] = String(pp.index)
        if (pp.borderOffset !== undefined && pp.borderOffset !== null) props['org.eclipse.elk.port.borderOffset'] = String(pp.borderOffset)
        const portJson = { id: 'N' + idx + '.' + pp.id, width: pp.w ?? 8, height: pp.h ?? 8, x: pp.x ?? 0, y: pp.y ?? 0, properties: props }
        // ★ 端口标签 (SSOT 输入保真; ELK ElkGraphImporter createPort + LPort labels; 701 端口标签尺寸/位置).
        const portLabels = pp.labels ?? []
        if (portLabels.length > 0) {
          portJson.labels = portLabels.map((l) => {
            const jl = { text: l.text, width: l.width ?? 0, height: l.height ?? 0 }
            if (l.x !== undefined) { jl.x = l.x; jl.y = l.y }
            return jl
          })
        }
        return portJson
      })
    }
    const kids = hierarchy.get(idx) ?? []
    if (kids.length > 0) node.children = kids.map(build)
    return node
  }
  const rootIds = graphData.nodes.filter(id => ![...hierarchy.values()].flat().includes(id))
  const layoutOptions = {}
  for (const [k, v] of Object.entries(graphProps)) {
    const canon = OPT_MAP[k]?.ggn
    if (!canon) continue
    let sv = String(v).trim()
    if ((sv.startsWith('"') && sv.endsWith('"')) || (sv.startsWith("'") && sv.endsWith("'"))) sv = sv.slice(1, -1)
    layoutOptions[canon] = k === 'direction' ? sv.toUpperCase() : sv
  }
  layoutOptions['org.eclipse.elk.direction'] = String(opts.direction ?? graphProps.direction ?? 'RIGHT').toUpperCase()
  layoutOptions['org.eclipse.elk.randomSeed'] ??= '1'
  if (hierarchy.size > 0) layoutOptions['org.eclipse.elk.hierarchyHandling'] ??= 'INCLUDE_CHILDREN'
  return {
    id: 'root',
    layoutOptions,
    children: rootIds.map(build),
    edges: graphData.edges.map(([s, sp, t, tp, yo, labels, thickness], i) => {
      const edge = {
        id: 'e' + i,
        sources: [sp === null ? 'N' + s : 'N' + s + '.' + sp],
        targets: [tp === null ? 'N' + t : 'N' + t + '.' + tp],
      }
      if (yo === true) edge.properties = { 'org.eclipse.elk.insideSelfLoops.yo': 'true' }
      if (thickness !== undefined && thickness !== null) {
        edge.properties ??= {}
        edge.properties['org.eclipse.elk.edge.thickness'] = String(thickness)
      }
      if (labels !== undefined && labels !== null && labels.length > 0) {
        edge.labels = labels.map((l) => {
          const jl = { text: l.text }
          if (l.width > 0 || l.height > 0) { jl.width = l.width; jl.height = l.height }
          if (l.placement) jl.layoutOptions = { 'org.eclipse.elk.edgeLabels.placement': l.placement }
          return jl
        })
      }
      return edge
    }),
  }
}

export function elktHash(graphData) {
  return createHash('sha256').update(JSON.stringify(elktToElkJson(graphData))).digest('hex').slice(0, 16)
}

function generateTest(name, graph) {
  const { nodes, edges, hierarchy, graphProps, nodeProps, portIds } = graph
  // L1 tooling: jar 自身报错图 (oracle 含 err) → 生成 expected-crash 测试 (验证 ggn 复刻 ELK 报错).
  let oracleErr = null
  try {
    const oj = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'test-resources/jar-oracle', `${name}.json`), 'utf8'))
    oracleErr = oj.err ?? null
  } catch { oracleErr = null }

  // 跨层级边报错 (ticket 588): 边连接 layered 节点与另一层级非 layered 算法 (stress/force) 子图节点.
  // Java ElkGraphImporter.transformEdge 端点不在 nodeAndPortMap → UnsupportedGraphException.
  // ggn 在共享 builder 建图期复刻 (elkgraph-builder 跨层级边校验) → 测试用 buildLGraphFromElkJson 建图,
  // 建图即抛 (比 P2 内联平铺图更贴近 Java: 平铺图无层级信息, layout() 无法判定 588).
  if (oracleErr !== null && oracleErr.includes('could not be found') && oracleErr.includes('hierarchyHandling option to INCLUDE_CHILDREN')) {
    const errPhrase = oracleErr.replace(/\s+/g, ' ').trim()
    const excM = errPhrase.match(/^([\w.]+)\s+(.*)$/)
    const excShort = excM ? (excM[1].split('.').pop() ?? '') : 'ERROR'
    const msgFull = excM ? excM[2] : errPhrase
    const msgTail = msgFull.slice(-60)
    const escaped = msgTail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const errReJson = JSON.stringify(escaped)
    const errTitle = excShort + (excM ? ' ' + excM[2].slice(0, 40) : '')
    const errTitleJs = errTitle.replace(/'/g, "\\'")
    const elkJson = JSON.stringify(elktToElkJson(graph))
    return `/**
 * elkt 生成: ${name}
 * 图: ${nodes.length} 节点 / ${edges.length} 边 / ${Object.keys(hierarchy).length} 层级块
 * 差分: ELK 0.12.0 jar 自身报错 (${errTitle}) — ggn 须复刻报错 (跨层级边)
 */

describe('elkt 生成: ${name}', () => {
  const ELK_JSON = ${JSON.stringify(elkJson)}
  it('复刻 jar 报错 (ELK 0.12.0 自身行为): ${errTitleJs}', () => {
    expect(() => {
      const { graph } = buildLGraphFromElkJson(JSON.parse(ELK_JSON))
      new LayeredLayoutProvider().layout(graph)
    }).toThrow(new RegExp(${errReJson}))
  })
})`
  }

  // 含非 layered 算法 (stress/force): P2 图级路径强制 LayeredLayoutProvider, 不适用
  // (stress/force 由 layoutElkJson api 路径分派, verify-elkg-java-layout 覆盖 665/588/mixing).
  const isForceAlg = (v) => /^(?:elk\.|org\.eclipse\.elk\.)?(?:stress|force|rectpacking)$/.test(String(v ?? '').trim())
  const hasForceAlg = isForceAlg(graphProps.algorithm) || [...nodeProps.values()].some((props) => isForceAlg(props.algorithm))
  if (hasForceAlg) {
    return `describe('elkt 生成: ${name}', () => {
  // 含非 layered 算法 (stress/force): P2 图级路径不适用, 差分由 verify-elkg-java-layout (api 路径) 覆盖.
  it.skip('差分由 verify api 路径覆盖 (stress/force)', () => {})
})`
  }
  const nodeCount = nodes.length
  const GRAPH_DIRECTION = (graphProps.direction ?? 'RIGHT').toUpperCase()
  // mergeEdges 收集端口默认侧 (ELK PortSide.fromDirection).
  const defaultSideEmit = `PortSide.${ { RIGHT: 'EAST', LEFT: 'WEST', DOWN: 'SOUTH', UP: 'NORTH' }[GRAPH_DIRECTION] ?? 'EAST' }`
  const IH = graphProps.hierarchyHandling === 'INCLUDE_CHILDREN' || hierarchy.size > 0
  // M0-B: 提取 elkt 顶层算法属性 (OPT_MAP 命中) → ggn setProperty 语句 + elkjs layoutOptions 片段.
  // B1/B4: 图级 minimum 字符串 → {x,y} 对象 (与节点级/buildLGraphFromParsed 一致); 解析失败值跳过.
  const appliedOpts = Object.entries(graphProps)
    .filter(([k]) => OPT_MAP[k])
    .map(([k, v]) => {
      const m = OPT_MAP[k]
      let val = coerceVal(m, v)
      if (val === undefined) return null
      if (m.ggn === 'org.eclipse.elk.nodeSize.minimum' && typeof val === 'string') {
        const [nx, ny] = String(val).replace(/[()]/g, '').split(',').map(Number)
        val = { x: nx, y: ny }
      }
      return [k, m, val]
    })
    .filter(Boolean)
  const SKIP_ELKJS = new Set(['elk.direction', 'elk.randomSeed', 'elk.hierarchyHandling', 'elk.algorithm'])
  // B2: P3/jar 侧 elktToElkJson 注入默认 randomSeed=1, P2 生成测试同样注入 (未显式设置时) — 输入对称.
  const hasRandomSeed = appliedOpts.some(([k]) => k === 'randomSeed')
  const ggnApply = [
    ...appliedOpts.map(([, m, v]) => `    graph.setProperty('${m.ggn}', ${JSON.stringify(v)})`),
    ...(hasRandomSeed ? [] : [`    graph.setProperty('org.eclipse.elk.randomSeed', 1)`]),
  ].join('\n')
  const elkjsApply = appliedOpts
    .filter(([, m]) => !SKIP_ELKJS.has(m.elkjs))
    .map(([, m, v]) => `'${m.elkjs}': ${JSON.stringify(v)}`)
    .join(', ')
  const isBig = nodeCount > 150
  const PORT_IDS = JSON.stringify([...portIds])
  const edgeYo = JSON.stringify(edges.map((e) => e[4] === true))
  const edgeLabels = JSON.stringify(edges.map((e) => {
    const ls = e[5]
    return (ls ?? []).map((l) => ({ text: l.text, width: l.width ?? 0, height: l.height ?? 0, placement: l.placement ?? null }))
  }))
  const edgeIdx = JSON.stringify(edges.map(([s, sp, t, tp]) => {
    const si = nodes.indexOf(s)
    const ti = nodes.indexOf(t)
    const spIdx = sp === null ? null : (() => {
      const ports = nodeProps.get(s)?.ports ?? []
      const found = ports.findIndex(p => p.id === sp)
      return found === -1 ? null : found
    })()
    const tpIdx = tp === null ? null : (() => {
      const ports = nodeProps.get(t)?.ports ?? []
      const found = ports.findIndex(p => p.id === tp)
      return found === -1 ? null : found
    })()
    const spId = sp === null ? null : sp
    const tpId = tp === null ? null : tp
    return [si, spIdx, spId, ti, tpIdx, tpId]
  }))
  const dims = JSON.stringify(nodes.map(id => {
    const p = nodeProps.get(id) ?? {}
    return [p.width ?? 60, p.height ?? 30]
  }))
  const NAMES = JSON.stringify(nodes)
  const portConstraints = JSON.stringify(nodes.map(id => {
    const p = nodeProps.get(id) ?? {}
    return p.portConstraints ?? null
  }))
  const nodePorts = JSON.stringify(nodes.map(id => {
    const p = nodeProps.get(id) ?? {}
    // B9/B10: 端口侧不在此推断 (见 shared/elkgraph-builder 注释) — layout 期 initializeAllPortSides 统一处理.
    return (p.ports ?? []).map((port) => {
      const side = port.side ?? null
      const labels = (port.labels ?? []).map((l) => ({ text: l.text, x: l.x ?? 0, y: l.y ?? 0, width: l.width ?? 0, height: l.height ?? 0 }))
      return { id: port.id, x: port.x ?? 0, y: port.y ?? 0, w: port.w ?? 8, h: port.h ?? 8, side, index: port.index ?? null, borderOffset: port.borderOffset ?? null, labels }
    })
  }))
  const nodeActivate = JSON.stringify(nodes.map(id => {
    const p = nodeProps.get(id) ?? {}
    return p['insideSelfLoops.activate'] === 'true' || p['insideSelfLoops.activate'] === true
  }))
  // 节点级选项 (SSOT 保真): [canonicalKey, coercedValue] 列表, 除已单列处理的 portConstraints/insideSelfLoops.activate.
  const nodeOpts = JSON.stringify(nodes.map(id => {
    const p = nodeProps.get(id) ?? {}
    const out = []
    for (const [k, v] of Object.entries(p)) {
      if (k.startsWith('_') || k === 'ports' || k === 'children' || k === 'labels' || k === 'width' || k === 'height') continue
      if (k === 'portConstraints' || k === 'insideSelfLoops.activate') continue
      const m = OPT_MAP[k]
      if (!m) continue
      let val = coerceVal(m, String(v))
      // nodeSize.minimum "100, 50" → {x,y} (ggn NODE_SIZE_MINIMUM 对象语义).
      if (m.ggn === 'org.eclipse.elk.nodeSize.minimum' && typeof val === 'string') {
        const [nx, ny] = String(val).replace(/[()]/g, '').split(',').map(Number)
        val = { x: nx, y: ny }
      }
      // position "(0.0,2.0)" → {x,y} (ggn POSITION KVector 对象语义, semi-interactive 用).
      if (m.ggn === 'org.eclipse.elk.position' && typeof val === 'string') {
        const [px, py] = String(val).replace(/[()]/g, '').split(',').map(Number)
        val = { x: px, y: py }
      }
      if (val === undefined) continue  // ELK parseValue null → 选项不设置 (默认)
      out.push([m.ggn, val])
    }
    return out
  }))
  const nodeLabels = JSON.stringify(nodes.map(id => {
    const p = nodeProps.get(id) ?? {}
    return (p.labels ?? []).map((l) => ({ text: l.text, width: l.width ?? 0, height: l.height ?? 0, placement: l.placement ?? null }))
  }))
  // ★ 容器节点 label 占位 (对齐 buildLGraphFromParsed / ElkGraphImporter.createLGraph:615-626):
  //   subgraph padding.top = 配置12 + max(label.height) + nodeLabels.padding.top + 2*spacing.labelLabel
  //   (Spacing.add 相加; 默认 padding 5, spacing.labelLabel 0 → 905: 12+21+5+0=38).
  // 容器子图 padding = 父节点配置 padding (org.eclipse.elk.padding, 默认 12) + label 占位 top
  // (对齐 buildLGraphFromParsed / ELK createLGraph; 489: padding [5,5,5,5] → 子图 padding 5)
  const labelPadByNode = JSON.stringify(nodes.map(id => {
    const p = nodeProps.get(id) ?? {}
    if (!((hierarchy.get(id) ?? []).length > 0)) return null
    const configPad = typeof p.padding === 'object' ? p.padding
      : (p.padding ? coerceVal(OPT_MAP.padding, String(p.padding)) : null)
    const base = configPad ?? { top: 12, left: 12, right: 12, bottom: 12 }
    // B16c: 仅显式 INSIDE placement 的 label 参与子图 padding (ELK computeInsideNodeLabelPadding:
    // 无 placement → UNDEFINED → 不进 cell; padding.elkt n1/n2/n4/n5 实证). V_TOP→top, V_BOTTOM→bottom,
    // H_LEFT/H_RIGHT (无 V 方向) → left/right. 方括号 enumset 格式剥壳. 与 buildLGraphFromParsed 1:1.
    const nodePlRaw = p['nodeLabels.placement']
    let padTop = 0, padBottom = 0, padLeft = 0, padRight = 0
    for (const l of p.labels ?? []) {
      const plRaw = l.placement ?? nodePlRaw ?? ''
      if (!plRaw) continue
      const pl = String(plRaw).replace(/[\[\]]/g, '').split(/[\s,]+/).filter(Boolean)
      if (!pl.includes('INSIDE')) continue
      if (pl.includes('V_TOP')) padTop = Math.max(padTop, l.height ?? 0)
      else if (pl.includes('V_BOTTOM')) padBottom = Math.max(padBottom, l.height ?? 0)
      else {
        if (pl.includes('H_LEFT')) padLeft = Math.max(padLeft, l.width ?? 0)
        if (pl.includes('H_RIGHT')) padRight = Math.max(padRight, l.width ?? 0)
      }
    }
    const nlPad = p['nodeLabels.padding']
    const labelLabel = Number(p['spacing.labelLabel'] ?? 0)
    const nlTop = typeof nlPad === 'object' ? (nlPad.top ?? 5) : 5
    const nlBottom = typeof nlPad === 'object' ? (nlPad.bottom ?? 5) : 5
    const nlLeft = typeof nlPad === 'object' ? (nlPad.left ?? 5) : 5
    const nlRight = typeof nlPad === 'object' ? (nlPad.right ?? 5) : 5
    const fmt = (v, side) => v > 0 ? v + side + 2 * labelLabel : 0
    return {
      top: base.top + fmt(padTop, nlTop),
      bottom: base.bottom + fmt(padBottom, nlBottom),
      left: base.left + fmt(padLeft, nlLeft),
      right: base.right + fmt(padRight, nlRight),
    }
  }))
  const hierarchyJson = JSON.stringify(buildHierarchy(nodes, hierarchy))
  const hasCycleFlag = hasCycle(edges.map(([s, sp, t, tp]) => [nodes.indexOf(s), nodes.indexOf(t)]), nodeCount)
  const hash = elktHash(graph)

  const buildGraphCode = `    const graph = new LGraph()
    const nodeOf = new Map<number, LNode>()
    const nestedGraphs = new Map<number, LGraph>()
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      nestedGraphs.set(p, new LGraph())
    }
    for (let i = 0; i < DIMS.length; i++) {
      const parentIdx = Object.entries(HIERARCHY).find(([, kids]) => kids.includes(i))?.[0]
      const g = parentIdx !== undefined ? nestedGraphs.get(Number(parentIdx))! : graph
      const n = new LNode(g)
      n.size = { x: DIMS[i][0], y: DIMS[i][1] }
      n.setProperty(MODEL_ORDER_KEY, i)
      if (PORT_CONSTRAINTS[i]) {
        n.setProperty(PORT_CONSTRAINTS_KEY, PORT_CONSTRAINTS[i] as any)
      }
      for (const [k, v] of NODE_OPTS[i]) {
        n.setProperty(k, v as any)
      }
      for (const portDesc of NODE_PORTS[i]) {
        const port = new LPort()
        port.setNode(n)
        port.getPosition().x = portDesc.x
        port.getPosition().y = portDesc.y
        port.size = { x: portDesc.w, y: portDesc.h }
        if (portDesc.side) port.setSide(portDesc.side as any)
        if (portDesc.index !== null) port.setProperty(PORT_INDEX_KEY, portDesc.index)
        if (portDesc.borderOffset !== null) port.setProperty(PORT_BORDER_OFFSET_KEY, portDesc.borderOffset)
        if (portDesc.labels.length > 0) {
          port.setLabels(portDesc.labels.map((l) => ({ text: l.text, position: { x: l.x, y: l.y }, size: { x: l.width, y: l.height } })))
        }
      }
      if (NODE_ACTIVATE[i]) {
        n.setProperty(INSIDE_SELF_LOOPS_ACTIVATE_KEY, true)
      }
      if (NODE_LABELS[i].length > 0) {
        n.setLabels(NODE_LABELS[i].map((l) => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })))
      }
      nodeOf.set(i, n)
    }
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      const parent = nodeOf.get(p)!
      const nested = nestedGraphs.get(p)!
      parent.setNestedGraph(nested)
      nested.setParentNode(parent)
      // ★ 容器节点 label 占位 (SSOT: LABEL_PAD[i] = 子图 padding.top, 对齐 buildLGraphFromParsed)
      if (LABEL_PAD[p] !== undefined && LABEL_PAD[p] !== null) nested.setPadding(LABEL_PAD[p])
      // ★ 节点级 mergeEdges → 嵌套图 (ELK createLGraph copyProperties; LGraphUtil.createPort 读图属性)
      if (NODE_OPTS[p]?.some(([k]) => k === 'org.eclipse.elk.layered.mergeEdges')) nested.setProperty(MERGE_EDGES_KEY, true)
    }
    __mergeEdges = ${graphProps.mergeEdges === true || graphProps.mergeEdges === 'true'}
    __defaultSide = ${defaultSideEmit}
    if (__mergeEdges) graph.setProperty(MERGE_EDGES_KEY, true)
    // 边所在图 (LCA) 的 MERGE_EDGES (ELK ElkGraphImporter 源侧读边所在图; 目标侧读目标节点所在图).
    const __parentOf = new Map<number, number>()
    for (const [__p, __kids] of Object.entries(HIERARCHY)) for (const __k of __kids) __parentOf.set(__k, Number(__p))
    const __lcaMerge = (a: number, b: number): boolean => {
      const seen = new Set<number>()
      let x: number | undefined = a
      while (x !== undefined) { seen.add(x); x = __parentOf.get(x) }
      let y: number | undefined = b
      while (y !== undefined && !seen.has(y)) y = __parentOf.get(y)
      if (y === undefined) return graph.getProperty(MERGE_EDGES_KEY) === true
      const __py = __parentOf.get(y)
      const __g = __py === undefined ? graph : nestedGraphs.get(__py)!
      return __g.getProperty(MERGE_EDGES_KEY) === true
    }
    EDGE_IDX.forEach(([s, sp, , t, tp], ei) => {
      const __srcMerge = __lcaMerge(s, t)
      const __tgtMerge = nodeOf.get(t)!.getGraph()?.getProperty(MERGE_EDGES_KEY) === true
      const e = createSimpleEdge(nodeOf.get(s)!, nodeOf.get(t)!, sp, tp, __srcMerge, __tgtMerge)
      e.setProperty(MODEL_ORDER_KEY, ei)
      if (EDGE_YO[ei]) e.setProperty(INSIDE_SELF_LOOPS_YO_KEY, true)
      for (const l of EDGE_LABELS[ei]) {
        e.getLabels().push({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })
      }
    })
    if (Object.keys(HIERARCHY).length > 0) {
      graph.setProperty(HIERARCHY_HANDLING_KEY, 'INCLUDE_CHILDREN')
    }
    graph.setProperty(DIRECTION_KEY, '${GRAPH_DIRECTION}')
${ggnApply}
`;

  if (oracleErr !== null) {
    // 从 oracle 错误派生匹配正则: 异常短类名 + 消息**尾段** (稳定描述, 转义正则元字符).
    // 反例: 用消息头段会含具体节点列表 (G-unlayered[...]) 难以复刻 — verticalOrder 实证.
    const errPhrase = oracleErr.replace(/\s+/g, ' ').trim()
    const excM = errPhrase.match(/^([\w.]+)\s+(.*)$/)
    const excShort = excM ? (excM[1].split('.').pop() ?? '') : 'ERROR'
    const msgFull = excM ? excM[2] : errPhrase
    // 算法不支持错误: 用稳定前缀 (designation 含节点路径, ggn 不追踪模型 id, 无法复刻 exact tail).
    const algoM = msgFull.match(/^Layout algorithm '([^']+)' not found/)
    const msgTail = algoM ? `Layout algorithm '${algoM[1]}' not found` : msgFull.slice(-60)
    const escaped = msgTail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const errReJson = JSON.stringify(escaped)
    const errTitle = excShort + (excM ? ' ' + excM[2].slice(0, 40) : '')
    // 标题嵌入 JS 单引号字符串: ELK 消息含 'elk.stress' 等单引号, 需转义 (tickets 665/588 实证).
    const errTitleJs = errTitle.replace(/'/g, "\\'")
    return `/**
 * elkt 生成: ${name}
 * 图: ${nodeCount} 节点 / ${edges.length} 边 / ${Object.keys(hierarchy).length} 层级块
 * 差分: ELK 0.12.0 jar 自身报错 (${errTitle}) — ggn 须复刻报错 (expected crash)
 */

describe('elkt 生成: ${name}', () => {
  const HIERARCHY: Record<number, number[]> = ${hierarchyJson}
  const EDGE_IDX: [number, number | null, string | null, number, number | null, string | null][] = ${edgeIdx}
  const EDGE_YO: boolean[] = ${edgeYo}
  const EDGE_LABELS: { text: string; width: number; height: number; placement: string | null }[][] = ${edgeLabels}
  const DIMS: [number, number][] = ${dims}
  const NAMES: string[] = ${NAMES}
  const PORT_IDS: string[] = ${PORT_IDS}
  const PORT_CONSTRAINTS: (string | null)[] = ${portConstraints}
  const NODE_PORTS: { id: string; x: number; y: number; w: number; h: number; side: string | null; index: number | null; borderOffset: number | null; labels: { text: string; x: number; y: number; width: number; height: number }[] }[][] = ${nodePorts}
  const NODE_ACTIVATE: boolean[] = ${nodeActivate}
  const NODE_LABELS: { text: string; width: number; height: number; placement: string | null }[][] = ${nodeLabels}
  const LABEL_PAD: ({ top: number; left: number; right: number; bottom: number } | null)[] = ${labelPadByNode}
  const NODE_OPTS: [string, unknown][][] = ${nodeOpts}

  it('复刻 jar 报错 (ELK 0.12.0 自身行为): ${errTitleJs}', () => {
${buildGraphCode}
    expect(() => new LayeredLayoutProvider().layout(graph)).toThrow(new RegExp(${errReJson}))
  })
})
`
  }

  return `/**
 * elkt 生成: ${name}
 * 图: ${nodeCount} 节点 / ${edges.length} 边 / ${Object.keys(hierarchy).length} 层级块
 * 差分: 坐标级 (1:1 ELK 对齐)
 */

describe('elkt 生成: ${name}', () => {
  const HIERARCHY: Record<number, number[]> = ${hierarchyJson}
  const EDGE_IDX: [number, number | null, string | null, number, number | null, string | null][] = ${edgeIdx}
  const EDGE_YO: boolean[] = ${edgeYo}
  const EDGE_LABELS: { text: string; width: number; height: number; placement: string | null }[][] = ${edgeLabels}
  const DIMS: [number, number][] = ${dims}
  const NAMES: string[] = ${NAMES}
  const PORT_IDS: string[] = ${PORT_IDS}
  const PORT_CONSTRAINTS: (string | null)[] = ${portConstraints}
  const NODE_PORTS: { id: string; x: number; y: number; w: number; h: number; side: string | null; index: number | null; borderOffset: number | null; labels: { text: string; x: number; y: number; width: number; height: number }[] }[][] = ${nodePorts}
  const NODE_ACTIVATE: boolean[] = ${nodeActivate}
  const NODE_LABELS: { text: string; width: number; height: number; placement: string | null }[][] = ${nodeLabels}
  const LABEL_PAD: ({ top: number; left: number; right: number; bottom: number } | null)[] = ${labelPadByNode}
  const NODE_OPTS: [string, unknown][][] = ${nodeOpts}

  it('布局完成且无重叠', () => {
    const graph = new LGraph()
    const graphNodes: LNode[] = []
    const nodeOf = new Map<number, LNode>()
    const nestedGraphs = new Map<number, LGraph>()
    // 只有容器节点 (有子节点的) 才拥有 nestedGraph (ELK 模型).
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      nestedGraphs.set(p, new LGraph())
    }
    for (let i = 0; i < DIMS.length; i++) {
      const parentIdx = Object.entries(HIERARCHY).find(([, kids]) => kids.includes(i))?.[0]
      const g = parentIdx !== undefined ? nestedGraphs.get(Number(parentIdx))! : graph
      const n = new LNode(g)
      n.size = { x: DIMS[i][0], y: DIMS[i][1] }
      n.setProperty(MODEL_ORDER_KEY, i)
      if (PORT_CONSTRAINTS[i]) {
        n.setProperty(PORT_CONSTRAINTS_KEY, PORT_CONSTRAINTS[i] as any)
      }
      for (const [k, v] of NODE_OPTS[i]) {
        n.setProperty(k, v as any)
      }
      for (const portDesc of NODE_PORTS[i]) {
        const port = new LPort()
        port.setNode(n)
        port.getPosition().x = portDesc.x
        port.getPosition().y = portDesc.y
        port.size = { x: portDesc.w, y: portDesc.h }
        if (portDesc.side) port.setSide(portDesc.side as any)
        if (portDesc.index !== null) port.setProperty(PORT_INDEX_KEY, portDesc.index)
        if (portDesc.borderOffset !== null) port.setProperty(PORT_BORDER_OFFSET_KEY, portDesc.borderOffset)
        if (portDesc.labels.length > 0) {
          port.setLabels(portDesc.labels.map((l) => ({ text: l.text, position: { x: l.x, y: l.y }, size: { x: l.width, y: l.height } })))
        }
      }
      if (NODE_ACTIVATE[i]) {
        n.setProperty(INSIDE_SELF_LOOPS_ACTIVATE_KEY, true)
      }
      if (NODE_LABELS[i].length > 0) {
        n.setLabels(NODE_LABELS[i].map((l) => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })))
      }
      nodeOf.set(i, n)
      graphNodes.push(n)
    }
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      const parent = nodeOf.get(p)!
      const nested = nestedGraphs.get(p)!
      parent.setNestedGraph(nested)
      nested.setParentNode(parent)
      // ★ 容器节点 label 占位 (SSOT: LABEL_PAD[i] = 子图 padding.top, 对齐 buildLGraphFromParsed)
      if (LABEL_PAD[p] !== undefined && LABEL_PAD[p] !== null) nested.setPadding(LABEL_PAD[p])
      // ★ 节点级 mergeEdges → 嵌套图 (ELK createLGraph copyProperties; LGraphUtil.createPort 读图属性)
      if (NODE_OPTS[p]?.some(([k]) => k === 'org.eclipse.elk.layered.mergeEdges')) nested.setProperty(MERGE_EDGES_KEY, true)
    }
    __mergeEdges = ${graphProps.mergeEdges === true || graphProps.mergeEdges === 'true'}
    __defaultSide = ${defaultSideEmit}
    if (__mergeEdges) graph.setProperty(MERGE_EDGES_KEY, true)
    // 边所在图 (LCA) 的 MERGE_EDGES (ELK ElkGraphImporter 源侧读边所在图; 目标侧读目标节点所在图).
    const __parentOf = new Map<number, number>()
    for (const [__p, __kids] of Object.entries(HIERARCHY)) for (const __k of __kids) __parentOf.set(__k, Number(__p))
    const __lcaMerge = (a: number, b: number): boolean => {
      const seen = new Set<number>()
      let x: number | undefined = a
      while (x !== undefined) { seen.add(x); x = __parentOf.get(x) }
      let y: number | undefined = b
      while (y !== undefined && !seen.has(y)) y = __parentOf.get(y)
      if (y === undefined) return graph.getProperty(MERGE_EDGES_KEY) === true
      const __py = __parentOf.get(y)
      const __g = __py === undefined ? graph : nestedGraphs.get(__py)!
      return __g.getProperty(MERGE_EDGES_KEY) === true
    }
    EDGE_IDX.forEach(([s, sp, , t, tp], ei) => {
      const __srcMerge = __lcaMerge(s, t)
      const __tgtMerge = nodeOf.get(t)!.getGraph()?.getProperty(MERGE_EDGES_KEY) === true
      const e = createSimpleEdge(nodeOf.get(s)!, nodeOf.get(t)!, sp, tp, __srcMerge, __tgtMerge)
      e.setProperty(MODEL_ORDER_KEY, ei)
      if (EDGE_YO[ei]) e.setProperty(INSIDE_SELF_LOOPS_YO_KEY, true)
      for (const l of EDGE_LABELS[ei]) {
        e.getLabels().push({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })
      }
    })
    if (Object.keys(HIERARCHY).length > 0) {
      graph.setProperty(HIERARCHY_HANDLING_KEY, 'INCLUDE_CHILDREN')
    }
    graph.setProperty(DIRECTION_KEY, '${GRAPH_DIRECTION}')
${ggnApply}

    new LayeredLayoutProvider().layout(graph)

    for (const n of graphNodes) {
      expect(Number.isFinite(n.position.x)).toBe(true)
      expect(Number.isFinite(n.position.y)).toBe(true)
    }
    // 世界坐标 (子图节点坐标相对父, 重叠检查必须累加祖先位置).
    const worldOf = (n: LNode): { x: number; y: number } => {
      let wx = n.position.x, wy = n.position.y
      let g = n.getGraph()
      while (g !== null && g !== graph) {
        const parent = g.getParentNode()
        if (parent === null) break
        wx += parent.position.x
        wy += parent.position.y
        g = parent.getGraph()
      }
      return { x: wx, y: wy }
    }
    // 祖先-后代 (父包含子) 不算重叠.
    const isAncestor = (anc: LNode, desc: LNode): boolean => {
      let g = desc.getGraph()
      while (g !== null && g !== graph) {
        const parent = g.getParentNode()
        if (parent === anc) return true
        if (parent === null) break
        g = parent.getGraph()
      }
      return false
    }
    for (let i = 0; i < graphNodes.length; i++) {
      for (let j = i + 1; j < graphNodes.length; j++) {
        const a = graphNodes[i], b = graphNodes[j]
        if (PORT_IDS.includes(a.id.toString()) || PORT_IDS.includes(b.id.toString())) continue
        if (isAncestor(a, b) || isAncestor(b, a)) continue
        const pa = worldOf(a), pb = worldOf(b)
        const overlapX = pa.x < pb.x + b.size.x && pa.x + a.size.x > pb.x
        const overlapY = pa.y < pb.y + b.size.y && pa.y + a.size.y > pb.y
        expect(overlapX && overlapY, 'overlap').toBe(false)
      }
    }
  })

  it('${isBig ? '布局完成 (大图跳过差分)' : '坐标级差分: 与 jar 0.12.0 1:1 对齐'}', () => {
    const graph = new LGraph()
    const nodeOf = new Map<number, LNode>()
    const nestedGraphs = new Map<number, LGraph>()
    // 只有容器节点 (有子节点的) 才拥有 nestedGraph (ELK 模型).
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      nestedGraphs.set(p, new LGraph())
    }
    for (let i = 0; i < DIMS.length; i++) {
      const parentIdx = Object.entries(HIERARCHY).find(([, kids]) => kids.includes(i))?.[0]
      const g = parentIdx !== undefined ? nestedGraphs.get(Number(parentIdx))! : graph
      const n = new LNode(g)
      n.size = { x: DIMS[i][0], y: DIMS[i][1] }
      n.setProperty(MODEL_ORDER_KEY, i)
      if (PORT_CONSTRAINTS[i]) {
        n.setProperty(PORT_CONSTRAINTS_KEY, PORT_CONSTRAINTS[i] as any)
      }
      for (const [k, v] of NODE_OPTS[i]) {
        n.setProperty(k, v as any)
      }
      for (const portDesc of NODE_PORTS[i]) {
        const port = new LPort()
        port.setNode(n)
        port.getPosition().x = portDesc.x
        port.getPosition().y = portDesc.y
        port.size = { x: portDesc.w, y: portDesc.h }
        if (portDesc.side) port.setSide(portDesc.side as any)
        if (portDesc.index !== null) port.setProperty(PORT_INDEX_KEY, portDesc.index)
        if (portDesc.borderOffset !== null) port.setProperty(PORT_BORDER_OFFSET_KEY, portDesc.borderOffset)
        if (portDesc.labels.length > 0) {
          port.setLabels(portDesc.labels.map((l) => ({ text: l.text, position: { x: l.x, y: l.y }, size: { x: l.width, y: l.height } })))
        }
      }
      if (NODE_ACTIVATE[i]) {
        n.setProperty(INSIDE_SELF_LOOPS_ACTIVATE_KEY, true)
      }
      if (NODE_LABELS[i].length > 0) {
        n.setLabels(NODE_LABELS[i].map((l) => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })))
      }
      nodeOf.set(i, n)
    }
    for (const p of Object.keys(HIERARCHY).map(Number)) {
      const parent = nodeOf.get(p)!
      const nested = nestedGraphs.get(p)!
      parent.setNestedGraph(nested)
      nested.setParentNode(parent)
      // ★ 容器节点 label 占位 (SSOT: LABEL_PAD[i] = 子图 padding.top, 对齐 buildLGraphFromParsed)
      if (LABEL_PAD[p] !== undefined && LABEL_PAD[p] !== null) nested.setPadding(LABEL_PAD[p])
      // ★ 节点级 mergeEdges → 嵌套图 (ELK createLGraph copyProperties; LGraphUtil.createPort 读图属性)
      if (NODE_OPTS[p]?.some(([k]) => k === 'org.eclipse.elk.layered.mergeEdges')) nested.setProperty(MERGE_EDGES_KEY, true)
    }
    __mergeEdges = ${graphProps.mergeEdges === true || graphProps.mergeEdges === 'true'}
    __defaultSide = ${defaultSideEmit}
    if (__mergeEdges) graph.setProperty(MERGE_EDGES_KEY, true)
    // 边所在图 (LCA) 的 MERGE_EDGES (ELK ElkGraphImporter 源侧读边所在图; 目标侧读目标节点所在图).
    const __parentOf = new Map<number, number>()
    for (const [__p, __kids] of Object.entries(HIERARCHY)) for (const __k of __kids) __parentOf.set(__k, Number(__p))
    const __lcaMerge = (a: number, b: number): boolean => {
      const seen = new Set<number>()
      let x: number | undefined = a
      while (x !== undefined) { seen.add(x); x = __parentOf.get(x) }
      let y: number | undefined = b
      while (y !== undefined && !seen.has(y)) y = __parentOf.get(y)
      if (y === undefined) return graph.getProperty(MERGE_EDGES_KEY) === true
      const __py = __parentOf.get(y)
      const __g = __py === undefined ? graph : nestedGraphs.get(__py)!
      return __g.getProperty(MERGE_EDGES_KEY) === true
    }
    EDGE_IDX.forEach(([s, sp, , t, tp], ei) => {
      const __srcMerge = __lcaMerge(s, t)
      const __tgtMerge = nodeOf.get(t)!.getGraph()?.getProperty(MERGE_EDGES_KEY) === true
      const e = createSimpleEdge(nodeOf.get(s)!, nodeOf.get(t)!, sp, tp, __srcMerge, __tgtMerge)
      e.setProperty(MODEL_ORDER_KEY, ei)
      if (EDGE_YO[ei]) e.setProperty(INSIDE_SELF_LOOPS_YO_KEY, true)
      for (const l of EDGE_LABELS[ei]) {
        e.getLabels().push({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.width, y: l.height }, placement: l.placement ?? undefined })
      }
    })
    if (Object.keys(HIERARCHY).length > 0) {
      graph.setProperty(HIERARCHY_HANDLING_KEY, 'INCLUDE_CHILDREN')
    }
    graph.setProperty(DIRECTION_KEY, '${GRAPH_DIRECTION}')
${ggnApply}

    new LayeredLayoutProvider().layout(graph)

    if (${isBig ? 'true' : 'false'}) {
      for (const n of nodeOf.values()) {
        expect(Number.isFinite(n.position.x)).toBe(true)
        expect(Number.isFinite(n.position.y)).toBe(true)
      }
      return
    }

    // L1 (M3): 与 ELK Java 0.12.0 jar oracle 坐标级差分 (容差 ε = ${TOLERANCE}).
    // oracle 坐标相对父块 (jar getX/getY); ggn 子图节点坐标同样相对父 → 直接对比, 无需世界坐标累加.
    const oracle = JSON.parse(readFileSync(new URL('../../../test-resources/jar-oracle/${name}.json', import.meta.url), 'utf8'))
    expect(oracle.hash, 'jar oracle 过期/缺失, 请重跑 node scripts/generate-jar-oracle.mjs').toBe('${hash}')
    // ELK 类加载顺序变体 (EdgeMain vs BatchMain): oracle.variants 记录另一变体, 任一匹配即通过.
    const variants = oracle.variants ?? []
    for (let i = 0; i < DIMS.length; i++) {
      const gn = nodeOf.get(i)!
      const nm = 'N' + NAMES[i]
      const cands = [oracle.coords[nm], ...variants.map((v) => v.coords[nm])].filter(Boolean)
      expect(cands.length, nm + ' 缺少 jar oracle 坐标').toBeGreaterThan(0)
      const bestX = Math.min(...cands.map((c) => Math.abs(gn.position.x - c.x)))
      const bestY = Math.min(...cands.map((c) => Math.abs(gn.position.y - c.y)))
      expect(bestX, nm + ' x').toBeLessThanOrEqual(${TOLERANCE})
      expect(bestY, nm + ' y').toBeLessThanOrEqual(${TOLERANCE})
    }
  })
})
`

}

function sanitize(id) {
  const value = id.replace(/[^A-Za-z0-9_$]/g, '_')
  return /^[A-Za-z_$]/.test(value) ? value : `_${value}`
}

// ── 主流程 (仅直接运行时执行, import 时跳过) ──

if (import.meta.main) {
const patterns = process.argv.slice(2)
if (patterns.length === 0) {
  console.error('用法: bun scripts/elkt2test.mjs <glob>')
  process.exit(1)
}

const files = patterns.flatMap(p => globSync(p))
if (files.length === 0) {
  console.error('未找到匹配的 .elkt 文件:', patterns.join(', '))
  process.exit(1)
}

mkdirSync(OUT_DIR, { recursive: true })
let generated = 0

const groups = new Map()
for (const file of files) {
  const relativeName = relative(MODEL_ROOT, resolve(file)).replace(/\.elkt$/, '')
  const top = relativeName.split(/[\\/]/)[0] ?? 'misc'
  if (!groups.has(top)) groups.set(top, [])
  groups.get(top).push(file)
}

for (const [top, groupFiles] of groups) {
  const blocks = []
  for (const file of groupFiles) {
    const source = readFileSync(file, 'utf8')
    const graph = parseElkt(source)
    const relativeName = relative(MODEL_ROOT, resolve(file)).replace(/\.elkt$/, '')
    const name = relativeName.replace(/[\\/]/g, '__')
    blocks.push(generateTest(name, graph))
  }
  const outFile = join(OUT_DIR, `${sanitize(top)}_batch.test.ts`)
  const header = `import { readFileSync } from 'node:fs'
import { buildLGraphFromElkJson } from '../../../shared/elkgraph-builder.ts'
import { LGraph, LNode, LPort, LEdge, NodeType } from '../../../src/index.js'
import { PortSide, PortType } from '../../../src/graph/enums.js'
import { createMergedPort } from '../../../src/graph/lgraph-util-merge.js'
import { LayeredLayoutProvider } from '../../../src/layered-layout-provider.js'
import { PORT_CONSTRAINTS as PORT_CONSTRAINTS_KEY, PORT_INDEX as PORT_INDEX_KEY, HIERARCHY_HANDLING as HIERARCHY_HANDLING_KEY, DIRECTION as DIRECTION_KEY, INSIDE_SELF_LOOPS_ACTIVATE as INSIDE_SELF_LOOPS_ACTIVATE_KEY, INSIDE_SELF_LOOPS_YO as INSIDE_SELF_LOOPS_YO_KEY, PORT_BORDER_OFFSET as PORT_BORDER_OFFSET_KEY, MERGE_EDGES as MERGE_EDGES_KEY } from '../../../src/options/layered-options.js'
import { MODEL_ORDER as MODEL_ORDER_KEY } from '../../../src/options/internal-properties.js'

// M5/mergeEdges: 每个测试块在创建边前设置 (ELK LGraphUtil.createPort 合并分支).
let __mergeEdges = false
let __defaultSide: PortSide = PortSide.EAST

/** 建边端口: mergeEdges 且非 FIXED_SIDE 时共享收集端口, 否则创建匿名端口.
 * 匿名端口按 ELK LGraphUtil.createPort 语义赋方向默认输出/输入侧 (createPort :433-462),
 * 否则自环隐式端口以 UNDEFINED 进入 SelfLoopType.fromPortSides 会抛 IllegalArgumentException.
 * merge 逐侧: 源侧用边所在图 (LCA) 的 MERGE_EDGES, 目标侧用目标节点所在图 (ELK createPort 语义). */
function mkEdgePort(node: LNode, type: PortType, merge: boolean): LPort {
  if (merge && node.getProperty(PORT_CONSTRAINTS_KEY) !== 'FIXED_SIDE') {
    return createMergedPort(node, type, __defaultSide, true, false)
  }
  const p = new LPort(); p.setNode(node)
  p.setSide(type === PortType.OUTPUT ? __defaultSide : opposedSide(__defaultSide))
  return p
}

/** 对侧 (PortSide.opposed). */
function opposedSide(side: PortSide): PortSide {
  switch (side) {
    case PortSide.NORTH: return PortSide.SOUTH
    case PortSide.SOUTH: return PortSide.NORTH
    case PortSide.EAST: return PortSide.WEST
    case PortSide.WEST: return PortSide.EAST
    default: return PortSide.UNDEFINED
  }
}

/** ELK 风格: 创建简单边 (对应 ElkGraphUtil.createSimpleEdge). 端口序号已声明时复用. */
function createSimpleEdge(src: LNode, tgt: LNode, spIdx: number | null = null, tpIdx: number | null = null, srcMerge = false, tgtMerge = false): LEdge {
  const sp = spIdx !== null && spIdx < src.getPorts().length ? src.getPorts()[spIdx]! : mkEdgePort(src, PortType.OUTPUT, srcMerge)
  const tp = tpIdx !== null && tpIdx < tgt.getPorts().length ? tgt.getPorts()[tpIdx]! : mkEdgePort(tgt, PortType.INPUT, tgtMerge)
  const e = new LEdge(); e.setSource(sp); e.setTarget(tp)
  return e
}

`
  writeFileSync(outFile, header + blocks.join('\n'))
  generated += blocks.length
  console.log(`生成 ${outFile} (${blocks.length} 图)`)
}

console.log(`\n总计: ${generated} 个图测试`)
}


/** 将 elkt 顶层算法属性 (graphProps, 短名) 应用到 LGraph — 与生成测试 graph.setProperty(...) 1:1.
 * OPT_MAP 命中才注入 (保持默认); 值经 coerceVal (去引号/类型转换).
 * B1/B4: 解析失败值跳过; 图级 minimum 字符串 → {x,y} 对象 (与节点级一致). */
function applyGraphPropsToLGraph(graph, graphProps) {
  for (const [k, v] of Object.entries(graphProps)) {
    const m = OPT_MAP[k]
    if (!m) continue
    let val = coerceVal(m, v)
    if (val === undefined) continue
    if (m.ggn === 'org.eclipse.elk.nodeSize.minimum' && typeof val === 'string') {
      const [nx, ny] = String(val).replace(/[()]/g, '').split(',').map(Number)
      val = { x: nx, y: ny }
    }
    graph.setProperty(m.ggn, val)
  }
}

export { parseElkt, OPT_MAP, coerceVal, applyGraphPropsToLGraph }
export default { parseElkt }
