// Editing, restoring and merging against the real schema and RLS. Needs the
// test project (`npm run test:rls`).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, deleteUsers, link, makeUser, uniqueEmail } from "./helpers";
import { addItemWith } from "../../lib/publish";
import { MaterialInputError, mergeTopicsWith, restoreItemWith, undoMergeWith, updateItemWith } from "../../lib/material";

type User = { id: string; client: SupabaseClient };
let student: User;
let tutor: User;
let stranger: User;

async function topic(name: string): Promise<string> {
  const { data, error } = await admin().from("topics").insert({ student_id: student.id, name }).select("id").single();
  if (error) throw new Error(error.message);
  return data.id;
}

const addTo = (topicId: string, text: string) =>
  addItemWith({ db: student.client }, { kind: "word", text, meaning: `meaning of ${text}`, example: null, explanation: null, topicId });

async function log(entity: string, entityId: string) {
  const { data, error } = await admin()
    .from("change_log")
    .select("id, action, actor_id, before, after, at")
    .eq("entity", entity)
    .eq("entity_id", entityId)
    .order("at");
  if (error) throw new Error(error.message);
  return data;
}

beforeAll(async () => {
  student = await makeUser(uniqueEmail("hist-student"));
  tutor = await makeUser(uniqueEmail("hist-tutor"), { tutor: true });
  stranger = await makeUser(uniqueEmail("hist-stranger"), { tutor: true });
  await link(tutor.id, student.id, "active");
  await admin().from("profiles").update({ display_name: "Daniel" }).eq("id", tutor.id);
});
afterAll(deleteUsers);

describe("item history", () => {
  it("a tutor edit then restoreItem makes the original text current and change_log holds create, edit and restore in order", async () => {
    const t = await topic("Colours");
    const id = await addTo(t, "rojo");
    await updateItemWith({ db: tutor.client }, id, { text: "roja", meaning: "red (f)" });

    const afterEdit = await log("item", id);
    expect(afterEdit.map((r) => r.action)).toEqual(["create", "edit"]);
    const edit = afterEdit[1];
    expect(edit.actor_id).toBe(tutor.id);

    await restoreItemWith({ db: student.client }, edit.id);

    const { data: item } = await admin().from("items").select("text, meaning, last_edited_by, created_by").eq("id", id).single();
    expect(item).toMatchObject({ text: "rojo", meaning: "meaning of rojo", last_edited_by: student.id, created_by: student.id });

    const rows = await log("item", id);
    expect(rows.map((r) => r.action)).toEqual(["create", "edit", "restore"]);
    // Earlier rows are untouched by the restore.
    expect(rows[0]).toEqual(afterEdit[0]);
    expect(rows[1]).toEqual(afterEdit[1]);
  });

  it("a stranger cannot edit, restore or merge, and is refused for lack of access", async () => {
    const forbidden = { name: "MaterialInputError", message: "You can't change this student's material." };
    const t = await topic("Private");
    const id = await addTo(t, "secreto");
    // A real edit by someone allowed, so the stranger has a restorable change to aim at.
    await updateItemWith({ db: student.client }, id, { text: "secreta" });
    const edit = (await log("item", id)).find((r) => r.action === "edit")!;

    await expect(updateItemWith({ db: stranger.client }, id, { text: "x" })).rejects.toMatchObject(forbidden);
    await expect(restoreItemWith({ db: stranger.client }, edit.id)).rejects.toMatchObject(forbidden);
    const t2 = await topic("Private two");
    await expect(mergeTopicsWith({ db: stranger.client }, t, t2)).rejects.toMatchObject(forbidden);

    const { data: item } = await admin().from("items").select("text").eq("id", id).single();
    expect(item!.text).toBe("secreta");
    expect((await log("item", id)).map((r) => r.action)).toEqual(["create", "edit"]);
  });

  it("saving an item without changing it writes no log row and leaves last_edited alone", async () => {
    const t = await topic("No-op");
    const id = await addTo(t, "nada");
    await updateItemWith({ db: student.client }, id, { text: "nada", meaning: "meaning of nada" });
    expect((await log("item", id)).map((r) => r.action)).toEqual(["create"]);
    const { data } = await admin().from("items").select("last_edited_by, last_edited_at").eq("id", id).single();
    expect(data).toEqual({ last_edited_by: null, last_edited_at: null });
  });

  it("updating or deleting a change_log row fails for student and tutor", async () => {
    const t = await topic("Log guard");
    const id = await addTo(t, "uno");
    const [row] = await log("item", id);
    for (const who of [student, tutor]) {
      const upd = await who.client.from("change_log").update({ action: "remove" }).eq("id", row.id).select();
      expect(upd.error !== null || (upd.data ?? []).length === 0).toBe(true);
      const del = await who.client.from("change_log").delete().eq("id", row.id).select();
      expect(del.error !== null || (del.data ?? []).length === 0).toBe(true);
    }
    const [after] = await log("item", id);
    expect(after).toEqual(row);

    // Even the service role cannot rewrite history.
    const { error } = await admin().from("change_log").update({ action: "remove" }).eq("id", row.id);
    expect(error?.message).toMatch(/append-only/);
  });
});

describe("direct writes are closed", () => {
  const unchanged = (r: { error: unknown; data: unknown[] | null }) => r.error !== null || (r.data ?? []).length === 0;

  it("a student's direct update of items.text fails or affects 0 rows", async () => {
    const id = await addTo(await topic("Direct student"), "fijo");
    const r = await student.client.from("items").update({ text: "forged" }).eq("id", id).select("id");
    expect(unchanged(r)).toBe(true);
    const { data } = await admin().from("items").select("text").eq("id", id).single();
    expect(data!.text).toBe("fijo");
  });

  it("a linked tutor's direct update of items.deleted_at fails or affects 0 rows", async () => {
    const id = await addTo(await topic("Direct tutor"), "firme");
    const r = await tutor.client.from("items").update({ deleted_at: new Date().toISOString() }).eq("id", id).select("id");
    expect(unchanged(r)).toBe(true);
    const { data } = await admin().from("items").select("deleted_at").eq("id", id).single();
    expect(data!.deleted_at).toBeNull();
    expect((await log("item", id)).map((x) => x.action)).toEqual(["create"]);
  });

  it("a student's direct delete of a topic fails or affects 0 rows", async () => {
    const t = await topic("Direct delete");
    const r = await student.client.from("topics").delete().eq("id", t).select("id");
    expect(unchanged(r)).toBe(true);
    const { data } = await admin().from("topics").select("id").eq("id", t);
    expect(data).toHaveLength(1);
  });

  it("a student and a linked tutor can still read their rows", async () => {
    const t = await topic("Still readable");
    for (const who of [student, tutor]) {
      const { data, error } = await who.client.from("topics").select("id").eq("id", t);
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
    }
    const { data } = await stranger.client.from("topics").select("id").eq("id", t);
    expect(data ?? []).toHaveLength(0);
  });
});

describe("merge and undo", () => {
  it("merge then undoMerge leaves session_results counts per item unchanged", async () => {
    const from = await topic("Merge from");
    const into = await topic("Merge into");
    const a = await addTo(from, "casa");
    const b = await addTo(from, "perro");
    const c = await addTo(into, "gato");

    const { data: session } = await admin()
      .from("sessions")
      .insert({ student_id: student.id, mode: "flashcards" })
      .select("id")
      .single();
    await admin().from("session_results").insert([
      { session_id: session!.id, item_id: a, outcome: "right" },
      { session_id: session!.id, item_id: a, outcome: "missed" },
      { session_id: session!.id, item_id: c, outcome: "came_up" },
    ]);
    const counts = async () => {
      const { data } = await admin().from("session_results").select("item_id").in("item_id", [a, b, c]);
      const out: Record<string, number> = {};
      for (const r of data ?? []) out[r.item_id] = (out[r.item_id] ?? 0) + 1;
      return out;
    };
    const before = await counts();

    await mergeTopicsWith({ db: tutor.client }, from, into);
    const { data: moved } = await admin().from("items").select("id, topic_id").in("id", [a, b, c]);
    expect(moved!.every((i) => i.topic_id === into)).toBe(true);
    const { data: fromRow } = await admin().from("topics").select("merged_into").eq("id", from).single();
    expect(fromRow!.merged_into).toBe(into);

    // Added to the merged topic's live target after the merge: must stay.
    const later = await addTo(into, "pez");
    const [mergeRow] = (await log("topic", from)).filter((r) => r.action === "merge");
    expect((mergeRow.after as { item_ids: string[] }).item_ids.sort()).toEqual([a, b].sort());

    await undoMergeWith({ db: student.client }, mergeRow.id);
    const { data: back } = await admin().from("items").select("id, topic_id").in("id", [a, b, c, later]);
    const where = Object.fromEntries(back!.map((i) => [i.id, i.topic_id]));
    expect(where).toEqual({ [a]: from, [b]: from, [c]: into, [later]: into });
    const { data: fromAfter } = await admin().from("topics").select("merged_into").eq("id", from).single();
    expect(fromAfter!.merged_into).toBeNull();

    expect(await counts()).toEqual(before);
    expect((await log("topic", from)).map((r) => r.action)).toEqual(["merge", "unmerge"]);

    // A second undo of the same merge is refused.
    await expect(undoMergeWith({ db: student.client }, mergeRow.id)).rejects.toBeInstanceOf(MaterialInputError);
  });
});
