#!/usr/bin/env node

"use strict";

const {
  OUTPUT_LIMIT,
  runLanguageCoach,
  truncate
} = require("./language-core");

runLanguageCoach({
  emitSystemMessage(message) {
    const output = {
      systemMessage: truncate(message, OUTPUT_LIMIT),
      suppressOutput: true
    };

    process.stdout.write(`${JSON.stringify(output)}\n`);
  }
});
