// Lesson material to draft items. `extractItems` asks Claude for items and
// checks what comes back; `extractUploadWith` adds who may upload, the
// fingerprint cache and the uploads/draft_items rows.
//
// `db` is the caller's own client, so RLS decides who may write uploads and
// draft items. `admin` is used only to read the student's language, which a
// tutor cannot read directly, and only after the caller is confirmed to be the
// student or an actively linked tutor.
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import mammoth from "mammoth";
import { callClaude, type ClaudeArgs, type ContentBlock } from "./claude";

/** Bump when the prompt or tool changes, so cached drafts are re-extracted. */
export const PROMPT_VERSION = "1";
export const EXTRACT_VERSION = `${PROMPT_VERSION}:${process.env.CLAUDE_MODEL || "claude-sonnet-4-6"}`;

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const KINDS = ["word", "phrase", "grammar"] as const;
export type Kind = (typeof KINDS)[number];

export type DraftItem = {
  kind: Kind;
  text: string;
  meaning: string;
  example: string | null;
  explanation: string | null;
  topic: { existingId: string } | { newName: string };
};

export const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const BY_EXTENSION: Record<string, string> = {
  txt: "text/plain",
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  docx: DOCX_TYPE,
};
const SUPPORTED = new Set(Object.values(BY_EXTENSION));

/** The media type to treat a file as, or null when it is not supported. */
export function supportedMediaType(declared: string, fileName: string): string | null {
  const type = declared.split(";")[0].trim().toLowerCase();
  if (SUPPORTED.has(type)) return type;
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  return BY_EXTENSION[ext] ?? null;
}

export type ExtractContent = { text?: string; file?: { mediaType: string; base64: string } };

export type ExtractArgs = {
  userId: string;
  language: string;
  existingTopics: { id: string; name: string }[];
  content: ExtractContent;
  categoryHint?: string;
};

type CallFn = <T>(args: ClaudeArgs) => Promise<T>;

type RawItem = {
  kind?: unknown;
  text?: unknown;
  meaning?: unknown;
  example?: unknown;
  explanation?: unknown;
  existing_topic_id?: unknown;
  topic_name?: unknown;
};

const TOOL = {
  name: "save_items",
  description: "Save the study items found in the lesson material.",
  input_schema: {
    type: "object",
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            kind: { type: "string", enum: [...KINDS] },
            text: { type: "string", description: "The item in the target language." },
            meaning: { type: "string", description: "The meaning in English." },
            example: { type: ["string", "null"], description: "A short example sentence in the target language, or null." },
            explanation: {
              type: ["string", "null"],
              description: "For grammar only: a short explanation in English. Null for words and phrases.",
            },
            existing_topic_id: {
              type: ["string", "null"],
              description: "The id of the existing topic this item belongs to, or null if none fits.",
            },
            topic_name: {
              type: "string",
              description: "The topic's name: the existing topic's name when existing_topic_id is set, otherwise a short new name.",
            },
          },
          required: ["kind", "text", "meaning", "example", "explanation", "existing_topic_id", "topic_name"],
        },
      },
    },
    required: ["items"],
  },
};

function languageName(code: string): string {
  try {
    const name = new Intl.DisplayNames(["en"], { type: "language" }).of(code);
    return name && name !== code ? `${name} (${code})` : code;
  } catch {
    return code;
  }
}

export function buildSystemPrompt(language: string, existingTopics: { id: string; name: string }[], categoryHint?: string): string {
  const topics = existingTopics.length
    ? existingTopics.map((t) => `- id: ${t.id} | name: ${t.name}`).join("\n")
    : "(none yet)";
  return [
    `You turn a language tutor's lesson material into study items for a student learning ${languageName(language)}.`,
    "",
    "Every item is exactly one kind:",
    "- word: a single word or a fixed compound, with its English meaning.",
    "- phrase: a multi-word expression, question or sentence the student should be able to say, with its English meaning.",
    "- grammar: a rule or pattern (a conjugation, an agreement, a construction). Give it a short English `explanation`. `text` names the pattern in the target language or with a short example.",
    "Words and phrases have `explanation` null.",
    "",
    "Topic and kind are independent. A topic never decides the kind: \"Numbers\" can hold words, and \"forming numbers\" is a grammar item in the same topic.",
    "",
    "Give every item one primary topic. These are the student's existing topics:",
    topics,
    "Whenever an existing topic fits, set `existing_topic_id` to its id and `topic_name` to its name. Only when none fits, set `existing_topic_id` to null and give a short new `topic_name`. Reuse the same new name for items that belong together.",
    categoryHint ? `\nThe uploader says this material is about: ${categoryHint}` : "",
    "",
    "Only include material actually taught in the lesson. Skip greetings to the student, admin notes and anything that is not something to learn. Keep meanings short. `example` is an optional short sentence in the target language, or null. If there is nothing to learn, return an empty list.",
    "Call save_items once with all the items.",
  ].join("\n");
}

async function contentBlocks(content: ExtractContent): Promise<ContentBlock[]> {
  const blocks: ContentBlock[] = [];
  const texts: string[] = [];
  if (content.text?.trim()) texts.push(content.text);
  const file = content.file;
  if (file) {
    if (file.mediaType === "text/plain") {
      texts.push(Buffer.from(file.base64, "base64").toString("utf8"));
    } else if (file.mediaType === DOCX_TYPE) {
      const { value } = await mammoth.extractRawText({ buffer: Buffer.from(file.base64, "base64") });
      texts.push(value);
    } else if (file.mediaType === "application/pdf") {
      blocks.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: file.base64 } });
    } else if (IMAGE_TYPES.includes(file.mediaType)) {
      blocks.push({ type: "image", source: { type: "base64", media_type: file.mediaType, data: file.base64 } });
    } else {
      throw new Error(`Unsupported media type ${file.mediaType}`);
    }
  }
  const text = texts.filter((t) => t.trim()).join("\n\n");
  blocks.push({
    type: "text",
    text: text ? `Lesson material:\n\n${text}` : "Extract the study items from the lesson material above.",
  });
  return blocks;
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Checks one item from the model. Returns null for an item that cannot be used. */
export function toDraftItem(raw: RawItem, existingTopics: { id: string; name: string }[]): DraftItem | null {
  if (typeof raw !== "object" || raw === null) return null;
  const kind = raw.kind;
  if (typeof kind !== "string" || !(KINDS as readonly string[]).includes(kind)) return null;
  const text = str(raw.text);
  const meaning = str(raw.meaning);
  if (!text || !meaning) return null;

  let topic: DraftItem["topic"];
  const byId = existingTopics.find((t) => t.id === raw.existing_topic_id);
  const name = str(raw.topic_name);
  const byName = name ? existingTopics.find((t) => t.name.trim().toLowerCase() === name.toLowerCase()) : undefined;
  if (byId) topic = { existingId: byId.id };
  else if (byName) topic = { existingId: byName.id };
  else topic = { newName: name ?? "General" };

  return {
    kind: kind as Kind,
    text,
    meaning,
    example: str(raw.example),
    explanation: kind === "grammar" ? str(raw.explanation) : null,
    topic,
  };
}

export async function extractItems(args: ExtractArgs, deps?: { call?: CallFn }): Promise<DraftItem[]> {
  const call: CallFn = deps?.call ?? (<T>(a: ClaudeArgs) => callClaude<T>(a));
  const out = await call<{ items?: unknown }>({
    userId: args.userId,
    system: buildSystemPrompt(args.language, args.existingTopics, args.categoryHint),
    messages: [{ role: "user", content: await contentBlocks(args.content) }],
    tool: TOOL,
    maxTokens: 8000,
    timeoutMs: 120_000,
  });
  const raw = Array.isArray(out?.items) ? (out.items as RawItem[]) : [];
  return raw.map((r) => toDraftItem(r, args.existingTopics)).filter((i): i is DraftItem => i !== null);
}

// ---------------------------------------------------------------- uploads

export class ExtractAccessError extends Error {
  constructor() {
    super("You can't add material for this student.");
    this.name = "ExtractAccessError";
  }
}

export type UploadInput = {
  studentId: string;
  text?: string;
  file?: { mediaType: string; bytes: Uint8Array };
  categoryHint?: string;
};

export type ExtractResult =
  | { status: "ok"; uploadId: string | null; items: DraftItem[] }
  | { status: "published"; lessonId: string | null };

export type ExtractContext = { db: SupabaseClient; admin: SupabaseClient; userId: string };

/** SHA-256 of the text or the file bytes; of both hashes when both are given. */
export function contentHash(text: string | undefined, file: Uint8Array | undefined): string {
  const sha = (b: Uint8Array | string) => createHash("sha256").update(b).digest("hex");
  const hasText = !!text?.trim();
  if (hasText && file) return sha(`${sha(text!)}:${sha(file)}`);
  if (file) return sha(file);
  return sha(text ?? "");
}

type DraftRow = {
  kind: string;
  text: string;
  meaning: string;
  example: string | null;
  explanation: string | null;
  topic_id: string | null;
  new_topic_name: string | null;
};

function fromRow(r: DraftRow): DraftItem {
  return {
    kind: r.kind as Kind,
    text: r.text,
    meaning: r.meaning,
    example: r.example,
    explanation: r.explanation,
    topic: r.topic_id ? { existingId: r.topic_id } : { newName: r.new_topic_name ?? "General" },
  };
}

function toRow(uploadId: string, i: DraftItem, position: number) {
  return {
    upload_id: uploadId,
    position,
    kind: i.kind,
    text: i.text,
    meaning: i.meaning,
    example: i.example,
    explanation: i.explanation,
    topic_id: "existingId" in i.topic ? i.topic.existingId : null,
    new_topic_name: "newName" in i.topic ? i.topic.newName : null,
  };
}

async function draftItemsOf(db: SupabaseClient, uploadId: string): Promise<DraftItem[]> {
  const { data, error } = await db
    .from("draft_items")
    .select("kind, text, meaning, example, explanation, topic_id, new_topic_name")
    .eq("upload_id", uploadId)
    .order("position");
  if (error) throw new Error(`draft items read failed: ${error.message}`);
  return (data as DraftRow[]).map(fromRow);
}

async function insertDraftItems(db: SupabaseClient, uploadId: string, items: DraftItem[]): Promise<void> {
  const { error } = await db.from("draft_items").insert(items.map((i, n) => toRow(uploadId, i, n)));
  if (error) throw new Error(`draft items insert failed: ${error.message}`);
}

async function mayUpload(ctx: ExtractContext, studentId: string): Promise<boolean> {
  if (ctx.userId === studentId) return true;
  const { data, error } = await ctx.db
    .from("tutor_links")
    .select("id")
    .eq("tutor_id", ctx.userId)
    .eq("student_id", studentId)
    .eq("status", "active")
    .limit(1);
  if (error) throw new Error(`link check failed: ${error.message}`);
  return data.length > 0;
}

/**
 * Extracts draft items from lesson material for a student, reusing the
 * caller's earlier draft of the same content and extraction version.
 * A failed or empty extraction writes nothing.
 */
export async function extractUploadWith(
  ctx: ExtractContext,
  input: UploadInput,
  deps?: { call?: CallFn; version?: string },
): Promise<ExtractResult> {
  const { db, admin, userId } = ctx;
  const { studentId } = input;
  const version = deps?.version ?? EXTRACT_VERSION;

  if (!(await mayUpload(ctx, studentId))) throw new ExtractAccessError();

  const hash = contentHash(input.text, input.file?.bytes);
  const { data: existing, error: findError } = await db
    .from("uploads")
    .select("id, status, lesson_id")
    .eq("student_id", studentId)
    .eq("uploader_id", userId)
    .eq("content_hash", hash)
    .eq("extract_version", version)
    .maybeSingle();
  if (findError) throw new Error(`upload lookup failed: ${findError.message}`);

  if (existing?.status === "published") return { status: "published", lessonId: existing.lesson_id };
  if (existing?.status === "draft") {
    return { status: "ok", uploadId: existing.id, items: await draftItemsOf(db, existing.id) };
  }

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("language")
    .eq("id", studentId)
    .single();
  if (profileError || !profile) throw new Error(`student language read failed: ${profileError?.message}`);

  const { data: topics, error: topicsError } = await db
    .from("topics")
    .select("id, name")
    .eq("student_id", studentId)
    .is("merged_into", null)
    .order("name");
  if (topicsError) throw new Error(`topics read failed: ${topicsError.message}`);

  const items = await extractItems(
    {
      userId,
      language: profile.language,
      existingTopics: topics,
      categoryHint: input.categoryHint,
      content: {
        text: input.text,
        file: input.file && {
          mediaType: input.file.mediaType,
          base64: Buffer.from(input.file.bytes).toString("base64"),
        },
      },
    },
    deps,
  );
  if (!items.length) return { status: "ok", uploadId: null, items: [] };

  if (existing) {
    // Discarded earlier: replace its items, then bring it back as a draft. If
    // the insert fails it stays discarded, so a retry extracts again.
    const { error: clearError } = await db.from("draft_items").delete().eq("upload_id", existing.id);
    if (clearError) throw new Error(`draft items clear failed: ${clearError.message}`);
    await insertDraftItems(db, existing.id, items);
    const { error: reviveError } = await db.from("uploads").update({ status: "draft" }).eq("id", existing.id);
    if (reviveError) throw new Error(`upload update failed: ${reviveError.message}`);
    return { status: "ok", uploadId: existing.id, items };
  }

  const { data: upload, error: insertError } = await db
    .from("uploads")
    .insert({ student_id: studentId, uploader_id: userId, content_hash: hash, extract_version: version })
    .select("id")
    .single();
  if (insertError) {
    // The same content raced in from another request: use that draft.
    if (insertError.code === "23505") return extractUploadWith(ctx, input, deps);
    throw new Error(`upload insert failed: ${insertError.message}`);
  }
  try {
    await insertDraftItems(db, upload.id, items);
  } catch (err) {
    // An upload with no items would be served from the cache as empty, so
    // mark it discarded and the next try extracts again.
    await db.from("uploads").update({ status: "discarded" }).eq("id", upload.id);
    throw err;
  }
  return { status: "ok", uploadId: upload.id, items };
}
