import { getServerClient, requireUser } from "../../lib/supabase/server";
import { addNoteForm, deleteNoteForm, saveNoteForm } from "../actions";
import { Flash } from "../../components/Flash";
import { AppFoot, AppNav } from "../../components/AppNav";
import { whenText } from "../../lib/material";

type Search = Promise<{ notice?: string; error?: string }>;

// The student's own notes. Nothing a tutor sees links here, and row level
// security gives a tutor no read on the table.
export default async function NotesPage({ searchParams }: { searchParams: Search }) {
  const { notice, error } = await searchParams;
  const { user, profile } = await requireUser("/notes");
  const { data: notes } = await getServerClient()
    .from("notes")
    .select("id, body, created_at, updated_at")
    .eq("student_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <main className="page">
      <AppNav tutor={profile.is_tutor} />
      <h1 className="title">Notes</h1>
      <p className="lede">Only you can see these.</p>
      <Flash notice={notice} error={error} />

      <form action={addNoteForm}>
        <div className="sheet ruled upload">
          <label htmlFor="new-note" className="mono from-line">
            New note
          </label>
          <textarea id="new-note" name="body" className="writing" rows={4} required />
        </div>
        <button type="submit" className="primary wide">
          Save note
        </button>
      </form>

      {(notes ?? []).map((n) => (
        <article key={n.id} className="sheet ruled note-sheet">
          <p className="mono from-line">{whenText(n.created_at, profile.timezone)}</p>
          <p className="note-body">{n.body}</p>
          <div className="item-actions">
            <details className="mini">
              <summary>Edit</summary>
              <div className="mini-body">
                <form action={saveNoteForm.bind(null, n.id)} className="stack">
                  <textarea name="body" rows={4} defaultValue={n.body} aria-label="Note" className="writing" />
                  <div className="row">
                    <button type="submit" className="primary">
                      Save
                    </button>
                  </div>
                </form>
              </div>
            </details>
            <form action={deleteNoteForm.bind(null, n.id)}>
              <button type="submit" className="link link-mono link-red">
                Delete
              </button>
            </form>
          </div>
        </article>
      ))}
      <AppFoot />
    </main>
  );
}
