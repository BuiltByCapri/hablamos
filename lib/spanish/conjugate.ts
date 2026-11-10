// The present-tense conjugator, ported from Capri's planner. Irregular verbs
// come from the table; everything else follows the regular -ar, -er and -ir
// pattern, so a stem-changing verb missing from the table comes out regular.
// Reflexive verbs (levantarse) take me, te, se, nos, os, se before each form.

/** yo, tú, él/ella/usted, nosotros, vosotros, ellos/ustedes. */
export const IRREGULAR_VERBS: Record<string, string[]> = {
  ser: ["soy", "eres", "es", "somos", "sois", "son"],
  estar: ["estoy", "estás", "está", "estamos", "estáis", "están"],
  ir: ["voy", "vas", "va", "vamos", "vais", "van"],
  haber: ["he", "has", "ha", "hemos", "habéis", "han"],
  tener: ["tengo", "tienes", "tiene", "tenemos", "tenéis", "tienen"],
  hacer: ["hago", "haces", "hace", "hacemos", "hacéis", "hacen"],
  poder: ["puedo", "puedes", "puede", "podemos", "podéis", "pueden"],
  querer: ["quiero", "quieres", "quiere", "queremos", "queréis", "quieren"],
  decir: ["digo", "dices", "dice", "decimos", "decís", "dicen"],
  venir: ["vengo", "vienes", "viene", "venimos", "venís", "vienen"],
  dar: ["doy", "das", "da", "damos", "dais", "dan"],
  ver: ["veo", "ves", "ve", "vemos", "veis", "ven"],
  saber: ["sé", "sabes", "sabe", "sabemos", "sabéis", "saben"],
  poner: ["pongo", "pones", "pone", "ponemos", "ponéis", "ponen"],
  salir: ["salgo", "sales", "sale", "salimos", "salís", "salen"],
  traer: ["traigo", "traes", "trae", "traemos", "traéis", "traen"],
  caer: ["caigo", "caes", "cae", "caemos", "caéis", "caen"],
  oír: ["oigo", "oyes", "oye", "oímos", "oís", "oyen"],
  reír: ["río", "ríes", "ríe", "reímos", "reís", "ríen"],
  sonreír: ["sonrío", "sonríes", "sonríe", "sonreímos", "sonreís", "sonríen"],
  oler: ["huelo", "hueles", "huele", "olemos", "oléis", "huelen"],
  jugar: ["juego", "juegas", "juega", "jugamos", "jugáis", "juegan"],
  pensar: ["pienso", "piensas", "piensa", "pensamos", "pensáis", "piensan"],
  cerrar: ["cierro", "cierras", "cierra", "cerramos", "cerráis", "cierran"],
  empezar: ["empiezo", "empiezas", "empieza", "empezamos", "empezáis", "empiezan"],
  comenzar: ["comienzo", "comienzas", "comienza", "comenzamos", "comenzáis", "comienzan"],
  despertar: ["despierto", "despiertas", "despierta", "despertamos", "despertáis", "despiertan"],
  entender: ["entiendo", "entiendes", "entiende", "entendemos", "entendéis", "entienden"],
  perder: ["pierdo", "pierdes", "pierde", "perdemos", "perdéis", "pierden"],
  preferir: ["prefiero", "prefieres", "prefiere", "preferimos", "preferís", "prefieren"],
  sentir: ["siento", "sientes", "siente", "sentimos", "sentís", "sienten"],
  mentir: ["miento", "mientes", "miente", "mentimos", "mentís", "mienten"],
  volver: ["vuelvo", "vuelves", "vuelve", "volvemos", "volvéis", "vuelven"],
  mover: ["muevo", "mueves", "mueve", "movemos", "movéis", "mueven"],
  dormir: ["duermo", "duermes", "duerme", "dormimos", "dormís", "duermen"],
  morir: ["muero", "mueres", "muere", "morimos", "morís", "mueren"],
  encontrar: ["encuentro", "encuentras", "encuentra", "encontramos", "encontráis", "encuentran"],
  contar: ["cuento", "cuentas", "cuenta", "contamos", "contáis", "cuentan"],
  costar: ["cuesto", "cuestas", "cuesta", "costamos", "costáis", "cuestan"],
  recordar: ["recuerdo", "recuerdas", "recuerda", "recordamos", "recordáis", "recuerdan"],
  mostrar: ["muestro", "muestras", "muestra", "mostramos", "mostráis", "muestran"],
  almorzar: ["almuerzo", "almuerzas", "almuerza", "almorzamos", "almorzáis", "almuerzan"],
  pedir: ["pido", "pides", "pide", "pedimos", "pedís", "piden"],
  servir: ["sirvo", "sirves", "sirve", "servimos", "servís", "sirven"],
  repetir: ["repito", "repites", "repite", "repetimos", "repetís", "repiten"],
  vestir: ["visto", "vistes", "viste", "vestimos", "vestís", "visten"],
  seguir: ["sigo", "sigues", "sigue", "seguimos", "seguís", "siguen"],
  elegir: ["elijo", "eliges", "elige", "elegimos", "elegís", "eligen"],
  conocer: ["conozco", "conoces", "conoce", "conocemos", "conocéis", "conocen"],
  parecer: ["parezco", "pareces", "parece", "parecemos", "parecéis", "parecen"],
  conducir: ["conduzco", "conduces", "conduce", "conducimos", "conducís", "conducen"],
  traducir: ["traduzco", "traduces", "traduce", "traducimos", "traducís", "traducen"],
  construir: ["construyo", "construyes", "construye", "construimos", "construís", "construyen"],
  incluir: ["incluyo", "incluyes", "incluye", "incluimos", "incluís", "incluyen"],
  escoger: ["escojo", "escoges", "escoge", "escogemos", "escogéis", "escogen"],
};

/** Common ways people type a verb without its accent. */
export const ACCENT_FIXES: Record<string, string> = { oir: "oír", reir: "reír", sonreir: "sonreír" };

export const CONJUGATION_PRONOUNS = ["yo", "tú", "él / ella / usted", "nosotros", "vosotros", "ellos / ellas / ustedes"] as const;

const REFLEXIVE = ["me", "te", "se", "nos", "os", "se"];

export type Conjugation = { verb: string; forms: string[]; irregular: boolean; reflexive: boolean };

function conjugateRegular(verb: string): string[] | null {
  const ending = verb.slice(-2);
  const stem = verb.slice(0, -2);
  if (!stem) return null;
  if (ending === "ar") return [stem + "o", stem + "as", stem + "a", stem + "amos", stem + "áis", stem + "an"];
  if (ending === "er") return [stem + "o", stem + "es", stem + "e", stem + "emos", stem + "éis", stem + "en"];
  if (ending === "ir") return [stem + "o", stem + "es", stem + "e", stem + "imos", stem + "ís", stem + "en"];
  return null;
}

/**
 * The six present-tense forms of an infinitive, or null when the input is not
 * one. Irregular verbs come from the table; the rest are built regularly.
 */
export function conjugatePresent(input: string): Conjugation | null {
  let verb = input.trim().toLowerCase();
  if (!/^[a-záéíóúüñ]+$/.test(verb)) return null;
  verb = ACCENT_FIXES[verb] ?? verb;
  const table = IRREGULAR_VERBS[verb];
  if (table) return { verb, forms: [...table], irregular: true, reflexive: false };
  const regular = conjugateRegular(verb);
  if (regular) return { verb, forms: regular, irregular: false, reflexive: false };
  // Reflexive: levantarse -> me levanto. The planner needed more than four
  // letters, which left out irse; four is enough for the base to be a verb.
  if (verb.length >= 4 && verb.endsWith("se")) {
    const base = conjugatePresent(verb.slice(0, -2));
    if (base && !base.reflexive) {
      return { verb, forms: base.forms.map((f, i) => `${REFLEXIVE[i]} ${f}`), irregular: base.irregular, reflexive: true };
    }
  }
  return null;
}

/**
 * Whether an item in her material is a verb to conjugate. Plenty of nouns end
 * in -ar, -er or -ir (mujer, lugar), so a regular-looking word counts only when
 * its meaning reads "to ...". A verb in the irregular table always counts.
 */
export function isInfinitive(text: string, meaning: string): boolean {
  const c = conjugatePresent(text);
  if (!c) return false;
  if (c.irregular) return true;
  return /^\s*to\s+\S/i.test(meaning);
}

/** "-ar", "-er" or "-ir": the family a verb conjugates in. */
export function verbFamily(verb: string): string {
  const base = verb.endsWith("se") && verb.length >= 4 && conjugatePresent(verb.slice(0, -2)) ? verb.slice(0, -2) : verb;
  return `-${base.slice(-2).replace("í", "i")}`;
}

/**
 * Common verbs known to be fully regular in the present: no stem change, no
 * irregular yo form, no written accent on any form. Only these and the
 * irregular table are trusted for quiz questions, because the regular pattern
 * gets a stem-changing verb (probar, pruebo) wrong.
 */
export const KNOWN_REGULAR = new Set([
  // -ar
  "hablar", "trabajar", "estudiar", "necesitar", "comprar", "cocinar", "caminar", "escuchar", "mirar", "llegar",
  "tomar", "viajar", "bailar", "cantar", "ayudar", "llamar", "llevar", "preparar", "limpiar", "desayunar", "cenar",
  "nadar", "terminar", "usar", "visitar", "esperar", "buscar", "pagar", "enseñar", "ganar", "lavar", "regresar",
  "descansar", "practicar", "manejar", "levantar", "tocar", "cambiar", "duchar", "bañar", "peinar", "maquillar",
  // -er
  "comer", "beber", "leer", "aprender", "comprender", "correr", "vender", "deber", "creer", "responder", "romper",
  // -ir
  "vivir", "escribir", "abrir", "recibir", "decidir", "subir", "compartir", "asistir", "permitir", "existir",
  "describir", "discutir", "sufrir", "partir", "insistir",
]);

/** Whether the conjugator's forms for this verb are known to be right: irregular table, or known regular, reflexive included. */
export function isKnownConjugation(input: string): boolean {
  const c = conjugatePresent(input);
  if (!c) return false;
  const base = c.reflexive ? c.verb.slice(0, -2) : c.verb;
  return base in IRREGULAR_VERBS || KNOWN_REGULAR.has(base);
}
