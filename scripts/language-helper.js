#!/usr/bin/env node

"use strict";

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_TIMEOUT_MS = 12000;
const DEFAULT_MAX_PROMPT_CHARS = 4000;
const OUTPUT_LIMIT = 9500;

const env = process.env;

main().catch((error) => {
  emitSystemMessage(`Language Learning hook failed: ${formatError(error)}`);
});

async function main() {
  const input = parseHookInput(await readStdin());
  if (input.hook_event_name !== "UserPromptSubmit") {
    return;
  }

  const prompt = normalizePrompt(input.prompt);
  if (!shouldHandlePrompt(prompt)) {
    return;
  }

  const config = readConfig();
  if (!config.enabled) {
    return;
  }

  if (prompt.length > config.maxPromptChars) {
    return;
  }

  if (!config.apiKey) {
    emitSystemMessage(
      "Language Learning plugin is not configured: set the plugin API key or LL_HELPER_API_KEY."
    );
    return;
  }

  if (!config.model) {
    emitSystemMessage(
      "Language Learning plugin is not configured: set the plugin model or LL_HELPER_MODEL."
    );
    return;
  }

  const mode = detectMode(prompt);
  if (mode === "unknown") {
    return;
  }

  const content = await callChatCompletions(config, buildMessages(mode, prompt));
  const message = formatFeedback(mode, content);
  emitSystemMessage(message, {
    injectContext: config.injectContext,
    hookEventName: input.hook_event_name
  });
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

function parseHookInput(raw) {
  if (!raw.trim()) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`invalid hook input JSON: ${error.message}`);
  }
}

function normalizePrompt(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function shouldHandlePrompt(prompt) {
  if (prompt.length < 2) {
    return false;
  }

  if (
    readBoolean("skip_slash_commands", "LL_HELPER_SKIP_SLASH_COMMANDS", true) &&
    prompt.startsWith("/")
  ) {
    return false;
  }

  if (looksLikeMostlyCodeOrLogs(prompt)) {
    return false;
  }

  return true;
}

function readConfig() {
  return {
    enabled: readBoolean("enabled", "LL_HELPER_ENABLED", true),
    apiKey:
      readPluginOption("api_key") ||
      env.LL_HELPER_API_KEY ||
      env.OPENAI_API_KEY ||
      env.DASHSCOPE_API_KEY ||
      "",
    baseUrl:
      readPluginOption("base_url") ||
      env.LL_HELPER_BASE_URL ||
      env.OPENAI_BASE_URL ||
      env.OPENAI_API_BASE ||
      DEFAULT_BASE_URL,
    model:
      readPluginOption("model") ||
      env.LL_HELPER_MODEL ||
      env.OPENAI_MODEL ||
      DEFAULT_MODEL,
    injectContext: readBoolean("inject_context", "LL_HELPER_INJECT_CONTEXT", false),
    timeoutMs: readNumber("timeout_ms", "LL_HELPER_TIMEOUT_MS", DEFAULT_TIMEOUT_MS, 1000, 60000),
    maxPromptChars: readNumber(
      "max_prompt_chars",
      "LL_HELPER_MAX_PROMPT_CHARS",
      DEFAULT_MAX_PROMPT_CHARS,
      100,
      20000
    )
  };
}

function readPluginOption(key) {
  return env[`CLAUDE_PLUGIN_OPTION_${key}`] || env[`CLAUDE_PLUGIN_OPTION_${key.toUpperCase()}`] || "";
}

function readBoolean(optionKey, envKey, defaultValue) {
  const raw = readPluginOption(optionKey) || env[envKey];
  if (raw === undefined || raw === "") {
    return defaultValue;
  }

  if (typeof raw === "boolean") {
    return raw;
  }

  return !["0", "false", "no", "off"].includes(String(raw).trim().toLowerCase());
}

function readNumber(optionKey, envKey, defaultValue, min, max) {
  const raw = readPluginOption(optionKey) || env[envKey];
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return defaultValue;
  }

  return Math.min(max, Math.max(min, parsed));
}

function looksLikeMostlyCodeOrLogs(prompt) {
  const lines = prompt.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 4) {
    return false;
  }

  const codeishLines = lines.filter((line) => {
    const trimmed = line.trim();
    return (
      /^(```|import |export |const |let |var |function |class |def |SELECT |INSERT |UPDATE |DELETE )/.test(trimmed) ||
      /^[{}\[\](),.;]+$/.test(trimmed) ||
      /^\s*(at |File "|\d+\||[A-Z_]+:)/.test(line) ||
      /[{};=<>]/.test(trimmed)
    );
  });

  return codeishLines.length / lines.length >= 0.45;
}

function detectMode(prompt) {
  const chineseCount = countMatches(prompt, /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g);
  const latinCount = countMatches(prompt, /[A-Za-z]/g);

  if (chineseCount > 0 && latinCount > 0) {
    return "mixed";
  }

  if (chineseCount > 0) {
    return "chinese";
  }

  if (latinCount > 0) {
    return "english";
  }

  return "unknown";
}

function countMatches(value, regex) {
  return (value.match(regex) || []).length;
}

function buildMessages(mode, prompt) {
  const task =
    mode === "chinese"
      ? "Translate the user's Chinese Claude Code prompt into natural, concise English."
      : mode === "mixed"
        ? "Translate any Chinese text and polish the full prompt into natural English."
        : "Check the user's English Claude Code prompt for grammar, clarity, and natural wording.";

  return [
    {
      role: "system",
      content: [
        "You are a concise language tutor helping a developer write better Claude Code prompts.",
        task,
        "Do not answer or solve the user's coding request.",
        "Output Markdown only.",
        "Use this structure exactly:",
        "- Improved: one polished English version of the prompt.",
        "- Notes: up to three short bullets explaining grammar, word choice, or translation choices.",
        "If the original English is already natural, say so in Notes and keep Improved nearly identical."
      ].join("\n")
    },
    {
      role: "user",
      content: prompt
    }
  ];
}

async function callChatCompletions(config, messages) {
  const url = chatCompletionsUrl(config.baseUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: 0.2,
        max_tokens: 500
      }),
      signal: controller.signal
    });

    const body = await response.text();
    if (!response.ok) {
      throw new Error(`provider returned HTTP ${response.status}: ${truncate(body, 500)}`);
    }

    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch (error) {
      throw new Error(`provider returned invalid JSON: ${error.message}`);
    }

    const content = parsed?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      throw new Error("provider response did not include choices[0].message.content");
    }

    return content.trim();
  } finally {
    clearTimeout(timeout);
  }
}

function chatCompletionsUrl(baseUrl) {
  const trimmed = String(baseUrl || DEFAULT_BASE_URL).trim().replace(/\/+$/, "");
  if (trimmed.endsWith("/chat/completions")) {
    return trimmed;
  }

  return `${trimmed}/chat/completions`;
}

function formatFeedback(mode, content) {
  const label =
    mode === "chinese"
      ? "Chinese to English"
      : mode === "mixed"
        ? "Mixed prompt polish"
        : "English prompt feedback";

  return truncate(`Language Learning (${label})\n\n${content}`, OUTPUT_LIMIT);
}

function emitSystemMessage(message, options = {}) {
  const output = {
    systemMessage: truncate(message, OUTPUT_LIMIT),
    suppressOutput: true
  };

  if (options.injectContext) {
    output.hookSpecificOutput = {
      hookEventName: options.hookEventName || "UserPromptSubmit",
      additionalContext: truncate(
        `Language helper feedback for the submitted prompt:\n\n${message}`,
        OUTPUT_LIMIT
      )
    };
  }

  process.stdout.write(`${JSON.stringify(output)}\n`);
}

function formatError(error) {
  if (error?.name === "AbortError") {
    return "external model request timed out";
  }

  return error?.message || String(error);
}

function truncate(value, maxLength) {
  const text = String(value);
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 20)}\n\n[truncated]`;
}
