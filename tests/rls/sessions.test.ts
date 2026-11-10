// Sessions and results against the real schema: a student writes only their
// own, results only for their own live items into their own unfinished
// session, and a tutor writes neither. Finish is computed by the server.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, deleteUsers, link, makeUser, uniqueEmail } from "./helpers";
import { closeIdleSessions, finishSessionWith, markSpokeWith, recordResultWith, SessionError, startSessionWith } from "../../lib/sessions";

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
  const { data: topic, error: tErr } = await a.from("topics").insert({ student_id: studentId, name: `T-${text}` }).select("id").single();
  if (tErr) throw new Error(tErr.message);
  const { data, error } = await a
    .from("items")
    .insert({
      student_id: studentId,
      topic_id: topic.id,
      kind,
      text,
      meaning: "m",
      created_by: studentId,
      created_by_name: "x",
      created_by_role: "student",
    })
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
  ana = await makeUser(uniqueEmail("sess-ana"));
  ben = await makeUser(uniqueEmail("sess-ben"));
  tutor = await makeUser(uniqueEmail("sess-tutor"), { tutor: true });
  await link(tutor.id, ana.id, "active");
  anaWord = await item(ana.id, "word", "uno");
  anaGrammar = await item(ana.id, "grammar", "ser");
  benWord = await item(ben.id, "word", "dos");
});
afterAll(deleteUsers);

describe("sessions", () => {
  it("a student starts a session for themselves", async () => {
    const id = await startSessionWith(ctx(ana), "flashcards");
    const { data } = await admin().from("sessions").select("student_id, counted, ended_at").eq("id", id).single();
    expect(data).toMatchObject({ student_id: ana.id, counted: false, ended_at: null });
  });

  it("a tutor cannot insert a session for a linked student, directly or through the function", async () => {
    const { error } = await tutor.client.from("sessions").insert({ student_id: ana.id, mode: "flashcards" });
    expect(error).not.toBeNull();
    const id = await startSessionWith(ctx(tutor), "flashcards");
    const { data } = await admin().from("sessions").select("student_id").eq("id", id).single();
    expect(data!.student_id).toBe(tutor.id);
  });

  it("a student cannot write the tables directly", async () => {
    const { error: e1 } = await ana.client.from("sessions").insert({ student_id: ana.id, mode: "flashcards", counted: true });
    expect(e1).not.toBeNull();
    const id = await startSessionWith(ctx(ana), "flashcards");
    const { error: e2 } = await ana.client.from("sessions").update({ counted: true }).eq("id", id);
    expect(e2).not.toBeNull();
    const { error: e3 } = await ana.client.from("session_results").insert({ session_id: id, item_id: anaWord, outcome: "right" });
    expect(e3).not.toBeNull();
  });
});

describe("results", () => {
  it("a result for another student's item is rejected", async () => {
    const id = await startSessionWith(ctx(ana), "flashcards");
    await rejects(recordResultWith(ctx(ana), id, benWord, "right"), "not_found");
  });

  it("a result into another student's session is rejected", async () => {
    const benSession = await startSessionWith(ctx(ben), "flashcards");
    await rejects(recordResultWith(ctx(ana), benSession, anaWord, "right"), "not_found");
    await rejects(recordResultWith(ctx(tutor), benSession, benWord, "right"), "not_found");
    const anaSession = await startSessionWith(ctx(ana), "flashcards");
    await rejects(recordResultWith(ctx(tutor), anaSession, anaWord, "right"), "not_found");
    const { data } = await admin().from("session_results").select("id").in("session_id", [benSession, anaSession]);
    expect(data).toHaveLength(0);
  });

  it("a removed item and a finished session reject results", async () => {
    const removed = await item(ana.id, "word", "tres");
    await admin().from("items").update({ deleted_at: new Date().toISOString() }).eq("id", removed);
    const id = await startSessionWith(ctx(ana), "flashcards");
    await rejects(recordResultWith(ctx(ana), id, removed, "right"), "not_found");
    await finishSessionWith(ctx(ana), id);
    await rejects(recordResultWith(ctx(ana), id, anaWord, "right"), "finished");
  });

  it("flashcards take no grammar and no came_up, voice takes came_up", async () => {
    const id = await startSessionWith(ctx(ana), "flashcards");
    await rejects(recordResultWith(ctx(ana), id, anaGrammar, "right"), "bad_input");
    await rejects(recordResultWith(ctx(ana), id, anaWord, "came_up"), "bad_input");
    const voice = await startSessionWith(ctx(ana), "voice");
    await recordResultWith(ctx(ana), voice, anaGrammar, "came_up");
  });

  it("a tutor reads a linked student's results and a stranger does not", async () => {
    const id = await startSessionWith(ctx(ana), "flashcards");
    await recordResultWith(ctx(ana), id, anaWord, "missed");
    const { data } = await tutor.client.from("session_results").select("outcome").eq("session_id", id);
    expect(data).toHaveLength(1);
    const { data: other } = await ben.client.from("session_results").select("outcome").eq("session_id", id);
    expect(other).toHaveLength(0);
  });
});

describe("finish", () => {
  it("computes counted and duration on the server, and finishing again changes nothing", async () => {
    const none = await startSessionWith(ctx(ana), "flashcards");
    expect(await finishSessionWith(ctx(ana), none)).toMatchObject({ counted: false });

    const one = await startSessionWith(ctx(ana), "flashcards");
    await recordResultWith(ctx(ana), one, anaWord, "right");
    const first = await finishSessionWith(ctx(ana), one);
    expect(first.counted).toBe(true);
    const { data: before } = await admin().from("sessions").select("ended_at, duration_s, counted").eq("id", one).single();
    expect(before!.ended_at).not.toBeNull();

    await new Promise((r) => setTimeout(r, 1100));
    const second = await finishSessionWith(ctx(ana), one);
    expect(second).toEqual(first);
    const { data: after } = await admin().from("sessions").select("ended_at, duration_s, counted").eq("id", one).single();
    expect(after).toEqual(before);
  });

  it("voice counts only after mark_spoke, whatever the body says", async () => {
    const quiet = await startSessionWith(ctx(ana), "voice");
    const { data: raw } = await ana.client.rpc("finish_session", { p_session: quiet, p_spoke_once: true });
    expect(raw).toBeNull();
    expect((await finishSessionWith(ctx(ana), quiet)).counted).toBe(false);

    const spoke = await startSessionWith(ctx(ana), "voice");
    await markSpokeWith(ctx(ana), spoke);
    await markSpokeWith(ctx(ana), spoke);
    expect((await finishSessionWith(ctx(ana), spoke)).counted).toBe(true);
  });

  it("mark_spoke is idempotent, voice only, and only for your own live session", async () => {
    const id = await startSessionWith(ctx(ana), "voice");
    await markSpokeWith(ctx(ana), id);
    const { data: first } = await admin().from("sessions").select("spoke_at").eq("id", id).single();
    await new Promise((r) => setTimeout(r, 50));
    await markSpokeWith(ctx(ana), id);
    const { data: second } = await admin().from("sessions").select("spoke_at").eq("id", id).single();
    expect(second!.spoke_at).toBe(first!.spoke_at);

    await rejects(markSpokeWith(ctx(ben), id), "not_found");
    await rejects(markSpokeWith(ctx(tutor), id), "not_found");
    const cards = await startSessionWith(ctx(ana), "flashcards");
    await rejects(markSpokeWith(ctx(ana), cards), "bad_input");
    await finishSessionWith(ctx(ana), id);
    await rejects(markSpokeWith(ctx(ana), id), "finished");
  });

  it("a tutor or stranger cannot finish another's session", async () => {
    const mine = await startSessionWith(ctx(ana), "flashcards");
    await rejects(finishSessionWith(ctx(tutor), mine), "not_found");
    await rejects(finishSessionWith(ctx(ben), mine), "not_found");
  });
});

describe("idle sessions", () => {
  const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

  it("finishing after 30 idle minutes ends at the last activity, not now", async () => {
    const id = await startSessionWith(ctx(ana), "flashcards");
    await recordResultWith(ctx(ana), id, anaWord, "right");
    await admin().from("sessions").update({ started_at: ago(40) }).eq("id", id);
    await admin().from("session_results").update({ at: ago(30) }).eq("session_id", id);
    const out = await finishSessionWith(ctx(ana), id);
    expect(out).toEqual({ counted: true, durationS: 600 });
    const { data } = await admin().from("sessions").select("ended_at").eq("id", id).single();
    const { data: result } = await admin().from("session_results").select("at").eq("session_id", id).single();
    expect(new Date(data!.ended_at).getTime()).toBe(new Date(result!.at).getTime());
  });

  it("an idle session takes no more results or spoke marks", async () => {
    const id = await startSessionWith(ctx(ana), "flashcards");
    await admin().from("sessions").update({ started_at: ago(11) }).eq("id", id);
    await rejects(recordResultWith(ctx(ana), id, anaWord, "right"), "finished");
    const voice = await startSessionWith(ctx(ana), "voice");
    await admin().from("sessions").update({ started_at: ago(11) }).eq("id", voice);
    await rejects(markSpokeWith(ctx(ana), voice), "finished");
    const fresh = await startSessionWith(ctx(ana), "flashcards");
    await admin().from("sessions").update({ started_at: ago(9) }).eq("id", fresh);
    await recordResultWith(ctx(ana), fresh, anaWord, "right");
  });

  it("closeIdleSessions closes an idle voice session that spoke, as counted, ending at spoke_at", async () => {
    const spoke = await startSessionWith(ctx(ana), "voice");
    await markSpokeWith(ctx(ana), spoke);
    const quiet = await startSessionWith(ctx(ana), "voice");
    const spokeAt = ago(20);
    await admin().from("sessions").update({ started_at: ago(25), spoke_at: spokeAt }).eq("id", spoke);
    await admin().from("sessions").update({ started_at: ago(25) }).eq("id", quiet);
    await closeIdleSessions(admin(), new Date());
    const { data } = await admin().from("sessions").select("id, counted, ended_at, duration_s").in("id", [spoke, quiet]);
    const by = new Map(data!.map((r) => [r.id, r]));
    expect(by.get(spoke)).toMatchObject({ counted: true, duration_s: 300 });
    expect(new Date(by.get(spoke)!.ended_at).getTime()).toBe(new Date(spokeAt).getTime());
    expect(by.get(quiet)).toMatchObject({ counted: false, duration_s: 0 });
  });
});
