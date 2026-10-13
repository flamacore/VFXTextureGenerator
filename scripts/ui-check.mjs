import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from 'playwright-core'
import { createServer } from 'vite'

const output = resolve('artifacts/ui-audit')
await mkdir(output, { recursive: true })
const server = await createServer({ logLevel: 'silent', server: { host: '127.0.0.1', port: 0, strictPort: false } })
await server.listen()
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const checks = []
const errors = []
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true })
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(server.resolvedUrls.local[0], { waitUntil: 'networkidle' })
  const tab = async (name) => page.locator('.inspector-tabs').getByRole('button', { name, exact: true }).click()
  const pixels = () => page.locator('.preview-canvas-group canvas').first().evaluate((canvas) => canvas.toDataURL())
  const check = (name, result) => { assert.ok(result, name); checks.push(name); console.log(`PASS ${name}`) }
  const original = await pixels()
  check('Initial preview renders', original.length > 1000)
  for (const name of ['Generator', 'Transform', 'Color', 'Post', 'Export']) {
    await tab(name)
    await page.screenshot({ path: resolve(output, `${name.toLowerCase()}-1440.png`) })
    check(`${name} inspector visible`, await page.locator('.inspector-body').isVisible())
  }
  await tab('Transform')
  await page.getByRole('spinbutton', { name: 'Offset U value', exact: true }).fill('0.23')
  await page.getByRole('spinbutton', { name: 'Offset U value', exact: true }).press('Enter')
  check('UV offset changes rendered preview through UI', await pixels() !== original)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  check('Undo restores UV and pixels', await pixels() === original)

  await tab('Color')
  await page.locator('.presets button').first().click()
  const colored = await pixels()
  check('Color preset affects preview immediately', colored !== original)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  check('Undo restores gradient and pixels', await pixels() === original)
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  check('Redo restores gradient and pixels', await pixels() === colored)

  const nameInput = page.getByRole('textbox', { name: 'Layer name', exact: true }).first()
  await nameInput.fill('Editable Ring')
  await nameInput.press('Home')
  await nameInput.press('Delete')
  check('Delete while editing does not remove a layer', await page.locator('.layer-row').count() === 1)
  await nameInput.fill('Review Ring')
  await page.locator('.layers-head b').click()
  await page.keyboard.press('Control+d')
  check('Duplicate layer shortcut works', await page.locator('.layer-row').count() === 2)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  check('Undo removes duplicate', await page.locator('.layer-row').count() === 1)

  await tab('Export')
  const pngWait = page.waitForEvent('download')
  await page.locator('.export-grid').getByRole('button', { name: /^PNG/ }).click()
  const png = await pngWait
  const pngData = await readFile(await png.path())
  check('PNG export has correct signature and dimensions', pngData.toString('ascii', 1, 4) === 'PNG' && pngData.readUInt32BE(16) === 768 && pngData.readUInt32BE(20) === 768)
  for (const label of ['Normal Map', 'Channel Pack']) {
    const downloadWait = page.waitForEvent('download')
    await page.locator('.export-grid').getByRole('button', { name: new RegExp(`^${label}`) }).click()
    const data = await readFile(await (await downloadWait).path())
    check(`${label} export is a full-resolution PNG`, data.toString('ascii', 1, 4) === 'PNG' && data.readUInt32BE(16) === 768)
  }
  const beforeGif = await pixels()
  const gifWait = page.waitForEvent('download', { timeout: 120_000 })
  await page.locator('.export-grid').getByRole('button', { name: /^Animated GIF/ }).click()
  const gifData = await readFile(await (await gifWait).path())
  check('GIF export has correct signature and dimensions', /^GIF8[79]a$/.test(gifData.toString('ascii', 0, 6)) && gifData.readUInt16LE(6) === 384 && gifData.readUInt16LE(8) === 384)
  check('GIF export preserves preview', await pixels() === beforeGif)
  const presetWait = page.waitForEvent('download')
  await page.locator('.export-grid').getByRole('button', { name: /^Save Preset/ }).click()
  const presetDownload = await presetWait
  const preset = JSON.parse(await readFile(await presetDownload.path(), 'utf8'))
  check('Preset stores current layers and gradient', preset.layers.length === 1 && preset.layers[0].name === 'Review Ring' && preset.gradient.length === 3)
  const chooserWait = page.waitForEvent('filechooser')
  await page.locator('.export-grid').getByRole('button', { name: /^Load Preset/ }).click()
  await (await chooserWait).setFiles({ name: 'roundtrip.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(preset)) })
  await page.waitForFunction(() => document.querySelector('.toast')?.textContent?.includes('loaded'))
  check('Saved project reloads', await nameInput.inputValue() === 'Review Ring')
  await page.getByRole('textbox', { name: 'Search generators' }).fill('Wormhole')
  check('Legacy names find consolidated replacements', await page.locator('.generator-list .generator').count() === 1 && await page.locator('.generator-list').innerText().then((text) => text.includes('Spiral')))
  await page.getByRole('textbox', { name: 'Search generators' }).fill('')

  await page.setViewportSize({ width: 1180, height: 720 })
  for (const name of ['Generator', 'Transform', 'Color', 'Post', 'Export']) {
    await tab(name)
    await page.screenshot({ path: resolve(output, `${name.toLowerCase()}-1180.png`) })
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
    check(`${name} fits minimum desktop width`, !overflow)
  }
  check('No uncaught browser exceptions', errors.length === 0)
  await writeFile(resolve(output, 'report.json'), JSON.stringify({ checks, errors }, null, 2))
  console.log(`Passed ${checks.length} UI checks; screenshots: ${output}`)
} finally {
  await browser.close()
  await server.close()
}
