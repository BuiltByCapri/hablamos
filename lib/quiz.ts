// Quizzes. Pure: the page gathers her items, this builds the questions and
// checks the answers. A seeded random number generator makes a quiz
// repeatable, so tests can pin one down.
//
// Item questions (type, pick, gap) stand for one item in her material and
// record a result for it. Skill questions (conjugate, nationality) come from
// the conjugator and the countries table; they are scored but stand for no item.
import { blankOut } from "./letters";
import { COUNTRIES, pluralNationality, type Country } from "./spanish/countries";
import { conjugatePresent, isInfinitive, isKnownConjugation } from "./spanish/conjugate";

export type Skill = "countries" | "present";

/**
 * What a quiz covers. Letters are lesson ids, or "hand" for items added by
 * hand; topics are topic ids. Named so a homework row can store one later.
 */
export type QuizScope = { letters: string[]; topics: string[]; revisit: boolean; skills: Skill[] };

export const SKILLS: { id: Skill; label: string }[] = [
  { id: "countries", label: "Nationalities: he, she, they" },
  { id: "present", label: "Present tense verbs" },
];

export type QuizItem = {
  id: string;
  kind: string;
  text: string;
  meaning: string;
  example: string | null;
  lesson_id?: string | null;
  topic_id?: string;
};

export type QuestionType = "type" | "pick" | "gap" | "conjugate" | "nationality";

export type Question = {
  /** Unique within a quiz. */
  key: string;
  type: QuestionType;
  /** The item this question stands for, or null for a skill question. */
  itemId: string | null;
  prompt: string;
  promptLang: "es" | "en";
  /** The expected answer, as shown when she misses. */
  answer: string;
  answerLang: "es" | "en";
  /** Pick: four choices, one of them the answer. */
  choices?: string[];
  /** Gap: the meaning, as a hint under the sentence. */
  hint?: string;
  /** One short line of why, for conjugation and nationality. */
  why?: string;
  verb?: string;
  /** 0 yo, 1 tú, 2 él/ella/usted, 3 nosotros, 4 vosotros, 5 ellos/ustedes. */
  person?: number;
};

/** The verbs "Present tense verbs" always covers, plus every verb in her material. */
export const PRESENT_VERBS = ["ser", "estar", "tener", "ir", "hacer", "poder", "querer", "hablar", "comer", "vivir"];

export const HAND_LETTER = "hand";

// ---------------------------------------------------------------- random

/** mulberry32: small, fast, and the same sequence for the same seed. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(list: T[], rng: () => number): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const pickOne = <T>(list: readonly T[], rng: () => number): T => list[Math.floor(rng() * list.length)];

// ---------------------------------------------------------------- scope

/** Items in any chosen letter or topic, or to revisit. Skills select no items. */
export function selectItems<I extends QuizItem>(scope: QuizScope, items: I[], revisitIds: string[]): I[] {
  const letters = new Set(scope.letters);
  const topics = new Set(scope.topics);
  const revisit = new Set(scope.revisit ? revisitIds : []);
  return items.filter(
    (i) =>
      (i.lesson_id ? letters.has(i.lesson_id) : letters.has(HAND_LETTER)) ||
      (i.topic_id != null && topics.has(i.topic_id)) ||
      revisit.has(i.id),
  );
}

// ---------------------------------------------------------------- answers

const ES_ARTICLE = /^(el|la|los|las|un|una|unos|unas)\s+/;
const EN_ARTICLE = /^(the|a|an)\s+/;
const SUBJECT = /^(yo|tú|él|ella|usted|nosotros|nosotras|vosotros|vosotras|ellos|ellas|ustedes)\s+/;

/** Lowercase, no ¿¡?!, no final period, single spaces. Accents stay: they count. */
function clean(s: string): string {
  return s
    .normalize("NFC")
    .toLowerCase()
    .replace(/[¿¡?!]/g, "")
    .replace(/[.…]+\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Every way the expected answer may be written: the whole, and each part split on / · ; */
function alternatives(answer: string, lang: "es" | "en"): string[] {
  const parts = [answer, ...answer.split(/[/·;]/)];
  const out = new Set<string>();
  for (const p of parts) {
    let c = clean(p);
    if (lang === "en") c = englishForm(c);
    if (c) out.add(c);
  }
  return [...out];
}

/** English: no parenthetical notes, "to" optional, 1,000 the same as 1000. */
function englishForm(s: string): string {
  return s
    .replace(/\([^)]*\)/g, "")
    .replace(/(\d),(?=\d{3}\b)/g, "$1")
    .replace(/^to\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

export type Mark = { ch: string; wrong: boolean };

/**
 * The expected answer letter by letter, each marked wrong when it is not part
 * of the longest run the two share in order. Case does not count here either.
 */
export function diffMarks(expected: string, given: string): Mark[] {
  const e = [...expected];
  const g = [...given];
  const el = e.map((c) => c.toLowerCase());
  const gl = g.map((c) => c.toLowerCase());
  const n = e.length;
  const m = g.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = el[i] === gl[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const marks: Mark[] = [];
  let i = 0;
  let j = 0;
  while (i < n) {
    if (j < m && el[i] === gl[j] && dp[i][j] === dp[i + 1][j + 1] + 1) {
      marks.push({ ch: e[i], wrong: false });
      i++;
      j++;
    } else if (j < m && dp[i][j + 1] >= dp[i + 1][j]) {
      j++;
    } else {
      marks.push({ ch: e[i], wrong: e[i].trim() !== "" });
      i++;
    }
  }
  return marks;
}

/**
 * Right when what she wrote matches the answer after trimming, collapsing
 * spaces and ignoring case. Accents count. A leading article she added is
 * ignored only when the answer has none. English accepts any listed meaning.
 */
export function checkAnswer(q: Question, given: string): { right: boolean; marks: Mark[] } {
  let g = clean(given);
  if (q.answerLang === "en") g = englishForm(g);
  if (q.type === "conjugate") g = g.replace(SUBJECT, "");
  const article = q.answerLang === "es" ? ES_ARTICLE : EN_ARTICLE;
  const right =
    g !== "" &&
    alternatives(q.answer, q.answerLang).some((alt) => {
      const mine = article.test(alt) ? g : g.replace(article, "");
      return mine === alt;
    });
  if (right) return { right, marks: [...q.answer].map((ch) => ({ ch, wrong: false })) };
  return { right, marks: diffMarks(q.answer, given.trim()) };
}

// ---------------------------------------------------------------- nationality

export type Who = "m" | "f" | "mp" | "fp" | "mixed";

/** The nationality that agrees with who is described. Mixed groups take the masculine plural. */
export function agreeingForm(c: Country, who: Who): string {
  if (who === "m") return c.masculine;
  if (who === "f") return c.feminine;
  return pluralNationality(c, who === "fp");
}

const WOMEN = ["Ana", "Sofía", "Lucía", "María", "Elena", "Carmen"];
const MEN = ["Luis", "Carlos", "Diego", "Mateo", "Pablo", "Javier"];

function twoOf(names: string[], rng: () => number): [string, string] {
  const [a, b] = shuffle(names, rng);
  return [a, b];
}

function nationalityQuestion(c: Country, rng: () => number): Question {
  const form = pickOne(["f", "f", "m", "fp", "mixed", "mp", "reverse", "reverse"] as const, rng);
  const base = { key: `nat:${c.country}`, type: "nationality" as const, itemId: null, promptLang: "es" as const, answerLang: "es" as const };
  if (form === "reverse") {
    const woman = rng() < 0.5;
    const nat = woman ? c.feminine : c.masculine;
    return {
      ...base,
      prompt: `${woman ? "Ella" : "Él"} es ${nat}. Es de ___.`,
      answer: c.country,
      why: `${nat} is someone from ${c.country}.`,
    };
  }
  const answer = agreeingForm(c, form);
  if (form === "f" || form === "m") {
    const name = pickOne(form === "f" ? WOMEN : MEN, rng);
    const same = c.masculine === c.feminine;
    const why = same
      ? `${c.masculine} is the same for a man and a woman.`
      : form === "f"
        ? `${name} is a woman, so ${c.masculine} becomes ${c.feminine}.`
        : `${name} is a man: ${c.masculine}. For a woman it would be ${c.feminine}.`;
    return { ...base, prompt: `${name} es de ${c.country}. ${name} es ___.`, answer, why };
  }
  const [a, b] =
    form === "fp" ? twoOf(WOMEN, rng) : form === "mp" ? twoOf(MEN, rng) : ([pickOne(MEN, rng), pickOne(WOMEN, rng)] as [string, string]);
  const why =
    form === "fp"
      ? `Two women take the feminine plural: ${answer}.`
      : form === "mp"
        ? `Two men take the masculine plural: ${answer}.`
        : `A man and a woman together take the masculine plural: ${answer}.`;
  return { ...base, prompt: `${a} y ${b} son de ${c.country}. Son ___.`, answer, why };
}

// ---------------------------------------------------------------- conjugation

function pronoun(person: number, rng: () => number): string {
  if (person === 2) return pickOne(["él", "ella", "usted"], rng);
  if (person === 5) return pickOne(["ellos", "ellas", "ustedes"], rng);
  return ["yo", "tú", "", "nosotros", "vosotros"][person];
}

function conjugateQuestion(verb: string, person: number, rng: () => number): Question | null {
  const c = conjugatePresent(verb);
  if (!c) return null;
  const who = pronoun(person, rng);
  const answer = c.forms[person];
  let why: string;
  if (c.irregular) {
    why = `${c.verb} is irregular in the present: ${who} ${answer}.`;
  } else {
    const base = c.reflexive ? c.verb.slice(0, -2) : c.verb;
    const ending = base.slice(-2);
    const stem = base.slice(0, -2);
    const tail = (c.reflexive ? answer.split(" ")[1] : answer).slice(stem.length);
    why = `Regular -${ending}: ${stem}- plus -${tail}.`;
  }
  if (c.reflexive) why += ` The pronoun ${answer.split(" ")[0]} comes first.`;
  return {
    key: `conj:${c.verb}:${person}`,
    type: "conjugate",
    itemId: null,
    prompt: `${who} + ${c.verb}`,
    promptLang: "es",
    answer,
    answerLang: "es",
    why,
    verb: c.verb,
    person,
  };
}

/**
 * The infinitives among these items that can be quizzed, as the conjugator
 * spells them. A verb whose forms are not known to be right (a stem changer
 * missing from the irregular table) is left out, so a right answer is never
 * marked wrong.
 */
export function verbsIn(items: QuizItem[]): string[] {
  const out = new Set<string>();
  for (const i of items) {
    if (i.kind === "grammar") continue;
    const text = i.text.trim().replace(/^to\s+/i, "");
    if (isInfinitive(text, i.meaning) && isKnownConjugation(text)) out.add(conjugatePresent(text)!.verb);
  }
  return [...out];
}

// ---------------------------------------------------------------- items

function itemQuestion(item: QuizItem, pool: QuizItem[], rng: () => number): Question {
  const options: (() => Question | null)[] = [];
  const type = (toEs: boolean): Question => ({
    key: `item:${item.id}`,
    type: "type",
    itemId: item.id,
    prompt: toEs ? item.meaning : item.text,
    promptLang: toEs ? "en" : "es",
    answer: toEs ? item.text : item.meaning,
    answerLang: toEs ? "es" : "en",
  });
  options.push(() => type(true), () => type(false));

  for (const toEs of [true, false]) {
    const side = (i: QuizItem) => (toEs ? i.text : i.meaning);
    const answer = side(item);
    const seen = new Set([clean(answer)]);
    const distractors: string[] = [];
    // Same topic first, so "6" is not asked against a country.
    const candidates = shuffle(pool, rng).sort((x, y) => Number(y.topic_id === item.topic_id) - Number(x.topic_id === item.topic_id));
    for (const other of candidates) {
      if (other.id === item.id || other.kind !== item.kind) continue;
      const s = side(other);
      if (seen.has(clean(s))) continue;
      seen.add(clean(s));
      distractors.push(s);
      if (distractors.length === 3) break;
    }
    if (distractors.length === 3) {
      const choices = shuffle([answer, ...distractors], rng);
      options.push(() => ({
        key: `item:${item.id}`,
        type: "pick",
        itemId: item.id,
        prompt: toEs ? item.meaning : item.text,
        promptLang: toEs ? "en" : "es",
        answer,
        answerLang: toEs ? "es" : "en",
        choices,
      }));
    }
  }

  if (item.example) {
    const bare = item.text.trim().replace(ES_ARTICLE, "");
    const withBare = blankOut(item.example, bare);
    const gap = withBare ?? blankOut(item.example, item.text);
    if (gap) {
      options.push(() => ({
        key: `item:${item.id}`,
        type: "gap",
        itemId: item.id,
        prompt: gap,
        promptLang: "es",
        answer: withBare ? bare : item.text.trim(),
        answerLang: "es",
        hint: item.meaning,
      }));
    }
  }
  return pickOne(options, rng)()!;
}

// ---------------------------------------------------------------- the quiz

export type BuildOptions = {
  /** Items in the chosen scope (see selectItems). */
  items: QuizItem[];
  skills: Skill[];
  length: number | "all";
  /** The student's accent: vosotros is asked only for es-ES. */
  accent: string;
  seed: number;
  /** All her items, for the verbs "Present tense verbs" adds. */
  materialItems?: QuizItem[];
};

/** Takes one from each source in turn, so a short quiz still mixes them. */
function interleave<T>(sources: T[][]): T[] {
  const out: T[] = [];
  const max = Math.max(0, ...sources.map((s) => s.length));
  for (let i = 0; i < max; i++) for (const s of sources) if (i < s.length) out.push(s[i]);
  return out;
}

export function buildQuiz(opts: BuildOptions): Question[] {
  const rng = makeRng(opts.seed);
  const persons = opts.accent === "es-ES" ? [0, 1, 2, 3, 4, 5] : [0, 1, 2, 3, 5];
  const studied = opts.items.filter((i) => i.kind === "word" || i.kind === "phrase");

  const itemQs = shuffle(studied, rng).map((i) => itemQuestion(i, studied, rng));

  const scopeVerbs = verbsIn(opts.items);
  let verbQs: Question[];
  if (opts.skills.includes("present")) {
    const verbs = [...new Set([...PRESENT_VERBS, ...verbsIn(opts.materialItems ?? []), ...scopeVerbs])];
    verbQs = verbs.flatMap((v) => persons.map((p) => conjugateQuestion(v, p, rng))).filter((q): q is Question => q !== null);
  } else {
    verbQs = scopeVerbs.map((v) => conjugateQuestion(v, pickOne(persons, rng), rng)).filter((q): q is Question => q !== null);
  }

  const countryQs = opts.skills.includes("countries") ? COUNTRIES.map((c) => nationalityQuestion(c, rng)) : [];

  const all = interleave([itemQs, shuffle(verbQs, rng), shuffle(countryQs, rng)]);
  const chosen = opts.length === "all" ? all : all.slice(0, opts.length);
  return shuffle(chosen, rng);
}
