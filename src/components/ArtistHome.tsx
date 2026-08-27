import { Paintbrush, PenTool } from 'lucide-react'
import { navigate } from '../app/routes'

const upcoming = [
  { id: 'type', name: 'Type', blurb: 'Layout-driven typography' },
]

export function ArtistHome() {
  return (
    <div className="studio-shell">
      <header className="studio-topbar">
        <div className="studio-brand">
          <div className="brand-mark">A</div>
          <div>
            <strong>Artist Pro</strong>
            <span>Studio</span>
          </div>
        </div>
      </header>

      <main className="studio-main">
        <p className="studio-kicker">Tools</p>
        <h1>What do you want to make?</h1>
        <p className="studio-lede">
          Start in a tool. Each one keeps its own projects and will ship as its
          own codebase as the studio grows.
        </p>

        <section className="tool-grid" aria-label="Available tools">
          <button
            type="button"
            className="tool-card is-ready"
            onClick={() => navigate({ page: 'svg-home' })}
          >
            <span className="tool-card-icon">
              <PenTool size={22} />
            </span>
            <span className="tool-card-copy">
              <strong>SVG</strong>
              <small>Draw, animate, and export vector motion</small>
            </span>
            <span className="tool-card-cta">Open</span>
          </button>

          <button
            type="button"
            className="tool-card is-ready"
            onClick={() => navigate({ page: 'paint-home' })}
          >
            <span className="tool-card-icon">
              <Paintbrush size={22} />
            </span>
            <span className="tool-card-copy">
              <strong>Animated Paint</strong>
              <small>Draw with living procedural brushes</small>
            </span>
            <span className="tool-card-cta">Open</span>
          </button>

          {upcoming.map((tool) => (
            <div key={tool.id} className="tool-card is-soon" aria-disabled="true">
              <span className="tool-card-icon">{tool.name.charAt(0)}</span>
              <span className="tool-card-copy">
                <strong>{tool.name}</strong>
                <small>{tool.blurb}</small>
              </span>
              <span className="tool-card-cta">Coming soon</span>
            </div>
          ))}
        </section>
      </main>
    </div>
  )
}
