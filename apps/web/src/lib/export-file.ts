import type { UiExportNode, UiTableNode, UiValue } from "@bluebird/shared";
import { resolveUiTemplate } from "@bluebird/shared";

const MIME: Record<UiExportNode["format"], string> = {
  csv: "text/csv",
  txt: "text/plain",
  md: "text/markdown",
  json: "application/json",
};

function csvCell(value: string): string {
  // A cell starting with = + - @ can run as a formula when opened in a spreadsheet.
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function tableToText(table: UiTableNode, format: UiExportNode["format"]): string {
  const rows = table.rows.map((row) => table.columns.map((_, index) => row[index] ?? ""));
  if (format === "csv") {
    return [table.columns, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
  }
  if (format === "json") {
    return JSON.stringify(
      rows.map((row) => Object.fromEntries(table.columns.map((column, index) => [column, row[index]]))),
      null,
      2,
    );
  }
  if (format === "md") {
    const line = (cells: string[]) => `| ${cells.map((cell) => cell.replace(/\|/g, "\\|")).join(" | ")} |`;
    return [line(table.columns), line(table.columns.map(() => "---")), ...rows.map(line)].join("\n");
  }
  return [table.columns, ...rows].map((row) => row.join("\t")).join("\n");
}

/** The file an export button saves: its own text, or one of the panel's tables. */
export function buildExport(
  node: UiExportNode,
  tables: UiTableNode[],
  values: Record<string, UiValue>,
): { filename: string; mime: string; content: string } | null {
  let content = "";
  if (node.table !== undefined) {
    const table = tables[node.table];
    if (!table) return null;
    content = tableToText(table, node.format);
  } else if (node.text) {
    content = resolveUiTemplate(node.text, values);
  } else {
    return null;
  }
  return { filename: `${node.filename}.${node.format}`, mime: MIME[node.format], content };
}

/** Saves text as a file in the browser, with no request to any server. */
export function downloadFile(file: { filename: string; mime: string; content: string }): void {
  const url = URL.createObjectURL(new Blob([file.content], { type: `${file.mime};charset=utf-8` }));
  const link = document.createElement("a");
  link.href = url;
  link.download = file.filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
