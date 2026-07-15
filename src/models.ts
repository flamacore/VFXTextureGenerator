import type { Generator } from './catalog'

export type BlendMode = 'Normal' | 'Add' | 'Multiply' | 'Screen' | 'Mask'
export type GradientStop = { id: string; position: number; color: string }
export type PostSettings = Record<
  'blur' | 'bloom' | 'sharpen' | 'pixelation' | 'chromatic' | 'vignette' |
  'scanlines' | 'kaleidoscope' | 'mirror' | 'swirl' | 'edge' | 'toon' |
  'colorMap' | 'vignetteMask',
  number
>

export type Layer = {
  id: string
  name: string
  generator: Generator
  visible: boolean
  opacity: number
  blend: BlendMode
  seed: number
  params: Record<string, number>
  transform: { x: number; y: number; rotation: number; scale: number; scrollX: number; scrollY: number }
  polar: boolean
  invert: boolean
  solid: boolean
  solidColor: string
  speed: number
}

export const defaultPost: PostSettings = {
  blur: 0, bloom: 0, sharpen: 0, pixelation: 0, chromatic: 0, vignette: 0,
  scanlines: 0, kaleidoscope: 0, mirror: 0, swirl: 0, edge: 0, toon: 0,
  colorMap: 0, vignetteMask: 0,
}

export function makeLayer(generator: Generator): Layer {
  return {
    id: crypto.randomUUID(),
    name: generator.name,
    generator,
    visible: true,
    opacity: 1,
    blend: 'Normal',
    seed: generator.seed % 10000,
    params: { ...generator.defaults },
    transform: { x: 0, y: 0, rotation: 0, scale: 1, scrollX: 0, scrollY: 0 },
    polar: false,
    invert: false,
    solid: false,
    solidColor: '#ffffff',
    speed: 0.2,
  }
}
