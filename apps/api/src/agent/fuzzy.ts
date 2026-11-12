/** A subsequence score: 0 when the letters do not appear in order, higher for tighter matches. */
export function fuzzyScore(query: string, target: string): number {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (!q) return 1;
  const exact = t.indexOf(q);
  if (exact !== -1) return 1000 - exact - Math.max(0, t.length - q.length) * 0.5 + (exact === 0 ? 200 : 0);
  let at = 0;
  let score = 0;
  let last = -2;
  for (const ch of q) {
    const found = t.indexOf(ch, at);
    if (found === -1) return 0;
    score += found === last + 1 ? 6 : 1;
    if (found === 0 || /[\s/_.-]/.test(t[found - 1] ?? "")) score += 4;
    last = found;
    at = found + 1;
  }
  return score;
}
