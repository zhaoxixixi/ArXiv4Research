(() => {
  const { constants, data, dateScope, theme, utils } = window.ARA.shared;
  const detail = window.ARA.paperDetail;
  const { DEFAULT_DOMAIN_ORDER, DOMAIN_META, DEFAULT_THEME, THEMES } = constants;
  const { aggregateDailyPayloads, fetchDataJson, resolveDataBasePath } = data;
  const { buildDateScopeLabel, buildRangeScopeFromCount, clampDateToAvailable, getDateDialogScope, getScopeDates, readScopeFromDialog, syncDateDialog, updateDateTrigger } = dateScope;
  const { applyTheme, getTheme, updateThemeSelectionUI } = theme;
  const { escapeHtml, formatAffiliations, formatAuthors, formatPublished, normalizePaperId, previewText, enableDialogOutsideClose } = utils;

  let currentPapers = [];
  let currentFilteredPapers = [];
  let currentDate = "";
  let currentDateLabel = "";
  let currentDateMode = "single";
  let currentDateRange = null;
  let availableDates = [];
  let paperDetailController;

  const getCurrentScopeCacheKey = () => (currentDateMode === "range" && currentDateRange ? `${currentDateRange.start}_to_${currentDateRange.end}` : currentDate || availableDates[0] || "");
  const getKnownDomains = (papers = []) => [...DEFAULT_DOMAIN_ORDER, ...Array.from(new Set(papers.map((paper) => paper.domain || "general"))).filter((item) => !DEFAULT_DOMAIN_ORDER.includes(item)).sort()];
  const getDomainLabel = (domain) => DOMAIN_META[domain]?.label || domain;
  const currentDialogScope = () => getDateDialogScope({ currentDateMode, currentDate, currentDateRange, availableDates });
  const syncDateSelectionDialog = (scope = currentDialogScope()) => syncDateDialog({ availableDates, scope, singleFallbackDate: currentDate || availableDates[0], rangeFallbackStart: scope.start || availableDates[Math.min(availableDates.length - 1, 2)] || availableDates[0] });

  const syncDomainOptions = () => {
    const select = document.getElementById("domain-filter");
    if (!select) return;
    const currentValue = select.value || "all";
    const domains = getKnownDomains(currentPapers);
    select.innerHTML = domains.map((domain) => `<option value="${escapeHtml(domain)}">${escapeHtml(getDomainLabel(domain))}</option>`).join("");
    select.value = domains.includes(currentValue) ? currentValue : "all";
  };

  const renderStatus = () => {
    const settings = detail.utils.getLocalSettings();
    const localAiReady = detail.utils.hasLocalAiConfig();
    const modeText = settings.storageMode === "session" ? "仅本次会话" : "记住此设备";
    const contextText = settings.researchContext ? "已配置个性化 research context" : "未配置 research context";
    const themeText = THEMES[getTheme()]?.label || THEMES[DEFAULT_THEME].label;
    const aiLanguageText = detail.utils.getAiLanguageMeta(detail.utils.getPreferredAiLanguage()).label;
    const viewText = currentDateLabel ? `${currentDateLabel} · ${currentDateMode === "range" ? "范围浏览" : "单日浏览"}` : "尚未加载";
    const configText = localAiReady ? '<span class="ok">已就绪</span>：可直接生成 personalized spark / 继续提问' : '<span class="warn">未配置</span>：点击右上角“本地增强设置”后再使用 personalized spark';
    document.getElementById("local-status").innerHTML = `
      <div class="local-status-desktop">
        <strong>自动日报：</strong>由 GitHub 每日抓取并分析，打开网页即可查看当日结果。<br />
        <strong>本地增强：</strong>${configText}<br />
        <strong>当前视图：</strong>${escapeHtml(viewText)}<br />
        <strong>保存方式：</strong>${escapeHtml(modeText)} · <strong>研究背景：</strong>${escapeHtml(contextText)} · <strong>当前配色：</strong>${escapeHtml(themeText)} · <strong>详情语言：</strong>${escapeHtml(aiLanguageText)}
      </div>
      <details class="local-status-mobile">
        <summary class="local-status-mobile-summary"><span class="local-status-mobile-title">${escapeHtml(viewText)}</span><span class="local-status-mobile-hint">展开状态</span></summary>
        <div class="local-status-mobile-pills"><span class="meta-pill meta-pill-strong">${escapeHtml(currentPapers.length ? `${currentPapers.length} 篇` : "暂无论文")}</span><span class="meta-pill">${escapeHtml(localAiReady ? "本地增强已配置" : "本地增强未配置")}</span><span class="meta-pill">${escapeHtml(themeText)}</span><span class="meta-pill">${escapeHtml(aiLanguageText)}</span></div>
        <div class="local-status-mobile-body"><div class="local-status-mobile-row"><strong>自动日报</strong><span>由 GitHub 每日抓取并分析，打开网页即可查看当日结果。</span></div><div class="local-status-mobile-row"><strong>本地增强</strong><span>${configText}</span></div><div class="local-status-mobile-row"><strong>保存方式</strong><span>${escapeHtml(modeText)}</span></div><div class="local-status-mobile-row"><strong>研究背景</strong><span>${escapeHtml(contextText)}</span></div></div>
      </details>
    `;
  };

  const paperCard = (paper, index) => {
    const ai = detail.utils.getAiSection(paper.ai || {}, detail.utils.getPreferredAiLanguage());
    const codeTag = paper.code?.has_code ? '<span class="tag">Code</span>' : "";
    const affiliationPreview = formatAffiliations(paper.affiliations || []);
    const reportMeta = currentDateMode === "range" ? `日报 ${escapeHtml(paper.source_date || (paper.report_dates || [])[0] || "-")}${(paper.report_dates || []).length > 1 ? ` · 入选 ${escapeHtml(String(paper.report_dates.length))} 次` : ""}` : escapeHtml(formatPublished(paper.published));
    return `
      <article class="paper-card panel" data-paper-id="${normalizePaperId(paper.id)}">
        <div class="paper-card-head"><div class="paper-card-order">#${index + 1}</div><div class="paper-card-tags">${codeTag}<span class="tag">${escapeHtml(paper.domain || "general")}</span></div></div>
        <h3 class="paper-card-title">${escapeHtml(paper.title)}</h3>
        <p class="paper-card-authors">${escapeHtml(formatAuthors(paper.authors || []))}</p>
        ${affiliationPreview ? `<p class="paper-card-affiliations">${escapeHtml(affiliationPreview)}</p>` : ""}
        <div class="paper-card-meta"><span>${reportMeta}</span><span>相关度 ${escapeHtml(String(paper.relevance_score ?? ""))}</span></div>
        <p class="paper-card-preview">${escapeHtml(previewText(ai.tldr || paper.summary || "", 170))}</p>
        <p class="paper-card-help">${escapeHtml(previewText(ai.help_to_user || ai.idea_spark?.idea || "点击查看详情，阅读完整中文简介与 PDF。", 110))}</p>
        <div class="paper-card-footer"><div class="paper-card-categories">${escapeHtml((paper.categories || []).join(", "))}</div><button type="button" class="btn details-btn" data-paper-id="${normalizePaperId(paper.id)}">查看详情</button></div>
      </article>
    `;
  };

  const bindListEvents = () => {
    document.querySelectorAll(".paper-card").forEach((card) => card.addEventListener("click", (event) => !event.target.closest("a, button") && paperDetailController?.openById(decodeURIComponent(card.dataset.paperId || ""))));
    document.querySelectorAll(".details-btn").forEach((button) => button.addEventListener("click", (event) => (event.stopPropagation(), paperDetailController?.openById(decodeURIComponent(button.dataset.paperId || "")))));
  };

  const renderPaperList = (papers) => {
    const container = document.getElementById("papers");
    container.innerHTML = papers.length ? papers.map(paperCard).join("") : '<div class="empty-state panel">当前筛选条件下暂无论文。请切换日期或领域后重试。</div>';
    if (papers.length) bindListEvents();
    paperDetailController?.refresh();
  };

  const renderDomainChips = () => {
    const container = document.getElementById("domain-filter-chips");
    const select = document.getElementById("domain-filter");
    if (!container || !select) return;
    syncDomainOptions();
    const counts = currentPapers.reduce((acc, paper) => ((acc[paper.domain || "general"] = (acc[paper.domain || "general"] || 0) + 1), (acc.all += 1), acc), { all: 0 });
    container.innerHTML = Array.from(select.options)
      .map((option) => ({ value: option.value, label: getDomainLabel(option.value), count: counts[option.value] || (option.value === "all" ? counts.all : 0) }))
      .map((item) => `<button type="button" class="filter-chip${item.value === select.value ? " active" : ""}" data-domain="${escapeHtml(item.value)}"><span class="filter-chip-label">${escapeHtml(item.label)}</span><span class="filter-chip-count">${escapeHtml(String(item.count || 0))}</span></button>`)
      .join("");
    container.querySelectorAll(".filter-chip").forEach((button) => button.addEventListener("click", () => ((select.value = button.dataset.domain || "all"), applyDomainFilter())));
  };

  const applyDomainFilter = () => {
    const selected = document.getElementById("domain-filter").value;
    currentFilteredPapers = selected === "all" ? currentPapers : currentPapers.filter((paper) => (paper.domain || "general") === selected);
    renderDomainChips();
    renderPaperList(currentFilteredPapers);
  };

  const loadScope = async (scope) => {
    const scopeDates = getScopeDates(availableDates, scope);
    if (!scopeDates.length) throw new Error("当前所选日期范围内没有可用日报");
    currentPapers = aggregateDailyPayloads(await Promise.all(scopeDates.map((date) => fetchDataJson(`daily/${date}.json`))));
    currentDateMode = scope.mode;
    currentDate = scope.mode === "single" ? scope.date : scopeDates[0];
    currentDateRange = scope.mode === "range" ? { start: scopeDates[scopeDates.length - 1], end: scopeDates[0], dates: scopeDates } : null;
    currentDateLabel = buildDateScopeLabel(scope.mode === "single" ? scope : { mode: "range", start: currentDateRange.start, end: currentDateRange.end });
    document.getElementById("date-select").value = scopeDates[0];
    updateDateTrigger(scope.mode === "single" ? scope : { mode: "range", start: currentDateRange.start, end: currentDateRange.end });
    document.getElementById("meta").innerHTML = `<span class="meta-pill meta-pill-strong">${escapeHtml(currentDateLabel)}</span><span class="meta-pill">${escapeHtml(String(currentPapers.length || 0))} 篇当前结果</span><span class="meta-pill">${currentDateMode === "range" ? `${scopeDates.length} 天聚合浏览` : "单日浏览"}</span><span class="meta-pill">点击卡片查看双语简介、单位与 PDF</span>`;
    renderStatus();
    applyDomainFilter();
  };

  const main = async () => {
    applyTheme(getTheme(), false);
    const index = await resolveDataBasePath();
    availableDates = [...(index.dates || [])];
    document.getElementById("title").textContent = index.title || "ArXiv Research Assistant";
    const select = document.getElementById("date-select");
    availableDates.forEach((date) => select.appendChild(Object.assign(document.createElement("option"), { value: date, textContent: date })));
    const initial = index.latest || availableDates[0];
    if (!initial) return void (document.getElementById("meta").textContent = "暂无数据，请先运行 pipeline。");
    await loadScope({ mode: "single", date: initial });
    paperDetailController = detail.createController({ getPapers: () => currentFilteredPapers, getScopeLabel: () => currentDateLabel || currentDate, getScopeCacheKey: getCurrentScopeCacheKey, onStateChange: renderStatus }).init();
    [document.getElementById("theme-dialog"), document.getElementById("date-dialog")].forEach(enableDialogOutsideClose);
    renderStatus();
    syncDateSelectionDialog();
    document.getElementById("domain-filter").addEventListener("change", applyDomainFilter);
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
      button.textContent = "加载中...";
      try {
        const scope = readScopeFromDialog(availableDates);
        await loadScope(scope.mode === "range" ? scope : { mode: "single", date: clampDateToAvailable(availableDates, scope.date) });
        document.getElementById("date-dialog").close();
      } catch (error) {
        window.alert(error.message || "加载日期范围失败");
      } finally {
        button.disabled = false;
        button.textContent = "应用";
        syncDateSelectionDialog();
      }
    });
    document.getElementById("open-theme-picker").addEventListener("click", () => {
      const dialog = document.getElementById("theme-dialog");
      updateThemeSelectionUI();
      if (!dialog.open) dialog.showModal();
    });
    document.getElementById("open-settings").addEventListener("click", () => paperDetailController?.showSettings());
    document.querySelectorAll(".theme-option").forEach((option) => option.addEventListener("click", () => (applyTheme(option.dataset.theme || DEFAULT_THEME), renderStatus())));
    document.getElementById("reset-theme").addEventListener("click", () => (applyTheme(DEFAULT_THEME), renderStatus()));
  };

  main().catch((error) => {
    document.getElementById("meta").textContent = `加载失败: ${escapeHtml(error.message || "unknown error")}`;
  });
})();
