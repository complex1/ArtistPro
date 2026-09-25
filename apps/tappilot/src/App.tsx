import { useShortcuts } from '@artist-studio/ui-component';
import { useCallback, useEffect, useRef, useState } from "react";
import { installGlobalClickFeedback } from "../shared/feedback";
import tapPilotLogo from "../shared/images/logo.png";
import {
  applySampleProfile,
  getSampleProfile,
  type SampleProfileId,
} from "../shared/sampleProfiles";
import type { Profile, ServerInfo } from "../shared/types";
import { DynamicIcon } from "./components/DynamicIcon";
import { EditorView } from "./components/EditorView";
import { HomeView } from "./components/HomeView";
import { LogPanel } from "./components/LogPanel";
import { ServerDrawer } from "./components/ServerDrawer";
import { StylesView } from "./components/StylesView";

type Route =
  | { name: "home" }
  | { name: "editor"; profileId: string }
  | { name: "styles" };

export default function App({ onExit }: { onExit?: () => void }) {
  const shellRef = useRef<HTMLDivElement>(null);
  const [route, setRoute] = useState<Route>({ name: "home" });
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [serverBusy, setServerBusy] = useState(false);
  const [serverOpen, setServerOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);

  useEffect(() => {
    const shell = shellRef.current;
    return shell ? installGlobalClickFeedback(shell) : undefined;
  }, []);

  const refreshServer = useCallback(async () => {
    const [info, qrData] = await Promise.all([
      window.tapPilot.getServerInfo(),
      window.tapPilot.getServerQr(),
    ]);
    setServerInfo(info);
    setQr(qrData);
  }, []);

  useEffect(() => {
    void refreshServer();
    const unsub = window.tapPilot.onServerStatus((info) => {
      setServerInfo(info);
      void window.tapPilot.getServerQr().then(setQr);
    });
    const id = setInterval(() => void refreshServer(), 5000);
    return () => {
      unsub();
      clearInterval(id);
    };
  }, [refreshServer]);

  useEffect(() => {
    if (route.name !== "editor") {
      setProfile(null);
      return;
    }
    let cancelled = false;
    void window.tapPilot.getProfile(route.profileId).then((p) => {
      if (cancelled) return;
      if (!p) {
        setError("Profile not found");
        setRoute({ name: "home" });
        return;
      }
      setProfile(p);
    });
    return () => {
      cancelled = true;
    };
  }, [route]);

  async function save() {
    if (!profile) return;
    const saved = await window.tapPilot.saveProfile(profile);
    setProfile(saved);
  }

  async function publishToggle() {
    if (!profile) return;
    const saved = await window.tapPilot.saveProfile(profile);
    const next = await window.tapPilot.setPublished(saved.id, !saved.published);
    setProfile(next);
    void refreshServer();
  }

  async function createProfile() {
    const created = await window.tapPilot.createProfile({ name: "Untitled Profile" });
    setRoute({ name: "editor", profileId: created.id });
  }

  async function createSampleProfile(sampleId: SampleProfileId) {
    const sample = getSampleProfile(sampleId);
    const created = await window.tapPilot.createProfile({
      name: sample.name,
      description: sample.description,
      targetApp: sample.targetApp,
      grid: { cols: 4, rows: 2 },
    });
    const saved = await window.tapPilot.saveProfile(
      applySampleProfile(created, sampleId)
    );
    setRoute({ name: "editor", profileId: saved.id });
  }

  async function handleStartServer() {
    setServerBusy(true);
    try {
      const info = await window.tapPilot.startServer();
      setServerInfo(info);
      setQr(await window.tapPilot.getServerQr());
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to start server");
    } finally {
      setServerBusy(false);
    }
  }

  async function handleStopServer() {
    setServerBusy(true);
    try {
      const info = await window.tapPilot.stopServer();
      setServerInfo(info);
      setQr(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to stop server");
    } finally {
      setServerBusy(false);
    }
  }

  useShortcuts([
    { keys: 'Mod+s', label: 'Save profile', enabled: !!profile, run: () => { void save().catch(error => setError(String(error))) } },
    { keys: 'Mod+Shift+l', label: 'Open activity log', run: () => setLogOpen(true) },
    { keys: 'Mod+Shift+c', label: 'Open connection settings', run: () => setServerOpen(true) },
  ], !serverOpen && !logOpen);
  const running = Boolean(serverInfo?.running);

  return (
    <div className="app-shell" ref={shellRef}>
      <header className="topbar">
        {onExit ? (
          <button className="icon-btn lg" onClick={onExit} title="Artist Studio">
            <DynamicIcon name="ArrowLeft" size={18} />
          </button>
        ) : null}
        <div className="brand">
          <img className="brand-logo" src={tapPilotLogo} alt="TapPilot" />
          <div className="brand-text">
            <span>
              {route.name === "editor" && profile
                ? profile.name
                : "Control your desktop from your phone"}
            </span>
          </div>
        </div>

        {error ? <span className="topbar-error">{error}</span> : null}

        <div className="topbar-actions">
          <button className="btn btn-primary neon" onClick={() => void createProfile()}>
            <DynamicIcon name="Plus" size={16} /> New
          </button>
          <button
            className={`icon-btn lg ${route.name === "styles" ? "active" : ""}`}
            onClick={() =>
              setRoute((r) => (r.name === "styles" ? { name: "home" } : { name: "styles" }))
            }
            title="Key styles"
          >
            <DynamicIcon name="Palette" size={18} />
          </button>
          <button className="icon-btn lg" onClick={() => setLogOpen(true)} title="Activity log">
            <DynamicIcon name="ScrollText" size={18} />
          </button>
          <button
            className="icon-btn lg server-toggle"
            onClick={() => setServerOpen(true)}
            title="Mobile server"
          >
            <DynamicIcon name="Server" size={18} />
            <span className={`status-dot corner ${running ? "on" : ""}`} />
          </button>
        </div>
      </header>

      <main className="content">
        {route.name === "home" ? (
          <HomeView
            onOpen={(id) => setRoute({ name: "editor", profileId: id })}
            onCreate={() => void createProfile()}
            onCreateSample={createSampleProfile}
            serverRunning={running}
            onOpenServer={() => setServerOpen(true)}
          />
        ) : route.name === "styles" ? (
          <StylesView onBack={() => setRoute({ name: "home" })} />
        ) : profile ? (
          <EditorView
            profile={profile}
            onChange={setProfile}
            onSave={save}
            onPublishToggle={publishToggle}
            onBack={() => setRoute({ name: "home" })}
          />
        ) : (
          <div className="empty">Loading profile…</div>
        )}
      </main>

      <ServerDrawer
        open={serverOpen}
        onClose={() => setServerOpen(false)}
        serverInfo={serverInfo}
        qr={qr}
        busy={serverBusy}
        onStart={() => void handleStartServer()}
        onStop={() => void handleStopServer()}
      />
      <LogPanel open={logOpen} onClose={() => setLogOpen(false)} />
    </div>
  );
}
