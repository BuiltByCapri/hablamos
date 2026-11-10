import Link from "next/link";
import { getServerClient, requireUser } from "../../lib/supabase/server";
import { newItems } from "../../lib/material";
import { flashcardDeck } from "../../lib/sessions";
import { itemStats, toRevisit } from "../../lib/progress";
import { Flashcard } from "../../components/Flashcard";
import { AppFoot, AppNav } from "../../components/AppNav";
import { PracticeTabs } from "../../components/PracticeTabs";
import { shortDay } from "../../lib/letters";

type Search = Promise<{ topic?: string; filter?: string }>;

function shuffled<T>(list: T[]): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export default async function Page({ searchParams }: { searchParams: Search }) {
  const { topic, filter } = await searchParams;
  const { user, profile } = await requireUser("/flashcards");
  const db = getServerClient();

  const [lessonsRes, itemsRes, topicsRes, resultsRes] = await Promise.all([
    db.from("lessons").select("id, published_at, lesson_date").eq("student_id", user.id),
    db
      .from("items")
      .select("id, lesson_id, topic_id, deleted_at, kind, text, meaning, example")
      .eq("student_id", user.id)
      .is("deleted_at", null),
    db.from("topics").select("id, name").eq("student_id", user.id).is("merged_into", null).order("name"),
    // Only results in this student's own sessions, whatever RLS would also let a tutor read.
    db.from("session_results").select("item_id, outcome, at, sessions!inner(student_id)").eq("sessions.student_id", user.id),
  ]);
  for (const r of [lessonsRes, itemsRes, topicsRes, resultsRes]) {
    if (r.error) throw new Error(`flashcards read failed: ${r.error.message}`);
  }
  const topics = topicsRes.data ?? [];
  const results = resultsRes.data ?? [];
  const lessonDay = new Map((lessonsRes.data ?? []).map((l) => [l.id, l.lesson_date]));
  const everything = flashcardDeck(itemsRes.data ?? []);

  let deck = everything;
  if (topic) deck = deck.filter((i) => i.topic_id === topic);
  if (filter === "new") {
    const studied = new Set(results.map((r) => r.item_id));
    const fresh = new Set(newItems(deck, lessonsRes.data ?? [], studied).map((i) => i.id));
    deck = deck.filter((i) => fresh.has(i.id));
  } else if (filter === "revisit") {
    const ids = toRevisit(itemStats(results.map((r) => ({ itemId: r.item_id, outcome: r.outcome, at: r.at }))), new Date());
    const wanted = new Set(ids);
    deck = deck.filter((i) => wanted.has(i.id));
  }

  const link = (next: { topic?: string; filter?: string }) => {
    const q = new URLSearchParams();
    if (next.topic) q.set("topic", next.topic);
    if (next.filter) q.set("filter", next.filter);
    const s = q.toString();
    return s ? `/flashcards?${s}` : "/flashcards";
  };
  const pick = (label: string, href: string, on: boolean) => (
    <li key={label}>
      {on ? <span aria-current="true">{label}</span> : <Link href={href}>{label}</Link>}
    </li>
  );

  return (
    <main className="page">
      <AppNav tutor={profile.is_tutor} />
      <h1 className="sr-only">Practice</h1>
      <PracticeTabs current="cards" />
      <div className="filters">
        <div className="filter">
          <span className="filter-label" id="show-label">
            Show
          </span>
          <ul aria-labelledby="show-label">
            {pick("All", link({ topic }), !filter)}
            {pick("New", link({ topic, filter: "new" }), filter === "new")}
            {pick("To revisit", link({ topic, filter: "revisit" }), filter === "revisit")}
          </ul>
        </div>
        {topics.length > 0 && (
          <div className="filter">
            <span className="filter-label" id="topic-label">
              Topic
            </span>
            <ul aria-labelledby="topic-label">
              {pick("Any", link({ filter }), !topic)}
              {topics.map((t) => pick(t.name, link({ topic: t.id, filter }), topic === t.id))}
            </ul>
          </div>
        )}
      </div>
      {deck.length === 0 ? (
        <section className="sheet letter">
          <p>
            {everything.length === 0
              ? "No words or phrases yet. Add some material to get cards."
              : filter === "revisit"
                ? "Nothing to revisit right now."
                : "No cards match that. Try another filter."}
          </p>
          {everything.length === 0 && (
            <Link href="/add" className="btn primary wide">
              Add material
            </Link>
          )}
        </section>
      ) : (
        <Flashcard
          key={`${topic ?? ""}-${filter ?? ""}`}
          cards={shuffled(deck).map((i) => ({
            id: i.id,
            text: i.text,
            meaning: i.meaning,
            example: i.example,
            from: i.lesson_id && lessonDay.get(i.lesson_id) ? `From ${shortDay(lessonDay.get(i.lesson_id)!)}` : "Added by hand",
          }))}
        />
      )}
      <AppFoot />
    </main>
  );
}
