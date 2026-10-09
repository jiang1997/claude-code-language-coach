import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { shouldReview } from "../hooks/prompt.js";
import { readConfig, reviewCodex, reviewExternal } from "./runtime.js";

function sessionFile(sessionId, dataDir) {
  return path.join(dataDir, "sessions", `${createHash("sha256").update(sessionId).digest("hex")}.json`);
}

async function claim(file) {
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const token = randomUUID();
  const temporary = `${file}.${token}.tmp`;
  try {
    // Only an opaque generation token is stored, never prompts or credentials.
    await writeFile(temporary, JSON.stringify({ token }), { mode: 0o600 });
    await rename(temporary, file);
  } finally {
    await rm(temporary, { force: true });
  }
  return token;
}

async function isCurrent(file, token) {
  try {
    return JSON.parse(await readFile(file, "utf8")).token === token;
  } catch {
    return false;
  }
}

export async function runHook(input, {
  env = process.env,
  dataDir = env.PLUGIN_DATA || path.join(tmpdir(), `language-coach-codex-${createHash("sha256").update(homedir()).digest("hex").slice(0, 16)}`),
  external = reviewExternal,
  native = reviewCodex
} = {}) {
  if (env.LANGUAGE_COACH_RUNNING === "1") return {};
  if (!["UserPromptSubmit", "SessionEnd"].includes(input?.hook_event_name)) return {};
  if (typeof input.session_id !== "string" || !input.session_id) return {};
  const file = sessionFile(input.session_id, dataDir);
  if (input.hook_event_name === "SessionEnd") {
    await rm(file, { force: true });
    return {};
  }
  const token = await claim(file);
  const config = readConfig(env);
  if (!config.enabled || typeof input.prompt !== "string" || !shouldReview(input.prompt)) return {};
  let message;
  try {
    const feedback = config.apiKey
      ? await external(input.prompt, config)
      : await native(input.prompt, config, input, env);
    message = `Language Coach (${config.target})\n\n${feedback}`;
  } catch (error) {
    message = `Language Coach: ${error.message}`;
  }
  if (!await isCurrent(file, token)) return {};
  // Never return additionalContext or plain stdout: both enter model context.
  return { systemMessage: message.slice(0, 9900) };
}

export async function main() {
  let output;
  try {
    let raw = "";
    process.stdin.setEncoding("utf8");
    for await (const chunk of process.stdin) {
      raw += chunk.toString("utf8");
      if (raw.length > 131072) throw new Error("oversized input");
    }
    const input = JSON.parse(raw);
    output = await runHook(input);
  } catch {
    output = { systemMessage: "Language Coach could not process the hook input or session state." };
  }
  process.stdout.write(`${JSON.stringify(output)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await main();
}
