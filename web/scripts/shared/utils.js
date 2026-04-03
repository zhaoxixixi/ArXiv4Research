(() => {
  const ARA = (window.ARA = window.ARA || {});
  const shared = (ARA.shared = ARA.shared || {});

  /** Escape HTML entities for safe text rendering. */
  const escapeHtml = (value) =>
    String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");

  /** Build a short preview string with normalized whitespace. */
  const previewText = (text, limit = 160) => {
    const value = String(text || "").replace(/\s+/g, " ").trim();
    return value.length <= limit ? value : `${value.slice(0, limit).trim()}…`;
  };

  /** Format author list for compact UI display. */
  const formatAuthors = (authors = [], maxCount = 4) => {
    if (!authors.length) return "未知";
    return authors.length <= maxCount ? authors.join(", ") : `${authors.slice(0, maxCount).join(", ")} 等`;
  };

  /** Format affiliation list for compact card display. */
  const formatAffiliations = (affiliations = [], maxCount = 3) => {
    if (!affiliations.length) return "";
    return affiliations.length <= maxCount ? affiliations.join("；") : `${affiliations.slice(0, maxCount).join("；")} 等`;
  };

  /** Encode paper id for use in DOM data attributes. */
  const normalizePaperId = (id) => encodeURIComponent(id || "");

  /** Format published date for the detail modal. */
  const formatPublished = (value) => {
    if (!value) return "未知";
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? value
      : date.toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" });
  };

  /** Convert arXiv abs URL to PDF URL. */
  const derivePdfUrl = (link) => {
    if (!link) return "#";
    const replaced = link.replace("/abs/", "/pdf/");
    return replaced.endsWith(".pdf") ? replaced : `${replaced}.pdf`;
  };

  /** Convert arXiv abs URL to HTML URL. */
  const deriveHtmlUrl = (link) => (!link ? "#" : link.replace("/abs/", "/html/"));

  /** Pick the primary code link for modal footer usage. */
  const findPrimaryCodeLink = (code = {}) => code.github?.[0] || code.huggingface?.[0] || code.colab?.[0] || "";

  /** Get normalized display keywords from saved AI analysis. */
  const getDisplayKeywords = (ai = {}, maxCount = 6) => {
    const normalized = Array.isArray(ai?.keywords_normalized) ? ai.keywords_normalized : [];
    const raw = Array.isArray(ai?.keywords_raw) ? ai.keywords_raw : [];
    const preferred = normalized.length ? normalized : raw;
    return preferred.length ? preferred.slice(0, maxCount).join("；") : "";
  };

  const isPointInsideRect = (x, y, rect) => x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  const resolveDialogPanel = (dialog) =>
    dialog?.querySelector(".dialog-panel") || dialog?.querySelector(".panel") || dialog?.firstElementChild || null;

  /** Enable closing <dialog> by clicking outside its panel. */
  const enableDialogOutsideClose = (dialog) => {
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
      if (pointerStartedOutside && clickedOutside) dialog.close();
      pointerStartedOutside = false;
    });

    dialog.addEventListener("close", () => {
      pointerStartedOutside = false;
    });
  };

  shared.utils = {
    escapeHtml,
    previewText,
    formatAuthors,
    formatAffiliations,
    normalizePaperId,
    formatPublished,
    derivePdfUrl,
    deriveHtmlUrl,
    findPrimaryCodeLink,
    getDisplayKeywords,
    enableDialogOutsideClose,
  };
})();
