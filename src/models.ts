import type { Generator } from './catalog'

export type BlendMode = 'Normal' | 'Add' | 'Multiply' | 'Screen' | 'Mask'
export type GradientStop = { id: string; position: number; color: string }
export type Point = { x: number; y: number }
export type Corners = readonly [Point, Point, Point, Point]
export type Transform = {
  x: number
  y: number
  rotation: number
  scale: number
  scrollX: number
  scrollY: number
  u: number
  v: number
  uvRepeat: boolean
  feather: number
  roundness: number
  corners: Corners
}
export type TransformScalar = Exclude<keyof Transform, 'corners' | 'uvRepeat'>
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
  transform: Transform
  polar: boolean
  invert: boolean
  solid: boolean
  solidColor: string
  seamless: boolean
  speed: number
}

export const identityCorners: Corners = [
  { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 },
]

const cloneCorners = (corners: Corners = identityCorners): Corners =>
  corners.map((point) => ({ x: point.x, y: point.y })) as unknown as Corners

const asPoint = (value: unknown, fallback: Point): Point => {
  const point = value as Partial<Point> | undefined
  const x = Number(point?.x), y = Number(point?.y)
  return { x: Number.isFinite(x) ? x : fallback.x, y: Number.isFinite(y) ? y : fallback.y }
}

export const withCorner = (corners: Corners, index: number, point: Point): Corners =>
  corners.map((item, i) => i === index ? point : item) as unknown as Corners

export const defaultTransform = (): Transform => ({
  x: 0, y: 0, rotation: 0, scale: 1, scrollX: 0, scrollY: 0,
  u: 0, v: 0, uvRepeat: true, feather: 0, roundness: 0,
  corners: cloneCorners(),
})

export const normalizeTransform = (value?: Partial<Transform> | null): Transform => {
  const base = defaultTransform()
  const incoming = value ?? {}
  const corners = Array.isArray(incoming.corners)
    ? identityCorners.map((fallback, index) => asPoint(incoming.corners![index], fallback)) as unknown as Corners
    : cloneCorners()
  const number = (key: TransformScalar, fallback: number) => {
    const next = Number(incoming[key])
    return Number.isFinite(next) ? next : fallback
  }
  return {
    x: number('x', base.x), y: number('y', base.y),
    rotation: number('rotation', base.rotation), scale: number('scale', base.scale),
    scrollX: number('scrollX', base.scrollX), scrollY: number('scrollY', base.scrollY),
    u: number('u', base.u), v: number('v', base.v),
    uvRepeat: incoming.uvRepeat !== false,
    feather: number('feather', base.feather), roundness: number('roundness', base.roundness),
    corners,
  }
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
    transform: defaultTransform(),
    polar: false,
    invert: false,
    solid: false,
    solidColor: '#ffffff',
    seamless: false,
    speed: 0.2,
  }
}
