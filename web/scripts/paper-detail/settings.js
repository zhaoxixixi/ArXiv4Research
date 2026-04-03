(() => {
  const ARA = (window.ARA = window.ARA || {});
  const paperDetail = (ARA.paperDetail = ARA.paperDetail || {});
  const { DEFAULT_MODEL, DEFAULT_RESEARCH_CONTEXT, SETTINGS_KEYS } = ARA.shared.constants;

  const storageForMode = (mode) => (mode === "session" ? sessionStorage : localStorage);
  const getStorageMode = () => localStorage.getItem(SETTINGS_KEYS.storageMode) || "local";

  const getSetting = (key, fallback = "") => {
    const fromSession = sessionStorage.getItem(key);
    if (fromSession !== null) return fromSession;
    const fromLocal = localStorage.getItem(key);
    return fromLocal !== null ? fromLocal : fallback;
  };

  const setSetting = (key, value, mode) => {
    sessionStorage.removeItem(key);
    localStorage.removeItem(key);
    if (value) storageForMode(mode).setItem(key, value);
  };

  const getLocalSettings = () => ({
    baseUrl: getSetting(SETTINGS_KEYS.baseUrl, ""),
    apiKey: getSetting(SETTINGS_KEYS.apiKey, ""),
    model: getSetting(SETTINGS_KEYS.model, DEFAULT_MODEL),
    storageMode: getStorageMode(),
    researchContext: getSetting(SETTINGS_KEYS.researchContext, DEFAULT_RESEARCH_CONTEXT),
  });

  const hasLocalAiConfig = () => {
    const settings = getLocalSettings();
    return Boolean(settings.baseUrl && settings.apiKey && settings.model);
  };

  const loadSettingsIntoDialog = (dialog) => {
    if (!dialog) return;
    const settings = getLocalSettings();
    const map = {
      "#api-base-url": settings.baseUrl,
      "#api-key": settings.apiKey,
      "#api-model": settings.model || DEFAULT_MODEL,
      "#storage-mode": settings.storageMode,
      "#research-context": settings.researchContext || DEFAULT_RESEARCH_CONTEXT,
    };
    Object.entries(map).forEach(([selector, value]) => {
      const field = dialog.querySelector(selector);
      if (field) field.value = value;
    });
  };

  const saveSettingsFromDialog = (dialog) => {
    if (!dialog) return;
    const mode = dialog.querySelector("#storage-mode")?.value || "local";
    localStorage.setItem(SETTINGS_KEYS.storageMode, mode);
    setSetting(SETTINGS_KEYS.baseUrl, dialog.querySelector("#api-base-url")?.value.trim() || "", mode);
    setSetting(SETTINGS_KEYS.apiKey, dialog.querySelector("#api-key")?.value.trim() || "", mode);
    setSetting(SETTINGS_KEYS.model, dialog.querySelector("#api-model")?.value.trim() || DEFAULT_MODEL, mode);
    setSetting(SETTINGS_KEYS.researchContext, dialog.querySelector("#research-context")?.value.trim() || DEFAULT_RESEARCH_CONTEXT, mode);
  };

  const clearLocalSettings = () => Object.values(SETTINGS_KEYS).forEach((key) => [localStorage, sessionStorage].forEach((storage) => storage.removeItem(key)));

  paperDetail.settings = {
    storageForMode,
    getStorageMode,
    getLocalSettings,
    hasLocalAiConfig,
    loadSettingsIntoDialog,
    saveSettingsFromDialog,
    clearLocalSettings,
  };
})();
