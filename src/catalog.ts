export type Parameter = {
  key: string
  label: string
  min: number
  max: number
  step: number
  default: number
}

export type Generator = {
  name: string
  category: string
  kind: number
  seed: number
  tileable: boolean
  recipe: readonly [number, number, number, number]
  defaults: Record<string, number>
  parameters: Parameter[]
}

type Control = readonly [label: string, min: number, max: number, step: number, value: number]
type Profile = readonly [primary: string, ...controls: Control[]]

// Canonical p0...p5 slots keep the shader compact.  Labels are deliberately
// authored in the vocabulary of the selected generator, not exposed uniforms.
const profiles: Record<string, Profile> = {
  disc: ['Radius', ['Edge Feather', .001, .5, .001, .08], ['Roundness', .2, 3, .01, 1], ['Core Level', 0, 2, .01, 1], ['Falloff', .2, 8, .01, 2], ['Animation Rate', 0, 4, .01, .2]],
  ring: ['Radius', ['Band Width', .002, .45, .001, .07], ['Wave Count', 1, 32, 1, 8], ['Wave Depth', 0, .5, .01, .08], ['Edge Feather', .001, .3, .001, .025], ['Glow', 0, 2, .01, .8]],
  rays: ['Radius', ['Ray Count', 2, 96, 1, 16], ['Ray Sharpness', .2, 16, .1, 5], ['Radial Falloff', .1, 12, .01, 3], ['Core Size', 0, .5, .005, .08], ['Flicker', 0, 2, .01, .25]],
  shape: ['Size', ['Sides / Points', 3, 24, 1, 6], ['Edge Feather', .001, .25, .001, .025], ['Corner Roundness', 0, 1, .01, .1], ['Outline Width', 0, .4, .005, 0], ['Distortion', 0, 1, .01, 0]],
  quad: ['Fill', ['Edge Bias', 0, 1, .01, 0], ['Roundness', 0, .45, .01, 0], ['Inner Softness', .001, .4, .001, .02], ['Bevel', 0, 1, .01, 0], ['Animation Rate', 0, 4, .01, 0]],
  spiral: ['Scale', ['Arm Count', 1, 24, 1, 5], ['Twist', -20, 20, .05, 5], ['Arm Width', .01, .8, .005, .18], ['Radial Falloff', .1, 8, .01, 2], ['Turbulence', 0, 2, .01, .15]],
  grid: ['Tile Size', ['Line Width', .005, .48, .005, .1], ['Duty / Fill', .02, .98, .01, .5], ['Edge Feather', .001, .2, .001, .02], ['Jitter', 0, 1, .01, 0], ['Angle Bias', -1, 1, .01, 0]],
  dots: ['Dot Spacing', ['Dot Radius', .01, .49, .005, .18], ['Row Offset', 0, 1, .01, .5], ['Edge Feather', .001, .2, .001, .02], ['Size Jitter', 0, 1, .01, .1], ['Density', .05, 1, .01, 1]],
  lines: ['Line Spacing', ['Line Width', .005, .95, .005, .16], ['Wave Amount', 0, 2, .01, .15], ['Wave Frequency', 1, 32, .1, 7], ['Edge Feather', .001, .2, .001, .02], ['Breakup', 0, 1, .01, 0]],
  noise: ['Frequency', ['Octaves', 1, 8, 1, 5], ['Lacunarity', 1.2, 4, .01, 2], ['Gain', .1, .9, .01, .5], ['Contrast', .1, 5, .01, 1.3], ['Evolution', 0, 3, .01, .2]],
  fluid: ['Flow Scale', ['Turbulence', 0, 5, .01, 1.4], ['Iterations', 1, 8, 1, 5], ['Ridge Width', .01, .8, .01, .25], ['Contrast', .1, 5, .01, 1.5], ['Flow Speed', -3, 3, .01, .25]],
  cells: ['Cell Scale', ['Edge Width', .005, .6, .005, .08], ['Cell Jitter', 0, 1, .01, .85], ['Edge Feather', .001, .2, .001, .02], ['Cell Fill', 0, 1, .01, .45], ['Evolution', 0, 2, .01, .1]],
  digital: ['Block Scale', ['Threshold', 0, 1, .01, .5], ['Block Length', 1, 32, 1, 6], ['Displacement', 0, 2, .01, .35], ['Signal Noise', 0, 1, .01, .2], ['Animation Rate', 0, 8, .01, 1]],
  beam: ['Beam Width', ['Core Width', .001, .5, .001, .035], ['Glow Falloff', .1, 16, .1, 4], ['Pulse Frequency', 0, 32, .1, 4], ['Noise Amount', 0, 1, .01, .08], ['Intensity', 0, 3, .01, 1]],
}

const tileableProfiles = new Set(['grid', 'dots', 'lines', 'noise', 'fluid', 'cells', 'digital'])
const compactProfiles = new Set(['disc', 'ring', 'rays', 'shape', 'quad'])

function profileFor(name: string) {
  if (name === 'Quad') return 'quad'
  if (/Ring|Halo|Ripple|Concentric/.test(name)) return 'ring'
  if (/Burst|Ray|Flare|Spark|Sun|Flash|Lightning|Electric/.test(name)) return 'rays'
  if (/Circle|Vignette|Glow|Crescent|MetaBalls|Bokeh/.test(name)) return 'disc'
  if (/Spiral|Swirl|Twirl|Portal|Wormhole|Kaleido/.test(name)) return 'spiral'
  if (/Star|Polygon|Rectangle|Flower|Bevel|Pyramid|Crack|Crystal/.test(name)) return 'shape'
  if (/Dot|Halftone/.test(name)) return 'dots'
  if (/Grid|Checker|Tiles|Matrix|Bricks|Weave|Fabric|Crosshatch/.test(name)) return 'grid'
  if (/Line|Stripe|Scanline|Zigzag|Squiggle|Gradation|Sweep/.test(name)) return 'lines'
  if (/Voronoi|Cell|Mosaic/.test(name)) return 'cells'
  if (/Glitch|Cyber|Pixel|Block|Laser/.test(name)) return name === 'LaserBeam' ? 'beam' : 'digital'
  if (/Fluid|Smoke|Water|Lava|Plasma|Marble|Fire|Cloud|Caustic|Aurora|Toxic|Flow|Energy/.test(name)) return 'fluid'
  return 'noise'
}

function hashName(name: string) {
  let h = 2166136261
  for (const c of name) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return h >>> 0
}

const inventory: readonly [category: string, names: readonly string[]][] = [
  ['Radial', ['Circle', 'Vignette', 'LensFlare', 'Sun', 'Ring', 'Crescent', 'Flash', 'Halo', 'Ripple', 'Concentric', 'MetaBalls', 'WaveRing']],
  ['Shapes & Bursts', ['Star', 'Polygon', 'HexGridRadial', 'Rectangle', 'Quad', 'Checker', 'Spark', 'Flare', 'Cross', 'Burst', 'RadialLines', 'Swirl', 'GodRay', 'Flower', 'Spiral', 'Energy', 'Crack', 'Bokeh', 'Shimmer', 'Speckle']],
  ['Patterns', ['CrossGrid', 'SquareGrid', 'PyramidPattern', 'RandomTiles', 'Dots', 'DotMatrix', 'Zigzag', 'Crosshatch', 'TriGrid', 'Bricks', 'Scanline', 'FlowLines', 'Fabric', 'PolarDots', 'Weave', 'Halftone', 'SweepGradient', 'GradationLinear', 'BevelSquare']],
  ['Noise & Organic', ['Grain', 'PerlinNoise', 'FbmNoise', 'DistortionWave', 'StripeNoise', 'ToxicCloud', 'GeoRelief', 'Smoke', 'WaterTurbulence', 'Electric', 'Lava', 'Wrinkle', 'Crystal', 'AbsNoise', 'FractalCamo', 'Squiggles', 'Grunge', 'CellularEdge', 'Twirl', 'CosmicPortal', 'Wormhole', 'Plasma', 'MarbleNoise', 'Fire', 'Cloud', 'Caustics', 'Aurora']],
  ['Digital & Utility', ['PixelNoise', 'AnalogGlitch', 'CyberBlock', 'Mosaic', 'LaserBeam', 'GlitchBlock', 'VoronoiCell', 'Matrix', 'Wood', 'Cell', 'Lightning', 'Kaleido']],
]

export const catalog: Generator[] = inventory.flatMap(([group, names], family) => names.map((name, local) => {
  const index = inventory.slice(0, family).reduce((sum, [, list]) => sum + list.length, 0) + local
  const seed = hashName(name)
  const profileName = profileFor(name)
  const [primary, ...controls] = profiles[profileName]
  const compact = compactProfiles.has(profileName)
  const scaleDefault = profileName === 'quad' ? 1 : compact ? .18 + (index % 7) * .025 : 2.5 + (index % 9) * .45
  const parameters: Parameter[] = [
    { key: 'p0', label: `${name} ${primary}`, min: profileName === 'quad' ? 0 : .05, max: profileName === 'quad' ? 1 : compact ? .8 : 16, step: .01, default: scaleDefault },
    ...controls.map(([label, min, max, step, value], slot) => ({
      key: `p${slot + 1}`,
      label,
      min,
      max,
      step,
      default: Math.min(max, Math.max(min, value + ((index * (slot + 3)) % 5 - 2) * step)),
    })),
  ]
  return {
    name,
    category: group,
    kind: index,
    seed,
    tileable: tileableProfiles.has(profileName),
    recipe: [family, local, Object.keys(profiles).indexOf(profileName), (index * 7 + family * 3) % 17],
    parameters,
    defaults: Object.fromEntries(parameters.map((p) => [p.key, p.default])),
  }
}))

export const categories = [...new Set(catalog.map((item) => item.category))]

const aliases: Record<string, string> = {
  SolarGlow: 'Sun', EnergyRing: 'Ring', AuraRing: 'Ring', Pulse: 'Concentric',
  WaveRingSine: 'WaveRing', WaveRingNoisy: 'WaveRing', WaveRingSquare: 'WaveRing', WaveRingDouble: 'WaveRing',
  GradientChecker: 'Checker', RoundChecker: 'Checker', DiamondChecker: 'Checker',
  SquareGridDash: 'SquareGrid', SquareGridPolka: 'Dots',
  Glare: 'Spark', StarFlare: 'Flare', RayBurst: 'Burst', StarBurst: 'Burst', SparkBurst: 'Burst',
  ImpactLines: 'RadialLines', SpiralV2: 'Spiral', GrungeV2: 'Grunge', PlasmaV2: 'Plasma',
  VoronoiFluid: 'VoronoiCell', VoronoiNoise: 'VoronoiCell', Flame: 'Fire',
  GradationReflect: 'GradationLinear', GradationRepeat: 'GradationLinear',
  SimplexNoise: 'PerlinNoise', SymmetricNoise: 'PerlinNoise',
}

export const resolveGenerator = (name: string) =>
  catalog.find((item) => item.name === name) ?? catalog.find((item) => item.name === aliases[name])
