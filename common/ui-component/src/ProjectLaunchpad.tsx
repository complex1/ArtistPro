import { useShortcuts } from './shortcuts'
import { useId, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft, ArrowRight, Brush, Check, ChevronDown, Clock3, FileImage,
  FolderOpen, Grid2X2, Layers3, List, LoaderCircle, Monitor, MoveUpRight,
  Paintbrush, PenTool, Play, Plus, Search, Shapes, SlidersHorizontal,
  Sparkles, Spline, Trash2, WandSparkles, X, type LucideIcon,
} from 'lucide-react'
import { formatRelativeTime } from '@artist-studio/utils'
import { LaunchpadArtwork } from './LaunchpadArtwork'
import './project-launchpad.css'

type Tool = 'svg' | 'paint' | 'cel'
type Project = { id: string; name: string; width: number; height: number; updatedAt: number }
type Preset = { id: string; label: string; width: number; height: number }
type Feature = { icon: LucideIcon; title: string; detail: string }

export type ProjectLaunchpadProps = {
  tool: Tool
  projects: Project[]
  loading: boolean
  error: string | null
  name: string
  onNameChange: (name: string) => void
  size?: string
  onSizeChange?: (size: string) => void
  presets?: readonly Preset[]
  creating: boolean
  createError: string | null
  onCreate: () => void
  onOpen: (id: string) => void
  onDelete: (project: { id: string; name: string }) => void
  onBack: () => void
  onRefresh: () => void
  onPlayground?: () => void
}

const copy: Record<Tool, {
  title: string; subtitle: string; icon: LucideIcon; eyebrow: string;
  heading: [string, string]; description: string; artworkLabel: string;
  createTitle: string; createDescription: string; createLabel: string;
  emptyTitle: string; emptyDetail: string; features: Feature[];
}> = {
  paint: {
    title: 'Animated Paint', subtitle: 'Living brush studio', icon: Paintbrush,
    eyebrow: 'A little motion. A lot of possibility.',
    heading: ['Every stroke,', 'a little more alive.'],
    description: 'Paint with brushes that flow, wiggle, and pulse. Turn a simple gesture into something unexpected.',
    artworkLabel: 'Made for motion', createTitle: 'Start a living canvas',
    createDescription: 'Give your next idea room to move.', createLabel: 'Create canvas',
    emptyTitle: 'Your next moving idea starts here.',
    emptyDetail: 'Create a canvas or explore the brush playground. Your projects will appear here.',
    features: [
      { icon: Brush, title: 'Expressive brushes', detail: 'Procedural strokes with personality' },
      { icon: Play, title: 'Built-in motion', detail: 'Wiggle, flow, pulse, and emit' },
      { icon: SlidersHorizontal, title: 'Make it your own', detail: 'Fine-tune each brush’s behavior' },
    ],
  },
  svg: {
    title: 'SVG Studio', subtitle: 'Vector & motion design', icon: PenTool,
    eyebrow: 'From the first point to the final frame',
    heading: ['Small points.', 'Big possibilities.'],
    description: 'Shape precise vectors, explore color, and bring your artwork to life with animation.',
    artworkLabel: 'Precision meets play', createTitle: 'Start a new canvas',
    createDescription: 'A fresh artboard for your next idea.', createLabel: 'Create canvas',
    emptyTitle: 'A blank canvas. Endless directions.',
    emptyDetail: 'Start your first vector project. Shapes, paths, and animation are waiting inside.',
    features: [
      { icon: Spline, title: 'Precise paths', detail: 'Draw and refine every curve' },
      { icon: Shapes, title: 'Shape your ideas', detail: 'Build with shapes, fills, and layers' },
      { icon: Play, title: 'Add a little motion', detail: 'Animate your vector artwork' },
    ],
  },
  cel: {
    title: 'Cel', subtitle: 'Cartoon restoration studio', icon: Sparkles,
    eyebrow: 'A fresh chapter for every frame',
    heading: ['Old frames.', 'New life.'],
    description: 'Restore the charm in your cartoon stills. Clean up an image, refine its color, and turn it into vector art.',
    artworkLabel: 'Restore. Refine. Reimagine.', createTitle: 'Start a restoration',
    createDescription: 'Every great restoration starts with a still.', createLabel: 'Create project',
    emptyTitle: 'Give a favorite frame a fresh start.',
    emptyDetail: 'Create a project, then drop in a cartoon still to start restoring it.',
    features: [
      { icon: FileImage, title: 'Start with a still', detail: 'Bring in a PNG, JPEG, or WebP' },
      { icon: WandSparkles, title: 'Restore the details', detail: 'Clean up lines and refine color' },
      { icon: PenTool, title: 'Make it vector', detail: 'Trace your image into SVG' },
    ],
  },
}

const presetNames: Record<string, string> = {
  '800x600': 'Classic', '1280x720': 'Wide', '1080x1080': 'Square', '1920x1080': 'Full HD',
}

export function ProjectLaunchpad(props: ProjectLaunchpadProps) {
  const { tool, projects, loading, error, name, onNameChange, size, onSizeChange,
    presets, creating, createError, onCreate, onOpen, onDelete, onBack, onRefresh, onPlayground } = props
  const content = copy[tool]
  const Icon = content.icon
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('recent')
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const nameRef = useRef<HTMLInputElement>(null)
  const formId = useId()
  const selectedPreset = presets?.find(preset => preset.id === size)
  const visibleProjects = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    return projects.filter(project => project.name.toLocaleLowerCase().includes(needle))
      .sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name) : b.updatedAt - a.updatedAt)
  }, [projects, query, sort])

  function focusCreation() {
    nameRef.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'center' })
    nameRef.current?.focus({ preventScroll: true })
    nameRef.current?.select()
  }

  useShortcuts([{ keys: 'Mod+Alt+n', label: 'Focus new project form', run: focusCreation, enabled: !creating }])

  return (
    <div className={`lp-shell lp-${tool}`}>
      <header className="lp-topbar">
        <button className="lp-back" type="button" aria-label="Back to Artist Pro" onClick={onBack}><ArrowLeft size={15} /> <span>Artist Pro</span></button>
        <span className="lp-header-divider" />
        <div className="lp-brand"><span className="lp-brand-icon"><Icon size={18} /></span><div><strong>{content.title}</strong><span>{content.subtitle}</span></div></div>
        <div className="lp-topbar-end"><span className="lp-local"><Monitor size={13} /> Your workspace</span><button className="lp-topbar-new" type="button" onClick={focusCreation}><Plus size={14} /> New project</button></div>
      </header>

      <main className="lp-scroll">
        <div className="lp-main">
          <div className="lp-intro"><span><span className="lp-status-dot" /> LET’S MAKE SOMETHING</span><span>Your ideas belong here.</span></div>
          <section className="lp-start" aria-label={`Get started with ${content.title}`}>
            <div className="lp-hero">
              <div className="lp-hero-copy">
                <p className="lp-eyebrow">{content.eyebrow}</p>
                <h1>{content.heading[0]}<br /><em>{content.heading[1]}</em></h1>
                <p className="lp-description">{content.description}</p>
                {onPlayground ? <button className="lp-hero-link" type="button" onClick={onPlayground}><Play size={13} fill="currentColor" /> Explore brush playground <ArrowRight size={15} /></button>
                  : <button className="lp-hero-link" type="button" onClick={focusCreation}>Let’s get started <ArrowRight size={15} /></button>}
              </div>
              <div className="lp-hero-art"><LaunchpadArtwork tool={tool} /><span className="lp-art-caption"><span />{content.artworkLabel}</span></div>
            </div>

            <form className="lp-create" onSubmit={event => { event.preventDefault(); if (!creating) onCreate() }} aria-labelledby={`${formId}-title`}>
              <div className="lp-create-heading"><span className="lp-create-icon"><Plus size={19} /></span><MoveUpRight size={17} /></div>
              <h2 id={`${formId}-title`}>{content.createTitle}</h2>
              <p>{content.createDescription}</p>
              <label className="lp-field" htmlFor={`${formId}-name`}>Project name<input ref={nameRef} id={`${formId}-name`} value={name} onChange={event => onNameChange(event.target.value)} placeholder="Untitled" maxLength={120} disabled={creating} autoComplete="off" /></label>
              {presets && onSizeChange ? <fieldset className="lp-presets" disabled={creating}>
                <legend>Canvas size <span>px</span></legend>
                <div>{presets.map(preset => <button type="button" key={preset.id} aria-pressed={size === preset.id} onClick={() => onSizeChange(preset.id)} className={size === preset.id ? 'is-selected' : ''} aria-label={`${presetNames[preset.id] ?? 'Canvas'} ${preset.label}`}>
                  <span className="lp-preset-shape" style={{ aspectRatio: `${preset.width} / ${preset.height}`, width: preset.width === preset.height ? 18 : 25 }} />
                  <span><strong>{presetNames[preset.id] ?? 'Custom'}</strong><small>{preset.width} × {preset.height}</small></span>
                  {size === preset.id && <Check size={11} className="lp-preset-check" />}
                </button>)}</div>
              </fieldset> : <div className="lp-import-note"><span className="lp-import-icon"><FileImage size={24} /><Plus size={10} /></span><strong>Bring your still into the studio</strong><p>After creating a project, drop an image into the editor to begin.</p><span className="lp-file-types"><span>PNG</span><span>JPEG</span><span>WebP</span></span></div>}
              {createError && <p className="lp-form-error" role="alert">{createError}</p>}
              <button className="lp-primary" type="submit" disabled={creating}>{creating ? <LoaderCircle size={16} className="lp-spinner" /> : <Plus size={16} />}{creating ? 'Creating…' : content.createLabel}{!creating && <ArrowRight size={16} />}</button>
              <div className="lp-create-footer">{selectedPreset ? <><span className="lp-status-dot" />{selectedPreset.width} × {selectedPreset.height} px · Ready for your ideas</> : <><Layers3 size={12} />Original image stays with your project</>}</div>
            </form>

            <div className="lp-features">{content.features.map(feature => <div key={feature.title} className="lp-feature"><span><feature.icon size={18} strokeWidth={1.6} /></span><div><strong>{feature.title}</strong><p>{feature.detail}</p></div></div>)}</div>
          </section>

          <section className="lp-library" aria-labelledby={`${formId}-library`}>
            <div className="lp-library-heading"><div><span className="lp-section-eyebrow">PICK UP WHERE YOU LEFT OFF</span><h2 id={`${formId}-library`}>Your projects <span>{projects.length}</span></h2></div>
              <div className="lp-library-controls"><label className="lp-search"><Search size={15} /><input type="search" value={query} onChange={event => setQuery(event.target.value)} aria-label="Search projects" placeholder="Search projects…" />{query && <button type="button" aria-label="Clear search" onClick={() => setQuery('')}><X size={13} /></button>}</label><label className="lp-sort"><select aria-label="Sort projects" value={sort} onChange={event => setSort(event.target.value)}><option value="recent">Last edited</option><option value="name">Name A–Z</option></select><ChevronDown size={12} /></label><div className="lp-view-switch" role="group" aria-label="Project view"><button type="button" aria-label="Grid view" aria-pressed={view === 'grid'} onClick={() => setView('grid')}><Grid2X2 size={15} /></button><button type="button" aria-label="List view" aria-pressed={view === 'list'} onClick={() => setView('list')}><List size={16} /></button></div></div>
            </div>
            {error && <div className="lp-library-error" role="alert"><span>{error}</span><button type="button" onClick={onRefresh}>Try again</button></div>}
            {loading ? <div className="lp-loading" role="status"><LoaderCircle size={18} className="lp-spinner" /> Loading your projects…</div>
              : visibleProjects.length > 0 ? <ul className={`lp-projects is-${view}`}>{visibleProjects.map(project => <li className="lp-project" key={project.id}>
                <button type="button" className="lp-project-open" onClick={() => onOpen(project.id)} aria-label={`Open ${project.name}`}>
                  <div className="lp-project-preview" aria-hidden="true"><span className="lp-document" style={{ aspectRatio: project.width && project.height ? `${project.width} / ${project.height}` : '4 / 3' }}><Icon size={23} strokeWidth={1.3} /><i /><i /><i /><i /></span><span className="lp-project-tag">{tool === 'svg' ? 'VECTOR' : tool === 'paint' ? 'MOTION' : 'RESTORATION'}</span><span className="lp-project-arrow"><ArrowRight size={16} /></span></div>
                  <div className="lp-project-details"><strong>{project.name}</strong><span>{project.width > 0 ? `${project.width} × ${project.height}` : 'No image yet'}<span className="lp-dot">·</span><Clock3 size={11} />{formatRelativeTime(project.updatedAt)}</span></div>
                </button>
                <button className="lp-project-delete" type="button" aria-label={`Delete ${project.name}`} onClick={() => onDelete(project)}><Trash2 size={14} /></button>
              </li>)}</ul>
                : <div className="lp-empty"><div className="lp-empty-art" aria-hidden="true"><span /><span /><span><FolderOpen size={29} strokeWidth={1.3} /></span></div><div><h3>{query ? 'No projects found' : error ? 'Your library is unavailable' : content.emptyTitle}</h3><p>{query ? `No project names match “${query}”. Try another search.` : error ? 'Try loading your projects again.' : content.emptyDetail}</p></div><button type="button" className="lp-empty-action" onClick={query ? () => setQuery('') : error ? onRefresh : focusCreation}>{query ? 'Clear search' : error ? 'Reload library' : 'Start a project'}<ArrowRight size={15} /></button></div>}
          </section>
          <footer className="lp-footer"><span><Icon size={13} />{content.title}</span><span>A space for your next great idea.</span></footer>
        </div>
      </main>
    </div>
  )
}
