import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, deleteUsers, link, makeUser, uniqueEmail } from "./helpers";

type User = { id: string; client: SupabaseClient };

let student: User;
let stranger: User;
let tutor: User;
let invitedTutor: User;
let otherStudent: User;

const ids: Record<string, string> = {};

async function insertOne(client: SupabaseClient, table: string, row: Record<string, unknown>): Promise<string> {
  const { data, error } = await client.from(table).insert(row).select("id").single();
  if (error) throw new Error(`${table} insert failed: ${error.message}`);
  return data.id as string;
}

beforeAll(async () => {
  student = await makeUser(uniqueEmail("student"));
  stranger = await makeUser(uniqueEmail("stranger"));
  otherStudent = await makeUser(uniqueEmail("other"));
  tutor = await makeUser(uniqueEmail("tutor"), { tutor: true });
  invitedTutor = await makeUser(uniqueEmail("invited"), { tutor: true });
  await link(tutor.id, student.id, "active");
  await link(tutor.id, otherStudent.id, "active");
  await link(invitedTutor.id, student.id, "invited");

  const s = student.client;
  ids.topic = await insertOne(admin(), "topics", { student_id: student.id, name: "Numbers" });
  ids.lesson = await insertOne(admin(), "lessons", { student_id: student.id, source: "student", published_by: student.id });
  ids.item = await insertOne(admin(), "items", {
    student_id: student.id,
    topic_id: ids.topic,
    kind: "word",
    text: "uno",
    meaning: "one",
    created_by: student.id,
    created_by_role: "student",
    lesson_id: ids.lesson,
  });
  ids.session = await insertOne(admin(), "sessions", { student_id: student.id, mode: "flashcards" });
  ids.result = await insertOne(admin(), "session_results", { session_id: ids.session, item_id: ids.item, outcome: "right" });
  ids.note = await insertOne(s, "notes", { student_id: student.id, body: "private" });
  ids.change = await insertOne(s, "change_log", {
    student_id: student.id,
    entity: "item",
    entity_id: ids.item,
    actor_id: student.id,
    action: "create",
    after: { text: "uno" },
  });
  ids.upload = await insertOne(s, "uploads", {
    student_id: student.id,
    uploader_id: student.id,
    content_hash: "abc",
    extract_version: "v1",
  });
  ids.draft = await insertOne(s, "draft_items", { upload_id: ids.upload, kind: "word", text: "dos", meaning: "two" });
  ids.notification = await insertOne(admin(), "notifications", {
    student_id: student.id,
    kind: "publish",
    dedupe_key: `publish:${ids.lesson}`,
  });
});

afterAll(async () => {
  await deleteUsers();
});

const studentTables = [
  "topics",
  "lessons",
  "items",
  "sessions",
  "session_results",
  "notes",
  "change_log",
  "uploads",
  "draft_items",
  "notifications",
] as const;

async function count(client: SupabaseClient, table: string, column: string, value: string): Promise<number> {
  const { data, error } = await client.from(table).select("*").eq(column, value);
  expect(error).toBeNull();
  return data!.length;
}

// Each student table, filtered to the student's rows.
function studentFilter(table: (typeof studentTables)[number]): [string, string] {
  if (table === "session_results") return ["session_id", ids.session];
  if (table === "draft_items") return ["upload_id", ids.upload];
  return ["student_id", student.id];
}

describe("ownership", () => {
  it("student reads own items", async () => {
    const id = await insertOne(admin(), "items", {
      student_id: student.id,
      topic_id: ids.topic,
      kind: "phrase",
      text: "buenos días",
      meaning: "good morning",
      created_by: student.id,
      created_by_role: "student",
    });
    expect(await count(student.client, "items", "id", id)).toBe(1);
  });

  it("stranger reads nothing", async () => {
    expect(await count(stranger.client, "items", "student_id", student.id)).toBe(0);
    for (const table of studentTables) {
      const [column, value] = studentFilter(table);
      expect(await count(stranger.client, table, column, value), table).toBe(0);
    }
  });

  it("active tutor reads items, sessions, session_results, topics, lessons", async () => {
    for (const table of ["items", "sessions", "session_results", "topics", "lessons"] as const) {
      const [column, value] = studentFilter(table);
      expect(await count(tutor.client, table, column, value), table).toBeGreaterThan(0);
    }
  });

  it("tutor never reads notes", async () => {
    expect(await count(tutor.client, "notes", "student_id", student.id)).toBe(0);
  });

  it("invited tutor reads nothing", async () => {
    for (const table of studentTables) {
      const [column, value] = studentFilter(table);
      expect(await count(invitedTutor.client, table, column, value), table).toBe(0);
    }
  });

  it("a tutor's direct item update changes nothing, and a tutor cannot delete a session", async () => {
    // Edits go through update_item so they are logged; a direct write matches no row.
    const { data: updated } = await tutor.client
      .from("items")
      .update({ meaning: "one (number)", last_edited_by: tutor.id })
      .eq("id", ids.item)
      .select("meaning");
    expect(updated ?? []).toHaveLength(0);
    const { data: unchanged } = await admin().from("items").select("meaning").eq("id", ids.item).single();
    expect(unchanged!.meaning).toBe("one");

    const { data: deleted } = await tutor.client.from("sessions").delete().eq("id", ids.session).select("id");
    expect(deleted ?? []).toHaveLength(0);
    expect(await count(admin(), "sessions", "id", ids.session)).toBe(1);
  });
});

describe("guards", () => {
  it("a tutor cannot move a student's item to another student", async () => {
    await tutor.client.from("items").update({ student_id: otherStudent.id }).eq("id", ids.item);
    const { data } = await admin().from("items").select("student_id").eq("id", ids.item).single();
    expect(data!.student_id).toBe(student.id);
  });

  it("change_log rejects updates and deletes for student and tutor", async () => {
    // No update or delete policy exists, so these match no rows.
    for (const client of [student.client, tutor.client]) {
      const updated = await client.from("change_log").update({ action: "edit" }).eq("id", ids.change).select("id");
      expect(updated.data ?? []).toHaveLength(0);
      const deleted = await client.from("change_log").delete().eq("id", ids.change).select("id");
      expect(deleted.data ?? []).toHaveLength(0);
    }
    // The trigger rejects an update even from the service role, which bypasses RLS.
    const { error } = await admin().from("change_log").update({ action: "edit" }).eq("id", ids.change);
    expect(error?.message).toMatch(/append-only/);

    const { data } = await admin().from("change_log").select("action").eq("id", ids.change).single();
    expect(data!.action).toBe("create");
  });

  it("change_log insert must be attributed to the caller", async () => {
    const { error } = await tutor.client.from("change_log").insert({
      student_id: student.id,
      entity: "item",
      entity_id: ids.item,
      actor_id: student.id,
      action: "edit",
    });
    expect(error).not.toBeNull();
  });

  it("an invited tutor cannot activate their own link", async () => {
    const { data } = await invitedTutor.client
      .from("tutor_links")
      .update({ status: "active" })
      .eq("tutor_id", invitedTutor.id)
      .select("id");
    expect(data ?? []).toHaveLength(0);
    expect(await count(invitedTutor.client, "items", "student_id", student.id)).toBe(0);
  });

  it("a notification dedupe_key can only be used once", async () => {
    const { error } = await admin()
      .from("notifications")
      .insert({ student_id: student.id, kind: "publish", dedupe_key: `publish:${ids.lesson}` });
    expect(error?.code).toBe("23505");
  });

  it("topic names are unique per student only among unmerged topics", async () => {
    const dup = await admin().from("topics").insert({ student_id: student.id, name: "numbers" });
    expect(dup.error?.code).toBe("23505");

    const into = await insertOne(admin(), "topics", { student_id: student.id, name: "Counting" });
    const { error } = await admin()
      .from("topics")
      .update({ merged_into: into, merged_at: new Date().toISOString() })
      .eq("id", ids.topic);
    expect(error).toBeNull();
    const again = await admin().from("topics").insert({ student_id: student.id, name: "Numbers" });
    expect(again.error).toBeNull();
  });

  it("a tutor deleting their account removes none of the student's material", async () => {
    const leaving = await makeUser(uniqueEmail("leaving"), { tutor: true });
    await link(leaving.id, student.id, "active");
    const itemId = await insertOne(admin(), "items", {
      student_id: student.id,
      topic_id: ids.topic,
      kind: "word",
      text: "tres",
      meaning: "three",
      created_by: leaving.id,
      created_by_name: "Leaving Tutor",
      created_by_role: "tutor",
    });
    const { error } = await admin().auth.admin.deleteUser(leaving.id);
    expect(error).toBeNull();
    const { data } = await student.client.from("items").select("created_by, created_by_name").eq("id", itemId).single();
    expect(data).toEqual({ created_by: null, created_by_name: "Leaving Tutor" });
  });
});
