import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildSystemPrompt } from "../hooks/prompt.js";
import { buildChatRequest, chatCompletionsUrl, readFeedback } from "../hooks/provider.js";

export function readConfig(env) {
  return {
    enabled: !["0", "false", "no", "off"].includes((env.LANGUAGE_COACH_ENABLED || "true").trim().toLowerCase()),
    target: (env.LANGUAGE_COACH_TARGET_LANGUAGE || "English").trim(),
    source: (env.LANGUAGE_COACH_SOURCE_LANGUAGE || "").trim(),
    apiKey: (env.LANGUAGE_COACH_API_KEY ?? env.OPENAI_API_KEY ?? "").trim(),
    baseUrl: (env.LANGUAGE_COACH_BASE_URL ?? env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").trim(),
    model: (env.LANGUAGE_COACH_MODEL || "gpt-4o-mini").trim(),
    codexModel: (env.LANGUAGE_COACH_CODEX_MODEL || "").trim(),
    timeoutMs: 30000
  };
}

export async function reviewExternal(text, config, request = fetch) {
  const url = chatCompletionsUrl(config.baseUrl);
  const signal = AbortSignal.timeout(config.timeoutMs);
  let response;
  let body;
  try {
    response = await request(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify(buildChatRequest(text, config.model, config.target, config.source)),
      signal
    });
    if (response.ok) body = await response.text();
  } catch {
    if (signal.aborted) throw new Error("API request timed out after 30 seconds.");
    throw new Error("API request failed. Check your provider URL, credentials, and network.");
  }
  return readFeedback({ ok: response.ok, status: response.status, text: body });
}

// Never use a shell or put the submitted prompt into process arguments.
export function runProcess(executable, args, input, env, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { env, stdio: ["pipe", "ignore", "ignore"], windowsHide: true });
    let expired = false;
    const timeout = setTimeout(() => {
      expired = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    child.once("error", () => {
      clearTimeout(timeout);
      reject(new Error("Could not start Codex. Ensure codex is installed and available on PATH."));
    });
    child.once("close", (code) => {
      clearTimeout(timeout);
      if (expired) reject(new Error("Codex review timed out after 30 seconds."));
      else if (code !== 0) reject(new Error("Codex review failed. Check your Codex login and model availability."));
      else resolve();
    });
    // Closing stdin early must not crash the hook (e.g. a startup/auth failure).
    child.stdin.on("error", () => {});
    child.stdin.end(input);
  });
}

export async function reviewCodex(text, config, input, env, run = runProcess) {
  const directory = await mkdtemp(path.join(tmpdir(), "language-coach-review-"));
  const instructions = path.join(directory, "tutor.md");
  const output = path.join(directory, "feedback.txt");
  try {
    await writeFile(instructions, buildSystemPrompt(config.target, config.source), { mode: 0o600 });
    const args = [
      "--no-daemon", "exec", "--ephemeral", "--ignore-user-config", "--ignore-rules",
      "--skip-git-repo-check", "--sandbox", "read-only", "--color", "never",
      "--cd", directory, "--output-last-message", output,
      "--disable", "hooks", "--disable", "plugins", "--disable", "apps",
      "--disable", "shell_tool", "--disable", "multi_agent", "--disable", "browser_use",
      "--disable", "computer_use", "--disable", "image_generation", "--disable", "memories",
      "-c", "web_search=\"disabled\"", "-c", "project_doc_max_bytes=0",
      "-c", `model_instructions_file=${JSON.stringify(instructions)}`,
      "-c", "developer_instructions=\"\""
    ];
    const model = config.codexModel || input.model;
    if (model) args.push("--model", model);
    args.push("-");
    // A fresh, ephemeral session: never resume or fork the user's conversation.
    // Auth remains available even with --ignore-user-config; plugin/config tools
    // and project instructions aren't loaded into the language review.
    await run("codex", args, text, { ...env, LANGUAGE_COACH_RUNNING: "1" }, config.timeoutMs);
    let feedback;
    try {
      feedback = await readFile(output, "utf8");
    } catch {
      throw new Error("Codex did not return language feedback.");
    }
    if (!feedback.trim()) throw new Error("Codex returned an empty review.");
    return feedback.trim().slice(0, 9500);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
