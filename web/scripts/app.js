async function fetchJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to fetch ${path}`);
  return await res.json();
}

async function tryFetchJson(path) {
  try {
    return await fetchJson(path);
  } catch (_err) {
    return null;
  }
}

function escapeHtml(s) {
  return (s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function previewText(text, limit = 160) {
  const value = (text || "").replace(/\s+/g, " ").trim();
  if (value.length <= limit) return value;
  return `${value.slice(0, limit).trim()}…`;
}

function formatAuthors(authors = [], maxCount = 4) {
  if (!authors.length) return "未知";
  if (authors.length <= maxCount) return authors.join(", ");
  return `${authors.slice(0, maxCount).join(", ")} 等`;
}

function formatAffiliations(affiliations = [], maxCount = 3) {
  if (!affiliations || !affiliations.length) return "";
  if (affiliations.length <= maxCount) return affiliations.join("；");
  return `${affiliations.slice(0, maxCount).join("；")} 等`;
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

function normalizePaperId(id) {
  return encodeURIComponent(id || "");
}

function getTheme() {
  const saved = localStorage.getItem(THEME_STORAGE_KEY);
  return THEMES[saved] ? saved : DEFAULT_THEME;
}

function getPreferredAiLanguage() {
  const saved = localStorage.getItem(AI_LANGUAGE_STORAGE_KEY);
  return AI_LANGUAGE_META[saved] ? saved : DEFAULT_AI_LANGUAGE;
}

function setPreferredAiLanguage(language) {
  const resolved = AI_LANGUAGE_META[language] ? language : DEFAULT_AI_LANGUAGE;
  localStorage.setItem(AI_LANGUAGE_STORAGE_KEY, resolved);
}

function applyTheme(theme, persist = true) {
  const resolved = THEMES[theme] ? theme : DEFAULT_THEME;
  document.body.dataset.theme = resolved;
  if (persist) localStorage.setItem(THEME_STORAGE_KEY, resolved);
  updateThemeSelectionUI();
}

function updateThemeSelectionUI() {
  const activeTheme = document.body.dataset.theme || DEFAULT_THEME;
  document.querySelectorAll(".theme-option").forEach((option) => {
    const isActive = option.dataset.theme === activeTheme;
    option.classList.toggle("active", isActive);
    option.setAttribute("aria-pressed", isActive ? "true" : "false");
  });
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

let currentPapers = [];
let currentFilteredPapers = [];
let currentDate = "";
let currentDateLabel = "";
let currentDateMode = "single";
let currentDateRange = null;
let currentModalIndex = -1;
let settingsDialog;
let paperModal;
let themeDialog;
let dateDialog;
let dataBasePath = "../data";
let availableDates = [];

const SETTINGS_KEYS = {
  baseUrl: "hybrid_api_base_url",
  apiKey: "hybrid_api_key",
  model: "hybrid_api_model",
  storageMode: "hybrid_storage_mode",
  researchContext: "hybrid_research_context",
};

const CACHE_PREFIX = "ara_cache";
const THEME_STORAGE_KEY = "ara_theme";
const AI_LANGUAGE_STORAGE_KEY = "ara_ai_language";
const DEFAULT_THEME = "lavender";
const DEFAULT_AI_LANGUAGE = "zh";
const DEFAULT_MODEL = "deepseek-chat";
const DEFAULT_RESEARCH_CONTEXT =
  "Biology x Computer Science research focus, especially computational biology, single-cell, surrogate modeling, trajectory prediction, SSA/CME, stochastic simulation, and flow matching.";

const THEMES = {
  lavender: {
    label: "浅紫科技",
    description: "参考站点风格，轻盈、明亮、适合日常浏览。",
  },
  pearl: {
    label: "珍珠白",
    description: "更纯净的浅色背景，适合白天阅读。",
  },
  sage: {
    label: "鼠尾草",
    description: "轻微绿灰调，更安静克制。",
  },
  graphite: {
    label: "石墨夜色",
    description: "低刺激夜间模式。",
  },
};

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

const DOMAIN_META = {
  all: { label: "全部" },
  biology: { label: "biology" },
  ai4science: { label: "ai4science" },
  "math-physics": { label: "math-physics" },
  llm: { label: "llm" },
  cv: { label: "cv" },
  general: { label: "general" },
};

const DEFAULT_DOMAIN_ORDER = ["all", "biology", "ai4science", "math-physics", "llm", "cv"];

const KEYWORD_STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "in",
  "into",
  "is",
  "of",
  "on",
  "or",
  "the",
  "to",
  "via",
  "with",
  "using",
  "based",
  "towards",
  "toward",
  "under",
  "over",
  "through",
  "study",
  "approach",
  "method",
  "methods",
  "new",
]);

function getDataBaseCandidates() {
  const pathname = window.location.pathname || "";
  const candidates = pathname.includes("/web/") ? ["../data", "./data"] : ["./data", "../data"];
  return [...new Set(candidates)];
}

async function resolveDataBasePath() {
  const candidates = getDataBaseCandidates();
  for (const candidate of candidates) {
    const payload = await tryFetchJson(`${candidate}/index.json`);
    if (payload) {
      dataBasePath = candidate;
      return payload;
    }
  }
  throw new Error(`无法定位数据目录。已尝试: ${candidates.join(", ")}`);
}

async function fetchDataJson(relativePath) {
  return await fetchJson(`${dataBasePath}/${relativePath}`);
}

function clampDateToAvailable(date) {
  if (!availableDates.length) return date || "";
  if (date && availableDates.includes(date)) return date;
  return availableDates[0];
}

function getCurrentScopeCacheKey() {
  if (currentDateMode === "range" && currentDateRange) {
    return `${currentDateRange.start}_to_${currentDateRange.end}`;
  }
  return currentDate || availableDates[0] || "";
}

function formatCompactDate(dateString) {
  if (!dateString) return "";
  const date = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateString;
  return new Intl.DateTimeFormat("en-US", {
    month: "numeric",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function buildDateScopeLabel(scope) {
  if (scope.mode === "range") return `${formatCompactDate(scope.start)} – ${formatCompactDate(scope.end)}`;
  return formatCompactDate(scope.date);
}

function updateDateTrigger(scope) {
  const trigger = document.getElementById("date-trigger-text");
  if (!trigger) return;
  trigger.textContent = buildDateScopeLabel(scope);
}

function getAvailableDatesInRange(start, end) {
  if (!start || !end) return [];
  const [from, to] = start <= end ? [start, end] : [end, start];
  return availableDates.filter((date) => date >= from && date <= to);
}

function getScopeDates(scope) {
  if (scope.mode === "range") return getAvailableDatesInRange(scope.start, scope.end);
  return scope.date ? [scope.date] : [];
}

function buildRangeScopeFromCount(count) {
  if (!availableDates.length) return null;
  if (count === "latest") {
    return { mode: "single", date: availableDates[0] };
  }
  if (count === "all") {
    return {
      mode: "range",
      start: availableDates[availableDates.length - 1],
      end: availableDates[0],
    };
  }
  const size = Math.max(1, Number(count) || 1);
  const slice = availableDates.slice(0, size);
  return {
    mode: slice.length === 1 ? "single" : "range",
    start: slice[slice.length - 1],
    end: slice[0],
    date: slice[0],
  };
}

function getDateDialogScope() {
  return currentDateMode === "range" && currentDateRange
    ? { mode: "range", start: currentDateRange.start, end: currentDateRange.end }
    : { mode: "single", date: clampDateToAvailable(currentDate) };
}

function syncDateDialog(scope = getDateDialogScope()) {
  const mode = scope.mode || "single";
  const singleGroup = document.getElementById("single-date-group");
  const rangeGroup = document.getElementById("range-date-group");
  const singleInput = document.getElementById("single-date-input");
  const rangeStart = document.getElementById("range-start-input");
  const rangeEnd = document.getElementById("range-end-input");
  const availability = document.getElementById("date-dialog-availability");

  document.querySelectorAll(".mode-toggle-btn").forEach((button) => {
    const active = button.dataset.mode === mode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });

  singleGroup.classList.toggle("hidden", mode !== "single");
  rangeGroup.classList.toggle("hidden", mode !== "range");

  const minDate = availableDates[availableDates.length - 1] || "";
  const maxDate = availableDates[0] || "";
  [singleInput, rangeStart, rangeEnd].forEach((input) => {
    input.min = minDate;
    input.max = maxDate;
  });

  singleInput.value = clampDateToAvailable(scope.date || maxDate);
  const fallbackStart = scope.start || availableDates[Math.min(availableDates.length - 1, 2)] || maxDate;
  rangeStart.value = clampDateToAvailable(fallbackStart);
  rangeEnd.value = clampDateToAvailable(scope.end || maxDate);

  if (availability) {
    availability.textContent = availableDates.length
      ? `当前共有 ${availableDates.length} 天可用日报（${minDate} → ${maxDate}）`
      : "暂无可用日报";
  }
}

function readScopeFromDialog() {
  const activeMode = document.querySelector(".mode-toggle-btn.active")?.dataset.mode || "single";
  if (activeMode === "range") {
    const start = document.getElementById("range-start-input").value || availableDates[availableDates.length - 1] || "";
    const end = document.getElementById("range-end-input").value || availableDates[0] || "";
    const [normalizedStart, normalizedEnd] = start <= end ? [start, end] : [end, start];
    return { mode: "range", start: normalizedStart, end: normalizedEnd };
  }
  return { mode: "single", date: document.getElementById("single-date-input").value || availableDates[0] || "" };
}

function normalizePaperForScope(paper, sourceDate) {
  return {
    ...paper,
    source_date: sourceDate,
    report_dates: [sourceDate],
  };
}

function aggregateDailyPayloads(payloads) {
  const merged = new Map();

  payloads.forEach((payload) => {
    const sourceDate = payload?.date || "";
    (payload?.papers || []).forEach((paper) => {
      const normalized = normalizePaperForScope(paper, sourceDate);
      const existing = merged.get(normalized.id);
      if (!existing) {
        merged.set(normalized.id, normalized);
        return;
      }

      const reportDates = Array.from(new Set([...(existing.report_dates || []), ...(normalized.report_dates || [])])).sort().reverse();
      const chooseIncoming =
        Number(normalized.relevance_score || 0) > Number(existing.relevance_score || 0) ||
        String(normalized.source_date || "") > String(existing.source_date || "");

      merged.set(normalized.id, {
        ...(chooseIncoming ? normalized : existing),
        report_dates: reportDates,
        source_date: reportDates[0] || normalized.source_date || existing.source_date,
      });
    });
  });

  return Array.from(merged.values()).sort((a, b) => {
    const scoreDelta = Number(b.relevance_score || 0) - Number(a.relevance_score || 0);
    if (scoreDelta !== 0) return scoreDelta;
    return String(b.source_date || "").localeCompare(String(a.source_date || ""));
  });
}

function getKnownDomains(papers = []) {
  const present = new Set(papers.map((paper) => paper.domain || "general"));
  const ordered = [...DEFAULT_DOMAIN_ORDER];
  const extras = Array.from(present).filter((item) => !ordered.includes(item)).sort();
  return [...ordered, ...extras];
}

function getDomainLabel(domain) {
  return DOMAIN_META[domain]?.label || domain;
}

function syncDomainOptions() {
  const select = document.getElementById("domain-filter");
  if (!select) return;

  const currentValue = select.value || "all";
  const domains = getKnownDomains(currentPapers);
  select.innerHTML = domains
    .map((domain) => `<option value="${escapeHtml(domain)}">${escapeHtml(getDomainLabel(domain))}</option>`)
    .join("");
  select.value = domains.includes(currentValue) ? currentValue : "all";
}

function extractKeywordRanking(papers, limit = 18) {
  const phraseCounts = new Map();
  const wordCounts = new Map();

  papers.forEach((paper) => {
    const title = String(paper.title || "")
      .toLowerCase()
      .replace(/[^a-z0-9+\-/ ]+/g, " ");
    const words = title
      .split(/\s+/)
      .map((word) => word.trim())
      .filter((word) => word.length >= 2);

    const filtered = words.filter((word) => !KEYWORD_STOPWORDS.has(word));
    filtered.forEach((word) => {
      wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
    });

    for (let n = 3; n >= 2; n -= 1) {
      for (let i = 0; i <= filtered.length - n; i += 1) {
        const phrase = filtered.slice(i, i + n).join(" ");
        if (phrase.length < 6) continue;
        phraseCounts.set(phrase, (phraseCounts.get(phrase) || 0) + 1);
      }
    }
  });

  const phraseEntries = Array.from(phraseCounts.entries())
    .filter(([, count]) => count >= (papers.length >= 8 ? 2 : 1))
    .map(([label, count]) => ({ label, count, score: count * (label.split(" ").length + 1) }))
    .sort((a, b) => b.score - a.score || b.count - a.count || a.label.localeCompare(b.label));

  const wordEntries = Array.from(wordCounts.entries())
    .filter(([label]) => label.length >= 3)
    .map(([label, count]) => ({ label, count, score: count }))
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));

  const results = [];
  const seen = new Set();

  for (const entry of [...phraseEntries, ...wordEntries]) {
    const key = entry.label;
    if (seen.has(key)) continue;
    if (results.some((item) => item.label.includes(key) || key.includes(item.label))) continue;
    seen.add(key);
    results.push({ label: key, count: entry.count });
    if (results.length >= limit) break;
  }

  return results;
}

function renderStatistics(list = currentFilteredPapers) {
  const section = document.getElementById("statistics");
  const summary = document.getElementById("statistics-summary");
  const cloud = document.getElementById("keyword-cloud");
  const subtitle = document.getElementById("statistics-subtitle");

  if (!section || !summary || !cloud || !subtitle) return;

  const keywords = extractKeywordRanking(list);
  const domainCount = new Set(list.map((paper) => paper.domain || "general")).size;
  const scopeText =
    currentDateMode === "range" && currentDateRange
      ? `${currentDateRange.start} → ${currentDateRange.end}`
      : currentDateLabel || currentDate;

  subtitle.textContent =
    currentDateMode === "range"
      ? `Analyze paper trends and popular topics across ${scopeText}`
      : "Analyze paper trends and popular topics";

  summary.innerHTML = `
    <span class="meta-pill">${escapeHtml(scopeText || "当前数据")}</span>
    <span class="meta-pill">${escapeHtml(String(list.length || 0))} 篇当前结果</span>
    <span class="meta-pill">${escapeHtml(String(domainCount || 0))} 个领域</span>
    <span class="meta-pill">${currentDateMode === "range" ? "聚合范围视图" : "单日视图"}</span>
  `;

  if (!keywords.length) {
    cloud.innerHTML = `<div class="subtle">当前结果较少，暂时无法提取稳定的热门关键词。</div>`;
    section.style.display = "block";
    return;
  }

  cloud.innerHTML = keywords
    .map(
      (item, idx) => `
        <div class="keyword-pill">
          <span class="keyword-pill-rank">${idx + 1}</span>
          <span class="keyword-pill-text">${escapeHtml(item.label)}</span>
          <span class="keyword-pill-count">${escapeHtml(String(item.count))}</span>
        </div>
      `,
    )
    .join("");

  section.style.display = "block";
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

function renderStatus() {
  const settings = getLocalSettings();
  const target = document.getElementById("local-status");
  const modeText = settings.storageMode === "session" ? "仅本次会话" : "记住此设备";
  const contextText = settings.researchContext ? "已配置个性化 research context" : "未配置 research context";
  const themeText = THEMES[getTheme()]?.label || THEMES[DEFAULT_THEME].label;
  const aiLanguageText = getAiLanguageMeta(getPreferredAiLanguage()).label;
  const viewText = currentDateLabel ? `${currentDateLabel} · ${currentDateMode === "range" ? "范围浏览" : "单日浏览"}` : "尚未加载";
  const configText = hasLocalAiConfig()
    ? `<span class="ok">已就绪</span>：可直接生成 personalized spark / 继续提问`
    : `<span class="warn">未配置</span>：点击右上角“本地增强设置”后再使用 personalized spark`;

  target.innerHTML = `
    <strong>自动日报：</strong>由 GitHub 每日抓取并分析，打开网页即可查看当日结果。<br />
    <strong>本地增强：</strong>${configText}<br />
    <strong>当前视图：</strong>${escapeHtml(viewText)}<br />
    <strong>保存方式：</strong>${escapeHtml(modeText)} · <strong>研究背景：</strong>${escapeHtml(contextText)} · <strong>当前配色：</strong>${escapeHtml(themeText)} · <strong>详情语言：</strong>${escapeHtml(aiLanguageText)}
  `;
}

function paperCard(p, idx) {
  const ai = getAiSection(p.ai || {}, getPreferredAiLanguage());
  const idea = ai.idea_spark || {};
  const code = p.code || {};
  const paperId = normalizePaperId(p.id);
  const summaryPreview = previewText(ai.tldr || p.summary || "", 170);
  const helpPreview = previewText(ai.help_to_user || idea.idea || "点击查看详情，阅读完整中文简介与 PDF。", 110);
  const codeTag = code.has_code ? `<span class="tag">Code</span>` : "";
  const affiliationPreview = formatAffiliations(p.affiliations || []);
  const reportMeta =
    currentDateMode === "range"
      ? `日报 ${escapeHtml(p.source_date || (p.report_dates || [])[0] || "-")}${(p.report_dates || []).length > 1 ? ` · 入选 ${escapeHtml(String((p.report_dates || []).length))} 次` : ""}`
      : escapeHtml(formatPublished(p.published));

  return `
    <article class="paper-card panel" data-paper-id="${paperId}">
      <div class="paper-card-head">
        <div class="paper-card-order">#${idx + 1}</div>
        <div class="paper-card-tags">
          ${codeTag}
          <span class="tag">${escapeHtml(p.domain || "general")}</span>
        </div>
      </div>
      <h3 class="paper-card-title">${escapeHtml(p.title)}</h3>
      <p class="paper-card-authors">${escapeHtml(formatAuthors(p.authors || []))}</p>
      ${affiliationPreview ? `<p class="paper-card-affiliations">${escapeHtml(affiliationPreview)}</p>` : ""}
      <div class="paper-card-meta">
        <span>${reportMeta}</span>
        <span>相关度 ${escapeHtml(String(p.relevance_score ?? ""))}</span>
      </div>
      <p class="paper-card-preview">${escapeHtml(summaryPreview)}</p>
      <p class="paper-card-help">${escapeHtml(helpPreview)}</p>
      <div class="paper-card-footer">
        <div class="paper-card-categories">${escapeHtml((p.categories || []).join(", "))}</div>
        <button type="button" class="btn details-btn" data-paper-id="${paperId}">查看详情</button>
      </div>
    </article>
  `;
}

function renderPaperList(list) {
  const container = document.getElementById("papers");
  if (!list.length) {
    container.innerHTML = `
      <div class="empty-state panel">
        当前筛选条件下暂无论文。请切换日期或领域后重试。
      </div>
    `;
    return;
  }

  container.innerHTML = list.map((paper, idx) => paperCard(paper, idx)).join("");
  bindListEvents();
}

function renderDomainChips() {
  const container = document.getElementById("domain-filter-chips");
  const select = document.getElementById("domain-filter");
  if (!container || !select) return;

  syncDomainOptions();

  const counts = currentPapers.reduce(
    (acc, paper) => {
      const key = paper.domain || "general";
      acc[key] = (acc[key] || 0) + 1;
      acc.all += 1;
      return acc;
    },
    { all: 0 },
  );

  const options = Array.from(select.options).map((option) => ({
    value: option.value,
    label: getDomainLabel(option.value),
    count: counts[option.value] || (option.value === "all" ? counts.all : 0),
  }));

  container.innerHTML = options
    .map(
      (item) => `
        <button
          type="button"
          class="filter-chip${item.value === select.value ? " active" : ""}"
          data-domain="${escapeHtml(item.value)}"
        >
          <span class="filter-chip-label">${escapeHtml(item.label)}</span>
          <span class="filter-chip-count">${escapeHtml(String(item.count || 0))}</span>
        </button>
      `,
    )
    .join("");

  container.querySelectorAll(".filter-chip").forEach((button) => {
    button.addEventListener("click", () => {
      select.value = button.dataset.domain || "all";
      applyDomainFilter();
    });
  });
}

function applyDomainFilter() {
  const selected = document.getElementById("domain-filter").value;
  currentFilteredPapers = selected === "all" ? currentPapers : currentPapers.filter((p) => (p.domain || "general") === selected);
  renderDomainChips();
  renderPaperList(currentFilteredPapers);
}

async function loadScope(scope) {
  const scopeDates = getScopeDates(scope);
  if (!scopeDates.length) {
    throw new Error("当前所选日期范围内没有可用日报");
  }

  const payloads = await Promise.all(scopeDates.map((date) => fetchDataJson(`daily/${date}.json`)));
  const papers = aggregateDailyPayloads(payloads);

  currentDateMode = scope.mode;
  currentDate = scope.mode === "single" ? scope.date : scopeDates[0];
  currentDateLabel = buildDateScopeLabel(
    scope.mode === "single" ? scope : { mode: "range", start: scopeDates[scopeDates.length - 1], end: scopeDates[0] },
  );
  currentDateRange =
    scope.mode === "range"
      ? { start: scopeDates[scopeDates.length - 1], end: scopeDates[0], dates: scopeDates }
      : null;
  currentPapers = papers;
  document.getElementById("date-select").value = scopeDates[0];
  updateDateTrigger(scope.mode === "single" ? scope : { mode: "range", start: scopeDates[scopeDates.length - 1], end: scopeDates[0] });

  document.getElementById("meta").innerHTML = `
    <span class="meta-pill meta-pill-strong">${escapeHtml(currentDateLabel)}</span>
    <span class="meta-pill">${escapeHtml(String(currentPapers.length || 0))} 篇当前结果</span>
    <span class="meta-pill">${currentDateMode === "range" ? `${scopeDates.length} 天聚合浏览` : "单日浏览"}</span>
    <span class="meta-pill">点击卡片查看双语简介、单位与 PDF</span>
  `;

  renderStatus();
  applyDomainFilter();
}

function loadSettings() {
  const settings = getLocalSettings();
  document.getElementById("api-base-url").value = settings.baseUrl;
  document.getElementById("api-key").value = settings.apiKey;
  document.getElementById("api-model").value = settings.model || DEFAULT_MODEL;
  document.getElementById("storage-mode").value = settings.storageMode;
  document.getElementById("research-context").value = settings.researchContext || DEFAULT_RESEARCH_CONTEXT;
}

function saveSettings() {
  const mode = document.getElementById("storage-mode").value || "local";
  localStorage.setItem(SETTINGS_KEYS.storageMode, mode);
  setSetting(SETTINGS_KEYS.baseUrl, document.getElementById("api-base-url").value.trim(), mode);
  setSetting(SETTINGS_KEYS.apiKey, document.getElementById("api-key").value.trim(), mode);
  setSetting(SETTINGS_KEYS.model, document.getElementById("api-model").value.trim() || DEFAULT_MODEL, mode);
  setSetting(
    SETTINGS_KEYS.researchContext,
    document.getElementById("research-context").value.trim() || DEFAULT_RESEARCH_CONTEXT,
    mode,
  );
}

function clearSettings() {
  Object.values(SETTINGS_KEYS).forEach((key) => {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  });
}

function ensureLocalAiReady() {
  if (hasLocalAiConfig()) return getLocalSettings();
  loadSettings();
  if (settingsDialog && !settingsDialog.open) settingsDialog.showModal();
  throw new Error("请先在“本地增强设置”中填写 API 配置");
}

async function requestLocalCompletion(messages, temperature = 0.3) {
  const settings = ensureLocalAiReady();
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

async function generatePersonalSpark(paper) {
  const settings = ensureLocalAiReady();
  const baseIdea = paper.ai?.idea_spark || {};
  const autoSummary = [
    paper.ai?.tldr ? `TL;DR: ${paper.ai.tldr}` : "",
    paper.ai?.method ? `Method: ${paper.ai.method}` : "",
    paper.ai?.result ? `Result: ${paper.ai.result}` : "",
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

  const raw = await requestLocalCompletion(messages, 0.35);
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
  saveCache("personal_spark", getCurrentScopeCacheKey(), paper.id, variant, payload);
  return payload;
}

async function askFollowup(paper, question) {
  const settings = ensureLocalAiReady();
  const personalSpark = getLatestCache("personal_spark", getCurrentScopeCacheKey(), paper.id);
  const personalSparkText = personalSpark ? formatPersonalSpark(personalSpark) : "暂无";

  const messages = [
    {
      role: "system",
      content: "你是 biology-first 研究助手。请结合论文、自动日报分析、用户研究背景与个性化 spark，给出简洁、可执行、实验导向的回答。请使用中文。",
    },
    {
      role: "user",
      content: `用户研究背景：\n${settings.researchContext || DEFAULT_RESEARCH_CONTEXT}\n\n论文标题：${paper.title}\n论文摘要：${paper.summary}\n自动日报 TL;DR：${paper.ai?.tldr || "暂无"}\n自动日报方法：${paper.ai?.method || "暂无"}\n自动日报结果：${paper.ai?.result || "暂无"}\n我的 Spark：\n${personalSparkText}\n\n问题：${question}`,
    },
  ];

  return (await requestLocalCompletion(messages, 0.3)) || "无返回内容";
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
  return {
    tldr: "TL;DR",
    motivation: "Motivation",
    method: "Method",
    result: "Result",
    help: language === "zh" ? "Research Help" : "Research Help",
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

function renderPaperModal(paper) {
  removePdfOverlay();
  const selectedLanguage = getPreferredAiLanguage();
  const ai = getAiSection(paper.ai || {}, selectedLanguage);
  const idea = ai.idea_spark || {};
  const localSpark = getLatestCache("personal_spark", getCurrentScopeCacheKey(), paper.id);
  const modalBody = document.getElementById("paper-modal-body");
  const modalTitle = document.getElementById("paper-modal-title");
  const modalMeta = document.getElementById("paper-modal-meta");
  const codeLink = findPrimaryCodeLink(paper.code || {});

  modalTitle.textContent = paper.title || "论文详情";
  modalMeta.textContent = `${currentDateLabel || currentDate} · 第 ${currentModalIndex + 1} / ${currentFilteredPapers.length} 篇`;

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
            <div class="detail-value">${escapeHtml((paper.report_dates || [paper.source_date || currentDate]).join("，"))}</div>
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

  const paperLink = document.getElementById("paper-link");
  const pdfLink = document.getElementById("pdf-link");
  const htmlLink = document.getElementById("html-link");
  const codeFooterLink = document.getElementById("code-link");

  paperLink.href = paper.link || "#";
  pdfLink.href = derivePdfUrl(paper.link);
  htmlLink.href = deriveHtmlUrl(paper.link);

  if (codeLink) {
    codeFooterLink.href = codeLink;
    codeFooterLink.style.display = "inline-flex";
  } else {
    codeFooterLink.removeAttribute("href");
    codeFooterLink.style.display = "none";
  }

  bindModalContentEvents(paper);
  updateModalNavigation();
}

function updateModalNavigation() {
  const position = document.getElementById("paper-position");
  const prev = document.getElementById("paper-prev");
  const next = document.getElementById("paper-next");

  if (!currentFilteredPapers.length || currentModalIndex < 0) {
    position.textContent = "-";
    prev.disabled = true;
    next.disabled = true;
    return;
  }

  position.textContent = `${currentModalIndex + 1} / ${currentFilteredPapers.length}`;
  prev.disabled = currentModalIndex <= 0;
  next.disabled = currentModalIndex >= currentFilteredPapers.length - 1;
}

function openPaperModalById(paperId) {
  const idx = currentFilteredPapers.findIndex((paper) => paper.id === paperId);
  if (idx < 0) return;
  currentModalIndex = idx;
  renderPaperModal(currentFilteredPapers[currentModalIndex]);
  paperModal.classList.add("active");
  paperModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
}

function closePaperModal() {
  removePdfOverlay();
  paperModal.classList.remove("active");
  paperModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
  currentModalIndex = -1;
}

function movePaperModal(step) {
  if (!currentFilteredPapers.length) return;
  const nextIndex = currentModalIndex + step;
  if (nextIndex < 0 || nextIndex >= currentFilteredPapers.length) return;
  currentModalIndex = nextIndex;
  renderPaperModal(currentFilteredPapers[currentModalIndex]);
}

function ensureModalOpen() {
  return paperModal && paperModal.classList.contains("active");
}

function bindListEvents() {
  document.querySelectorAll(".paper-card").forEach((card) => {
    card.addEventListener("click", (event) => {
      if (event.target.closest("a, button")) return;
      openPaperModalById(decodeURIComponent(card.dataset.paperId));
    });
  });

  document.querySelectorAll(".details-btn").forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.stopPropagation();
      openPaperModalById(decodeURIComponent(btn.dataset.paperId));
    });
  });
}

function bindModalContentEvents(paper) {
  const modalBody = document.getElementById("paper-modal-body");
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
      renderStatus();
      renderPaperModal(paper);
    });
  });

  modalBody.querySelectorAll(".modal-preset-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      askInput.value = decodeURIComponent(btn.dataset.question || "");
      askInput.focus();
    });
  });

  sparkBtn.addEventListener("click", async () => {
    sparkBtn.disabled = true;
    sparkBtn.textContent = "生成中...";
    try {
      const payload = await generatePersonalSpark(paper);
      sparkAnswer.style.display = "block";
      sparkAnswer.textContent = formatPersonalSpark(payload);
      sparkEmpty.style.display = "none";
      sparkBtn.textContent = "重新生成我的 Spark";
    } catch (err) {
      sparkAnswer.style.display = "block";
      sparkAnswer.textContent = `错误: ${err.message}`;
      sparkEmpty.style.display = "none";
      sparkBtn.textContent = "生成我的 Spark";
    } finally {
      sparkBtn.disabled = false;
    }
  });

  clearBtn.addEventListener("click", () => {
    removePaperCaches("personal_spark", getCurrentScopeCacheKey(), paper.id);
    sparkAnswer.style.display = "none";
    sparkAnswer.textContent = "";
    sparkEmpty.style.display = "block";
    sparkBtn.textContent = "生成我的 Spark";
  });

  askBtn.addEventListener("click", async () => {
    const question = askInput.value.trim();
    if (!question) return;
    askBtn.disabled = true;
    askBtn.textContent = "思考中...";
    try {
      const answer = await askFollowup(paper, question);
      askAnswer.style.display = "block";
      askAnswer.textContent = answer;
    } catch (err) {
      askAnswer.style.display = "block";
      askAnswer.textContent = `错误: ${err.message}`;
    } finally {
      askBtn.disabled = false;
      askBtn.textContent = "提问";
    }
  });

  expandBtn.addEventListener("click", () => togglePdfSize(expandBtn));
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

async function main() {
  applyTheme(getTheme(), false);

  const index = await resolveDataBasePath();
  document.getElementById("title").textContent = index.title || "ArXiv Research Assistant";
  availableDates = [...(index.dates || [])];

  const select = document.getElementById("date-select");
  availableDates.forEach((date) => {
    const option = document.createElement("option");
    option.value = date;
    option.textContent = date;
    select.appendChild(option);
  });

  const initial = index.latest || (index.dates || [])[0];
  if (!initial) {
    document.getElementById("meta").textContent = "暂无数据，请先运行 pipeline。";
    return;
  }

  select.value = initial;
  await loadScope({ mode: "single", date: initial });

  document.getElementById("domain-filter").addEventListener("change", () => applyDomainFilter());

  settingsDialog = document.getElementById("settings-dialog");
  paperModal = document.getElementById("paper-modal");
  themeDialog = document.getElementById("theme-dialog");
  dateDialog = document.getElementById("date-dialog");
  renderStatus();
  syncDateDialog();

  document.getElementById("open-date-picker").addEventListener("click", () => {
    syncDateDialog();
    if (!dateDialog.open) dateDialog.showModal();
  });

  document.querySelectorAll(".mode-toggle-btn").forEach((button) => {
    button.addEventListener("click", () => {
      syncDateDialog({ ...readScopeFromDialog(), mode: button.dataset.mode || "single" });
    });
  });

  document.querySelectorAll(".date-quick-btn").forEach((button) => {
    button.addEventListener("click", () => {
      const scope = buildRangeScopeFromCount(button.dataset.range || "latest");
      if (!scope) return;
      syncDateDialog(scope);
    });
  });

  document.getElementById("apply-date-selection").addEventListener("click", async () => {
    const scope = readScopeFromDialog();
    const button = document.getElementById("apply-date-selection");
    button.disabled = true;
    button.textContent = "加载中...";
    try {
      const resolvedScope =
        scope.mode === "range"
          ? {
              mode: "range",
              start: scope.start,
              end: scope.end,
            }
          : { mode: "single", date: clampDateToAvailable(scope.date) };
      await loadScope(resolvedScope);
      dateDialog.close();
    } catch (err) {
      window.alert(err.message || "加载日期范围失败");
    } finally {
      button.disabled = false;
      button.textContent = "应用";
      syncDateDialog();
    }
  });

  document.getElementById("open-theme-picker").addEventListener("click", () => {
    updateThemeSelectionUI();
    if (!themeDialog.open) themeDialog.showModal();
  });

  document.getElementById("open-settings").addEventListener("click", () => {
    loadSettings();
    if (!settingsDialog.open) settingsDialog.showModal();
  });

  document.getElementById("save-settings").addEventListener("click", (event) => {
    event.preventDefault();
    saveSettings();
    renderStatus();
    settingsDialog.close();
  });

  document.getElementById("clear-settings").addEventListener("click", () => {
    if (!window.confirm("确定要清空当前浏览器中的 API、模型与研究背景设置吗？")) return;
    clearSettings();
    loadSettings();
    renderStatus();
  });

  document.querySelectorAll(".theme-option").forEach((option) => {
    option.addEventListener("click", () => {
      applyTheme(option.dataset.theme || DEFAULT_THEME);
      renderStatus();
    });
  });

  document.getElementById("reset-theme").addEventListener("click", () => {
    applyTheme(DEFAULT_THEME);
    renderStatus();
  });

  document.getElementById("close-paper-modal").addEventListener("click", () => closePaperModal());
  document.getElementById("paper-prev").addEventListener("click", () => movePaperModal(-1));
  document.getElementById("paper-next").addEventListener("click", () => movePaperModal(1));

  paperModal.addEventListener("click", (event) => {
    if (event.target === paperModal) {
      if (document.querySelector(".pdf-container.expanded")) {
        removePdfOverlay();
      } else {
        closePaperModal();
      }
    }
  });

  document.addEventListener("keydown", (event) => {
    if (!ensureModalOpen()) return;
    if (event.key === "Escape") {
      if (document.querySelector(".pdf-container.expanded")) {
        removePdfOverlay();
      } else {
        closePaperModal();
      }
    } else if (event.key === "ArrowLeft") {
      movePaperModal(-1);
    } else if (event.key === "ArrowRight") {
      movePaperModal(1);
    }
  });
}

main().catch((err) => {
  document.getElementById("meta").textContent = `加载失败: ${err.message}`;
});
