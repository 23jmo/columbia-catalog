import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/**
 * Vitest does not read `paths` out of tsconfig.json, so the `@/…` alias the
 * whole codebase imports through has to be restated here. Without it, any test
 * that imports `@/lib/constants` fails to resolve at collection time — which
 * looks like a missing package rather than a missing alias.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    // Node is the right default: the suites here cover parsing, ranking,
    // scheduling math, and crawler policy — all pure. Component lanes test
    // their extracted pure modules rather than rendering, so no DOM is needed.
    environment: "node",
    include: ["**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules/**", ".next/**"],
  },
});
