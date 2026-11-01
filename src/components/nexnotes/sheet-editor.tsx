"use client";

/**
 * Spreadsheet note type (clean-room, free — inspired by what Standard Notes
 * gates behind paid plans). Content is stored in the note body as
 *
 *   nxsheet:v1:{"cols":[...],"rows":[[...],[...]]}
 *
 * which keeps the local-first sync / E2E pipeline untouched (it is still a
 * plain string), while `sheetToMarkdown()` converts it for markdown export.
 */

import { useCallback, useEffect, useRef } from "react";
import { Plus, X, Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface Sheet {
  cols: string[];
  rows: string[][];
}

export const SHEET_PREFIX = "nxsheet:v1:";

export function parseSheet(content: string): Sheet | null {
  if (!content.startsWith(SHEET_PREFIX)) return null;
  try {
    const raw = JSON.parse(content.slice(SHEET_PREFIX.length)) as Partial<Sheet>;
    const cols = Array.isArray(raw.cols) && raw.cols.length ? raw.cols.map((c) => String(c ?? "")) : ["A", "B"];
    const rows = Array.isArray(raw.rows)
      ? raw.rows.map((r) => (Array.isArray(r) ? r.map((c) => String(c ?? "")) : []))
      : [];
    const width = cols.length;
    return { cols, rows: rows.map((r) => (r.length === width ? r : [...r, ...Array(width - r.length).fill("")])) };
  } catch {
    return null;
  }
}

export function toSheetJson(sheet: Sheet): string {
  return SHEET_PREFIX + JSON.stringify({ cols: sheet.cols, rows: sheet.rows });
}

export function sheetToMarkdown(sheet: Sheet): string {
  const esc = (v: string) => v.replace(/\|/g, "\\|").replace(/\n/g, " ");
  const head = `| ${sheet.cols.map(esc).join(" | ")} |`;
  const sep = `| ${sheet.cols.map(() => "---").join(" | ")} |`;
  const body = sheet.rows.map((r) => `| ${r.map(esc).join(" | ")} |`).join("\n");
  return [head, sep, body].filter(Boolean).join("\n");
}

function emptySheet(): Sheet {
  return {
    cols: ["Item", "Amount", "Notes"],
    rows: [
      ["", "", ""],
      ["", "", ""],
      ["", "", ""],
    ],
  };
}

/* ------------------------------------------------------------------ */
/* editable grid                                                       */
/* ------------------------------------------------------------------ */

export function SheetEditor({
  content,
  onChange,
  readOnly,
}: {
  content: string;
  onChange: (next: string) => void;
  readOnly?: boolean;
}) {
  const sheet = parseSheet(content) ?? emptySheet();

  const commit = useCallback(
    (next: Sheet) => onChange(toSheetJson(next)),
    [onChange],
  );

  const setCell = (r: number, c: number, v: string) => {
    const rows = sheet.rows.map((row, ri) => (ri === r ? row.map((cell, ci) => (ci === c ? v : cell)) : row));
    commit({ ...sheet, rows });
  };
  const setCol = (c: number, v: string) => {
    commit({ ...sheet, cols: sheet.cols.map((x, i) => (i === c ? v : x)) });
  };
  const addRow = () => commit({ ...sheet, rows: [...sheet.rows, Array(sheet.cols.length).fill("")] });
  const addCol = () => {
    commit({
      cols: [...sheet.cols, `Column ${sheet.cols.length + 1}`],
      rows: sheet.rows.map((r) => [...r, ""]),
    });
  };
  const delRow = (r: number) => commit({ ...sheet, rows: sheet.rows.filter((_, i) => i !== r) });
  const delCol = (c: number) => {
    if (sheet.cols.length <= 1) return;
    commit({
      cols: sheet.cols.filter((_, i) => i !== c),
      rows: sheet.rows.map((r) => r.filter((_, i) => i !== c)),
    });
  };

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto nx-scroll rounded-lg border bg-muted/20">
        <table className="w-full border-collapse text-sm min-w-[420px]">
          <thead>
            <tr className="bg-muted/60">
              <th className="w-8 border-r text-[10px] font-normal text-muted-foreground">#</th>
              {sheet.cols.map((c, ci) => (
                <th key={ci} className="border-r last:border-r-0 p-0 relative group">
                  <input
                    value={c}
                    readOnly={readOnly}
                    onChange={(e) => setCol(ci, e.target.value)}
                    placeholder={`Column ${ci + 1}`}
                    aria-label={`Column ${ci + 1} header`}
                    className="w-full bg-transparent px-2.5 py-2 font-semibold outline-none focus:bg-background placeholder:text-muted-foreground/40"
                  />
                  {!readOnly && (
                    <button
                      onClick={() => delCol(ci)}
                      disabled={sheet.cols.length <= 1}
                      aria-label={`Delete column ${ci + 1}`}
                      className="absolute -right-0.5 -top-0.5 h-4 w-4 hidden group-hover:flex items-center justify-center rounded-bl bg-destructive text-white"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sheet.rows.map((row, ri) => (
              <tr key={ri} className="group border-t">
                <td className="border-r text-center text-[10px] text-muted-foreground relative">
                  {ri + 1}
                  {!readOnly && (
                    <button
                      onClick={() => delRow(ri)}
                      aria-label={`Delete row ${ri + 1}`}
                      className="absolute inset-0 hidden group-hover:flex items-center justify-center bg-destructive/90 text-white"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </td>
                {sheet.cols.map((_, ci) => (
                  <td key={ci} className="border-r last:border-r-0 p-0">
                    <input
                      value={row[ci] ?? ""}
                      readOnly={readOnly}
                      onChange={(e) => setCell(ri, ci, e.target.value)}
                      aria-label={`Row ${ri + 1} column ${ci + 1}`}
                      className="w-full bg-transparent px-2.5 py-1.5 outline-none focus:bg-background focus:ring-1 focus:ring-inset focus:ring-[var(--primary)] tabular-nums"
                    />
                  </td>
                ))}
              </tr>
            ))}
            {sheet.rows.length === 0 && (
              <tr>
                <td colSpan={sheet.cols.length + 1} className="text-center text-xs text-muted-foreground py-6">
                  Empty sheet — add a row below
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {!readOnly && (
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={addRow}>
            <Plus className="h-3.5 w-3.5" /> Row
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={addCol}>
            <Plus className="h-3.5 w-3.5" /> Column
          </Button>
          <span className="text-[11px] text-muted-foreground">
            {sheet.rows.length} rows × {sheet.cols.length} cols · hover a cell number to delete
          </span>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* read-only preview                                                   */
/* ------------------------------------------------------------------ */

export function SheetPreview({ content }: { content: string }) {
  const sheet = parseSheet(content);
  if (!sheet) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        <Table2 className="h-4 w-4" /> This sheet has no data yet — switch to Edit.
      </div>
    );
  }
  const num = (v: string) => (v !== "" && !Number.isNaN(Number(v)) ? Number(v) : null);
  const numCols = sheet.cols.map((_, ci) => sheet.rows.every((r) => num(r[ci] ?? "") !== null) && ci > 0);
  const totals = numCols.map((isNum, ci) =>
    isNum ? sheet.rows.reduce((acc, r) => acc + (num(r[ci] ?? "") ?? 0), 0) : null,
  );

  return (
    <div className="overflow-x-auto nx-scroll rounded-lg border">
      <table className="w-full border-collapse text-sm min-w-[420px]">
        <thead>
          <tr className="bg-muted/60">
            {sheet.cols.map((c, i) => (
              <th key={i} className="border-r last:border-r-0 px-3 py-2 text-left font-semibold">
                {c || `Column ${i + 1}`}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sheet.rows.map((row, ri) => (
            <tr key={ri} className="border-t hover:bg-muted/30 transition-colors">
              {sheet.cols.map((_, ci) => (
                <td
                  key={ci}
                  className={cn("border-r last:border-r-0 px-3 py-1.5", numCols[ci] && "text-right tabular-nums")}
                >
                  {row[ci] ?? ""}
                </td>
              ))}
            </tr>
          ))}
          {totals.some((t) => t !== null) && (
            <tr className="border-t bg-muted/40 font-semibold">
              {sheet.cols.map((c, ci) => (
                <td key={ci} className={cn("border-r last:border-r-0 px-3 py-1.5", numCols[ci] && "text-right tabular-nums")}>
                  {ci === 0 ? "Total" : totals[ci] !== null ? String(totals[ci]) : ""}
                </td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
