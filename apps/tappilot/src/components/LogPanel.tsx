import { useEffect, useRef, useState } from "react";
import type { LogEntry } from "../../shared/types";
import { DynamicIcon } from "./DynamicIcon";

const TTL_MS = 10 * 60 * 1000;

function formatTime(at: number) {
  return new Date(at).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

type Props = {
  open: boolean;
  onClose: () => void;
};

export function LogPanel({ open, onClose }: Props) {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const listRef = useRef<HTMLDivElement | null>(null);
  const stickToBottom = useRef(true);

  useEffect(() => {
    let cancelled = false;
    void window.tapPilot.listLogs().then((list) => {
      if (!cancelled) setEntries(list);
    });

    const unsubscribe = window.tapPilot.onLogEntry((payload) => {
      if ("type" in payload && payload.type === "clear") {
        setEntries([]);
        return;
      }
      if ("type" in payload && payload.type === "prune") {
        void window.tapPilot.listLogs().then(setEntries);
        return;
      }
      const entry = payload as LogEntry;
      setEntries((prev) => {
        const next = [...prev, entry];
        const cutoff = Date.now() - TTL_MS;
        return next.filter((e) => e.at >= cutoff).slice(-500);
      });
    });

    const pruneUi = setInterval(() => {
      const cutoff = Date.now() - TTL_MS;
      setEntries((prev) => prev.filter((e) => e.at >= cutoff));
    }, 15_000);

    return () => {
      cancelled = true;
      unsubscribe();
      clearInterval(pruneUi);
    };
  }, []);

  useEffect(() => {
    if (!open || !stickToBottom.current || !listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [entries, open]);

  return (
    <>
      <div
        className={`drawer-scrim ${open ? "show" : ""}`}
        onClick={onClose}
        data-feedback="off"
      />
      <aside className={`drawer drawer-wide ${open ? "open" : ""}`}>
        <div className="drawer-head">
          <div className="drawer-title">
            <DynamicIcon name="ScrollText" size={18} />
            <span>Activity log</span>
          </div>
          <div className="drawer-head-right">
            <span className="status-label">
              {entries.length} · clears after 10 min
            </span>
            <button
              className="btn btn-ghost"
              onClick={() => void window.tapPilot.clearLogs()}
              disabled={entries.length === 0}
            >
              Clear
            </button>
            <button className="icon-btn" onClick={onClose} aria-label="Close">
              <DynamicIcon name="X" size={18} />
            </button>
          </div>
        </div>

        <div
          className="log-list"
          ref={listRef}
          onScroll={(e) => {
            const el = e.currentTarget;
            stickToBottom.current =
              el.scrollHeight - el.scrollTop - el.clientHeight < 40;
          }}
        >
          {entries.length === 0 ? (
            <div className="log-empty">
              Commands from the phone and profile actions appear here.
            </div>
          ) : (
            entries.map((entry) => (
              <div key={entry.id} className={`log-row level-${entry.level}`}>
                <span className="log-time">{formatTime(entry.at)}</span>
                <span className="log-source">{entry.source}</span>
                <span className="log-msg">
                  {entry.message}
                  {entry.detail ? (
                    <span className="log-detail"> — {entry.detail}</span>
                  ) : null}
                </span>
              </div>
            ))
          )}
        </div>
      </aside>
    </>
  );
}
