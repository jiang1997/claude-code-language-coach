#!/usr/bin/env node

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const CACHE_DIR = path.join(os.tmpdir(), "claude-language-coach");
const MAX_AGE_MS = 5 * 60 * 1000;
const MAX_OUTPUT_LINES = 6;
const MAX_LINE_CHARS = 240;
const HEADER = "\x1b[2mLanguage Coach\x1b[0m";

readStdin()
  .then(render)
  .catch(() => {});

async function render(raw) {
  const data = safeParse(raw);
  const sessionId = sanitizeSessionId(data.session_id);
  if (!sessionId) {
    return;
  }

  const file = path.join(CACHE_DIR, `${sessionId}.txt`);
  let content;
  try {
    content = fs.readFileSync(file, "utf8");
  } catch (_err) {
    return;
  }

  const newlineIndex = content.indexOf("\n");
  if (newlineIndex === -1) {
    return;
  }

  const timestamp = Date.parse(content.slice(0, newlineIndex).trim());
  if (!Number.isFinite(timestamp) || Date.now() - timestamp > MAX_AGE_MS) {
    return;
  }

  const body = content.slice(newlineIndex + 1).trim();
  if (!body) {
    return;
  }

  const rawLines = body.split(/\r?\n/);
  let inNotes = false;
  const lines = [];

  for (let line of rawLines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("Language Coach (")) {
      continue;
    }

    if (trimmed.startsWith("- Notes:") || trimmed.startsWith("Notes:")) {
      inNotes = true;
      const remaining = trimmed.replace(/^-?\s*Notes:\s*/i, "").trim();
      if (remaining) {
        lines.push(`\x1b[36m${truncate(remaining, MAX_LINE_CHARS)}\x1b[0m`);
      }
      continue;
    }

    const truncated = truncate(trimmed, MAX_LINE_CHARS);
    if (inNotes) {
      lines.push(`\x1b[36m${truncated}\x1b[0m`);
    } else {
      lines.push(truncated);
    }
  }

  const finalLines = lines.slice(0, MAX_OUTPUT_LINES);
  process.stdout.write(`${finalLines.join("\n")}\n`);
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

function safeParse(raw) {
  if (!raw || !raw.trim()) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch (_err) {
    return {};
  }
}

function sanitizeSessionId(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
}

function truncate(value, maxLength) {
  const text = String(value);
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 1)}…`;
}
