"use server";

// Server actions for sign-in, profiles, tutor links and account deletion.
// The typed actions throw on failure. The *Form variants are what the plain
// HTML forms post to: they turn a failure into ?error= on the page.
import { redirect } from "next/navigation";
import { getAdminClient } from "../lib/supabase/admin";
import { getAppUrl, getServerClient, requireUser } from "../lib/supabase/server";
import { safeNext } from "../lib/auth-callback";
import { withParam } from "../lib/same-path";
import {
  acceptInviteWith,
  deleteAccountWith,
  inviteStudentWith,
  unlinkWith,
  updateSharedSettingWith,
  type LinkContext,
  type SharedField,
} from "../lib/links";
import { addItemWith, type NewItem } from "../lib/publish";
import {
  mergeTopicsWith,
  removeItemWith,
  renameTopicWith,
  restoreItemWith,
  undoMergeWith,
  updateItemWith,
  updateLessonDateWith,
} from "../lib/material";

async function context(): Promise<LinkContext> {
  return { db: getServerClient(), admin: getAdminClient(), appUrl: await getAppUrl() };
}

/** Redirects to `path` on this site (home if it isn't one) with a message. */
function back(path: string, key: "error" | "notice", message: string): never {
  redirect(withParam(path, key, message));
}

const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim();

// ---------------------------------------------------------------- the interface

export async function inviteStudent(email: string): Promise<void> {
  await inviteStudentWith(await context(), email);
}

export async function acceptInvite(token: string): Promise<void> {
  await acceptInviteWith(await context(), token);
}

export async function unlink(linkId: string): Promise<void> {
  await unlinkWith(await context(), linkId);
}

export async function deleteAccount(): Promise<void> {
  await deleteAccountWith(await context());
}

export async function updateSharedSetting(studentId: string, field: SharedField, value: string): Promise<void> {
  await updateSharedSettingWith(await context(), studentId, field, value);
}

/** Adds one item to the caller's own material. Throws on failure. */
export async function addItem(item: NewItem): Promise<void> {
  await addItemWith({ db: getServerClient() }, item);
}

// ---------------------------------------------------------------- sign-in

export async function sendSignInLink(form: FormData): Promise<void> {
  const email = text(form, "email").toLowerCase();
  const next = safeNext(text(form, "next"));
  const signInPage = (params: Record<string, string>) => {
    const query = new URLSearchParams(params);
    if (next !== "/") query.set("next", next);
    return `/sign-in?${query}`;
  };
  if (!email) redirect(signInPage({ error: "Enter your email address." }));

  const callback = new URL("/auth/callback", await getAppUrl());
  if (next !== "/") callback.searchParams.set("next", next);
  const { error } = await getServerClient().auth.signInWithOtp({
    email,
    options: { emailRedirectTo: callback.toString(), shouldCreateUser: true },
  });
  if (error) redirect(signInPage({ error: error.message }));
  redirect(signInPage({ sent: email }));
}

export async function signOut(): Promise<void> {
  await getServerClient().auth.signOut();
  redirect("/sign-in");
}

// ---------------------------------------------------------------- forms

export async function saveProfileForm(form: FormData): Promise<void> {
  const { user } = await requireUser();
  const { error } = await getServerClient()
    .from("profiles")
    .update({ display_name: text(form, "display_name") || null, is_tutor: form.get("is_tutor") === "on" })
    .eq("id", user.id);
  if (error) back("/settings", "error", error.message);
  back("/settings", "notice", "Saved.");
}

export async function sharedSettingForm(studentId: string, field: SharedField, returnTo: string, form: FormData) {
  try {
    await updateSharedSetting(studentId, field, text(form, "value"));
  } catch (e) {
    back(returnTo, "error", (e as Error).message);
  }
  back(returnTo, "notice", field === "level" ? "Level saved." : "Focus saved.");
}

export async function addItemForm(form: FormData): Promise<void> {
  const topicId = text(form, "topic");
  const kind = text(form, "kind");
  try {
    await addItem({
      kind: kind as NewItem["kind"],
      text: text(form, "text"),
      meaning: text(form, "meaning"),
      example: text(form, "example") || null,
      explanation: text(form, "explanation") || null,
      ...(topicId && topicId !== "__new" ? { topicId } : { newTopicName: text(form, "new_topic") }),
    });
  } catch (e) {
    back("/add", "error", e instanceof Error && e.name === "PublishInputError" ? e.message : "Couldn't add that. Try again.");
  }
  back("/add", "notice", "Added.");
}

export async function inviteStudentForm(form: FormData): Promise<void> {
  const email = text(form, "email");
  try {
    await inviteStudent(email);
  } catch (e) {
    back("/tutor", "error", (e as Error).message);
  }
  back("/tutor", "notice", `Invite sent to ${email.toLowerCase()}.`);
}

export async function acceptInviteForm(token: string): Promise<void> {
  try {
    await acceptInvite(token);
  } catch (e) {
    back(`/invite/${encodeURIComponent(token)}`, "error", (e as Error).message);
  }
  back("/settings", "notice", "You're linked with your tutor.");
}

export async function unlinkForm(linkId: string, returnTo: string): Promise<void> {
  try {
    await unlink(linkId);
  } catch (e) {
    back(returnTo, "error", (e as Error).message);
  }
  back(returnTo, "notice", "Unlinked.");
}

export async function deleteAccountForm(form: FormData): Promise<void> {
  if (text(form, "confirm") !== "DELETE") {
    back("/settings", "error", "Type DELETE to confirm deleting your account.");
  }
  try {
    await deleteAccount();
  } catch (e) {
    back("/settings", "error", (e as Error).message);
  }
  back("/sign-in", "notice", "Your account and all your data are deleted.");
}

// ---------------------------------------------------------------- material

/** Renames a topic. Throws on failure. */
export async function renameTopic(id: string, name: string): Promise<void> {
  await renameTopicWith({ db: getServerClient() }, id, name);
}

/** Moves every item of `fromId` into `intoId` and keeps `fromId`, marked merged. */
export async function mergeTopics(fromId: string, intoId: string): Promise<void> {
  await mergeTopicsWith({ db: getServerClient() }, fromId, intoId);
}

export async function undoMerge(changeId: string): Promise<void> {
  await undoMergeWith({ db: getServerClient() }, changeId);
}

export async function updateItem(id: string, patch: Parameters<typeof updateItemWith>[2]): Promise<void> {
  await updateItemWith({ db: getServerClient() }, id, patch);
}

export async function removeItem(id: string): Promise<void> {
  await removeItemWith({ db: getServerClient() }, id);
}

export async function restoreItem(changeId: string): Promise<void> {
  await restoreItemWith({ db: getServerClient() }, changeId);
}

export async function updateLessonDate(lessonId: string, date: string): Promise<void> {
  await updateLessonDateWith({ db: getServerClient() }, lessonId, date);
}

/** Runs a material change and returns to `returnTo` with a notice, or with the reason it failed. */
async function material(returnTo: string, done: string, run: () => Promise<void>): Promise<never> {
  try {
    await run();
  } catch (e) {
    back(returnTo, "error", e instanceof Error && e.name === "MaterialInputError" ? e.message : "Couldn't save that. Try again.");
  }
  back(returnTo, "notice", done);
}

export async function renameTopicForm(id: string, returnTo: string, form: FormData) {
  await material(returnTo, "Renamed.", () => renameTopic(id, text(form, "name")));
}

export async function mergeTopicsForm(fromId: string, returnTo: string, form: FormData) {
  const into = text(form, "into");
  if (!into) back(returnTo, "error", "Pick a topic to merge into.");
  // The merged topic's page now only points at the target, so land on that.
  await material(`/topics/${into}`, "Merged. You can undo it from the old topic's page.", () => mergeTopics(fromId, into));
}

export async function undoMergeForm(changeId: string, returnTo: string) {
  await material(returnTo, "Merge undone.", () => undoMerge(changeId));
}

export async function updateItemForm(id: string, returnTo: string, form: FormData) {
  const topicId = text(form, "topic");
  await material(returnTo, "Saved.", () =>
    updateItem(id, {
      text: text(form, "text"),
      meaning: text(form, "meaning"),
      example: text(form, "example") || null,
      explanation: text(form, "explanation") || null,
      ...(topicId ? { topicId } : {}),
    }),
  );
}

export async function removeItemForm(id: string, returnTo: string) {
  await material(returnTo, "Removed. It stays in the history, so you can restore it.", () => removeItem(id));
}

export async function restoreItemForm(changeId: string, returnTo: string) {
  await material(returnTo, "Restored.", () => restoreItem(changeId));
}

export async function lessonDateForm(lessonId: string, returnTo: string, form: FormData) {
  await material(returnTo, "Date saved.", () => updateLessonDate(lessonId, text(form, "date")));
}

// ---------------------------------------------------------------- notes
// Plain text entries, the student's alone. Row level security gives a tutor
// nothing here, and nothing a tutor sees links to it.

export async function addNoteForm(form: FormData): Promise<void> {
  const { user } = await requireUser("/notes");
  const body = text(form, "body");
  if (!body) back("/notes", "error", "Write something first.");
  const { error } = await getServerClient().from("notes").insert({ student_id: user.id, body });
  if (error) back("/notes", "error", "Couldn't save that. Try again.");
  back("/notes", "notice", "Saved.");
}

export async function saveNoteForm(id: string, form: FormData): Promise<void> {
  const { user } = await requireUser("/notes");
  const body = text(form, "body");
  if (!body) back("/notes", "error", "A note can't be empty. Delete it instead.");
  const { error } = await getServerClient()
    .from("notes")
    .update({ body, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("student_id", user.id);
  if (error) back("/notes", "error", "Couldn't save that. Try again.");
  back("/notes", "notice", "Saved.");
}

export async function deleteNoteForm(id: string): Promise<void> {
  const { user } = await requireUser("/notes");
  const { error } = await getServerClient().from("notes").delete().eq("id", id).eq("student_id", user.id);
  if (error) back("/notes", "error", "Couldn't delete that. Try again.");
  back("/notes", "notice", "Deleted.");
}
