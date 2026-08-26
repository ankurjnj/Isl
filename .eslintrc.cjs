/**
 * Aangan lint rules.
 *
 * Two of these rules are product guardrails, not style preferences — they are
 * called out explicitly in the spec (Part 2 §1, Part 6 §6.3, Part 7 §2 & §8):
 *
 *   1. NO AUDIO ANYWHERE. The child is deaf; the parent practises beside a
 *      sleeping child. `Audio`, `<audio>`, and `speechSynthesis` are banned.
 *   2. PURE MODULES. landmarks/ recognize/ score/ content/ store/ i18n/ carry
 *      zero React and zero DOM imports, so the eventual React Native port is
 *      cheap. Enforced with per-directory overrides below.
 */

const NO_AUDIO_SYNTAX = [
  {
    selector: "NewExpression[callee.name='Audio']",
    message:
      "No audio in Aangan (Part 2 §1 / Part 7 §2). The app is silent by design.",
  },
  {
    selector: "JSXOpeningElement[name.name='audio']",
    message: "No <audio> in Aangan (Part 2 §1 / Part 7 §2). Silent by design.",
  },
  {
    selector:
      "MemberExpression[object.name='window'][property.name='speechSynthesis']",
    message: "No speechSynthesis in Aangan (Part 2 §1 / Part 7 §2).",
  },
  {
    selector: "Identifier[name='speechSynthesis']",
    message: "No speechSynthesis in Aangan (Part 2 §1 / Part 7 §2).",
  },
];

module.exports = {
  root: true,
  ignorePatterns: ["dist", "node_modules", "*.cjs", "vite.config.ts"],
  env: { browser: true, es2021: true, node: true },
  parser: "@typescript-eslint/parser",
  parserOptions: { ecmaVersion: 2021, sourceType: "module" },
  plugins: ["@typescript-eslint", "react-hooks"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
  ],
  settings: {},
  rules: {
    "react-hooks/rules-of-hooks": "error",
    "react-hooks/exhaustive-deps": "warn",
    "no-restricted-syntax": ["error", ...NO_AUDIO_SYNTAX],
    "@typescript-eslint/no-unused-vars": [
      "error",
      { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
    ],
    "@typescript-eslint/no-explicit-any": "warn",
  },
  overrides: [
    {
      // The pure core. No React, no DOM. (Part 6 §6.3, Part 7 §8.)
      files: [
        "src/landmarks/**/*.ts",
        "src/recognize/**/*.ts",
        "src/score/**/*.ts",
        "src/content/**/*.ts",
        "src/store/**/*.ts",
        "src/i18n/**/*.ts",
      ],
      excludedFiles: ["**/*.test.ts"],
      rules: {
        "no-restricted-syntax": [
          "error",
          ...NO_AUDIO_SYNTAX,
          {
            selector:
              "MemberExpression[object.name='document'], MemberExpression[object.name='window']",
            message:
              "Pure module: no DOM access (Part 6 §6.3). Keep this layer free of React and the DOM so the React Native port stays cheap. IndexedDB access goes through Dexie only.",
          },
        ],
        "no-restricted-imports": [
          "error",
          {
            paths: [
              { name: "react", message: "Pure module: no React (Part 6 §6.3)." },
              { name: "react-dom", message: "Pure module: no React (Part 6 §6.3)." },
            ],
            patterns: [
              {
                group: ["@/ui/*", "@/vision/*"],
                message:
                  "Pure module: must not import from ui/ or vision/ (Part 6 §6.3).",
              },
            ],
          },
        ],
      },
    },
  ],
};
