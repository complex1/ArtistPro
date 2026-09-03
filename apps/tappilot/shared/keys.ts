export function parseShortcutInput(input: string): string[] {
  return input
    .split(/[+\s]+/)
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean)
    .map((p) => {
      if (p === "cmd" || p === "⌘" || p === "command" || p === "meta") return "cmd";
      if (p === "ctrl" || p === "control" || p === "⌃") return "ctrl";
      if (p === "alt" || p === "option" || p === "⌥") return "alt";
      if (p === "shift" || p === "⇧") return "shift";
      return p;
    });
}

export function formatShortcut(keys: string[]): string {
  return (keys || [])
    .map((k) => {
      const lower = k.toLowerCase();
      if (lower === "cmd") return "⌘";
      if (lower === "ctrl") return "⌃";
      if (lower === "alt") return "⌥";
      if (lower === "shift") return "⇧";
      return k.length === 1 ? k.toUpperCase() : k;
    })
    .join(" + ");
}

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

/** Map a KeyboardEvent to shortcut tokens, or null if only modifiers were pressed. */
export function keysFromKeyboardEvent(e: KeyboardEvent): string[] | null {
  if (MODIFIER_KEYS.has(e.key) || MODIFIER_KEYS.has(e.code)) {
    return null;
  }

  const keys: string[] = [];
  if (e.metaKey) keys.push("cmd");
  if (e.ctrlKey) keys.push("ctrl");
  if (e.altKey) keys.push("alt");
  if (e.shiftKey) keys.push("shift");

  const main = normalizeEventKey(e);
  if (!main) return null;
  keys.push(main);
  return keys;
}

function normalizeEventKey(e: KeyboardEvent): string | null {
  const code = e.code;
  if (code.startsWith("Key") && code.length === 4) {
    return code.slice(3).toLowerCase();
  }
  if (code.startsWith("Digit") && code.length === 6) {
    return code.slice(5);
  }
  if (code.startsWith("Numpad") && code.length > 6) {
    const rest = code.slice(6).toLowerCase();
    return rest || null;
  }

  const map: Record<string, string> = {
    Space: "space",
    Enter: "enter",
    Escape: "escape",
    Tab: "tab",
    Backspace: "backspace",
    Delete: "delete",
    ArrowUp: "up",
    ArrowDown: "down",
    ArrowLeft: "left",
    ArrowRight: "right",
    Minus: "-",
    Equal: "=",
    BracketLeft: "[",
    BracketRight: "]",
    Backslash: "\\",
    Semicolon: ";",
    Quote: "'",
    Comma: ",",
    Period: ".",
    Slash: "/",
    Backquote: "`",
  };
  if (map[code]) return map[code];

  if (e.key.length === 1) {
    return e.key.toLowerCase();
  }
  return e.key.toLowerCase();
}
