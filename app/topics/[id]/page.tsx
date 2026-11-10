import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerClient, requireUser } from "../../../lib/supabase/server";
import { latestMerge, planUndoMerge, type ChangeRow } from "../../../lib/material";
import { lessonDateForm, mergeTopicsForm, renameTopicForm, undoMergeForm } from "../../actions";
import { Flash } from "../../../components/Flash";
import { ItemRow } from "../../../components/ItemRow";
import { AppFoot, AppNav } from "../../../components/AppNav";
import { Field } from "../../../components/Field";

type Search = Promise<{ notice?: string; error?: string }>;
type Params = Promise<{ id: string }>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CHUNK = 100;

export default async function TopicPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { id } = await params;
  const { notice, error } = await searchParams;
  if (!UUID.test(id)) notFound();
  const { user, profile } = await requireUser(`/topics/${id}`);
  const db = getServerClient();

  // Row level security answers for the viewer: the student, or a tutor with an
  // active link. Anyone else gets no row, so the page is a 404 for them.
  const { data: topic, error: topicError } = await db.from("topics").select("id, student_id, name, merged_into").eq("id", id).maybeSingle();
  if (topicError) throw new Error(`topic read failed: ${topicError.message}`);
  if (!topic) notFound();
  const returnTo = `/topics/${id}`;
  const own = topic.student_id === user.id;
  const home = own ? "/" : "/tutor";

  const [topicsRes, itemsRes, mergedFromRes] = await Promise.all([
    db.from("topics").select("id, name").eq("student_id", topic.student_id).is("merged_into", null).order("name"),
    db
      .from("items")
      .select("id, kind, text, meaning, example, explanation, topic_id, created_by, created_by_name, last_edited_at, deleted_at, lesson_id")
      .eq("student_id", topic.student_id)
      .eq("topic_id", id)
      .order("created_at"),
    db.from("topics").select("id, name").eq("student_id", topic.student_id).eq("merged_into", id).order("name"),
  ]);
  for (const r of [topicsRes, itemsRes, mergedFromRes]) if (r.error) throw new Error(`topic read failed: ${r.error.message}`);
  const topics = topicsRes.data;
  const items = itemsRes.data;
  const mergedFrom = mergedFromRes.data;

  const log: ChangeRow[] = [];
  const itemIds = (items ?? []).map((i) => i.id);
  for (let n = 0; n < itemIds.length; n += CHUNK) {
    const { data, error: logError } = await db
      .from("change_log")
      .select("id, entity_id, actor_id, actor_name, action, before, after, at")
      .eq("student_id", topic.student_id)
      .eq("entity", "item")
      .in("entity_id", itemIds.slice(n, n + CHUNK));
    if (logError) throw new Error(`history read failed: ${logError.message}`);
    log.push(...((data ?? []) as ChangeRow[]));
  }
  const { data: topicLog, error: topicLogError } = await db
    .from("change_log")
    .select("id, entity_id, actor_id, actor_name, action, before, after, at")
    .eq("student_id", topic.student_id)
    .eq("entity", "topic")
    .eq("entity_id", id)
    .in("action", ["merge", "unmerge"])
    .order("at", { ascending: false })
    .limit(1);
  if (topicLogError) throw new Error(`history read failed: ${topicLogError.message}`);
  const merges = (topicLog ?? []) as ChangeRow[];

  const header = (
    <>
      <AppNav tutor={profile.is_tutor} />
      <Link href={home} className="back">
        {own ? "Letters" : "Students"}
      </Link>
    </>
  );

  if (topic.merged_into) {
    const merge = latestMerge(merges, id);
    const { data: target, error: targetError } = await db.from("topics").select("id, name").eq("id", topic.merged_into).maybeSingle();
    if (targetError) throw new Error(`topic read failed: ${targetError.message}`);
    let back = 0;
    if (merge) {
      const { data: targetItems, error: targetItemsError } = await db.from("items").select("id, topic_id").eq("topic_id", merge.record.intoId);
      if (targetItemsError) throw new Error(`items read failed: ${targetItemsError.message}`);
      back = planUndoMerge(targetItems ?? [], merge.record).filter((i) => i.topic_id === id).length;
    }
    return (
      <main className="page">
        {header}
        <h1 className="title">{topic.name}</h1>
        <Flash notice={notice} error={error} />
        <section className="sheet letter">
          <p>
            This topic was merged into <Link href={`/topics/${topic.merged_into}`}>{target?.name ?? "another topic"}</Link>.
          </p>
          {merge && (
            <form action={undoMergeForm.bind(null, merge.id, returnTo)}>
              <button type="submit">Undo the merge</button>
              <p className="note">
                Moves back {back} {back === 1 ? "item" : "items"}.
              </p>
            </form>
          )}
        </section>
        <AppFoot />
      </main>
    );
  }

  const lessonIds = [...new Set((items ?? []).map((i) => i.lesson_id).filter((l): l is string => !!l))];
  const lessonsRes = lessonIds.length
    ? await db.from("lessons").select("id, lesson_date, publisher_name, source").in("id", lessonIds).order("lesson_date", { ascending: false })
    : { data: [], error: null };
  if (lessonsRes.error) throw new Error(`lessons read failed: ${lessonsRes.error.message}`);
  const lessons = lessonsRes.data;

  const live = (items ?? []).filter((i) => !i.deleted_at);
  const removed = (items ?? []).filter((i) => i.deleted_at);
  const others = (topics ?? []).filter((t) => t.id !== id);
  const rowFor = (i: (typeof live)[number]) => (
    <ItemRow
      key={i.id}
      item={i}
      changes={log.filter((c) => c.entity_id === i.id)}
      topics={topics ?? []}
      viewerId={user.id}
      timeZone={profile.timezone}
      returnTo={returnTo}
    />
  );

  return (
    <main className="page">
      {header}
      <h1 className="title">{topic.name}</h1>
      {(mergedFrom ?? []).length > 0 && (
        <p className="lede">
          Merged in:{" "}
          {(mergedFrom ?? []).map((t, n) => (
            <span key={t.id}>
              {n > 0 && ", "}
              <Link href={`/topics/${t.id}`}>{t.name}</Link>
            </span>
          ))}
        </p>
      )}
      <Flash notice={notice} error={error} />

      <section className="sheet letter flat">
        {live.length === 0 ? (
          <p>No items in this topic.</p>
        ) : (
          <ul className="words">{live.map(rowFor)}</ul>
        )}
      </section>

      <details className="disclosure">
        <summary>Rename or merge</summary>
        <div className="disclosure-body">
          <form action={renameTopicForm.bind(null, id, returnTo)} className="row">
            <Field label="Name" className="grow">
              <input name="name" defaultValue={topic.name} required />
            </Field>
            <button type="submit">Rename</button>
          </form>
          {others.length > 0 && (
            <form action={mergeTopicsForm.bind(null, id, returnTo)} className="row">
              <Field label="Merge all of this topic's items into" className="grow">
                <select name="into" defaultValue="">
                  <option value="" disabled>
                    Pick a topic
                  </option>
                  {others.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </Field>
              <button type="submit">Merge</button>
            </form>
          )}
        </div>
      </details>

      {(lessons ?? []).length > 0 && (
        <details className="disclosure">
          <summary>Lesson dates</summary>
          <div className="disclosure-body">
            {(lessons ?? []).map((l) => (
              <form key={l.id} action={lessonDateForm.bind(null, l.id, returnTo)} className="row">
                <Field label={l.source === "tutor" ? `Lesson with ${l.publisher_name}` : "Your upload"} className="grow">
                  <input type="date" name="date" defaultValue={l.lesson_date} required />
                </Field>
                <button type="submit">Save</button>
              </form>
            ))}
          </div>
        </details>
      )}

      {removed.length > 0 && (
        <details className="disclosure">
          <summary>Removed ({removed.length})</summary>
          <div className="disclosure-body">
            <ul className="words">{removed.map(rowFor)}</ul>
          </div>
        </details>
      )}
      <AppFoot />
    </main>
  );
}
