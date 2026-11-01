"use client";

/**
 * v2.1 — NexNotes Prism-powered code block.
 *
 * Syntax highlighting via prism-react-renderer (self-hosted, no CDN). Adds a
 * language badge, one-click copy, line-number toggle and word-wrap toggle, and
 * follows the app light/dark theme. Also ships a heuristic language detector
 * for unlabeled code and a device-local per-note language store for code notes
 * (privacy-first: the language never leaves the device).
 */
import React, { useEffect, useState } from "react";
import { Highlight, Prism, themes } from "prism-react-renderer";
import { useTheme } from "next-themes";
import { Check, ChevronDown, Copy, List, WrapText } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import "@/lib/prism-langs";

/* ------------------------------------------------------------------ */
/* language catalogue                                                   */
/* ------------------------------------------------------------------ */

export const CODE_LANGS: { id: string; label: string }[] = [
  { id: "", label: "Auto-detect" },
  { id: "typescript", label: "TypeScript" },
  { id: "javascript", label: "JavaScript" },
  { id: "tsx", label: "TSX / React" },
  { id: "jsx", label: "JSX / React" },
  { id: "python", label: "Python" },
  { id: "prisma", label: "Prisma Schema" },
  { id: "sql", label: "SQL" },
  { id: "json", label: "JSON" },
  { id: "yaml", label: "YAML" },
  { id: "markup", label: "HTML / XML" },
  { id: "css", label: "CSS" },
  { id: "scss", label: "SCSS" },
  { id: "bash", label: "Shell / Bash" },
  { id: "go", label: "Go" },
  { id: "rust", label: "Rust" },
  { id: "java", label: "Java" },
  { id: "csharp", label: "C#" },
  { id: "cpp", label: "C / C++" },
  { id: "c", label: "C" },
  { id: "kotlin", label: "Kotlin" },
  { id: "swift", label: "Swift" },
  { id: "php", label: "PHP" },
  { id: "ruby", label: "Ruby" },
  { id: "dart", label: "Dart / Flutter" },
  { id: "lua", label: "Lua" },
  { id: "objectivec", label: "Objective-C" },
  { id: "markdown", label: "Markdown" },
  { id: "graphql", label: "GraphQL" },
  { id: "docker", label: "Dockerfile" },
  { id: "diff", label: "Diff / Patch" },
  { id: "toml", label: "TOML" },
  { id: "ini", label: "INI / Env" },
  { id: "makefile", label: "Makefile" },
  { id: "wasm", label: "WebAssembly" },
  { id: "coffeescript", label: "CoffeeScript" },
  { id: "ocaml", label: "OCaml" },
  { id: "reason", label: "ReasonML" },
  { id: "stylus", label: "Stylus" },
  { id: "sass", label: "Sass" },
  { id: "less", label: "Less" },
  { id: "git", label: "Git commit" },
];

const LANG_LABEL: Record<string, string> = Object.fromEntries(
  CODE_LANGS.map((l) => [l.id, l.label]),
);
/** compact badge label for fences */
export function langBadge(lang: string): string {
  const short: Record<string, string> = {
    typescript: "TS", javascript: "JS", tsx: "TSX", jsx: "JSX", python: "Python",
    markup: "HTML", bash: "Shell", markdown: "MD", objectivec: "Obj-C",
    coffeescript: "Coffee", dockerfile: "Docker",
  };
  if (short[lang]) return short[lang];
  const full = LANG_LABEL[lang];
  if (full) return full.replace(/ \/.*$/, "").replace(" Schema", "");
  return lang || "code";
}

/** languages prism-react-renderer bundles vs. ones we register externally —
 *  unknown ids fall back to plain markup so Highlight never throws. */
export function safeLang(lang: string): string {
  if (!lang) return "markup";
  if ((Prism.languages as Record<string, unknown> | undefined)?.[lang]) return lang;
  const alias: Record<string, string> = {
    sh: "bash", shell: "bash", zsh: "bash", "c++": "cpp", cs: "csharp",
    "c#": "csharp", py: "python", rb: "ruby", kt: "kotlin", yml: "yaml",
    html: "markup", xml: "markup", vue: "markup", svelte: "markup",
    dockerfile: "bash", env: "ini", dotenv: "ini", text: "markup", txt: "markup",
    md: "markdown", mdx: "markdown", golang: "go", rs: "rust", pb: "markup",
  };
  return alias[lang] && (Prism.languages as Record<string, unknown>)[alias[lang]]
    ? alias[lang]
    : "markup";
}

/* ------------------------------------------------------------------ */
/* heuristic auto-detection                                             */
/* ------------------------------------------------------------------ */

export function detectCodeLang(code: string): string {
  const c = code.trim();
  if (!c) return "";
  if (/^\s*(model|enum|datasource|generator)\s+\w+\s*\{/m.test(c) && /@@?id|@default|\bString\b/.test(c)) return "prisma";
  if (/^\s*\{[\s\S]*"\w+"\s*:/.test(c)) return "json";
  if (/^\s*(?:import|export)\s+.*(from\s+['"]|;$)|:\s*(?:string|number|boolean)\b|interface\s+\w+/.test(c)) {
    return /<[A-Z][\w.]*[\s/>]/.test(c) || /className=/.test(c) ? "tsx" : "typescript";
  }
  if (/\b(?:const|let|var|function|=>|console\.log|require\()/.test(c)) {
    return /<[A-Z][\w.]*[\s/>]|className=|React\./.test(c) ? "jsx" : "javascript";
  }
  if (/^\s*def\s+\w+\(|^\s*import\s+\w+$|^\s*from\s+\w+\s+import|print\(/m.test(c)) return "python";
  if (/^#!\s*\/(?:bin|usr)\/(?:ba)?sh|^sudo\s|\b(?:apt|brew|npm|yarn|bun|git|curl|docker)\s+\w+/m.test(c) && !/[;{]\s*$/m.test(c)) return "bash";
  if (/\b(?:SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|CREATE\s+TABLE|ALTER\s+TABLE)\b/i.test(c)) return "sql";
  if (/^\s*(?:diff --git|@@ -\d|---\s)/m.test(c)) return "diff";
  if (/^\s*<(!DOCTYPE|html|\?xml|div|section|body|head)/i.test(c)) return "markup";
  if (/^FROM\s+\w+|^RUN\s|^CMD\s|^COPY\s|^WORKDIR\s/m.test(c)) return "bash"; // Dockerfile-ish → shell colors read fine
  if (/^\s*(?:package|func)\s+\w|:\s*=\s/.test(c)) return "go";
  if (/\bfn\s+\w+\(|\blet\s+mut\b|::\w|impl\s+\w+/.test(c)) return "rust";
  if (/public\s+(?:static\s+)?(?:final\s+)?class\s+\w+|System\.out\.print/.test(c)) return "java";
  if (/\busing\s+System|namespace\s+\w+|public\s+void\s/.test(c)) return "csharp";
  if (/^\s*(?:key\s*:\s*|$)/m.test(c) && /^\s*[\w-]+\s*:\s?\S/m.test(c) && !/[{};]/.test(c)) return "yaml";
  if (/^[.#@a-z][\w-]*\s*\{[^}]*:[^}]*;/im.test(c) && /(?:color|margin|padding|display|font)/i.test(c)) return "css";
  if (/^[\w-]+\s*=\s*/m.test(c) && !/[{}]/.test(c) && c.split("\n").every((l) => /^[\s#]/.test(l) || /^[\w.-]+\s*=/.test(l))) return "ini";
  return "";
}

/* ------------------------------------------------------------------ */
/* per-note language store (device-local, privacy-first)                */
/* ------------------------------------------------------------------ */

const STORE_KEY = "nx-codelangs";

function readMap(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

export function getCodeLang(noteId: string): string {
  return readMap()[noteId] ?? "";
}

export function setCodeLang(noteId: string, lang: string) {
  try {
    const map = readMap();
    if (lang) map[noteId] = lang;
    else delete map[noteId];
    localStorage.setItem(STORE_KEY, JSON.stringify(map));
    window.dispatchEvent(new CustomEvent("nx-codelang", { detail: { noteId, lang } }));
  } catch { /* private mode */ }
}

/* ------------------------------------------------------------------ */
/* the component                                                        */
/* ------------------------------------------------------------------ */

export function CodeBlock({
  code,
  lang = "",
  noteId,
  showPicker = false,
  className,
  maxHeight,
}: {
  code: string;
  /** fence language (```ts) — respected over the per-note store */
  lang?: string;
  /** code notes: load/save the chosen language device-local */
  noteId?: string;
  /** code notes: show the full language dropdown */
  showPicker?: boolean;
  className?: string;
  /** e.g. "min(62vh, 640px)" for long listings */
  maxHeight?: string;
}) {
  const { resolvedTheme } = useTheme();
  const [copied, setCopied] = useState(false);
  const [linesOn, setLinesOn] = useState(true);
  const [wrap, setWrap] = useState(false);
  const [noteLang, setNoteLang] = useState(() => (noteId ? getCodeLang(noteId) : ""));

  useEffect(() => {
    if (!noteId) return;
    const on = (e: Event) => {
      const d = (e as CustomEvent).detail as { noteId?: string } | undefined;
      if (d?.noteId === noteId) setNoteLang(getCodeLang(noteId));
    };
    window.addEventListener("nx-codelang", on);
    return () => window.removeEventListener("nx-codelang", on);
  }, [noteId]);

  const resolved =
    lang || noteLang || detectCodeLang(code);
  const grammarLang = safeLang(resolved);
  const trimmed = code.replace(/\n$/, "");
  const multi = trimmed.split("\n").length > 3;

  return (
    <div
      className={cn(
        "nx-codeblock group/code relative my-3 overflow-hidden rounded-lg border text-[12.5px] leading-relaxed",
        className,
      )}
    >
      {/* header — badge, toggles, copy */}
      <div className="flex items-center gap-1 border-b bg-muted/60 px-2 py-1">
        {showPicker ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground hover:bg-muted transition-colors"
                title="Choose the language for highlighting"
              >
                {langBadge(resolved || "auto")}
                <ChevronDown className="h-3 w-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto nx-scroll">
              {CODE_LANGS.map((l) => (
                <DropdownMenuItem
                  key={l.id || "auto"}
                  onClick={() => {
                    if (noteId) setCodeLang(noteId, l.id);
                    setNoteLang(l.id);
                  }}
                  className={cn("text-xs", resolved === l.id && "nx-accent-text")}
                >
                  {l.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <span
            className="rounded bg-muted px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground"
            title={LANG_LABEL[resolved] ?? "auto-detected"}
          >
            {langBadge(resolved)}
          </span>
        )}

        <span className="flex-1" />

        <button
          type="button"
          onClick={() => setWrap((v) => !v)}
          aria-label="Toggle word wrap"
          title="Toggle word wrap"
          className={cn(
            "rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
            wrap && "nx-accent-text bg-muted",
          )}
        >
          <WrapText className="h-3.5 w-3.5" />
        </button>
        {multi && (
          <button
            type="button"
            onClick={() => setLinesOn((v) => !v)}
            aria-label="Toggle line numbers"
            title="Toggle line numbers"
            className={cn(
              "rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
              linesOn && "nx-accent-text bg-muted",
            )}
          >
            <List className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(trimmed).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1400);
            });
          }}
          aria-label={copied ? "Copied" : "Copy code"}
          title="Copy code"
          className={cn(
            "rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
            copied && "text-emerald-500",
          )}
        >
          {copied ? <Check className="h-3.5 w-3.5 nx-pop" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* highlighted body */}
      <Highlight
        theme={resolvedTheme === "dark" ? themes.oneDark : themes.oneLight}
        code={trimmed}
        language={grammarLang as never}
      >
        {({ style, tokens, getLineProps, getTokenProps }) => (
          <pre
            className={cn("overflow-x-auto p-3 nx-scroll", wrap && "nx-code-wrap")}
            style={{
              ...style,
              backgroundColor: "transparent",
              maxHeight: maxHeight ?? (trimmed.split("\n").length > 24 ? "60vh" : undefined),
              overflowY: "auto",
              margin: 0,
            }}
          >
            {tokens.map((line, i) => (
              <div
                key={i}
                {...getLineProps({ line })}
                className="nx-code-line table-row"
              >
                {linesOn && multi && (
                  <span
                    className="nx-code-lineno table-cell select-none border-r pr-3 text-right align-top text-[11px] opacity-40"
                    style={{ minWidth: "2.2em" }}
                  >
                    {i + 1}
                  </span>
                )}
                <span className="table-cell pl-3 align-top">
                  {line.map((token, key) => (
                    <span key={key} {...getTokenProps({ token })} />
                  ))}
                </span>
              </div>
            ))}
          </pre>
        )}
      </Highlight>
    </div>
  );
}

/** react-markdown `pre`/`code` overrides — block code → CodeBlock, inline stays. */
export function mdCodeComponents() {
  type CodeProps = React.ClassAttributes<HTMLElement> &
    React.HTMLAttributes<HTMLElement> & { node?: unknown };
  return {
    pre: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    code: ({ className, children }: CodeProps) => {
      const text = String(children ?? "").replace(/\n$/, "");
      const m = /language-([\w+#-]+)/.exec(className ?? "");
      const isBlock = Boolean(m) || text.includes("\n");
      if (!isBlock) {
        return <code className={className}>{children}</code>;
      }
      return <CodeBlock code={text} lang={m?.[1] ?? ""} />;
    },
  };
}
