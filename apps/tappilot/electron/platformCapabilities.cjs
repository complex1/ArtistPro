const { execFile } = require("child_process");
const { promisify } = require("util");
const os = require("os");
const { shell } = require("electron");

const execFileAsync = promisify(execFile);
const platform = os.platform();

async function commandExists(cmd, args = ["--version"]) {
  try {
    await execFileAsync(cmd, args, { timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * The probe below costs ~150ms, and it runs before every keystroke and click,
 * so the answer is cached. A granted result is held longer than a denied one
 * so the app picks up newly granted permission quickly.
 */
let accessibilityCache = { at: 0, value: null };
const ACCESSIBILITY_TTL_GRANTED_MS = 60000;
const ACCESSIBILITY_TTL_DENIED_MS = 5000;

async function checkMacAccessibility({ force = false } = {}) {
  const cached = accessibilityCache.value;
  if (!force && cached) {
    const ttl = cached.granted
      ? ACCESSIBILITY_TTL_GRANTED_MS
      : ACCESSIBILITY_TTL_DENIED_MS;
    if (Date.now() - accessibilityCache.at < ttl) return cached;
  }
  const value = await probeMacAccessibility();
  accessibilityCache = { at: Date.now(), value };
  return value;
}

async function probeMacAccessibility() {
  // Best-effort: try a no-op System Events query. Failure usually means
  // Accessibility is denied (or System Events is unavailable).
  try {
    await execFileAsync(
      "osascript",
      ["-e", 'tell application "System Events" to get name of first process'],
      { timeout: 4000 }
    );
    return {
      required: true,
      granted: true,
      message: "Accessibility permission looks granted.",
      settingsUrl:
        "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
    };
  } catch {
    return {
      required: true,
      granted: false,
      message:
        "Accessibility permission is missing or blocked. Grant access so TapPilot can send shortcuts.",
      settingsUrl:
        "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
    };
  }
}

async function getPlatformCapabilityStatus() {
  if (platform === "darwin") {
    // The drawer should always show live state, never a cached answer.
    const accessibility = await checkMacAccessibility({ force: true });
    return {
      platform: "darwin",
      accessibility,
      tools: [
        {
          id: "osascript",
          label: "AppleScript / System Events",
          available: true,
          detail: "Used to activate apps and send keystrokes",
        },
      ],
    };
  }

  if (platform === "win32") {
    const nircmd = await commandExists("nircmd.exe", []);
    return {
      platform: "win32",
      accessibility: {
        required: false,
        granted: true,
        message: "Windows does not require Accessibility permission for TapPilot.",
        settingsUrl: null,
      },
      tools: [
        {
          id: "powershell",
          label: "PowerShell SendKeys",
          available: true,
          detail: "Built-in; used for shortcuts",
        },
        {
          id: "nircmd",
          label: "nircmd (volume)",
          available: nircmd,
          detail: nircmd
            ? "Found on PATH"
            : "Optional — install nircmd for system volume control",
        },
      ],
    };
  }

  if (platform === "linux") {
    const xdotool = await commandExists("xdotool");
    const pactl = await commandExists("pactl", ["--version"]);
    const amixer = await commandExists("amixer", ["--version"]);
    return {
      platform: "linux",
      accessibility: {
        required: false,
        granted: xdotool,
        message: xdotool
          ? "xdotool is available for shortcuts and mouse."
          : "xdotool is required for shortcuts and mouse movement.",
        settingsUrl: null,
      },
      tools: [
        {
          id: "xdotool",
          label: "xdotool",
          available: xdotool,
          detail: xdotool ? "Found on PATH" : "Install xdotool to send keys/mouse",
        },
        {
          id: "pactl",
          label: "pactl (volume)",
          available: pactl,
          detail: pactl ? "Found" : "Optional PulseAudio volume control",
        },
        {
          id: "amixer",
          label: "amixer (volume)",
          available: amixer,
          detail: amixer ? "Found" : "Optional ALSA volume fallback",
        },
      ],
    };
  }

  return {
    platform,
    accessibility: {
      required: false,
      granted: null,
      message: `Unsupported platform: ${platform}`,
      settingsUrl: null,
    },
    tools: [],
  };
}

async function openCapabilitySettings(settingsUrl) {
  if (!settingsUrl) return false;
  await shell.openExternal(settingsUrl);
  return true;
}

module.exports = {
  getPlatformCapabilityStatus,
  openCapabilitySettings,
  checkMacAccessibility,
};
