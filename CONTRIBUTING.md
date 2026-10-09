# Contributing

This repository contains one Claude Code mod at the repository root. Use Claude Code 2.1.295 or later for development. There is no legacy command-hook or statusline implementation.

Run `npm run validate`, `claude plugin test .`, and `npm run lint` (after `npm ci`, with Node.js 22.13+ on 22.x or 24+). Load locally with `claude --plugin-dir .`.

The entry module is `hooks/register.js`. Keep all Mods API calls in that module: static analysis requires literal event names and calls written as `$.namespace.method`. Pure tutor prompt and text helpers live in `hooks/prompt.js`; API URL and response helpers live in `hooks/provider.js`.

Preserve these behaviors when editing: submitted prompts and main-model context are unchanged; coaching runs outside prompt submission; only user-origin interactive prompts are reviewed; newer submissions, pause, clear, and session end invalidate late results; other mods' drawings remain visible. All feedback and command notices use UI-only APIs. Do not return feedback as command `text` or inject prompt context.

Coaching uses `$.model.complete` with Haiku and the session's credentials when the API key is empty. With a key, it calls an OpenAI-compatible Chat Completions endpoint through `$.http.fetch`, using the plugin's API options. External errors do not trigger a second Haiku request. Avoid logging request headers or provider error bodies. The 30-second timer bounds how long external feedback waits; it cannot cancel the host's HTTP request.

Tests use `claude-code/testing`, stubbing HTTP requests and model calls and advancing a mock clock. Test terminal and Desktop element trees. They do not replace visual inspection in a real supported client.
