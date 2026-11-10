// Countries and nationalities, carried over from Capri's planner (2026-10-29).
// Reference content: the same for every Spanish learner, so it lives in code
// rather than in anyone's material. Where someone is from always takes ser.

export type Country = {
  country: string;
  /** Nationality describing a man, or a mixed or unspecified group's singular. */
  masculine: string;
  /** Nationality describing a woman. Same as masculine for -e and -ense forms. */
  feminine: string;
  english: string;
};

export const COUNTRIES: Country[] = [
  { country: "Estados Unidos", masculine: "estadounidense", feminine: "estadounidense", english: "United States" },
  { country: "México", masculine: "mexicano", feminine: "mexicana", english: "Mexico" },
  { country: "Canadá", masculine: "canadiense", feminine: "canadiense", english: "Canada" },
  { country: "España", masculine: "español", feminine: "española", english: "Spain" },
  { country: "Cuba", masculine: "cubano", feminine: "cubana", english: "Cuba" },
  { country: "Puerto Rico", masculine: "puertorriqueño", feminine: "puertorriqueña", english: "Puerto Rico" },
  { country: "República Dominicana", masculine: "dominicano", feminine: "dominicana", english: "Dominican Republic" },
  { country: "Colombia", masculine: "colombiano", feminine: "colombiana", english: "Colombia" },
  { country: "Venezuela", masculine: "venezolano", feminine: "venezolana", english: "Venezuela" },
  { country: "Argentina", masculine: "argentino", feminine: "argentina", english: "Argentina" },
  { country: "Chile", masculine: "chileno", feminine: "chilena", english: "Chile" },
  { country: "Perú", masculine: "peruano", feminine: "peruana", english: "Peru" },
  { country: "Ecuador", masculine: "ecuatoriano", feminine: "ecuatoriana", english: "Ecuador" },
  { country: "Brasil", masculine: "brasileño", feminine: "brasileña", english: "Brazil" },
  { country: "Guatemala", masculine: "guatemalteco", feminine: "guatemalteca", english: "Guatemala" },
  { country: "Honduras", masculine: "hondureño", feminine: "hondureña", english: "Honduras" },
  { country: "El Salvador", masculine: "salvadoreño", feminine: "salvadoreña", english: "El Salvador" },
  { country: "Haití", masculine: "haitiano", feminine: "haitiana", english: "Haiti" },
  { country: "Jamaica", masculine: "jamaiquino", feminine: "jamaiquina", english: "Jamaica" },
  { country: "Francia", masculine: "francés", feminine: "francesa", english: "France" },
  { country: "Inglaterra", masculine: "inglés", feminine: "inglesa", english: "England" },
  { country: "Alemania", masculine: "alemán", feminine: "alemana", english: "Germany" },
  { country: "Italia", masculine: "italiano", feminine: "italiana", english: "Italy" },
  { country: "China", masculine: "chino", feminine: "china", english: "China" },
  { country: "Japón", masculine: "japonés", feminine: "japonesa", english: "Japan" },
  { country: "India", masculine: "indio", feminine: "india", english: "India" },
  { country: "Nigeria", masculine: "nigeriano", feminine: "nigeriana", english: "Nigeria" },
];

/** The two ways to say where someone is from, in pairs: ser + de + country, ser + nationality. */
export const COUNTRY_EXAMPLES: string[] = [
  "Yo soy de Estados Unidos.", "Yo soy estadounidense.",
  "Tú eres de Chile.", "Tú eres chilena.",
  "Él es de España.", "Él es español.",
  "Ella es de México.", "Ella es mexicana.",
  "Nosotros somos de Colombia.", "Nosotros somos colombianos.",
  "Vosotros sois de Perú.", "Vosotros sois peruanos.",
  "Ellos son de Cuba.", "Ellos son cubanos.",
];

export const COUNTRY_QUESTIONS: string[] = [
  "¿De dónde eres?", "¿De dónde es usted?", "¿De dónde es ella?", "¿De dónde son ustedes?", "¿Cuál es tu nacionalidad?",
];

/** The agreement rules, as the planner taught them. */
export const NATIONALITY_RULES: string[] = [
  "Ends in -o: change to -a for a woman. mexicano, mexicana.",
  "Ends in a consonant: add -a for a woman. español, española. The accent drops: francés, francesa.",
  "Ends in -e or -ense: the same for both. canadiense, estadounidense.",
  "Plural: add -s, or -es after a consonant. mexicanos, españoles.",
  "Countries are capitalized in Spanish. Nationalities are not.",
];

/** Plural nationality for a group: masculine plural, which Spanish uses for mixed groups too. */
export function pluralNationality(c: Country, feminine = false): string {
  const base = feminine ? c.feminine : c.masculine;
  if (/[aeiou]$/.test(base)) return `${base}s`;
  // A consonant ending takes -es, and a final stressed vowel's accent drops: inglés, ingleses.
  return `${base.replace(/á(?=n$)/, "a").replace(/é(?=s$)/, "e")}es`;
}
