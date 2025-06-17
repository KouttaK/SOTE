// SOTE-main/dashboard/dashboard.js

// --- Gerenciador de Modais para Lazy Loading ---
const modalManager = {
  templates: new Map(),
  activeModals: new Set(),
  async load(modalName) {
    if (this.templates.has(modalName)) {
      return this.templates.get(modalName);
    }
    try {
      const response = await fetch(`modals/${modalName}.html`);
      if (!response.ok)
        throw new Error(`Falha ao carregar o template do modal: ${modalName}`);
      const html = await response.text();
      this.templates.set(modalName, html);
      return html;
    } catch (error) {
      console.error(error);
      SoteNotifier.show(`Erro ao carregar o modal ${modalName}.`, "error");
      return null;
    }
  },
  show(modalId) {
    const modalElement = document.getElementById(modalId);
    if (modalElement) {
      modalElement.classList.remove("hidden");
      this.activeModals.add(modalId);
    }
  },
  hide(modalId) {
    const modalElement = document.getElementById(modalId);
    if (modalElement) {
      modalElement.classList.add("hidden");
      this.activeModals.delete(modalId);
      setTimeout(() => {
        if (modalElement.parentElement) {
          modalPlaceholder.removeChild(modalElement.parentElement);
        }
      }, 300);
    }
  },
};

// --- Worker Setup ---
let dataWorker;
let workerCallbacks = new Map();
let nextWorkerTaskId = 0;

function initializeWorker() {
  try {
    dataWorker = new Worker(chrome.runtime.getURL("workers/dataWorker.js"));
    dataWorker.onmessage = event => {
      const { id, type, result, error } = event.data;
      if (workerCallbacks.has(id)) {
        const { resolve, reject } = workerCallbacks.get(id);
        if (type === "SUCCESS") resolve(result);
        else reject(new Error(error));
        workerCallbacks.delete(id);
      }
    };
    dataWorker.onerror = error => {
      console.error("Erro no Data Worker:", error);
      for (const [id, { reject }] of workerCallbacks.entries()) {
        reject(new Error("Erro geral no Worker."));
        workerCallbacks.delete(id);
      }
    };
  } catch (e) {
    console.error("Falha ao inicializar o Worker:", e);
    dataWorker = null;
  }
}

function postTaskToWorker(type, data) {
  if (!dataWorker)
    return Promise.reject(new Error("Worker não está disponível."));
  const id = nextWorkerTaskId++;
  return new Promise((resolve, reject) => {
    workerCallbacks.set(id, { resolve, reject });
    dataWorker.postMessage({ id, type, data });
  });
}

// --- Elementos DOM Globais ---
const modalPlaceholder = document.getElementById("modal-placeholder");
const enabledToggle = document.getElementById("enabled-toggle");
const statusText = document.getElementById("status-text");
const categoryList = document.getElementById("category-list");
const searchInput = document.getElementById("search-input");
const abbreviationsListElement = document.getElementById("abbreviations-list");
const addBtn = document.getElementById("add-btn");
const selectAllCheckbox = document.getElementById("select-all-checkbox");
let searchDebounceTimer = null;

// --- State (Removido e movido para dashboardStore) ---
// As variáveis de estado como `abbreviations`, `filteredAbbreviations`, etc., são agora gerenciadas pelo `dashboardStore`.
let currentEditId = null;
let currentChoiceIdForEdit = null;
let activeTextareaForChoice = null;
let isEnabled = true;
let settings = { maxChoices: 3 };
let currentAbbreviationIdForRules = null;
let currentEditingRuleId = null;
let importDataToProcess = [];

// --- Funções Utilitárias ---
function escapeHtml(text) {
  if (typeof text !== "string") return "";
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function createExpansionPreview(expansion) {
  if (typeof expansion !== "string") return "";
  let previewHtml = escapeHtml(expansion);
  previewHtml = previewHtml.replace(
    /\$choice\(id=\d+\)\$/g,
    '<span class="action-preview-badge choice-badge">❓ Ação de Escolha</span>'
  );
  previewHtml = previewHtml.replace(
    /\$cursor\$/g,
    '<span class="action-preview-badge cursor-badge">📍 Cursor</span>'
  );
  previewHtml = previewHtml.replace(
    /\$transferencia\$/g,
    '<span class="action-preview-badge clipboard-badge">📋 Área de Transferência</span>'
  );
  return `<div>${previewHtml}</div>`;
}

function formatExpansionForDisplay(text) {
  if (typeof text !== "string") return "";
  return text
    .replace(/\$cursor\$/g, "[cursor]")
    .replace(/\$transferencia\$/g, "[clipboard]");
}

function insertTextAtCursor(textarea, textToInsert) {
  if (!textarea || typeof textToInsert !== "string") return;
  const startPos = textarea.selectionStart;
  const endPos = textarea.selectionEnd;
  textarea.value = `${textarea.value.substring(
    0,
    startPos
  )}${textToInsert}${textarea.value.substring(endPos)}`;
  const newPos = startPos + textToInsert.length;
  textarea.selectionStart = newPos;
  textarea.selectionEnd = newPos;
  textarea.focus();
}

async function performLocalRefresh() {
  // Agora, em vez de recarregar tudo manualmente, apenas despachamos uma ação.
  await dashboardStore.dispatch("refreshData");
  if (currentAbbreviationIdForRules && document.getElementById("rules-modal")) {
    loadAndDisplayRules(currentAbbreviationIdForRules); // Esta função ainda pode precisar de lógica local.
  }
}

// --- Funções de Renderização (Agora reagem ao estado do store) ---
function renderUI(state) {
  renderAbbreviations(state);
  renderCategories(state);
  renderLoading(state);
  handleRowSelection(); // Atualiza os botões de exportação/exclusão
}

function renderLoading({ loading }) {
  if (loading && abbreviationsListElement.querySelector("td.loading")) {
    abbreviationsListElement.innerHTML = `<tr><td colspan="8" class="loading"><div class="loading-spinner"></div>Carregando...</td></tr>`;
  }
}

function renderCategories({ categories }) {
  const allCategoryItem = categoryList.querySelector('[data-category="all"]');
  // Evita a repintura se as categorias não mudaram
  const existingCategories = Array.from(
    categoryList.querySelectorAll(".category-item")
  ).map(el => el.dataset.category);
  if (
    JSON.stringify(existingCategories.slice(1)) === JSON.stringify(categories)
  ) {
    return;
  }

  categoryList.innerHTML = "";
  if (allCategoryItem) categoryList.appendChild(allCategoryItem);

  const fragment = document.createDocumentFragment();
  categories.forEach(category => {
    const li = document.createElement("li");
    li.className = "category-item";
    li.dataset.category = category;
    li.textContent = category;
    li.addEventListener("click", () => handleCategoryFilter(category));
    fragment.appendChild(li);
  });
  categoryList.appendChild(fragment);

  // Atualiza o item ativo
  document
    .querySelectorAll(".category-item")
    .forEach(item =>
      item.classList.toggle(
        "active",
        item.dataset.category === dashboardStore.state.currentCategory
      )
    );
}

function renderAbbreviations({ filteredAbbreviations, currentSort }) {
  selectAllCheckbox.checked = false;
  handleRowSelection();

  if (filteredAbbreviations.length === 0 && !dashboardStore.state.loading) {
    abbreviationsListElement.innerHTML = `<tr><td colspan="8" class="loading">Nenhuma abreviação encontrada.</td></tr>`;
    return;
  }

  // Evita renderizar se nada mudou (comparação superficial)
  if (
    abbreviationsListElement.dataset.renderedCount ==
      filteredAbbreviations.length &&
    abbreviationsListElement.dataset.renderedSort ===
      JSON.stringify(currentSort)
  ) {
    // return;
  }

  abbreviationsListElement.dataset.renderedCount = filteredAbbreviations.length;
  abbreviationsListElement.dataset.renderedSort = JSON.stringify(currentSort);

  const fragment = document.createDocumentFragment();
  filteredAbbreviations.forEach(abbr => {
    const row = document.createElement("tr");
    let lastUsedText = abbr.lastUsed
      ? new Date(abbr.lastUsed).toLocaleString("pt-BR")
      : "Nunca";
    const expansionPreviewHtml = createExpansionPreview(abbr.expansion);
    const fullExpansionTitle = escapeHtml(abbr.expansion);

    row.innerHTML = `
      <td class="checkbox-cell"><input type="checkbox" class="row-checkbox" data-id="${
        abbr.abbreviation
      }"></td>
      <td>${escapeHtml(abbr.abbreviation)}</td>
      <td class="expansion-cell" title="${fullExpansionTitle}">${expansionPreviewHtml}</td>
      <td><span class="category-badge">${escapeHtml(
        abbr.category || "N/A"
      )}</span></td>
      <td>${abbr.usageCount || 0}</td>
      <td>${lastUsedText}</td>
      <td>${abbr.rules?.length || 0}</td>
      <td><div class="table-actions">
          <button class="action-btn edit" title="Editar"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg></button>
          <button class="action-btn rules" title="Regras"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5C17.3 10.7 18 9.8 18 9a2.3 2.3 0 0 0-.8-2.3c-.5-.7-1.1-1.2-1.9-1.5-1.6-.4-3.2.3-4.2 1.5-1 1.2-1.2 2.8-.5 4.1.2.5.5 1 .8 1.4V14zM9 18c-4.51 2-5-2-7-2m18 0c-4.51 2-5-2-7-2m-4 4c-4.51 2-5-2-7-2m18 0c-4.51 2-5-2-7-2"/></svg></button>
          <button class="action-btn delete" title="Excluir"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18m-2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3-2V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
      </div></td>`;

    row
      .querySelector(".edit")
      .addEventListener("click", () => showMainFormModal(abbr));
    row
      .querySelector(".delete")
      .addEventListener("click", () =>
        handleDeleteAbbreviation(abbr.abbreviation)
      );
    row
      .querySelector(".rules")
      .addEventListener("click", () => showRulesModal(abbr.abbreviation));
    fragment.appendChild(row);
  });

  // Limpa e adiciona o novo conteúdo de uma vez
  abbreviationsListElement.innerHTML = "";
  abbreviationsListElement.appendChild(fragment);

  document
    .querySelectorAll(".abbreviations-table th.sortable")
    .forEach(header => {
      header.classList.remove("sorted-asc", "sorted-desc");
      if (header.dataset.sort === currentSort.column)
        header.classList.add(`sorted-${currentSort.direction}`);
    });
}

// --- Funções de Manipulação de Eventos (Agora despacham ações) ---
function handleSearch() {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    dashboardStore.dispatch("setSearchTerm", searchInput.value);
  }, 350);
}

function handleCategoryFilter(category) {
  dashboardStore.dispatch("setCategory", category);

  // Lógica da UI que não pertence ao store
  const exportCategoryBtn = document.getElementById("export-category-btn");
  if (category && category !== "all") {
    exportCategoryBtn.style.display = "flex";
    exportCategoryBtn.querySelector(
      "span"
    ).textContent = `Exportar "${category}"`;
  } else {
    exportCategoryBtn.style.display = "none";
  }
}

function handleSort(column) {
  const currentSort = dashboardStore.state.currentSort;
  const newDirection =
    currentSort.column === column && currentSort.direction === "asc"
      ? "desc"
      : "asc";
  dashboardStore.dispatch("setSort", { column, direction: newDirection });
}

function handleToggleEnabled() {
  isEnabled = enabledToggle.checked;
  statusText.textContent = isEnabled ? "Habilitado" : "Disabilitado";
  chrome.storage.sync.set({ enabled: isEnabled });
}

function handleSelectAll() {
  abbreviationsListElement
    .querySelectorAll(".row-checkbox")
    .forEach(cb => (cb.checked = selectAllCheckbox.checked));
  handleRowSelection();
}

function handleRowSelection() {
  const selectedCount = abbreviationsListElement.querySelectorAll(
    ".row-checkbox:checked"
  ).length;
  const exportSelectedBtn = document.getElementById("export-selected-btn");
  if (selectedCount > 0) {
    exportSelectedBtn.style.display = "flex";
    exportSelectedBtn.querySelector(
      "span"
    ).textContent = `Exportar (${selectedCount}) Selecionadas`;
  } else {
    exportSelectedBtn.style.display = "none";
  }
  const allCheckboxes =
    abbreviationsListElement.querySelectorAll(".row-checkbox");
  selectAllCheckbox.checked =
    allCheckboxes.length > 0 && selectedCount === allCheckboxes.length;
}

// --- Funções de Manipulação dos Modais (Lazy Loaded) ---

// Modal Principal de Adicionar/Editar
async function showMainFormModal(abbr = null) {
  const modalId = "modal-container";
  if (!document.getElementById(modalId)) {
    const html = await modalManager.load("main-form");
    if (!html) return;
    const wrapper = document.createElement("div");
    wrapper.innerHTML = html;
    modalPlaceholder.appendChild(wrapper);
    setupMainFormModalListeners();
  }

  const abbreviationInput = document.getElementById("abbreviation");
  const expansionTextarea = document.getElementById("expansion");
  const categorySelect = document.getElementById("category");
  const caseSensitiveCheckbox = document.getElementById("case-sensitive");
  const enabledCheckbox = document.getElementById("enabled");
  const modalTitle = document.getElementById("modal-title");
  const customCategoryContainer = document.getElementById(
    "custom-category-input-container"
  );
  const customCategoryInput = document.getElementById("custom-category");

  const personalizadaOption = categorySelect.querySelector(
    'option[value="Personalizada"]'
  );
  // Usa as categorias do store
  const categories = dashboardStore.state.categories;
  Array.from(categorySelect.options)
    .filter(
      opt =>
        !["Comum", "Pessoal", "Trabalho", "Personalizada"].includes(opt.value)
    )
    .forEach(opt => opt.remove());
  categories.forEach(category => {
    if (
      !categorySelect.querySelector(`option[value="${escapeHtml(category)}"]`)
    ) {
      const option = document.createElement("option");
      option.value = category;
      option.textContent = category;
      categorySelect.insertBefore(option, personalizadaOption);
    }
  });

  if (abbr) {
    modalTitle.textContent = "Editar Abreviação";
    abbreviationInput.value = abbr.abbreviation;
    abbreviationInput.readOnly = true;
    expansionTextarea.value = abbr.expansion;
    caseSensitiveCheckbox.checked = abbr.caseSensitive || false;
    enabledCheckbox.checked = abbr.enabled !== false;
    currentEditId = abbr.abbreviation;
    categorySelect.value = abbr.category || "Comum";
  } else {
    modalTitle.textContent = "Adicionar Nova Abreviação";
    abbreviationInput.value = "";
    abbreviationInput.readOnly = false;
    expansionTextarea.value = "";
    categorySelect.value = "Comum";
    caseSensitiveCheckbox.checked = false;
    enabledCheckbox.checked = true;
    currentEditId = null;
  }

  customCategoryContainer.style.display =
    categorySelect.value === "Personalizada" ? "block" : "none";
  customCategoryInput.value = "";

  updateChoiceButtonsVisibility();
  modalManager.show(modalId);
  abbreviationInput.focus();
}

function setupMainFormModalListeners() {
  document
    .getElementById("modal-close")
    .addEventListener("click", () => modalManager.hide("modal-container"));
  document
    .getElementById("modal-cancel")
    .addEventListener("click", () => modalManager.hide("modal-container"));
  document
    .getElementById("modal-save")
    .addEventListener("click", handleSaveAbbreviation);
  document
    .getElementById("expansion")
    .addEventListener("input", updateChoiceButtonsVisibility);
  document.getElementById("btn-insert-choice").addEventListener("click", () => {
    activeTextareaForChoice = document.getElementById("expansion");
    showChoiceConfigModal();
  });
  document
    .getElementById("btn-edit-choice")
    .addEventListener("click", handleEditChoice);
  document.getElementById("category").addEventListener("change", e => {
    document.getElementById("custom-category-input-container").style.display =
      e.target.value === "Personalizada" ? "block" : "none";
  });
}

// Modal de Configuração de Escolha
async function showChoiceConfigModal(options = null, choiceId = null) {
  const modalId = "choice-config-modal";
  if (!document.getElementById(modalId)) {
    const html = await modalManager.load("choice");
    if (!html) return;
    const wrapper = document.createElement("div");
    wrapper.innerHTML = html;
    modalPlaceholder.appendChild(wrapper);
    setupChoiceConfigModalListeners();
  }

  const choiceOptionsContainer = document.getElementById(
    "choice-options-container"
  );
  const choiceModal = document.getElementById(modalId);
  const choiceModalTitle = document.getElementById("choice-modal-title");
  choiceOptionsContainer.innerHTML = "";

  if (choiceId) {
    choiceModal.dataset.editingId = choiceId;
    choiceModalTitle.textContent = "Editar Ação de Escolha";
    if (options && options.length > 0) {
      options.forEach(opt => addChoiceOption(opt.title, opt.message));
    }
  } else {
    delete choiceModal.dataset.editingId;
    choiceModalTitle.textContent = "Configurar Ação de Escolha";
    addChoiceOption();
  }

  modalManager.show(modalId);
}

function setupChoiceConfigModalListeners() {
  const modalId = "choice-config-modal";
  document
    .getElementById("choice-modal-close")
    .addEventListener("click", () => modalManager.hide(modalId));
  document
    .getElementById("choice-modal-cancel")
    .addEventListener("click", () => modalManager.hide(modalId));
  document
    .getElementById("add-choice-option-btn")
    .addEventListener("click", () => addChoiceOption());
  document
    .getElementById("choice-modal-save")
    .addEventListener("click", handleSaveChoice);
  document
    .getElementById("choice-options-container")
    .addEventListener("click", e => {
      if (e.target.closest(".delete-choice-option")) {
        e.target.closest(".choice-option-item").remove();
        updateChoiceOptionButtons();
      }
    });
}

// Modal de Regras
async function showRulesModal(abbreviationId) {
  const modalId = "rules-modal";
  if (!document.getElementById(modalId)) {
    const html = await modalManager.load("rules");
    if (!html) return;
    const wrapper = document.createElement("div");
    wrapper.innerHTML = html;
    modalPlaceholder.appendChild(wrapper);
    setupRulesModalListeners();
  }
  currentAbbreviationIdForRules = abbreviationId;
  const abbrObj = dashboardStore.state.abbreviations.find(
    a => a.abbreviation === abbreviationId
  );
  document.getElementById("rules-modal-title").textContent = `Regras para "${
    abbrObj ? abbrObj.abbreviation : ""
  }"`;
  resetRuleForm();
  loadAndDisplayRules(abbreviationId);
  modalManager.show(modalId);
}

function setupRulesModalListeners() {
  const modalId = "rules-modal";
  document
    .getElementById("rules-modal-close")
    .addEventListener("click", () => modalManager.hide(modalId));
  document
    .getElementById("rules-modal-cancel")
    .addEventListener("click", () => {
      document.getElementById("rule-form").classList.add("hidden");
      document.getElementById("add-rule-btn").classList.remove("hidden");
    });
  document
    .getElementById("add-rule-btn")
    .addEventListener("click", handleShowRuleForm);
  document
    .getElementById("rule-type")
    .addEventListener("change", handleRuleTypeChange);
  document
    .getElementById("rules-modal-save")
    .addEventListener("click", handleSaveRule);
  document
    .getElementById("rule-expansion")
    .addEventListener("input", updateRuleChoiceButtonsVisibility);
  document
    .getElementById("rule-btn-insert-choice")
    .addEventListener("click", () => {
      activeTextareaForChoice = document.getElementById("rule-expansion");
      showChoiceConfigModal();
    });
  document
    .getElementById("rule-btn-edit-choice")
    .addEventListener("click", handleEditChoice);
  const subConditionsList = document.getElementById("sub-conditions-list");
  document
    .getElementById("add-sub-condition-btn")
    ?.addEventListener("click", () => handleAddSubCondition(null));
  subConditionsList?.addEventListener("click", event => {
    if (event.target.closest(".remove-sub-condition-btn")) {
      event.target.closest(".sub-condition-item").remove();
    }
    if (event.target.classList.contains("sub-condition-type")) {
      renderSubConditionFields(
        event.target.value,
        event.target
          .closest(".sub-condition-item")
          .querySelector(".sub-condition-fields"),
        null
      );
    }
  });
}

// Modal de Importação
async function showImportModal() {
  const modalId = "import-modal";
  if (!document.getElementById(modalId)) {
    const html = await modalManager.load("import");
    if (!html) return;
    const wrapper = document.createElement("div");
    wrapper.innerHTML = html;
    modalPlaceholder.appendChild(wrapper);
    setupImportModalListeners();
  }
  document.getElementById("import-step-1").classList.remove("hidden");
  document.getElementById("import-step-2").classList.add("hidden");
  document.getElementById("import-modal-confirm").classList.add("hidden");
  document.getElementById("import-file-input").value = "";
  importDataToProcess = [];
  modalManager.show(modalId);
}

function setupImportModalListeners() {
  const modalId = "import-modal";
  const importDropZone = document.getElementById("import-drop-zone");
  document
    .getElementById("import-modal-close")
    .addEventListener("click", () => modalManager.hide(modalId));
  document
    .getElementById("import-modal-cancel")
    .addEventListener("click", () => modalManager.hide(modalId));
  document
    .getElementById("import-modal-confirm")
    .addEventListener("click", handleConfirmImport);
  document
    .getElementById("import-file-btn")
    .addEventListener("click", () =>
      document.getElementById("import-file-input").click()
    );
  document
    .getElementById("import-file-input")
    .addEventListener("change", handleFileSelect);
  importDropZone.addEventListener("dragover", handleDragOver);
  importDropZone.addEventListener("dragleave", handleDragLeave);
  importDropZone.addEventListener("drop", handleDrop);
}

// Modal de Configurações
async function showSettingsModal() {
  const modalId = "settings-modal";
  if (!document.getElementById(modalId)) {
    const html = await modalManager.load("settings");
    if (!html) return;
    const wrapper = document.createElement("div");
    wrapper.innerHTML = html;
    modalPlaceholder.appendChild(wrapper);
    setupSettingsModalListeners();
  }
  loadSettings();
  modalManager.show(modalId);
}

function setupSettingsModalListeners() {
  const modalId = "settings-modal";
  document
    .getElementById("settings-modal-close")
    .addEventListener("click", () => modalManager.hide(modalId));
  document
    .getElementById("settings-modal-cancel")
    .addEventListener("click", () => modalManager.hide(modalId));
  document
    .getElementById("settings-modal-save")
    .addEventListener("click", handleSaveSettings);
  document
    .getElementById("clear-data-btn")
    .addEventListener("click", handleClearData);
}

// --- Funções de Lógica (restantes) ---
async function handleSaveAbbreviation() {
  const abbreviationVal = document.getElementById("abbreviation").value.trim();
  const expansionVal = document.getElementById("expansion").value.trim();
  let categoryVal = document.getElementById("category").value;
  const customCategoryVal = document
    .getElementById("custom-category")
    .value.trim();
  const caseSensitiveVal = document.getElementById("case-sensitive").checked;
  const enabledVal = document.getElementById("enabled").checked;

  if (!abbreviationVal || !expansionVal) {
    SoteNotifier.show("Abreviação e expansão são obrigatórias.", "error");
    return;
  }
  if (categoryVal === "Personalizada") {
    if (!customCategoryVal) {
      SoteNotifier.show(
        "Nome da categoria personalizada é obrigatório.",
        "error"
      );
      return;
    }
    categoryVal = customCategoryVal;
  }

  const abbrData = {
    abbreviation: abbreviationVal,
    expansion: expansionVal,
    category: categoryVal,
    caseSensitive: caseSensitiveVal,
    enabled: enabledVal,
  };

  try {
    // Despacha a ação de salvar, que lida com a lógica de BD, cache e notificação.
    await dashboardStore.dispatch("saveAbbreviation", {
      data: abbrData,
      isEditing: !!currentEditId,
    });
    modalManager.hide("modal-container");
    // O refresh já é chamado dentro da ação `saveAbbreviation`.
  } catch (error) {
    // O erro já é tratado e notificado dentro da ação, mas o catch previne erros não tratados.
    console.log("Falha ao salvar a partir da UI.", error);
  }
}

async function handleDeleteAbbreviation(abbreviationKey) {
  SoteConfirmationModal.show({
    title: "Excluir Abreviação",
    message: `Tem certeza que quer excluir "<strong>${escapeHtml(
      abbreviationKey
    )}</strong>" e todas as suas regras? A ação não pode ser desfeita.`,
    onConfirm: async () => {
      // Despacha a ação de exclusão.
      await dashboardStore.dispatch("deleteAbbreviation", abbreviationKey);
    },
  });
}

function updateChoiceButtonsVisibility() {
  const expansionTextarea = document.getElementById("expansion");
  if (!expansionTextarea) return;
  const expansionText = expansionTextarea.value;
  const choiceRegex = /\$choice\(id=(\d+)\)\$/;
  const match = expansionText.match(choiceRegex);
  const btnInsertChoice = document.getElementById("btn-insert-choice");
  const btnEditChoice = document.getElementById("btn-edit-choice");

  if (match && match[1]) {
    currentChoiceIdForEdit = parseInt(match[1], 10);
    btnInsertChoice.classList.add("hidden");
    btnEditChoice.classList.remove("hidden");
  } else {
    currentChoiceIdForEdit = null;
    btnInsertChoice.classList.remove("hidden");
    btnEditChoice.classList.add("hidden");
  }
}

function updateRuleChoiceButtonsVisibility() {
  const ruleExpansionTextarea = document.getElementById("rule-expansion");
  if (!ruleExpansionTextarea) return;
  const expansionText = ruleExpansionTextarea.value;
  const choiceRegex = /\$choice\(id=(\d+)\)\$/;
  const match = expansionText.match(choiceRegex);
  const ruleBtnInsertChoice = document.getElementById("rule-btn-insert-choice");
  const ruleBtnEditChoice = document.getElementById("rule-btn-edit-choice");

  if (match && match[1]) {
    currentChoiceIdForEdit = parseInt(match[1], 10);
    ruleBtnInsertChoice.classList.add("hidden");
    ruleBtnEditChoice.classList.remove("hidden");
  } else {
    currentChoiceIdForEdit = null;
    ruleBtnInsertChoice.classList.remove("hidden");
    ruleBtnEditChoice.classList.add("hidden");
  }
}

async function handleEditChoice() {
  if (!currentChoiceIdForEdit) {
    SoteNotifier.show("Nenhuma escolha encontrada para editar.", "error");
    return;
  }
  if (
    document.getElementById("rule-form") &&
    !document.getElementById("rule-form").classList.contains("hidden")
  ) {
    activeTextareaForChoice = document.getElementById("rule-expansion");
  } else {
    activeTextareaForChoice = document.getElementById("expansion");
  }

  try {
    const choiceData = await window.SOTECache.getChoiceConfig(
      currentChoiceIdForEdit
    );
    if (choiceData && choiceData.options) {
      showChoiceConfigModal(choiceData.options, currentChoiceIdForEdit);
    } else {
      SoteNotifier.show(
        `Configuração de escolha com ID ${currentChoiceIdForEdit} não encontrada.`,
        "error"
      );
    }
  } catch (error) {
    console.error("Erro ao buscar dados da escolha:", error);
    SoteNotifier.show("Falha ao carregar dados da escolha.", "error");
  }
}

function addChoiceOption(title = "", message = "") {
  const choiceOptionsContainer = document.getElementById(
    "choice-options-container"
  );
  const choiceOptionTemplate = document.getElementById(
    "choice-option-template"
  );

  if (choiceOptionsContainer.children.length >= settings.maxChoices) {
    SoteNotifier.show(
      `Você pode adicionar no máximo ${settings.maxChoices} opções.`,
      "warning"
    );
    return;
  }
  const templateClone = choiceOptionTemplate.content.cloneNode(true);
  templateClone.querySelector(".choice-option-title").value = title;
  templateClone.querySelector(".choice-option-message").value = message;
  choiceOptionsContainer.appendChild(templateClone);
  updateChoiceOptionButtons();
}

function updateChoiceOptionButtons() {
  const choiceOptionsContainer = document.getElementById(
    "choice-options-container"
  );
  const addChoiceOptionBtn = document.getElementById("add-choice-option-btn");
  const options = choiceOptionsContainer.querySelectorAll(
    ".choice-option-item"
  );

  addChoiceOptionBtn.style.display =
    options.length >= settings.maxChoices ? "none" : "inline-flex";
  options.forEach((option, index) => {
    option.querySelector(".rule-type").textContent = `Opção ${index + 1}`;
    option.querySelector(".delete-choice-option").style.display =
      options.length > 1 ? "inline-flex" : "none";
  });
}

async function handleSaveChoice() {
  const choiceConfigModal = document.getElementById("choice-config-modal");
  const choiceOptionsContainer = document.getElementById(
    "choice-options-container"
  );
  const isEditing = choiceConfigModal.dataset.editingId;
  const choiceId = isEditing ? parseInt(isEditing, 10) : null;
  const options = [];

  for (const el of choiceOptionsContainer.querySelectorAll(
    ".choice-option-item"
  )) {
    const title = el.querySelector(".choice-option-title").value.trim();
    const message = el.querySelector(".choice-option-message").value.trim();
    if (!title || !message) {
      SoteNotifier.show(
        "Títulos e mensagens das opções são obrigatórios.",
        "error"
      );
      return;
    }
    options.push({ title, message });
  }
  if (options.length === 0) {
    SoteNotifier.show("Pelo menos uma opção é necessária.", "error");
    return;
  }

  try {
    if (isEditing) {
      await window.TextExpanderDB.updateChoice(choiceId, options);
      await window.SOTECache.invalidateChoicesCache(choiceId);
      SoteNotifier.show("Ação de escolha atualizada!", "success");
    } else {
      const newChoiceId = await window.TextExpanderDB.addChoice(options);
      await window.SOTECache.invalidateChoicesCache(newChoiceId);
      insertTextAtCursor(
        activeTextareaForChoice,
        `$choice(id=${newChoiceId})$`
      );
      SoteNotifier.show("Ação de escolha inserida!", "success");
      if (activeTextareaForChoice.id === "expansion")
        updateChoiceButtonsVisibility();
      else if (activeTextareaForChoice.id === "rule-expansion")
        updateRuleChoiceButtonsVisibility();
    }
    await window.SOTECache.invalidateAbbreviationsCache();
    modalManager.hide("choice-config-modal");
  } catch (error) {
    console.error("Erro ao salvar a escolha:", error);
    SoteNotifier.show("Não foi possível salvar a escolha.", "error");
  }
}

function loadAndDisplayRules(abbreviationId) {
  const abbreviation = dashboardStore.state.abbreviations.find(
    abbr => abbr.abbreviation === abbreviationId
  );
  const rulesListDisplayElement = document.getElementById("rules-list");
  rulesListDisplayElement.innerHTML = "";
  if (!abbreviation || !abbreviation.rules || abbreviation.rules.length === 0) {
    rulesListDisplayElement.innerHTML = "<p>Nenhuma regra definida.</p>";
    return;
  }
  const sortedRules = [...abbreviation.rules].sort(
    (a, b) => (b.priority || 0) - (a.priority || 0)
  );
  const ruleTypeTranslations = {
    dayOfWeek: "Dia da Semana",
    timeRange: "Horário",
    domain: "Domínio",
    specialDate: "Data Especial",
    combined: "Combinada",
  };

  sortedRules.forEach(rule => {
    const ruleItem = document.createElement("div");
    ruleItem.className = "rule-item";
    let details = "";
    switch (rule.type) {
      case "dayOfWeek":
        details = `Dias: ${
          rule.days
            ?.map(d => ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"][d])
            .join(", ") || "N/A"
        }`;
        break;
      case "timeRange":
        details = `Horário: ${String(rule.startHour).padStart(2, "0")}:${String(
          rule.startMinute
        ).padStart(2, "0")} - ${String(rule.endHour).padStart(2, "0")}:${String(
          rule.endMinute
        ).padStart(2, "0")}`;
        break;
      case "domain":
        details = `Domínios: ${rule.domains?.join(", ") || "N/A"}`;
        break;
      case "specialDate":
        details = `Data: ${String(rule.day).padStart(2, "0")}/${String(
          rule.month
        ).padStart(2, "0")}`;
        break;
      case "combined":
        details = `Combinada (${rule.logicalOperator}): ${
          rule.subConditions
            ?.map(
              sc =>
                `${sc.negated ? "NÃO " : ""}${
                  ruleTypeTranslations[sc.conditionType]
                }`
            )
            .join(", ") || "N/A"
        }`;
        break;
    }
    ruleItem.innerHTML = `<div class="rule-header"><span class="rule-type">Prioridade ${
      rule.priority || 0
    } - ${
      ruleTypeTranslations[rule.type]
    }</span><div class="rule-actions"><button class="action-btn edit-rule"><svg xmlns="http://www.w3.org/2000/svg" width="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg></button><button class="action-btn delete-rule"><svg xmlns="http://www.w3.org/2000/svg" width="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18m-2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3-2V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button></div></div><div class="rule-details">${details}</div><div class="rule-expansion">Expansão: <strong>${formatExpansionForDisplay(
      rule.expansion
    )}</strong></div>`;
    ruleItem
      .querySelector(".edit-rule")
      .addEventListener("click", () => handleEditRule(rule));
    ruleItem
      .querySelector(".delete-rule")
      .addEventListener("click", () => handleDeleteRule(rule.id));
    rulesListDisplayElement.appendChild(ruleItem);
  });
}

function handleShowRuleForm() {
  currentEditingRuleId = null;
  resetRuleForm();
  document.getElementById("rule-form").classList.remove("hidden");
  document.getElementById("add-rule-btn").classList.add("hidden");
  document.querySelector("#rule-form h3").textContent = "Nova Regra";
  updateRuleChoiceButtonsVisibility();
}

function resetRuleForm() {
  const ruleForm = document.getElementById("rule-form");
  if (ruleForm) {
    ruleForm.reset();
    ruleForm
      .querySelectorAll('input[name="rule-day"]')
      .forEach(cb => (cb.checked = false));
    document.getElementById("sub-conditions-list").innerHTML = "";
    handleRuleTypeChange();
  }
}

function handleRuleTypeChange() {
  const type = document.getElementById("rule-type").value;
  document
    .getElementById("days-section")
    .classList.toggle("hidden", type !== "dayOfWeek");
  document
    .getElementById("time-section")
    .classList.toggle("hidden", type !== "timeRange");
  document
    .getElementById("domain-section")
    .classList.toggle("hidden", type !== "domain");
  document
    .getElementById("special-date-section")
    .classList.toggle("hidden", type !== "specialDate");
  document
    .getElementById("combined-rule-section")
    .classList.toggle("hidden", type !== "combined");
  if (
    type === "combined" &&
    document.getElementById("sub-conditions-list").children.length === 0
  )
    handleAddSubCondition(null);
}

async function handleSaveRule() {
  /* ... Lógica existente ... */
}
function handleEditRule(rule) {
  /* ... Lógica existente ... */
}
async function handleDeleteRule(ruleId) {
  /* ... Lógica existente ... */
}
function handleAddSubCondition(data = null) {
  /* ... Lógica existente ... */
}
function renderSubConditionFields(type, container, data) {
  /* ... Lógica existente ... */
}
function handleFileSelect(event) {
  const file = event.target.files[0];
  if (file) processImportFile(file);
}
function handleDragOver(event) {
  event.preventDefault();
  document.getElementById("import-drop-zone").classList.add("dragover");
}
function handleDragLeave(event) {
  event.preventDefault();
  document.getElementById("import-drop-zone").classList.remove("dragover");
}
function handleDrop(event) {
  event.preventDefault();
  document.getElementById("import-drop-zone").classList.remove("dragover");
  const file = event.dataTransfer.files[0];
  if (file && file.type === "application/json") processImportFile(file);
  else SoteNotifier.show("Por favor, solte um arquivo .json válido.", "error");
}
async function processImportFile(file) {
  const reader = new FileReader();
  reader.onload = async e => {
    try {
      const importData = JSON.parse(e.target.result);
      if (!Array.isArray(importData)) {
        SoteNotifier.show("O arquivo deve conter um array.", "error");
        return;
      }
      document.getElementById("import-step-1").classList.add("hidden");
      document.getElementById("import-step-2").classList.remove("hidden");
      document.getElementById(
        "import-preview-list"
      ).innerHTML = `<tr><td colspan="4" class="loading"><div class="loading-spinner"></div>Processando...</td></tr>`;

      const results = await postTaskToWorker("PROCESS_IMPORT", {
        importData: importData,
        existingData: dashboardStore.state.abbreviations,
        options: {
          mergeStrategy: document.querySelector(
            'input[name="import-mode"]:checked'
          ).value,
        },
      });
      generateImportPreview(results);
      document
        .getElementById("import-modal-confirm")
        .classList.remove("hidden");
    } catch (error) {
      SoteNotifier.show("Erro ao processar o arquivo JSON.", "error");
      modalManager.hide("import-modal");
    }
  };
  reader.readAsText(file);
}
function generateImportPreview(results) {
  importDataToProcess = results.preview;
  const importPreviewList = document.getElementById("import-preview-list");
  importPreviewList.innerHTML = "";
  if (results.preview.length === 0) {
    importPreviewList.innerHTML = `<tr><td colspan="4" class="loading">Nenhum item válido encontrado.</td></tr>`;
    return;
  }
  results.preview.forEach(item => {
    const row = document.createElement("tr");
    row.innerHTML = `<td><span class="status-badge ${item.status}">${
      item.status
    }</span></td><td>${escapeHtml(item.abbreviation)}</td><td>${escapeHtml(
      item.expansion.substring(0, 30)
    )}...</td><td>${escapeHtml(item.info)}</td>`;
    importPreviewList.appendChild(row);
  });
  document.getElementById(
    "import-summary"
  ).innerHTML = `<div class="summary-item added"><span class="count">${
    results.added
  }</span> Novas</div><div class="summary-item updated"><span class="count">${
    results.updated
  }</span> Atualizadas</div><div class="summary-item skipped"><span class="count">${
    results.skipped + results.errors.length
  }</span> Ignoradas</div>`;
}
async function handleConfirmImport() {
  const importMode = document.querySelector(
    'input[name="import-mode"]:checked'
  ).value;
  const dataToImport = importDataToProcess.filter(
    item =>
      item.status === "added" ||
      (item.status === "updated" && importMode !== "skip")
  );
  if (dataToImport.length === 0) {
    SoteNotifier.show("Nenhuma abreviação para importar.", "info");
    modalManager.hide("import-modal");
    return;
  }
  try {
    if (importMode === "replace")
      await window.TextExpanderDB.clearAllAbbreviations();
    const importedCount = await window.TextExpanderDB.importAbbreviations(
      dataToImport,
      importMode === "merge"
    );
    await window.SOTECache.invalidateAbbreviationsCache();
    modalManager.hide("import-modal");
    SoteNotifier.show(`${importedCount} abreviações processadas!`, "success");
    await dashboardStore.dispatch("refreshData");
  } catch (e) {
    SoteNotifier.show("Erro durante a importação final.", "error");
  }
}
async function handleExportAll() {
  try {
    const data = await window.SOTECache.getAllAbbreviations();
    exportDataAsJson(
      data,
      `sote-export-all-${new Date().toISOString().slice(0, 10)}.json`
    );
  } catch (e) {
    SoteNotifier.show("Erro ao exportar.", "error");
  }
}
async function handleExportSelected() {
  const selectedIds = Array.from(
    abbreviationsListElement.querySelectorAll(".row-checkbox:checked")
  ).map(cb => cb.dataset.id);
  if (selectedIds.length === 0) return;
  const dataToExport = dashboardStore.state.abbreviations.filter(abbr =>
    selectedIds.includes(abbr.abbreviation)
  );
  exportDataAsJson(
    dataToExport,
    `sote-export-selected-${new Date().toISOString().slice(0, 10)}.json`
  );
}
async function handleExportCategory() {
  const currentCategory = dashboardStore.state.currentCategory;
  if (!currentCategory || currentCategory === "all") return;
  try {
    const data = await window.SOTECache.getAbbreviationsByCategory(
      currentCategory
    );
    exportDataAsJson(
      data,
      `sote-export-categoria-${currentCategory}-${new Date()
        .toISOString()
        .slice(0, 10)}.json`
    );
  } catch (e) {
    SoteNotifier.show("Erro ao exportar a categoria.", "error");
  }
}
function exportDataAsJson(data, fileName) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
function loadSettings() {
  chrome.storage.sync.get(null, r => {
    document.getElementById("trigger-space").checked = r.triggerSpace !== false;
    document.getElementById("trigger-tab").checked = r.triggerTab !== false;
    document.getElementById("trigger-enter").checked = r.triggerEnter !== false;
    document.getElementById("setting-undo").checked = r.enableUndo !== false;
    document.getElementById("setting-ignore-password").checked =
      r.ignorePasswordFields !== false;
    document.getElementById("exclusion-list").value = (
      r.exclusionList || []
    ).join("\n");
    document.getElementById("autocomplete-enabled").checked =
      r.autocompleteEnabled !== false;
    document.getElementById("autocomplete-min-chars").value =
      r.autocompleteMinChars || 2;
    document.getElementById("autocomplete-max-suggestions").value =
      r.autocompleteMaxSuggestions || 5;
    const maxChoices = r.maxChoices || 3;
    settings.maxChoices = maxChoices;
    document.getElementById("setting-max-choices").value = maxChoices;
  });
}
function handleSaveSettings() {
  const newSettings = {
    triggerSpace: document.getElementById("trigger-space").checked,
    triggerTab: document.getElementById("trigger-tab").checked,
    triggerEnter: document.getElementById("trigger-enter").checked,
    enableUndo: document.getElementById("setting-undo").checked,
    ignorePasswordFields: document.getElementById("setting-ignore-password")
      .checked,
    exclusionList: document
      .getElementById("exclusion-list")
      .value.split("\n")
      .map(item => item.trim())
      .filter(Boolean),
    autocompleteEnabled: document.getElementById("autocomplete-enabled")
      .checked,
    autocompleteMinChars:
      parseInt(document.getElementById("autocomplete-min-chars").value, 10) ||
      2,
    autocompleteMaxSuggestions:
      parseInt(
        document.getElementById("autocomplete-max-suggestions").value,
        10
      ) || 5,
    maxChoices:
      parseInt(document.getElementById("setting-max-choices").value, 10) || 3,
  };
  chrome.storage.sync.set(newSettings, () => {
    modalManager.hide("settings-modal");
    SoteNotifier.show("Configurações salvas.", "success");
    settings.maxChoices = newSettings.maxChoices;
  });
}
async function handleClearData() {
  SoteConfirmationModal.show({
    title: "Apagar Todos os Dados",
    message:
      "Esta ação é <strong>permanente</strong>. Todas as abreviações, regras e configurações serão removidas.",
    onConfirm: async () => {
      try {
        await window.TextExpanderDB.clearAllAbbreviations();
        await window.SOTECache.clearAll();
        modalManager.hide("settings-modal");
        SoteNotifier.show("Todos os dados foram apagados.", "success");
        await dashboardStore.dispatch("refreshData");
      } catch (e) {
        SoteNotifier.show("Erro ao apagar dados.", "error");
      }
    },
  });
}

// --- Inicialização ---
async function init() {
  // Validação de dependências
  if (
    !globalThis.SoteNotifier ||
    !globalThis.SoteConfirmationModal ||
    !globalThis.dashboardStore
  ) {
    console.error(
      "Dependências críticas não foram carregadas. A aplicação não pode iniciar."
    );
    document.body.innerHTML =
      "<h1>Erro Crítico</h1><p>Falha ao carregar os componentes essenciais da aplicação.</p>";
    return;
  }

  initializeWorker();

  // Listeners globais da página
  enabledToggle.addEventListener("change", handleToggleEnabled);
  searchInput.addEventListener("input", handleSearch);
  selectAllCheckbox.addEventListener("change", handleSelectAll);
  abbreviationsListElement.addEventListener("change", handleRowSelection);
  document
    .querySelectorAll(".abbreviations-table th.sortable")
    .forEach(header =>
      header.addEventListener("click", () => handleSort(header.dataset.sort))
    );
  categoryList
    .querySelector('[data-category="all"]')
    .addEventListener("click", () => handleCategoryFilter("all"));
  addBtn.addEventListener("click", () => showMainFormModal(null));
  document
    .getElementById("import-btn")
    .addEventListener("click", showImportModal);
  document
    .getElementById("settings-btn")
    .addEventListener("click", showSettingsModal);
  document
    .getElementById("export-btn")
    .addEventListener("click", handleExportAll);
  document
    .getElementById("export-selected-btn")
    .addEventListener("click", handleExportSelected);
  document
    .getElementById("export-category-btn")
    .addEventListener("click", handleExportCategory);

  // Carrega estado inicial do toggle
  chrome.storage.sync.get("enabled", result => {
    isEnabled = result.enabled !== false;
    enabledToggle.checked = isEnabled;
    statusText.textContent = isEnabled ? "Habilitado" : "Disabilitado";
  });

  // Inscreve a função de renderização principal nas mudanças do store.
  dashboardStore.subscribe(renderUI);

  // Ouve por atualizações do service worker
  chrome.runtime.onMessage.addListener(message => {
    if (
      message.type === SOTE_CONSTANTS.MESSAGE_TYPES.ABBREVIATIONS_UPDATED ||
      message.type === SOTE_CONSTANTS.MESSAGE_TYPES.INITIAL_SEED_COMPLETE
    ) {
      dashboardStore.dispatch("refreshData");
    }
    return true;
  });

  // Carrega os dados iniciais através da ação do store.
  dashboardStore.dispatch("loadInitialData");
}

document.addEventListener("DOMContentLoaded", init);
