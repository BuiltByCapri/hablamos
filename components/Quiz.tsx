"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { buildQuiz, checkAnswer, selectItems, SKILLS, type Mark, type Question, type QuizItem, type QuizScope, type Skill } from "../lib/quiz";
import { AccentBar } from "./AccentBar";
import { Say, VoiceProvider } from "./Say";

type Choice = { key: string; label: string; contents: string };
type Length = 10 | 20 | "all";
type Answered = { q: Question; given: string; right: boolean; marks: Mark[] };

async function post(body: Record<string, unknown>): Promise<Response> {
  return fetch("/api/sessions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

const ASK: Record<string, string> = {
  "type:es": "Write it in Spanish",
  "type:en": "Write it in English",
  "pick:es": "Pick the Spanish",
  "pick:en": "Pick the meaning",
  "gap:es": "Fill the gap",
  "conjugate:es": "Present tense",
  "nationality:es": "Fill the gap",
};

/**
 * Setup, then one question per index card, then the score and the misses.
 * The session starts with the first answer, so opening and leaving creates
 * nothing. Item questions record right or missed for their item; skill
 * questions only mark the quiz as answered.
 */
export function Quiz(props: {
  letters: Choice[];
  topics: { id: string; name: string; contents: string }[];
  items: QuizItem[];
  revisitIds: string[];
  accent: string;
  voice: string | null;
  initial: QuizScope;
}) {
  const [scope, setScope] = useState<QuizScope>(props.initial);
  const [length, setLength] = useState<Length>(10);
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [index, setIndex] = useState(0);
  const [value, setValue] = useState("");
  const [current, setCurrent] = useState<Answered | null>(null);
  const [answers, setAnswers] = useState<Answered[]>([]);
  const [finished, setFinished] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const session = useRef<Promise<string> | null>(null);
  // Answers are saved one after another, and finishing waits for them, so the
  // last answer never lands after the session has ended.
  const saving = useRef<Promise<void>>(Promise.resolve());
  const input = useRef<HTMLInputElement>(null);
  const next = useRef<HTMLButtonElement>(null);

  const scoped = useMemo(() => selectItems(scope, props.items, props.revisitIds), [scope, props.items, props.revisitIds]);
  const available = useMemo(
    () => buildQuiz({ items: scoped, skills: scope.skills, length: "all", accent: props.accent, seed: 1, materialItems: props.items }).length,
    [scoped, scope.skills, props.accent, props.items],
  );

  function toggle<K extends "letters" | "topics" | "skills">(key: K, id: string) {
    setScope((s) => {
      const list = s[key] as string[];
      return { ...s, [key]: list.includes(id) ? list.filter((x) => x !== id) : [...list, id] };
    });
  }

  function start(list: Question[]) {
    session.current = null;
    saving.current = Promise.resolve();
    setQuestions(list);
    setIndex(0);
    setAnswers([]);
    setCurrent(null);
    setValue("");
    setFinished(false);
    setSaveError(false);
    requestAnimationFrame(() => input.current?.focus());
  }

  function begin(e: FormEvent) {
    e.preventDefault();
    start(buildQuiz({ items: scoped, skills: scope.skills, length, accent: props.accent, seed: Date.now() % 2147483647, materialItems: props.items }));
  }

  function sessionId(): Promise<string> {
    session.current ??= post({ action: "start", mode: "quiz" })
      .then(async (res) => {
        if (!res.ok) throw new Error("start");
        return (await res.json()).sessionId as string;
      })
      .catch((e) => {
        session.current = null;
        throw e;
      });
    return session.current;
  }

  async function record(q: Question, right: boolean) {
    const body = (id: string) =>
      q.itemId ? { action: "result", sessionId: id, itemId: q.itemId, outcome: right ? "right" : "missed" } : { action: "answered", sessionId: id };
    try {
      let res = await post(body(await sessionId()));
      if (res.status === 409) {
        // Idle for ten minutes, so that session is over. Carry on in a fresh one.
        session.current = null;
        res = await post(body(await sessionId()));
      }
      if (!res.ok) throw new Error("record");
    } catch {
      setSaveError(true);
    }
  }

  function answer(given: string) {
    if (!questions || current) return;
    const q = questions[index];
    const checked = checkAnswer(q, given);
    // A pick has nothing typed to compare letter by letter.
    const marks = q.type === "pick" ? [...q.answer].map((ch) => ({ ch, wrong: false })) : checked.marks;
    const a = { q, given, right: checked.right, marks };
    setCurrent(a);
    setAnswers((list) => [...list, a]);
    saving.current = saving.current.then(() => record(q, checked.right));
    requestAnimationFrame(() => next.current?.focus());
  }

  async function finish() {
    setFinished(true);
    await saving.current;
    if (session.current) {
      try {
        await post({ action: "finish", sessionId: await session.current });
      } catch {
        // The server closes a session left open after ten minutes.
      }
    }
  }

  function advance() {
    if (!questions) return;
    setCurrent(null);
    setValue("");
    if (index + 1 >= questions.length) {
      void finish();
      return;
    }
    setIndex(index + 1);
    requestAnimationFrame(() => input.current?.focus());
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (current) advance();
    else if (value.trim()) answer(value);
  }

  // ---------------------------------------------------------------- setup

  if (!questions) {
    const nothing = !scope.letters.length && !scope.topics.length && !scope.revisit && !scope.skills.length;
    const count = length === "all" ? available : Math.min(length, available);
    return (
      <form className="sheet quiz-setup" onSubmit={begin} aria-labelledby="setup-h">
        <h2 id="setup-h" className="mono">
          Quiz me on
        </h2>
        {props.letters.length > 0 && (
          <fieldset>
            <legend className="field-label">Letters</legend>
            {props.letters.map((l) => (
              <label key={l.key} className="check">
                <input type="checkbox" checked={scope.letters.includes(l.key)} onChange={() => toggle("letters", l.key)} />
                <span>
                  {l.label} <span className="count">{l.contents}</span>
                </span>
              </label>
            ))}
          </fieldset>
        )}
        {props.topics.length > 0 && (
          <details className="mini quiz-topics" open={scope.topics.length > 0}>
            <summary>Topics</summary>
            <fieldset>
              <legend className="sr-only">Topics</legend>
              {props.topics.map((t) => (
                <label key={t.id} className="check">
                  <input type="checkbox" checked={scope.topics.includes(t.id)} onChange={() => toggle("topics", t.id)} />
                  <span>
                    {t.name} <span className="count">{t.contents}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          </details>
        )}
        <fieldset>
          <legend className="field-label">Practice</legend>
          <label className="check">
            <input
              type="checkbox"
              checked={scope.revisit}
              disabled={props.revisitIds.length === 0}
              onChange={() => setScope((s) => ({ ...s, revisit: !s.revisit }))}
            />
            <span>
              To revisit <span className="count">{props.revisitIds.length ? `${props.revisitIds.length} to look at again` : "nothing yet"}</span>
            </span>
          </label>
          {SKILLS.map((s) => (
            <label key={s.id} className="check">
              <input type="checkbox" checked={scope.skills.includes(s.id)} onChange={() => toggle("skills", s.id as Skill)} />
              <span>{s.label}</span>
            </label>
          ))}
        </fieldset>
        <fieldset className="lengths">
          <legend className="field-label">How long</legend>
          {([10, 20, "all"] as Length[]).map((n) => (
            <label key={String(n)} className="check">
              <input type="radio" name="length" checked={length === n} onChange={() => setLength(n)} />
              <span>{n === "all" ? "All" : n}</span>
            </label>
          ))}
        </fieldset>
        <button type="submit" className="btn primary wide" disabled={nothing || available === 0}>
          {nothing ? "Choose what to cover" : available === 0 ? "Nothing to ask here yet" : `Start · ${count} ${count === 1 ? "question" : "questions"}`}
        </button>
      </form>
    );
  }

  // ---------------------------------------------------------------- the end

  if (finished) {
    const right = answers.filter((a) => a.right).length;
    const misses = answers.filter((a) => !a.right);
    const line =
      answers.length === 0
        ? "No questions this time. That's fine."
        : misses.length === 0
          ? "Every one. Lovely work."
          : right / answers.length >= 0.7
            ? "Nicely done. Here is what to look at again."
            : "Good practice. Here is what to look at again.";
    return (
      <VoiceProvider accent={props.accent} voice={props.voice}>
        <section className="sheet letter flat quiz-end" aria-labelledby="score-h">
          <p className="mono">Quiz</p>
          <h2 id="score-h" className="score">
            {right} of {answers.length}
          </h2>
          <p>{line}</p>
          {misses.length > 0 && (
            <ul className="words misses">
              {misses.map((a) => (
                <li key={a.q.key}>
                  <span className="q" lang={a.q.promptLang}>
                    {a.q.prompt}
                  </span>
                  <span className="fix">
                    <del className="hand">{a.given}</del>{" "}
                    {a.q.answerLang === "es" ? <Say text={a.q.answer} className="redpen" /> : <span className="redpen">{a.q.answer}</span>}
                  </span>
                  {a.q.why && <span className="why">{a.q.why}</span>}
                </li>
              ))}
            </ul>
          )}
        </section>
        {saveError && (
          <p role="alert" className="flash flash-error">
            Some answers didn&apos;t save, so they may not show under To revisit.
          </p>
        )}
        <div className="pair-buttons">
          <Link href="/" className="btn">
            Done
          </Link>
          {misses.length > 0 ? (
            <button type="button" className="primary" onClick={() => start(misses.map((a) => a.q))}>
              Quiz me on my misses
            </button>
          ) : (
            <button type="button" className="primary" onClick={() => setQuestions(null)}>
              Another quiz
            </button>
          )}
        </div>
      </VoiceProvider>
    );
  }

  // ---------------------------------------------------------------- a question

  const q = questions[index];
  const ask = ASK[`${q.type}:${q.answerLang}`] ?? "Answer";
  return (
    <VoiceProvider accent={props.accent} voice={props.voice}>
      <form className="quiz" onSubmit={submit} aria-label="Quiz">
        <div className="card quiz-card">
          <span className="mono from-line">
            {index + 1} of {questions.length} · {ask}
          </span>
          <span className={`big${q.prompt.length > 28 ? " long" : ""}`} lang={q.promptLang} id="quiz-prompt">
            {q.prompt}
          </span>
          {q.hint && <span className="ex2">{q.hint}</span>}

          {q.type === "pick" ? (
            <span className="choices" role="group" aria-labelledby="quiz-prompt">
              {q.choices!.map((c) => {
                const chosen = current?.given === c;
                const state = current ? (c === q.answer ? "right" : chosen ? "wrong" : "") : "";
                return (
                  <button
                    key={c}
                    type="button"
                    className={`choice${state ? ` ${state}` : ""}`}
                    lang={q.answerLang}
                    disabled={!!current}
                    aria-pressed={chosen}
                    onClick={() => answer(c)}
                  >
                    {state === "wrong" ? <del>{c}</del> : c}
                  </button>
                );
              })}
            </span>
          ) : (
            <span className="answer-line">
              <label className="sr-only" htmlFor="quiz-answer">
                Your answer
              </label>
              <input
                id="quiz-answer"
                ref={input}
                className="hand-input"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                readOnly={!!current}
                lang={q.answerLang}
                autoCapitalize="off"
                autoCorrect="off"
                autoComplete="off"
                spellCheck={false}
                enterKeyHint={current ? "next" : "done"}
                aria-describedby="quiz-prompt"
              />
            </span>
          )}

          {current && (
            <span className="feedback" role="status">
              {current.right ? (
                <span className="tick">Right.</span>
              ) : (
                <>
                  <span className="fix">
                    {q.type !== "pick" && <del className="hand">{current.given}</del>}{" "}
                    <span className="redpen" lang={q.answerLang}>
                      {current.marks.map((m, i) =>
                        m.wrong ? (
                          <u key={i} className="miss">
                            {m.ch}
                          </u>
                        ) : (
                          <span key={i}>{m.ch}</span>
                        ),
                      )}
                    </span>
                  </span>
                  {q.why && <span className="why">↳ {q.why}</span>}
                </>
              )}
              {q.answerLang === "es" && (
                <Say text={q.answer} className="hear">
                  Hear it
                </Say>
              )}
            </span>
          )}
        </div>

        {q.type !== "pick" && q.answerLang === "es" && !current && <AccentBar inputRef={input} value={value} onChange={setValue} />}

        <div className="dock">
          {current ? (
            <button ref={next} type="submit" className="btn primary wide">
              {index + 1 >= questions.length ? "See my score" : "Next"}
            </button>
          ) : q.type !== "pick" ? (
            <button type="submit" className="btn inked wide" disabled={!value.trim()}>
              Check
            </button>
          ) : null}
          <button type="button" className="link link-mono leave" onClick={() => (answers.length > 0 ? void finish() : setQuestions(null))}>
            {answers.length > 0 ? "Finish" : "Leave"}
          </button>
        </div>
      </form>
    </VoiceProvider>
  );
}
