const path = require('node:path');
const { fileURLToPath } = require('node:url');

function isTrustedRenderer(raw, { indexPath, devUrl } = {}) {
  try {
    const url = new URL(raw);
    if (devUrl) {
      const dev = new URL(devUrl);
      return url.origin === dev.origin && url.pathname === dev.pathname;
    }
    return url.protocol === 'file:' && path.resolve(fileURLToPath(url)) === path.resolve(indexPath);
  } catch { return false; }
}

function isSafeExternalUrl(raw) {
  try {
    const url = new URL(raw);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password;
  } catch { return false; }
}

function isToolHash(value) {
  return typeof value === 'string' && value.length < 2048 &&
    /^#\/(?:$|(?:svg|paint|cel|drawing-canvas|frame-by-frame|live-character|reference-3d|anime-3d|tappilot)(?:\/[\w%.-]+){0,2}$)/.test(value);
}

module.exports = { isTrustedRenderer, isSafeExternalUrl, isToolHash };
