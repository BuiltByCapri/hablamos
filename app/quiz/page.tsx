import { getServerClient, requireUser } from "../../lib/supabase/server";
import { itemStats, toRevisit } from "../../lib/progress";
import { describeKinds, groupLetters, shortDay, weekday } from "../../lib/letters";
import { SKILLS, type Skill } from "../../lib/quiz";
import { AppFoot, AppNav } from "../../components/AppNav";
import { PracticeTabs } from "../../components/PracticeTabs";
import { Quiz } from "../../components/Quiz";

type Search = Promise<{ letter?: string; topic?: string; skill?: string; revisit?: string }>;

export default async function QuizPage({ searchParams }: { searchParams: Search }) {
  const params = await searchParams;
  const { user, profile } = await requireUser("/quiz");
  const db = getServerClient();

  const [lessonsRes, itemsRes, topicsRes, resultsRes] = await Promise.all([
    db.from("lessons").select("id, published_at, lesson_date, publisher_name, source").eq("student_id", user.id),
    db
      .from("items")
      .select("id, lesson_id, topic_id, kind, text, meaning, example, created_at")
      .eq("student_id", user.id)
      .is("deleted_at", null)
      .order("created_at"),
    db.from("topics").select("id, name").eq("student_id", user.id).is("merged_into", null).order("name"),
    // Only results in this student's own sessions, whatever RLS would also let a tutor read.
    db.from("session_results").select("item_id, outcome, at, sessions!inner(student_id)").eq("sessions.student_id", user.id),
  ]);
  for (const r of [lessonsRes, itemsRes, topicsRes, resultsRes]) {
    if (r.error) throw new Error(`quiz read failed: ${r.error.message}`);
  }
  const items = itemsRes.data ?? [];
  const revisitIds = toRevisit(
    itemStats((resultsRes.data ?? []).map((r) => ({ itemId: r.item_id, outcome: r.outcome, at: r.at }))),
    new Date(),
  );
  const live = new Set(items.map((i) => i.id));

  const letters = groupLetters(lessonsRes.data ?? [], items).map((l) => ({
    key: l.key,
    label: `${l.kind === "tutor" ? `${weekday(l.date)}'s lesson` : l.kind === "hand" ? "Added by hand" : "Your own notes"} · ${shortDay(l.date)}`,
    contents: describeKinds(l.items),
  }));
  const counts = new Map<string, typeof items>();
  for (const i of items) counts.set(i.topic_id, [...(counts.get(i.topic_id) ?? []), i]);
  const topics = (topicsRes.data ?? [])
    .filter((t) => counts.has(t.id))
    .map((t) => ({ id: t.id, name: t.name, contents: describeKinds(counts.get(t.id)!) }));

  const skill = SKILLS.find((s) => s.id === params.skill)?.id as Skill | undefined;
  const initial = {
    letters: params.letter && letters.some((l) => l.key === params.letter) ? [params.letter] : [],
    topics: params.topic && topics.some((t) => t.id === params.topic) ? [params.topic] : [],
    revisit: params.revisit === "1",
    skills: skill ? [skill] : [],
  };

  return (
    <main className="page">
      <AppNav tutor={profile.is_tutor} />
      <h1 className="sr-only">Quiz</h1>
      <PracticeTabs current="quiz" />
      <Quiz
        letters={letters}
        topics={topics}
        items={items.map((i) => ({ id: i.id, kind: i.kind, text: i.text, meaning: i.meaning, example: i.example, lesson_id: i.lesson_id, topic_id: i.topic_id }))}
        revisitIds={revisitIds.filter((id) => live.has(id))}
        accent={profile.accent}
        voice={profile.voice}
        initial={initial}
      />
      <AppFoot />
    </main>
  );
}
