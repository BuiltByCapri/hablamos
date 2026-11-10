// The real /auth/callback route handler, with the Supabase client stubbed so
// every link "succeeds". Asserts on where the browser would actually go: the
// origin of the resolved Location header, not the string.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const auth = {
  exchangeCodeForSession: vi.fn().mockResolvedValue({ error: null }),
  verifyOtp: vi.fn().mockResolvedValue({ error: null }),
};
vi.mock("../../lib/supabase/server", () => ({ getServerClient: () => ({ auth }) }));

const { GET } = await import("../../app/auth/callback/route");
const ORIGIN = "https://hablamos.test";

async function landing(next: string): Promise<URL> {
  const url = new URL("/auth/callback", ORIGIN);
  url.searchParams.set("code", "c");
  url.searchParams.set("next", next);
  const res = await GET(new NextRequest(url));
  expect(res.status).toBe(307);
  return new URL(res.headers.get("location")!, ORIGIN);
}

describe("GET /auth/callback", () => {
  it("keeps an encoded slash on this site", async () => {
    const to = await landing("/./%2F/evil.example");
    expect(to.origin).toBe(ORIGIN);
    expect(to.pathname).toBe("/%2F/evil.example");
  });

  beforeEach(() => vi.clearAllMocks());

  it("goes to the next path on this site", async () => {
    const to = await landing("/invite/abc");
    expect(to.origin).toBe(ORIGIN);
    expect(to.pathname).toBe("/invite/abc");
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith("c");
  });

  for (const next of [
    "/\t/evil.example",
    "/\n/evil.example",
    "//evil.example",
    "/\\evil.example",
    "https://evil.example",
    decodeURIComponent("/%09/evil.example"),
    decodeURIComponent("/%0A/evil.example"),
    "/.//evil.example",
    "/..//evil.example",
    "/%2e//evil.example",
    "/a/..//evil.example",
    "/x/../../\t//evil.example",
  ]) {
    it(`never leaves the site for next=${JSON.stringify(next)}`, async () => {
      const to = await landing(next);
      expect(to.origin).toBe(ORIGIN);
      expect(to.pathname).toBe("/");
    });
  }
});
