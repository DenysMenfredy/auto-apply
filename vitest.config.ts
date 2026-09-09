import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@domain": `${root}src/domain`,
      "@application": `${root}src/application`,
      "@infrastructure": `${root}src/infrastructure`,
      "@shared": `${root}src/shared`,
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // Playwright glue needs a real Chrome; the provider around it is unit-
      // tested through the BrowserEngine fake.
      exclude: ["src/infrastructure/providers/browser-engine.ts"],
      thresholds: { lines: 80, functions: 80 },
    },
  },
});
