(() => {
  const FROM_EXTENSION = "DENTAI_EXTENSION_VOICE";
  const FROM_PAGE = "DENTAI_PAGE_VOICE";
  const OVERLAY_ID = "dentai-voice-permission";

  let channelId = "";
  let recognition = null;
  let pendingAction = null;
  let guidedSessionActive = false;
  let guidedMode = "local";
  let restartTimer = 0;

  function emit(type, detail = {}) {
    if (!channelId) return;
    window.postMessage({ source: FROM_PAGE, channelId, type, ...detail }, "*");
  }

  function errorMessage(error) {
    const name = error?.name || "";
    const messages = {
      NotAllowedError: "Chrome bloqueó el micrófono para esta página. Pulsa el candado junto a la dirección y cambia Micrófono a Permitir.",
      PermissionDeniedError: "Chrome bloqueó el micrófono para esta página. Pulsa el candado junto a la dirección y cambia Micrófono a Permitir.",
      NotFoundError: "No se encontró ningún micrófono. Conecta uno o habilítalo en Windows.",
      DevicesNotFoundError: "No se encontró ningún micrófono. Conecta uno o habilítalo en Windows.",
      NotReadableError: "El micrófono está ocupado o bloqueado por Windows u otra aplicación.",
      TrackStartError: "El micrófono está ocupado o bloqueado por Windows u otra aplicación.",
      SecurityError: "Chrome impidió el acceso al micrófono por una configuración de seguridad.",
    };
    return messages[name] || error?.message || "No se pudo abrir el micrófono de esta página.";
  }

  function removeOverlay() {
    document.getElementById(OVERLAY_ID)?.remove();
  }

  function showPermissionOverlay(action) {
    pendingAction = action;
    removeOverlay();

    const host = document.body || document.documentElement;
    const panel = document.createElement("aside");
    panel.id = OVERLAY_ID;
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Activar voz de DentAI");
    panel.style.cssText = [
      "position:fixed", "right:20px", "top:20px", "z-index:2147483647",
      "width:min(360px,calc(100vw - 40px))", "box-sizing:border-box",
      "padding:16px", "border:1px solid #9bc9bf", "border-radius:14px",
      "background:#f7fffc", "color:#123b35", "box-shadow:0 14px 40px rgba(8,45,39,.24)",
      "font:14px/1.4 system-ui,-apple-system,Segoe UI,sans-serif",
    ].join(";");

    const title = document.createElement("strong");
    title.textContent = "Autorizar micrófono para DentAI";
    title.style.cssText = "display:block;font-size:16px;margin-bottom:6px";
    const text = document.createElement("p");
    text.textContent = "Chrome debe conceder el permiso a esta página. Pulsa el botón y luego elige Permitir en el aviso del navegador.";
    text.style.cssText = "margin:0 0 12px";
    const allow = document.createElement("button");
    allow.type = "button";
    allow.textContent = action.type === "START_GUIDED"
      ? "Permitir e iniciar guía por voz"
      : (action.type === "START" ? "Permitir y comenzar dictado" : "Permitir y probar micrófono");
    allow.style.cssText = "border:0;border-radius:9px;padding:10px 13px;background:#087c69;color:white;font-weight:700;cursor:pointer";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Cancelar";
    cancel.style.cssText = "border:0;padding:10px;background:transparent;color:#315f58;text-decoration:underline;cursor:pointer;margin-left:6px";

    allow.addEventListener("click", async () => {
      const selected = pendingAction;
      pendingAction = null;
      removeOverlay();
      if (selected) await runAction(selected);
    });
    cancel.addEventListener("click", () => {
      pendingAction = null;
      removeOverlay();
      emit("CANCELLED");
    });
    panel.append(title, text, allow, cancel);
    host.append(panel);
    emit("PERMISSION_REQUIRED");
  }

  async function requestStream() {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Esta página no permite abrir el micrófono. Usa http://127.0.0.1 o una página HTTPS.");
    }
    return navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false,
    });
  }

  async function measureStream(stream) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return 0;
    const context = new AudioContextClass();
    await context.resume();
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);
    let peak = 0;
    const finishAt = performance.now() + 2200;

    await new Promise((resolve) => {
      const sample = () => {
        analyser.getByteTimeDomainData(samples);
        let sum = 0;
        for (const value of samples) {
          const centered = (value - 128) / 128;
          sum += centered * centered;
        }
        const rms = Math.sqrt(sum / samples.length);
        peak = Math.max(peak, rms);
        emit("MIC_LEVEL", { level: Math.min(100, Math.round(rms * 520)) });
        if (performance.now() < finishAt) requestAnimationFrame(sample);
        else resolve();
      };
      sample();
    });

    source.disconnect();
    await context.close();
    return peak;
  }

  async function testMicrophone() {
    emit("MIC_CHECKING");
    let stream;
    try {
      stream = await requestStream();
      const track = stream.getAudioTracks()[0];
      if (!track) throw new DOMException("No hay una pista de audio disponible.", "NotFoundError");
      emit("MIC_HEARING", { label: track.label || "micrófono predeterminado" });
      const peak = await measureStream(stream);
      emit(peak < 0.008 ? "MIC_SILENT" : "MIC_READY", {
        label: track.label || "micrófono predeterminado",
        level: Math.min(100, Math.round(peak * 520)),
      });
    } catch (error) {
      emit("VOICE_ERROR", { message: errorMessage(error), code: error?.name || "microphone-error" });
    } finally {
      stream?.getTracks().forEach((track) => track.stop());
    }
  }

  async function chooseRecognition(mode) {
    const Recognition = mode === "local"
      ? window.SpeechRecognition
      : (window.SpeechRecognition || window.webkitSpeechRecognition);
    if (!Recognition) {
      throw new Error(mode === "local"
        ? "El dictado local no está disponible en este Chrome. Selecciona En línea para la prueba con datos ficticios."
        : "El reconocimiento de voz no está disponible en esta versión de Chrome.");
    }

    if (mode !== "local") return { Recognition, language: "es-PE" };
    if (typeof Recognition.available !== "function" || !("processLocally" in Recognition.prototype)) {
      throw new Error("El dictado local no está disponible en este Chrome. Selecciona En línea para la prueba con datos ficticios.");
    }
    for (const language of ["es-PE", "es-ES"]) {
      const options = { langs: [language], processLocally: true };
      const availability = await Recognition.available(options);
      if (availability === "unavailable") continue;
      if (availability !== "available") {
        emit("LOCAL_INSTALLING");
        if (!await Recognition.install(options)) continue;
      }
      return { Recognition, language };
    }
    throw new Error("No hay un paquete local de español disponible. Selecciona En línea solo para esta prueba ficticia.");
  }

  async function startRecognition(mode, { guided = false, skipPermission = false } = {}) {
    let stream;
    if (!skipPermission) {
      try {
        emit("MIC_CHECKING");
        stream = await requestStream();
        const track = stream.getAudioTracks()[0];
        if (!track) throw new DOMException("No hay una pista de audio disponible.", "NotFoundError");
        emit("MIC_AUTHORIZED", { label: track.label || "micrófono predeterminado" });
      } catch (error) {
        guidedSessionActive = false;
        emit("VOICE_ERROR", { message: errorMessage(error), code: error?.name || "microphone-error" });
        return;
      } finally {
        stream?.getTracks().forEach((track) => track.stop());
      }
    }

    try {
      const { Recognition, language } = await chooseRecognition(mode);
      recognition?.abort();
      recognition = new Recognition();
      recognition.lang = language;
      recognition.continuous = guided;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      if (mode === "local") recognition.processLocally = true;
      let captured = "";
      let failed = false;

      recognition.onstart = () => emit(guided ? "GUIDED_START" : "VOICE_START", { mode });
      recognition.onaudiostart = () => emit("AUDIO_START");
      recognition.onsoundstart = () => emit("SOUND_START");
      recognition.onspeechstart = () => emit("SPEECH_START");
      recognition.onspeechend = () => emit("SPEECH_END");
      recognition.onresult = (event) => {
        if (guided) {
          for (let index = event.resultIndex; index < event.results.length; index += 1) {
            const result = event.results[index];
            const utterance = result[0]?.transcript?.trim() || "";
            if (!utterance) continue;
            emit(result.isFinal ? "GUIDED_UTTERANCE" : "GUIDED_INTERIM", { utterance });
          }
          return;
        }
        captured = [...event.results].map((result) => result[0].transcript).join(" ").trim();
        const final = [...event.results].every((result) => result.isFinal);
        emit("TRANSCRIPT", { transcript: captured, final });
      };
      recognition.onerror = (event) => {
        if (guided && event.error === "no-speech") {
          emit("GUIDED_RESTARTING", { reason: "no-speech" });
          return;
        }
        failed = true;
        if (guided) guidedSessionActive = false;
        const messages = {
          "not-allowed": "Chrome bloqueó el reconocimiento. Permite el micrófono para esta página y vuelve a intentar.",
          "service-not-allowed": "Chrome bloqueó el servicio de voz. Prueba el modo En línea con datos ficticios o reinicia Chrome.",
          "audio-capture": "Chrome no pudo capturar audio. Verifica el micrófono predeterminado de Windows.",
          "no-speech": "No se detectó voz. Acércate al micrófono e inténtalo nuevamente.",
          "language-not-supported": "Falta el paquete local de español para este dispositivo.",
          network: "No se pudo acceder al servicio de voz en línea.",
        };
        emit("VOICE_ERROR", { message: messages[event.error] || `El dictado se detuvo: ${event.error}.`, code: event.error });
      };
      recognition.onend = () => {
        recognition = null;
        if (guided && guidedSessionActive && !failed) {
          emit("GUIDED_RESTARTING", { reason: "recognition-ended" });
          window.clearTimeout(restartTimer);
          restartTimer = window.setTimeout(() => {
            startRecognition(guidedMode, { guided: true, skipPermission: true });
          }, 350);
          return;
        }
        emit(guided ? "GUIDED_END" : "VOICE_END", { transcript: captured, failed });
      };
      recognition.start();
    } catch (error) {
      recognition = null;
      if (guided) guidedSessionActive = false;
      emit("VOICE_ERROR", { message: errorMessage(error), code: error?.name || "recognition-error" });
    }
  }

  async function permissionState() {
    try {
      return (await navigator.permissions.query({ name: "microphone" })).state;
    } catch {
      return "prompt";
    }
  }

  async function runAction(action) {
    if (action.type === "CHECK") await testMicrophone();
    if (action.type === "START") {
      guidedSessionActive = false;
      await startRecognition(action.mode);
    }
    if (action.type === "START_GUIDED") {
      guidedSessionActive = true;
      guidedMode = action.mode || "local";
      await startRecognition(guidedMode, { guided: true });
    }
  }

  async function handleCommand(action) {
    if (action.type === "STOP") {
      guidedSessionActive = false;
      window.clearTimeout(restartTimer);
      recognition?.stop();
      removeOverlay();
      return;
    }
    if (action.type === "STATUS") {
      emit("PERMISSION_STATE", { state: await permissionState() });
      return;
    }
    if (!document.body) {
      window.addEventListener("DOMContentLoaded", () => handleCommand(action), { once: true });
      return;
    }
    const state = await permissionState();
    if (state === "granted") await runAction(action);
    else showPermissionOverlay(action);
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.data?.source !== FROM_EXTENSION) return;
    if (event.data.type === "INIT") {
      channelId = String(event.data.channelId || "");
      emit("BRIDGE_READY");
      return;
    }
    if (!channelId || event.data.channelId !== channelId || event.data.type !== "COMMAND") return;
    handleCommand(event.data.action || {}).catch((error) => {
      emit("VOICE_ERROR", { message: errorMessage(error), code: "bridge-error" });
    });
  });
})();
