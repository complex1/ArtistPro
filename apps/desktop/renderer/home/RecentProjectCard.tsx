import { useEffect, useRef, useState } from 'react'
import { EllipsisVertical, ExternalLink, Trash2 } from 'lucide-react'
import { formatRelativeTime } from '@artist-studio/utils'
import type { RecentProject } from './recentProjects'

function hueFor(id: string): number {
  let hash = 0
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) % 360
  }
  return hash
}

export function RecentProjectCard({
  project,
  onOpen,
  onDelete,
}: {
  project: RecentProject
  onOpen: () => void
  onDelete: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const wrapper = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

  const hue = hueFor(project.id)

  return (
    <div className="home-project" ref={wrapper}>
      <button type="button" className="home-project-open" onClick={onOpen}>
        <span
          className="home-project-thumb"
          style={{
            background: `linear-gradient(150deg, hsl(${hue} 62% 42%), hsl(${(hue + 48) % 360} 58% 24%))`,
          }}
        >
          {project.name.trim().charAt(0).toUpperCase() || '?'}
        </span>
        <span className="home-project-copy">
          <strong>{project.name}</strong>
          <small>Updated {formatRelativeTime(project.updatedAt)}</small>
          <span className="home-project-meta">
            <span className="home-project-dot" aria-hidden="true" />
            Local
            <span className="home-project-tool">{project.toolTitle}</span>
          </span>
        </span>
      </button>

      <button
        type="button"
        className="home-project-menu-button"
        aria-label={`Actions for ${project.name}`}
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((open) => !open)}
      >
        <EllipsisVertical size={16} />
      </button>

      {menuOpen && (
        <div className="home-project-menu" role="menu">
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenuOpen(false)
              onOpen()
            }}
          >
            <ExternalLink size={13} /> Open in {project.toolTitle}
          </button>
          <button
            type="button"
            role="menuitem"
            className="is-danger"
            onClick={() => {
              setMenuOpen(false)
              onDelete()
            }}
          >
            <Trash2 size={13} /> Delete project
          </button>
        </div>
      )}
    </div>
  )
}
