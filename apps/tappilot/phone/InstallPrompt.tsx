import { useEffect, useState } from "react";
import { AppIcon } from "../shared/AppIcon";

const DISMISS_KEY = "tappilot.pwa.installDismissed";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false;
  const media = window.matchMedia("(display-mode: standalone)").matches;
  const iosStandalone =
    "standalone" in navigator &&
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  return media || iosStandalone;
}

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

/**
 * Helps users pin the phone remote as a home-screen app.
 * - Chromium: uses beforeinstallprompt when the browser allows it
 * - iOS Safari: shows Share → Add to Home Screen steps
 * Hidden once installed (standalone) or dismissed.
 */
export function InstallPrompt() {
  const [hidden, setHidden] = useState(true);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null
  );
  const [ios, setIos] = useState(false);

  useEffect(() => {
    if (isStandaloneDisplay()) return;
    try {
      if (localStorage.getItem(DISMISS_KEY) === "1") return;
    } catch {
      // private mode / blocked storage
    }

    setIos(isIos());
    setHidden(false);

    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBip);
    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // ignore
    }
    setHidden(true);
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    try {
      await deferred.userChoice;
    } catch {
      // ignore
    }
    setDeferred(null);
    dismiss();
  }

  if (hidden) return null;

  return (
    <div className="install-prompt" role="status">
      <div className="install-prompt-body">
        <AppIcon name="lucide:download" size={18} />
        <div>
          <strong>Save as app</strong>
          {deferred ? (
            <p>Install TapPilot on your home screen for a full-screen remote.</p>
          ) : ios ? (
            <p>
              Tap <AppIcon name="lucide:share" size={14} className="inline-icon" />{" "}
              Share, then <em>Add to Home Screen</em>.
            </p>
          ) : (
            <p>
              Use your browser menu → <em>Add to Home screen</em> /{" "}
              <em>Install app</em>.
            </p>
          )}
        </div>
      </div>
      <div className="install-prompt-actions">
        {deferred ? (
          <button type="button" className="install-btn" onClick={() => void install()}>
            Install
          </button>
        ) : null}
        <button type="button" className="install-dismiss" onClick={dismiss} aria-label="Dismiss">
          <AppIcon name="lucide:x" size={16} />
        </button>
      </div>
    </div>
  );
}
