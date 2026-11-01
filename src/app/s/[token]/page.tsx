import type { Metadata } from "next";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeKatex from "rehype-katex";
import { ShieldCheck } from "lucide-react";
import { db } from "@/lib/db";
import { buildHtmlDoc } from "@/components/nexnotes/editor";
import { CodeBlock } from "@/components/nexnotes/code-block";

export const dynamic = "force-dynamic";

/**
 * NexNotes v2.0 — public read-only share pages (/s/<token>).
 * Listed-style publishing, fully self-hosted. Privacy guarantees:
 *  - off by default, revocable from the note menu
 *  - noindex / nofollow (never appears in search engines)
 *  - content sanitized (rehype-sanitize GitHub schema); HTML notes render in a
 *    sandboxed iframe with JavaScript disabled
 *  - locked (password-protected) and E2E-encrypted notes can NOT be shared —
 *    the server only holds ciphertext for those
 *  - trashed notes are never served
 */

const MD_SCHEMA = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), "math", "inlineMath"],
} as typeof defaultSchema;

async function getSharedNote(token: string) {
  return db.note.findFirst({
    where: { shareToken: token, shareEnabled: true, trashed: false },
    select: {
      title: true,
      content: true,
      noteType: true,
      isEncrypted: true,
      locked: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const note = await getSharedNote(token).catch(() => null);
  return {
    title: note?.title ? `${note.title} — shared via NexNotes` : "Shared note — NexNotes",
    robots: { index: false, follow: false },
  };
}

export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const note = await getSharedNote(token).catch(() => null);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="border-b">
        <div className="max-w-3xl mx-auto px-4 md:px-8 h-14 flex items-center gap-2.5">
          <div className="h-7 w-7 rounded-lg bg-primary flex items-center justify-center">
            <ShieldCheck className="h-5 w-5 text-white" strokeWidth={2.4} />
          </div>
          <Link href="/" className="font-bold text-[15px] tracking-tight hover:opacity-80 transition-opacity">
            NexNotes
          </Link>
          <span className="text-[11px] text-muted-foreground border rounded px-1.5 py-0.5 ml-1">shared note</span>
        </div>
      </header>

      <main className="flex-1 w-full max-w-3xl mx-auto px-4 md:px-8 py-8 md:py-12">
        {!note ? (
          <div className="rounded-xl border bg-card p-10 text-center">
            <h1 className="text-xl font-semibold mb-2">This link is no longer available</h1>
            <p className="text-sm text-muted-foreground">
              The note was unshared, trashed, or the link is wrong.
            </p>
          </div>
        ) : note.locked ? (
          <div className="rounded-xl border bg-card p-10 text-center">
            <h1 className="text-xl font-semibold mb-2">🔒 This note is protected</h1>
            <p className="text-sm text-muted-foreground">
              Password-protected notes cannot be shared publicly.
            </p>
          </div>
        ) : note.isEncrypted ? (
          <div className="rounded-xl border bg-card p-10 text-center">
            <h1 className="text-xl font-semibold mb-2">🔐 This note is end-to-end encrypted</h1>
            <p className="text-sm text-muted-foreground">
              The server never holds the plaintext for encrypted notes, so there is nothing to display here. Open it in NexNotes.
            </p>
          </div>
        ) : (
          <article>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-2 leading-tight">
              {note.title || "Untitled"}
            </h1>
            <p className="text-xs text-muted-foreground mb-8">
              {new Date(note.updatedAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
            </p>
            {note.noteType === "html" ? (
              <iframe
                title="Shared HTML note"
                sandbox="allow-popups allow-popups-to-escape-sandbox"
                srcDoc={buildHtmlDoc(note.content)}
                className="w-full rounded-lg border bg-white min-h-[420px]"
                style={{ height: "min(70vh, 720px)" }}
              />
            ) : note.noteType === "code" ? (
              <CodeBlock code={note.content} maxHeight="min(70vh, 720px)" />
            ) : (
              <div className="md-preview text-[15px]">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm, remarkMath]}
                  rehypePlugins={[rehypeRaw, [rehypeSanitize, MD_SCHEMA], rehypeKatex]}
                  components={{
                    /* v2.1 — Prism-highlighted code fences on public pages */
                    pre: ({ children }) => <>{children}</>,
                    code: ({ className, children }) => {
                      const text = String(children ?? "").replace(/\n$/, "");
                      const m = /language-([\w+#-]+)/.exec(className ?? "");
                      if (!m && !text.includes("\n")) {
                        return <code className={className}>{children}</code>;
                      }
                      return <CodeBlock code={text} lang={m?.[1] ?? ""} />;
                    },
                  }}
                >
                  {note.content}
                </ReactMarkdown>
              </div>
            )}
          </article>
        )}
      </main>

      <footer className="border-t">
        <div className="max-w-3xl mx-auto px-4 md:px-8 h-12 flex items-center text-[11px] text-muted-foreground">
          Published with NexNotes — free, open-source, encrypted notes.
        </div>
      </footer>
    </div>
  );
}
