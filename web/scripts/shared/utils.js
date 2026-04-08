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
    if (!authors.length) return "Unknown";
    return authors.length <= maxCount ? authors.join(", ") : `${authors.slice(0, maxCount).join(", ")} et al.`;
  };

  /** Format affiliation list for compact card display. */
  const formatAffiliations = (affiliations = [], maxCount = 3) => {
    if (!affiliations.length) return "";
    return affiliations.length <= maxCount
      ? affiliations.join("; ")
      : `${affiliations.slice(0, maxCount).join("; ")} et al.`;
  };

  /** Encode paper id for use in DOM data attributes. */
  const normalizePaperId = (id) => encodeURIComponent(id || "");

  /** Format published date for the detail modal. */
  const formatPublished = (value) => {
    if (!value) return "Unknown";
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? value
      : date.toLocaleDateString("en-US", { year: "numeric", month: "2-digit", day: "2-digit" });
  };

  /** Normalize arXiv abs URLs so saved/report data consistently uses HTTPS. */
  const normalizeArxivAbsUrl = (link) => {
    const value = String(link || "").trim();
    if (!value || value === "#") return "#";

    if (/^arxiv:/i.test(value)) {
      const paperId = value.split(":", 2)[1]?.trim();
      return paperId ? `https://arxiv.org/abs/${paperId}` : "#";
    }

    if (value.startsWith("/abs/")) return `https://arxiv.org${value}`;

    const arxivAbsMatch = value.match(/^(?:https?:\/\/)?(?:www\.)?arxiv\.org\/abs\/([^?#]+)/i);
    if (arxivAbsMatch) return `https://arxiv.org/abs/${arxivAbsMatch[1]}`;

    if (/^https?:\/\//i.test(value)) return value.replace(/^http:\/\//i, "https://");

    return `https://arxiv.org/abs/${value.replace(/^\/+/, "")}`;
  };

  /** Convert arXiv abs URL to PDF URL. */
  const derivePdfUrl = (link) => {
    const absUrl = normalizeArxivAbsUrl(link);
    if (absUrl === "#") return "#";
    const replaced = absUrl.replace("/abs/", "/pdf/");
    return replaced.endsWith(".pdf") ? replaced : `${replaced}.pdf`;
  };

  /** Convert arXiv abs URL to HTML URL. */
  const deriveHtmlUrl = (link) => {
    const absUrl = normalizeArxivAbsUrl(link);
    return absUrl === "#" ? "#" : absUrl.replace("/abs/", "/html/");
  };

  /** Pick the primary code link for modal footer usage. */
  const findPrimaryCodeLink = (code = {}) => code.github?.[0] || code.huggingface?.[0] || code.colab?.[0] || "";

  /** Get normalized display keywords from saved AI analysis. */
  const getDisplayKeywords = (ai = {}, maxCount = 6) => {
    const normalized = Array.isArray(ai?.keywords_normalized) ? ai.keywords_normalized : [];
    const raw = Array.isArray(ai?.keywords_raw) ? ai.keywords_raw : [];
    const preferred = normalized.length ? normalized : raw;
    return preferred.length ? preferred.slice(0, maxCount).join("; ") : "";
  };

  /** Render a safe lightweight Markdown subset for local UI answers. */
  const renderMarkdown = (value) => {
    const source = String(value || "").replace(/\r\n?/g, "\n").trim();
    if (!source) return "";

    const fencedBlocks = [];
    const placeholderPattern = /@@MD_BLOCK_(\d+)@@/;
    const withPlaceholders = source.replace(/```([\w-]+)?\n?([\s\S]*?)```/g, (_match, language = "", code = "") => {
      const index = fencedBlocks.push({ language: String(language || "").trim(), code: String(code || "") }) - 1;
      return `@@MD_BLOCK_${index}@@`;
    });

    const escapedSource = escapeHtml(withPlaceholders);

    const renderInlineMarkdown = (text) => {
      const inlineCodes = [];
      const withInlineCodePlaceholders = text.replace(/`([^`]+)`/g, (_match, code) => {
        const index = inlineCodes.push(code) - 1;
        return `@@INLINE_CODE_${index}@@`;
      });

      let rendered = withInlineCodePlaceholders
        .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .replace(/__([^_]+)__/g, "<strong>$1</strong>")
        .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?:;]|$)/g, "$1<em>$2</em>")
        .replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,!?:;]|$)/g, "$1<em>$2</em>");

      rendered = rendered.replace(/@@INLINE_CODE_(\d+)@@/g, (_match, index) => `<code>${inlineCodes[Number(index)] || ""}</code>`);
      return rendered;
    };

    const renderBlock = (block) => {
      const trimmed = block.trim();
      if (!trimmed) return "";

      const placeholderMatch = trimmed.match(placeholderPattern);
      if (placeholderMatch && placeholderMatch[0] === trimmed) {
        const fenced = fencedBlocks[Number(placeholderMatch[1])] || { language: "", code: "" };
        const languageClass = fenced.language ? ` class="language-${escapeHtml(fenced.language)}"` : "";
        return `<pre><code${languageClass}>${escapeHtml(fenced.code).replace(/\n$/, "")}</code></pre>`;
      }

      const lines = trimmed.split("\n");
      const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
      if (headingMatch) {
        const level = Math.min(headingMatch[1].length, 6);
        return `<h${level}>${renderInlineMarkdown(headingMatch[2].trim())}</h${level}>`;
      }

      if (lines.every((line) => /^\s*[-*+]\s+/.test(line))) {
        const items = lines
          .map((line) => line.replace(/^\s*[-*+]\s+/, "").trim())
          .filter(Boolean)
          .map((item) => `<li>${renderInlineMarkdown(item)}</li>`)
          .join("");
        return `<ul>${items}</ul>`;
      }

      if (lines.every((line) => /^\s*\d+\.\s+/.test(line))) {
        const items = lines
          .map((line) => line.replace(/^\s*\d+\.\s+/, "").trim())
          .filter(Boolean)
          .map((item) => `<li>${renderInlineMarkdown(item)}</li>`)
          .join("");
        return `<ol>${items}</ol>`;
      }

      if (lines.every((line) => /^\s*>\s?/.test(line))) {
        const content = lines.map((line) => line.replace(/^\s*>\s?/, "").trim()).join("<br />");
        return `<blockquote>${renderInlineMarkdown(content)}</blockquote>`;
      }

      return `<p>${renderInlineMarkdown(lines.map((line) => line.trim()).join("<br />"))}</p>`;
    };

    return escapedSource
      .split(/\n{2,}/)
      .map((block) => renderBlock(block))
      .filter(Boolean)
      .join("");
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
    normalizeArxivAbsUrl,
    derivePdfUrl,
    deriveHtmlUrl,
    findPrimaryCodeLink,
    getDisplayKeywords,
    renderMarkdown,
    enableDialogOutsideClose,
  };
})();
