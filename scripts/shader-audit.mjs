import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from 'playwright-core'
import { createServer } from 'vite'

// Exercise the production WebGL renderer, including the Canvas2D compositing pass.
// Parameter failures are fatal; symmetry-dependent common controls are reported
// separately so, for example, rotating a circle is not treated as a broken knob.
const output = resolve(process.argv.find((arg) => arg.startsWith('--output='))?.slice(9) ?? 'artifacts/shader-audit')
const source = process.argv.find((arg) => arg.startsWith('--source='))?.slice(9) ?? '/src'
const server = await createServer({ root: process.cwd(), logLevel: 'silent', server: { host: '127.0.0.1', port: 0, strictPort: false } })
await server.listen()
let browser
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true })
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${server.resolvedUrls.local[0]}seam-test.html`, { waitUntil: 'domcontentloaded' })
  const result = await page.evaluate(async (source) => {
    const [{ TextureRenderer }, { catalog }, { defaultPost, makeLayer }] = await Promise.all([
      import(`${source}/renderer.ts`), import(`${source}/catalog.ts`), import(`${source}/models.ts`),
    ])
    const renderer = new TextureRenderer()
    const canvas = document.createElement('canvas')
    const size = 96
    const white = [{ id: 'a', position: 0, color: '#ffffff' }, { id: 'b', position: 1, color: '#ffffff' }]
    const render = (layer, time = 1.73, post = defaultPost, colors = white) => {
      renderer.render(canvas, [layer], colors, post, time, size)
      return new Uint8ClampedArray(canvas.getContext('2d').getImageData(0, 0, size, size).data)
    }
    const difference = (a, b) => {
      let sum = 0, changed = 0
      for (let i = 0; i < a.length; i += 4) {
        // Premultiplied RGB avoids comparing invisible colors in transparent texels.
        let delta = Math.abs(a[i + 3] - b[i + 3])
        for (let c = 0; c < 3; c++) delta += Math.abs(a[i + c] * a[i + 3] / 255 - b[i + c] * b[i + 3] / 255)
        sum += delta / 4
        if (delta > 1) changed++
      }
      return { mean: +(sum / (a.length / 4)).toFixed(5), changedPixels: changed }
    }
    const sheet = document.createElement('canvas')
    const columns = 6, cellW = 176, cellH = 202
    sheet.width = columns * cellW
    sheet.height = Math.ceil(catalog.length / columns) * cellH
    const ctx = sheet.getContext('2d')
    ctx.fillStyle = '#11151c'; ctx.fillRect(0, 0, sheet.width, sheet.height)
    const samples = [], reports = []
    const effects = Object.keys(defaultPost).map((name) => ({ name, changedGenerators: [], maximumDelta: 0 }))
    const spectrum = [{ id: 'red', position: 0, color: '#fc2148' }, { id: 'blue', position: .43, color: '#2171fe' }, { id: 'gold', position: 1, color: '#ffd26a' }]
    const gradientChecks = ['middle stop position', 'fourth stop color'].map((name) => ({ name, changedGenerators: [] }))
    const fourStops = [...spectrum.slice(0, 2), { id: 'green', position: .72, color: '#11dd6a' }, spectrum[2]]
    for (const [index, generator] of catalog.entries()) {
      const layer = makeLayer(generator)
      const baseline = render(layer)
      samples.push({ name: generator.name, pixels: baseline })
      const alpha = baseline.filter((_, i) => i % 4 === 3)
      let min = 255, max = 0, sum = 0
      for (const a of alpha) { min = Math.min(min, a); max = Math.max(max, a); sum += a }
      const controls = []
      for (const parameter of generator.parameters) {
        const values = [parameter.min, parameter.min + (parameter.max - parameter.min) * .37, parameter.max]
          .map((value) => Math.min(parameter.max, Math.max(parameter.min, Math.round(value / parameter.step) * parameter.step)))
        const deltas = values.map((value) => difference(baseline, render({ ...layer, params: { ...layer.params, [parameter.key]: value } })))
        controls.push({ key: parameter.key, label: parameter.label, values, deltas, passed: deltas.some((d) => d.changedPixels > 0) })
      }
      const common = []
      const check = (name, changed, time = 1.73) => common.push({ name, ...difference(baseline, render(changed, time)) })
      for (const [key, value] of Object.entries({ x: .19, y: -.23, rotation: 31, scale: 1.6, u: .21, v: -.18, scrollX: .3, scrollY: -.3 })) {
        check(key, { ...layer, transform: { ...layer.transform, [key]: value } })
      }
      check('corners', { ...layer, transform: { ...layer.transform, corners: [{ x: .2, y: .1 }, { x: .9, y: .25 }, { x: .8, y: .9 }, { x: .1, y: .8 }] } })
      check('invert', { ...layer, invert: true })
      check('polar', { ...layer, polar: true })
      check('solidColor', { ...layer, solid: true, solidColor: '#ff3300' })
      check('opacity', { ...layer, opacity: .4 })
      check('seed', { ...layer, seed: 7823 })
      check('time', layer, 3.91)
      // Repeat and clipping only diverge when UVs leave the unit square.
      const shifted = { ...layer, transform: { ...layer.transform, u: .6 } }
      common.push({ name: 'uvRepeat (offset UV)', ...difference(render(shifted), render({ ...shifted, transform: { ...shifted.transform, uvRepeat: false } })) })
      const inset = { ...layer, transform: { ...layer.transform, corners: [{ x: .15, y: .15 }, { x: .85, y: .15 }, { x: .85, y: .85 }, { x: .15, y: .85 }] } }
      for (const [key, value] of Object.entries({ feather: .25, roundness: .4 })) common.push({ name: `${key} (inset frame)`, ...difference(render(inset), render({ ...inset, transform: { ...inset.transform, [key]: value } })) })
      const colorBaseline = render(layer, 1.73, { ...defaultPost, colorMap: 1 }, spectrum)
      for (const effect of effects) {
        const post = { ...defaultPost, colorMap: 1, [effect.name]: effect.name === 'colorMap' ? 0 : .8 }
        const delta = difference(colorBaseline, render(layer, 1.73, post, spectrum))
        if (delta.changedPixels > 0) effect.changedGenerators.push(generator.name)
        effect.maximumDelta = Math.max(effect.maximumDelta, delta.mean)
      }
      const fourStopBaseline = render(layer, 1.73, { ...defaultPost, colorMap: 1 }, fourStops)
      const gradients = [fourStops.map((stop, i) => i === 1 ? { ...stop, position: .15 } : stop), fourStops.map((stop, i) => i === 3 ? { ...stop, color: '#7a00ee' } : stop)]
      gradients.forEach((stops, i) => {
        if (difference(fourStopBaseline, render(layer, 1.73, { ...defaultPost, colorMap: 1 }, stops)).changedPixels > 0) gradientChecks[i].changedGenerators.push(generator.name)
      })
      render(layer, 0)
      const x = index % columns * cellW, y = Math.floor(index / columns) * cellH
      ctx.fillStyle = '#222936'; ctx.fillRect(x + 8, y + 8, 160, 160)
      ctx.drawImage(canvas, x + 8, y + 8, 160, 160)
      ctx.fillStyle = '#ffffff'; ctx.font = '13px sans-serif'; ctx.fillText(generator.name, x + 8, y + 184, 160)
      ctx.fillStyle = '#8f9aaa'; ctx.font = '10px sans-serif'; ctx.fillText(generator.category, x + 8, y + 198, 160)
      reports.push({ name: generator.name, category: generator.category, alpha: { min, max, mean: +(sum / alpha.length).toFixed(3) }, controls, common })
    }
    const similar = []
    for (let i = 0; i < samples.length; i++) for (let j = i + 1; j < samples.length; j++) {
      const delta = difference(samples[i].pixels, samples[j].pixels)
      if (delta.mean < 1) similar.push({ a: samples[i].name, b: samples[j].name, ...delta })
    }
    return { reports, similar, effects, gradientChecks, sheet: sheet.toDataURL('image/png').split(',')[1] }
  }, source)
  await mkdir(output, { recursive: true })
  const { sheet, ...report } = result
  report.browserErrors = errors
  await writeFile(resolve(output, 'contact-sheet.png'), Buffer.from(sheet, 'base64'))
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2))
  const failures = report.reports.flatMap((g) => g.controls.filter((c) => !c.passed).map((c) => `${g.name}: ${c.label} (${c.key})`))
  const blank = report.reports.filter((g) => g.alpha.max === 0).map((g) => g.name)
  const noOpEffects = report.effects.filter((effect) => effect.changedGenerators.length === 0).map((effect) => effect.name)
  const noOpGradients = report.gradientChecks.filter((check) => check.changedGenerators.length === 0).map((check) => check.name)
  console.log(JSON.stringify({ generators: report.reports.length, parameterChecks: report.reports.reduce((n, g) => n + g.controls.length, 0), noOpParameters: failures, noOpEffects, noOpGradients, blank, similar: report.similar, browserErrors: errors, output }, null, 2))
  if (failures.length || blank.length || errors.length || noOpEffects.length || noOpGradients.length) process.exitCode = 1
} finally {
  await browser?.close()
  await server.close()
}
