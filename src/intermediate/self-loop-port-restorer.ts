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
 * SelfLoopPortRestorer (对应 ELK intermediate.SelfLoopPortRestorer).
 * P3 后 P4 前: 恢复隐藏的自环端口 (分配侧 + 恢复顺序 + 计算自环类型).
 *
 * 与 ELK Java 0.12.0 SelfLoopPortRestorer.java:52-74 同构:
 *  - 隐藏端口 + UNDEFINED/FREE → PortSideAssigner 分配侧, 然后 fallthrough 恢复
 *  - 隐藏端口 + FIXED_SIDE → 端口侧已在导入期 (LGraphUtil.createPort) 确定, 直接计算类型 + 恢复
 *  - 未隐藏端口 → 只计算自环类型, 绝不改动端口侧 (Java else 分支 :66-69)
 */
import type { LGraph } from '../graph/lgraph.js'
import { NodeType } from '../graph/enums.js'
import { ORIGINAL_PORT_CONSTRAINTS, SELF_LOOP_HOLDER } from '../options/internal-properties.js'
import { PortRestorer } from './loops/ordering/port-restorer.js'
import { PortSideAssigner } from './loops/ordering/port-side-assigner.js'
import type { SelfLoopHolder } from './loops/self-loop-holder.js'

export class SelfLoopPortRestorer {
  private readonly portSideAssigner = new PortSideAssigner()
  private readonly portRestorer = new PortRestorer()

  process(graph: LGraph): void {
    for (const layer of graph.getLayers()) {
      for (const lNode of layer.getNodes()) {
        if (lNode.getType() !== NodeType.NORMAL) continue
        const slHolder = lNode.getProperty(SELF_LOOP_HOLDER) as SelfLoopHolder | null
        if (slHolder === null || slHolder === undefined) continue
        this.processNode(slHolder)
      }
    }
  }

  private processNode(slHolder: SelfLoopHolder): void {
    if (process.env.GGN_SLR_DBG) console.error(`[SLR] node=${slHolder.getLNode().id} hidden=${slHolder.arePortsHiddenFlag()} ports=${slHolder.getLNode().getPorts().map(p => `${p.id}:${p.getSide()}`).join(',')}`)
    if (slHolder.arePortsHiddenFlag()) {
      const original = slHolder.getLNode().getProperty<string>(ORIGINAL_PORT_CONSTRAINTS)

      switch (original) {
        case 'UNDEFINED':
        case 'FREE':
          // 先分配端口侧, 再 fallthrough 恢复端口 (SelfLoopPortRestorer.java:56-58)
          this.portSideAssigner.assignPortSides(slHolder)
        // fallthrough
        case 'FIXED_SIDE':
          // FIXED_SIDE: 端口侧在导入期已确定, 无需再赋 (SelfLoopPortRestorer.java:58-60)
          this.computeSelfLoopTypes(slHolder)
          this.portRestorer.restorePorts(slHolder)
          break
        default:
          // Java: assert false (默认 JVM 静默); ggn 抛错为更严防御 (SelfLoopPortRestorer.java:61-63)
          throw new Error('Unexpected port constraints')
      }
    } else {
      // 未隐藏端口: 只计算自环类型, 不改端口侧 (SelfLoopPortRestorer.java:66-69)
      this.computeSelfLoopTypes(slHolder)
    }
  }

  private computeSelfLoopTypes(slHolder: SelfLoopHolder): void {
    for (const slLoop of slHolder.getSLHyperLoops()) {
      slLoop.computePortsPerSide()
    }
  }
}
