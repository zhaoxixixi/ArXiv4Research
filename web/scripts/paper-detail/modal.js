(() => {
  const ARA = (window.ARA = window.ARA || {});
  const paperDetail = (ARA.paperDetail = ARA.paperDetail || {});
  const { enableDialogOutsideClose } = ARA.shared.utils;

  const createController = (options = {}) => {
    const getPapers = typeof options.getPapers === "function" ? options.getPapers : () => [];
    const getScopeLabel = typeof options.getScopeLabel === "function" ? options.getScopeLabel : () => "Current view";
    const getScopeCacheKey = typeof options.getScopeCacheKey === "function" ? options.getScopeCacheKey : () => "default";
    const onStateChange = typeof options.onStateChange === "function" ? options.onStateChange : () => {};
    const modalId = options.modalId || "paper-modal";
    const settingsDialogId = options.settingsDialogId || "settings-dialog";
    let initialized = false;
    let currentModalIndex = -1;
    let currentPaperId = "";
    let paperModal;
    let settingsDialog;

    const getCurrentPapers = () => (Array.isArray(getPapers()) ? getPapers() : []);
    const syncCurrentSelection = () => {
      const papers = getCurrentPapers();
      currentModalIndex = currentPaperId ? papers.findIndex((paper) => paper.id === currentPaperId) : -1;
      return currentModalIndex >= 0 ? papers[currentModalIndex] : null;
    };
    const updateModalNavigation = () => {
      const position = paperModal?.querySelector("#paper-position");
      const prev = paperModal?.querySelector("#paper-prev");
      const next = paperModal?.querySelector("#paper-next");
      const papers = getCurrentPapers();
      syncCurrentSelection();
      if (!papers.length || currentModalIndex < 0) {
        if (position) position.textContent = "-";
        if (prev) prev.disabled = true;
        if (next) next.disabled = true;
        return;
      }
      if (position) position.textContent = `${currentModalIndex + 1} / ${papers.length}`;
      if (prev) prev.disabled = currentModalIndex <= 0;
      if (next) next.disabled = currentModalIndex >= papers.length - 1;
    };
    const loadSettings = () => paperDetail.settings.loadSettingsIntoDialog(settingsDialog);
    const showSettings = () => settingsDialog && (loadSettings(), !settingsDialog.open && settingsDialog.showModal());
    const bindModalContentEvents = (paper) => {
      const modalBody = paperModal?.querySelector("#paper-modal-body");
      if (!modalBody) return;
      modalBody.querySelectorAll(".language-toggle-btn").forEach((button) => button.addEventListener("click", () => {
        paperDetail.language.setPreferredAiLanguage(button.dataset.language || paperDetail.language.DEFAULT_AI_LANGUAGE);
        onStateChange();
        renderPaperModal(paper);
      }));
      modalBody.querySelectorAll(".modal-preset-btn").forEach((button) => button.addEventListener("click", () => {
        const input = modalBody.querySelector(".modal-followup-input");
        if (input) input.value = decodeURIComponent(button.dataset.question || "");
        input?.focus();
      }));
      modalBody.querySelector(".modal-spark-btn")?.addEventListener("click", async (event) => {
        const button = event.currentTarget;
        const answer = modalBody.querySelector(".modal-spark-answer");
        const empty = modalBody.querySelector(".modal-spark-empty");
        button.disabled = true;
        button.textContent = "Loading...";
        try {
          const payload = await paperDetail.actions.generatePersonalSpark({ paper, getScopeCacheKey, showSettings });
          if (answer) answer.textContent = paperDetail.aiClient.formatPersonalSpark(payload), (answer.style.display = "block");
          if (empty) empty.style.display = "none";
          button.textContent = "Regenerate Spark";
        } catch (error) {
          if (answer) answer.textContent = `Error: ${error.message}`, (answer.style.display = "block");
          if (empty) empty.style.display = "none";
          button.textContent = "Generate Spark";
        } finally {
          button.disabled = false;
        }
      });
      modalBody.querySelector(".modal-clear-spark-btn")?.addEventListener("click", () => {
        paperDetail.cache.removePaperCaches("personal_spark", getScopeCacheKey(), paper.id);
        const answer = modalBody.querySelector(".modal-spark-answer");
        const empty = modalBody.querySelector(".modal-spark-empty");
        const button = modalBody.querySelector(".modal-spark-btn");
        if (answer) answer.style.display = "none", (answer.textContent = "");
        if (empty) empty.style.display = "block";
        if (button) button.textContent = "Generate Spark";
      });
      modalBody.querySelector(".modal-ask-btn")?.addEventListener("click", async (event) => {
        const button = event.currentTarget;
        const input = modalBody.querySelector(".modal-followup-input");
        const answer = modalBody.querySelector(".modal-followup-answer");
        const question = input?.value.trim() || "";
        if (!question) return;
        button.disabled = true;
        button.textContent = "Thinking...";
        try {
          if (answer) answer.textContent = await paperDetail.actions.askFollowup({ paper, question, getScopeCacheKey, showSettings }), (answer.style.display = "block");
        } catch (error) {
          if (answer) answer.textContent = `Error: ${error.message}`, (answer.style.display = "block");
        } finally {
          button.disabled = false;
          button.textContent = "Ask";
        }
      });
      modalBody.querySelector(".pdf-expand-btn")?.addEventListener("click", (event) => paperDetail.pdfViewer.togglePdfSize(event.currentTarget));
    };
    const renderPaperModal = (paper) => {
      if (!paperModal || !paper) return;
      paperDetail.pdfViewer.removePdfOverlay();
      const localSpark = paperDetail.cache.getLatestCache("personal_spark", getScopeCacheKey(), paper.id);
      const view = paperDetail.render.renderPaperBody({ paper, scopeLabel: getScopeLabel(), currentIndex: currentModalIndex, totalPapers: getCurrentPapers().length, localSpark });
      const title = paperModal.querySelector("#paper-modal-title");
      const meta = paperModal.querySelector("#paper-modal-meta");
      const body = paperModal.querySelector("#paper-modal-body");
      if (title) title.textContent = view.title;
      if (meta) meta.textContent = view.meta;
      if (body) body.innerHTML = view.body;
      [["#paper-link", view.paperLink], ["#pdf-link", view.pdfLink], ["#html-link", view.htmlLink]].forEach(([selector, href]) => {
        const node = paperModal.querySelector(selector);
        if (node) node.href = href;
      });
      const codeLink = paperModal.querySelector("#code-link");
      if (codeLink) view.codeLink ? ((codeLink.href = view.codeLink), (codeLink.style.display = "inline-flex")) : (codeLink.removeAttribute("href"), (codeLink.style.display = "none"));
      bindModalContentEvents(paper);
      updateModalNavigation();
    };
    const openById = (paperId) => {
      const index = getCurrentPapers().findIndex((paper) => paper.id === paperId);
      if (!paperModal || index < 0) return false;
      currentPaperId = paperId;
      currentModalIndex = index;
      renderPaperModal(getCurrentPapers()[index]);
      paperModal.classList.add("active");
      paperModal.setAttribute("aria-hidden", "false");
      document.body.classList.add("modal-open");
      return true;
    };
    const close = () => {
      if (!paperModal) return;
      paperDetail.pdfViewer.removePdfOverlay();
      paperModal.classList.remove("active");
      paperModal.setAttribute("aria-hidden", "true");
      document.body.classList.remove("modal-open");
      currentModalIndex = -1;
      currentPaperId = "";
    };
    const move = (step) => {
      const papers = getCurrentPapers();
      if (!syncCurrentSelection()) return;
      const nextIndex = currentModalIndex + step;
      if (nextIndex < 0 || nextIndex >= papers.length) return;
      currentModalIndex = nextIndex;
      currentPaperId = papers[nextIndex].id;
      renderPaperModal(papers[nextIndex]);
    };
    const isOpen = () => Boolean(paperModal?.classList.contains("active"));
    const refresh = () => (isOpen() ? (syncCurrentSelection() ? renderPaperModal(getCurrentPapers()[currentModalIndex]) : close()) : undefined);
    const bindSettingsDialog = () => {
      if (!settingsDialog) return;
      enableDialogOutsideClose(settingsDialog);
      settingsDialog.querySelector("#save-settings")?.addEventListener("click", (event) => {
        event.preventDefault();
        paperDetail.settings.saveSettingsFromDialog(settingsDialog);
        onStateChange();
        settingsDialog.close();
      });
      settingsDialog.querySelector("#clear-settings")?.addEventListener("click", () => {
        if (!window.confirm("Clear the API, model, and research context saved in this browser?")) return;
        paperDetail.settings.clearLocalSettings();
        paperDetail.settings.loadSettingsIntoDialog(settingsDialog);
        onStateChange();
      });
    };
    const bindModalShell = () => {
      paperModal?.querySelector("#close-paper-modal")?.addEventListener("click", close);
      paperModal?.querySelector("#paper-prev")?.addEventListener("click", () => move(-1));
      paperModal?.querySelector("#paper-next")?.addEventListener("click", () => move(1));
      paperModal?.addEventListener("click", (event) => event.target === paperModal && (document.querySelector(".pdf-container.expanded") ? paperDetail.pdfViewer.removePdfOverlay() : close()));
      document.addEventListener("keydown", (event) => {
        if (!isOpen()) return;
        if (event.key === "Escape") return document.querySelector(".pdf-container.expanded") ? paperDetail.pdfViewer.removePdfOverlay() : close();
        if (event.key === "ArrowLeft") move(-1);
        if (event.key === "ArrowRight") move(1);
      });
    };
    return {
      init() {
        if (initialized) return this;
        paperModal = document.getElementById(modalId);
        settingsDialog = document.getElementById(settingsDialogId);
        bindSettingsDialog();
        bindModalShell();
        initialized = true;
        return this;
      },
      openById,
      close,
      move,
      isOpen,
      refresh,
      showSettings,
      loadSettings,
    };
  };

  paperDetail.modal = { createController };
})();
