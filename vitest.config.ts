import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // RLS tests hit the test Supabase project; run them with `npm run test:rls`.
    exclude: ["tests/rls/**", "node_modules/**"],
    environment: "node",
  },
});
