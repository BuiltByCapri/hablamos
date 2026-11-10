import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClaudeArgs } from "../../lib/claude";

vi.mock("mammoth", () => ({
  default: { extractRawText: vi.fn(async () => ({ value: "converted docx text" })) },
}));

const { extractItems, supportedMediaType, contentHash, DOCX_TYPE, EXTRACT_VERSION, PROMPT_VERSION } = await import(
  "../../lib/extract"
);

const topics = [
  { id: "t-num", name: "Numbers" },
  { id: "t-food", name: "Food" },
];

function mockCall(items: unknown[]) {
  return vi.fn(async (_args: ClaudeArgs) => ({ items }) as never);
}

const base = { userId: "u1", language: "es", existingTopics: topics, content: { text: "uno, dos, tres" } };

describe("extractItems", () => {
  it("drops an existingId that is not in existingTopics and falls back to newName from the model's name field", async () => {
    const call = mockCall([
      { kind: "word", text: "rojo", meaning: "red", example: null, explanation: null, existing_topic_id: "t-ghost", topic_name: "Colours" },
    ]);
    const [item] = await extractItems(base, { call });
    expect(item.topic).toEqual({ newName: "Colours" });
  });

  it("maps a fallback name that matches an existing topic to that topic", async () => {
    const call = mockCall([
      { kind: "word", text: "uno", meaning: "one", example: null, explanation: null, existing_topic_id: "nope", topic_name: " numbers " },
    ]);
    const [item] = await extractItems(base, { call });
    expect(item.topic).toEqual({ existingId: "t-num" });
  });

  it("keeps a valid existingId", async () => {
    const call = mockCall([
      { kind: "phrase", text: "tengo hambre", meaning: "I'm hungry", example: null, explanation: null, existing_topic_id: "t-food", topic_name: "Food" },
    ]);
    const [item] = await extractItems(base, { call });
    expect(item.topic).toEqual({ existingId: "t-food" });
  });

  it("rejects a kind outside word, phrase, grammar", async () => {
    const call = mockCall([
      { kind: "idiom", text: "x", meaning: "y", example: null, explanation: null, existing_topic_id: null, topic_name: "Misc" },
      { kind: "word", text: "dos", meaning: "two", example: null, explanation: null, existing_topic_id: "t-num", topic_name: "Numbers" },
    ]);
    const items = await extractItems(base, { call });
    expect(items.map((i) => i.text)).toEqual(["dos"]);
  });

  it("grammar keeps its explanation, words and phrases get null", async () => {
    const call = mockCall([
      { kind: "grammar", text: "ser vs estar", meaning: "to be", example: "Soy alta.", explanation: "Ser for traits.", existing_topic_id: null, topic_name: "Verbs" },
      { kind: "word", text: "tres", meaning: "three", example: "", explanation: "stray", existing_topic_id: "t-num", topic_name: "Numbers" },
    ]);
    const [grammar, word] = await extractItems(base, { call });
    expect(grammar.explanation).toBe("Ser for traits.");
    expect(grammar.example).toBe("Soy alta.");
    expect(word.explanation).toBeNull();
    expect(word.example).toBeNull();
  });

  it("drops items with no text or meaning", async () => {
    const call = mockCall([{ kind: "word", text: "  ", meaning: "x", existing_topic_id: null, topic_name: "A" }, null, "junk"]);
    expect(await extractItems(base, { call })).toEqual([]);
  });

  it("empty extraction returns []", async () => {
    expect(await extractItems(base, { call: mockCall([]) })).toEqual([]);
    expect(await extractItems(base, { call: vi.fn(async () => ({}) as never) })).toEqual([]);
  });

  it("prompt contains every existing topic name and the student's language", async () => {
    const call = mockCall([]);
    await extractItems({ ...base, language: "fr" }, { call });
    const args = call.mock.calls[0][0];
    for (const t of topics) {
      expect(args.system).toContain(t.name);
      expect(args.system).toContain(t.id);
    }
    expect(args.system).toContain("French");
    expect(args.system).toContain("fr");
    expect(args.system).not.toContain("Spanish");
    expect(args.tool.name).toBe("save_items");
  });

  it("prompt defines the kinds, keeps topic and kind independent and asks for existing topics first", async () => {
    const call = mockCall([]);
    await extractItems(base, { call });
    const { system } = call.mock.calls[0][0];
    for (const k of ["word:", "phrase:", "grammar:"]) expect(system).toContain(k);
    expect(system).toMatch(/Topic and kind are independent/);
    expect(system).toMatch(/Whenever an existing topic fits/);
  });

  it("sends images as image blocks, PDFs as document blocks and .docx as text", async () => {
    const blocksFor = async (mediaType: string) => {
      const call = mockCall([]);
      await extractItems({ ...base, content: { file: { mediaType, base64: "QUJD" } } }, { call });
      return call.mock.calls[0][0].messages[0].content as { type: string; text?: string }[];
    };
    expect((await blocksFor("image/png"))[0].type).toBe("image");
    expect((await blocksFor("application/pdf"))[0].type).toBe("document");
    const docx = await blocksFor(DOCX_TYPE);
    expect(docx).toHaveLength(1);
    expect(docx[0].text).toContain("converted docx text");
    const txt = await blocksFor("text/plain");
    expect(txt[0].text).toContain("ABC");
  });
});

describe("supportedMediaType", () => {
  it("accepts the supported types and falls back to the extension", () => {
    expect(supportedMediaType("image/jpeg", "a.jpg")).toBe("image/jpeg");
    expect(supportedMediaType("", "notes.docx")).toBe(DOCX_TYPE);
    expect(supportedMediaType("application/octet-stream", "scan.PDF")).toBe("application/pdf");
    expect(supportedMediaType("text/plain; charset=utf-8", "a")).toBe("text/plain");
    expect(supportedMediaType("application/zip", "a.zip")).toBeNull();
    expect(supportedMediaType("", "notes.doc")).toBeNull();
  });
});

describe("fingerprint", () => {
  it("one changed character changes the hash", () => {
    expect(contentHash("hola", undefined)).toBe(contentHash("hola", undefined));
    expect(contentHash("hola", undefined)).not.toBe(contentHash("holá", undefined));
    const bytes = new TextEncoder().encode("hola");
    expect(contentHash(undefined, bytes)).toBe(contentHash("hola", undefined));
    expect(contentHash("x", bytes)).not.toBe(contentHash(undefined, bytes));
  });

  it("EXTRACT_VERSION is the prompt version and the model", () => {
    expect(EXTRACT_VERSION).toBe(`${PROMPT_VERSION}:${process.env.CLAUDE_MODEL || "claude-sonnet-4-6"}`);
  });
});

// ---------------------------------------------------------------- route

const getUser = vi.fn();
vi.mock("../../lib/supabase/server", () => ({ getServerClient: () => ({ auth: { getUser } }) }));
vi.mock("../../lib/supabase/admin", () => ({ getAdminClient: () => ({}) }));
const extractUploadWith = vi.fn();
vi.mock("../../lib/extract", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/extract")>()),
  extractUploadWith: (...a: unknown[]) => extractUploadWith(...a),
}));

const { POST } = await import("../../app/api/extract/route");
const { ClaudeCapError, ClaudeUpstreamError } = await import("../../lib/claude");
const { ExtractAccessError } = await import("../../lib/extract");

function post(fields: Record<string, string | File>, headers?: Record<string, string>) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  return new Request("https://hablamos.test/api/extract", { method: "POST", body: form, headers }) as never;
}

describe("POST /api/extract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    extractUploadWith.mockResolvedValue({ status: "ok", uploadId: "up1", items: [] });
  });

  it("returns the upload and its items", async () => {
    const items = [{ kind: "word", text: "uno", meaning: "one", example: null, explanation: null, topic: { existingId: "t" } }];
    extractUploadWith.mockResolvedValue({ status: "ok", uploadId: "up1", items });
    const res = await POST(post({ studentId: "s1", text: "uno" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ uploadId: "up1", items });
    expect(extractUploadWith.mock.calls[0][0].userId).toBe("u1");
    expect(extractUploadWith.mock.calls[0][1]).toMatchObject({ studentId: "s1", text: "uno" });
  });

  it("an empty extraction responds { uploadId: null, items: [] }", async () => {
    extractUploadWith.mockResolvedValue({ status: "ok", uploadId: null, items: [] });
    const res = await POST(post({ studentId: "s1", text: "hello" }));
    expect(await res.json()).toEqual({ uploadId: null, items: [] });
  });

  it("401 when not signed in", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(post({ studentId: "s1", text: "x" }));
    expect(res.status).toBe(401);
    expect(extractUploadWith).not.toHaveBeenCalled();
  });

  it("403 when the caller is not the student or an active tutor", async () => {
    extractUploadWith.mockRejectedValue(new ExtractAccessError());
    expect((await POST(post({ studentId: "s1", text: "x" }))).status).toBe(403);
  });

  it("409 with the lesson when the material is already published", async () => {
    extractUploadWith.mockResolvedValue({ status: "published", lessonId: "l1" });
    const res = await POST(post({ studentId: "s1", text: "x" }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "already_published", lessonId: "l1" });
  });

  it("413 for a file over 10 MB, and from content-length before reading the body", async () => {
    const big = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "big.png", { type: "image/png" });
    expect((await POST(post({ studentId: "s1", file: big }))).status).toBe(413);
    const declared = await POST(post({ studentId: "s1", text: "x" }, { "content-length": String(50 * 1024 * 1024) }));
    expect(declared.status).toBe(413);
    expect(extractUploadWith).not.toHaveBeenCalled();
  });

  it("415 for an unsupported file type", async () => {
    const zip = new File(["PK"], "a.zip", { type: "application/zip" });
    expect((await POST(post({ studentId: "s1", file: zip }))).status).toBe(415);
    expect(extractUploadWith).not.toHaveBeenCalled();
  });

  it("passes a supported file through with its media type", async () => {
    const docx = new File(["PK"], "notes.docx", { type: "" });
    await POST(post({ studentId: "s1", file: docx }));
    expect(extractUploadWith.mock.calls[0][1].file.mediaType).toBe(DOCX_TYPE);
  });

  it("400 with no content or no student", async () => {
    expect((await POST(post({ studentId: "s1" }))).status).toBe(400);
    expect((await POST(post({ text: "x" }))).status).toBe(400);
  });

  it("maps Claude errors: cap to 429, upstream to 502, anything else to 500", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    extractUploadWith.mockRejectedValueOnce(new ClaudeCapError());
    const cap = await POST(post({ studentId: "s1", text: "x" }));
    expect(cap.status).toBe(429);
    expect(await cap.json()).toEqual({ error: "daily_limit" });
    extractUploadWith.mockRejectedValueOnce(new ClaudeUpstreamError("down", 500));
    expect((await POST(post({ studentId: "s1", text: "x" }))).status).toBe(502);
    extractUploadWith.mockRejectedValueOnce(new Error("usage increment failed"));
    expect((await POST(post({ studentId: "s1", text: "x" }))).status).toBe(500);
  });
});
