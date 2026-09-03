import { useState } from "react";
import type {
  KeyShadow,
  KeyStyle,
  PressAnimation,
  SoundSource,
  SynthWaveform,
} from "../../shared/types";
import { DEFAULT_SYNTH_PRESET } from "../../shared/types";
import { keyStyleVars, pressClass } from "../../shared/keyStyle";
import { playSound } from "../../shared/feedback";
import {
  ButtonFace,
  KnobFace,
  SliderFace,
  TrackpadFace,
} from "../../shared/WidgetFace";
import { DynamicIcon } from "./DynamicIcon";

type Props = {
  style: KeyStyle;
  onChange: (style: KeyStyle) => void;
  onSave: () => Promise<void>;
  onBack: () => void;
};

const ANIMATIONS: PressAnimation[] = ["none", "scale", "glow", "pulse", "ripple"];
const WAVEFORMS: SynthWaveform[] = ["sine", "triangle", "square", "sawtooth"];

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function KeyStyleEditor({ style, onChange, onSave, onBack }: Props) {
  const [saving, setSaving] = useState(false);
  const [knobValue, setKnobValue] = useState(0.62);

  const set = (patch: Partial<KeyStyle>) => onChange({ ...style, ...patch });
  const setKey = (patch: Partial<KeyStyle["key"]>) =>
    set({ key: { ...style.key, ...patch } });
  const setPress = (patch: Partial<KeyStyle["press"]>) =>
    set({ press: { ...style.press, ...patch } });
  const setKnob = (patch: Partial<KeyStyle["knob"]>) =>
    set({ knob: { ...style.knob, ...patch } });
  const setHaptics = (patch: Partial<KeyStyle["haptics"]>) =>
    set({ haptics: { ...style.haptics, ...patch } });

  const sound = style.sound;
  const setSound = (next: SoundSource) => set({ sound: next });

  async function onPickAudio(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("audio/")) {
      alert("Please choose an audio file (mp3, wav, …)");
      return;
    }
    try {
      const audio = await readFileAsDataUrl(file);
      setSound({
        kind: "custom",
        audio,
        volume: sound.kind === "custom" ? sound.volume : 0.9,
      });
    } catch {
      alert("Could not read that audio file");
    }
  }

  const vars = keyStyleVars(style);

  return (
    <div className="editor-root">
      <div className="editor-topbar">
        <div className="editor-topbar-left">
          <button className="icon-btn" onClick={onBack} aria-label="Back">
            <DynamicIcon name="ChevronLeft" size={18} />
          </button>
          <strong className="editor-title">{style.name || "Key style"}</strong>
        </div>
        <div className="editor-topbar-right">
          <button
            className="btn btn-primary neon"
            disabled={saving}
            onClick={() => {
              setSaving(true);
              void onSave().finally(() => setSaving(false));
            }}
          >
            <DynamicIcon name="Save" size={14} /> Save
          </button>
        </div>
      </div>

      <div className="style-editor">
        {/* live preview */}
        <div className="style-preview" style={vars}>
          <div className="style-preview-inner">
            <button className={`wf-card kp-preview button ${pressClass(style)}`}>
              <ButtonFace name="Button" icon="lucide:sparkles" badge="⌘K" />
            </button>

            <div
              className={`wf-card kp-preview knob ${pressClass(style)}`}
              onPointerMove={(e) => {
                if (!e.buttons) return;
                setKnobValue((v) =>
                  Math.max(0, Math.min(1, v + e.movementX / 180))
                );
              }}
            >
              <KnobFace name="Knob" icon="lucide:circle-dot" value={knobValue} />
            </div>

            <div className={`wf-card kp-preview slider ${pressClass(style)}`}>
              <SliderFace
                name="Slider"
                value={70}
                min={0}
                max={100}
                orientation="vertical"
              />
            </div>

            <div
              className={`wf-card wf-trackpad kp-preview trackpad ${pressClass(
                style
              )}`}
            >
              <TrackpadFace name="Trackpad" />
            </div>
          </div>
          <p className="hint center">Live preview</p>
        </div>

        {/* form */}
        <div className="style-form">
          <div className="panel">
            <h2>Meta</h2>
            <div className="field">
              <label>Name</label>
              <input
                value={style.name}
                onChange={(e) => set({ name: e.target.value })}
                placeholder="My neon style"
              />
            </div>
            <div className="field">
              <label>Description</label>
              <input
                value={style.description}
                onChange={(e) => set({ description: e.target.value })}
                placeholder="Optional"
              />
            </div>
          </div>

          <div className="panel">
            <h2>Key look</h2>
            <div className="color-grid">
              <ColorField label="Background top" value={style.key.bg1} onChange={(bg1) => setKey({ bg1 })} />
              <ColorField label="Background bottom" value={style.key.bg2} onChange={(bg2) => setKey({ bg2 })} />
              <ColorField label="Border" value={style.key.borderColor} onChange={(borderColor) => setKey({ borderColor })} />
              <ColorField label="Glow / accent" value={style.key.glowColor} onChange={(glowColor) => setKey({ glowColor })} />
              <ColorField label="Text" value={style.key.textColor} onChange={(textColor) => setKey({ textColor })} />
              <ColorField label="Icon" value={style.key.iconColor} onChange={(iconColor) => setKey({ iconColor })} />
            </div>
            <RangeField
              label="Corner radius"
              value={style.key.radius}
              min={0}
              max={40}
              step={1}
              suffix="px"
              onChange={(radius) => setKey({ radius })}
            />
            <RangeField
              label="Border width"
              value={style.key.borderWidth}
              min={0}
              max={8}
              step={1}
              suffix="px"
              onChange={(borderWidth) => setKey({ borderWidth })}
            />
            <hr className="inspector-divider" />
            <ShadowList
              title="Normal shadows"
              shadows={style.key.shadows}
              onChange={(shadows) => setKey({ shadows })}
            />
            <hr className="inspector-divider" />
            <ShadowList
              title="Shadows on press"
              shadows={style.key.pressedShadows}
              onChange={(pressedShadows) => setKey({ pressedShadows })}
            />
          </div>

          <div className="panel">
            <h2>Press response</h2>
            <div className="field">
              <label>Animation</label>
              <div className="segmented wrap">
                {ANIMATIONS.map((a) => (
                  <button
                    key={a}
                    className={style.press.animation === a ? "active" : ""}
                    onClick={() => setPress({ animation: a })}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>
            <RangeField
              label="Press scale"
              value={style.press.scale}
              min={0.7}
              max={1.1}
              step={0.01}
              onChange={(scale) => setPress({ scale })}
            />
            <ColorField
              label="Press glow color"
              value={style.press.glowColor}
              onChange={(glowColor) => setPress({ glowColor })}
            />
            <RangeField
              label="Glow intensity"
              value={style.press.glowIntensity}
              min={0}
              max={1}
              step={0.05}
              onChange={(glowIntensity) => setPress({ glowIntensity })}
            />
            <RangeField
              label="Duration"
              value={style.press.durationMs}
              min={0}
              max={1000}
              step={10}
              suffix="ms"
              onChange={(durationMs) => setPress({ durationMs })}
            />
          </div>

          <div className="panel">
            <h2>Knob</h2>
            <div className="color-grid">
              <ColorField label="Ring" value={style.knob.ringColor} onChange={(ringColor) => setKnob({ ringColor })} />
              <ColorField label="Dial" value={style.knob.dialColor} onChange={(dialColor) => setKnob({ dialColor })} />
              <ColorField label="Notch" value={style.knob.notchColor} onChange={(notchColor) => setKnob({ notchColor })} />
            </div>
            <label className="check-row">
              <input
                type="checkbox"
                checked={style.knob.glow}
                onChange={(e) => setKnob({ glow: e.target.checked })}
              />
              Glow around ring
            </label>
          </div>

          <div className="panel">
            <h2>Haptics</h2>
            <label className="check-row">
              <input
                type="checkbox"
                checked={style.haptics.enabled}
                onChange={(e) => setHaptics({ enabled: e.target.checked })}
              />
              Vibrate on press
            </label>
            <div className="field">
              <label>Pattern (ms, comma separated)</label>
              <input
                value={style.haptics.pattern.join(", ")}
                onChange={(e) =>
                  setHaptics({
                    pattern: e.target.value
                      .split(",")
                      .map((n) => Number(n.trim()))
                      .filter((n) => Number.isFinite(n) && n >= 0)
                      .slice(0, 12),
                  })
                }
                placeholder="10, 20, 10"
              />
            </div>
          </div>

          <div className="panel">
            <div className="panel-head-row">
              <h2>Sound on press</h2>
              <button className="btn" onClick={() => playSound(style.sound)}>
                <DynamicIcon name="Play" size={14} /> Test
              </button>
            </div>
            <div className="field">
              <div className="segmented">
                <button
                  className={sound.kind === "none" ? "active" : ""}
                  onClick={() => setSound({ kind: "none" })}
                >
                  None
                </button>
                <button
                  className={sound.kind === "synth" ? "active" : ""}
                  onClick={() =>
                    setSound({ kind: "synth", preset: { ...DEFAULT_SYNTH_PRESET } })
                  }
                >
                  Synth
                </button>
                <button
                  className={sound.kind === "custom" ? "active" : ""}
                  onClick={() =>
                    setSound(
                      sound.kind === "custom"
                        ? sound
                        : { kind: "custom", audio: "", volume: 0.9 }
                    )
                  }
                >
                  Custom
                </button>
              </div>
            </div>

            {sound.kind === "synth" ? (
              <>
                <div className="field">
                  <label>Waveform</label>
                  <div className="segmented wrap">
                    {WAVEFORMS.map((w) => (
                      <button
                        key={w}
                        className={sound.preset.waveform === w ? "active" : ""}
                        onClick={() =>
                          setSound({
                            kind: "synth",
                            preset: { ...sound.preset, waveform: w },
                          })
                        }
                      >
                        {w}
                      </button>
                    ))}
                  </div>
                </div>
                <RangeField
                  label="Start frequency"
                  value={sound.preset.startFreq}
                  min={40}
                  max={4000}
                  step={10}
                  suffix="Hz"
                  onChange={(startFreq) =>
                    setSound({ kind: "synth", preset: { ...sound.preset, startFreq } })
                  }
                />
                <RangeField
                  label="End frequency"
                  value={sound.preset.endFreq}
                  min={40}
                  max={4000}
                  step={10}
                  suffix="Hz"
                  onChange={(endFreq) =>
                    setSound({ kind: "synth", preset: { ...sound.preset, endFreq } })
                  }
                />
                <RangeField
                  label="Duration"
                  value={sound.preset.durationMs}
                  min={20}
                  max={800}
                  step={10}
                  suffix="ms"
                  onChange={(durationMs) =>
                    setSound({ kind: "synth", preset: { ...sound.preset, durationMs } })
                  }
                />
                <RangeField
                  label="Volume"
                  value={sound.preset.volume}
                  min={0}
                  max={1}
                  step={0.02}
                  onChange={(volume) =>
                    setSound({ kind: "synth", preset: { ...sound.preset, volume } })
                  }
                />
              </>
            ) : null}

            {sound.kind === "custom" ? (
              <>
                <div className="toolbar-row">
                  <label className="btn">
                    <DynamicIcon name="Upload" size={14} />
                    {sound.audio ? "Replace audio" : "Upload audio"}
                    <input
                      type="file"
                      accept="audio/*"
                      hidden
                      onChange={(e) => {
                        void onPickAudio(e.target.files?.[0]);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  {sound.audio ? (
                    <button
                      className="btn btn-danger"
                      onClick={() => setSound({ kind: "custom", audio: "", volume: sound.volume })}
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
                <p className="hint">
                  {sound.audio
                    ? "Audio embedded as base64 with the style."
                    : "No audio yet — upload an mp3 or wav."}
                </p>
                <RangeField
                  label="Volume"
                  value={sound.volume}
                  min={0}
                  max={1}
                  step={0.02}
                  onChange={(volume) => setSound({ kind: "custom", audio: sound.audio, volume })}
                />
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function ShadowList({
  title,
  shadows,
  onChange,
}: {
  title: string;
  shadows: KeyShadow[];
  onChange: (shadows: KeyShadow[]) => void;
}) {
  const update = (index: number, patch: Partial<KeyShadow>) =>
    onChange(
      shadows.map((shadow, i) =>
        i === index ? { ...shadow, ...patch } : shadow
      )
    );

  const move = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= shadows.length) return;
    const next = [...shadows];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    onChange(next);
  };

  return (
    <div className="shadow-list">
      <div className="panel-head-row">
        <div>
          <h3>{title}</h3>
          <span className="hint">
            {shadows.length} layer{shadows.length === 1 ? "" : "s"}
          </span>
        </div>
        <button
          className="btn"
          onClick={() =>
            onChange([
              ...shadows,
              {
                x: 0,
                y: 4,
                blur: 12,
                spread: 0,
                color: "#00000066",
                inset: false,
              },
            ])
          }
        >
          <DynamicIcon name="Plus" size={14} /> Add shadow
        </button>
      </div>

      {shadows.length === 0 ? (
        <p className="hint">No shadow layers.</p>
      ) : (
        <div className="shadow-layers">
          {shadows.map((shadow, index) => (
            <div className="shadow-layer" key={index}>
              <div className="shadow-layer-head">
                <strong>Layer {index + 1}</strong>
                <div className="shadow-layer-actions">
                  <button
                    className="icon-btn"
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                    aria-label="Move shadow up"
                  >
                    <DynamicIcon name="ChevronUp" size={14} />
                  </button>
                  <button
                    className="icon-btn"
                    disabled={index === shadows.length - 1}
                    onClick={() => move(index, 1)}
                    aria-label="Move shadow down"
                  >
                    <DynamicIcon name="ChevronDown" size={14} />
                  </button>
                  <button
                    className="icon-btn danger"
                    onClick={() =>
                      onChange(shadows.filter((_, i) => i !== index))
                    }
                    aria-label="Delete shadow"
                  >
                    <DynamicIcon name="Trash2" size={14} />
                  </button>
                </div>
              </div>
              <div className="shadow-number-grid">
                <NumberField
                  label="X"
                  value={shadow.x}
                  min={-100}
                  max={100}
                  onChange={(x) => update(index, { x })}
                />
                <NumberField
                  label="Y"
                  value={shadow.y}
                  min={-100}
                  max={100}
                  onChange={(y) => update(index, { y })}
                />
                <NumberField
                  label="Blur"
                  value={shadow.blur}
                  min={0}
                  max={200}
                  onChange={(blur) => update(index, { blur })}
                />
                <NumberField
                  label="Spread"
                  value={shadow.spread}
                  min={-100}
                  max={100}
                  onChange={(spread) => update(index, { spread })}
                />
              </div>
              <ColorField
                label="Shadow color"
                value={shadow.color}
                onChange={(color) => update(index, { color })}
              />
              <label className="check-row compact">
                <input
                  type="checkbox"
                  checked={shadow.inset}
                  onChange={(e) => update(index, { inset: e.target.checked })}
                />
                Inset shadow
              </label>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="shadow-number">
      <span>{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={1}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="color-field">
      <input
        type="color"
        value={toHex(value)}
        onChange={(e) => onChange(e.target.value)}
      />
      <div className="color-field-meta">
        <span className="color-field-label">{label}</span>
        <input
          className="color-hex"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </div>
  );
}

function RangeField({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="field">
      <label>
        {label} <span className="sens-value">{value}{suffix || ""}</span>
      </label>
      <input
        type="range"
        className="sens-range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

/** Best-effort convert an arbitrary CSS color to #rrggbb for <input type=color>. */
function toHex(value: string): string {
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value;
  if (/^#[0-9a-fA-F]{8}$/.test(value)) return value.slice(0, 7);
  if (/^#[0-9a-fA-F]{3}$/.test(value)) {
    return (
      "#" +
      value
        .slice(1)
        .split("")
        .map((c) => c + c)
        .join("")
    );
  }
  return "#22d3ee";
}
