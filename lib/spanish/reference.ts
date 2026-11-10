// Reference tables carried over from Capri's planner: the alphabet, the
// regular endings, ser and estar, and how numbers are built. Subject pronouns
// live in planner-sets.ts, which wins where the two overlapped.

/** Letter, English-reader respelling, and the letter's Spanish name (what is said aloud). */
export const SPANISH_ALPHABET: { l: string; p: string; n: string }[] = [
  { l: "A", p: "ah", n: "a" }, { l: "B", p: "beh", n: "be" }, { l: "C", p: "seh", n: "ce" }, { l: "D", p: "deh", n: "de" },
  { l: "E", p: "eh", n: "e" }, { l: "F", p: "eh feh", n: "efe" }, { l: "G", p: "heh", n: "ge" }, { l: "H", p: "ah cheh", n: "hache" },
  { l: "I", p: "ee", n: "i" }, { l: "J", p: "hoh tah", n: "jota" }, { l: "K", p: "kah", n: "ka" }, { l: "L", p: "eh leh", n: "ele" },
  { l: "M", p: "eh meh", n: "eme" }, { l: "N", p: "eh neh", n: "ene" }, { l: "Ñ", p: "eh nyeh", n: "eñe" }, { l: "O", p: "oh", n: "o" },
  { l: "P", p: "peh", n: "pe" }, { l: "Q", p: "koo", n: "cu" }, { l: "R", p: "eh rreh", n: "erre" }, { l: "S", p: "eh seh", n: "ese" },
  { l: "T", p: "teh", n: "te" }, { l: "U", p: "oo", n: "u" }, { l: "V", p: "oo beh", n: "uve" }, { l: "W", p: "oo beh doh bleh", n: "uve doble" },
  { l: "X", p: "eh kees", n: "equis" }, { l: "Y", p: "yeh", n: "ye" }, { l: "Z", p: "seh tah", n: "zeta" },
];

/** Person, then hablar, comer, vivir. */
export const VERB_ENDINGS: string[][] = [
  ["yo", "hablo", "como", "vivo"],
  ["tú", "hablas", "comes", "vives"],
  ["él/ella/usted", "habla", "come", "vive"],
  ["nosotros", "hablamos", "comemos", "vivimos"],
  ["vosotros", "habláis", "coméis", "vivís"],
  ["ellos/ustedes", "hablan", "comen", "viven"],
];

/** Person, then ser, estar. */
export const SER_ESTAR: string[][] = [
  ["yo", "soy", "estoy"],
  ["tú", "eres", "estás"],
  ["él/ella/usted", "es", "está"],
  ["nosotros", "somos", "estamos"],
  ["vosotros", "sois", "estáis"],
  ["ellos/ustedes", "son", "están"],
];

export const SER_ESTAR_NOTE = {
  ser: 'Ser is for what something is: identity, traits, origin ("soy Ana", "soy alta", "soy de México").',
  estar: 'Estar is for how or where something is right now: feelings, location, current state ("estoy cansada", "estoy en casa").',
};

export const NUMBER_PATTERNS: { label: string; note: string; words: string[] }[] = [
  {
    label: "0 to 15: just memorize these",
    note: "No pattern here. These are irregular roots.",
    words: ["cero", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez", "once", "doce", "trece", "catorce", "quince"],
  },
  {
    label: '16 to 19: "dieci-" plus the ones digit',
    note: 'From "diez y" (ten and), fused into one word.',
    words: ["dieciséis", "diecisiete", "dieciocho", "diecinueve"],
  },
  { label: "20: its own word", note: "", words: ["veinte"] },
  {
    label: '21 to 29: "veinti-" plus the ones digit',
    note: 'From "veinte y" (twenty and), fused into one word.',
    words: ["veintiuno", "veintidós", "veintitrés", "veinticuatro", "veinticinco", "veintiséis", "veintisiete", "veintiocho", "veintinueve"],
  },
  { label: "30: its own word", note: 'From Latin "triginta", not built from "tres".', words: ["treinta"] },
  {
    label: '40 to 90: a root plus "-enta"',
    note: 'ochenta is "och-" (from ocho) plus "-enta", not "ocho diez". Same idea: cuatro, cuarenta. cinco, cincuenta. seis, sesenta. siete, setenta. nueve, noventa.',
    words: ["cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"],
  },
  {
    label: '31 and up: two words joined by "y"',
    note: 'The fusion only happens in the teens and twenties. From 31 on, it\'s tens plus "y" plus ones, written separately.',
    words: ["treinta y uno", "cuarenta y dos", "setenta y cinco"],
  },
  { label: "100: its own word", note: "cien on its own, ciento when more follows (ciento uno).", words: ["cien", "ciento uno"] },
];
