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
      // Validação básica dos parâmetros
      if (!type || typeof type !== 'string') {
        return reject(new Error('Tipo de mensagem deve ser uma string válida'));
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
      "settings-modal",
      "settings-modal-close",
      "settings-modal-cancel",
      "settings-modal-save",
      "rules-modal",
      "rules-modal-close",
      "rules-modal-cancel",
      "rules-modal-save",
      "choice-config-modal",
      "choice-modal-close",
      "choice-modal-cancel",
      "choice-modal-save",
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
    try {
      const response = await sendMessageToBackground(
        SOTE_CONSTANTS.MESSAGE_TYPES.GET_STATE
      );
      updateLocalState(response);
    } catch (error) {
      logError("Failed to load initial data:", error);
      SoteNotifier.show("Erro ao carregar dados iniciais.", "error");
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
    if (elements["enabled-toggle"]) {
      elements["enabled-toggle"].checked = isEnabled;
    }
    if (elements["status-text"]) {
      elements["status-text"].textContent = isEnabled
        ? "Habilitado"
        : "Desabilitado";
    }
  }

  function updateCategories() {
    const categories = Array.from(
      new Set(state.abbreviations.map(abbr => abbr.category).filter(Boolean))
    ).sort();

    const categoryList = elements["category-list"];
    if (!categoryList) return;

    // Keep the "Todas" item and clear the rest
    const allItem = categoryList.querySelector('[data-category="all"]');
    categoryList.innerHTML = "";
    if (allItem) {
      categoryList.appendChild(allItem);
    }

    categories.forEach(category => {
      const li = document.createElement("li");
      li.className = "category-item";
      li.setAttribute("data-category", category);
      li.setAttribute("role", "listitem");
      li.setAttribute("tabindex", "0");
      li.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M4 6h16M4 12h16M4 18h7"></path>
        </svg>
        <span>${escapeHtml(category)}</span>
      `;
      categoryList.appendChild(li);
    });

    state.categories = categories;
  }

  // ===== FILTERING AND RENDERING =====
  function filterAndRenderAbbreviations() {
    let filtered = [...state.abbreviations];

    // Filter by category
    if (state.currentCategory !== "all") {
      filtered = filtered.filter(abbr => abbr.category === state.currentCategory);
    }

    // Filter by search term
    if (state.searchTerm) {
      const searchLower = state.searchTerm.toLowerCase();
      filtered = filtered.filter(abbr => {
        const searchableText = [
          abbr.abbreviation,
          abbr.title || "",
          abbr.expansion,
          abbr.category || "",
        ]
          .join(" ")
          .toLowerCase();
        return searchableText.includes(searchLower);
      });
    }

    // Sort
    if (state.sortColumn) {
      filtered.sort((a, b) => {
        let aVal = a[state.sortColumn];
        let bVal = b[state.sortColumn];

        // Handle special cases
        if (state.sortColumn === "lastUsed") {
          aVal = aVal ? new Date(aVal) : new Date(0);
          bVal = bVal ? new Date(bVal) : new Date(0);
        } else if (typeof aVal === "string") {
          aVal = aVal.toLowerCase();
          bVal = (bVal || "").toLowerCase();
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
        <tr>
          <td colspan="9" style="text-align: center; padding: 2rem; color: #6b7280;">
            ${
              state.searchTerm || state.currentCategory !== "all"
                ? "Nenhuma abreviação encontrada com os filtros aplicados."
                : "Nenhuma abreviação cadastrada. Clique em 'Adicionar Nova' para começar."
            }
          </td>
        </tr>
      `;
      return;
    }

    // Clear existing content
    tbody.innerHTML = "";

    // Create rows with proper event listeners
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

    // Create expansion preview with action badges
    const expansionPreview = createExpansionPreview(abbr.expansion);

    // Create row element
    const row = document.createElement("tr");
    row.setAttribute("data-abbreviation", abbr.abbreviation);

    // Create title display (NOME - agora com estilo padrão)
    const titleDisplay = abbr.title 
      ? `<div class="abbreviation-title-display">${escapeHtml(abbr.title)}</div>`
      : '<div class="abbreviation-title-empty">—</div>';

    // Create shortcut display (ATALHO - agora posicionado abaixo do nome)
    const shortcutDisplay = `<div class="abbreviation-shortcut-display">${escapeHtml(abbr.abbreviation)}</div>`;

    row.innerHTML = `
      <td class="checkbox-cell">
        <input type="checkbox" ${isSelected ? "checked" : ""}>
      </td>
      <td class="title-cell">
        ${titleDisplay}
        ${shortcutDisplay}
      </td>
      <td class="shortcut-cell" style="display: none;">
        ${shortcutDisplay}
      </td>
      <td class="expansion-cell">
        ${expansionPreview}
      </td>
      <td>
        <span class="category-badge">${escapeHtml(
          abbr.category || "Comum"
        )}</span>
      </td>
      <td style="text-align: center;">${abbr.usageCount || 0}</td>
      <td style="text-align: center;">${lastUsedText}</td>
      <td style="text-align: center;">
        ${
          hasRules
            ? '<span style="color: var(--primary-600); font-weight: 600;">Sim</span>'
            : '<span style="color: var(--gray-400);">Não</span>'
        }
      </td>
      <td>
        <div class="table-actions">
          <button class="action-btn edit" title="Editar">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 20h9"></path>
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
            </svg>
          </button>
          <button class="action-btn rules" title="Regras">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"></path>
            </svg>
          </button>
          <button class="action-btn delete" title="Excluir">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 6h18"></path>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6z"></path>
              <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      </td>
    `;

    // Add event listeners to the row elements
    const checkbox = row.querySelector('input[type="checkbox"]');
    const editBtn = row.querySelector('.action-btn.edit');
    const rulesBtn = row.querySelector('.action-btn.rules');
    const deleteBtn = row.querySelector('.action-btn.delete');

    // Checkbox event
    checkbox.addEventListener('change', (e) => {
      handleRowSelection(abbr.abbreviation, e.target.checked);
    });

    // Edit button event
    editBtn.addEventListener('click', () => {
      editAbbreviation(abbr.abbreviation);
    });

    // Rules button event
    rulesBtn.addEventListener('click', () => {
      openRulesModal(abbr.abbreviation);
    });

    // Delete button event
    deleteBtn.addEventListener('click', () => {
      deleteAbbreviation(abbr.abbreviation);
    });

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

    let previewHtml = escapeHtml(expansion);
    previewHtml = previewHtml.replace(/\$choice\(id=\d+\)\$/g, badges.choice);
    previewHtml = previewHtml.replace(/\$cursor\$/g, badges.cursor);
    previewHtml = previewHtml.replace(/\$transferencia\$/g, badges.clipboard);

    return `<div>${previewHtml}</div>`;
  }

  // ===== MODAL MANAGEMENT =====
  function showModal(title = "Adicionar Nova Abreviação") {
    if (!elements["modal-container"]) return;

    elements["modal-title"].textContent = title;
    elements["modal-container"].classList.remove("hidden");

    // Focus on first input
    setTimeout(() => {
      elements["title"]?.focus(); // Agora foca no campo "Nome" primeiro
    }, 100);
  }

  function hideModal() {
    if (!elements["modal-container"]) return;
    elements["modal-container"].classList.add("hidden");
    resetForm();
  }

  function resetForm() {
    if (!elements["abbreviation-form"]) return;

    elements["abbreviation-form"].reset();
    elements["abbreviation"].readOnly = false;
    elements["custom-category-input-container"].style.display = "none";
    state.currentEditingAbbreviation = null;

    // Reset choice buttons
    updateChoiceButtons();
  }

  function populateForm(abbr) {
    if (!abbr) return;

    elements["title"].value = abbr.title || "";
    elements["abbreviation"].value = abbr.abbreviation;
    elements["expansion"].value = abbr.expansion;
    elements["case-sensitive"].checked = abbr.caseSensitive || false;
    elements["enabled"].checked = abbr.enabled !== false;

    // Handle category
    const categorySelect = elements["category"];
    if (abbr.category && !["Comum", "Pessoal", "Trabalho"].includes(abbr.category)) {
      // Custom category
      const option = document.createElement("option");
      option.value = abbr.category;
      option.textContent = abbr.category;
      categorySelect.appendChild(option);
      categorySelect.value = abbr.category;
    } else {
      categorySelect.value = abbr.category || "Comum";
    }

    // Update choice buttons
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
          ? "Abreviação atualizada com sucesso!"
          : "Abreviação criada com sucesso!",
        "success"
      );

      hideModal();
    } catch (error) {
      logError("Error saving abbreviation:", error);
      const message = error.message.includes("Key already exists")
        ? "Essa abreviação já existe."
        : "Erro ao salvar a abreviação.";
      SoteNotifier.show(message, "error");
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

    if (data.title && data.title.length > 50) {
      SoteNotifier.show("O nome deve ter no máximo 50 caracteres.", "error");
      return false;
    }

    if (elements["category"].value === "Personalizada" && !data.category) {
      SoteNotifier.show("O nome da categoria personalizada é obrigatório.", "error");
      return false;
    }

    return true;
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

  // ===== RULES MODAL FUNCTIONALITY =====
  function openRulesModal(abbreviationKey) {
    const abbr = state.abbreviations.find(a => a.abbreviation === abbreviationKey);
    if (!abbr) {
      SoteNotifier.show("Abreviação não encontrada.", "error");
      return;
    }

    state.currentEditingAbbreviation = abbreviationKey;
    
    // Show rules modal
    const rulesModal = elements["rules-modal"];
    if (rulesModal) {
      rulesModal.classList.remove("hidden");
      
      // Update modal title
      const modalTitle = document.getElementById("rules-modal-title");
      if (modalTitle) {
        modalTitle.textContent = `Regras para "${abbreviationKey}"`;
      }
      
      // Load existing rules
      loadRulesForAbbreviation(abbr);
    }
  }

  function loadRulesForAbbreviation(abbr) {
    const rulesList = document.getElementById("rules-list");
    if (!rulesList) return;

    rulesList.innerHTML = "";

    if (abbr.rules && abbr.rules.length > 0) {
      abbr.rules.forEach(rule => {
        const ruleElement = createRuleElement(rule);
        rulesList.appendChild(ruleElement);
      });
    } else {
      rulesList.innerHTML = `
        <div style="text-align: center; padding: 2rem; color: #6b7280; font-style: italic;">
          Nenhuma regra configurada para esta abreviação.
        </div>
      `;
    }
  }

  function createRuleElement(rule) {
    const ruleDiv = document.createElement("div");
    ruleDiv.className = "rule-item";
    ruleDiv.setAttribute("data-rule-id", rule.id || "");

    let ruleDetails = "";
    switch (rule.type) {
      case "dayOfWeek":
        const dayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
        const selectedDays = rule.days ? rule.days.map(d => dayNames[d]).join(", ") : "";
        ruleDetails = `Dias: ${selectedDays}`;
        break;
      case "timeRange":
        ruleDetails = `Horário: ${rule.startHour || "00"}:${String(rule.startMinute || 0).padStart(2, "0")} até ${rule.endHour || "23"}:${String(rule.endMinute || 59).padStart(2, "0")}`;
        break;
      case "domain":
        ruleDetails = `Domínios: ${rule.domains ? rule.domains.join(", ") : ""}`;
        break;
      case "specialDate":
        const dates = rule.specialDates ? rule.specialDates.map(d => `${d.day}/${d.month}`).join(", ") : "";
        ruleDetails = `Datas especiais: ${dates}`;
        break;
      case "combined":
        ruleDetails = `Regra combinada (${rule.logicalOperator || "AND"})`;
        break;
      default:
        ruleDetails = "Regra personalizada";
    }

    ruleDiv.innerHTML = `
      <div class="rule-header">
        <span class="rule-type">${getRuleTypeName(rule.type)}</span>
        <div class="rule-actions">
          <button class="action-btn edit-rule" title="Editar regra">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 20h9"></path>
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
            </svg>
          </button>
          <button class="action-btn delete-rule" title="Excluir regra">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 6h18"></path>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6z"></path>
              <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      </div>
      <div class="rule-details">${ruleDetails}</div>
      <div class="rule-expansion">
        <strong>Expansão:</strong> ${escapeHtml(rule.expansion || "")}
      </div>
    `;

    // Add event listeners
    const editBtn = ruleDiv.querySelector('.edit-rule');
    const deleteBtn = ruleDiv.querySelector('.delete-rule');

    editBtn.addEventListener('click', () => editRule(rule));
    deleteBtn.addEventListener('click', () => deleteRule(rule));

    return ruleDiv;
  }

  function getRuleTypeName(type) {
    const typeNames = {
      dayOfWeek: "Dia da Semana",
      timeRange: "Horário",
      domain: "Domínio",
      specialDate: "Data Especial",
      combined: "Combinada"
    };
    return typeNames[type] || type;
  }

  function editRule(rule) {
    // Show rule form and populate with rule data
    const ruleForm = document.getElementById("rule-form");
    if (ruleForm) {
      ruleForm.classList.remove("hidden");
      populateRuleForm(rule);
      state.currentEditingRule = rule;
    }
  }

  function populateRuleForm(rule) {
    // Populate form fields based on rule data
    const ruleTypeSelect = document.getElementById("rule-type");
    if (ruleTypeSelect) {
      ruleTypeSelect.value = rule.type;
      handleRuleTypeChange(); // Show appropriate sections
    }

    const expansionTextarea = document.getElementById("rule-expansion");
    if (expansionTextarea) {
      expansionTextarea.value = rule.expansion || "";
    }

    const priorityInput = document.getElementById("rule-priority");
    if (priorityInput) {
      priorityInput.value = rule.priority || 0;
    }

    // Populate specific fields based on rule type
    switch (rule.type) {
      case "dayOfWeek":
        if (rule.days) {
          rule.days.forEach(day => {
            const checkbox = document.querySelector(`input[name="rule-day"][value="${day}"]`);
            if (checkbox) checkbox.checked = true;
          });
        }
        break;
      case "timeRange":
        document.getElementById("start-hour").value = rule.startHour || "";
        document.getElementById("start-minute").value = rule.startMinute || "";
        document.getElementById("end-hour").value = rule.endHour || "";
        document.getElementById("end-minute").value = rule.endMinute || "";
        break;
      case "domain":
        const domainsTextarea = document.getElementById("domains");
        if (domainsTextarea && rule.domains) {
          domainsTextarea.value = rule.domains.join("\n");
        }
        break;
      case "specialDate":
        // Handle special dates
        if (rule.specialDates) {
          const specialDatesList = document.getElementById("special-dates-list");
          if (specialDatesList) {
            specialDatesList.innerHTML = "";
            rule.specialDates.forEach(date => {
              addSpecialDateItem(date.month, date.day);
            });
          }
        }
        break;
    }
  }

  function deleteRule(rule) {
    SoteConfirmationModal.show({
      title: "Excluir Regra",
      message: `Você tem certeza que quer excluir esta regra?`,
      confirmText: "Excluir",
      requireInput: false,
      onConfirm: async () => {
        try {
          await sendMessageToBackground(
            SOTE_CONSTANTS.MESSAGE_TYPES.DELETE_RULE,
            { ruleId: rule.id }
          );
          SoteNotifier.show("Regra excluída com sucesso!", "success");
          
          // Reload rules for current abbreviation
          const abbr = state.abbreviations.find(a => a.abbreviation === state.currentEditingAbbreviation);
          if (abbr) {
            loadRulesForAbbreviation(abbr);
          }
        } catch (error) {
          logError("Error deleting rule:", error);
          SoteNotifier.show("Erro ao excluir regra.", "error");
        }
      },
    });
  }

  function handleRuleTypeChange() {
    const ruleType = document.getElementById("rule-type").value;
    
    // Hide all sections first
    document.getElementById("days-section").classList.add("hidden");
    document.getElementById("time-section").classList.add("hidden");
    document.getElementById("domain-section").classList.add("hidden");
    document.getElementById("special-date-section").classList.add("hidden");
    document.getElementById("combined-rule-section").classList.add("hidden");

    // Show relevant section
    switch (ruleType) {
      case "dayOfWeek":
        document.getElementById("days-section").classList.remove("hidden");
        break;
      case "timeRange":
        document.getElementById("time-section").classList.remove("hidden");
        break;
      case "domain":
        document.getElementById("domain-section").classList.remove("hidden");
        break;
      case "specialDate":
        document.getElementById("special-date-section").classList.remove("hidden");
        break;
      case "combined":
        document.getElementById("combined-rule-section").classList.remove("hidden");
        break;
    }
  }

  function addSpecialDateItem(month = "", day = "") {
    const template = document.getElementById("special-date-item-template");
    const specialDatesList = document.getElementById("special-dates-list");
    
    if (template && specialDatesList) {
      const clone = template.content.cloneNode(true);
      const monthInput = clone.querySelector(".special-date-month");
      const dayInput = clone.querySelector(".special-date-day");
      const deleteBtn = clone.querySelector(".delete-special-date");

      if (month) monthInput.value = month;
      if (day) dayInput.value = day;

      deleteBtn.addEventListener('click', (e) => {
        e.target.closest('.special-date-item').remove();
      });

      specialDatesList.appendChild(clone);
    }
  }

  async function saveRule() {
    const ruleData = getRuleFormData();
    if (!validateRuleData(ruleData)) return;

    try {
      const messageType = state.currentEditingRule
        ? SOTE_CONSTANTS.MESSAGE_TYPES.UPDATE_RULE
        : SOTE_CONSTANTS.MESSAGE_TYPES.ADD_RULE;

      if (state.currentEditingRule) {
        ruleData.id = state.currentEditingRule.id;
      }

      ruleData.abbreviationId = state.currentEditingAbbreviation;

      await sendMessageToBackground(messageType, ruleData);

      SoteNotifier.show(
        state.currentEditingRule ? "Regra atualizada!" : "Regra criada!",
        "success"
      );

      // Reset form and reload rules
      resetRuleForm();
      const abbr = state.abbreviations.find(a => a.abbreviation === state.currentEditingAbbreviation);
      if (abbr) {
        loadRulesForAbbreviation(abbr);
      }
    } catch (error) {
      logError("Error saving rule:", error);
      SoteNotifier.show("Erro ao salvar regra.", "error");
    }
  }

  function getRuleFormData() {
    const ruleType = document.getElementById("rule-type").value;
    const expansion = document.getElementById("rule-expansion").value.trim();
    const priority = parseInt(document.getElementById("rule-priority").value) || 0;

    const ruleData = {
      type: ruleType,
      expansion,
      priority
    };

    switch (ruleType) {
      case "dayOfWeek":
        const selectedDays = Array.from(document.querySelectorAll('input[name="rule-day"]:checked'))
          .map(cb => parseInt(cb.value));
        ruleData.days = selectedDays;
        break;
      case "timeRange":
        ruleData.startHour = parseInt(document.getElementById("start-hour").value) || 0;
        ruleData.startMinute = parseInt(document.getElementById("start-minute").value) || 0;
        ruleData.endHour = parseInt(document.getElementById("end-hour").value) || 23;
        ruleData.endMinute = parseInt(document.getElementById("end-minute").value) || 59;
        break;
      case "domain":
        const domainsText = document.getElementById("domains").value.trim();
        ruleData.domains = domainsText ? domainsText.split("\n").map(d => d.trim()).filter(d => d) : [];
        break;
      case "specialDate":
        const specialDates = Array.from(document.querySelectorAll('.special-date-item')).map(item => {
          const month = parseInt(item.querySelector('.special-date-month').value);
          const day = parseInt(item.querySelector('.special-date-day').value);
          return { month, day };
        }).filter(date => date.month && date.day);
        ruleData.specialDates = specialDates;
        break;
    }

    return ruleData;
  }

  function validateRuleData(data) {
    if (!data.expansion) {
      SoteNotifier.show("A expansão da regra é obrigatória.", "error");
      return false;
    }

    switch (data.type) {
      case "dayOfWeek":
        if (!data.days || data.days.length === 0) {
          SoteNotifier.show("Selecione pelo menos um dia da semana.", "error");
          return false;
        }
        break;
      case "domain":
        if (!data.domains || data.domains.length === 0) {
          SoteNotifier.show("Digite pelo menos um domínio.", "error");
          return false;
        }
        break;
      case "specialDate":
        if (!data.specialDates || data.specialDates.length === 0) {
          SoteNotifier.show("Adicione pelo menos uma data especial.", "error");
          return false;
        }
        break;
    }

    return true;
  }

  function resetRuleForm() {
    const ruleForm = document.getElementById("rule-form");
    if (ruleForm) {
      ruleForm.reset();
      ruleForm.classList.add("hidden");
      
      // Clear special dates
      const specialDatesList = document.getElementById("special-dates-list");
      if (specialDatesList) {
        specialDatesList.innerHTML = "";
      }
      
      // Uncheck all day checkboxes
      document.querySelectorAll('input[name="rule-day"]').forEach(cb => cb.checked = false);
      
      state.currentEditingRule = null;
    }
  }

  // ===== ACTION FUNCTIONS =====
  function editAbbreviation(abbreviationKey) {
    const abbr = state.abbreviations.find(a => a.abbreviation === abbreviationKey);
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
      confirmText: "Excluir",
      requireInput: false,
      onConfirm: async () => {
        try {
          await sendMessageToBackground(
            SOTE_CONSTANTS.MESSAGE_TYPES.DELETE_ABBREVIATION,
            { abbreviationKey }
          );
          SoteNotifier.show("Abreviação excluída com sucesso!", "success");
        } catch (error) {
          logError("Error deleting abbreviation:", error);
          SoteNotifier.show("Erro ao excluir abreviação.", "error");
        }
      },
    });
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
    state.searchTerm = elements["search-input"].value.trim().toLowerCase();
    filterAndRenderAbbreviations();
  }

  function handleCategoryClick(event) {
    const categoryItem = event.target.closest(".category-item");
    if (!categoryItem) return;

    // Update active state
    document.querySelectorAll(".category-item").forEach(item => {
      item.classList.remove("active");
    });
    categoryItem.classList.add("active");

    // Update state and filter
    state.currentCategory = categoryItem.getAttribute("data-category");
    filterAndRenderAbbreviations();
    updateExportButtons();
  }

  function handleSort(event) {
    const th = event.target.closest("th.sortable");
    if (!th) return;

    const column = th.getAttribute("data-sort");
    if (state.sortColumn === column) {
      state.sortDirection = state.sortDirection === "asc" ? "desc" : "asc";
    } else {
      state.sortColumn = column;
      state.sortDirection = "asc";
    }

    // Update sort indicators
    document.querySelectorAll("th.sortable").forEach(header => {
      header.classList.remove("sorted-asc", "sorted-desc");
    });
    th.classList.add(`sorted-${state.sortDirection}`);

    filterAndRenderAbbreviations();
  }

  function handleRowSelection(abbreviation, isSelected) {
    if (isSelected) {
      state.selectedAbbreviations.add(abbreviation);
    } else {
      state.selectedAbbreviations.delete(abbreviation);
    }
    updateSelectAllCheckbox();
    updateExportButtons();
  }

  function handleSelectAll(isSelected) {
    state.selectedAbbreviations.clear();
    if (isSelected) {
      state.filteredAbbreviations.forEach(abbr => {
        state.selectedAbbreviations.add(abbr.abbreviation);
      });
    }

    // Update checkboxes
    document.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
      if (checkbox.id !== "select-all-checkbox") {
        checkbox.checked = isSelected;
      }
    });

    updateExportButtons();
  }

  function updateSelectAllCheckbox() {
    const selectAllCheckbox = elements["select-all-checkbox"];
    if (!selectAllCheckbox) return;

    const totalVisible = state.filteredAbbreviations.length;
    const selectedVisible = state.filteredAbbreviations.filter(abbr =>
      state.selectedAbbreviations.has(abbr.abbreviation)
    ).length;

    selectAllCheckbox.checked = totalVisible > 0 && selectedVisible === totalVisible;
    selectAllCheckbox.indeterminate = selectedVisible > 0 && selectedVisible < totalVisible;
  }

  function updateExportButtons() {
    const hasSelected = state.selectedAbbreviations.size > 0;
    const hasCategory = state.currentCategory !== "all";

    if (elements["export-selected-btn"]) {
      elements["export-selected-btn"].style.display = hasSelected ? "block" : "none";
    }

    if (elements["export-category-btn"]) {
      elements["export-category-btn"].style.display = hasCategory ? "block" : "none";
      if (hasCategory) {
        const categoryName = state.currentCategory;
        elements["export-category-btn"].querySelector("span").textContent = `Exportar "${categoryName}"`;
      }
    }
  }

  // ===== INITIALIZATION =====
  function setupEventListeners() {
    // Toggle
    elements["enabled-toggle"]?.addEventListener("change", event => {
      chrome.storage.sync.set({ enabled: event.target.checked });
    });

    // Search
    elements["search-input"]?.addEventListener("input", debounce(handleSearch, 300));

    // Category navigation
    elements["category-list"]?.addEventListener("click", handleCategoryClick);

    // Add button
    elements["add-btn"]?.addEventListener("click", () => showModal());

    // Modal controls
    elements["modal-close"]?.addEventListener("click", hideModal);
    elements["modal-cancel"]?.addEventListener("click", hideModal);
    elements["abbreviation-form"]?.addEventListener("submit", handleFormSubmit);

    // Category change
    elements["category"]?.addEventListener("change", handleCategoryChange);

    // Expansion textarea change for choice buttons
    elements["expansion"]?.addEventListener("input", updateChoiceButtons);

    // Sort headers
    document.querySelectorAll("th.sortable").forEach(th => {
      th.addEventListener("click", handleSort);
    });

    // Select all checkbox
    elements["select-all-checkbox"]?.addEventListener("change", event => {
      handleSelectAll(event.target.checked);
    });

    // Insert action buttons
    document.querySelectorAll(".btn-insert-action").forEach(button => {
      button.addEventListener("click", event => {
        const action = event.target.getAttribute("data-action");
        if (action && elements["expansion"]) {
          insertTextAtCursor(elements["expansion"], action);
        }
      });
    });

    // Modal backdrop click
    elements["modal-container"]?.addEventListener("click", event => {
      if (event.target === elements["modal-container"]) {
        hideModal();
      }
    });

    // Rules modal events
    elements["rules-modal-close"]?.addEventListener("click", () => {
      elements["rules-modal"].classList.add("hidden");
      resetRuleForm();
    });

    elements["rules-modal-cancel"]?.addEventListener("click", () => {
      resetRuleForm();
    });

    elements["rules-modal-save"]?.addEventListener("click", saveRule);

    // Add rule button
    document.getElementById("add-rule-btn")?.addEventListener("click", () => {
      const ruleForm = document.getElementById("rule-form");
      if (ruleForm) {
        ruleForm.classList.remove("hidden");
        state.currentEditingRule = null;
      }
    });

    // Rule type change
    document.getElementById("rule-type")?.addEventListener("change", handleRuleTypeChange);

    // Add special date button
    document.getElementById("add-special-date-btn")?.addEventListener("click", () => {
      addSpecialDateItem();
    });
  }

  function insertTextAtCursor(textarea, text) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const value = textarea.value;

    textarea.value = value.substring(0, start) + text + value.substring(end);
    textarea.setSelectionRange(start + text.length, start + text.length);
    textarea.focus();

    // Trigger input event
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function setupMessageListener() {
    chrome.runtime.onMessage.addListener(message => {
      if (message.type === SOTE_CONSTANTS.MESSAGE_TYPES.STATE_UPDATED) {
        log("Dashboard recebeu STATE_UPDATED.");
        updateLocalState(message.payload);
      }
      return false;
    });
  }

  // ===== MAIN INITIALIZATION =====
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

  // Start when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();