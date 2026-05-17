[English](./README.md) | **简体中文**

# Claude Code 语言教练插件

本插件会在 Claude 处理你的消息之前，针对你的提示词给出语言反馈。

- 如果你的提示词本身就是目标语言，插件会检查语法并建议更自然的表达。
- 如果你的提示词是其他语言，插件会将其翻译成简洁的目标语言提示词。

反馈会通过 hook 的 `systemMessage` 显示。**这些建议在 Claude Code 中可见，但不会注入到 Claude 的上下文里。**

## 安装

在 Claude Code 中添加 marketplace 并安装插件：

```text
/plugin marketplace add jiang1997/claude-code-language-coach
/plugin install language-coach@language-coach
```

## 配置

启用插件时，Claude Code 会提示你填写以下配置：

- `api_key`：兼容 OpenAI 接口的 API 密钥
- `base_url`：服务商的 base URL，例如 `https://api.openai.com/v1`
- `model`：该服务商支持的模型名称
- `timeout_ms`：请求超时时间，默认 `60000`
- `max_prompt_chars`：超过此长度的提示词会被跳过，默认 `4000`
- `target_language`：目标语言，用于翻译或语法检查，默认 `English`
- `source_language`：可选，你的母语或常用源语言。设置后，当你用其他语言提交提示词时，教练会在建议中附上一份回译（目标语言 → 你的源语言），方便你确认翻译结果是否准确。默认留空

在本地开发或非交互式测试时，也可以通过环境变量配置：

```sh
export LC_HELPER_API_KEY="..."
export LC_HELPER_BASE_URL="https://api.openai.com/v1"
export LC_HELPER_MODEL="gpt-4o-mini"
```

脚本同样会识别 `OPENAI_API_KEY`、`OPENAI_BASE_URL`、`OPENAI_API_BASE` 和 `OPENAI_MODEL`。

## 环境要求

- Node.js 18 或更高版本（hook 使用全局 `fetch` API）

## 隐私

本 hook 会在 Claude 处理之前，将每条匹配的提示词发送到你配置的外部服务。插件会跳过看起来像大段代码或日志的提示词，但除非你信任所配置的服务商，否则请避免在涉及敏感内容的提示词上使用本插件。
