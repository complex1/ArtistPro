import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  Copy,
  Edit3,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react'
import { navigate } from '../../../app/routes'
import { Button } from '../../../ui/controls'
import { lastPaintProjectV2 } from '../library'
import {
  deleteCustomBrush,
  duplicateBrush,
  listAllBrushes,
  saveCustomBrush,
} from '../brushLibrary'
import { importBrushJson } from '../brushTransfer'
import { createBrushV2 } from '../core/defaults'
import type { BrushV2 } from '../core/types'
import { BrushPreview } from '../ui/BrushPreview'

export function BrushLibraryPage() {
  const importRef = useRef<HTMLInputElement>(null)
  const [brushes, setBrushes] = useState<BrushV2[]>([])
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [hoveredBrush, setHoveredBrush] = useState<string | null>(null)
  const [focusedBrush, setFocusedBrush] = useState<string | null>(null)
  const activePreview = hoveredBrush ?? focusedBrush
  const [lastProject, setLastProject] = useState<
    Awaited<ReturnType<typeof lastPaintProjectV2>>
  >()

  const refresh = () => {
    void listAllBrushes().then(setBrushes)
    setOpenMenu(null)
  }

  useEffect(() => {
    void listAllBrushes().then(setBrushes)
    void lastPaintProjectV2().then(setLastProject)
  }, [])

  const edit = (brush: BrushV2) =>
    navigate({ page: 'paint-playground', brushId: brush.id })

  const createBlank = () => {
    void saveCustomBrush(
      createBrushV2({ name: 'Untitled brush', category: 'Custom' }),
    ).then(edit)
  }

  const rename = (brush: BrushV2) => {
    const name = window.prompt('Rename brush', brush.name)?.trim()
    if (!name || name === brush.name) return
    void saveCustomBrush({ ...brush, name }).then(refresh)
  }

  const duplicate = (brush: BrushV2) => {
    void duplicateBrush(brush).then((copy) => {
      refresh()
      edit(copy)
    })
  }

  const remove = (brush: BrushV2) => {
    if (!window.confirm(`Delete “${brush.name}”?`)) return
    void deleteCustomBrush(brush.id).then(refresh)
  }

  const importBrush = async (file: File) => {
    const brush = importBrushJson(await file.text())
    if (!brush) {
      window.alert('That file is not a valid brush config.')
      return
    }
    await saveCustomBrush(brush)
    edit(brush)
  }

  return (
    <div className="brush-library-page">
      <header className="app-header brush-library-header">
        <div className="brand">
          <button
            type="button"
            className="studio-crumb"
            onClick={() => navigate({ page: 'home' })}
          >
            Artist Pro
          </button>
          <b>/</b>
          <button
            type="button"
            className="studio-crumb"
            onClick={() => navigate({ page: 'paint-home' })}
          >
            Animated Paint
          </button>
          <b>/</b>
          <strong>Brushes</strong>
        </div>
        <div className="header-actions">
          {lastProject ? (
            <Button
              title={`Back to ${lastProject.name}`}
              aria-label={`Back to ${lastProject.name}`}
              onClick={() =>
                navigate({ page: 'paint-editor', projectId: lastProject.id })
              }
            >
              <ArrowLeft size={14} /> Back to {lastProject.name}
            </Button>
          ) : null}
          <Button onClick={() => importRef.current?.click()}>
            <Upload size={14} /> Import brush
          </Button>
          <input
            ref={importRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void importBrush(file)
              event.currentTarget.value = ''
            }}
          />
        </div>
      </header>

      <main className="brush-library-content">
        <div className="brush-library-heading">
          <div>
            <p className="studio-kicker">Brush library</p>
            <h1>Build and manage brushes</h1>
            <p>Hover to preview motion. Open a brush to tune its mark and animation code.</p>
          </div>
          <span>{brushes.length} brushes</span>
        </div>

        <div className="brush-card-grid">
          <button
            type="button"
            className="brush-card brush-card-blank"
            onClick={createBlank}
          >
            <span><Plus size={24} /></span>
            <strong>New brush</strong>
            <small>Start from a blank brush</small>
          </button>

          {brushes.map((brush) => (
            <article
              className="brush-card"
              key={brush.id}
              onMouseEnter={() => setHoveredBrush(brush.id)}
              onMouseLeave={() => setHoveredBrush((current) => current === brush.id ? null : current)}
              onFocus={(event) => {
                if (event.target instanceof HTMLElement && event.target.matches(':focus-visible')) setFocusedBrush(brush.id)
              }}
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                  setFocusedBrush((current) => current === brush.id ? null : current)
                }
              }}
            >
              <button
                type="button"
                className="brush-card-preview"
                onClick={() => edit(brush)}
                aria-label={`Edit ${brush.name}`}
              >
                <BrushPreview brush={brush} active={activePreview === brush.id} />
              </button>
              <div className="brush-card-meta">
                <div>
                  <strong>{brush.name}</strong>
                  <small>{brush.category} · {brush.renderer}</small>
                </div>
                <button
                  type="button"
                  className="brush-card-menu-button"
                  aria-label={`Actions for ${brush.name}`}
                  aria-expanded={openMenu === brush.id}
                  onClick={() =>
                    setOpenMenu((current) =>
                      current === brush.id ? null : brush.id,
                    )
                  }
                >
                  <MoreHorizontal size={18} />
                </button>
                {openMenu === brush.id ? (
                  <div className="brush-card-menu">
                    <button type="button" onClick={() => edit(brush)}>
                      <Edit3 size={14} /> Edit
                    </button>
                    <button type="button" onClick={() => rename(brush)}>
                      <Pencil size={14} /> Rename
                    </button>
                    <button type="button" onClick={() => duplicate(brush)}>
                      <Copy size={14} /> Duplicate
                    </button>
                    <button type="button" onClick={() => remove(brush)}>
                      <Trash2 size={14} /> Delete
                    </button>
                  </div>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </main>
    </div>
  )
}
