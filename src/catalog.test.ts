import { describe, expect, it } from 'vitest'
import { catalog, categories } from './catalog'
import { defaultPost, makeLayer } from './models'

describe('generator catalog', () => {
  it('contains the complete unique compatibility inventory', () => {
    expect(catalog).toHaveLength(117)
    expect(new Set(catalog.map((generator) => generator.name)).size).toBe(117)
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
  })

  it('creates independent serializable layers', () => {
    const first = makeLayer(catalog[0])
    const second = makeLayer(catalog[0])
    expect(first.id).not.toBe(second.id)
    first.params.scale = 99
    expect(second.params.scale).not.toBe(99)
    expect(first.seamless).toBe(false)
    expect(structuredClone(first)).toEqual(first)
  })

  it('keeps every post-processing control normalized', () => {
    expect(Object.keys(defaultPost)).toHaveLength(14)
    expect(Object.values(defaultPost).every((value) => value >= 0 && value <= 1)).toBe(true)
  })
})
