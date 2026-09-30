import {
  categorizeField,
  matchSpokenField,
  normalizeSpokenFieldValue,
  normalizeText,
  suggestFieldValues,
} from "./lib/field-mapper.js";

const elements = {
  applyButton: document.querySelector("#applyButton"),
  auditCount: document.querySelector("#auditCount"),
  clearButton: document.querySelector("#clearButton"),
  clearLogButton: document.querySelector("#clearLogButton"),
  connectionBadge: document.querySelector("#connectionBadge"),
  captureStepLabel: document.querySelector("#captureStepLabel"),
  captureTitle: document.querySelector("#captureTitle"),
  exportLogButton: document.querySelector("#exportLogButton"),
  fieldCount: document.querySelector("#fieldCount"),
  fieldList: document.querySelector("#fieldList"),
  fillMode: document.querySelector("#fillMode"),
  audioMeterBar: document.querySelector("#audioMeterBar"),
  micButton: document.querySelector("#micButton"),
  micLabel: document.querySelector("#micLabel"),
  micStatus: document.querySelector("#micStatus"),
  micStatusDetail: document.querySelector("#micStatusDetail"),
  micStatusTitle: document.querySelector("#micStatusTitle"),
  openMicSettingsButton: document.querySelector("#openMicSettingsButton"),
  operatorName: document.querySelector("#operatorName"),
  previewButton: document.querySelector("#previewButton"),
  privacyNote: document.querySelector("#privacyNote"),
  rescanButton: document.querySelector("#rescanButton"),
  reviewEmpty: document.querySelector("#reviewEmpty"),
  speechMode: document.querySelector("#speechMode"),
  statusMessage: document.querySelector("#statusMessage"),
  testMicButton: document.querySelector("#testMicButton"),
  transcript: document.querySelector("#transcript"),
};

const state = {
  tab: null,
  fields: [],
  suggestions: [],
  listening: false,
  previewStartedAt: 0,
  guided: {
    phase: "field",
    field: null,
    category: null,
    pendingValue: "",
    pendingSpokenValue: "",
    lastFieldId: null,
  },
};

let voiceEventQueue = Promise.resolve();

function setStatus(message, kind = "info") {
  elements.statusMessage.textContent = message;
  elements.statusMessage.className = `status-message visible${kind === "info" ? "" : ` ${kind}`}`;
}

function clearStatus() {
  elements.statusMessage.textContent = "";
  elements.statusMessage.className = "status-message";
}

function setConnection(status, label) {
  elements.connectionBadge.textContent = label;
  elements.connectionBadge.className = `connection-badge ${status}`;
}

async function currentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("No se encontró una pestaña activa.");
  state.tab = tab;
  return tab;
}

async function sendToPage(message) {
  const tab = await currentTab();
  try {
    return await chrome.tabs.sendMessage(tab.id, message);
  } catch {
    throw new Error("Esta página no está habilitada. Abre Google o el formulario local de prueba y recarga la pestaña.");
  }
}

async function scanPage({ announce = true } = {}) {
  try {
    const response = await sendToPage({ type: "DENTAI_SCAN_FIELDS" });
    state.fields = response?.fields ?? [];
    const count = state.fields.length;
    elements.fieldCount.textContent = `${count} ${count === 1 ? "detectado" : "detectados"}`;
    setConnection("connected", "Página lista");
    if (announce) {
      setStatus(count
        ? `Se detectaron ${count} campos editables en la página.`
        : "No se encontraron campos editables visibles en esta página.", count ? "info" : "warning");
    }
    return state.fields;
  } catch (error) {
    state.fields = [];
    elements.fieldCount.textContent = "0 detectados";
    setConnection("blocked", "No disponible");
    setStatus(error instanceof Error ? error.message : "No se pudo leer la página.", "error");
    return [];
  }
}

function renderSuggestions() {
  elements.fieldList.replaceChildren();
  if (!state.suggestions.length) {
    elements.fieldList.hidden = true;
    elements.reviewEmpty.hidden = false;
    elements.applyButton.disabled = true;
    return;
  }

  for (const suggestion of state.suggestions) {
    const row = document.createElement("div");
    row.className = "field-row";
    const label = document.createElement("label");
    label.htmlFor = `value-${suggestion.fieldId}`;
    label.textContent = suggestion.label;
    const hint = document.createElement("span");
    hint.textContent = suggestion.category === "generic" ? "Asignación por contexto" : "Coincidencia semántica";
    label.append(hint);

    const input = document.createElement("input");
    input.id = `value-${suggestion.fieldId}`;
    input.value = suggestion.value;
    input.dataset.fieldId = suggestion.fieldId;
    input.addEventListener("input", () => {
      suggestion.value = input.value;
    });
    row.append(label, input);
    elements.fieldList.append(row);
  }

  elements.reviewEmpty.hidden = true;
  elements.fieldList.hidden = false;
  elements.applyButton.disabled = false;
}

async function preparePreview() {
  const transcript = elements.transcript.value.trim();
  if (!transcript) {
    setStatus("Escribe o dicta una frase antes de preparar el llenado.", "warning");
    elements.transcript.focus();
    return;
  }

  clearStatus();
  state.previewStartedAt = performance.now();
  const fields = await scanPage({ announce: false });
  state.suggestions = suggestFieldValues(fields, transcript, state.tab?.url ?? "");
  renderSuggestions();
  if (state.suggestions.length) {
    setStatus(`Revisa ${state.suggestions.length} ${state.suggestions.length === 1 ? "campo propuesto" : "campos propuestos"}. Aún no se ha escrito nada en la página.`);
  } else if (fields.length) {
    setStatus("Se detectaron campos, pero no se encontró una relación clara. Menciona el nombre de cada campo, por ejemplo: “nombre Ana, pieza 26”.", "warning");
  }
}

async function appendAudit(entry) {
  const stored = await chrome.storage.local.get({ dentaiAudit: [] });
  const audit = Array.isArray(stored.dentaiAudit) ? stored.dentaiAudit : [];
  audit.push(entry);
  await chrome.storage.local.set({ dentaiAudit: audit.slice(-100) });
  await refreshAuditCount();
}

async function applySuggestions() {
  if (!state.suggestions.length) return;
  elements.applyButton.disabled = true;
  const startedAt = performance.now();
  try {
    const response = await sendToPage({
      type: "DENTAI_APPLY_FIELDS",
      items: state.suggestions.map(({ fieldId, label, value }) => ({ fieldId, label, value })),
    });
    const applied = response?.applied ?? [];
    const failed = response?.failed ?? [];
    const durationMs = Math.round(performance.now() - startedAt);
    const origin = state.tab?.url ? new URL(state.tab.url).origin : "desconocido";
    await appendAudit({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      origin,
      operator: elements.operatorName.value.trim() || "Profesional sin identificar",
      attempted: state.suggestions.length,
      applied: applied.length,
      failed: failed.length,
      durationMs,
      speechMode: elements.speechMode.value,
    });

    if (failed.length) {
      setStatus(`Se completaron ${applied.length} campos y fallaron ${failed.length}. Vuelve a detectar los campos antes de reintentar.`, "warning");
    } else {
      setStatus(`Se completaron ${applied.length} campos en ${durationMs} ms. Revisa la página; DentAI no envió el formulario.`);
    }
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "No se pudo completar la página.", "error");
  } finally {
    elements.applyButton.disabled = state.suggestions.length === 0;
  }
}

function setListening(listening) {
  state.listening = listening;
  elements.micButton.classList.toggle("listening", listening);
  elements.micButton.setAttribute("aria-label", listening ? "Detener dictado" : "Iniciar dictado");
  elements.micLabel.textContent = listening
    ? "Detener"
    : (elements.fillMode.value === "guided" ? "Iniciar guía" : "Dictar");
  elements.fillMode.disabled = listening;
}

function setMicStatus(status, title, detail, level = 0) {
  elements.micStatus.dataset.state = status;
  elements.micStatusTitle.textContent = title;
  elements.micStatusDetail.textContent = detail;
  elements.audioMeterBar.style.width = `${Math.max(0, Math.min(100, level))}%`;
  elements.openMicSettingsButton.hidden = status !== "error";
}

async function sendVoiceCommand(action) {
  await sendToPage({ type: "DENTAI_VOICE_COMMAND", action });
}

function resetGuidedState({ preserveLast = false } = {}) {
  const lastFieldId = preserveLast ? state.guided.lastFieldId : null;
  state.guided = {
    phase: "field",
    field: null,
    category: null,
    pendingValue: "",
    pendingSpokenValue: "",
    lastFieldId,
  };
}

async function updateGuidedPage(title, detail, pageState = "listening") {
  await sendToPage({
    type: "DENTAI_GUIDED_UI",
    payload: { title, detail, state: pageState },
  });
}

function valueInstruction(field, category = categorizeField(field)) {
  if (category === "document_id") return "Dicta los 8 dígitos, preferentemente uno por uno.";
  if (category === "tooth") return "Dicta el número de la pieza, por ejemplo: veintiséis.";
  if (field.type === "select" || field.type === "combobox") {
    const options = (field.options || []).filter((option) => option.value).slice(0, 5).map((option) => option.label).join(", ");
    return options ? `Dicta una opción: ${options}.` : "Dicta una opción de la lista.";
  }
  return "Dicta únicamente el valor de este campo.";
}

async function activateGuidedField(field, category = categorizeField(field)) {
  const response = await sendToPage({ type: "DENTAI_GUIDED_FOCUS", fieldId: field.fieldId });
  if (!response?.ok) throw new Error(response?.reason || "No se pudo seleccionar el campo.");
  state.guided.phase = "value";
  state.guided.field = field;
  state.guided.category = category;
  state.guided.pendingValue = "";
  state.guided.pendingSpokenValue = "";
  const instruction = valueInstruction(field, category);
  await updateGuidedPage(`Campo seleccionado: ${field.label}`, instruction);
  setMicStatus("hearing", field.label, instruction, 35);
  setStatus(`Campo ${field.label} seleccionado. Ahora dicta solamente su valor.`);
}

async function moveGuidedField(direction = 1) {
  if (!state.fields.length) return;
  const referenceId = state.guided.field?.fieldId || state.guided.lastFieldId;
  const currentIndex = state.fields.findIndex((field) => field.fieldId === referenceId);
  const targetIndex = currentIndex < 0
    ? (direction > 0 ? 0 : state.fields.length - 1)
    : currentIndex + direction;
  if (targetIndex < 0 || targetIndex >= state.fields.length) {
    await updateGuidedPage("No hay más campos", "Di el nombre de otro campo o “finalizar registro”.", "error");
    setStatus("No hay más campos en esa dirección.", "warning");
    return;
  }
  await activateGuidedField(state.fields[targetIndex]);
}

function isExactCommand(utterance, commands) {
  const normalized = normalizeText(utterance).replace(/^dentai\s+/, "");
  return commands.includes(normalized);
}

async function stopGuidedSession() {
  await sendToPage({ type: "DENTAI_GUIDED_STOP" }).catch(() => {});
  await sendVoiceCommand({ type: "STOP" }).catch(() => {});
  resetGuidedState();
  setListening(false);
  setMicStatus("ready", "Guía finalizada", "DentAI dejó de escuchar. El formulario no fue enviado.");
  setStatus("Sesión guiada finalizada. Revisa el formulario antes de registrarlo.");
}

async function confirmGuidedValue() {
  const { field, pendingValue } = state.guided;
  if (!field || !pendingValue) return;
  const startedAt = performance.now();
  const response = await sendToPage({
    type: "DENTAI_APPLY_FIELDS",
    items: [{ fieldId: field.fieldId, label: field.label, value: pendingValue }],
  });
  const applied = response?.applied ?? [];
  const failed = response?.failed ?? [];
  const durationMs = Math.round(performance.now() - startedAt);
  let origin = "desconocido";
  try {
    if (state.tab?.url) origin = new URL(state.tab.url).origin;
  } catch {
    // Mantiene el origen técnico genérico.
  }
  await appendAudit({
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    origin,
    operator: elements.operatorName.value.trim() || "Profesional sin identificar",
    attempted: 1,
    applied: applied.length,
    failed: failed.length,
    durationMs,
    speechMode: `${elements.speechMode.value}-guided`,
  });

  if (failed.length) {
    await updateGuidedPage("No se pudo completar el campo", failed[0]?.reason || "Vuelve a decir el valor.", "error");
    state.guided.phase = "value";
    setStatus(failed[0]?.reason || "No se pudo completar el campo.", "error");
    return;
  }

  const completedLabel = field.label;
  state.guided.lastFieldId = field.fieldId;
  resetGuidedState({ preserveLast: true });
  await updateGuidedPage(`${completedLabel} completado`, "Di el nombre de otro campo, “siguiente campo” o “finalizar registro”.", "success");
  setMicStatus("hearing", "Campo completado", "DentAI sigue escuchando el nombre del siguiente campo.", 24);
  setStatus(`${completedLabel} fue completado y confirmado por voz. DentAI sigue escuchando.`);
}

async function handleGuidedUtterance(utterance) {
  const heard = String(utterance || "").trim();
  if (!heard) return;
  const normalized = normalizeText(heard).replace(/^dentai\s+/, "");

  if (["finalizar registro", "terminar registro", "detener dictado", "detener guia", "finalizar"].includes(normalized)) {
    await stopGuidedSession();
    return;
  }

  if (state.guided.phase === "field") {
    if (isExactCommand(heard, ["siguiente campo", "campo siguiente", "siguiente"])) {
      await moveGuidedField(1);
      return;
    }
    if (isExactCommand(heard, ["campo anterior", "anterior campo", "anterior"])) {
      await moveGuidedField(-1);
      return;
    }

    const match = matchSpokenField(state.fields, heard);
    if (match.status === "none") {
      await updateGuidedPage("Campo no reconocido", `Escuché: “${heard}”. Di el nombre visible de un campo.`, "error");
      setStatus(`No encontré un campo para “${heard}”. Di su nombre visible, por ejemplo: “DNI del paciente”.`, "warning");
      return;
    }
    if (match.status === "ambiguous") {
      const alternatives = match.candidates.map((candidate) => candidate.field.label).join(" o ");
      await updateGuidedPage("Nombre de campo ambiguo", `¿Te refieres a ${alternatives}? Di el nombre completo.`, "error");
      setStatus(`Hay más de una coincidencia: ${alternatives}.`, "warning");
      return;
    }
    await activateGuidedField(match.field, match.category);
    return;
  }

  if (state.guided.phase === "value") {
    if (isExactCommand(heard, ["cancelar", "cancelar campo", "cambiar campo"])) {
      resetGuidedState({ preserveLast: true });
      await updateGuidedPage("Campo cancelado", "Di el nombre del campo que quieres completar.");
      setStatus("Campo cancelado. DentAI espera otro nombre de campo.");
      return;
    }
    const result = normalizeSpokenFieldValue(state.guided.field, heard);
    if (!result.ok) {
      await updateGuidedPage(`Repite ${state.guided.field.label}`, result.message, "error");
      setStatus(result.message, "warning");
      return;
    }
    state.guided.phase = "confirm";
    state.guided.pendingValue = result.value;
    state.guided.pendingSpokenValue = result.spokenValue || result.value;
    await updateGuidedPage(
      `Confirmar ${state.guided.field.label}`,
      `He entendido: “${state.guided.pendingSpokenValue}”. Di “confirmar” o “corregir”.`,
      "confirm",
    );
    setMicStatus("checking", "Esperando confirmación", `Valor: ${state.guided.pendingSpokenValue}. Di confirmar o corregir.`, 55);
    setStatus(`Valor reconocido para ${state.guided.field.label}. Aún no se escribió; di “confirmar” o “corregir”.`);
    return;
  }

  if (state.guided.phase === "confirm") {
    if (isExactCommand(heard, ["confirmar", "confirmo", "correcto", "aceptar", "si confirmar"])) {
      await confirmGuidedValue();
      return;
    }
    if (isExactCommand(heard, ["corregir", "correccion", "repetir", "cambiar valor", "no corregir"])) {
      state.guided.phase = "value";
      state.guided.pendingValue = "";
      state.guided.pendingSpokenValue = "";
      const instruction = valueInstruction(state.guided.field, state.guided.category);
      await updateGuidedPage(`Corrige ${state.guided.field.label}`, instruction);
      setStatus("Valor descartado. Dicta nuevamente el valor del campo.");
      return;
    }
    if (isExactCommand(heard, ["cancelar", "cancelar campo"])) {
      resetGuidedState({ preserveLast: true });
      await updateGuidedPage("Campo cancelado", "Di el nombre de otro campo.");
      return;
    }
    await updateGuidedPage("Falta confirmar", `Escuché: “${heard}”. Di “confirmar” o “corregir”.`, "confirm");
    setStatus("El valor sigue pendiente. Di “confirmar” o “corregir”.", "warning");
  }
}

async function startDictation() {
  try {
    if (state.listening) {
      await sendVoiceCommand({ type: "STOP" });
      return;
    }
    const guided = elements.fillMode.value === "guided";
    if (guided) {
      const fields = await scanPage({ announce: false });
      if (!fields.length) {
        setStatus("No hay campos editables disponibles para iniciar la guía por voz.", "warning");
        return;
      }
      resetGuidedState();
    }
    setMicStatus("checking", "Preparando micrófono", "El permiso se solicitará dentro de la página abierta.");
    await sendVoiceCommand({ type: guided ? "START_GUIDED" : "START", mode: elements.speechMode.value });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo iniciar el dictado.";
    setMicStatus("error", "Página no disponible", message);
    setStatus(message, "error");
  }
}

async function handleVoiceEvent(event) {
  switch (event?.type) {
    case "BRIDGE_READY":
      if (elements.micStatus.dataset.state === "idle") {
        setMicStatus("ready", "Control de voz listo", "Pulsa Probar micrófono para autorizar esta página.");
      }
      break;
    case "PERMISSION_STATE":
      if (event.state === "granted") {
        setMicStatus("ready", "Micrófono permitido en esta página", "Pulsa Dictar y habla cuando aparezca Audio activo.");
      } else if (event.state === "denied") {
        setMicStatus("error", "Micrófono bloqueado para esta página", "Pulsa el candado junto a la dirección y cambia Micrófono a Permitir.");
      }
      break;
    case "PERMISSION_REQUIRED":
      setMicStatus("checking", "Falta autorizar esta página", "Pulsa el botón «Permitir micrófono» que apareció sobre el formulario.");
      setStatus("Mira el formulario: DentAI mostró un botón para conceder el permiso de micrófono a esa página.", "warning");
      break;
    case "MIC_CHECKING":
      setMicStatus("checking", "Solicitando acceso", "Si Chrome muestra un aviso, elige Permitir.");
      break;
    case "MIC_AUTHORIZED":
      setMicStatus("ready", "Micrófono autorizado", event.label || "Chrome puede usar el micrófono de esta página.");
      break;
    case "MIC_HEARING":
      setMicStatus("hearing", "Micrófono abierto", `Habla ahora durante dos segundos (${event.label || "dispositivo predeterminado"}).`);
      break;
    case "MIC_LEVEL":
      elements.audioMeterBar.style.width = `${Math.max(0, Math.min(100, event.level || 0))}%`;
      break;
    case "MIC_READY":
      elements.testMicButton.disabled = false;
      setMicStatus("ready", "Micrófono listo", `Se detectó audio en ${event.label || "el micrófono"}.`, event.level || 0);
      setStatus("El micrófono funciona. Ahora pulsa Dictar y habla cuando aparezca Audio activo.");
      break;
    case "MIC_SILENT":
      elements.testMicButton.disabled = false;
      setMicStatus("checking", "Permiso concedido, sin sonido", `No se detectó voz en ${event.label || "el micrófono"}. Revisa el botón de silencio y el dispositivo predeterminado.`);
      setStatus("Chrome abrió el micrófono, pero no detectó sonido.", "warning");
      break;
    case "LOCAL_INSTALLING":
      setMicStatus("checking", "Instalando español local", "Chrome está preparando el paquete de voz; esto ocurre una sola vez.");
      break;
    case "VOICE_START":
      setListening(true);
      setMicStatus("hearing", "Micrófono abierto", "Habla ahora con una frase completa.", 18);
      setStatus(event.mode === "local" ? "Escuchando en el dispositivo…" : "Escuchando en línea. Usa únicamente datos ficticios.", event.mode === "local" ? "info" : "warning");
      break;
    case "GUIDED_START":
      setListening(true);
      resetGuidedState({ preserveLast: true });
      setMicStatus("hearing", "Guía por voz activa", "Di el nombre visible de un campo, por ejemplo: nombre del paciente.", 22);
      await updateGuidedPage("DentAI está escuchando", "Di el nombre del campo que quieres completar.");
      setStatus(event.mode === "local"
        ? "Guía activa en el dispositivo. Di el nombre de un campo."
        : "Guía activa en línea. Usa únicamente datos ficticios y di el nombre de un campo.", event.mode === "local" ? "info" : "warning");
      break;
    case "AUDIO_START":
      setMicStatus("hearing", "Audio activo", "Habla ahora; DentAI está esperando tu voz.", 30);
      break;
    case "SOUND_START":
      setMicStatus("hearing", "Sonido detectado", "Continúa hablando hasta terminar el dictado.", 58);
      break;
    case "SPEECH_START":
      setMicStatus("hearing", "Voz detectada", "Transcribiendo…", 86);
      break;
    case "SPEECH_END":
      setMicStatus("checking", "Procesando dictado", "Espera la transcripción antes de confirmar.", 42);
      break;
    case "TRANSCRIPT":
      elements.transcript.value = event.transcript || "";
      state.suggestions = [];
      renderSuggestions();
      setMicStatus("ready", "Transcripción recibida", "Revisa el texto y los campos propuestos.", 100);
      break;
    case "GUIDED_INTERIM":
      elements.micStatusDetail.textContent = `Escuchando: ${event.utterance}`;
      break;
    case "GUIDED_UTTERANCE":
      setMicStatus("checking", "Orden recibida", `Procesando: ${event.utterance}`, 48);
      await handleGuidedUtterance(event.utterance);
      break;
    case "GUIDED_RESTARTING":
      if (state.listening) {
        setMicStatus("checking", "Manteniendo la escucha", "La sesión continúa; puedes volver a hablar.", 12);
      }
      break;
    case "GUIDED_END":
      setListening(false);
      elements.audioMeterBar.style.width = "0%";
      await sendToPage({ type: "DENTAI_GUIDED_STOP" }).catch(() => {});
      if (event.failed) resetGuidedState();
      break;
    case "VOICE_END":
      setListening(false);
      elements.audioMeterBar.style.width = "0%";
      if (!event.failed && event.transcript) {
        setMicStatus("ready", "Dictado completado", "La voz fue convertida a texto correctamente.");
        preparePreview();
      } else if (!event.failed) {
        setMicStatus("checking", "No se detectaron palabras", "Pulsa Dictar, espera Audio activo y habla más cerca del micrófono.");
        setStatus("El micrófono se abrió, pero no se reconocieron palabras.", "warning");
      }
      break;
    case "CANCELLED":
      elements.testMicButton.disabled = false;
      setListening(false);
      setMicStatus("checking", "Autorización cancelada", "Pulsa Probar micrófono cuando quieras intentarlo otra vez.");
      break;
    case "VOICE_ERROR":
      elements.testMicButton.disabled = false;
      setListening(false);
      await sendToPage({ type: "DENTAI_GUIDED_STOP" }).catch(() => {});
      resetGuidedState();
      setMicStatus("error", "No se pudo usar la voz", event.message || "Chrome bloqueó el micrófono.");
      setStatus(event.message || "No se pudo usar la voz.", "error");
      break;
    default:
      break;
  }
}

function updatePrivacyNote() {
  const online = elements.speechMode.value === "online";
  elements.privacyNote.classList.toggle("warning", online);
  elements.privacyNote.textContent = online
    ? "El navegador puede enviar el audio a un servicio remoto. Usa este modo solo con pacientes y datos ficticios."
    : "El modo local requiere el paquete de español de Chrome y no envía el audio a terceros.";
}

function updateCaptureMode() {
  const guided = elements.fillMode.value === "guided";
  document.body.classList.toggle("guided-mode", guided);
  elements.captureStepLabel.textContent = guided ? "Modo guiado" : "1 de 3";
  elements.captureTitle.textContent = guided ? "Control por voz" : "Dicta la atención";
  if (!state.listening) elements.micLabel.textContent = guided ? "Iniciar guía" : "Dictar";
  setMicStatus(
    "ready",
    guided ? "Listo para guía por voz" : "Listo para dictado completo",
    guided
      ? "Pulsa Iniciar guía una vez; después usa únicamente órdenes de voz."
      : "Pulsa Dictar y revisa la transcripción antes de rellenar.",
  );
  clearStatus();
}

async function inspectMicrophonePermission() {
  try {
    await sendVoiceCommand({ type: "STATUS" });
  } catch {
    // La página activa puede ser una pestaña interna de Chrome; scanPage mostrará ese estado.
  }
}

async function refreshAuditCount() {
  const stored = await chrome.storage.local.get({ dentaiAudit: [] });
  const count = Array.isArray(stored.dentaiAudit) ? stored.dentaiAudit.length : 0;
  elements.auditCount.textContent = `${count} ${count === 1 ? "operación" : "operaciones"}`;
}

async function exportAudit() {
  const stored = await chrome.storage.local.get({ dentaiAudit: [] });
  const entries = Array.isArray(stored.dentaiAudit) ? stored.dentaiAudit : [];
  if (!entries.length) {
    setStatus("Todavía no hay operaciones para exportar.", "warning");
    return;
  }
  const header = ["timestamp", "operator", "origin", "attempted", "applied", "failed", "duration_ms", "speech_mode"];
  const rows = entries.map((entry) => [
    entry.timestamp,
    entry.operator,
    entry.origin,
    entry.attempted,
    entry.applied,
    entry.failed,
    entry.durationMs,
    entry.speechMode,
  ]);
  const csv = [header, ...rows]
    .map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(","))
    .join("\n");
  const url = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `dentai-log-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
  setStatus("Registro técnico exportado. El archivo no contiene datos clínicos.");
}

async function initialize() {
  updateCaptureMode();
  updatePrivacyNote();
  const preferences = await chrome.storage.local.get({ dentaiOperator: "Profesional de prueba" });
  elements.operatorName.value = preferences.dentaiOperator;
  await Promise.all([scanPage({ announce: false }), refreshAuditCount(), inspectMicrophonePermission()]);
}

elements.micButton.addEventListener("click", startDictation);
elements.testMicButton.addEventListener("click", async () => {
  elements.testMicButton.disabled = true;
  try {
    setMicStatus("checking", "Preparando prueba", "La autorización aparecerá dentro de la página abierta.");
    await sendVoiceCommand({ type: "CHECK" });
  } catch (error) {
    elements.testMicButton.disabled = false;
    const message = error instanceof Error ? error.message : "No se pudo probar el micrófono.";
    setMicStatus("error", "Página no disponible", message);
    setStatus(message, "error");
  }
});
elements.openMicSettingsButton.addEventListener("click", () => {
  let url = "chrome://settings/content/microphone";
  try {
    const origin = state.tab?.url ? new URL(state.tab.url).origin : "";
    if (origin.startsWith("http")) {
      url = `chrome://settings/content/siteDetails?site=${encodeURIComponent(origin)}`;
    }
  } catch {
    // Conserva la página general de ajustes.
  }
  chrome.tabs.create({ url }).catch(() => {
    setStatus("Pulsa el icono a la izquierda de la dirección de la página y permite el micrófono.", "warning");
  });
});
elements.previewButton.addEventListener("click", preparePreview);
elements.rescanButton.addEventListener("click", () => scanPage());
elements.applyButton.addEventListener("click", applySuggestions);
elements.fillMode.addEventListener("change", updateCaptureMode);
elements.speechMode.addEventListener("change", updatePrivacyNote);
elements.operatorName.addEventListener("change", () => {
  chrome.storage.local.set({ dentaiOperator: elements.operatorName.value.trim() || "Profesional de prueba" });
});
elements.transcript.addEventListener("input", () => {
  state.suggestions = [];
  renderSuggestions();
  clearStatus();
});
elements.clearButton.addEventListener("click", () => {
  elements.transcript.value = "";
  state.suggestions = [];
  renderSuggestions();
  clearStatus();
});
elements.exportLogButton.addEventListener("click", exportAudit);
elements.clearLogButton.addEventListener("click", async () => {
  await chrome.storage.local.set({ dentaiAudit: [] });
  await refreshAuditCount();
  setStatus("Registro técnico borrado.");
});

chrome.tabs.onActivated.addListener(async () => {
  const previousTabId = state.tab?.id;
  if (state.listening && previousTabId) {
    await chrome.tabs.sendMessage(previousTabId, { type: "DENTAI_GUIDED_STOP" }).catch(() => {});
    await chrome.tabs.sendMessage(previousTabId, { type: "DENTAI_VOICE_COMMAND", action: { type: "STOP" } }).catch(() => {});
    setListening(false);
    resetGuidedState();
  }
  state.suggestions = [];
  renderSuggestions();
  await scanPage({ announce: false });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (tabId === state.tab?.id && changeInfo.status === "complete") {
    state.suggestions = [];
    renderSuggestions();
    scanPage({ announce: false });
  }
});

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type !== "DENTAI_VOICE_EVENT") return;
  if (state.tab?.id && sender.tab?.id !== state.tab.id) return;
  voiceEventQueue = voiceEventQueue.then(() => handleVoiceEvent(message.event)).catch((error) => {
    const text = error instanceof Error ? error.message : "No se pudo procesar la orden de voz.";
    setStatus(text, "error");
  });
});

initialize().catch((error) => {
  setConnection("blocked", "No disponible");
  setStatus(error instanceof Error ? error.message : "No se pudo iniciar DentAI.", "error");
});
