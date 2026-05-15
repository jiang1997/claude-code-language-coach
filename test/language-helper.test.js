#!/usr/bin/env node

"use strict";

const assert = require("node:assert/strict");
const { spawn, spawnSync } = require("node:child_process");
const http = require("node:http");
const path = require("node:path");

const helperPath = path.join(__dirname, "..", "scripts", "language-helper.js");

async function main() {
  await testEnglishFeedback();
  await testChineseTranslation();
  testSkipsSlashCommands();
  testMissingKeyMessage();
  console.log("language-helper tests passed");
}

async function testEnglishFeedback() {
  const server = await createMockServer(({ body }) => {
    assert.equal(body.model, "mock-model");
    assert.match(body.messages[0].content, /Check the user's English/);
    assert.equal(body.messages[1].content, "I has a question about this function.");
    return {
      choices: [
        {
          message: {
            content: "- Improved: I have a question about this function.\n- Notes: Use \"have\" with \"I\"."
          }
        }
      ]
    };
  });

  try {
    const output = await runHookAsync(
      { hook_event_name: "UserPromptSubmit", prompt: "I has a question about this function." },
      {
        CLAUDE_PLUGIN_OPTION_api_key: "test-key",
        CLAUDE_PLUGIN_OPTION_base_url: server.baseUrl,
        CLAUDE_PLUGIN_OPTION_model: "mock-model"
      }
    );

    assert.equal(output.status, 0);
    const parsed = JSON.parse(output.stdout);
    assert.match(parsed.systemMessage, /English prompt feedback/);
    assert.match(parsed.systemMessage, /I have a question/);
    assert.equal(parsed.hookSpecificOutput, undefined);
  } finally {
    await server.close();
  }
}

async function testChineseTranslation() {
  const server = await createMockServer(({ body }) => {
    assert.match(body.messages[0].content, /Translate the user's Chinese/);
    assert.equal(body.messages[1].content, "帮我解释这个错误");
    return {
      choices: [
        {
          message: {
            content: "- Improved: Help me explain this error.\n- Notes: Natural request form."
          }
        }
      ]
    };
  });

  try {
    const output = await runHookAsync(
      { hook_event_name: "UserPromptSubmit", prompt: "帮我解释这个错误" },
      {
        CLAUDE_PLUGIN_OPTION_api_key: "test-key",
        CLAUDE_PLUGIN_OPTION_base_url: server.baseUrl,
        CLAUDE_PLUGIN_OPTION_model: "mock-model",
        CLAUDE_PLUGIN_OPTION_inject_context: "true"
      }
    );

    assert.equal(output.status, 0);
    const parsed = JSON.parse(output.stdout);
    assert.match(parsed.systemMessage, /Chinese to English/);
    assert.match(parsed.systemMessage, /Help me explain this error/);
    assert.equal(parsed.hookSpecificOutput.hookEventName, "UserPromptSubmit");
    assert.match(parsed.hookSpecificOutput.additionalContext, /Language helper feedback/);
  } finally {
    await server.close();
  }
}

function testSkipsSlashCommands() {
  const output = runHook(
    { hook_event_name: "UserPromptSubmit", prompt: "/help" },
    { CLAUDE_PLUGIN_OPTION_api_key: "test-key" }
  );

  assert.equal(output.status, 0);
  assert.equal(output.stdout, "");
}

function testMissingKeyMessage() {
  const output = runHook({ hook_event_name: "UserPromptSubmit", prompt: "Can you help me?" }, {});

  assert.equal(output.status, 0);
  const parsed = JSON.parse(output.stdout);
  assert.match(parsed.systemMessage, /not configured/);
}

function runHook(input, extraEnv) {
  return spawnSync(process.execPath, [helperPath], {
    input: JSON.stringify(input),
    encoding: "utf8",
    env: {
      PATH: process.env.PATH,
      ...extraEnv
    }
  });
}

function runHookAsync(input, extraEnv) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [helperPath], {
      env: {
        PATH: process.env.PATH,
        ...extraEnv
      },
      stdio: ["pipe", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (status, signal) => {
      resolve({ status, signal, stdout, stderr });
    });
    child.stdin.end(JSON.stringify(input));
  });
}

function createMockServer(handler) {
  const server = http.createServer(async (req, res) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      const body = JSON.parse(raw);
      const response = handler({ req, body });
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(response));
    });
  });

  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({
        baseUrl: `http://127.0.0.1:${address.port}/v1`,
        close: () => new Promise((done) => server.close(done))
      });
    });
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
