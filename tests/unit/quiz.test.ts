import { describe, expect, it } from "vitest";
import {
  agreeingForm,
  buildQuiz,
  checkAnswer,
  diffMarks,
  PRESENT_VERBS,
  selectItems,
  SKILLS,
  type Question,
  type QuizItem,
} from "../../lib/quiz";
import { COUNTRIES } from "../../lib/spanish/countries";
import { conjugatePresent } from "../../lib/spanish/conjugate";

const it_ = (id: string, text: string, meaning: string, extra: Partial<QuizItem> = {}): QuizItem => ({
  id,
  kind: text.includes(" ") ? "phrase" : "word",
  text,
  meaning,
  example: null,
  lesson_id: "L1",
  topic_id: "T1",
  ...extra,
});

const words: QuizItem[] = [
  it_("1", "la mesa", "table", { example: "El libro está en la mesa." }),
  it_("2", "la silla", "chair"),
  it_("3", "la cama", "bed"),
  it_("4", "la cocina", "kitchen"),
  it_("5", "mañana", "tomorrow", { example: "Nos vemos mañana." }),
  it_("6", "necesitar", "to need"),
  it_("7", "ser y estar", "to be", { kind: "grammar" }),
];

const base = { items: words, skills: [] as ("countries" | "present")[], length: "all" as const, accent: "es-MX", seed: 7 };

const byType = (qs: Question[], type: Question["type"]) => qs.filter((q) => q.type === type);

describe("selectItems", () => {
  const items = [
    it_("a", "uno", "one", { lesson_id: "L1", topic_id: "T1" }),
    it_("b", "dos", "two", { lesson_id: "L2", topic_id: "T2" }),
    it_("c", "tres", "three", { lesson_id: null, topic_id: "T3" }),
    it_("d", "cuatro", "four", { lesson_id: "L3", topic_id: "T3" }),
  ];
  it("takes the union of letters, topics and to revisit", () => {
    const got = selectItems({ letters: ["L1"], topics: ["T3"], revisit: true, skills: [] }, items, ["b"]);
    expect(got.map((i) => i.id).sort()).toEqual(["a", "b", "c", "d"]);
  });
  it("treats the hand letter as items with no lesson", () => {
    expect(selectItems({ letters: ["hand"], topics: [], revisit: false, skills: [] }, items, []).map((i) => i.id)).toEqual(["c"]);
  });
  it("skills alone select no items", () => {
    expect(selectItems({ letters: [], topics: [], revisit: false, skills: ["countries"] }, items, ["a"])).toEqual([]);
  });
});

describe("buildQuiz", () => {
  it("is deterministic for a seed and changes with it", () => {
    const a = buildQuiz({ ...base, skills: ["countries", "present"] });
    const b = buildQuiz({ ...base, skills: ["countries", "present"] });
    const c = buildQuiz({ ...base, skills: ["countries", "present"], seed: 8 });
    expect(a).toEqual(b);
    expect(a.map((q) => q.key)).not.toEqual(c.map((q) => q.key));
  });

  it("asks one question per word or phrase, never about a grammar point, and conjugates verbs it finds", () => {
    const qs = buildQuiz(base);
    const itemQs = qs.filter((q) => q.itemId);
    expect(itemQs.map((q) => q.itemId).sort()).toEqual(["1", "2", "3", "4", "5", "6"]);
    expect(byType(qs, "conjugate").map((q) => q.verb)).toEqual(["necesitar"]);
    expect(byType(qs, "conjugate")[0].itemId).toBeNull();
  });

  it("limits the length and keeps a mix of sources", () => {
    const qs = buildQuiz({ ...base, skills: ["countries", "present"], length: 10 });
    expect(qs).toHaveLength(10);
    expect(new Set(qs.map((q) => q.key)).size).toBe(10);
    expect(qs.some((q) => q.itemId)).toBe(true);
    expect(qs.some((q) => q.type === "conjugate")).toBe(true);
    expect(qs.some((q) => q.type === "nationality")).toBe(true);
  });

  it("makes every item type across seeds: type both ways, pick, gap", () => {
    const seen = new Set<string>();
    for (let seed = 1; seed < 40; seed++) {
      for (const q of buildQuiz({ ...base, seed })) if (q.itemId) seen.add(`${q.type}:${q.answerLang}`);
    }
    expect(seen).toEqual(new Set(["type:es", "type:en", "pick:es", "pick:en", "gap:es"]));
  });

  it("type questions show one side and expect the other", () => {
    for (let seed = 1; seed < 20; seed++) {
      for (const q of byType(buildQuiz({ ...base, seed }), "type")) {
        const item = words.find((w) => w.id === q.itemId)!;
        if (q.answerLang === "es") expect([q.prompt, q.answer]).toEqual([item.meaning, item.text]);
        else expect([q.prompt, q.answer]).toEqual([item.text, item.meaning]);
      }
    }
  });

  it("pick offers four distinct choices of the same kind, one of them right", () => {
    for (let seed = 1; seed < 30; seed++) {
      for (const q of byType(buildQuiz({ ...base, seed }), "pick")) {
        expect(q.choices).toHaveLength(4);
        expect(new Set(q.choices).size).toBe(4);
        expect(q.choices).toContain(q.answer);
        const kind = words.find((w) => w.id === q.itemId)!.kind;
        const pool = words.filter((w) => w.kind === kind).map((w) => (q.answerLang === "es" ? w.text : w.meaning));
        for (const c of q.choices!) expect(pool).toContain(c);
      }
    }
  });

  it("does not offer pick when there are not three distractors of the same kind", () => {
    const few = [it_("1", "hola", "hello"), it_("2", "gracias", "thank you"), it_("3", "por favor", "please")];
    for (let seed = 1; seed < 20; seed++) expect(byType(buildQuiz({ ...base, items: few, seed }), "pick")).toEqual([]);
  });

  it("gap blanks the word in its own example and expects the word as written there", () => {
    const gaps: Question[] = [];
    for (let seed = 1; seed < 30; seed++) gaps.push(...byType(buildQuiz({ ...base, seed }), "gap"));
    expect(gaps.length).toBeGreaterThan(0);
    for (const q of gaps) {
      if (q.itemId === "1") expect([q.prompt, q.answer]).toEqual(["El libro está en la ___.", "mesa"]);
      if (q.itemId === "5") expect([q.prompt, q.answer]).toEqual(["Nos vemos ___.", "mañana"]);
      expect(["1", "5"]).toContain(q.itemId);
    }
  });

  it("present tense covers the core verbs and the verbs in her material, checked with the conjugator", () => {
    const material = [...words, it_("9", "bailar", "to dance", { lesson_id: "L9" })];
    const qs = buildQuiz({ ...base, items: [], skills: ["present"], materialItems: material });
    const verbs = new Set(byType(qs, "conjugate").map((q) => q.verb));
    for (const v of PRESENT_VERBS) expect(verbs).toContain(v);
    expect(verbs).toContain("necesitar");
    expect(verbs).toContain("bailar");
    for (const q of byType(qs, "conjugate")) {
      expect(q.answer).toBe(conjugatePresent(q.verb!)!.forms[q.person!]);
      expect(q.why).toBeTruthy();
    }
  });

  it("never conjugates a verb whose forms are not known to be right", () => {
    const material = [it_("p", "probar", "to try"), it_("l", "llover", "to rain"), it_("b", "bailar", "to dance")];
    for (let seed = 1; seed < 20; seed++) {
      for (const skills of [[], ["present"]] as ("present" | "countries")[][]) {
        const verbs = byType(buildQuiz({ ...base, items: material, materialItems: material, skills, seed }), "conjugate").map((q) => q.verb);
        expect(verbs).not.toContain("probar");
        expect(verbs).not.toContain("llover");
        if (skills.length) expect(verbs).toContain("bailar");
      }
    }
  });

  it("names the skills so they are not confused with her topics", () => {
    expect(SKILLS.map((s) => s.label)).toEqual(["Nationalities: he, she, they", "Present tense verbs"]);
  });

  it("skips vosotros for Mexican Spanish and includes it for Spain", () => {
    const mx = buildQuiz({ ...base, items: [], skills: ["present"] });
    expect(byType(mx, "conjugate").some((q) => q.person === 4)).toBe(false);
    expect(mx.some((q) => q.prompt.startsWith("vosotros"))).toBe(false);
    const es = buildQuiz({ ...base, items: [], skills: ["present"], accent: "es-ES" });
    expect(byType(es, "conjugate").some((q) => q.person === 4 && q.prompt.startsWith("vosotros + "))).toBe(true);
  });

  it("countries ask for the agreeing nationality, or the country back", () => {
    const qs = byType(buildQuiz({ ...base, items: [], skills: ["countries"] }), "nationality");
    expect(qs).toHaveLength(COUNTRIES.length);
    for (const q of qs) {
      const c = COUNTRIES.find((x) => q.prompt.includes(`de ${x.country}.`) || q.answer === x.country)!;
      expect(c).toBeTruthy();
      expect(q.prompt).toContain("___");
      expect(q.why).toBeTruthy();
    }
    expect(qs.some((q) => q.prompt.startsWith("Él es ") || q.prompt.startsWith("Ella es "))).toBe(true);
  });
});

describe("agreeingForm", () => {
  const mx = COUNTRIES.find((c) => c.country === "México")!;
  const es = COUNTRIES.find((c) => c.country === "España")!;
  const ca = COUNTRIES.find((c) => c.country === "Canadá")!;
  const jp = COUNTRIES.find((c) => c.country === "Japón")!;
  it("agrees with who is described", () => {
    expect(agreeingForm(mx, "f")).toBe("mexicana");
    expect(agreeingForm(mx, "m")).toBe("mexicano");
    expect(agreeingForm(mx, "fp")).toBe("mexicanas");
    expect(agreeingForm(mx, "mixed")).toBe("mexicanos");
    expect(agreeingForm(es, "mp")).toBe("españoles");
    expect(agreeingForm(jp, "fp")).toBe("japonesas");
    expect(agreeingForm(jp, "mp")).toBe("japoneses");
    expect(agreeingForm(ca, "f")).toBe("canadiense");
  });
});

describe("checkAnswer", () => {
  const q = (answer: string, answerLang: "es" | "en" = "es", type: Question["type"] = "type"): Question => ({
    key: "k",
    type,
    itemId: "1",
    prompt: "",
    promptLang: answerLang === "es" ? "en" : "es",
    answer,
    answerLang,
  });

  it("trims, collapses spaces and ignores case", () => {
    expect(checkAnswer(q("por favor"), "  Por   FAVOR ").right).toBe(true);
  });
  it("counts accents", () => {
    expect(checkAnswer(q("mañana"), "manana").right).toBe(false);
    expect(checkAnswer(q("japonés"), "japones").right).toBe(false);
    expect(checkAnswer(q("japonés"), "Japonés").right).toBe(true);
  });
  it("ignores a leading article only when the answer has none", () => {
    expect(checkAnswer(q("mesa"), "la mesa").right).toBe(true);
    expect(checkAnswer(q("la clase"), "clase").right).toBe(false);
    expect(checkAnswer(q("la clase"), "la clase").right).toBe(true);
    expect(checkAnswer(q("Estados Unidos"), "los Estados Unidos").right).toBe(true);
  });
  it("only the agreeing nationality is right", () => {
    const nat = { ...q("mexicana"), type: "nationality" as const, itemId: null };
    expect(checkAnswer(nat, "mexicana").right).toBe(true);
    expect(checkAnswer(nat, "mexicano").right).toBe(false);
  });
  it("accepts any listed English meaning, with or without 'to'", () => {
    expect(checkAnswer(q("to do / to make", "en"), "make").right).toBe(true);
    expect(checkAnswer(q("to do / to make", "en"), "to do").right).toBe(true);
    expect(checkAnswer(q("teacher / professor (m.)", "en"), "professor").right).toBe(true);
    expect(checkAnswer(q("1,000", "en"), "1000").right).toBe(true);
    expect(checkAnswer(q("Mexico · mexicano / mexicana", "en"), "mexico").right).toBe(true);
    expect(checkAnswer(q("tired", "en"), "sad").right).toBe(false);
  });
  it("ignores Spanish question and exclamation marks and a final period", () => {
    expect(checkAnswer(q("¿De dónde eres?"), "de dónde eres").right).toBe(true);
  });
  it("takes a conjugation with or without its subject pronoun, but not without its reflexive one", () => {
    const c = { ...q("vivimos"), type: "conjugate" as const, itemId: null };
    expect(checkAnswer(c, "nosotros vivimos").right).toBe(true);
    expect(checkAnswer(c, "vivímos").right).toBe(false);
    const r = { ...q("nos levantamos"), type: "conjugate" as const, itemId: null };
    expect(checkAnswer(r, "levantamos").right).toBe(false);
  });
  it("marks the differing letters of the expected answer when wrong", () => {
    const res = checkAnswer(q("mañana"), "manana");
    expect(res.marks.map((m) => (m.wrong ? `[${m.ch}]` : m.ch)).join("")).toBe("ma[ñ]ana");
    expect(checkAnswer(q("mañana"), "mañana").marks.every((m) => !m.wrong)).toBe(true);
  });
  it("an empty answer is a miss", () => {
    expect(checkAnswer(q("hola"), "   ").right).toBe(false);
  });
});

describe("diffMarks", () => {
  it("marks letters missing from what was given", () => {
    const show = (e: string, g: string) =>
      diffMarks(e, g)
        .map((m) => (m.wrong ? `[${m.ch}]` : m.ch))
        .join("");
    expect(show("mexicana", "mexicano")).toBe("mexican[a]");
    expect(show("vivimos", "vivemos")).toBe("viv[i]mos");
    expect(show("Hola", "hola")).toBe("Hola");
  });
});
