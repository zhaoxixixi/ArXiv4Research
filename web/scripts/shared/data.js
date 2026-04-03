(() => {
  const ARA = (window.ARA = window.ARA || {});
  const shared = (ARA.shared = ARA.shared || {});

  let dataBasePath = "../data";

  /** Fetch JSON from a static asset path. */
  const fetchJson = async (path) => {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`Failed to fetch ${path}`);
    return response.json();
  };

  /** Try to fetch JSON and return null on failure. */
  const tryFetchJson = async (path) => {
    try {
      return await fetchJson(path);
    } catch (_error) {
      return null;
    }
  };

  /** Resolve candidate data roots for local or Pages deployment. */
  const getDataBaseCandidates = () => {
    const pathname = window.location.pathname || "";
    const candidates = pathname.includes("/web/") ? ["../data", "./data"] : ["./data", "../data"];
    return [...new Set(candidates)];
  };

  /** Detect the first working data root and cache it for later requests. */
  const resolveDataBasePath = async () => {
    const candidates = getDataBaseCandidates();
    for (const candidate of candidates) {
      const payload = await tryFetchJson(`${candidate}/index.json`);
      if (payload) {
        dataBasePath = candidate;
        return payload;
      }
    }
    throw new Error(`无法定位数据目录。已尝试: ${candidates.join(", ")}`);
  };

  /** Fetch a JSON file relative to the resolved data root. */
  const fetchDataJson = async (relativePath) => fetchJson(`${dataBasePath}/${relativePath}`);

  /** Attach scope metadata to a paper when merging multiple daily payloads. */
  const normalizePaperForScope = (paper, sourceDate) => ({ ...paper, source_date: sourceDate, report_dates: [sourceDate] });

  /** Merge same-paper entries across multiple days and keep the strongest one. */
  const aggregateDailyPayloads = (payloads = []) => {
    const merged = new Map();

    payloads.forEach((payload) => {
      const sourceDate = payload?.date || "";
      (payload?.papers || []).forEach((paper) => {
        const normalized = normalizePaperForScope(paper, sourceDate);
        const existing = merged.get(normalized.id);
        if (!existing) return void merged.set(normalized.id, normalized);

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
      return scoreDelta !== 0 ? scoreDelta : String(b.source_date || "").localeCompare(String(a.source_date || ""));
    });
  };

  shared.data = {
    fetchJson,
    tryFetchJson,
    getDataBaseCandidates,
    resolveDataBasePath,
    fetchDataJson,
    normalizePaperForScope,
    aggregateDailyPayloads,
    getDataBasePath: () => dataBasePath,
  };
})();
