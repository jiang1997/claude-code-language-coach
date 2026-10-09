# Contributing

This repository contains a Claude Code mod and a Codex hook plugin at one shared plugin root. Use Claude Code 2.1.295+ and Codex CLI 0.162.0+ for development. Client-specific manifests select separate hook configurations.

Run `npm run validate`, `npm test`, and `npm run lint` (after `npm ci`, with Node.js 22.13+ on 22.x or 24+). Load Claude Code locally with `claude --plugin-dir .`. Register the local Codex marketplace with `codex plugin marketplace add .`, inspect it with `codex plugin list --marketplace language-coach --available --json`, and install and trust its hooks explicitly when testing the interactive client.

The entry module is `hooks/register.js`. Keep all Mods API calls in that module: static analysis requires literal event names and calls written as `$.namespace.method`. Pure tutor prompt and text helpers live in `hooks/prompt.js`; API URL and response helpers live in `hooks/provider.js`.

Preserve these behaviors when editing: submitted prompts and main-model context are unchanged; coaching runs outside prompt submission; only user-origin interactive prompts are reviewed; newer submissions, pause, clear, and session end invalidate late results; other mods' drawings remain visible. All feedback and command notices use UI-only APIs. Do not return feedback as command `text` or inject prompt context.

Coaching uses `$.model.complete` with Haiku and the session's credentials when the API key is empty. With a key, it calls an OpenAI-compatible Chat Completions endpoint through `$.http.fetch`, using the plugin's API options. External errors do not trigger a second Haiku request. Avoid logging request headers or provider error bodies. The 30-second timer bounds how long external feedback waits; it cannot cancel the host's HTTP request.

Tests use `claude-code/testing`, stubbing HTTP requests and model calls and advancing a mock clock. Test terminal and Desktop element trees. They do not replace visual inspection in a real supported client.

The Codex adapter lives in `codex/`, reuses the pure helpers in `hooks/`, and returns only `systemMessage`. Never return plain stdout or `additionalContext`: they enter Codex model context. Native reviews must remain new ephemeral sessions with hooks disabled, never a resume or fork of the user's thread. Node tests cover stdin/HTTP transport, native subprocess arguments, cleanup, and per-session stale-result handling. No external credentials are needed in CI.
