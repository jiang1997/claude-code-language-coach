#!/usr/bin/env node

"use strict";

const { runLanguageCoach } = require("./language-core");
const {
  sanitizeSessionId,
  writeFeedbackCache
} = require("./statusline-cache");

runLanguageCoach({
  createContext(input) {
    return {
      cacheKey: sanitizeSessionId(input.session_id)
    };
  },
  emitSystemMessage(message, context = {}) {
    if (context.cacheKey) {
      writeFeedbackCache(context.cacheKey, message);
    }

    // In non-blocking mode, feedback is rendered via the statusline.
    // We suppress the system message output to avoid duplicate or delayed inline feedback.
    const output = {
      suppressOutput: true
    };

    process.stdout.write(`${JSON.stringify(output)}\n`);
  }
});
