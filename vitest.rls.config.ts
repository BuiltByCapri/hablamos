import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/rls/**/*.test.ts"],
    environment: "node",
    setupFiles: ["tests/rls/setup-env.ts"],
    // makeUser may wait out the Auth rate limit, in hooks and in tests.
    testTimeout: 360_000,
    hookTimeout: 360_000,
  },
});
