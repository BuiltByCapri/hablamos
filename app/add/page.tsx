import { getServerClient, requireUser } from "../../lib/supabase/server";
import { addItemForm } from "../actions";
import { DraftReview } from "../../components/DraftReview";
import { Flash } from "../../components/Flash";
import { AppFoot, AppNav } from "../../components/AppNav";
import { Field } from "../../components/Field";

type Search = Promise<{ notice?: string; error?: string }>;

export default async function AddPage({ searchParams }: { searchParams: Search }) {
  const { notice, error } = await searchParams;
  const { user, profile } = await requireUser("/add");
  const { data: topics } = await getServerClient()
    .from("topics")
    .select("id, name")
    .eq("student_id", user.id)
    .is("merged_into", null)
    .order("name");

  return (
    <main className="page">
      <AppNav tutor={profile.is_tutor} />
      <h1 className="title">Add material</h1>
      <p className="lede">Paste a lesson or your notes, or attach a photo. You check what it found before it's saved.</p>
      <Flash notice={notice} error={error} />

      <DraftReview studentId={user.id} topics={topics ?? []} role="student" doneHref="/" />

      <details className="disclosure">
        <summary>Add one word by hand</summary>
        <form action={addItemForm} className="disclosure-body">
          <Field label="Spanish">
            <input name="text" required lang="es" />
          </Field>
          <Field label="Meaning">
            <input name="meaning" required />
          </Field>
          <Field label="Example" note="optional">
            <input name="example" lang="es" />
          </Field>
          <div className="row">
            <Field label="Kind" className="grow">
              <select name="kind" defaultValue="word">
                <option value="word">Word</option>
                <option value="phrase">Phrase</option>
                <option value="grammar">Grammar</option>
              </select>
            </Field>
            <Field label="Topic" className="grow">
              <select name="topic" defaultValue={topics?.[0]?.id ?? "__new"}>
                {(topics ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
                <option value="__new">New topic</option>
              </select>
            </Field>
          </div>
          <Field label="New topic name" note="if you picked New topic">
            <input name="new_topic" />
          </Field>
          <Field label="Explanation" note="grammar only">
            <input name="explanation" />
          </Field>
          <button type="submit" className="primary">
            Add item
          </button>
        </form>
      </details>
      <AppFoot />
    </main>
  );
}
