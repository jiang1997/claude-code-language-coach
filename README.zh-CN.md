[English](./README.md) | **简体中文**

# Claude Code 语言教练插件

本 Claude Code 插件在 Claude 处理你的消息之前,提供提示词级别的语言反馈。

- 如果你的提示词已经使用所选目标语言书写,插件会检查语法并建议更自然的版本。
- 如果你的提示词使用其他语言书写,插件会将其翻译成所选目标语言下简洁的 Claude Code 提示词。

反馈通过 hook 的 `systemMessage` 显示。**这些建议在 Claude Code 中可见,但不会插入到 Claude 的模型上下文中。**

## 安装

在 Claude Code 中,添加 marketplace 并安装插件:

```text
/plugin marketplace add jiang1997/claude-code-language-coach
/plugin install language-coach@language-coach
```

## 配置

启用插件时,Claude Code 会提示输入:

- `api_key`:兼容 OpenAI 的提供方的 API key
- `base_url`:提供方的 base URL,例如 `https://api.openai.com/v1`
- `model`:该提供方支持的模型名称
- `timeout_ms`:请求超时时间,默认 `60000`
- `max_prompt_chars`:超过此长度的提示词会被跳过,默认 `4000`
- `target_language`:要翻译为或对照检查的目标语言,默认 `English`
- `source_language`:可选的母语/源语言。设置后,当你的提示词使用其他语言书写时,教练会附加一个回译到该语言的版本,默认留空

用于本地开发或非交互式测试时,hook 也接受环境变量:

```sh
export LC_HELPER_API_KEY="..."
export LC_HELPER_BASE_URL="https://api.openai.com/v1"
export LC_HELPER_MODEL="gpt-4o-mini"
```

脚本同样识别 `OPENAI_API_KEY`、`OPENAI_BASE_URL`、`OPENAI_API_BASE` 和 `OPENAI_MODEL`。

## 环境要求

- Node.js 18 或更高版本(hook 使用全局 `fetch` API)

## 隐私

本 hook 会在 Claude 处理之前,将每条经过处理的提示词发送至配置的外部模型提供方。看起来像长代码块或日志的提示词会被跳过,但除非你信任所配置的提供方,否则仍应避免在敏感提示词上使用本插件。
