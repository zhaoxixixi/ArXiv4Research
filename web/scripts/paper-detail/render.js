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
      : '<div class="subtle">No public code link detected.</div>';
  };

  const renderPaperBody = ({ paper, scopeLabel, currentIndex, totalPapers, localSpark }) => {
    const selectedLanguage = paperDetail.language.getPreferredAiLanguage();
    const ai = paperDetail.language.getAiSection(paper.ai || {}, selectedLanguage);
    const idea = ai.idea_spark || {};
    const codeLink = findPrimaryCodeLink(paper.code || {});
    return {
      title: paper.title || "Paper Details",
      meta: `${scopeLabel || "Current view"} · ${currentIndex + 1} / ${totalPapers}`,
      codeLink,
      paperLink: paper.link || "#",
      pdfLink: derivePdfUrl(paper.link),
      htmlLink: ARA.shared.utils.deriveHtmlUrl(paper.link),
      body: `
        <div class="paper-detail">
          <section class="detail-section detail-overview">
            <div class="detail-badges"><span class="tag">${escapeHtml(paper.domain || "general")}</span><span class="tag">Score ${escapeHtml(String(paper.relevance_score ?? ""))}</span>${(paper.code || {}).has_code ? '<span class="tag">Code</span>' : ""}</div>
            <div class="detail-grid">
              <div><div class="detail-label">Authors</div><div class="detail-value">${escapeHtml((paper.authors || []).join(", ") || "Unknown")}</div></div>
              <div><div class="detail-label">Affiliations</div><div class="detail-value">${escapeHtml((paper.affiliations || []).join("; ") || "No affiliation info")}</div></div>
              <div><div class="detail-label">Categories</div><div class="detail-value">${escapeHtml((paper.categories || []).join(", ") || "Unknown")}</div></div>
              <div><div class="detail-label">Published</div><div class="detail-value">${escapeHtml(formatPublished(paper.published))}</div></div>
              <div><div class="detail-label">Selected Dates</div><div class="detail-value">${escapeHtml((paper.report_dates || [paper.source_date || "-"]).join(", "))}</div></div>
              <div><div class="detail-label">Keywords</div><div class="detail-value">${escapeHtml(getDisplayKeywords(paper.ai || {}) || "No keywords")}</div></div>
              <div><div class="detail-label">Code Status</div><div class="detail-value">${(paper.code || {}).has_code ? "Code found" : "No code detected"}</div></div>
            </div>
          </section>
          ${paperDetail.language.renderLanguageToggle(paper.ai || {}, selectedLanguage)}
          ${renderAnalysisCards(ai, idea)}
          <section class="detail-section"><h3>Abstract</h3><div class="detail-text abstract-text">${escapeHtml(paper.summary || "No abstract available")}</div></section>
          <section class="detail-section"><h3>Resources</h3>${renderCodeLinks(paper.code || {})}</section>
          <section class="detail-section">
            <div class="section-head"><strong>Local Spark</strong></div>
            <div class="button-row"><button type="button" class="btn secondary modal-spark-btn">Generate Spark</button><button type="button" class="btn ghost modal-clear-spark-btn">Clear Spark</button></div>
            <div class="subtle modal-spark-empty"${localSpark ? ' style="display:none;"' : ""}>No local Spark yet.</div>
            <div class="answer local-answer modal-spark-answer"${localSpark ? "" : ' style="display:none;"'}>${escapeHtml(localSpark ? paperDetail.aiClient.formatPersonalSpark(localSpark) : "")}</div>
          </section>
          <section class="detail-section">
            <div class="section-head"><strong>Follow-up</strong></div>
            <div class="template-list">${PRESET_QUESTIONS.map((item) => `<button type="button" class="template-btn modal-preset-btn" data-question="${encodeURIComponent(item.text)}">${escapeHtml(item.label)}</button>`).join("")}</div>
            <textarea class="modal-followup-input" placeholder="Ask a follow-up question..."></textarea>
            <div class="button-row"><button type="button" class="btn modal-ask-btn">Ask</button></div>
            <div class="answer modal-followup-answer" style="display:none;"></div>
          </section>
          <section class="detail-section pdf-preview-section">
            <div class="pdf-header"><h3>PDF Viewer</h3><button type="button" class="pdf-expand-btn" title="Expand PDF">Expand</button></div>
            <div class="pdf-container"><iframe src="${escapeHtml(derivePdfUrl(paper.link))}" title="PDF Preview" loading="lazy"></iframe></div>
          </section>
        </div>
      `,
    };
  };

  paperDetail.render = { renderPaperBody };
})();
