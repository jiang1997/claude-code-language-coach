# Echo for Codex CLI

[English](README.md) | [简体中文](README.zh-CN.md)

The Codex adapter in this repository provides automatic grammar checks, translation, alternative phrasing, and optional back-translation. It runs as an **asynchronous `UserPromptSubmit` hook**. Your original prompt reaches Codex unchanged, and feedback is returned only as `systemMessage`, a UI warning. No feedback is injected as model context.

## Requirements

- Codex CLI **0.162.0 or later**, the version used to verify plugin discovery and native model execution.
- Node.js **22.13+ on 22.x, or 24+**, available as `node` on PATH.
- A Codex login for native reviews, or an OpenAI-compatible API key.

Codex delivers async output at the next safe point in an active turn, or on the next user turn when idle. Feedback may therefore appear after the coding response. This adapter uses text feedback, rather than the Claude Code version's pane and `/coach` command. Hooks can also run in non-interactive Codex sessions.

## Install

```bash
codex plugin marketplace add jiang1997/Echo
codex plugin add language-coach@language-coach
codex
```

In the Codex session, open `/hooks` and review and trust the Echo hooks. Installing the plugin does not automatically trust its hooks. Restart the session after installation if it was already running.

For local development, replace the first command with `codex plugin marketplace add .`. The Codex manifest explicitly selects `codex/hooks.json`, while Claude Code continues to use `hooks/hooks.json`.

## Configure

Configuration uses environment variables inherited by the Codex process. Set them in the shell **before starting Codex**, then start a new session after changing them. Codex does not use the Claude plugin's `userConfig` dialog.

| Variable | Default | Purpose |
| --- | --- | --- |
| `LANGUAGE_COACH_ENABLED` | `true` | Set `false`, `off`, `no`, or `0` to pause coaching |
| `LANGUAGE_COACH_TARGET_LANGUAGE` | `English` | Target language |
| `LANGUAGE_COACH_SOURCE_LANGUAGE` | empty | Optional back-translation language |
| `LANGUAGE_COACH_API_KEY` | `OPENAI_API_KEY`, otherwise empty | Key for an external provider; explicitly set empty to force native Codex |
| `LANGUAGE_COACH_BASE_URL` | `OPENAI_BASE_URL`, otherwise `https://api.openai.com/v1` | API prefix or full `/chat/completions` URL |
| `LANGUAGE_COACH_MODEL` | `gpt-4o-mini` | External provider model |
| `LANGUAGE_COACH_CODEX_MODEL` | Current model from the hook input | Optional model override for native Codex reviews |

For native coaching with Chinese back-translation:

```bash
export LANGUAGE_COACH_API_KEY=""
export LANGUAGE_COACH_SOURCE_LANGUAGE="简体中文"
codex
```

For an external provider:

```bash
export LANGUAGE_COACH_API_KEY="your-provider-key"
export LANGUAGE_COACH_BASE_URL="https://your-provider.example/v1"
export LANGUAGE_COACH_MODEL="your-provider-model"
codex
```

The provider URL must include its required API prefix. Full endpoints and query parameters are supported. External requests use Bearer authentication and non-streaming Chat Completions. Provider failures produce a UI error rather than a second native request.

## Native model and context isolation

Without an API key, the coach launches a fresh `codex exec --ephemeral` session using the existing Codex login and the current model, or `LANGUAGE_COACH_CODEX_MODEL`. It never resumes or forks the coding conversation. The child session runs in a temporary directory with tutor instructions, a read-only sandbox, and hooks, plugins, apps, shell, multi-agent, browser, computer use, image generation, and memories disabled. Project instructions and user configuration are excluded. Only the submitted prompt is sent on stdin; temporary tutor and feedback files are removed afterward.

Authentication remains available with `--ignore-user-config`, but custom model-provider definitions and project settings are not inherited. If your current model depends on a custom provider, use the external API settings or choose a model available through your Codex login.

Native reviews use your Codex quota; external reviews use your provider's quota. Each request has a 30-second limit. Blank prompts, slash commands, full fenced code blocks, and prompts over 4,000 characters are skipped. Per-session generation markers under `PLUGIN_DATA` (or an OS temporary directory for direct execution) suppress outdated feedback. These markers contain no prompts or keys. `SessionEnd` removes the marker and invalidates pending feedback; clearing it does not cancel an already-running provider request.

Disable the plugin or its hooks in Codex to stop automatic reviews, or restart Codex with `LANGUAGE_COACH_ENABLED=false`.

## Development

```bash
npm ci
npm run test:codex
npm run lint
codex plugin marketplace add .
codex plugin list --marketplace language-coach --available --json
```

Node tests cover routing, context-only UI output, subprocess isolation and cleanup, timeouts, stale feedback, and a real stdin/HTTP round-trip to a local fixture. They require no Codex login or external network. Native model execution was additionally smoke-tested with the installed Codex CLI.

See the official [Hooks documentation](https://learn.chatgpt.com/docs/hooks) and [non-interactive mode documentation](https://learn.chatgpt.com/docs/non-interactive-mode).
