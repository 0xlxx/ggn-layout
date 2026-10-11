/**
 * SelfLoopType (对应 ELK intermediate.loops.SelfLoopType).
 */
import { PortSide } from '../../graph/enums.js'

export enum SelfLoopType {
  ONE_SIDE = 'ONE_SIDE',
  TWO_SIDES_CORNER = 'TWO_SIDES_CORNER',
  TWO_SIDES_OPPOSING = 'TWO_SIDES_OPPOSING',
  THREE_SIDES = 'THREE_SIDES',
  FOUR_SIDES = 'FOUR_SIDES',
}

/**
 * 与 ELK SelfLoopType.fromPortSides 同构:
 *  - 含 UNDEFINED → throw IllegalArgumentException (SelfLoopType.java:31-34)
 *  - size 非法 (0 或 >4) → 返回 null (SelfLoopType.java:52-54 default)
 */
export function selfLoopTypeFromPortSides(portSides: Set<PortSide>): SelfLoopType | null {
  if (portSides.has(PortSide.UNDEFINED)) {
    throw new Error('Port sides must not contain UNDEFINED')
  }
  switch (portSides.size) {
    case 1: return SelfLoopType.ONE_SIDE
    case 2: {
      const eastWest = portSides.has(PortSide.EAST) && portSides.has(PortSide.WEST)
      const northSouth = portSides.has(PortSide.NORTH) && portSides.has(PortSide.SOUTH)
      return eastWest || northSouth ? SelfLoopType.TWO_SIDES_OPPOSING : SelfLoopType.TWO_SIDES_CORNER
    }
    case 3: return SelfLoopType.THREE_SIDES
    case 4: return SelfLoopType.FOUR_SIDES
    default: return null
  }
}
