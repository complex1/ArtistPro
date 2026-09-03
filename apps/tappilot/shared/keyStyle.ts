import type { CSSProperties } from "react";
import type { KeyShadow, KeyStyle, Profile, Widget } from "./types";
import { DEFAULT_KEY_STYLE } from "./types";

function shadowsToCss(shadows: KeyShadow[] | undefined): string {
  if (!shadows?.length) return "none";
  return shadows
    .map(
      ({ x, y, blur, spread, color, inset }) =>
        `${inset ? "inset " : ""}${x}px ${y}px ${blur}px ${spread}px ${color}`
    )
    .join(", ");
}

/**
 * Map a KeyStyle to the CSS custom properties consumed by the widget styles
 * (shared by the phone runtime and the desktop live preview).
 */
export function keyStyleVars(style: KeyStyle): CSSProperties {
  const s = style || DEFAULT_KEY_STYLE;
  return {
    "--k-bg1": s.key.bg1,
    "--k-bg2": s.key.bg2,
    "--k-border": s.key.borderColor,
    "--k-border-w": `${s.key.borderWidth}px`,
    "--k-radius": `${s.key.radius}px`,
    "--k-text": s.key.textColor,
    "--k-icon": s.key.iconColor,
    "--k-glow": s.key.glowColor,
    "--k-shadow": shadowsToCss(s.key.shadows),
    "--k-shadow-press": shadowsToCss(s.key.pressedShadows),
    "--k-press-scale": String(s.press.scale),
    "--k-press-glow": s.press.glowColor,
    "--k-press-glow-a": String(s.press.glowIntensity),
    "--k-press-dur": `${s.press.durationMs}ms`,
    "--knob-ring": s.knob.ringColor,
    "--knob-dial": s.knob.dialColor,
    "--knob-notch": s.knob.notchColor,
    "--knob-glow": s.knob.glow ? "1" : "0",
  } as CSSProperties;
}

/** Class name that selects the configured press animation. */
export function pressClass(style: KeyStyle): string {
  return `kp kp-anim-${(style || DEFAULT_KEY_STYLE).press.animation}`;
}

/**
 * Resolve the effective style for a widget: widget override -> profile default
 * -> built-in default. Uses the `styles` map the server attaches to a profile.
 */
export function effectiveStyle(profile: Profile, widget: Widget): KeyStyle {
  const map = profile.styles || {};
  return (
    (widget.styleId && map[widget.styleId]) ||
    (profile.styleId && map[profile.styleId]) ||
    DEFAULT_KEY_STYLE
  );
}
