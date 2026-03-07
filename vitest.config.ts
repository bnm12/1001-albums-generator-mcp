import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["src/**/*.smoke.test.ts"],
    environment: "node",
    globals: false,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "src/**/*.smoke.test.ts",
        "src/test/**",
        "src/index.ts",
        "src/test-api.ts",
        "src/test-cache.ts",
      ],
      reporter: ["text", "lcov"],
    },
  },
});
