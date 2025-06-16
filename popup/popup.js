// SOTE-main/popup/popup.js - Improved Version

class PopupManager {
  constructor() {
    this.state = {
      abbreviations: [],
      filteredAbbreviations: [],
      currentEditId: null,
      isEnabled: true,
      searchTerm: "",
    };

    this.elements = null;
    this.abortController = new AbortController();
    this.debounceTimer = null;

    this.init();
  }

  // Initialize DOM elements with error handling
  initializeElements() {
    const requiredElements = {
      abbreviationsList: "abbreviations-list",
      searchInput: "search-input",
      enabledToggle: "enabled-toggle",
      statusText: "status-text",
      addBtn: "add-btn",
      dashboardBtn: "dashboard-btn",
      addEditModal: "add-edit-modal",
      modalTitle: "modal-title",
      modalCloseBtn: "modal-close-btn",
      cancelBtn: "cancel-btn",
      saveBtn: "save-btn",
      newAbbreviationInput: "new-abbreviation",
      newExpansionTextarea: "new-expansion",
      newCategorySelect: "new-category",
      newCaseSensitiveCheckbox: "new-case-sensitive",
      customCategoryGroup: "custom-category-group",
      newCustomCategoryInput: "new-custom-category",
      popupInsertChoiceBtn: "popup-insert-choice-btn",
    };

    this.elements = {};

    for (const [key, id] of Object.entries(requiredElements)) {
      const element = document.getElementById(id);
      if (!element) {
        throw new Error(`Required element with ID '${id}' not found`);
      }
      this.elements[key] = element;
    }

    this.elements.insertActionButtons = document.querySelectorAll(
      "#add-edit-modal .btn-insert-action:not(#popup-insert-choice-btn)"
    );
  }

  // Validate dependencies
  validateDependencies() {
    const dependencies = [
      "TextExpanderDB",
      "SoteNotifier",
      "SoteConfirmationModal",
      "SOTE_CONSTANTS",
    ];
    const missing = dependencies.filter(
      dep => typeof window[dep] === "undefined"
    );

    if (missing.length > 0) {
      throw new Error(`Missing dependencies: ${missing.join(", ")}`);
    }
  }

  // Safe HTML escaping
  escapeHtml(text) {
    if (typeof text !== "string") return "";
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  // Create expansion preview with improved badge system
  createExpansionPreview(expansion) {
    if (typeof expansion !== "string") return "";

    const badges = {
      choice:
        '<span class="action-preview-badge choice-badge" title="Opção de escolha">❓ Escolha</span>',
      cursor:
        '<span class="action-preview-badge cursor-badge" title="Posição do cursor">📍 Cursor</span>',
      clipboard:
        '<span class="action-preview-badge clipboard-badge" title="Área de transferência">📋 Transf.</span>',
    };

    let previewHtml = this.escapeHtml(expansion);
    previewHtml = previewHtml.replace(/\$choice\(id=\d+\)\$/g, badges.choice);
    previewHtml = previewHtml.replace(/\$cursor\$/g, badges.cursor);
    previewHtml = previewHtml.replace(/\$transferencia\$/g, badges.clipboard);

    return `<div>${previewHtml}</div>`;
  }

  // Insert text at cursor position with improved UX
  insertTextAtCursor(textarea, textToInsert) {
    if (!textarea || typeof textToInsert !== "string") return;

    const { selectionStart: start, selectionEnd: end, value } = textarea;

    textarea.value =
      value.substring(0, start) + textToInsert + value.substring(end);

    const newPosition = start + textToInsert.length;
    textarea.setSelectionRange(newPosition, newPosition);
    textarea.focus();

    // Dispatch input event for any listeners
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  }

  // Debounced search handler
  handleSearch = () => {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.filterAbbreviations();
    }, 150);
  };

  // Async initialization with proper error handling
  async init() {
    try {
      this.validateDependencies();
      this.initializeElements();

      await Promise.all([
        this.loadAbbreviations(),
        this.loadCategories(),
        this.loadSettings(),
      ]);

      this.setupEventListeners();
      this.setupMessageListener();
    } catch (error) {
      console.error("Failed to initialize popup:", error);
      this.showErrorState(error.message);
    }
  }

  // Load settings from storage
  async loadSettings() {
    try {
      const result = await chrome.storage.sync.get("enabled");
      this.state.isEnabled = result.enabled !== false;
      this.elements.enabledToggle.checked = this.state.isEnabled;
      this.updateStatusText();
    } catch (error) {
      console.error("Failed to load settings:", error);
    }
  }

  // Setup all event listeners with proper cleanup
  setupEventListeners() {
    const { signal } = this.abortController;

    // Search with debouncing
    this.elements.searchInput.addEventListener("input", this.handleSearch, {
      signal,
    });

    // Toggle
    this.elements.enabledToggle.addEventListener(
      "change",
      this.handleToggleEnabled.bind(this),
      { signal }
    );

    // Buttons
    this.elements.addBtn.addEventListener("click", () => this.showModal(), {
      signal,
    });
    this.elements.dashboardBtn.addEventListener(
      "click",
      this.openDashboard.bind(this),
      { signal }
    );

    // Modal
    this.elements.modalCloseBtn.addEventListener(
      "click",
      this.hideModal.bind(this),
      { signal }
    );
    this.elements.cancelBtn.addEventListener(
      "click",
      this.hideModal.bind(this),
      { signal }
    );
    this.elements.saveBtn.addEventListener(
      "click",
      this.handleSaveAbbreviation.bind(this),
      { signal }
    );

    // Modal backdrop click
    this.elements.addEditModal.addEventListener(
      "click",
      e => {
        if (e.target === this.elements.addEditModal) this.hideModal();
      },
      { signal }
    );

    // Category change
    this.elements.newCategorySelect.addEventListener(
      "change",
      this.handleCategoryChange.bind(this),
      { signal }
    );

    // Insert action buttons
    this.elements.insertActionButtons.forEach(button => {
      button.addEventListener("click", this.handleInsertAction.bind(this), {
        signal,
      });
    });

    // Choice button
    this.elements.popupInsertChoiceBtn.addEventListener(
      "click",
      this.openDashboardForChoice.bind(this),
      { signal }
    );

    // Keyboard shortcuts
    document.addEventListener("keydown", this.handleKeydown.bind(this), {
      signal,
    });

    // Form submission
    const form = document.getElementById("abbreviation-form");
    if (form) {
      form.addEventListener(
        "submit",
        e => {
          e.preventDefault();
          this.handleSaveAbbreviation();
        },
        { signal }
      );
    }
  }

  // Setup chrome message listener
  setupMessageListener() {
    chrome.runtime.onMessage.addListener(message => {
      const validTypes = [
        SOTE_CONSTANTS.MESSAGE_TYPES.ABBREVIATIONS_UPDATED,
        SOTE_CONSTANTS.MESSAGE_TYPES.INITIAL_SEED_COMPLETE,
      ];

      if (validTypes.includes(message.type)) {
        this.performLocalRefresh();
      }
      return true;
    });
  }

  // Keyboard event handler
  handleKeydown(e) {
    if (
      e.key === "Escape" &&
      !this.elements.addEditModal.classList.contains("hidden")
    ) {
      this.hideModal();
    }
  }

  // Category change handler
  handleCategoryChange() {
    const isCustom = this.elements.newCategorySelect.value === "Personalizada";
    this.elements.customCategoryGroup.style.display = isCustom
      ? "block"
      : "none";

    if (isCustom) {
      // Use requestAnimationFrame to ensure the element is visible before focusing
      requestAnimationFrame(() => {
        this.elements.newCustomCategoryInput.focus();
      });
    }
  }

  // Insert action handler
  handleInsertAction(e) {
    const action = e.target.getAttribute("data-action");
    if (action) {
      this.insertTextAtCursor(this.elements.newExpansionTextarea, action);
    }
  }

  // Open dashboard for choice configuration
  openDashboardForChoice() {
    chrome.tabs.create({
      url: chrome.runtime.getURL("dashboard/dashboard.html"),
    });
    window.close();
  }

  // Show different states
  showLoadingState() {
    this.elements.abbreviationsList.innerHTML = `
      <div class="loading" role="status" aria-live="polite">
        <div class="loading-spinner" aria-hidden="true"></div>
        <p>Carregando abreviações...</p>
      </div>
    `;
  }

  showErrorState(message) {
    this.elements.abbreviationsList.innerHTML = `
      <div class="empty-state" role="alert">
        <h3>Erro</h3>
        <p>${this.escapeHtml(message)}</p>
      </div>
    `;
  }

  showEmptyState() {
    this.elements.abbreviationsList.innerHTML = `
      <div class="empty-state">
        <h3>Nenhuma abreviação encontrada</h3>
        <p>${
          this.state.searchTerm
            ? "Tente ajustar sua busca."
            : "Comece criando sua primeira abreviação."
        }</p>
      </div>
    `;
  }

  // Update status text
  updateStatusText() {
    this.elements.statusText.textContent = this.state.isEnabled
      ? "Habilitado"
      : "Desabilitado";
  }

  // Load abbreviations with error handling
  async loadAbbreviations() {
    try {
      this.showLoadingState();
      const freshAbbreviations = await TextExpanderDB.getAllAbbreviations();
      this.state.abbreviations = Array.isArray(freshAbbreviations)
        ? freshAbbreviations
        : [];
      this.filterAbbreviations();
    } catch (error) {
      console.error("Error loading abbreviations:", error);
      this.showErrorState("Não foi possível carregar as abreviações.");
    }
  }

  // Load categories
  async loadCategories() {
    try {
      const categories = await TextExpanderDB.getAllCategories();
      this.updateCategorySelect(categories);
    } catch (error) {
      console.error("Error loading categories:", error);
    }
  }

  // Update category select with new categories
  updateCategorySelect(categories) {
    const standardValues = ["Comum", "Pessoal", "Trabalho", "Personalizada"];
    const select = this.elements.newCategorySelect;

    // Remove old custom categories
    Array.from(select.options)
      .filter(opt => !standardValues.includes(opt.value))
      .forEach(opt => opt.remove());

    // Add new categories before "Personalizada"
    const personalizadaOption = select.querySelector(
      'option[value="Personalizada"]'
    );

    categories
      .filter(category => !standardValues.includes(category))
      .forEach(category => {
        if (!select.querySelector(`option[value="${CSS.escape(category)}"]`)) {
          const option = document.createElement("option");
          option.value = category;
          option.textContent = category;
          select.insertBefore(option, personalizadaOption);
        }
      });
  }

  // Render abbreviations with improved performance
  renderAbbreviations() {
    if (this.state.filteredAbbreviations.length === 0) {
      this.showEmptyState();
      return;
    }

    // Use DocumentFragment for better performance
    const fragment = document.createDocumentFragment();

    this.state.filteredAbbreviations.forEach(abbr => {
      const item = this.createAbbreviationItem(abbr);
      fragment.appendChild(item);
    });

    this.elements.abbreviationsList.innerHTML = "";
    this.elements.abbreviationsList.appendChild(fragment);
  }

  // Create individual abbreviation item
  createAbbreviationItem(abbr) {
    const item = document.createElement("div");
    item.className = "abbreviation-item";
    item.setAttribute("role", "listitem");

    const expansionPreviewHtml = this.createExpansionPreview(abbr.expansion);
    const fullExpansionTitle = this.escapeHtml(abbr.expansion);

    item.innerHTML = `
      <div class="abbreviation-details">
        <div class="abbreviation-text">${this.escapeHtml(
          abbr.abbreviation
        )}</div>
        <div class="expansion-text" title="${fullExpansionTitle}">${expansionPreviewHtml}</div>
        <div class="category-badge">${this.escapeHtml(
          abbr.category || "Comum"
        )}</div>
      </div>
      <div class="item-actions">
        <button class="action-btn edit-btn" title="Editar abreviação" aria-label="Editar ${this.escapeHtml(
          abbr.abbreviation
        )}">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path d="M12 20h9"></path>
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
          </svg>
        </button>
        <button class="action-btn delete-btn" title="Excluir abreviação" aria-label="Excluir ${this.escapeHtml(
          abbr.abbreviation
        )}">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path d="M3 6h18"></path>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6z"></path>
            <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </div>
    `;

    // Add event listeners to buttons
    const editBtn = item.querySelector(".edit-btn");
    const deleteBtn = item.querySelector(".delete-btn");

    editBtn.addEventListener("click", () => this.handleEditAbbreviation(abbr));
    deleteBtn.addEventListener("click", () =>
      this.handleDeleteAbbreviation(abbr.abbreviation)
    );

    return item;
  }

  // Filter abbreviations with improved search
  filterAbbreviations() {
    this.state.searchTerm = this.elements.searchInput.value
      .trim()
      .toLowerCase();

    if (this.state.searchTerm === "") {
      this.state.filteredAbbreviations = [...this.state.abbreviations];
    } else {
      this.state.filteredAbbreviations = this.state.abbreviations.filter(
        abbr => {
          const searchableText = [
            abbr.abbreviation,
            abbr.expansion,
            abbr.category || "",
          ]
            .join(" ")
            .toLowerCase();

          return searchableText.includes(this.state.searchTerm);
        }
      );
    }

    this.renderAbbreviations();
  }

  // Handle toggle enabled
  handleToggleEnabled() {
    this.state.isEnabled = this.elements.enabledToggle.checked;
    this.updateStatusText();
    chrome.storage.sync.set({ enabled: this.state.isEnabled });
  }

  // Show modal with improved accessibility
  showModal(abbr = null) {
    if (abbr) {
      this.populateEditForm(abbr);
    } else {
      this.resetForm();
    }

    this.elements.addEditModal.classList.remove("hidden");
    this.elements.addEditModal.setAttribute("aria-hidden", "false");

    // Focus management
    setTimeout(() => {
      this.elements.newAbbreviationInput.focus();
    }, 50);

    // Trap focus within modal
    this.trapFocus();
  }

  // Populate form for editing
  populateEditForm(abbr) {
    this.state.currentEditId = abbr.abbreviation;
    this.elements.modalTitle.textContent = "Editar Abreviação";
    this.elements.newAbbreviationInput.value = abbr.abbreviation;
    this.elements.newAbbreviationInput.readOnly = true;
    this.elements.newExpansionTextarea.value = abbr.expansion;
    this.elements.newCaseSensitiveCheckbox.checked =
      abbr.caseSensitive || false;

    this.setCategoryValue(abbr.category);
  }

  // Reset form for new abbreviation
  resetForm() {
    this.state.currentEditId = null;
    this.elements.modalTitle.textContent = "Adicionar Nova Abreviação";
    this.elements.newAbbreviationInput.value = "";
    this.elements.newAbbreviationInput.readOnly = false;
    this.elements.newExpansionTextarea.value = "";
    this.elements.newCaseSensitiveCheckbox.checked = false;
    this.elements.newCategorySelect.value = "Comum";
    this.elements.customCategoryGroup.style.display = "none";
    this.elements.newCustomCategoryInput.value = "";
  }

  // Set category value in select
  setCategoryValue(category) {
    const standardCategories = ["Comum", "Pessoal", "Trabalho"];

    if (!category || standardCategories.includes(category)) {
      this.elements.newCategorySelect.value = category || "Comum";
      this.elements.customCategoryGroup.style.display = "none";
      this.elements.newCustomCategoryInput.value = "";
    } else {
      // Ensure custom category exists in select
      if (
        !this.elements.newCategorySelect.querySelector(
          `option[value="${CSS.escape(category)}"]`
        )
      ) {
        const option = document.createElement("option");
        option.value = category;
        option.textContent = category;
        const personalizadaOption =
          this.elements.newCategorySelect.querySelector(
            'option[value="Personalizada"]'
          );
        this.elements.newCategorySelect.insertBefore(
          option,
          personalizadaOption
        );
      }

      this.elements.newCategorySelect.value = category;
      this.elements.customCategoryGroup.style.display = "none";
      this.elements.newCustomCategoryInput.value = "";
    }
  }

  // Hide modal
  hideModal() {
    this.elements.addEditModal.classList.add("hidden");
    this.elements.addEditModal.setAttribute("aria-hidden", "true");
  }

  // Basic focus trap for modal
  trapFocus() {
    const focusableElements = this.elements.addEditModal.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );

    if (focusableElements.length === 0) return;

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    const handleTabKey = e => {
      if (e.key !== "Tab") return;

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          lastElement.focus();
          e.preventDefault();
        }
      } else {
        if (document.activeElement === lastElement) {
          firstElement.focus();
          e.preventDefault();
        }
      }
    };

    this.elements.addEditModal.addEventListener("keydown", handleTabKey);
  }

  // Open dashboard
  openDashboard() {
    chrome.tabs.create({
      url: chrome.runtime.getURL("dashboard/dashboard.html"),
    });
    window.close();
  }

  // Handle save abbreviation with validation
  async handleSaveAbbreviation() {
    const formData = this.getFormData();

    if (!this.validateFormData(formData)) {
      return;
    }

    const abbrData = {
      abbreviation: formData.abbreviation,
      expansion: formData.expansion,
      category: formData.category,
      caseSensitive: formData.caseSensitive,
      enabled: true,
    };

    try {
      if (this.state.currentEditId) {
        await TextExpanderDB.updateAbbreviation(abbrData);
        SoteNotifier.show("Abreviação atualizada!", "success");
      } else {
        await TextExpanderDB.addAbbreviation(abbrData);
        SoteNotifier.show("Abreviação criada!", "success");
      }

      await this.performLocalRefresh();
      this.hideModal();
    } catch (error) {
      console.error("Error saving abbreviation:", error);
      const message = error.message.includes("Key already exists")
        ? "Essa abreviação já existe."
        : "Erro ao salvar a abreviação.";
      SoteNotifier.show(message, "error");
    }
  }

  // Get form data
  getFormData() {
    let category = this.elements.newCategorySelect.value;

    if (category === "Personalizada") {
      category = this.elements.newCustomCategoryInput.value.trim();
    }

    return {
      abbreviation: this.elements.newAbbreviationInput.value.trim(),
      expansion: this.elements.newExpansionTextarea.value.trim(),
      category,
      caseSensitive: this.elements.newCaseSensitiveCheckbox.checked,
    };
  }

  // Validate form data
  validateFormData(data) {
    if (!data.abbreviation || !data.expansion) {
      SoteNotifier.show("Abreviação e expansão são obrigatórias.", "error");
      return false;
    }

    if (
      this.elements.newCategorySelect.value === "Personalizada" &&
      !data.category
    ) {
      SoteNotifier.show(
        "O nome da categoria personalizada é obrigatório.",
        "error"
      );
      return false;
    }

    return true;
  }

  // Handle edit abbreviation
  handleEditAbbreviation(abbr) {
    this.showModal(abbr);
  }

  // Handle delete abbreviation
  handleDeleteAbbreviation(abbreviationKey) {
    SoteConfirmationModal.show({
      title: "Excluir Abreviação",
      message: `Você tem certeza que quer excluir a abreviação "<strong>${this.escapeHtml(
        abbreviationKey
      )}</strong>"? Esta ação não pode ser desfeita.`,
      onConfirm: async () => {
        try {
          await TextExpanderDB.deleteAbbreviation(abbreviationKey);
          SoteNotifier.show("Abreviação excluída.", "success");
          await this.performLocalRefresh();
        } catch (error) {
          console.error("Error deleting abbreviation:", error);
          SoteNotifier.show("Erro ao excluir abreviação.", "error");
        }
      },
    });
  }

  // Perform local refresh
  async performLocalRefresh() {
    await Promise.all([this.loadAbbreviations(), this.loadCategories()]);
  }

  // Cleanup method
  destroy() {
    this.abortController.abort();
    clearTimeout(this.debounceTimer);
  }
}

// Initialize when DOM is ready
let popupManager;

document.addEventListener("DOMContentLoaded", () => {
  popupManager = new PopupManager();
});

// Cleanup on unload
window.addEventListener("beforeunload", () => {
  if (popupManager) {
    popupManager.destroy();
  }
});
