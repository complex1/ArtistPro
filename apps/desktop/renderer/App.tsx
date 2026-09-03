import { lazy, Suspense, useEffect } from 'react'
import './App.css'
import { navigate } from './app/routes'
import { useHashRoute } from './app/useHashRoute'
import { ArtistHome } from './ArtistHome'
import { SvgEditor, SvgToolHome } from '@artist-studio/svg-tool'
import { CelEditor, CelHome } from '@artist-studio/cel'

const PaintHome = lazy(() =>
  import('@artist-studio/animated-paint').then((module) => ({
    default: module.PaintHome,
  })),
)
const PaintEditor = lazy(() =>
  import('@artist-studio/animated-paint').then((module) => ({
    default: module.PaintEditor,
  })),
)
const BrushPlayground = lazy(() =>
  import('@artist-studio/animated-paint').then((module) => ({
    default: module.BrushPlayground,
  })),
)
const TapPilotStudio = lazy(() =>
  import('@artist-studio/tappilot').then((module) => ({
    default: module.TapPilotStudio,
  })),
)

export default function App() {
  const route = useHashRoute()

  useEffect(() => {
    if (route.page === 'home') document.title = 'Artist Pro'
    else if (route.page === 'svg-home' || route.page === 'svg-editor') {
      document.title = 'SVG — Artist Pro'
    } else if (
      route.page === 'paint-home' ||
      route.page === 'paint-editor' ||
      route.page === 'paint-playground'
    ) {
      document.title = 'Animated Paint — Artist Pro'
    } else if (route.page === 'cel-home' || route.page === 'cel-editor') {
      document.title = 'Cel — Artist Pro'
    } else if (route.page === 'tappilot') {
      document.title = 'TapPilot — Artist Pro'
    } else document.title = 'Artist Pro'
  }, [route])

  useEffect(() => {
    if (route.page === 'draw') {
      navigate({ page: 'home' })
    }
  }, [route])

  if (route.page === 'svg-home') return <SvgToolHome />
  if (route.page === 'svg-editor') {
    return <SvgEditor projectId={route.projectId} />
  }
  if (route.page === 'paint-home') {
    return (
      <Suspense fallback={<div className="studio-loading">Opening paint…</div>}>
        <PaintHome />
      </Suspense>
    )
  }
  if (route.page === 'paint-playground') {
    return (
      <Suspense fallback={<div className="studio-loading">Opening brushes…</div>}>
        <BrushPlayground brushId={route.brushId} />
      </Suspense>
    )
  }
  if (route.page === 'paint-editor') {
    return (
      <Suspense fallback={<div className="studio-loading">Opening paint…</div>}>
        <PaintEditor projectId={route.projectId} />
      </Suspense>
    )
  }
  if (route.page === 'cel-home') return <CelHome />
  if (route.page === 'cel-editor') {
    return <CelEditor projectId={route.projectId} />
  }
  if (route.page === 'tappilot') {
    return (
      <Suspense fallback={<div className="studio-loading">Opening TapPilot…</div>}>
        <TapPilotStudio />
      </Suspense>
    )
  }
  return <ArtistHome />
}
