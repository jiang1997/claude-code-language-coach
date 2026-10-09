# Language Coach for Claude Code and Codex CLI

[English](README.md) | [简体中文](README.zh-CN.md)

A language coach for **Claude Code Mods** and **Codex CLI plugins**. Submit a coding prompt as usual: your coding assistant starts working immediately, while the coach checks your wording in the background.

- Correct grammar and suggest natural wording in your target language.
- Translate prompts written in another language.
- Offer an alternative phrasing and short explanations.
- Optionally back-translate the improved prompt to verify its meaning.

The original prompt reaches your coding assistant unchanged. Coaching results stay in the UI and are not inserted into the coding conversation.

Without an external API key, the Claude Code adapter uses **Haiku** and the Codex adapter uses a separate temporary session with the current Codex model. Both adapters support OpenAI-compatible providers.

| Client | Feedback | Configuration | Without an external API key |
| --- | --- | --- | --- |
| Claude Code | Summary above the input and a `/coach` pane | Plugin settings | Haiku through the current session |
| Codex CLI | Background text feedback in the UI | Environment variables | Current Codex model in a separate temporary session |

## Requirements

Use **Claude Code 2.1.295 or later** (the version used for validation and automated tests). Mods require at least 2.1.287; older versions are not supported by this project.

For Codex, use **Codex CLI 0.162.0+** and Node.js **22.13+ on 22.x, or 24+**. See the [Codex guide](codex/README.md) for configuration and behavior differences.

For Claude Code, the terminal and Desktop Code tab can show the summary and feedback pane. Other interactive clients use UI log output as a fallback. Non-interactive `claude -p` / Agent SDK runs do not automatically request coaching.

## Install in Claude Code

In Claude Code:

```text
/plugin marketplace add jiang1997/claude-code-language-coach
/plugin install language-coach@language-coach
```

If you previously installed `language-coach-statusline`, uninstall it and remove only its `statusLine` entry from `~/.claude/settings.json`. The marketplace now contains one plugin; both old implementations have been removed.

## Install in Codex CLI

```bash
codex plugin marketplace add jiang1997/claude-code-language-coach
codex plugin add language-coach@language-coach
```

Start a Codex session, open `/hooks`, and review and trust the Language Coach hooks. The Codex version uses background text feedback and environment-variable configuration. Full instructions: [Codex CLI guide](codex/README.md).

## Use in Claude Code

Submit a prompt. A short summary appears above the input while Claude continues its task. Click **View feedback** or run `/coach` to see the original prompt, improved wording, an alternative, optional back-translation, and notes. Esc closes the pane.

| Command | Effect |
| --- | --- |
| `/coach` | Open the latest feedback |
| `/coach off` | Pause coaching for this session |
| `/coach on` | Resume coaching for this session |
| `/coach clear` | Clear feedback and ignore any pending result |

Open `/plugin` and select the installed Language Coach plugin to configure languages or an optional OpenAI-compatible provider:

| Option | Default | Purpose |
| --- | --- | --- |
| `target_language` | `English` | Language to translate into or improve |
| `source_language` | empty | Optional back-translation language, e.g. `简体中文` |
| `api_key` | empty | Optional provider key; leave empty to use Haiku; marked as sensitive |
| `base_url` | `https://api.openai.com/v1` | Provider API base URL or full Chat Completions URL |
| `model` | `gpt-4o-mini` | External provider model; used only when an API key is set |
| `enabled` | `true` | Enable automatic coaching |

For example, set `base_url` to `https://your-provider.example/v1`, `api_key` to your provider's key, and `model` to a model that provider supports. Include the API prefix your provider requires, such as `/v1`. The coach appends `/chat/completions` unless the URL already ends with it; query parameters are preserved. HTTP endpoints are supported for local services too.

When `api_key` is empty, the coach calls `$.model.complete` with `model: "haiku"`, using your current session's credentials and Claude quota. Setting only a URL or external model does not enable the external provider. Clear the key to return to Haiku.

When an API key is set, the coach calls your provider via `$.http.fetch`, with a Bearer API key and a non-streaming Chat Completions request, using your provider's quota. Provider failures are displayed as errors rather than retried through Haiku. Both modes send the tutor instructions and current submitted prompt, without the coding conversation's history. Requests have a 30-second wait limit; an external HTTP request may still finish later. Reload the plugin or start a new session after changing its options. The former `coach_model` option is replaced by `model`, which applies only to external requests.

Empty prompts, slash commands, complete fenced code blocks, and prompts longer than 4,000 characters are skipped. Automatic notifications and scheduled turns are not reviewed. Only the latest submitted prompt's feedback is displayed; late results are ignored. Feedback is kept in session memory and cleared on session end, `/clear`, or `/resume`. An already-started API request can still consume provider quota after its feedback is cleared.

## Development

No build step or runtime npm dependencies. Claude Code loads the ES module directly; the Codex adapter runs Node.js scripts. The clients share the tutor prompt and provider helpers.

```bash
claude --plugin-dir .
claude plugin validate --strict .claude-plugin/plugin.json
claude plugin validate --strict .
npm ci
npm test
npm run lint
```

Local loading with `--plugin-dir` works with Haiku immediately. To use an external provider, run `/plugin configure language-coach` in the session and set the API options.

Linting and Codex hooks require Node.js 22.13+ (22.x) or 24+. Node.js is not needed to run the installed Claude Code mod. Use `npm run test:claude` or `npm run test:codex` to test one adapter.

Tests use Claude Code's native Mods test kit, mock HTTP responses, model calls, and timers, and require no sign-in or network. They validate Haiku fallback, API requests, error handling, event behavior, and element trees, rather than real provider availability, model quality, or screen layout.

## Repository layout

This repository hosts two client adapters with one shared plugin root. Claude Code loads `.claude-plugin/plugin.json`; Codex loads `.codex-plugin/plugin.json`, which points to its own hook configuration. Each client has a marketplace entry pointing at the repository root. Local Claude Code development continues to use `claude --plugin-dir .`.

```text
claude-code-language-coach/
├── .claude-plugin/
│   ├── plugin.json          # Plugin metadata and user options
│   └── marketplace.json     # Claude Code marketplace
├── .codex-plugin/
│   └── plugin.json          # Codex metadata and hook selection
├── .agents/plugins/
│   └── marketplace.json     # Codex marketplace
├── hooks/
│   ├── hooks.json           # Declares the Mods entry module
│   ├── register.js          # Background review, commands, and UI
│   ├── prompt.js            # Tutor prompt and text helpers
│   └── provider.js          # API URL and response handling
├── codex/
│   ├── hooks.json           # Codex async lifecycle hooks
│   ├── coach.js             # Hook input and UI-only output
│   ├── runtime.js           # External API and isolated Codex reviews
│   ├── test/                # Node hook and transport tests
│   ├── README.md
│   └── README.zh-CN.md
├── assets/
│   └── coach.svg            # Codex plugin icon
├── tests/
│   └── coach.test.ts        # Native Mods tests
├── .github/
│   └── workflows/
│       └── ci.yml           # Lint, validation, and tests
├── README.md
├── README.zh-CN.md
├── CONTRIBUTING.md
├── LICENSE
├── .gitignore
├── package.json             # Development commands and dependencies
├── package-lock.json
└── eslint.config.cjs
```

Plugin components live alongside `.claude-plugin/`, which holds the manifests. Add directories such as `skills/` or `agents/` only when the plugin uses those components. See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines.

See the official [Mods documentation](https://code.claude.com/docs/en/plugins/mods/overview).
