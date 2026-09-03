export type ShortcutKeys = string[];

export type {
  KeyModifier,
  KeyboardShortcut,
  PlatformShortcutMap,
  PointerButton,
} from "./shortcuts";

import type { KeyboardShortcut, PlatformShortcutMap } from "./shortcuts";

export type WidgetLayout = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type ButtonBinding = {
  kind: "shortcut";
  shortcut?: KeyboardShortcut | null;
  shortcuts?: PlatformShortcutMap;
  /** @deprecated legacy — migrated to shortcut on load */
  keys?: ShortcutKeys;
};

export type KnobBinding = {
  kind: "key_stream";
  increase?: KeyboardShortcut | null;
  decrease?: KeyboardShortcut | null;
  /** @deprecated legacy */
  increaseKeys?: ShortcutKeys;
  /** @deprecated legacy */
  decreaseKeys?: ShortcutKeys;
  /** 1 (coarse) .. 10 (fine/most sensitive) */
  sensitivity: number;
};

export type SliderBinding = {
  kind: "system_volume";
  min: number;
  max: number;
};

export type TrackpadMode = "inline" | "button";

/**
 * One-finger mouse tracker. Finger motion on the phone moves the desktop
 * cursor by the same relative delta (scaled by sensitivity).
 */
export type TrackpadBinding = {
  kind: "trackpad";
  /** inline = live on the grid, button = opens a fullscreen pad */
  mode: TrackpadMode;
  /** 1 (coarse) .. 10 (fine/most sensitive) */
  sensitivity: number;
};

export type WidgetBase = {
  id: string;
  name: string;
  /** Iconify id (`lucide:keyboard`) or legacy Lucide PascalCase name */
  icon: string;
  /** Optional custom image as data URL */
  iconImage?: string | null;
  layout: WidgetLayout;
  /** Optional per-widget key-style override (falls back to the profile default) */
  styleId?: string | null;
  /**
   * Optional deck tab this widget belongs to.
   * Null/undefined = untabbed profile (single deck) or orphan until migration.
   */
  tabId?: string | null;
};

export type ButtonWidget = WidgetBase & {
  type: "button";
  binding: ButtonBinding;
};

export type KnobWidget = WidgetBase & {
  type: "knob";
  binding: KnobBinding;
};

export type SliderWidget = WidgetBase & {
  type: "slider";
  binding: SliderBinding;
};

export type TrackpadWidget = WidgetBase & {
  type: "trackpad";
  binding: TrackpadBinding;
};

export type Widget =
  | ButtonWidget
  | KnobWidget
  | SliderWidget
  | TrackpadWidget;

export type WidgetType = Widget["type"];

export const SENSITIVITY_MIN = 1;
export const SENSITIVITY_MAX = 10;
export const DEFAULT_SENSITIVITY = 5;

export type ProfileGrid = {
  cols: number;
  rows: number;
};

/** Optional named deck page within a profile. Each tab has its own grid. */
export type ProfileTab = {
  id: string;
  name: string;
  grid: ProfileGrid;
};

/** Soft cap for profile tabs (editor + phone). */
export const MAX_PROFILE_TABS = 8;

export type TargetAppPlatforms = {
  macos?: { bundleId?: string; executablePath?: string };
  windows?: { processName?: string; executablePath?: string };
  linux?: { processName?: string; desktopFileId?: string };
};

export type TargetApp = {
  name: string;
  platforms?: TargetAppPlatforms;
};

export type TargetMode =
  | "active-app"
  | "only-if-active"
  | "activate-target-app"
  | "global";

export type ProfileExecution = {
  targetMode: TargetMode;
  showInactiveWarning: boolean;
};

export const PROFILE_FORMAT = "tappilot-profile" as const;
export const CURRENT_SCHEMA_VERSION = 1;

export type ProfileMetadata = {
  createdWith: "TapPilot";
  createdWithVersion: string;
  createdAt: string;
  updatedAt: string;
  source: "local" | "imported" | "community" | "official";
};

export type Profile = {
  format: typeof PROFILE_FORMAT;
  schemaVersion: number;
  id: string;
  name: string;
  description: string;
  targetApp: TargetApp;
  execution: ProfileExecution;
  metadata?: ProfileMetadata;
  /** Optional custom profile image as data URL (falls back to default) */
  image?: string | null;
  /**
   * Default n×m control surface. Used when `tabs` is empty; also the template
   * for new tabs. When tabs exist, each tab has its own `grid`.
   */
  grid: ProfileGrid;
  /**
   * Optional deck tabs. Empty/omitted = single deck (legacy). Widgets reference
   * a tab via `widget.tabId`.
   */
  tabs?: ProfileTab[];
  published: boolean;
  updatedAt: string;
  widgets: Widget[];
  /** Default key-style for the whole deck (falls back to DEFAULT_KEY_STYLE) */
  styleId?: string | null;
  /**
   * Resolved styles map attached by the server when serving a profile to the
   * phone: `{ [styleId]: KeyStyle }`. Not persisted on disk.
   */
  styles?: Record<string, KeyStyle>;
  /**
   * Referenced key-styles embedded on export so the profile file is portable.
   * Only present in exported JSON; stripped on import.
   */
  _embeddedStyles?: KeyStyle[];
};

export type ProfileSummary = {
  id: string;
  name: string;
  description: string;
  /** Display name of the target app */
  targetApp: string;
  published: boolean;
  updatedAt: string;
  image?: string | null;
  grid: ProfileGrid;
  widgetCount: number;
};

export type ActionErrorCode =
  | "TARGET_APP_NOT_ACTIVE"
  | "TARGET_APP_NOT_FOUND"
  | "ACCESSIBILITY_PERMISSION_MISSING"
  | "UNSUPPORTED_PLATFORM"
  | "INVALID_SHORTCUT"
  | "ACTION_NOT_APPROVED"
  | "EXECUTION_FAILED"
  | "TOOL_MISSING";

export type ActionExecutionResult = {
  success: boolean;
  actionId?: string;
  message?: string;
  errorCode?: ActionErrorCode;
  durationMs?: number;
};

export type PlatformCapabilityStatus = {
  platform: string;
  accessibility: {
    required: boolean;
    granted: boolean | null;
    message: string;
    settingsUrl?: string | null;
  };
  tools: Array<{
    id: string;
    label: string;
    available: boolean;
    detail?: string;
  }>;
};

export type ServerInfo = {
  running: boolean;
  port: number | null;
  urls: string[];
  primaryUrl: string | null;
  apiUrl?: string | null;
};

export type LogEntry = {
  id: string;
  at: number;
  level: "info" | "error" | "warn";
  source: string;
  message: string;
  detail?: string;
};

export const GRID_MIN = 1;
export const GRID_MAX = 20;
export const DEFAULT_GRID: ProfileGrid = { cols: 6, rows: 8 };

export const DEFAULT_EXECUTION: ProfileExecution = {
  targetMode: "activate-target-app",
  showInactiveWarning: true,
};

export function emptyTargetApp(name = ""): TargetApp {
  return { name, platforms: {} };
}

/* ============================ Key styles ============================ */

export type SynthWaveform = "sine" | "triangle" | "square" | "sawtooth";

export type SynthPreset = {
  waveform: SynthWaveform;
  /** starting frequency in Hz */
  startFreq: number;
  /** ending frequency in Hz (pitch sweep target) */
  endFreq: number;
  /** total duration in milliseconds */
  durationMs: number;
  /** 0..1 master volume */
  volume: number;
};

export type SoundSource =
  | { kind: "none" }
  | { kind: "synth"; preset: SynthPreset }
  | {
      kind: "custom";
      /** audio file as a base64 data URL */
      audio: string;
      /** 0..1 playback volume */
      volume: number;
    };

export type KeyShadow = {
  /** horizontal offset in px */
  x: number;
  /** vertical offset in px */
  y: number;
  /** blur radius in px */
  blur: number;
  /** spread radius in px */
  spread: number;
  color: string;
  inset: boolean;
};

export type KeyLook = {
  /** gradient top color */
  bg1: string;
  /** gradient bottom color */
  bg2: string;
  borderColor: string;
  /** border width in px */
  borderWidth: number;
  /** corner radius in px */
  radius: number;
  textColor: string;
  iconColor: string;
  /** glow / accent color used for active state */
  glowColor: string;
  /** ordered shadow layers in the resting state */
  shadows: KeyShadow[];
  /** ordered shadow layers while the key is pressed */
  pressedShadows: KeyShadow[];
};

export type PressAnimation = "none" | "scale" | "glow" | "pulse" | "ripple";

export type PressResponse = {
  animation: PressAnimation;
  /** scale factor for the "scale" animation, e.g. 0.97 */
  scale: number;
  glowColor: string;
  /** 0..1 glow strength */
  glowIntensity: number;
  /** animation duration in ms */
  durationMs: number;
};

export type KnobStyle = {
  ringColor: string;
  dialColor: string;
  notchColor: string;
  glow: boolean;
};

export type KeyStyleHaptics = {
  enabled: boolean;
  /** vibration pattern in ms */
  pattern: number[];
};

export type KeyStyle = {
  id: string;
  name: string;
  description: string;
  updatedAt: string;
  key: KeyLook;
  press: PressResponse;
  knob: KnobStyle;
  haptics: KeyStyleHaptics;
  sound: SoundSource;
};

export type KeyStyleSummary = Pick<
  KeyStyle,
  "id" | "name" | "description" | "updatedAt"
>;

export const DEFAULT_SYNTH_PRESET: SynthPreset = {
  waveform: "triangle",
  startFreq: 720,
  endFreq: 324,
  durationMs: 140,
  volume: 0.12,
};

/**
 * Built-in default style that reproduces the current neon look, so profiles
 * and widgets with no explicit style render exactly as before.
 */
export const DEFAULT_KEY_STYLE: KeyStyle = {
  id: "__default__",
  name: "Neon (default)",
  description: "Built-in deep-dark neon look.",
  updatedAt: "1970-01-01T00:00:00.000Z",
  key: {
    bg1: "#0e1826",
    bg2: "#0a121d",
    borderColor: "#17263a",
    borderWidth: 1,
    radius: 16,
    textColor: "#e6f0ff",
    iconColor: "#e6f0ff",
    glowColor: "#22d3ee",
    shadows: [],
    pressedShadows: [],
  },
  press: {
    animation: "scale",
    scale: 0.97,
    glowColor: "#22d3ee",
    glowIntensity: 0.6,
    durationMs: 120,
  },
  knob: {
    ringColor: "#23364d",
    dialColor: "#0f1c2b",
    notchColor: "#22d3ee",
    glow: true,
  },
  haptics: {
    enabled: true,
    pattern: [10],
  },
  sound: { kind: "synth", preset: DEFAULT_SYNTH_PRESET },
};
