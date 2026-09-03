import { useRef, useState } from "react";
import type { KeyboardShortcut } from "../../shared/shortcuts";
import {
  formatKeyboardShortcut,
  shortcutFromKeyboardEvent,
  shortcutFromMouseEvent,
  soloModifierShortcut,
} from "../../shared/shortcuts";
import { DynamicIcon } from "./DynamicIcon";

type Props = {
  label: string;
  value: KeyboardShortcut | null | undefined;
  onChange: (shortcut: KeyboardShortcut | null) => void;
  placeholder?: string;
  hint?: string;
  /** Allow recording mouse buttons in addition to keys. */
  allowPointer?: boolean;
};

export function KeyCaptureInput({
  label,
  value,
  onChange,
  placeholder = "Click, then press keys or mouse buttons",
  hint = "Focus the field, then press a combo (P, ⌘Z) or click a mouse button.",
  allowPointer = true,
}: Props) {
  const sawMainKey = useRef(false);
  const [recording, setRecording] = useState(false);
  const display = value ? formatKeyboardShortcut(value) : "";

  /**
   * The click that focuses the field must not be recorded, otherwise the field
   * could only ever hold "Left Click". Recording starts once focus lands, so
   * the first mousedown (which fires before focus) is ignored.
   */
  function onMouseDown(e: React.MouseEvent<HTMLInputElement>) {
    if (!allowPointer || !recording) return;
    const shortcut = shortcutFromMouseEvent(e.nativeEvent);
    if (!shortcut) return;
    e.preventDefault();
    e.stopPropagation();
    onChange(shortcut);
  }

  return (
    <div className="field">
      <label>{label}</label>
      <div className="key-capture-row">
        <input
          className={`key-capture-input ${recording ? "recording" : ""}`}
          value={display}
          placeholder={placeholder}
          readOnly
          data-feedback="off"
          onFocus={() => setRecording(true)}
          onBlur={() => {
            setRecording(false);
            sawMainKey.current = false;
          }}
          onMouseDown={onMouseDown}
          onAuxClick={(e) => e.preventDefault()}
          onContextMenu={(e) => {
            if (allowPointer && recording) e.preventDefault();
          }}
          onKeyDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const shortcut = shortcutFromKeyboardEvent(e.nativeEvent);
            if (shortcut) {
              sawMainKey.current = true;
              onChange(shortcut);
            }
          }}
          onKeyUp={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!sawMainKey.current) {
              const solo = soloModifierShortcut(e);
              if (solo) onChange(solo);
            }
            if (!e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
              sawMainKey.current = false;
            }
          }}
        />
        <button
          type="button"
          className="icon-btn danger"
          onClick={() => onChange(null)}
          disabled={!value}
          aria-label="Clear shortcut"
          title="Clear"
        >
          <DynamicIcon name="X" size={16} />
        </button>
      </div>
      <span className="hint">{recording ? "Recording…" : hint}</span>
    </div>
  );
}
