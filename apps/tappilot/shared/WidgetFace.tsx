import type { CSSProperties, ReactNode, Ref } from "react";
import { AppIcon } from "./AppIcon";

/**
 * Presentational widget faces shared by the desktop editor canvas and the
 * phone remote so both render the same deck design. Interaction (pointer
 * handling, feedback) stays with the caller.
 */

const KNOB_SWEEP_DEG = 270;
const KNOB_RADIUS = 42;
const KNOB_CIRCUMFERENCE = 2 * Math.PI * KNOB_RADIUS;
const KNOB_ARC = KNOB_CIRCUMFERENCE * (KNOB_SWEEP_DEG / 360);

export function WidgetTitle({ children }: { children: ReactNode }) {
  return <span className="wf-title">{children}</span>;
}

export function ButtonFace({
  icon,
  iconImage,
  name,
  badge,
  size = 26,
}: {
  icon?: string | null;
  iconImage?: string | null;
  name: string;
  badge?: string;
  size?: number;
}) {
  return (
    <div className="wf-button">
      <AppIcon name={icon} image={iconImage} size={size} />
      <span className="wf-name">{name}</span>
      {badge ? <span className="wf-badge">{badge}</span> : null}
    </div>
  );
}

export function KnobFace({
  icon,
  iconImage,
  name,
  /** 0..1 dial position */
  value,
  dialRef,
}: {
  icon?: string | null;
  iconImage?: string | null;
  name: string;
  value: number;
  dialRef?: Ref<HTMLDivElement>;
}) {
  const clamped = Math.max(0, Math.min(1, value));
  const notchDeg = -KNOB_SWEEP_DEG / 2 + clamped * KNOB_SWEEP_DEG;

  return (
    <>
      <WidgetTitle>{name}</WidgetTitle>
      <div className="wf-knob" ref={dialRef}>
        <svg className="wf-knob-arc" viewBox="0 0 100 100" aria-hidden="true">
          <circle
            className="wf-knob-track"
            cx="50"
            cy="50"
            r={KNOB_RADIUS}
            strokeDasharray={`${KNOB_ARC} ${KNOB_CIRCUMFERENCE}`}
            transform="rotate(135 50 50)"
          />
          <circle
            className="wf-knob-progress"
            cx="50"
            cy="50"
            r={KNOB_RADIUS}
            strokeDasharray={`${KNOB_ARC * clamped} ${KNOB_CIRCUMFERENCE}`}
            transform="rotate(135 50 50)"
          />
        </svg>
        <div className="wf-knob-dome">
          <AppIcon name={icon} image={iconImage} size={18} />
        </div>
        <div
          className="wf-knob-pointer"
          style={{ transform: `rotate(${notchDeg}deg)` }}
        >
          <span className="wf-knob-notch" />
        </div>
      </div>
    </>
  );
}

export type SliderOrientation = "vertical" | "horizontal";

export function SliderFace({
  name,
  value,
  min,
  max,
  orientation,
  trackRef,
}: {
  name: string;
  value: number;
  min: number;
  max: number;
  orientation: SliderOrientation;
  trackRef?: Ref<HTMLDivElement>;
}) {
  const span = Math.max(1, max - min);
  const pct = Math.max(0, Math.min(1, (value - min) / span));
  const isPercent = min === 0 && max === 100;
  const fillStyle: CSSProperties =
    orientation === "vertical"
      ? { height: `${pct * 100}%` }
      : { width: `${pct * 100}%` };
  const thumbStyle: CSSProperties =
    orientation === "vertical"
      ? { bottom: `${pct * 100}%` }
      : { left: `${pct * 100}%` };

  return (
    <>
      <WidgetTitle>{name}</WidgetTitle>
      <div className={`wf-slider ${orientation}`}>
        <div className="wf-slider-track" ref={trackRef}>
          <div className="wf-slider-fill" style={fillStyle} />
          <span className="wf-slider-thumb" style={thumbStyle} />
        </div>
      </div>
      <span className="wf-value">
        {Math.round(value)}
        {isPercent ? "%" : ""}
      </span>
    </>
  );
}

export function TrackpadFace({
  name,
  /** Only worth showing on the full-screen pad; inline tiles stay clean. */
  hint,
}: {
  name: string;
  hint?: string;
}) {
  return (
    <>
      <span className="wf-title start">{name}</span>
      <svg
        className="wf-tp-curve"
        viewBox="0 0 200 80"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path d="M2 70 C 44 70, 58 34, 100 30 S 158 44, 186 6" />
        <path className="ghost" d="M2 76 C 46 76, 60 44, 104 40 S 160 54, 190 16" />
      </svg>
      <span className="wf-tp-dot" />
      {hint ? <span className="wf-tp-hint">{hint}</span> : null}
    </>
  );
}
