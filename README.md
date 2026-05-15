# Claude Code Language Learning Plugin

This Claude Code plugin gives prompt-level language feedback before Claude processes your message.

- If your prompt is in English, it checks grammar and suggests a more natural version.
- If your prompt is in Chinese, it translates it into a concise Claude Code prompt in your chosen target language (English by default).
- If your prompt mixes Chinese and English, it translates and polishes the full prompt.

Feedback is shown through a hook `systemMessage` by default. That means the suggestions are visible in Claude Code but are not inserted into Claude's model context. Enable `inject_context` only if you want Claude to also receive the language feedback.

## Files

- `.claude-plugin/plugin.json`: plugin metadata and user configuration
- `hooks/hooks.json`: `UserPromptSubmit` hook registration
- `scripts/language-helper.js`: OpenAI-compatible API client and language feedback logic
- `test/language-helper.test.js`: local test harness with a mock OpenAI-compatible server

## Configure

When enabling the plugin, Claude Code prompts for:

- `api_key`: API key for your OpenAI-compatible provider
- `base_url`: provider base URL, for example `https://api.openai.com/v1`
- `model`: model name accepted by that provider
- `inject_context`: default `false`; keep this off if you do not want feedback added to Claude context
- `timeout_ms`: request timeout, default `12000`
- `max_prompt_chars`: skip prompts longer than this, default `4000`
- `target_language`: the language to translate into or check against, default `English`

For local development or non-interactive testing, the hook also accepts environment variables:

```sh
export LL_HELPER_API_KEY="..."
export LL_HELPER_BASE_URL="https://api.openai.com/v1"
export LL_HELPER_MODEL="gpt-4o-mini"
```

The script also recognizes `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_API_BASE`, `OPENAI_MODEL`, and `DASHSCOPE_API_KEY`.

## Install

From the GitHub repository:

```sh
claude plugin install https://github.com/jiang1997/claude-code-language-learning.git
```

Then enable it inside Claude Code:

```text
/plugin
```

## Try Locally

For development, run Claude Code from this directory so it loads the plugin directly:

```sh
claude --plugin-dir "$PWD"
```

Then enable or reload the plugin from Claude Code:

```text
/plugin
/reload-plugins
```

## Run Tests

```sh
node test/language-helper.test.js
claude plugin validate .
```

## Privacy

This hook sends each handled prompt to the configured external model provider before Claude processes it. Prompts that look like long code blocks or logs are skipped, but you should still avoid using the plugin with sensitive prompts unless you trust the configured provider.
