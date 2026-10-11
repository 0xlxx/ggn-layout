/**
 * 移植自 ELK Java: intermediate/loops/routing/PolylineSelfLoopRouterTest.java
 */
import { describe, expect, it } from 'vitest'
import type { KVector } from '../../src/index.js'
import { kvector } from '../../src/graph/enums.js'
import { cutPolylineCorners } from '../../src/intermediate/loops/routing/polyline-self-loop-router.js'

describe('PolylineSelfLoopRouter (ELK Java 移植)', () => {
  it('testUsualCase', () => {
    
    const input: KVector[] = [
      kvector(0, 0), kvector(100, 0), kvector(100, 100), kvector(-100, 100), kvector(-100, -100), kvector(0, -100),
    ]
    const expected: KVector[] = [
      kvector(90, 0), kvector(100, 10), kvector(100, 90), kvector(90, 100),
      kvector(-90, 100), kvector(-100, 90), kvector(-100, -90), kvector(-90, -100),
    ]
    expect(cutPolylineCorners(input, 10)).toEqual(expected)
  })

  it('testSmallerDistance', () => {
    
    const input: KVector[] = [
      kvector(0, 0), kvector(100, 0), kvector(100, 100), kvector(-100, 100), kvector(-100, -100), kvector(0, -100),
    ]
    const expected: KVector[] = [
      kvector(50, 0), kvector(100, 50), kvector(100, 50), kvector(50, 100),
      kvector(-20, 100), kvector(-100, 20), kvector(-100, -50), kvector(-50, -100),
    ]
    expect(cutPolylineCorners(input, 80)).toEqual(expected)
  })
})
