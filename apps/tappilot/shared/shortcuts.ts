/**
 * Keyboard shortcut helpers shared by editor, phone, and schema migration.
 */

export type KeyModifier = "meta" | "ctrl" | "alt" | "shift";

export type PointerButton = "left" | "right" | "middle";

export type KeyboardShortcut = {
  /** KeyboardEvent.code, e.g. KeyP, ArrowUp, Space */
  code: string;
  /** Display / fallback key, e.g. P, ArrowUp, " " */
  key: string;
  modifiers: KeyModifier[];
  /**
   * When set, the binding is a mouse button press rather than a key. Modifiers
   * still apply, so ⌘ + left click is expressible.
   */
  pointer?: PointerButton;
};

export const POINTER_BUTTONS: PointerButton[] = ["left", "right", "middle"];

const POINTER_LABELS: Record<PointerButton, string> = {
  left: "Left Click",
  right: "Right Click",
  middle: "Middle Click",
};

/** MouseEvent.button → our pointer button names. */
const MOUSE_BUTTON_MAP: Record<number, PointerButton> = {
  0: "left",
  1: "middle",
  2: "right",
};

export function pointerButtonLabel(button: PointerButton): string {
  return POINTER_LABELS[button];
}

function pointerCode(button: PointerButton): string {
  return `Mouse${button.charAt(0).toUpperCase()}${button.slice(1)}`;
}

export function isPointerShortcut(
  shortcut: KeyboardShortcut | null | undefined
): boolean {
  return Boolean(shortcut?.pointer);
}

export type PlatformShortcutMap = {
  default?: KeyboardShortcut | null;
  macos?: KeyboardShortcut | null;
  windows?: KeyboardShortcut | null;
  linux?: KeyboardShortcut | null;
};

const MODIFIER_SET = new Set(["cmd", "command", "meta", "ctrl", "control", "alt", "option", "shift"]);

/** Convert legacy string[] tokens (cmd, shift, p) into a structured shortcut. */
export function keysToShortcut(keys: string[] | null | undefined): KeyboardShortcut | null {
  if (!Array.isArray(keys) || keys.length === 0) return null;
  const modifiers: KeyModifier[] = [];
  let main: string | null = null;
  for (const raw of keys) {
    const k = String(raw || "").trim().toLowerCase();
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
    // Solo modifier shortcut (allowed by current UI)
    const only = modifiers[0];
    return {
      code: modifierCode(only),
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

/** Flatten a structured shortcut back to legacy string tokens for the executor. */
export function shortcutToKeys(shortcut: KeyboardShortcut | null | undefined): string[] {
  if (!shortcut) return [];
  // Mouse bindings are dispatched as clicks, never as keystrokes.
  if (shortcut.pointer) return [];
  const keys: string[] = [];
  for (const m of shortcut.modifiers || []) {
    if (m === "meta") keys.push("cmd");
    else if (m === "ctrl") keys.push("ctrl");
    else if (m === "alt") keys.push("alt");
    else if (m === "shift") keys.push("shift");
  }
  const main = (shortcut.key || "").toLowerCase();
  if (!main) return keys;
  // Solo modifier stored as key without modifiers array
  if (MODIFIER_SET.has(main) && keys.length === 0) {
    if (main === "meta" || main === "cmd" || main === "command") return ["cmd"];
    if (main === "control") return ["ctrl"];
    return [main === "option" ? "alt" : main];
  }
  keys.push(normalizeMainToken(main, shortcut.code));
  return keys;
}

/** Pick the best shortcut for the current OS from a platform map / single shortcut. */
export function resolvePlatformShortcut(
  shortcut: KeyboardShortcut | null | undefined,
  shortcuts: PlatformShortcutMap | null | undefined,
  platform: NodeJS.Platform | string = typeof process !== "undefined" ? process.platform : "darwin"
): KeyboardShortcut | null {
  const map = shortcuts || {};
  if (platform === "darwin" && map.macos) return map.macos;
  if (platform === "win32" && map.windows) return map.windows;
  if (platform === "linux" && map.linux) return map.linux;
  if (map.default) return map.default;
  return shortcut || null;
}

export function formatKeyboardShortcut(shortcut: KeyboardShortcut | null | undefined): string {
  if (!shortcut) return "";
  if (shortcut.pointer) {
    return formatShortcutTokens([
      ...modifiersToTokens(shortcut.modifiers),
      POINTER_LABELS[shortcut.pointer],
    ]);
  }
  return formatShortcutTokens(shortcutToKeys(shortcut));
}

function modifiersToTokens(modifiers: KeyModifier[] | undefined): string[] {
  return (modifiers || []).map((m) => (m === "meta" ? "cmd" : m));
}

/** Capture a mouse button (plus held modifiers) as a bindable shortcut. */
export function shortcutFromMouseEvent(
  e: Pick<MouseEvent, "button" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">
): KeyboardShortcut | null {
  const pointer = MOUSE_BUTTON_MAP[e.button];
  if (!pointer) return null;
  const modifiers: KeyModifier[] = [];
  if (e.metaKey) modifiers.push("meta");
  if (e.ctrlKey) modifiers.push("ctrl");
  if (e.altKey) modifiers.push("alt");
  if (e.shiftKey) modifiers.push("shift");
  return {
    code: pointerCode(pointer),
    key: pointer,
    modifiers,
    pointer,
  };
}

const MODIFIER_ORDER: KeyModifier[] = ["ctrl", "alt", "shift", "meta"];

const MODIFIER_SYMBOL: Record<KeyModifier, string> = {
  ctrl: "⌃",
  alt: "⌥",
  shift: "⇧",
  meta: "⌘",
};

const KEY_SYMBOL: Record<string, string> = {
  arrowup: "↑",
  arrowdown: "↓",
  arrowleft: "←",
  arrowright: "→",
  enter: "↩",
  escape: "esc",
  backspace: "⌫",
  delete: "⌦",
  tab: "⇥",
  " ": "space",
};

/**
 * Compact key-cap label for widget faces, e.g. `⇧⌘Z`, `F`, `⌘Left Click`.
 * Modifiers are ordered ⌃⌥⇧⌘ regardless of capture order.
 */
export function formatShortcutBadge(
  shortcut: KeyboardShortcut | null | undefined
): string {
  if (!shortcut) return "";
  const mods = MODIFIER_ORDER.filter((m) =>
    (shortcut.modifiers || []).includes(m)
  )
    .map((m) => MODIFIER_SYMBOL[m])
    .join("");

  if (shortcut.pointer) {
    return `${mods}${POINTER_LABELS[shortcut.pointer]}`;
  }

  const key = shortcut.key || "";
  const lower = key.toLowerCase();

  // Solo modifier bindings store the modifier as the key.
  if (!mods && MODIFIER_SET.has(lower)) {
    if (lower === "meta" || lower === "cmd" || lower === "command") return "⌘";
    if (lower === "ctrl" || lower === "control") return "⌃";
    if (lower === "alt" || lower === "option") return "⌥";
    return "⇧";
  }

  const label =
    KEY_SYMBOL[lower] || (key.length === 1 ? key.toUpperCase() : key);
  return `${mods}${label}`;
}

export function formatShortcutTokens(keys: string[]): string {
  return (keys || [])
    .map((k) => {
      const lower = k.toLowerCase();
      if (lower === "cmd" || lower === "meta") return "⌘";
      if (lower === "ctrl") return "⌃";
      if (lower === "alt") return "⌥";
      if (lower === "shift") return "⇧";
      return k.length === 1 ? k.toUpperCase() : k;
    })
    .join(" + ");
}

export function shortcutFromKeyboardEvent(e: KeyboardEvent): KeyboardShortcut | null {
  const MODIFIER_KEYS = new Set([
    "Meta",
    "MetaLeft",
    "MetaRight",
    "Control",
    "ControlLeft",
    "ControlRight",
    "Alt",
    "AltLeft",
    "AltRight",
    "Shift",
    "ShiftLeft",
    "ShiftRight",
  ]);
  if (MODIFIER_KEYS.has(e.key) || MODIFIER_KEYS.has(e.code)) {
    return null;
  }
  const modifiers: KeyModifier[] = [];
  if (e.metaKey) modifiers.push("meta");
  if (e.ctrlKey) modifiers.push("ctrl");
  if (e.altKey) modifiers.push("alt");
  if (e.shiftKey) modifiers.push("shift");
  return {
    code: e.code || "",
    key: e.key.length === 1 ? e.key.toUpperCase() : e.key,
    modifiers,
  };
}

export function soloModifierShortcut(e: { code: string }): KeyboardShortcut | null {
  const code = e.code;
  if (code === "MetaLeft" || code === "MetaRight") {
    return { code, key: "meta", modifiers: [] };
  }
  if (code === "ControlLeft" || code === "ControlRight") {
    return { code, key: "ctrl", modifiers: [] };
  }
  if (code === "AltLeft" || code === "AltRight") {
    return { code, key: "alt", modifiers: [] };
  }
  if (code === "ShiftLeft" || code === "ShiftRight") {
    return { code, key: "shift", modifiers: [] };
  }
  return null;
}

function modifierCode(m: KeyModifier): string {
  if (m === "meta") return "MetaLeft";
  if (m === "ctrl") return "ControlLeft";
  if (m === "alt") return "AltLeft";
  return "ShiftLeft";
}

function tokenToCode(token: string): string {
  if (token.length === 1 && /[a-z]/.test(token)) return `Key${token.toUpperCase()}`;
  if (token.length === 1 && /[0-9]/.test(token)) return `Digit${token}`;
  const map: Record<string, string> = {
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

function tokenToKey(token: string): string {
  if (token.length === 1) return token.toUpperCase();
  const map: Record<string, string> = {
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

function normalizeMainToken(key: string, code: string): string {
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
