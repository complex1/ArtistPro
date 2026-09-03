const http = require("http");
const path = require("path");
const os = require("os");
const express = require("express");
const cors = require("cors");
const { WebSocketServer } = require("ws");
const store = require("./store.cjs");
const executor = require("./executor.cjs");
const logger = require("./logger.cjs");
const schema = require("./profileSchema.cjs");

const DEFAULT_PORT = 3789;

function getLanUrls(port) {
  const urls = [];
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name] || []) {
      if (iface.family === "IPv4" && !iface.internal) {
        urls.push(`http://${iface.address}:${port}`);
      }
    }
  }
  return urls;
}

const CLICK_BUTTONS = new Set(["left", "right", "middle"]);

function normalizeClickButton(raw) {
  return CLICK_BUTTONS.has(raw) ? raw : "left";
}

function shortcutLabel(widget, direction) {
  if (widget?.type === "button") {
    return executor.describeBinding(
      widget.binding?.shortcut,
      widget.binding?.shortcuts
    );
  }
  if (widget?.type === "knob") {
    const sc =
      direction === "decrease"
        ? widget.binding?.decrease
        : widget.binding?.increase;
    return executor.describeBinding(sc, null);
  }
  return "(none)";
}

function targetLabel(profile) {
  return executor.targetAppName(profile?.targetApp) || "frontmost";
}

function logAction({ profile, widget, action, ok, error, extra }) {
  const base = `${profile?.name || "?"} · ${widget?.name || widget?.type || "?"} · ${action}`;
  if (ok) {
    logger.append({
      level: "info",
      source: "command",
      message: base,
      detail: extra,
    });
  } else {
    logger.append({
      level: "error",
      source: "command",
      message: `${base} failed`,
      detail: error || extra,
    });
  }
}

function replyResult(socket, msg, result) {
  if (!socket || socket.readyState !== 1) return;
  try {
    socket.send(
      JSON.stringify({
        type: "actionResult",
        requestId: msg.requestId || null,
        profileId: msg.profileId,
        widgetId: msg.widgetId,
        actionType: msg.type,
        ...result,
      })
    );
  } catch {
    // ignore
  }
}

function createLanServer({ phoneDistPath, isDev }) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // Throttle noisy knob logs: one log line per widget every 250ms
  const knobLogAt = new Map();

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/api/profiles", (_req, res) => {
    const profiles = store
      .listPublishedProfiles()
      .map(({ id, name, description, targetApp, updatedAt, widgets, image, grid }) => ({
        id,
        name,
        description,
        targetApp: schema.targetAppDisplayName(targetApp),
        updatedAt,
        widgetCount: widgets.length,
        image: image || null,
        grid,
      }));
    res.json({ profiles });
  });

  app.get("/api/profiles/:id", (req, res) => {
    const profile = store.getProfile(req.params.id);
    if (!profile || !profile.published) {
      res.status(404).json({ error: "Profile not found" });
      return;
    }
    logger.append({
      level: "info",
      source: "phone",
      message: `Phone opened profile “${profile.name}”`,
    });
    const styles = store.resolveProfileStyles(profile);
    res.json({ profile: { ...profile, styles } });
  });

  app.post("/api/action", async (req, res) => {
    try {
      const { profileId, widgetId, type, value, direction } = req.body || {};
      const profile = store.getProfile(profileId);
      if (!profile || !profile.published) {
        res.status(404).json({
          success: false,
          errorCode: "TARGET_APP_NOT_FOUND",
          message: "Profile not found",
        });
        return;
      }
      const widget = (profile.widgets || []).find((w) => w.id === widgetId);
      if (!widget) {
        res.status(404).json({
          success: false,
          errorCode: "TARGET_APP_NOT_FOUND",
          message: "Widget not found",
        });
        return;
      }

      let result;
      if (type === "button" || widget.type === "button") {
        result = await executor.executeButton(widget, profile);
        logAction({
          profile,
          widget,
          action: "button",
          ok: result.success,
          error: result.message,
          extra: `keys ${shortcutLabel(widget)} → ${targetLabel(profile)}`,
        });
      } else if (type === "slider" || widget.type === "slider") {
        result = await executor.executeSlider(widget, value);
        logAction({
          profile,
          widget,
          action: "slider",
          ok: result.success,
          error: result.message,
          extra: `volume ${value}`,
        });
      } else if (type === "trackpadClick") {
        const button = normalizeClickButton(req.body?.button);
        result = await executor.executeTrackpadClick(widget, button);
        logAction({
          profile,
          widget,
          action: `trackpad ${button} click`,
          ok: result.success,
          error: result.message,
        });
      } else if (type === "knob" || widget.type === "knob") {
        const dir = direction === "decrease" ? "decrease" : "increase";
        result = await executor.executeKnobStep(widget, dir, profile);
        if (result.success) maybeLogKnob(profile, widget, dir, knobLogAt);
        else {
          logAction({
            profile,
            widget,
            action: `knob ${dir}`,
            ok: false,
            error: result.message,
          });
        }
      } else {
        res.status(400).json({
          success: false,
          errorCode: "EXECUTION_FAILED",
          message: "Unknown action type",
        });
        return;
      }

      if (result.success) res.json(result);
      else res.status(result.errorCode === "TARGET_APP_NOT_ACTIVE" ? 409 : 500).json(result);
    } catch (err) {
      logger.append({
        level: "error",
        source: "command",
        message: "Action failed",
        detail: err.message || String(err),
      });
      res.status(500).json({
        success: false,
        errorCode: "EXECUTION_FAILED",
        message: err.message || "Action failed",
      });
    }
  });

  if (!isDev && phoneDistPath) {
    // Never let browsers keep a stale service worker / manifest after an update.
    app.use((req, res, next) => {
      if (
        req.path === "/sw.js" ||
        req.path === "/workbox-window.js" ||
        req.path.endsWith("sw.js") ||
        req.path.endsWith(".webmanifest") ||
        req.path === "/manifest.webmanifest"
      ) {
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        res.setHeader("Service-Worker-Allowed", "/");
      }
      next();
    });
    app.use(express.static(phoneDistPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(phoneDistPath, "index.html"));
    });
  } else {
    app.get("/", (_req, res) => {
      res.type("html").send(
        `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"/><body style="font-family:sans-serif;background:#0b1016;color:#e8eef6;padding:24px"><h1>TapPilot</h1><p>Dev mode: open the phone UI on port <b>5174</b> (scan the QR in the TapPilot desktop app).</p><p>API is on this port.</p></body>`
      );
    });
  }

  let server = null;
  let wss = null;
  let port = DEFAULT_PORT;
  let listening = false;
  const knobState = new WeakMap();

  function attachWebSocketHandlers(socketServer) {
    socketServer.on("connection", (socket) => {
      knobState.set(socket, { lastAt: 0 });
      logger.append({
        level: "info",
        source: "phone",
        message: "Phone connected (WebSocket)",
      });
      socket.on("close", () => {
        logger.append({
          level: "info",
          source: "phone",
          message: "Phone disconnected",
        });
      });
      socket.on("message", async (raw) => {
        try {
          const msg = JSON.parse(String(raw));
          if (msg.type === "knob") {
            const state = knobState.get(socket) || { lastAt: 0 };
            const now = Date.now();
            if (now - state.lastAt < 40) return;
            state.lastAt = now;
            knobState.set(socket, state);

            const profile = store.getProfile(msg.profileId);
            if (!profile?.published) return;
            const widget = (profile.widgets || []).find((w) => w.id === msg.widgetId);
            if (!widget || widget.type !== "knob") return;
            const direction = msg.delta >= 0 ? "increase" : "decrease";
            const steps = Math.min(5, Math.max(1, Math.round(Math.abs(msg.delta))));
            let lastResult = { success: true };
            for (let i = 0; i < steps; i++) {
              lastResult = await executor.executeKnobStep(
                widget,
                direction,
                profile
              );
              if (!lastResult.success) break;
            }
            if (lastResult.success) maybeLogKnob(profile, widget, direction, knobLogAt);
            else {
              logAction({
                profile,
                widget,
                action: `knob ${direction}`,
                ok: false,
                error: lastResult.message,
              });
            }
            replyResult(socket, msg, lastResult);
          } else if (msg.type === "trackpad") {
            const state = knobState.get(socket) || { lastAt: 0, tpAt: 0 };
            const now = Date.now();
            if (now - (state.tpAt || 0) < 8) return;
            state.tpAt = now;
            knobState.set(socket, state);

            const profile = store.getProfile(msg.profileId);
            if (!profile?.published) return;
            const widget = (profile.widgets || []).find((w) => w.id === msg.widgetId);
            if (!widget || widget.type !== "trackpad") return;

            const dx = Number(msg.dx) || 0;
            const dy = Number(msg.dy) || 0;
            if (dx === 0 && dy === 0) return;

            const result = await executor.executeTrackpadMove(widget, dx, dy);
            if (result.success) {
              maybeLogTrackpad(profile, widget, dx, dy, knobLogAt);
            } else {
              logAction({
                profile,
                widget,
                action: "trackpad mouse",
                ok: false,
                error: result.message,
              });
              replyResult(socket, msg, result);
            }
          } else if (msg.type === "trackpadClick") {
            const profile = store.getProfile(msg.profileId);
            if (!profile?.published) return;
            const widget = (profile.widgets || []).find((w) => w.id === msg.widgetId);
            if (!widget || widget.type !== "trackpad") return;

            const button = normalizeClickButton(msg.button);
            const result = await executor.executeTrackpadClick(widget, button);
            logAction({
              profile,
              widget,
              action: `trackpad ${button} click`,
              ok: result.success,
              error: result.message,
            });
            if (!result.success) replyResult(socket, msg, result);
          } else if (msg.type === "slider") {
            const profile = store.getProfile(msg.profileId);
            if (!profile?.published) return;
            const widget = (profile.widgets || []).find((w) => w.id === msg.widgetId);
            if (!widget || widget.type !== "slider") return;
            const result = await executor.executeSlider(widget, msg.value);
            logAction({
              profile,
              widget,
              action: "slider",
              ok: result.success,
              error: result.message,
              extra: `volume ${msg.value}`,
            });
            if (!result.success) replyResult(socket, msg, result);
          } else if (msg.type === "button") {
            const profile = store.getProfile(msg.profileId);
            if (!profile?.published) return;
            const widget = (profile.widgets || []).find((w) => w.id === msg.widgetId);
            if (!widget || widget.type !== "button") return;
            const result = await executor.executeButton(widget, profile);
            logAction({
              profile,
              widget,
              action: "button",
              ok: result.success,
              error: result.message,
              extra: `keys ${shortcutLabel(widget)} → ${targetLabel(profile)}`,
            });
            replyResult(socket, msg, result);
          }
        } catch (err) {
          logger.append({
            level: "error",
            source: "command",
            message: "WebSocket message failed",
            detail: err?.message || String(err),
          });
        }
      });
    });
  }

  function start(preferredPort = DEFAULT_PORT) {
    if (listening) {
      return Promise.resolve(getInfo());
    }

    return new Promise((resolve, reject) => {
      server = http.createServer(app);
      wss = new WebSocketServer({ server, path: "/ws" });
      attachWebSocketHandlers(wss);

      const tryListen = (p) => {
        port = p;
        const onError = (err) => {
          server.removeListener("error", onError);
          if (err.code === "EADDRINUSE" && p < preferredPort + 20) {
            tryListen(p + 1);
          } else {
            listening = false;
            cleanupSockets();
            reject(err);
          }
        };
        server.once("error", onError);
        server.listen(p, "0.0.0.0", () => {
          server.removeListener("error", onError);
          listening = true;
          const info = getInfo();
          logger.append({
            level: "info",
            source: "server",
            message: `LAN server listening on ${info.primaryUrl}`,
          });
          resolve(info);
        });
      };
      tryListen(preferredPort);
    });
  }

  function cleanupSockets() {
    try {
      wss?.removeAllListeners();
      wss = null;
    } catch {
      // ignore
    }
    try {
      server?.removeAllListeners();
      server = null;
    } catch {
      // ignore
    }
  }

  function stop() {
    return new Promise((resolve) => {
      if (!listening || !server) {
        listening = false;
        cleanupSockets();
        resolve(getInfo());
        return;
      }

      const httpServer = server;
      const socketServer = wss;

      const finish = () => {
        listening = false;
        cleanupSockets();
        logger.append({
          level: "info",
          source: "server",
          message: "LAN server stopped",
        });
        resolve(getInfo());
      };

      if (socketServer) {
        for (const client of socketServer.clients) {
          try {
            client.terminate();
          } catch {
            // ignore
          }
        }
        socketServer.close(() => {
          httpServer.close(() => finish());
        });
      } else {
        httpServer.close(() => finish());
      }
    });
  }

  function isRunning() {
    return listening;
  }

  function getInfo() {
    const urls = listening ? getLanUrls(port) : [];
    return {
      running: listening,
      port: listening ? port : null,
      urls,
      primaryUrl: listening
        ? urls[0] || `http://127.0.0.1:${port}`
        : null,
    };
  }

  return { start, stop, getInfo, isRunning };
}

function maybeLogTrackpad(profile, widget, dx, dy, logAtMap) {
  const now = Date.now();
  const key = `${widget.id}:tp`;
  const last = logAtMap.get(key) || 0;
  if (now - last < 400) return;
  logAtMap.set(key, now);
  logAction({
    profile,
    widget,
    action: "trackpad mouse",
    ok: true,
    extra: `Δ ${Math.round(dx)},${Math.round(dy)}`,
  });
}

function maybeLogKnob(profile, widget, direction, knobLogAt) {
  const now = Date.now();
  const last = knobLogAt.get(widget.id) || 0;
  if (now - last < 250) return;
  knobLogAt.set(widget.id, now);
  logAction({
    profile,
    widget,
    action: `knob ${direction}`,
    ok: true,
    extra: `keys ${shortcutLabel(widget, direction)} → ${targetLabel(profile)}`,
  });
}

module.exports = { createLanServer, DEFAULT_PORT };
