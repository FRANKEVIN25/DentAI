(() => {
  const fieldRegistry = new Map();
  const voiceChannelId = crypto.randomUUID();
  const GUIDED_STATUS_ID = "dentai-guided-status";
  let scanSequence = 0;
  let guidedHighlight = null;

  function initializeVoiceBridge() {
    window.postMessage({
      source: "DENTAI_EXTENSION_VOICE",
      type: "INIT",
      channelId: voiceChannelId,
    }, "*");
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window
      || event.data?.source !== "DENTAI_PAGE_VOICE"
      || event.data.channelId !== voiceChannelId) return;
    chrome.runtime.sendMessage({
      type: "DENTAI_VOICE_EVENT",
      event: { ...event.data, source: undefined, channelId: undefined },
    }).catch(() => {
      // El panel puede estar cerrado; el permiso de la página se conserva igualmente.
    });
  });

  initializeVoiceBridge();
  window.setTimeout(initializeVoiceBridge, 500);
  window.setTimeout(initializeVoiceBridge, 1500);

  const EDITABLE_SELECTOR = [
    "input:not([type])",
    "input[type='text']",
    "input[type='search']",
    "input[type='email']",
    "input[type='tel']",
    "input[type='number']",
    "input[type='date']",
    "textarea",
    "select",
    "[contenteditable='true']",
    "[role='textbox']",
    "[role='combobox']",
  ].join(",");

  function isVisible(element) {
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return !element.disabled
      && style.display !== "none"
      && style.visibility !== "hidden"
      && Number(style.opacity) !== 0
      && rect.width > 0
      && rect.height > 0;
  }

  function cleanText(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  function labelFor(element) {
    const aria = cleanText(element.getAttribute("aria-label"));
    if (aria) return aria;

    const labelledBy = cleanText(element.getAttribute("aria-labelledby"));
    if (labelledBy) {
      const text = labelledBy
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent)
        .filter(Boolean)
        .join(" ");
      if (cleanText(text)) return cleanText(text);
    }

    if (element.labels?.length) {
      const text = [...element.labels].map((label) => label.textContent).join(" ");
      if (cleanText(text)) return cleanText(text);
    }

    const wrappingLabel = element.closest("label");
    if (wrappingLabel && cleanText(wrappingLabel.textContent)) return cleanText(wrappingLabel.textContent);

    const parent = element.parentElement;
    if (parent) {
      const nearby = parent.querySelector(":scope > label, :scope > legend, :scope > [data-label], :scope > [class*='label']");
      if (nearby && nearby !== element && cleanText(nearby.textContent)) return cleanText(nearby.textContent);
    }

    return cleanText(element.getAttribute("placeholder"))
      || cleanText(element.getAttribute("name"))
      || cleanText(element.id)
      || "Campo sin etiqueta";
  }

  function typeFor(element) {
    if (element instanceof HTMLSelectElement) return "select";
    if (element instanceof HTMLTextAreaElement) return "textarea";
    if (element instanceof HTMLInputElement) return element.type || "text";
    return element.getAttribute("role") === "combobox" ? "combobox" : "contenteditable";
  }

  function scanFields() {
    scanSequence += 1;
    fieldRegistry.clear();
    const seen = new Set();
    const fields = [];

    for (const element of document.querySelectorAll(EDITABLE_SELECTOR)) {
      if (seen.has(element) || !isVisible(element)) continue;
      seen.add(element);
      const type = typeFor(element);
      if (["password", "hidden", "checkbox", "radio", "file"].includes(type)) continue;

      const fieldId = `dentai-${scanSequence}-${fields.length + 1}`;
      fieldRegistry.set(fieldId, element);
      fields.push({
        fieldId,
        label: labelFor(element),
        type,
        name: cleanText(element.getAttribute("name")),
        idAttribute: cleanText(element.id),
        placeholder: cleanText(element.getAttribute("placeholder")),
        ariaLabel: cleanText(element.getAttribute("aria-label")),
        autocomplete: cleanText(element.getAttribute("autocomplete")),
        currentValue: cleanText(element.value ?? element.textContent),
        options: element instanceof HTMLSelectElement
          ? [...element.options].map((option) => ({ label: cleanText(option.textContent), value: option.value }))
          : [],
      });
    }
    return fields;
  }

  function setNativeValue(element, value) {
    if (element instanceof HTMLSelectElement) {
      const normalized = value.toLocaleLowerCase("es").trim();
      const option = [...element.options].find((candidate) =>
        candidate.value.toLocaleLowerCase("es").trim() === normalized
        || cleanText(candidate.textContent).toLocaleLowerCase("es") === normalized);
      if (!option) throw new Error("La opción dictada no existe en la lista.");
      element.value = option.value;
    } else if (element instanceof HTMLInputElement) {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter ? setter.call(element, value) : (element.value = value);
    } else if (element instanceof HTMLTextAreaElement) {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
      setter ? setter.call(element, value) : (element.value = value);
    } else {
      element.focus();
      element.textContent = value;
    }

    element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    element.dispatchEvent(new Event("blur", { bubbles: true }));
  }

  function markFilled(element) {
    const previousOutline = element.style.outline;
    const previousOffset = element.style.outlineOffset;
    element.style.outline = "3px solid #0b7b69";
    element.style.outlineOffset = "2px";
    window.setTimeout(() => {
      element.style.outline = previousOutline;
      element.style.outlineOffset = previousOffset;
    }, 2400);
  }

  function clearGuidedHighlight() {
    if (!guidedHighlight) return;
    const { element, outline, outlineOffset, boxShadow } = guidedHighlight;
    if (element?.isConnected) {
      element.style.outline = outline;
      element.style.outlineOffset = outlineOffset;
      element.style.boxShadow = boxShadow;
    }
    guidedHighlight = null;
  }

  function focusGuidedField(fieldId) {
    const element = fieldRegistry.get(fieldId);
    if (!element || !element.isConnected) return { ok: false, reason: "El campo cambió o ya no existe." };
    clearGuidedHighlight();
    guidedHighlight = {
      element,
      outline: element.style.outline,
      outlineOffset: element.style.outlineOffset,
      boxShadow: element.style.boxShadow,
    };
    element.style.outline = "4px solid #087765";
    element.style.outlineOffset = "3px";
    element.style.boxShadow = "0 0 0 7px rgba(8,119,101,.14)";
    element.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => element.focus({ preventScroll: true }), 350);
    return { ok: true };
  }

  function showGuidedStatus({ title, detail, state = "listening" } = {}) {
    let panel = document.getElementById(GUIDED_STATUS_ID);
    if (!panel) {
      panel = document.createElement("aside");
      panel.id = GUIDED_STATUS_ID;
      panel.setAttribute("role", "status");
      panel.setAttribute("aria-live", "polite");
      panel.style.cssText = [
        "position:fixed", "left:20px", "bottom:20px", "z-index:2147483646",
        "width:min(430px,calc(100vw - 40px))", "box-sizing:border-box",
        "padding:14px 16px", "border:2px solid #69aa9d", "border-radius:12px",
        "background:#f7fffc", "color:#123b35", "box-shadow:0 14px 40px rgba(8,45,39,.22)",
        "font:14px/1.4 system-ui,-apple-system,Segoe UI,sans-serif",
      ].join(";");
      const heading = document.createElement("strong");
      heading.dataset.dentaiRole = "title";
      heading.style.cssText = "display:block;font-size:15px;margin-bottom:4px";
      const copy = document.createElement("span");
      copy.dataset.dentaiRole = "detail";
      copy.style.cssText = "display:block;color:#3e625c";
      panel.append(heading, copy);
      (document.body || document.documentElement).append(panel);
    }
    const colors = {
      listening: ["#69aa9d", "#f7fffc"],
      confirm: ["#d09432", "#fff8e9"],
      success: ["#087765", "#e7f6f1"],
      error: ["#b14a4a", "#fff0f0"],
    };
    const [border, background] = colors[state] || colors.listening;
    panel.style.borderColor = border;
    panel.style.background = background;
    panel.querySelector("[data-dentai-role='title']").textContent = title || "DentAI está escuchando";
    panel.querySelector("[data-dentai-role='detail']").textContent = detail || "Di el nombre de un campo.";
  }

  function stopGuidedUi() {
    clearGuidedHighlight();
    document.getElementById(GUIDED_STATUS_ID)?.remove();
  }

  function applyFields(items) {
    const applied = [];
    const failed = [];
    for (const item of items) {
      const element = fieldRegistry.get(item.fieldId);
      if (!element || !element.isConnected) {
        failed.push({ fieldId: item.fieldId, label: item.label, reason: "El campo cambió o ya no existe." });
        continue;
      }
      try {
        setNativeValue(element, String(item.value ?? ""));
        markFilled(element);
        applied.push({ fieldId: item.fieldId, label: item.label });
      } catch (error) {
        failed.push({
          fieldId: item.fieldId,
          label: item.label,
          reason: error instanceof Error ? error.message : "No se pudo completar el campo.",
        });
      }
    }
    return { applied, failed };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "DENTAI_PING") {
      sendResponse({ ok: true, url: location.href });
      return;
    }
    if (message?.type === "DENTAI_SCAN_FIELDS") {
      sendResponse({ ok: true, fields: scanFields(), url: location.href, title: document.title });
      return;
    }
    if (message?.type === "DENTAI_APPLY_FIELDS") {
      sendResponse({ ok: true, ...applyFields(Array.isArray(message.items) ? message.items : []) });
      return;
    }
    if (message?.type === "DENTAI_GUIDED_FOCUS") {
      sendResponse(focusGuidedField(message.fieldId));
      return;
    }
    if (message?.type === "DENTAI_GUIDED_UI") {
      showGuidedStatus(message.payload || {});
      sendResponse({ ok: true });
      return;
    }
    if (message?.type === "DENTAI_GUIDED_STOP") {
      stopGuidedUi();
      sendResponse({ ok: true });
      return;
    }
    if (message?.type === "DENTAI_VOICE_COMMAND") {
      window.postMessage({
        source: "DENTAI_EXTENSION_VOICE",
        type: "COMMAND",
        channelId: voiceChannelId,
        action: message.action,
      }, "*");
      sendResponse({ ok: true });
    }
  });
})();
