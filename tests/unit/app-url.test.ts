import { afterEach, describe, expect, it, vi } from "vitest";

const headerValues = new Map<string, string>([
  ["host", "attacker.example"],
  ["x-forwarded-host", "attacker.example"],
  ["x-forwarded-proto", "https"],
]);
vi.mock("next/headers", () => ({
  headers: async () => ({ get: (name: string) => headerValues.get(name) ?? null }),
  cookies: async () => ({ getAll: () => [], set: () => {} }),
}));

const { getAppUrl } = await import("../../lib/supabase/server");

afterEach(() => vi.unstubAllEnvs());

describe("getAppUrl", () => {
  it("uses APP_URL when set, in every environment", async () => {
    vi.stubEnv("APP_URL", "https://hablamos.app/");
    for (const env of ["production", "development", "test"]) {
      vi.stubEnv("NODE_ENV", env);
      expect(await getAppUrl()).toBe("https://hablamos.app");
    }
  });

  it("refuses to build links from request headers in production", async () => {
    vi.stubEnv("APP_URL", "");
    vi.stubEnv("NODE_ENV", "production");
    await expect(getAppUrl()).rejects.toThrow(/APP_URL/);
  });

  it("falls back to the request host in development and test", async () => {
    vi.stubEnv("APP_URL", "");
    for (const env of ["development", "test"]) {
      vi.stubEnv("NODE_ENV", env);
      expect(await getAppUrl()).toBe("https://attacker.example");
    }
  });
});
