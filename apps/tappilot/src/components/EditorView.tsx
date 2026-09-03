import { useEffect, useMemo, useRef, useState } from "react";
import GridLayout, { type Layout } from "react-grid-layout";
import { v4 as uuid } from "uuid";
import { DEFAULT_PROFILE_IMAGE } from "../../shared/defaultImage";
import {
  DEFAULT_EXECUTION,
  DEFAULT_SENSITIVITY,
  GRID_MAX,
  GRID_MIN,
  MAX_PROFILE_TABS,
  SENSITIVITY_MAX,
  SENSITIVITY_MIN,
  emptyTargetApp,
} from "../../shared/types";
import type {
  KeyStyle,
  KeyStyleSummary,
  Profile,
  ProfileTab,
  TargetMode,
  TrackpadBinding,
  Widget,
  WidgetType,
} from "../../shared/types";
import {
  formatShortcutBadge,
  keysToShortcut,
  resolvePlatformShortcut,
} from "../../shared/shortcuts";
import { effectiveStyle, keyStyleVars } from "../../shared/keyStyle";
import {
  ButtonFace,
  KnobFace,
  SliderFace,
  TrackpadFace,
} from "../../shared/WidgetFace";
import {
  clampWidgetsToGrid,
  fileToProfileImage,
  firstFreeArea,
  occupiedSet,
} from "../../shared/media";
import {
  profileTabs,
  resolveActiveDeck,
  resolveGrid,
} from "../../shared/profileTabs";
import { DynamicIcon } from "./DynamicIcon";
import { IconPickerModal } from "./IconPickerModal";
import { KeyCaptureInput } from "./KeyCaptureInput";

type Props = {
  profile: Profile;
  onChange: (profile: Profile) => void;
  onSave: () => Promise<void>;
  onPublishToggle: () => Promise<void>;
  onBack: () => void;
};

type EditorPane = "meta" | "config";

const DEFAULT_SIZE: Record<WidgetType, { w: number; h: number }> = {
  button: { w: 1, h: 1 },
  slider: { w: 3, h: 1 },
  knob: { w: 2, h: 2 },
  trackpad: { w: 3, h: 3 },
};

const WIDGET_META: Record<WidgetType, { label: string; icon: string; glyph: string }> = {
  button: { label: "Button", icon: "lucide:square-mouse-pointer", glyph: "B" },
  slider: { label: "Slider", icon: "lucide:sliders-horizontal", glyph: "S" },
  knob: { label: "Knob", icon: "lucide:circle-dot", glyph: "K" },
  trackpad: { label: "Trackpad", icon: "lucide:hand", glyph: "T" },
};

/** Static preview of a widget, matching what the phone renders. */
function WidgetFacePreview({ widget }: { widget: Widget }) {
  if (widget.type === "knob") {
    return (
      <KnobFace
        icon={widget.icon}
        iconImage={widget.iconImage}
        name={widget.name}
        value={0.62}
      />
    );
  }
  if (widget.type === "slider") {
    const { min, max } = widget.binding;
    return (
      <SliderFace
        name={widget.name}
        value={min + (max - min) * 0.7}
        min={min}
        max={max}
        orientation={widget.layout.h > widget.layout.w ? "vertical" : "horizontal"}
      />
    );
  }
  if (widget.type === "trackpad" && widget.binding.mode === "inline") {
    return <TrackpadFace name={widget.name} />;
  }
  const badge =
    widget.type === "button"
      ? formatShortcutBadge(
          resolvePlatformShortcut(
            widget.binding.shortcut,
            widget.binding.shortcuts
          )
        )
      : "Open pad";
  return (
    <ButtonFace
      icon={widget.icon}
      iconImage={widget.iconImage}
      name={widget.name}
      badge={badge}
    />
  );
}

function makeWidget(
  type: WidgetType,
  cell: { x: number; y: number },
  size: { w: number; h: number },
  tabId: string | null
): Widget {
  const id = uuid();
  const layout = { x: cell.x, y: cell.y, w: size.w, h: size.h };
  const base = { tabId };
  if (type === "button") {
    return {
      id,
      type,
      name: "Button",
      icon: "lucide:keyboard",
      iconImage: null,
      layout,
      ...base,
      binding: { kind: "shortcut", shortcut: null },
    };
  }
  if (type === "knob") {
    return {
      id,
      type,
      name: "Knob",
      icon: "lucide:circle-dot",
      iconImage: null,
      layout,
      ...base,
      binding: {
        kind: "key_stream",
        increase: keysToShortcut(["]"]),
        decrease: keysToShortcut(["["]),
        sensitivity: DEFAULT_SENSITIVITY,
      },
    };
  }
  if (type === "trackpad") {
    return {
      id,
      type,
      name: "Trackpad",
      icon: "lucide:hand",
      iconImage: null,
      layout,
      ...base,
      binding: {
        kind: "trackpad",
        mode: "inline",
        sensitivity: DEFAULT_SENSITIVITY,
      },
    };
  }
  return {
    id,
    type: "slider",
    name: "Volume",
    icon: "lucide:volume-2",
    iconImage: null,
    layout,
    ...base,
    binding: { kind: "system_volume", min: 0, max: 100 },
  };
}

export function EditorView({
  profile,
  onChange,
  onSave,
  onPublishToggle,
  onBack,
}: Props) {
  const [editorPane, setEditorPane] = useState<EditorPane>("meta");
  const [selectedId, setSelectedId] = useState<string | null>(
    profile.widgets[0]?.id ?? null
  );
  const [activeDeckTabId, setActiveDeckTabId] = useState<string | null>(
    profileTabs(profile)[0]?.id ?? null
  );
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [iconModalOpen, setIconModalOpen] = useState(false);
  const [width, setWidth] = useState(720);
  const [styleOptions, setStyleOptions] = useState<KeyStyleSummary[]>([]);
  const [styleMap, setStyleMap] = useState<Record<string, KeyStyle>>({});
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    void window.tapPilot.listStyles().then(setStyleOptions);
  }, []);

  // Load the full styles referenced by this profile so the canvas previews
  // match what the phone will render.
  useEffect(() => {
    const ids = new Set<string>();
    if (profile.styleId) ids.add(profile.styleId);
    for (const w of profile.widgets) if (w.styleId) ids.add(w.styleId);
    const missing = [...ids].filter((id) => !styleMap[id]);
    if (missing.length === 0) return;
    void Promise.all(missing.map((id) => window.tapPilot.getStyle(id))).then(
      (loaded) => {
        setStyleMap((prev) => {
          const next = { ...prev };
          for (const s of loaded) if (s) next[s.id] = s;
          return next;
        });
      }
    );
  }, [profile.styleId, profile.widgets, styleMap]);

  const styledProfile = useMemo(
    () => ({ ...profile, styles: styleMap }),
    [profile, styleMap]
  );

  const tabs = profileTabs(profile);
  const deck = resolveActiveDeck(profile, activeDeckTabId);
  const cols = Math.max(1, deck.grid.cols);
  const rows = Math.max(1, deck.grid.rows);
  const margin = 8;
  const rawCell = Math.floor((width - margin * (cols + 1)) / cols);
  const cell = Math.max(44, Math.min(112, rawCell || 64));
  const gridPixelWidth = cell * cols + margin * (cols + 1);
  const gridPixelHeight = cell * rows + margin * (rows + 1);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const update = () => setWidth(Math.max(320, el.clientWidth - 24));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [editorPane]);

  useEffect(() => {
    if (tabs.length === 0) {
      if (activeDeckTabId !== null) setActiveDeckTabId(null);
      return;
    }
    if (!activeDeckTabId || !tabs.some((t) => t.id === activeDeckTabId)) {
      setActiveDeckTabId(tabs[0].id);
    }
  }, [tabs, activeDeckTabId]);

  const selected = profile.widgets.find((w) => w.id === selectedId) || null;

  const layout: Layout[] = useMemo(
    () =>
      deck.widgets.map((w) => ({
        i: w.id,
        x: w.layout.x,
        y: w.layout.y,
        w: w.layout.w,
        h: w.layout.h,
        minW: 1,
        minH: 1,
        maxW: cols,
        maxH: rows,
      })),
    [deck.widgets, cols, rows]
  );

  function updateWidget(id: string, patch: Partial<Widget>) {
    onChange({
      ...profile,
      widgets: profile.widgets.map((w) =>
        w.id === id ? ({ ...w, ...patch } as Widget) : w
      ),
    });
  }

  function setGrid(nextCols: number, nextRows: number) {
    const c = Math.max(GRID_MIN, Math.min(GRID_MAX, nextCols || 1));
    const r = Math.max(GRID_MIN, Math.min(GRID_MAX, nextRows || 1));
    const tabId = deck.tabId;
    if (tabId) {
      const tabWidgets = deck.widgets;
      const clamped = clampWidgetsToGrid(tabWidgets, c, r);
      const clampedIds = new Set(clamped.map((w) => w.id));
      onChange({
        ...profile,
        tabs: tabs.map((t) =>
          t.id === tabId ? { ...t, grid: { cols: c, rows: r } } : t
        ),
        widgets: profile.widgets
          .filter((w) => w.tabId !== tabId || clampedIds.has(w.id))
          .map((w) => {
            if (w.tabId !== tabId) return w;
            return clamped.find((c) => c.id === w.id) || w;
          }),
      });
      return;
    }
    onChange({
      ...profile,
      grid: { cols: c, rows: r },
      widgets: clampWidgetsToGrid(profile.widgets, c, r),
    });
  }

  function addWidget(type: WidgetType) {
    const preferred = DEFAULT_SIZE[type];
    const size = {
      w: Math.min(preferred.w, cols),
      h: Math.min(preferred.h, rows),
    };
    let cellSpot = firstFreeArea(deck.widgets, cols, rows, size.w, size.h);
    if (!cellSpot) {
      size.w = 1;
      size.h = 1;
      cellSpot = firstFreeArea(deck.widgets, cols, rows, 1, 1);
    }
    if (!cellSpot) {
      alert(`Grid is full (${cols}×${rows}). Increase grid size or remove a widget.`);
      return;
    }
    const widget = makeWidget(type, cellSpot, size, deck.tabId);
    onChange({ ...profile, widgets: [...profile.widgets, widget] });
    setSelectedId(widget.id);
  }

  function resizeSelected(nextW: number, nextH: number) {
    if (!selected) return;
    const others = deck.widgets.filter((w) => w.id !== selected.id);
    const occupied = occupiedSet(others);
    const maxW = cols - selected.layout.x;
    const maxH = rows - selected.layout.y;
    let w = Math.max(1, Math.min(maxW, nextW || 1));
    let h = Math.max(1, Math.min(maxH, nextH || 1));

    const fits = (tw: number, th: number) => {
      for (let dy = 0; dy < th; dy++) {
        for (let dx = 0; dx < tw; dx++) {
          if (occupied.has(`${selected.layout.x + dx},${selected.layout.y + dy}`)) {
            return false;
          }
        }
      }
      return true;
    };

    while (w > 1 && !fits(w, h)) w -= 1;
    while (h > 1 && !fits(w, h)) h -= 1;

    updateWidget(selected.id, {
      layout: { ...selected.layout, w, h },
    } as Partial<Widget>);
  }

  function removeSelected() {
    if (!selectedId) return;
    const widgets = profile.widgets.filter((w) => w.id !== selectedId);
    onChange({ ...profile, widgets });
    const nextOnDeck = widgets.find((w) =>
      deck.tabId ? w.tabId === deck.tabId : !w.tabId
    );
    setSelectedId(nextOnDeck?.id ?? null);
  }

  function addDeckTab() {
    if (tabs.length >= MAX_PROFILE_TABS) {
      alert(`You can have at most ${MAX_PROFILE_TABS} tabs.`);
      return;
    }
    const id = uuid();
    if (tabs.length === 0) {
      const first: ProfileTab = {
        id,
        name: "Main",
        grid: { ...resolveGrid(profile, null) },
      };
      onChange({
        ...profile,
        tabs: [first],
        widgets: profile.widgets.map((w) => ({ ...w, tabId: id })),
      });
      setActiveDeckTabId(id);
      return;
    }
    const template = resolveGrid(profile, deck.tabId);
    const next: ProfileTab = {
      id,
      name: `Tab ${tabs.length + 1}`,
      grid: { ...template },
    };
    onChange({ ...profile, tabs: [...tabs, next] });
    setActiveDeckTabId(id);
    setSelectedId(null);
  }

  // Electron has no window.prompt(), so renaming happens inline on the pill.
  function startRenameDeckTab(tab: ProfileTab) {
    setRenamingTabId(tab.id);
    setRenameDraft(tab.name);
  }

  function commitRenameDeckTab() {
    const id = renamingTabId;
    setRenamingTabId(null);
    if (!id) return;
    const trimmed = renameDraft.trim().slice(0, 40);
    const tab = tabs.find((t) => t.id === id);
    if (!tab || !trimmed || trimmed === tab.name) return;
    onChange({
      ...profile,
      tabs: tabs.map((t) => (t.id === id ? { ...t, name: trimmed } : t)),
    });
  }

  function deleteDeckTab(tabId: string) {
    const tab = tabs.find((t) => t.id === tabId);
    if (!tab) return;
    const count = profile.widgets.filter((w) => w.tabId === tabId).length;
    const ok = window.confirm(
      count
        ? `Delete tab “${tab.name}” and its ${count} widget${count === 1 ? "" : "s"}?`
        : `Delete tab “${tab.name}”?`
    );
    if (!ok) return;
    const remaining = tabs.filter((t) => t.id !== tabId);
    const widgets = profile.widgets.filter((w) => w.tabId !== tabId);
    if (remaining.length === 0) {
      onChange({
        ...profile,
        tabs: [],
        widgets: widgets.map((w) => ({ ...w, tabId: null })),
      });
      setActiveDeckTabId(null);
    } else {
      onChange({ ...profile, tabs: remaining, widgets });
      setActiveDeckTabId(remaining[0].id);
    }
    setSelectedId(null);
  }

  async function onPickImage(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("Please choose an image file");
      return;
    }
    try {
      const dataUrl = await fileToProfileImage(file);
      onChange({ ...profile, image: dataUrl });
    } catch {
      alert("Could not read that image");
    }
  }

  return (
    <div className="editor-root">
      <div className="editor-topbar">
        <div className="editor-topbar-left">
          <button className="icon-btn" onClick={onBack} aria-label="Back">
            <DynamicIcon name="ChevronLeft" size={18} />
          </button>
          <div className="tabs">
            <button
              className={`tab ${editorPane === "meta" ? "active" : ""}`}
              onClick={() => setEditorPane("meta")}
            >
              Meta
            </button>
            <button
              className={`tab ${editorPane === "config" ? "active" : ""}`}
              onClick={() => setEditorPane("config")}
            >
              Configuration
            </button>
          </div>
        </div>
        <div className="editor-topbar-right">
          <button
            className={`btn ${profile.published ? "btn-danger" : ""}`}
            disabled={saving}
            onClick={() => {
              setSaving(true);
              void onPublishToggle().finally(() => setSaving(false));
            }}
            title={profile.published ? "Unpublish" : "Publish"}
          >
            <DynamicIcon name={profile.published ? "EyeOff" : "Send"} size={14} />
            {profile.published ? "Unpublish" : "Publish"}
          </button>
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

      {editorPane === "meta" ? (
        <div className="meta-tab">
          <div className="panel meta-card">
            <div className="field">
              <label>Name</label>
              <input
                value={profile.name}
                onChange={(e) => onChange({ ...profile, name: e.target.value })}
                placeholder="Figma"
              />
            </div>
            <div className="field">
              <label>Description</label>
              <textarea
                rows={3}
                value={profile.description}
                onChange={(e) =>
                  onChange({ ...profile, description: e.target.value })
                }
                placeholder="What this deck controls…"
              />
            </div>
            <div className="field">
              <label>Target app (exact app name)</label>
              <input
                value={profile.targetApp?.name || ""}
                onChange={(e) =>
                  onChange({
                    ...profile,
                    targetApp: {
                      ...(profile.targetApp || emptyTargetApp()),
                      name: e.target.value,
                    },
                  })
                }
                placeholder="Figma"
              />
              <span className="hint">
                Used for activate / only-if-active modes. Match the OS app name.
              </span>
            </div>
            <div className="field">
              <label>When sending shortcuts</label>
              <select
                value={
                  profile.execution?.targetMode || DEFAULT_EXECUTION.targetMode
                }
                onChange={(e) =>
                  onChange({
                    ...profile,
                    execution: {
                      ...(profile.execution || DEFAULT_EXECUTION),
                      targetMode: e.target.value as TargetMode,
                    },
                  })
                }
              >
                <option value="activate-target-app">
                  Activate target app, then send
                </option>
                <option value="only-if-active">
                  Only if target app is already active (safer)
                </option>
                <option value="active-app">Send to whatever is frontmost</option>
                <option value="global">Global (no app focus change)</option>
              </select>
            </div>
            <div className="field">
              <label>Key style (deck default)</label>
              <select
                value={profile.styleId || ""}
                onChange={(e) =>
                  onChange({ ...profile, styleId: e.target.value || null })
                }
              >
                <option value="">Neon (default)</option>
                {styleOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="panel meta-image-card">
            <label className="field-label">Cover image</label>
            <div className="meta-image-preview">
              <img src={profile.image || DEFAULT_PROFILE_IMAGE} alt="" />
            </div>
            <div className="toolbar-row">
              <button
                className="btn"
                onClick={() => imageInputRef.current?.click()}
              >
                <DynamicIcon name="ImagePlus" size={14} /> Add image
              </button>
              {profile.image ? (
                <button
                  className="btn btn-danger"
                  onClick={() => onChange({ ...profile, image: null })}
                >
                  Remove
                </button>
              ) : null}
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  void onPickImage(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </div>
            <p className="hint">A default neon cover is used when no image is set.</p>
          </div>
        </div>
      ) : (
        <div className="config-tab">
          <div className="config-main">
          <div className="deck-tabs-bar">
            {tabs.length === 0 ? (
              <span className="hint">Single deck — add tabs to split widgets</span>
            ) : (
              <div className="deck-tabs">
                {tabs.map((t) =>
                  renamingTabId === t.id ? (
                    <input
                      key={t.id}
                      className="deck-tab active deck-tab-input"
                      value={renameDraft}
                      maxLength={40}
                      autoFocus
                      onChange={(e) => setRenameDraft(e.target.value)}
                      onBlur={commitRenameDeckTab}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          commitRenameDeckTab();
                        } else if (e.key === "Escape") {
                          e.preventDefault();
                          setRenamingTabId(null);
                        }
                      }}
                    />
                  ) : (
                    <button
                      key={t.id}
                      type="button"
                      className={`deck-tab ${deck.tabId === t.id ? "active" : ""}`}
                      onClick={() => {
                        setActiveDeckTabId(t.id);
                        setSelectedId(null);
                      }}
                      onDoubleClick={() => startRenameDeckTab(t)}
                      title="Double-click to rename"
                    >
                      {t.name}
                    </button>
                  )
                )}
              </div>
            )}
            <div className="deck-tabs-actions">
              <button
                type="button"
                className="btn"
                onClick={addDeckTab}
                disabled={tabs.length >= MAX_PROFILE_TABS}
                title="Add tab"
              >
                <DynamicIcon name="lucide:plus" size={14} /> Tab
              </button>
              {deck.tabId ? (
                <>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      const t = tabs.find((x) => x.id === deck.tabId);
                      if (t) startRenameDeckTab(t);
                    }}
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => deleteDeckTab(deck.tabId!)}
                  >
                    Delete tab
                  </button>
                </>
              ) : null}
            </div>
          </div>
          <div className="editor-canvas" ref={canvasRef}>
            <div
              className="fixed-grid-frame"
              style={{ width: gridPixelWidth, height: gridPixelHeight }}
            >
              <GridLayout
                className="layout equal-cell-grid"
                layout={layout}
                cols={cols}
                maxRows={rows}
                rowHeight={cell}
                width={gridPixelWidth}
                margin={[margin, margin]}
                containerPadding={[margin, margin]}
                compactType={null}
                preventCollision
                autoSize={false}
                style={{ height: gridPixelHeight, width: gridPixelWidth }}
                isBounded
                onLayoutChange={(next) => {
                  const byId = new Map(next.map((l) => [l.i, l]));
                  onChange({
                    ...profile,
                    widgets: profile.widgets.map((w) => {
                      const l = byId.get(w.id);
                      if (!l) return w;
                      return {
                        ...w,
                        layout: { x: l.x, y: l.y, w: l.w, h: l.h },
                      };
                    }),
                  });
                }}
                draggableHandle=".widget-tile"
              >
                {deck.widgets.map((w) => {
                  const st = effectiveStyle(styledProfile, w);
                  return (
                    <div key={w.id} onPointerDown={() => setSelectedId(w.id)}>
                      <div
                        className={`wf-card widget-tile type-${w.type} ${
                          w.type === "trackpad" && w.binding.mode === "inline"
                            ? "wf-trackpad"
                            : ""
                        } ${selectedId === w.id ? "selected" : ""}`}
                        style={keyStyleVars(st)}
                      >
                        <span className="widget-type">{w.type}</span>
                        <WidgetFacePreview widget={w} />
                      </div>
                    </div>
                  );
                })}
              </GridLayout>
            </div>
            {deck.widgets.length === 0 ? (
              <div className="empty canvas-empty">
                Add a button, slider, or knob from the right panel.
              </div>
            ) : null}
          </div>
          </div>

          <aside className="editor-sidebar">
            <div className="panel">
              <h2>Basic setup</h2>
              <div className="grid-size-row">
                <div className="field">
                  <label>
                    Grid columns{deck.tab ? ` · ${deck.tab.name}` : ""}
                  </label>
                  <input
                    type="number"
                    min={GRID_MIN}
                    max={GRID_MAX}
                    value={cols}
                    onChange={(e) => setGrid(Number(e.target.value), rows)}
                  />
                </div>
                <div className="field">
                  <label>Grid rows</label>
                  <input
                    type="number"
                    min={GRID_MIN}
                    max={GRID_MAX}
                    value={rows}
                    onChange={(e) => setGrid(cols, Number(e.target.value))}
                  />
                </div>
              </div>
              <label className="field-label">Add widget</label>
              <div className="widget-add-row">
                {(Object.keys(WIDGET_META) as WidgetType[]).map((type) => (
                  <button
                    key={type}
                    className="btn widget-add-btn"
                    onClick={() => addWidget(type)}
                  >
                    <DynamicIcon name={WIDGET_META[type].icon} size={16} />
                    {WIDGET_META[type].label}
                  </button>
                ))}
              </div>
            </div>

            <div className="panel">
              <h2>Widget</h2>
              {!selected ? (
                <p className="hint">Select a widget on the grid to configure it.</p>
              ) : (
                <>
                  <div className="field">
                    <label>Name</label>
                    <input
                      value={selected.name}
                      onChange={(e) =>
                        updateWidget(selected.id, { name: e.target.value })
                      }
                    />
                  </div>

                  <div className="field">
                    <label>Icon</label>
                    <button
                      className="icon-select"
                      onClick={() => setIconModalOpen(true)}
                    >
                      <DynamicIcon
                        name={selected.icon}
                        image={selected.iconImage}
                        size={22}
                      />
                      <span>{selected.iconImage ? "Custom image" : selected.icon}</span>
                      <DynamicIcon name="ChevronDown" size={16} />
                    </button>
                  </div>

                  <div className="field">
                    <label>Key style override</label>
                    <select
                      value={selected.styleId || ""}
                      onChange={(e) =>
                        updateWidget(selected.id, {
                          styleId: e.target.value || null,
                        } as Partial<Widget>)
                      }
                    >
                      <option value="">Use profile default</option>
                      {styleOptions.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid-size-row">
                    <div className="field">
                      <label>Width (cells)</label>
                      <input
                        type="number"
                        min={1}
                        max={cols}
                        value={selected.layout.w}
                        onChange={(e) =>
                          resizeSelected(Number(e.target.value), selected.layout.h)
                        }
                      />
                    </div>
                    <div className="field">
                      <label>Height (cells)</label>
                      <input
                        type="number"
                        min={1}
                        max={rows}
                        value={selected.layout.h}
                        onChange={(e) =>
                          resizeSelected(selected.layout.w, Number(e.target.value))
                        }
                      />
                    </div>
                  </div>

                  {selected.type === "button" ? (
                    <KeyCaptureInput
                      label="Shortcut"
                      value={selected.binding.shortcut}
                      onChange={(shortcut) =>
                        updateWidget(selected.id, {
                          binding: { kind: "shortcut", shortcut },
                        } as Partial<Widget>)
                      }
                      hint="Press keys or click a mouse button. ⌘ maps to Ctrl on Windows/Linux."
                    />
                  ) : null}

                  {selected.type === "knob" ? (
                    <>
                      <KeyCaptureInput
                        label="Increase key"
                        value={selected.binding.increase}
                        allowPointer={false}
                        onChange={(increase) =>
                          updateWidget(selected.id, {
                            binding: { ...selected.binding, increase },
                          } as Partial<Widget>)
                        }
                      />
                      <KeyCaptureInput
                        label="Decrease key"
                        value={selected.binding.decrease}
                        allowPointer={false}
                        onChange={(decrease) =>
                          updateWidget(selected.id, {
                            binding: { ...selected.binding, decrease },
                          } as Partial<Widget>)
                        }
                      />
                      <SensitivityField
                        value={selected.binding.sensitivity}
                        onChange={(sensitivity) =>
                          updateWidget(selected.id, {
                            binding: { ...selected.binding, sensitivity },
                          } as Partial<Widget>)
                        }
                      />
                    </>
                  ) : null}

                  {selected.type === "trackpad"
                    ? (() => {
                        const b = selected.binding;
                        const setB = (patch: Partial<TrackpadBinding>) =>
                          updateWidget(selected.id, {
                            binding: { ...b, ...patch },
                          } as Partial<Widget>);
                        return (
                          <>
                            <div className="field">
                              <label>Mode</label>
                              <div className="segmented">
                                <button
                                  className={b.mode === "inline" ? "active" : ""}
                                  onClick={() => setB({ mode: "inline" })}
                                >
                                  Inline on grid
                                </button>
                                <button
                                  className={b.mode === "button" ? "active" : ""}
                                  onClick={() => setB({ mode: "button" })}
                                >
                                  Button (opens pad)
                                </button>
                              </div>
                            </div>

                            <SensitivityField
                              value={b.sensitivity}
                              onChange={(sensitivity) => setB({ sensitivity })}
                            />
                            <p className="hint">
                              One-finger drag moves the desktop mouse cursor.
                              Higher sensitivity = faster cursor movement.
                            </p>
                          </>
                        );
                      })()
                    : null}

                  {selected.type === "slider" ? (
                    <p className="hint">
                      Slider controls system volume (0–100).
                    </p>
                  ) : null}

                  <button className="btn btn-danger full" onClick={removeSelected}>
                    <DynamicIcon name="Trash2" size={14} /> Delete widget
                  </button>
                </>
              )}
            </div>
          </aside>
        </div>
      )}

      {iconModalOpen && selected ? (
        <IconPickerModal
          icon={selected.icon}
          iconImage={selected.iconImage}
          onSelect={({ icon, iconImage }) =>
            updateWidget(selected.id, { icon, iconImage })
          }
          onClose={() => setIconModalOpen(false)}
        />
      ) : null}
    </div>
  );
}

function SensitivityField({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="field">
      <label>
        Sensitivity <span className="sens-value">{value}</span> / {SENSITIVITY_MAX}
      </label>
      <input
        type="range"
        className="sens-range"
        min={SENSITIVITY_MIN}
        max={SENSITIVITY_MAX}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="hint">Higher = more responsive to small movements.</span>
    </div>
  );
}
