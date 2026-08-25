import { describe, expect, it } from 'vitest'
import { fragmentShaderForProfile } from './renderer'

describe('specialized generator shaders', () => {
  it('builds a complete shader for every profile', () => {
    for (let profile = 0; profile < 13; profile++) {
      const source = fragmentShaderForProfile(profile)
      expect(source).toContain('#version 300 es')
      expect(source).toContain('float pattern(vec2 q)')
      expect(source).toContain('void main()')
    }
  })

  it('keeps heavy noise and cell loops out of simple radial profiles', () => {
    const disc = fragmentShaderForProfile(0)
    const ring = fragmentShaderForProfile(1)
    expect(disc).toContain('if(kind==1)')
    expect(disc).not.toContain('periodicFbm')
    expect(disc).not.toContain('for(int j=0;j<5;j++)')
    expect(ring).not.toContain('periodicFbm')
    expect(ring).not.toContain('vec2 cell(')
    expect(fragmentShaderForProfile(8)).toContain('periodicFbm')
    expect(fragmentShaderForProfile(9)).toContain('for(int j=0;j<5;j++)')
    expect(fragmentShaderForProfile(10)).toContain('vec2 cell(')
  })
})
