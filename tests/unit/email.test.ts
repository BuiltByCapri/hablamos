import { afterEach, describe, expect, it, vi } from "vitest";
import { sendEmail } from "../../lib/email";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("sendEmail", () => {
  it("without a Resend key, logs a notice and returns in development and test", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    for (const env of ["development", "test"]) {
      vi.stubEnv("NODE_ENV", env);
      await expect(sendEmail("a@example.test", "Hi", "Body")).resolves.toBeUndefined();
    }
    expect(log).toHaveBeenCalledTimes(2);
    expect(String(log.mock.calls[0][0])).toContain("a@example.test");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("without a Resend key, throws in production", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("NODE_ENV", "production");
    await expect(sendEmail("a@example.test", "Hi", "Body")).rejects.toThrow(/RESEND_API_KEY/);
  });

  it("posts to Resend with the key and EMAIL_FROM", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("EMAIL_FROM", "Hablamos <hi@example.test>");
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await sendEmail("a@example.test", "Subject", "Text");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers.Authorization).toBe("Bearer re_test");
    expect(JSON.parse(init.body)).toEqual({
      from: "Hablamos <hi@example.test>",
      to: ["a@example.test"],
      subject: "Subject",
      text: "Text",
    });
  });

  it("throws when Resend refuses", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("EMAIL_FROM", "hi@example.test");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("bad", { status: 422 })));
    await expect(sendEmail("a@example.test", "S", "T")).rejects.toThrow(/422/);
  });
});
