"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const CACHE_DIR = path.join(os.tmpdir(), "claude-language-coach");
const MAX_AGE_MS = 5 * 60 * 1000;

function sanitizeSessionId(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
}

function feedbackCachePath(sessionId) {
  return path.join(CACHE_DIR, `${sessionId}.txt`);
}

function writeFeedbackCache(sessionId, message) {
  const safeSessionId = sanitizeSessionId(sessionId);
  if (!safeSessionId) {
    return;
  }

  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    const payload = `${new Date().toISOString()}\n${message}\n`;
    fs.writeFileSync(feedbackCachePath(safeSessionId), payload, "utf8");
    cleanStaleCacheFiles();
  } catch (err) {
    process.stderr.write(`language-coach: cache write failed: ${err.message}\n`);
  }
}

function cleanStaleCacheFiles() {
  try {
    const entries = fs.readdirSync(CACHE_DIR);
    const cutoff = Date.now() - MAX_AGE_MS;
    for (const entry of entries) {
      const filePath = path.join(CACHE_DIR, entry);
      try {
        const stats = fs.statSync(filePath);
        if (stats.mtimeMs < cutoff) {
          fs.unlinkSync(filePath);
        }
      } catch (_err) {
        // Ignore per-file errors (e.g., race condition with another process).
      }
    }
  } catch (_err) {
    // Ignore directory-level errors (e.g., directory missing or unreadable).
  }
}

module.exports = {
  CACHE_DIR,
  MAX_AGE_MS,
  cleanStaleCacheFiles,
  feedbackCachePath,
  sanitizeSessionId,
  writeFeedbackCache
};
