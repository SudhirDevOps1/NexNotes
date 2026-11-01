"use client";

/**
 * NexNotes v2.0 — Rich text (WYSIWYG) editor, powered by mdxeditor.
 * Content is stored as plain markdown, so a "richtext" note stays fully
 * interoperable with the markdown editor, preview, sync, API and exports.
 * Loaded client-only (dynamic import in editor.tsx).
 */

import "@mdxeditor/editor/style.css";
import { useMemo } from "react";
import {
  MDXEditor,
  type MDXEditorMethods,
  headingsPlugin,
  listsPlugin,
  quotePlugin,
  thematicBreakPlugin,
  tablePlugin,
  linkPlugin,
  linkDialogPlugin,
  markdownShortcutPlugin,
  diffSourcePlugin,
  toolbarPlugin,
  UndoRedo,
  BoldItalicUnderlineToggles,
  ListsToggle,
  BlockTypeSelect,
  CreateLink,
  InsertCodeBlock,
  InsertTable,
  InsertThematicBreak,
  Separator,
} from "@mdxeditor/editor";
import { useTheme } from "next-themes";

export type { MDXEditorMethods };

export function RichTextEditor({
  value,
  onChange,
  readOnly,
}: {
  value: string;
  onChange: (markdown: string) => void;
  readOnly?: boolean;
}) {
  const { resolvedTheme } = useTheme();
  const initial = useMemo(() => value ?? "", []); // initial content only — controlled edits flow through onChange

  const plugins = useMemo(
    () => [
      headingsPlugin(),
      listsPlugin(),
      quotePlugin(),
      thematicBreakPlugin(),
      tablePlugin(),
      linkPlugin(),
      linkDialogPlugin(),
      markdownShortcutPlugin(),
      diffSourcePlugin({ diffMarkdown: initial }),
      toolbarPlugin({
        toolbarContents: () => (
          <>
            <UndoRedo />
            <Separator />
            <BlockTypeSelect />
            <Separator />
            <BoldItalicUnderlineToggles />
            <Separator />
            <CreateLink />
            <Separator />
            <ListsToggle />
            <Separator />
            <InsertCodeBlock />
            <InsertTable />
            <InsertThematicBreak />
          </>
        ),
      }),
    ],
    [initial]
  );

  return (
    <div className={resolvedTheme === "dark" ? "dark-theme nx-mdx dark" : "nx-mdx"}>
      <MDXEditor
        markdown={initial}
        readOnly={readOnly}
        onChange={(md) => onChange(md)}
        plugins={plugins}
        className="nx-editor-mdx"
        suppressHtmlProcessing
      />
    </div>
  );
}
