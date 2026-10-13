import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from 'react'
import './App.css'
import { catalog, categories, legacyAliases, resolveGenerator, type Generator } from './catalog'
import { defaultPost, defaultTransform, makeLayer, normalizeTransform, withCorner, type BlendMode, type GradientStop, type Layer, type PostSettings, type TransformScalar } from './models'
import { TextureRenderer } from './renderer'
import { exportChannelPack, exportGif, exportNormalMap, exportPng, exportPreset, loadPreset } from './exporters'

type Snapshot = { layers: Layer[]; gradient: GradientStop[]; post: PostSettings }
type Tab = 'Generator' | 'Transform' | 'Color' | 'Post' | 'Export'
const blends: BlendMode[] = ['Normal', 'Add', 'Multiply', 'Screen', 'Mask']
const uid = () => crypto.randomUUID()
const safeFilenamePart = (value: string) => [...value.trim()]
  .filter((character) => character.charCodeAt(0) >= 32 && !'<>:"/\\|?*'.includes(character))
  .join('').replace(/\s+/g, '-')
const thumbnailUrl = (generator: Generator) => `/thumbnails/${generator.name}.png`
const Icon = ({ children }: { children: ReactNode }) => <span className="icon" aria-hidden>{children}</span>

function useNearList(rootRef: RefObject<HTMLElement | null>) {
  const ref = useRef<HTMLButtonElement>(null)
  const [near, setNear] = useState(false)
  useEffect(() => {
    if (near) return
    const node = ref.current
    if (!node) return
    const io = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setNear(true)
    }, { root: rootRef.current, rootMargin: '220px' })
    io.observe(node)
    return () => io.disconnect()
  }, [near, rootRef])
  return { ref, near }
}

function GeneratorThumbnail({ src, name, hue, shape, className = 'generator-icon' }: {
  src?: string; name: string; hue: number; shape: number; className?: string
}) {
  const [failed, setFailed] = useState(false)
  const showImage = Boolean(src) && !failed
  return <span className={`${className} g${shape}${showImage ? ' has-image' : ''}`} style={{ '--h': hue } as CSSProperties}>
    {showImage && <img src={src} alt={`${name} preview`} loading="lazy" decoding="async" onError={() => setFailed(true)} />}
  </span>
}

function Slider({ label, value, min = 0, max = 1, step = .01, onChange }: {
  label: string; value: number; min?: number; max?: number; step?: number; onChange: (value: number) => void
}) {
  const [draft, setDraft] = useState(String(Number(value.toFixed(4))))
  useEffect(() => setDraft(String(Number(value.toFixed(4)))), [value])
  const cancelDraft = useRef(false)
  const commitDraft = () => {
    if (cancelDraft.current) { cancelDraft.current = false; return }
    const parsed = Number(draft)
    if (draft.trim() && Number.isFinite(parsed)) {
      const clamped = Math.min(max, Math.max(min, parsed))
      setDraft(String(Number(clamped.toFixed(4))))
      if (clamped !== value) onChange(clamped)
    } else setDraft(String(Number(value.toFixed(4))))
  }
  return <label className="control"><span>{label}<input aria-label={`${label} value`} className="control-number" type="number" value={draft} min={min} max={max} step={step}
    onChange={(event) => setDraft(event.target.value)} onBlur={commitDraft} onKeyDown={(event) => {
      if (event.key === 'Enter') event.currentTarget.blur()
      if (event.key === 'Escape') { cancelDraft.current = true; setDraft(String(Number(value.toFixed(4)))); event.currentTarget.blur() }
    }} /></span>
    <input aria-label={label} type="range" value={value} min={min} max={max} step={step} onChange={(e) => onChange(+e.target.value)} /></label>
}

function GeneratorRow({ generator, rootRef, onAdd }: {
  generator: Generator
  rootRef: RefObject<HTMLDivElement | null>
  onAdd: (generator: Generator) => void
}) {
  const { ref, near } = useNearList(rootRef)
  return <button className="generator" ref={ref} onClick={() => onAdd(generator)}>
    <GeneratorThumbnail src={near ? thumbnailUrl(generator) : undefined} name={generator.name}
      hue={generator.kind * 13 % 360} shape={(generator.kind % 7) + 1} />
    <span><b>{generator.name}</b><small>{generator.category}</small></span><i>＋</i>
  </button>
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const tilePreviewRefs = useRef<(HTMLCanvasElement | null)[]>([])
  const generatorListRef = useRef<HTMLDivElement>(null)
  const renderer = useRef<TextureRenderer | null>(null)
  const past = useRef<Snapshot[]>([]), future = useRef<Snapshot[]>([])
  const initial = useMemo(() => makeLayer(catalog.find((item) => item.name === 'Ring') ?? catalog[0]), [])
  const [layers, setLayers] = useState<Layer[]>([initial])
  const [selectedId, setSelectedId] = useState(initial.id)
  const [gradient, setGradientRaw] = useState<GradientStop[]>([
    { id: uid(), position: 0, color: '#ffffff' }, { id: uid(), position: 1, color: '#ffffff' },
  ])
  const [post, setPostRaw] = useState<PostSettings>({ ...defaultPost, colorMap: 1 })
  const [query, setQuery] = useState(''), [category, setCategory] = useState('All')
  const [tab, setTab] = useState<Tab>('Generator'), [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0), [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 }), [background, setBackground] = useState<'checker' | 'black'>('checker')
  const [tilePreview, setTilePreview] = useState(false)
  const [leftPanelWidth, setLeftPanelWidth] = useState(248)
  const [rightPanelWidth, setRightPanelWidth] = useState(288)
  const [bottomPanelHeight, setBottomPanelHeight] = useState(177)
  const [exporting, setExporting] = useState(false)
  const [resolution, setResolution] = useState(768), [notice, setNotice] = useState('')
  const selected = layers.find((l) => l.id === selectedId) ?? layers[0]
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    return catalog.filter((g) => (category === 'All' || g.category === category) &&
      (`${g.name} ${g.description}`.toLowerCase().includes(term) ||
        Object.entries(legacyAliases).some(([alias, name]) => name === g.name && alias.toLowerCase().includes(term))))
  }, [category, query])
  const exportBaseName = useMemo(() => layers.slice(0, 3).map((layer) => safeFilenamePart(layer.name))
    .filter(Boolean).join('-') || 'VFX-Texture', [layers])
  const saveProject = useCallback(async () => {
    try {
      const saved = await exportPreset(layers, gradient, post, `${exportBaseName}.json`)
      if (saved) setNotice('Preset saved')
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Preset could not be saved')
    }
  }, [exportBaseName, gradient, layers, post])

  const current = useRef<Snapshot>({ layers, gradient, post })
  current.current = { layers, gradient, post }
  const remember = useCallback(() => {
    past.current.push(structuredClone(current.current))
    if (past.current.length > 80) past.current.shift()
    future.current = []
  }, [])
  const commit = useCallback((change: Layer[] | ((old: Layer[]) => Layer[])) => {
    remember(); setLayers(change)
  }, [remember])
  const setGradient = (change: GradientStop[] | ((old: GradientStop[]) => GradientStop[])) => { remember(); setGradientRaw(change) }
  const setPost = (change: PostSettings | ((old: PostSettings) => PostSettings)) => { remember(); setPostRaw(change) }
  const restore = useCallback((snapshot: Snapshot) => {
    setLayers(snapshot.layers); setGradientRaw(snapshot.gradient); setPostRaw(snapshot.post)
  }, [])
  const undo = useCallback(() => { const item = past.current.pop(); if (item) { future.current.push(structuredClone(current.current)); restore(item) } }, [restore])
  const redo = useCallback(() => { const item = future.current.pop(); if (item) { past.current.push(structuredClone(current.current)); restore(item) } }, [restore])
  const patch = (value: Partial<Layer>) => selected && commit((old) => old.map((l) => l.id === selected.id ? { ...l, ...value } : l))
  const transform = (key: TransformScalar, value: number) => selected && patch({ transform: { ...selected.transform, [key]: value } })
  const setCorner = (index: number, axis: 'x' | 'y', value: number) => {
    if (!selected) return
    patch({ transform: { ...selected.transform, corners: withCorner(selected.transform.corners, index, { ...selected.transform.corners[index], [axis]: value }) } })
  }
  const add = (generator: Generator) => { const layer = makeLayer(generator); commit((old) => [layer, ...old]); setSelectedId(layer.id) }
  const dragCorner = (index: number, event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    const host = event.currentTarget.parentElement
    if (!host || !selected) return
    const move = (pointer: PointerEvent) => {
      const box = host.getBoundingClientRect()
      const x = Math.min(1.25, Math.max(-.25, (pointer.clientX - box.left) / Math.max(1, box.width)))
      const y = Math.min(1.25, Math.max(-.25, 1 - (pointer.clientY - box.top) / Math.max(1, box.height)))
      patch({ transform: { ...selected.transform, corners: withCorner(selected.transform.corners, index, { x, y }) } })
    }
    const finish = () => {
      removeEventListener('pointermove', move)
      removeEventListener('pointerup', finish)
    }
    addEventListener('pointermove', move)
    addEventListener('pointerup', finish)
  }

  useEffect(() => {
    try {
      renderer.current ??= new TextureRenderer()
      if (canvasRef.current) {
        renderer.current.render(canvasRef.current, layers, gradient, post, time, resolution)
        renderer.current.prefetchProfiles()
        if (tilePreview) for (const preview of tilePreviewRefs.current) {
          if (!preview) continue
          preview.width = preview.height = resolution
          preview.getContext('2d')!.drawImage(canvasRef.current, 0, 0)
        }
      }
    }
    catch (e) { setNotice(e instanceof Error ? e.message : 'WebGL2 could not start') }
  }, [layers, gradient, post, time, resolution, tilePreview])
  useEffect(() => {
    if (!playing) return
    let id = 0, previous = performance.now()
    const tick = (now: number) => { setTime((t) => t + (now - previous) / 1000); previous = now; id = requestAnimationFrame(tick) }
    id = requestAnimationFrame(tick); return () => cancelAnimationFrame(id)
  }, [playing])
  useEffect(() => {
    const keys = (e: KeyboardEvent) => {
      const cmd = e.ctrlKey || e.metaKey
      const editing = e.target instanceof HTMLElement && (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || e.target.isContentEditable)
      if (editing && !(cmd && e.key.toLowerCase() === 's')) return
      if (cmd && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo() }
      if (cmd && e.key.toLowerCase() === 'y') { e.preventDefault(); redo() }
      if (cmd && e.key.toLowerCase() === 's') { e.preventDefault(); void saveProject() }
      if (e.code === 'Space' && !(e.target instanceof HTMLInputElement)) { e.preventDefault(); setPlaying((v) => !v) }
      if (e.key === 'Delete' && selected) commit((old) => old.filter((l) => l.id !== selected.id))
      if (cmd && e.key.toLowerCase() === 'd' && selected) { e.preventDefault(); const copy = { ...structuredClone(selected), id: uid(), name: `${selected.name} Copy` }; commit((old) => [copy, ...old]); setSelectedId(copy.id) }
    }
    addEventListener('keydown', keys); return () => removeEventListener('keydown', keys)
  }, [commit, redo, saveProject, selected, undo])

  const move = (delta: number) => selected && commit((old) => {
    const from = old.findIndex((l) => l.id === selected.id), to = Math.max(0, Math.min(old.length - 1, from + delta))
    const next = [...old], [item] = next.splice(from, 1); next.splice(to, 0, item); return next
  })
  const beginResize = (panel: 'left' | 'right' | 'bottom', event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    const startX = event.clientX, startY = event.clientY
    const initialLeft = leftPanelWidth, initialRight = rightPanelWidth, initialBottom = bottomPanelHeight
    document.body.style.userSelect = 'none'
    document.body.style.cursor = panel === 'bottom' ? 'row-resize' : 'col-resize'
    const resize = (pointer: PointerEvent) => {
      if (panel === 'left') {
        const maximum = Math.max(220, window.innerWidth - rightPanelWidth - 560)
        setLeftPanelWidth(Math.max(180, Math.min(maximum, initialLeft + pointer.clientX - startX)))
      } else if (panel === 'right') {
        const maximum = Math.max(250, window.innerWidth - leftPanelWidth - 560)
        setRightPanelWidth(Math.max(240, Math.min(maximum, initialRight - pointer.clientX + startX)))
      } else {
        setBottomPanelHeight(Math.max(110, Math.min(window.innerHeight - 360, initialBottom - pointer.clientY + startY)))
      }
    }
    const finish = () => {
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
      removeEventListener('pointermove', resize)
      removeEventListener('pointerup', finish)
    }
    addEventListener('pointermove', resize)
    addEventListener('pointerup', finish)
  }
  const runExport = async (format: 'png' | 'normal' | 'channels' | 'gif') => {
    if (!renderer.current || exporting) return
    setExporting(true)
    setNotice('Preparing export…')
    try {
      const output = document.createElement('canvas')
      const textureRenderer = renderer.current
      let saved: boolean
      if (format === 'gif') {
        const frames: ImageData[] = []
        for (let i = 0; i < 24; i++) {
          textureRenderer.render(output, layers, gradient, post, time + i / 12, 384)
          frames.push(output.getContext('2d')!.getImageData(0, 0, 384, 384))
          if (i % 4 === 0) await new Promise((resolve) => setTimeout(resolve, 0))
        }
        saved = await exportGif(frames, 12, `${exportBaseName}.gif`)
      } else {
        textureRenderer.render(output, layers, gradient, post, time, resolution)
        saved = await (format === 'normal' ? exportNormalMap(output, `${exportBaseName}-Normal.png`)
          : format === 'channels' ? exportChannelPack(output, `${exportBaseName}-Channels.png`)
          : exportPng(output, `${exportBaseName}.png`))
      }
      setNotice(saved ? 'Export saved' : 'Export canceled')
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Export failed') }
    finally { setExporting(false) }
  }
  const load = async () => {
    try {
      const preset = await loadPreset()
      if (!preset) return
      const restored = preset.layers.map((layer) => {
        const generator = resolveGenerator(layer.generator?.name ?? '')
        if (!generator) throw new Error(`Preset uses an unknown generator: ${layer.generator?.name ?? 'unnamed'}`)
        return {
          ...makeLayer(generator),
          ...layer,
          generator,
          id: uid(),
          transform: normalizeTransform(layer.transform),
          seamless: Boolean(layer.seamless && generator.tileable),
          params: Object.fromEntries(generator.parameters.map((parameter) => [parameter.key,
            preset.version === 2 && Number.isFinite(layer.params[parameter.key])
              ? Math.max(parameter.min, Math.min(parameter.max, layer.params[parameter.key]))
              : generator.defaults[parameter.key]])),
        }
      })
      remember()
      future.current = []
      setLayers(restored)
      setSelectedId(restored[0]?.id ?? '')
      setGradientRaw(preset.gradient.map((stop) => ({ ...stop, id: uid(), color: stop.color.length === 4 ? '#' + stop.color.slice(1).split('').map((digit) => digit + digit).join('') : stop.color })).sort((a, b) => a.position - b.position))
      setPostRaw({ ...defaultPost, ...preset.post })
      setNotice(preset.version === 1 ? 'Legacy preset migrated. Generator settings reset to new defaults; layers, transforms, colors and effects preserved.' : 'Preset loaded')
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Preset could not be loaded')
    }
  }

  return <main className="app-shell">
    <header className="topbar">
      <div className="brand"><span className="brand-mark">✦</span><b>VFX Texture Generator</b></div>
      <div className="toolbar"><button onClick={undo} disabled={!past.current.length}><Icon>↶</Icon>Undo</button><button onClick={redo} disabled={!future.current.length}><Icon>↷</Icon>Redo</button><button onClick={saveProject}><Icon>⤓</Icon>Save</button><button onClick={load}><Icon>⌁</Icon>Load</button><i className="divider" />
        <button className={playing ? 'active' : ''} onClick={() => setPlaying((v) => !v)}><Icon>{playing ? '■' : '▶'}</Icon>{playing ? 'Stop' : 'Animate'}</button>
        <button className="primary" onClick={() => setTab('Export')}><Icon>⇩</Icon>Export</button></div>
    </header>

    <section className="workspace" style={{ gridTemplateColumns: `${leftPanelWidth}px 5px minmax(360px, 1fr) 5px ${rightPanelWidth}px` }}>
      <aside className="library panel">
        <div className="panel-title"><b>Generators</b><small>{catalog.length} distinct generators</small></div>
        <div className="search"><Icon>⌕</Icon><input aria-label="Search generators" placeholder="Search generators…" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
        <div className="category-tabs">{['All', ...categories].map((c) => <button key={c} className={category === c ? 'active' : ''} onClick={() => setCategory(c)}>{c}</button>)}</div>
        <div className="generator-list" ref={generatorListRef}>{!filtered.length && <p className="empty-state">No matching generators. Try another name or category.</p>}{filtered.map((g) =>
          <GeneratorRow key={g.name} generator={g} rootRef={generatorListRef} onAdd={add} />)}</div>
      </aside>
      <div className="resize-handle vertical" role="separator" aria-label="Resize generator panel" onPointerDown={(event) => beginResize('left', event)} />

      <section className="stage-column" style={{ gridTemplateRows: `38px minmax(180px, 1fr) 35px 5px ${bottomPanelHeight}px` }}>
        <div className="stagebar"><b>Preview</b><div><button aria-label="Checkerboard background" aria-pressed={background === 'checker'} className={background === 'checker' ? 'active' : ''} onClick={() => setBackground('checker')}>▦</button>
          <button aria-label="Black background" aria-pressed={background === 'black'} className={background === 'black' ? 'active' : ''} onClick={() => setBackground('black')}>●</button><i className="divider" />
          <button aria-label="Toggle 2 by 2 tile preview" aria-pressed={tilePreview} className={tilePreview ? 'active' : ''} title="Inspect the texture as a 2 × 2 tile" onClick={() => setTilePreview((value) => !value)}>2×2</button><i className="divider" />
          <button aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(.2, z - .1))}>−</button><output>{Math.round(zoom * 100)}%</output><button aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(2, z + .1))}>＋</button>
          <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }) }}>Fit</button></div></div>
        <div className={`stage ${background}`} onWheel={(e) => { e.preventDefault(); setZoom((z) => Math.max(.2, Math.min(2, z - e.deltaY * .001))) }}>
          <div className={`preview-canvas-group ${tilePreview ? 'tiled' : ''}`} style={{ transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})` }} onPointerDown={(e) => {
            const start = { x: e.clientX - pan.x, y: e.clientY - pan.y }; e.currentTarget.setPointerCapture(e.pointerId)
            const drag = (m: PointerEvent) => setPan({ x: m.clientX - start.x, y: m.clientY - start.y })
            const up = () => { removeEventListener('pointermove', drag); removeEventListener('pointerup', up) }
            addEventListener('pointermove', drag); addEventListener('pointerup', up)
          }}>
            <canvas ref={canvasRef} />
            {tilePreview && [0, 1, 2].map((index) => <canvas key={index} ref={(element) => { tilePreviewRefs.current[index] = element }} aria-hidden />)}
            {tab === 'Transform' && selected && !tilePreview && <div className="corner-overlay">
              {(['BL', 'BR', 'TR', 'TL'] as const).map((label, index) => {
                const point = selected.transform.corners[index]
                return <button key={label} className="corner-handle" style={{ left: `${point.x * 100}%`, top: `${(1 - point.y) * 100}%` }}
                  title={`${label} corner`} onPointerDown={(event) => dragCorner(index, event)}>{label}</button>
              })}
            </div>}
          </div><div className="canvas-info"><span>{resolution} × {resolution}{tilePreview ? ' • 2 × 2 preview' : ''}</span><span>WebGL2 • RGBA</span></div>
        </div>
        <div className="timeline"><button aria-label={playing ? "Pause animation" : "Play animation"} onClick={() => setPlaying((v) => !v)}>{playing ? '■' : '▶'}</button><input aria-label="Animation time" type="range" min="0" max="10" step=".01" value={time % 10} onChange={(e) => setTime(+e.target.value)} />
          <output>{time.toFixed(2)}s</output><span className="timeline-hint">Drag to scrub</span></div>
        <div className="resize-handle horizontal" role="separator" aria-label="Resize layers panel" onPointerDown={(event) => beginResize('bottom', event)} />
        <div className="layers">
          <div className="layers-head"><b>Layers</b><div><small>Top layer renders last</small><button aria-label="Move layer up" disabled={!selected || layers[0]?.id === selected.id} onClick={() => move(-1)}>↑</button><button aria-label="Move layer down" disabled={!selected || layers[layers.length - 1]?.id === selected.id} onClick={() => move(1)}>↓</button></div></div>
          <div className="layer-list">{!layers.length && <p className="empty-state">Choose a generator from the library to start.</p>}{layers.map((layer) => <div key={layer.id} className={`layer-row ${layer.id === selectedId ? 'selected' : ''}`} onClick={() => setSelectedId(layer.id)}>
            <button aria-label={`${layer.visible ? 'Hide' : 'Show'} ${layer.name}`} className="eye" onClick={(e) => { e.stopPropagation(); commit((old) => old.map((l) => l.id === layer.id ? { ...l, visible: !l.visible } : l)) }}>{layer.visible ? '◉' : '○'}</button>
            <GeneratorThumbnail className="layer-thumb" src={thumbnailUrl(layer.generator)} name={layer.generator.name}
              hue={layer.generator.kind * 13 % 360} shape={(layer.generator.kind % 7) + 1} />
            <input aria-label="Layer name" value={layer.name} onClick={(e) => e.stopPropagation()} onChange={(e) => commit((old) => old.map((l) => l.id === layer.id ? { ...l, name: e.target.value } : l))} />
            <select aria-label={`${layer.name} blend mode`} value={layer.blend} onClick={(e) => e.stopPropagation()} onChange={(e) => commit((old) => old.map((l) => l.id === layer.id ? { ...l, blend: e.target.value as BlendMode } : l))}>{blends.map((b) => <option key={b}>{b}</option>)}</select>
            <input aria-label={`${layer.name} opacity`} className="mini-range" type="range" min="0" max="1" step=".01" value={layer.opacity} onChange={(e) => commit((old) => old.map((l) => l.id === layer.id ? { ...l, opacity: +e.target.value } : l))} />
            <button aria-label={`Duplicate ${layer.name}`} onClick={(e) => { e.stopPropagation(); const copy = { ...structuredClone(layer), id: uid(), name: `${layer.name} Copy` }; commit((old) => [copy, ...old]); setSelectedId(copy.id) }}>⧉</button>
            <button aria-label={`Delete ${layer.name}`} onClick={(e) => { e.stopPropagation(); commit((old) => old.filter((l) => l.id !== layer.id)) }}>×</button></div>)}</div>
        </div>
      </section>
      <div className="resize-handle vertical" role="separator" aria-label="Resize inspector panel" onPointerDown={(event) => beginResize('right', event)} />

      <aside className="inspector panel">
        <div className="inspector-tabs">{(['Generator', 'Transform', 'Color', 'Post', 'Export'] as Tab[]).map((t) => <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>{t}</button>)}</div>
        <div className="inspector-body">{!selected && (tab === 'Generator' || tab === 'Transform') && <p className="empty-state">Add a generator to edit its settings.</p>}
          {tab === 'Generator' && selected && <><section><h3>{selected.generator.name}<small>{selected.generator.category} generator</small></h3><p className="help-text">{selected.generator.description}</p>
            {selected.generator.parameters.map((p) => <Slider key={p.key} label={p.label} value={selected.params[p.key]} min={p.min} max={p.max} step={p.step} onChange={(v) => patch({ params: { ...selected.params, [p.key]: v } })} />)}
            {selected.generator.seeded && <><Slider label="Seed" value={selected.seed} min={0} max={10000} step={1} onChange={(seed) => patch({ seed })} /><button className="wide" onClick={() => patch({ seed: Math.floor(Math.random() * 10000) })}>⤨ Randomize seed</button></>}
            {selected.generator.animated && <Slider label="Animation speed" value={selected.speed} min={-2} max={2} step={.05} onChange={(speed) => patch({ speed })} />}
            {selected.generator.tileable && <label className="switch-row"><span>Seamless source<small>Periodic pattern. Inspect edges with 2×2.</small></span><input type="checkbox" checked={selected.seamless} onChange={(e) => patch({ seamless: e.target.checked })} /></label>}
            <button className="wide" onClick={() => patch({ params: { ...selected.generator.defaults } })}>Reset generator settings</button>
          </section><section><h4>Layer</h4><Slider label="Opacity" value={selected.opacity} onChange={(opacity) => patch({ opacity })} /><label className="select-row">Blend mode<select value={selected.blend} onChange={(e) => patch({ blend: e.target.value as BlendMode })}>{blends.map((b) => <option key={b}>{b}</option>)}</select></label></section></>}
          {tab === 'Transform' && selected && <><section><h3>Transform<small>Placement and motion · selected layer</small></h3>{selected.seamless && <p className="help-text">Seamless mode snaps scale and rotation to repeatable values. Polar and spatial post effects are bypassed for this layer.</p>}
            <Slider label="Position X" value={selected.transform.x} min={-1} max={1} onChange={(v) => transform('x', v)} /><Slider label="Position Y" value={selected.transform.y} min={-1} max={1} onChange={(v) => transform('y', v)} />
            <Slider label="Rotation" value={selected.transform.rotation} min={-180} max={180} step={1} onChange={(v) => transform('rotation', v)} /><Slider label="Scale" value={selected.transform.scale} min={.1} max={4} onChange={(v) => transform('scale', v)} /></section>
            <section><h4>UV offset</h4>
              <Slider label="Offset U" value={selected.transform.u} min={-1} max={1} onChange={(v) => transform('u', v)} />
              <Slider label="Offset V" value={selected.transform.v} min={-1} max={1} onChange={(v) => transform('v', v)} />
              <label className="switch-row"><span>Repeat UV<small>Tiles the pattern · a solid fill will not change</small></span><input type="checkbox" checked={selected.transform.uvRepeat} onChange={(e) => patch({ transform: { ...selected.transform, uvRepeat: e.target.checked } })} /></label></section>
            <section><details><summary>Corner warp & edge mask</summary><p className="help-text">Drag preview handles or enter corner coordinates. Feather and roundness mask the frame edges; compact shapes may not reach them.</p>
              <Slider label="Edge Feather" value={selected.transform.feather} min={0} max={.35} onChange={(v) => transform('feather', v)} />
              <Slider label="Corner Roundness" value={selected.transform.roundness} min={0} max={.45} onChange={(v) => transform('roundness', v)} />
              {(['Bottom left', 'Bottom right', 'Top right', 'Top left'] as const).map((label, index) => <div className="corner-sliders" key={label}>
                <Slider label={`${label} X`} value={selected.transform.corners[index].x} min={-.25} max={1.25} onChange={(v) => setCorner(index, 'x', v)} />
                <Slider label={`${label} Y`} value={selected.transform.corners[index].y} min={-.25} max={1.25} onChange={(v) => setCorner(index, 'y', v)} />
              </div>)}
              <button className="wide" onClick={() => patch({ transform: { ...selected.transform, feather: 0, roundness: 0, corners: defaultTransform().corners } })}>Reset corners</button></details></section>
            <section><h4>Scroll animation</h4><Slider label="Horizontal" value={selected.transform.scrollX} min={-2} max={2} onChange={(v) => transform('scrollX', v)} /><Slider label="Vertical" value={selected.transform.scrollY} min={-2} max={2} onChange={(v) => transform('scrollY', v)} />
              <label className="switch-row">Polar coordinates<input type="checkbox" disabled={selected.seamless} checked={selected.polar && !selected.seamless} onChange={(e) => patch({ polar: e.target.checked })} /></label><label className="switch-row">Invert output<input type="checkbox" checked={selected.invert} onChange={(e) => patch({ invert: e.target.checked })} /></label></section></>}
          {tab === 'Color' && <><section><h3>Gradient<small>Shared by all gradient-colored layers</small></h3><Slider label="Gradient mix" value={post.colorMap} onChange={(colorMap) => setPost({ ...post, colorMap })} /><div className="gradient-bar" style={{ background: `linear-gradient(90deg,${gradient.map((s) => `${s.color} ${s.position * 100}%`).join(',')})` }} />
            {gradient.map((stop) => <div className="stop" key={stop.id}><input aria-label="Gradient stop color" type="color" value={stop.color} onChange={(e) => setGradient((old) => old.map((s) => s.id === stop.id ? { ...s, color: e.target.value } : s))} /><input type="range" min="0" max="1" step=".01" aria-label="Gradient stop position" value={stop.position} onChange={(e) => setGradient((old) => old.map((s) => s.id === stop.id ? { ...s, position: +e.target.value } : s).sort((a,b) => a.position-b.position))} /><button aria-label="Delete gradient stop" disabled={gradient.length <= 2} onClick={() => setGradient((old) => old.filter((s) => s.id !== stop.id))}>×</button></div>)}
            <button className="wide" disabled={gradient.length >= 8} onClick={() => setGradient((old) => [...old, { id: uid(), position: .5, color: '#ff6bd6' }].sort((a,b) => a.position-b.position))}>＋ Add color stop</button>
            <div className="presets">{[['#02030a','#5b39ff','#ecf8ff'],['#080001','#ff3b0a','#ffe066'],['#00140f','#00a878','#bdffef'],['#000000','#777777','#ffffff']].map((p, index) => <button aria-label={`${['Violet', 'Fire', 'Mint', 'Grayscale'][index]} gradient preset`} title={`${['Violet', 'Fire', 'Mint', 'Grayscale'][index]} gradient`} key={p.join()} style={{ background: `linear-gradient(90deg,${p})` }} onClick={() => setGradient(p.map((color, i) => ({ id: uid(), position: i / 2, color })))} />)}</div>
          </section>{selected && <section><h4>Selected layer</h4><label className="switch-row">Solid color<input type="checkbox" checked={selected.solid} onChange={(e) => patch({ solid: e.target.checked })} /></label><label className="color-row">Solid output<input type="color" disabled={!selected.solid} value={selected.solidColor} onChange={(e) => patch({ solidColor: e.target.value })} /></label></section>}</>}
          {tab === 'Post' && <section><h3>Post Processing<small>Shared effects · applied to each layer before blending</small></h3>{layers.some((layer) => layer.seamless) && <p className="help-text">Seamless layers bypass Mirror, Kaleidoscope and Swirl to preserve their repeating edges. These effects still apply to other layers. Disable Seamless source in a layer’s Generator settings to enable them.</p>}{(Object.keys(post) as (keyof PostSettings)[]).filter((key) => key !== 'colorMap' && key !== 'vignetteMask').map((key) => <Slider key={key} label={key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())} value={post[key]} onChange={(v) => setPost((old) => ({ ...old, [key]: v }))} />)}<button className="wide" onClick={() => setPost({ ...defaultPost, colorMap: post.colorMap })}>Reset all effects</button></section>}
          {tab === 'Export' && <section><h3>Export Texture<small>Render the current composition</small></h3><label className="select-row">Resolution<select value={resolution} onChange={(e) => setResolution(+e.target.value)}>{[256,512,768,1024,2048].map((n) => <option key={n}>{n}</option>)}</select></label>
            <p className="help-text">PNG preserves transparency. Normal and channel maps use the alpha mask as height. GIF uses binary transparency; animated patterns may not loop seamlessly.</p><div className="export-grid"><button disabled={exporting || !layers.length} onClick={() => void runExport('png')}>PNG<small>{exportBaseName}.png</small></button><button disabled={exporting || !layers.length} onClick={() => void runExport('normal')}>Normal Map<small>Alpha height → tangent normals</small></button>
              <button disabled={exporting || !layers.length} onClick={() => void runExport('channels')}>Channel Pack<small>R: height · G: inverse · B: alpha</small></button><button disabled={exporting || !layers.length} onClick={() => void runExport('gif')}>Animated GIF<small>384px · 2 seconds · 12 fps</small></button><button onClick={saveProject}>Save Preset<small>Editable JSON project</small></button><button onClick={load}>Load Preset<small>Restore JSON project</small></button></div></section>}
        </div>
      </aside>
    </section>
    {notice && <div className="toast" role="status" onClick={() => setNotice('')}>{notice}<button aria-label="Dismiss notification">×</button></div>}
    <footer><span><i className="status-dot" /> Ready</span><span>{layers.length} layer{layers.length === 1 ? '' : 's'} · {catalog.length} generators · GPU accelerated</span><span>Space: Play · Ctrl+S: Save · Ctrl+Z: Undo · Wheel: Zoom</span></footer>
  </main>
}
