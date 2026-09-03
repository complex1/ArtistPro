import { useEffect, useState } from "react";
import type { PlatformCapabilityStatus, ServerInfo } from "../../shared/types";
import { DynamicIcon } from "./DynamicIcon";

type Props = {
  open: boolean;
  onClose: () => void;
  serverInfo: ServerInfo | null;
  qr: string | null;
  busy: boolean;
  onStart: () => void;
  onStop: () => void;
};

export function ServerDrawer({
  open,
  onClose,
  serverInfo,
  qr,
  busy,
  onStart,
  onStop,
}: Props) {
  const running = Boolean(serverInfo?.running);
  const [caps, setCaps] = useState<PlatformCapabilityStatus | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void window.tapPilot.getPlatformCapabilities().then((status) => {
      if (!cancelled) setCaps(status);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const a11y = caps?.accessibility;
  const a11yOk = a11y?.granted === true || a11y?.required === false;

  return (
    <>
      <div
        className={`drawer-scrim ${open ? "show" : ""}`}
        onClick={onClose}
        data-feedback="off"
      />
      <aside className={`drawer ${open ? "open" : ""}`}>
        <div className="drawer-head">
          <div className="drawer-title">
            <DynamicIcon name="Server" size={18} />
            <span>Mobile server</span>
          </div>
          <div className="drawer-head-right">
            <span className={`status-dot ${running ? "on" : ""}`} />
            <span className="status-label">{running ? "Online" : "Offline"}</span>
            <button className="icon-btn" onClick={onClose} aria-label="Close">
              <DynamicIcon name="X" size={18} />
            </button>
          </div>
        </div>

        <div className="drawer-body">
          {running && qr ? (
            <div className="qr-frame">
              <img src={qr} alt="QR code for phone remote" />
            </div>
          ) : (
            <div className="qr-frame qr-empty">
              <DynamicIcon name="QrCode" size={64} />
              <p className="hint">Start the server to reveal the pairing code.</p>
            </div>
          )}

          {running && serverInfo?.primaryUrl ? (
            <div className="pair-url">{serverInfo.primaryUrl}</div>
          ) : null}

          <div className="drawer-actions">
            {running ? (
              <button
                className="btn btn-danger neon"
                disabled={busy}
                onClick={onStop}
              >
                <DynamicIcon name="Square" size={14} /> {busy ? "Stopping…" : "Stop server"}
              </button>
            ) : (
              <button
                className="btn btn-primary neon"
                disabled={busy}
                onClick={onStart}
              >
                <DynamicIcon name="Play" size={14} /> {busy ? "Starting…" : "Start server"}
              </button>
            )}
            {running && serverInfo?.primaryUrl ? (
              <button
                className="btn"
                onClick={() =>
                  void window.tapPilot.openExternal(serverInfo.primaryUrl as string)
                }
              >
                <DynamicIcon name="ExternalLink" size={14} /> Open
              </button>
            ) : null}
          </div>

          <p className="hint">
            Phone and desktop must share the same Wi‑Fi. Only published profiles
            appear on the phone.
          </p>

          {caps ? (
            <div className="capability-panel">
              <h3>Input permissions</h3>
              <div
                className={`capability-row ${a11yOk ? "ok" : "warn"}`}
              >
                <span className={`status-dot ${a11yOk ? "on" : ""}`} />
                <div>
                  <strong>
                    {a11y?.required
                      ? "Accessibility"
                      : "Platform tools"}
                  </strong>
                  <p className="hint">{a11y?.message}</p>
                </div>
              </div>
              {a11y?.settingsUrl ? (
                <button
                  className="btn"
                  onClick={() =>
                    void window.tapPilot.openCapabilitySettings(a11y.settingsUrl!)
                  }
                >
                  <DynamicIcon name="Settings" size={14} /> Open settings
                </button>
              ) : null}
              {caps.tools.length > 0 ? (
                <ul className="capability-tools">
                  {caps.tools.map((t) => (
                    <li key={t.id} className={t.available ? "ok" : "warn"}>
                      <span className={`status-dot ${t.available ? "on" : ""}`} />
                      <span>
                        {t.label}
                        {t.detail ? ` — ${t.detail}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
      </aside>
    </>
  );
}
