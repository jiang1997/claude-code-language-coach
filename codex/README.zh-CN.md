# Codex CLI 语言教练

[English](README.md) | [简体中文](README.zh-CN.md)

本仓库的 Codex 适配器提供语法检查、翻译、替代表达和可选回译，通过**异步 `UserPromptSubmit` Hook** 自动运行。用户提示词原样传给 Codex，反馈只通过 `systemMessage` 显示为界面提示，不注入主模型上下文。

## 运行要求

- **Codex CLI 0.162.0 或更新版本**，这是插件发现和真实模型调用验证使用的版本。
- **Node.js 22.13+（22.x）或 24+**，`node` 命令可在 PATH 中找到。
- 原生模式需要已登录 Codex；外部模式需要 OpenAI 兼容接口的 API key。

Codex 在当前轮次的下一个安全时点交付异步反馈；会话空闲时，反馈会等到下一次用户提交。因此语言建议可能在编程回复之后出现。本版本显示文字反馈，不提供 Claude Code 版的面板和 `/coach` 命令。Hook 也可能在非交互 Codex 会话中运行。

## 安装

```bash
codex plugin marketplace add jiang1997/claude-code-language-coach
codex plugin add language-coach@language-coach
codex
```

进入 Codex 后，执行 `/hooks`，审核并信任 Language Coach 的 Hook。安装插件不会自动信任 Hook。如果安装时已有会话，请重新启动会话。

本地开发时，将第一条命令改为 `codex plugin marketplace add .`。Codex 清单明确指定 `codex/hooks.json`；Claude Code 继续使用 `hooks/hooks.json`。

## 配置

通过环境变量配置，请在**启动 Codex 前**于终端设置；修改后重新启动会话。Codex 不使用 Claude 插件的 `userConfig` 配置窗口。

| 环境变量 | 默认值 | 用途 |
| --- | --- | --- |
| `LANGUAGE_COACH_ENABLED` | `true` | 设为 `false`、`off`、`no` 或 `0` 暂停检查 |
| `LANGUAGE_COACH_TARGET_LANGUAGE` | `English` | 目标语言 |
| `LANGUAGE_COACH_SOURCE_LANGUAGE` | 空 | 可选回译语言 |
| `LANGUAGE_COACH_API_KEY` | `OPENAI_API_KEY`，否则为空 | 外部接口密钥；显式设为空可强制使用原生 Codex |
| `LANGUAGE_COACH_BASE_URL` | `OPENAI_BASE_URL`，否则为 `https://api.openai.com/v1` | API 基础地址或完整 `/chat/completions` 地址 |
| `LANGUAGE_COACH_MODEL` | `gpt-4o-mini` | 外部服务商的模型名称 |
| `LANGUAGE_COACH_CODEX_MODEL` | Hook 输入中的当前模型 | 可选的原生 Codex 模型覆盖值 |

使用原生模型，并提供中文回译：

```bash
export LANGUAGE_COACH_API_KEY=""
export LANGUAGE_COACH_SOURCE_LANGUAGE="简体中文"
codex
```

使用外部服务商：

```bash
export LANGUAGE_COACH_API_KEY="your-provider-key"
export LANGUAGE_COACH_BASE_URL="https://your-provider.example/v1"
export LANGUAGE_COACH_MODEL="your-provider-model"
codex
```

地址需要包含服务商要求的 API 前缀。支持完整端点和查询参数；请求使用 Bearer 认证及非流式 Chat Completions。服务商失败时显示错误，不会再请求原生模型。

## 原生模型与上下文隔离

没有 API key 时，教练启动新的 `codex exec --ephemeral` 会话，使用现有 Codex 登录凭据和当前模型，或 `LANGUAGE_COACH_CODEX_MODEL`。它不会恢复或分叉当前编程对话。子会话在临时目录中运行，使用教练指令和只读沙箱，关闭 Hooks、插件、应用、Shell、多代理、浏览器、电脑操作、图片生成及记忆。项目指令和用户配置不会加载，只通过 stdin 发送待检查提示词；临时指令与反馈文件在结束后删除。

`--ignore-user-config` 仍允许使用登录凭据，但不会继承自定义模型服务商和项目设置。如果当前模型依赖自定义服务商，请使用外部 API 配置，或指定你的 Codex 登录账号可用的模型。

原生检查消耗 Codex 额度，外部检查消耗服务商额度，每次等待上限为 30 秒。空提示词、斜杠命令、完整代码围栏及超过 4,000 字符的提示词会被跳过。过期反馈通过 `PLUGIN_DATA` 中的会话标记过滤；直接运行脚本时则使用系统临时目录。标记不包含提示词或密钥。`SessionEnd` 会清理标记并忽略未完成结果；清理不会取消已经发起的服务商请求。

可在 Codex 中禁用插件或 Hook，或者设置 `LANGUAGE_COACH_ENABLED=false` 后重启 Codex，以停止自动检查。

## 开发

```bash
npm ci
npm run test:codex
npm run lint
codex plugin marketplace add .
codex plugin list --marketplace language-coach --available --json
```

Node 测试覆盖后端选择、仅输出界面反馈、子进程隔离与清理、超时、过期结果，以及使用本地模拟 HTTP 服务的真实 stdin/网络往返，不需要 Codex 登录或外部网络。另已通过本机 Codex CLI 验证真实原生模型调用。

参考官方 [Hooks 文档](https://learn.chatgpt.com/docs/hooks) 和 [非交互模式文档](https://learn.chatgpt.com/docs/non-interactive-mode)。
