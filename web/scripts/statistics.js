const SharedDetailApi = window.PaperDetailShared;
const SharedDetailUtils = SharedDetailApi.utils;

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

function previewText(text, limit = 180) {
  const value = (text || "").replace(/\s+/g, " ").trim();
  if (value.length <= limit) return value;
  return `${value.slice(0, limit).trim()}…`;
}

function formatAuthors(authors = [], maxCount = 4) {
  if (!authors.length) return "未知";
  if (authors.length <= maxCount) return authors.join(", ");
  return `${authors.slice(0, maxCount).join(", ")} 等`;
}

function normalizePaperId(id) {
  return encodeURIComponent(id || "");
}

const THEME_STORAGE_KEY = "ara_theme";
const DEFAULT_THEME = "lavender";
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

let dataBasePath = "../data";
let availableDates = [];
let currentDateMode = "single";
let currentDateLabel = "";
let currentDateRange = null;
let currentPapers = [];
let currentKeyword = "";
let currentRelatedPapers = [];
let dateDialog;
let paperDetailController;

function getTheme() {
  return localStorage.getItem(THEME_STORAGE_KEY) || DEFAULT_THEME;
}

function applyTheme() {
  document.body.dataset.theme = getTheme();
}

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
    : { mode: "single", date: clampDateToAvailable(currentDateRange?.end || availableDates[0]) };
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
  rangeStart.value = clampDateToAvailable(scope.start || minDate);
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

function normalizeKeywordLabel(keyword) {
  return String(keyword || "")
    .toLowerCase()
    .replace(/[^a-z0-9+\-/ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getPaperKeywordMeta(paper) {
  const normalized = Array.from(new Set((paper?.ai?.keywords_normalized || []).map(normalizeKeywordLabel).filter(Boolean)));
  const raw = Array.from(new Set((paper?.ai?.keywords_raw || []).map(normalizeKeywordLabel).filter(Boolean)));
  return { normalized, raw };
}

function extractKeywordRanking(papers, limit = 18) {
  const aiKeywordCounts = new Map();
  const phraseCounts = new Map();

  papers.forEach((paper) => {
    const { normalized } = getPaperKeywordMeta(paper);
    normalized.forEach((keyword) => {
      aiKeywordCounts.set(keyword, (aiKeywordCounts.get(keyword) || 0) + 1);
    });

    const normalizedTitle = String(paper.title || "")
      .toLowerCase()
      .replace(/[^a-z0-9+\-/ ]+/g, " ");

    const filtered = normalizedTitle
      .split(/\s+/)
      .map((word) => word.trim())
      .filter((word) => word.length >= 2 && !KEYWORD_STOPWORDS.has(word));

    for (let n = 3; n >= 1; n -= 1) {
      for (let i = 0; i <= filtered.length - n; i += 1) {
        const phrase = filtered.slice(i, i + n).join(" ");
        if (!phrase || phrase.length < 3 || phrase.length > 28) continue;
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

  const ranked = Array.from(phraseCounts.entries())
    .filter(([phrase, count]) => count >= (phrase.includes(" ") ? 2 : 2) && !/^\d+$/.test(phrase))
    .map(([label, count]) => ({
      label,
      count,
      score: count * (label.split(" ").length <= 2 ? 1.5 : 2),
    }))
    .sort((a, b) => b.score - a.score || b.count - a.count || a.label.localeCompare(b.label));

  const results = [];
  for (const entry of ranked) {
    if (results.some((item) => item.label.includes(entry.label) || entry.label.includes(item.label))) continue;
    results.push({ label: entry.label, count: entry.count });
    if (results.length >= limit) break;
  }
  return results;
}

function buildScopeCacheKey() {
  if (currentDateMode === "range" && currentDateRange) {
    return `${currentDateRange.start}_to_${currentDateRange.end}`;
  }
  return currentDateRange?.end || availableDates[0] || "";
}

function renderSummary(scopeDates) {
  const summary = document.getElementById("statistics-summary");
  if (!summary) return;

  const domainCount = new Set(currentPapers.map((paper) => paper.domain || "general")).size;
  summary.innerHTML = `
    <span class="meta-pill meta-pill-strong">${escapeHtml(currentDateLabel)}</span>
    <span class="meta-pill">${escapeHtml(String(currentPapers.length || 0))} 篇当前结果</span>
    <span class="meta-pill">${escapeHtml(String(domainCount || 0))} 个领域</span>
    <span class="meta-pill">${currentDateMode === "range" ? `${scopeDates.length} 天聚合统计` : "单日统计"}</span>
    <span class="meta-pill">点击论文卡片直接查看详情</span>
  `;
}

function bindRelatedPaperEvents() {
  document.querySelectorAll(".related-paper-card[data-paper-id]").forEach((card) => {
    const openDetail = () => {
      paperDetailController?.openById(decodeURIComponent(card.dataset.paperId || ""));
    };

    card.addEventListener("click", (event) => {
      if (event.target.closest("a, button")) return;
      openDetail();
    });

    card.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openDetail();
    });
  });
}

function renderRelatedPapers(keyword) {
  currentKeyword = keyword;
  const relatedTitle = document.getElementById("related-title");
  const container = document.getElementById("related-papers");
  if (!container || !relatedTitle) return;

  const normalizedKeyword = normalizeKeywordLabel(keyword);
  const matched = currentPapers.filter((paper) => {
    const { normalized, raw } = getPaperKeywordMeta(paper);
    if (normalized.includes(normalizedKeyword)) return true;
    if (raw.some((item) => item.includes(normalizedKeyword) || normalizedKeyword.includes(item))) return true;
    return `${paper.title || ""} ${paper.summary || ""}`.toLowerCase().includes(normalizedKeyword);
  });

  currentRelatedPapers = matched.slice(0, 24);
  relatedTitle.textContent = `Related Papers · ${keyword}`;

  if (paperDetailController?.isOpen()) {
    paperDetailController.close();
  }

  if (!currentRelatedPapers.length) {
    container.innerHTML = `<div class="stats-empty">当前范围内没有命中该关键词的论文。</div>`;
    return;
  }

  container.innerHTML = currentRelatedPapers
    .map(
      (paper) => `
        <article class="related-paper-card" data-paper-id="${normalizePaperId(paper.id)}" tabindex="0" role="button" aria-label="打开 ${escapeHtml(paper.title || "论文详情")}">
          <div class="related-paper-top">
            <span class="tag">${escapeHtml(paper.domain || "general")}</span>
            <span class="tag">${escapeHtml(paper.source_date || (paper.report_dates || [])[0] || "-")}</span>
          </div>
          <h3 class="related-paper-title">${escapeHtml(paper.title)}</h3>
          <p class="related-paper-authors">${escapeHtml(formatAuthors(paper.authors || []))}</p>
          <div class="related-paper-snippet">${escapeHtml(previewText(paper.ai?.tldr || paper.summary || "", 170))}</div>
          <div class="related-paper-actions">
            <span class="mini-hint">相关度 ${escapeHtml(String(paper.relevance_score ?? ""))}</span>
            <div class="paper-modal-buttons">
              <a class="btn ghost resource-btn" href="${escapeHtml(paper.link || "#")}" target="_blank" rel="noreferrer">arXiv</a>
              <a class="btn ghost resource-btn" href="${escapeHtml(SharedDetailUtils.derivePdfUrl(paper.link))}" target="_blank" rel="noreferrer">PDF</a>
            </div>
          </div>
        </article>
      `,
    )
    .join("");

  bindRelatedPaperEvents();

  document.querySelectorAll(".keyword-item").forEach((button) => {
    button.classList.toggle("active", button.dataset.keyword === keyword);
  });
}

function renderKeywords() {
  const keywords = extractKeywordRanking(currentPapers);
  const container = document.getElementById("keyword-list");
  if (!container) return;

  if (!keywords.length) {
    currentKeyword = "";
    currentRelatedPapers = [];
    if (paperDetailController?.isOpen()) paperDetailController.close();
    container.innerHTML = `<div class="stats-empty">当前结果较少，暂时无法生成稳定的热门关键词。</div>`;
    document.getElementById("related-papers").innerHTML = "";
    document.getElementById("related-title").textContent = "Related Papers";
    return;
  }

  container.innerHTML = keywords
    .map(
      (item, index) => `
        <button type="button" class="keyword-item${item.label === currentKeyword ? " active" : ""}" data-keyword="${escapeHtml(item.label)}">
          <span class="keyword-rank">${index + 1}</span>
          <span class="keyword-text">${escapeHtml(item.label)}</span>
          <span class="keyword-count">${escapeHtml(String(item.count))}</span>
        </button>
      `,
    )
    .join("");

  container.querySelectorAll(".keyword-item").forEach((button) => {
    button.addEventListener("click", () => renderRelatedPapers(button.dataset.keyword || ""));
  });

  const initialKeyword = keywords.some((item) => item.label === currentKeyword) ? currentKeyword : keywords[0].label;
  renderRelatedPapers(initialKeyword);
}

async function loadScope(scope) {
  const scopeDates = getScopeDates(scope);
  if (!scopeDates.length) throw new Error("当前所选日期范围内没有可用日报");

  const payloads = await Promise.all(scopeDates.map((date) => fetchDataJson(`daily/${date}.json`)));
  currentPapers = aggregateDailyPayloads(payloads);
  currentDateMode = scope.mode;
  currentDateLabel = buildDateScopeLabel(
    scope.mode === "single"
      ? scope
      : { mode: "range", start: scopeDates[scopeDates.length - 1], end: scopeDates[0] },
  );
  currentDateRange =
    scope.mode === "range"
      ? { start: scopeDates[scopeDates.length - 1], end: scopeDates[0], dates: scopeDates }
      : { start: scopeDates[0], end: scopeDates[0], dates: scopeDates };

  updateDateTrigger(scope.mode === "single" ? scope : { mode: "range", start: currentDateRange.start, end: currentDateRange.end });
  currentKeyword = "";
  currentRelatedPapers = [];
  renderSummary(scopeDates);
  renderKeywords();
}

async function main() {
  applyTheme();
  const index = await resolveDataBasePath();
  availableDates = [...(index.dates || [])];
  dateDialog = document.getElementById("date-dialog");
  SharedDetailUtils.enableDialogOutsideClose(dateDialog);

  paperDetailController = SharedDetailApi.createController({
    getPapers: () => currentRelatedPapers,
    getScopeLabel: () => (currentKeyword ? `${currentDateLabel} · ${currentKeyword}` : currentDateLabel),
    getScopeCacheKey: () => buildScopeCacheKey(),
  }).init();

  const initial = index.latest || availableDates[0];
  if (!initial) {
    document.getElementById("statistics-summary").innerHTML = `<div class="stats-empty">暂无数据，请先运行 pipeline。</div>`;
    return;
  }

  await loadScope({ mode: "single", date: initial });
  syncDateDialog({ mode: "single", date: initial });

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
          ? { mode: "range", start: scope.start, end: scope.end }
          : { mode: "single", date: clampDateToAvailable(scope.date) };
      await loadScope(resolvedScope);
      dateDialog.close();
    } catch (err) {
      window.alert(err.message || "加载统计数据失败");
    } finally {
      button.disabled = false;
      button.textContent = "应用";
      syncDateDialog();
    }
  });
}

main().catch((err) => {
  const summary = document.getElementById("statistics-summary");
  if (summary) {
    summary.innerHTML = `<div class="stats-empty">加载失败：${escapeHtml(err.message || "unknown error")}</div>`;
  }
});
