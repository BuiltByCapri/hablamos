// Study sessions. The writes run in the database (0010_sessions.sql), which
// decides who may write and works out duration and `counted` itself. The pure
// functions here say the same rules over plain values.
import type { SupabaseClient } from "@supabase/supabase-js";

export type Mode = "flashcards" | "voice" | "quiz";
export type Outcome = "right" | "missed" | "came_up";

/**
 * Flashcards count once at least one card was marked right or missed. Voice
 * counts only when the server recorded that the student spoke (spokeAt). A
 * quiz counts once one question is answered: an item result, or answeredAt
 * for a skill question that stands for no item. Opening and leaving counts for
 * nothing, and came_up is not a flashcard answer.
 */
export function shouldCount(
  mode: Mode,
  results: { outcome: string }[],
  spokeAt: Date | string | null,
  answeredAt: Date | string | null = null,
): boolean {
  if (mode === "voice") return spokeAt != null;
  if (mode === "quiz" && answeredAt != null) return true;
  return results.some((r) => r.outcome === "right" || r.outcome === "missed");
}

/** Grammar items are explanations, not cards. */
export function flashcardDeck<I extends { kind: string }>(items: I[]): I[] {
  return items.filter((i) => i.kind === "word" || i.kind === "phrase");
}

export const IDLE_MINUTES = 10;

export type OpenSession = {
  id: string;
  startedAt: Date | string;
  lastResultAt: Date | string | null;
  spokeAt: Date | string | null;
  /** A quiz's last answered question, item or skill. */
  answeredAt?: Date | string | null;
  endedAt: Date | string | null;
};

const latest = (...times: (Date | string | null)[]): number =>
  Math.max(...times.filter((t) => t != null).map((t) => new Date(t as Date | string).getTime()));

/** Ids of unfinished sessions with no activity for at least ten minutes. Idle is counted from the last result, spoke or answered time, or the start. */
export function closeIdle(now: Date, sessions: OpenSession[]): string[] {
  return sessions
    .filter((s) => !s.endedAt)
    .filter((s) => now.getTime() - latest(s.startedAt, s.lastResultAt, s.spokeAt, s.answeredAt ?? null) >= IDLE_MINUTES * 60_000)
    .map((s) => s.id);
}

/**
 * For the cron (Task 11): closes every idle unfinished session with the admin
 * client, ending each at its last activity and counting it through shouldCount.
 * Returns how many it closed.
 */
export async function closeIdleSessions(admin: SupabaseClient, now: Date): Promise<number> {
  const { data: open, error } = await admin
    .from("sessions")
    .select("id, mode, started_at, spoke_at, answered_at")
    .is("ended_at", null)
    .lte("started_at", new Date(now.getTime() - IDLE_MINUTES * 60_000).toISOString());
  if (error) throw new Error(`reading open sessions failed: ${error.message}`);
  if (!open?.length) return 0;

  const ids = open.map((s) => s.id as string);
  const results: { session_id: string; outcome: string; at: string }[] = [];
  for (let n = 0; n < ids.length; n += 100) {
    const { data, error: rErr } = await admin
      .from("session_results")
      .select("session_id, outcome, at")
      .in("session_id", ids.slice(n, n + 100));
    if (rErr) throw new Error(`reading results failed: ${rErr.message}`);
    results.push(...(data ?? []));
  }
  const bySession = new Map<string, { outcome: string; at: string }[]>();
  for (const r of results) bySession.set(r.session_id, [...(bySession.get(r.session_id) ?? []), r]);
  const lastResult = (id: string) => (bySession.get(id) ?? []).reduce<string | null>((m, r) => (!m || r.at > m ? r.at : m), null);
  const lastActivity = (s: { id: unknown; started_at: unknown; spoke_at: unknown; answered_at: unknown }) =>
    new Date(
      latest(s.started_at as string, lastResult(s.id as string), s.spoke_at as string | null, s.answered_at as string | null),
    ).toISOString();

  const toClose = new Set(
    closeIdle(
      now,
      open.map((s) => ({
        id: s.id as string,
        startedAt: s.started_at as string,
        lastResultAt: lastResult(s.id as string),
        spokeAt: s.spoke_at as string | null,
        answeredAt: s.answered_at as string | null,
        endedAt: null,
      })),
    ),
  );
  let closed = 0;
  for (const s of open) {
    if (!toClose.has(s.id)) continue;
    const rs = bySession.get(s.id) ?? [];
    const endedAt = lastActivity(s);
    const seconds = Math.max(0, Math.round((Date.parse(endedAt) - Date.parse(s.started_at as string)) / 1000));
    const { data, error: uErr } = await admin
      .from("sessions")
      .update({ ended_at: endedAt, duration_s: seconds, counted: shouldCount(s.mode as Mode, rs, s.spoke_at as string | null, s.answered_at as string | null) })
      .eq("id", s.id)
      .is("ended_at", null)
      .select("id");
    if (uErr) throw new Error(`closing session failed: ${uErr.message}`);
    closed += data?.length ?? 0;
  }
  return closed;
}

// ---------------------------------------------------------------- request input

export class SessionInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SessionInputError";
  }
}

export type SessionInput =
  | { action: "start"; mode: Mode }
  | { action: "result"; sessionId: string; itemId: string; outcome: Outcome }
  | { action: "spoke"; sessionId: string }
  | { action: "answered"; sessionId: string }
  | { action: "finish"; sessionId: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = (v: unknown, name: string): string => {
  if (typeof v !== "string" || !UUID.test(v)) throw new SessionInputError(`${name} is not valid`);
  return v;
};

export function validateSessionInput(body: unknown): SessionInput {
  if (!body || typeof body !== "object") throw new SessionInputError("body must be an object");
  const b = body as Record<string, unknown>;
  if (b.action === "start") {
    if (b.mode !== "flashcards" && b.mode !== "voice" && b.mode !== "quiz") throw new SessionInputError("mode is not valid");
    return { action: "start", mode: b.mode };
  }
  if (b.action === "result") {
    if (b.outcome !== "right" && b.outcome !== "missed" && b.outcome !== "came_up") throw new SessionInputError("outcome is not valid");
    return { action: "result", sessionId: uuid(b.sessionId, "sessionId"), itemId: uuid(b.itemId, "itemId"), outcome: b.outcome };
  }
  if (b.action === "finish") {
    // Whether she spoke is the server's record (spoke), never a field of this request.
    return { action: "finish", sessionId: uuid(b.sessionId, "sessionId") };
  }
  if (b.action === "spoke") {
    return { action: "spoke", sessionId: uuid(b.sessionId, "sessionId") };
  }
  if (b.action === "answered") {
    return { action: "answered", sessionId: uuid(b.sessionId, "sessionId") };
  }
  throw new SessionInputError("unknown action");
}

// ---------------------------------------------------------------- database writes

export class SessionError extends Error {
  constructor(
    public code: "not_signed_in" | "not_found" | "finished" | "bad_input",
    message: string,
  ) {
    super(message);
    this.name = "SessionError";
  }
}

function fail(fn: string, message: string): never {
  if (message.includes("not_signed_in")) throw new SessionError("not_signed_in", "signed out");
  if (message.includes("session_not_found") || message.includes("item_not_found")) throw new SessionError("not_found", "not found");
  if (message.includes("session_finished")) throw new SessionError("finished", "session is finished");
  if (message.includes("bad_outcome") || message.includes("bad_mode")) throw new SessionError("bad_input", "not allowed here");
  throw new Error(`${fn} failed: ${message}`);
}

type Db = { db: SupabaseClient };

export async function startSessionWith(ctx: Db, mode: Mode): Promise<string> {
  const { data, error } = await ctx.db.rpc("start_session", { p_mode: mode });
  if (error) fail("start_session", error.message);
  return data as string;
}

export async function recordResultWith(ctx: Db, sessionId: string, itemId: string, outcome: Outcome): Promise<void> {
  const { error } = await ctx.db.rpc("record_result", { p_session: sessionId, p_item: itemId, p_outcome: outcome });
  if (error) fail("record_result", error.message);
}

/** Records that the student spoke in a voice session. Only this makes a voice session count. */
export async function markSpokeWith(ctx: Db, sessionId: string): Promise<void> {
  const { error } = await ctx.db.rpc("mark_spoke", { p_session: sessionId });
  if (error) fail("mark_spoke", error.message);
}

/** Records that a quiz question with no item behind it was answered, so the quiz counts. */
export async function markAnsweredWith(ctx: Db, sessionId: string): Promise<void> {
  const { error } = await ctx.db.rpc("mark_answered", { p_session: sessionId });
  if (error) fail("mark_answered", error.message);
}

export async function finishSessionWith(ctx: Db, sessionId: string): Promise<{ counted: boolean; durationS: number | null }> {
  const { data, error } = await ctx.db.rpc("finish_session", { p_session: sessionId });
  if (error) fail("finish_session", error.message);
  const out = data as { counted: boolean; duration_s: number | null };
  return { counted: out.counted, durationS: out.duration_s };
}
