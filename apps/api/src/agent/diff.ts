/** A small unified diff for showing what an edit changed. */
export function unifiedDiff(before: string, after: string, context = 3): string {
  const a = before.split("\n");
  const b = after.split("\n");
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);
  if (midA.length === 0 && midB.length === 0) return "";

  // Line-level longest common subsequence over the changed middle only.
  type Op = { t: " " | "-" | "+"; line: string };
  const ops: Op[] = [];
  if (midA.length * midB.length > 4_000_000) {
    midA.forEach((line) => ops.push({ t: "-", line }));
    midB.forEach((line) => ops.push({ t: "+", line }));
  } else {
    const n = midA.length;
    const m = midB.length;
    const table = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        table[i][j] = midA[i] === midB[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (midA[i] === midB[j]) {
        ops.push({ t: " ", line: midA[i] });
        i++;
        j++;
      } else if (table[i + 1][j] >= table[i][j + 1]) ops.push({ t: "-", line: midA[i++] });
      else ops.push({ t: "+", line: midB[j++] });
    }
    while (i < n) ops.push({ t: "-", line: midA[i++] });
    while (j < m) ops.push({ t: "+", line: midB[j++] });
  }

  const head = a.slice(Math.max(0, start - context), start).map((line) => ({ t: " " as const, line }));
  const tail = a.slice(endA, endA + context).map((line) => ({ t: " " as const, line }));
  const all = [...head, ...ops, ...tail];
  const oldStart = Math.max(0, start - context) + 1;
  const oldCount = all.filter((op) => op.t !== "+").length;
  const newCount = all.filter((op) => op.t !== "-").length;
  const lines = all.map((op) => `${op.t}${op.line}`);
  const capped = lines.length > 400 ? [...lines.slice(0, 400), `… ${lines.length - 400} more lines`] : lines;
  return [`@@ -${oldStart},${oldCount} +${oldStart},${newCount} @@`, ...capped].join("\n");
}
