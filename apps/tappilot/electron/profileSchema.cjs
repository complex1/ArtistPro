const PROFILE_FORMAT = "tappilot-profile";
const CURRENT_SCHEMA_VERSION = 1;
const GRID_MIN = 1;
const GRID_MAX = 20;
const DEFAULT_GRID = { cols: 6, rows: 8 };
const DEFAULT_ICON = "lucide:keyboard";
const MAX_PROFILE_TABS = 8;
const WIDGET_TYPES = new Set(["button", "knob", "slider", "trackpad"]);
const TARGET_MODES = new Set([
  "active-app",
  "only-if-active",
  "activate-target-app",
  "global",
]);
const POINTER_BUTTONS = new Set(["left", "right", "middle"]);

function clampGrid(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(GRID_MIN, Math.min(GRID_MAX, Math.round(n)));
}

function normalizeTabs(rawTabs, fallbackGrid) {
  if (!Array.isArray(rawTabs)) return [];
  const seen = new Set();
  const tabs = [];
  for (const t of rawTabs) {
    if (!t || typeof t !== "object") continue;
    const id = typeof t.id === "string" && t.id.trim() ? t.id.trim() : null;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const name =
      typeof t.name === "string" && t.name.trim() ? t.name.trim() : "Tab";
    tabs.push({
      id,
      name: name.slice(0, 40),
      grid: {
        cols: clampGrid(t.grid?.cols, fallbackGrid.cols),
        rows: clampGrid(t.grid?.rows, fallbackGrid.rows),
      },
    });
    if (tabs.length >= MAX_PROFILE_TABS) break;
  }
  return tabs;
}

function gridForWidget(tabs, profileGrid, tabId) {
  if (tabId) {
    const tab = tabs.find((t) => t.id === tabId);
    if (tab) return tab.grid;
  }
  return profileGrid;
}

function clampSensitivity(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 5;
  return Math.max(1, Math.min(10, Math.round(n)));
}

function keyArray(value) {
  return Array.isArray(value) ? value.map((k) => String(k)) : [];
}

function keysToShortcut(keys) {
  if (!Array.isArray(keys) || keys.length === 0) return null;
  const modifiers = [];
  let main = null;
  for (const raw of keys) {
    const k = String(raw || "")
      .trim()
      .toLowerCase();
    if (!k) continue;
    if (k === "cmd" || k === "command" || k === "meta") {
      if (!modifiers.includes("meta")) modifiers.push("meta");
    } else if (k === "ctrl" || k === "control") {
      if (!modifiers.includes("ctrl")) modifiers.push("ctrl");
    } else if (k === "alt" || k === "option") {
      if (!modifiers.includes("alt")) modifiers.push("alt");
    } else if (k === "shift") {
      if (!modifiers.includes("shift")) modifiers.push("shift");
    } else {
      main = k;
    }
  }
  if (!main && modifiers.length === 1) {
    const only = modifiers[0];
    return {
      code:
        only === "meta"
          ? "MetaLeft"
          : only === "ctrl"
            ? "ControlLeft"
            : only === "alt"
              ? "AltLeft"
              : "ShiftLeft",
      key: only,
      modifiers: [],
    };
  }
  if (!main) return null;
  return {
    code: tokenToCode(main),
    key: tokenToKey(main),
    modifiers,
  };
}

function shortcutToKeys(shortcut) {
  if (!shortcut || typeof shortcut !== "object") return [];
  // Mouse bindings are dispatched as clicks, never as keystrokes.
  if (shortcut.pointer) return [];
  const keys = [];
  for (const m of shortcut.modifiers || []) {
    if (m === "meta") keys.push("cmd");
    else if (m === "ctrl") keys.push("ctrl");
    else if (m === "alt") keys.push("alt");
    else if (m === "shift") keys.push("shift");
  }
  const main = String(shortcut.key || "").toLowerCase();
  if (!main) return keys;
  if (
    ["meta", "cmd", "command", "ctrl", "control", "alt", "option", "shift"].includes(
      main
    ) &&
    keys.length === 0
  ) {
    if (main === "meta" || main === "cmd" || main === "command") return ["cmd"];
    if (main === "control") return ["ctrl"];
    return [main === "option" ? "alt" : main];
  }
  keys.push(normalizeMainToken(main, shortcut.code || ""));
  return keys;
}

function normalizeShortcut(raw) {
  if (!raw || typeof raw !== "object") return null;
  const modifiers = Array.isArray(raw.modifiers)
    ? raw.modifiers
        .map((m) => String(m))
        .filter((m) => ["meta", "ctrl", "alt", "shift"].includes(m))
    : [];
  const code = typeof raw.code === "string" ? raw.code : "";
  const key = typeof raw.key === "string" ? raw.key : "";
  const pointer = POINTER_BUTTONS.has(raw.pointer) ? raw.pointer : null;
  if (pointer) {
    return {
      code: code || `Mouse${pointer.charAt(0).toUpperCase()}${pointer.slice(1)}`,
      key: pointer,
      modifiers,
      pointer,
    };
  }
  if (!code && !key && modifiers.length === 0) return null;
  return { code: code || tokenToCode(key.toLowerCase()), key: key || code, modifiers };
}

function normalizePlatformShortcuts(raw) {
  if (!raw || typeof raw !== "object") return undefined;
  const out = {};
  for (const platform of ["default", "macos", "windows", "linux"]) {
    if (raw[platform]) out[platform] = normalizeShortcut(raw[platform]);
  }
  return Object.keys(out).length ? out : undefined;
}

function resolvePlatformShortcut(shortcut, shortcuts, platform) {
  const map = shortcuts || {};
  if (platform === "darwin" && map.macos) return map.macos;
  if (platform === "win32" && map.windows) return map.windows;
  if (platform === "linux" && map.linux) return map.linux;
  if (map.default) return map.default;
  return shortcut || null;
}

function tokenToCode(token) {
  if (token.length === 1 && /[a-z]/.test(token)) return `Key${token.toUpperCase()}`;
  if (token.length === 1 && /[0-9]/.test(token)) return `Digit${token}`;
  const map = {
    space: "Space",
    enter: "Enter",
    return: "Enter",
    escape: "Escape",
    esc: "Escape",
    tab: "Tab",
    backspace: "Backspace",
    delete: "Delete",
    up: "ArrowUp",
    down: "ArrowDown",
    left: "ArrowLeft",
    right: "ArrowRight",
    "-": "Minus",
    "=": "Equal",
    "[": "BracketLeft",
    "]": "BracketRight",
  };
  return map[token] || token;
}

function tokenToKey(token) {
  if (token.length === 1) return token.toUpperCase();
  const map = {
    space: " ",
    enter: "Enter",
    return: "Enter",
    escape: "Escape",
    esc: "Escape",
    tab: "Tab",
    backspace: "Backspace",
    delete: "Delete",
    up: "ArrowUp",
    down: "ArrowDown",
    left: "ArrowLeft",
    right: "ArrowRight",
  };
  return map[token] || token;
}

function normalizeMainToken(key, code) {
  const lower = key.toLowerCase();
  if (lower === " " || lower === "space") return "space";
  if (lower === "arrowup") return "up";
  if (lower === "arrowdown") return "down";
  if (lower === "arrowleft") return "left";
  if (lower === "arrowright") return "right";
  if (lower === "esc") return "escape";
  if (code.startsWith("Key") && code.length === 4) return code.slice(3).toLowerCase();
  if (code.startsWith("Digit") && code.length === 6) return code.slice(5);
  if (key.length === 1) return key.toLowerCase();
  return lower;
}

function normalizeTargetApp(raw) {
  if (typeof raw === "string") {
    return { name: raw, platforms: {} };
  }
  if (raw && typeof raw === "object") {
    return {
      name: typeof raw.name === "string" ? raw.name : "",
      platforms:
        raw.platforms && typeof raw.platforms === "object" ? raw.platforms : {},
    };
  }
  return { name: "", platforms: {} };
}

function normalizeExecution(raw) {
  const mode =
    raw && TARGET_MODES.has(raw.targetMode) ? raw.targetMode : "activate-target-app";
  return {
    targetMode: mode,
    showInactiveWarning:
      raw && raw.showInactiveWarning !== undefined
        ? Boolean(raw.showInactiveWarning)
        : true,
  };
}

function normalizeBinding(widget) {
  const b = widget.binding || {};
  if (widget.type === "button") {
    const shortcut =
      normalizeShortcut(b.shortcut) ||
      keysToShortcut(b.keys) ||
      null;
    const shortcuts = normalizePlatformShortcuts(b.shortcuts);
    return {
      kind: "shortcut",
      shortcut,
      ...(shortcuts ? { shortcuts } : {}),
    };
  }
  if (widget.type === "knob") {
    return {
      kind: "key_stream",
      increase:
        normalizeShortcut(b.increase) || keysToShortcut(b.increaseKeys) || null,
      decrease:
        normalizeShortcut(b.decrease) || keysToShortcut(b.decreaseKeys) || null,
      sensitivity: clampSensitivity(b.sensitivity),
    };
  }
  if (widget.type === "trackpad") {
    return {
      kind: "trackpad",
      mode: b.mode === "button" ? "button" : "inline",
      sensitivity: clampSensitivity(b.sensitivity),
    };
  }
  if (widget.type === "slider") {
    return {
      kind: "system_volume",
      min: Number.isFinite(Number(b.min)) ? Number(b.min) : 0,
      max: Number.isFinite(Number(b.max)) ? Number(b.max) : 100,
    };
  }
  return b;
}

function detectSchemaVersion(raw) {
  if (!raw || typeof raw !== "object") return 0;
  if (typeof raw.schemaVersion === "number") return raw.schemaVersion;
  return 0;
}

/**
 * Migrate any older profile shape to schemaVersion 1.
 */
function migrateProfile(raw) {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid profile file");
  }
  const version = detectSchemaVersion(raw);
  let next = { ...raw };

  if (version < 1) {
    const now = new Date().toISOString();
    next = {
      ...next,
      format: PROFILE_FORMAT,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      targetApp: normalizeTargetApp(next.targetApp),
      execution: normalizeExecution(next.execution),
      metadata: {
        createdWith: "TapPilot",
        createdWithVersion: "1.0.0",
        createdAt:
          (next.metadata && next.metadata.createdAt) || next.updatedAt || now,
        updatedAt: next.updatedAt || now,
        source: (next.metadata && next.metadata.source) || "local",
      },
    };
  }

  next.format = PROFILE_FORMAT;
  next.schemaVersion = CURRENT_SCHEMA_VERSION;
  next.targetApp = normalizeTargetApp(next.targetApp);
  next.execution = normalizeExecution(next.execution);

  const cols = clampGrid(next.grid?.cols, DEFAULT_GRID.cols);
  const rows = clampGrid(next.grid?.rows, DEFAULT_GRID.rows);
  next.grid = { cols, rows };

  const tabs = normalizeTabs(next.tabs, next.grid);
  next.tabs = tabs;
  const tabIds = new Set(tabs.map((t) => t.id));
  const defaultTabId = tabs.length > 0 ? tabs[0].id : null;

  next.widgets = Array.isArray(next.widgets)
    ? next.widgets.map((w) => {
        let tabId = typeof w.tabId === "string" && w.tabId ? w.tabId : null;
        if (tabs.length === 0) {
          tabId = null;
        } else if (!tabId || !tabIds.has(tabId)) {
          // With tabs enabled, unassigned / orphan widgets land on the first tab.
          tabId = defaultTabId;
        }
        const g = gridForWidget(tabs, next.grid, tabId);
        return {
          ...w,
          icon: w.icon || DEFAULT_ICON,
          iconImage: w.iconImage || null,
          styleId: w.styleId || null,
          tabId,
          binding: normalizeBinding(w),
          layout: {
            x: Math.max(0, Number(w.layout?.x) || 0),
            y: Math.max(0, Number(w.layout?.y) || 0),
            w: Math.max(1, Math.min(g.cols, Number(w.layout?.w) || 1)),
            h: Math.max(1, Math.min(g.rows, Number(w.layout?.h) || 1)),
          },
        };
      })
    : [];

  return next;
}

/**
 * Validate a migrated profile. Returns { ok, errors }.
 */
function validateProfile(profile) {
  const errors = [];
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
    return { ok: false, errors: ["Profile is not an object"] };
  }
  if (profile.format && profile.format !== PROFILE_FORMAT) {
    errors.push(`Unsupported format "${profile.format}"`);
  }
  if (!profile.name || typeof profile.name !== "string" || !profile.name.trim()) {
    errors.push("Profile name is required");
  }
  if (!profile.grid || typeof profile.grid !== "object") {
    errors.push("Profile grid is required");
  } else {
    if (
      !Number.isFinite(profile.grid.cols) ||
      profile.grid.cols < GRID_MIN ||
      profile.grid.cols > GRID_MAX
    ) {
      errors.push(`Grid columns must be between ${GRID_MIN} and ${GRID_MAX}`);
    }
    if (
      !Number.isFinite(profile.grid.rows) ||
      profile.grid.rows < GRID_MIN ||
      profile.grid.rows > GRID_MAX
    ) {
      errors.push(`Grid rows must be between ${GRID_MIN} and ${GRID_MAX}`);
    }
  }

  const tabs = Array.isArray(profile.tabs) ? profile.tabs : [];
  const tabIds = new Set();
  if (tabs.length > MAX_PROFILE_TABS) {
    errors.push(`Profiles support at most ${MAX_PROFILE_TABS} tabs`);
  }
  for (const t of tabs) {
    if (!t || typeof t !== "object") {
      errors.push("Tab entry is invalid");
      continue;
    }
    if (!t.id || typeof t.id !== "string") {
      errors.push("Tab is missing id");
    } else if (tabIds.has(t.id)) {
      errors.push(`Duplicate tab id "${t.id}"`);
    } else {
      tabIds.add(t.id);
    }
    if (!t.name || typeof t.name !== "string" || !t.name.trim()) {
      errors.push(`Tab "${t.id || "unnamed"}" needs a name`);
    }
    if (!t.grid || typeof t.grid !== "object") {
      errors.push(`Tab "${t.name || t.id || "unnamed"}" is missing grid`);
    } else {
      if (
        !Number.isFinite(t.grid.cols) ||
        t.grid.cols < GRID_MIN ||
        t.grid.cols > GRID_MAX
      ) {
        errors.push(
          `Tab "${t.name || t.id}" columns must be between ${GRID_MIN} and ${GRID_MAX}`
        );
      }
      if (
        !Number.isFinite(t.grid.rows) ||
        t.grid.rows < GRID_MIN ||
        t.grid.rows > GRID_MAX
      ) {
        errors.push(
          `Tab "${t.name || t.id}" rows must be between ${GRID_MIN} and ${GRID_MAX}`
        );
      }
    }
  }

  if (!Array.isArray(profile.widgets)) {
    errors.push("Widgets must be an array");
  } else {
    const ids = new Set();
    for (const w of profile.widgets) {
      if (!w || typeof w !== "object") {
        errors.push("Widget entry is invalid");
        continue;
      }
      const label = w.name || w.id || "unnamed";
      if (!w.id) errors.push(`Widget "${label}" is missing id`);
      else if (ids.has(w.id)) errors.push(`Duplicate widget id "${w.id}"`);
      else ids.add(w.id);
      if (!w.type) errors.push(`Widget "${label}" is missing type`);
      else if (!WIDGET_TYPES.has(w.type)) {
        errors.push(`Unknown widget type "${w.type}" on "${label}"`);
      }
      if (w.tabId) {
        if (tabs.length === 0) {
          errors.push(`Widget "${label}" has tabId but profile has no tabs`);
        } else if (!tabIds.has(w.tabId)) {
          errors.push(`Widget "${label}" references unknown tab "${w.tabId}"`);
        }
      } else if (tabs.length > 0) {
        errors.push(`Widget "${label}" must belong to a tab`);
      }
      if (!w.layout || typeof w.layout !== "object") {
        errors.push(`Widget "${label}" is missing layout`);
      } else {
        const layout = w.layout;
        const g = gridForWidget(tabs, profile.grid || DEFAULT_GRID, w.tabId || null);
        const cols = g.cols || DEFAULT_GRID.cols;
        const rows = g.rows || DEFAULT_GRID.rows;
        if ((layout.x || 0) + (layout.w || 1) > cols) {
          errors.push(`Widget "${label}" exceeds grid width`);
        }
        if ((layout.y || 0) + (layout.h || 1) > rows) {
          errors.push(`Widget "${label}" exceeds grid height`);
        }
      }
      errors.push(...validateWidgetBinding(w));
    }
  }
  return { ok: errors.length === 0, errors };
}

function validateWidgetBinding(widget) {
  const errors = [];
  const label = widget.name || widget.id || "unnamed";
  const b = widget.binding;
  if (!b || typeof b !== "object") {
    errors.push(`Widget "${label}" is missing binding`);
    return errors;
  }
  if (widget.type === "button") {
    if (b.kind !== "shortcut") {
      errors.push(`Button "${label}" must use a shortcut binding`);
    }
  } else if (widget.type === "knob") {
    if (b.kind !== "key_stream") {
      errors.push(`Knob "${label}" must use a key_stream binding`);
    }
    const sens = Number(b.sensitivity);
    if (!Number.isFinite(sens) || sens < 1 || sens > 10) {
      errors.push(`Knob "${label}" sensitivity must be 1–10`);
    }
  } else if (widget.type === "slider") {
    if (b.kind !== "system_volume") {
      errors.push(`Slider "${label}" must use a system_volume binding`);
    }
    if (!Number.isFinite(Number(b.min)) || !Number.isFinite(Number(b.max))) {
      errors.push(`Slider "${label}" needs numeric min/max`);
    } else if (Number(b.min) >= Number(b.max)) {
      errors.push(`Slider "${label}" min must be less than max`);
    }
  } else if (widget.type === "trackpad") {
    if (b.kind !== "trackpad") {
      errors.push(`Trackpad "${label}" must use a trackpad binding`);
    }
    if (b.mode && b.mode !== "inline" && b.mode !== "button") {
      errors.push(`Trackpad "${label}" mode must be inline or button`);
    }
    const sens = Number(b.sensitivity);
    if (!Number.isFinite(sens) || sens < 1 || sens > 10) {
      errors.push(`Trackpad "${label}" sensitivity must be 1–10`);
    }
  }
  return errors;
}

/**
 * Looks like a TapPilot key-style export rather than a profile.
 */
function looksLikeKeyStyle(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  if (Array.isArray(raw.widgets) || raw.grid || raw.format === PROFILE_FORMAT) {
    return false;
  }
  return Boolean(
    raw.key ||
      raw.press ||
      raw.sound ||
      raw.haptics ||
      (typeof raw.name === "string" && raw.knob)
  );
}

/**
 * Validate raw JSON before import. Migrates legacy shapes, then validates.
 * @returns {{ ok: boolean, errors: string[], profile?: object }}
 */
function validateProfileImport(raw) {
  if (raw == null) {
    return { ok: false, errors: ["File is empty"] };
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return {
      ok: false,
      errors: ["Invalid JSON: expected a profile object, not an array or value"],
    };
  }
  if (looksLikeKeyStyle(raw)) {
    return {
      ok: false,
      errors: [
        "This looks like a key style file, not a profile. Import it from Key styles instead.",
      ],
    };
  }
  if (raw.format != null && raw.format !== PROFILE_FORMAT) {
    return {
      ok: false,
      errors: [
        `Unsupported profile format "${raw.format}". Expected "${PROFILE_FORMAT}".`,
      ],
    };
  }
  if (
    raw.schemaVersion != null &&
    (typeof raw.schemaVersion !== "number" ||
      raw.schemaVersion > CURRENT_SCHEMA_VERSION)
  ) {
    return {
      ok: false,
      errors: [
        `Unsupported schemaVersion ${raw.schemaVersion}. This app supports up to ${CURRENT_SCHEMA_VERSION}.`,
      ],
    };
  }

  let migrated;
  try {
    migrated = migrateProfile(raw);
  } catch (err) {
    return {
      ok: false,
      errors: [err instanceof Error ? err.message : "Could not migrate profile"],
    };
  }

  const validation = validateProfile(migrated);
  return {
    ok: validation.ok,
    errors: validation.errors,
    profile: validation.ok ? migrated : undefined,
  };
}

/**
 * Validate a key-style JSON export.
 * @returns {{ ok: boolean, errors: string[] }}
 */
function validateStyleImport(raw) {
  const errors = [];
  if (raw == null) {
    return { ok: false, errors: ["File is empty"] };
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return {
      ok: false,
      errors: ["Invalid JSON: expected a style object, not an array or value"],
    };
  }
  if (raw.format === PROFILE_FORMAT || Array.isArray(raw.widgets) || raw.grid) {
    return {
      ok: false,
      errors: [
        "This looks like a profile file, not a key style. Import it from Profiles instead.",
      ],
    };
  }
  if (!raw.name || typeof raw.name !== "string" || !raw.name.trim()) {
    errors.push("Style name is required");
  }
  if (!raw.key || typeof raw.key !== "object") {
    errors.push("Style is missing key look settings");
  }
  if (!raw.press || typeof raw.press !== "object") {
    errors.push("Style is missing press settings");
  }
  if (!raw.sound || typeof raw.sound !== "object") {
    errors.push("Style is missing sound settings");
  } else if (!["none", "synth", "custom"].includes(raw.sound.kind)) {
    errors.push(`Unknown sound kind "${raw.sound.kind}"`);
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Portable export: strip editor-only fields, keep styles under _embeddedStyles.
 */
function toPortableProfile(profile, embeddedStyles = []) {
  const {
    published: _published,
    styles: _styles,
    _embeddedStyles: _old,
    ...rest
  } = profile;
  return {
    ...rest,
    format: PROFILE_FORMAT,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    _embeddedStyles: embeddedStyles,
  };
}

/** Human-readable label for logs, e.g. "cmd+p" or "cmd+left click". */
function describeShortcut(shortcut) {
  if (!shortcut) return "(none)";
  if (shortcut.pointer) {
    const mods = (shortcut.modifiers || []).map((m) =>
      m === "meta" ? "cmd" : m
    );
    return [...mods, `${shortcut.pointer} click`].join("+");
  }
  const keys = shortcutToKeys(shortcut);
  return keys.length ? keys.join("+") : "(none)";
}

function targetAppDisplayName(targetApp) {
  if (typeof targetApp === "string") return targetApp;
  if (targetApp && typeof targetApp === "object") return targetApp.name || "";
  return "";
}

module.exports = {
  PROFILE_FORMAT,
  CURRENT_SCHEMA_VERSION,
  DEFAULT_GRID,
  DEFAULT_ICON,
  MAX_PROFILE_TABS,
  migrateProfile,
  validateProfile,
  validateProfileImport,
  validateStyleImport,
  toPortableProfile,
  normalizeTargetApp,
  normalizeExecution,
  normalizeBinding,
  keysToShortcut,
  shortcutToKeys,
  normalizeShortcut,
  resolvePlatformShortcut,
  describeShortcut,
  targetAppDisplayName,
  clampGrid,
  clampSensitivity,
};
