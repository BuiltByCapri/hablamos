import { getAdminClient } from "./supabase/admin";

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
  | { type: "document"; source: { type: "base64"; media_type: "application/pdf"; data: string } };

export class ClaudeCapError extends Error {
  constructor() {
    super("Daily Claude call cap reached");
    this.name = "ClaudeCapError";
  }
}

export class ClaudeUpstreamError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "ClaudeUpstreamError";
  }
}

export type UsageStore = {
  get(userId: string, day: string): Promise<number>;
  increment(userId: string, day: string): Promise<number>;
};

export type ClaudeArgs = {
  userId: string;
  system: string;
  messages: { role: "user" | "assistant"; content: string | ContentBlock[] }[];
  tool: { name: string; description: string; input_schema: object };
  maxTokens?: number;
  timeoutMs?: number;
};

const adminUsage: UsageStore = {
  async get(userId, day) {
    const { data, error } = await getAdminClient()
      .from("claude_usage")
      .select("calls")
      .eq("user_id", userId)
      .eq("day", day)
      .maybeSingle();
    if (error) throw new Error(`usage read failed: ${error.message}`);
    return data?.calls ?? 0;
  },
  async increment(userId, day) {
    const { data, error } = await getAdminClient().rpc("increment_claude_usage", { p_user: userId, p_day: day });
    if (error) throw new Error(`usage increment failed: ${error.message}`);
    return data;
  },
};

function dailyCap(): number {
  const n = Number(process.env.CLAUDE_DAILY_CAP);
  return Number.isFinite(n) && n > 0 ? n : 300;
}

/**
 * Calls Claude with a forced tool and returns that tool's input. Only a 2xx
 * response carrying the tool block counts toward the user's daily cap.
 */
export async function callClaude<T>(
  args: ClaudeArgs,
  deps?: { fetch?: typeof fetch; usage?: UsageStore },
): Promise<T> {
  const doFetch = deps?.fetch ?? fetch;
  const usage = deps?.usage ?? adminUsage;
  const day = new Date().toISOString().slice(0, 10);

  if ((await usage.get(args.userId, day)) >= dailyCap()) throw new ClaudeCapError();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), args.timeoutMs ?? 60_000);
  let data: { content?: { type: string; name?: string; input?: unknown }[] };
  try {
    const res = await doFetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.CLAUDE_MODEL || "claude-sonnet-4-6",
        max_tokens: args.maxTokens ?? 1000,
        system: args.system,
        messages: args.messages,
        tools: [args.tool],
        tool_choice: { type: "tool", name: args.tool.name },
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new ClaudeUpstreamError(`Anthropic returned ${res.status}`, res.status);
    data = await res.json();
  } catch (err) {
    if (err instanceof ClaudeUpstreamError) throw err;
    throw new ClaudeUpstreamError(controller.signal.aborted ? "Anthropic call timed out" : "Anthropic call failed");
  } finally {
    clearTimeout(timer);
  }

  const block = (data.content ?? []).find((b) => b.type === "tool_use" && b.name === args.tool.name);
  if (!block || block.input === undefined) throw new ClaudeUpstreamError("Response had no tool_use block");

  await usage.increment(args.userId, day);
  return block.input as T;
}
