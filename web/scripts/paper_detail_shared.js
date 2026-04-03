(() => {
  const SETTINGS_KEYS = {
    baseUrl: "hybrid_api_base_url",
    apiKey: "hybrid_api_key",
    model: "hybrid_api_model",
    storageMode: "hybrid_storage_mode",
    researchContext: "hybrid_research_context",
  };

  const CACHE_PREFIX = "ara_cache";
  const AI_LANGUAGE_STORAGE_KEY = "ara_ai_language";
  const DEFAULT_AI_LANGUAGE = "zh";
  const DEFAULT_MODEL = "deepseek-chat";
  const DEFAULT_RESEARCH_CONTEXT =
    "Biology x Computer Science research focus, especially computational biology, single-cell, surrogate modeling, trajectory prediction, SSA/CME, stochastic simulation, and flow matching.";

  const PRESET_QUESTIONS = [
    {
      label: "适配 SSA/CME？",
      text: "这篇文章的方法能否适配 SSA/CME 场景？最需要修改哪些组件？",
    },
    {
      label: "作为 baseline？",
      text: "如果把这篇论文作为我当前方向的 baseline，需要额外补哪些评测指标和实验设置？",
    },
    {
      label: "实验下一步？",
      text: "如果我想把这篇论文转化成下周可以执行的小实验，你建议我先做哪三步？",
    },
  ];

  const AI_LANGUAGE_META = {
    zh: {
      label: "中文",
      hint: "当前日报已保存中文与英文内容，可一键切换查看。",
      fallbackHint: "当前数据可能只有单语内容；切换后会自动回退到可用版本。",
      sectionTitle: "内容语言",
      tldr: "中文 TL;DR",
      motivation: "动机",
      method: "方法",
      result: "结果",
      help: "对你研究的帮助",
      spark: "日报 Spark",
      sparkRisk: "日报 Spark 风险",
      sparkInspiration: "日报 Spark 启发",
    },
    en: {
      label: "English",
      hint: "The report stores both Chinese and English analysis for quick switching.",
      fallbackHint: "This item may only contain one language; the view will fall back automatically.",
      sectionTitle: "Analysis Language",
      tldr: "TL;DR",
      motivation: "Motivation",
      method: "Method",
      result: "Result",
      help: "Help for Your Research",
      spark: "Daily Spark",
      sparkRisk: "Spark Risk",
      sparkInspiration: "Spark Inspiration",
    },
  };

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function formatPublished(value) {
    if (!value) return "未知";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  }

  function derivePdfUrl(link) {
    if (!link) return "#";
    const replaced = link.replace("/abs/", "/pdf/");
    return replaced.endsWith(".pdf") ? replaced : `${replaced}.pdf`;
  }

  function deriveHtmlUrl(link) {
    if (!link) return "#";
    return link.replace("/abs/", "/html/");
  }

  function findPrimaryCodeLink(code = {}) {
    return code.github?.[0] || code.huggingface?.[0] || code.colab?.[0] || "";
  }

  function getDisplayKeywords(ai = {}, maxCount = 6) {
    const normalized = Array.isArray(ai?.keywords_normalized) ? ai.keywords_normalized : [];
    const raw = Array.isArray(ai?.keywords_raw) ? ai.keywords_raw : [];
    const preferred = normalized.length ? normalized : raw;
    if (!preferred.length) return "";
    return preferred.slice(0, maxCount).join("；");
  }

  function emptyAiSection() {
    return {
      tldr: "",
      motivation: "",
      method: "",
      result: "",
      help_to_user: "",
      idea_spark: {
        transferable: false,
        idea: "",
        risk: "",
        inspiration: "",
      },
    };
  }

  function normalizeAiSection(section = {}) {
    const base = emptyAiSection();
    const idea = section.idea_spark || {};
    return {
      ...base,
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
  }

  function aiSectionHasContent(section = {}) {
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
  }

  function getAiSection(ai = {}, language = DEFAULT_AI_LANGUAGE) {
    const bilingual = ai?.bilingual || {};
    const preferred = normalizeAiSection(bilingual?.[language] || {});
    if (aiSectionHasContent(preferred)) return preferred;

    const fallbackTopLevel = normalizeAiSection(ai || {});
    if (aiSectionHasContent(fallbackTopLevel)) return fallbackTopLevel;

    const alternateLanguage = language === "zh" ? "en" : "zh";
    const alternate = normalizeAiSection(bilingual?.[alternateLanguage] || {});
    if (aiSectionHasContent(alternate)) return alternate;

    return fallbackTopLevel;
  }

  function hasSavedBilingualAi(ai = {}) {
    const bilingual = ai?.bilingual || {};
    return aiSectionHasContent(bilingual?.zh || {}) && aiSectionHasContent(bilingual?.en || {});
  }

  function getAiLanguageMeta(language = DEFAULT_AI_LANGUAGE) {
    return AI_LANGUAGE_META[language] || AI_LANGUAGE_META[DEFAULT_AI_LANGUAGE];
  }

  function getPreferredAiLanguage() {
    const saved = localStorage.getItem(AI_LANGUAGE_STORAGE_KEY);
    return AI_LANGUAGE_META[saved] ? saved : DEFAULT_AI_LANGUAGE;
  }

  function setPreferredAiLanguage(language) {
    const resolved = AI_LANGUAGE_META[language] ? language : DEFAULT_AI_LANGUAGE;
    localStorage.setItem(AI_LANGUAGE_STORAGE_KEY, resolved);
  }

  function isPointInsideRect(x, y, rect) {
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }

  function resolveDialogPanel(dialog) {
    return dialog?.querySelector(".dialog-panel") || dialog?.querySelector(".panel") || dialog?.firstElementChild || null;
  }

  function enableDialogOutsideClose(dialog) {
    if (!dialog || dialog.dataset.outsideCloseBound === "true") return;
    dialog.dataset.outsideCloseBound = "true";

    let pointerStartedOutside = false;

    dialog.addEventListener("pointerdown", (event) => {
      if (!dialog.open) return;
      const panel = resolveDialogPanel(dialog);
      if (!panel) return;
      pointerStartedOutside = !isPointInsideRect(event.clientX, event.clientY, panel.getBoundingClientRect());
    });

    dialog.addEventListener("click", (event) => {
      if (!dialog.open) return;
      const panel = resolveDialogPanel(dialog);
      if (!panel) return;

      if (panel.contains(event.target)) {
        pointerStartedOutside = false;
        return;
      }

      const clickedOutside = !isPointInsideRect(event.clientX, event.clientY, panel.getBoundingClientRect());
      if (pointerStartedOutside && clickedOutside) {
        dialog.close();
      }
      pointerStartedOutside = false;
    });

    dialog.addEventListener("close", () => {
      pointerStartedOutside = false;
    });
  }

  function getStorageMode() {
    return localStorage.getItem(SETTINGS_KEYS.storageMode) || "local";
  }

  function storageForMode(mode) {
    return mode === "session" ? sessionStorage : localStorage;
  }

  function getSetting(key, fallback = "") {
    const fromSession = sessionStorage.getItem(key);
    if (fromSession !== null) return fromSession;
    const fromLocal = localStorage.getItem(key);
    if (fromLocal !== null) return fromLocal;
    return fallback;
  }

  function setSetting(key, value, mode) {
    sessionStorage.removeItem(key);
    localStorage.removeItem(key);
    if (value) storageForMode(mode).setItem(key, value);
  }

  function getLocalSettings() {
    return {
      baseUrl: getSetting(SETTINGS_KEYS.baseUrl, ""),
      apiKey: getSetting(SETTINGS_KEYS.apiKey, ""),
      model: getSetting(SETTINGS_KEYS.model, DEFAULT_MODEL),
      storageMode: getStorageMode(),
      researchContext: getSetting(SETTINGS_KEYS.researchContext, DEFAULT_RESEARCH_CONTEXT),
    };
  }

  function hasLocalAiConfig() {
    const settings = getLocalSettings();
    return Boolean(settings.baseUrl && settings.apiKey && settings.model);
  }

  function loadSettingsIntoDialog(dialog) {
    if (!dialog) return;
    const settings = getLocalSettings();
    const baseUrlInput = dialog.querySelector("#api-base-url");
    const apiKeyInput = dialog.querySelector("#api-key");
    const modelInput = dialog.querySelector("#api-model");
    const storageModeInput = dialog.querySelector("#storage-mode");
    const researchContextInput = dialog.querySelector("#research-context");

    if (baseUrlInput) baseUrlInput.value = settings.baseUrl;
    if (apiKeyInput) apiKeyInput.value = settings.apiKey;
    if (modelInput) modelInput.value = settings.model || DEFAULT_MODEL;
    if (storageModeInput) storageModeInput.value = settings.storageMode;
    if (researchContextInput) researchContextInput.value = settings.researchContext || DEFAULT_RESEARCH_CONTEXT;
  }

  function saveSettingsFromDialog(dialog) {
    if (!dialog) return;
    const mode = dialog.querySelector("#storage-mode")?.value || "local";
    localStorage.setItem(SETTINGS_KEYS.storageMode, mode);
    setSetting(SETTINGS_KEYS.baseUrl, dialog.querySelector("#api-base-url")?.value.trim() || "", mode);
    setSetting(SETTINGS_KEYS.apiKey, dialog.querySelector("#api-key")?.value.trim() || "", mode);
    setSetting(SETTINGS_KEYS.model, dialog.querySelector("#api-model")?.value.trim() || DEFAULT_MODEL, mode);
    setSetting(
      SETTINGS_KEYS.researchContext,
      dialog.querySelector("#research-context")?.value.trim() || DEFAULT_RESEARCH_CONTEXT,
      mode,
    );
  }

  function clearLocalSettings() {
    Object.values(SETTINGS_KEYS).forEach((key) => {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    });
  }

  function hashString(input) {
    let hash = 0;
    const value = input || "";
    for (let i = 0; i < value.length; i += 1) {
      hash = (hash << 5) - hash + value.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(36);
  }

  function getCachePrefix(type, date, paperId) {
    return `${CACHE_PREFIX}:${type}:${date}:${paperId}:`;
  }

  function getCacheKey(type, date, paperId, variant) {
    return `${getCachePrefix(type, date, paperId)}${variant}`;
  }

  function getAllStorages() {
    return [localStorage, sessionStorage];
  }

  function getLatestCache(type, date, paperId) {
    const prefix = getCachePrefix(type, date, paperId);
    let latest = null;
    for (const storage of getAllStorages()) {
      for (let i = 0; i < storage.length; i += 1) {
        const key = storage.key(i);
        if (!key || !key.startsWith(prefix)) continue;
        try {
          const payload = JSON.parse(storage.getItem(key) || "null");
          if (!payload) continue;
          if (!latest || (payload.created_at || "") > (latest.created_at || "")) {
            latest = payload;
          }
        } catch (_err) {
          // ignore invalid cache entry
        }
      }
    }
    return latest;
  }

  function saveCache(type, date, paperId, variant, payload) {
    storageForMode(getStorageMode()).setItem(getCacheKey(type, date, paperId, variant), JSON.stringify(payload));
  }

  function removePaperCaches(type, date, paperId) {
    const prefix = getCachePrefix(type, date, paperId);
    for (const storage of getAllStorages()) {
      const keys = [];
      for (let i = 0; i < storage.length; i += 1) {
        const key = storage.key(i);
        if (key && key.startsWith(prefix)) keys.push(key);
      }
      keys.forEach((key) => storage.removeItem(key));
    }
  }

  function stripCodeFence(text) {
    let content = (text || "").trim();
    if (content.startsWith("```")) {
      content = content.replace(/^```[a-zA-Z]*\n?/, "").replace(/```$/, "").trim();
    }
    return content;
  }

  function parseJsonOrNull(text) {
    try {
      return JSON.parse(stripCodeFence(text));
    } catch (_err) {
      return null;
    }
  }

  async function requestLocalCompletion(settings, messages, temperature = 0.3) {
    const res = await fetch(`${settings.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify({ model: settings.model, messages, temperature }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`请求失败 (${res.status})${text ? `: ${text.slice(0, 180)}` : ""}`);
    }

    const payload = await res.json();
    return (payload.choices?.[0]?.message?.content || "").trim();
  }

  function formatPersonalSpark(cache) {
    const content = cache?.content || {};
    if (content.raw_response) return content.raw_response;

    const experiments = Array.isArray(content.experiments)
      ? content.experiments.map((item, idx) => `${idx + 1}. ${item}`).join("\n")
      : (content.experiments || "");

    return [
      content.fit ? `适配判断：${content.fit}` : "",
      content.idea ? `个性化想法：${content.idea}` : "",
      experiments ? `建议实验：\n${experiments}` : "",
      content.risk ? `主要风险：${content.risk}` : "",
      content.next_step ? `建议下一步：${content.next_step}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  function buildAnalysisCard(title, content, variant = "") {
    if (!content) return "";
    return `
      <section class="analysis-card ${variant}">
        <h4 class="analysis-card-title">${escapeHtml(title)}</h4>
        <div class="analysis-card-body">${escapeHtml(content)}</div>
      </section>
    `;
  }

  function getReferenceAnalysisTitles(language = DEFAULT_AI_LANGUAGE) {
    if (language === "zh") {
      return {
        tldr: "TL;DR",
        motivation: "Motivation",
        method: "Method",
        result: "Result",
        help: "Research Help",
        spark: "Idea Spark",
        sparkRisk: "Risk",
        sparkInspiration: "Inspiration",
      };
    }

    return {
      tldr: "TL;DR",
      motivation: "Motivation",
      method: "Method",
      result: "Result",
      help: "Research Help",
      spark: "Idea Spark",
      sparkRisk: "Risk",
      sparkInspiration: "Inspiration",
    };
  }

  function renderAnalysisCards(ai, idea, language = DEFAULT_AI_LANGUAGE) {
    const display = getReferenceAnalysisTitles(language);
    const cards = [
      buildAnalysisCard(display.motivation, ai.motivation),
      buildAnalysisCard(display.method, ai.method),
      buildAnalysisCard(display.result, ai.result),
      buildAnalysisCard(display.help, ai.help_to_user, "analysis-card-highlight"),
      buildAnalysisCard(display.spark, idea.idea, "analysis-card-highlight"),
      buildAnalysisCard(display.sparkRisk, idea.risk),
      buildAnalysisCard(display.sparkInspiration, idea.inspiration),
    ].filter(Boolean);

    const tldrBlock = ai.tldr
      ? `
        <section class="analysis-tldr-block">
          <h3>${escapeHtml(display.tldr)}</h3>
          <p class="analysis-tldr-text">${escapeHtml(ai.tldr)}</p>
        </section>
      `
      : "";

    if (!tldrBlock && !cards.length) return "";

    return `
      <section class="detail-section detail-analysis-section">
        ${tldrBlock}
        ${cards.length ? `<div class="analysis-grid">${cards.join("")}</div>` : ""}
      </section>
    `;
  }

  function renderCodeLinks(code = {}) {
    const links = [
      ...(code.github || []).map((url) => ({ label: "GitHub", url })),
      ...(code.huggingface || []).map((url) => ({ label: "HuggingFace", url })),
      ...(code.colab || []).map((url) => ({ label: "Colab", url })),
    ];

    if (!links.length) return `<div class="subtle">当前未检测到公开代码链接。</div>`;

    return `
      <div class="resource-list">
        ${links
          .map(
            (item) =>
              `<a class="resource-chip" href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.label)}</a>`,
          )
          .join("")}
      </div>
    `;
  }

  function renderLanguageToggle(ai = {}, language = DEFAULT_AI_LANGUAGE) {
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
                <button
                  type="button"
                  class="language-toggle-btn${key === language ? " active" : ""}"
                  data-language="${escapeHtml(key)}"
                  aria-pressed="${key === language ? "true" : "false"}"
                >
                  ${escapeHtml(item.label)}
                </button>
              `,
            )
            .join("")}
        </div>
      </section>
    `;
  }

  function removePdfOverlay() {
    document.querySelector(".pdf-overlay")?.remove();
    const expanded = document.querySelector(".pdf-container.expanded");
    if (expanded) {
      expanded.classList.remove("expanded");
      const button = document.querySelector(".pdf-expand-btn");
      if (button) button.textContent = "放大";
    }
  }

  function togglePdfSize(button) {
    const container = button.closest(".pdf-preview-section")?.querySelector(".pdf-container");
    if (!container) return;

    if (container.classList.contains("expanded")) {
      container.classList.remove("expanded");
      button.textContent = "放大";
      removePdfOverlay();
      return;
    }

    const overlay = document.createElement("div");
    overlay.className = "pdf-overlay";
    overlay.addEventListener("click", () => togglePdfSize(button));
    document.body.appendChild(overlay);

    container.classList.add("expanded");
    button.textContent = "恢复";
  }

  function createController(options = {}) {
    const getPapers = typeof options.getPapers === "function" ? options.getPapers : () => [];
    const getScopeLabel = typeof options.getScopeLabel === "function" ? options.getScopeLabel : () => "当前视图";
    const getScopeCacheKey = typeof options.getScopeCacheKey === "function" ? options.getScopeCacheKey : () => "default";
    const onStateChange = typeof options.onStateChange === "function" ? options.onStateChange : () => {};
    const modalId = options.modalId || "paper-modal";
    const settingsDialogId = options.settingsDialogId || "settings-dialog";

    let initialized = false;
    let currentModalIndex = -1;
    let currentPaperId = "";
    let paperModal = null;
    let settingsDialog = null;

    function getCurrentPapers() {
      const papers = getPapers();
      return Array.isArray(papers) ? papers : [];
    }

    function syncCurrentSelection() {
      const papers = getCurrentPapers();
      if (!currentPaperId) {
        currentModalIndex = -1;
        return null;
      }
      currentModalIndex = papers.findIndex((paper) => paper.id === currentPaperId);
      return currentModalIndex >= 0 ? papers[currentModalIndex] : null;
    }

    function updateModalNavigation() {
      if (!paperModal) return;
      const position = paperModal.querySelector("#paper-position");
      const prev = paperModal.querySelector("#paper-prev");
      const next = paperModal.querySelector("#paper-next");
      const papers = getCurrentPapers();
      syncCurrentSelection();

      if (!papers.length || currentModalIndex < 0) {
        if (position) position.textContent = "-";
        if (prev) prev.disabled = true;
        if (next) next.disabled = true;
        return;
      }

      if (position) position.textContent = `${currentModalIndex + 1} / ${papers.length}`;
      if (prev) prev.disabled = currentModalIndex <= 0;
      if (next) next.disabled = currentModalIndex >= papers.length - 1;
    }

    function loadSettings() {
      loadSettingsIntoDialog(settingsDialog);
    }

    function showSettings() {
      if (!settingsDialog) return;
      loadSettings();
      if (!settingsDialog.open) settingsDialog.showModal();
    }

    function ensureLocalAiReady() {
      if (hasLocalAiConfig()) return getLocalSettings();
      showSettings();
      throw new Error("请先在“本地增强设置”中填写 API 配置");
    }

    async function generatePersonalSpark(paper) {
      const settings = ensureLocalAiReady();
      const language = getPreferredAiLanguage();
      const aiSection = getAiSection(paper.ai || {}, language);
      const baseIdea = aiSection.idea_spark || {};
      const autoSummary = [
        aiSection.tldr ? `TL;DR: ${aiSection.tldr}` : "",
        aiSection.method ? `Method: ${aiSection.method}` : "",
        aiSection.result ? `Result: ${aiSection.result}` : "",
        baseIdea.idea ? `Auto Spark: ${baseIdea.idea}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      const messages = [
        {
          role: "system",
          content:
            "你是一位 biology-first 的 AI4Science 研究助理。请结合用户研究背景和论文内容，给出更个性化、更可执行的 Spark。只返回严格 JSON，键为 fit, idea, experiments, risk, next_step。experiments 必须是字符串数组。",
        },
        {
          role: "user",
          content: `用户研究背景：\n${settings.researchContext || DEFAULT_RESEARCH_CONTEXT}\n\n论文标题：${paper.title}\n论文摘要：${paper.summary}\n领域：${paper.domain}\n自动日报摘要：\n${autoSummary || "暂无"}\n\n请输出更贴近我的 personalized spark。`,
        },
      ];

      const raw = await requestLocalCompletion(settings, messages, 0.35);
      const parsed = parseJsonOrNull(raw);
      const payload = {
        cache_type: "personal_spark",
        created_at: new Date().toISOString(),
        model: settings.model,
        research_context_hash: hashString(settings.researchContext || DEFAULT_RESEARCH_CONTEXT),
        content: parsed
          ? {
              fit: parsed.fit || "",
              idea: parsed.idea || "",
              experiments: Array.isArray(parsed.experiments)
                ? parsed.experiments
                : parsed.experiments
                  ? [String(parsed.experiments)]
                  : [],
              risk: parsed.risk || "",
              next_step: parsed.next_step || "",
            }
          : {
              raw_response: raw || "模型未返回内容",
            },
      };

      const variant = `${payload.model}:${payload.research_context_hash}`;
      saveCache("personal_spark", getScopeCacheKey(), paper.id, variant, payload);
      return payload;
    }

    async function askFollowup(paper, question) {
      const settings = ensureLocalAiReady();
      const language = getPreferredAiLanguage();
      const aiSection = getAiSection(paper.ai || {}, language);
      const personalSpark = getLatestCache("personal_spark", getScopeCacheKey(), paper.id);
      const personalSparkText = personalSpark ? formatPersonalSpark(personalSpark) : "暂无";

      const messages = [
        {
          role: "system",
          content: "你是 biology-first 研究助手。请结合论文、自动日报分析、用户研究背景与个性化 spark，给出简洁、可执行、实验导向的回答。请使用中文。",
        },
        {
          role: "user",
          content: `用户研究背景：\n${settings.researchContext || DEFAULT_RESEARCH_CONTEXT}\n\n论文标题：${paper.title}\n论文摘要：${paper.summary}\n自动日报 TL;DR：${aiSection.tldr || "暂无"}\n自动日报方法：${aiSection.method || "暂无"}\n自动日报结果：${aiSection.result || "暂无"}\n我的 Spark：\n${personalSparkText}\n\n问题：${question}`,
        },
      ];

      return (await requestLocalCompletion(settings, messages, 0.3)) || "无返回内容";
    }

    function bindModalContentEvents(paper) {
      if (!paperModal) return;
      const modalBody = paperModal.querySelector("#paper-modal-body");
      if (!modalBody) return;

      const sparkBtn = modalBody.querySelector(".modal-spark-btn");
      const clearBtn = modalBody.querySelector(".modal-clear-spark-btn");
      const sparkAnswer = modalBody.querySelector(".modal-spark-answer");
      const sparkEmpty = modalBody.querySelector(".modal-spark-empty");
      const askBtn = modalBody.querySelector(".modal-ask-btn");
      const askInput = modalBody.querySelector(".modal-followup-input");
      const askAnswer = modalBody.querySelector(".modal-followup-answer");
      const expandBtn = modalBody.querySelector(".pdf-expand-btn");

      modalBody.querySelectorAll(".language-toggle-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          setPreferredAiLanguage(btn.dataset.language || DEFAULT_AI_LANGUAGE);
          onStateChange();
          renderPaperModal(paper);
        });
      });

      modalBody.querySelectorAll(".modal-preset-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          if (!askInput) return;
          askInput.value = decodeURIComponent(btn.dataset.question || "");
          askInput.focus();
        });
      });

      sparkBtn?.addEventListener("click", async () => {
        sparkBtn.disabled = true;
        sparkBtn.textContent = "生成中...";
        try {
          const payload = await generatePersonalSpark(paper);
          if (sparkAnswer) {
            sparkAnswer.style.display = "block";
            sparkAnswer.textContent = formatPersonalSpark(payload);
          }
          if (sparkEmpty) sparkEmpty.style.display = "none";
          sparkBtn.textContent = "重新生成我的 Spark";
        } catch (err) {
          if (sparkAnswer) {
            sparkAnswer.style.display = "block";
            sparkAnswer.textContent = `错误: ${err.message}`;
          }
          if (sparkEmpty) sparkEmpty.style.display = "none";
          sparkBtn.textContent = "生成我的 Spark";
        } finally {
          sparkBtn.disabled = false;
        }
      });

      clearBtn?.addEventListener("click", () => {
        removePaperCaches("personal_spark", getScopeCacheKey(), paper.id);
        if (sparkAnswer) {
          sparkAnswer.style.display = "none";
          sparkAnswer.textContent = "";
        }
        if (sparkEmpty) sparkEmpty.style.display = "block";
        if (sparkBtn) sparkBtn.textContent = "生成我的 Spark";
      });

      askBtn?.addEventListener("click", async () => {
        const question = askInput?.value.trim() || "";
        if (!question) return;
        askBtn.disabled = true;
        askBtn.textContent = "思考中...";
        try {
          const answer = await askFollowup(paper, question);
          if (askAnswer) {
            askAnswer.style.display = "block";
            askAnswer.textContent = answer;
          }
        } catch (err) {
          if (askAnswer) {
            askAnswer.style.display = "block";
            askAnswer.textContent = `错误: ${err.message}`;
          }
        } finally {
          askBtn.disabled = false;
          askBtn.textContent = "提问";
        }
      });

      expandBtn?.addEventListener("click", () => togglePdfSize(expandBtn));
    }

    function renderPaperModal(paper) {
      if (!paperModal || !paper) return;
      removePdfOverlay();
      const selectedLanguage = getPreferredAiLanguage();
      const ai = getAiSection(paper.ai || {}, selectedLanguage);
      const idea = ai.idea_spark || {};
      const localSpark = getLatestCache("personal_spark", getScopeCacheKey(), paper.id);
      const modalBody = paperModal.querySelector("#paper-modal-body");
      const modalTitle = paperModal.querySelector("#paper-modal-title");
      const modalMeta = paperModal.querySelector("#paper-modal-meta");
      const codeLink = findPrimaryCodeLink(paper.code || {});

      if (modalTitle) modalTitle.textContent = paper.title || "论文详情";
      if (modalMeta) {
        modalMeta.textContent = `${getScopeLabel() || "当前视图"} · 第 ${currentModalIndex + 1} / ${getCurrentPapers().length} 篇`;
      }

      if (modalBody) {
        modalBody.innerHTML = `
          <div class="paper-detail">
            <section class="detail-section detail-overview">
              <div class="detail-badges">
                <span class="tag">${escapeHtml(paper.domain || "general")}</span>
                <span class="tag">相关度 ${escapeHtml(String(paper.relevance_score ?? ""))}</span>
                ${(paper.code || {}).has_code ? '<span class="tag">有代码</span>' : ""}
              </div>
              <div class="detail-grid">
                <div>
                  <div class="detail-label">作者</div>
                  <div class="detail-value">${escapeHtml((paper.authors || []).join(", ") || "未知")}</div>
                </div>
                <div>
                  <div class="detail-label">作者单位</div>
                  <div class="detail-value">${escapeHtml((paper.affiliations || []).join("；") || "当前数据中暂无作者单位信息")}</div>
                </div>
                <div>
                  <div class="detail-label">分类</div>
                  <div class="detail-value">${escapeHtml((paper.categories || []).join(", ") || "未知")}</div>
                </div>
                <div>
                  <div class="detail-label">发布日期</div>
                  <div class="detail-value">${escapeHtml(formatPublished(paper.published))}</div>
                </div>
                <div>
                  <div class="detail-label">入选日报</div>
                  <div class="detail-value">${escapeHtml((paper.report_dates || [paper.source_date || "-"]).join("，"))}</div>
                </div>
                <div>
                  <div class="detail-label">主题关键词</div>
                  <div class="detail-value">${escapeHtml(getDisplayKeywords(paper.ai || {}) || "当前数据中暂无关键词")}</div>
                </div>
                <div>
                  <div class="detail-label">代码状态</div>
                  <div class="detail-value">${(paper.code || {}).has_code ? "已检测到代码链接" : "未检测到代码链接"}</div>
                </div>
              </div>
            </section>

            ${renderLanguageToggle(paper.ai || {}, selectedLanguage)}

            ${renderAnalysisCards(ai, idea, selectedLanguage)}

            <section class="detail-section">
              <h3>原始摘要</h3>
              <div class="detail-text abstract-text">${escapeHtml(paper.summary || "暂无摘要")}</div>
            </section>

            <section class="detail-section">
              <h3>代码与资源</h3>
              ${renderCodeLinks(paper.code || {})}
            </section>

            <section class="detail-section">
              <div class="section-head">
                <strong>本地个性化增强</strong>
                <span class="mini-hint">基于你在浏览器中保存的 API 与 research context</span>
              </div>
              <div class="subtle">用于生成更贴近你当前方向的 personalized spark；不会回写 GitHub 公共日报。</div>
              <div class="button-row">
                <button type="button" class="btn secondary modal-spark-btn">生成我的 Spark</button>
                <button type="button" class="btn ghost modal-clear-spark-btn">清除本地 Spark</button>
              </div>
              <div class="subtle modal-spark-empty"${localSpark ? ' style="display:none;"' : ""}>点击按钮后，这里会显示你自己的个性化想法、实验建议与风险判断。</div>
              <div class="answer local-answer modal-spark-answer"${localSpark ? "" : ' style="display:none;"'}>${escapeHtml(
                localSpark ? formatPersonalSpark(localSpark) : "",
              )}</div>
            </section>

            <section class="detail-section">
              <div class="section-head">
                <strong>继续提问</strong>
                <span class="mini-hint">围绕当前论文 + 自动日报 + 你的 Spark 深挖</span>
              </div>
              <div class="template-list">
                ${PRESET_QUESTIONS.map(
                  (item) =>
                    `<button type="button" class="template-btn modal-preset-btn" data-question="${encodeURIComponent(item.text)}">${escapeHtml(item.label)}</button>`,
                ).join("")}
              </div>
              <textarea class="modal-followup-input" placeholder="例如：如果我把这篇作为 surrogate modeling 的 baseline，下一周最值得先做的实验是什么？"></textarea>
              <div class="button-row">
                <button type="button" class="btn modal-ask-btn">提问</button>
              </div>
              <div class="answer modal-followup-answer" style="display:none;"></div>
            </section>

            <section class="detail-section pdf-preview-section">
              <div class="pdf-header">
                <h3>PDF 阅读器</h3>
                <button type="button" class="pdf-expand-btn" title="放大 PDF">放大</button>
              </div>
              <div class="pdf-container">
                <iframe src="${escapeHtml(derivePdfUrl(paper.link))}" title="PDF Preview" loading="lazy"></iframe>
              </div>
            </section>
          </div>
        `;
      }

      const paperLink = paperModal.querySelector("#paper-link");
      const pdfLink = paperModal.querySelector("#pdf-link");
      const htmlLink = paperModal.querySelector("#html-link");
      const codeFooterLink = paperModal.querySelector("#code-link");

      if (paperLink) paperLink.href = paper.link || "#";
      if (pdfLink) pdfLink.href = derivePdfUrl(paper.link);
      if (htmlLink) htmlLink.href = deriveHtmlUrl(paper.link);

      if (codeFooterLink) {
        if (codeLink) {
          codeFooterLink.href = codeLink;
          codeFooterLink.style.display = "inline-flex";
        } else {
          codeFooterLink.removeAttribute("href");
          codeFooterLink.style.display = "none";
        }
      }

      bindModalContentEvents(paper);
      updateModalNavigation();
    }

    function openById(paperId) {
      if (!paperModal || !paperId) return false;
      const papers = getCurrentPapers();
      const idx = papers.findIndex((paper) => paper.id === paperId);
      if (idx < 0) return false;

      currentPaperId = paperId;
      currentModalIndex = idx;
      renderPaperModal(papers[currentModalIndex]);
      paperModal.classList.add("active");
      paperModal.setAttribute("aria-hidden", "false");
      document.body.classList.add("modal-open");
      return true;
    }

    function close() {
      if (!paperModal) return;
      removePdfOverlay();
      paperModal.classList.remove("active");
      paperModal.setAttribute("aria-hidden", "true");
      document.body.classList.remove("modal-open");
      currentModalIndex = -1;
      currentPaperId = "";
    }

    function move(step) {
      const papers = getCurrentPapers();
      const currentPaper = syncCurrentSelection();
      if (!currentPaper || !papers.length) return;
      const nextIndex = currentModalIndex + step;
      if (nextIndex < 0 || nextIndex >= papers.length) return;
      currentModalIndex = nextIndex;
      currentPaperId = papers[nextIndex].id;
      renderPaperModal(papers[nextIndex]);
    }

    function isOpen() {
      return Boolean(paperModal && paperModal.classList.contains("active"));
    }

    function refresh() {
      if (!isOpen()) return;
      const paper = syncCurrentSelection();
      if (!paper) {
        close();
        return;
      }
      renderPaperModal(paper);
    }

    function bindSettingsDialog() {
      if (!settingsDialog) return;
      enableDialogOutsideClose(settingsDialog);

      const saveButton = settingsDialog.querySelector("#save-settings");
      const clearButton = settingsDialog.querySelector("#clear-settings");
      saveButton?.addEventListener("click", (event) => {
        event.preventDefault();
        saveSettingsFromDialog(settingsDialog);
        onStateChange();
        settingsDialog.close();
      });

      clearButton?.addEventListener("click", () => {
        if (!window.confirm("确定要清空当前浏览器中的 API、模型与研究背景设置吗？")) return;
        clearLocalSettings();
        loadSettingsIntoDialog(settingsDialog);
        onStateChange();
      });
    }

    function bindModalShell() {
      if (!paperModal) return;
      paperModal.querySelector("#close-paper-modal")?.addEventListener("click", () => close());
      paperModal.querySelector("#paper-prev")?.addEventListener("click", () => move(-1));
      paperModal.querySelector("#paper-next")?.addEventListener("click", () => move(1));

      paperModal.addEventListener("click", (event) => {
        if (event.target !== paperModal) return;
        if (document.querySelector(".pdf-container.expanded")) {
          removePdfOverlay();
        } else {
          close();
        }
      });

      document.addEventListener("keydown", (event) => {
        if (!isOpen()) return;
        if (event.key === "Escape") {
          if (document.querySelector(".pdf-container.expanded")) {
            removePdfOverlay();
          } else {
            close();
          }
        } else if (event.key === "ArrowLeft") {
          move(-1);
        } else if (event.key === "ArrowRight") {
          move(1);
        }
      });
    }

    const api = {
      init() {
        if (initialized) return api;
        paperModal = document.getElementById(modalId);
        settingsDialog = document.getElementById(settingsDialogId);
        bindSettingsDialog();
        bindModalShell();
        initialized = true;
        return api;
      },
      openById,
      close,
      move,
      isOpen,
      refresh,
      showSettings,
      loadSettings,
    };

    return api;
  }

  window.PaperDetailShared = {
    createController,
    utils: {
      escapeHtml,
      formatPublished,
      derivePdfUrl,
      deriveHtmlUrl,
      findPrimaryCodeLink,
      getDisplayKeywords,
      normalizeAiSection,
      getAiSection,
      hasSavedBilingualAi,
      getAiLanguageMeta,
      getPreferredAiLanguage,
      setPreferredAiLanguage,
      getLocalSettings,
      hasLocalAiConfig,
      formatPersonalSpark,
      enableDialogOutsideClose,
      loadSettingsIntoDialog,
      saveSettingsFromDialog,
      clearLocalSettings,
    },
    constants: {
      DEFAULT_AI_LANGUAGE,
      DEFAULT_MODEL,
      DEFAULT_RESEARCH_CONTEXT,
      AI_LANGUAGE_META,
    },
  };
})();
