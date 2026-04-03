(() => {
  const ARA = (window.ARA = window.ARA || {});
  const paperDetail = (ARA.paperDetail = ARA.paperDetail || {});

  const removePdfOverlay = () => {
    document.querySelector(".pdf-overlay")?.remove();
    const expanded = document.querySelector(".pdf-container.expanded");
    if (!expanded) return;
    expanded.classList.remove("expanded");
    const button = document.querySelector(".pdf-expand-btn");
    if (button) button.textContent = "放大";
  };

  const togglePdfSize = (button) => {
    const container = button.closest(".pdf-preview-section")?.querySelector(".pdf-container");
    if (!container) return;
    if (container.classList.contains("expanded")) {
      removePdfOverlay();
      return;
    }
    const overlay = document.createElement("div");
    overlay.className = "pdf-overlay";
    overlay.addEventListener("click", () => togglePdfSize(button));
    document.body.appendChild(overlay);
    container.classList.add("expanded");
    button.textContent = "恢复";
  };

  paperDetail.pdfViewer = { removePdfOverlay, togglePdfSize };
})();
