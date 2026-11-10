// The home page reads the student's material as letters: one per lesson,
// newest first, and one more for what was added by hand. Pure, so the page
// only fetches and renders.

export type LetterLesson = {
  id: string;
  published_at: string;
  lesson_date: string;
  publisher_name: string | null;
  source: string;
};

export type LetterItem = { id: string; lesson_id: string | null; created_at: string };

export type Letter<I> = {
  /** The lesson id, or "hand" for items with no lesson. */
  key: string;
  kind: "tutor" | "own" | "hand";
  /** Who it is from, as written on the letter. Null for the student's own. */
  from: string | null;
  /** The lesson's date (YYYY-MM-DD), or the newest hand-added item's day. */
  date: string;
  /** When it arrived, for ordering. */
  at: string;
  items: I[];
};

export const HAND = "hand";

/** Letters newest first. A lesson with no live items is left out. */
export function groupLetters<I extends LetterItem>(lessons: LetterLesson[], items: I[]): Letter<I>[] {
  const byLesson = new Map<string, I[]>();
  const hand: I[] = [];
  for (const i of items) {
    if (!i.lesson_id) hand.push(i);
    else byLesson.set(i.lesson_id, [...(byLesson.get(i.lesson_id) ?? []), i]);
  }
  const out: Letter<I>[] = [];
  for (const l of lessons) {
    const mine = byLesson.get(l.id);
    if (!mine?.length) continue;
    out.push({
      key: l.id,
      kind: l.source === "tutor" ? "tutor" : "own",
      from: l.source === "tutor" ? l.publisher_name || "Your tutor" : null,
      date: l.lesson_date,
      at: l.published_at,
      items: mine,
    });
  }
  if (hand.length) {
    const at = hand.reduce((a, i) => (Date.parse(i.created_at) > Date.parse(a) ? i.created_at : a), hand[0].created_at);
    out.push({ key: HAND, kind: "hand", from: null, date: at.slice(0, 10), at, items: hand });
  }
  return out.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

const fromDay = (day: string) => new Date(`${day.slice(0, 10)}T12:00:00Z`);

/** "Tuesday" for a YYYY-MM-DD day. */
export const weekday = (day: string) => fromDay(day).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });

/** "Oct 28" for a YYYY-MM-DD day. */
export const shortDay = (day: string) =>
  fromDay(day).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export const year = (day: string) => day.slice(0, 4);

/** First name, for the postmark and the signature. */
export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

const SMALL = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];

/** "Four" up to twelve, then digits, as a letter would write it. */
export const countWord = (n: number) => {
  const w = SMALL[n] ?? String(n);
  return w.charAt(0).toUpperCase() + w.slice(1);
};

/**
 * What a letter holds, by kind: "3 words · 1 phrase · 1 grammar point". A
 * lesson is not only vocabulary, so nothing here calls everything words.
 */
export function describeKinds(items: { kind: string }[]): string {
  const names: [string, string, string][] = [
    ["word", "word", "words"],
    ["phrase", "phrase", "phrases"],
    ["grammar", "grammar point", "grammar points"],
  ];
  const parts = names.flatMap(([kind, one, many]) => {
    const n = items.filter((i) => i.kind === kind).length;
    return n ? [`${n} ${n === 1 ? one : many}`] : [];
  });
  return parts.length ? parts.join(" · ") : "Empty";
}

/**
 * The example with the word blanked, for a cloze card. The article stays
 * ("el andén" blanks "andén" in "en el andén dos"), so it tries the word
 * without one first. Null when the word does not appear as written.
 */
export function blankOut(example: string, text: string): string | null {
  const bare = text.trim().replace(/^(el|la|los|las|un|una|unos|unas|lo)\s+/i, "");
  const tries = [bare, text.trim()];
  for (const t of tries) {
    if (!t) continue;
    const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(?<!\\p{L})${escaped}(?!\\p{L})`, "iu");
    if (re.test(example)) return example.replace(re, "___");
  }
  return null;
}
