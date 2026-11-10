"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

// Tap to hear, as the planner did it: the browser's own speech, a Spanish
// voice ranked for quality and for the student's accent, a little slower than
// conversation.

const GOOD_VOICE = /(paulina|m[oó]nica|jorge|juan|marisol|google espa[nñ]ol)/i;

function rankVoice(v: SpeechSynthesisVoice, accent: string): number {
  let s = 0;
  if (/premium/i.test(v.name)) s += 100;
  if (/enhanced|mejorad/i.test(v.name)) s += 90;
  if (/natural|neural/i.test(v.name)) s += 80;
  if (GOOD_VOICE.test(v.name)) s += 60;
  if (/compact/i.test(v.name)) s -= 40;
  const lang = v.lang.replace("_", "-");
  if (lang.toLowerCase() === accent.toLowerCase()) s += 25;
  else if (accent === "es-MX" && /es-(US|419)/i.test(lang)) s += 15;
  return s;
}

type Voice = { accent: string; voice: string | null };
const VoiceContext = createContext<Voice>({ accent: "es-MX", voice: null });

/** Wraps a page so every Say on it uses the student's accent and chosen voice. */
export function VoiceProvider({ accent, voice, children }: Voice & { children: ReactNode }) {
  return <VoiceContext.Provider value={{ accent, voice }}>{children}</VoiceContext.Provider>;
}

function useVoices(): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const load = () => setVoices(window.speechSynthesis.getVoices().filter((v) => /^es/i.test(v.lang)));
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", load);
  }, []);
  return voices;
}

export function useSpeak(): (text: string) => void {
  const { accent, voice } = useContext(VoiceContext);
  const voices = useVoices();
  return (text: string) => {
    if (!text || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    const chosen =
      (voice && voices.find((v) => v.name === voice)) || [...voices].sort((a, b) => rankVoice(b, accent) - rankVoice(a, accent))[0] || null;
    if (chosen) utter.voice = chosen;
    utter.lang = chosen ? chosen.lang : accent;
    utter.rate = 0.85;
    window.speechSynthesis.speak(utter);
  };
}

/**
 * A Spanish word or phrase that says itself when tapped. `say` is what is
 * spoken when it differs from what is shown; children replace the shown text.
 */
export function Say({ text, say, className, children }: { text: string; say?: string; className?: string; children?: ReactNode }) {
  const speak = useSpeak();
  return (
    <button type="button" className={`say${className ? ` ${className}` : ""}`} lang="es" onClick={() => speak(say ?? text)} title="Tap to hear it">
      {children ?? text}
    </button>
  );
}
