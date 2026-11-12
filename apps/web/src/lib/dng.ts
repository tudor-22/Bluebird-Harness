/**
 * Cameras store a JPEG preview inside every DNG. Browsers cannot decode raw
 * data, so the preview is what we hand to the normal image pipeline.
 */
export function extractDngPreview(buffer: ArrayBuffer): Blob | null {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 16) return null;
  const view = new DataView(buffer);
  const order = String.fromCharCode(bytes[0], bytes[1]);
  const little = order === "II";
  if (!little && order !== "MM") return null;

  const u16 = (offset: number) => view.getUint16(offset, little);
  const u32 = (offset: number) => view.getUint32(offset, little);
  if (u16(2) !== 42) return null;

  type Entry = { type: number; count: number; valueOffset: number; size: number };
  type Candidate = { offset: number; length: number };
  const candidates: Candidate[] = [];

  const readIfd = (offset: number, depth: number): void => {
    if (!offset || depth > 4 || offset + 2 > bytes.length) return;
    const count = u16(offset);
    if (offset + 2 + count * 12 > bytes.length) return;

    const tags = new Map<number, Entry>();
    for (let index = 0; index < count; index++) {
      const entry = offset + 2 + index * 12;
      const type = u16(entry + 2);
      const size = type === 3 || type === 8 ? 2 : type === 1 || type === 6 || type === 7 ? 1 : 4;
      tags.set(u16(entry), { type, count: u32(entry + 4), valueOffset: entry + 8, size });
    }

    const valueOf = (tag: number, index = 0): number | null => {
      const entry = tags.get(tag);
      if (!entry) return null;
      const total = entry.size * entry.count;
      const base = total <= 4 ? entry.valueOffset : u32(entry.valueOffset);
      const at = base + index * entry.size;
      if (at + entry.size > bytes.length) return null;
      if (entry.size === 2) return u16(at);
      if (entry.size === 1) return bytes[at];
      return u32(at);
    };

    // Classic preview tags.
    const jpegOffset = valueOf(0x0201);
    const jpegLength = valueOf(0x0202);
    if (jpegOffset && jpegLength) candidates.push({ offset: jpegOffset, length: jpegLength });

    // Strip-based previews (compression 6 and 7 are the JPEG variants).
    const stripCount = tags.get(0x0117)?.count ?? 0;
    if (stripCount > 0) {
      const parts: Candidate[] = [];
      for (let index = 0; index < Math.min(stripCount, 32); index++) {
        const start = valueOf(0x0111, index);
        const length = valueOf(0x0117, index);
        if (start === null || length === null) break;
        parts.push({ offset: start, length });
      }
      if (parts.length === 1) {
        candidates.push(parts[0]);
      } else if (parts.length > 1) {
        const contiguous = parts.every(
          (part, index) => index === 0 || part.offset === parts[index - 1].offset + parts[index - 1].length,
        );
        if (contiguous) {
          const first = parts[0];
          const last = parts[parts.length - 1];
          candidates.push({
            offset: first.offset,
            length: last.offset + last.length - first.offset,
          });
        } else {
          candidates.push(...parts);
        }
      }
    }

    for (let index = 0; index < Math.min(tags.get(0x014a)?.count ?? 0, 8); index++) {
      const child = valueOf(0x014a, index);
      if (child) readIfd(child, depth + 1);
    }
    const exif = valueOf(0x8769);
    if (exif) readIfd(exif, depth + 1);
    const next = offset + 2 + count * 12;
    if (next + 4 <= bytes.length) {
      const nextIfd = u32(next);
      if (nextIfd) readIfd(nextIfd, depth + 1);
    }
  };

  readIfd(u32(4), 0);

  const usable = candidates
    .filter((candidate) => candidate.length > 1024 && candidate.offset + candidate.length <= bytes.length)
    .filter((candidate) => bytes[candidate.offset] === 0xff && bytes[candidate.offset + 1] === 0xd8)
    .sort((a, b) => b.length - a.length);
  if (usable.length === 0) return null;

  const best = usable[0];
  return new Blob([bytes.slice(best.offset, best.offset + best.length)], { type: "image/jpeg" });
}
