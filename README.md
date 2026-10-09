# Language Coach for Claude Code

[English](README.md) | [简体中文](README.zh-CN.md)

A Claude Code **mod** that helps you practice languages while writing coding prompts. Submit a prompt as usual: Claude starts working immediately, while the coach checks your wording in the background.

- Correct grammar and suggest natural wording in your target language.
- Translate prompts written in another language.
- Offer an alternative phrasing and short explanations.
- Optionally back-translate the improved prompt to verify its meaning.

The original prompt reaches Claude unchanged. Coaching results stay in the UI and are not inserted into the coding conversation.

By default, coaching uses **Haiku** through your current Claude Code session. Set an API key to use an OpenAI-compatible provider instead.

## Requirements

Use **Claude Code 2.1.295 or later** (the version used for validation and automated tests). Mods require at least 2.1.287; older versions are not supported by this project.

The terminal and Desktop Code tab can show the summary and feedback pane. Other interactive clients use UI log output as a fallback. Non-interactive `claude -p` / Agent SDK runs do not automatically request coaching.

## Install

In Claude Code:

```text
/plugin marketplace add jiang1997/claude-code-language-coach
/plugin install language-coach@language-coach
```

If you previously installed `language-coach-statusline`, uninstall it and remove only its `statusLine` entry from `~/.claude/settings.json`. The marketplace now contains one plugin; both old implementations have been removed.

## Use

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

No build step or runtime npm dependencies. Claude Code loads the ES module directly.

```bash
claude --plugin-dir .
claude plugin validate --strict .claude-plugin/plugin.json
claude plugin validate --strict .
claude plugin test .
npm ci
npm run lint
```

Local loading with `--plugin-dir` works with Haiku immediately. To use an external provider, run `/plugin configure language-coach` in the session and set the API options.

Linting requires Node.js 22.13+ (22.x) or 24+. Node.js is not needed to run the installed mod.

Tests use Claude Code's native Mods test kit, mock HTTP responses, model calls, and timers, and require no sign-in or network. They validate Haiku fallback, API requests, error handling, event behavior, and element trees, rather than real provider availability, model quality, or screen layout.

## Repository layout

This is a single-plugin repository: the repository root is also the plugin root, so local development uses `claude --plugin-dir .`. The repository also hosts a marketplace with one entry whose `source` is `"./"`.

```text
claude-code-language-coach/
├── .claude-plugin/
│   ├── plugin.json          # Plugin metadata and user options
│   └── marketplace.json     # Single-plugin marketplace
├── hooks/
│   ├── hooks.json           # Declares the Mods entry module
│   ├── register.js          # Background review, commands, and UI
│   ├── prompt.js            # Tutor prompt and text helpers
│   └── provider.js          # API URL and response handling
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
