import { chromium } from 'playwright-core'
import { createServer } from 'vite'
import { mkdir, writeFile } from 'node:fs/promises'

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { host: '127.0.0.1', port: 0, strictPort: false },
})
await server.listen()
const address = server.resolvedUrls?.local[0]
if (!address) throw new Error('Vite did not provide a local test URL')

try {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    const page = await browser.newPage()
    await page.goto(`${address}/seam-test.html`, { waitUntil: 'domcontentloaded', timeout: 15_000 })
    const results = await page.evaluate(async () => {
      const [{ TextureRenderer }, { catalog }, { defaultPost, makeLayer }] = await Promise.all([
        import('/src/renderer.ts'),
        import('/src/catalog.ts'),
        import('/src/models.ts'),
      ])
      const representatives = catalog.filter((entry) => entry.tileable)
      const renderer = new TextureRenderer()
      const canvas = document.createElement('canvas')
      const gradient = [
        { id: 'black', position: 0, color: '#ffffff' },
        { id: 'white', position: 1, color: '#ffffff' },
      ]
      const size = 128
      const post = { ...defaultPost, bloom: 0.55 }
      const reports = []

      for (const generator of representatives) {
        const name = generator.name
        const layer = makeLayer(generator)
        layer.seamless = true
        layer.transform = { ...layer.transform, x: 0.173, y: -0.219, rotation: 37, scale: 1.37, scrollX: 0.31, scrollY: -0.27 }
        renderer.render(canvas, [layer], gradient, post, 1.73, size)
        const pixels = canvas.getContext('2d').getImageData(0, 0, size, size).data
        const alpha = (x, y) => pixels[(y * size + x) * 4 + 3]
        const seam = []
        const interior = []
        for (let index = 0; index < size; index++) {
          seam.push(Math.abs(alpha(0, index) - alpha(size - 1, index)))
          seam.push(Math.abs(alpha(index, 0) - alpha(index, size - 1)))
        }
        for (let y = 0; y < size; y += 4) for (let x = 0; x < size - 1; x++) {
          interior.push(Math.abs(alpha(x, y) - alpha(x + 1, y)))
        }
        for (let x = 0; x < size; x += 4) for (let y = 0; y < size - 1; y++) {
          interior.push(Math.abs(alpha(x, y) - alpha(x, y + 1)))
        }
        interior.sort((a, b) => a - b)
        const seamMean = seam.reduce((sum, value) => sum + value, 0) / seam.length
        const interiorP95 = interior[Math.floor(interior.length * 0.95)] ?? 0
        const allowed = Math.max(3, interiorP95 * 1.5)
        // Pixel-edge jumps are a useful warning for smooth fields, but a block
        // pattern can intentionally cross a hard edge at the image boundary.
        // Check the exact periodic contract independently in both directions.
        let periodError = 0
        for (const axis of ['x', 'y']) {
          const translated = { ...layer, transform: { ...layer.transform, [axis]: layer.transform[axis] + 1 } }
          renderer.render(canvas, [translated], gradient, post, 1.73, size)
          const shifted = canvas.getContext('2d').getImageData(0, 0, size, size).data
          let sum = 0
          for (let i = 3; i < pixels.length; i += 4) sum += Math.abs(pixels[i] - shifted[i])
          periodError = Math.max(periodError, sum / (size * size))
        }
        const discrete = generator.name === 'Glitch' || generator.name === 'Grain'
        reports.push({ name, seamMean, interiorP95, allowed, periodError, edgeWarning: seamMean > allowed, passed: periodError < .1 && (discrete || seamMean <= allowed) })
      }
      return reports
    })
    console.table(results)
    await mkdir('artifacts/shader-audit', { recursive: true })
    await writeFile('artifacts/shader-audit/seams.json', JSON.stringify(results, null, 2))
    const failures = results.filter((result) => !result.passed)
    if (failures.length) throw new Error(`Seam discontinuity detected: ${failures.map((failure) => failure.name).join(', ')}`)
  } finally {
    await browser.close()
  }
} finally {
  await server.close()
}
