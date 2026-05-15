#!/usr/bin/env node

"use strict";

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_TIMEOUT_MS = 60000;
const DEFAULT_MAX_PROMPT_CHARS = 4000;
const DEFAULT_TARGET_LANGUAGE = "English";
const OUTPUT_LIMIT = 9500;

const env = process.env;

main().catch((error) => {
  emitSystemMessage(`Language Coach hook failed: ${formatError(error)}`);
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
      "Language Coach plugin is not configured: set the plugin API key or LL_HELPER_API_KEY."
    );
    return;
  }

  if (!config.model) {
    emitSystemMessage(
      "Language Coach plugin is not configured: set the plugin model or LL_HELPER_MODEL."
    );
    return;
  }

  const content = await callChatCompletions(config, buildMessages(prompt, config.targetLanguage));
  const message = formatFeedback(content, config.targetLanguage);
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
    ),
    targetLanguage:
      readPluginOption("target_language") ||
      env.LL_HELPER_TARGET_LANGUAGE ||
      DEFAULT_TARGET_LANGUAGE
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

function buildMessages(prompt, targetLanguage) {
  const target = targetLanguage || DEFAULT_TARGET_LANGUAGE;

  return [
    {
      role: "system",
      content: [
        `You are a concise language tutor helping a developer write better Claude Code prompts in ${target}.`,
        `If the user's prompt is already in ${target}, check it for grammar, clarity, and natural wording.`,
        `If the user's prompt is in another language, translate it into natural, concise ${target}.`,
        "Do not answer or solve the user's coding request.",
        "Output Markdown only.",
        "Use this structure exactly:",
        `- Improved: one polished version of the prompt in ${target}.`,
        "- Notes: up to three short bullets explaining grammar, word choice, or translation choices.",
        `If the original prompt is already natural ${target}, say so in Notes and keep Improved nearly identical.`
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
        max_tokens: 4096
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
      throw new Error(
        `provider response missing content. choices[0].message=${JSON.stringify(parsed?.choices?.[0]?.message)} body=${truncate(body, 800)}`
      );
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

function formatFeedback(content, targetLanguage) {
  const target = targetLanguage || DEFAULT_TARGET_LANGUAGE;
  return truncate(`Language Coach (${target} prompt feedback)\n\n${content}`, OUTPUT_LIMIT);
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
