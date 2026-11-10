import Link from "next/link";
import { getServerClient, requireUser } from "../lib/supabase/server";
import { newItems } from "../lib/material";
import { describeKinds, groupLetters, shortDay, weekday, type Letter as LetterData } from "../lib/letters";
import { Flash } from "../components/Flash";
import { AppFoot, AppNav } from "../components/AppNav";
import { Letter } from "../components/Letter";

type Search = Promise<{ notice?: string; error?: string; letter?: string }>;

export default async function Page({ searchParams }: { searchParams: Search }) {
  const { notice, error, letter: chosen } = await searchParams;
  const { user, profile } = await requireUser();
  const db = getServerClient();

  const [lessonsRes, itemsRes, topicsRes] = await Promise.all([
    db.from("lessons").select("id, published_at, lesson_date, publisher_name, source").eq("student_id", user.id),
    db
      .from("items")
      .select("id, lesson_id, topic_id, deleted_at, kind, text, meaning, example, created_at")
      .eq("student_id", user.id)
      .is("deleted_at", null)
      .order("created_at"),
    db.from("topics").select("id, name").eq("student_id", user.id).is("merged_into", null).order("name"),
  ]);

  // A failed read must not show as an empty or all-new home, so it throws.
  for (const r of [lessonsRes, itemsRes, topicsRes]) if (r.error) throw new Error(`home read failed: ${r.error.message}`);
  const lessons = lessonsRes.data ?? [];
  const items = itemsRes.data ?? [];
  const topics = topicsRes.data ?? [];

  // Studied means any session result at all, including "came up".
  const candidates = newItems(items, lessons, new Set());
  const studied = new Set<string>();
  for (let n = 0; n < candidates.length; n += 100) {
    const { data: results, error: resultsError } = await db
      .from("session_results")
      .select("item_id")
      .in(
        "item_id",
        candidates.slice(n, n + 100).map((i) => i.id),
      );
    if (resultsError) throw new Error(`session results read failed: ${resultsError.message}`);
    for (const r of results ?? []) studied.add(r.item_id);
  }
  const fresh = candidates.filter((i) => !studied.has(i.id));
  const counts = new Map<string, number>();
  for (const i of items) counts.set(i.topic_id, (counts.get(i.topic_id) ?? 0) + 1);

  const letters = groupLetters(lessons, items);
  const name = profile.display_name?.trim() || null;

  // The open letter: one the student picked from the list, else the latest
  // lesson's unstudied items, else the latest letter in full.
  type Open = { letter: LetterData<(typeof items)[number]>; words: typeof items; fresh: boolean };
  let open: Open | null = null;
  const picked = chosen ? letters.find((l) => l.key === chosen) : undefined;
  if (picked) {
    open = { letter: picked, words: picked.items, fresh: false };
  } else if (fresh.length > 0) {
    const latest = letters.find((l) => l.key === fresh[0].lesson_id);
    if (latest) open = { letter: latest, words: fresh, fresh: true };
  } else if (letters[0]) {
    open = { letter: letters[0], words: letters[0].items, fresh: false };
  }
  const earlier = letters.filter((l) => l !== open?.letter);
  const label = (l: LetterData<unknown>) =>
    l.kind === "tutor" ? `${weekday(l.date)}'s lesson` : l.kind === "hand" ? "Added by hand" : "Your own notes";

  return (
    <main className="page">
      <AppNav tutor={profile.is_tutor} />
      <h1 className="sr-only">Letters</h1>
      <Flash notice={notice} error={error} />

      {open ? (
        <>
          <Letter letter={open.letter} words={open.words} name={name} />
          {topics.length > 0 && (
            <Link href={open.fresh ? "/flashcards?filter=new" : "/flashcards"} className="btn primary wide">
              {open.fresh ? "Practice these" : "Practice"}
            </Link>
          )}
        </>
      ) : (
        <article className="sheet letter">
          <p className="from">Nothing here yet</p>
          <p className="dear">{name ? `Hola ${name},` : "Hola,"}</p>
          <p>
            When your tutor sends a lesson, it arrives here as a letter. You can also add your own notes or a photo of the
            board, and the words land here the same way.
          </p>
          <Link href="/add" className="btn primary wide">
            Add material
          </Link>
          <p>
            <Link href="/how">How Hablamos works</Link>
          </p>
        </article>
      )}

      {open && letters.length < 3 && (
        <p className="newhere">
          New here? <Link href="/how">How Hablamos works</Link>
        </p>
      )}

      {earlier.length > 0 && (
        <section className="list" aria-labelledby="earlier">
          <h2 id="earlier">{picked ? "Other letters" : "Earlier letters"}</h2>
          <ul>
            {earlier.map((l) => (
              <li key={l.key}>
                <Link href={`/?letter=${l.key}`}>
                  <span className="label">{label(l)}</span>
                  <span>
                    {shortDay(l.date)} · {describeKinds(l.items)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {topics.length > 0 && (
        <section className="list" aria-labelledby="by-topic">
          <h2 id="by-topic">By topic</h2>
          <ul>
            {topics.map((t) => (
              <li key={t.id}>
                <Link href={`/topics/${t.id}`}>
                  <span className="label">{t.name}</span>
                  <span aria-label={`${counts.get(t.id) ?? 0} items`}>{counts.get(t.id) ?? 0}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <AppFoot />
    </main>
  );
}
