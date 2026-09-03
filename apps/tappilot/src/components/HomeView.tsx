import { useEffect, useRef, useState } from "react";
import { DEFAULT_PROFILE_IMAGE } from "../../shared/defaultImage";
import type { ProfileSummary } from "../../shared/types";
import { DynamicIcon } from "./DynamicIcon";

type Props = {
  onOpen: (id: string) => void;
  onCreate: () => void;
};

type PendingImport = {
  data: unknown;
  nameConflict: { id: string; name: string } | null;
  idConflict: { id: string; name: string } | null;
};

export function HomeView({ onOpen, onCreate }: Props) {
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const importInput = useRef<HTMLInputElement>(null);

  async function refresh() {
    setProfiles(await window.tapPilot.listProfiles());
  }

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    const close = () => setMenuId(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  async function togglePublish(id: string, published: boolean) {
    await window.tapPilot.setPublished(id, !published);
    await refresh();
  }

  async function remove(id: string) {
    if (!confirm("Delete this profile?")) return;
    await window.tapPilot.deleteProfile(id);
    await refresh();
  }

  function slugify(name: string) {
    return (
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "profile"
    );
  }

  async function exportProfile(id: string) {
    const profile = await window.tapPilot.exportProfile(id);
    if (!profile) return;
    const blob = new Blob([JSON.stringify(profile, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slugify(profile.name)}.tappilot.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function finishImport(
    data: unknown,
    mode: "copy" | "replace",
    replaceId?: string
  ) {
    setImportError(null);
    try {
      const profile = await window.tapPilot.importProfile(data, {
        mode,
        replaceId,
      });
      setPendingImport(null);
      await refresh();
      onOpen(profile.id);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Could not import this file. Make sure it is a valid profile export.";
      setImportError(message);
      setPendingImport(null);
    }
  }

  async function onImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImportError(null);
    setPendingImport(null);

    let data: unknown;
    try {
      const text = await file.text();
      if (!text.trim()) {
        setImportError("File is empty");
        return;
      }
      data = JSON.parse(text);
    } catch {
      setImportError("Invalid JSON — the file could not be parsed");
      return;
    }

    try {
      const check = await window.tapPilot.validateImport(data);
      if (!check.ok) {
        setImportError(
          check.errors.length === 1
            ? check.errors[0]
            : `Import validation failed:\n• ${check.errors.join("\n• ")}`
        );
        return;
      }

      const conflicts = await window.tapPilot.importConflicts(data);
      if (conflicts.nameConflict || conflicts.idConflict) {
        setPendingImport({
          data,
          nameConflict: conflicts.nameConflict,
          idConflict: conflicts.idConflict,
        });
        return;
      }
      await finishImport(data, "copy");
    } catch (err) {
      setImportError(
        err instanceof Error
          ? err.message
          : "Could not import this file. Make sure it is a valid profile export."
      );
    }
  }

  return (
    <div className="home">
      <div className="home-head">
        <h2>Profiles</h2>
        <span className="home-count">{profiles.length}</span>
        <div className="home-head-actions">
          <input
            ref={importInput}
            type="file"
            accept="application/json,.json,.tappilot.json"
            hidden
            onChange={onImportFile}
          />
          <button
            className="ghost-btn"
            onClick={() => importInput.current?.click()}
          >
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

      {pendingImport ? (
        <div className="import-conflict panel" role="dialog" aria-modal="true">
          <h3>Import conflict</h3>
          <p>
            A profile named{" "}
            <strong>
              {pendingImport.nameConflict?.name ||
                pendingImport.idConflict?.name ||
                "this profile"}
            </strong>{" "}
            already exists.
          </p>
          <div className="toolbar-row">
            <button
              className="btn btn-primary"
              onClick={() =>
                void finishImport(
                  pendingImport.data,
                  "replace",
                  pendingImport.idConflict?.id ||
                    pendingImport.nameConflict?.id
                )
              }
            >
              Replace existing
            </button>
            <button
              className="btn"
              onClick={() => void finishImport(pendingImport.data, "copy")}
            >
              Keep both (copy)
            </button>
            <button className="btn" onClick={() => setPendingImport(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <div className="profile-grid">
        {profiles.map((p) => (
          <article
            key={p.id}
            className={`profile-tile ${p.published ? "active" : ""}`}
            onClick={() => onOpen(p.id)}
          >
            <div className="profile-tile-top">
              <img
                className="profile-thumb"
                src={p.image || DEFAULT_PROFILE_IMAGE}
                alt=""
              />
              <div className="kebab-wrap">
                <button
                  className="icon-btn"
                  aria-label="Actions"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuId((cur) => (cur === p.id ? null : p.id));
                  }}
                >
                  <DynamicIcon name="EllipsisVertical" size={18} />
                </button>
                {menuId === p.id ? (
                  <div className="kebab-menu" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => {
                        setMenuId(null);
                        onOpen(p.id);
                      }}
                    >
                      <DynamicIcon name="Pencil" size={14} /> Edit
                    </button>
                    <button
                      onClick={() => {
                        setMenuId(null);
                        void togglePublish(p.id, p.published);
                      }}
                    >
                      <DynamicIcon
                        name={p.published ? "EyeOff" : "Send"}
                        size={14}
                      />
                      {p.published ? "Unpublish" : "Publish"}
                    </button>
                    <button
                      onClick={() => {
                        setMenuId(null);
                        void exportProfile(p.id);
                      }}
                    >
                      <DynamicIcon name="Download" size={14} /> Export
                    </button>
                    <button
                      className="danger"
                      onClick={() => {
                        setMenuId(null);
                        void remove(p.id);
                      }}
                    >
                      <DynamicIcon name="Trash2" size={14} /> Delete
                    </button>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="profile-tile-body">
              <h3>{p.name}</h3>
              <p className="profile-desc">
                {p.description || p.targetApp || "No description"}
              </p>
            </div>

            <div className="profile-tile-foot">
              <span className={`badge ${p.published ? "on" : ""}`}>
                {p.published ? (
                  <>
                    <span className="status-dot on" /> Active
                  </>
                ) : (
                  "Draft"
                )}
              </span>
              <span className="profile-sub">
                {p.widgetCount} widgets · {p.grid?.cols || 6}×{p.grid?.rows || 8}
              </span>
            </div>
          </article>
        ))}

        <button className="profile-tile add-tile" onClick={onCreate}>
          <div className="add-plus">
            <DynamicIcon name="Plus" size={30} />
          </div>
          <span>New profile</span>
        </button>
      </div>
    </div>
  );
}
