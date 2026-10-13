import { describe, expect, it } from 'vitest'
import { defaultTransform, normalizeTransform } from './models'

describe('imported transform normalization', () => {
  it('prevents zero-scale division and clamps values to editable ranges', () => {
    const transform = normalizeTransform({ scale: 0, x: -9, y: 8, rotation: 360, u: 3, v: -3, scrollX: 9, scrollY: -9, feather: 2, roundness: -1 })
    expect(transform).toMatchObject({ scale: .1, x: -1, y: 1, rotation: 180, u: 1, v: -1, scrollX: 2, scrollY: -2, feather: .35, roundness: 0 })
    expect(normalizeTransform({ scale: 900 }).scale).toBe(4)
  })

  it('restores non-finite scalars and bounds imported corners', () => {
    const transform = normalizeTransform({ scale: NaN, rotation: Infinity, corners: [{ x: -9, y: 9 }, { x: NaN, y: Infinity }, { x: .8, y: .9 }, { x: 0, y: 1 }] })
    expect(transform.scale).toBe(defaultTransform().scale)
    expect(transform.rotation).toBe(0)
    expect(transform.corners[0]).toEqual({ x: -.25, y: 1.25 })
    expect(transform.corners[1]).toEqual({ x: 1, y: 0 })
    expect(transform.corners[2]).toEqual({ x: .8, y: .9 })
  })

  it('preserves valid transforms without mutating input', () => {
    const original = { ...defaultTransform(), scale: 2, rotation: -90, uvRepeat: false }
    const restored = normalizeTransform(original)
    expect(restored).toEqual(original)
    expect(restored.corners).not.toBe(original.corners)
  })
})
