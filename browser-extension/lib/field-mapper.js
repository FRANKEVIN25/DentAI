const FIELD_DEFINITIONS = {
  patient_name: {
    label: "Nombre del paciente",
    aliases: ["nombre del paciente", "nombre paciente", "paciente", "nombre completo", "nombre"],
  },
  document_id: {
    label: "Documento",
    aliases: ["documento de identidad", "numero de documento", "número de documento", "documento", "dni", "historia clinica", "historia clínica"],
  },
  tooth: {
    label: "Pieza dental",
    aliases: ["pieza dental", "numero de pieza", "número de pieza", "pieza", "diente"],
  },
  symptom: {
    label: "Síntoma",
    aliases: ["sintoma principal", "síntoma principal", "motivo de consulta", "sintoma", "síntoma", "molestia"],
  },
  duration: {
    label: "Duración",
    aliases: ["tiempo de evolucion", "tiempo de evolución", "duracion", "duración", "evolucion", "evolución", "desde hace"],
  },
  diagnosis: {
    label: "Diagnóstico",
    aliases: ["diagnostico presuntivo", "diagnóstico presuntivo", "diagnostico", "diagnóstico"],
  },
  treatment: {
    label: "Tratamiento",
    aliases: ["plan de tratamiento", "procedimiento", "tratamiento", "plan"],
  },
  notes: {
    label: "Observaciones",
    aliases: ["observaciones", "observacion", "observación", "notas", "nota", "comentarios"],
  },
  search: {
    label: "Búsqueda",
    aliases: ["buscar", "busqueda", "búsqueda", "consulta", "pregunta"],
  },
  email: {
    label: "Correo",
    aliases: ["correo electronico", "correo electrónico", "correo", "email", "e-mail"],
  },
  phone: {
    label: "Teléfono",
    aliases: ["numero de telefono", "número de teléfono", "telefono", "teléfono", "celular"],
  },
  address: {
    label: "Dirección",
    aliases: ["direccion", "dirección", "domicilio"],
  },
};

const CATEGORY_ORDER = [
  "document_id",
  "patient_name",
  "tooth",
  "symptom",
  "duration",
  "diagnosis",
  "treatment",
  "notes",
  "email",
  "phone",
  "address",
  "search",
];

const EXPLICIT_FIELD_MARKERS = {
  patient_name: ["nombre del paciente", "nombre paciente", "nombre completo", "paciente"],
  document_id: ["dni del paciente", "dni", "documento de identidad", "numero de documento", "número de documento"],
  tooth: ["pieza dental", "numero de pieza", "número de pieza", "pieza", "diente"],
  symptom: ["sintoma principal", "síntoma principal", "sintoma", "síntoma", "motivo de consulta"],
  duration: ["duracion", "duración", "tiempo de evolucion", "tiempo de evolución"],
  diagnosis: ["diagnostico presuntivo", "diagnóstico presuntivo", "diagnostico", "diagnóstico"],
  treatment: ["plan de tratamiento", "tratamiento", "procedimiento"],
  notes: ["observaciones", "observacion", "observación", "notas"],
};

export function normalizeText(value = "") {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .replace(/[^a-z0-9@.+\-\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripConnector(value) {
  return value
    .replace(/^\s*(?:es|son|igual\s+a|corresponde\s+a|dice|de|del|:|-)+\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function segmentFacts(transcript) {
  const facts = {};
  const segments = transcript
    .split(/[,;\n]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  for (const segment of segments) {
    const normalized = normalizeText(segment);
    for (const category of CATEGORY_ORDER) {
      const aliases = [...FIELD_DEFINITIONS[category].aliases]
        .sort((a, b) => normalizeText(b).length - normalizeText(a).length);
      const alias = aliases.find((candidate) => {
        const normalizedAlias = normalizeText(candidate);
        return normalized === normalizedAlias || normalized.startsWith(`${normalizedAlias} `);
      });
      if (!alias) continue;
      const value = stripConnector(segment.slice(alias.length));
      if (category === "patient_name" && /^(?:presenta|refiere|tiene|acude|consulta|con)\b/i.test(value)) {
        continue;
      }
      if (value) facts[category] = value;
      break;
    }
  }

  const markers = [];
  const accentPattern = {
    a: "[aá]", e: "[eé]", i: "[ií]", o: "[oó]", u: "[uúü]", n: "[nñ]",
  };
  for (const [category, aliases] of Object.entries(EXPLICIT_FIELD_MARKERS)) {
    for (const alias of aliases) {
      const normalizedAlias = normalizeText(alias);
      const pattern = [...normalizedAlias]
        .map((character) => character === " " ? "\\s+" : (accentPattern[character] || character.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
        .join("");
      const expression = new RegExp(`\\b${pattern}\\b`, "giu");
      for (const match of transcript.matchAll(expression)) {
        markers.push({ category, index: match.index, length: match[0].length });
      }
    }
  }

  markers.sort((a, b) => a.index - b.index || b.length - a.length);
  const nonOverlapping = [];
  for (const marker of markers) {
    const previous = nonOverlapping.at(-1);
    if (previous && marker.index < previous.index + previous.length) continue;
    nonOverlapping.push(marker);
  }

  if (nonOverlapping.length > 1) {
    nonOverlapping.forEach((marker, index) => {
      const next = nonOverlapping[index + 1];
      const rawValue = transcript.slice(marker.index + marker.length, next?.index ?? transcript.length);
      const value = stripConnector(rawValue.replace(/^[,;:\s-]+|[,;:\s-]+$/g, ""));
      if (!value) return;
      if (marker.category === "patient_name" && /^(?:presenta|refiere|tiene|acude|consulta|con)\b/i.test(value)) return;
      facts[marker.category] = value;
    });
  }
  return facts;
}

export function parseClinicalFacts(transcript) {
  const text = transcript.trim();
  const facts = segmentFacts(text);

  if (facts.document_id) {
    const normalizedDocument = facts.document_id.replace(/\D/g, "");
    if (normalizedDocument.length >= 6 && normalizedDocument.length <= 12) {
      facts.document_id = normalizedDocument;
    }
  }

  const tooth = text.match(/\b(?:pieza(?:\s+dental)?|diente)(?:\s+n[uú]mero)?\s*(\d{1,2})\b/i);
  if (tooth) facts.tooth = tooth[1];

  const duration = text.match(/\b(?:desde\s+hace|durante|hace)\s+(?:aproximadamente\s+)?([\wáéíóúñ]+\s+(?:horas?|d[ií]as?|semanas?|meses?|a[nñ]os?))/i);
  if (duration) facts.duration = duration[1].trim();

  if (!facts.symptom) {
    const symptom = text.match(/\b(?:presenta|refiere|con|s[ií]ntoma(?:\s+principal)?(?:\s+es)?)\s+(dolor|inflamaci[oó]n|sangrado|sensibilidad|movilidad|halitosis)(?:\s+(agudo|intenso|leve|moderado|severo|localizado|generalizado))?/i);
    if (symptom) facts.symptom = [symptom[1], symptom[2]].filter(Boolean).join(" ");
  }

  if (!facts.document_id) {
    const document = text.match(/\b(?:dni|documento(?:\s+de\s+identidad)?)(?:\s+del\s+paciente)?(?:\s+n[uú]mero)?\s*((?:\d[\s.-]*){6,12})/i);
    if (document) facts.document_id = document[1].replace(/\D/g, "");
  }

  if (!facts.email) {
    const email = text.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i);
    if (email) facts.email = email[0];
  }

  return facts;
}

function fieldDescription(field) {
  return normalizeText([
    field.label,
    field.name,
    field.idAttribute,
    field.placeholder,
    field.ariaLabel,
    field.autocomplete,
  ].filter(Boolean).join(" "));
}

export function categorizeField(field) {
  const description = fieldDescription(field);
  if (field.name === "q" || /\b(search|buscar|busqueda)\b/.test(description)) return "search";
  for (const category of CATEGORY_ORDER) {
    if (FIELD_DEFINITIONS[category].aliases.some((alias) => description.includes(normalizeText(alias)))) {
      return category;
    }
  }
  return null;
}

function selectOptionValue(field, requestedValue) {
  if (!Array.isArray(field.options) || field.options.length === 0) return requestedValue;
  const normalized = normalizeText(requestedValue);
  const exact = field.options.find((option) =>
    normalizeText(option.label) === normalized || normalizeText(option.value) === normalized);
  if (exact) return exact.value;
  const partial = field.options.find((option) =>
    normalizeText(option.label).includes(normalized) || normalized.includes(normalizeText(option.label)));
  return partial?.value ?? requestedValue;
}

function spokenFieldQuery(value) {
  return normalizeText(value)
    .replace(/^(?:dentai\s+)?(?:(?:selecciona|seleccionar|elige|elegir|abre|ir\s+a|ve\s+a|campo)\s+)+/, "")
    .replace(/^(?:el|la)\s+/, "")
    .trim();
}

function phraseScore(query, phrase) {
  const normalizedPhrase = normalizeText(phrase);
  if (!query || !normalizedPhrase) return 0;
  if (query === normalizedPhrase) return 1;
  if (query.includes(normalizedPhrase)) {
    const meaningfulTokens = normalizedPhrase.split(" ").filter((token) => !["de", "del", "el", "la"].includes(token));
    return meaningfulTokens.length > 1 ? 0.94 + Math.min(0.04, normalizedPhrase.length / 1000) : 0.62;
  }
  if (normalizedPhrase.includes(query) && query.length >= 3) return 0.86;

  const ignored = new Set(["de", "del", "el", "la", "los", "las", "campo"]);
  const queryTokens = new Set(query.split(" ").filter((token) => token.length > 1 && !ignored.has(token)));
  const phraseTokens = new Set(normalizedPhrase.split(" ").filter((token) => token.length > 1 && !ignored.has(token)));
  if (!queryTokens.size || !phraseTokens.size) return 0;
  const shared = [...phraseTokens].filter((token) => queryTokens.has(token)).length;
  return (shared / phraseTokens.size) * 0.72 + (shared / queryTokens.size) * 0.18;
}

export function matchSpokenField(fields, utterance) {
  const query = spokenFieldQuery(utterance);
  const candidates = fields
    .filter((field) => !["password", "hidden", "checkbox", "radio", "file"].includes(field.type))
    .map((field) => {
      const category = categorizeField(field);
      const phrases = [
        field.label,
        field.name,
        field.idAttribute,
        field.placeholder,
        field.ariaLabel,
        ...(category ? FIELD_DEFINITIONS[category].aliases : []),
      ].filter(Boolean);
      const score = Math.max(0, ...phrases.map((phrase) => phraseScore(query, phrase)));
      return { field, category, score };
    })
    .filter((candidate) => candidate.score >= 0.58)
    .sort((a, b) => b.score - a.score);

  if (!candidates.length) return { status: "none", query, candidates: [] };
  if (candidates[1] && candidates[0].score - candidates[1].score < 0.08) {
    return { status: "ambiguous", query, candidates: candidates.slice(0, 3) };
  }
  return { status: "matched", query, field: candidates[0].field, category: candidates[0].category, confidence: candidates[0].score };
}

const SPOKEN_DIGITS = {
  cero: "0", uno: "1", una: "1", un: "1", dos: "2", tres: "3", cuatro: "4",
  cinco: "5", seis: "6", siete: "7", ocho: "8", nueve: "9",
};

const SPOKEN_NUMBERS = {
  diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15,
  dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20,
  veintiuno: 21, veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25,
  veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29,
};

function spokenDigits(value) {
  const numerical = String(value).match(/\d/g)?.join("") || "";
  if (numerical) return numerical;
  const tokens = normalizeText(value).split(" ").filter(Boolean);
  if (tokens.length && tokens.every((token) => token in SPOKEN_DIGITS)) {
    return tokens.map((token) => SPOKEN_DIGITS[token]).join("");
  }
  return "";
}

function spokenInteger(value) {
  const digits = spokenDigits(value);
  if (digits) return Number(digits);
  const normalized = normalizeText(value).replace(/\s+y\s+/g, " ");
  if (normalized in SPOKEN_NUMBERS) return SPOKEN_NUMBERS[normalized];
  const parts = normalized.split(" ");
  const tens = { treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80 };
  if (parts[0] in tens && parts[1] in SPOKEN_DIGITS) return tens[parts[0]] + Number(SPOKEN_DIGITS[parts[1]]);
  return Number.NaN;
}

function validToothNumber(value) {
  const quadrant = Math.floor(value / 10);
  const position = value % 10;
  return (quadrant >= 1 && quadrant <= 4 && position >= 1 && position <= 8)
    || (quadrant >= 5 && quadrant <= 8 && position >= 1 && position <= 5);
}

export function normalizeSpokenFieldValue(field, utterance) {
  const rawValue = String(utterance ?? "").replace(/^\s*(?:valor|es|dice)\s+/i, "").trim();
  if (!rawValue) return { ok: false, message: "No se escuchó ningún valor. Repítelo." };
  const category = categorizeField(field);

  if (category === "document_id") {
    const digits = spokenDigits(rawValue);
    if (digits.length !== 8) {
      return { ok: false, message: `El DNI debe tener 8 dígitos y se reconocieron ${digits.length || 0}. Díctalos uno por uno.` };
    }
    return { ok: true, value: digits, category };
  }

  if (category === "tooth") {
    const number = spokenInteger(rawValue);
    if (!Number.isInteger(number) || !validToothNumber(number)) {
      return { ok: false, message: "La pieza dental no parece válida. Por ejemplo, di veintiséis o dos seis." };
    }
    return { ok: true, value: String(number), category };
  }

  if (field.type === "select" || field.type === "combobox") {
    const normalized = normalizeText(rawValue);
    const options = (field.options || []).filter((option) => option.value || normalizeText(option.label) !== "seleccionar");
    const exact = options.find((option) => normalizeText(option.label) === normalized || normalizeText(option.value) === normalized);
    const partial = options.find((option) => normalizeText(option.label).includes(normalized) || normalized.includes(normalizeText(option.label)));
    const option = exact || partial;
    if (!option) {
      const labels = options.slice(0, 5).map((item) => item.label).join(", ");
      return { ok: false, message: `Ese valor no existe en la lista. Opciones: ${labels}.` };
    }
    return { ok: true, value: option.value, spokenValue: option.label, category };
  }

  if (category === "phone") {
    const digits = spokenDigits(rawValue);
    if (digits.length < 6) return { ok: false, message: "El teléfono parece incompleto. Dicta los dígitos uno por uno." };
    return { ok: true, value: digits, category };
  }

  if (category === "patient_name") {
    const containsAnotherField = Object.entries(EXPLICIT_FIELD_MARKERS)
      .some(([markerCategory, aliases]) => markerCategory !== "patient_name"
        && aliases.some((alias) => normalizeText(rawValue).includes(normalizeText(alias))));
    if (containsAnotherField) {
      return { ok: false, message: "El valor parece contener el nombre de otro campo. Di solamente el nombre del paciente." };
    }
  }

  return { ok: true, value: rawValue, category };
}

function valueForCategory(category, facts, transcript) {
  if (facts[category]) return facts[category];
  if (category === "search") {
    return transcript.replace(/^\s*(?:buscar|busca|b[uú]squeda|consulta|pregunta)\s*/i, "").trim();
  }
  return "";
}

export function suggestFieldValues(fields, transcript, pageUrl = "") {
  const cleanTranscript = transcript.trim();
  if (!cleanTranscript) return [];

  const facts = parseClinicalFacts(cleanTranscript);
  const editable = fields.filter((field) => !["password", "hidden", "checkbox", "radio", "file"].includes(field.type));
  const suggestions = [];

  for (const field of editable) {
    const category = categorizeField(field);
    let value = category ? valueForCategory(category, facts, cleanTranscript) : "";

    if (!value && editable.length === 1) value = cleanTranscript;
    if (!value && /google\.[^/]+\/search|google\.[^/]+\/$/i.test(pageUrl) && field.name === "q") {
      value = valueForCategory("search", facts, cleanTranscript);
    }
    if (!value) continue;

    suggestions.push({
      fieldId: field.fieldId,
      label: field.label || FIELD_DEFINITIONS[category]?.label || field.name || "Campo sin etiqueta",
      category: category ?? "generic",
      type: field.type,
      value: selectOptionValue(field, value),
      confidence: category ? "high" : "fallback",
    });
  }

  return suggestions;
}

export { FIELD_DEFINITIONS };
