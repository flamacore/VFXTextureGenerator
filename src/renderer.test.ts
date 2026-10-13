import { describe, expect, it } from 'vitest'
import { fragmentShaderForProfile, PROFILE_COUNT } from './renderer'

describe('specialized generator shaders', () => {
  it('builds a complete shader for every profile', () => {
    for (let profile = 0; profile < PROFILE_COUNT; profile++) {
      const source = fragmentShaderForProfile(profile)
      expect(source).toContain('#version 300 es')
      expect(source).toContain('float pattern(vec2 q)')
      expect(source).toContain('void main()')
      expect(source).toContain('invBilinear')
      expect(source).toContain('uvOffset')
      expect(source).toContain('uvRepeatMode')
      expect(source).toContain('clamp(st,0.,1.)')
      expect(source).toContain('lineSD')
    }
  })

  it('keeps every explicit algorithm distinct without recipe-dependent disguises', () => {
    const sources = Array.from({ length: PROFILE_COUNT }, (_, i) => fragmentShaderForProfile(i))
    expect(new Set(sources).size).toBe(PROFILE_COUNT)
    expect(sources[0]).not.toContain('periodicFbm')
    expect(sources[3]).toContain('polygon(q,p1')
    expect(sources[14]).toContain('vec2 v0=vec2(p0,0.)')
    expect(sources[15]).toContain('float facet=')
    expect(sources[16]).toContain('float tongues=')
  })
})
