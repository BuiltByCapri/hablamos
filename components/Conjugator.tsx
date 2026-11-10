"use client";

import { useRef, useState, type FormEvent } from "react";
import { conjugatePresent, CONJUGATION_PRONOUNS, verbFamily, type Conjugation } from "../lib/spanish/conjugate";
import { AccentBar } from "./AccentBar";
import { Say } from "./Say";

/** Type a verb, see its six present-tense forms. */
export function Conjugator() {
  const [value, setValue] = useState("");
  const [shown, setShown] = useState<{ raw: string; result: Conjugation | null } | null>(null);
  const input = useRef<HTMLInputElement>(null);

  function go(e: FormEvent) {
    e.preventDefault();
    const raw = value.trim();
    if (!raw) return;
    setShown({ raw, result: conjugatePresent(raw) });
  }

  const r = shown?.result;
  return (
    <div className="conjugator">
      <form onSubmit={go} className="row">
        <label className="field grow">
          <span className="label-text">A verb, like hablar, tener or llamarse</span>
          <input
            ref={input}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            lang="es"
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="go"
          />
        </label>
        <button type="submit" className="inked">
          Conjugate
        </button>
      </form>
      <AccentBar inputRef={input} value={value} onChange={setValue} />
      {shown && !r && (
        <p className="note" role="status">
          Couldn&apos;t conjugate &ldquo;{shown.raw}&rdquo;. Use the infinitive, the form that ends in -ar, -er or -ir (or -se for
          reflexive verbs).
        </p>
      )}
      {r && (
        <div role="status">
          <p className="mono ref-sub">
            {r.verb}: {r.irregular ? "irregular in the present" : `regular ${verbFamily(r.verb)} verb`}
            {r.reflexive ? ", reflexive" : ""}
          </p>
          <table className="ref-table">
            <tbody>
              {CONJUGATION_PRONOUNS.map((p, i) => (
                <tr key={p}>
                  <th scope="row">
                    {p}
                    {i === 4 && <span className="optional"> (Spain)</span>}
                  </th>
                  <td>
                    <Say text={r.forms[i]} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!r.irregular && (
            <p className="note">
              Built from the regular pattern. If this verb changes its stem (like pensar, pienso), check it with your tutor.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
