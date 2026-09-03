const { execFile, spawn } = require("child_process");
const { promisify } = require("util");
const os = require("os");
const schema = require("./profileSchema.cjs");
const capabilities = require("./platformCapabilities.cjs");

const execFileAsync = promisify(execFile);
const platform = os.platform(); // darwin | win32 | linux

const MAC_MODIFIER_MAP = {
  cmd: "command down",
  command: "command down",
  meta: "command down",
  ctrl: "control down",
  control: "control down",
  alt: "option down",
  option: "option down",
  shift: "shift down",
};

/** On Windows/Linux, cmd/command/meta map to ctrl so shared profiles stay useful. */
const WIN_LINUX_MODIFIER_MAP = {
  cmd: "ctrl",
  command: "ctrl",
  meta: "ctrl",
  ctrl: "ctrl",
  control: "ctrl",
  alt: "alt",
  option: "alt",
  shift: "shift",
};

const SPECIAL_KEYCODES_MAC = {
  space: 49,
  return: 36,
  enter: 36,
  escape: 53,
  esc: 53,
  tab: 48,
  delete: 51,
  backspace: 51,
  up: 126,
  down: 125,
  left: 123,
  right: 124,
  "up arrow": 126,
  "down arrow": 125,
  "left arrow": 123,
  "right arrow": 124,
};

const SPECIAL_KEYS_XDOTOOL = {
  space: "space",
  return: "Return",
  enter: "Return",
  escape: "Escape",
  esc: "Escape",
  tab: "Tab",
  delete: "BackSpace",
  backspace: "BackSpace",
  up: "Up",
  down: "Down",
  left: "Left",
  right: "Right",
  "up arrow": "Up",
  "down arrow": "Down",
  "left arrow": "Left",
  "right arrow": "Right",
};

const SPECIAL_KEYS_SENDKEYS = {
  space: " ",
  return: "{ENTER}",
  enter: "{ENTER}",
  escape: "{ESC}",
  esc: "{ESC}",
  tab: "{TAB}",
  delete: "{BACKSPACE}",
  backspace: "{BACKSPACE}",
  up: "{UP}",
  down: "{DOWN}",
  left: "{LEFT}",
  right: "{RIGHT}",
  "up arrow": "{UP}",
  "down arrow": "{DOWN}",
  "left arrow": "{LEFT}",
  "right arrow": "{RIGHT}",
};

class ActionError extends Error {
  constructor(message, errorCode) {
    super(message);
    this.errorCode = errorCode;
    this.name = "ActionError";
  }
}

function normalizeKey(raw) {
  const key = String(raw || "").trim().toLowerCase();
  if (!key) return null;
  if (key === " ") return "space";
  return key;
}

function splitKeys(keys, modifierMap) {
  const mods = [];
  let main = null;
  for (const part of keys || []) {
    const lower = String(part).toLowerCase();
    if (modifierMap[lower]) {
      mods.push(modifierMap[lower]);
    } else {
      main = normalizeKey(part);
    }
  }
  return { mods, main };
}

function targetAppName(targetApp) {
  return schema.targetAppDisplayName(targetApp);
}

function bindingShortcut(shortcutLike, platformMap) {
  return schema.resolvePlatformShortcut(shortcutLike, platformMap, platform);
}

function bindingKeys(shortcutLike, platformMap) {
  return schema.shortcutToKeys(bindingShortcut(shortcutLike, platformMap));
}

/** Log-friendly label for whatever this binding sends. */
function describeBinding(shortcutLike, platformMap) {
  return schema.describeShortcut(bindingShortcut(shortcutLike, platformMap));
}

async function runOsascript(source) {
  await execFileAsync("osascript", ["-e", source]);
}

async function activateAppMac(appName) {
  if (!appName) return;
  const escaped = appName.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  await runOsascript(`tell application "${escaped}" to activate`);
}

async function getFrontmostAppMac() {
  try {
    const { stdout } = await execFileAsync("osascript", [
      "-e",
      'tell application "System Events" to get name of first application process whose frontmost is true',
    ]);
    return String(stdout || "").trim();
  } catch {
    return null;
  }
}

async function getFrontmostAppWin() {
  try {
    const script = `
Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class Fg {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
}
"@
$hwnd = [Fg]::GetForegroundWindow()
$sb = New-Object System.Text.StringBuilder 256
[void][Fg]::GetWindowText($hwnd, $sb, $sb.Capacity)
$sb.ToString()
`;
    const { stdout } = await execFileAsync("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      script,
    ]);
    return String(stdout || "").trim();
  } catch {
    return null;
  }
}

async function getFrontmostAppLinux() {
  try {
    const { stdout: wid } = await execFileAsync("xdotool", [
      "getactivewindow",
    ]);
    const { stdout } = await execFileAsync("xdotool", [
      "getwindowname",
      String(wid).trim(),
    ]);
    return String(stdout || "").trim();
  } catch {
    return null;
  }
}

async function getFrontmostApp() {
  if (platform === "darwin") return getFrontmostAppMac();
  if (platform === "win32") return getFrontmostAppWin();
  if (platform === "linux") return getFrontmostAppLinux();
  return null;
}

function appNameMatches(frontmost, targetName) {
  if (!targetName) return true;
  if (!frontmost) return false;
  const a = frontmost.toLowerCase();
  const b = targetName.toLowerCase();
  return a === b || a.includes(b) || b.includes(a);
}

/**
 * Apply execution.targetMode before sending keys.
 * Returns { activate: boolean } when keys should be sent.
 */
async function prepareTarget(profile) {
  const execution = schema.normalizeExecution(profile?.execution);
  const mode = execution.targetMode;
  const name = targetAppName(profile?.targetApp);

  if (mode === "global" || mode === "active-app") {
    return { ok: true, activate: false, targetName: name };
  }

  if (!name) {
    return { ok: true, activate: false, targetName: "" };
  }

  if (mode === "only-if-active") {
    const front = await getFrontmostApp();
    if (!appNameMatches(front, name)) {
      throw new ActionError(
        `"${name}" is not the active app (frontmost: ${front || "unknown"})`,
        "TARGET_APP_NOT_ACTIVE"
      );
    }
    return { ok: true, activate: false, targetName: name };
  }

  // activate-target-app (default)
  return { ok: true, activate: true, targetName: name };
}

async function ensureInputPermission() {
  if (platform !== "darwin") return;
  const status = await capabilities.checkMacAccessibility();
  if (status.granted === false) {
    throw new ActionError(
      status.message,
      "ACCESSIBILITY_PERMISSION_MISSING"
    );
  }
}

async function sendShortcutMac(keys, activateName) {
  const { mods, main } = splitKeys(keys, MAC_MODIFIER_MAP);
  if (!main) throw new ActionError("No key specified", "INVALID_SHORTCUT");
  if (activateName) await activateAppMac(activateName);

  const using = mods.length > 0 ? ` using {${mods.join(", ")}}` : "";
  const code = SPECIAL_KEYCODES_MAC[main];
  const script =
    code != null
      ? `tell application "System Events" to key code ${code}${using}`
      : `tell application "System Events" to keystroke "${main.replace(
          /"/g,
          '\\"'
        )}"${using}`;

  try {
    await runOsascript(script);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/not allowed|assistive|accessibility/i.test(msg)) {
      throw new ActionError(msg, "ACCESSIBILITY_PERMISSION_MISSING");
    }
    throw new ActionError(msg, "EXECUTION_FAILED");
  }
}

async function setSystemVolumeMac(value, min = 0, max = 100) {
  const clamped = Math.max(min, Math.min(max, Number(value)));
  const pct = Math.round(((clamped - min) / (max - min || 1)) * 100);
  await runOsascript(`set volume output volume ${pct}`);
  return pct;
}

function winSendKeysChord(mods, main) {
  const prefixes = [];
  for (const m of mods) {
    if (m === "ctrl") prefixes.push("^");
    else if (m === "shift") prefixes.push("+");
    else if (m === "alt") prefixes.push("%");
  }
  const special = SPECIAL_KEYS_SENDKEYS[main];
  let keyPart;
  if (special != null) {
    keyPart = special;
  } else if (main.length === 1) {
    keyPart = main;
  } else {
    keyPart = `{${main.toUpperCase()}}`;
  }
  return prefixes.join("") + keyPart;
}

async function sendShortcutWin(keys, activateName) {
  const { mods, main } = splitKeys(keys, WIN_LINUX_MODIFIER_MAP);
  if (!main) throw new ActionError("No key specified", "INVALID_SHORTCUT");

  const chord = winSendKeysChord(mods, main);
  const escapedChord = chord.replace(/'/g, "''");
  const activate = activateName
    ? `
$proc = Get-Process | Where-Object { $_.MainWindowTitle -like '*${String(
        activateName
      ).replace(/'/g, "''")}*' -or $_.ProcessName -like '*${String(
        activateName
      ).replace(/'/g, "''")}*' } | Select-Object -First 1
if ($proc) { Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinFocus {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
}
"@; [WinFocus]::SetForegroundWindow($proc.MainWindowHandle) }
`
    : "";

  const script = `
Add-Type -AssemblyName System.Windows.Forms
${activate}
Start-Sleep -Milliseconds 80
[System.Windows.Forms.SendKeys]::SendWait('${escapedChord}')
`;

  await execFileAsync("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    script,
  ]);
}

async function setSystemVolumeWin(value, min = 0, max = 100) {
  const clamped = Math.max(min, Math.min(max, Number(value)));
  const pct = Math.round(((clamped - min) / (max - min || 1)) * 100);
  try {
    await execFileAsync("nircmd.exe", [
      "setsysvolume",
      String(Math.round((pct / 100) * 65535)),
    ]);
  } catch {
    throw new ActionError(
      "System volume on Windows requires nircmd.exe on PATH",
      "TOOL_MISSING"
    );
  }
  return pct;
}

function linuxXdotoolKey(mods, main) {
  const parts = [...mods];
  const special = SPECIAL_KEYS_XDOTOOL[main];
  if (special) parts.push(special);
  else if (main.length === 1) parts.push(main);
  else parts.push(main);
  return parts.join("+");
}

async function sendShortcutLinux(keys, activateName) {
  const { mods, main } = splitKeys(keys, WIN_LINUX_MODIFIER_MAP);
  if (!main) throw new ActionError("No key specified", "INVALID_SHORTCUT");

  if (activateName) {
    try {
      await execFileAsync("xdotool", [
        "search",
        "--name",
        activateName,
        "windowactivate",
        "--sync",
      ]);
    } catch {
      // App focus is best-effort; continue to send the key.
    }
  }

  const chord = linuxXdotoolKey(mods, main);
  try {
    await execFileAsync("xdotool", ["key", "--clearmodifiers", chord]);
  } catch (err) {
    throw new ActionError(
      `Linux shortcuts require xdotool (${err instanceof Error ? err.message : "not found"})`,
      "TOOL_MISSING"
    );
  }
}

async function setSystemVolumeLinux(value, min = 0, max = 100) {
  const clamped = Math.max(min, Math.min(max, Number(value)));
  const pct = Math.round(((clamped - min) / (max - min || 1)) * 100);
  try {
    await execFileAsync("pactl", [
      "set-sink-volume",
      "@DEFAULT_SINK@",
      `${pct}%`,
    ]);
  } catch {
    try {
      await execFileAsync("amixer", ["-q", "sset", "Master", `${pct}%`]);
    } catch (err) {
      throw new ActionError(
        `Linux volume needs pactl or amixer (${err instanceof Error ? err.message : "missing"})`,
        "TOOL_MISSING"
      );
    }
  }
  return pct;
}

async function activateApp(appName) {
  if (!appName) return;
  if (platform === "darwin") return activateAppMac(appName);
  if (platform === "linux") {
    try {
      await execFileAsync("xdotool", [
        "search",
        "--name",
        appName,
        "windowactivate",
        "--sync",
      ]);
    } catch {
      // best-effort
    }
    return;
  }
}

async function sendShortcut(keys, activateName) {
  if (platform === "darwin") return sendShortcutMac(keys, activateName);
  if (platform === "win32") return sendShortcutWin(keys, activateName);
  if (platform === "linux") return sendShortcutLinux(keys, activateName);
  throw new ActionError(`Unsupported platform: ${platform}`, "UNSUPPORTED_PLATFORM");
}

async function setSystemVolume(value, min = 0, max = 100) {
  if (platform === "darwin") return setSystemVolumeMac(value, min, max);
  if (platform === "win32") return setSystemVolumeWin(value, min, max);
  if (platform === "linux") return setSystemVolumeLinux(value, min, max);
  throw new ActionError(`Unsupported platform: ${platform}`, "UNSUPPORTED_PLATFORM");
}

function toResult(started, err) {
  const durationMs = Date.now() - started;
  if (!err) return { success: true, durationMs };
  return {
    success: false,
    durationMs,
    message: err.message || String(err),
    errorCode: err.errorCode || "EXECUTION_FAILED",
  };
}

async function executeButton(widget, profile) {
  const started = Date.now();
  try {
    if (widget?.binding?.kind !== "shortcut") {
      throw new ActionError("Invalid button binding", "INVALID_SHORTCUT");
    }
    await ensureInputPermission();
    const prep = await prepareTarget(profile);
    const resolved = bindingShortcut(
      widget.binding.shortcut,
      widget.binding.shortcuts
    );

    if (resolved?.pointer) {
      if (prep.activate) await activateApp(prep.targetName);
      await clickMouse(resolved.pointer, resolved.modifiers);
      return toResult(started);
    }

    const keys = schema.shortcutToKeys(resolved);
    if (!keys.length) {
      throw new ActionError("No key specified", "INVALID_SHORTCUT");
    }
    await sendShortcut(keys, prep.activate ? prep.targetName : null);
    return toResult(started);
  } catch (err) {
    return toResult(started, err);
  }
}

async function executeKnobStep(widget, direction, profile) {
  const started = Date.now();
  try {
    if (widget?.binding?.kind !== "key_stream") {
      throw new ActionError("Invalid knob binding", "INVALID_SHORTCUT");
    }
    await ensureInputPermission();
    const prep = await prepareTarget(profile);
    const shortcut =
      direction === "increase"
        ? widget.binding.increase
        : widget.binding.decrease;
    const keys = bindingKeys(shortcut, null);
    if (!keys.length) {
      throw new ActionError("No key specified", "INVALID_SHORTCUT");
    }
    await sendShortcut(keys, prep.activate ? prep.targetName : null);
    return toResult(started);
  } catch (err) {
    return toResult(started, err);
  }
}

/**
 * Cursor movement on macOS goes through JavaScript for Automation rather than
 * PyObjC: the system python3 shipped with recent macOS has no Quartz module.
 *
 * Spawning osascript per move costs ~90ms, far too slow for a trackpad, so a
 * single helper stays alive and reads "dx dy" lines from stdin. Deltas that
 * arrive within one read are summed, which keeps fast drags smooth.
 */
/**
 * Shared by the persistent helper and the one-shot fallback.
 * Commands arrive one per line: "m <dx> <dy>" to move, "c <button> <flags>"
 * to click (button 0=left, 1=right, 2=middle; flags are CGEventFlags).
 */
const MAC_MOUSE_FUNCTIONS = `
function moveBy(dx, dy) {
  var e = $.CGEventCreate($());
  var p = $.CGEventGetLocation(e);
  var np = $.CGPointMake(p.x + dx, p.y + dy);
  $.CGWarpMouseCursorPosition(np);
  $.CGAssociateMouseAndMouseCursorPosition(true);
  var ev = $.CGEventCreateMouseEvent($(), $.kCGEventMouseMoved, np, 0);
  $.CGEventPost($.kCGHIDEventTap, ev);
}
function clickAt(button, flags) {
  var e = $.CGEventCreate($());
  var p = $.CGEventGetLocation(e);
  var downType, upType, cgButton;
  if (button === 1) {
    downType = $.kCGEventRightMouseDown;
    upType = $.kCGEventRightMouseUp;
    cgButton = $.kCGMouseButtonRight;
  } else if (button === 2) {
    downType = $.kCGEventOtherMouseDown;
    upType = $.kCGEventOtherMouseUp;
    cgButton = $.kCGMouseButtonCenter;
  } else {
    downType = $.kCGEventLeftMouseDown;
    upType = $.kCGEventLeftMouseUp;
    cgButton = $.kCGMouseButtonLeft;
  }
  var down = $.CGEventCreateMouseEvent($(), downType, p, cgButton);
  var up = $.CGEventCreateMouseEvent($(), upType, p, cgButton);
  if (flags) {
    $.CGEventSetFlags(down, flags);
    $.CGEventSetFlags(up, flags);
  }
  $.CGEventPost($.kCGHIDEventTap, down);
  $.CGEventPost($.kCGHIDEventTap, up);
}
function runCommands(chunk) {
  var lines = chunk.split("\\n");
  var dx = 0;
  var dy = 0;
  var pending = false;
  for (var i = 0; i < lines.length; i++) {
    var parts = lines[i].trim().split(" ");
    if (parts[0] === "m" && parts.length === 3) {
      var px = parseFloat(parts[1]);
      var py = parseFloat(parts[2]);
      if (isNaN(px) || isNaN(py)) continue;
      // Consecutive moves are summed so fast drags stay smooth.
      dx += px;
      dy += py;
      pending = true;
    } else if (parts[0] === "c" && parts.length === 3) {
      if (pending) {
        moveBy(dx, dy);
        dx = 0;
        dy = 0;
        pending = false;
      }
      clickAt(parseInt(parts[1], 10) || 0, parseInt(parts[2], 10) || 0);
    }
  }
  if (pending) moveBy(dx, dy);
}
`;

const MAC_MOUSE_HELPER_SCRIPT = `
ObjC.import("CoreGraphics");
ObjC.import("Foundation");
${MAC_MOUSE_FUNCTIONS}
var fh = $.NSFileHandle.fileHandleWithStandardInput;
while (true) {
  var data = fh.availableData;
  // NSData.length arrives as a string through the ObjC bridge.
  if (Number(data.length) === 0) break;
  runCommands(
    ObjC.unwrap($.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding))
  );
}
`;

/** CGEventFlags bits for modifier keys held during a click. */
const MAC_EVENT_FLAGS = {
  shift: 131072,
  ctrl: 262144,
  alt: 524288,
  meta: 1048576,
};

function macFlagsFor(modifiers) {
  let flags = 0;
  for (const m of modifiers || []) flags |= MAC_EVENT_FLAGS[m] || 0;
  return flags;
}

const POINTER_INDEX = { left: 0, right: 1, middle: 2 };

let macMouseHelper = null;

function spawnMacMouseHelper() {
  const child = spawn(
    "osascript",
    ["-l", "JavaScript", "-e", MAC_MOUSE_HELPER_SCRIPT],
    { stdio: ["pipe", "ignore", "pipe"] }
  );
  const helper = { child, lastError: "" };

  child.on("error", (err) => {
    helper.lastError = err.message || String(err);
    if (macMouseHelper === helper) macMouseHelper = null;
  });
  child.on("exit", () => {
    if (macMouseHelper === helper) macMouseHelper = null;
  });
  child.stdin.on("error", () => {
    if (macMouseHelper === helper) macMouseHelper = null;
  });
  child.stderr.on("data", (d) => {
    helper.lastError = String(d).trim().slice(0, 300);
  });

  return helper;
}

function ensureMacMouseHelper() {
  if (macMouseHelper?.child?.stdin?.writable) return macMouseHelper;
  try {
    macMouseHelper = spawnMacMouseHelper();
  } catch {
    macMouseHelper = null;
  }
  return macMouseHelper;
}

async function macMouseOneShot(command) {
  const script = `
ObjC.import("CoreGraphics");
${MAC_MOUSE_FUNCTIONS}
runCommands(${JSON.stringify(command)});
`;
  try {
    await execFileAsync("osascript", ["-l", "JavaScript", "-e", script]);
  } catch (err) {
    throw new ActionError(
      `Mouse control failed (${err instanceof Error ? err.message : "unknown error"})`,
      "EXECUTION_FAILED"
    );
  }
}

async function macMouseCommand(command) {
  const helper = ensureMacMouseHelper();
  if (helper?.child?.stdin?.writable) {
    helper.child.stdin.write(`${command}\n`);
    return;
  }
  const detail = helper?.lastError || macMouseHelper?.lastError;
  if (detail) {
    throw new ActionError(`Mouse helper failed: ${detail}`, "EXECUTION_FAILED");
  }
  await macMouseOneShot(command);
}

async function moveMouseMac(ix, iy) {
  await macMouseCommand(`m ${ix} ${iy}`);
}

async function clickMouseMac(button, modifiers) {
  await macMouseCommand(
    `c ${POINTER_INDEX[button] ?? 0} ${macFlagsFor(modifiers)}`
  );
}

function shutdownHelpers() {
  if (macMouseHelper?.child) {
    try {
      macMouseHelper.child.stdin.end();
      macMouseHelper.child.kill();
    } catch {
      // ignore
    }
  }
  macMouseHelper = null;
}

async function moveMouseWin(dx, dy) {
  const ix = Math.round(dx);
  const iy = Math.round(dy);
  if (ix === 0 && iy === 0) return;
  const script = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class MouseMove {
  [DllImport("user32.dll")]
  public static extern void mouse_event(uint dwFlags, int dx, int dy, uint dwData, UIntPtr dwExtraInfo);
  public const uint MOUSEEVENTF_MOVE = 0x0001;
}
"@
[MouseMove]::mouse_event([MouseMove]::MOUSEEVENTF_MOVE, ${ix}, ${iy}, 0, [UIntPtr]::Zero)
`;
  await execFileAsync("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    script,
  ]);
}

async function moveMouseLinux(dx, dy) {
  const ix = Math.round(dx);
  const iy = Math.round(dy);
  if (ix === 0 && iy === 0) return;
  try {
    await execFileAsync("xdotool", [
      "mousemove_relative",
      "--",
      String(ix),
      String(iy),
    ]);
  } catch (err) {
    throw new ActionError(
      `Linux mouse move requires xdotool (${err instanceof Error ? err.message : "not found"})`,
      "TOOL_MISSING"
    );
  }
}

const WIN_MOUSE_FLAGS = {
  left: { down: 0x0002, up: 0x0004 },
  right: { down: 0x0008, up: 0x0010 },
  middle: { down: 0x0020, up: 0x0040 },
};

const WIN_MODIFIER_VK = {
  ctrl: 0x11,
  alt: 0x12,
  shift: 0x10,
  meta: 0x5b,
};

async function clickMouseWin(button, modifiers) {
  const flags = WIN_MOUSE_FLAGS[button] || WIN_MOUSE_FLAGS.left;
  const vks = (modifiers || [])
    .map((m) => WIN_MODIFIER_VK[m])
    .filter((vk) => vk != null);
  const down = vks.map((vk) => `[Mouse]::keybd_event(${vk}, 0, 0, [UIntPtr]::Zero)`);
  const up = vks
    .slice()
    .reverse()
    .map((vk) => `[Mouse]::keybd_event(${vk}, 0, 2, [UIntPtr]::Zero)`);

  const script = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Mouse {
  [DllImport("user32.dll")]
  public static extern void mouse_event(uint dwFlags, int dx, int dy, uint dwData, UIntPtr dwExtraInfo);
  [DllImport("user32.dll")]
  public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
}
"@
${down.join("\n")}
[Mouse]::mouse_event(${flags.down}, 0, 0, 0, [UIntPtr]::Zero)
[Mouse]::mouse_event(${flags.up}, 0, 0, 0, [UIntPtr]::Zero)
${up.join("\n")}
`;
  await execFileAsync("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    script,
  ]);
}

const LINUX_CLICK_BUTTON = { left: "1", middle: "2", right: "3" };

const LINUX_MODIFIER_KEY = {
  ctrl: "ctrl",
  alt: "alt",
  shift: "shift",
  meta: "super",
};

async function clickMouseLinux(button, modifiers) {
  const mods = (modifiers || [])
    .map((m) => LINUX_MODIFIER_KEY[m])
    .filter(Boolean);
  const args = [];
  for (const m of mods) args.push("keydown", m);
  args.push("click", LINUX_CLICK_BUTTON[button] || "1");
  for (const m of mods.slice().reverse()) args.push("keyup", m);

  try {
    await execFileAsync("xdotool", args);
  } catch (err) {
    throw new ActionError(
      `Linux mouse clicks require xdotool (${err instanceof Error ? err.message : "not found"})`,
      "TOOL_MISSING"
    );
  }
}

async function clickMouse(button = "left", modifiers = []) {
  const resolved = POINTER_INDEX[button] != null ? button : "left";
  if (platform === "darwin") return clickMouseMac(resolved, modifiers);
  if (platform === "win32") return clickMouseWin(resolved, modifiers);
  if (platform === "linux") return clickMouseLinux(resolved, modifiers);
  throw new ActionError(`Unsupported platform: ${platform}`, "UNSUPPORTED_PLATFORM");
}

/**
 * Sub-pixel deltas are carried over between calls so slow drags still move the
 * cursor instead of rounding away to nothing.
 */
const mouseRemainder = { x: 0, y: 0 };

async function moveMouse(dx, dy) {
  const totalX = mouseRemainder.x + (Number(dx) || 0);
  const totalY = mouseRemainder.y + (Number(dy) || 0);
  const ix = Math.trunc(totalX);
  const iy = Math.trunc(totalY);
  mouseRemainder.x = totalX - ix;
  mouseRemainder.y = totalY - iy;
  if (ix === 0 && iy === 0) return;

  if (platform === "darwin") return moveMouseMac(ix, iy);
  if (platform === "win32") return moveMouseWin(ix, iy);
  if (platform === "linux") return moveMouseLinux(ix, iy);
  throw new ActionError(`Unsupported platform: ${platform}`, "UNSUPPORTED_PLATFORM");
}

async function executeTrackpadMove(widget, dx, dy) {
  const started = Date.now();
  try {
    if (widget?.binding?.kind !== "trackpad") {
      throw new ActionError("Invalid trackpad binding", "EXECUTION_FAILED");
    }
    await moveMouse(dx, dy);
    return toResult(started);
  } catch (err) {
    return toResult(started, err);
  }
}

/**
 * A tap on the trackpad clicks wherever the cursor already is, so it
 * deliberately skips target-app activation: stealing focus first would move
 * the window out from under the pointer.
 */
async function executeTrackpadClick(widget, button = "left") {
  const started = Date.now();
  try {
    if (widget?.binding?.kind !== "trackpad") {
      throw new ActionError("Invalid trackpad binding", "EXECUTION_FAILED");
    }
    await ensureInputPermission();
    await clickMouse(button, []);
    return toResult(started);
  } catch (err) {
    return toResult(started, err);
  }
}

async function executeSlider(widget, value) {
  const started = Date.now();
  try {
    if (widget?.binding?.kind !== "system_volume") {
      throw new ActionError("Invalid slider binding", "EXECUTION_FAILED");
    }
    await setSystemVolume(
      value,
      widget.binding.min ?? 0,
      widget.binding.max ?? 100
    );
    return toResult(started);
  } catch (err) {
    return toResult(started, err);
  }
}

module.exports = {
  ActionError,
  activateApp,
  sendShortcut,
  setSystemVolume,
  moveMouse,
  clickMouse,
  executeButton,
  executeKnobStep,
  executeSlider,
  executeTrackpadMove,
  executeTrackpadClick,
  getFrontmostApp,
  prepareTarget,
  targetAppName,
  bindingKeys,
  bindingShortcut,
  describeBinding,
  shutdownHelpers,
};
