/**
 * 2026 Export Utilities for Studio Admin Operations
 * Converts operational entities (Orders, Intakes, Leads, Meetings, Calls) into CSV or JSON
 * with RFC 4180 sanitization and clean file downloads.
 */

function escapeCsvField(val: unknown): string {
  if (val === null || val === undefined) return '""';
  if (typeof val === "object") {
    return `"${JSON.stringify(val).replace(/"/g, '""')}"`;
  }
  const str = String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return `"${str}"`;
}

export function exportToCsv<T>(
  filename: string,
  columns: { key?: keyof T | string; header: string; format?: (row: T) => unknown }[],
  data: T[]
) {
  if (!data || data.length === 0) return;

  const headerRow = columns.map((c) => escapeCsvField(c.header)).join(",");
  const rows = data.map((row) =>
    columns
      .map((col) => {
        const rawValue = col.format
          ? col.format(row)
          : col.key
          ? (row as Record<string, unknown>)[col.key as string]
          : "";
        return escapeCsvField(rawValue);
      })
      .join(",")
  );

  const csvContent = [headerRow, ...rows].join("\r\n");
  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
  triggerDownload(blob, `${filename}_${new Date().toISOString().slice(0, 10)}.csv`);
}

export function exportToJson<T>(filename: string, data: T[]) {
  if (!data || data.length === 0) return;
  const jsonContent = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonContent], { type: "application/json;charset=utf-8;" });
  triggerDownload(blob, `${filename}_${new Date().toISOString().slice(0, 10)}.json`);
}

function triggerDownload(blob: Blob, fullFilename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", fullFilename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
