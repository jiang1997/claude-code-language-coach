# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a monorepo containing two Claude Code plugins that provide language coaching (grammar checking, translation, and back-translation) for user prompts. Both plugins share the same core logic but deliver feedback differently:

- **`plugins/language-coach/`** — Original version. Blocking inline system message before each Claude response.
- **`plugins/language-coach-statusline/`** — Non-blocking version. Writes feedback to a file-based cache; a separate statusline script reads and renders it in the CLI footer.

## Development Commands

There is no build step. The project uses pure Node.js (>=18) with no dependencies.

**Run all tests:**
```bash
cd plugins/language-coach && node --test
cd plugins/language-coach-statusline && node --test
```

**Run a single test file:**
```bash
cd plugins/language-coach && node --test test/language-helper.test.js
cd plugins/language-coach-statusline && node --test test/language-helper.test.js
```

**Lint:**
```bash
cd plugins/language-coach && npm run lint
cd plugins/language-coach-statusline && npm run lint
```

**Syntax check a script:**
```bash
node --check plugins/language-coach/scripts/language-core.js
```

**Test a plugin locally with Claude Code:**
```bash
claude --plugin-dir ./plugins/language-coach
claude --plugin-dir ./plugins/language-coach-statusline
```

## Architecture

### Shared Core (Duplicated, Not Extracted)

`language-core.js` is **intentionally duplicated** in both plugin directories. It is kept in sync by `plugins/language-coach/test/shared-core-sync.test.js`, which `assert.equal`s the two files. When modifying core logic, edit both copies and run the sync test to verify.

The core exports `runLanguageCoach(options)` which orchestrates:
1. Reading hook input (JSON via stdin)
2. Filtering (skip slash commands, code/log prompts, disabled state)
3. Reading plugin config from `CLAUDE_PLUGIN_OPTION_*` env vars
4. Calling an external LLM API (OpenAI-compatible)
5. Formatting and emitting feedback

### The Extension Point: `emitSystemMessage`

`runLanguageCoach` accepts an `options.emitSystemMessage(message, context)` callback. This is how the two plugins share logic while delivering differently:

- **Original plugin** (`language-helper.js`): Emits a JSON object with `systemMessage` and `suppressOutput: true` to stdout. Claude Code renders it inline.
- **Statusline plugin** (`language-helper.js`): Writes the message to a per-session cache file (via `statusline-cache.js`) and emits `suppressOutput: true` only. The separate `language-statusline.js` script (run by the user's `settings.json` statusline config) reads the cache and renders formatted ANSI output.

The statusline plugin also uses `options.createContext(input)` to extract/cache the `session_id` for cache key generation.

### Hook Configuration

Each plugin's `hooks/hooks.json` declares when the hook runs (`UserPromptSubmit`) and how:
- Original: `"timeout": 305` (seconds), no `async` flag — blocks Claude's response.
- Statusline: `"timeout": 305`, `"async": true` — runs in background, non-blocking.

### Cache System (Statusline Only)

Feedback is cached in `os.tmpdir()/claude-language-coach/<sanitized-session-id>.txt`. Files older than 5 minutes are cleaned up on every write. The statusline renderer skips stale entries by checking the ISO timestamp in the first line of the cache file.

### Code/Log Detection

`looksLikeMostlyCodeOrLogs()` in `language-core.js` uses heuristic regexes to skip prompts that appear to be code snippets or stack traces. Be careful when modifying these heuristics — overly broad patterns can cause legitimate language prompts to be silently skipped.

## Plugin Configuration

User-facing options are declared in `.claude-plugin/plugin.json` (for the marketplace UI) and read at runtime from environment variables:
- `CLAUDE_PLUGIN_OPTION_api_key` / `CLAUDE_PLUGIN_OPTION_API_KEY`
- `CLAUDE_PLUGIN_OPTION_model` / `CLAUDE_PLUGIN_OPTION_MODEL`
- `CLAUDE_PLUGIN_OPTION_base_url` / `CLAUDE_PLUGIN_OPTION_BASE_URL`
- `CLAUDE_PLUGIN_OPTION_target_language` / `CLAUDE_PLUGIN_OPTION_TARGET_LANGUAGE`
- `CLAUDE_PLUGIN_OPTION_source_language` / `CLAUDE_PLUGIN_OPTION_SOURCE_LANGUAGE`

Fallback env vars: `LC_HELPER_*`, `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL`.

## Key Files by Concern

| Concern | File(s) |
|---|---|
| Shared core logic (both plugins) | `plugins/*/scripts/language-core.js` |
| Original plugin entry point | `plugins/language-coach/scripts/language-helper.js` |
| Statusline plugin entry point | `plugins/language-coach-statusline/scripts/language-helper.js` |
| Cache read/write + cleanup | `plugins/language-coach-statusline/scripts/statusline-cache.js` |
| Statusline renderer (ANSI output) | `plugins/language-coach-statusline/scripts/language-statusline.js` |
| Core sync verification | `plugins/language-coach/test/shared-core-sync.test.js` |
| Plugin manifest (marketplace) | `plugins/*/.claude-plugin/plugin.json` |
| Hook definitions | `plugins/*/hooks/hooks.json` |
