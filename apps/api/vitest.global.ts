import { readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const PREFIXES = ["agent-", "desktop-", "gateway-", "web-engine-", "import-"];

/** The suite makes scratch folders under .data; remove them when it finishes, pass or fail. */
function sweep(): void {
  const dir = join(process.cwd(), ".data");
  let names: string[] = [];
  try {
    names = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of names) {
    if (PREFIXES.some((prefix) => name.startsWith(prefix))) rmSync(join(dir, name), { recursive: true, force: true });
  }
}

export default function setup() {
  sweep();
  return sweep;
}
