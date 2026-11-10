// Publishing reviewed draft items, and adding one item by hand. The writes
// happen in the database (0006_publish.sql) in one transaction; this file
// checks what the browser sent, works out when a tutor's notice may go out,
// and turns the database's error codes into something a route can answer with.
import type { SupabaseClient } from "@supabase/supabase-js";
import { KINDS, type DraftItem, type Kind } from "./extract";

export const MAX_PUBLISH_ITEMS = 500;
const MAX_FIELD = 2000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class PublishInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublishInputError";
  }
}

/** A failure the database reported by name. `code` is what the route maps to a status. */
export class PublishError extends Error {
  constructor(public code: "not_found" | "forbidden" | "already_published" | "bad_topic" | "bad_item" | "no_items" | "profile_unreadable") {
    super(code);
    this.name = "PublishError";
  }
}

export type PublishInput = { uploadId: string; items: DraftItem[]; lessonDate?: string };
export type NewItem = Omit<DraftItem, "topic"> & { topicId?: string; newTopicName?: string };

const clean = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, MAX_FIELD) : null);

function validDate(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(v);
}

/** One edited item from the browser. Throws PublishInputError for anything unusable. */
export function validateItem(raw: unknown): DraftItem {
  if (typeof raw !== "object" || raw === null) throw new PublishInputError("Each item needs text and a meaning.");
  const r = raw as Record<string, unknown>;
  if (typeof r.kind !== "string" || !(KINDS as readonly string[]).includes(r.kind)) {
    throw new PublishInputError("Each item must be a word, phrase or grammar.");
  }
  const kind = r.kind as Kind;
  const text = clean(r.text);
  const meaning = clean(r.meaning);
  if (!text || !meaning) throw new PublishInputError("Each item needs text and a meaning.");

  const t = r.topic as { existingId?: unknown; newName?: unknown } | null | undefined;
  let topic: DraftItem["topic"];
  if (t && typeof t.existingId === "string") {
    if (!UUID.test(t.existingId)) throw new PublishInputError("Pick a topic for every item.");
    topic = { existingId: t.existingId };
  } else {
    const name = t ? clean(t.newName) : null;
    if (!name) throw new PublishInputError("Pick a topic for every item.");
    topic = { newName: name };
  }
  return {
    kind,
    text,
    meaning,
    example: clean(r.example),
    explanation: kind === "grammar" ? clean(r.explanation) : null,
    topic,
  };
}

export function validatePublishInput(body: unknown): PublishInput {
  if (typeof body !== "object" || body === null) throw new PublishInputError("Bad request.");
  const b = body as Record<string, unknown>;
  if (typeof b.uploadId !== "string" || !UUID.test(b.uploadId)) throw new PublishInputError("Missing upload.");
  if (!Array.isArray(b.items) || b.items.length === 0) throw new PublishInputError("There is nothing to publish.");
  if (b.items.length > MAX_PUBLISH_ITEMS) throw new PublishInputError("There are too many items to publish at once.");
  const out: PublishInput = { uploadId: b.uploadId, items: b.items.map(validateItem) };
  if (b.lessonDate !== undefined && b.lessonDate !== null && b.lessonDate !== "") {
    if (typeof b.lessonDate !== "string" || !validDate(b.lessonDate)) throw new PublishInputError("That lesson date is not valid.");
    out.lessonDate = b.lessonDate;
  }
  return out;
}

const toDb = (i: DraftItem) => ({
  kind: i.kind,
  text: i.text,
  meaning: i.meaning,
  example: i.example,
  explanation: i.explanation,
  ...("existingId" in i.topic ? { topicId: i.topic.existingId } : { newName: i.topic.newName }),
});

function mapError(message: string): PublishError | null {
  if (message.includes("upload_not_found")) return new PublishError("not_found");
  if (message.includes("forbidden")) return new PublishError("forbidden");
  if (message.includes("already_published")) return new PublishError("already_published");
  if (message.includes("topic_not_found") || message.includes("topic_required")) return new PublishError("bad_topic");
  if (message.includes("bad_item")) return new PublishError("bad_item");
  if (message.includes("student_profile_unreadable")) return new PublishError("profile_unreadable");
  if (message.includes("no_items")) return new PublishError("no_items");
  return null;
}

export type PublishContext = { db: SupabaseClient; admin?: SupabaseClient };

/**
 * Publishes the caller's draft upload. The database checks who the caller is
 * (the student, or a tutor with an active link), claims the upload so a
 * second call with the same id is rejected, and works out the lesson date and
 * when a tutor's notice may go out from the student's own time zone and quiet
 * hours. Nothing about timing comes from the caller.
 */
export async function publishUploadWith(ctx: PublishContext, input: PublishInput): Promise<{ lessonId: string; itemCount: number }> {
  const { db } = ctx;
  const { data, error } = await db.rpc("publish_upload", {
    p_upload: input.uploadId,
    p_items: input.items.map(toDb),
    p_lesson_date: input.lessonDate ?? null,
  });
  if (error) {
    const known = mapError(error.message);
    if (known) throw known;
    throw new Error(`publish failed: ${error.message}`);
  }
  const out = data as { lessonId: string; itemCount: number };
  return { lessonId: out.lessonId, itemCount: out.itemCount };
}

/** Adds one item to the caller's own material. Returns its id. */
export async function addItemWith(ctx: { db: SupabaseClient }, item: NewItem): Promise<string> {
  const topic = item.topicId ? { existingId: item.topicId } : { newName: item.newTopicName ?? "" };
  const valid = validateItem({ ...item, topic });
  const { data, error } = await ctx.db.rpc("add_item", { p_item: toDb(valid) });
  if (error) {
    const known = mapError(error.message);
    if (known) throw known;
    throw new Error(`add item failed: ${error.message}`);
  }
  return data as string;
}
