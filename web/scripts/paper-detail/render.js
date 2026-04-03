(() => {
  const ARA = (window.ARA = window.ARA || {});
  const paperDetail = (ARA.paperDetail = ARA.paperDetail || {});
  const { PRESET_QUESTIONS } = ARA.shared.constants;
  const { derivePdfUrl, escapeHtml, findPrimaryCodeLink, formatPublished, getDisplayKeywords } = ARA.shared.utils;

  const buildAnalysisCard = (title, content, variant = "") =>
    content
      ? `
        <section class="analysis-card ${variant}">
          <h4 class="analysis-card-title">${escapeHtml(title)}</h4>
          <div class="analysis-card-body">${escapeHtml(content)}</div>
        </section>
      `
      : "";

  const getReferenceAnalysisTitles = () => ({
    tldr: "TL;DR",
    motivation: "Motivation",
    method: "Method",
    result: "Result",
    help: "Research Help",
    spark: "Idea Spark",
    sparkRisk: "Risk",
    sparkInspiration: "Inspiration",
  });

  const renderAnalysisCards = (ai = {}, idea = {}) => {
    const display = getReferenceAnalysisTitles();
    const cards = [
      buildAnalysisCard(display.motivation, ai.motivation),
      buildAnalysisCard(display.method, ai.method),
      buildAnalysisCard(display.result, ai.result),
      buildAnalysisCard(display.help, ai.help_to_user, "analysis-card-highlight"),
      buildAnalysisCard(display.spark, idea.idea, "analysis-card-highlight"),
      buildAnalysisCard(display.sparkRisk, idea.risk),
      buildAnalysisCard(display.sparkInspiration, idea.inspiration),
    ].filter(Boolean);
    if (!ai.tldr && !cards.length) return "";
    return `
      <section class="detail-section detail-analysis-section">
        ${
          ai.tldr
            ? `<section class="analysis-tldr-block"><h3>${escapeHtml(display.tldr)}</h3><p class="analysis-tldr-text">${escapeHtml(ai.tldr)}</p></section>`
            : ""
        }
        ${cards.length ? `<div class="analysis-grid">${cards.join("")}</div>` : ""}
      </section>
    `;
  };

  const renderCodeLinks = (code = {}) => {
    const links = [
      ...(code.github || []).map((url) => ({ label: "GitHub", url })),
      ...(code.huggingface || []).map((url) => ({ label: "HuggingFace", url })),
      ...(code.colab || []).map((url) => ({ label: "Colab", url })),
    ];
    return links.length
      ? `<div class="resource-list">${links.map((item) => `<a class="resource-chip" href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.label)}</a>`).join("")}</div>`
      : '<div class="subtle">当前未检测到公开代码链接。</div>';
  };

  const renderPaperBody = ({ paper, scopeLabel, currentIndex, totalPapers, localSpark }) => {
    const selectedLanguage = paperDetail.language.getPreferredAiLanguage();
    const ai = paperDetail.language.getAiSection(paper.ai || {}, selectedLanguage);
    const idea = ai.idea_spark || {};
    const codeLink = findPrimaryCodeLink(paper.code || {});
    return {
      title: paper.title || "论文详情",
      meta: `${scopeLabel || "当前视图"} · 第 ${currentIndex + 1} / ${totalPapers} 篇`,
      codeLink,
      paperLink: paper.link || "#",
      pdfLink: derivePdfUrl(paper.link),
      htmlLink: ARA.shared.utils.deriveHtmlUrl(paper.link),
      body: `
        <div class="paper-detail">
          <section class="detail-section detail-overview">
            <div class="detail-badges"><span class="tag">${escapeHtml(paper.domain || "general")}</span><span class="tag">相关度 ${escapeHtml(String(paper.relevance_score ?? ""))}</span>${(paper.code || {}).has_code ? '<span class="tag">有代码</span>' : ""}</div>
            <div class="detail-grid">
              <div><div class="detail-label">作者</div><div class="detail-value">${escapeHtml((paper.authors || []).join(", ") || "未知")}</div></div>
              <div><div class="detail-label">作者单位</div><div class="detail-value">${escapeHtml((paper.affiliations || []).join("；") || "当前数据中暂无作者单位信息")}</div></div>
              <div><div class="detail-label">分类</div><div class="detail-value">${escapeHtml((paper.categories || []).join(", ") || "未知")}</div></div>
              <div><div class="detail-label">发布日期</div><div class="detail-value">${escapeHtml(formatPublished(paper.published))}</div></div>
              <div><div class="detail-label">入选日报</div><div class="detail-value">${escapeHtml((paper.report_dates || [paper.source_date || "-"]).join("，"))}</div></div>
              <div><div class="detail-label">主题关键词</div><div class="detail-value">${escapeHtml(getDisplayKeywords(paper.ai || {}) || "当前数据中暂无关键词")}</div></div>
              <div><div class="detail-label">代码状态</div><div class="detail-value">${(paper.code || {}).has_code ? "已检测到代码链接" : "未检测到代码链接"}</div></div>
            </div>
          </section>
          ${paperDetail.language.renderLanguageToggle(paper.ai || {}, selectedLanguage)}
          ${renderAnalysisCards(ai, idea)}
          <section class="detail-section"><h3>原始摘要</h3><div class="detail-text abstract-text">${escapeHtml(paper.summary || "暂无摘要")}</div></section>
          <section class="detail-section"><h3>代码与资源</h3>${renderCodeLinks(paper.code || {})}</section>
          <section class="detail-section">
            <div class="section-head"><strong>本地个性化增强</strong><span class="mini-hint">基于你在浏览器中保存的 API 与 research context</span></div>
            <div class="subtle">用于生成更贴近你当前方向的 personalized spark；不会回写 GitHub 公共日报。</div>
            <div class="button-row"><button type="button" class="btn secondary modal-spark-btn">生成我的 Spark</button><button type="button" class="btn ghost modal-clear-spark-btn">清除本地 Spark</button></div>
            <div class="subtle modal-spark-empty"${localSpark ? ' style="display:none;"' : ""}>点击按钮后，这里会显示你自己的个性化想法、实验建议与风险判断。</div>
            <div class="answer local-answer modal-spark-answer"${localSpark ? "" : ' style="display:none;"'}>${escapeHtml(localSpark ? paperDetail.aiClient.formatPersonalSpark(localSpark) : "")}</div>
          </section>
          <section class="detail-section">
            <div class="section-head"><strong>继续提问</strong><span class="mini-hint">围绕当前论文 + 自动日报 + 你的 Spark 深挖</span></div>
            <div class="template-list">${PRESET_QUESTIONS.map((item) => `<button type="button" class="template-btn modal-preset-btn" data-question="${encodeURIComponent(item.text)}">${escapeHtml(item.label)}</button>`).join("")}</div>
            <textarea class="modal-followup-input" placeholder="例如：如果我把这篇作为 surrogate modeling 的 baseline，下一周最值得先做的实验是什么？"></textarea>
            <div class="button-row"><button type="button" class="btn modal-ask-btn">提问</button></div>
            <div class="answer modal-followup-answer" style="display:none;"></div>
          </section>
          <section class="detail-section pdf-preview-section">
            <div class="pdf-header"><h3>PDF 阅读器</h3><button type="button" class="pdf-expand-btn" title="放大 PDF">放大</button></div>
            <div class="pdf-container"><iframe src="${escapeHtml(derivePdfUrl(paper.link))}" title="PDF Preview" loading="lazy"></iframe></div>
          </section>
        </div>
      `,
    };
  };

  paperDetail.render = { renderPaperBody };
})();
