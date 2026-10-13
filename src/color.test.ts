import { describe, expect, it } from 'vitest'
import { parseHexColor } from './renderer'

describe('gradient color parsing', () => {
  it('treats short preset colors as their six-digit equivalents', () => {
    expect(parseHexColor('#fff')).toEqual([1, 1, 1])
    expect(parseHexColor('#777')).toEqual(parseHexColor('#777777'))
    expect(parseHexColor('#f80')).toEqual(parseHexColor('#ff8800'))
  })

  it('preserves RGB channel order and defaults malformed colors to white', () => {
    expect(parseHexColor('#ff0000')).toEqual([1, 0, 0])
    expect(parseHexColor('#00ff00')).toEqual([0, 1, 0])
    expect(parseHexColor('invalid')).toEqual([1, 1, 1])
  })
})
