"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const pluginRoot = path.resolve(__dirname, "..");
const originalCore = path.join(pluginRoot, "scripts", "language-core.js");
const statuslineCore = path.join(pluginRoot, "..", "language-coach-statusline", "scripts", "language-core.js");

test(
  "shared language core copies stay in sync",
  { skip: fs.existsSync(statuslineCore) ? false : "statusline plugin is not present" },
  () => {
    assert.equal(
      fs.readFileSync(statuslineCore, "utf8"),
      fs.readFileSync(originalCore, "utf8")
    );
  }
);
