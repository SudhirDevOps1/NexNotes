/**
 * Conventional Commits enforcement — runs locally via the husky commit-msg
 * hook and keeps the release cutter's changelog categories meaningful.
 *
 * Types cut-release.mjs maps to changelog sections: feat, fix, security, perf.
 * Everything else lands in hidden sections or is skipped.
 */
const config = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // "security" is not part of stock config-conventional — we use it for
    // vulnerability fixes so they surface under the Security section.
    "type-enum": [
      2,
      "always",
      [
        "feat",
        "fix",
        "perf",
        "refactor",
        "docs",
        "security",
        "chore",
        "ci",
        "test",
        "build",
        "revert",
        "style",
      ],
    ],
  },
};

export default config;
