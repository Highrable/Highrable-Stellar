import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    include: ["**/*.test.ts", "**/*.test.tsx"],
    server: {
      deps: {
        // The SDK ships extensionless ESM imports that Vite needs to resolve.
        inline: ["smart-account-kit"],
      },
    },
  },
});
