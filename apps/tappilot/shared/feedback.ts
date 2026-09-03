import type { KeyStyle, SoundSource, SynthPreset } from "./types";

type ClickVariant = "tap" | "primary" | "danger" | "soft";

let audioCtx: AudioContext | null = null;
let soundEnabled = true;
let hapticsEnabled = true;

/** Decoded custom-audio buffers, cached by their data-URL string. */
const bufferCache = new Map<string, AudioBuffer>();
const decoding = new Set<string>();

try {
  soundEnabled = localStorage.getItem("feedback:sound") !== "off";
  hapticsEnabled = localStorage.getItem("feedback:haptics") !== "off";
} catch {
  // storage unavailable (SSR / sandbox) — keep defaults
}

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AC) return null;
  if (!audioCtx) audioCtx = new AC();
  if (audioCtx.state === "suspended") void audioCtx.resume();
  return audioCtx;
}

export function isSoundEnabled() {
  return soundEnabled;
}

export function setSoundEnabled(value: boolean) {
  soundEnabled = value;
  try {
    localStorage.setItem("feedback:sound", value ? "on" : "off");
  } catch {
    // ignore
  }
  if (value) playClick("soft");
}

export function isHapticsEnabled() {
  return hapticsEnabled;
}

export function setHapticsEnabled(value: boolean) {
  hapticsEnabled = value;
  try {
    localStorage.setItem("feedback:haptics", value ? "on" : "off");
  } catch {
    // ignore
  }
  if (value) vibrate(14);
}

function dataUrlToArrayBuffer(dataUrl: string): ArrayBuffer | null {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return null;
  const meta = dataUrl.slice(0, comma);
  const body = dataUrl.slice(comma + 1);
  if (!meta.includes("base64")) return null;
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function playSynth(preset: SynthPreset) {
  const ac = getContext();
  if (!ac) return;
  const now = ac.currentTime;
  const dur = Math.max(0.01, (preset.durationMs || 140) / 1000);

  const master = ac.createGain();
  master.gain.value = Math.max(0, Math.min(1, preset.volume ?? 0.12));
  master.connect(ac.destination);

  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = preset.waveform || "triangle";
  const start = Math.max(20, preset.startFreq || 720);
  const end = Math.max(20, preset.endFreq || Math.max(80, start * 0.45));
  osc.frequency.setValueAtTime(start, now);
  osc.frequency.exponentialRampToValueAtTime(end, now + dur * 0.7);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(1, now + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

  osc.connect(gain).connect(master);
  osc.start(now);
  osc.stop(now + dur + 0.02);
}

function playBuffer(buffer: AudioBuffer, volume: number) {
  const ac = getContext();
  if (!ac) return;
  const src = ac.createBufferSource();
  const gain = ac.createGain();
  gain.gain.value = Math.max(0, Math.min(1, volume));
  src.buffer = buffer;
  src.connect(gain).connect(ac.destination);
  src.start();
}

function playCustom(audio: string, volume: number) {
  if (!audio) return;
  const cached = bufferCache.get(audio);
  if (cached) {
    playBuffer(cached, volume);
    return;
  }
  const ac = getContext();
  if (!ac) return;
  if (decoding.has(audio)) return;
  const raw = dataUrlToArrayBuffer(audio);
  if (!raw) return;
  decoding.add(audio);
  ac.decodeAudioData(
    raw.slice(0),
    (buffer) => {
      decoding.delete(audio);
      bufferCache.set(audio, buffer);
      playBuffer(buffer, volume);
    },
    () => {
      decoding.delete(audio);
    }
  );
}

/** Play a style's configured sound (synth preset, custom audio, or nothing). */
export function playSound(sound: SoundSource | undefined) {
  if (!soundEnabled || !sound) return;
  if (sound.kind === "none") return;
  if (sound.kind === "custom") {
    playCustom(sound.audio, sound.volume ?? 0.9);
    return;
  }
  playSynth(sound.preset);
}

/** Fire the sound + haptics defined by a key style. */
export function applyPressFeedback(style: KeyStyle | undefined) {
  if (!style) {
    feedback("tap");
    return;
  }
  playSound(style.sound);
  if (style.haptics?.enabled) {
    vibrate(style.haptics.pattern?.length ? style.haptics.pattern : 10);
  }
}

export function playClick(variant: ClickVariant = "tap") {
  if (!soundEnabled) return;
  const ac = getContext();
  if (!ac) return;

  const now = ac.currentTime;
  const master = ac.createGain();
  master.gain.value = variant === "soft" ? 0.06 : 0.12;
  master.connect(ac.destination);

  const osc = ac.createOscillator();
  const gain = ac.createGain();

  const start =
    variant === "primary" ? 960 : variant === "danger" ? 260 : variant === "soft" ? 520 : 720;
  const end = variant === "danger" ? 90 : Math.max(80, start * 0.45);

  osc.type = variant === "danger" ? "sawtooth" : "triangle";
  osc.frequency.setValueAtTime(start, now);
  osc.frequency.exponentialRampToValueAtTime(end, now + 0.09);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(1, now + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.13);

  osc.connect(gain).connect(master);
  osc.start(now);
  osc.stop(now + 0.14);

  // subtle high "tick" layer for a sci-fi edge
  if (variant !== "soft") {
    const tick = ac.createOscillator();
    const tickGain = ac.createGain();
    tick.type = "square";
    tick.frequency.setValueAtTime(start * 2.5, now);
    tickGain.gain.setValueAtTime(0.0001, now);
    tickGain.gain.exponentialRampToValueAtTime(0.4, now + 0.002);
    tickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);
    tick.connect(tickGain).connect(master);
    tick.start(now);
    tick.stop(now + 0.05);
  }
}

export function vibrate(pattern: number | number[] = 12) {
  if (!hapticsEnabled) return;
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(pattern);
    }
  } catch {
    // ignore
  }
}

export function feedback(variant: ClickVariant = "tap") {
  playClick(variant);
  vibrate(variant === "danger" ? [18, 26, 18] : variant === "primary" ? 18 : 10);
}

/**
 * Attach a global listener that fires click feedback for any button-like
 * element. Returns a cleanup function.
 */
export function installGlobalClickFeedback(target: Document | HTMLElement = document) {
  const handler = (event: Event) => {
    const el = event.target as HTMLElement | null;
    if (!el) return;
    const btn = el.closest<HTMLElement>(
      "button, [role='button'], [data-feedback]"
    );
    if (!btn) return;
    if (btn.hasAttribute("disabled")) return;
    if (btn.dataset.feedback === "off") return;

    let variant: ClickVariant = "tap";
    if (btn.dataset.feedback === "primary" || btn.classList.contains("btn-primary")) {
      variant = "primary";
    } else if (
      btn.dataset.feedback === "danger" ||
      btn.classList.contains("btn-danger")
    ) {
      variant = "danger";
    }
    feedback(variant);
  };
  target.addEventListener("pointerdown", handler, true);
  return () => target.removeEventListener("pointerdown", handler, true);
}
