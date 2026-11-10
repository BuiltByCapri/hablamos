"use client";

import type { RefObject } from "react";

const LETTERS = ["á", "é", "í", "ó", "ú", "ñ", "ü"];

/**
 * The accented letters under a typing input, for a phone without a Spanish
 * keyboard. Each inserts at the cursor and keeps the keyboard up.
 */
export function AccentBar({
  inputRef,
  value,
  onChange,
  disabled,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  function insert(letter: string) {
    const el = inputRef.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    onChange(value.slice(0, start) + letter + value.slice(end));
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      el.setSelectionRange(start + 1, start + 1);
    });
  }
  return (
    <div className="accents" role="group" aria-label="Accented letters">
      {LETTERS.map((l) => (
        <button
          key={l}
          type="button"
          lang="es"
          disabled={disabled}
          // Keep focus (and the phone keyboard) on the input.
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => insert(l)}
          aria-label={`Type ${l}`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
