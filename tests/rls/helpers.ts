import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set (expected in .env.test.local)`);
  return value;
}

const url = () => env("SUPABASE_TEST_URL");
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };

let adminClient: SupabaseClient | null = null;

/** Service-role client for the test project. Bypasses RLS. */
export function admin(): SupabaseClient {
  adminClient ??= createClient(url(), env("SUPABASE_TEST_SERVICE_ROLE_KEY"), noSession);
  return adminClient;
}

/** A unique address for one test user. */
export function uniqueEmail(label: string): string {
  return `rls-${label}-${randomUUID().slice(0, 8)}@example.test`;
}

const created: string[] = [];
const RATE_LIMIT_WAIT_MS = 5 * 60_000;

/**
 * Admin-creates a confirmed user and returns a client signed in as them.
 * Sign-in goes through a magic link verified in place, the same email-link
 * flow the app uses, so no password is ever set.
 */
export async function makeUser(
  email: string,
  opts?: { tutor?: boolean },
): Promise<{ id: string; client: SupabaseClient }> {
  const a = admin();
  const { data: made, error: createError } = await a.auth.admin.createUser({ email, email_confirm: true });
  if (createError || !made.user) throw new Error(`createUser failed: ${createError?.message}`);
  const id = made.user.id;
  created.push(id);

  if (opts?.tutor) {
    const { error } = await a.from("profiles").update({ is_tutor: true }).eq("id", id);
    if (error) throw new Error(`marking tutor failed: ${error.message}`);
  }

  const client = createClient(url(), env("SUPABASE_TEST_ANON_KEY"), noSession);
  // Supabase Auth rate-limits token verifications per IP. Back-to-back runs
  // can reach it, so wait it out rather than fail the suite.
  const deadline = Date.now() + RATE_LIMIT_WAIT_MS;
  for (;;) {
    const { data: link, error: linkError } = await a.auth.admin.generateLink({ type: "magiclink", email });
    if (linkError) throw new Error(`generateLink failed: ${linkError.message}`);
    const { error: verifyError } = await client.auth.verifyOtp({
      type: "magiclink",
      token_hash: link.properties.hashed_token,
    });
    if (!verifyError) break;
    if (verifyError.status !== 429 || Date.now() > deadline) {
      throw new Error(`verifyOtp failed: ${verifyError.message}`);
    }
    await new Promise((r) => setTimeout(r, 15_000));
  }

  return { id, client };
}

/** Writes a tutor link directly, bypassing the invite flow. */
export async function link(
  tutorId: string,
  studentId: string,
  status: "active" | "invited" | "ended" = "active",
): Promise<void> {
  const { error } = await admin().from("tutor_links").insert({
    tutor_id: tutorId,
    student_id: studentId,
    invite_email: `${studentId}@example.test`,
    status,
    ended_at: status === "ended" ? new Date().toISOString() : null,
  });
  if (error) throw new Error(`link failed: ${error.message}`);
}

/** Deletes every user made by makeUser in this file. Call from afterAll. */
export async function deleteUsers(): Promise<void> {
  const ids = created.splice(0);
  for (const id of ids) {
    const { error } = await admin().auth.admin.deleteUser(id);
    // A test may already have deleted the user to exercise account deletion.
    if (error && error.status !== 404) throw new Error(`deleteUser failed: ${error.message}`);
  }
}
