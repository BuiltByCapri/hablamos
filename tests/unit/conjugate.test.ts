import { describe, expect, it } from "vitest";
import { conjugatePresent, isInfinitive } from "../../lib/spanish/conjugate";

describe("conjugatePresent", () => {
  it("conjugates regular -ar, -er and -ir verbs", () => {
    expect(conjugatePresent("hablar")).toEqual({
      verb: "hablar",
      forms: ["hablo", "hablas", "habla", "hablamos", "habláis", "hablan"],
      irregular: false,
      reflexive: false,
    });
    expect(conjugatePresent("comer")?.forms).toEqual(["como", "comes", "come", "comemos", "coméis", "comen"]);
    expect(conjugatePresent("vivir")?.forms).toEqual(["vivo", "vives", "vive", "vivimos", "vivís", "viven"]);
  });

  it("uses the irregular table for ser, estar, ir and tener", () => {
    expect(conjugatePresent("ser")).toMatchObject({ forms: ["soy", "eres", "es", "somos", "sois", "son"], irregular: true });
    expect(conjugatePresent("estar")?.forms).toEqual(["estoy", "estás", "está", "estamos", "estáis", "están"]);
    expect(conjugatePresent("ir")?.forms).toEqual(["voy", "vas", "va", "vamos", "vais", "van"]);
    expect(conjugatePresent("tener")).toMatchObject({
      forms: ["tengo", "tienes", "tiene", "tenemos", "tenéis", "tienen"],
      irregular: true,
    });
  });

  it("puts the reflexive pronoun before each form", () => {
    expect(conjugatePresent("levantarse")).toEqual({
      verb: "levantarse",
      forms: ["me levanto", "te levantas", "se levanta", "nos levantamos", "os levantáis", "se levantan"],
      irregular: false,
      reflexive: true,
    });
    expect(conjugatePresent("irse")).toMatchObject({ forms: ["me voy", "te vas", "se va", "nos vamos", "os vais", "se van"], irregular: true });
  });

  it("fixes the common unaccented spellings, trims and lowercases", () => {
    expect(conjugatePresent("oir")?.forms[0]).toBe("oigo");
    expect(conjugatePresent("  Sonreir ")?.forms[3]).toBe("sonreímos");
    expect(conjugatePresent("HABLAR")?.verb).toBe("hablar");
  });

  it("returns null for anything that is not an infinitive", () => {
    expect(conjugatePresent("hablo")).toBeNull();
    expect(conjugatePresent("casa")).toBeNull();
    expect(conjugatePresent("por favor")).toBeNull();
    expect(conjugatePresent("")).toBeNull();
    expect(conjugatePresent("ar")).toBeNull();
    expect(conjugatePresent("hablar2")).toBeNull();
  });
});

describe("isInfinitive", () => {
  it("takes an infinitive whose meaning starts with 'to', or any verb in the irregular table", () => {
    expect(isInfinitive("necesitar", "to need")).toBe(true);
    expect(isInfinitive("ser", "")).toBe(true);
    expect(isInfinitive("llamarse", "to be called")).toBe(true);
  });
  it("does not take nouns that only look like infinitives", () => {
    expect(isInfinitive("mujer", "woman")).toBe(false);
    expect(isInfinitive("lugar", "place")).toBe(false);
    expect(isInfinitive("hablo", "I speak")).toBe(false);
  });
});
