"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const pluginRoot = path.resolve(__dirname, "..");
const helperScript = path.join(pluginRoot, "scripts", "language-helper.js");

test("regular helper emits inline system message when API key is missing", () => {
  const result = runHelper({
    hook_event_name: "UserPromptSubmit",
    session_id: "regular-test",
    prompt: "please improve this prompt"
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");

  const output = JSON.parse(result.stdout.trim());
  assert.equal(output.suppressOutput, true);
  assert.match(output.systemMessage, /Language Coach plugin is not configured/);
  assert.match(output.systemMessage, /LC_HELPER_API_KEY/);
});

function runHelper(input) {
  return spawnSync(process.execPath, [helperScript], {
    cwd: pluginRoot,
    input: JSON.stringify(input),
    encoding: "utf8",
    env: testEnv()
  });
}

function testEnv() {
  return {
    ...process.env,
    CLAUDE_PLUGIN_OPTION_api_key: "",
    CLAUDE_PLUGIN_OPTION_API_KEY: "",
    LC_HELPER_API_KEY: "",
    OPENAI_API_KEY: "",
    LC_HELPER_ENABLED: "1"
  };
}
