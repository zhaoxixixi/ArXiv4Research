(() => {
  const ARA = (window.ARA = window.ARA || {});
  const shared = (ARA.shared = ARA.shared || {});

  shared.constants = {
    DOMAIN_META: {
      all: { label: "All" },
      biology: { label: "biology" },
      ai4science: { label: "ai4science" },
      "math-physics": { label: "math-physics" },
      llm: { label: "llm" },
      cv: { label: "cv" },
      general: { label: "general" },
    },
    DEFAULT_DOMAIN_ORDER: ["all", "biology", "ai4science", "math-physics", "llm", "cv"],
    THEME_STORAGE_KEY: "ara_theme",
    DEFAULT_THEME: "lavender",
    THEMES: {
      lavender: { label: "Sky Blue", description: "Light, bright, and easy to scan." },
      pearl: { label: "Soft Violet", description: "Clean light mode with a violet accent." },
      sage: { label: "Sage", description: "Quiet green-gray tones for long reading." },
      graphite: { label: "Graphite Night", description: "Low-stimulation dark mode." },
    },
    SETTINGS_KEYS: {
      baseUrl: "hybrid_api_base_url",
      apiKey: "hybrid_api_key",
      model: "hybrid_api_model",
      storageMode: "hybrid_storage_mode",
      researchContext: "hybrid_research_context",
    },
    CACHE_PREFIX: "ara_cache",
    AI_LANGUAGE_STORAGE_KEY: "ara_ai_language",
    DEFAULT_AI_LANGUAGE: "zh",
    DEFAULT_MODEL: "deepseek-chat",
    DEFAULT_RESEARCH_CONTEXT:
      "Biology x Computer Science research focus, especially computational biology, single-cell, surrogate modeling, trajectory prediction, SSA/CME, stochastic simulation, and flow matching.",
    PRESET_QUESTIONS: [
      { label: "Fit SSA/CME?", text: "Can this method be adapted to SSA/CME settings? Which components would need the biggest changes?" },
      { label: "Use as baseline?", text: "If I use this paper as a baseline for my direction, which metrics and experiments should I add first?" },
      { label: "Next experiment?", text: "If I want to turn this paper into a small experiment for next week, what three steps should I start with?" },
    ],
  };
})();
