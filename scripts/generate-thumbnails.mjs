import { mkdir, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from 'playwright-core'
import { createServer } from 'vite'

const outputDirectory = resolve('public/thumbnails')
const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { host: '127.0.0.1', port: 0, strictPort: false },
})
await server.listen()
const address = server.resolvedUrls?.local[0]
if (!address) throw new Error('Vite did not provide a local generation URL')

try {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    const page = await browser.newPage()
    await page.goto(`${address}/seam-test.html`, { waitUntil: 'domcontentloaded', timeout: 15_000 })
    const thumbnails = await page.evaluate(async () => {
      const [{ TextureRenderer }, { catalog }, { defaultPost, makeLayer }] = await Promise.all([
        import('/src/renderer.ts'),
        import('/src/catalog.ts'),
        import('/src/models.ts'),
      ])
      const renderer = new TextureRenderer()
      const canvas = document.createElement('canvas')
      const white = [
        { id: 'thumbnail-start', position: 0, color: '#ffffff' },
        { id: 'thumbnail-end', position: 1, color: '#ffffff' },
      ]
      return catalog.map((generator) => {
        renderer.render(canvas, [makeLayer(generator)], white, defaultPost, 0, 64)
        return { name: generator.name, data: canvas.toDataURL('image/png').split(',')[1] }
      })
    })

    await rm(outputDirectory, { recursive: true, force: true })
    await mkdir(outputDirectory, { recursive: true })
    await Promise.all(thumbnails.map(({ name, data }) =>
      writeFile(resolve(outputDirectory, `${name}.png`), Buffer.from(data, 'base64'))))
    console.log(`Generated ${thumbnails.length} thumbnails in ${outputDirectory}`)
  } finally {
    await browser.close()
  }
} finally {
  await server.close()
}
