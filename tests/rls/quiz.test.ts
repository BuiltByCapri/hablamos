// Quiz sessions against the real schema: a student records results only for
// their own items, grammar included, and a quiz of skill questions counts
// through mark_answered. A tutor writes nothing into a student's quiz.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, deleteUsers, link, makeUser, uniqueEmail } from "./helpers";
import { finishSessionWith, markAnsweredWith, recordResultWith, SessionError, startSessionWith } from "../../lib/sessions";

type User = { id: string; client: SupabaseClient };
let ana: User;
let ben: User;
let tutor: User;
let anaWord: string;
let anaGrammar: string;
let benWord: string;

const ctx = (u: User) => ({ db: u.client });

async function item(studentId: string, kind: "word" | "grammar", text: string): Promise<string> {
  const a = admin();
  const { data: topic, error: tErr } = await a.from("topics").insert({ student_id: studentId, name: `Q-${text}` }).select("id").single();
  if (tErr) throw new Error(tErr.message);
  const { data, error } = await a
    .from("items")
    .insert({ student_id: studentId, topic_id: topic.id, kind, text, meaning: "m", created_by: studentId, created_by_name: "x", created_by_role: "student" })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

async function rejects(p: Promise<unknown>, code?: string) {
  const err = await p.then(() => null, (e) => e);
  expect(err).toBeInstanceOf(SessionError);
  if (code) expect((err as SessionError).code).toBe(code);
}

beforeAll(async () => {
  ana = await makeUser(uniqueEmail("quiz-ana"));
  ben = await makeUser(uniqueEmail("quiz-ben"));
  tutor = await makeUser(uniqueEmail("quiz-tutor"), { tutor: true });
  await link(tutor.id, ana.id, "active");
  anaWord = await item(ana.id, "word", "mesa");
  anaGrammar = await item(ana.id, "grammar", "ser y estar");
  benWord = await item(ben.id, "word", "silla");
});
afterAll(deleteUsers);

describe("quiz sessions", () => {
  it("a student runs a quiz on their own items, grammar included, and it counts", async () => {
    const id = await startSessionWith(ctx(ana), "quiz");
    await recordResultWith(ctx(ana), id, anaWord, "right");
    await recordResultWith(ctx(ana), id, anaGrammar, "missed");
    const done = await finishSessionWith(ctx(ana), id);
    expect(done.counted).toBe(true);
    const { data } = await admin().from("session_results").select("item_id, outcome").eq("session_id", id);
    expect(data).toHaveLength(2);
    const { data: s } = await admin().from("sessions").select("mode, student_id").eq("id", id).single();
    expect(s).toEqual({ mode: "quiz", student_id: ana.id });
  });

  it("a quiz takes no came_up", async () => {
    const id = await startSessionWith(ctx(ana), "quiz");
    await rejects(recordResultWith(ctx(ana), id, anaWord, "came_up"), "bad_input");
  });

  it("a quiz of only skill questions counts once one is answered, and not before", async () => {
    const empty = await startSessionWith(ctx(ana), "quiz");
    expect((await finishSessionWith(ctx(ana), empty)).counted).toBe(false);
    const skills = await startSessionWith(ctx(ana), "quiz");
    await markAnsweredWith(ctx(ana), skills);
    expect((await finishSessionWith(ctx(ana), skills)).counted).toBe(true);
    await rejects(markAnsweredWith(ctx(ana), skills), "finished");
  });

  it("mark_answered is for quizzes only", async () => {
    const cards = await startSessionWith(ctx(ana), "flashcards");
    await rejects(markAnsweredWith(ctx(ana), cards), "bad_input");
  });

  it("a student cannot record a result for another student's item", async () => {
    const id = await startSessionWith(ctx(ana), "quiz");
    await rejects(recordResultWith(ctx(ana), id, benWord, "right"), "not_found");
  });

  it("a tutor cannot record results or answers into a linked student's quiz", async () => {
    const id = await startSessionWith(ctx(ana), "quiz");
    await rejects(recordResultWith(ctx(tutor), id, anaWord, "right"), "not_found");
    await rejects(markAnsweredWith(ctx(tutor), id), "not_found");
    const { error } = await tutor.client.from("sessions").update({ answered_at: new Date().toISOString() }).eq("id", id);
    const { data } = await admin().from("sessions").select("answered_at").eq("id", id).single();
    expect(error !== null || data!.answered_at === null).toBe(true);
    expect(data!.answered_at).toBeNull();
    // A quiz the tutor starts is the tutor's own, never the student's.
    const theirs = await startSessionWith(ctx(tutor), "quiz");
    const { data: s } = await admin().from("sessions").select("student_id").eq("id", theirs).single();
    expect(s!.student_id).toBe(tutor.id);
    await rejects(recordResultWith(ctx(tutor), theirs, anaWord, "right"), "not_found");
  });

  it("a student cannot set answered_at directly", async () => {
    const id = await startSessionWith(ctx(ana), "quiz");
    await ana.client.from("sessions").update({ answered_at: new Date().toISOString(), counted: true }).eq("id", id);
    const { data } = await admin().from("sessions").select("answered_at, counted").eq("id", id).single();
    expect(data).toEqual({ answered_at: null, counted: false });
  });
});
