chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error("No se pudo configurar el panel lateral de DentAI.", error));

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    dentaiVersion: chrome.runtime.getManifest().version,
  });
});
