(() => {
  const ARA = (window.ARA = window.ARA || {});
  const paperDetail = (ARA.paperDetail = ARA.paperDetail || {});
  const { AI_LANGUAGE_STORAGE_KEY, DEFAULT_AI_LANGUAGE } = ARA.shared.constants;
  const { escapeHtml } = ARA.shared.utils;

  const AI_LANGUAGE_META = {
    zh: {
      label: "中文",
      hint: "当前日报已保存中文与英文内容，可一键切换查看。",
      fallbackHint: "当前数据可能只有单语内容；切换后会自动回退到可用版本。",
      sectionTitle: "内容语言",
    },
    en: {
      label: "English",
      hint: "The report stores both Chinese and English analysis for quick switching.",
      fallbackHint: "This item may only contain one language; the view will fall back automatically.",
      sectionTitle: "Analysis Language",
    },
  };

  const emptyAiSection = () => ({
    tldr: "",
    motivation: "",
    method: "",
    result: "",
    help_to_user: "",
    idea_spark: { transferable: false, idea: "", risk: "", inspiration: "" },
  });

  const normalizeAiSection = (section = {}) => {
    const idea = section.idea_spark || {};
    return {
      ...emptyAiSection(),
      tldr: section.tldr || "",
      motivation: section.motivation || "",
      method: section.method || "",
      result: section.result || "",
      help_to_user: section.help_to_user || "",
      idea_spark: {
        transferable: Boolean(idea.transferable),
        idea: idea.idea || "",
        risk: idea.risk || "",
        inspiration: idea.inspiration || "",
      },
    };
  };

  const aiSectionHasContent = (section = {}) => {
    const normalized = normalizeAiSection(section);
    return Boolean(
      normalized.tldr ||
        normalized.motivation ||
        normalized.method ||
        normalized.result ||
        normalized.help_to_user ||
        normalized.idea_spark.idea ||
        normalized.idea_spark.risk ||
        normalized.idea_spark.inspiration,
    );
  };

  const getAiSection = (ai = {}, language = DEFAULT_AI_LANGUAGE) => {
    const bilingual = ai?.bilingual || {};
    const preferred = normalizeAiSection(bilingual?.[language] || {});
    if (aiSectionHasContent(preferred)) return preferred;
    const topLevel = normalizeAiSection(ai || {});
    if (aiSectionHasContent(topLevel)) return topLevel;
    const alternate = normalizeAiSection(bilingual?.[language === "zh" ? "en" : "zh"] || {});
    return aiSectionHasContent(alternate) ? alternate : topLevel;
  };

  const hasSavedBilingualAi = (ai = {}) => {
    const bilingual = ai?.bilingual || {};
    return aiSectionHasContent(bilingual?.zh || {}) && aiSectionHasContent(bilingual?.en || {});
  };

  const getAiLanguageMeta = (language = DEFAULT_AI_LANGUAGE) => AI_LANGUAGE_META[language] || AI_LANGUAGE_META[DEFAULT_AI_LANGUAGE];
  const getPreferredAiLanguage = () => {
    const saved = localStorage.getItem(AI_LANGUAGE_STORAGE_KEY);
    return AI_LANGUAGE_META[saved] ? saved : DEFAULT_AI_LANGUAGE;
  };
  const setPreferredAiLanguage = (language) => localStorage.setItem(AI_LANGUAGE_STORAGE_KEY, AI_LANGUAGE_META[language] ? language : DEFAULT_AI_LANGUAGE);

  const renderLanguageToggle = (ai = {}, language = DEFAULT_AI_LANGUAGE) => {
    const meta = getAiLanguageMeta(language);
    const bilingualSaved = hasSavedBilingualAi(ai);
    return `
      <section class="detail-section detail-language-switch">
        <div class="section-head">
          <strong>${escapeHtml(meta.sectionTitle)}</strong>
          <span class="mini-hint">${escapeHtml(bilingualSaved ? meta.hint : meta.fallbackHint)}</span>
        </div>
        <div class="language-toggle-group" role="group" aria-label="${escapeHtml(meta.sectionTitle)}">
          ${Object.entries(AI_LANGUAGE_META)
            .map(
              ([key, item]) => `
                <button type="button" class="language-toggle-btn${key === language ? " active" : ""}" data-language="${escapeHtml(key)}" aria-pressed="${key === language ? "true" : "false"}">
                  ${escapeHtml(item.label)}
                </button>
              `,
            )
            .join("")}
        </div>
      </section>
    `;
  };

  paperDetail.language = {
    AI_LANGUAGE_META,
    DEFAULT_AI_LANGUAGE,
    emptyAiSection,
    normalizeAiSection,
    aiSectionHasContent,
    getAiSection,
    hasSavedBilingualAi,
    getAiLanguageMeta,
    getPreferredAiLanguage,
    setPreferredAiLanguage,
    renderLanguageToggle,
  };
})();
