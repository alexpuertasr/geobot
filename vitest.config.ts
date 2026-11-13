import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.ts"],
    // Games against the fake take a few real seconds: final standings wait
    // for 5s of leaderboard quiet, as they do in production.
    testTimeout: 30_000,
  },
});
