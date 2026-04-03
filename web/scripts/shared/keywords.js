(() => {
  const ARA = (window.ARA = window.ARA || {});
  const shared = (ARA.shared = ARA.shared || {});

  const KEYWORD_STOPWORDS = new Set([
    "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "in", "into", "is", "of", "on", "or", "the", "to", "via", "with", "using", "based", "towards", "toward", "under", "over", "through", "study", "approach", "method", "methods", "new",
  ]);

  /** Normalize a keyword or title phrase for cross-paper aggregation. */
  const normalizeKeywordLabel = (keyword) =>
    String(keyword || "")
      .toLowerCase()
      .replace(/[^a-z0-9+\-/ ]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  /** Extract normalized and raw keyword groups from stored AI analysis. */
  const getPaperKeywordMeta = (paper = {}) => ({
    normalized: Array.from(new Set((paper?.ai?.keywords_normalized || []).map(normalizeKeywordLabel).filter(Boolean))),
    raw: Array.from(new Set((paper?.ai?.keywords_raw || []).map(normalizeKeywordLabel).filter(Boolean))),
  });

  /** Rank stable keywords across the current paper scope. */
  const extractKeywordRanking = (papers = [], limit = 18) => {
    const aiKeywordCounts = new Map();
    const phraseCounts = new Map();

    papers.forEach((paper) => {
      getPaperKeywordMeta(paper).normalized.forEach((keyword) => aiKeywordCounts.set(keyword, (aiKeywordCounts.get(keyword) || 0) + 1));
      const filtered = String(paper.title || "")
        .toLowerCase()
        .replace(/[^a-z0-9+\-/ ]+/g, " ")
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

    const aiRanked = Array.from(aiKeywordCounts.entries())
      .filter(([, count]) => count >= (papers.length >= 8 ? 2 : 1))
      .map(([label, count]) => ({ label, count, score: count * 3 }))
      .sort((a, b) => b.score - a.score || b.count - a.count || a.label.localeCompare(b.label));
    if (aiRanked.length) return aiRanked.slice(0, limit).map(({ label, count }) => ({ label, count }));

    const fallbackRanked = Array.from(phraseCounts.entries())
      .filter(([label, count]) => count >= 2 && !/^\d+$/.test(label))
      .map(([label, count]) => ({ label, count, score: count * (label.split(" ").length <= 2 ? 1.5 : 2) }))
      .sort((a, b) => b.score - a.score || b.count - a.count || a.label.localeCompare(b.label));

    const results = [];
    for (const entry of fallbackRanked) {
      if (results.some((item) => item.label.includes(entry.label) || entry.label.includes(item.label))) continue;
      results.push({ label: entry.label, count: entry.count });
      if (results.length >= limit) break;
    }
    return results;
  };

  shared.keywords = { KEYWORD_STOPWORDS, normalizeKeywordLabel, getPaperKeywordMeta, extractKeywordRanking };
})();
