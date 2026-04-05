(() => {
  const ARA = (window.ARA = window.ARA || {});
  const shared = (ARA.shared = ARA.shared || {});

  const RESOURCE_ICON_MARKUP = {
    arxiv: `
      <svg class="resource-icon resource-icon-arxiv" viewBox="0 0 246.978 110.119" fill="none" aria-hidden="true">
        <path d="M134.811 46.23l24.36-29.89c1.492-1.989 2.2-3.03 1.492-4.723a5.142 5.142 0 0 0-4.481-3.161h0a4.024 4.024 0 0 0-3.008 1.108L127.035 37.824zM168.108 102.071l-32.363-38.283-.972 1.033-7.789-9.214-7.743-9.357-4.695 5.076a4.769 4.769 0 0 0 .015 6.53l47.786 51.074a3.913 3.913 0 0 0 3.137 1.192 4.394 4.394 0 0 0 4.027-2.818c.724-1.73-.076-3.441-1.403-5.233zM121.05 64.817l6.052 6.485-26.553 28.128a2.98 2.98 0 0 1-2.275 1.194 3.449 3.449 0 0 1-3.241-2.144c-.513-1.231.166-3.15 1.122-4.168l.023-.024.021-.026 24.851-29.448m-.047-1.882l-25.76 30.524c-1.286 1.372-2.084 3.777-1.365 5.5a4.705 4.705 0 0 0 4.4 2.914 4.191 4.191 0 0 0 3.161-1.563l27.382-29.007-7.814-8.372zM69.406 31.884c1.859 0 3.1 1.24 3.985 3.453 1.062-2.213 2.568-3.453 4.694-3.453h14.878a4.062 4.062 0 0 1 4.074 4.074v7.828c0 2.656-1.327 4.074-4.074 4.074-2.656 0-4.074-1.418-4.074-4.074V40.03H78.35a2.411 2.411 0 0 0-2.656 2.745v27.188h10.007c2.658 0 4.074 1.329 4.074 4.074s-1.416 4.074-4.074 4.074H59.311c-2.659 0-3.986-1.328-3.986-4.074s1.327-4.074 3.986-4.074h8.236V40.03h-7.263c-2.656 0-3.985-1.329-3.985-4.074 0-2.658 1.329-4.074 3.985-4.074zM181.068 31.884c2.656 0 4.074 1.416 4.074 4.074v34.007h10.1c2.746 0 4.074 1.329 4.074 4.074s-1.328 4.074-4.074 4.074h-28.607c-2.656 0-4.074-1.328-4.074-4.074s1.418-4.074 4.074-4.074h10.362V40.03h-8.533c-2.744 0-4.073-1.329-4.073-4.074 0-2.658 1.329-4.074 4.073-4.074zm4.22-17.615a5.859 5.859 0 1 1-5.819-5.819 5.9 5.9 0 0 1 5.819 5.819zM246.978 35.958a4.589 4.589 0 0 1-.267 1.594L231.835 75.63a3.722 3.722 0 0 1-3.721 2.48h-5.933a3.689 3.689 0 0 1-3.808-2.48l-15.055-38.081a3.23 3.23 0 0 1-.355-1.594 4.084 4.084 0 0 1 4.164-4.074 3.8 3.8 0 0 1 3.718 2.656l14.348 36.134 13.9-36.134a3.8 3.8 0 0 1 3.72-2.656 4.084 4.084 0 0 1 4.165 4.077zM32.445 31.884c5.018 0 8.206 3.312 8.206 8.4v37.831H5.143A4.813 4.813 0 0 1 0 73.186V60.157a8.256 8.256 0 0 1 7-8.148l25.507-3.572v-8.4H4.141A4.014 4.014 0 0 1 0 35.958c0-2.87 2.143-4.074 4.355-4.074zm.059 38.081V56.672l-24.354 3.4v9.9zM90.373 1.25h.077c1 .024 2.236 1.245 2.589 1.669l.023.028.024.026 46.664 50.433a3.173 3.173 0 0 1-.034 4.336l-4.893 5.2-6.876-8.134L88.487 7.13c-1.508-2.166-1.617-2.836-1.191-3.858a3.353 3.353 0 0 1 3.077-2.02m0-1.25a4.606 4.606 0 0 0-4.231 2.789c-.705 1.692-.2 2.88 1.349 5.1l39.493 47.722 7.789 9.214 5.853-6.221a4.417 4.417 0 0 0 .042-6.042L94.004 2.13S92.291.05 90.48.006z" fill="currentColor"/>
      </svg>
    `,
    pdf: `
      <svg class="resource-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M20 2H8C6.9 2 6 2.9 6 4V16C6 17.1 6.9 18 8 18H20C21.1 18 22 17.1 22 16V4C22 2.9 21.1 2 20 2ZM20 16H8V4H20V16ZM4 6H2V20C2 21.1 2.9 22 4 22H18V20H4V6ZM16 12V9C16 8.45 15.55 8 15 8H13V13H15C15.55 13 16 12.55 16 12ZM14 9H15V12H14V9ZM18 11H19V10H18V9H19V8H17V13H18V11ZM10 11H11C11.55 11 12 10.55 12 10V9C12 8.45 11.55 8 11 8H9V13H10V11ZM10 9H11V10H10V9Z" fill="currentColor"/>
      </svg>
    `,
    html: `
      <svg class="resource-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M7 17L3 12L7 7M17 17L21 12L17 7M14 5L10 19" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `,
    code: `
      <svg class="resource-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path fill-rule="evenodd" clip-rule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" fill="currentColor"/>
      </svg>
    `,
  };

  const RESOURCE_LABELS = {
    arxiv: "Open in arXiv",
    pdf: "Open PDF",
    html: "Open HTML",
    code: "Open code repository",
  };

  const BUTTON_PRESETS = {
    prev: { visible: "⬅️", sr: "Previous paper", title: "Previous paper" },
    next: { visible: "➡️", sr: "Next paper", title: "Next paper" },
    close: { visible: "✕", sr: "Close details", title: "Close details" },
  };

  const escapeHtml = (value) => String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

  const buildResourceButtonContent = (type, srLabel = RESOURCE_LABELS[type] || type) => {
    if (!RESOURCE_ICON_MARKUP[type]) return "";
    return `${RESOURCE_ICON_MARKUP[type]}<span class="visually-hidden">${escapeHtml(srLabel)}</span>`;
  };

  const buildPresetButtonContent = (name) => {
    const preset = BUTTON_PRESETS[name];
    if (!preset) return "";
    return `<span class="button-preset-label" aria-hidden="true">${preset.visible}</span><span class="visually-hidden">${escapeHtml(preset.sr)}</span>`;
  };

  const hydrateResourceButtons = (root = document) => {
    root.querySelectorAll("[data-resource-icon]").forEach((node) => {
      const type = node.dataset.resourceIcon || "";
      if (!RESOURCE_ICON_MARKUP[type]) return;
      node.innerHTML = buildResourceButtonContent(type, node.dataset.resourceSrLabel || RESOURCE_LABELS[type]);
      node.classList.add("icon-resource-btn");
      if (type === "arxiv") node.classList.add("resource-btn-arxiv");
      if (!node.getAttribute("title")) node.setAttribute("title", RESOURCE_LABELS[type]);
      if (!node.getAttribute("aria-label")) node.setAttribute("aria-label", RESOURCE_LABELS[type]);
    });
  };

  const hydratePresetButtons = (root = document) => {
    root.querySelectorAll("[data-button-preset]").forEach((node) => {
      const presetName = node.dataset.buttonPreset || "";
      const preset = BUTTON_PRESETS[presetName];
      if (!preset) return;
      node.innerHTML = buildPresetButtonContent(presetName);
      if (!node.getAttribute("title")) node.setAttribute("title", preset.title);
      if (!node.getAttribute("aria-label")) node.setAttribute("aria-label", preset.sr);
    });
    hydrateResourceButtons(root);
  };

  shared.buttons = {
    RESOURCE_LABELS,
    BUTTON_PRESETS,
    buildResourceButtonContent,
    buildPresetButtonContent,
    hydratePresetButtons,
    hydrateResourceButtons,
  };

  hydratePresetButtons(document);
})();
