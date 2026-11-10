import { describe, expect, it, vi } from "vitest";
import { callClaude, ClaudeCapError, ClaudeUpstreamError } from "../../lib/claude";

const tool = { name: "reply", description: "d", input_schema: { type: "object" } };
const args = { userId: "u1", system: "s", messages: [{ role: "user" as const, content: "hi" }], tool };

function store(initial = 0) {
  let n = initial;
  return {
    get: vi.fn(async () => n),
    increment: vi.fn(async () => ++n),
  };
}
function ok(content: unknown[]) {
  return vi.fn(async () => new Response(JSON.stringify({ content }), { status: 200 })) as unknown as typeof fetch;
}
const toolUse = { type: "tool_use", name: "reply", input: { a: 1 } };

describe("callClaude", () => {
  it("returns the forced tool's input", async () => {
    const f = ok([toolUse]);
    const out = await callClaude<{ a: number }>(args, { fetch: f, usage: store() });
    expect(out).toEqual({ a: 1 });
    const body = JSON.parse((vi.mocked(f).mock.calls[0][1] as RequestInit).body as string);
    expect(body.tool_choice).toEqual({ type: "tool", name: "reply" });
  });

  it("increments today's usage on success", async () => {
    const usage = store();
    await callClaude(args, { fetch: ok([toolUse]), usage });
    expect(usage.increment).toHaveBeenCalledWith("u1", new Date().toISOString().slice(0, 10));
  });

  it("does not increment usage on an upstream error or a timeout", async () => {
    const usage = store();
    const bad = vi.fn(async () => new Response("{}", { status: 500 })) as unknown as typeof fetch;
    await expect(callClaude(args, { fetch: bad, usage })).rejects.toBeInstanceOf(ClaudeUpstreamError);
    const hang = vi.fn((_u: unknown, init: RequestInit) =>
      new Promise((_, reject) => init.signal!.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))),
    ) as unknown as typeof fetch;
    await expect(callClaude({ ...args, timeoutMs: 20 }, { fetch: hang, usage })).rejects.toBeInstanceOf(ClaudeUpstreamError);
    await expect(callClaude(args, { fetch: ok([{ type: "text", text: "x" }]), usage })).rejects.toBeInstanceOf(ClaudeUpstreamError);
    expect(usage.increment).not.toHaveBeenCalled();
  });

  it("throws ClaudeCapError at the cap", async () => {
    const f = ok([toolUse]);
    await expect(callClaude(args, { fetch: f, usage: store(300) })).rejects.toBeInstanceOf(ClaudeCapError);
    expect(f).not.toHaveBeenCalled();
  });

  it("throws ClaudeUpstreamError on non-2xx", async () => {
    const f = vi.fn(async () => new Response("{}", { status: 429 })) as unknown as typeof fetch;
    await expect(callClaude(args, { fetch: f, usage: store() })).rejects.toBeInstanceOf(ClaudeUpstreamError);
  });
});
