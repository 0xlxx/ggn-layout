/** CMGroupModelOrderCalculator (对应 ELK preserveorder.CMGroupModelOrderCalculator). */
import type { LGraphElement } from '../../graph/lshape.js'
import type { LGraph } from '../../graph/lgraph.js'
import { MODEL_ORDER } from '../../options/internal-properties.js'
import {
  CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CM_GROUP_ORDER_STRATEGY,
  CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CM_ENFORCED_GROUP_ORDERS,
  CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CROSSING_MINIMIZATION_ID,
  GroupOrderStrategy,
} from '../../options/layered-options.js'

export function calculateModelOrderOrGroupModelOrder(
  element: LGraphElement, other: LGraphElement, parent: LGraph, offset: number): number {
  const enforceGroupModelOrder = parent.getProperty(CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CM_GROUP_ORDER_STRATEGY) === GroupOrderStrategy.ENFORCED
  const enforcedOrders = parent.getProperty(CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CM_ENFORCED_GROUP_ORDERS)
  if (!element.hasProperty(MODEL_ORDER)) {
    return -1
  } else if (enforceGroupModelOrder) {
    if (enforcedOrders.includes(element.getProperty(CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CROSSING_MINIMIZATION_ID)!)
      && enforcedOrders.includes(other.getProperty(CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CROSSING_MINIMIZATION_ID)!)) {
      return offset * (element.getProperty(CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CROSSING_MINIMIZATION_ID) ?? 0)
        + element.getProperty(MODEL_ORDER)
    }
  } else {
    return element.getProperty(MODEL_ORDER)
  }
  return element.getProperty(MODEL_ORDER)
}
