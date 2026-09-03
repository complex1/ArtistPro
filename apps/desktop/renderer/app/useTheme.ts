import { useCallback, useEffect, useState } from 'react'
import { getConfig, setConfig } from '@artist-studio/idb-config'

export type ThemeName = 'dark' | 'light'

const THEME_KEY = 'theme'

function isTheme(value: unknown): value is ThemeName {
  return value === 'dark' || value === 'light'
}

export function useTheme(): { theme: ThemeName; toggleTheme: () => void } {
  const [theme, setTheme] = useState<ThemeName>('dark')

  useEffect(() => {
    let active = true
    void getConfig<unknown>(THEME_KEY).then((stored) => {
      if (active && isTheme(stored)) setTheme(stored)
    })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  const toggleTheme = useCallback(() => {
    setTheme((current) => {
      const next: ThemeName = current === 'dark' ? 'light' : 'dark'
      void setConfig(THEME_KEY, next)
      return next
    })
  }, [])

  return { theme, toggleTheme }
}
