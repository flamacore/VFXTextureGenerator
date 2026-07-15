import type { GradientStop, Layer, PostSettings } from './models'
import { isTauri } from '@tauri-apps/api/core'
import { open, save } from '@tauri-apps/plugin-dialog'
import { readTextFile, writeFile } from '@tauri-apps/plugin-fs'
import gifenc from 'gifenc'

export type PresetData = {
  version: 1
  layers: Layer[]
  gradient: GradientStop[]
  post: PostSettings
}

async function saveBlob(blob: Blob, filename: string) {
  if (isTauri()) {
    const extension = filename.split('.').pop() ?? ''
    const path = await save({ defaultPath: filename, filters: [{ name: extension.toUpperCase(), extensions: [extension] }] })
    if (path) await writeFile(path, new Uint8Array(await blob.arrayBuffer()))
    return
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function exportPng(canvas: HTMLCanvasElement, name = 'vfx-texture.png') {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (blob) await saveBlob(blob, name)
}

export async function exportNormalMap(canvas: HTMLCanvasElement, name = 'vfx-normal-map.png', strength = 4) {
  const source = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height)
  const out = new ImageData(source.width, source.height)
  const lum = (x: number, y: number) => {
    const xx = (x + source.width) % source.width, yy = (y + source.height) % source.height
    const p = (yy * source.width + xx) * 4
    return (source.data[p] + source.data[p + 1] + source.data[p + 2]) / 765
  }
  for (let y = 0; y < source.height; y++) for (let x = 0; x < source.width; x++) {
    const dx = (lum(x + 1, y) - lum(x - 1, y)) * strength
    const dy = (lum(x, y + 1) - lum(x, y - 1)) * strength
    const l = Math.hypot(dx, dy, 1), p = (y * source.width + x) * 4
    out.data[p] = (-dx / l * .5 + .5) * 255
    out.data[p + 1] = (-dy / l * .5 + .5) * 255
    out.data[p + 2] = (1 / l * .5 + .5) * 255
    out.data[p + 3] = 255
  }
  const result = document.createElement('canvas')
  result.width = source.width; result.height = source.height
  result.getContext('2d')!.putImageData(out, 0, 0)
  await exportPng(result, name)
}

export async function exportChannelPack(canvas: HTMLCanvasElement, name = 'vfx-channel-pack.png') {
  const ctx = canvas.getContext('2d')!, image = ctx.getImageData(0, 0, canvas.width, canvas.height)
  for (let p = 0; p < image.data.length; p += 4) {
    const l = (image.data[p] + image.data[p + 1] + image.data[p + 2]) / 3
    image.data[p] = l; image.data[p + 1] = 255 - l; image.data[p + 2] = image.data[p + 3]
    image.data[p + 3] = 255
  }
  const result = document.createElement('canvas')
  result.width = canvas.width; result.height = canvas.height
  result.getContext('2d')!.putImageData(image, 0, 0)
  await exportPng(result, name)
}

export async function exportPreset(layers: Layer[], gradient: GradientStop[], post: PostSettings, name = 'vfx-preset.json') {
  const data = JSON.stringify({ version: 1, layers, gradient, post } satisfies PresetData, null, 2)
  await saveBlob(new Blob([data], { type: 'application/json' }), name)
}

export async function loadPreset(): Promise<PresetData | null> {
  let text: string
  if (isTauri()) {
    const path = await open({ multiple: false, filters: [{ name: 'VFX preset', extensions: ['json'] }] })
    if (!path) return null
    text = await readTextFile(path)
  } else {
    const file = await new Promise<File | null>((resolve) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = 'application/json,.json'
      input.onchange = () => resolve(input.files?.[0] ?? null)
      input.oncancel = () => resolve(null)
      input.click()
    })
    if (!file) return null
    text = await file.text()
  }
  const value = JSON.parse(text) as Partial<PresetData>
  if (value.version !== 1 || !Array.isArray(value.layers) || !Array.isArray(value.gradient) || !value.post) {
    throw new Error('This file is not a supported VFX Texture Generator preset')
  }
  return value as PresetData
}

export async function exportGif(frames: ImageData[], fps: number, name = 'vfx-animation.gif') {
  if (!frames.length) throw new Error('No animation frames to export')
  const { GIFEncoder, applyPalette, quantize } = gifenc
  const encoder = GIFEncoder()
  for (const frame of frames) {
    const palette = quantize(frame.data, 256, { format: 'rgba4444', oneBitAlpha: 127 })
    const indexed = applyPalette(frame.data, palette, 'rgba4444')
    encoder.writeFrame(indexed, frame.width, frame.height, {
      palette,
      delay: Math.round(1000 / fps),
      repeat: 0,
      transparent: true,
    })
  }
  encoder.finish()
  await saveBlob(new Blob([encoder.bytes() as BlobPart], { type: 'image/gif' }), name)
}
