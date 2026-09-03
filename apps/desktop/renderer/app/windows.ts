import { navigate, toHash, type AppRoute } from './routes'

/**
 * The desktop shell gives each tool its own window so the launcher stays put.
 * A plain browser has no shell to ask, so it navigates in place instead.
 */
export function openInWindow(route: AppRoute): void {
  const openToolWindow = window.artistStudio?.openToolWindow
  if (openToolWindow) {
    void openToolWindow(toHash(route))
    return
  }
  navigate(route)
}
