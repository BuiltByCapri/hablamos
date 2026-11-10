// The vocabulary sets Capri's planner seeded, carried over verbatim
// (2026-10-29) so they can be imported into her material as items. Each set
// becomes a topic. Countries are imported from countries.ts.

export type PlannerEntry = { es: string; en: string };

export const PLANNER_SETS: Record<string, PlannerEntry[]> = {
  "First words": [
    { es: "hola", en: "hello" }, { es: "gracias", en: "thank you" }, { es: "por favor", en: "please" },
    { es: "sí", en: "yes" }, { es: "no", en: "no" }, { es: "bueno", en: "good" }, { es: "malo", en: "bad" },
    { es: "querer", en: "to want" }, { es: "necesitar", en: "to need" }, { es: "tener", en: "to have" },
    { es: "ir", en: "to go" }, { es: "hacer", en: "to do / to make" }, { es: "comer", en: "to eat" },
    { es: "hoy", en: "today" }, { es: "mañana", en: "tomorrow" }, { es: "ahora", en: "now" },
    { es: "también", en: "also" }, { es: "mucho", en: "a lot / much" }, { es: "poco", en: "a little" },
    { es: "cómo", en: "how" },
  ],
  Colors: [
    { es: "rojo", en: "red" }, { es: "azul", en: "blue" }, { es: "verde", en: "green" },
    { es: "amarillo", en: "yellow" }, { es: "negro", en: "black" }, { es: "blanco", en: "white" },
    { es: "naranja", en: "orange" }, { es: "morado", en: "purple" }, { es: "rosado", en: "pink" },
    { es: "gris", en: "gray" },
  ],
  Animals: [
    { es: "perro", en: "dog" }, { es: "gato", en: "cat" }, { es: "pájaro", en: "bird" }, { es: "pez", en: "fish" },
    { es: "caballo", en: "horse" }, { es: "vaca", en: "cow" }, { es: "conejo", en: "rabbit" },
    { es: "ratón", en: "mouse" },
  ],
  Household: [
    { es: "mesa", en: "table" }, { es: "silla", en: "chair" }, { es: "cama", en: "bed" },
    { es: "cocina", en: "kitchen" }, { es: "baño", en: "bathroom" }, { es: "puerta", en: "door" },
    { es: "ventana", en: "window" }, { es: "sofá", en: "couch" }, { es: "lámpara", en: "lamp" },
    { es: "llave", en: "key" },
  ],
  Numbers: [
    { es: "cero", en: "0" }, { es: "uno", en: "1" }, { es: "dos", en: "2" }, { es: "tres", en: "3" },
    { es: "cuatro", en: "4" }, { es: "cinco", en: "5" }, { es: "seis", en: "6" }, { es: "siete", en: "7" },
    { es: "ocho", en: "8" }, { es: "nueve", en: "9" }, { es: "diez", en: "10" }, { es: "once", en: "11" },
    { es: "doce", en: "12" }, { es: "trece", en: "13" }, { es: "catorce", en: "14" }, { es: "quince", en: "15" },
    { es: "dieciséis", en: "16" }, { es: "diecisiete", en: "17" }, { es: "dieciocho", en: "18" },
    { es: "diecinueve", en: "19" }, { es: "veinte", en: "20" }, { es: "veintiuno", en: "21" },
    { es: "veintidós", en: "22" }, { es: "veintitrés", en: "23" }, { es: "veinticuatro", en: "24" },
    { es: "veinticinco", en: "25" }, { es: "veintiséis", en: "26" }, { es: "veintisiete", en: "27" },
    { es: "veintiocho", en: "28" }, { es: "veintinueve", en: "29" }, { es: "treinta", en: "30" },
    { es: "cuarenta", en: "40" }, { es: "cincuenta", en: "50" }, { es: "sesenta", en: "60" },
    { es: "setenta", en: "70" }, { es: "ochenta", en: "80" }, { es: "noventa", en: "90" }, { es: "cien", en: "100" },
    { es: "ciento uno", en: "101" }, { es: "ciento treinta", en: "130" }, { es: "doscientos", en: "200" },
    { es: "doscientos cincuenta", en: "250" }, { es: "trescientos", en: "300" }, { es: "cuatrocientos", en: "400" },
    { es: "quinientos", en: "500" }, { es: "seiscientos", en: "600" }, { es: "setecientos", en: "700" },
    { es: "ochocientos", en: "800" }, { es: "novecientos", en: "900" }, { es: "mil", en: "1,000" },
    { es: "mil quinientos", en: "1,500" }, { es: "dos mil", en: "2,000" }, { es: "tres mil", en: "3,000" },
    { es: "diez mil", en: "10,000" }, { es: "cien mil", en: "100,000" }, { es: "ciento treinta mil", en: "130,000" },
    { es: "doscientos mil", en: "200,000" }, { es: "trescientos mil", en: "300,000" }, { es: "un millón", en: "1,000,000" },
    { es: "un millón doscientos mil", en: "1,200,000" }, { es: "dos millones", en: "2,000,000" },
    { es: "tres millones", en: "3,000,000" },
  ],
  "How you feel": [
    { es: "cansado", en: "tired" }, { es: "enfermo", en: "sick" }, { es: "relajado", en: "relaxed" },
    { es: "hambriento", en: "hungry" }, { es: "feliz", en: "happy" }, { es: "triste", en: "sad" },
    { es: "enojado", en: "angry" }, { es: "nervioso", en: "nervous" }, { es: "emocionado", en: "excited" },
    { es: "aburrido", en: "bored" }, { es: "confundido", en: "confused" }, { es: "preocupado", en: "worried" },
    { es: "asustado", en: "scared" }, { es: "sorprendido", en: "surprised" }, { es: "ocupado", en: "busy" },
    { es: "enamorado", en: "in love" },
  ],
  School: [
    { es: "el horario", en: "schedule / timetable" }, { es: "la clase", en: "class" },
    { es: "el salón de clase", en: "classroom" }, { es: "la escuela", en: "school" },
    { es: "la universidad", en: "university" }, { es: "el profesor", en: "teacher / professor (m.)" },
    { es: "la profesora", en: "teacher / professor (f.)" }, { es: "el estudiante", en: "student" },
    { es: "el compañero de clase", en: "classmate" }, { es: "el libro", en: "book" },
    { es: "el cuaderno", en: "notebook" }, { es: "la mochila", en: "backpack" }, { es: "el lápiz", en: "pencil" },
    { es: "el bolígrafo", en: "pen" }, { es: "la tarea", en: "homework" }, { es: "el examen", en: "exam" },
    { es: "la pregunta", en: "question" }, { es: "la respuesta", en: "answer" }, { es: "la nota", en: "grade" },
    { es: "la biblioteca", en: "library" }, { es: "la cafetería", en: "cafeteria" },
  ],
};

/** Present tense of the regular endings and ser/estar, as the planner's grammar tab showed them. */
export const PRONOUNS: [string, string][] = [
  ["yo", "I"], ["tú", "you (informal)"], ["él / ella / usted", "he / she / you (formal)"],
  ["nosotros / nosotras", "we"], ["vosotros / vosotras", "you all (Spain)"], ["ellos / ellas / ustedes", "they / you all"],
];
