import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_ICONIFY_ID,
  FEATURED_ICONS,
  ICON_COLLECTIONS,
  ensureMdiCollection,
  fetchIconDataUrl,
  searchIconify,
  type IconSearchHit,
} from "../../shared/iconify";
import { fileToIconDataUrl } from "../../shared/media";
import { DynamicIcon } from "./DynamicIcon";

type Props = {
  title?: string;
  icon: string;
  iconImage?: string | null;
  onSelect: (next: { icon: string; iconImage: string | null }) => void;
  onClose: () => void;
};

export function IconPickerModal({
  title = "Choose icon",
  icon,
  iconImage,
  onSelect,
  onClose,
}: Props) {
  const [query, setQuery] = useState("");
  const [prefix, setPrefix] = useState("");
  const [results, setResults] = useState<IconSearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    void ensureMdiCollection().catch(() => {
      // Offline Material pack optional; API search still works.
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    const handle = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      void searchIconify(query, { limit: 120, prefix: prefix || undefined })
        .then((hits) => {
          if (!cancelled) setResults(hits);
        })
        .catch(() => {
          if (!cancelled) {
            setResults(
              FEATURED_ICONS.slice(0, 64).map((id) => {
                const [p, ...rest] = id.split(":");
                return { id, prefix: p, name: rest.join(":") };
              })
            );
            setError("Iconify search unavailable — showing offline favorites.");
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, query ? 220 : 0);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [query, prefix]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("Please choose an image file");
      return;
    }
    try {
      const dataUrl = await fileToIconDataUrl(file);
      onSelect({ icon, iconImage: dataUrl });
      onClose();
    } catch {
      alert("Could not read that image");
    }
  }

  async function pickIcon(id: string) {
    setBusyId(id);
    try {
      // Embed SVG so the phone remote works offline on LAN.
      const dataUrl = await fetchIconDataUrl(id);
      onSelect({ icon: id, iconImage: dataUrl });
    } catch {
      // Bundled lucide/mdi still render from the Iconify id alone.
      onSelect({ icon: id, iconImage: null });
    } finally {
      setBusyId(null);
      onClose();
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal modal-wide icon-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <DynamicIcon name="lucide:x" size={18} />
          </button>
        </div>

        <div className="icon-search">
          <DynamicIcon name="lucide:search" size={16} />
          <input
            autoFocus
            value={query}
            placeholder="Search 200k+ icons (home, play, figma…)"
            onChange={(e) => setQuery(e.target.value)}
          />
          {query ? (
            <button className="icon-btn" onClick={() => setQuery("")}>
              <DynamicIcon name="lucide:x" size={14} />
            </button>
          ) : null}
        </div>

        <div className="icon-collection-row">
          {ICON_COLLECTIONS.map((c) => (
            <button
              key={c.id || "all"}
              type="button"
              className={`chip ${prefix === c.id ? "active" : ""}`}
              onClick={() => setPrefix(c.id)}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="icon-actions">
          <button className="btn" onClick={() => fileRef.current?.click()}>
            <DynamicIcon name="lucide:upload" size={14} /> Upload image
          </button>
          {iconImage ? (
            <button
              className="btn"
              onClick={() => {
                onSelect({
                  icon: icon || DEFAULT_ICONIFY_ID,
                  iconImage: null,
                });
              }}
            >
              Remove custom
            </button>
          ) : null}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              void onFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <span className="hint" style={{ marginLeft: "auto" }}>
            {loading ? "Searching…" : `${results.length} icons`}
            {" · "}
            Powered by Iconify
          </span>
        </div>

        {error ? (
          <div className="status error" role="alert">
            {error}
          </div>
        ) : null}

        <div className="icon-grid-lg">
          {results.map((hit) => (
            <button
              key={hit.id}
              className={`icon-pick ${
                !iconImage && icon === hit.id ? "active" : ""
              }`}
              title={hit.id}
              disabled={busyId === hit.id}
              onClick={() => void pickIcon(hit.id)}
            >
              <DynamicIcon name={hit.id} size={20} />
              <span className="icon-pick-id">{hit.name}</span>
            </button>
          ))}
          {!loading && results.length === 0 ? (
            <div className="hint" style={{ gridColumn: "1 / -1" }}>
              No icons match “{query}”.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
