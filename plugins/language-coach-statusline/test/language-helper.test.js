"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const {
  feedbackCachePath,
  sanitizeSessionId
} = require("../scripts/statusline-cache");

const pluginRoot = path.resolve(__dirname, "..");
const helperScript = path.join(pluginRoot, "scripts", "language-helper.js");
const statuslineScript = path.join(pluginRoot, "scripts", "language-statusline.js");

test("statusline helper suppresses inline message and writes feedback cache", () => {
  const rawSessionId = "statusline/test:missing-key";
  const sessionId = sanitizeSessionId(rawSessionId);
  const cachePath = feedbackCachePath(sessionId);
  fs.rmSync(cachePath, { force: true });

  const result = runScript(helperScript, {
    hook_event_name: "UserPromptSubmit",
    session_id: rawSessionId,
    prompt: "please improve this prompt"
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");

  const output = JSON.parse(result.stdout.trim());
  assert.deepEqual(output, {
    suppressOutput: true
  });

  const cacheContent = fs.readFileSync(cachePath, "utf8");
  assert.match(cacheContent, /Language Coach plugin is not configured/);
  assert.match(cacheContent, /LC_HELPER_API_KEY/);
});

test("statusline renderer reads cached feedback by sanitized session id", () => {
  const rawSessionId = "statusline/test:render";
  const sessionId = sanitizeSessionId(rawSessionId);
  const cachePath = feedbackCachePath(sessionId);
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  fs.writeFileSync(
    cachePath,
    `${new Date().toISOString()}\nLanguage Coach (English prompt feedback)\n\n- Improved: Please improve this prompt.\n- Notes: clearer wording\n`,
    "utf8"
  );

  const result = runScript(statuslineScript, {
    session_id: rawSessionId
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  assert.match(result.stdout, /- Improved: Please improve this prompt\./);
  assert.match(result.stdout, /clearer wording/);
});

test("statusline helper caches provider errors after context is created", () => {
  const rawSessionId = "statusline/test:provider-error";
  const sessionId = sanitizeSessionId(rawSessionId);
  const cachePath = feedbackCachePath(sessionId);
  fs.rmSync(cachePath, { force: true });

  const result = runScript(
    helperScript,
    {
      hook_event_name: "UserPromptSubmit",
      session_id: rawSessionId,
      prompt: "please improve this prompt"
    },
    {
      LC_HELPER_API_KEY: "test-key",
      LC_HELPER_BASE_URL: "http://127.0.0.1:1",
      LC_HELPER_TIMEOUT_MS: "1000"
    }
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  assert.deepEqual(JSON.parse(result.stdout.trim()), {
    suppressOutput: true
  });

  const cacheContent = fs.readFileSync(cachePath, "utf8");
  assert.match(cacheContent, /Language Coach hook failed:/);
});

function runScript(script, input, envOverrides = {}) {
  return spawnSync(process.execPath, [script], {
    cwd: pluginRoot,
    input: JSON.stringify(input),
    encoding: "utf8",
    env: testEnv(envOverrides)
  });
}

function testEnv(overrides = {}) {
  return {
    ...process.env,
    CLAUDE_PLUGIN_OPTION_api_key: "",
    CLAUDE_PLUGIN_OPTION_API_KEY: "",
    LC_HELPER_API_KEY: "",
    OPENAI_API_KEY: "",
    LC_HELPER_ENABLED: "1",
    ...overrides
  };
}
