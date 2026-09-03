const { randomUUID } = require("crypto");

const TTL_MS = 10 * 60 * 1000;
const MAX_ENTRIES = 500;

/** @type {Array<{ id: string, at: number, level: string, source: string, message: string, detail?: string }>} */
let entries = [];
/** @type {((entry: object) => void) | null} */
let onAppend = null;
let pruneTimer = null;

function setOnAppend(handler) {
  onAppend = handler;
}

function prune() {
  const cutoff = Date.now() - TTL_MS;
  const before = entries.length;
  entries = entries.filter((e) => e.at >= cutoff);
  if (entries.length > MAX_ENTRIES) {
    entries = entries.slice(entries.length - MAX_ENTRIES);
  }
  return before !== entries.length;
}

function append({ level = "info", source = "app", message, detail }) {
  prune();
  const entry = {
    id: randomUUID(),
    at: Date.now(),
    level,
    source,
    message: String(message || ""),
    detail: detail ? String(detail) : undefined,
  };
  entries.push(entry);
  if (onAppend) onAppend(entry);
  return entry;
}

function list() {
  prune();
  return [...entries];
}

function clear() {
  entries = [];
}

function startPruneLoop() {
  if (pruneTimer) return;
  pruneTimer = setInterval(() => {
    const removed = prune();
    if (removed && onAppend) {
      // Signal UI to refresh pruned list
      onAppend({ type: "prune" });
    }
  }, 30_000);
  if (typeof pruneTimer.unref === "function") pruneTimer.unref();
}

function stopPruneLoop() {
  if (pruneTimer) {
    clearInterval(pruneTimer);
    pruneTimer = null;
  }
}

module.exports = {
  TTL_MS,
  setOnAppend,
  append,
  list,
  clear,
  prune,
  startPruneLoop,
  stopPruneLoop,
};
