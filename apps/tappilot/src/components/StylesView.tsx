import { useEffect, useRef, useState } from "react";
import type { KeyStyle, KeyStyleSummary } from "../../shared/types";
import { keyStyleVars, pressClass } from "../../shared/keyStyle";
import { DynamicIcon } from "./DynamicIcon";
import { KeyStyleEditor } from "./KeyStyleEditor";

type Props = {
  onBack: () => void;
};

export function StylesView({ onBack }: Props) {
  const [styles, setStyles] = useState<KeyStyleSummary[]>([]);
  const [editing, setEditing] = useState<KeyStyle | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const importInput = useRef<HTMLInputElement>(null);

  async function refresh() {
    setStyles(await window.tapPilot.listStyles());
  }

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    const close = () => setMenuId(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  async function create() {
    const created = await window.tapPilot.createStyle({ name: "New Style" });
    setEditing(created);
  }

  async function edit(id: string) {
    const full = await window.tapPilot.getStyle(id);
    if (full) setEditing(full);
  }

  async function duplicate(id: string) {
    const full = await window.tapPilot.getStyle(id);
    if (!full) return;
    const copy = await window.tapPilot.createStyle({
      ...full,
      name: `${full.name} copy`,
    });
    await refresh();
    setEditing(copy);
  }

  async function remove(id: string) {
    if (!confirm("Delete this key style?")) return;
    await window.tapPilot.deleteStyle(id);
    await refresh();
  }

  async function save() {
    if (!editing) return;
    const saved = await window.tapPilot.saveStyle(editing);
    setEditing(saved);
    await refresh();
  }

  function exportStyle(style: KeyStyle) {
    const blob = new Blob([JSON.stringify(style, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const slug =
      style.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") ||
      "style";
    a.href = url;
    a.download = `${slug}.style.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function onImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImportError(null);
    try {
      const text = await file.text();
      if (!text.trim()) {
        setImportError("File is empty");
        return;
      }
      const data = JSON.parse(text);
      const style = await window.tapPilot.importStyle(data);
      await refresh();
      setEditing(style);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Could not import this file. Make sure it is a valid style export.";
      if (err instanceof SyntaxError) {
        setImportError("Invalid JSON — the file could not be parsed");
      } else {
        setImportError(message);
      }
    }
  }

  if (editing) {
    return (
      <KeyStyleEditor
        style={editing}
        onChange={setEditing}
        onSave={save}
        onBack={() => {
          setEditing(null);
          void refresh();
        }}
      />
    );
  }

  return (
    <div className="home">
      <div className="home-head">
        <button className="icon-btn" onClick={onBack} aria-label="Back">
          <DynamicIcon name="ChevronLeft" size={18} />
        </button>
        <h2>Key styles</h2>
        <span className="home-count">{styles.length}</span>
        <div className="home-head-actions">
          <input
            ref={importInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={onImportFile}
          />
          <button className="ghost-btn" onClick={() => importInput.current?.click()}>
            <DynamicIcon name="Upload" size={16} /> Import
          </button>
        </div>
      </div>

      {importError ? (
        <div className="status error" role="alert">
          {importError.split("\n").map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      ) : null}

      <div className="profile-grid">
        {styles.map((s) => (
          <StyleTile
            key={s.id}
            summary={s}
            menuOpen={menuId === s.id}
            onOpen={() => void edit(s.id)}
            onMenu={() => setMenuId((cur) => (cur === s.id ? null : s.id))}
            onEdit={() => {
              setMenuId(null);
              void edit(s.id);
            }}
            onDuplicate={() => {
              setMenuId(null);
              void duplicate(s.id);
            }}
            onExport={() => {
              setMenuId(null);
              void window.tapPilot.getStyle(s.id).then((full) => full && exportStyle(full));
            }}
            onDelete={() => {
              setMenuId(null);
              void remove(s.id);
            }}
          />
        ))}

        <button className="profile-tile add-tile" onClick={() => void create()}>
          <div className="add-plus">
            <DynamicIcon name="Plus" size={30} />
          </div>
          <span>New style</span>
        </button>
      </div>
    </div>
  );
}

function StyleTile({
  summary,
  menuOpen,
  onOpen,
  onMenu,
  onEdit,
  onDuplicate,
  onExport,
  onDelete,
}: {
  summary: KeyStyleSummary;
  menuOpen: boolean;
  onOpen: () => void;
  onMenu: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onExport: () => void;
  onDelete: () => void;
}) {
  const [style, setStyle] = useState<KeyStyle | null>(null);
  useEffect(() => {
    let cancelled = false;
    void window.tapPilot.getStyle(summary.id).then((s) => {
      if (!cancelled) setStyle(s);
    });
    return () => {
      cancelled = true;
    };
  }, [summary.id, summary.updatedAt]);

  return (
    <article className="profile-tile" onClick={onOpen}>
      <div className="profile-tile-top">
        {style ? (
          <div className="style-swatch" style={keyStyleVars(style)}>
            <span className={`wf-card kp-preview button ${pressClass(style)} mini`}>
              <DynamicIcon name="Sparkles" size={18} className="kp-glyph" />
            </span>
          </div>
        ) : (
          <div className="style-swatch" />
        )}
        <div className="kebab-wrap">
          <button
            className="icon-btn"
            aria-label="Actions"
            onClick={(e) => {
              e.stopPropagation();
              onMenu();
            }}
          >
            <DynamicIcon name="EllipsisVertical" size={18} />
          </button>
          {menuOpen ? (
            <div className="kebab-menu" onClick={(e) => e.stopPropagation()}>
              <button onClick={onEdit}>
                <DynamicIcon name="Pencil" size={14} /> Edit
              </button>
              <button onClick={onDuplicate}>
                <DynamicIcon name="Copy" size={14} /> Duplicate
              </button>
              <button onClick={onExport}>
                <DynamicIcon name="Download" size={14} /> Export
              </button>
              <button className="danger" onClick={onDelete}>
                <DynamicIcon name="Trash2" size={14} /> Delete
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="profile-tile-body">
        <h3>{summary.name}</h3>
        <p className="profile-desc">{summary.description || "Key style"}</p>
      </div>
    </article>
  );
}
