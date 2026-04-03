(() => {
  const ARA = (window.ARA = window.ARA || {});
  const paperDetail = (ARA.paperDetail = ARA.paperDetail || {});
  const { DEFAULT_RESEARCH_CONTEXT } = ARA.shared.constants;

  const ensureLocalAiReady = (showSettings = () => {}) => {
    if (paperDetail.settings.hasLocalAiConfig()) return paperDetail.settings.getLocalSettings();
    showSettings();
    throw new Error("Please add your API settings first.");
  };

  const generatePersonalSpark = async ({ paper, getScopeCacheKey, showSettings = () => {} }) => {
    const settings = ensureLocalAiReady(showSettings);
    const aiSection = paperDetail.language.getAiSection(paper.ai || {}, paperDetail.language.getPreferredAiLanguage());
    const raw = await paperDetail.aiClient.requestLocalCompletion(settings, paperDetail.aiClient.buildSparkPrompt({ paper, settings, aiSection }), 0.35);
    const parsed = paperDetail.aiClient.parseJsonOrNull(raw);
    const payload = {
      cache_type: "personal_spark",
      created_at: new Date().toISOString(),
      model: settings.model,
      research_context_hash: paperDetail.cache.hashString(settings.researchContext || DEFAULT_RESEARCH_CONTEXT),
      content: parsed
        ? {
            fit: parsed.fit || "",
            idea: parsed.idea || "",
            experiments: Array.isArray(parsed.experiments) ? parsed.experiments : parsed.experiments ? [String(parsed.experiments)] : [],
            risk: parsed.risk || "",
            next_step: parsed.next_step || "",
          }
        : { raw_response: raw || "No model output." },
    };
    paperDetail.cache.saveCache("personal_spark", getScopeCacheKey(), paper.id, `${payload.model}:${payload.research_context_hash}`, payload);
    return payload;
  };

  const askFollowup = async ({ paper, question, getScopeCacheKey, showSettings = () => {} }) => {
    const settings = ensureLocalAiReady(showSettings);
    const aiSection = paperDetail.language.getAiSection(paper.ai || {}, paperDetail.language.getPreferredAiLanguage());
    const personalSpark = paperDetail.cache.getLatestCache("personal_spark", getScopeCacheKey(), paper.id);
    const personalSparkText = personalSpark ? paperDetail.aiClient.formatPersonalSpark(personalSpark) : "Not available";
    return (
      (await paperDetail.aiClient.requestLocalCompletion(
        settings,
        paperDetail.aiClient.buildFollowupPrompt({ paper, question, settings, aiSection, personalSparkText }),
        0.3,
      )) || "No response."
    );
  };

  paperDetail.actions = { ensureLocalAiReady, generatePersonalSpark, askFollowup };
})();
