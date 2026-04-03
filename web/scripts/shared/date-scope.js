(() => {
  const ARA = (window.ARA = window.ARA || {});
  const shared = (ARA.shared = ARA.shared || {});

  /** Clamp a date to the closest available stored report date. */
  const clampDateToAvailable = (availableDates = [], date = "") => {
    if (!availableDates.length) return date || "";
    return date && availableDates.includes(date) ? date : availableDates[0];
  };

  /** Format YYYY-MM-DD to a compact locale date string. */
  const formatCompactDate = (dateString) => {
    if (!dateString) return "";
    const date = new Date(`${dateString}T00:00:00`);
    return Number.isNaN(date.getTime())
      ? dateString
      : new Intl.DateTimeFormat("en-US", { month: "numeric", day: "numeric", year: "numeric" }).format(date);
  };

  /** Build the UI label for a single-day or range scope. */
  const buildDateScopeLabel = (scope = {}) =>
    scope.mode === "range" ? `${formatCompactDate(scope.start)} – ${formatCompactDate(scope.end)}` : formatCompactDate(scope.date);

  /** Update the date trigger button text. */
  const updateDateTrigger = (scope, elementId = "date-trigger-text") => {
    const trigger = document.getElementById(elementId);
    if (trigger) trigger.textContent = buildDateScopeLabel(scope);
  };

  /** Collect available dates that fall inside a start/end range. */
  const getAvailableDatesInRange = (availableDates = [], start = "", end = "") => {
    if (!start || !end) return [];
    const [from, to] = start <= end ? [start, end] : [end, start];
    return availableDates.filter((date) => date >= from && date <= to);
  };

  /** Expand a scope object into concrete daily report dates. */
  const getScopeDates = (availableDates = [], scope = {}) =>
    scope.mode === "range" ? getAvailableDatesInRange(availableDates, scope.start, scope.end) : scope.date ? [scope.date] : [];

  /** Build quick-select ranges such as latest / 3 days / all. */
  const buildRangeScopeFromCount = (availableDates = [], count = "latest") => {
    if (!availableDates.length) return null;
    if (count === "latest") return { mode: "single", date: availableDates[0] };
    if (count === "all") return { mode: "range", start: availableDates[availableDates.length - 1], end: availableDates[0] };
    const slice = availableDates.slice(0, Math.max(1, Number(count) || 1));
    return { mode: slice.length === 1 ? "single" : "range", start: slice[slice.length - 1], end: slice[0], date: slice[0] };
  };

  /** Build dialog scope state from current page state. */
  const getDateDialogScope = ({ currentDateMode = "single", currentDate = "", currentDateRange = null, availableDates = [], defaultSingleDate = "" } = {}) =>
    currentDateMode === "range" && currentDateRange
      ? { mode: "range", start: currentDateRange.start, end: currentDateRange.end }
      : { mode: "single", date: clampDateToAvailable(availableDates, currentDate || defaultSingleDate) };

  /** Sync dialog inputs and quick labels from a scope. */
  const syncDateDialog = ({ availableDates = [], scope = { mode: "single", date: "" }, singleFallbackDate = "", rangeFallbackStart = "" } = {}) => {
    const mode = scope.mode || "single";
    const singleGroup = document.getElementById("single-date-group");
    const rangeGroup = document.getElementById("range-date-group");
    const singleInput = document.getElementById("single-date-input");
    const rangeStart = document.getElementById("range-start-input");
    const rangeEnd = document.getElementById("range-end-input");
    const availability = document.getElementById("date-dialog-availability");
    const minDate = availableDates[availableDates.length - 1] || "";
    const maxDate = availableDates[0] || "";

    document.querySelectorAll(".mode-toggle-btn").forEach((button) => {
      const active = button.dataset.mode === mode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });

    singleGroup?.classList.toggle("hidden", mode !== "single");
    rangeGroup?.classList.toggle("hidden", mode !== "range");
    [singleInput, rangeStart, rangeEnd].forEach((input) => input && ((input.min = minDate), (input.max = maxDate)));
    if (singleInput) singleInput.value = clampDateToAvailable(availableDates, scope.date || singleFallbackDate || maxDate);
    if (rangeStart) rangeStart.value = clampDateToAvailable(availableDates, scope.start || rangeFallbackStart || minDate || maxDate);
    if (rangeEnd) rangeEnd.value = clampDateToAvailable(availableDates, scope.end || maxDate);
    if (availability) availability.textContent = availableDates.length ? `${availableDates.length} days available · ${minDate} → ${maxDate}` : "No daily reports available";
  };

  /** Read the currently selected scope from dialog inputs. */
  const readScopeFromDialog = (availableDates = []) => {
    const activeMode = document.querySelector(".mode-toggle-btn.active")?.dataset.mode || "single";
    if (activeMode === "range") {
      const start = document.getElementById("range-start-input")?.value || availableDates[availableDates.length - 1] || "";
      const end = document.getElementById("range-end-input")?.value || availableDates[0] || "";
      const [normalizedStart, normalizedEnd] = start <= end ? [start, end] : [end, start];
      return { mode: "range", start: normalizedStart, end: normalizedEnd };
    }
    return { mode: "single", date: document.getElementById("single-date-input")?.value || availableDates[0] || "" };
  };

  shared.dateScope = {
    clampDateToAvailable,
    formatCompactDate,
    buildDateScopeLabel,
    updateDateTrigger,
    getAvailableDatesInRange,
    getScopeDates,
    buildRangeScopeFromCount,
    getDateDialogScope,
    syncDateDialog,
    readScopeFromDialog,
  };
})();
