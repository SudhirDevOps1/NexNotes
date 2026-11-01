"use client";

/**
 * v2.1 — extra Prism grammars for prism-react-renderer.
 *
 * prism-react-renderer bundles a Prism core with a limited language set.
 * The classic prismjs grammar files attach themselves to a global `Prism`
 * variable, so we expose the bundled instance under that name BEFORE loading
 * them. Everything is bundled & self-hosted — no CDN requests (privacy-first).
 */
import { Prism } from "prism-react-renderer";

if (typeof window !== "undefined" || typeof globalThis !== "undefined") {
  /* works in the browser (globalThis === window) and on the server during
   * SSR of client components — keeps share-page markup identical on both. */
  const g = globalThis as unknown as Record<string, unknown>;
  if (!g.Prism) {
    g.Prism = Prism;
    /* eslint-disable @typescript-eslint/no-require-imports */
    require("prismjs/components/prism-markup-templating"); // php dependency
    require("prismjs/components/prism-rust");
    require("prismjs/components/prism-csharp");
    require("prismjs/components/prism-java");
    require("prismjs/components/prism-kotlin");
    require("prismjs/components/prism-swift");
    require("prismjs/components/prism-php");
    require("prismjs/components/prism-ruby");
    require("prismjs/components/prism-dart");
    require("prismjs/components/prism-lua");
    /* eslint-enable @typescript-eslint/no-require-imports */
  }
}

/** v2.1 — Prisma schema grammar (prismjs ships none; hand-written, simple). */
if (!(Prism.languages as Record<string, unknown>).prisma) {
  Prism.languages.prisma = {
    comment: { pattern: /\/\/.*|\/\*[\s\S]*?\*\//, greedy: true },
    "block-string": { pattern: /"""[\s\S]*?"""/, greedy: true, alias: "string" },
    string: { pattern: /"(?:[^"\\\r\n]|\\.)*"|'(?:[^'\\\r\n]|\\.)*'/, greedy: true },
    keyword: /\b(?:model|enum|datasource|generator|previewFeatures)\b/,
    builtin:
      /\b(?:String|Int|BigInt|Float|Decimal|Boolean|DateTime|Json|Bytes)\b/,
    function: /@@?[A-Za-z_]\w*(?=\s*[({])/,
    boolean: /\b(?:true|false|null)\b/,
    number: /\b\d+(?:\.\d+)?\b/,
    operator: /[=??]/,
    punctuation: /[{}()[\],;:]/,
  };
  (Prism.languages as Record<string, unknown>)["prisma"] = Prism.languages.prisma;
}

export {};
