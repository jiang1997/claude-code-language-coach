"use strict";

module.exports = [
  {
    ignores: [
      "node_modules/**"
    ]
  },
  {
    files: [
      "**/*.js"
    ],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: {
        AbortController: "readonly",
        __dirname: "readonly",
        Buffer: "readonly",
        clearTimeout: "readonly",
        console: "readonly",
        fetch: "readonly",
        module: "readonly",
        process: "readonly",
        require: "readonly",
        setTimeout: "readonly"
      }
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          varsIgnorePattern: "^_"
        }
      ]
    }
  }
];
