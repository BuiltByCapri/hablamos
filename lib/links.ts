// Tutor links, shared settings and account deletion, with the clients passed
// in so the same code runs in server actions and in the RLS tests.
//
// `db` is the signed-in user's client and goes through row-level security.
// `admin` is the service-role client, used only where the schema routes a
// write through the server: activating an invite and deleting an account.
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { sendEmail } from "./email";

export type LinkContext = { db: SupabaseClient; admin: SupabaseClient; appUrl: string };
export type SharedField = "level" | "focus";

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function signedInUser(db: SupabaseClient): Promise<User> {
  const { data, error } = await db.auth.getUser();
  if (error || !data.user) throw new Error("You need to sign in first.");
  return data.user;
}

const sameEmail = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

/** A tutor invites a student by email. Re-inviting an open invite resends it. */
export async function inviteStudentWith(ctx: LinkContext, email: string): Promise<{ id: string; token: string }> {
  const { db, appUrl } = ctx;
  const user = await signedInUser(db);
  const to = email.trim().toLowerCase();
  if (!EMAIL_SHAPE.test(to)) throw new Error("That doesn't look like an email address.");
  if (sameEmail(to, user.email)) throw new Error("You can't invite yourself.");

  const { data: me, error: meError } = await db.from("profiles").select("display_name, is_tutor").eq("id", user.id).single();
  if (meError) throw new Error(meError.message);
  if (!me.is_tutor) throw new Error("Only a tutor can invite students. Turn on \"I'm a tutor\" in settings first.");

  const { data: existing, error: existingError } = await db
    .from("tutor_links")
    .select("id, invite_token, status")
    .eq("tutor_id", user.id)
    .eq("invite_email", to)
    .in("status", ["invited", "active"]);
  if (existingError) throw new Error(existingError.message);
  if (existing.some((l) => l.status === "active")) throw new Error("You're already linked with this student.");

  let link = existing[0] ? { id: existing[0].id as string, token: existing[0].invite_token as string } : null;
  if (!link) {
    const { data, error } = await db
      .from("tutor_links")
      .insert({ tutor_id: user.id, invite_email: to })
      .select("id, invite_token")
      .single();
    if (error) throw new Error(error.message);
    link = { id: data.id, token: data.invite_token };
  }

  const name = me.display_name || user.email;
  const url = `${appUrl.replace(/\/$/, "")}/invite/${link.token}`;
  await sendEmail(
    to,
    `${name} invited you to Hablamos`,
    `${name} wants to be your tutor on Hablamos. They will be able to add lesson material for you and see how your study is going. Your private notes stay private.\n\nTo accept, open this link and sign in with this email address:\n${url}\n\nIf you weren't expecting this, you can ignore it.`,
  );
  return link;
}

/**
 * Finds an invite the signed-in user may accept, or throws the reason they
 * can't. The invite is matched against the email the user signed in with
 * (auth), never the editable profile email.
 */
async function openInvite(ctx: LinkContext, token: string) {
  const user = await signedInUser(ctx.db);
  const { data: link, error } = await ctx.admin
    .from("tutor_links")
    .select("id, tutor_id, invite_email, status")
    .eq("invite_token", token)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!link) throw new Error("This invite was not found.");
  if (link.tutor_id === user.id) throw new Error("You can't accept your own invite.");
  if (link.status !== "invited") throw new Error("This invite is no longer open.");
  if (!sameEmail(link.invite_email, user.email)) {
    throw new Error("This invite was sent to a different email address. Sign in with that address to accept it.");
  }
  return { user, link: link as { id: string; tutor_id: string } };
}

/** What the invite page shows: the tutor's name, or why it can't be accepted. */
export async function previewInviteWith(
  ctx: LinkContext,
  token: string,
): Promise<{ ok: true; tutorName: string } | { ok: false; reason: string }> {
  try {
    const { link } = await openInvite(ctx, token);
    const { data } = await ctx.admin.from("profiles").select("display_name").eq("id", link.tutor_id).single();
    return { ok: true, tutorName: data?.display_name || "Your tutor" };
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }
}

/**
 * The signed-in student accepts an invite. The invite must be open and must
 * have been sent to the email this user signed in with.
 */
export async function acceptInviteWith(ctx: LinkContext, token: string): Promise<{ tutorId: string }> {
  const { admin } = ctx;
  const { user, link } = await openInvite(ctx, token);

  const { data: updated, error: updateError } = await admin
    .from("tutor_links")
    .update({ status: "active", student_id: user.id })
    .eq("id", link.id)
    .eq("status", "invited")
    .select("id");
  if (updateError) {
    if (updateError.code === "23505") throw new Error("You're already linked with this tutor.");
    throw new Error(updateError.message);
  }
  if (!updated.length) throw new Error("This invite is no longer open.");
  return { tutorId: link.tutor_id };
}

/** Either side ends a link, or a tutor cancels an invite. Deletes no data. */
export async function unlinkWith(ctx: LinkContext, linkId: string): Promise<void> {
  const { data, error } = await ctx.db
    .from("tutor_links")
    .update({ status: "ended", ended_at: new Date().toISOString() })
    .eq("id", linkId)
    .neq("status", "ended")
    .select("id");
  if (error) throw new Error(error.message);
  if (!data.length) throw new Error("That link was not found or has already ended.");
}

/**
 * The student or a linked tutor sets level or focus. The database function
 * records who changed it and writes the change_log row.
 */
export async function updateSharedSettingWith(
  ctx: LinkContext,
  studentId: string,
  field: SharedField,
  value: string,
): Promise<void> {
  if (field !== "level" && field !== "focus") throw new Error("Only level and focus can be changed here.");
  const { error } = await ctx.db.rpc("update_shared_setting", { student: studentId, field, value: value.trim() });
  if (error) throw new Error(error.code === "42501" ? "You can't change this student's settings." : error.message);
}

/**
 * Deletes the signed-in user's account. Their own rows go with it by
 * cascade; material a tutor published for a student stays with the student.
 */
export async function deleteAccountWith(ctx: LinkContext): Promise<void> {
  const user = await signedInUser(ctx.db);
  const { error } = await ctx.admin.auth.admin.deleteUser(user.id);
  if (error) throw new Error(error.message);
  await ctx.db.auth.signOut({ scope: "local" }).catch(() => {});
}
