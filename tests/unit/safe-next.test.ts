import { describe, expect, it } from "vitest";
import { safeNext } from "../../lib/auth-callback";
import { samePath, withParam } from "../../lib/same-path";

// Anything that could resolve to another origin, directly or after the URL
// parser strips tab and newline.
const OFF_SITE = [
  "https://evil.example",
  "//evil.example",
  "/\\evil.example",
  "\\\\evil.example",
  "/\t/evil.example",
  "/\n/evil.example",
  "/\r/evil.example",
  decodeURIComponent("/%09/evil.example"),
  decodeURIComponent("/%0A/evil.example"),
  "/\u0000/evil.example",
  "javascript:alert(1)",
  "evil",
  // Dot segments collapse during parsing and leave a protocol-relative path.
  "/.//evil.example",
  "/..//evil.example",
  "/%2e//evil.example",
  "/a/..//evil.example",
  "/x/../../\t//evil.example",
];

describe("samePath", () => {
  it("keeps a path on this site, with its query and hash", () => {
    expect(samePath("/invite/abc")).toBe("/invite/abc");
    expect(samePath("/settings?x=1#top")).toBe("/settings?x=1#top");
  });

  it("rejects anything that could leave the site", () => {
    for (const bad of [null, undefined, "", ...OFF_SITE]) {
      expect(samePath(bad), JSON.stringify(bad)).toBeNull();
    }
  });

  it("keeps an encoded tab as an inert on-site path", () => {
    // Still encoded, so the parser does not strip it and the origin is ours.
    const kept = samePath("/%09/evil.example");
    expect(kept).not.toBeNull();
    expect(new URL(kept!, "https://hablamos.test").origin).toBe("https://hablamos.test");
  });
});

describe("samePath output", () => {
  it("never returns a protocol-relative path, and what it returns resolves on this site", () => {
    const inputs = [...OFF_SITE, "/./%2F/evil.example", "/%2e%2e//evil.example", "/a/b/../..//evil.example", "/invite/abc"];
    for (const input of inputs) {
      const out = samePath(input);
      if (out === null) continue;
      expect(out.startsWith("//") || out.startsWith("/\\"), JSON.stringify(input)).toBe(false);
      expect(new URL(out, "https://hablamos.test").origin, JSON.stringify(input)).toBe("https://hablamos.test");
    }
  });

  it("keeps an encoded slash as an inert on-site path", () => {
    expect(samePath("/./%2F/evil.example")).toBe("/%2F/evil.example");
  });
});

describe("withParam", () => {
  it("adds a message to an on-site path, before any hash", () => {
    expect(withParam("/settings", "notice", "Saved.")).toBe("/settings?notice=Saved.");
    expect(withParam("/tutor?x=1#list", "error", "a b")).toBe("/tutor?x=1&error=a+b#list");
  });

  it("falls back to home for anything off-site, including dot-segment tricks", () => {
    for (const bad of [...OFF_SITE, "/./%2F/evil.example".replace("%2F", "/")]) {
      const out = withParam(bad, "error", "x");
      expect(out, JSON.stringify(bad)).toBe("/?error=x");
    }
  });
});

describe("safeNext", () => {
  it("keeps a path on this site", () => {
    expect(safeNext("/invite/abc")).toBe("/invite/abc");
    expect(safeNext("/settings?x=1")).toBe("/settings?x=1");
  });

  it("falls back to home for anything off-site, and for sign-in itself", () => {
    for (const bad of [null, "", ...OFF_SITE, "/sign-in", "/sign-in?next=/x"]) {
      expect(safeNext(bad), JSON.stringify(bad)).toBe("/");
    }
  });
});
