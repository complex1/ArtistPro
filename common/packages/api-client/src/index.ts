const DEFAULT_API_BASE = 'http://127.0.0.1:8765'

declare global {
  interface Window {
    artistStudio?: {
      getApiBase?: () => Promise<string>
      openToolWindow?: (hash: string) => Promise<boolean>
    }
    __ARTIST_API_BASE__?: string
  }
}

export function readApiBase(): string {
  if (typeof window !== 'undefined') {
    const injected = window.__ARTIST_API_BASE__
    if (typeof injected === 'string' && injected) return injected.replace(/\/$/, '')
    const fromQuery = new URLSearchParams(window.location.search).get('apiBase')
    if (fromQuery) return fromQuery.replace(/\/$/, '')
  }
  const fromEnv =
    typeof import.meta !== 'undefined' &&
    import.meta.env &&
    typeof import.meta.env.VITE_API_BASE === 'string'
      ? import.meta.env.VITE_API_BASE
      : ''
  return (fromEnv || DEFAULT_API_BASE).replace(/\/$/, '')
}

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export async function apiJson<T>(
  path: string,
  init?: RequestInit,
  base = readApiBase(),
): Promise<T> {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  })
  if (!response.ok) {
    const text = await response.text()
    throw new ApiError(response.status, text || response.statusText)
  }
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

export async function apiBytes(
  path: string,
  body: ArrayBuffer | Blob,
  base = readApiBase(),
): Promise<void> {
  const response = await fetch(`${base}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/octet-stream' },
    body,
  })
  if (!response.ok) {
    const text = await response.text()
    throw new ApiError(response.status, text || response.statusText)
  }
}
