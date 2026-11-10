// Holds the Anthropic key server-side so the page never sees it.
// Env: ANTHROPIC_API_KEY, APP_PASSCODE, optional CLAUDE_MODEL.

const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-4-6";

// Claude answers by calling this tool, so the reply always arrives as parsed fields
// instead of JSON text that a stray quotation mark can break.
const REPLY_TOOL = {
  name: "reply",
  description: "Send your reply to the learner.",
  input_schema: {
    type: "object",
    properties: {
      reply_es: { type: "string", description: "Your reply in Spanish, 1-3 short sentences ending in a simple question. This is read aloud." },
      reply_en: { type: "string", description: "English translation of reply_es." },
      correction: {
        type: ["string", "null"],
        description: "A short kind note in English about one or two mistakes she made, or the Spanish phrase for something she said in English. null when there is nothing to correct. Never praise here.",
      },
    },
    required: ["reply_es", "reply_en", "correction"],
  },
};

export async function POST(request) {
  const expected = process.env.APP_PASSCODE;
  if (!expected || request.headers.get("x-passcode") !== expected) {
    return Response.json({ error: "passcode" }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  const { system, messages } = body || {};
  if (typeof system !== "string" || !Array.isArray(messages) || messages.length === 0 || messages.length > 60) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  const clean = messages.map((m) => ({
    role: m && m.role === "assistant" ? "assistant" : "user",
    content: String((m && m.content) || "").slice(0, 4000) || "(silence)",
  }));

  const upstream = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY || "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1000,
      system: system.slice(0, 20000),
      messages: clean,
      tools: [REPLY_TOOL],
      tool_choice: { type: "tool", name: "reply" },
    }),
  });

  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    console.error("anthropic", upstream.status, data && data.error && data.error.message);
    return Response.json({ error: "upstream" }, { status: upstream.status === 429 ? 429 : 502 });
  }

  const call = (data.content || []).find((b) => b.type === "tool_use" && b.name === "reply");
  if (call && call.input) return Response.json({ reply: call.input });
  const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  return Response.json({ text });
}
