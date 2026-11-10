import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, deleteUsers, link, makeUser, uniqueEmail } from "./helpers";
import {
  acceptInviteWith,
  deleteAccountWith,
  inviteStudentWith,
  previewInviteWith,
  unlinkWith,
  updateSharedSettingWith,
} from "../../lib/links";
import { lastChange, latestSharedChanges } from "../../lib/last-change";

type User = { id: string; email: string; client: SupabaseClient };

async function user(label: string, opts?: { tutor?: boolean; name?: string }): Promise<User> {
  const email = uniqueEmail(label);
  const made = await makeUser(email, opts);
  if (opts?.name) {
    const { error } = await admin().from("profiles").update({ display_name: opts.name }).eq("id", made.id);
    if (error) throw new Error(error.message);
  }
  return { ...made, email };
}

const ctx = (u: User) => ({ db: u.client, admin: admin(), appUrl: "http://localhost:3000" });

async function insertOne(client: SupabaseClient, table: string, row: Record<string, unknown>): Promise<string> {
  const { data, error } = await client.from(table).insert(row).select("id").single();
  if (error) throw new Error(`${table} insert failed: ${error.message}`);
  return data.id as string;
}

/** Gives a student one row in every table a tutor can read, and a note. */
async function seed(student: User): Promise<void> {
  const s = student.client;
  const topic = await insertOne(admin(), "topics", { student_id: student.id, name: "Numbers" });
  const lesson = await insertOne(admin(), "lessons", { student_id: student.id, source: "student", published_by: student.id });
  const item = await insertOne(admin(), "items", {
    student_id: student.id,
    topic_id: topic,
    kind: "word",
    text: "uno",
    meaning: "one",
    created_by: student.id,
    created_by_role: "student",
    lesson_id: lesson,
  });
  const session = await insertOne(admin(), "sessions", { student_id: student.id, mode: "flashcards" });
  await insertOne(admin(), "session_results", { session_id: session, item_id: item, outcome: "right" });
  await insertOne(s, "notes", { student_id: student.id, body: "private" });
  await insertOne(s, "change_log", {
    student_id: student.id,
    entity: "item",
    entity_id: item,
    actor_id: student.id,
    action: "create",
    after: { text: "uno" },
  });
}

// Every table a linked tutor can read for a student.
const tutorTables = ["topics", "lessons", "items", "sessions", "session_results", "change_log"] as const;

async function countFor(client: SupabaseClient, table: string, studentId: string): Promise<number> {
  if (table === "session_results") {
    const { data, error } = await client.from("session_results").select("id, sessions!inner(student_id)").eq("sessions.student_id", studentId);
    if (error) throw new Error(error.message);
    return data.length;
  }
  const { data, error } = await client.from(table).select("id").eq("student_id", studentId);
  if (error) throw new Error(`${table}: ${error.message}`);
  return data.length;
}

async function linkRow(id: string) {
  const { data, error } = await admin().from("tutor_links").select("*").eq("id", id).single();
  if (error) throw new Error(error.message);
  return data;
}

afterAll(async () => {
  await deleteUsers();
});

describe("invites", () => {
  let tutor: User;
  let student: User;
  let other: User;

  beforeAll(async () => {
    tutor = await user("inv-tutor", { tutor: true, name: "Profe Ana" });
    student = await user("inv-student");
    other = await user("inv-other");
  });

  it("accepting an invite activates the link and sets student_id", async () => {
    const invite = await inviteStudentWith(ctx(tutor), student.email.toUpperCase());
    expect((await linkRow(invite.id)).status).toBe("invited");
    expect(await previewInviteWith(ctx(student), invite.token)).toEqual({ ok: true, tutorName: "Profe Ana" });

    await acceptInviteWith(ctx(student), invite.token);

    const row = await linkRow(invite.id);
    expect(row.status).toBe("active");
    expect(row.student_id).toBe(student.id);
    expect(row.tutor_id).toBe(tutor.id);
  });

  it("a token sent to another email is rejected", async () => {
    const invite = await inviteStudentWith(ctx(tutor), other.email);
    await expect(acceptInviteWith(ctx(student), invite.token)).rejects.toThrow(/different email/);
    const preview = await previewInviteWith(ctx(student), invite.token);
    expect(preview.ok).toBe(false);
    expect(JSON.stringify(preview)).not.toContain("Profe Ana");
    expect((await linkRow(invite.id)).status).toBe("invited");
  });

  it("a tutor cannot accept their own invite", async () => {
    // Even when the tutor invited their own address.
    const { data, error } = await tutor.client
      .from("tutor_links")
      .insert({ tutor_id: tutor.id, invite_email: tutor.email })
      .select("id, invite_token")
      .single();
    if (error) throw new Error(error.message);
    await expect(acceptInviteWith(ctx(tutor), data.invite_token)).rejects.toThrow(/own invite/);
    await expect(inviteStudentWith(ctx(tutor), tutor.email)).rejects.toThrow(/yourself/);
  });

  it("an active or ended token is rejected", async () => {
    const invite = await inviteStudentWith(ctx(tutor), other.email);
    await acceptInviteWith(ctx(other), invite.token);
    await expect(acceptInviteWith(ctx(other), invite.token)).rejects.toThrow(/no longer open/);

    await unlinkWith(ctx(other), invite.id);
    expect((await linkRow(invite.id)).status).toBe("ended");
    await expect(acceptInviteWith(ctx(other), invite.token)).rejects.toThrow(/no longer open/);
  });

  it("an unknown token is rejected", async () => {
    await expect(acceptInviteWith(ctx(student), "not-a-token")).rejects.toThrow(/not found/);
  });

  it("only a tutor can invite", async () => {
    await expect(inviteStudentWith(ctx(student), other.email)).rejects.toThrow(/tutor/);
  });
});

describe("unlinking", () => {
  let student: User;
  let tutorA: User;
  let tutorB: User;
  let linkA: string;

  beforeAll(async () => {
    student = await user("unl-student");
    tutorA = await user("unl-tutor-a", { tutor: true });
    tutorB = await user("unl-tutor-b", { tutor: true });
    await seed(student);
    linkA = (await inviteStudentWith(ctx(tutorA), student.email)).id;
    await acceptInviteWith(ctx(student), (await linkRow(linkA)).invite_token);
    await link(tutorB.id, student.id, "active");
  });

  it("with two active tutors, unlinking one leaves the other reading every table as before", async () => {
    const before: Record<string, number> = {};
    for (const t of tutorTables) {
      before[t] = await countFor(tutorB.client, t, student.id);
      expect(before[t], t).toBeGreaterThan(0);
    }

    await unlinkWith(ctx(student), linkA);

    for (const t of tutorTables) {
      expect(await countFor(tutorB.client, t, student.id), t).toBe(before[t]);
    }
    const { data } = await tutorB.client.rpc("student_profile_for_tutor", { student: student.id });
    expect(data).toHaveLength(1);
  });

  it("ended link: tutor reads 0 rows on every table, student still reads all their items and sessions", async () => {
    expect((await linkRow(linkA)).status).toBe("ended");
    expect((await linkRow(linkA)).ended_at).not.toBeNull();

    for (const t of [...tutorTables, "notes", "uploads"]) {
      expect(await countFor(tutorA.client, t, student.id), t).toBe(0);
    }
    const { data: profile } = await tutorA.client.rpc("student_profile_for_tutor", { student: student.id });
    expect(profile).toHaveLength(0);

    for (const t of [...tutorTables, "notes"]) {
      expect(await countFor(student.client, t, student.id), t).toBe(1);
    }
  });

  it("the tutor side can unlink too, and a stranger cannot end someone else's link", async () => {
    const stranger = await user("unl-stranger");
    const { data } = await admin()
      .from("tutor_links")
      .select("id")
      .eq("tutor_id", tutorB.id)
      .eq("student_id", student.id)
      .single();
    await expect(unlinkWith(ctx(stranger), data!.id)).rejects.toThrow(/not found/);
    await unlinkWith(ctx(tutorB), data!.id);
    expect((await linkRow(data!.id)).status).toBe("ended");
  });
});

describe("shared settings", () => {
  it("a linked tutor can change level and focus through updateSharedSetting, which sets *_updated_by to the tutor and writes change_log", async () => {
    const student = await user("set-student");
    const tutor = await user("set-tutor", { tutor: true, name: "Profe Luis" });
    await link(tutor.id, student.id, "active");

    await updateSharedSettingWith(ctx(tutor), student.id, "level", "B1");
    await updateSharedSettingWith(ctx(tutor), student.id, "focus", "past tense");

    const { data: p } = await student.client.from("profiles").select("*").eq("id", student.id).single();
    expect(p.level).toBe("B1");
    expect(p.level_updated_by).toBe(tutor.id);
    expect(p.level_updated_at).not.toBeNull();
    expect(p.focus).toBe("past tense");
    expect(p.focus_updated_by).toBe(tutor.id);

    const { data: log } = await student.client
      .from("change_log")
      .select("*")
      .eq("student_id", student.id)
      .eq("entity", "profile")
      .order("at");
    expect(log).toHaveLength(2);
    expect(log![0]).toMatchObject({ actor_id: tutor.id, actor_name: "Profe Luis", action: "edit", after: { level: "B1" } });
    expect(log![1]).toMatchObject({ actor_id: tutor.id, after: { focus: "past tense" } });

    await expect(updateSharedSettingWith(ctx(tutor), student.id, "timezone" as "level", "x")).rejects.toThrow();
    const stranger = await user("set-stranger", { tutor: true });
    await expect(updateSharedSettingWith(ctx(stranger), student.id, "level", "C2")).rejects.toThrow();
  });
});

describe("level and focus only change through update_shared_setting", () => {
  it("a direct owner update of level, focus or their attribution fails; the RPC still works and logs once", async () => {
    const student = await user("guard-student", { name: "Capri" });
    const tutor = await user("guard-tutor", { tutor: true });
    const db = student.client;
    const now = new Date().toISOString();

    for (const change of [
      { level: "C2" },
      { focus: "anything" },
      { level_updated_by: tutor.id },
      { level_updated_at: now },
      { focus_updated_by: student.id },
      { focus_updated_at: now },
      { display_name: "Still Capri", level: "C2" },
    ]) {
      const { error } = await db.from("profiles").update(change).eq("id", student.id);
      expect(error, JSON.stringify(change)).not.toBeNull();
    }
    const { data: untouched } = await db.from("profiles").select("*").eq("id", student.id).single();
    expect(untouched).toMatchObject({ level: null, focus: null, level_updated_by: null, display_name: "Capri" });

    // The owner's other fields still save.
    const { error: nameError } = await db.from("profiles").update({ display_name: "Capri G", is_tutor: true }).eq("id", student.id);
    expect(nameError).toBeNull();

    await updateSharedSettingWith(ctx(student), student.id, "level", "A2");
    const { data: p } = await db.from("profiles").select("level, level_updated_by").eq("id", student.id).single();
    expect(p).toEqual({ level: "A2", level_updated_by: student.id });
    const { data: log } = await db.from("change_log").select("actor_id, after").eq("student_id", student.id).eq("entity", "profile");
    expect(log).toEqual([{ actor_id: student.id, after: { level: "A2" } }]);
  });
});

describe("last changed by", () => {
  it("finds the latest row per field even when many level edits follow an older focus edit", async () => {
    const student = await user("last-student", { name: "Capri" });
    const tutor = await user("last-tutor", { tutor: true, name: "Profe Ana" });
    await link(tutor.id, student.id, "active");

    await updateSharedSettingWith(ctx(student), student.id, "focus", "ser vs estar");
    // More level edits than the old 50-row window held.
    for (let i = 0; i < 55; i++) {
      await updateSharedSettingWith(ctx(i === 54 ? tutor : student), student.id, "level", `L${i}`);
    }

    const rows = await latestSharedChanges(student.client, student.id);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => "level" in (r.after as object))).toMatchObject({ actor_id: tutor.id, actor_name: "Profe Ana", after: { level: "L54" } });
    expect(rows.find((r) => "focus" in (r.after as object))).toMatchObject({ actor_id: student.id, after: { focus: "ser vs estar" } });
    expect(lastChange("level", rows, student.id, "UTC")).toMatch(/^Last changed by Profe Ana, /);
    expect(lastChange("focus", rows, student.id, "UTC")).toMatch(/^Last changed by you, /);
  });
});

describe("independent learner", () => {
  it("a student with zero tutors can still insert items with created_by_role 'student'", async () => {
    const student = await user("solo");
    const topic = await insertOne(admin(), "topics", { student_id: student.id, name: "Food" });
    const id = await insertOne(admin(), "items", {
      student_id: student.id,
      topic_id: topic,
      kind: "phrase",
      text: "tengo hambre",
      meaning: "I'm hungry",
      created_by: student.id,
      created_by_role: "student",
    });
    const { data } = await student.client.from("items").select("created_by_role").eq("id", id).single();
    expect(data!.created_by_role).toBe("student");
  });
});

describe("deleting an account", () => {
  it("deleteAccount removes the student's rows in every table", async () => {
    const student = await user("del-student");
    const tutor = await user("del-tutor", { tutor: true });
    await seed(student);
    await link(tutor.id, student.id, "active");
    await insertOne(admin(), "uploads", {
      student_id: student.id,
      uploader_id: student.id,
      content_hash: "h",
      extract_version: "v1",
    });
    await insertOne(admin(), "notifications", { student_id: student.id, kind: "daily", dedupe_key: `daily:${student.id}` });
    const { error: usageError } = await admin().from("claude_usage").insert({ user_id: student.id, day: "2026-10-23", calls: 3 });
    if (usageError) throw new Error(usageError.message);

    await deleteAccountWith(ctx(student));

    const a = admin();
    for (const t of [...tutorTables, "notes", "uploads", "notifications"]) {
      expect(await countFor(a, t, student.id), t).toBe(0);
    }
    const { data: usage } = await a.from("claude_usage").select("user_id").eq("user_id", student.id);
    expect(usage).toHaveLength(0);
    const { data: links } = await a.from("tutor_links").select("id").eq("student_id", student.id);
    expect(links).toHaveLength(0);
    const { data: profile } = await a.from("profiles").select("id").eq("id", student.id);
    expect(profile).toHaveLength(0);
    const { error } = await a.auth.admin.getUserById(student.id);
    expect(error).not.toBeNull();
  });

  it("a tutor deleting their account leaves every item and lesson they published for the student, with publisher_name intact", async () => {
    const student = await user("keep-student");
    const tutor = await user("keep-tutor", { tutor: true, name: "Profe Marta" });
    await link(tutor.id, student.id, "active");
    const a = admin();
    const topic = await insertOne(a, "topics", { student_id: student.id, name: "Travel" });
    const lesson = await insertOne(a, "lessons", {
      student_id: student.id,
      tutor_id: tutor.id,
      published_by: tutor.id,
      publisher_name: "Profe Marta",
      source: "tutor",
    });
    const items = [];
    for (const text of ["el tren", "la maleta"]) {
      items.push(
        await insertOne(a, "items", {
          student_id: student.id,
          topic_id: topic,
          kind: "word",
          text,
          meaning: "x",
          created_by: tutor.id,
          created_by_name: "Profe Marta",
          created_by_role: "tutor",
          lesson_id: lesson,
        }),
      );
    }
    await updateSharedSettingWith(ctx(tutor), student.id, "level", "A2");

    await deleteAccountWith(ctx(tutor));

    const { data: l } = await student.client.from("lessons").select("*").eq("id", lesson).single();
    expect(l).toMatchObject({ publisher_name: "Profe Marta", published_by: null, tutor_id: null, source: "tutor" });
    const { data: its } = await student.client.from("items").select("*").in("id", items);
    expect(its).toHaveLength(2);
    for (const it of its!) {
      expect(it).toMatchObject({ created_by_name: "Profe Marta", created_by: null, created_by_role: "tutor", lesson_id: lesson });
    }
    const { data: p } = await student.client.from("profiles").select("level, level_updated_by").eq("id", student.id).single();
    expect(p).toMatchObject({ level: "A2", level_updated_by: null });
    const { data: log } = await student.client.from("change_log").select("actor_id, actor_name").eq("student_id", student.id);
    expect(log).toEqual([{ actor_id: tutor.id, actor_name: "Profe Marta" }]);
  });
});
