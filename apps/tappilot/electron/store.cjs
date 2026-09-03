const { app } = require("electron");
const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");
const schema = require("./profileSchema.cjs");

const {
  DEFAULT_GRID,
  DEFAULT_ICON,
  migrateProfile,
  validateProfile,
  validateProfileImport,
  validateStyleImport,
  toPortableProfile,
  normalizeTargetApp,
  normalizeExecution,
  targetAppDisplayName,
  clampGrid,
} = schema;

function toolDataDir() {
  const root = path.join(app.getPath("userData"), "artist-studio", "tappilot");
  fs.mkdirSync(root, { recursive: true });
  migrateStandaloneData(root);
  return root;
}

let legacyMigrationChecked = false;

function migrateStandaloneData(root) {
  if (legacyMigrationChecked) return;
  legacyMigrationChecked = true;
  const legacyRoot = path.join(app.getPath("appData"), "TapPilot");
  if (legacyRoot === root || !fs.existsSync(legacyRoot)) return;
  for (const name of ["profiles", "styles"]) {
    const source = path.join(legacyRoot, name);
    const destination = path.join(root, name);
    if (fs.existsSync(source) && !fs.existsSync(destination)) {
      fs.cpSync(source, destination, { recursive: true });
    }
  }
}

function profilesDir() {
  const dir = path.join(toolDataDir(), "profiles");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function indexPath() {
  return path.join(profilesDir(), "index.json");
}

function profilePath(id) {
  return path.join(profilesDir(), `${id}.json`);
}

function readIndex() {
  const file = indexPath();
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify({ ids: [] }, null, 2));
  }
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeIndex(index) {
  fs.writeFileSync(indexPath(), JSON.stringify(index, null, 2));
}

function normalizeProfile(raw) {
  if (!raw) return null;
  const migrated = migrateProfile(raw);
  const { styles: _styles, _embeddedStyles: _embedded, ...rest } = migrated;
  const now = new Date().toISOString();
  return {
    ...rest,
    format: schema.PROFILE_FORMAT,
    schemaVersion: schema.CURRENT_SCHEMA_VERSION,
    name: migrated.name || "Untitled Profile",
    description:
      typeof migrated.description === "string" ? migrated.description : "",
    targetApp: normalizeTargetApp(migrated.targetApp),
    execution: normalizeExecution(migrated.execution),
    metadata: {
      createdWith: "TapPilot",
      createdWithVersion: "1.0.0",
      createdAt:
        (migrated.metadata && migrated.metadata.createdAt) ||
        migrated.updatedAt ||
        now,
      updatedAt: migrated.updatedAt || now,
      source: (migrated.metadata && migrated.metadata.source) || "local",
    },
    image: migrated.image || migrated.iconImage || null,
    grid: migrated.grid || { ...DEFAULT_GRID },
    tabs: Array.isArray(migrated.tabs) ? migrated.tabs : [],
    published: Boolean(migrated.published),
    styleId: migrated.styleId || null,
    widgets: migrated.widgets || [],
  };
}

function listProfiles() {
  const { ids } = readIndex();
  const summaries = [];
  for (const id of ids) {
    const file = profilePath(id);
    if (!fs.existsSync(file)) continue;
    const profile = normalizeProfile(JSON.parse(fs.readFileSync(file, "utf8")));
    summaries.push({
      id: profile.id,
      name: profile.name,
      description: profile.description,
      targetApp: targetAppDisplayName(profile.targetApp),
      published: Boolean(profile.published),
      updatedAt: profile.updatedAt,
      image: profile.image || null,
      grid: profile.grid,
      widgetCount: Array.isArray(profile.widgets) ? profile.widgets.length : 0,
    });
  }
  return summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function getProfile(id) {
  const file = profilePath(id);
  if (!fs.existsSync(file)) return null;
  return normalizeProfile(JSON.parse(fs.readFileSync(file, "utf8")));
}

function listPublishedProfiles() {
  return listProfiles()
    .filter((p) => p.published)
    .map((p) => getProfile(p.id))
    .filter(Boolean);
}

function createProfile({ name, description, targetApp, image, grid } = {}) {
  const id = randomUUID();
  const now = new Date().toISOString();
  const cols = clampGrid(grid?.cols, DEFAULT_GRID.cols);
  const rows = clampGrid(grid?.rows, DEFAULT_GRID.rows);
  const profile = normalizeProfile({
    id,
    name: name || "Untitled Profile",
    description: description || "",
    targetApp: normalizeTargetApp(targetApp || ""),
    execution: { targetMode: "activate-target-app", showInactiveWarning: true },
    image: image || null,
    grid: { cols, rows },
    tabs: [],
    published: false,
    updatedAt: now,
    widgets: [],
  });
  fs.writeFileSync(profilePath(id), JSON.stringify(profile, null, 2));
  const index = readIndex();
  index.ids.unshift(id);
  writeIndex(index);
  return profile;
}

function formatValidationError(errors) {
  const list = Array.isArray(errors) ? errors.filter(Boolean) : [];
  if (!list.length) return "Import validation failed";
  if (list.length === 1) return list[0];
  return `Import validation failed:\n• ${list.join("\n• ")}`;
}

/**
 * Dry-run validation for a profile JSON payload (no disk writes).
 * @returns {{ ok: boolean, errors: string[] }}
 */
function validateImport(data) {
  const result = validateProfileImport(data);
  return { ok: result.ok, errors: result.errors };
}

/**
 * @param {unknown} data
 * @param {{ mode?: "copy" | "replace"; replaceId?: string }} [options]
 */
function importProfile(data, options = {}) {
  const check = validateProfileImport(data);
  if (!check.ok) {
    const err = new Error(formatValidationError(check.errors));
    err.code = "VALIDATION_FAILED";
    err.errors = check.errors;
    throw err;
  }

  const migrated = check.profile;

  // Recreate any embedded styles (with fresh ids) and remap references.
  const idMap = {};
  const embedded = Array.isArray(data._embeddedStyles)
    ? data._embeddedStyles
    : Array.isArray(data.styles)
      ? data.styles
      : [];
  for (const s of embedded) {
    if (!s || !s.id || s.id === DEFAULT_KEY_STYLE.id) continue;
    try {
      const created = importStyle(s);
      idMap[s.id] = created.id;
    } catch {
      // skip malformed embedded style
    }
  }
  const remap = (styleId) => (styleId && idMap[styleId]) || styleId || null;

  const mode = options.mode === "replace" ? "replace" : "copy";
  let id = randomUUID();
  const now = new Date().toISOString();

  if (mode === "replace") {
    const existing =
      (options.replaceId && getProfile(options.replaceId)) ||
      findProfileByName(migrated.name);
    if (existing) {
      id = existing.id;
      deleteProfile(existing.id);
      // deleteProfile removes from index; we'll re-add below
    }
  }

  const profile = normalizeProfile({
    ...migrated,
    id,
    name:
      mode === "copy" && findProfileByName(migrated.name)
        ? `${migrated.name} (imported)`
        : migrated.name || "Imported Profile",
    published: false,
    updatedAt: now,
    styleId: remap(migrated.styleId),
    widgets: Array.isArray(migrated.widgets)
      ? migrated.widgets.map((w) => ({ ...w, styleId: remap(w.styleId) }))
      : [],
    metadata: {
      ...(migrated.metadata || {}),
      source: "imported",
      updatedAt: now,
    },
  });

  fs.writeFileSync(profilePath(id), JSON.stringify(profile, null, 2));
  const index = readIndex();
  if (!index.ids.includes(id)) index.ids.unshift(id);
  writeIndex(index);
  return profile;
}

function findProfileByName(name) {
  if (!name) return null;
  const { ids } = readIndex();
  for (const id of ids) {
    const p = getProfile(id);
    if (p && p.name === name) return p;
  }
  return null;
}

function findImportConflicts(data) {
  if (!data || typeof data !== "object") return { nameConflict: null, idConflict: null };
  const name = typeof data.name === "string" ? data.name : null;
  const id = typeof data.id === "string" ? data.id : null;
  return {
    nameConflict: name ? findProfileByName(name) : null,
    idConflict: id ? getProfile(id) : null,
  };
}

/**
 * Portable export: strip published + attach embedded styles.
 */
function exportProfile(id) {
  const profile = getProfile(id);
  if (!profile) return null;
  const styles = resolveProfileStyles(profile);
  const embedded = Object.values(styles).filter(
    (s) => s.id !== DEFAULT_KEY_STYLE.id
  );
  return toPortableProfile(profile, embedded);
}

function saveProfile(profile) {
  if (!profile?.id) throw new Error("Profile id required");
  const existing = getProfile(profile.id);
  if (!existing) throw new Error("Profile not found");
  const next = normalizeProfile({
    ...existing,
    ...profile,
    id: existing.id,
    updatedAt: new Date().toISOString(),
    widgets: Array.isArray(profile.widgets) ? profile.widgets : existing.widgets,
    metadata: {
      ...(existing.metadata || {}),
      ...(profile.metadata || {}),
      updatedAt: new Date().toISOString(),
    },
  });
  const validation = validateProfile(next);
  if (!validation.ok) {
    const err = new Error(validation.errors.join("; "));
    err.code = "VALIDATION_FAILED";
    err.errors = validation.errors;
    throw err;
  }
  fs.writeFileSync(profilePath(next.id), JSON.stringify(next, null, 2));
  return next;
}

function setPublished(id, published) {
  const profile = getProfile(id);
  if (!profile) throw new Error("Profile not found");
  profile.published = Boolean(published);
  profile.updatedAt = new Date().toISOString();
  if (profile.metadata) profile.metadata.updatedAt = profile.updatedAt;
  fs.writeFileSync(profilePath(id), JSON.stringify(profile, null, 2));
  return profile;
}

function deleteProfile(id) {
  const file = profilePath(id);
  if (fs.existsSync(file)) fs.unlinkSync(file);
  const index = readIndex();
  index.ids = index.ids.filter((x) => x !== id);
  writeIndex(index);
  return true;
}

/* ============================ Key styles ============================ */

const DEFAULT_KEY_STYLE = {
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
  haptics: { enabled: true, pattern: [10] },
  sound: {
    kind: "synth",
    preset: {
      waveform: "triangle",
      startFreq: 720,
      endFreq: 324,
      durationMs: 140,
      volume: 0.12,
    },
  },
};

function clampNum(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function str(value, fallback) {
  return typeof value === "string" && value ? value : fallback;
}

function normalizeSound(raw) {
  const d = DEFAULT_KEY_STYLE.sound;
  if (!raw || typeof raw !== "object") return { ...d, preset: { ...d.preset } };
  if (raw.kind === "none") return { kind: "none" };
  if (raw.kind === "custom") {
    return {
      kind: "custom",
      audio: typeof raw.audio === "string" ? raw.audio : "",
      volume: clampNum(raw.volume, 0, 1, 0.9),
    };
  }
  const p = raw.preset || {};
  const dp = d.preset;
  const waveforms = ["sine", "triangle", "square", "sawtooth"];
  return {
    kind: "synth",
    preset: {
      waveform: waveforms.includes(p.waveform) ? p.waveform : dp.waveform,
      startFreq: clampNum(p.startFreq, 20, 20000, dp.startFreq),
      endFreq: clampNum(p.endFreq, 20, 20000, dp.endFreq),
      durationMs: clampNum(p.durationMs, 10, 2000, dp.durationMs),
      volume: clampNum(p.volume, 0, 1, dp.volume),
    },
  };
}

function normalizeShadows(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 12).map((shadow) => ({
    x: clampNum(shadow?.x, -100, 100, 0),
    y: clampNum(shadow?.y, -100, 100, 4),
    blur: clampNum(shadow?.blur, 0, 200, 12),
    spread: clampNum(shadow?.spread, -100, 100, 0),
    color: str(shadow?.color, "#00000066"),
    inset: Boolean(shadow?.inset),
  }));
}

function normalizeStyle(raw) {
  if (!raw || typeof raw !== "object") return null;
  const d = DEFAULT_KEY_STYLE;
  const k = raw.key || {};
  const pr = raw.press || {};
  const kn = raw.knob || {};
  const ha = raw.haptics || {};
  const animations = ["none", "scale", "glow", "pulse", "ripple"];
  const pattern = Array.isArray(ha.pattern)
    ? ha.pattern.map((n) => clampNum(n, 0, 1000, 10)).slice(0, 12)
    : d.haptics.pattern.slice();
  return {
    id: raw.id || randomUUID(),
    name: str(raw.name, "Untitled Style"),
    description: typeof raw.description === "string" ? raw.description : "",
    updatedAt: raw.updatedAt || new Date().toISOString(),
    key: {
      bg1: str(k.bg1, d.key.bg1),
      bg2: str(k.bg2, d.key.bg2),
      borderColor: str(k.borderColor, d.key.borderColor),
      borderWidth: clampNum(k.borderWidth, 0, 8, d.key.borderWidth),
      radius: clampNum(k.radius, 0, 40, d.key.radius),
      textColor: str(k.textColor, d.key.textColor),
      iconColor: str(k.iconColor, d.key.iconColor),
      glowColor: str(k.glowColor, d.key.glowColor),
      shadows: normalizeShadows(k.shadows),
      pressedShadows: normalizeShadows(k.pressedShadows),
    },
    press: {
      animation: animations.includes(pr.animation)
        ? pr.animation
        : d.press.animation,
      scale: clampNum(pr.scale, 0.7, 1.1, d.press.scale),
      glowColor: str(pr.glowColor, d.press.glowColor),
      glowIntensity: clampNum(pr.glowIntensity, 0, 1, d.press.glowIntensity),
      durationMs: clampNum(pr.durationMs, 0, 1000, d.press.durationMs),
    },
    knob: {
      ringColor: str(kn.ringColor, d.knob.ringColor),
      dialColor: str(kn.dialColor, d.knob.dialColor),
      notchColor: str(kn.notchColor, d.knob.notchColor),
      glow: kn.glow !== undefined ? Boolean(kn.glow) : d.knob.glow,
    },
    haptics: {
      enabled: ha.enabled !== undefined ? Boolean(ha.enabled) : d.haptics.enabled,
      pattern,
    },
    sound: normalizeSound(raw.sound),
  };
}

function stylesDir() {
  const dir = path.join(toolDataDir(), "styles");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function styleIndexPath() {
  return path.join(stylesDir(), "index.json");
}

function stylePath(id) {
  return path.join(stylesDir(), `${id}.json`);
}

function readStyleIndex() {
  const file = styleIndexPath();
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify({ ids: [] }, null, 2));
  }
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeStyleIndex(index) {
  fs.writeFileSync(styleIndexPath(), JSON.stringify(index, null, 2));
}

function listStyles() {
  const { ids } = readStyleIndex();
  const summaries = [];
  for (const id of ids) {
    const file = stylePath(id);
    if (!fs.existsSync(file)) continue;
    const style = normalizeStyle(JSON.parse(fs.readFileSync(file, "utf8")));
    if (!style) continue;
    summaries.push({
      id: style.id,
      name: style.name,
      description: style.description,
      updatedAt: style.updatedAt,
    });
  }
  return summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function getStyle(id) {
  if (!id || id === DEFAULT_KEY_STYLE.id) return { ...DEFAULT_KEY_STYLE };
  const file = stylePath(id);
  if (!fs.existsSync(file)) return null;
  return normalizeStyle(JSON.parse(fs.readFileSync(file, "utf8")));
}

function persistStyle(style) {
  fs.writeFileSync(stylePath(style.id), JSON.stringify(style, null, 2));
  const index = readStyleIndex();
  if (!index.ids.includes(style.id)) {
    index.ids.unshift(style.id);
    writeStyleIndex(index);
  }
}

function createStyle(payload = {}) {
  const style = normalizeStyle({
    ...DEFAULT_KEY_STYLE,
    ...payload,
    id: randomUUID(),
    name: payload.name || "New Style",
    description: payload.description || "",
    updatedAt: new Date().toISOString(),
  });
  persistStyle(style);
  return style;
}

function saveStyle(style) {
  if (!style?.id) throw new Error("Style id required");
  if (style.id === DEFAULT_KEY_STYLE.id) {
    throw new Error("The default style cannot be edited");
  }
  const next = normalizeStyle({ ...style, updatedAt: new Date().toISOString() });
  persistStyle(next);
  return next;
}

function deleteStyle(id) {
  if (id === DEFAULT_KEY_STYLE.id) return false;
  const file = stylePath(id);
  if (fs.existsSync(file)) fs.unlinkSync(file);
  const index = readStyleIndex();
  index.ids = index.ids.filter((x) => x !== id);
  writeStyleIndex(index);
  return true;
}

function importStyle(data) {
  const check = validateStyleImport(data);
  if (!check.ok) {
    const err = new Error(formatValidationError(check.errors));
    err.code = "VALIDATION_FAILED";
    err.errors = check.errors;
    throw err;
  }
  const style = normalizeStyle({
    ...data,
    id: randomUUID(),
    name: data.name || "Imported Style",
    updatedAt: new Date().toISOString(),
  });
  persistStyle(style);
  return style;
}

/**
 * Collect the styles referenced by a profile (its default + any widget
 * overrides) into a `{ [styleId]: KeyStyle }` map. The built-in default is
 * always present so the phone has a guaranteed fallback.
 */
function resolveProfileStyles(profile) {
  const map = { [DEFAULT_KEY_STYLE.id]: { ...DEFAULT_KEY_STYLE } };
  const ids = new Set();
  if (profile?.styleId) ids.add(profile.styleId);
  for (const w of profile?.widgets || []) {
    if (w.styleId) ids.add(w.styleId);
  }
  for (const id of ids) {
    const style = getStyle(id);
    map[id] = style || { ...DEFAULT_KEY_STYLE };
  }
  return map;
}

module.exports = {
  listProfiles,
  getProfile,
  listPublishedProfiles,
  createProfile,
  importProfile,
  validateImport,
  exportProfile,
  findImportConflicts,
  findProfileByName,
  saveProfile,
  setPublished,
  deleteProfile,
  DEFAULT_KEY_STYLE,
  normalizeStyle,
  listStyles,
  getStyle,
  createStyle,
  saveStyle,
  deleteStyle,
  importStyle,
  resolveProfileStyles,
  targetAppDisplayName,
};
