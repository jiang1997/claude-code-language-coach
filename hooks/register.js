import { buildSystemPrompt, feedbackSummary, shouldReview } from "./prompt.js";
import { buildChatRequest, chatCompletionsUrl, readFeedback } from "./provider.js";

const PANE = "language-coach";

// The Mods analyser follows API calls in top-level helpers in this module.
async function review($, text, config) {
  if (!config.apiKey) {
    const reply = await $.model.complete({
      model: "haiku",
      system: buildSystemPrompt(config.target, config.source),
      prompt: text,
      maxTokens: 1600,
      timeoutMs: 30000
    });
    if (!reply.isAnswered) throw new Error(`Haiku review unavailable (${reply.reason}).`);
    if (!reply.text?.trim()) throw new Error("Haiku returned an empty review.");
    return reply.text.trim().slice(0, 9500);
  }
  if (!config.model) throw new Error("Configure the Language Coach model in /plugin.");
  const url = chatCompletionsUrl(config.baseUrl);
  let timeout;
  try {
    const request = $.http.fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify(buildChatRequest(text, config.model, config.target, config.source))
    }).catch(() => {
      throw new Error("API request failed. Check your provider URL, credentials, and network.");
    });
    // http.fetch has no abort/timeout option. Bound the UI wait with a Mods timer;
    // the host request may finish later, but its response is no longer displayed.
    const expired = new Promise((_resolve, reject) => {
      timeout = $.clock.after(30000, () => reject(new Error("API request timed out after 30 seconds.")));
    });
    return readFeedback(await Promise.race([request, expired]));
  } finally {
    timeout?.cancel();
  }
}

export function register(on, options = {}) {
  const config = {
    target: String(options.target_language || "English"),
    source: String(options.source_language || ""),
    apiKey: String(options.api_key || "").trim(),
    baseUrl: String(options.base_url || "https://api.openai.com/v1").trim(),
    model: String(options.model || "gpt-4o-mini").trim()
  };
  let enabled = options.enabled !== false;
  let interactive = false;
  let draws = false;
  let generation = 0;
  let timer;
  let latest;

  // Invalidates in-flight reviews too: a late reply cannot replace a newer one.
  function reset() {
    generation += 1;
    timer?.cancel();
    timer = undefined;
    latest = undefined;
  }

  on("session.start", async ($, e, next) => {
    interactive = e.isInteractive;
    draws = e.surface === "terminal" || e.surface === "desktop";
    await $.command.register({
      name: "coach",
      description: "View language feedback, or turn coaching on/off",
      argumentHint: "[on|off|clear]",
      immediate: true
    });
    return next(e);
  });

  on("prompt.submit", async ($, e, next) => {
    // Automatic turns and non-interactive runs should not spend coaching tokens.
    if (!interactive || !["composer", "bridge"].includes(e.origin.kind)) return next(e);
    reset();
    const ticket = generation;
    $.ui.invalidate("ui.render");
    const result = await next(e);
    if (result.drop || ticket !== generation || !enabled || !shouldReview(e.text)) return result;

    latest = { original: e.text, pending: true, feedback: "", error: "" };
    $.ui.invalidate("ui.render");
    // The timer callback runs outside prompt.submit, so the coding turn proceeds.
    timer = $.clock.after(1, async () => {
      timer = undefined;
      try {
        const feedback = await review($, e.text, config);
        if (ticket !== generation) return;
        latest = { original: e.text, pending: false, feedback, error: "" };
        if (!draws) $.ui.log(`Language Coach (${config.target})\n${feedback}`);
      } catch (error) {
        if (ticket !== generation) return;
        const message = error instanceof Error ? error.message : String(error);
        latest = { original: e.text, pending: false, feedback: "", error: message.slice(0, 1000) };
        $.ui.log(`Language Coach: ${latest.error}`);
      }
      $.ui.invalidate("ui.render");
    });
    return result;
  });

  on("command.run", { command: "coach" }, async ($, e) => {
    const action = e.args.trim();
    if (action === "on" || action === "off") {
      enabled = action === "on";
      if (!enabled) reset();
      $.ui.log(`Language coaching ${enabled ? "enabled" : "paused"} for this session.`);
      $.ui.invalidate("ui.render");
    } else if (action === "clear") {
      reset();
      $.ui.invalidate("ui.render");
    } else if (action) {
      $.ui.log("Usage: /coach [on|off|clear]");
    } else if (draws) {
      await $.ui.open({ id: PANE, title: "Language Coach", focus: true, closeOnEscape: true });
    } else {
      $.ui.log(latest?.feedback || latest?.error || (latest?.pending ? "Checking your prompt…" : "No language feedback yet."));
    }
    // Command output text would enter Claude's context. UI-only output does not.
    return {};
  });

  on("ui.render", { component: "AbovePrompt" }, async ($, e, next) => {
    const other = await next(e);
    if (!latest) return other;
    const { Box, Text, Button } = $.ui.resolve(e);
    const summary = latest.pending ? "Checking your prompt…" : latest.error || feedbackSummary(latest.feedback);
    return Box({
      flexDirection: "column",
      children: [
        ...(other ? [other] : []),
        Text({ children: [`Language Coach · ${config.target}: ${summary}`] }),
        Button({
          key: "coach-details",
          label: "View feedback (/coach)",
          onPress: async () => {
            await $.ui.open({ id: PANE, title: "Language Coach", focus: true, closeOnEscape: true });
          }
        })
      ]
    });
  });

  on("ui.render", { component: "Pane" }, async ($, e, next) => {
    if (e.requestId !== PANE) return next(e);
    const { Box, Text, Markdown, Button } = $.ui.resolve(e);
    return Box({
      flexDirection: "column",
      rowGap: 1,
      children: [
        Text({ children: [`${config.target}${config.source ? ` · back-translation: ${config.source}` : ""} · ${enabled ? "on" : "paused"}`] }),
        ...(latest ? [Text({ children: [`Your prompt:\n${latest.original}`] })] : []),
        latest?.feedback
          ? Markdown({ text: latest.feedback })
          : Text({ children: [latest?.error || (latest?.pending ? "Checking your prompt…" : "Submit a prompt to receive language feedback.")] }),
        Button({ key: "coach-close", label: "Close", onPress: async () => { await $.ui.close({ id: PANE }); } })
      ]
    });
  });

  on("session.end", async ($, e, next) => {
    reset();
    $.ui.invalidate("ui.render");
    return next(e);
  });
}
