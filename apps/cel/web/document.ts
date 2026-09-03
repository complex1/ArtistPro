import {
  CEL_RESTORE_DEFAULTS,
  type RestoreOptions,
  type Rgb,
} from './restore'
import { CEL_TRACE_DEFAULTS, type TraceOptions } from './trace'

export const CEL_DOCUMENT_VERSION = 1 as const
export const SOURCE_ASSET = 'source.png'

export type CelSettings = RestoreOptions &
  TraceOptions & { exportScale: number; inkEnabled: boolean }

export const CEL_DEFAULT_SETTINGS: CelSettings = {
  ...CEL_RESTORE_DEFAULTS,
  ...CEL_TRACE_DEFAULTS,
  exportScale: 4,
  inkEnabled: false,
  inkThreshold: 32,
}

export type CelDocument = {
  version: typeof CEL_DOCUMENT_VERSION
  name: string
  width: number
  height: number
  sourceAsset: string | null
  sourceName: string
  settings: CelSettings
  chromaRemove: Rgb[]
  chromaRetain: Rgb[]
  chromaTolerance: number
}

export function createBlankCelDocument(name: string): CelDocument {
  return {
    version: CEL_DOCUMENT_VERSION,
    name: name.trim() || 'Untitled',
    width: 0,
    height: 0,
    sourceAsset: null,
    sourceName: '',
    settings: { ...CEL_DEFAULT_SETTINGS },
    chromaRemove: [],
    chromaRetain: [],
    chromaTolerance: CEL_DEFAULT_SETTINGS.chromaTolerance ?? 24,
  }
}
