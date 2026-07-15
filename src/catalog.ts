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
  recipe: readonly [number, number, number, number]
  defaults: Record<string, number>
  parameters: Parameter[]
}

const names = `Circle,Vignette,LensFlare,Sun,SolarGlow,Ring,Crescent,Flash,EnergyRing,AuraRing,Halo,Ripple,Concentric,Pulse,MetaBalls,WaveRingSine,WaveRingNoisy,WaveRingSquare,WaveRingDouble,Star,Polygon,HexGridRadial,Rectangle,Checker,GradientChecker,RoundChecker,DiamondChecker,Spark,Flare,Cross,Glare,StarFlare,RayBurst,Burst,ImpactLines,RadialLines,SpiralV2,Swirl,GodRay,StarBurst,Flower,Spiral,Energy,Crack,Bokeh,Shimmer,VoronoiFluid,Speckle,CrossGrid,SquareGrid,PyramidPattern,RandomTiles,SquareGridDash,Dots,SquareGridPolka,DotMatrix,Zigzag,Crosshatch,TriGrid,Bricks,Scanline,FlowLines,Fabric,PolarDots,Weave,Halftone,SweepGradient,GradationLinear,GradationReflect,GradationRepeat,BevelSquare,Grain,PerlinNoise,FbmNoise,DistortionWave,StripeNoise,ToxicCloud,GeoRelief,Smoke,WaterTurbulence,Electric,SimplexNoise,Lava,Wrinkle,Crystal,AbsNoise,FractalCamo,PlasmaV2,Squiggles,Grunge,GrungeV2,CellularEdge,Twirl,CosmicPortal,Wormhole,Plasma,MarbleNoise,Fire,Cloud,Caustics,Aurora,Flame,PixelNoise,AnalogGlitch,CyberBlock,Mosaic,LaserBeam,GlitchBlock,VoronoiCell,Matrix,Wood,SparkBurst,VoronoiNoise,Cell,Lightning,Kaleido,SymmetricNoise`.split(',')

type Control = readonly [label: string, min: number, max: number, step: number, value: number]
type Profile = readonly [primary: string, ...controls: Control[]]

// Canonical p0...p5 slots keep the shader compact.  Labels are deliberately
// authored in the vocabulary of the selected generator, not exposed uniforms.
const profiles: Record<string, Profile> = {
  disc: ['Radius', ['Edge Feather', .001, .5, .001, .08], ['Roundness', .2, 3, .01, 1], ['Core Level', 0, 2, .01, 1], ['Falloff', .2, 8, .01, 2], ['Animation Rate', 0, 4, .01, .2]],
  ring: ['Radius', ['Band Width', .002, .45, .001, .07], ['Wave Count', 1, 32, 1, 8], ['Wave Depth', 0, .5, .01, .08], ['Edge Feather', .001, .3, .001, .025], ['Glow', 0, 2, .01, .8]],
  rays: ['Radius', ['Ray Count', 2, 96, 1, 16], ['Ray Sharpness', .2, 16, .1, 5], ['Radial Falloff', .1, 12, .01, 3], ['Core Size', 0, .5, .005, .08], ['Flicker', 0, 2, .01, .25]],
  shape: ['Size', ['Sides / Points', 3, 24, 1, 6], ['Edge Feather', .001, .25, .001, .025], ['Corner Roundness', 0, 1, .01, .1], ['Outline Width', 0, .4, .005, 0], ['Distortion', 0, 1, .01, 0]],
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

function profileFor(name: string) {
  if (/Ring|Halo|Ripple|Concentric|Pulse/.test(name)) return 'ring'
  if (/Burst|Ray|Flare|Spark|Glare|Sun|Flash|Impact|Lightning|Electric/.test(name)) return 'rays'
  if (/Circle|Vignette|Glow|Aura|Crescent|MetaBalls|Bokeh/.test(name)) return 'disc'
  if (/Spiral|Swirl|Twirl|Portal|Wormhole|Kaleido/.test(name)) return 'spiral'
  if (/Star|Polygon|Rectangle|Flower|Bevel|Pyramid|Crack|Crystal/.test(name)) return 'shape'
  if (/Dot|Polka|Halftone/.test(name)) return 'dots'
  if (/Grid|Checker|Tiles|Matrix|Bricks|Weave|Fabric|Crosshatch/.test(name)) return 'grid'
  if (/Line|Stripe|Scanline|Zigzag|Squiggle|Gradation|Sweep/.test(name)) return 'lines'
  if (/Voronoi|Cell|Mosaic/.test(name)) return 'cells'
  if (/Glitch|Cyber|Pixel|Block|Laser/.test(name)) return name === 'LaserBeam' ? 'beam' : 'digital'
  if (/Fluid|Smoke|Water|Lava|Plasma|Marble|Fire|Cloud|Caustic|Aurora|Flame|Toxic|Flow|Energy/.test(name)) return 'fluid'
  return 'noise'
}

function category(i: number) {
  if (i < 19) return 'Radial'
  if (i < 46) return 'Shapes & Bursts'
  if (i < 71) return 'Patterns'
  if (i < 102) return 'Noise & Organic'
  return 'Digital & Utility'
}

function hashName(name: string) {
  let h = 2166136261
  for (const c of name) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return h >>> 0
}

export const catalog: Generator[] = names.map((name, index) => {
  const seed = hashName(name)
  const group = category(index)
  const profileName = profileFor(name)
  const [primary, ...controls] = profiles[profileName]
  const scaleDefault = profileName === 'disc' || profileName === 'ring' || profileName === 'rays' || profileName === 'shape'
    ? .18 + (index % 7) * .025
    : 2.5 + (index % 9) * .45
  const parameters: Parameter[] = [
    { key: 'p0', label: `${name} ${primary}`, min: .05, max: profileName === 'disc' || profileName === 'ring' || profileName === 'rays' || profileName === 'shape' ? .8 : 16, step: .01, default: scaleDefault },
    ...controls.map(([label, min, max, step, value], slot) => ({
      key: `p${slot + 1}`,
      label,
      min,
      max,
      step,
      // Small, bounded per-generator offsets prevent same-profile presets from
      // collapsing to identical recipes while retaining sensible authored values.
      default: Math.min(max, Math.max(min, value + ((index * (slot + 3)) % 5 - 2) * step)),
    })),
  ]
  const family = group === 'Radial' ? 0 : group === 'Shapes & Bursts' ? 1 : group === 'Patterns' ? 2 : group === 'Noise & Organic' ? 3 : 4
  const local = index - [0, 19, 46, 71, 102][family]
  return {
    name,
    category: group,
    kind: index,
    seed,
    recipe: [family, local, Object.keys(profiles).indexOf(profileName), (index * 7 + family * 3) % 17],
    parameters,
    defaults: Object.fromEntries(parameters.map((p) => [p.key, p.default])),
  }
})

export const categories = [...new Set(catalog.map((item) => item.category))]
