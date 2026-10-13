// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

vi.mock('./renderer', () => ({ TextureRenderer: class { render() {} prefetchProfiles() {} } }))
vi.mock('./exporters', () => ({ exportPreset: vi.fn(), loadPreset: vi.fn(), exportPng: vi.fn(), exportNormalMap: vi.fn(), exportChannelPack: vi.fn(), exportGif: vi.fn() }))

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('editing workflow', () => {
  it('keeps the layer when Delete is used inside its name field', () => {
    render(<App />)
    const name = screen.getByLabelText('Layer name')
    fireEvent.keyDown(name, { key: 'Delete' })
    expect(screen.getAllByLabelText('Layer name')).toHaveLength(1)
    fireEvent.keyDown(window, { key: 'Delete' })
    expect(screen.queryByLabelText('Layer name')).toBeNull()
    expect(screen.getByText('Choose a generator from the library to start.')).toBeTruthy()
  })

  it('undoes and redoes global color edits', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Color' }))
    fireEvent.change(screen.getByRole('slider', { name: 'Gradient mix' }), { target: { value: '.3' } })
    expect((screen.getByRole('slider', { name: 'Gradient mix' }) as HTMLInputElement).value).toBe('0.3')
    fireEvent.click(screen.getByRole('button', { name: /Undo/ }))
    expect((screen.getByRole('slider', { name: 'Gradient mix' }) as HTMLInputElement).value).toBe('1')
    fireEvent.click(screen.getByRole('button', { name: /Redo/ }))
    expect((screen.getByRole('slider', { name: 'Gradient mix' }) as HTMLInputElement).value).toBe('0.3')
  })

  it('only exposes random seeds for generators with random structure', () => {
    render(<App />)
    expect(screen.queryByRole('slider', { name: 'Seed' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /FractalNoise/ }))
    expect(screen.getByRole('slider', { name: 'Seed' })).toBeTruthy()
  })
})
