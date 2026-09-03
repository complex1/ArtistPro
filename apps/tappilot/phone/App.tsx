import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { AppIcon } from "../shared/AppIcon";
import { DEFAULT_PROFILE_IMAGE } from "../shared/defaultImage";
import {
  applyPressFeedback,
  installGlobalClickFeedback,
  playSound,
  vibrate,
} from "../shared/feedback";
import tapPilotIcon from "../shared/images/logo-icon-only.png";
import type {
  ButtonWidget,
  KeyStyle,
  PointerButton,
  Profile,
  SliderWidget as SliderWidgetType,
  TrackpadBinding,
  Widget,
} from "../shared/types";
import {
  formatShortcutBadge,
  resolvePlatformShortcut,
} from "../shared/shortcuts";
import {
  ButtonFace,
  KnobFace,
  SliderFace,
  TrackpadFace,
  type SliderOrientation,
} from "../shared/WidgetFace";
import { effectiveStyle, keyStyleVars, pressClass } from "../shared/keyStyle";
import { profileTabs, resolveActiveDeck } from "../shared/profileTabs";
import { InstallPrompt } from "./InstallPrompt";

function toggleFullscreen() {
  const doc = document as Document & {
    webkitFullscreenElement?: Element;
    webkitExitFullscreen?: () => void;
  };
  const el = document.documentElement as HTMLElement & {
    webkitRequestFullscreen?: () => void;
  };
  const isFs = document.fullscreenElement || doc.webkitFullscreenElement;
  if (isFs) {
    (document.exitFullscreen || doc.webkitExitFullscreen)?.call(document);
  } else {
    (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el);
  }
}

type Summary = {
  id: string;
  name: string;
  description?: string;
  targetApp: string;
  updatedAt: string;
  widgetCount: number;
  image?: string | null;
  grid?: { cols: number; rows: number };
};

type SendTrackpad = (widget: Widget, dx: number, dy: number) => void;
type SendTrackpadClick = (widget: Widget, button: PointerButton) => void;

/** Key-cap hint shown under a button's name. */
function buttonBadge(widget: ButtonWidget): string {
  const shortcut = resolvePlatformShortcut(
    widget.binding.shortcut,
    widget.binding.shortcuts
  );
  return formatShortcutBadge(shortcut);
}

function apiBase() {
  if (import.meta.env.DEV) {
    return `http://${window.location.hostname}:3789`;
  }
  return "";
}

function wsUrl() {
  const base = apiBase() || window.location.origin;
  const u = new URL(base);
  u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
  u.pathname = "/ws";
  return u.toString();
}

export default function App() {
  const [profiles, setProfiles] = useState<Summary[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [volume, setVolume] = useState(50);
  const socketRef = useRef<WebSocket | null>(null);
  const toastTimer = useRef<number | null>(null);
  const lastSliderBuzz = useRef(0);

  function showToast(message: string) {
    setToast(message);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3200);
  }

  useEffect(() => installGlobalClickFeedback(document), []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`${apiBase()}/api/profiles`);
        const data = await res.json();
        if (!cancelled) setProfiles(data.profiles || []);
      } catch {
        if (!cancelled) setError("Cannot reach TapPilot. Same Wi‑Fi? Is the server running?");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const ws = new WebSocket(wsUrl());
    socketRef.current = ws;
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(String(ev.data));
        if (msg?.type === "actionResult" && msg.success === false) {
          showToast(msg.message || msg.errorCode || "Action failed");
        }
      } catch {
        // ignore
      }
    };
    return () => {
      ws.close();
      socketRef.current = null;
    };
  }, []);

  function send(msg: unknown) {
    const ws = socketRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
      return true;
    }
    return false;
  }

  async function openProfile(id: string) {
    setError(null);
    const res = await fetch(`${apiBase()}/api/profiles/${id}`);
    if (!res.ok) {
      setError("Profile unavailable");
      return;
    }
    const data = await res.json();
    setProfile(data.profile);
  }

  /** Sends over the socket when possible, falling back to HTTP. */
  async function sendAction(body: Record<string, unknown>) {
    if (send(body)) return;
    try {
      const res = await fetch(`${apiBase()}/api/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (data && data.success === false) {
        showToast(data.message || data.errorCode || "Action failed");
      }
    } catch {
      showToast("Lost connection to TapPilot");
    }
  }

  async function fireButton(widget: Widget) {
    if (!profile) return;
    await sendAction({
      type: "button",
      profileId: profile.id,
      widgetId: widget.id,
    });
  }

  async function fireTrackpadClick(widget: Widget, button: PointerButton) {
    if (!profile) return;
    await sendAction({
      type: "trackpadClick",
      profileId: profile.id,
      widgetId: widget.id,
      button,
    });
  }

  if (loading) return <div className="status">Connecting…</div>;

  if (!profile) {
    return (
      <div className="phone-app">
        {toast ? <div className="phone-toast">{toast}</div> : null}
        <div className="phone-header">
          <div className="phone-brand">
            <img src={tapPilotIcon} alt="" />
            <h1>TapPilot</h1>
          </div>
          <button className="fs-btn" onClick={toggleFullscreen} aria-label="Fullscreen">
            <AppIcon name="lucide:maximize" size={18} />
          </button>
        </div>
        {error ? <div className="status">{error}</div> : null}
        <InstallPrompt />
        {profiles.length === 0 && !error ? (
          <div className="status">No published profiles yet.</div>
        ) : (
          <div className="card-list">
            {profiles.map((p) => (
              <button
                key={p.id}
                className="card"
                onClick={() => void openProfile(p.id)}
              >
                <div className="card-row">
                  <img
                    className="card-thumb"
                    src={p.image || DEFAULT_PROFILE_IMAGE}
                    alt=""
                  />
                  <div>
                    <h2>{p.name}</h2>
                    <p>
                      {p.description || p.targetApp || "Any app"} · {p.widgetCount}{" "}
                      widgets
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="phone-app">
      {toast ? <div className="phone-toast">{toast}</div> : null}
      <div className="phone-header">
        <div className="card-row">
          <img
            className="card-thumb sm"
            src={profile.image || DEFAULT_PROFILE_IMAGE}
            alt=""
          />
          <h1>{profile.name}</h1>
        </div>
        <div className="phone-header-actions">
          <button className="fs-btn" onClick={toggleFullscreen} aria-label="Fullscreen">
            <AppIcon name="lucide:maximize" size={18} />
          </button>
          <button onClick={() => setProfile(null)}>Profiles</button>
        </div>
      </div>

      <ControlSurface
        profile={profile}
        volume={volume}
        onButton={(w) => void fireButton(w)}
        onKnobDelta={(w, delta) =>
          send({ type: "knob", profileId: profile.id, widgetId: w.id, delta })
        }
        onSlider={(w, value) => {
          // Dragging the track emits a value per pixel step; don't buzz on each.
          const now = Date.now();
          if (now - lastSliderBuzz.current > 70) {
            lastSliderBuzz.current = now;
            vibrate(6);
          }
          setVolume(value);
          send({ type: "slider", profileId: profile.id, widgetId: w.id, value });
        }}
        onTrackpad={(w, dx, dy) =>
          send({
            type: "trackpad",
            profileId: profile.id,
            widgetId: w.id,
            dx,
            dy,
          })
        }
        onTrackpadClick={(w, button) => void fireTrackpadClick(w, button)}
      />
    </div>
  );
}

function ControlSurface({
  profile,
  volume,
  onButton,
  onKnobDelta,
  onSlider,
  onTrackpad,
  onTrackpadClick,
}: {
  profile: Profile;
  volume: number;
  onButton: (w: Widget) => void;
  onKnobDelta: (w: Widget, delta: number) => void;
  onSlider: (w: Widget, value: number) => void;
  onTrackpad: SendTrackpad;
  onTrackpadClick: SendTrackpadClick;
}) {
  const tabs = profileTabs(profile);
  const [activeTabId, setActiveTabId] = useState<string | null>(
    tabs[0]?.id ?? null
  );
  const pagerRef = useRef<HTMLDivElement | null>(null);
  const [overlay, setOverlay] = useState<Widget | null>(null);

  useEffect(() => {
    if (tabs.length === 0) {
      setActiveTabId(null);
      return;
    }
    if (!activeTabId || !tabs.some((t) => t.id === activeTabId)) {
      setActiveTabId(tabs[0].id);
    }
  }, [tabs, activeTabId]);

  function selectTab(tabId: string, scroll = true) {
    setActiveTabId(tabId);
    if (!scroll || !pagerRef.current) return;
    const page = pagerRef.current.querySelector<HTMLElement>(
      `[data-tab-id="${tabId}"]`
    );
    page?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
  }

  function onPagerScroll() {
    const el = pagerRef.current;
    if (!el || tabs.length === 0) return;
    const idx = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
    const tab = tabs[Math.max(0, Math.min(tabs.length - 1, idx))];
    if (tab && tab.id !== activeTabId) setActiveTabId(tab.id);
  }

  const handlers = {
    volume,
    profile,
    onButton,
    onKnobDelta,
    onSlider,
    onTrackpad,
    onTrackpadClick,
    onOpenTrackpad: setOverlay,
  };

  const overlayNode =
    overlay && overlay.type === "trackpad" ? (
      <div className="trackpad-overlay">
        <div className="trackpad-overlay-head">
          <div className="card-row">
            <AppIcon name={overlay.icon} image={overlay.iconImage} size={22} />
            <strong>{overlay.name}</strong>
          </div>
          <div className="phone-header-actions">
            <button
              className="tp-close"
              onClick={toggleFullscreen}
              aria-label="Fullscreen"
            >
              <AppIcon name="Maximize" size={20} />
            </button>
            <button className="tp-close" onClick={() => setOverlay(null)}>
              <AppIcon name="X" size={20} />
            </button>
          </div>
        </div>
        <Trackpad
          fill
          label={overlay.name}
          binding={overlay.binding}
          keyStyle={effectiveStyle(profile, overlay)}
          style={keyStyleVars(effectiveStyle(profile, overlay))}
          onMove={(dx, dy) => onTrackpad(overlay, dx, dy)}
          onClick={(button) => onTrackpadClick(overlay, button)}
        />
      </div>
    ) : null;

  if (tabs.length === 0) {
    const deck = resolveActiveDeck(profile, null);
    return (
      <>
        <DeckSurface {...handlers} grid={deck.grid} widgets={deck.widgets} />
        {overlayNode}
      </>
    );
  }

  return (
    <>
      <div className="phone-deck-tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={activeTabId === t.id}
            className={`phone-deck-tab ${activeTabId === t.id ? "active" : ""}`}
            onClick={() => selectTab(t.id)}
          >
            {t.name}
          </button>
        ))}
      </div>
      <div className="deck-pager" ref={pagerRef} onScroll={onPagerScroll}>
        {tabs.map((t) => {
          const deck = resolveActiveDeck(profile, t.id);
          return (
            <div
              key={t.id}
              className="deck-page"
              data-tab-id={t.id}
              role="tabpanel"
            >
              <DeckSurface
                {...handlers}
                grid={deck.grid}
                widgets={deck.widgets}
              />
            </div>
          );
        })}
      </div>
      {overlayNode}
    </>
  );
}

function DeckSurface({
  profile,
  grid,
  widgets,
  volume,
  onButton,
  onKnobDelta,
  onSlider,
  onTrackpad,
  onTrackpadClick,
  onOpenTrackpad,
}: {
  profile: Profile;
  grid: { cols: number; rows: number };
  widgets: Widget[];
  volume: number;
  onButton: (w: Widget) => void;
  onKnobDelta: (w: Widget, delta: number) => void;
  onSlider: (w: Widget, value: number) => void;
  onTrackpad: SendTrackpad;
  onTrackpadClick: SendTrackpadClick;
  onOpenTrackpad: (w: Widget) => void;
}) {
  const cols = Math.max(1, grid.cols || 6);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [cell, setCell] = useState(56);
  const gap = 8;

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth;
      const size = Math.max(40, Math.floor((w - gap * (cols - 1)) / cols));
      setCell(size);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [cols]);

  return (
    <div className="surface-wrap" ref={wrapRef}>
      <div
        className="surface"
        style={{
          gridTemplateColumns: `repeat(${cols}, ${cell}px)`,
          gridAutoRows: `${cell}px`,
          gap: `${gap}px`,
          width: cell * cols + gap * (cols - 1),
        }}
      >
        {widgets.map((w) => {
          const st = effectiveStyle(profile, w);
          const style: CSSProperties = {
            gridColumn: `${w.layout.x + 1} / span ${w.layout.w}`,
            gridRow: `${w.layout.y + 1} / span ${w.layout.h}`,
            ...keyStyleVars(st),
          };

          if (w.type === "button") {
            return (
              <button
                key={w.id}
                className={`wf-card widget button ${pressClass(st)}`}
                style={style}
                data-feedback="off"
                onClick={() => {
                  applyPressFeedback(st);
                  onButton(w);
                }}
              >
                <ButtonFace
                  icon={w.icon}
                  iconImage={w.iconImage}
                  name={w.name}
                  badge={buttonBadge(w)}
                />
              </button>
            );
          }
          if (w.type === "knob") {
            return (
              <KnobWidget
                key={w.id}
                widget={w}
                style={style}
                keyStyle={st}
                sensitivity={w.binding.sensitivity}
                onDelta={(delta) => onKnobDelta(w, delta)}
              />
            );
          }
          if (w.type === "trackpad") {
            if (w.binding.mode === "button") {
              return (
                <button
                  key={w.id}
                  className={`wf-card widget button trackpad-launch ${pressClass(st)}`}
                  style={style}
                  data-feedback="off"
                  onClick={() => {
                    applyPressFeedback(st);
                    onOpenTrackpad(w);
                  }}
                >
                  <ButtonFace
                    icon={w.icon}
                    iconImage={w.iconImage}
                    name={w.name}
                    badge="Open pad"
                  />
                </button>
              );
            }
            return (
              <Trackpad
                key={w.id}
                style={style}
                keyStyle={st}
                label={w.name}
                binding={w.binding}
                onMove={(dx, dy) => onTrackpad(w, dx, dy)}
                onClick={(button) => onTrackpadClick(w, button)}
              />
            );
          }
          return (
            <SliderWidget
              key={w.id}
              widget={w}
              style={style}
              keyStyle={st}
              value={volume}
              onChange={(next) => onSlider(w, next)}
            />
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- Knob (angular, follows finger) ---------------- */

function angleDeg(cx: number, cy: number, x: number, y: number) {
  return (Math.atan2(y - cy, x - cx) * 180) / Math.PI;
}

function angleDiff(a: number, b: number) {
  let d = a - b;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

function KnobWidget({
  widget,
  style,
  keyStyle,
  sensitivity,
  onDelta,
}: {
  widget: Widget;
  style: CSSProperties;
  keyStyle: KeyStyle;
  sensitivity: number;
  onDelta: (delta: number) => void;
}) {
  const ringRef = useRef<HTMLDivElement | null>(null);
  const center = useRef<{ x: number; y: number } | null>(null);
  const lastAngle = useRef(0);
  const accum = useRef(0);
  const lastSoundAt = useRef(0);
  // Endless encoder: the arc is relative feedback, so it starts centered.
  const [value, setValue] = useState(0.5);
  const stepDeg = Math.max(2, Math.min(44, 28 / Math.max(1, sensitivity)));

  function tickFeedback() {
    const now = Date.now();
    if (now - lastSoundAt.current < 45) return;
    lastSoundAt.current = now;
    playSound(keyStyle.sound);
    if (keyStyle.haptics.enabled) {
      vibrate(keyStyle.haptics.pattern.length ? keyStyle.haptics.pattern : 8);
    }
  }

  return (
    <div
      className={`wf-card widget knob ${pressClass(keyStyle)}`}
      style={style}
      onPointerDown={(e) => {
        const el = ringRef.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        center.current = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        lastAngle.current = angleDeg(
          center.current.x,
          center.current.y,
          e.clientX,
          e.clientY
        );
        accum.current = 0;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        vibrate(6);
      }}
      onPointerMove={(e) => {
        if (!center.current) return;
        const ang = angleDeg(
          center.current.x,
          center.current.y,
          e.clientX,
          e.clientY
        );
        const d = angleDiff(ang, lastAngle.current);
        lastAngle.current = ang;
        setValue((v) => Math.max(0, Math.min(1, v + d / 270)));
        accum.current += d;
        let ticks = 0;
        while (accum.current >= stepDeg) {
          ticks += 1;
          accum.current -= stepDeg;
        }
        while (accum.current <= -stepDeg) {
          ticks -= 1;
          accum.current += stepDeg;
        }
        if (ticks !== 0) {
          onDelta(ticks);
          tickFeedback();
        }
      }}
      onPointerUp={() => {
        center.current = null;
      }}
      onPointerCancel={() => {
        center.current = null;
      }}
    >
      <KnobFace
        icon={widget.icon}
        iconImage={widget.iconImage}
        name={widget.name}
        value={value}
        dialRef={ringRef}
      />
    </div>
  );
}

/* ---------------- Slider (drag anywhere on the track) ---------------- */

function SliderWidget({
  widget,
  style,
  keyStyle,
  value,
  onChange,
}: {
  widget: SliderWidgetType;
  style: CSSProperties;
  keyStyle: KeyStyle;
  value: number;
  onChange: (value: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const dragging = useRef(false);
  const { min, max } = widget.binding;
  // Tall tiles read as a fader, wide tiles as a horizontal slider.
  const orientation: SliderOrientation =
    widget.layout.h > widget.layout.w ? "vertical" : "horizontal";

  function valueAt(clientX: number, clientY: number): number | null {
    const el = trackRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const pct =
      orientation === "vertical"
        ? 1 - (clientY - r.top) / Math.max(1, r.height)
        : (clientX - r.left) / Math.max(1, r.width);
    const clamped = Math.max(0, Math.min(1, pct));
    return Math.round(min + clamped * (max - min));
  }

  function apply(clientX: number, clientY: number) {
    const next = valueAt(clientX, clientY);
    if (next == null || next === value) return;
    onChange(next);
  }

  return (
    <div
      className={`wf-card widget slider ${pressClass(keyStyle)}`}
      style={style}
      role="slider"
      aria-label={widget.name}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      onPointerDown={(e) => {
        dragging.current = true;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        apply(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (!dragging.current) return;
        apply(e.clientX, e.clientY);
      }}
      onPointerUp={() => {
        dragging.current = false;
      }}
      onPointerCancel={() => {
        dragging.current = false;
      }}
    >
      <SliderFace
        name={widget.name}
        value={value}
        min={min}
        max={max}
        orientation={orientation}
        trackRef={trackRef}
      />
    </div>
  );
}

/* ---------------- Trackpad (one-finger mouse tracker) ---------------- */

/** A press shorter than this, that barely moves, counts as a click. */
const TAP_MAX_MS = 250;
const TAP_MAX_TRAVEL_PX = 10;

function Trackpad({
  binding,
  onMove,
  onClick,
  label,
  style,
  keyStyle,
  fill,
}: {
  binding: TrackpadBinding;
  onMove: (dx: number, dy: number) => void;
  onClick: (button: PointerButton) => void;
  label?: string;
  style?: CSSProperties;
  keyStyle: KeyStyle;
  fill?: boolean;
}) {
  const pointerId = useRef<number | null>(null);
  const last = useRef<{ x: number; y: number } | null>(null);
  const accum = useRef({ x: 0, y: 0 });
  const lastSoundAt = useRef(0);
  const startedAt = useRef(0);
  const travel = useRef(0);
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;
  const onClickRef = useRef(onClick);
  onClickRef.current = onClick;
  const styleRef = useRef(keyStyle);
  styleRef.current = keyStyle;

  const s = Math.max(1, Math.min(10, binding.sensitivity || 5));
  // Higher sensitivity → more cursor pixels per finger pixel.
  const scale = 0.35 + s * 0.35;

  function tickFeedback() {
    const now = Date.now();
    if (now - lastSoundAt.current < 90) return;
    lastSoundAt.current = now;
    const ks = styleRef.current;
    playSound(ks.sound);
    if (ks.haptics.enabled) {
      vibrate(4);
    }
  }

  return (
    <div
      className={`wf-card wf-trackpad trackpad ${fill ? "fill" : "widget"} ${pressClass(keyStyle)}`}
      style={style}
      onPointerDown={(e) => {
        if (pointerId.current != null) return;
        pointerId.current = e.pointerId;
        last.current = { x: e.clientX, y: e.clientY };
        accum.current = { x: 0, y: 0 };
        startedAt.current = Date.now();
        travel.current = 0;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        vibrate(6);
      }}
      onPointerMove={(e) => {
        if (pointerId.current !== e.pointerId || !last.current) return;
        const rawDx = e.clientX - last.current.x;
        const rawDy = e.clientY - last.current.y;
        last.current = { x: e.clientX, y: e.clientY };
        travel.current += Math.abs(rawDx) + Math.abs(rawDy);

        accum.current.x += rawDx * scale;
        accum.current.y += rawDy * scale;
        const dx = Math.trunc(accum.current.x);
        const dy = Math.trunc(accum.current.y);
        if (dx === 0 && dy === 0) return;
        accum.current.x -= dx;
        accum.current.y -= dy;
        onMoveRef.current(dx, dy);
        tickFeedback();
      }}
      onPointerUp={(e) => {
        if (pointerId.current !== e.pointerId) return;
        pointerId.current = null;
        last.current = null;

        const quick = Date.now() - startedAt.current <= TAP_MAX_MS;
        if (quick && travel.current <= TAP_MAX_TRAVEL_PX) {
          onClickRef.current("left");
          const ks = styleRef.current;
          playSound(ks.sound);
          if (ks.haptics.enabled) vibrate(12);
        }
      }}
      onPointerCancel={(e) => {
        if (pointerId.current !== e.pointerId) return;
        pointerId.current = null;
        last.current = null;
      }}
    >
      <TrackpadFace
        name={label || "Trackpad"}
        hint={fill ? "Drag to move · tap to click" : undefined}
      />
    </div>
  );
}
