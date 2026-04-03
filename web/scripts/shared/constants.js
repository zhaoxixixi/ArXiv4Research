(() => {
  const ARA = (window.ARA = window.ARA || {});
  const shared = (ARA.shared = ARA.shared || {});

  shared.constants = {
    DOMAIN_META: {
      all: { label: "全部" },
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
      lavender: { label: "天空蓝", description: "参考站点风格，轻盈、明亮、适合日常浏览。" },
      pearl: { label: "浅紫科技", description: "更纯净的浅色背景，适合白天阅读。" },
      sage: { label: "鼠尾草", description: "轻微绿灰调，更安静克制。" },
      graphite: { label: "石墨夜色", description: "低刺激夜间模式。" },
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
      { label: "适配 SSA/CME？", text: "这篇文章的方法能否适配 SSA/CME 场景？最需要修改哪些组件？" },
      { label: "作为 baseline？", text: "如果把这篇论文作为我当前方向的 baseline，需要额外补哪些评测指标和实验设置？" },
      { label: "实验下一步？", text: "如果我想把这篇论文转化成下周可以执行的小实验，你建议我先做哪三步？" },
    ],
  };
})();
