// The student's material: what is "new", moving items between topics, and the
// writes for editing items, topics and lesson dates. The writes run in the
// database (0009_material.sql), each in one transaction with its change_log
// row. planMerge and planUndoMerge describe the same moves over plain arrays:
// the SQL does them, these say what they must be, and the topic page uses
// planUndoMerge to tell the user how many items an undo would move back.
import type { SupabaseClient } from "@supabase/supabase-js";

export type ItemRef = { id: string; lesson_id: string | null; topic_id: string; deleted_at: string | null };
export type LessonRef = { id: string; published_at: string };

/**
 * Items from the most recently published lesson that have never been studied.
 * Newest is by published_at, never lesson_date, so changing a lesson's date
 * cannot make its items new. An edit does not reset it, and a removed item is
 * never new. Hand-added items have no lesson and so are never new.
 */
export function newItems<I extends ItemRef>(items: I[], lessons: LessonRef[], studiedItemIds: Set<string>): I[] {
  let latest: LessonRef | undefined;
  for (const l of lessons) {
    if (!latest || Date.parse(l.published_at) > Date.parse(latest.published_at)) latest = l;
  }
  if (!latest) return [];
  const id = latest.id;
  return items.filter((i) => i.lesson_id === id && !i.deleted_at && !studiedItemIds.has(i.id));
}

/** Every item of `fromId` (removed ones too, so a restore lands in the right topic) moves to `intoId`. */
export function planMerge<I extends { id: string; topic_id: string }>(
  items: I[],
  fromId: string,
  intoId: string,
): { itemIds: string[]; items: I[] } {
  const itemIds = items.filter((i) => i.topic_id === fromId).map((i) => i.id);
  return { itemIds, items: items.map((i) => (i.topic_id === fromId ? { ...i, topic_id: intoId } : i)) };
}

export type MergeRecord = { fromId: string; intoId: string; itemIds: string[] };

/**
 * Moves back exactly the logged items that are still in the target. An item
 * added to the target after the merge, or moved elsewhere since, stays put.
 */
export function planUndoMerge<I extends { id: string; topic_id: string }>(items: I[], merge: MergeRecord): I[] {
  const ids = new Set(merge.itemIds);
  return items.map((i) => (ids.has(i.id) && i.topic_id === merge.intoId ? { ...i, topic_id: merge.fromId } : i));
}

// ---------------------------------------------------------------- database writes

export class MaterialInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MaterialInputError";
  }
}

const MESSAGES: [string, string][] = [
  ["not_signed_in", "You were signed out. Sign in again."],
  ["forbidden", "You can't change this student's material."],
  ["item_not_found", "That item is gone."],
  ["item_removed", "That item has been removed."],
  ["bad_item", "An item needs text and a meaning."],
  ["topic_not_found", "That topic is gone."],
  ["topic_merged", "That topic has been merged into another."],
  ["topic_required", "A topic needs a name."],
  ["name_taken", "You already have a topic with that name."],
  ["same_topic", "Pick a different topic to merge into."],
  ["not_undoable", "That merge can't be undone any more."],
  ["change_not_found", "That change is gone."],
  ["not_restorable", "There is nothing earlier to restore."],
  ["lesson_not_found", "That lesson is gone."],
  ["bad_date", "That date is not valid."],
];

function fail(action: string, message: string): never {
  const known = MESSAGES.find(([code]) => message.includes(code));
  if (known) throw new MaterialInputError(known[1]);
  throw new Error(`${action} failed: ${message}`);
}

type Db = { db: SupabaseClient };

async function call(ctx: Db, fn: string, args: Record<string, unknown>): Promise<void> {
  const { error } = await ctx.db.rpc(fn, args);
  if (error) fail(fn, error.message);
}

export type ItemPatch = {
  text?: string;
  meaning?: string;
  example?: string | null;
  explanation?: string | null;
  topicId?: string;
};

const clean = (v: string | null | undefined) => (typeof v === "string" ? v.trim() : v);

export const renameTopicWith = (ctx: Db, id: string, name: string) =>
  call(ctx, "rename_topic", { p_topic: id, p_name: name });
export const mergeTopicsWith = (ctx: Db, fromId: string, intoId: string) =>
  call(ctx, "merge_topics", { p_from: fromId, p_into: intoId });
export const undoMergeWith = (ctx: Db, changeId: string) => call(ctx, "undo_merge", { p_change: changeId });
export const removeItemWith = (ctx: Db, id: string) => call(ctx, "remove_item", { p_item: id });
export const restoreItemWith = (ctx: Db, changeId: string) => call(ctx, "restore_item", { p_change: changeId });
export const updateLessonDateWith = (ctx: Db, lessonId: string, date: string) =>
  call(ctx, "update_lesson_date", { p_lesson: lessonId, p_date: date });

export function updateItemWith(ctx: Db, id: string, patch: ItemPatch) {
  const out: Record<string, string | null> = {};
  if (patch.text !== undefined) out.text = clean(patch.text) ?? "";
  if (patch.meaning !== undefined) out.meaning = clean(patch.meaning) ?? "";
  if (patch.example !== undefined) out.example = clean(patch.example) ?? null;
  if (patch.explanation !== undefined) out.explanation = clean(patch.explanation) ?? null;
  if (patch.topicId !== undefined) out.topicId = patch.topicId;
  return call(ctx, "update_item", { p_item: id, p_patch: out });
}

// ---------------------------------------------------------------- reading history

export type ChangeRow = {
  id: string;
  entity_id: string;
  actor_id: string | null;
  actor_name: string | null;
  action: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  at: string;
};

/** The merge a topic was last left in, or null. Its `id` is what undoMerge takes. */
export function latestMerge(log: ChangeRow[], topicId: string): (ChangeRow & { record: MergeRecord }) | null {
  const rows = log
    .filter((r) => r.entity_id === topicId && (r.action === "merge" || r.action === "unmerge"))
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const row = rows[0];
  if (!row || row.action !== "merge" || !row.after) return null;
  const intoId = row.after.merged_into;
  const ids = row.after.item_ids;
  if (typeof intoId !== "string" || !Array.isArray(ids)) return null;
  return { ...row, record: { fromId: topicId, intoId, itemIds: ids.filter((x): x is string => typeof x === "string") } };
}

export function whenText(iso: string, timeZone: string): string {
  const format = (tz: string) =>
    new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: tz });
  try {
    return format(timeZone);
  } catch {
    return format("UTC");
  }
}
