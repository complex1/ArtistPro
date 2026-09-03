/// <reference types="vite/client" />

import type {
  KeyStyle,
  KeyStyleSummary,
  LogEntry,
  PlatformCapabilityStatus,
  Profile,
  ProfileSummary,
  ServerInfo,
  TargetApp,
} from "../shared/types";

export type ImportConflictInfo = {
  nameConflict: { id: string; name: string } | null;
  idConflict: { id: string; name: string } | null;
};

export type TapPilotApi = {
  listProfiles: () => Promise<ProfileSummary[]>;
  getProfile: (id: string) => Promise<Profile | null>;
  createProfile: (payload: {
    name?: string;
    description?: string;
    targetApp?: string | TargetApp;
    image?: string | null;
    grid?: { cols: number; rows: number };
  }) => Promise<Profile>;
  importProfile: (
    data: unknown,
    options?: { mode?: "copy" | "replace"; replaceId?: string }
  ) => Promise<Profile>;
  validateImport: (
    data: unknown
  ) => Promise<{ ok: boolean; errors: string[] }>;
  importConflicts: (data: unknown) => Promise<ImportConflictInfo>;
  exportProfile: (id: string) => Promise<Profile | null>;
  saveProfile: (profile: Profile) => Promise<Profile>;
  deleteProfile: (id: string) => Promise<boolean>;
  setPublished: (id: string, published: boolean) => Promise<Profile>;
  listStyles: () => Promise<KeyStyleSummary[]>;
  getStyle: (id: string) => Promise<KeyStyle | null>;
  createStyle: (payload?: Partial<KeyStyle>) => Promise<KeyStyle>;
  saveStyle: (style: KeyStyle) => Promise<KeyStyle>;
  deleteStyle: (id: string) => Promise<boolean>;
  importStyle: (data: unknown) => Promise<KeyStyle>;
  getServerInfo: () => Promise<ServerInfo>;
  startServer: () => Promise<ServerInfo>;
  stopServer: () => Promise<ServerInfo>;
  getServerQr: () => Promise<string | null>;
  openExternal: (url: string) => Promise<void>;
  getPlatformCapabilities: () => Promise<PlatformCapabilityStatus>;
  openCapabilitySettings: (settingsUrl: string) => Promise<boolean>;
  listLogs: () => Promise<LogEntry[]>;
  clearLogs: () => Promise<boolean>;
  onLogEntry: (
    callback: (
      entry: LogEntry | { type: "prune" } | { type: "clear" }
    ) => void
  ) => () => void;
  onServerStatus: (callback: (info: ServerInfo) => void) => () => void;
};

declare global {
  interface Window {
    tapPilot: TapPilotApi;
  }
}

export {};
