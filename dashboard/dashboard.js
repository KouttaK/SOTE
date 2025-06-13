// SOTE-main/dashboard/dashboard.js
// Elementos DOM
const enabledToggle = document.getElementById("enabled-toggle");
const statusText = document.getElementById("status-text");
const categoryList = document.getElementById("category-list");
const searchInput = document.getElementById("search-input");
const abbreviationsListElement = document.getElementById("abbreviations-list");
const addBtn = document.getElementById("add-btn");
const selectAllCheckbox = document.getElementById("select-all-checkbox");

// Modal Principal
const modalContainer = document.getElementById("modal-container");
const modalTitle = document.getElementById("modal-title");
const modalClose = document.getElementById("modal-close");
const modalCancel = document.getElementById("modal-cancel");
const modalSave = document.getElementById("modal-save");
const abbreviationInput = document.getElementById("abbreviation");
const expansionTextarea = document.getElementById("expansion");
const categorySelect = document.getElementById("category");
const customCategoryInputContainer = document.getElementById(
  "custom-category-input-container"
);
const customCategoryInput = document.getElementById("custom-category");
const caseSensitiveCheckbox = document.getElementById("case-sensitive");
const enabledCheckbox = document.getElementById("enabled");
const mainModalInsertActionButtons = document.querySelectorAll(
  "#modal-container .btn-insert-action"
);

// Import/Export
const importBtn = document.getElementById("import-btn");
const exportBtn = document.getElementById("export-btn");
const exportSelectedBtn = document.getElementById("export-selected-btn");
const exportCategoryBtn = document.getElementById("export-category-btn");
const importModal = document.getElementById("import-modal");
const importModalClose = document.getElementById("import-modal-close");
const importModalCancel = document.getElementById("import-modal-cancel");
const importModalConfirm = document.getElementById("import-modal-confirm");
const importStep1 = document.getElementById("import-step-1");
const importStep2 = document.getElementById("import-step-2");
const importDropZone = document.getElementById("import-drop-zone");
const importFileBtn = document.getElementById("import-file-btn");
const importFileInput = document.getElementById("import-file-input");
const importPreviewList = document.getElementById("import-preview-list");
const importSummary = document.getElementById("import-summary");

// Settings
const settingsBtn = document.getElementById("settings-btn");
const settingsModal = document.getElementById("settings-modal");
const settingsModalClose = document.getElementById("settings-modal-close");
const settingsModalCancel = document.getElementById("settings-modal-cancel");
const settingsModalSave = document.getElementById("settings-modal-save");
const triggerSpace = document.getElementById("trigger-space");
const triggerTab = document.getElementById("trigger-tab");
const triggerEnter = document.getElementById("trigger-enter");
const settingUndo = document.getElementById("setting-undo");
const exclusionListTextarea = document.getElementById("exclusion-list");
const clearDataBtn = document.getElementById("clear-data-btn");
const autocompleteEnabledCheckbox = document.getElementById(
  "autocomplete-enabled"
);
const autocompleteMinCharsInput = document.getElementById(
  "autocomplete-min-chars"
);
const autocompleteMaxSuggestionsInput = document.getElementById(
  "autocomplete-max-suggestions"
);

// Rules Modal
const rulesModalContainer = document.getElementById("rules-modal");
const rulesModalTitle = document.getElementById("rules-modal-title");
const rulesModalCloseBtn = document.getElementById("rules-modal-close");
const rulesListDisplayElement = document.getElementById("rules-list");
const addRuleBtn = document.getElementById("add-rule-btn");
const ruleForm = document.getElementById("rule-form");
const ruleTypeSelect = document.getElementById("rule-type");
const daysSection = document.getElementById("days-section");
const dayCheckboxes = daysSection.querySelectorAll('input[type="checkbox"]');
const timeSection = document.getElementById("time-section");
const startHourInput = document.getElementById("start-hour");
const endHourInput = document.getElementById("end-hour");
const startMinuteInput = document.getElementById("start-minute");
const endMinuteInput = document.getElementById("end-minute");
const domainSection = document.getElementById("domain-section");
const domainsTextarea = document.getElementById("domains");
const ruleExpansionTextarea = document.getElementById("rule-expansion");
const rulePriorityInput = document.getElementById("rule-priority");
const rulesModalCancelBtn = document.getElementById("rules-modal-cancel");
const rulesModalSaveBtn = document.getElementById("rules-modal-save");
const specialDateSection = document.getElementById("special-date-section");
const specialMonthInput = document.getElementById("special-month");
const specialDayInput = document.getElementById("special-day");
const rulesModalInsertActionButtons = document.querySelectorAll(
  "#rules-modal .btn-insert-action"
);
const combinedRuleSection = document.getElementById("combined-rule-section");
const combinedOperatorSelect = document.getElementById("combined-operator");
const subConditionsList = document.getElementById("sub-conditions-list");
const addSubConditionBtn = document.getElementById("add-sub-condition-btn");
const subConditionTemplate = document.getElementById("sub-condition-template");

const ruleTypeTranslations = {
  dayOfWeek: "Dia da Semana",
  timeRange: "Intervalo de Horário",
  domain: "Domínio do Site",
  specialDate: "Data Especial",
  combined: "Combinada",
};

// State
let abbreviations = [];
let filteredAbbreviations = [];
let currentCategory = "all";
let currentSort = { column: "abbreviation", direction: "asc" };
let currentEditId = null;
let isEnabled = true;
let currentAbbreviationIdForRules = null;
let currentEditingRuleId = null;
let importPreviewData = [];

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
  await loadAbbreviationsAndRender();
  await loadCategories();
  if (
    currentAbbreviationIdForRules &&
    !rulesModalContainer.classList.contains("hidden")
  ) {
    loadAndDisplayRules(currentAbbreviationIdForRules);
  }
}

async function loadAbbreviationsAndRender() {
  try {
    abbreviationsListElement.innerHTML = `<tr><td colspan="8" class="loading"><div class="loading-spinner"></div>Carregando...</td></tr>`;
    const freshAbbreviations =
      await window.TextExpanderDB.getAllAbbreviations();
    abbreviations = Array.isArray(freshAbbreviations) ? freshAbbreviations : [];
    filterAbbreviations();
  } catch (error) {
    console.error("Erro ao carregar abreviações:", error);
    abbreviationsListElement.innerHTML = `<tr><td colspan="8" class="loading">Erro ao carregar.</td></tr>`;
  }
}

async function init() {
  if (
    typeof window.TextExpanderDB === "undefined" ||
    typeof SoteNotifier === "undefined" ||
    typeof SoteConfirmationModal === "undefined"
  ) {
    console.error("Dependências não carregadas.");
    return;
  }

  // Eventos principais
  categoryList
    .querySelector('[data-category="all"]')
    .addEventListener("click", () => handleCategoryFilter("all"));
  searchInput.addEventListener("input", handleSearch);
  enabledToggle.addEventListener("change", handleToggleEnabled);
  addBtn.addEventListener("click", () => showModal());
  selectAllCheckbox.addEventListener("change", handleSelectAll);
  abbreviationsListElement.addEventListener("change", handleRowSelection);
  document
    .querySelectorAll(".abbreviations-table th.sortable")
    .forEach(header =>
      header.addEventListener("click", () => handleSort(header.dataset.sort))
    );

  // Eventos do Modal Principal
  modalClose.addEventListener("click", hideModal);
  modalCancel.addEventListener("click", hideModal);
  modalSave.addEventListener("click", handleSaveAbbreviation);
  mainModalInsertActionButtons.forEach(button =>
    button.addEventListener("click", function () {
      insertTextAtCursor(expansionTextarea, this.dataset.action);
    })
  );

  // Eventos de Import/Export
  exportBtn.addEventListener("click", handleExportAll);
  exportSelectedBtn.addEventListener("click", handleExportSelected);
  exportCategoryBtn.addEventListener("click", handleExportCategory);
  importBtn.addEventListener("click", showImportModal);
  importModalClose.addEventListener("click", hideImportModal);
  importModalCancel.addEventListener("click", hideImportModal);
  importModalConfirm.addEventListener("click", handleConfirmImport);
  importFileBtn.addEventListener("click", () => importFileInput.click());
  importFileInput.addEventListener("change", handleFileSelect);
  importDropZone.addEventListener("dragover", handleDragOver);
  importDropZone.addEventListener("dragleave", handleDragLeave);
  importDropZone.addEventListener("drop", handleDrop);

  // Eventos de Configurações
  settingsBtn.addEventListener("click", showSettingsModal);
  settingsModalClose.addEventListener("click", hideSettingsModal);
  settingsModalCancel.addEventListener("click", hideSettingsModal);
  settingsModalSave.addEventListener("click", handleSaveSettings);
  clearDataBtn.addEventListener("click", handleClearData);

  // Eventos do Modal de Regras
  rulesModalCloseBtn.addEventListener("click", hideRulesModal);
  rulesModalCancelBtn.addEventListener("click", () => {
    ruleForm.classList.contains("hidden")
      ? hideRulesModal()
      : (ruleForm.classList.add("hidden"),
        addRuleBtn.classList.remove("hidden"));
  });
  addRuleBtn.addEventListener("click", handleShowRuleForm);
  ruleTypeSelect.addEventListener("change", handleRuleTypeChange);
  rulesModalSaveBtn.addEventListener("click", handleSaveRule);
  rulesModalInsertActionButtons.forEach(button =>
    button.addEventListener("click", function () {
      insertTextAtCursor(ruleExpansionTextarea, this.dataset.action);
    })
  );
  addSubConditionBtn?.addEventListener("click", () =>
    handleAddSubCondition(null)
  );
  subConditionsList?.addEventListener("click", event => {
    if (event.target.classList.contains("remove-sub-condition-btn")) {
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

  // Inicialização
  chrome.storage.sync.get("enabled", result => {
    isEnabled = result.enabled !== false;
    enabledToggle.checked = isEnabled;
    statusText.textContent = isEnabled ? "Habilitado" : "Disabilitado";
  });
  loadSettings();
  chrome.runtime.onMessage.addListener(message => {
    if (
      message.type === SOTE_CONSTANTS.MESSAGE_TYPES.ABBREVIATIONS_UPDATED ||
      message.type === SOTE_CONSTANTS.MESSAGE_TYPES.INITIAL_SEED_COMPLETE
    ) {
      performLocalRefresh();
    }
    return true;
  });
  await performLocalRefresh();
}

async function loadCategories() {
  try {
    const categories = await TextExpanderDB.getAllCategories();
    const allCategoryItem = categoryList.querySelector('[data-category="all"]');
    categoryList.innerHTML = "";
    if (allCategoryItem) categoryList.appendChild(allCategoryItem);
    categories.forEach(category => {
      const li = document.createElement("li");
      li.className = "category-item";
      li.dataset.category = category;
      li.textContent = category;
      li.addEventListener("click", () => handleCategoryFilter(category));
      categoryList.appendChild(li);
    });
    const personalizadaOption = categorySelect.querySelector(
      'option[value="Personalizada"]'
    );
    Array.from(categorySelect.options)
      .filter(
        opt =>
          !["Comum", "Pessoal", "Trabalho", "Personalizada"].includes(opt.value)
      )
      .forEach(opt => categorySelect.removeChild(opt));
    categories.forEach(category => {
      if (!categorySelect.querySelector(`option[value="${category}"]`)) {
        const option = document.createElement("option");
        option.value = category;
        option.textContent = category;
        categorySelect.insertBefore(option, personalizadaOption);
      }
    });
  } catch (error) {
    console.error("Erro ao carregar categorias:", error);
  }
}

function filterAbbreviations() {
  const searchTerm = searchInput.value.trim().toLowerCase();
  filteredAbbreviations = abbreviations.filter(
    abbr =>
      (currentCategory === "all" || abbr.category === currentCategory) &&
      (searchTerm === "" ||
        abbr.abbreviation.toLowerCase().includes(searchTerm) ||
        abbr.expansion.toLowerCase().includes(searchTerm) ||
        (abbr.category && abbr.category.toLowerCase().includes(searchTerm)))
  );
  sortAbbreviations();
  renderAbbreviations();
}

function sortAbbreviations() {
  const { column, direction } = currentSort;
  filteredAbbreviations.sort((a, b) => {
    let valueA = a[column],
      valueB = b[column];
    if (column === "lastUsed") {
      valueA = valueA
        ? new Date(valueA).getTime()
        : direction === "asc"
        ? Infinity
        : -Infinity;
      valueB = valueB
        ? new Date(valueB).getTime()
        : direction === "asc"
        ? Infinity
        : -Infinity;
    } else if (typeof valueA === "string") {
      valueA = valueA.toLowerCase();
      valueB = b[column]?.toLowerCase();
    }
    if (valueA === valueB)
      return a.abbreviation
        .toLowerCase()
        .localeCompare(b.abbreviation.toLowerCase());
    let comparison = valueA < valueB ? -1 : 1;
    return direction === "asc" ? comparison : -comparison;
  });
}

function renderAbbreviations() {
  selectAllCheckbox.checked = false;
  handleRowSelection();

  if (filteredAbbreviations.length === 0) {
    abbreviationsListElement.innerHTML = `<tr><td colspan="8" class="loading">Nenhuma abreviação encontrada.</td></tr>`;
    return;
  }
  abbreviationsListElement.innerHTML = "";
  filteredAbbreviations.forEach(abbr => {
    const row = document.createElement("tr");
    let lastUsedText = abbr.lastUsed
      ? new Date(abbr.lastUsed).toLocaleString("pt-BR")
      : "Nunca";
    const formattedExpansion = formatExpansionForDisplay(abbr.expansion);
    const expansionDisplay =
      formattedExpansion.length > 50
        ? `${formattedExpansion.substring(0, 47)}...`
        : formattedExpansion;
    row.innerHTML = `
      <td class="checkbox-cell"><input type="checkbox" class="row-checkbox" data-id="${
        abbr.abbreviation
      }"></td>
      <td>${abbr.abbreviation}</td>
      <td title="${formattedExpansion}">${expansionDisplay}</td>
      <td><span class="category-badge">${abbr.category || "N/A"}</span></td>
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
      .addEventListener("click", () => handleEditAbbreviation(abbr));
    row
      .querySelector(".delete")
      .addEventListener("click", () =>
        handleDeleteAbbreviation(abbr.abbreviation)
      );
    row
      .querySelector(".rules")
      .addEventListener("click", () => showRulesModal(abbr.abbreviation));
    abbreviationsListElement.appendChild(row);
  });
  document
    .querySelectorAll(".abbreviations-table th.sortable")
    .forEach(header => {
      header.classList.remove("sorted-asc", "sorted-desc");
      if (header.dataset.sort === currentSort.column)
        header.classList.add(`sorted-${currentSort.direction}`);
    });
}

function handleSearch() {
  filterAbbreviations();
}
function handleCategoryFilter(category) {
  currentCategory = category;
  document
    .querySelectorAll(".category-item")
    .forEach(item =>
      item.classList.toggle("active", item.dataset.category === category)
    );

  // Lógica para mostrar/esconder o botão de exportar categoria
  if (category && category !== "all") {
    exportCategoryBtn.style.display = "flex";
    exportCategoryBtn.querySelector(
      "span"
    ).textContent = `Exportar "${category}"`;
  } else {
    exportCategoryBtn.style.display = "none";
  }

  filterAbbreviations();
}
function handleSort(column) {
  if (currentSort.column === column) {
    currentSort.direction = currentSort.direction === "asc" ? "desc" : "asc";
  } else {
    currentSort.column = column;
    currentSort.direction = "asc";
  }
  filterAbbreviations();
}
function handleToggleEnabled() {
  isEnabled = enabledToggle.checked;
  statusText.textContent = isEnabled ? "Habilitado" : "Disabilitado";
  chrome.storage.sync.set({ enabled: isEnabled });
}

function handleSelectAll() {
  const checkboxes = abbreviationsListElement.querySelectorAll(".row-checkbox");
  checkboxes.forEach(
    checkbox => (checkbox.checked = selectAllCheckbox.checked)
  );
  handleRowSelection();
}

function handleRowSelection() {
  const selectedCheckboxes = abbreviationsListElement.querySelectorAll(
    ".row-checkbox:checked"
  );
  const selectedCount = selectedCheckboxes.length;

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

function showModal(abbr = null) {
  if (abbr) {
    modalTitle.textContent = "Editar Abreviação";
    abbreviationInput.value = abbr.abbreviation;
    abbreviationInput.readOnly = true;
    expansionTextarea.value = abbr.expansion;
    caseSensitiveCheckbox.checked = abbr.caseSensitive || false;
    enabledCheckbox.checked = abbr.enabled !== false;
    currentEditId = abbr.abbreviation;
    const isStandardCategory = [
      "Comum",
      "Pessoal",
      "Trabalho",
      "Personalizada",
    ].includes(abbr.category);
    if (!isStandardCategory && abbr.category) {
      if (!categorySelect.querySelector(`option[value="${abbr.category}"]`)) {
        const option = document.createElement("option");
        option.value = abbr.category;
        option.textContent = abbr.category;
        categorySelect.insertBefore(
          option,
          categorySelect.querySelector('option[value="Personalizada"]')
        );
      }
      categorySelect.value = abbr.category;
    } else {
      categorySelect.value = abbr.category || "Comum";
    }
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
  customCategoryInputContainer.style.display =
    categorySelect.value === "Personalizada" ? "block" : "none";
  customCategoryInput.value = "";
  modalContainer.classList.remove("hidden");
  abbreviationInput.focus();
}

function hideModal() {
  modalContainer.classList.add("hidden");
  currentEditId = null;
}

async function handleSaveAbbreviation() {
  const abbreviationVal = abbreviationInput.value.trim();
  const expansionVal = expansionTextarea.value.trim();
  let categoryVal = categorySelect.value;
  if (!abbreviationVal || !expansionVal) {
    SoteNotifier.show("Abreviação e expansão são obrigatórias.", "error");
    return;
  }
  if (categoryVal === "Personalizada") {
    categoryVal = customCategoryInput.value.trim();
    if (!categoryVal) {
      SoteNotifier.show(
        "Nome da categoria personalizada é obrigatório.",
        "error"
      );
      return;
    }
  }
  try {
    const abbrData = {
      abbreviation: abbreviationVal,
      expansion: expansionVal,
      category: categoryVal,
      caseSensitive: caseSensitiveCheckbox.checked,
      enabled: enabledCheckbox.checked,
    };
    await (currentEditId
      ? window.TextExpanderDB.updateAbbreviation(abbrData)
      : window.TextExpanderDB.addAbbreviation(abbrData));
    hideModal();
    SoteNotifier.show(
      currentEditId ? "Abreviação atualizada!" : "Abreviação criada!",
      "success"
    );
    await performLocalRefresh();
  } catch (error) {
    console.error("Erro ao salvar:", error);
    SoteNotifier.show(
      error.message.includes("Key already exists")
        ? `A abreviação "${abbreviationVal}" já existe.`
        : "Erro ao salvar.",
      "error"
    );
  }
}

function handleEditAbbreviation(abbr) {
  showModal(abbr);
}

async function handleDeleteAbbreviation(abbreviationKey) {
  SoteConfirmationModal.show({
    title: "Excluir Abreviação",
    message: `Tem certeza que quer excluir "<strong>${abbreviationKey}</strong>" e todas as suas regras? A ação não pode ser desfeita.`,
    onConfirm: async () => {
      try {
        await window.TextExpanderDB.deleteAbbreviation(abbreviationKey);
        SoteNotifier.show("Abreviação excluída.", "success");
        await performLocalRefresh();
      } catch (error) {
        console.error("Erro ao excluir:", error);
        SoteNotifier.show("Erro ao excluir.", "error");
      }
    },
  });
}

function showRulesModal(abbreviationId) {
  currentAbbreviationIdForRules = abbreviationId;
  const abbrObj = abbreviations.find(a => a.abbreviation === abbreviationId);
  rulesModalTitle.textContent = `Regras para "${
    abbrObj ? abbrObj.abbreviation : ""
  }"`;
  rulesModalContainer.classList.remove("hidden");
  resetRuleForm();
  loadAndDisplayRules(abbreviationId);
}
function hideRulesModal() {
  rulesModalContainer.classList.add("hidden");
  currentAbbreviationIdForRules = null;
  currentEditingRuleId = null;
}

function loadAndDisplayRules(abbreviationId) {
  const abbreviation = abbreviations.find(
    abbr => abbr.abbreviation === abbreviationId
  );
  rulesListDisplayElement.innerHTML = "";
  if (!abbreviation || !abbreviation.rules || abbreviation.rules.length === 0) {
    rulesListDisplayElement.innerHTML = "<p>Nenhuma regra definida.</p>";
    return;
  }
  const sortedRules = [...abbreviation.rules].sort(
    (a, b) => (b.priority || 0) - (a.priority || 0)
  );
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
  ruleForm.classList.remove("hidden");
  addRuleBtn.classList.add("hidden");
  ruleForm.querySelector("h3").textContent = "Nova Regra";
}
function resetRuleForm() {
  ruleForm.reset();
  dayCheckboxes.forEach(cb => (cb.checked = false));
  subConditionsList.innerHTML = "";
  handleRuleTypeChange();
}
function handleRuleTypeChange() {
  const type = ruleTypeSelect.value;
  daysSection.classList.toggle("hidden", type !== "dayOfWeek");
  timeSection.classList.toggle("hidden", type !== "timeRange");
  domainSection.classList.toggle("hidden", type !== "domain");
  specialDateSection.classList.toggle("hidden", type !== "specialDate");
  combinedRuleSection.classList.toggle("hidden", type !== "combined");
  if (type === "combined" && subConditionsList.children.length === 0)
    handleAddSubCondition(null);
}

async function handleSaveRule() {
  if (!currentAbbreviationIdForRules) {
    SoteNotifier.show("ID da abreviação não encontrado.", "error");
    return;
  }
  const expansion = ruleExpansionTextarea.value.trim();
  if (!expansion) {
    SoteNotifier.show("Expansão da regra é obrigatória.", "error");
    return;
  }
  const type = ruleTypeSelect.value;
  const ruleData = {
    abbreviationId: currentAbbreviationIdForRules,
    type,
    expansion,
    priority: parseInt(rulePriorityInput.value, 10) || 0,
  };
  if (currentEditingRuleId) ruleData.id = currentEditingRuleId;
  switch (type) {
    case "dayOfWeek":
      ruleData.days = Array.from(dayCheckboxes)
        .filter(cb => cb.checked)
        .map(cb => parseInt(cb.value, 10));
      break;
    case "timeRange":
      Object.assign(ruleData, {
        startHour: parseInt(startHourInput.value),
        endHour: parseInt(endHourInput.value),
        startMinute: parseInt(startMinuteInput.value),
        endMinute: parseInt(endMinuteInput.value),
      });
      break;
    case "domain":
      ruleData.domains = domainsTextarea.value
        .split("\n")
        .map(d => d.trim())
        .filter(Boolean);
      break;
    case "specialDate":
      Object.assign(ruleData, {
        month: parseInt(specialMonthInput.value),
        day: parseInt(specialDayInput.value),
      });
      break;
    case "combined":
      ruleData.logicalOperator = combinedOperatorSelect.value;
      ruleData.subConditions = Array.from(
        subConditionsList.querySelectorAll(".sub-condition-item")
      ).map(item => {
        const subType = item.querySelector(".sub-condition-type").value;
        const subData = {
          conditionType: subType,
          negated: item.querySelector(".sub-condition-negate").checked,
        };
        const fields = item.querySelector(".sub-condition-fields");
        switch (subType) {
          case "dayOfWeek":
            subData.days = Array.from(
              fields.querySelectorAll(".sub-day:checked")
            ).map(cb => parseInt(cb.value));
            break;
          case "timeRange":
            Object.assign(subData, {
              startHour: parseInt(
                fields.querySelector(".sub-start-hour").value
              ),
              endHour: parseInt(fields.querySelector(".sub-end-hour").value),
              startMinute: parseInt(
                fields.querySelector(".sub-start-minute").value
              ),
              endMinute: parseInt(
                fields.querySelector(".sub-end-minute").value
              ),
            });
            break;
          case "domain":
            subData.domains = fields
              .querySelector(".sub-domains")
              .value.split("\n")
              .map(d => d.trim())
              .filter(Boolean);
            break;
          case "specialDate":
            Object.assign(subData, {
              month: parseInt(fields.querySelector(".sub-special-month").value),
              day: parseInt(fields.querySelector(".sub-special-day").value),
            });
            break;
        }
        return subData;
      });
      break;
  }
  try {
    await (currentEditingRuleId
      ? window.TextExpanderDB.updateExpansionRule(ruleData)
      : window.TextExpanderDB.addExpansionRule(ruleData));
    ruleForm.classList.add("hidden");
    addRuleBtn.classList.remove("hidden");
    SoteNotifier.show("Regra salva!", "success");
    await performLocalRefresh();
  } catch (error) {
    console.error("Erro ao salvar regra:", error);
    SoteNotifier.show(
      error.message.includes("Validation")
        ? `Erro de validação: ${error.message}`
        : "Erro ao salvar regra.",
      "error"
    );
  }
}

function handleEditRule(rule) {
  currentEditingRuleId = rule.id;
  ruleForm.querySelector("h3").textContent = "Editar Regra";
  ruleTypeSelect.value = rule.type;
  ruleExpansionTextarea.value = rule.expansion;
  rulePriorityInput.value = rule.priority || 0;
  subConditionsList.innerHTML = "";
  handleRuleTypeChange();
  switch (rule.type) {
    case "dayOfWeek":
      dayCheckboxes.forEach(cb => {
        cb.checked = rule.days?.includes(parseInt(cb.value, 10));
      });
      break;
    case "timeRange":
      startHourInput.value = rule.startHour;
      endHourInput.value = rule.endHour;
      startMinuteInput.value = rule.startMinute;
      endMinuteInput.value = rule.endMinute;
      break;
    case "domain":
      domainsTextarea.value = rule.domains?.join("\n") || "";
      break;
    case "specialDate":
      specialMonthInput.value = rule.month;
      specialDayInput.value = rule.day;
      break;
    case "combined":
      combinedOperatorSelect.value = rule.logicalOperator || "AND";
      rule.subConditions?.forEach(sc => handleAddSubCondition(sc));
      break;
  }
  addRuleBtn.classList.add("hidden");
  ruleForm.classList.remove("hidden");
}
async function handleDeleteRule(ruleId) {
  SoteConfirmationModal.show({
    title: "Excluir Regra",
    message: "Tem certeza que deseja excluir esta regra?",
    onConfirm: async () => {
      try {
        await window.TextExpanderDB.deleteExpansionRule(ruleId);
        SoteNotifier.show("Regra excluída.", "success");
        await performLocalRefresh();
      } catch (error) {
        console.error("Erro ao excluir regra:", error);
        SoteNotifier.show("Erro ao excluir regra.", "error");
      }
    },
  });
}
function handleAddSubCondition(data = null) {
  const clone = subConditionTemplate.content.cloneNode(true);
  const item = clone.querySelector(".sub-condition-item");
  if (data) {
    item.querySelector(".sub-condition-type").value = data.conditionType;
    item.querySelector(".sub-condition-negate").checked = data.negated || false;
    renderSubConditionFields(
      data.conditionType,
      item.querySelector(".sub-condition-fields"),
      data
    );
  } else {
    renderSubConditionFields(
      item.querySelector(".sub-condition-type").value,
      item.querySelector(".sub-condition-fields"),
      null
    );
  }
  subConditionsList.appendChild(item);
}
function renderSubConditionFields(type, container, data) {
  let content = "";
  switch (type) {
    case "dayOfWeek":
      content = `<label>Dias:</label><div class="checkbox-group">${[
        "Dom",
        "Seg",
        "Ter",
        "Qua",
        "Qui",
        "Sex",
        "Sáb",
      ]
        .map(
          (day, i) =>
            `<label><input type="checkbox" value="${i}" class="sub-day" ${
              data?.days?.includes(i) ? "checked" : ""
            }> ${day}</label>`
        )
        .join("")}</div>`;
      break;
    case "timeRange":
      content = `<label>Horário:</label><div class="time-range"><input type="number" class="sub-start-hour" placeholder="HH" value="${
        data?.startHour ?? ""
      }">:<input type="number" class="sub-start-minute" placeholder="MM" value="${
        data?.startMinute ?? ""
      }"> - <input type="number" class="sub-end-hour" placeholder="HH" value="${
        data?.endHour ?? ""
      }">:<input type="number" class="sub-end-minute" placeholder="MM" value="${
        data?.endMinute ?? ""
      }"></div>`;
      break;
    case "domain":
      content = `<label>Domínios:</label><textarea class="sub-domains" rows="2">${
        data?.domains?.join("\n") || ""
      }</textarea>`;
      break;
    case "specialDate":
      content = `<label>Data:</label><div class="date-range"><input type="number" class="sub-special-month" placeholder="Mês" value="${
        data?.month ?? ""
      }">/<input type="number" class="sub-special-day" placeholder="Dia" value="${
        data?.day ?? ""
      }"></div>`;
      break;
  }
  container.innerHTML = content;
}

// --- LÓGICA DE IMPORTAÇÃO ---
function showImportModal() {
  importModal.classList.remove("hidden");
  importStep1.classList.remove("hidden");
  importStep2.classList.add("hidden");
  importModalConfirm.classList.add("hidden");
  importFileInput.value = "";
  importPreviewData = [];
}
function hideImportModal() {
  importModal.classList.add("hidden");
}
function handleFileSelect(event) {
  const file = event.target.files[0];
  if (file) {
    processImportFile(file);
  }
}
function handleDragOver(event) {
  event.preventDefault();
  importDropZone.classList.add("dragover");
}
function handleDragLeave(event) {
  event.preventDefault();
  importDropZone.classList.remove("dragover");
}
function handleDrop(event) {
  event.preventDefault();
  importDropZone.classList.remove("dragover");
  const file = event.dataTransfer.files[0];
  if (file && file.type === "application/json") {
    processImportFile(file);
  } else {
    SoteNotifier.show("Por favor, solte um arquivo .json válido.", "error");
  }
}
async function processImportFile(file) {
  const reader = new FileReader();
  reader.onload = async e => {
    try {
      const data = JSON.parse(e.target.result);
      if (!Array.isArray(data)) {
        SoteNotifier.show(
          "O arquivo de importação deve conter um array.",
          "error"
        );
        return;
      }
      await generateImportPreview(data);
      importStep1.classList.add("hidden");
      importStep2.classList.remove("hidden");
      importModalConfirm.classList.remove("hidden");
    } catch (error) {
      SoteNotifier.show("Erro ao ler o arquivo JSON.", "error");
      console.error(error);
    }
  };
  reader.readAsText(file);
}
async function generateImportPreview(data) {
  importPreviewData = [];
  importPreviewList.innerHTML = "";
  let stats = { added: 0, updated: 0, skipped: 0 };
  for (const item of data) {
    let status = "added",
      info = "Será adicionada.",
      validationError = null;
    try {
      window.TextExpanderDB.AbbreviationModel.validate(item, true);
    } catch (e) {
      validationError = e.message;
    }
    const existing = await window.TextExpanderDB.getAbbreviation(
      item.abbreviation
    );
    if (existing) {
      status = "updated";
      info = "Será sobrescrita.";
    }
    if (validationError) {
      status = "skipped";
      info = `Erro: ${validationError}`;
    }
    stats[status]++;
    importPreviewData.push({ ...item, status });
    const row = document.createElement("tr");
    row.innerHTML = `<td><span class="status-badge ${status}">${status}</span></td><td>${
      item.abbreviation || "N/A"
    }</td><td>${(item.expansion || "N/A").substring(
      0,
      30
    )}...</td><td>${info}</td>`;
    importPreviewList.appendChild(row);
  }
  importSummary.innerHTML = `<div class="summary-item added"><span class="count">${stats.added}</span> Novas</div><div class="summary-item updated"><span class="count">${stats.updated}</span> Atualizadas</div><div class="summary-item skipped"><span class="count">${stats.skipped}</span> Ignoradas</div>`;
}
async function handleConfirmImport() {
  const importMode = document.querySelector(
    'input[name="import-mode"]:checked'
  ).value;
  const dataToImport = importPreviewData.filter(
    item => item.status !== "skipped"
  );
  if (dataToImport.length === 0) {
    SoteNotifier.show("Nenhuma abreviação válida para importar.", "info");
    hideImportModal();
    return;
  }
  try {
    if (importMode === "replace") {
      await window.TextExpanderDB.clearAllAbbreviations();
    }
    const importedCount = await window.TextExpanderDB.importAbbreviations(
      dataToImport,
      importMode === "merge"
    );
    hideImportModal();
    SoteNotifier.show(`${importedCount} abreviações processadas!`, "success");
    await performLocalRefresh();
  } catch (e) {
    SoteNotifier.show("Erro durante a importação.", "error");
    console.error(e);
  }
}

// --- LÓGICA DE EXPORTAÇÃO ---
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
async function handleExportAll() {
  try {
    const data = await window.TextExpanderDB.getAllAbbreviations();
    exportDataAsJson(
      data,
      `sote-export-all-${new Date().toISOString().slice(0, 10)}.json`
    );
  } catch (e) {
    console.error(e);
    SoteNotifier.show("Erro ao exportar.", "error");
  }
}
async function handleExportSelected() {
  const selectedIds = Array.from(
    abbreviationsListElement.querySelectorAll(".row-checkbox:checked")
  ).map(cb => cb.dataset.id);
  if (selectedIds.length === 0) {
    SoteNotifier.show("Nenhuma abreviação selecionada.", "warning");
    return;
  }
  const dataToExport = abbreviations.filter(abbr =>
    selectedIds.includes(abbr.abbreviation)
  );
  exportDataAsJson(
    dataToExport,
    `sote-export-selected-${new Date().toISOString().slice(0, 10)}.json`
  );
}
async function handleExportCategory() {
  if (!currentCategory || currentCategory === "all") {
    SoteNotifier.show("Selecione uma categoria para exportar.", "warning");
    return;
  }

  try {
    const data = await window.TextExpanderDB.getAbbreviationsByCategory(
      currentCategory
    );
    if (data.length === 0) {
      SoteNotifier.show(
        `A categoria "${currentCategory}" não possui abreviações para exportar.`,
        "info"
      );
      return;
    }
    exportDataAsJson(
      data,
      `sote-export-categoria-${currentCategory}-${new Date()
        .toISOString()
        .slice(0, 10)}.json`
    );
    SoteNotifier.show(
      `Categoria "${currentCategory}" exportada com sucesso!`,
      "success"
    );
  } catch (e) {
    console.error("Erro ao exportar categoria:", e);
    SoteNotifier.show("Erro ao exportar a categoria.", "error");
  }
}

// --- LÓGICA DE CONFIGURAÇÕES ---
function showSettingsModal() {
  settingsModal.classList.remove("hidden");
  loadSettings();
}
function hideSettingsModal() {
  settingsModal.classList.add("hidden");
}
function loadSettings() {
  chrome.storage.sync.get(
    [
      "triggerSpace",
      "triggerTab",
      "triggerEnter",
      "enableUndo",
      "exclusionList",
      "autocompleteEnabled",
      "autocompleteMinChars",
      "autocompleteMaxSuggestions",
    ],
    r => {
      triggerSpace.checked = r.triggerSpace !== false;
      triggerTab.checked = r.triggerTab !== false;
      triggerEnter.checked = r.triggerEnter !== false;
      settingUndo.checked = r.enableUndo !== false;
      exclusionListTextarea.value = (r.exclusionList || []).join("\n");
      autocompleteEnabledCheckbox.checked = r.autocompleteEnabled !== false;
      autocompleteMinCharsInput.value = r.autocompleteMinChars || 2;
      autocompleteMaxSuggestionsInput.value = r.autocompleteMaxSuggestions || 5;
    }
  );
}
function handleSaveSettings() {
  const exclusionList = exclusionListTextarea.value
    .split("\n")
    .map(item => item.trim())
    .filter(Boolean);

  const settings = {
    triggerSpace: triggerSpace.checked,
    triggerTab: triggerTab.checked,
    triggerEnter: triggerEnter.checked,
    enableUndo: settingUndo.checked,
    exclusionList: exclusionList,
    autocompleteEnabled: autocompleteEnabledCheckbox.checked,
    autocompleteMinChars: parseInt(autocompleteMinCharsInput.value) || 2,
    autocompleteMaxSuggestions:
      parseInt(autocompleteMaxSuggestionsInput.value) || 5,
  };

  chrome.storage.sync.set(settings, () => {
    hideSettingsModal();
    SoteNotifier.show("Configurações salvas.", "success");
    // Enviar a mensagem para todas as abas, notificando a mudança nas configurações
    chrome.tabs.query({}, tabs =>
      tabs.forEach(
        tab =>
          tab.id &&
          chrome.tabs
            .sendMessage(tab.id, {
              type: SOTE_CONSTANTS.MESSAGE_TYPES.SETTINGS_UPDATED,
              settings,
            })
            .catch(() => {})
      )
    );
  });
}
async function handleClearData() {
  SoteConfirmationModal.show({
    title: "Apagar Todos os Dados",
    message:
      "Esta ação é <strong>permanente</strong>. Todas as abreviações e regras serão removidas.",
    onConfirm: async () => {
      try {
        await window.TextExpanderDB.clearAllAbbreviations();
        hideSettingsModal();
        SoteNotifier.show("Todos os dados foram apagados.", "success");
        await performLocalRefresh();
      } catch (e) {
        console.error(e);
        SoteNotifier.show("Erro ao apagar dados.", "error");
      }
    },
  });
}

document.addEventListener("DOMContentLoaded", init);
