(() => {
  const STORAGE_KEY_PREFIX = "ara_repo_stats:";
  const CACHE_TTL_MS = 1000 * 60 * 60 * 6;

  const formatRepoCount = (value) => {
    const number = Number(value || 0);
    if (!Number.isFinite(number)) return "-";
    return new Intl.NumberFormat("en", {
      notation: "compact",
      maximumFractionDigits: number >= 1000 ? 1 : 0,
    }).format(number);
  };

  const readCache = (cacheKey) => {
    try {
      const raw = localStorage.getItem(cacheKey);
      return raw ? JSON.parse(raw) : null;
    } catch (_error) {
      return null;
    }
  };

  const writeCache = (cacheKey, payload) => {
    try {
      localStorage.setItem(cacheKey, JSON.stringify({ savedAt: Date.now(), payload }));
    } catch (_error) {
      // ignore storage failures
    }
  };

  const fetchRepoMeta = async (owner, repo) => {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`repo stats unavailable: ${response.status}`);
    return response.json();
  };

  const loadRepoMeta = async (owner, repo) => {
    const cacheKey = `${STORAGE_KEY_PREFIX}${owner}/${repo}`;
    const cached = readCache(cacheKey);
    const hasFreshCache = cached && Date.now() - Number(cached.savedAt || 0) < CACHE_TTL_MS;
    if (hasFreshCache && cached.payload) return cached.payload;

    try {
      const payload = await fetchRepoMeta(owner, repo);
      writeCache(cacheKey, payload);
      return payload;
    } catch (error) {
      if (cached?.payload) return cached.payload;
      throw error;
    }
  };

  const initGitHubStats = async () => {
    const cards = Array.from(document.querySelectorAll("[data-github-owner][data-github-repo]"));
    if (!cards.length) return;

    const cache = new Map();
    await Promise.all(cards.map(async (card) => {
      const owner = card.dataset.githubOwner || "";
      const repo = card.dataset.githubRepo || "";
      const cacheKey = `${owner}/${repo}`;

      try {
        let request = cache.get(cacheKey);
        if (!request) {
          request = loadRepoMeta(owner, repo);
          cache.set(cacheKey, request);
        }
        const payload = await request;
        const starsNode = card.querySelector("[data-github-stars]");
        const forksNode = card.querySelector("[data-github-forks]");
        if (starsNode) starsNode.textContent = formatRepoCount(payload.stargazers_count);
        if (forksNode) forksNode.textContent = formatRepoCount(payload.forks_count);
      } catch (error) {
        console.warn("GitHub stats unavailable:", error);
        const starsNode = card.querySelector("[data-github-stars]");
        const forksNode = card.querySelector("[data-github-forks]");
        if (starsNode) starsNode.textContent = "?";
        if (forksNode) forksNode.textContent = "?";
      }
    }));
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initGitHubStats);
  } else {
    initGitHubStats();
  }
})();
