(() => {
  const { data, dateScope, keywords, theme, utils } = window.ARA.shared;
  const detail = window.ARA.paperDetail;
  const { aggregateDailyPayloads, fetchDataJson, resolveDataBasePath } = data;
  const { buildDateScopeLabel, buildRangeScopeFromCount, clampDateToAvailable, getDateDialogScope, getScopeDates, readScopeFromDialog, syncDateDialog, updateDateTrigger } = dateScope;
  const { extractKeywordRanking, getPaperKeywordMeta, normalizeKeywordLabel } = keywords;
  const { applyTheme, getTheme } = theme;
  const { hydratePresetButtons } = window.ARA.shared.buttons;
  const { derivePdfUrl, enableDialogOutsideClose, escapeHtml, formatAuthors, normalizePaperId, previewText } = utils;

  let availableDates = [];
  let currentDate = "";
  let currentDateMode = "single";
  let currentDateLabel = "";
  let currentDateRange = null;
  let currentKeyword = "";
  let currentPapers = [];
  let currentRelatedPapers = [];
  let paperDetailController;

  const currentDialogScope = () => getDateDialogScope({ currentDateMode, currentDate, currentDateRange, availableDates, defaultSingleDate: currentDateRange?.end || availableDates[0] });
  const syncDateSelectionDialog = (scope = currentDialogScope()) => syncDateDialog({ availableDates, scope, singleFallbackDate: currentDateRange?.end || availableDates[0], rangeFallbackStart: scope.start || availableDates[availableDates.length - 1] || availableDates[0] });
  const buildScopeCacheKey = () => (currentDateMode === "range" && currentDateRange ? `${currentDateRange.start}_to_${currentDateRange.end}` : currentDate || availableDates[0] || "");

  const renderSummary = (scopeDates) => {
    const domains = new Set(currentPapers.map((paper) => paper.domain || "general")).size;
    document.getElementById("statistics-summary").innerHTML = `<span class="meta-pill meta-pill-strong">${escapeHtml(currentDateLabel)}</span><span class="meta-pill">${escapeHtml(String(currentPapers.length || 0))} papers</span><span class="meta-pill">${escapeHtml(String(domains || 0))} domains</span><span class="meta-pill">${currentDateMode === "range" ? `${scopeDates.length}-day stats` : "Single day"}</span>`;
  };

  const bindRelatedPaperEvents = () => {
    document.querySelectorAll(".related-paper-card[data-paper-id]").forEach((card) => {
      const openDetail = () => paperDetailController?.openById(decodeURIComponent(card.dataset.paperId || ""));
      card.addEventListener("click", (event) => !event.target.closest("a, button") && openDetail());
      card.addEventListener("keydown", (event) => ((event.key === "Enter" || event.key === " ") && (event.preventDefault(), openDetail())));
    });
  };

  const renderRelatedPapers = (keyword) => {
    currentKeyword = keyword;
    const normalizedKeyword = normalizeKeywordLabel(keyword);
    currentRelatedPapers = currentPapers.filter((paper) => {
      const { normalized, raw } = getPaperKeywordMeta(paper);
      return normalized.includes(normalizedKeyword) || raw.some((item) => item.includes(normalizedKeyword) || normalizedKeyword.includes(item)) || `${paper.title || ""} ${paper.summary || ""}`.toLowerCase().includes(normalizedKeyword);
    }).slice(0, 24);
    document.getElementById("related-title").textContent = `Related Papers · ${keyword}`;
    if (paperDetailController?.isOpen()) paperDetailController.close();
    const relatedPapersNode = document.getElementById("related-papers");
    relatedPapersNode.innerHTML = currentRelatedPapers.length
      ? currentRelatedPapers
          .map((paper) => `
            <article class="related-paper-card" data-paper-id="${normalizePaperId(paper.id)}" tabindex="0" role="button" aria-label="Open ${escapeHtml(paper.title || "paper details")}">
              <div class="related-paper-top"><span class="tag">${escapeHtml(paper.domain || "general")}</span><span class="tag">${escapeHtml(paper.source_date || (paper.report_dates || [])[0] || "-")}</span></div>
              <h3 class="related-paper-title">${escapeHtml(paper.title)}</h3>
              <p class="related-paper-authors">${escapeHtml(formatAuthors(paper.authors || []))}</p>
              <div class="related-paper-snippet">${escapeHtml(previewText(detail.utils.getAiSection(paper.ai || {}, "zh").tldr || paper.summary || "", 170))}</div>
              <div class="related-paper-actions"><span class="mini-hint">Score ${escapeHtml(String(paper.relevance_score ?? ""))}</span><div class="paper-modal-buttons"><a class="btn ghost resource-btn" href="${escapeHtml(paper.link || "#")}" target="_blank" rel="noreferrer" data-resource-icon="arxiv"></a><a class="btn ghost resource-btn" href="${escapeHtml(derivePdfUrl(paper.link))}" target="_blank" rel="noreferrer" data-resource-icon="pdf"></a></div></div>
            </article>
          `)
          .join("")
      : '<div class="stats-empty">No papers match this keyword in the current scope.</div>';
    hydratePresetButtons(relatedPapersNode);
    document.querySelectorAll(".keyword-item").forEach((button) => button.classList.toggle("active", button.dataset.keyword === keyword));
    bindRelatedPaperEvents();
  };

  const renderKeywords = () => {
    const list = extractKeywordRanking(currentPapers);
    const container = document.getElementById("keyword-list");
    if (!list.length) {
      currentKeyword = "";
      currentRelatedPapers = [];
      if (paperDetailController?.isOpen()) paperDetailController.close();
      container.innerHTML = '<div class="stats-empty">Not enough papers to build stable keywords yet.</div>';
      document.getElementById("related-papers").innerHTML = "";
      document.getElementById("related-title").textContent = "Related Papers";
      return;
    }
    container.innerHTML = list.map((item, index) => `<button type="button" class="keyword-item${item.label === currentKeyword ? " active" : ""}" data-keyword="${escapeHtml(item.label)}"><span class="keyword-rank">${index + 1}</span><span class="keyword-text">${escapeHtml(item.label)}</span><span class="keyword-count">${escapeHtml(String(item.count))}</span></button>`).join("");
    container.querySelectorAll(".keyword-item").forEach((button) => button.addEventListener("click", () => renderRelatedPapers(button.dataset.keyword || "")));
    renderRelatedPapers(list.some((item) => item.label === currentKeyword) ? currentKeyword : list[0].label);
  };

  const loadScope = async (scope) => {
    const scopeDates = getScopeDates(availableDates, scope);
    if (!scopeDates.length) throw new Error("No daily reports found in the selected range.");
    currentPapers = aggregateDailyPayloads(await Promise.all(scopeDates.map((date) => fetchDataJson(`daily/${date}.json`))));
    currentDateMode = scope.mode;
    currentDate = scope.mode === "single" ? scope.date : scopeDates[0];
    currentDateRange = scope.mode === "range" ? { start: scopeDates[scopeDates.length - 1], end: scopeDates[0], dates: scopeDates } : { start: scopeDates[0], end: scopeDates[0], dates: scopeDates };
    currentDateLabel = buildDateScopeLabel(scope.mode === "single" ? scope : { mode: "range", start: currentDateRange.start, end: currentDateRange.end });
    currentKeyword = "";
    currentRelatedPapers = [];
    updateDateTrigger(scope.mode === "single" ? scope : { mode: "range", start: currentDateRange.start, end: currentDateRange.end });
    renderSummary(scopeDates);
    renderKeywords();
  };

  const main = async () => {
    applyTheme(getTheme(), false);
    const index = await resolveDataBasePath();
    availableDates = [...(index.dates || [])];
    enableDialogOutsideClose(document.getElementById("date-dialog"));
    paperDetailController = detail.createController({ getPapers: () => currentRelatedPapers, getScopeLabel: () => (currentKeyword ? `${currentDateLabel} · ${currentKeyword}` : currentDateLabel), getScopeCacheKey: buildScopeCacheKey }).init();
    const initial = index.latest || availableDates[0];
    if (!initial) return void (document.getElementById("statistics-summary").innerHTML = '<div class="stats-empty">No data yet. Run the pipeline first.</div>');
    await loadScope({ mode: "single", date: initial });
    syncDateSelectionDialog({ mode: "single", date: initial });
    document.getElementById("open-date-picker").addEventListener("click", () => {
      const dialog = document.getElementById("date-dialog");
      syncDateSelectionDialog();
      if (!dialog.open) dialog.showModal();
    });
    document.querySelectorAll(".mode-toggle-btn").forEach((button) => button.addEventListener("click", () => syncDateSelectionDialog({ ...readScopeFromDialog(availableDates), mode: button.dataset.mode || "single" })));
    document.querySelectorAll(".date-quick-btn").forEach((button) => button.addEventListener("click", () => {
      const scope = buildRangeScopeFromCount(availableDates, button.dataset.range || "latest");
      if (scope) syncDateSelectionDialog(scope);
    }));
    document.getElementById("apply-date-selection").addEventListener("click", async () => {
      const button = document.getElementById("apply-date-selection");
      button.disabled = true;
      button.textContent = "Loading...";
      try {
        const scope = readScopeFromDialog(availableDates);
        await loadScope(scope.mode === "range" ? scope : { mode: "single", date: clampDateToAvailable(availableDates, scope.date) });
        document.getElementById("date-dialog").close();
      } catch (error) {
        window.alert(error.message || "Failed to load statistics.");
      } finally {
        button.disabled = false;
        button.textContent = "Apply";
        syncDateSelectionDialog();
      }
    });
  };

  main().catch((error) => {
    document.getElementById("statistics-summary").innerHTML = `<div class="stats-empty">Load failed: ${escapeHtml(error.message || "unknown error")}</div>`;
  });
})();
