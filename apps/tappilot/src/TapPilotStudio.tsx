import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import gridCss from "react-grid-layout/css/styles.css?inline";
import resizeCss from "react-resizable/css/styles.css?inline";
import widgetCss from "../shared/widgets.css?inline";
import desktopCss from "./styles.css?inline";
import { navigate } from "../../desktop/renderer/app/routes";
import App from "./App";

const isolatedDesktopCss = desktopCss
  .replace(":root {", ":host {")
  .replace("html,\nbody,\n#root {", ".tappilot-root {");

export function TapPilotStudio() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [shadowRoot, setShadowRoot] = useState<ShadowRoot | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    setShadowRoot(host.shadowRoot ?? host.attachShadow({ mode: "open" }));
  }, []);

  // TapPilot drives the OS and the LAN server through Electron IPC, so it has
  // nothing to talk to when the dev server is opened in a plain browser.
  if (typeof window !== "undefined" && !("tapPilot" in window)) {
    return (
      <div className="studio-loading">
        TapPilot needs the desktop app. Open Artist Pro in Electron to control
        shortcuts and pair your phone.
      </div>
    );
  }

  return (
    <div ref={hostRef} style={{ display: "block", height: "100vh" }}>
      {shadowRoot
        ? createPortal(
            <>
              <style>{`${gridCss}\n${resizeCss}\n${widgetCss}\n${isolatedDesktopCss}`}</style>
              <div className="tappilot-root">
                <App onExit={() => navigate({ page: "home" })} />
              </div>
            </>,
            shadowRoot,
          )
        : null}
    </div>
  );
}
