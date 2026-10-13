import { describe, expect, it } from 'vitest'
import { catalog, categories, resolveGenerator, legacyAliases } from './catalog'
import { defaultPost, makeLayer, normalizeTransform } from './models'

describe('generator catalog', () => {
  it('contains 28 distinct algorithms and resolves all legacy presets', () => {
    expect(catalog).toHaveLength(28)
    expect(new Set(catalog.map(g => g.name)).size).toBe(catalog.length)
    expect(new Set(catalog.map(g => g.recipe[2])).size).toBe(catalog.length)
    expect(categories).toHaveLength(5)
    for (const name of Object.keys(legacyAliases)) expect(resolveGenerator(name)).toBeDefined()
    expect(resolveGenerator('WaveRingSine')?.name).toBe('Ring')
    expect(resolveGenerator('PerlinNoise')?.name).toBe('FractalNoise')
    expect(resolveGenerator('Crystal')?.name).toBe('Crystal')
  })

  it('exposes only valid authored controls and capabilities', () => {
    for (const generator of catalog) {
      expect(generator.description.length).toBeGreaterThan(20)
      expect(generator.parameters.length).toBeGreaterThanOrEqual(3)
      expect(generator.parameters.length).toBeLessThanOrEqual(6)
      for (const parameter of generator.parameters) {
        expect(parameter.min).toBeLessThan(parameter.max)
        expect(parameter.default).toBeGreaterThanOrEqual(parameter.min)
        expect(parameter.default).toBeLessThanOrEqual(parameter.max)
        expect(generator.defaults[parameter.key]).toBe(parameter.default)
      }
    }
    expect(resolveGenerator('Checker')?.tileable).toBe(true)
    expect(resolveGenerator('Fire')?.tileable).toBe(false)
    expect(resolveGenerator('Star')?.seeded).toBe(false)
  })

  it('creates independent serializable layers', () => {
    const first = makeLayer(catalog[0])
    const second = makeLayer(catalog[0])
    expect(first.id).not.toBe(second.id)
    first.params.scale = 99
    expect(second.params.scale).not.toBe(99)
    expect(first.seamless).toBe(false)
    expect(first.transform.u).toBe(0)
    expect(first.transform.uvRepeat).toBe(true)
    expect(first.transform.corners).toHaveLength(4)
    expect(structuredClone(first)).toEqual(first)
  })

  it('keeps UV wrapping unless Repeat UV is turned off', () => {
    expect(normalizeTransform(undefined).uvRepeat).toBe(true)
    expect(normalizeTransform({ u: 0.25 }).uvRepeat).toBe(true)
    expect(normalizeTransform({ uvRepeat: false }).uvRepeat).toBe(false)
  })

  it('keeps every post-processing control normalized', () => {
    expect(Object.keys(defaultPost)).toHaveLength(14)
    expect(Object.values(defaultPost).every((value) => value >= 0 && value <= 1)).toBe(true)
  })
})
