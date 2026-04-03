(() => {
  const ARA = (window.ARA = window.ARA || {});
  const paperDetail = (ARA.paperDetail = ARA.paperDetail || {});

  paperDetail.createController = paperDetail.modal.createController;
  paperDetail.utils = {
    ...ARA.shared.utils,
    ...paperDetail.language,
    getLocalSettings: paperDetail.settings.getLocalSettings,
    hasLocalAiConfig: paperDetail.settings.hasLocalAiConfig,
    loadSettingsIntoDialog: paperDetail.settings.loadSettingsIntoDialog,
    saveSettingsFromDialog: paperDetail.settings.saveSettingsFromDialog,
    clearLocalSettings: paperDetail.settings.clearLocalSettings,
    formatPersonalSpark: paperDetail.aiClient.formatPersonalSpark,
  };
  paperDetail.constants = {
    DEFAULT_AI_LANGUAGE: paperDetail.language.DEFAULT_AI_LANGUAGE,
    DEFAULT_MODEL: ARA.shared.constants.DEFAULT_MODEL,
    DEFAULT_RESEARCH_CONTEXT: ARA.shared.constants.DEFAULT_RESEARCH_CONTEXT,
    AI_LANGUAGE_META: paperDetail.language.AI_LANGUAGE_META,
  };

  window.PaperDetailShared = paperDetail;
})();
