"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  parseMarkdownSections,
  getHistoryPath,
  appendHistory,
  readHistory,
  buildMessages
} = require("../scripts/language-core");

// --- parseMarkdownSections tests ---

test("parseMarkdownSections extracts improved and source", () => {
  const content = `- Improved: Write a function to sort an array.
- Alternative: How can I sort an array efficiently?
- Source: 帮我写一个排序数组的函数。
- Notes: Added clarity.`;

  const result = parseMarkdownSections(content);
  assert.equal(result.improved, "Write a function to sort an array.");
  assert.equal(result.source, "帮我写一个排序数组的函数。");
});

test("parseMarkdownSections handles missing source", () => {
  const content = `- Improved: Write a function.
- Notes: Simple fix.`;

  const result = parseMarkdownSections(content);
  assert.equal(result.improved, "Write a function.");
  assert.equal(result.source, "");
});

test("parseMarkdownSections handles multiline improved", () => {
  const content = `- Improved: Write a function
  that sorts an array in place.
- Alternative: Another way.`;

  const result = parseMarkdownSections(content);
  assert.equal(result.improved, "Write a function\n  that sorts an array in place.");
  assert.equal(result.source, "");
});

test("parseMarkdownSections handles empty content", () => {
  const result = parseMarkdownSections("");
  assert.equal(result.improved, "");
  assert.equal(result.source, "");
});

// --- History file I/O tests ---

function withTempHistoryDir(fn) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lc-test-"));
  const originalPluginRoot = process.env.CLAUDE_PLUGIN_ROOT;
  process.env.CLAUDE_PLUGIN_ROOT = tmpDir;

  try {
    const historyPath = getHistoryPath();
    if (fs.existsSync(historyPath)) {
      fs.unlinkSync(historyPath);
    }
    fn(tmpDir);
  } finally {
    process.env.CLAUDE_PLUGIN_ROOT = originalPluginRoot;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

test("appendHistory creates file and readHistory returns records", () => {
  withTempHistoryDir(() => {
    appendHistory({ input: "hello", improved: "Hello", source: "" });
    appendHistory({ input: "world", improved: "World", source: "世界" });

    const records = readHistory(20);
    assert.equal(records.length, 2);
    assert.equal(records[0].input, "hello");
    assert.equal(records[1].input, "world");
    assert.equal(records[1].source, "世界");
  });
});

test("readHistory returns empty array when file does not exist", () => {
  withTempHistoryDir(() => {
    const records = readHistory(20);
    assert.deepEqual(records, []);
  });
});

test("readHistory limits to N most recent records", () => {
  withTempHistoryDir(() => {
    for (let i = 0; i < 5; i++) {
      appendHistory({ input: String(i), improved: String(i), source: "" });
    }

    const records = readHistory(3);
    assert.equal(records.length, 3);
    assert.equal(records[0].input, "2");
    assert.equal(records[2].input, "4");
  });
});

test("appendHistory truncates file at HISTORY_MAX_LINES", () => {
  withTempHistoryDir(() => {
    for (let i = 0; i < 105; i++) {
      appendHistory({ input: String(i), improved: String(i), source: "" });
    }

    const records = readHistory(200);
    assert.equal(records.length, 100);
    assert.equal(records[0].input, "5");
    assert.equal(records[99].input, "104");
  });
});

test("readHistory skips malformed JSON lines", () => {
  withTempHistoryDir((tmpDir) => {
    const historyPath = path.join(tmpDir, ".language-coach-history.jsonl");
    fs.writeFileSync(historyPath, '{"input":"good"}\nnot valid json\n{"input":"also good"}\n', "utf8");

    const records = readHistory(20);
    assert.equal(records.length, 2);
    assert.equal(records[0].input, "good");
    assert.equal(records[1].input, "also good");
  });
});

// --- buildMessages with history tests ---

test("buildMessages includes history context when records exist", () => {
  withTempHistoryDir(() => {
    appendHistory({
      session_id: "test",
      timestamp: new Date().toISOString(),
      input: "help me write function",
      improved: "Write a function",
      source: "帮我写函数"
    });

    const messages = buildMessages("new prompt", "English", "Chinese");
    assert.equal(messages[0].role, "system");
    assert.match(messages[0].content, /Recent prompts for context/);
    assert.match(messages[0].content, /help me write function/);
    assert.match(messages[0].content, /Write a function/);
    assert.match(messages[0].content, /帮我写函数/);
    assert.equal(messages[1].role, "user");
    assert.equal(messages[1].content, "new prompt");
  });
});

test("buildMessages omits history section when no records exist", () => {
  withTempHistoryDir(() => {
    const messages = buildMessages("new prompt", "English", "");
    assert.equal(messages[0].role, "system");
    assert.doesNotMatch(messages[0].content, /Recent prompts for context/);
  });
});
