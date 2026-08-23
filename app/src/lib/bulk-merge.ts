/* ------------------------------------------------------------------
   BULK CSV DATA MERGE ENGINE (§Canva Parity)
   Upload spreadsheet data (names, dates, ticket tiers, prices)
   and automatically generate batch personalized flyers.
------------------------------------------------------------------- */

import type { Canvas } from "fabric";
import type { EditorObject } from "./editor";

export interface CsvDataset {
  headers: string[];
  rows: Record<string, string>[];
}

/**
 * Parse CSV text into headers and row objects.
 */
export function parseCsvText(text: string): CsvDataset {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) return { headers: [], rows: [] };

  const headers = lines[0].split(",").map((h) => h.replace(/^["']|["']$/g, "").trim());
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map((v) => v.replace(/^["']|["']$/g, "").trim());
    const row: Record<string, string> = {};
    headers.forEach((h, hIdx) => {
      row[h] = values[hIdx] ?? "";
    });
    rows.push(row);
  }

  return { headers, rows };
}

/**
 * Apply one row of CSV data to the canvas objects.
 */
export function applyCsvRowToCanvas(
  c: Canvas,
  columnMapping: Record<string, string>, // csvHeader -> placeholderId / objectName
  row: Record<string, string>
): void {
  const objects = c.getObjects() as unknown as EditorObject[];

  Object.entries(columnMapping).forEach(([header, targetKey]) => {
    const val = row[header];
    if (val === undefined) return;

    objects.forEach((obj) => {
      if (
        obj.kPlaceholder === targetKey ||
        obj.kName === targetKey ||
        obj.kId === targetKey
      ) {
        if (/^(textbox|itext|text)$/i.test(obj.type ?? "")) {
          (obj as unknown as { set: (k: string, v: unknown) => void }).set("text", val);
        }
      }
    });
  });

  c.renderAll();
}
