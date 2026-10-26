import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 30_000,
    // Starting PGlite (Postgres in WASM) can take several seconds per file.
    hookTimeout: 60_000,
  },
});
