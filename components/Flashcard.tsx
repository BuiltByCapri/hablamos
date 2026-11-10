"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { blankOut } from "../lib/letters";

/** `from` is the line above the word: which lesson it came from. */
export type Card = { id: string; text: string; meaning: string; example: string | null; from?: string };

async function post(body: Record<string, unknown>): Promise<Response> {
  return fetch("/api/sessions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/**
 * One card at a time on ruled paper: the word, its example with the word
 * blanked, and a tap to reveal the meaning in handwriting. Then "Not yet"
 * (missed) or "I knew it" (right). The session starts
 * with the first answer, so opening and leaving creates nothing.
 */
export function Flashcard({ cards }: { cards: Card[] }) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [right, setRight] = useState(0);
  const [missed, setMissed] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const session = useRef<Promise<string> | null>(null);

  const card = cards[index];
  const answered = right + missed;

  function sessionId(): Promise<string> {
    session.current ??= post({ action: "start", mode: "flashcards" })
      .then(async (res) => {
        if (!res.ok) throw new Error("start");
        return (await res.json()).sessionId as string;
      })
      .catch((e) => {
        // Only a failed start clears it, so a failed result never splits one run into several sessions.
        session.current = null;
        throw e;
      });
    return session.current;
  }

  async function finish() {
    if (session.current) {
      try {
        await post({ action: "finish", sessionId: await session.current });
      } catch {
        // The server closes a session left open after ten minutes.
      }
    }
    setFinished(true);
  }

  async function answer(outcome: "right" | "missed") {
    setBusy(true);
    setError(null);
    try {
      let res = await post({ action: "result", sessionId: await sessionId(), itemId: card.id, outcome });
      if (res.status === 409) {
        // The session went idle for ten minutes and is over. Carry on in a fresh one.
        session.current = null;
        res = await post({ action: "result", sessionId: await sessionId(), itemId: card.id, outcome });
      }
      if (!res.ok) throw new Error("result");
      if (outcome === "right") setRight((n) => n + 1);
      else setMissed((n) => n + 1);
      setFlipped(false);
      if (index + 1 >= cards.length) await finish();
      else setIndex(index + 1);
    } catch {
      setError("That didn't save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (finished) {
    return (
      <>
        <section className="sheet letter" aria-labelledby="done-heading">
          <h2 id="done-heading" className="title">
            Nice work
          </h2>
          <p>
            {answered === 0
              ? "No cards this time. That's fine."
              : `${right} right, ${missed} to look at again. Every card you saw helps.`}
          </p>
        </section>
        <div className="pair-buttons">
          <Link href="/" className="btn">
            Letters
          </Link>
          <Link href="/flashcards" className="btn primary">
            Another round
          </Link>
        </div>
      </>
    );
  }

  const cloze = card.example ? (blankOut(card.example, card.text) ?? card.example) : null;
  return (
    <section aria-label="Flashcard">
      <button
        type="button"
        className="flip"
        onClick={() => setFlipped((f) => !f)}
        aria-label={flipped ? `${card.text}: ${card.meaning}. Turn the card back over` : `${card.text}. Turn the card over to see the meaning`}
        data-flipped={flipped ? "true" : undefined}
      >
        <span className="flip-inner">
          <span className="sheet ruled card front" aria-hidden={flipped}>
            <span className="mono from-line">
              {card.from ? `${card.from} · ` : ""}
              {index + 1} of {cards.length}
            </span>
            <span className="big" lang="es">
              {card.text}
            </span>
            {cloze && (
              <span className="ex2" lang="es">
                {cloze}
              </span>
            )}
            <span className="hint">Tap to turn over</span>
          </span>
          <span className="sheet card back" aria-hidden={!flipped}>
            <span className="mono from-line">{card.text}</span>
            <span className="answer">{card.meaning}</span>
            <span className="hint">Tap to turn back</span>
          </span>
        </span>
      </button>
      {error && (
        <p role="alert" className="flash flash-error">
          {error}
        </p>
      )}
      <div className="dock">
        {flipped && (
          <div className="pair-buttons">
            <button type="button" disabled={busy} onClick={() => answer("missed")}>
              Not yet
            </button>
            <button type="button" className="inked" disabled={busy} onClick={() => answer("right")}>
              I knew it
            </button>
          </div>
        )}
        <button type="button" className="link link-mono leave" disabled={busy} onClick={finish}>
          {answered > 0 ? "Finish" : "Leave"}
        </button>
      </div>
    </section>
  );
}
