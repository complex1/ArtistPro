import { useEffect, useState } from 'react'
import { parseHash, type AppRoute } from './routes'

export function useHashRoute(): AppRoute {
  const [route, setRoute] = useState<AppRoute>(() =>
    parseHash(window.location.hash),
  )

  useEffect(() => {
    const sync = () => {
      const navigation = new CustomEvent('artist-studio:before-route-change', { cancelable: true })
      if (window.dispatchEvent(navigation)) setRoute(parseHash(window.location.hash))
    }
    window.addEventListener('hashchange', sync)
    sync()
    return () => window.removeEventListener('hashchange', sync)
  }, [])

  return route
}
