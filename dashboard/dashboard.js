// SOTE-main/dashboard/dashboard.js
const RULES_STORE = 'expansionRules';

// DOM Elements
// Header
const enabledToggle = document.getElementById('enabled-toggle');
const statusText = document.getElementById('status-text');

// Sidebar
const categoryList = document.getElementById('category-list');

// Content
const searchInput = document.getElementById('search-input');
const abbreviationsListElement = document.getElementById('abbreviations-list'); // Renomeado
const addBtn = document.getElementById('add-btn');

// Modal (Principal para adicionar/editar abreviações)
const modalContainer = document.getElementById('modal-container');
const modalTitle = document.getElementById('modal-title');
const modalClose = document.getElementById('modal-close');
const modalCancel = document.getElementById('modal-cancel');
const modalSave = document.getElementById('modal-save');
const abbreviationInput = document.getElementById('abbreviation');
const expansionTextarea = document.getElementById('expansion');
const categorySelect = document.getElementById('category');
const customCategoryInputContainer = document.getElementById('custom-category-input-container');
const customCategoryInput = document.getElementById('custom-category');
const caseSensitiveCheckbox = document.getElementById('case-sensitive');
const enabledCheckbox = document.getElementById('enabled');
const mainModalInsertActionButtons = document.querySelectorAll('#modal-container .btn-insert-action');

// Import/Export
const importBtn = document.getElementById('import-btn');
const exportBtn = document.getElementById('export-btn');
const importModal = document.getElementById('import-modal');
const importModalClose = document.getElementById('import-modal-close');
const importModalCancel = document.getElementById('import-modal-cancel');
const importModalImport = document.getElementById('import-modal-import');
const importFile = document.getElementById('import-file');
const importReplace = document.getElementById('import-replace');

// Settings
const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const settingsModalClose = document.getElementById('settings-modal-close');
const settingsModalCancel = document.getElementById('settings-modal-cancel');
const settingsModalSave = document.getElementById('settings-modal-save');
const triggerSpace = document.getElementById('trigger-space');
const triggerTab = document.getElementById('trigger-tab');
const triggerEnter = document.getElementById('trigger-enter');
const settingUndo = document.getElementById('setting-undo');
const clearDataBtn = document.getElementById('clear-data-btn');

// Rules Modal Elements
const rulesModalContainer = document.getElementById('rules-modal');
const rulesModalTitle = document.getElementById('rules-modal-title');
const rulesModalCloseBtn = document.getElementById('rules-modal-close');
const rulesListDisplayElement = document.getElementById('rules-list');
const addRuleBtn = document.getElementById('add-rule-btn');
const ruleForm = document.getElementById('rule-form');
const ruleTypeSelect = document.getElementById('rule-type');
const daysSection = document.getElementById('days-section');
const dayCheckboxes = daysSection.querySelectorAll('input[type="checkbox"]');
const timeSection = document.getElementById('time-section');
const startHourInput = document.getElementById('start-hour');
const endHourInput = document.getElementById('end-hour');
const startMinuteInput = document.getElementById('start-minute');
const endMinuteInput = document.getElementById('end-minute');
const domainSection = document.getElementById('domain-section');
const domainsTextarea = document.getElementById('domains');
const ruleExpansionTextarea = document.getElementById('rule-expansion');
const rulePriorityInput = document.getElementById('rule-priority');
const rulesModalCancelBtn = document.getElementById('rules-modal-cancel');
const rulesModalSaveBtn = document.getElementById('rules-modal-save');
const specialDateSection = document.getElementById('special-date-section');
const specialMonthInput = document.getElementById('special-month');
const specialDayInput = document.getElementById('special-day');
const rulesModalInsertActionButtons = document.querySelectorAll('#rules-modal .btn-insert-action');

const combinedRuleSection = document.getElementById('combined-rule-section');
const combinedOperatorSelect = document.getElementById('combined-operator');
const subConditionsList = document.getElementById('sub-conditions-list');
const addSubConditionBtn = document.getElementById('add-sub-condition-btn');
const subConditionTemplate = document.getElementById('sub-condition-template');

// Mapeamento para tradução dos tipos de regra
const ruleTypeTranslations = {
  dayOfWeek: 'Dia da Semana',
  timeRange: 'Intervalo de Horário',
  domain: 'Domínio do Site',
  specialDate: 'Data Especial',
  combined: 'Combinada'
};

/**
 * State
 */
let abbreviations = [];
let filteredAbbreviations = [];
let currentCategory = 'all';
let currentSort = {
  column: 'abbreviation',
  direction: 'asc'
};
let currentEditId = null;
let isEnabled = true;
let initialLoadDoneBySeedMessage = false;
let currentAbbreviationIdForRules = null;
let currentEditingRuleId = null;

/**
 * Replaces action placeholders with user-friendly descriptions for display.
 * @param {string} text The raw expansion text.
 * @returns {string} The formatted text.
 */
function formatExpansionForDisplay(text) {
  if (typeof text !== 'string') return '';
  return text
      .replace(/\$cursor\$/g, '[posição do cursor]')
      .replace(/\$transferencia\$/g, '[área de transferência]');
}


/**
 * Inserts text at the current cursor position in a textarea.
 * @param {HTMLTextAreaElement} textarea The textarea element.
 * @param {string} textToInsert The text to insert.
 */
function insertTextAtCursor(textarea, textToInsert) {
  if (!textarea) return;
  const startPos = textarea.selectionStart;
  const endPos = textarea.selectionEnd;
  const scrollTop = textarea.scrollTop;
  textarea.value = textarea.value.substring(0, startPos) +
                   textToInsert +
                   textarea.value.substring(endPos, textarea.value.length);
  textarea.selectionStart = startPos + textToInsert.length;
  textarea.selectionEnd = startPos + textToInsert.length;
  textarea.scrollTop = scrollTop;
  textarea.focus();
}

/**
 * Performs a local refresh of the dashboard's main data views.
 */
async function performLocalRefresh() {
  await loadAbbreviationsAndRender();
  await loadCategories();
  if (currentAbbreviationIdForRules && !rulesModalContainer.classList.contains('hidden')) {
    loadAndDisplayRules(currentAbbreviationIdForRules);
  }
}

async function loadAbbreviationsAndRender() {
  try {
    abbreviationsListElement.innerHTML = `
      <tr>
        <td colspan="7" class="loading">Carregando abreviações...</td>
      </tr>
    `;
    const freshAbbreviations = await window.TextExpanderDB.getAllAbbreviations();
    abbreviations = freshAbbreviations;
    filterAbbreviations();
  } catch (error) {
    console.error('Erro ao carregar abreviações:', error);
    abbreviationsListElement.innerHTML = `
      <tr>
        <td colspan="7" class="loading">Erro ao carregar abreviações. Por favor, tente novamente.</td>
      </tr>
    `;
  }
}

/**
 * Initialize the dashboard
 */
async function init() {
  if (!window.TextExpanderDB || typeof window.TextExpanderDB.getAllAbbreviations !== 'function') {
    console.error("TextExpanderDB não foi inicializado corretamente para dashboard.js.");
    abbreviationsListElement.innerHTML = `<tr><td colspan="7" class="loading">Erro ao inicializar. Verifique o console.</td></tr>`;
    return;
  }

  const allCategoryItem = categoryList.querySelector('[data-category="all"]');
  if (allCategoryItem) {
    allCategoryItem.addEventListener('click', () => handleCategoryFilter('all'));
  }

  searchInput.addEventListener('input', handleSearch);
  enabledToggle.addEventListener('change', handleToggleEnabled);
  addBtn.addEventListener('click', () => showModal());
  modalClose.addEventListener('click', hideModal);
  modalCancel.addEventListener('click', hideModal);
  modalSave.addEventListener('click', handleSaveAbbreviation);

  mainModalInsertActionButtons.forEach(button => {
    button.addEventListener('click', function() {
        const action = this.dataset.action;
        insertTextAtCursor(expansionTextarea, action);
    });
  });
  
  rulesModalInsertActionButtons.forEach(button => {
      button.addEventListener('click', function() {
          const action = this.dataset.action;
          insertTextAtCursor(ruleExpansionTextarea, action);
      });
  });

  document.querySelectorAll('.abbreviations-table th.sortable').forEach(header => {
    header.addEventListener('click', () => {
      const column = header.getAttribute('data-sort');
      handleSort(column);
    });
  });

  categorySelect.addEventListener('change', function() {
    customCategoryInputContainer.style.display = (this.value === 'Personalizada') ? 'block' : 'none';
    if (this.value !== 'Personalizada') {
        customCategoryInput.value = '';
    } else {
        customCategoryInput.focus();
    }
  });

  importBtn.addEventListener('click', showImportModal);
  exportBtn.addEventListener('click', handleExport);
  importModalClose.addEventListener('click', hideImportModal);
  importModalCancel.addEventListener('click', hideImportModal);
  importModalImport.addEventListener('click', handleImport);

  settingsBtn.addEventListener('click', showSettingsModal);
  settingsModalClose.addEventListener('click', hideSettingsModal);
  settingsModalCancel.addEventListener('click', hideSettingsModal);
  settingsModalSave.addEventListener('click', handleSaveSettings);
  clearDataBtn.addEventListener('click', handleClearData);

  // Rules Modal Listeners
  rulesModalCloseBtn.addEventListener('click', hideRulesModal);
  rulesModalCancelBtn.addEventListener('click', () => {
    if (!ruleForm.classList.contains('hidden')) {
      ruleForm.classList.add('hidden');
      addRuleBtn.classList.remove('hidden');
    } else {
      hideRulesModal();
    }
  });
  addRuleBtn.addEventListener('click', handleShowRuleForm);
  ruleTypeSelect.addEventListener('change', handleRuleTypeChange);
  rulesModalSaveBtn.addEventListener('click', handleSaveRule);

  if (addSubConditionBtn) {
    addSubConditionBtn.addEventListener('click', () => handleAddSubCondition(null));
  }

  if (subConditionsList) {
    subConditionsList.addEventListener('click', (event) => {
      if (event.target.classList.contains('remove-sub-condition-btn')) {
        event.target.closest('.sub-condition-item').remove();
      }
      if (event.target.classList.contains('sub-condition-type')) {
          renderSubConditionFields(event.target.value, event.target.closest('.sub-condition-item').querySelector('.sub-condition-fields'), null);
      }
    });
  }

  chrome.storage.sync.get('enabled', (result) => {
    if (result.hasOwnProperty('enabled')) {
      isEnabled = result.enabled;
      enabledToggle.checked = isEnabled;
      statusText.textContent = isEnabled ? 'Habilitado' : 'Disabilitado';
    }
  });

  loadSettings();

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    let needsReloadDueToExternalChange = false;
    if (message.type === 'ABBREVIATIONS_UPDATED') {
      needsReloadDueToExternalChange = true;
    } else if (message.type === 'INITIAL_SEED_COMPLETE') {
      if (!initialLoadDoneBySeedMessage) {
          needsReloadDueToExternalChange = true;
          initialLoadDoneBySeedMessage = true;
      }
    }

    if (needsReloadDueToExternalChange) {
      console.log('[Dashboard] ABBREVIATIONS_UPDATED ou INITIAL_SEED_COMPLETE recebido, chamando performLocalRefresh.');
      performLocalRefresh().catch(error => {
        console.error("Erro durante o performLocalRefresh acionado por mensagem:", error);
      });
    }
    return true;
  });
  await performLocalRefresh();
}

async function loadAbbreviations() {
  try {
    abbreviations = await window.TextExpanderDB.getAllAbbreviations();
    filterAbbreviations();
  } catch (error) {
    console.error('Erro ao carregar abreviações:', error);
    abbreviationsListElement.innerHTML = `
      <tr>
        <td colspan="7" class="loading">Erro ao carregar abreviações. Por favor, tente novamente.</td>
      </tr>
    `;
  }
}

async function loadCategories() {
  try {
    const categories = await window.TextExpanderDB.getAllCategories();

    const allCategoryItem = categoryList.querySelector('[data-category="all"]');
    categoryList.innerHTML = '';
    if (allCategoryItem) categoryList.appendChild(allCategoryItem);

    categories.forEach(category => {
      const li = document.createElement('li');
      li.className = 'category-item';
      li.setAttribute('data-category', category);
      li.textContent = category;
      li.addEventListener('click', () => handleCategoryFilter(category));
      categoryList.appendChild(li);
    });

    const existingCustomOptions = Array.from(categorySelect.options).filter(opt => !['Comum', 'Pessoal', 'Trabalho', 'Personalizada'].includes(opt.value));
    existingCustomOptions.forEach(opt => categorySelect.removeChild(opt));

    const personalizadaOption = categorySelect.querySelector('option[value="Personalizada"]');
    const currentCategoryOptions = new Set(Array.from(categorySelect.options).map(opt => opt.value));

    categories.forEach(category => {
      if (!currentCategoryOptions.has(category)) {
        const option = document.createElement('option');
        option.value = category;
        option.textContent = category;
        if (personalizadaOption) {
          categorySelect.insertBefore(option, personalizadaOption);
        } else {
          categorySelect.appendChild(option);
        }
        currentCategoryOptions.add(category);
      }
    });

    customCategoryInputContainer.style.display = (categorySelect.value === 'Personalizada') ? 'block' : 'none';
  } catch (error) {
    console.error('Erro ao carregar categorias:', error);
  }
}
function filterAbbreviations() {
  const searchTerm = searchInput.value.trim().toLowerCase();

  filteredAbbreviations = abbreviations.filter(abbr => {
    const categoryMatch = currentCategory === 'all' || abbr.category === currentCategory;
    const searchMatch = searchTerm === '' ||
                       abbr.abbreviation.toLowerCase().includes(searchTerm) ||
                       abbr.expansion.toLowerCase().includes(searchTerm) ||
                       (abbr.category && abbr.category.toLowerCase().includes(searchTerm));
    return categoryMatch && searchMatch;
  });

  sortAbbreviations();
  renderAbbreviations();
}

function sortAbbreviations() {
  const { column, direction } = currentSort;

  filteredAbbreviations.sort((a, b) => {
    let valueA = a[column];
    let valueB = b[column];

    if (column === 'lastUsed') {
      valueA = valueA ? new Date(valueA).getTime() : (direction === 'asc' ? Infinity : -Infinity) ;
      valueB = valueB ? new Date(valueB).getTime() : (direction === 'asc' ? Infinity : -Infinity);
    } else if (column === 'usageCount') {
        valueA = Number(valueA) || 0;
        valueB = Number(valueB) || 0;
    } else if (typeof valueA === 'string') {
      valueA = valueA.toLowerCase();
      valueB = valueB.toLowerCase();
    } else if (valueA === null || valueA === undefined) {
        valueA = (direction === 'asc' ? Infinity : -Infinity);
    } else if (valueB === null || valueB === undefined) {
        valueB = (direction === 'asc' ? Infinity : -Infinity);
    }

    if (valueA === valueB) {
      return a.abbreviation.toLowerCase().localeCompare(b.abbreviation.toLowerCase());
    }

    if (direction === 'asc') {
      return valueA < valueB ? -1 : 1;
    } else {
      return valueA > valueB ? -1 : 1;
    }
  });
}

function renderAbbreviations() {
  if (filteredAbbreviations.length === 0 && abbreviations.length > 0 && searchInput.value.trim() !== '') {
     abbreviationsListElement.innerHTML = `
      <tr>
        <td colspan="7" class="loading">Nenhuma abreviação encontrada para "${searchInput.value}".</td>
      </tr>
    `;
    return;
  }
  if (filteredAbbreviations.length === 0) {
    abbreviationsListElement.innerHTML = `
      <tr>
        <td colspan="7" class="loading">Nenhuma abreviação cadastrada ou correspondente ao filtro.</td>
      </tr>
    `;
    return;
  }

  abbreviationsListElement.innerHTML = '';

  filteredAbbreviations.forEach(abbr => {
    const row = document.createElement('tr');
    let lastUsedText = 'Sem uso';
    if (abbr.lastUsed) {
      try {
        const date = new Date(abbr.lastUsed);
        lastUsedText = date.toLocaleString('pt-BR');
      } catch (e) {
        lastUsedText = abbr.lastUsed;
      }
    }
    
    // Formata a expansão para exibição amigável
    const formattedExpansion = formatExpansionForDisplay(abbr.expansion);
    const expansionDisplay = formattedExpansion.length > 50 ? formattedExpansion.substring(0, 47) + '...' : formattedExpansion;

    row.innerHTML = `
      <td>${abbr.abbreviation}</td>
      <td title="${formattedExpansion}">${expansionDisplay}</td>
      <td><span class="category-badge">${abbr.category || 'Sem categoria'}</span></td>
      <td>${abbr.usageCount || 0}</td>
      <td>${lastUsedText}</td>
      <td>${abbr.rules && abbr.rules.length > 0 ? abbr.rules.length : 0}</td>
      <td>
        <div class="table-actions">
          <button class="action-btn edit" data-id="${abbr.abbreviation}" title="Editar Abreviação">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 20h9"></path>
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
            </svg>
          </button>
          <button class="action-btn rules" data-id="${abbr.abbreviation}" title="Gerenciar Regras">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M15 14c.2-1 .7-1.7 1.5-2.5C17.3 10.7 18 9.8 18 9c0-.8-.3-1.6-.8-2.3-.5-.7-1.1-1.2-1.9-1.5C14.5 4.8 13.3 5 12.4 5.5c-.8.5-1.4 1.2-1.8 2.1-.4.9-.4 2.1.1 3.1.5.9 1.2 1.6 2 2.1.2.2.4.3.6.4V14z"></path>
              <path d="M9 18c-4.51 2-5-2-7-2"></path>
              <path d="M14 22c-4.51 2-5-2-7-2"></path>
              <path d="M22 18h-2c-1.33 0-2.67.33-3.8.66"></path>
              <path d="M20 22h-2c-1.33 0-2.67.33-3.8.66"></path>
            </svg>
          </button>
          <button class="action-btn delete" data-id="${abbr.abbreviation}" title="Excluir Abreviação">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 6h18"></path>
              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      </td>
    `;

    const editBtnElement = row.querySelector('.edit');
    const deleteBtnElement = row.querySelector('.delete');
    const rulesBtnElement = row.querySelector('.rules');

    editBtnElement.addEventListener('click', () => handleEditAbbreviation(abbr));
    deleteBtnElement.addEventListener('click', () => handleDeleteAbbreviation(abbr.abbreviation));
    rulesBtnElement.addEventListener('click', () => showRulesModal(abbr.abbreviation));

    abbreviationsListElement.appendChild(row);
  });

  document.querySelectorAll('.abbreviations-table th.sortable').forEach(header => {
    header.classList.remove('sorted-asc', 'sorted-desc');
    const column = header.getAttribute('data-sort');
    if (column === currentSort.column) {
      header.classList.add(`sorted-${currentSort.direction}`);
    }
  });
}

function handleSearch() {
  filterAbbreviations();
}

function handleCategoryFilter(category) {
  currentCategory = category;
  document.querySelectorAll('.category-item').forEach(item => {
    item.classList.remove('active');
    if (item.getAttribute('data-category') === category) {
      item.classList.add('active');
    }
  });
  filterAbbreviations();
}

function handleSort(column) {
  if (currentSort.column === column) {
    currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
  } else {
    currentSort.column = column;
    currentSort.direction = 'asc';
  }
  filterAbbreviations();
}

function handleToggleEnabled() {
  isEnabled = enabledToggle.checked;
  statusText.textContent = isEnabled ? 'Habilitado' : 'Disabilitado';
  chrome.storage.sync.set({ enabled: isEnabled });
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, {
          type: 'TOGGLE_ENABLED',
          enabled: isEnabled
        }).catch(err => { /* Ignora erro "no receiving end" */ });
      }
    });
  });
}

function showModal(abbr = null) {
  modalContainer.classList.remove('hidden');

  if (abbr) {
    modalTitle.textContent = 'Editar Abreviação';
    abbreviationInput.value = abbr.abbreviation;
    abbreviationInput.readOnly = true;
    expansionTextarea.value = abbr.expansion;
    caseSensitiveCheckbox.checked = abbr.caseSensitive || false;
    enabledCheckbox.checked = abbr.enabled !== false;
    currentEditId = abbr.abbreviation;

    const standardCategoriesAndPersonalizada = ['Comum', 'Pessoal', 'Trabalho', 'Personalizada'];
    if (abbr.category && !standardCategoriesAndPersonalizada.includes(abbr.category) && !categorySelect.querySelector(`option[value="${abbr.category}"]`)) {
      let tempOption = categorySelect.querySelector(`option[value="${abbr.category}"]`);
      if (!tempOption) {
          tempOption = document.createElement('option');
          tempOption.value = abbr.category;
          tempOption.textContent = abbr.category;
          const personalizadaOpt = categorySelect.querySelector('option[value="Personalizada"]');
          if (personalizadaOpt) {
              categorySelect.insertBefore(tempOption, personalizadaOpt);
          } else {
              categorySelect.appendChild(tempOption);
          }
      }
      categorySelect.value = abbr.category;
      customCategoryInputContainer.style.display = 'none';
      customCategoryInput.value = '';
    } else if (abbr.category && categorySelect.querySelector(`option[value="${abbr.category}"]`)) {
      categorySelect.value = abbr.category;
      customCategoryInputContainer.style.display = (abbr.category === 'Personalizada' && !customCategoryInput.value) ? 'block' : 'none';
       if(categorySelect.value === 'Personalizada' && abbr.category !== 'Personalizada'){
           customCategoryInput.value = abbr.category;
       } else if (categorySelect.value !== 'Personalizada') {
           customCategoryInput.value = '';
       }
    } else {
      categorySelect.value = abbr.category || 'Comum';
      customCategoryInputContainer.style.display = 'none';
      customCategoryInput.value = '';
    }
  } else {
    modalTitle.textContent = 'Adicionar Nova Abreviação';
    abbreviationInput.value = '';
    abbreviationInput.readOnly = false;
    expansionTextarea.value = '';
    categorySelect.value = 'Comum';
    caseSensitiveCheckbox.checked = false;
    enabledCheckbox.checked = true;
    currentEditId = null;
    customCategoryInputContainer.style.display = 'none';
    customCategoryInput.value = '';
  }
  abbreviationInput.focus();
}

function hideModal() {
  modalContainer.classList.add('hidden');
  currentEditId = null;
}

async function handleSaveAbbreviation() {
  const abbreviationVal = abbreviationInput.value.trim();
  const expansionVal = expansionTextarea.value.trim();
  let categoryVal = categorySelect.value;
  const caseSensitiveVal = caseSensitiveCheckbox.checked;
  const enabledVal = enabledCheckbox.checked;

  if (!abbreviationVal || !expansionVal) {
    alert('Por favor, insira a abreviação e a expansão.');
    return;
  }

  if (categoryVal === 'Personalizada') {
    const customCatName = customCategoryInput.value.trim();
    if (!customCatName) {
      alert('Por favor, insira o nome da categoria personalizada.');
      customCategoryInput.focus();
      return;
    }
    categoryVal = customCatName;
  }

  try {
    const abbrData = {
      abbreviation: abbreviationVal,
      expansion: expansionVal,
      category: categoryVal,
      caseSensitive: caseSensitiveVal,
      enabled: enabledVal
    };

    let operationSuccess = false;
    if (currentEditId) {
      const existingAbbr = abbreviations.find(a => a.abbreviation === currentEditId);
      if (existingAbbr) {
        abbrData.createdAt = existingAbbr.createdAt;
        abbrData.lastUsed = existingAbbr.lastUsed;
        abbrData.usageCount = existingAbbr.usageCount;
        abbrData.rules = existingAbbr.rules || [];
      }
       await window.TextExpanderDB.updateAbbreviation(abbrData);
       operationSuccess = true;
    } else {
      abbrData.createdAt = new Date().toISOString();
      abbrData.lastUsed = null;
      abbrData.usageCount = 0;
      abbrData.rules = [];
      const existing = abbreviations.find(a => a.abbreviation.toLowerCase() === abbreviationVal.toLowerCase());
      if (existing) {
          alert(`A abreviação "${abbreviationVal}" já existe.`);
      } else {
        await window.TextExpanderDB.addAbbreviation(abbrData);
        operationSuccess = true;
      }
    }

    if (operationSuccess) {
        hideModal();
        await performLocalRefresh();
    }
  } catch (error) {
    console.error('Erro ao salvar abreviação:', error);
    if (error.message && error.message.toLowerCase().includes('key already exists')) {
        alert(`Erro: A abreviação "${abbreviationVal}" já existe.`);
    } else {
        alert('Erro ao salvar abreviação. Por favor, tente novamente.');
    }
  }
}

function handleEditAbbreviation(abbr) {
  showModal(abbr);
}
async function handleDeleteAbbreviation(abbreviationKey) {
  if (confirm(`Tem certeza que deseja excluir a abreviação "${abbreviationKey}" e todas as suas regras associadas?`)) {
    try {
      const abbrToDelete = abbreviations.find(a => a.abbreviation === abbreviationKey);
      if (abbrToDelete && abbrToDelete.rules && abbrToDelete.rules.length > 0) {
        for (const rule of abbrToDelete.rules) {
          if (rule.id !== undefined) {
            await window.TextExpanderDB.deleteExpansionRule(rule.id);
          }
        }
      }
      await window.TextExpanderDB.deleteAbbreviation(abbreviationKey);
      await performLocalRefresh();
    } catch (error) {
      console.error('Erro ao excluir abreviação:', error);
      alert('Erro ao excluir abreviação. Por favor, tente novamente.');
    }
  }
}

function showRulesModal(abbreviationId) {
  currentAbbreviationIdForRules = abbreviationId;
  const abbrObj = abbreviations.find(a => a.abbreviation === abbreviationId);
  rulesModalTitle.textContent = `Regras para "${abbrObj ? abbrObj.abbreviation : abbreviationId}"`;
  rulesModalContainer.classList.remove('hidden');
  ruleForm.classList.add('hidden');
  addRuleBtn.classList.remove('hidden');
  currentEditingRuleId = null;
  resetRuleForm();
  loadAndDisplayRules(abbreviationId);
}

function hideRulesModal() {
  rulesModalContainer.classList.add('hidden');
  currentAbbreviationIdForRules = null;
  currentEditingRuleId = null;
  resetRuleForm();
}

function loadAndDisplayRules(abbreviationId) {
  const abbreviation = abbreviations.find(abbr => abbr.abbreviation === abbreviationId);
  rulesListDisplayElement.innerHTML = '';

  if (!abbreviation || !abbreviation.rules || abbreviation.rules.length === 0) {
    rulesListDisplayElement.innerHTML = '<p>Nenhuma regra definida para esta abreviação.</p>';
    return;
  }

  const sortedRules = [...abbreviation.rules].sort((a, b) => (b.priority || 0) - (a.priority || 0));

  sortedRules.forEach(rule => {
    const ruleItem = document.createElement('div');
    ruleItem.className = 'rule-item';
    let details = '';
    const ruleTypeDisplay = ruleTypeTranslations[rule.type] || (rule.type.charAt(0).toUpperCase() + rule.type.slice(1));

    switch (rule.type) {
      case 'dayOfWeek':
        const daysMap = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
        details = `Dias: ${rule.days ? rule.days.map(d => daysMap[d]).join(', ') : 'N/A'}`;
        break;
      case 'timeRange':
        const startHrStr = String(rule.startHour).padStart(2, '0');
        const startMinStr = String(rule.startMinute !== undefined ? rule.startMinute : '00').padStart(2, '0');
        const endHrStr = String(rule.endHour).padStart(2, '0');
        const endMinStr = String(rule.endMinute !== undefined ? rule.endMinute : '00').padStart(2, '0');
        details = `Horário: ${startHrStr}:${startMinStr} - ${endHrStr}:${endMinStr}`;
        break;
      case 'domain':
        details = `Domínios: ${rule.domains ? rule.domains.join(', ') : 'N/A'}`;
        break;
      case 'specialDate':
        details = `Data Especial: ${String(rule.day).padStart(2, '0')}/${String(rule.month).padStart(2, '0')}`;
        break;
      case 'combined':
        let subConditionsText = (rule.subConditions && rule.subConditions.length > 0)
          ? rule.subConditions.map(sc =>
              `${sc.negated ? 'NÃO ' : ''}(${ruleTypeTranslations[sc.conditionType] || sc.conditionType}${getDetailForSubType(sc)})`
            ).join(` ${rule.logicalOperator === 'AND' ? 'E' : 'OU'} `)
          : 'Nenhuma sub-condição';
        details = `Combinada (${rule.logicalOperator === 'AND' ? 'E' : 'OU'}): ${subConditionsText}`;
        break;
      default:
        details = `Tipo: ${ruleTypeDisplay}`;
    }

    const formattedRuleExpansion = formatExpansionForDisplay(rule.expansion);

    ruleItem.innerHTML = `
      <div class="rule-header">
        <span class="rule-type">Prioridade: ${rule.priority || 0} - ${ruleTypeDisplay}</span>
        <div class="rule-actions">
          <button class="action-btn edit-rule" title="Editar Regra">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
          </button>
          <button class="action-btn delete-rule" title="Excluir Regra">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
          </button>
        </div>
      </div>
      <div class="rule-details">${details}</div>
      <div class="rule-expansion">Expansão: <strong>${formattedRuleExpansion}</strong></div>
    `;

    rulesListDisplayElement.appendChild(ruleItem);

    const editButton = ruleItem.querySelector('.edit-rule');
    if (editButton) editButton.addEventListener('click', () => handleEditRule(rule));

    const deleteButton = ruleItem.querySelector('.delete-rule');
    if (deleteButton) deleteButton.addEventListener('click', () => handleDeleteRule(rule.id));
  });
}

function getDetailForSubType(subCond) {
    switch(subCond.conditionType) {
        case 'dayOfWeek':
            const daysMap = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
            return `: ${subCond.days ? subCond.days.map(d => daysMap[d]).join(',') : 'N/A'}`;
        case 'timeRange':
            const subStartHrStr = String(subCond.startHour).padStart(2, '0');
            const subStartMinStr = String(subCond.startMinute !== undefined ? subCond.startMinute : '00').padStart(2, '0');
            const subEndHrStr = String(subCond.endHour).padStart(2, '0');
            const subEndMinStr = String(subCond.endMinute !== undefined ? subCond.endMinute : '00').padStart(2, '0');
            return `: ${subStartHrStr}:${subStartMinStr}-${subEndHrStr}:${subEndMinStr}`;
        case 'domain': return `: ${subCond.domains ? subCond.domains.join(', ') : 'N/A'}`;
        case 'specialDate': return `: ${String(subCond.day).padStart(2, '0')}/${String(subCond.month).padStart(2, '0')}`;
        default: return '';
    }
}

function handleShowRuleForm() {
  currentEditingRuleId = null;
  resetRuleForm();
  ruleForm.classList.remove('hidden');
  addRuleBtn.classList.add('hidden');
  ruleForm.querySelector('h3').textContent = 'Nova Regra de Expansão';
  handleRuleTypeChange();
  ruleExpansionTextarea.focus();
}

function resetRuleForm() {
  ruleForm.reset();
  dayCheckboxes.forEach(cb => cb.checked = false);
  domainsTextarea.value = '';
  startHourInput.value = '';
  endHourInput.value = '';
  startMinuteInput.value = '';
  endMinuteInput.value = '';
  specialMonthInput.value = '';
  specialDayInput.value = '';
  rulePriorityInput.value = 0;
  ruleExpansionTextarea.value = '';
  subConditionsList.innerHTML = '';
  combinedOperatorSelect.value = 'AND';
  handleRuleTypeChange();
}

function handleRuleTypeChange() {
  const type = ruleTypeSelect.value;
  daysSection.classList.toggle('hidden', type !== 'dayOfWeek');
  timeSection.classList.toggle('hidden', type !== 'timeRange');
  domainSection.classList.toggle('hidden', type !== 'domain');
  specialDateSection.classList.toggle('hidden', type !== 'specialDate');
  combinedRuleSection.classList.toggle('hidden', type !== 'combined');

  if (type === 'combined' && subConditionsList.children.length === 0) {
    handleAddSubCondition(null);
  }
}

async function handleSaveRule() {
  if (!currentAbbreviationIdForRules) {
    console.error("ID da abreviação não definido para salvar a regra.");
    alert("Erro: ID da abreviação não encontrado. Tente reabrir o modal de regras.");
    return;
  }

  const type = ruleTypeSelect.value;
  const expansion = ruleExpansionTextarea.value.trim();
  const priority = parseInt(rulePriorityInput.value, 10) || 0;

  if (!expansion) {
    alert('Por favor, defina o texto de expansão para a regra.');
    ruleExpansionTextarea.focus();
    return;
  }

  const ruleData = {
    abbreviationId: currentAbbreviationIdForRules,
    type,
    expansion,
    priority,
  };

  if (currentEditingRuleId !== null) {
    ruleData.id = currentEditingRuleId;
  }

  switch (type) {
    case 'dayOfWeek':
      ruleData.days = Array.from(dayCheckboxes).filter(cb => cb.checked).map(cb => parseInt(cb.value, 10));
      if (ruleData.days.length === 0) { alert('Por favor, selecione pelo menos um dia da semana.'); return; }
      break;
    case 'timeRange':
      const startHour = parseInt(startHourInput.value, 10);
      const endHour = parseInt(endHourInput.value, 10);
      const startMinute = parseInt(startMinuteInput.value, 10);
      const endMinute = parseInt(endMinuteInput.value, 10);
      if (isNaN(startHour) || isNaN(startMinute) || isNaN(endHour) || isNaN(endMinute) ||
          startHour < 0 || startHour > 23 || startMinute < 0 || startMinute > 59 ||
          endHour < 0 || endHour > 23 || endMinute < 0 || endMinute > 59) {
        alert('Por favor, insira um horário HH:MM válido (Horas 0-23, Minutos 0-59).'); return;
      }
      ruleData.startHour = startHour; ruleData.endHour = endHour;
      ruleData.startMinute = startMinute; ruleData.endMinute = endMinute;
      break;
    case 'domain':
      ruleData.domains = domainsTextarea.value.split('\n').map(d => d.trim()).filter(d => d.length > 0);
      if (ruleData.domains.length === 0) { alert('Por favor, insira pelo menos um domínio.'); domainsTextarea.focus(); return; }
      break;
    case 'specialDate':
      const month = parseInt(specialMonthInput.value, 10);
      const day = parseInt(specialDayInput.value, 10);
      if (isNaN(month) || month < 1 || month > 12 || isNaN(day) || day < 1 || day > 31) {
        alert('Por favor, insira um Mês (1-12) e Dia (1-31) válidos para a Data Especial.'); return;
      }
      ruleData.month = month; ruleData.day = day;
      break;
    case 'combined':
      ruleData.logicalOperator = combinedOperatorSelect.value;
      ruleData.subConditions = [];
      const subConditionElements = subConditionsList.querySelectorAll('.sub-condition-item');
      if (subConditionElements.length === 0) { alert('Para regras combinadas, adicione pelo menos uma sub-condição.'); return; }
      for (const item of subConditionElements) {
        const subType = item.querySelector('.sub-condition-type').value;
        const subFieldsContainer = item.querySelector('.sub-condition-fields');
        const subNegated = item.querySelector('.sub-condition-negate').checked;
        const subCondData = { conditionType: subType, negated: subNegated };
        switch (subType) {
          case 'dayOfWeek':
            subCondData.days = Array.from(subFieldsContainer.querySelectorAll('input[type="checkbox"].sub-day:checked')).map(cb => parseInt(cb.value, 10));
            if (subCondData.days.length === 0) { alert('Sub-condição "Dia da Semana" precisa de pelo menos um dia.'); return; }
            break;
          case 'timeRange':
            const subStartHour = parseInt(subFieldsContainer.querySelector('.sub-start-hour').value, 10);
            const subEndHour = parseInt(subFieldsContainer.querySelector('.sub-end-hour').value, 10);
            const subStartMinute = parseInt(subFieldsContainer.querySelector('.sub-start-minute').value, 10);
            const subEndMinute = parseInt(subFieldsContainer.querySelector('.sub-end-minute').value, 10);
            if (isNaN(subStartHour) || isNaN(subStartMinute) || isNaN(subEndHour) || isNaN(subEndMinute) ||
                subStartHour < 0 || subStartHour > 23 || subStartMinute < 0 || subStartMinute > 59 ||
                subEndHour < 0 || subEndHour > 23 || subEndMinute < 0 || subEndMinute > 59) {
              alert('Sub-condição de horário HH:MM inválida.'); return;
            }
            subCondData.startHour = subStartHour; subCondData.endHour = subEndHour;
            subCondData.startMinute = subStartMinute; subCondData.endMinute = subEndMinute;
            break;
          case 'domain':
            subCondData.domains = subFieldsContainer.querySelector('.sub-domains').value.split('\n').map(d => d.trim()).filter(d => d.length > 0);
            if (subCondData.domains.length === 0) { alert('Sub-condição de domínio precisa de pelo menos um domínio.'); return; }
            break;
          case 'specialDate':
            const subMonth = parseInt(subFieldsContainer.querySelector('.sub-special-month').value, 10);
            const subDay = parseInt(subFieldsContainer.querySelector('.sub-special-day').value, 10);
            if (isNaN(subMonth) || subMonth < 1 || subMonth > 12 || isNaN(subDay) || subDay < 1 || subDay > 31) {
              alert('Sub-condição de data especial inválida.'); return;
            }
            subCondData.month = subMonth; subCondData.day = subDay;
            break;
          default: alert(`Tipo de sub-condição desconhecido: ${subType}`); return;
        }
        ruleData.subConditions.push(subCondData);
      }
      break;
  }
  try {
    if (currentEditingRuleId !== null) await window.TextExpanderDB.updateExpansionRule(ruleData);
    else await window.TextExpanderDB.addExpansionRule(ruleData);
    ruleForm.classList.add('hidden');
    addRuleBtn.classList.remove('hidden');
    currentEditingRuleId = null;
    resetRuleForm();
    await performLocalRefresh();
  } catch (error) {
    console.error('Erro ao salvar regra:', error);
    alert('Erro ao salvar regra. Verifique os dados e tente novamente.');
  }
}

function handleEditRule(rule) {
  currentEditingRuleId = rule.id;
  ruleForm.querySelector('h3').textContent = 'Editar Regra';
  ruleTypeSelect.value = rule.type;
  ruleExpansionTextarea.value = rule.expansion; // Para textarea
  rulePriorityInput.value = rule.priority || 0;
  subConditionsList.innerHTML = '';
  handleRuleTypeChange();

  switch (rule.type) {
    case 'dayOfWeek':
      dayCheckboxes.forEach(cb => { cb.checked = rule.days && rule.days.includes(parseInt(cb.value, 10)); });
      break;
    case 'timeRange':
      startHourInput.value = rule.startHour !== undefined ? rule.startHour : '';
      endHourInput.value = rule.endHour !== undefined ? rule.endHour : '';
      startMinuteInput.value = rule.startMinute !== undefined ? rule.startMinute : '';
      endMinuteInput.value = rule.endMinute !== undefined ? rule.endMinute : '';
      break;
    case 'domain':
      domainsTextarea.value = rule.domains ? rule.domains.join('\n') : '';
      break;
    case 'specialDate':
      specialMonthInput.value = rule.month !== undefined ? rule.month : '';
      specialDayInput.value = rule.day !== undefined ? rule.day : '';
      break;
    case 'combined':
      combinedOperatorSelect.value = rule.logicalOperator || 'AND';
      if (rule.subConditions && rule.subConditions.length > 0) {
        rule.subConditions.forEach(subCond => { handleAddSubCondition(subCond); });
      } else if (subConditionsList.children.length === 0) {
         handleAddSubCondition(null);
      }
      break;
  }
  addRuleBtn.classList.add('hidden');
  ruleForm.classList.remove('hidden');
  ruleExpansionTextarea.focus(); // Para textarea
}

async function handleDeleteRule(ruleId) {
  if (confirm('Tem certeza que deseja excluir esta regra?')) {
    try {
      await window.TextExpanderDB.deleteExpansionRule(ruleId);
      await performLocalRefresh();
    } catch (error) {
      console.error('Erro ao excluir regra:', error);
      alert('Erro ao excluir regra.');
    }
  }
}

function handleAddSubCondition(existingSubCondData = null) {
  const clone = subConditionTemplate.content.cloneNode(true);
  const subConditionItem = clone.querySelector('.sub-condition-item');
  const typeSelect = subConditionItem.querySelector('.sub-condition-type');
  const fieldsContainer = subConditionItem.querySelector('.sub-condition-fields');
  const negateCheckbox = subConditionItem.querySelector('.sub-condition-negate');

  if (existingSubCondData) {
    typeSelect.value = existingSubCondData.conditionType;
    negateCheckbox.checked = existingSubCondData.negated || false;
    renderSubConditionFields(existingSubCondData.conditionType, fieldsContainer, existingSubCondData);
  } else {
    renderSubConditionFields(typeSelect.value, fieldsContainer, null);
  }
  subConditionsList.appendChild(subConditionItem);
  return subConditionItem;
}

function renderSubConditionFields(type, container, data = null) {
  container.innerHTML = '';
  let content = '';
  switch (type) {
    case 'dayOfWeek':
      const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
      content = `<label>Dias:</label><div class="checkbox-group">`;
      days.forEach((day, index) => {
        const checked = data && data.days && data.days.includes(index) ? 'checked' : '';
        content += `<label><input type="checkbox" value="${index}" class="sub-day" ${checked}> ${day}</label>`;
      });
      content += `</div>`;
      break;
    case 'timeRange':
      content = `
        <label>Horário (HH:MM):</label>
        <div class="time-range">
          <input type="number" class="sub-start-hour" min="0" max="23" placeholder="HH" style="width: 60px;" value="${data && data.startHour !== undefined ? data.startHour : ''}"><span>:</span>
          <input type="number" class="sub-start-minute" min="0" max="59" placeholder="MM" style="width: 60px;" value="${data && data.startMinute !== undefined ? data.startMinute : ''}">
          <span>&nbsp;até&nbsp;</span>
          <input type="number" class="sub-end-hour" min="0" max="23" placeholder="HH" style="width: 60px;" value="${data && data.endHour !== undefined ? data.endHour : ''}"><span>:</span>
          <input type="number" class="sub-end-minute" min="0" max="59" placeholder="MM" style="width: 60px;" value="${data && data.endMinute !== undefined ? data.endMinute : ''}">
        </div>`;
      break;
    case 'domain':
      content = `<label for="sub-domains">Domínios (um por linha):</label><textarea class="sub-domains" rows="2" placeholder="exemplo.com">${data && data.domains ? data.domains.join('\n') : ''}</textarea>`;
      break;
    case 'specialDate':
      content = `
        <label>Data Especial (Anual):</label>
        <div class="date-range">
          <input type="number" class="sub-special-month" min="1" max="12" placeholder="Mês" value="${data && data.month !== undefined ? data.month : ''}"><span>/</span>
          <input type="number" class="sub-special-day" min="1" max="31" placeholder="Dia" value="${data && data.day !== undefined ? data.day : ''}">
        </div>`;
      break;
  }
  container.innerHTML = content;
}

function showImportModal() { importModal.classList.remove('hidden'); importFile.value = ''; }
function hideImportModal() { importModal.classList.add('hidden'); }

async function handleImport() {
  const file = importFile.files[0];
  if (!file) { alert('Por favor, selecione um arquivo para importar.'); return; }
  try {
    const text = await file.text();
    const importData = JSON.parse(text);
    if (!Array.isArray(importData)) { alert('Formato de arquivo de importação inválido.'); return; }

    const validAbbreviations = importData.filter(abbr =>
      abbr && typeof abbr === 'object' && typeof abbr.abbreviation === 'string' && abbr.abbreviation.trim() !== '' && typeof abbr.expansion === 'string'
    ).map(abbr => ({
        abbreviation: abbr.abbreviation.trim(), expansion: abbr.expansion,
        category: typeof abbr.category === 'string' ? abbr.category : 'Imported',
        caseSensitive: typeof abbr.caseSensitive === 'boolean' ? abbr.caseSensitive : false,
        enabled: typeof abbr.enabled === 'boolean' ? abbr.enabled : true,
        createdAt: abbr.createdAt || new Date().toISOString(), lastUsed: abbr.lastUsed || null,
        usageCount: Number(abbr.usageCount) || 0,
        rules: Array.isArray(abbr.rules) ? abbr.rules.map(r => ({...r, id: undefined, abbreviationId: abbr.abbreviation.trim()})) : []
    }));

    if (validAbbreviations.length === 0) { alert('Nenhuma abreviação válida encontrada no arquivo.'); return; }

    if (importReplace.checked) {
      await window.TextExpanderDB.clearAllAbbreviations();
      const db = await window.TextExpanderDB.openDatabase();
      const txRules = db.transaction(RULES_STORE, 'readwrite');
      const rulesStoreObj = txRules.objectStore(RULES_STORE);
      await new Promise((resolve, reject) => {
        const clearRequest = rulesStoreObj.clear();
        clearRequest.onsuccess = resolve; clearRequest.onerror = reject;
      });
    }

    let importedCount = 0;
    for (const abbrToImport of validAbbreviations) {
      let existingAbbr = null;
      if (!importReplace.checked) {
        try {
          const db = await window.TextExpanderDB.openDatabase();
          const tx = db.transaction('abbreviations', 'readonly');
          const store = tx.objectStore('abbreviations');
          const req = store.get(abbrToImport.abbreviation);
          await new Promise((resolve, reject) => {
            req.onsuccess = () => { existingAbbr = req.result; resolve(); }; req.onerror = reject;
          });
        } catch (e) { console.error("Erro ao verificar abreviação existente:", e); }
      }
      if (importReplace.checked || !existingAbbr) {
          await window.TextExpanderDB.importAbbreviations([abbrToImport]); // Assumindo que importAbbreviations lida com um array
          importedCount++;
          if (abbrToImport.rules && abbrToImport.rules.length > 0) {
              if (importReplace.checked && existingAbbr && existingAbbr.rules) {
                  for (const oldRule of existingAbbr.rules) {
                      if (oldRule.id !== undefined) await window.TextExpanderDB.deleteExpansionRule(oldRule.id);
                  }
              }
              for (let rule of abbrToImport.rules) {
                  const newRuleData = {...rule, abbreviationId: abbrToImport.abbreviation};
                  delete newRuleData.id; // Garante que um novo ID seja gerado
                  try { await window.TextExpanderDB.addExpansionRule(newRuleData); }
                  catch (e) { console.warn(`Falha ao importar regra para ${abbrToImport.abbreviation}:`, e.message); }
              }
          }
      }
    }
    hideImportModal();
    await performLocalRefresh();
    alert(`Importadas ${importedCount} abreviações com sucesso.`);
  } catch (error) {
    console.error('Erro ao importar abreviações:', error);
    alert('Erro ao importar abreviações. Verifique o formato do arquivo.');
  }
}

async function handleExport() {
  try {
    const currentAbbreviationsWithRules = await window.TextExpanderDB.getAllAbbreviations();
    const exportData = JSON.stringify(currentAbbreviationsWithRules, null, 2);
    const blob = new Blob([exportData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `sote-export-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Erro ao exportar abreviações:', error);
    alert('Erro ao exportar abreviações.');
  }
}

function showSettingsModal() { settingsModal.classList.remove('hidden'); loadSettings(); }
function hideSettingsModal() { settingsModal.classList.add('hidden'); }

function loadSettings() {
  chrome.storage.sync.get(['triggerSpace', 'triggerTab', 'triggerEnter', 'enableUndo'], (result) => {
    triggerSpace.checked = result.triggerSpace !== false;
    triggerTab.checked = result.triggerTab !== false;
    triggerEnter.checked = result.triggerEnter !== false;
    settingUndo.checked = result.enableUndo !== false;
  });
}

function handleSaveSettings() {
  const settingsToSave = {
    triggerSpace: triggerSpace.checked, triggerTab: triggerTab.checked,
    triggerEnter: triggerEnter.checked, enableUndo: settingUndo.checked
  };
  chrome.storage.sync.set(settingsToSave, () => {
    hideSettingsModal();
    alert('Configurações salvas com sucesso.');
    // Enviar mensagem para content scripts atualizarem suas configurações
    chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
          if (tab.id) {
            chrome.tabs.sendMessage(tab.id, { type: 'SETTINGS_UPDATED', settings: settingsToSave })
              .catch(err => {});
          }
        });
    });
  });
}

async function handleClearData() {
  if (confirm('Tem certeza que deseja apagar TODAS as abreviações e TODAS as regras? Esta ação não pode ser desfeita.')) {
    try {
      const db = await window.TextExpanderDB.openDatabase();
      const transactionRules = db.transaction(RULES_STORE, 'readwrite');
      const rulesStoreObj = transactionRules.objectStore(RULES_STORE);
      const clearRulesRequest = rulesStoreObj.clear();
      await new Promise((resolve, reject) => {
        clearRulesRequest.onsuccess = resolve;
        clearRulesRequest.onerror = (event) => {
            console.error('Erro ao limpar rules store:', event.target.error);
            reject(event.target.error || new Error('Falha ao limpar o repositório de regras.'));
        };
      });
      await window.TextExpanderDB.clearAllAbbreviations();
      hideSettingsModal();
      await performLocalRefresh();
      alert('Todos os dados foram apagados.');
    } catch (error) {
      console.error('Erro ao limpar dados:', error);
      alert('Erro ao limpar dados. Por favor, tente novamente.');
    }
  }
}

document.addEventListener('DOMContentLoaded', init);