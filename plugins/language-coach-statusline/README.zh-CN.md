[English](./README.md) | **简体中文**

# Claude Code 语言教练 (状态栏版) 插件

本插件以后台运行的方式，针对你的提示词给出语言反馈。

- 如果你的提示词本身就是目标语言，插件会检查语法并建议更自然的表达。
- 如果你的提示词是其他语言，插件会将其翻译成简洁的目标语言提示词。

**插件以非阻塞模式运行**：当你提交提示词后，反馈会在几秒后显示在 CLI 状态栏中，而不会阻塞 Claude 的响应。这些建议在状态栏中可见，但不会注入到 Claude 的上下文中。

![Language Coach 在 Claude Code 中的截图](./assets/screenshot.png)

## 安装

在 Claude Code 中添加 marketplace 并安装插件：

```text
/plugin marketplace add jiang1997/claude-code-language-coach
/plugin install language-coach-statusline@language-coach
```

## 配置

启用插件时，Claude Code 会提示你填写必填项：

- `api_key`：兼容 OpenAI 接口的 API 密钥
- `base_url`：服务商的 base URL，例如 `https://api.openai.com/v1`
- `model`：该服务商支持的模型名称

安装完成后，可以在插件管理器（`/plugin` → Installed → Language Coach Statusline）中调整以下可选配置：

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

## 状态栏配置

为了看到反馈，你必须将渲染脚本添加到你的个人 `~/.claude/settings.json` 中。

1. 找到渲染脚本的绝对路径：

   ```sh
   find ~/.claude/plugins -name language-statusline.js 2>/dev/null | head -1
   ```

2. 在你的 `~/.claude/settings.json` 中加入 `statusLine` 配置：

   ```json
   {
     "statusLine": {
       "type": "command",
       "command": "node /绝对路径/to/scripts/language-statusline.js",
       "refreshInterval": 3
     }
   }
   ```

如果你已经有自定义的 `statusLine`，可以用一个包装脚本把多个组合起来——只会有一个顶层 `statusLine` 生效。

## 环境要求

- Node.js 18 或更高版本（hook 使用全局 `fetch` API）

## 隐私

本 hook 会在 Claude 处理之前，将每条匹配的提示词发送到你配置的外部服务。插件会跳过看起来像大段代码或日志的提示词，但除非你信任所配置的服务商，否则请避免在涉及敏感内容的提示词上使用本插件。
