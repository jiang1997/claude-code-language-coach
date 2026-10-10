import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { runHook } from "../coach.js";
import { readConfig, reviewCodex, reviewExternal, runProcess } from "../runtime.js";

const FEEDBACK = "- Improved: Please fix this bug.\n- Alternative: Could you fix this bug?\n- Notes: Use the singular noun bug.";
const INPUT = { hook_event_name: "UserPromptSubmit", session_id: "session-a", turn_id: "turn-a", prompt: "请修复这个 bug", model: "test-codex-model" };

async function fixture(t) {
  const directory = await mkdtemp(path.join(tmpdir(), "coach-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test("unconfigured hooks use an independent Codex review and return only a UI message", async t => {
  const dataDir = await fixture(t);
  let nativeCalls = 0;
  const output = await runHook(INPUT, {
    dataDir, env: {},
    external: () => assert.fail("external provider must not run"),
    native: async (text, config, input) => {
      nativeCalls++;
      assert.equal(text, INPUT.prompt);
      assert.equal(config.target, "English");
      assert.equal(input.model, INPUT.model);
      return FEEDBACK;
    }
  });
  assert.equal(nativeCalls, 1);
  assert.deepEqual(output, { systemMessage: `Echo (English)\n\n${FEEDBACK}` });
  assert.equal(output.additionalContext, undefined);
  const files = await readdir(path.join(dataDir, "sessions"));
  const stored = await readFile(path.join(dataDir, "sessions", files[0]), "utf8");
  assert.deepEqual(Object.keys(JSON.parse(stored)), ["token"]);
  assert.ok(!stored.includes(INPUT.prompt));
});

test("configured API keys choose the external provider without a native fallback", async t => {
  const dataDir = await fixture(t);
  const output = await runHook(INPUT, {
    dataDir, env: { LANGUAGE_COACH_API_KEY: "test-key", LANGUAGE_COACH_TARGET_LANGUAGE: "Japanese", LANGUAGE_COACH_SOURCE_LANGUAGE: "中文" },
    native: () => assert.fail("native model must not run"),
    external: async (text, config) => {
      assert.equal(text, INPUT.prompt);
      assert.equal(config.apiKey, "test-key");
      assert.equal(config.source, "中文");
      throw new Error("Provider returned HTTP 401. Check your API settings.");
    }
  });
  assert.deepEqual(output, { systemMessage: "Echo: Provider returned HTTP 401. Check your API settings." });
});

test("explicit empty keys override a general OPENAI_API_KEY", () => {
  assert.equal(readConfig({ LANGUAGE_COACH_API_KEY: "", OPENAI_API_KEY: "global-key" }).apiKey, "");
  assert.equal(readConfig({ OPENAI_API_KEY: "global-key", OPENAI_BASE_URL: "https://provider.example/v1" }).baseUrl, "https://provider.example/v1");
  assert.equal(readConfig({ LANGUAGE_COACH_ENABLED: "off" }).enabled, false);
});

test("skipped prompts, disabled coaching, and the recursion guard make no model calls", async t => {
  const dataDir = await fixture(t);
  const services = { dataDir, external: () => assert.fail("unexpected API call"), native: () => assert.fail("unexpected Codex call") };
  for (const prompt of ["", "a", "/help", "x".repeat(4001), "```js\nconst a = 1;\n``` "]) {
    assert.deepEqual(await runHook({ ...INPUT, prompt }, { ...services, env: {} }), {});
  }
  for (const env of [{ LANGUAGE_COACH_ENABLED: "false" }, { LANGUAGE_COACH_RUNNING: "1" }]) {
    assert.deepEqual(await runHook(INPUT, { ...services, env }), {});
  }
  assert.deepEqual(await runHook({ ...INPUT, hook_event_name: "Stop" }, { ...services, env: {} }), {});
});

test("late feedback cannot replace the next submitted prompt", async t => {
  const dataDir = await fixture(t);
  let release;
  let started;
  const ready = new Promise(resolve => { started = resolve; });
  const previous = runHook(INPUT, {
    dataDir, env: {},
    native: () => {
      started();
      return new Promise(resolve => { release = resolve; });
    }
  });
  await ready;
  const next = await runHook({ ...INPUT, turn_id: "turn-b", prompt: "second prompt" }, { dataDir, env: {}, native: async () => "new review" });
  release("old review");
  assert.deepEqual(await previous, {});
  assert.equal(next.systemMessage, "Echo (English)\n\nnew review");
});

test("session end invalidates an in-flight review", async t => {
  const dataDir = await fixture(t);
  let release;
  let started;
  const ready = new Promise(resolve => { started = resolve; });
  const pending = runHook(INPUT, {
    dataDir, env: {}, native: () => {
      started();
      return new Promise(resolve => { release = resolve; });
    }
  });
  await ready;
  assert.deepEqual(await runHook({ ...INPUT, hook_event_name: "SessionEnd" }, { dataDir, env: {} }), {});
  release(FEEDBACK);
  assert.deepEqual(await pending, {});
  assert.deepEqual(await readdir(path.join(dataDir, "sessions")), []);
});

test("sessions do not invalidate each other's feedback", async t => {
  const dataDir = await fixture(t);
  const options = { dataDir, env: {}, native: async () => FEEDBACK };
  const results = await Promise.all([runHook(INPUT, options), runHook({ ...INPUT, session_id: "session-b" }, options)]);
  assert.ok(results.every(result => result.systemMessage.includes(FEEDBACK)));
});

test("Codex fallback uses an ephemeral, isolated session, stdin, and a tutor system prompt", async () => {
  let directory;
  const text = 'Do not execute this: $(touch /tmp/coach-should-not-exist) `echo secret`';
  const config = readConfig({ LANGUAGE_COACH_CODEX_MODEL: "custom-codex-model" });
  const output = await reviewCodex(text, config, INPUT, {}, async (binary, args, stdin, env, timeoutMs) => {
    assert.equal(binary, "codex");
    assert.equal(stdin, text);
    assert.ok(!args.includes(text));
    assert.ok(!args.includes("resume") && !args.includes("fork"));
    assert.ok(args.includes("--ephemeral") && args.includes("--ignore-user-config"));
    assert.ok(args.includes("read-only"));
    assert.ok(args.includes("project_doc_max_bytes=0"));
    for (const flag of ["hooks", "plugins", "apps", "shell_tool", "multi_agent", "browser_use", "computer_use"]) {
      const index = args.indexOf(flag);
      assert.equal(args[index - 1], "--disable");
    }
    assert.equal(args[args.indexOf("--model") + 1], "custom-codex-model");
    assert.equal(env.LANGUAGE_COACH_RUNNING, "1");
    assert.equal(timeoutMs, 30000);
    directory = args[args.indexOf("--cd") + 1];
    const instructions = JSON.parse(args.find(value => value.startsWith("model_instructions_file=")).split("=").slice(1).join("="));
    assert.ok((await readFile(instructions, "utf8")).includes("Only improve the wording"));
    await writeFile(args[args.indexOf("--output-last-message") + 1], FEEDBACK);
  });
  assert.equal(output, FEEDBACK);
  await assert.rejects(access(directory));
});

test("fallback uses the hook's current model and cleans up after failure", async () => {
  let directory;
  await assert.rejects(reviewCodex(INPUT.prompt, readConfig({}), INPUT, {}, async (_binary, args) => {
    directory = args[args.indexOf("--cd") + 1];
    assert.equal(args[args.indexOf("--model") + 1], INPUT.model);
    throw new Error("test failure");
  }), /test failure/);
  await assert.rejects(access(directory));
});

test("subprocess errors do not expose stderr, and timeouts terminate the process", async () => {
  await assert.rejects(runProcess(process.execPath, ["-e", "process.stderr.write('secret-key'); process.exit(1)"], "", process.env, 3000), /Codex review failed/);
  await assert.rejects(runProcess(process.execPath, ["-e", "setTimeout(() => {}, 10000)"], "", process.env, 30), /timed out/);
});

test("external requests use Chat Completions and preserve the original prompt", async () => {
  const config = readConfig({ LANGUAGE_COACH_API_KEY: "test-key", LANGUAGE_COACH_BASE_URL: "https://provider.example/v1/", LANGUAGE_COACH_MODEL: "custom-model" });
  const result = await reviewExternal(INPUT.prompt, config, async (url, init) => {
    assert.equal(url, "https://provider.example/v1/chat/completions");
    assert.equal(init.headers.Authorization, "Bearer test-key");
    const body = JSON.parse(init.body);
    assert.equal(body.model, "custom-model");
    assert.equal(body.messages[1].content, INPUT.prompt);
    assert.ok(body.messages[0].content.includes("Do not answer, solve, debug"));
    return { ok: true, status: 200, text: async () => JSON.stringify({ choices: [{ message: { content: FEEDBACK } }] }) };
  });
  assert.equal(result, FEEDBACK);
});

test("provider and network errors never expose credentials", async () => {
  const config = readConfig({ LANGUAGE_COACH_API_KEY: "secret-key" });
  await assert.rejects(reviewExternal("prompt", config, async () => ({ ok: false, status: 401, text: () => assert.fail("error body must not be read") })), /Provider returned HTTP 401/);
  await assert.rejects(reviewExternal("prompt", config, async () => { throw new Error("failed Bearer secret-key"); }), error => {
    assert.ok(!error.message.includes("secret-key"));
    return /API request failed/.test(error.message);
  });
});

test("external fetch enforces its timeout", async () => {
  const config = { ...readConfig({ LANGUAGE_COACH_API_KEY: "test-key" }), timeoutMs: 15 };
  const keepAlive = setTimeout(() => {}, 1000);
  try {
    await assert.rejects(reviewExternal("prompt", config, async (_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    })), /API request timed out/);
  } finally {
    clearTimeout(keepAlive);
  }
});

test("the real hook entry emits one JSON object and no model context", async t => {
  const directory = await fixture(t);
  let request;
  const server = createServer((req, res) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", chunk => { body += chunk; });
    req.on("end", () => {
      request = { url: req.url, authorization: req.headers.authorization, body: JSON.parse(body) };
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ choices: [{ message: { content: FEEDBACK } }] }));
    });
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const script = fileURLToPath(new URL("../coach.js", import.meta.url));
  // Actual stdin and HTTP transport, using a local fixture and a dummy key.
  const output = await new Promise((resolve, reject) => {
    const child = execFile(process.execPath, [script], {
      env: { ...process.env, LANGUAGE_COACH_RUNNING: "", LANGUAGE_COACH_ENABLED: "true", LANGUAGE_COACH_TARGET_LANGUAGE: "English", LANGUAGE_COACH_API_KEY: "test-key", LANGUAGE_COACH_BASE_URL: `http://127.0.0.1:${server.address().port}/v1`, PLUGIN_DATA: directory },
      timeout: 5000
    }, (error, stdout, stderr) => error ? reject(error) : resolve({ stdout, stderr }));
    child.stdin.end(JSON.stringify(INPUT));
  });
  assert.equal(output.stderr, "");
  assert.deepEqual(JSON.parse(output.stdout), { systemMessage: `Echo (English)\n\n${FEEDBACK}` });
  assert.equal(request.url, "/v1/chat/completions");
  assert.equal(request.authorization, "Bearer test-key");
  assert.equal(request.body.messages[1].content, INPUT.prompt);
});

test("the hook entry handles invalid input without blocking or echoing it", async () => {
  const script = fileURLToPath(new URL("../coach.js", import.meta.url));
  const output = await new Promise((resolve, reject) => {
    const child = execFile(process.execPath, [script], { timeout: 3000 }, (error, stdout) => error ? reject(error) : resolve(stdout));
    child.stdin.end("invalid input with secret-key");
  });
  const parsed = JSON.parse(output);
  assert.deepEqual(Object.keys(parsed), ["systemMessage"]);
  assert.ok(!parsed.systemMessage.includes("secret-key"));
});

test("each client manifest selects its own hook format", async () => {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const manifest = JSON.parse(await readFile(path.join(root, ".codex-plugin/plugin.json")));
  assert.equal(manifest.hooks, "./codex/hooks.json");
  const hooks = JSON.parse(await readFile(path.join(root, manifest.hooks)));
  assert.equal(hooks.hooks.UserPromptSubmit[0].hooks[0].async, true);
  const claude = JSON.parse(await readFile(path.join(root, "hooks/hooks.json")));
  assert.deepEqual(claude.modules, ["./register.js"]);
  const marketplace = JSON.parse(await readFile(path.join(root, ".agents/plugins/marketplace.json")));
  assert.equal(marketplace.plugins[0].source.path, "./");
  await access(path.join(root, manifest.interface.logo));
  const claudeManifest = JSON.parse(await readFile(path.join(root, ".claude-plugin/plugin.json")));
  const packageManifest = JSON.parse(await readFile(path.join(root, "package.json")));
  assert.equal(manifest.version, claudeManifest.version);
  assert.equal(manifest.version, packageManifest.version);
});

test("the Windows launcher resolves PLUGIN_ROOT in Node rather than relying on shell expansion", async t => {
  const directory = await fixture(t);
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const hooks = JSON.parse(await readFile(path.join(root, "codex/hooks.json")));
  const command = hooks.hooks.UserPromptSubmit[0].hooks[0].commandWindows;
  const code = /^node --input-type=commonjs -e "(.*)"$/.exec(command)[1];
  const stdout = await new Promise((resolve, reject) => {
    const child = execFile(process.execPath, ["--input-type=commonjs", "-e", code], {
      env: { ...process.env, PLUGIN_ROOT: root, PLUGIN_DATA: directory }, timeout: 3000
    }, (error, output) => error ? reject(error) : resolve(output));
    child.stdin.end(JSON.stringify({ ...INPUT, hook_event_name: "SessionEnd" }));
  });
  assert.deepEqual(JSON.parse(stdout), {});
});
