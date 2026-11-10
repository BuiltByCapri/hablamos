import Link from "next/link";
import { getServerClient, requireUser } from "../../lib/supabase/server";
import { inviteStudentForm, sharedSettingForm, unlinkForm } from "../actions";
import { Flash } from "../../components/Flash";
import { AppFoot, AppNav } from "../../components/AppNav";
import { Field } from "../../components/Field";

type Search = Promise<{ notice?: string; error?: string }>;

export default async function TutorPage({ searchParams }: { searchParams: Search }) {
  const { notice, error } = await searchParams;
  const { user, profile } = await requireUser("/tutor");

  if (!profile.is_tutor) {
    return (
      <main className="page">
        <AppNav tutor={false} />
        <h1 className="title">Students</h1>
        <p className="lede">
          Turn on "I'm a tutor" in <Link href="/settings">settings</Link> to invite students.
        </p>
        <AppFoot />
      </main>
    );
  }

  const db = getServerClient();
  const { data: links } = await db
    .from("tutor_links")
    .select("id, student_id, invite_email, status, created_at")
    .eq("tutor_id", user.id)
    .in("status", ["invited", "active"])
    .order("created_at");
  const invited = (links ?? []).filter((l) => l.status === "invited");
  const active = await Promise.all(
    (links ?? [])
      .filter((l) => l.status === "active" && l.student_id)
      .map(async (l) => {
        const { data } = await db.rpc("student_profile_for_tutor", { student: l.student_id! });
        return { link: l, student: data?.[0] };
      }),
  );

  return (
    <main className="page">
      <AppNav tutor={profile.is_tutor} />
      <h1 className="title">Students</h1>
      <Flash notice={notice} error={error} />

      <section className="block" aria-labelledby="linked-heading">
        <h2 id="linked-heading">Linked</h2>
        {active.length ? (
          <ul className="people-list">
            {active.map(({ link, student }) => (
              <li key={link.id} className="student">
                <p className="name">{student?.display_name || link.invite_email}</p>
                <Link href={`/tutor/${link.student_id}/upload`} className="btn primary">
                  Send a lesson
                </Link>
                {(["level", "focus"] as const).map((field) => (
                  <form key={field} action={sharedSettingForm.bind(null, link.student_id!, field, "/tutor")} className="row">
                    <Field label={field === "level" ? "Level" : "Current focus"} className="grow">
                      <input name="value" defaultValue={student?.[field] ?? ""} />
                    </Field>
                    <button type="submit">Save</button>
                  </form>
                ))}
                <form action={unlinkForm.bind(null, link.id, "/tutor")}>
                  <button type="submit" className="link link-mono link-red">
                    Unlink
                  </button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="note">No students yet.</p>
        )}
      </section>

      <section className="block" aria-labelledby="invite-heading">
        <h2 id="invite-heading">Invite a student</h2>
        <form action={inviteStudentForm} className="row">
          <Field label="Student's email" className="grow">
            <input type="email" name="email" required />
          </Field>
          <button type="submit" className="primary">
            Send invite
          </button>
        </form>
      </section>

      {invited.length > 0 && (
        <section className="block" aria-labelledby="waiting-heading">
          <h2 id="waiting-heading">Waiting to accept</h2>
          <ul className="people">
            {invited.map((l) => (
              <li key={l.id}>
                <span>{l.invite_email}</span>
                <form action={unlinkForm.bind(null, l.id, "/tutor")}>
                  <button type="submit" className="link link-mono link-red">
                    Cancel invite
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}
      <AppFoot />
    </main>
  );
}
