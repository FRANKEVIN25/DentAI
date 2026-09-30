import test from "node:test";
import assert from "node:assert/strict";

import {
  categorizeField,
  matchSpokenField,
  normalizeSpokenFieldValue,
  parseClinicalFacts,
  suggestFieldValues,
} from "../lib/field-mapper.js";

const demoFields = [
  { fieldId: "1", label: "Nombre del paciente", name: "patient_name", type: "text", options: [] },
  { fieldId: "2", label: "DNI del paciente", name: "document_id", type: "text", options: [] },
  { fieldId: "3", label: "Pieza dental", name: "tooth", type: "number", options: [] },
  {
    fieldId: "4",
    label: "Síntoma principal",
    name: "symptom",
    type: "select",
    options: [
      { label: "Seleccionar", value: "" },
      { label: "Dolor", value: "dolor" },
      { label: "Inflamación", value: "inflamación" },
    ],
  },
  { fieldId: "5", label: "Duración", name: "duration", type: "text", options: [] },
  { fieldId: "6", label: "Diagnóstico presuntivo", name: "diagnosis", type: "text", options: [] },
  { fieldId: "7", label: "Plan de tratamiento", name: "treatment", type: "text", options: [] },
];

test("extrae hechos clínicos frecuentes del dictado", () => {
  const facts = parseClinicalFacts(
    "Paciente Ana Torres, DNI 12345678, pieza 26, presenta dolor, desde hace tres días, diagnóstico caries profunda, tratamiento restauración con resina",
  );

  assert.equal(facts.patient_name, "Ana Torres");
  assert.equal(facts.document_id, "12345678");
  assert.equal(facts.tooth, "26");
  assert.equal(facts.symptom, "dolor");
  assert.equal(facts.duration, "tres días");
  assert.equal(facts.diagnosis, "caries profunda");
  assert.equal(facts.treatment, "restauración con resina");
});

test("mapea el dictado a los campos del formulario clínico", () => {
  const suggestions = suggestFieldValues(
    demoFields,
    "Paciente Ana Torres, DNI 12345678, pieza 26, síntoma dolor, duración tres días, diagnóstico caries profunda, tratamiento restauración con resina",
    "http://127.0.0.1:8080/demo-form.html",
  );

  assert.deepEqual(
    Object.fromEntries(suggestions.map((item) => [item.category, item.value])),
    {
      patient_name: "Ana Torres",
      document_id: "12345678",
      tooth: "26",
      symptom: "dolor",
      duration: "tres días",
      diagnosis: "caries profunda",
      treatment: "restauración con resina",
    },
  );
});

test("rellena el único campo de búsqueda de Google", () => {
  const fields = [{
    fieldId: "q",
    label: "Buscar",
    name: "q",
    type: "search",
    options: [],
  }];
  const suggestions = suggestFieldValues(fields, "buscar clínica dental creo", "https://www.google.com/");

  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0].category, "search");
  assert.equal(suggestions[0].value, "clínica dental creo");
});

test("no propone completar credenciales", () => {
  const fields = [{ fieldId: "password", label: "Contraseña", name: "password", type: "password", options: [] }];
  assert.deepEqual(suggestFieldValues(fields, "contraseña secreta", "https://www.google.com/"), []);
});

test("clasifica etiquetas aunque tengan tildes", () => {
  assert.equal(categorizeField({ label: "Diagnóstico presuntivo" }), "diagnosis");
  assert.equal(categorizeField({ label: "Número de teléfono" }), "phone");
});

test("no confunde una frase clínica con el nombre del paciente", () => {
  const facts = parseClinicalFacts("Paciente presenta dolor en la pieza 26 desde hace tres días");
  assert.equal(facts.patient_name, undefined);
  assert.equal(facts.symptom, "dolor");
  assert.equal(facts.tooth, "26");
});

test("identifica por voz el campo solicitado sin confundir DNI con nombre", () => {
  const nameMatch = matchSpokenField(demoFields, "DentAI campo nombre del paciente");
  const dniMatch = matchSpokenField(demoFields, "DNI del paciente");

  assert.equal(nameMatch.status, "matched");
  assert.equal(nameMatch.field.fieldId, "1");
  assert.equal(dniMatch.status, "matched");
  assert.equal(dniMatch.field.fieldId, "2");
});

test("identifica de forma determinista todos los campos estructurados del formulario", () => {
  const commands = [
    ["pieza dental", "3"],
    ["síntoma principal", "4"],
    ["duración", "5"],
    ["diagnóstico presuntivo", "6"],
    ["plan de tratamiento", "7"],
  ];
  for (const [command, expectedFieldId] of commands) {
    const match = matchSpokenField(demoFields, command);
    assert.equal(match.status, "matched", command);
    assert.equal(match.field.fieldId, expectedFieldId, command);
  }
});

test("normaliza y valida un DNI dictado con espacios", () => {
  const result = normalizeSpokenFieldValue(demoFields[1], "74 35 39 95");
  assert.deepEqual(result, { ok: true, value: "74353995", category: "document_id" });
});

test("valida piezas dentales y opciones de listas", () => {
  assert.equal(normalizeSpokenFieldValue(demoFields[2], "veintiséis").value, "26");
  assert.equal(normalizeSpokenFieldValue(demoFields[2], "99").ok, false);
  assert.equal(normalizeSpokenFieldValue(demoFields[3], "inflamación").value, "inflamación");
});

test("separa campos consecutivos aunque el dictado no tenga comas", () => {
  const facts = parseClinicalFacts("nombre del paciente Fran Kevin Harregui DNI del paciente 74 35 39 95 pieza dental 14");
  assert.equal(facts.patient_name, "Fran Kevin Harregui");
  assert.equal(facts.document_id, "74353995");
  assert.equal(facts.tooth, "14");
});
