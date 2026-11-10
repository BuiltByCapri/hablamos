import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, deleteUsers, link, makeUser, uniqueEmail } from "./helpers";

type User = { id: string; client: SupabaseClient };

let student: User;
let tutor: User;
let secondTutor: User;
let stranger: User;

const ids: Record<string, string> = {};

async function insertOne(client: SupabaseClient, table: string, row: Record<string, unknown>): Promise<string> {
  const { data, error } = await client.from(table).insert(row).select("id").single();
  if (error) throw new Error(`${table} insert failed: ${error.message}`);
  return data.id as string;
}

async function rows(client: SupabaseClient, table: string, column: string, value: string) {
  const { data, error } = await client.from(table).select("*").eq(column, value);
  expect(error).toBeNull();
  return data!;
}

beforeAll(async () => {
  student = await makeUser(uniqueEmail("p-student"));
  tutor = await makeUser(uniqueEmail("p-tutor"), { tutor: true });
  secondTutor = await makeUser(uniqueEmail("p-tutor2"), { tutor: true });
  stranger = await makeUser(uniqueEmail("p-stranger"), { tutor: true });
  await link(tutor.id, student.id, "active");
  await link(secondTutor.id, student.id, "active");

  const a = admin();
  await a.from("profiles").update({ display_name: "Student S", level: "A2", timezone: "Europe/Madrid" }).eq("id", student.id);
  await a.from("profiles").update({ display_name: "Tutor T" }).eq("id", tutor.id);
  await a.from("profiles").update({ display_name: "Tutor Two" }).eq("id", secondTutor.id);

  ids.topic = await insertOne(a, "topics", { student_id: student.id, name: "Food" });
  ids.lesson = await insertOne(a, "lessons", {
    student_id: student.id,
    tutor_id: tutor.id,
    published_by: tutor.id,
    publisher_name: "Tutor T",
    source: "tutor",
  });
  ids.item = await insertOne(a, "items", {
    student_id: student.id,
    topic_id: ids.topic,
    kind: "word",
    text: "pan",
    meaning: "bread",
    created_by: tutor.id,
    created_by_name: "Tutor T",
    created_by_role: "tutor",
    lesson_id: ids.lesson,
  });
  await insertOne(a, "change_log", {
    student_id: student.id,
    entity: "item",
    entity_id: ids.item,
    actor_id: tutor.id,
    action: "create",
  });
  ids.session = await insertOne(admin(), "sessions", { student_id: student.id, mode: "flashcards" });
  await insertOne(admin(), "session_results", { session_id: ids.session, item_id: ids.item, outcome: "right" });
  ids.tutorUpload = await insertOne(tutor.client, "uploads", {
    student_id: student.id,
    uploader_id: tutor.id,
    content_hash: "tutor-draft",
    extract_version: "v1",
  });
  ids.tutorDraft = await insertOne(tutor.client, "draft_items", {
    upload_id: ids.tutorUpload,
    kind: "word",
    text: "leche",
    meaning: "milk",
  });
  ids.notification = await insertOne(a, "notifications", {
    student_id: student.id,
    kind: "publish",
    dedupe_key: `publish:${ids.lesson}`,
  });
});

afterAll(async () => {
  await deleteUsers();
});

describe("profiles", () => {
  it("a linked tutor cannot read the student's profile row", async () => {
    expect(await rows(tutor.client, "profiles", "id", student.id)).toHaveLength(0);
  });

  it("student_profile_for_tutor gives a linked tutor only the learning fields", async () => {
    const { data, error } = await tutor.client.rpc("student_profile_for_tutor", { student: student.id });
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(Object.keys(data![0]).sort()).toEqual(
      ["display_name", "focus", "focus_updated_at", "focus_updated_by", "level", "level_updated_at", "level_updated_by"].sort(),
    );
    expect(data![0]).toMatchObject({ display_name: "Student S", level: "A2" });
  });

  it("student_profile_for_tutor gives an unlinked user nothing", async () => {
    const { data } = await stranger.client.rpc("student_profile_for_tutor", { student: student.id });
    expect(data ?? []).toHaveLength(0);
  });

  it("tutor_names_for_student lists the student's active tutors by display name", async () => {
    const { data, error } = await student.client.rpc("tutor_names_for_student");
    expect(error).toBeNull();
    expect((data as { display_name: string }[]).map((r) => r.display_name).sort()).toEqual(["Tutor T", "Tutor Two"]);
    expect(await rows(student.client, "profiles", "id", tutor.id)).toHaveLength(0);
  });

  it("a linked tutor sets level through update_shared_setting, attributed and logged", async () => {
    const { error } = await tutor.client.rpc("update_shared_setting", { student: student.id, field: "level", value: "B1" });
    expect(error).toBeNull();
    const { data: profile } = await admin().from("profiles").select("level, level_updated_by").eq("id", student.id).single();
    expect(profile).toEqual({ level: "B1", level_updated_by: tutor.id });
    const log = await rows(admin(), "change_log", "entity_id", student.id);
    expect(log.at(-1)).toMatchObject({ entity: "profile", actor_id: tutor.id, before: { level: "A2" }, after: { level: "B1" } });
  });

  it("update_shared_setting refuses an unlinked user", async () => {
    const { error } = await stranger.client.rpc("update_shared_setting", { student: student.id, field: "focus", value: "x" });
    expect(error).not.toBeNull();
  });
});

describe("drafts and uploads", () => {
  it("a student cannot read, edit or delete a tutor's draft", async () => {
    expect(await rows(student.client, "uploads", "id", ids.tutorUpload)).toHaveLength(0);
    expect(await rows(student.client, "draft_items", "id", ids.tutorDraft)).toHaveLength(0);
    const upd = await student.client.from("draft_items").update({ text: "x" }).eq("id", ids.tutorDraft).select("id");
    expect(upd.data ?? []).toHaveLength(0);
    const del = await student.client.from("uploads").delete().eq("id", ids.tutorUpload).select("id");
    expect(del.data ?? []).toHaveLength(0);
    expect(await rows(admin(), "draft_items", "id", ids.tutorDraft)).toHaveLength(1);
  });

  it("an upload must name the caller as uploader", async () => {
    const asStudent = await student.client.from("uploads").insert({
      student_id: student.id,
      uploader_id: tutor.id,
      content_hash: "forged",
      extract_version: "v1",
    });
    expect(asStudent.error).not.toBeNull();
    const asTutor = await tutor.client.from("uploads").insert({
      student_id: student.id,
      uploader_id: secondTutor.id,
      content_hash: "forged",
      extract_version: "v1",
    });
    expect(asTutor.error).not.toBeNull();
  });
});

describe("notifications", () => {
  it("a student can read but not write their notifications", async () => {
    expect(await rows(student.client, "notifications", "id", ids.notification)).toHaveLength(1);
    const ins = await student.client
      .from("notifications")
      .insert({ student_id: student.id, kind: "daily", dedupe_key: `daily:${student.id}:forged` });
    expect(ins.error).not.toBeNull();
    const upd = await student.client
      .from("notifications")
      .update({ sent_at: new Date().toISOString() })
      .eq("id", ids.notification)
      .select("id");
    expect(upd.data ?? []).toHaveLength(0);
    const del = await student.client.from("notifications").delete().eq("id", ids.notification).select("id");
    expect(del.data ?? []).toHaveLength(0);
  });
});

describe("items", () => {
  it("a student cannot hard-delete an item", async () => {
    const del = await student.client.from("items").delete().eq("id", ids.item).select("id");
    expect(del.data ?? []).toHaveLength(0);
    expect(await rows(admin(), "items", "id", ids.item)).toHaveLength(1);
    expect(await rows(admin(), "session_results", "item_id", ids.item)).toHaveLength(1);
  });

  it("account deletion still removes all of a student's rows", async () => {
    const gone = await makeUser(uniqueEmail("p-gone"));
    const topic = await insertOne(admin(), "topics", { student_id: gone.id, name: "T" });
    await insertOne(admin(), "items", {
      student_id: gone.id,
      topic_id: topic,
      kind: "word",
      text: "a",
      meaning: "a",
      created_by: gone.id,
      created_by_role: "student",
    });
    const { error } = await admin().auth.admin.deleteUser(gone.id);
    expect(error).toBeNull();
    expect(await rows(admin(), "items", "student_id", gone.id)).toHaveLength(0);
    expect(await rows(admin(), "topics", "student_id", gone.id)).toHaveLength(0);
  });
});

describe("attribution", () => {
  it("change_log.actor_name comes from the actor's profile, not the client", async () => {
    const { data, error } = await tutor.client
      .from("change_log")
      .insert({
        student_id: student.id,
        entity: "item",
        entity_id: ids.item,
        actor_id: tutor.id,
        actor_name: "Someone Else",
        action: "edit",
      })
      .select("actor_name")
      .single();
    expect(error).toBeNull();
    expect(data!.actor_name).toBe("Tutor T");
  });

  it("a tutor cannot rewrite who created an item", async () => {
    for (const patch of [
      { created_by: secondTutor.id },
      { created_by_name: "Forged" },
      { created_by_role: "student" },
      { import_key: "forged" },
    ]) {
      const { data, error } = await tutor.client.from("items").update(patch).eq("id", ids.item).select("id");
      expect(error !== null || (data ?? []).length === 0, JSON.stringify(patch)).toBe(true);
    }
    const { data } = await admin().from("items").select("created_by, created_by_name, created_by_role, import_key").eq("id", ids.item).single();
    expect(data).toEqual({ created_by: tutor.id, created_by_name: "Tutor T", created_by_role: "tutor", import_key: null });
  });

  it("a tutor cannot rewrite who published a lesson, but can change its date through update_lesson_date", async () => {
    for (const patch of [
      { published_by: secondTutor.id },
      { publisher_name: "Forged" },
      { published_at: "2020-01-01T00:00:00Z" },
      { source: "student" },
    ]) {
      const { data, error } = await tutor.client.from("lessons").update(patch).eq("id", ids.lesson).select("id");
      expect(error !== null || (data ?? []).length === 0, JSON.stringify(patch)).toBe(true);
    }
    const direct = await tutor.client.from("lessons").update({ lesson_date: "2026-10-01" }).eq("id", ids.lesson).select("id");
    expect(direct.data ?? []).toHaveLength(0);
    const { error } = await tutor.client.rpc("update_lesson_date", { p_lesson: ids.lesson, p_date: "2026-10-01" });
    expect(error).toBeNull();
  });
});

describe("unlinking", () => {
  it("ending one tutor's link removes only that tutor's access and no data", async () => {
    const tables: [string, string, string][] = [
      ["topics", "student_id", student.id],
      ["lessons", "student_id", student.id],
      ["items", "student_id", student.id],
      ["sessions", "student_id", student.id],
      ["session_results", "session_id", ids.session],
      ["change_log", "student_id", student.id],
      ["uploads", "student_id", student.id],
      ["draft_items", "upload_id", ids.tutorUpload],
    ];
    const before: Record<string, number> = {};
    for (const [t, c, v] of tables) before[t] = (await rows(admin(), t, c, v)).length;

    const { error } = await student.client
      .from("tutor_links")
      .update({ status: "ended", ended_at: new Date().toISOString() })
      .eq("tutor_id", secondTutor.id)
      .eq("student_id", student.id);
    expect(error).toBeNull();

    for (const [t, c, v] of tables) {
      expect((await rows(secondTutor.client, t, c, v)).length, `ended tutor ${t}`).toBe(0);
      expect((await rows(admin(), t, c, v)).length, `intact ${t}`).toBe(before[t]);
    }
    for (const t of ["topics", "lessons", "items", "sessions", "change_log"]) {
      expect((await rows(tutor.client, t, "student_id", student.id)).length, `other tutor ${t}`).toBeGreaterThan(0);
    }
    expect((await rows(tutor.client, "session_results", "session_id", ids.session)).length).toBeGreaterThan(0);
    const { data } = await secondTutor.client.rpc("student_profile_for_tutor", { student: student.id });
    expect(data ?? []).toHaveLength(0);
  });
});
