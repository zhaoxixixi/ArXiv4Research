(() => {
  const ARA = (window.ARA = window.ARA || {});
  const paperDetail = (ARA.paperDetail = ARA.paperDetail || {});
  const { CACHE_PREFIX } = ARA.shared.constants;

  const hashString = (input = "") => {
    let hash = 0;
    for (let index = 0; index < input.length; index += 1) {
      hash = (hash << 5) - hash + input.charCodeAt(index);
      hash |= 0;
    }
    return Math.abs(hash).toString(36);
  };

  const getCachePrefix = (type, date, paperId) => `${CACHE_PREFIX}:${type}:${date}:${paperId}:`;
  const getCacheKey = (type, date, paperId, variant) => `${getCachePrefix(type, date, paperId)}${variant}`;
  const getAllStorages = () => [localStorage, sessionStorage];

  const getLatestCache = (type, date, paperId) => {
    const prefix = getCachePrefix(type, date, paperId);
    let latest = null;
    getAllStorages().forEach((storage) => {
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (!key || !key.startsWith(prefix)) continue;
        try {
          const payload = JSON.parse(storage.getItem(key) || "null");
          if (payload && (!latest || (payload.created_at || "") > (latest.created_at || ""))) latest = payload;
        } catch (_error) {
          // ignore malformed cache entries
        }
      }
    });
    return latest;
  };

  const saveCache = (type, date, paperId, variant, payload) => {
    const storage = paperDetail.settings.storageForMode(paperDetail.settings.getStorageMode());
    storage.setItem(getCacheKey(type, date, paperId, variant), JSON.stringify(payload));
  };

  const removePaperCaches = (type, date, paperId) => {
    const prefix = getCachePrefix(type, date, paperId);
    getAllStorages().forEach((storage) => {
      const keys = [];
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (key && key.startsWith(prefix)) keys.push(key);
      }
      keys.forEach((key) => storage.removeItem(key));
    });
  };

  paperDetail.cache = { hashString, getCacheKey, getLatestCache, saveCache, removePaperCaches };
})();
