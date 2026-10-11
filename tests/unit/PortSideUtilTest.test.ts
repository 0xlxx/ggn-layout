/**
 * port-side-util (ELK PortSide 辅助) 语义单元测试.
 * SSOT: ELK Java 0.12.0 PortSide.ordinal/right/left/opposed.
 */
import { describe, expect, it } from 'vitest'
import { PortSide } from '../../src/index.js'
import {
  portSideOrdinal, portSideRight, portSideLeft, portSideOpposed, PORT_SIDE_COUNT,
} from '../../src/intermediate/loops/port-side-util.js'

describe('port-side-util (ELK Java 移植)', () => {
  it('portSideOrdinal: NORTH=0 EAST=1 SOUTH=2 WEST=3 UNDEFINED=4', () => {
    expect(portSideOrdinal(PortSide.NORTH)).toBe(0)
    expect(portSideOrdinal(PortSide.EAST)).toBe(1)
    expect(portSideOrdinal(PortSide.SOUTH)).toBe(2)
    expect(portSideOrdinal(PortSide.WEST)).toBe(3)
    expect(portSideOrdinal(PortSide.UNDEFINED)).toBe(4)
    expect(PORT_SIDE_COUNT).toBe(5)
  })

  it('portSideRight: 顺时针', () => {
    expect(portSideRight(PortSide.NORTH)).toBe(PortSide.EAST)
    expect(portSideRight(PortSide.EAST)).toBe(PortSide.SOUTH)
    expect(portSideRight(PortSide.SOUTH)).toBe(PortSide.WEST)
    expect(portSideRight(PortSide.WEST)).toBe(PortSide.NORTH)
    expect(portSideRight(PortSide.UNDEFINED)).toBe(PortSide.UNDEFINED)
  })

  it('portSideLeft: 逆时针', () => {
    expect(portSideLeft(PortSide.NORTH)).toBe(PortSide.WEST)
    expect(portSideLeft(PortSide.WEST)).toBe(PortSide.SOUTH)
    expect(portSideLeft(PortSide.SOUTH)).toBe(PortSide.EAST)
    expect(portSideLeft(PortSide.EAST)).toBe(PortSide.NORTH)
    expect(portSideLeft(PortSide.UNDEFINED)).toBe(PortSide.UNDEFINED)
  })

  it('portSideOpposed: 对侧', () => {
    expect(portSideOpposed(PortSide.NORTH)).toBe(PortSide.SOUTH)
    expect(portSideOpposed(PortSide.SOUTH)).toBe(PortSide.NORTH)
    expect(portSideOpposed(PortSide.EAST)).toBe(PortSide.WEST)
    expect(portSideOpposed(PortSide.WEST)).toBe(PortSide.EAST)
    expect(portSideOpposed(PortSide.UNDEFINED)).toBe(PortSide.UNDEFINED)
  })
})
