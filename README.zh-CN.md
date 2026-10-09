# Claude Code 语言教练

[English](README.md) | [简体中文](README.zh-CN.md)

一个基于 Claude Code **Mods** 的语言教练插件。正常提交编程提示词，Claude 立即开始工作，教练在后台检查你的表达。

- 检查目标语言的语法，并提供更自然的表达。
- 将其他语言的提示词翻译成目标语言。
- 给出一种替代表达和简短解释。
- 可选：将改写后的提示词回译到母语，方便确认意思。

原始提示词原样传给 Claude。语言反馈只显示在界面中，不加入编程对话的模型上下文。

默认通过当前 Claude Code 会话使用 **Haiku**。填写 API key 后，改用你指定的 OpenAI 兼容服务商。

## 运行要求

使用 **Claude Code 2.1.295 或更新版本**，这是本项目验证和自动测试使用的版本。Mods 本身要求至少 2.1.287，本项目不支持旧版客户端。

终端和 Desktop 的 Code 标签页可显示摘要及反馈面板；其他交互客户端通过 UI 日志显示反馈。非交互的 `claude -p` / Agent SDK 调用不会自动请求语言检查。

## 安装

在 Claude Code 中执行：

```text
/plugin marketplace add jiang1997/claude-code-language-coach
/plugin install language-coach@language-coach
```

如果曾安装 `language-coach-statusline`，请卸载它，并从 `~/.claude/settings.json` 中仅移除该插件对应的 `statusLine` 配置。市场现在只提供一个插件，两个旧实现均已移除。

## 使用

提交提示词后，输入框上方会显示简短摘要，Claude 同时继续处理任务。点击 **View feedback** 或执行 `/coach`，查看原句、改写、替代表达、可选回译及解释。按 Esc 关闭面板。

| 命令 | 功能 |
| --- | --- |
| `/coach` | 打开最新反馈 |
| `/coach off` | 在当前会话暂停语言检查 |
| `/coach on` | 在当前会话恢复语言检查 |
| `/coach clear` | 清空反馈并忽略尚未完成的结果 |

打开 `/plugin`，选择已安装的 Language Coach，可配置语言和可选的 OpenAI 兼容服务商：

| 选项 | 默认值 | 用途 |
| --- | --- | --- |
| `target_language` | `English` | 翻译或润色的目标语言 |
| `source_language` | 空 | 可选回译语言，例如 `简体中文` |
| `api_key` | 空 | 可选服务商密钥；留空使用 Haiku，已标记为敏感配置 |
| `base_url` | `https://api.openai.com/v1` | 服务商 API 基础地址或完整 Chat Completions 地址 |
| `model` | `gpt-4o-mini` | 外部服务商的模型名称，仅在填写 API key 后使用 |
| `enabled` | `true` | 是否自动检查 |

例如：将 `base_url` 设为 `https://your-provider.example/v1`，`api_key` 设为服务商密钥，`model` 设为该服务商支持的模型名称。请包含服务商要求的 API 前缀，例如 `/v1`。插件会补上 `/chat/completions`；如果已经填写完整端点，则直接使用，并保留查询参数。也支持本地服务的 HTTP 地址。

`api_key` 留空时，插件通过 `$.model.complete` 调用 `haiku`，使用当前会话凭据和 Claude 额度。只填写 URL 或外部模型名称不会启用外部服务。清空 API key 即可切回 Haiku。

填写 API key 后，插件通过 `$.http.fetch` 发送带 Bearer API key 的非流式 Chat Completions 请求，消耗你指定服务商的额度。服务商请求失败时显示错误，不会再自动转用 Haiku。两种模式都只发送教练指令和当前提示词，不携带编程对话历史。等待上限为 30 秒，外部 HTTP 请求仍可能稍后完成。修改配置后请重新加载插件或启动新会话。原来的 `coach_model` 已替换为 `model`，仅用于外部接口。

空提示词、斜杠命令、完整的代码围栏及超过 4,000 字符的提示词会被跳过；自动通知和定时任务不触发检查。只展示最新提交的提示词的反馈，过期结果会被忽略。反馈仅保存在会话内存中，在退出、`/clear` 或 `/resume` 时清空。清空后，已经发起的 API 请求仍可能消耗服务商额度。

## 开发

无需构建或运行时 npm 依赖，Claude Code 直接加载 ES 模块。

```bash
claude --plugin-dir .
claude plugin validate --strict .claude-plugin/plugin.json
claude plugin validate --strict .
claude plugin test .
npm ci
npm run lint
```

使用 `--plugin-dir` 本地加载即可直接使用 Haiku。如需外部服务，请在会话中执行 `/plugin configure language-coach` 并填写 API 配置。

Lint 需要 Node.js 22.13+（22.x）或 24+。运行安装后的插件不需要 Node.js。

测试使用 Claude Code 原生 Mods 测试工具，模拟 HTTP 响应、模型调用和时钟，不需要登录或联网。测试验证 Haiku 回退、API 请求、错误处理、事件行为及界面元素树，不验证真实服务商的可用性、模型效果或屏幕排版。

## 仓库结构

本项目采用单插件仓库结构：仓库根目录也是插件根目录，因此本地开发使用 `claude --plugin-dir .`。仓库同时提供一个单插件市场，市场清单中的 `source` 为 `"./"`，指向仓库根目录。

```text
claude-code-language-coach/
├── .claude-plugin/
│   ├── plugin.json          # 插件元数据与用户配置
│   └── marketplace.json     # 单插件市场清单
├── hooks/
│   ├── hooks.json           # 声明 Mods 入口模块
│   ├── register.js          # 后台检查、命令和界面
│   ├── prompt.js            # 教练提示词及文本处理
│   └── provider.js          # API 地址与响应处理
├── tests/
│   └── coach.test.ts        # 原生 Mods 测试
├── .github/
│   └── workflows/
│       └── ci.yml           # Lint、校验与测试
├── README.md
├── README.zh-CN.md
├── CONTRIBUTING.md
├── LICENSE
├── .gitignore
├── package.json             # 开发命令与开发依赖
├── package-lock.json
└── eslint.config.cjs
```

插件组件与 `.claude-plugin/` 同级，清单文件放在 `.claude-plugin/` 中。只有实际使用相应组件时，才增加 `skills/`、`agents/` 等目录。开发约定见 [CONTRIBUTING.md](CONTRIBUTING.md)。

参考官方 [Mods 文档](https://code.claude.com/docs/en/plugins/mods/overview)。
