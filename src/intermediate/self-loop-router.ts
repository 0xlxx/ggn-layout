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
 * SelfLoopRouter (对应 ELK intermediate.SelfLoopRouter).
 * P4 前: RoutingDirector → LabelPlacer → RoutingSlotAssigner → routeSelfLoops (扩展 margin).
 */
import type { LGraph } from '../graph/lgraph.js'
import { NodeType } from '../graph/enums.js'
import { EDGE_ROUTING } from '../options/layered-options.js'
import { SELF_LOOP_HOLDER as SELF_LOOP_HOLDER_PROP } from '../options/internal-properties.js'
import { placeSelfLoopLabels } from './loops/routing/label-placer.js'
import { OrthogonalSelfLoopRouter } from './loops/routing/orthogonal-self-loop-router.js'
import { PolylineSelfLoopRouter } from './loops/routing/polyline-self-loop-router.js'
import { RoutingDirector } from './loops/routing/routing-director.js'
import { SplineSelfLoopRouter } from './loops/routing/spline-self-loop-router.js'
import { RoutingSlotAssigner } from './loops/routing/routing-slot-assigner.js'
import type { SelfLoopHolder } from './loops/self-loop-holder.js'

/** ELK SelfLoopRouter.routerForGraph (SelfLoopRouter.java:70-82): POLYLINE→Polyline, SPLINES→Spline, 其余→Orthogonal. */
function routerForGraph(graph: LGraph): OrthogonalSelfLoopRouter {
  switch (graph.getProperty(EDGE_ROUTING)) {
    case 'POLYLINE': return new PolylineSelfLoopRouter()
    case 'SPLINES': return new SplineSelfLoopRouter()
    default: return new OrthogonalSelfLoopRouter()
  }
}

export function processSelfLoopRouter(graph: LGraph): void {
  const routingDirector = new RoutingDirector()
  const routingSlotAssigner = new RoutingSlotAssigner()
  // ELK SelfLoopRouter.routerForGraph (SelfLoopRouter.java:70-82): 按 edgeRouting 选择自环路由.
  const router = routerForGraph(graph)

  for (const layer of graph.getLayers()) {
    for (const lNode of layer.getNodes()) {
      if (lNode.getType() !== NodeType.NORMAL) continue
      const slHolder = lNode.getProperty(SELF_LOOP_HOLDER_PROP) as SelfLoopHolder | null
      if (slHolder === null || slHolder === undefined) continue
      processNode(slHolder, router, routingDirector, routingSlotAssigner)
    }
  }
}

function processNode(slHolder: SelfLoopHolder, slRouter: OrthogonalSelfLoopRouter,
  routingDirector: RoutingDirector, routingSlotAssigner: RoutingSlotAssigner): void {
  routingDirector.determineLoopRoutes(slHolder)
  placeSelfLoopLabels(slHolder)
  routingSlotAssigner.assignRoutingSlots(slHolder)
  slRouter.routeSelfLoops(slHolder)
}
