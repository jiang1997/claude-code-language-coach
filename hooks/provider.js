import { buildSystemPrompt } from "./prompt.js";

export function buildChatRequest(text, model, target, source) {
  return {
    model,
    messages: [
      { role: "system", content: buildSystemPrompt(target, source) },
      { role: "user", content: text }
    ],
    max_tokens: 1600,
    stream: false
  };
}

export function chatCompletionsUrl(baseUrl) {
  let url;
  try {
    url = new URL(baseUrl.trim());
  } catch {
    throw new Error("Set base_url to a valid HTTP or HTTPS API URL.");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("Set base_url to an HTTP or HTTPS API URL without embedded credentials.");
  }
  url.pathname = url.pathname.replace(/\/+$/, "");
  if (!url.pathname.endsWith("/chat/completions")) url.pathname += "/chat/completions";
  url.hash = "";
  return url.toString();
}

export function readFeedback(response) {
  // Provider error bodies can echo credentials or prompts. Show only the status.
  if (!response.ok) throw new Error(`Provider returned HTTP ${response.status}. Check your API settings.`);
  let body;
  try {
    body = JSON.parse(response.text);
  } catch {
    throw new Error("Provider returned invalid JSON.");
  }
  const content = body?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("Provider response is missing choices[0].message.content.");
  }
  return content.trim().slice(0, 9500);
}
