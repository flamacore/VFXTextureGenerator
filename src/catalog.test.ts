import { describe, expect, it } from 'vitest'
import { catalog, categories, resolveGenerator } from './catalog'
import { defaultPost, makeLayer, normalizeTransform } from './models'

describe('generator catalog', () => {
  it('contains a unique condensed generator inventory', () => {
    expect(catalog).toHaveLength(90)
    expect(new Set(catalog.map((generator) => generator.name)).size).toBe(90)
    expect(catalog.some((generator) => generator.name === 'Quad')).toBe(true)
    expect(catalog.some((generator) => generator.name === 'WaveRing')).toBe(true)
    expect(catalog.some((generator) => generator.name === 'WaveRingSine')).toBe(false)
    expect(resolveGenerator('WaveRingSine')?.name).toBe('WaveRing')
    expect(resolveGenerator('EnergyRing')?.name).toBe('Ring')
    expect(categories.length).toBeGreaterThanOrEqual(5)
  })

  it('defines valid parameter bounds and defaults', () => {
    for (const generator of catalog) {
      expect(generator.parameters).toHaveLength(6)
      for (const parameter of generator.parameters) {
        expect(parameter.min).toBeLessThan(parameter.max)
        expect(parameter.default).toBeGreaterThanOrEqual(parameter.min)
        expect(parameter.default).toBeLessThanOrEqual(parameter.max)
        expect(generator.defaults[parameter.key]).toBe(parameter.default)
      }
    }
  })

  it('assigns every generator an independent schema and recipe', () => {
    const schemas = catalog.map((generator) => generator.parameters.map((parameter) => parameter.label).join('|'))
    const recipes = catalog.map((generator) => generator.recipe.join(','))
    expect(new Set(schemas).size).toBe(catalog.length)
    expect(new Set(recipes).size).toBe(catalog.length)
    expect(catalog.every((generator) => generator.parameters[0].label.startsWith(generator.name))).toBe(true)
  })

  it('exposes seamless tiling only for periodic generator profiles', () => {
    const byName = (name: string) => catalog.find((generator) => generator.name === name)!
    expect(byName('Checker').tileable).toBe(true)
    expect(byName('PerlinNoise').tileable).toBe(true)
    expect(byName('VoronoiCell').tileable).toBe(true)
    expect(byName('Circle').tileable).toBe(false)
    expect(byName('LaserBeam').tileable).toBe(false)
    expect(byName('Quad').tileable).toBe(false)
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
