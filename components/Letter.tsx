import type { ReactNode } from "react";
import { countWord, firstName, shortDay, weekday, year, type Letter as LetterData } from "../lib/letters";

export type LetterWord = {
  id: string;
  kind: string;
  text: string;
  meaning: string;
  example: string | null;
};

/**
 * One lesson as a letter: postmark, who it is from, a greeting, a line on how
 * many things are inside, the words, and the tutor's signature. The student's
 * own uploads and hand-added words are headed "Your own notes" and "Added by
 * hand", postmarked "You" and unsigned.
 */
export function Letter({
  letter,
  words,
  name,
  intro,
  ps,
}: {
  letter: LetterData<unknown>;
  words: LetterWord[];
  /** The student's display name, when the app has one. */
  name: string | null;
  /** The line under the greeting. Defaults to a count of the words inside. */
  intro?: string;
  /**
   * P.S. slot. Task 10 fills this with what may need attention, drawn from the
   * speaking patterns. Left empty until that summary exists.
   */
  ps?: ReactNode;
}) {
  const tutor = letter.kind === "tutor" && !!letter.from;
  const stamp = tutor ? firstName(letter.from!) : "You";
  const title = letter.kind === "hand" ? "Added by hand" : "Your own notes";
  const heading =
    letter.kind === "tutor"
      ? `From ${letter.from} · ${weekday(letter.date)}'s lesson`
      : `${weekday(letter.date)} · ${shortDay(letter.date)}`;
  const n = words.length;
  const line =
    intro ??
    (letter.kind === "tutor"
      ? `Here's what we covered. ${countWord(n)} ${n === 1 ? "thing" : "things"} to learn.`
      : `${countWord(n)} ${n === 1 ? "thing" : "things"} you added.`);

  return (
    <article className="sheet letter" aria-label={letter.kind === "tutor" ? heading : title}>
      <div className="post" aria-hidden="true">
        {stamp}
        <br />
        {shortDay(letter.date)}
        <br />
        {year(letter.date)}
      </div>
      <p className="from">{heading}</p>
      {letter.kind === "tutor" && <p className="dear">{name ? `Hola ${name},` : "Hola,"}</p>}
      {letter.kind !== "tutor" && <h2 className="title">{title}</h2>}
      <p>{line}</p>
      <ul className="words">
        {words.map((w) => (
          <li key={w.id}>
            <span className="es" lang="es">
              {w.text}
              {(w.kind === "phrase" || w.kind === "grammar") && <span className="k">{w.kind}</span>}
            </span>
            <span className="en">{w.meaning}</span>
            {w.example && (
              <span className="ex" lang="es">
                {w.example}
              </span>
            )}
          </li>
        ))}
      </ul>
      {tutor && <p className="sign">{firstName(letter.from!)}</p>}
      {ps && <p className="ps">{ps}</p>}
    </article>
  );
}
