const { ipcMain, shell } = require("electron");
const path = require("path");
const QRCode = require("qrcode");
const store = require("./store.cjs");
const logger = require("./logger.cjs");
const executor = require("./executor.cjs");
const { createLanServer } = require("./server.cjs");

let isDev = false;
let getWindows = () => [];
let phoneOutputPath = null;
let lanServer = null;
let serverInfo = {
  running: false,
  port: null,
  urls: [],
  primaryUrl: null,
};
let starting = false;
let stopping = false;
let initialized = false;

// TapPilot can be open in any window, so every window hears the update and the
// ones without a TapPilot view simply ignore it.
function broadcast(channel, payload) {
  for (const win of getWindows()) {
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  }
}

function broadcastLog(payload) {
  broadcast("logs:entry", payload);
}

function broadcastServerStatus() {
  broadcast("server:status", withPhoneUrl(serverInfo));
}

function withPhoneUrl(info) {
  if (!info) {
    return {
      running: false,
      port: null,
      urls: [],
      primaryUrl: null,
      apiUrl: null,
    };
  }
  if (!info.primaryUrl) {
    return {
      ...info,
      running: Boolean(info.running),
      apiUrl: null,
    };
  }
  if (isDev) {
    const phoneUrl = info.primaryUrl.replace(/:\d+$/, ":5174");
    return {
      ...info,
      running: Boolean(info.running),
      primaryUrl: phoneUrl,
      apiUrl: info.primaryUrl,
    };
  }
  return {
    ...info,
    running: Boolean(info.running),
    apiUrl: info.primaryUrl,
  };
}

function phoneDistPath() {
  return phoneOutputPath || path.join(__dirname, "..", "dist-phone");
}

function ensureLanServer() {
  if (!lanServer) {
    lanServer = createLanServer({
      phoneDistPath: phoneDistPath(),
      isDev,
    });
  }
  return lanServer;
}

async function startRemoteServer() {
  if (starting) return withPhoneUrl(serverInfo);
  if (lanServer?.isRunning()) {
    serverInfo = lanServer.getInfo();
    return withPhoneUrl(serverInfo);
  }
  starting = true;
  try {
    const server = ensureLanServer();
    serverInfo = await server.start(3789);
    broadcastServerStatus();
    return withPhoneUrl(serverInfo);
  } catch (err) {
    logger.append({
      level: "error",
      source: "server",
      message: "Failed to start LAN server",
      detail: err.message || String(err),
    });
    throw err;
  } finally {
    starting = false;
  }
}

async function stopRemoteServer() {
  if (stopping) return withPhoneUrl(serverInfo);
  if (!lanServer?.isRunning()) {
    serverInfo = {
      running: false,
      port: null,
      urls: [],
      primaryUrl: null,
    };
    broadcastServerStatus();
    return withPhoneUrl(serverInfo);
  }
  stopping = true;
  try {
    serverInfo = await lanServer.stop();
    broadcastServerStatus();
    return withPhoneUrl(serverInfo);
  } finally {
    stopping = false;
  }
}

function registerIpc() {
  ipcMain.handle("profiles:list", () => store.listProfiles());
  ipcMain.handle("profiles:get", (_e, id) => store.getProfile(id));
  ipcMain.handle("profiles:create", (_e, payload) => {
    const profile = store.createProfile(payload || {});
    logger.append({
      level: "info",
      source: "profile",
      message: `Created profile "${profile.name}"`,
      detail: store.targetAppDisplayName(profile.targetApp) || undefined,
    });
    return profile;
  });
  ipcMain.handle("profiles:import", (_e, data, options) => {
    try {
      const profile = store.importProfile(data, options || {});
      logger.append({
        level: "info",
        source: "profile",
        message: `Imported profile “${profile.name}”`,
        detail: `${profile.widgets?.length || 0} widgets`,
      });
      return profile;
    } catch (err) {
      logger.append({
        level: "error",
        source: "profile",
        message: "Import failed",
        detail: err.message || String(err),
      });
      throw new Error(err.message || "Import failed");
    }
  });
  ipcMain.handle("profiles:validateImport", (_e, data) =>
    store.validateImport(data)
  );
  ipcMain.handle("profiles:importConflicts", (_e, data) => {
    const conflicts = store.findImportConflicts(data);
    return {
      nameConflict: conflicts.nameConflict
        ? { id: conflicts.nameConflict.id, name: conflicts.nameConflict.name }
        : null,
      idConflict: conflicts.idConflict
        ? { id: conflicts.idConflict.id, name: conflicts.idConflict.name }
        : null,
    };
  });
  ipcMain.handle("profiles:save", (_e, profile) => {
    try {
      const saved = store.saveProfile(profile);
      logger.append({
        level: "info",
        source: "profile",
        message: `Saved profile “${saved.name}”`,
        detail: `${saved.widgets?.length || 0} widgets`,
      });
      return saved;
    } catch (err) {
      logger.append({
        level: "error",
        source: "profile",
        message: "Save failed",
        detail: err.message || String(err),
      });
      throw err;
    }
  });
  ipcMain.handle("profiles:delete", (_e, id) => {
    const existing = store.getProfile(id);
    const ok = store.deleteProfile(id);
    logger.append({
      level: "info",
      source: "profile",
      message: `Deleted profile “${existing?.name || id}”`,
    });
    return ok;
  });
  ipcMain.handle("profiles:export", (_e, id) => store.exportProfile(id));

  ipcMain.handle("styles:list", () => store.listStyles());
  ipcMain.handle("styles:get", (_e, id) => store.getStyle(id));
  ipcMain.handle("styles:create", (_e, payload) => {
    const style = store.createStyle(payload || {});
    logger.append({
      level: "info",
      source: "style",
      message: `Created key style “${style.name}”`,
    });
    return style;
  });
  ipcMain.handle("styles:save", (_e, style) => {
    const saved = store.saveStyle(style);
    logger.append({
      level: "info",
      source: "style",
      message: `Saved key style “${saved.name}”`,
    });
    return saved;
  });
  ipcMain.handle("styles:delete", (_e, id) => {
    const existing = store.getStyle(id);
    const ok = store.deleteStyle(id);
    logger.append({
      level: "info",
      source: "style",
      message: `Deleted key style “${existing?.name || id}”`,
    });
    return ok;
  });
  ipcMain.handle("styles:import", (_e, data) => {
    try {
      const style = store.importStyle(data);
      logger.append({
        level: "info",
        source: "style",
        message: `Imported key style “${style.name}”`,
      });
      return style;
    } catch (err) {
      logger.append({
        level: "error",
        source: "style",
        message: "Style import failed",
        detail: err.message || String(err),
      });
      throw new Error(err.message || "Style import failed");
    }
  });

  ipcMain.handle("profiles:setPublished", (_e, id, published) => {
    const profile = store.setPublished(id, published);
    logger.append({
      level: "info",
      source: "profile",
      message: published
        ? `Published “${profile.name}”`
        : `Unpublished “${profile.name}”`,
    });
    return profile;
  });

  ipcMain.handle("server:info", () => {
    if (lanServer) serverInfo = lanServer.getInfo();
    return withPhoneUrl(serverInfo);
  });
  ipcMain.handle("server:start", async () => startRemoteServer());
  ipcMain.handle("server:stop", async () => stopRemoteServer());
  ipcMain.handle("server:qr", async () => {
    if (lanServer) serverInfo = lanServer.getInfo();
    const info = withPhoneUrl(serverInfo);
    if (!info.running || !info.primaryUrl) return null;
    return QRCode.toDataURL(info.primaryUrl, { margin: 1, width: 240 });
  });

  ipcMain.handle("shell:openExternal", (_e, url) => shell.openExternal(url));

  const capabilities = require("./platformCapabilities.cjs");
  ipcMain.handle("platform:capabilities", () =>
    capabilities.getPlatformCapabilityStatus()
  );
  ipcMain.handle("platform:openSettings", (_e, settingsUrl) =>
    capabilities.openCapabilitySettings(settingsUrl)
  );

  ipcMain.handle("logs:list", () => logger.list());
  ipcMain.handle("logs:clear", () => {
    logger.clear();
    broadcastLog({ type: "clear" });
    return true;
  });
}

async function initialize(options = {}) {
  if (initialized) return withPhoneUrl(serverInfo);
  initialized = true;
  isDev = Boolean(options.isDev);
  getWindows =
    typeof options.getWindows === "function" ? options.getWindows : getWindows;
  phoneOutputPath = options.phoneDistPath || null;
  logger.setOnAppend((payload) => broadcastLog(payload));
  logger.startPruneLoop();
  registerIpc();
  ensureLanServer();
  return withPhoneUrl(serverInfo);
}

async function shutdown() {
  await stopRemoteServer();
  executor.shutdownHelpers();
  logger.stopPruneLoop();
}

module.exports = { initialize, shutdown };
