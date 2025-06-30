// SOTE-main/dashboard/dashboard.js
(function () {
  "use strict";

  // ===== STATE MANAGEMENT =====
  let state = {
    abbreviations: [],
    filteredAbbreviations: [],
    categories: [],
    currentCategory: "all",
    searchTerm: "",
    sortColumn: null,
    sortDirection: "asc",
    selectedAbbreviations: new Set(),
    currentEditingAbbreviation: null,
    currentEditingRule: null,
    currentChoiceId: null,
    importPreviewData: [],
  };

  // ===== DOM ELEMENTS =====
  let elements = {};

  // ===== UTILITY FUNCTIONS =====
  function log(message, ...args) {
    console.log(`[SOTE Dashboard] ${message}`, ...args);
  }

  function logError(message, error) {
    console.error(`[SOTE Dashboard] ${message}`, error);
  }

  function escapeHtml(text) {
    if (typeof text !== "string") return "";
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  function debounce(func, delay) {
    let timeoutId;
    return function (...args) {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => func.apply(this, args), delay);
    };
  }

  function sendMessageToBackground(type, payload) {
    return new Promise((resolve, reject) => {
      if (!type || typeof type !== "string") {
        return reject(new Error("Tipo de mensagem deve ser uma string válida"));
      }

      const message = { type };
      if (payload !== undefined) {
        message.payload = payload;
      }

      chrome.runtime.sendMessage(message, response => {
        if (chrome.runtime.lastError) {
          return reject(new Error(chrome.runtime.lastError.message));
        }
        if (response && response.error) {
          return reject(new Error(response.details || response.error));
        }
        resolve(response);
      });
    });
  }

  // ===== DOM INITIALIZATION =====
  function initializeElements() {
    const elementIds = [
      "enabled-toggle",
      "status-text",
      "category-list",
      "search-input",
      "add-btn",
      "abbreviations-list",
      "select-all-checkbox",
      "export-btn",
      "export-selected-btn",
      "export-category-btn",
      "import-btn",
      "settings-btn",
      "modal-container",
      "modal-title",
      "modal-close",
      "modal-cancel",
      "modal-save",
      "abbreviation-form",
      "abbreviation",
      "title",
      "expansion",
      "category",
      "custom-category-input-container",
      "custom-category",
      "case-sensitive",
      "enabled",
      "import-modal",
      "import-modal-close",
      "import-modal-cancel",
      "import-modal-confirm",
      "import-drop-zone",
      "import-file-btn",
      "import-file-input",
      "import-step-1",
      "import-step-2",
      "import-summary",
      "import-preview-list",
      "settings-modal",
      "settings-modal-close",
      "settings-modal-cancel",
      "settings-modal-save",
      "trigger-space",
      "trigger-tab",
      "trigger-enter",
      "setting-ignore-password",
      "exclusion-list",
      "autocomplete-enabled",
      "autocomplete-min-chars",
      "autocomplete-max-suggestions",
      "setting-max-choices",
      "setting-undo",
      "clear-data-btn",
      "rules-modal",
      "rules-modal-close",
      "rules-modal-cancel",
      "rules-modal-save",
      "rules-list",
      "add-rule-btn",
      "rule-form",
      "rule-type",
      "days-section",
      "time-section",
      "domain-section",
      "special-date-section",
      "combined-rule-section",
      "rule-expansion",
      "rule-priority",
      "add-special-date-btn",
      "special-dates-list",
      "choice-config-modal",
      "choice-modal-title",
      "choice-modal-close",
      "choice-modal-cancel",
      "choice-modal-save",
      "choice-config-form",
      "choice-options-container",
      "add-choice-option-btn",
      "btn-edit-choice",
      "rule-btn-edit-choice",
    ];

    elements = {};
    for (const id of elementIds) {
      elements[id] = document.getElementById(id);
      if (!elements[id]) {
        console.warn(`Element with ID '${id}' not found`);
      }
    }
  }

  // ===== DATA MANAGEMENT =====
  async function loadInitialData() {
    showLoadingState();
    try {
      const response = await sendMessageToBackground(
        SOTE_CONSTANTS.MESSAGE_TYPES.GET_STATE
      );
      updateLocalState(response);
    } catch (error) {
      logError("Failed to load initial data:", error);
      SoteNotifier.show("Erro ao carregar dados iniciais.", "error");
    } finally {
      // Garantir que o estado de loading seja removido
      const tbody = elements["abbreviations-list"];
      if (tbody && tbody.querySelector(".loading")) {
        tbody.innerHTML = "";
      }
    }
  }

  function showLoadingState() {
    const tbody = elements["abbreviations-list"];
    if (tbody) {
      tbody.innerHTML = `
              <tr role="row">
                  <td colspan="9" class="loading">
                      <div class="loading-spinner" aria-hidden="true"></div>
                      Carregando abreviações...
                  </td>
              </tr>
          `;
    }
  }

  function updateLocalState(newState) {
    if (newState.abbreviations) {
      state.abbreviations = newState.abbreviations;
      updateCategories();
      filterAndRenderAbbreviations();
    }
    if (newState.settings) {
      updateToggleState(newState.settings.enabled !== false);
    }
    if (newState.isEnabled !== undefined) {
      updateToggleState(newState.isEnabled);
    }
  }

  function updateToggleState(isEnabled) {
    elements["enabled-toggle"].checked = isEnabled;
    elements["status-text"].textContent = isEnabled
      ? "Habilitado"
      : "Desabilitado";
  }

  function updateCategories() {
    const categories = Array.from(
      new Set(state.abbreviations.map(abbr => abbr.category).filter(Boolean))
    ).sort();

    const categoryList = elements["category-list"];
    const allItem = categoryList.querySelector('[data-category="all"]');
    categoryList.innerHTML = "";
    if (allItem) categoryList.appendChild(allItem);

    categories.forEach(category => {
      const li = document.createElement("li");
      li.className = "category-item";
      li.dataset.category = category;
      li.role = "listitem";
      li.tabIndex = 0;
      li.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h7"></path></svg>
        <span>${escapeHtml(category)}</span>`;
      categoryList.appendChild(li);
    });
    state.categories = categories;
  }

  // ===== FILTERING, SORTING, AND RENDERING =====
  function filterAndRenderAbbreviations() {
    let filtered = [...state.abbreviations];

    if (state.currentCategory !== "all") {
      filtered = filtered.filter(
        abbr => abbr.category === state.currentCategory
      );
    }

    if (state.searchTerm) {
      const searchLower = state.searchTerm.toLowerCase();
      filtered = filtered.filter(abbr =>
        [
          abbr.abbreviation,
          abbr.title || "",
          abbr.expansion,
          abbr.category || "",
        ]
          .join(" ")
          .toLowerCase()
          .includes(searchLower)
      );
    }

    if (state.sortColumn) {
      filtered.sort((a, b) => {
        let aVal = a[state.sortColumn] || "";
        let bVal = b[state.sortColumn] || "";
        if (state.sortColumn === "lastUsed") {
          aVal = aVal ? new Date(aVal).getTime() : 0;
          bVal = bVal ? new Date(bVal).getTime() : 0;
        } else if (typeof aVal === "string") {
          aVal = aVal.toLowerCase();
          bVal = bVal.toLowerCase();
        }
        if (aVal < bVal) return state.sortDirection === "asc" ? -1 : 1;
        if (aVal > bVal) return state.sortDirection === "asc" ? 1 : -1;
        return 0;
      });
    }

    state.filteredAbbreviations = filtered;
    renderAbbreviations();
    updateExportButtons();
  }

  function renderAbbreviations() {
    const tbody = elements["abbreviations-list"];
    if (!tbody) return;

    if (state.filteredAbbreviations.length === 0) {
      tbody.innerHTML = `
        <tr><td colspan="9" style="text-align: center; padding: 2rem; color: #6b7280;">
          Nenhuma abreviação encontrada.
        </td></tr>`;
      return;
    }

    tbody.innerHTML = "";
    state.filteredAbbreviations.forEach(abbr => {
      const row = createAbbreviationRow(abbr);
      tbody.appendChild(row);
    });
    updateSelectAllCheckbox();
  }

  function createAbbreviationRow(abbr) {
    const isSelected = state.selectedAbbreviations.has(abbr.abbreviation);
    const hasRules = abbr.rules && abbr.rules.length > 0;
    const lastUsedText = abbr.lastUsed
      ? new Date(abbr.lastUsed).toLocaleDateString("pt-BR")
      : "Nunca";
    const expansionPreview = createExpansionPreview(abbr.expansion);
    const row = document.createElement("tr");
    row.dataset.abbreviation = abbr.abbreviation;

    const titleDisplay = abbr.title
      ? `<div class="abbreviation-title-display" title="${escapeHtml(
          abbr.title
        )}">${escapeHtml(abbr.title)}</div>`
      : '<div class="abbreviation-title-empty">—</div>';
    const shortcutDisplay = `<div class="abbreviation-shortcut-display">${escapeHtml(
      abbr.abbreviation
    )}</div>`;

    row.innerHTML = `
      <td class="checkbox-cell"><input type="checkbox" ${
        isSelected ? "checked" : ""
      }></td>
      <td class="title-cell">${titleDisplay}</td>
      <td class="shortcut-cell">${shortcutDisplay}</td>
      <td class="expansion-cell">${expansionPreview}</td>
      <td><span class="category-badge">${escapeHtml(
        abbr.category || "Comum"
      )}</span></td>
      <td style="text-align: center;">${abbr.usageCount || 0}</td>
      <td>${lastUsedText}</td>
      <td style="text-align: center;">${hasRules ? "Sim" : "Não"}</td>
      <td>
        <div class="table-actions">
          <button class="action-btn edit" title="Editar"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg></button>
          <button class="action-btn rules" title="Regras"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"></path></svg></button>
          <button class="action-btn delete" title="Excluir"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6z"></path><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
        </div>
      </td>
    `;
    // Attach styles to SVG elements for better rendering
    row.querySelectorAll("svg").forEach(svg => {
      svg.setAttribute("fill", "none");
      svg.setAttribute("stroke", "currentColor");
      svg.setAttribute("stroke-width", "2");
      svg.setAttribute("stroke-linecap", "round");
      svg.setAttribute("stroke-linejoin", "round");
    });

    row
      .querySelector('input[type="checkbox"]')
      .addEventListener("change", e =>
        handleRowSelection(abbr.abbreviation, e.target.checked)
      );
    row
      .querySelector(".edit")
      .addEventListener("click", () => editAbbreviation(abbr.abbreviation));
    row
      .querySelector(".rules")
      .addEventListener("click", () => openRulesModal(abbr.abbreviation));
    row
      .querySelector(".delete")
      .addEventListener("click", () => deleteAbbreviation(abbr.abbreviation));

    return row;
  }

  function createExpansionPreview(expansion) {
    if (typeof expansion !== "string") return "";
    const badges = {
      choice:
        '<span class="action-preview-badge choice-badge" title="Opção de escolha">❓ Escolha</span>',
      cursor:
        '<span class="action-preview-badge cursor-badge" title="Posição do cursor">📍 Cursor</span>',
      clipboard:
        '<span class="action-preview-badge clipboard-badge" title="Área de transferência">📋 Transf.</span>',
    };
    let previewHtml = escapeHtml(expansion)
      .replace(/\$choice\(id=\d+\)\$/g, badges.choice)
      .replace(/\$cursor\$/g, badges.cursor)
      .replace(/\$transferencia\$/g, badges.clipboard);
    return `<div title="${escapeHtml(expansion)}">${previewHtml}</div>`;
  }

  // ===== MODAL MANAGEMENT =====
  function showModal(title = "Adicionar Nova Abreviação") {
    elements["modal-title"].textContent = title;
    elements["modal-container"].classList.remove("hidden");
    setTimeout(() => elements["title"]?.focus(), 100);
  }

  function hideModal() {
    elements["modal-container"].classList.add("hidden");
    resetForm();
  }

  function resetForm() {
    elements["abbreviation-form"].reset();
    elements["abbreviation"].readOnly = false;
    elements["custom-category-input-container"].style.display = "none";
    state.currentEditingAbbreviation = null;
    updateChoiceButtons();
  }

  function populateForm(abbr) {
    elements["title"].value = abbr.title || "";
    elements["abbreviation"].value = abbr.abbreviation;
    elements["expansion"].value = abbr.expansion;
    elements["case-sensitive"].checked = abbr.caseSensitive || false;
    elements["enabled"].checked = abbr.enabled !== false;

    const categorySelect = elements["category"];
    const standardCategories = [
      "Comum",
      "Pessoal",
      "Trabalho",
      "Personalizada",
    ];
    const isCustom = !standardCategories.includes(abbr.category);

    if (isCustom) {
      let option = categorySelect.querySelector(
        `option[value="${escapeHtml(abbr.category)}"]`
      );
      if (!option) {
        option = document.createElement("option");
        option.value = abbr.category;
        option.textContent = abbr.category;
        categorySelect.insertBefore(
          option,
          categorySelect.querySelector('option[value="Personalizada"]')
        );
      }
      categorySelect.value = abbr.category;
      elements["custom-category-input-container"].style.display = "none";
    } else {
      categorySelect.value = abbr.category || "Comum";
      elements["custom-category-input-container"].style.display = "none";
    }

    updateChoiceButtons();
  }

  // ===== FORM HANDLING =====
  async function handleFormSubmit(event) {
    event.preventDefault();
    const formData = getFormData();
    if (!validateFormData(formData)) return;
    try {
      const messageType = state.currentEditingAbbreviation
        ? SOTE_CONSTANTS.MESSAGE_TYPES.UPDATE_ABBREVIATION
        : SOTE_CONSTANTS.MESSAGE_TYPES.ADD_ABBREVIATION;
      await sendMessageToBackground(messageType, formData);
      SoteNotifier.show(
        state.currentEditingAbbreviation
          ? "Abreviação atualizada!"
          : "Abreviação criada!",
        "success"
      );
      hideModal();
    } catch (error) {
      logError("Error saving abbreviation:", error);
      SoteNotifier.show(
        error.message.includes("Key already exists")
          ? "Essa abreviação já existe."
          : "Erro ao salvar.",
        "error"
      );
    }
  }

  function getFormData() {
    let category = elements["category"].value;
    if (category === "Personalizada") {
      category = elements["custom-category"].value.trim();
    }
    return {
      abbreviation: elements["abbreviation"].value.trim(),
      title: elements["title"].value.trim(),
      expansion: elements["expansion"].value.trim(),
      category,
      caseSensitive: elements["case-sensitive"].checked,
      enabled: elements["enabled"].checked,
    };
  }

  function validateFormData(data) {
    if (!data.abbreviation || !data.expansion) {
      SoteNotifier.show("Atalho e mensagem são obrigatórios.", "error");
      return false;
    }
    if (elements["category"].value === "Personalizada" && !data.category) {
      SoteNotifier.show(
        "O nome da categoria personalizada é obrigatório.",
        "error"
      );
      return false;
    }
    return true;
  }

  // ===== IMPORT/EXPORT/SETTINGS/CHOICE MODALS (NEW) =====

  // --- Import Modal ---
  function showImportModal() {
    elements["import-step-1"].classList.remove("hidden");
    elements["import-step-2"].classList.add("hidden");
    elements["import-modal-confirm"].classList.add("hidden");
    elements["import-modal"].classList.remove("hidden");
  }

  function hideImportModal() {
    elements["import-modal"].classList.add("hidden");
    // Reset import form
    const dropZone = elements["import-drop-zone"];
    dropZone.classList.remove("dragover");
    elements["import-file-input"].value = "";
    elements["import-preview-list"].innerHTML = "";
    elements["import-summary"].innerHTML = "";
  }

  function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
      processImportFile(file);
    }
  }

  function handleFileDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    elements["import-drop-zone"].classList.remove("dragover");
    const file = event.dataTransfer.files[0];
    if (file) {
      processImportFile(file);
    }
  }

  function processImportFile(file) {
    if (!file.type.includes("json")) {
      SoteNotifier.show("Por favor, selecione um arquivo .json.", "error");
      return;
    }
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const data = JSON.parse(e.target.result);
        previewImportData(data);
      } catch (error) {
        SoteNotifier.show("Arquivo JSON inválido ou corrompido.", "error");
      }
    };
    reader.readAsText(file);
  }

  async function previewImportData(data) {
    if (!Array.isArray(data)) {
      SoteNotifier.show(
        "O arquivo JSON deve conter um array de abreviações.",
        "error"
      );
      return;
    }

    const previewList = elements["import-preview-list"];
    const summary = elements["import-summary"];
    previewList.innerHTML = "";
    let toAdd = 0,
      toUpdate = 0,
      toSkip = 0;

    const existingAbbrs = new Set(state.abbreviations.map(a => a.abbreviation));

    state.importPreviewData = data.map(item => {
      let status = "added";
      if (existingAbbrs.has(item.abbreviation)) {
        status = "updated";
        toUpdate++;
      } else {
        toAdd++;
      }
      return { ...item, status };
    });

    summary.innerHTML = `
        <div class="summary-item added"><span class="count">${toAdd}</span>Novas</div>
        <div class="summary-item updated"><span class="count">${toUpdate}</span>Atualizadas</div>
        <div class="summary-item skipped"><span class="count">${toSkip}</span>Ignoradas</div>
    `;

    state.importPreviewData.forEach(item => {
      const row = document.createElement("tr");
      row.innerHTML = `
            <td><span class="status-badge ${item.status}">${
        item.status === "added" ? "Nova" : "Atualiza"
      }</span></td>
            <td>${escapeHtml(item.abbreviation)}</td>
            <td>${escapeHtml(item.expansion.substring(0, 50))}...</td>
            <td>${
              item.status === "updated" ? "Sobrescreverá" : "Será adicionada"
            }</td>
        `;
      previewList.appendChild(row);
    });

    elements["import-step-1"].classList.add("hidden");
    elements["import-step-2"].classList.remove("hidden");
    elements["import-modal-confirm"].classList.remove("hidden");
  }

  async function confirmImport() {
    const isMerge = document.querySelector(
      'input[name="import-mode"][value="merge"]'
    ).checked;
    try {
      await sendMessageToBackground(
        SOTE_CONSTANTS.MESSAGE_TYPES.IMPORT_ABBREVIATIONS,
        {
          data: state.importPreviewData,
          isMerge: isMerge,
        }
      );
      SoteNotifier.show("Dados importados com sucesso!", "success");
      hideImportModal();
    } catch (error) {
      logError("Error importing data:", error);
      SoteNotifier.show("Falha ao importar dados.", "error");
    }
  }

  // --- Settings Modal ---
  function showSettingsModal() {
    loadSettings();
    elements["settings-modal"].classList.remove("hidden");
  }

  function hideSettingsModal() {
    elements["settings-modal"].classList.add("hidden");
  }

  function loadSettings() {
    chrome.storage.sync.get(null, settings => {
      elements["trigger-space"].checked = settings.triggerSpace !== false;
      elements["trigger-tab"].checked = settings.triggerTab !== false;
      elements["trigger-enter"].checked = settings.triggerEnter !== false;
      elements["setting-ignore-password"].checked =
        settings.ignorePasswordFields !== false;
      elements["setting-undo"].checked = settings.enableUndo !== false;
      elements["exclusion-list"].value = (settings.exclusionList || []).join(
        "\n"
      );
      elements["autocomplete-enabled"].checked =
        settings.autocompleteEnabled !== false;
      elements["autocomplete-min-chars"].value =
        settings.autocompleteMinChars || 2;
      elements["autocomplete-max-suggestions"].value =
        settings.autocompleteMaxSuggestions || 5;
      elements["setting-max-choices"].value = settings.maxChoices || 3;
    });
  }

  async function saveSettings() {
    const settings = {
      triggerSpace: elements["trigger-space"].checked,
      triggerTab: elements["trigger-tab"].checked,
      triggerEnter: elements["trigger-enter"].checked,
      ignorePasswordFields: elements["setting-ignore-password"].checked,
      enableUndo: elements["setting-undo"].checked,
      exclusionList: elements["exclusion-list"].value
        .split("\n")
        .map(s => s.trim())
        .filter(Boolean),
      autocompleteEnabled: elements["autocomplete-enabled"].checked,
      autocompleteMinChars: parseInt(
        elements["autocomplete-min-chars"].value,
        10
      ),
      autocompleteMaxSuggestions: parseInt(
        elements["autocomplete-max-suggestions"].value,
        10
      ),
      maxChoices: parseInt(elements["setting-max-choices"].value, 10),
    };

    await chrome.storage.sync.set(settings);
    SoteNotifier.show("Configurações salvas!", "success");
    hideSettingsModal();
  }

  // --- Export Logic ---
  function exportData(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    SoteNotifier.show(`Exportação "${filename}" iniciada.`, "info");
  }

  function handleExportAll() {
    exportData(state.abbreviations, "sote_export_all.json");
  }

  function handleExportSelected() {
    const selected = state.abbreviations.filter(abbr =>
      state.selectedAbbreviations.has(abbr.abbreviation)
    );
    if (selected.length > 0) {
      exportData(selected, "sote_export_selected.json");
    }
  }

  function handleExportCategory() {
    if (state.currentCategory !== "all") {
      const categoryData = state.abbreviations.filter(
        abbr => abbr.category === state.currentCategory
      );
      exportData(
        categoryData,
        `sote_export_${state.currentCategory.toLowerCase()}.json`
      );
    }
  }

  // ===== CHOICE MANAGEMENT =====
  function updateChoiceButtons() {
    const expansion = elements["expansion"].value;
    const insertBtn = document.getElementById("btn-insert-choice");
    const editBtn = document.getElementById("btn-edit-choice");
    if (!insertBtn || !editBtn) return;
    const choiceMatch = expansion.match(/\$choice\(id=(\d+)\)\$/);
    if (choiceMatch) {
      insertBtn.classList.add("hidden");
      editBtn.classList.remove("hidden");
      state.currentChoiceId = parseInt(choiceMatch[1], 10);
    } else {
      insertBtn.classList.remove("hidden");
      editBtn.classList.add("hidden");
      state.currentChoiceId = null;
    }
  }

  function openChoiceConfigModal() {
    if (state.currentChoiceId) {
      // Logic to open modal and load existing choice data
      SoteNotifier.show(
        `Editando escolha ID: ${state.currentChoiceId}. (Funcionalidade em desenvolvimento)`,
        "info"
      );
    } else {
      // Logic to create a new choice
      SoteNotifier.show(
        "Criando nova escolha. (Funcionalidade em desenvolvimento)",
        "info"
      );
    }
    elements["choice-config-modal"].classList.remove("hidden");
  }

  function hideChoiceConfigModal() {
    elements["choice-config-modal"].classList.add("hidden");
  }

  // ===== EVENT HANDLERS =====
  function handleCategoryChange() {
    const isCustom = elements["category"].value === "Personalizada";
    elements["custom-category-input-container"].style.display = isCustom
      ? "block"
      : "none";
    if (isCustom) {
      setTimeout(() => elements["custom-category"]?.focus(), 100);
    }
  }

  function handleSearch() {
    state.searchTerm = elements["search-input"].value.trim();
    filterAndRenderAbbreviations();
  }

  function handleCategoryClick(event) {
    const categoryItem = event.target.closest(".category-item");
    if (!categoryItem) return;
    document
      .querySelectorAll(".category-item")
      .forEach(item => item.classList.remove("active"));
    categoryItem.classList.add("active");
    state.currentCategory = categoryItem.dataset.category;
    filterAndRenderAbbreviations();
  }

  function handleSort(event) {
    const th = event.target.closest("th.sortable");
    if (!th) return;
    const column = th.dataset.sort;
    if (state.sortColumn === column) {
      state.sortDirection = state.sortDirection === "asc" ? "desc" : "asc";
    } else {
      state.sortColumn = column;
      state.sortDirection = "asc";
    }
    document.querySelectorAll("th.sortable").forEach(header => {
      header.classList.remove("sorted-asc", "sorted-desc");
      header.setAttribute("aria-sort", "none");
    });
    th.classList.add(`sorted-${state.sortDirection}`);
    th.setAttribute(
      "aria-sort",
      state.sortDirection === "asc" ? "ascending" : "descending"
    );
    filterAndRenderAbbreviations();
  }

  function handleRowSelection(abbreviation, isSelected) {
    if (isSelected) state.selectedAbbreviations.add(abbreviation);
    else state.selectedAbbreviations.delete(abbreviation);
    updateSelectAllCheckbox();
    updateExportButtons();
  }

  function handleSelectAll(event) {
    const isSelected = event.target.checked;
    state.selectedAbbreviations.clear();
    if (isSelected) {
      state.filteredAbbreviations.forEach(abbr =>
        state.selectedAbbreviations.add(abbr.abbreviation)
      );
    }
    document
      .querySelectorAll('#abbreviations-list input[type="checkbox"]')
      .forEach(checkbox => (checkbox.checked = isSelected));
    updateExportButtons();
  }

  function updateSelectAllCheckbox() {
    const totalVisible = state.filteredAbbreviations.length;
    const selectedVisible = Array.from(state.selectedAbbreviations).filter(
      abbrKey =>
        state.filteredAbbreviations.some(abbr => abbr.abbreviation === abbrKey)
    ).length;

    elements["select-all-checkbox"].checked =
      totalVisible > 0 && selectedVisible === totalVisible;
    elements["select-all-checkbox"].indeterminate =
      selectedVisible > 0 && selectedVisible < totalVisible;
  }

  function updateExportButtons() {
    elements["export-selected-btn"].style.display =
      state.selectedAbbreviations.size > 0 ? "" : "none";
    const isCategoryView = state.currentCategory !== "all";
    elements["export-category-btn"].style.display = isCategoryView
      ? ""
      : "none";
    if (isCategoryView) {
      elements["export-category-btn"].querySelector(
        "span"
      ).textContent = `Exportar Categoria "${state.currentCategory}"`;
    }
  }

  // ===== ACTION FUNCTIONS =====
  function editAbbreviation(abbreviationKey) {
    const abbr = state.abbreviations.find(
      a => a.abbreviation === abbreviationKey
    );
    if (!abbr) return;
    state.currentEditingAbbreviation = abbreviationKey;
    elements["abbreviation"].readOnly = true;
    populateForm(abbr);
    showModal("Editar Abreviação");
  }

  function deleteAbbreviation(abbreviationKey) {
    SoteConfirmationModal.show({
      title: "Excluir Abreviação",
      message: `Você tem certeza que quer excluir a abreviação "<strong>${escapeHtml(
        abbreviationKey
      )}</strong>"?`,
      onConfirm: async () => {
        try {
          await sendMessageToBackground(
            SOTE_CONSTANTS.MESSAGE_TYPES.DELETE_ABBREVIATION,
            { abbreviationKey }
          );
          SoteNotifier.show("Abreviação excluída!", "success");
        } catch (error) {
          logError("Error deleting abbreviation:", error);
          SoteNotifier.show("Erro ao excluir abreviação.", "error");
        }
      },
    });
  }

  // ===== INITIALIZATION =====
  function setupEventListeners() {
    // Toggle
    elements["enabled-toggle"].addEventListener("change", e =>
      chrome.storage.sync.set({ enabled: e.target.checked })
    );

    // Search and Sort
    elements["search-input"].addEventListener(
      "input",
      debounce(handleSearch, 300)
    );
    document
      .querySelector(".abbreviations-table thead")
      .addEventListener("click", handleSort);

    // Main Actions
    elements["add-btn"].addEventListener("click", () => showModal());
    elements["category-list"].addEventListener("click", handleCategoryClick);

    // Main Modal
    elements["modal-close"].addEventListener("click", hideModal);
    elements["modal-cancel"].addEventListener("click", hideModal);
    elements["abbreviation-form"].addEventListener("submit", handleFormSubmit);
    elements["category"].addEventListener("change", handleCategoryChange);
    elements["expansion"].addEventListener("input", updateChoiceButtons);

    // Selection
    elements["select-all-checkbox"].addEventListener("change", handleSelectAll);

    // --- New Listeners for Modals and Actions ---
    // Import
    elements["import-btn"].addEventListener("click", showImportModal);
    elements["import-modal-close"].addEventListener("click", hideImportModal);
    elements["import-modal-cancel"].addEventListener("click", hideImportModal);
    elements["import-file-btn"].addEventListener("click", () =>
      elements["import-file-input"].click()
    );
    elements["import-file-input"].addEventListener("change", handleFileSelect);
    elements["import-drop-zone"].addEventListener("dragover", e => {
      e.preventDefault();
      e.target.classList.add("dragover");
    });
    elements["import-drop-zone"].addEventListener("dragleave", e =>
      e.target.classList.remove("dragover")
    );
    elements["import-drop-zone"].addEventListener("drop", handleFileDrop);
    elements["import-modal-confirm"].addEventListener("click", confirmImport);

    // Export
    elements["export-btn"].addEventListener("click", handleExportAll);
    elements["export-selected-btn"].addEventListener(
      "click",
      handleExportSelected
    );
    elements["export-category-btn"].addEventListener(
      "click",
      handleExportCategory
    );

    // Settings
    elements["settings-btn"].addEventListener("click", showSettingsModal);
    elements["settings-modal-close"].addEventListener(
      "click",
      hideSettingsModal
    );
    elements["settings-modal-cancel"].addEventListener(
      "click",
      hideSettingsModal
    );
    elements["settings-modal-save"].addEventListener("click", saveSettings);
    elements["clear-data-btn"].addEventListener("click", () => {
      SoteConfirmationModal.show({
        title: "Apagar Todos os Dados",
        message:
          "Esta ação é irreversível e apagará TODAS as suas abreviações, regras e configurações. Tem certeza?",
        requireInput: true,
        confirmationText: "Apagar Tudo",
        onConfirm: async () => {
          await sendMessageToBackground(
            SOTE_CONSTANTS.MESSAGE_TYPES.CLEAR_ALL_DATA
          );
          SoteNotifier.show("Todos os dados foram apagados.", "success");
        },
      });
    });

    // Choice Modal
    elements["btn-edit-choice"].addEventListener("click", () =>
      openChoiceConfigModal()
    );
    elements["choice-modal-close"].addEventListener(
      "click",
      hideChoiceConfigModal
    );
    elements["choice-modal-cancel"].addEventListener(
      "click",
      hideChoiceConfigModal
    );

    // Global Keydowns
    document.addEventListener("keydown", e => {
      if (e.key === "Escape") {
        if (!elements["modal-container"].classList.contains("hidden"))
          hideModal();
        if (!elements["import-modal"].classList.contains("hidden"))
          hideImportModal();
        if (!elements["settings-modal"].classList.contains("hidden"))
          hideSettingsModal();
        if (!elements["choice-config-modal"].classList.contains("hidden"))
          hideChoiceConfigModal();
      }
    });

    // Insert action buttons
    document.querySelectorAll(".btn-insert-action").forEach(button => {
      button.addEventListener("click", event => {
        const action = event.target.getAttribute("data-action");
        if (action && elements["expansion"]) {
          const textarea = event.target
            .closest(".modal-body")
            .querySelector("textarea");
          if (textarea) insertTextAtCursor(textarea, action);
        }
      });
    });
  }

  function insertTextAtCursor(textarea, text) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const value = textarea.value;

    textarea.value = value.substring(0, start) + text + value.substring(end);
    textarea.setSelectionRange(start + text.length, start + text.length);
    textarea.focus();
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function setupMessageListener() {
    chrome.runtime.onMessage.addListener(message => {
      if (message.type === SOTE_CONSTANTS.MESSAGE_TYPES.STATE_UPDATED) {
        log("Dashboard recebeu STATE_UPDATED.");
        updateLocalState(message.payload);
      }
      return true; // Keep message channel open for async responses
    });
  }

  async function init() {
    try {
      initializeElements();
      setupEventListeners();
      setupMessageListener();
      await loadInitialData();
      log("Dashboard initialized successfully");
    } catch (error) {
      logError("Failed to initialize dashboard:", error);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
