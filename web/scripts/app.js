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

function normalizePaperId(id) {
  return encodeURIComponent(id || "");
}

function getTheme() {
  const saved = localStorage.getItem(THEME_STORAGE_KEY);
  return THEMES[saved] ? saved : DEFAULT_THEME;
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

let currentPapers = [];
let currentFilteredPapers = [];
let currentDate = "";
let currentDateLabel = "";
let currentDateMode = "single";
let currentDateRange = null;
let themeDialog;
let dateDialog;
let dataBasePath = "../data";
let availableDates = [];

const THEME_STORAGE_KEY = "ara_theme";
const DEFAULT_THEME = "lavender";
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
  const aiKeywordCounts = new Map();
  const phraseCounts = new Map();
  const wordCounts = new Map();

  papers.forEach((paper) => {
    const normalizedKeywords = Array.from(
      new Set(
        (paper?.ai?.keywords_normalized || [])
          .map((keyword) =>
            String(keyword || "")
              .toLowerCase()
              .replace(/[^a-z0-9+\-/ ]+/g, " ")
              .replace(/\s+/g, " ")
              .trim(),
          )
          .filter(Boolean),
      ),
    );
    normalizedKeywords.forEach((keyword) => {
      aiKeywordCounts.set(keyword, (aiKeywordCounts.get(keyword) || 0) + 1);
    });

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

  const aiKeywordEntries = Array.from(aiKeywordCounts.entries())
    .filter(([, count]) => count >= (papers.length >= 8 ? 2 : 1))
    .map(([label, count]) => ({ label, count, score: count * 3 }))
    .sort((a, b) => b.score - a.score || b.count - a.count || a.label.localeCompare(b.label));

  if (aiKeywordEntries.length) {
    return aiKeywordEntries.slice(0, limit).map(({ label, count }) => ({ label, count }));
  }

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

const PaperDetailSharedApi = window.PaperDetailShared;
const PaperDetailUtils = PaperDetailSharedApi.utils;
let paperDetailController;

function renderStatus() {
  const settings = PaperDetailUtils.getLocalSettings();
  const target = document.getElementById("local-status");
  const modeText = settings.storageMode === "session" ? "仅本次会话" : "记住此设备";
  const contextText = settings.researchContext ? "已配置个性化 research context" : "未配置 research context";
  const themeText = THEMES[getTheme()]?.label || THEMES[DEFAULT_THEME].label;
  const aiLanguageText = PaperDetailUtils.getAiLanguageMeta(PaperDetailUtils.getPreferredAiLanguage()).label;
  const viewText = currentDateLabel ? `${currentDateLabel} · ${currentDateMode === "range" ? "范围浏览" : "单日浏览"}` : "尚未加载";
  const localAiReady = PaperDetailUtils.hasLocalAiConfig();
  const configText = localAiReady
    ? `<span class="ok">已就绪</span>：可直接生成 personalized spark / 继续提问`
    : `<span class="warn">未配置</span>：点击右上角“本地增强设置”后再使用 personalized spark`;
  const mobileConfigSummary = localAiReady ? "本地增强已配置" : "本地增强未配置";
  const mobilePaperSummary = currentPapers.length ? `${currentPapers.length} 篇` : "暂无论文";

  target.innerHTML = `
    <div class="local-status-desktop">
      <strong>自动日报：</strong>由 GitHub 每日抓取并分析，打开网页即可查看当日结果。<br />
      <strong>本地增强：</strong>${configText}<br />
      <strong>当前视图：</strong>${escapeHtml(viewText)}<br />
      <strong>保存方式：</strong>${escapeHtml(modeText)} · <strong>研究背景：</strong>${escapeHtml(contextText)} · <strong>当前配色：</strong>${escapeHtml(themeText)} · <strong>详情语言：</strong>${escapeHtml(aiLanguageText)}
    </div>
    <details class="local-status-mobile">
      <summary class="local-status-mobile-summary">
        <span class="local-status-mobile-title">${escapeHtml(viewText)}</span>
        <span class="local-status-mobile-hint">展开状态</span>
      </summary>
      <div class="local-status-mobile-pills">
        <span class="meta-pill meta-pill-strong">${escapeHtml(mobilePaperSummary)}</span>
        <span class="meta-pill">${escapeHtml(mobileConfigSummary)}</span>
        <span class="meta-pill">${escapeHtml(themeText)}</span>
        <span class="meta-pill">${escapeHtml(aiLanguageText)}</span>
      </div>
      <div class="local-status-mobile-body">
        <div class="local-status-mobile-row"><strong>自动日报</strong><span>由 GitHub 每日抓取并分析，打开网页即可查看当日结果。</span></div>
        <div class="local-status-mobile-row"><strong>本地增强</strong><span>${configText}</span></div>
        <div class="local-status-mobile-row"><strong>保存方式</strong><span>${escapeHtml(modeText)}</span></div>
        <div class="local-status-mobile-row"><strong>研究背景</strong><span>${escapeHtml(contextText)}</span></div>
      </div>
    </details>
  `;
}

function paperCard(p, idx) {
  const ai = PaperDetailUtils.getAiSection(p.ai || {}, PaperDetailUtils.getPreferredAiLanguage());
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
      : escapeHtml(PaperDetailUtils.formatPublished(p.published));

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
    paperDetailController?.refresh();
    return;
  }

  container.innerHTML = list.map((paper, idx) => paperCard(paper, idx)).join("");
  bindListEvents();
  paperDetailController?.refresh();
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

function bindListEvents() {
  document.querySelectorAll(".paper-card").forEach((card) => {
    card.addEventListener("click", (event) => {
      if (event.target.closest("a, button")) return;
      paperDetailController?.openById(decodeURIComponent(card.dataset.paperId));
    });
  });

  document.querySelectorAll(".details-btn").forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.stopPropagation();
      paperDetailController?.openById(decodeURIComponent(btn.dataset.paperId));
    });
  });
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

  paperDetailController = PaperDetailSharedApi.createController({
    getPapers: () => currentFilteredPapers,
    getScopeLabel: () => currentDateLabel || currentDate,
    getScopeCacheKey: () => getCurrentScopeCacheKey(),
    onStateChange: () => renderStatus(),
  }).init();
  themeDialog = document.getElementById("theme-dialog");
  dateDialog = document.getElementById("date-dialog");
  [themeDialog, dateDialog].forEach((dialog) => PaperDetailUtils.enableDialogOutsideClose(dialog));
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
    paperDetailController?.showSettings();
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

}

main().catch((err) => {
  document.getElementById("meta").textContent = `加载失败: ${err.message}`;
});
