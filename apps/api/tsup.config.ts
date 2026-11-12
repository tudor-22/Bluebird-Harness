import { cp } from "node:fs/promises";
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/db/migrate.ts", "src/scripts/encrypt-attachments.ts"],
  format: ["esm"],
  target: "node22",
  platform: "node",
  clean: true,
  sourcemap: true,
  // Workspace packages ship raw TypeScript, so bundle them into the output.
  noExternal: ["@bluebird/shared"],
  // The desktop helpers (Swift, PowerShell, Python) are run as files, so they ship beside the bundle.
  async onSuccess() {
    await cp("src/agent/desktop/native", "dist/native", { recursive: true });
  },
});
