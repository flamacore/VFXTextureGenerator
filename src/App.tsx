import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from 'react'
import './App.css'
import { catalog, categories, type Generator } from './catalog'
import { defaultPost, makeLayer, type BlendMode, type GradientStop, type Layer, type PostSettings } from './models'
import { TextureRenderer } from './renderer'
import { exportChannelPack, exportGif, exportNormalMap, exportPng, exportPreset, loadPreset } from './exporters'

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
  const commitDraft = () => {
    const parsed = Number(draft)
    if (Number.isFinite(parsed)) onChange(Math.min(max, Math.max(min, parsed)))
    else setDraft(String(Number(value.toFixed(4))))
  }
  return <label className="control"><span>{label}<input className="control-number" type="number" value={draft} min={min} max={max} step={step}
    onChange={(event) => setDraft(event.target.value)} onBlur={commitDraft} onKeyDown={(event) => {
      if (event.key === 'Enter') event.currentTarget.blur()
      if (event.key === 'Escape') { setDraft(String(Number(value.toFixed(4)))); event.currentTarget.blur() }
    }} /></span>
    <input type="range" value={value} min={min} max={max} step={step} onChange={(e) => onChange(+e.target.value)} /></label>
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
  const past = useRef<Layer[][]>([]), future = useRef<Layer[][]>([])
  const initial = useMemo(() => makeLayer(catalog[8]), [])
  const [layers, setLayers] = useState<Layer[]>([initial])
  const [selectedId, setSelectedId] = useState(initial.id)
  const [gradient, setGradient] = useState<GradientStop[]>([
    { id: uid(), position: 0, color: '#ffffff' }, { id: uid(), position: 1, color: '#ffffff' },
  ])
  const [post, setPost] = useState<PostSettings>(defaultPost)
  const [query, setQuery] = useState(''), [category, setCategory] = useState('All')
  const [tab, setTab] = useState<Tab>('Generator'), [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0), [zoom, setZoom] = useState(.72)
  const [pan, setPan] = useState({ x: 0, y: 0 }), [background, setBackground] = useState<'checker' | 'black'>('checker')
  const [tilePreview, setTilePreview] = useState(false)
  const [leftPanelWidth, setLeftPanelWidth] = useState(248)
  const [rightPanelWidth, setRightPanelWidth] = useState(288)
  const [bottomPanelHeight, setBottomPanelHeight] = useState(177)
  const [resolution, setResolution] = useState(768), [notice, setNotice] = useState('')
  const selected = layers.find((l) => l.id === selectedId) ?? layers[0]
  const filtered = useMemo(() => catalog.filter((g) => (category === 'All' || g.category === category) &&
    g.name.toLowerCase().includes(query.toLowerCase())), [category, query])
  const exportBaseName = useMemo(() => layers.slice(0, 3).map((layer) => safeFilenamePart(layer.name))
    .filter(Boolean).join('-') || 'VFX-Texture', [layers])

  const commit = useCallback((change: Layer[] | ((old: Layer[]) => Layer[])) => setLayers((old) => {
    past.current.push(structuredClone(old)); if (past.current.length > 80) past.current.shift(); future.current = []
    return typeof change === 'function' ? change(old) : change
  }), [])
  const undo = useCallback(() => { const item = past.current.pop(); if (item) setLayers((old) => (future.current.push(structuredClone(old)), item)) }, [])
  const redo = useCallback(() => { const item = future.current.pop(); if (item) setLayers((old) => (past.current.push(structuredClone(old)), item)) }, [])
  const patch = (value: Partial<Layer>) => selected && commit((old) => old.map((l) => l.id === selected.id ? { ...l, ...value } : l))
  const transform = (key: keyof Layer['transform'], value: number) => selected && patch({ transform: { ...selected.transform, [key]: value } })
  const add = (generator: Generator) => { const layer = makeLayer(generator); commit((old) => [layer, ...old]); setSelectedId(layer.id) }

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
      if (cmd && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo() }
      if (cmd && e.key.toLowerCase() === 'y') { e.preventDefault(); redo() }
      if (e.code === 'Space' && !(e.target instanceof HTMLInputElement)) { e.preventDefault(); setPlaying((v) => !v) }
      if (e.key === 'Delete' && selected) commit((old) => old.filter((l) => l.id !== selected.id))
      if (cmd && e.key.toLowerCase() === 'd' && selected) { e.preventDefault(); const copy = { ...structuredClone(selected), id: uid(), name: `${selected.name} Copy` }; commit((old) => [copy, ...old]); setSelectedId(copy.id) }
    }
    addEventListener('keydown', keys); return () => removeEventListener('keydown', keys)
  }, [commit, redo, selected, undo])

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
  const gif = async () => {
    if (!canvasRef.current) return
    try {
      const frames: ImageData[] = []
      for (let i = 0; i < 24; i++) { renderer.current?.render(canvasRef.current, layers, gradient, post, i / 12, 384); frames.push(canvasRef.current.getContext('2d')!.getImageData(0, 0, 384, 384)) }
      await exportGif(frames, 12, `${exportBaseName}.gif`)
    } catch (e) { setNotice(e instanceof Error ? e.message : 'GIF export failed') }
    finally { renderer.current?.render(canvasRef.current, layers, gradient, post, time, resolution) }
  }
  const load = async () => {
    try {
      const preset = await loadPreset()
      if (!preset) return
      const restored = preset.layers.map((layer) => {
        const generator = catalog.find((item) => item.name === layer.generator?.name)
        if (!generator) throw new Error(`Preset uses an unknown generator: ${layer.generator?.name ?? 'unnamed'}`)
        return {
          ...makeLayer(generator),
          ...layer,
          generator,
          seamless: Boolean(layer.seamless && generator.tileable),
          params: { ...generator.defaults, ...layer.params },
        }
      })
      if (!restored.length) throw new Error('Preset has no layers')
      past.current.push(structuredClone(layers))
      future.current = []
      setLayers(restored)
      setSelectedId(restored[0].id)
      setGradient(preset.gradient.map((stop) => ({ ...stop, id: stop.id || uid() })).sort((a, b) => a.position - b.position))
      setPost({ ...defaultPost, ...preset.post })
      setNotice('Preset loaded')
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Preset could not be loaded')
    }
  }

  return <main className="app-shell">
    <header className="topbar">
      <div className="brand"><span className="brand-mark">✦</span><b>VFX Texture Generator</b><span className="badge">CLEAN ROOM</span></div>
      <div className="toolbar"><button onClick={undo}><Icon>↶</Icon>Undo</button><button onClick={redo}><Icon>↷</Icon>Redo</button><button onClick={load}><Icon>⌁</Icon>Load</button><i className="divider" />
        <button className={playing ? 'active' : ''} onClick={() => setPlaying((v) => !v)}><Icon>{playing ? '■' : '▶'}</Icon>{playing ? 'Stop' : 'Animate'}</button>
        <button className="primary" onClick={() => canvasRef.current && exportPng(canvasRef.current, `${exportBaseName}.png`)}><Icon>⇩</Icon>Export</button></div>
    </header>

    <section className="workspace" style={{ gridTemplateColumns: `${leftPanelWidth}px 5px minmax(360px, 1fr) 5px ${rightPanelWidth}px` }}>
      <aside className="library panel">
        <div className="panel-title"><b>Generators</b><small>{catalog.length} procedural nodes</small></div>
        <div className="search"><Icon>⌕</Icon><input aria-label="Search generators" placeholder="Search generators…" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
        <div className="category-tabs">{['All', ...categories].map((c) => <button key={c} className={category === c ? 'active' : ''} onClick={() => setCategory(c)}>{c}</button>)}</div>
        <div className="generator-list" ref={generatorListRef}>{filtered.map((g) =>
          <GeneratorRow key={g.name} generator={g} rootRef={generatorListRef} onAdd={add} />)}</div>
      </aside>
      <div className="resize-handle vertical" role="separator" aria-label="Resize generator panel" onPointerDown={(event) => beginResize('left', event)} />

      <section className="stage-column" style={{ gridTemplateRows: `38px minmax(180px, 1fr) 35px 5px ${bottomPanelHeight}px` }}>
        <div className="stagebar"><b>Preview</b><div><button className={background === 'checker' ? 'active' : ''} onClick={() => setBackground('checker')}>▦</button>
          <button className={background === 'black' ? 'active' : ''} onClick={() => setBackground('black')}>●</button><i className="divider" />
          <button className={tilePreview ? 'active' : ''} title="Inspect the texture as a 2 × 2 tile" onClick={() => setTilePreview((value) => !value)}>2×2</button><i className="divider" />
          <button onClick={() => setZoom((z) => Math.max(.2, z - .1))}>−</button><output>{Math.round(zoom * 100)}%</output><button onClick={() => setZoom((z) => Math.min(2, z + .1))}>＋</button>
          <button onClick={() => { setZoom(.72); setPan({ x: 0, y: 0 }) }}>Fit</button></div></div>
        <div className={`stage ${background}`} onWheel={(e) => { e.preventDefault(); setZoom((z) => Math.max(.2, Math.min(2, z - e.deltaY * .001))) }}>
          <div className={`preview-canvas-group ${tilePreview ? 'tiled' : ''}`} style={{ transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})` }} onPointerDown={(e) => {
            const start = { x: e.clientX - pan.x, y: e.clientY - pan.y }; e.currentTarget.setPointerCapture(e.pointerId)
            const drag = (m: PointerEvent) => setPan({ x: m.clientX - start.x, y: m.clientY - start.y })
            const up = () => { removeEventListener('pointermove', drag); removeEventListener('pointerup', up) }
            addEventListener('pointermove', drag); addEventListener('pointerup', up)
          }}>
            <canvas ref={canvasRef} />
            {tilePreview && [0, 1, 2].map((index) => <canvas key={index} ref={(element) => { tilePreviewRefs.current[index] = element }} aria-hidden />)}
          </div><div className="canvas-info"><span>{resolution} × {resolution}{tilePreview ? ' • 2 × 2 preview' : ''}</span><span>WebGL2 • RGBA</span></div>
        </div>
        <div className="timeline"><button onClick={() => setPlaying((v) => !v)}>{playing ? '■' : '▶'}</button><input type="range" min="0" max="10" step=".01" value={time % 10} onChange={(e) => setTime(+e.target.value)} />
          <output>{time.toFixed(2)}s</output><label>Speed <input type="number" value={selected?.speed ?? 0} step=".1" onChange={(e) => patch({ speed: +e.target.value })} /></label></div>
        <div className="resize-handle horizontal" role="separator" aria-label="Resize layers panel" onPointerDown={(event) => beginResize('bottom', event)} />
        <div className="layers">
          <div className="layers-head"><b>Layers</b><div><button onClick={() => add(catalog[0])}>＋ Add</button><button onClick={() => move(-1)}>↑</button><button onClick={() => move(1)}>↓</button></div></div>
          <div className="layer-list">{layers.map((layer) => <div key={layer.id} className={`layer-row ${layer.id === selectedId ? 'selected' : ''}`} onClick={() => setSelectedId(layer.id)}>
            <button className="eye" onClick={(e) => { e.stopPropagation(); commit((old) => old.map((l) => l.id === layer.id ? { ...l, visible: !l.visible } : l)) }}>{layer.visible ? '◉' : '○'}</button>
            <GeneratorThumbnail className="layer-thumb" src={thumbnailUrl(layer.generator)} name={layer.generator.name}
              hue={layer.generator.kind * 13 % 360} shape={(layer.generator.kind % 7) + 1} />
            <input value={layer.name} onClick={(e) => e.stopPropagation()} onChange={(e) => commit((old) => old.map((l) => l.id === layer.id ? { ...l, name: e.target.value } : l))} />
            <select value={layer.blend} onClick={(e) => e.stopPropagation()} onChange={(e) => commit((old) => old.map((l) => l.id === layer.id ? { ...l, blend: e.target.value as BlendMode } : l))}>{blends.map((b) => <option key={b}>{b}</option>)}</select>
            <input className="mini-range" type="range" min="0" max="1" step=".01" value={layer.opacity} onChange={(e) => commit((old) => old.map((l) => l.id === layer.id ? { ...l, opacity: +e.target.value } : l))} />
            <label className={`layer-seam ${layer.generator.tileable ? '' : 'disabled'}`} title={layer.generator.tileable ? 'Generate this layer with periodic source math' : 'This generator is not intended to tile'} onClick={(event) => event.stopPropagation()}>
              <input type="checkbox" disabled={!layer.generator.tileable} checked={layer.seamless && layer.generator.tileable} onChange={(event) => commit((old) => old.map((item) => item.id === layer.id ? { ...item, seamless: event.target.checked } : item))} />
              <span>Seamless</span>
            </label>
            <button onClick={(e) => { e.stopPropagation(); const copy = { ...structuredClone(layer), id: uid(), name: `${layer.name} Copy` }; commit((old) => [copy, ...old]); setSelectedId(copy.id) }}>⧉</button>
            <button onClick={(e) => { e.stopPropagation(); commit((old) => old.filter((l) => l.id !== layer.id)) }}>×</button></div>)}</div>
        </div>
      </section>
      <div className="resize-handle vertical" role="separator" aria-label="Resize inspector panel" onPointerDown={(event) => beginResize('right', event)} />

      <aside className="inspector panel">
        <div className="inspector-tabs">{(['Generator', 'Transform', 'Color', 'Post', 'Export'] as Tab[]).map((t) => <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>{t}</button>)}</div>
        <div className="inspector-body">
          {tab === 'Generator' && selected && <><section><h3>{selected.generator.name}<small>{selected.generator.category} generator</small></h3>
            {selected.generator.parameters.map((p) => <Slider key={p.key} label={p.label} value={selected.params[p.key]} min={p.min} max={p.max} step={p.step} onChange={(v) => patch({ params: { ...selected.params, [p.key]: v } })} />)}
            <Slider label="Seed" value={selected.seed} min={0} max={10000} step={1} onChange={(seed) => patch({ seed })} /><button className="wide" onClick={() => patch({ seed: Math.floor(Math.random() * 10000) })}>⤨ Randomize seed</button>
          </section><section><h4>Layer</h4><Slider label="Opacity" value={selected.opacity} onChange={(opacity) => patch({ opacity })} /><label className="select-row">Blend mode<select value={selected.blend} onChange={(e) => patch({ blend: e.target.value as BlendMode })}>{blends.map((b) => <option key={b}>{b}</option>)}</select></label></section></>}
          {tab === 'Transform' && selected && <><section><h3>Transform<small>Placement and motion</small></h3>
            <Slider label="Position X" value={selected.transform.x} min={-1} max={1} onChange={(v) => transform('x', v)} /><Slider label="Position Y" value={selected.transform.y} min={-1} max={1} onChange={(v) => transform('y', v)} />
            <Slider label="Rotation" value={selected.transform.rotation} min={-180} max={180} step={1} onChange={(v) => transform('rotation', v)} /><Slider label="Scale" value={selected.transform.scale} min={.1} max={4} onChange={(v) => transform('scale', v)} /></section>
            <section><h4>Scroll animation</h4><Slider label="Horizontal" value={selected.transform.scrollX} min={-2} max={2} onChange={(v) => transform('scrollX', v)} /><Slider label="Vertical" value={selected.transform.scrollY} min={-2} max={2} onChange={(v) => transform('scrollY', v)} />
              <label className="switch-row">Polar coordinates<input type="checkbox" checked={selected.polar} onChange={(e) => patch({ polar: e.target.checked })} /></label><label className="switch-row">Invert output<input type="checkbox" checked={selected.invert} onChange={(e) => patch({ invert: e.target.checked })} /></label></section></>}
          {tab === 'Color' && selected && <><section><h3>Gradient<small>Output color mapping</small></h3><div className="gradient-bar" style={{ background: `linear-gradient(90deg,${gradient.map((s) => `${s.color} ${s.position * 100}%`).join(',')})` }} />
            {gradient.map((stop) => <div className="stop" key={stop.id}><input type="color" value={stop.color} onChange={(e) => setGradient((old) => old.map((s) => s.id === stop.id ? { ...s, color: e.target.value } : s))} /><input type="range" min="0" max="1" step=".01" value={stop.position} onChange={(e) => setGradient((old) => old.map((s) => s.id === stop.id ? { ...s, position: +e.target.value } : s).sort((a,b) => a.position-b.position))} /><button disabled={gradient.length <= 2} onClick={() => setGradient((old) => old.filter((s) => s.id !== stop.id))}>×</button></div>)}
            <button className="wide" onClick={() => setGradient((old) => [...old, { id: uid(), position: .5, color: '#ff6bd6' }].sort((a,b) => a.position-b.position))}>＋ Add color stop</button>
            <div className="presets">{[['#02030a','#5b39ff','#ecf8ff'],['#080001','#ff3b0a','#ffe066'],['#00140f','#00a878','#bdffef'],['#000','#777','#fff']].map((p) => <button key={p.join()} style={{ background: `linear-gradient(90deg,${p})` }} onClick={() => setGradient(p.map((color, i) => ({ id: uid(), position: i / 2, color })))} />)}</div>
          </section><section><label className="switch-row">Solid color<input type="checkbox" checked={selected.solid} onChange={(e) => patch({ solid: e.target.checked })} /></label><label className="color-row">Solid output<input type="color" value={selected.solidColor} onChange={(e) => patch({ solidColor: e.target.value })} /></label></section></>}
          {tab === 'Post' && <section><h3>Post Processing<small>Applied to final output</small></h3>{(Object.keys(post) as (keyof PostSettings)[]).map((key) => <Slider key={key} label={key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())} value={post[key]} onChange={(v) => setPost((old) => ({ ...old, [key]: v }))} />)}<button className="wide" onClick={() => setPost(defaultPost)}>Reset all effects</button></section>}
          {tab === 'Export' && <section><h3>Export Texture<small>Render the current composition</small></h3><label className="select-row">Resolution<select value={resolution} onChange={(e) => setResolution(+e.target.value)}>{[256,512,768,1024,2048].map((n) => <option key={n}>{n}</option>)}</select></label>
            <div className="export-grid"><button onClick={() => canvasRef.current && exportPng(canvasRef.current, `${exportBaseName}.png`)}>PNG<small>{exportBaseName}.png</small></button><button onClick={() => canvasRef.current && exportNormalMap(canvasRef.current, `${exportBaseName}-Normal.png`)}>Normal Map<small>Height to normal</small></button>
              <button onClick={() => canvasRef.current && exportChannelPack(canvasRef.current, `${exportBaseName}-Channels.png`)}>Channel Pack<small>RGB packed</small></button><button onClick={gif}>Animated GIF<small>24 frames · 12 fps</small></button><button onClick={() => exportPreset(layers, gradient, post, `${exportBaseName}.json`)}>Save Preset<small>Editable JSON project</small></button><button onClick={load}>Load Preset<small>Restore JSON project</small></button></div></section>}
        </div>
      </aside>
    </section>
    {notice && <div className="toast" onClick={() => setNotice('')}>{notice}<button>×</button></div>}
    <footer><span><i className="status-dot" /> Ready</span><span>{layers.length} layer{layers.length === 1 ? '' : 's'} · {catalog.length} generators · GPU accelerated</span><span>Space: Play · Ctrl+Z: Undo · Wheel: Zoom</span></footer>
  </main>
}
