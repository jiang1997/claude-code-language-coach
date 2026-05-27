# Conversation History Context for Language Coach

## Background

The Language Coach plugin currently evaluates each prompt in isolation. It has no memory of what the user has previously asked or how their prompts have been improved over time. This means recurring mistakes, consistent expression patterns, and the user's evolving language proficiency are invisible to the coach.

This feature adds persistent conversation history so that the coach can provide more personalized feedback by seeing the user's recent prompts as context.

## Design Goals

1. **Non-intrusive**: The plugin must not modify the user's input or delay the response.
2. **Lightweight**: Minimal I/O and token overhead.
3. **Resilient**: File read/write failures must not break the plugin.
4. **Privacy-aware**: History is stored locally on the user's machine, not sent to external services.

## Chosen Approach: Simple Append + Full Read

After evaluating three approaches (see discussion below), we chose the simplest one:

- **Write**: Append one JSONL line after each successful LLM call.
- **Read**: Read the entire file, take the latest 20 records, inject into the system prompt.
- **Truncate**: If the file exceeds 100 records, rewrite it keeping only the latest 100.

**Why this approach**: The data volume is tiny (~100 JSON lines, well under 100KB). File I/O is negligible compared to the LLM call itself. Simplicity maximizes reliability.

### Alternatives Considered

| Approach | Pros | Cons |
|---|---|---|
| Dual-file rotation | No full-file rewrite on truncate | Complexity doubles; state management overhead |
| Fixed-size ring buffer | Constant file size | Complex pointer management; fragile |

## Data Format

Storage location: `${CLAUDE_PLUGIN_ROOT}/.language-coach-history.jsonl`

Each line is a JSON object with these fields:

```json
{
  "session_id": "abc123",
  "timestamp": "2026-05-27T10:30:00.000Z",
  "input": "original user prompt text",
  "improved": "polished version in target language",
  "source": "back-translation in source language (empty if not configured)"
}
```

- `session_id`: From `input.session_id` (confirmed via Claude Code hook input spec).
- `timestamp`: ISO 8601 string for potential future use (e.g., TTL cleanup).
- `input`: The raw user prompt after trimming.
- `improved`: Parsed from the LLM response markdown `Improved:` section.
- `source`: Parsed from the LLM response markdown `Source:` section (empty string when `source_language` is not configured).

## Core Flow

### 1. Write History

After the LLM returns a response and before emitting feedback:

1. Parse the markdown response to extract `Improved:` and `Source:` values.
2. Construct the JSON record.
3. Append the JSON string + newline to the history file.
4. If the file now has more than 100 lines, read all lines, keep the last 100, and rewrite the file.

All file operations are wrapped in try/catch. Any failure is silently ignored (logged to stderr in debug mode only).

### 2. Read History

In `buildMessages(prompt, targetLanguage, sourceLanguage)`:

1. Check if the history file exists. If not, skip.
2. Read the entire file, split by newline.
3. Parse each non-empty line as JSON. Skip lines that fail to parse.
4. Take the last 20 valid records (most recent).
5. If none are found, skip.

All file operations are wrapped in try/catch. Any failure results in no history being injected (graceful degradation).

### 3. Inject into System Prompt

When history records are available, append the following section to the system prompt content (before the format instructions):

```markdown
Recent prompts for context (the user's expression patterns and common mistakes):

1. "原始输入1" → Improved: "改进后1" | Source: "回译1"
2. "原始输入2" → Improved: "改进后2" | Source: ""
...
```

This gives the LLM visibility into the user's recurring patterns without changing the fundamental task description.

## Error Handling

| Scenario | Behavior |
|---|---|
| History file does not exist | Skip silently (first run or fresh install) |
| File read fails (permissions, disk error) | Skip silently; do not break the main flow |
| JSON parse fails on one line | Skip that line only; continue with other valid lines |
| File write fails | Skip silently; the current prompt still gets feedback |
| File truncate (rewrite) fails | The file may grow beyond 100 lines temporarily; next successful write will fix it |
| `CLAUDE_PLUGIN_ROOT` not set | Fallback to `os.tmpdir()` (defensive, though Claude Code always sets it) |

## File Changes

### Modified

- `plugins/language-coach/scripts/language-core.js`
- `plugins/language-coach-statusline/scripts/language-core.js` (kept in sync)

### New Functions in `language-core.js`

| Function | Purpose |
|---|---|
| `getHistoryPath()` | Resolve `${CLAUDE_PLUGIN_ROOT}/.language-coach-history.jsonl` with fallback |
| `appendHistory(record)` | Append one JSONL line; truncate if > 100 lines |
| `readHistory(limit = 20)` | Read file, parse JSONL, return last N valid records |
| `parseMarkdownSections(content)` | Extract `Improved:` and `Source:` values from LLM markdown response |

### Modified Functions

| Function | Change |
|---|---|
| `main()` | After `callChatCompletions` and `formatFeedback`, call `appendHistory` with parsed data |
| `buildMessages()` | Call `readHistory()` and inject history section into system prompt when records exist |

## Testing Considerations

1. **Unit tests for `parseMarkdownSections`**: Various markdown formats, missing sections, extra whitespace.
2. **Unit tests for `readHistory`**: Empty file, malformed JSON lines, exactly 20 records, more than 20 records.
3. **Unit tests for `appendHistory`**: New file, append to existing file, truncation at 100 lines.
4. **Integration**: Verify that `buildMessages` output includes history context when records exist.
5. **Sync test**: Ensure both copies of `language-core.js` remain identical.

## Privacy Note

History is stored locally in the plugin installation directory. It is never sent anywhere except as context to the configured LLM provider (the same provider already receiving the current prompt for review). Users who are concerned about prompt history persistence can delete `.language-coach-history.jsonl` at any time.
