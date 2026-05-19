# Claude Code 语言教练 多插件仓库

本仓库包含两个版本的 Claude Code 语言教练插件。

- 如果你的提示词本身就是目标语言，插件会检查语法并建议更自然的表达。
- 如果你的提示词是其他语言，插件会将其翻译成简洁的目标语言提示词。

## 版本对比

| 特性 | [原版 (推荐)](./plugins/language-coach) | [状态栏版](./plugins/language-coach-statusline) |
| :--- | :--- | :--- |
| **呈现方式** | 聊天窗口内联系统消息 | CLI 状态栏 (页脚) |
| **交互体验** | 轻微延迟 Claude 的回答 | Claude 立即回答 (后台运行) |
| **可见度** | 显著，在 Claude 回复之前显示 | 细微，在 Claude 回复过程中/之后出现 |
| **配置复杂度** | 零配置 (即装即用) | 需要手动修改 `settings.json` |

## 插件列表

### 1. [语言教练 (原版)](./plugins/language-coach) （推荐使用）
经典版本，在每个 Prompt 提交前提供阻塞式的内联反馈。

![原版插件截图](./assets/screenshot-origin.png)

**安装命令：**
```text
/plugin marketplace add jiang1997/claude-code-language-coach
/plugin install language-coach@language-coach
```

### 2. [语言教练 状态栏版](./plugins/language-coach-statusline)
非阻塞版本，通过 CLI 状态栏提供异步反馈。

![状态栏版插件截图](./assets/screenshot-statusline.png)

**安装命令：**
```text
/plugin marketplace add jiang1997/claude-code-language-coach
/plugin install language-coach-statusline@language-coach
```

**必要配置：**
安装后，你 **必须** 手动修改 `~/.claude/settings.json` 以启用状态栏显示：
```json
{
  "statusLine": {
    "type": "command",
    "command": "node /插件安装的绝对路径/scripts/language-statusline.js",
    "refreshInterval": 3
  }
}
```
*(提示：安装后可使用 `find ~/.claude/plugins -name language-statusline.js` 命令来获取绝对路径。)*

---

## 开发

由于这是一个多插件仓库，本地开发调试时必须指定具体的子目录：

**调试原版 (Original)：**
```bash
claude --plugin-dir ./plugins/language-coach
```

**调试状态栏版 (Statusline)：**
```bash
claude --plugin-dir ./plugins/language-coach-statusline
```
