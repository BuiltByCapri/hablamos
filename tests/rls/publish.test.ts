// Publishing reviewed uploads and hand-added items against the real schema and
// RLS. Claude is not involved: drafts are written straight to uploads.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, deleteUsers, link, makeUser, uniqueEmail } from "./helpers";
import { addItemWith, PublishError, publishUploadWith } from "../../lib/publish";
import type { DraftItem } from "../../lib/extract";

type User = { id: string; client: SupabaseClient };
let student: User;
let tutor: User;
let endedTutor: User;
let stranger: User;
let soloStudent: User;
let numbers: string;

const ctx = (u: User) => ({ db: u.client, admin: admin() });

async function draft(studentId: string, uploaderId: string): Promise<string> {
  const { data, error } = await admin()
    .from("uploads")
    .insert({ student_id: studentId, uploader_id: uploaderId, content_hash: randomUUID(), extract_version: "test" })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

const items = (topic: DraftItem["topic"] = { existingId: numbers }): DraftItem[] => [
  { kind: "word", text: "uno", meaning: "one", example: null, explanation: null, topic },
  { kind: "grammar", text: "ser vs estar", meaning: "to be", example: "Soy alta.", explanation: "Ser for traits.", topic: { newName: "Verbs" } },
];

beforeAll(async () => {
  student = await makeUser(uniqueEmail("pub-student"));
  soloStudent = await makeUser(uniqueEmail("pub-solo"));
  tutor = await makeUser(uniqueEmail("pub-tutor"), { tutor: true });
  endedTutor = await makeUser(uniqueEmail("pub-ended"), { tutor: true });
  stranger = await makeUser(uniqueEmail("pub-stranger"), { tutor: true });
  await link(tutor.id, student.id, "active");
  await link(endedTutor.id, student.id, "ended");
  await admin().from("profiles").update({ display_name: "Daniel" }).eq("id", tutor.id);
  const { data, error } = await admin().from("topics").insert({ student_id: student.id, name: "Numbers" }).select("id").single();
  if (error) throw new Error(error.message);
  numbers = data.id;
});
afterAll(deleteUsers);

describe("publishUploadWith", () => {
  it("tutor publish creates one lesson with tutor_id and published_by and items with created_by_role 'tutor'", async () => {
    const uploadId = await draft(student.id, tutor.id);
    const out = await publishUploadWith(ctx(tutor), { uploadId, items: items(), lessonDate: "2026-10-20" });
    expect(out.itemCount).toBe(2);

    const { data: lessons } = await admin().from("lessons").select("*").eq("student_id", student.id).eq("id", out.lessonId);
    expect(lessons).toHaveLength(1);
    expect(lessons![0]).toMatchObject({
      tutor_id: tutor.id,
      published_by: tutor.id,
      publisher_name: "Daniel",
      source: "tutor",
      lesson_date: "2026-10-20",
    });

    const { data: rows } = await admin().from("items").select("*").eq("lesson_id", out.lessonId).order("created_at");
    expect(rows).toHaveLength(2);
    for (const r of rows!) {
      expect(r).toMatchObject({ student_id: student.id, created_by: tutor.id, created_by_name: "Daniel", created_by_role: "tutor" });
    }
    const { data: up } = await admin().from("uploads").select("status, lesson_id").eq("id", uploadId).single();
    expect(up).toEqual({ status: "published", lesson_id: out.lessonId });

    // Every item, the lesson and the new topic are in the change log.
    const { data: log } = await admin().from("change_log").select("entity, action, actor_id").eq("student_id", student.id).eq("actor_id", tutor.id);
    expect(log!.filter((l) => l.entity === "item" && l.action === "create")).toHaveLength(2);
    expect(log!.filter((l) => l.entity === "lesson" && l.action === "create")).toHaveLength(1);
    expect(log!.filter((l) => l.entity === "topic" && l.action === "create")).toHaveLength(1);
  });

  it("student publish creates items with created_by_role 'student' and no tutor_id", async () => {
    const uploadId = await draft(soloStudent.id, soloStudent.id);
    const out = await publishUploadWith(ctx(soloStudent), { uploadId, items: items({ newName: "Solo numbers" }) });
    const { data: lesson } = await admin().from("lessons").select("*").eq("id", out.lessonId).single();
    expect(lesson).toMatchObject({ tutor_id: null, published_by: soloStudent.id, source: "student" });
    const { data: rows } = await admin().from("items").select("created_by, created_by_role, topic_id").eq("lesson_id", out.lessonId);
    expect(rows).toHaveLength(2);
    expect(rows!.every((r) => r.created_by === soloStudent.id && r.created_by_role === "student")).toBe(true);
    // The same new name on two items makes one topic.
    const { data: topics } = await admin().from("topics").select("id").eq("student_id", soloStudent.id).ilike("name", "solo numbers");
    expect(topics).toHaveLength(1);
    // No notice to anyone for the student's own addition.
    const { data: notes } = await admin().from("notifications").select("id").eq("student_id", soloStudent.id);
    expect(notes).toHaveLength(0);
  });

  it("tutor publish queues exactly one publish notification", async () => {
    const uploadId = await draft(student.id, tutor.id);
    const out = await publishUploadWith(ctx(tutor), { uploadId, items: items() });
    const { data } = await admin().from("notifications").select("*").eq("dedupe_key", `publish:${out.lessonId}`);
    expect(data).toHaveLength(1);
    expect(data![0]).toMatchObject({ student_id: student.id, kind: "publish", sent_at: null, claimed_at: null });
    expect(data![0].payload).toMatchObject({ lessonId: out.lessonId, itemCount: 2, tutorName: "Daniel" });
    expect(Date.parse(data![0].send_after)).toBeGreaterThan(Date.now() - 60_000);
  });

  it("holds the notification until quiet hours end when published inside them", async () => {
    // Quiet hours cover all but the next hour, so now is inside them whatever the clock says.
    const hour = new Date().getUTCHours();
    const end = (hour + 1) % 24;
    await admin().from("profiles").update({ timezone: "UTC", quiet_start: (hour + 2) % 24, quiet_end: end }).eq("id", student.id);
    try {
      const uploadId = await draft(student.id, tutor.id);
      const out = await publishUploadWith(ctx(tutor), { uploadId, items: items() });
      const { data } = await admin().from("notifications").select("send_after").eq("dedupe_key", `publish:${out.lessonId}`).single();
      const sendAfter = new Date(data!.send_after);
      expect(sendAfter.getTime()).toBeGreaterThan(Date.now());
      expect(sendAfter.getUTCHours()).toBe(end);
      expect(sendAfter.getUTCMinutes()).toBe(0);
    } finally {
      await admin().from("profiles").update({ timezone: "America/New_York", quiet_start: 21, quiet_end: 8 }).eq("id", student.id);
    }
  });

  it("dates a lesson by the student's own calendar day when no date is given", async () => {
    // UTC+14: its calendar date differs from UTC's for most of every day, and from UTC-11's always.
    const tz = "Pacific/Kiritimati";
    await admin().from("profiles").update({ timezone: tz, quiet_start: 8, quiet_end: 8 }).eq("id", student.id);
    try {
      const uploadId = await draft(student.id, tutor.id);
      const out = await publishUploadWith(ctx(tutor), { uploadId, items: items() });
      const expected = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
      const { data } = await admin().from("lessons").select("lesson_date").eq("id", out.lessonId).single();
      expect(data!.lesson_date).toBe(expected);
    } finally {
      await admin().from("profiles").update({ timezone: "America/New_York", quiet_start: 21, quiet_end: 8 }).eq("id", student.id);
    }
  });

  it("publishing twice with the same uploadId is rejected", async () => {
    const uploadId = await draft(student.id, tutor.id);
    await publishUploadWith(ctx(tutor), { uploadId, items: items() });
    const before = await admin().from("items").select("id", { count: "exact", head: true }).eq("student_id", student.id);
    await expect(publishUploadWith(ctx(tutor), { uploadId, items: items() })).rejects.toMatchObject({ code: "already_published" });
    const after = await admin().from("items").select("id", { count: "exact", head: true }).eq("student_id", student.id);
    expect(after.count).toBe(before.count);
  });

  it("two simultaneous publishes of one upload publish once", async () => {
    const uploadId = await draft(student.id, tutor.id);
    const before = await admin().from("lessons").select("id", { count: "exact", head: true }).eq("student_id", student.id);
    const results = await Promise.allSettled([
      publishUploadWith(ctx(tutor), { uploadId, items: items() }),
      publishUploadWith(ctx(tutor), { uploadId, items: items() }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const lost = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(lost.reason).toBeInstanceOf(PublishError);
    const after = await admin().from("lessons").select("id", { count: "exact", head: true }).eq("student_id", student.id);
    expect(after.count).toBe((before.count ?? 0) + 1);
    const { data: ups } = await admin().from("uploads").select("lesson_id").eq("id", uploadId).single();
    const { data: made } = await admin().from("items").select("id").eq("lesson_id", ups!.lesson_id!);
    expect(made).toHaveLength(2);
  });

  it("a tutor cannot publish to a student they are not actively linked to", async () => {
    // The ended tutor made this draft while linked, then lost the link.
    const ended = await draft(student.id, endedTutor.id);
    await expect(publishUploadWith(ctx(endedTutor), { uploadId: ended, items: items() })).rejects.toMatchObject({ code: "forbidden" });
    // A tutor never linked at all.
    const never = await draft(student.id, stranger.id);
    await expect(publishUploadWith(ctx(stranger), { uploadId: never, items: items() })).rejects.toMatchObject({ code: "forbidden" });
    // Someone else's draft cannot be published either.
    const mine = await draft(student.id, tutor.id);
    await expect(publishUploadWith(ctx(stranger), { uploadId: mine, items: items() })).rejects.toMatchObject({ code: "not_found" });
    for (const id of [ended, never, mine]) {
      const { data } = await admin().from("uploads").select("status").eq("id", id).single();
      expect(data!.status).toBe("draft");
    }
    const { data: rows } = await admin().from("items").select("id").eq("student_id", student.id).in("created_by", [endedTutor.id, stranger.id]);
    expect(rows).toHaveLength(0);
  });

  it("follows a merged topic to the live one", async () => {
    const { data: old } = await admin().from("topics").insert({ student_id: student.id, name: "Old numbers" }).select("id").single();
    await admin().from("topics").update({ merged_into: numbers, merged_at: new Date().toISOString() }).eq("id", old!.id);
    const uploadId = await draft(student.id, tutor.id);
    const out = await publishUploadWith(ctx(tutor), { uploadId, items: [{ ...items()[0], topic: { existingId: old!.id } }] });
    const { data } = await admin().from("items").select("topic_id").eq("lesson_id", out.lessonId).single();
    expect(data!.topic_id).toBe(numbers);
  });

  it("rejects a topic that belongs to another student and rolls the upload back", async () => {
    const { data: theirs } = await admin().from("topics").insert({ student_id: soloStudent.id, name: "Theirs" }).select("id").single();
    const uploadId = await draft(student.id, tutor.id);
    const lessonsBefore = await admin().from("lessons").select("id", { count: "exact", head: true }).eq("student_id", student.id);
    await expect(publishUploadWith(ctx(tutor), { uploadId, items: items({ existingId: theirs!.id }) })).rejects.toMatchObject({ code: "bad_topic" });
    const { data } = await admin().from("uploads").select("status, lesson_id").eq("id", uploadId).single();
    expect(data).toEqual({ status: "draft", lesson_id: null });
    const lessonsAfter = await admin().from("lessons").select("id", { count: "exact", head: true }).eq("student_id", student.id);
    expect(lessonsAfter.count).toBe(lessonsBefore.count);
  });
});

describe("addItemWith", () => {
  it("adds one item for the student with no lesson and a change_log row", async () => {
    const id = await addItemWith(ctx(soloStudent), { kind: "phrase", text: "buenos días", meaning: "good morning", example: null, explanation: null, newTopicName: "Greetings" });
    const { data } = await admin().from("items").select("*").eq("id", id).single();
    expect(data).toMatchObject({ student_id: soloStudent.id, created_by: soloStudent.id, created_by_role: "student", lesson_id: null, kind: "phrase" });
    const { data: log } = await admin().from("change_log").select("action").eq("entity", "item").eq("entity_id", id);
    expect(log).toEqual([{ action: "create" }]);
  });

  it("only ever adds to the caller's own material", async () => {
    const id = await addItemWith(ctx(tutor), { kind: "word", text: "hola", meaning: "hello", example: null, explanation: null, newTopicName: "Greetings" });
    const { data } = await admin().from("items").select("student_id").eq("id", id).single();
    expect(data!.student_id).toBe(tutor.id);
  });
});
