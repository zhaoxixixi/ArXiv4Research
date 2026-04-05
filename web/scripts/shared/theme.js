(() => {
  const ARA = (window.ARA = window.ARA || {});
  const shared = (ARA.shared = ARA.shared || {});
  const { DEFAULT_THEME, THEME_STORAGE_KEY, THEMES } = shared.constants;

  /** Read the preferred reading theme from storage. */
  const getTheme = () => {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    return THEMES[saved] ? saved : DEFAULT_THEME;
  };

  /** Apply a theme to the current page. */
  const applyTheme = (theme, persist = true) => {
    const resolved = THEMES[theme] ? theme : DEFAULT_THEME;
    document.body.dataset.theme = resolved;
    if (persist) localStorage.setItem(THEME_STORAGE_KEY, resolved);
    updateThemeSelectionUI();
    return resolved;
  };

  /** Update active state for theme option buttons. */
  const updateThemeSelectionUI = () => {
    const activeTheme = document.body.dataset.theme || DEFAULT_THEME;
    document.querySelectorAll(".theme-option").forEach((option) => {
      const active = option.dataset.theme === activeTheme;
      option.classList.toggle("active", active);
      option.setAttribute("aria-pressed", active ? "true" : "false");
      option.setAttribute("aria-current", active ? "true" : "false");
    });
  };

  shared.theme = { THEMES, DEFAULT_THEME, getTheme, applyTheme, updateThemeSelectionUI };
})();
