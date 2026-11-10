import Link from "next/link";
import { getServerClient, requireUser } from "../../lib/supabase/server";
import { lastChange, latestSharedChanges } from "../../lib/last-change";
import { deleteAccountForm, saveProfileForm, sharedSettingForm, unlinkForm } from "../actions";
import { Flash } from "../../components/Flash";
import { AppFoot, AppNav } from "../../components/AppNav";
import { Field } from "../../components/Field";

type Search = Promise<{ notice?: string; error?: string }>;

export default async function SettingsPage({ searchParams }: { searchParams: Search }) {
  const { notice, error } = await searchParams;
  const { user, profile } = await requireUser("/settings");
  const db = getServerClient();

  const [log, { data: tutors }, { data: links }] = await Promise.all([
    latestSharedChanges(db, user.id),
    db.rpc("tutor_names_for_student"),
    db.from("tutor_links").select("id, tutor_id").eq("student_id", user.id).eq("status", "active"),
  ]);
  const tutorName = new Map((tutors ?? []).map((t) => [t.tutor_id, t.display_name]));

  const shared = (["level", "focus"] as const).map((field) => ({
    field,
    label: field === "level" ? "Level" : "Current focus",
    value: profile[field] ?? "",
    changed: lastChange(field, log, user.id, profile.timezone),
  }));

  return (
    <main className="page">
      <AppNav tutor={profile.is_tutor} />
      <h1 className="title">Settings</h1>
      <p className="lede">Signed in as {user.email}</p>
      <Flash notice={notice} error={error} />

      <section className="block" aria-labelledby="profile-heading">
        <h2 id="profile-heading">Profile</h2>
        <form action={saveProfileForm} className="stack">
          <Field label="Your name">
            <input name="display_name" defaultValue={profile.display_name ?? ""} />
          </Field>
          <div>
            <label className="check">
              <input type="checkbox" name="is_tutor" defaultChecked={profile.is_tutor} /> I'm a tutor
            </label>
            <p className="note">Lets you invite students. You see nothing of theirs until a student accepts.</p>
          </div>
          <button type="submit" className="primary">
            Save
          </button>
        </form>
        {profile.is_tutor && (
          <p>
            <Link href="/tutor">Your students and invites</Link>
          </p>
        )}
      </section>

      <section className="block" aria-labelledby="learning-heading">
        <h2 id="learning-heading">Learning</h2>
        <p className="note">Your tutors can change these too.</p>
        {shared.map((s) => (
          <form key={s.field} action={sharedSettingForm.bind(null, user.id, s.field, "/settings")} className="stack">
            <div className="row">
              <Field label={s.label} className="grow">
                <input name="value" defaultValue={s.value} />
              </Field>
              <button type="submit">Save</button>
            </div>
            {s.changed && <p className="note">{s.changed}</p>}
          </form>
        ))}
      </section>

      <section className="block" aria-labelledby="tutors-heading">
        <h2 id="tutors-heading">Tutors</h2>
        {links && links.length ? (
          <ul className="people">
            {links.map((l) => (
              <li key={l.id}>
                <span>{tutorName.get(l.tutor_id) || "Your tutor"}</span>
                <form action={unlinkForm.bind(null, l.id, "/settings")}>
                  <button type="submit" className="link link-mono link-red">
                    Unlink
                  </button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p>No tutors linked. Everything works on your own too.</p>
        )}
        <p className="note">Unlinking ends that tutor's access. Your items, lessons and history stay with you.</p>
      </section>

      <section className="block block-danger" aria-labelledby="delete-heading">
        <h2 id="delete-heading">Delete account</h2>
        <p>This deletes your account and all your data: items, topics, lessons, study history and notes. It can't be undone.</p>
        {profile.is_tutor && <p>Anything you published for your students stays with them.</p>}
        <form action={deleteAccountForm} className="stack">
          <Field label="Type DELETE to confirm">
            <input name="confirm" autoComplete="off" />
          </Field>
          <button type="submit" className="danger">
            Delete my account
          </button>
        </form>
      </section>
      <AppFoot />
    </main>
  );
}
