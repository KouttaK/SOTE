
// DOM Elements
// Header
const enabledToggle = document.getElementById('enabled-toggle');
const statusText = document.getElementById('status-text');

// Sidebar
const categoryList = document.getElementById('category-list');

// Content
const searchInput = document.getElementById('search-input');
const abbreviationsList = document.getElementById('abbreviations-list'); // tbody
const addBtn = document.getElementById('add-btn'); // Botão principal "Adicionar Nova"

// Modal (Principal para adicionar/editar abreviações)
const modalContainer = document.getElementById('modal-container');
const modalTitle = document.getElementById('modal-title');
const modalClose = document.getElementById('modal-close');
const modalCancel = document.getElementById('modal-cancel');
const modalSave = document.getElementById('modal-save');
const abbreviationInput = document.getElementById('abbreviation');
const expansionInput = document.getElementById('expansion');
const categorySelect = document.getElementById('category');
const customCategoryInput = document.getElementById('custom-category');
const caseSensitiveCheckbox = document.getElementById('case-sensitive');
const enabledCheckbox = document.getElementById('enabled');

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
const rulesModalClose = document.getElementById('rules-modal-close');
const rulesListElement = document.getElementById('rules-list'); // Div onde as regras são listadas
const addRuleBtn = document.getElementById('add-rule-btn'); // Botão "+ Adicionar Regra" dentro do modal de regras
const ruleForm = document.getElementById('rule-form'); // Formulário para adicionar/editar regra
const ruleTypeSelect = document.getElementById('rule-type');
const daysSection = document.getElementById('days-section');
const dayCheckboxes = daysSection.querySelectorAll('input[type="checkbox"]');
const timeSection = document.getElementById('time-section');
const startHourInput = document.getElementById('start-hour');
const endHourInput = document.getElementById('end-hour');
const domainSection = document.getElementById('domain-section');
const domainsTextarea = document.getElementById('domains');
const ruleExpansionInput = document.getElementById('rule-expansion');
const rulePriorityInput = document.getElementById('rule-priority');
const rulesModalCancelBtn = document.getElementById('rules-modal-cancel'); // Botão Cancelar do modal de regras
const rulesModalSaveBtn = document.getElementById('rules-modal-save'); // Botão Salvar do modal de regras
const specialDateSection = document.getElementById('special-date-section');
const specialMonthInput = document.getElementById('special-month');
const specialDayInput = document.getElementById('special-day');

const combinedRuleSection = document.getElementById('combined-rule-section');
const combinedOperatorSelect = document.getElementById('combined-operator');
const subConditionsList = document.getElementById('sub-conditions-list');
const addSubConditionBtn = document.getElementById('add-sub-condition-btn');
const subConditionTemplate = document.getElementById('sub-condition-template');


/**
 * State
 */
let abbreviations = [];
let filteredAbbreviations = [];
let currentCategory = 'all'; // Modificado para 'all' como valor padrão
let currentSort = {
  column: 'abbreviation',
  direction: 'asc'
};
let currentEditId = null; // Para edição de abreviações
let isEnabled = true;
let initialLoadDoneBySeedMessage = false;

let currentAbbreviationIdForRules = null; // ID da abreviação cujas regras estão sendo gerenciadas
let currentEditingRuleId = null; // ID da regra que está sendo editada

async function loadAbbreviationsAndRender() {
  try {
    abbreviations = await window.TextExpanderDB.getAllAbbreviations();
    setTimeout(() => {
      filterAbbreviations();
    }, 0);
  } catch (error) {
    console.error('Erro ao carregar abreviações:', error);
    abbreviationsList.innerHTML = `
      <tr>
        <td colspan="7" class="loading">Erro ao carregar abreviações. Por favor, tente novamente.</td>
      </tr>
    `; // Colspan atualizado para 7 devido ao novo botão
  }
}

/**
 * Initialize the dashboard
 */
async function init() {
  if (!window.TextExpanderDB || typeof window.TextExpanderDB.getAllAbbreviations !== 'function') {
    console.error("TextExpanderDB não foi inicializado corretamente para dashboard.js.");
    abbreviationsList.innerHTML = `<tr><td colspan="7" class="loading">Erro ao inicializar. Verifique o console.</td></tr>`; // Colspan atualizado
    return;
  }

  const allCategoryItem = categoryList.querySelector('[data-category="all"]');
  if (allCategoryItem) {
    allCategoryItem.addEventListener('click', () => handleCategoryFilter('all'));
  }

  await loadAbbreviationsAndRender();
  await loadCategories();
  
  searchInput.addEventListener('input', handleSearch);
  enabledToggle.addEventListener('change', handleToggleEnabled);
  addBtn.addEventListener('click', () => showModal());
  modalClose.addEventListener('click', hideModal);
  modalCancel.addEventListener('click', hideModal);
  modalSave.addEventListener('click', handleSaveAbbreviation);
  
  document.querySelectorAll('.abbreviations-table th.sortable').forEach(header => { // Seletor mais específico
    header.addEventListener('click', () => {
      const column = header.getAttribute('data-sort');
      handleSort(column);
    });
  });
  
  categorySelect.addEventListener('change', function() {
    customCategoryInput.style.display = (this.value === 'Personalizada') ? 'block' : 'none';
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
  rulesModalClose.addEventListener('click', hideRulesModal);
  rulesModalCancelBtn.addEventListener('click', () => {
    if (!ruleForm.classList.contains('hidden')) {
      ruleForm.classList.add('hidden'); // Se o formulário estiver aberto, apenas o fecha
      addRuleBtn.classList.remove('hidden'); // Mostra o botão "+ Adicionar Regra" novamente
    } else {
      hideRulesModal(); // Se o formulário estiver fechado, fecha o modal
    }
  });
  addRuleBtn.addEventListener('click', handleShowRuleForm);
  ruleTypeSelect.addEventListener('change', handleRuleTypeChange);
  rulesModalSaveBtn.addEventListener('click', handleSaveRule);

  // Listener para o botão de adicionar sub-condição
  if (addSubConditionBtn) { // Verifica se o elemento existe
    addSubConditionBtn.addEventListener('click', handleAddSubCondition);
  }
  
  // Listener para remover sub-condições (delegação de evento)
  if (subConditionsList) { // Verifica se o elemento existe
    subConditionsList.addEventListener('click', (event) => {
      if (event.target.classList.contains('remove-sub-condition-btn')) {
        event.target.closest('.sub-condition-item').remove();
      }
      if (event.target.classList.contains('sub-condition-type')) {
          renderSubConditionFields(event.target.value, event.target.closest('.sub-condition-item').querySelector('.sub-condition-fields'));
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
    let needsReload = false;
    if (message.type === 'ABBREVIATIONS_UPDATED') {
      needsReload = true;
    } else if (message.type === 'INITIAL_SEED_COMPLETE') {
      if (!initialLoadDoneBySeedMessage) {
          needsReload = true;
          initialLoadDoneBySeedMessage = true;
      }
    }

    if (needsReload) {
      const performReload = async () => {
        await loadAbbreviationsAndRender(); // Isso recarregará as abreviações, que incluem as regras
        await loadCategories();
        // Se o modal de regras estiver aberto para uma abreviação específica, atualize sua lista de regras
        if (currentAbbreviationIdForRules && !rulesModalContainer.classList.contains('hidden')) {
          loadAndDisplayRules(currentAbbreviationIdForRules);
        }
      };
      performReload();
    }
    return true; 
  });
}

/**
 * Load abbreviations from the database
 */
async function loadAbbreviations() {
  try {
    abbreviations = await window.TextExpanderDB.getAllAbbreviations();
    filterAbbreviations(); // Chama filter, sort e render
  } catch (error) {
    console.error('Erro ao carregar abreviações:', error);
    abbreviationsList.innerHTML = `
      <tr>
        <td colspan="7" class="loading">Erro ao carregar abreviações. Por favor, tente novamente.</td>
      </tr>
    `; // Colspan atualizado
  }
}

/**
 * Load categories from the database and populate the sidebar
 */
async function loadCategories() {
  try {
    const categories = await window.TextExpanderDB.getAllCategories();
    
    // Limpa apenas as categorias dinâmicas, mantendo "Todas"
    const allCategoryItem = categoryList.querySelector('[data-category="all"]');
    categoryList.innerHTML = ''; // Limpa tudo
    if (allCategoryItem) categoryList.appendChild(allCategoryItem); // Readiciona "Todas"

    categories.forEach(category => {
      const li = document.createElement('li');
      li.className = 'category-item';
      li.setAttribute('data-category', category);
      li.textContent = category;
      li.addEventListener('click', () => handleCategoryFilter(category));
      categoryList.appendChild(li);
    });
    
    // Atualiza o select de categorias no modal principal
    const existingCustomOptions = Array.from(categorySelect.options).filter(opt => !['Comum', 'Pessoal', 'Trabalho', 'Personalizada'].includes(opt.value));
    existingCustomOptions.forEach(opt => categorySelect.removeChild(opt));
    
    const personalizadaOption = categorySelect.querySelector('option[value="Personalizada"]');
    categories.forEach(category => {
      if (!['Comum', 'Pessoal', 'Trabalho'].includes(category)) { // Adiciona se não for uma das fixas, exceto "Personalizada" (que já existe)
        if (!categorySelect.querySelector(`option[value="${category}"]`)) {
          const option = document.createElement('option');
          option.value = category;
          option.textContent = category;
          if (personalizadaOption) {
            categorySelect.insertBefore(option, personalizadaOption);
          } else {
            categorySelect.appendChild(option);
          }
        }
      }
    });
    
    customCategoryInput.style.display = 'none';
  } catch (error) {
    console.error('Erro ao carregar categorias:', error);
  }
}

/**
 * Filter abbreviations based on search and category
 */
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

/**
 * Sort abbreviations based on the current sort column and direction
 */
function sortAbbreviations() {
  const { column, direction } = currentSort;
  
  filteredAbbreviations.sort((a, b) => {
    let valueA = a[column];
    let valueB = b[column];
    
    if (column === 'lastUsed') {
      valueA = valueA ? new Date(valueA).getTime() : 0; // Use getTime() for comparison
      valueB = valueB ? new Date(valueB).getTime() : 0;
    } else if (column === 'usageCount') {
        valueA = Number(valueA) || 0;
        valueB = Number(valueB) || 0;
    } else if (typeof valueA === 'string') {
      valueA = valueA.toLowerCase();
      valueB = valueB.toLowerCase();
    }
    
    if (valueA === valueB) {
      // Secondary sort by abbreviation text to ensure stable sort
      return a.abbreviation.toLowerCase().localeCompare(b.abbreviation.toLowerCase());
    }
    
    if (direction === 'asc') {
      return valueA < valueB ? -1 : 1;
    } else {
      return valueA > valueB ? -1 : 1;
    }
  });
}

/**
 * Render abbreviations in the table
 */
function renderAbbreviations() {
  if (filteredAbbreviations.length === 0) {
    abbreviationsList.innerHTML = `
      <tr>
        <td colspan="7" class="loading">Nenhuma abreviação encontrada.</td>
      </tr>
    `; // Colspan atualizado
    return;
  }
  
  abbreviationsList.innerHTML = '';
  
  filteredAbbreviations.forEach(abbr => {
    const row = document.createElement('tr');
    let lastUsedText = 'Sem uso';
    if (abbr.lastUsed) {
      try {
        const date = new Date(abbr.lastUsed);
        lastUsedText = date.toLocaleString('pt-BR'); // Formato brasileiro
      } catch (e) {
        lastUsedText = abbr.lastUsed; // Fallback se a data for inválida
      }
    }
    
    row.innerHTML = `
      <td>${abbr.abbreviation}</td>
      <td>${abbr.expansion}</td>
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
    const rulesBtnElement = row.querySelector('.rules'); // Novo botão
    
    editBtnElement.addEventListener('click', () => handleEditAbbreviation(abbr));
    deleteBtnElement.addEventListener('click', () => handleDeleteAbbreviation(abbr.abbreviation));
    rulesBtnElement.addEventListener('click', () => showRulesModal(abbr.abbreviation)); // Listener para o novo botão
    
    abbreviationsList.appendChild(row);
  });
  
  // Atualiza cabeçalhos da tabela para indicar ordenação
  document.querySelectorAll('.abbreviations-table th.sortable').forEach(header => {
    header.classList.remove('sorted-asc', 'sorted-desc');
    const column = header.getAttribute('data-sort');
    if (column === currentSort.column) {
      header.classList.add(`sorted-${currentSort.direction}`);
    }
  });
}


/**
 * Handle search input
 */
function handleSearch() {
  filterAbbreviations();
}

/**
 * Handle category filter
 * @param {string} category The category to filter by
 */
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

/**
 * Handle sorting
 * @param {string} column The column to sort by
 */
function handleSort(column) {
  if (currentSort.column === column) {
    currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
  } else {
    currentSort.column = column;
    currentSort.direction = 'asc';
  }
  filterAbbreviations();
}

/**
 * Toggle extension enabled state
 */
function handleToggleEnabled() {
  isEnabled = enabledToggle.checked;
  statusText.textContent = isEnabled ? 'Habilitado' : 'Disabilitado';
  chrome.storage.sync.set({ enabled: isEnabled });
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, { 
        type: 'TOGGLE_ENABLED', 
        enabled: isEnabled 
      }).catch(err => {});
    });
  });
}


/**
 * Show the modal for adding or editing an abbreviation
 */
function showModal(abbr = null) {
  modalContainer.classList.remove('hidden');
  
  if (abbr) {
    modalTitle.textContent = 'Editar Abreviação';
    abbreviationInput.value = abbr.abbreviation;
    abbreviationInput.readOnly = true;
    expansionInput.value = abbr.expansion;
    caseSensitiveCheckbox.checked = abbr.caseSensitive || false;
    enabledCheckbox.checked = abbr.enabled !== false; // Default to true if undefined
    currentEditId = abbr.abbreviation;
    
    // Lógica para selecionar categoria ou exibir campo personalizado
    const standardCategories = ['Comum', 'Pessoal', 'Trabalho'];
    if (abbr.category && !standardCategories.includes(abbr.category) && !categorySelect.querySelector(`option[value="${abbr.category}"]`)) {
      // Categoria personalizada não listada (nova ou importada)
      categorySelect.value = 'Personalizada';
      customCategoryInput.value = abbr.category;
      customCategoryInput.style.display = 'block';
    } else if (abbr.category && categorySelect.querySelector(`option[value="${abbr.category}"]`)) {
      // Categoria listada (padrão ou personalizada já existente no select)
      categorySelect.value = abbr.category;
      customCategoryInput.style.display = (abbr.category === 'Personalizada' && !customCategoryInput.value) ? 'block' : 'none';
      if(categorySelect.value === 'Personalizada' && !customCategoryInput.value && abbr.category !== 'Personalizada') {
        customCategoryInput.value = abbr.category; // Se for uma personalizada existente
      } else if (categorySelect.value !== 'Personalizada') {
        customCategoryInput.value = '';
      }
    } else { // Categoria padrão ou não definida
      categorySelect.value = abbr.category || 'Comum';
      customCategoryInput.style.display = 'none';
      customCategoryInput.value = '';
    }

  } else { // Adicionando nova abreviação
    modalTitle.textContent = 'Adicionar Nova Abreviação';
    abbreviationInput.value = '';
    abbreviationInput.readOnly = false;
    expansionInput.value = '';
    categorySelect.value = 'Comum';
    caseSensitiveCheckbox.checked = false;
    enabledCheckbox.checked = true;
    currentEditId = null;
    customCategoryInput.style.display = 'none';
    customCategoryInput.value = '';
  }
  abbreviationInput.focus();
}

/**
 * Hide the modal for abbreviations
 */
function hideModal() {
  modalContainer.classList.add('hidden');
  currentEditId = null;
}

/**
 * Handle saving an abbreviation
 */
async function handleSaveAbbreviation() {
  const abbreviationVal = abbreviationInput.value.trim();
  const expansionVal = expansionInput.value.trim();
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
    
    if (currentEditId) { // Editing existing
      const existingAbbr = abbreviations.find(a => a.abbreviation === currentEditId);
      if (existingAbbr) {
        // Preserve fields not edited in this form
        abbrData.createdAt = existingAbbr.createdAt;
        abbrData.lastUsed = existingAbbr.lastUsed;
        abbrData.usageCount = existingAbbr.usageCount;
        // As regras (rules) são gerenciadas separadamente e já estão na abreviação se existirem.
        // A função updateAbbreviation em db.js não deve mexer nas regras diretamente.
      }
    } else { // Adding new
      abbrData.createdAt = new Date().toISOString();
      abbrData.lastUsed = null;
      abbrData.usageCount = 0;
      abbrData.rules = []; // Nova abreviação começa sem regras
    }
    
    // A função addAbbreviation ou updateAbbreviation do db.js é usada.
    // Elas já notificam o service worker sobre 'ABBREVIATIONS_UPDATED'.
    if (currentEditId) {
        await window.TextExpanderDB.updateAbbreviation(abbrData);
    } else {
        // Verifica se a abreviação já existe antes de adicionar
        const existing = abbreviations.find(a => a.abbreviation.toLowerCase() === abbreviationVal.toLowerCase());
        if (existing) {
            alert(`A abreviação "${abbreviationVal}" já existe.`);
            return;
        }
        await window.TextExpanderDB.addAbbreviation(abbrData);
    }
    
    // Não é necessário chamar loadAbbreviations e loadCategories aqui,
    // pois o listener da mensagem 'ABBREVIATIONS_UPDATED' já fará isso.
    hideModal();
    // Se a categoria era nova, loadCategories será chamado pelo listener e a atualizará.
  } catch (error) {
    console.error('Erro ao salvar abreviação:', error);
    if (error.message && error.message.toLowerCase().includes('key already exists')) {
        alert(`Erro: A abreviação "${abbreviationVal}" já existe.`);
    } else {
        alert('Erro ao salvar abreviação. Por favor, tente novamente.');
    }
  }
}


/**
 * Handle editing an abbreviation
 * @param {Object} abbr The abbreviation to edit
 */
function handleEditAbbreviation(abbr) {
  showModal(abbr);
}

/**
 * Handle deleting an abbreviation
 * @param {string} abbreviationKey The abbreviation to delete
 */
async function handleDeleteAbbreviation(abbreviationKey) {
  if (confirm(`Tem certeza que deseja excluir a abreviação "${abbreviationKey}" e todas as suas regras associadas?`)) {
    try {
      // Primeiro, exclui todas as regras associadas a esta abreviação
      const abbrToDelete = abbreviations.find(a => a.abbreviation === abbreviationKey);
      if (abbrToDelete && abbrToDelete.rules && abbrToDelete.rules.length > 0) {
        for (const rule of abbrToDelete.rules) {
          await window.TextExpanderDB.deleteExpansionRule(rule.id); //
        }
      }
      // Depois, exclui a abreviação
      await window.TextExpanderDB.deleteAbbreviation(abbreviationKey); //
      // A atualização da lista será feita pelo listener 'ABBREVIATIONS_UPDATED'
    } catch (error) {
      console.error('Erro ao excluir abreviação:', error);
      alert('Erro ao excluir abreviação. Por favor, tente novamente.');
    }
  }
}


// --- Funções para o Modal de Regras ---

/**
 * Show the modal for managing rules for a specific abbreviation
 * @param {string} abbreviationId The ID of the abbreviation
 */
function showRulesModal(abbreviationId) {
  currentAbbreviationIdForRules = abbreviationId;
  rulesModalTitle.textContent = `Regras para "${abbreviationId}"`;
  rulesModalContainer.classList.remove('hidden');
  ruleForm.classList.add('hidden'); 
  addRuleBtn.classList.remove('hidden'); 
  currentEditingRuleId = null; 
  resetRuleForm(); // Garante que o formulário é resetado
  loadAndDisplayRules(abbreviationId);
}

/**
 * Hide the rules modal
 */
function hideRulesModal() {
  rulesModalContainer.classList.add('hidden');
  currentAbbreviationIdForRules = null;
  currentEditingRuleId = null;
  // Limpa o formulário de regras
  resetRuleForm();
}

/**
 * Load and display rules for the current abbreviation in the rules modal
 * @param {string} abbreviationId
 */
function loadAndDisplayRules(abbreviationId) {
  const abbreviation = abbreviations.find(abbr => abbr.abbreviation === abbreviationId);
  rulesListElement.innerHTML = ''; 

  if (!abbreviation || !abbreviation.rules || abbreviation.rules.length === 0) {
    rulesListElement.innerHTML = '<p>Nenhuma regra definida para esta abreviação.</p>';
    return;
  }

  // Ordenar regras por prioridade para exibição (opcional, mas pode ser útil)
  const sortedRules = [...abbreviation.rules].sort((a, b) => (b.priority || 0) - (a.priority || 0));

  sortedRules.forEach(rule => {
    const ruleItem = document.createElement('div');
    ruleItem.className = 'rule-item';
    let details = '';
    switch (rule.type) {
      case 'dayOfWeek':
        const daysMap = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
        details = `Dias: ${rule.days ? rule.days.map(d => daysMap[d]).join(', ') : 'N/A'}`;
        break;
      case 'timeRange':
        details = `Horário: ${String(rule.startHour).padStart(2, '0')}:00 - ${String(rule.endHour).padStart(2, '0')}:59`;
        break;
      case 'domain':
        details = `Domínios: ${rule.domains ? rule.domains.join(', ') : 'N/A'}`;
        break;
      case 'specialDate': // EXIBIR NOVA REGRA
        details = `Data Especial: ${String(rule.day).padStart(2, '0')}/${String(rule.month).padStart(2, '0')}`;
        break;
      case 'combined': // EXIBIR REGRA COMBINADA ATUALIZADA
        let subConditionsText = (rule.subConditions && rule.subConditions.length > 0)
          ? rule.subConditions.map(sc => 
              `${sc.negated ? 'NÃO ' : ''}(${sc.conditionType}${getDetailForSubType(sc)})`
            ).join(` ${rule.logicalOperator} `)
          : 'Nenhuma sub-condição';
        details = `Combinada (${rule.logicalOperator || 'AND'}): ${subConditionsText}`;
        break;
      default:
        details = `Tipo: ${rule.type}`;
    }

    // MODIFICAÇÃO AQUI: Adicionar os botões de ação ao innerHTML
    ruleItem.innerHTML = `
      <div class="rule-header">
        <span class="rule-type">Prioridade: ${rule.priority || 0} - ${rule.type.charAt(0).toUpperCase() + rule.type.slice(1)}</span>
        <div class="rule-actions">
          <button class="action-btn edit-rule" title="Editar Regra">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 20h9"></path>
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
            </svg>
          </button>
          <button class="action-btn delete-rule" title="Excluir Regra">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 6h18"></path>
              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      </div>
      <div class="rule-details">${details}</div>
      <div class="rule-expansion">Expansão: <strong>${rule.expansion}</strong></div>
    `;
    // FIM DA MODIFICAÇÃO

    rulesListElement.appendChild(ruleItem);
    
    // Estas linhas agora devem funcionar, pois '.edit-rule' e '.delete-rule' existem
    const editButton = ruleItem.querySelector('.edit-rule');
    if (editButton) { // Adicionar verificação para segurança
        editButton.addEventListener('click', () => handleEditRule(rule));
    }

    const deleteButton = ruleItem.querySelector('.delete-rule');
    if (deleteButton) { // Adicionar verificação para segurança
        deleteButton.addEventListener('click', () => handleDeleteRule(rule.id));
    }
  });
}

// Função auxiliar para exibir detalhes de sub-condições
function getDetailForSubType(subCond) {
    switch(subCond.conditionType) {
        case 'dayOfWeek': return `: ${subCond.days ? subCond.days.join(',') : ''}`;
        case 'timeRange': return `: ${subCond.startHour}-${subCond.endHour}`;
        case 'domain': return `: ${subCond.domains ? subCond.domains.join(', ') : ''}`;
        case 'specialDate': return `: ${subCond.day}/${subCond.month}`;
        default: return '';
    }
}

/**
 * Handles showing the form to add/edit a rule.
 */
function handleShowRuleForm() {
  currentEditingRuleId = null; // Garante que estamos adicionando, não editando
  resetRuleForm();
  ruleForm.classList.remove('hidden');
  addRuleBtn.classList.add('hidden'); // Esconde o botão "+ Adicionar Regra"
  ruleForm.querySelector('h3').textContent = 'Nova Regra de Expansão';
  handleRuleTypeChange(); // Configura a visibilidade inicial das seções do formulário
  ruleExpansionInput.focus();
}

/**
 * Resets the rule form to its default state.
 */
function resetRuleForm() {
  ruleForm.reset(); 
  dayCheckboxes.forEach(cb => cb.checked = false);
  domainsTextarea.value = '';
  startHourInput.value = '';
  endHourInput.value = '';
  specialMonthInput.value = ''; // Resetar novo campo
  specialDayInput.value = '';   // Resetar novo campo
  rulePriorityInput.value = 0;
  ruleExpansionInput.value = '';
  
  // Limpar sub-condições
  subConditionsList.innerHTML = '';
  combinedOperatorSelect.value = 'AND'; // Resetar operador combinado

  handleRuleTypeChange(); // Ajusta a visibilidade
}


/**
 * Handles changes in the rule type select element to show/hide relevant sections.
 */
function handleRuleTypeChange() {
  const type = ruleTypeSelect.value;
  daysSection.classList.toggle('hidden', type !== 'dayOfWeek');
  timeSection.classList.toggle('hidden', type !== 'timeRange');
  domainSection.classList.toggle('hidden', type !== 'domain');
  specialDateSection.classList.toggle('hidden', type !== 'specialDate'); // Mostrar/ocultar nova seção
  combinedRuleSection.classList.toggle('hidden', type !== 'combined');   // Mostrar/ocultar seção combinada

  // Se for combinado e não houver sub-condições, adicione uma inicial
  if (type === 'combined' && subConditionsList.children.length === 0) {
    handleAddSubCondition();
  }
}

/**
 * Handle saving a new or edited rule.
 */
async function handleSaveRule() {
  if (!currentAbbreviationIdForRules) {
    console.error("ID da abreviação não definido para salvar a regra.");
    return;
  }

  const type = ruleTypeSelect.value;
  const expansion = ruleExpansionInput.value.trim();
  const priority = parseInt(rulePriorityInput.value, 10) || 0;

  if (!expansion) {
    alert('Por favor, defina o texto de expansão para a regra.');
    ruleExpansionInput.focus();
    return;
  }

  const ruleData = {
    abbreviationId: currentAbbreviationIdForRules,
    type,
    expansion,
    priority,
  };

  if (currentEditingRuleId) {
    ruleData.id = currentEditingRuleId;
  }

  switch (type) {
    case 'dayOfWeek':
      ruleData.days = Array.from(dayCheckboxes).filter(cb => cb.checked).map(cb => parseInt(cb.value, 10));
      if (ruleData.days.length === 0) {
        alert('Por favor, selecione pelo menos um dia da semana.');
        return;
      }
      break;
    case 'timeRange':
      const startHour = parseInt(startHourInput.value, 10);
      const endHour = parseInt(endHourInput.value, 10);
      if (isNaN(startHour) || isNaN(endHour) || startHour < 0 || startHour > 23 || endHour < 0 || endHour > 23 || startHour > endHour) {
        alert('Por favor, insira um intervalo de horário válido (0-23 e início <= fim).');
        return;
      }
      ruleData.startHour = startHour;
      ruleData.endHour = endHour;
      break;
    case 'domain':
      ruleData.domains = domainsTextarea.value.split('\n').map(d => d.trim()).filter(d => d.length > 0);
      if (ruleData.domains.length === 0) {
        alert('Por favor, insira pelo menos um domínio.');
        domainsTextarea.focus();
        return;
      }
      break;
    case 'specialDate': // SALVAR NOVA REGRA
      const month = parseInt(specialMonthInput.value, 10);
      const day = parseInt(specialDayInput.value, 10);
      if (isNaN(month) || month < 1 || month > 12 || isNaN(day) || day < 1 || day > 31) {
        alert('Por favor, insira um Mês (1-12) e Dia (1-31) válidos para a Data Especial.');
        return;
      }
      ruleData.month = month;
      ruleData.day = day;
      break;
    case 'combined': // SALVAR REGRA COMBINADA ATUALIZADA
      ruleData.logicalOperator = combinedOperatorSelect.value;
      ruleData.subConditions = [];
      const subConditionElements = subConditionsList.querySelectorAll('.sub-condition-item');
      if (subConditionElements.length === 0) {
        alert('Para regras combinadas, adicione pelo menos uma sub-condição.');
        return;
      }
      for (const item of subConditionElements) {
        const subType = item.querySelector('.sub-condition-type').value;
        const subFieldsContainer = item.querySelector('.sub-condition-fields');
        const subNegated = item.querySelector('.sub-condition-negate').checked;
        const subCondData = { conditionType: subType, negated: subNegated };

        switch (subType) {
          case 'dayOfWeek':
            subCondData.days = Array.from(subFieldsContainer.querySelectorAll('input[type="checkbox"]:checked')).map(cb => parseInt(cb.value, 10));
            if (subCondData.days.length === 0) { alert('Sub-condição "Dia da Semana" precisa de pelo menos um dia.'); return; }
            break;
          case 'timeRange':
            const subStartHour = parseInt(subFieldsContainer.querySelector('.sub-start-hour').value, 10);
            const subEndHour = parseInt(subFieldsContainer.querySelector('.sub-end-hour').value, 10);
            if (isNaN(subStartHour) || isNaN(subEndHour) || subStartHour < 0 || subStartHour > 23 || subEndHour < 0 || subEndHour > 23 || subStartHour > subEndHour) {
              alert('Sub-condição de horário inválida.'); return;
            }
            subCondData.startHour = subStartHour;
            subCondData.endHour = subEndHour;
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
            subCondData.month = subMonth;
            subCondData.day = subDay;
            break;
          default:
            alert(`Tipo de sub-condição desconhecido: ${subType}`); return;
        }
        ruleData.subConditions.push(subCondData);
      }
      break;
  }

  try {
    if (currentEditingRuleId) {
      await window.TextExpanderDB.updateExpansionRule(ruleData);
    } else {
      await window.TextExpanderDB.addExpansionRule(ruleData);
    }
    ruleForm.classList.add('hidden');
    addRuleBtn.classList.remove('hidden');
    currentEditingRuleId = null;
    resetRuleForm(); // Isso já chama handleRuleTypeChange
    // A atualização da UI (loadAndDisplayRules, loadAbbreviationsAndRender) é feita pelo listener 'ABBREVIATIONS_UPDATED'
  } catch (error) {
    console.error('Erro ao salvar regra:', error);
    alert('Erro ao salvar regra. Verifique os dados e tente novamente.');
  }
}


/**
 * Handle editing a specific rule.
 * @param {Object} rule The rule object to edit.
 */
function handleEditRule(rule) {
  currentEditingRuleId = rule.id;
  ruleForm.querySelector('h3').textContent = 'Editar Regra';
  ruleTypeSelect.value = rule.type;
  
  ruleExpansionInput.value = rule.expansion;
  rulePriorityInput.value = rule.priority || 0;
  
  // Limpar sub-condições anteriores antes de preencher
  subConditionsList.innerHTML = ''; 

  handleRuleTypeChange(); // Ajusta a visibilidade das seções principais

  switch (rule.type) {
    case 'dayOfWeek':
      dayCheckboxes.forEach(cb => {
        cb.checked = rule.days && rule.days.includes(parseInt(cb.value, 10));
      });
      break;
    case 'timeRange':
      startHourInput.value = rule.startHour !== undefined ? rule.startHour : '';
      endHourInput.value = rule.endHour !== undefined ? rule.endHour : '';
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
        rule.subConditions.forEach(subCond => {
          const subConditionElement = handleAddSubCondition(subCond); // Passa dados para popular
        });
      } else {
        // Adiciona um item vazio se não houver subcondições (ou como preferir)
        handleAddSubCondition();
      }
      break;
  }
  addRuleBtn.classList.add('hidden');
  ruleForm.classList.remove('hidden');
  ruleExpansionInput.focus();
}

/**
 * Handle deleting a specific rule.
 * @param {number} ruleId The ID of the rule to delete.
 */
async function handleDeleteRule(ruleId) {
  if (confirm('Tem certeza que deseja excluir esta regra?')) {
    try {
      await window.TextExpanderDB.deleteExpansionRule(ruleId); //
      // A atualização da lista de abreviações (que contém as regras) e da lista de regras no modal
      // será feita pelo listener da mensagem 'ABBREVIATIONS_UPDATED'.
      // loadAndDisplayRules(currentAbbreviationIdForRules); // Não precisa mais.
      // await loadAbbreviationsAndRender(); // Também não precisa mais.
    } catch (error) {
      console.error('Erro ao excluir regra:', error);
      alert('Erro ao excluir regra.');
    }
  }
}

// --- Funções para Gerenciar Sub-condições Dinamicamente ---
let subConditionIdCounter = 0; // Para IDs únicos nos elementos do formulário se necessário

function handleAddSubCondition(existingSubCondData = null) {
  const clone = subConditionTemplate.content.cloneNode(true);
  const subConditionItem = clone.querySelector('.sub-condition-item');
  const typeSelect = subConditionItem.querySelector('.sub-condition-type');
  const fieldsContainer = subConditionItem.querySelector('.sub-condition-fields');
  const negateCheckbox = subConditionItem.querySelector('.sub-condition-negate');

  // Gerar IDs únicos para labels e inputs se for interagir com labels
  // const newIdSuffix = subConditionIdCounter++;
  // typeSelect.id = `sub-condition-type-${newIdSuffix}`;
  // ... (fazer o mesmo para outros inputs e seus labels)

  if (existingSubCondData) {
    typeSelect.value = existingSubCondData.conditionType;
    negateCheckbox.checked = existingSubCondData.negated || false;
    renderSubConditionFields(existingSubCondData.conditionType, fieldsContainer, existingSubCondData);
  } else {
    renderSubConditionFields(typeSelect.value, fieldsContainer, null); // Renderiza campos para o tipo padrão
  }
  
  subConditionsList.appendChild(subConditionItem);
  return subConditionItem; // Retorna o elemento para que handleEditRule possa usá-lo
}

function renderSubConditionFields(type, container, data = null) {
  container.innerHTML = ''; // Limpa campos antigos
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
        <label>Horário:</label>
        <div class="time-range">
          <input type="number" class="sub-start-hour" min="0" max="23" placeholder="Início" value="${data && data.startHour !== undefined ? data.startHour : ''}">
          <span>até</span>
          <input type="number" class="sub-end-hour" min="0" max="23" placeholder="Fim" value="${data && data.endHour !== undefined ? data.endHour : ''}">
        </div>`;
      break;
    case 'domain':
      content = `
        <label for="sub-domains">Domínios (um por linha):</label>
        <textarea class="sub-domains" rows="2" placeholder="exemplo.com">${data && data.domains ? data.domains.join('\n') : ''}</textarea>`;
      break;
    case 'specialDate':
      content = `
        <label>Data Especial (Anual):</label>
        <div class="date-range">
          <input type="number" class="sub-special-month" min="1" max="12" placeholder="Mês" value="${data && data.month !== undefined ? data.month : ''}">
          <span>/</span>
          <input type="number" class="sub-special-day" min="1" max="31" placeholder="Dia" value="${data && data.day !== undefined ? data.day : ''}">
        </div>`;
      break;
  }
  container.innerHTML = content;
}

/**
 * Show the import modal
 */
function showImportModal() {
  importModal.classList.remove('hidden');
  importFile.value = ''; // Limpa seleção de arquivo anterior
}

/**
 * Hide the import modal
 */
function hideImportModal() {
  importModal.classList.add('hidden');
}

/**
 * Handle importing abbreviations
 */
async function handleImport() {
  const file = importFile.files[0];
  if (!file) {
    alert('Por favor, selecione um arquivo para importar.');
    return;
  }
  
  try {
    const text = await file.text();
    const importData = JSON.parse(text);
    
    if (!Array.isArray(importData)) {
      alert('Formato de arquivo de importação inválido. Esperado um array de abreviações.');
      return;
    }
    
    // Validação básica de cada abreviação
    const validAbbreviations = importData.filter(abbr => 
      abbr && typeof abbr === 'object' && 
      typeof abbr.abbreviation === 'string' && abbr.abbreviation.trim() !== '' &&
      typeof abbr.expansion === 'string' // Não precisa ser não vazio
    ).map(abbr => ({ // Garante estrutura mínima e defaults
        abbreviation: abbr.abbreviation.trim(),
        expansion: abbr.expansion,
        category: typeof abbr.category === 'string' ? abbr.category : 'Imported',
        caseSensitive: typeof abbr.caseSensitive === 'boolean' ? abbr.caseSensitive : false,
        enabled: typeof abbr.enabled === 'boolean' ? abbr.enabled : true,
        createdAt: abbr.createdAt || new Date().toISOString(),
        lastUsed: abbr.lastUsed || null,
        usageCount: Number(abbr.usageCount) || 0,
        rules: Array.isArray(abbr.rules) ? abbr.rules : [] // Importa regras também, se existirem
    }));
    
    if (validAbbreviations.length === 0) {
      alert('Nenhuma abreviação válida encontrada no arquivo de importação.');
      return;
    }
    
    if (importReplace.checked) {
      await window.TextExpanderDB.clearAllAbbreviations(); // Isso também deve limpar as regras se o DB for projetado assim ou precisará de uma função para limpar regras.
      // Se clearAllAbbreviations não limpa regras, precisaria de uma lógica adicional aqui.
      // Pelo db.js, clearAllAbbreviations só limpa o STORE_NAME ('abbreviations').
      // Para uma substituição completa, as regras também precisariam ser limpas.
      // Vamos assumir por agora que o foco é nas abreviações.
      // Se for necessário limpar regras:
      // const allRules = await window.TextExpanderDB.getAllRules(); // Função hipotética ou adaptação
      // for (const rule of allRules) { await window.TextExpanderDB.deleteExpansionRule(rule.id); }
    }
    
    const importCount = await window.TextExpanderDB.importAbbreviations(validAbbreviations); 
    // A função importAbbreviations em db.js também precisa ser capaz de lidar com a importação de regras junto com as abreviações.
    // Atualmente, ela apenas adiciona/atualiza abreviações. Para importar regras, precisaria de uma lógica adicional lá
    // ou iterar aqui e adicionar as regras para cada abreviação importada.

    // Se as regras foram importadas com as abreviações (ex: no objeto abbr.rules):
    for (const importedAbbr of validAbbreviations) {
        if (importedAbbr.rules && importedAbbr.rules.length > 0) {
            for (let rule of importedAbbr.rules) {
                // A regra importada pode não ter um ID ou o ID pode colidir.
                // O DB vai gerar um novo ID ao adicionar.
                // Precisamos garantir que abbreviationId está correto.
                const newRule = {...rule, abbreviationId: importedAbbr.abbreviation};
                delete newRule.id; // Remove o ID antigo para que o DB gere um novo
                try {
                    await window.TextExpanderDB.addExpansionRule(newRule);
                } catch (e) {
                    console.warn(`Falha ao importar regra para ${importedAbbr.abbreviation}:`, e);
                }
            }
        }
    }
    // A mensagem 'ABBREVIATIONS_UPDATED' será disparada por importAbbreviations e addExpansionRule.
    // O listener global cuidará da atualização da UI.
    hideImportModal();
    alert(`Importadas ${importCount} abreviações com sucesso.`);
     // E potencialmente X regras. A mensagem pode ser melhorada.
  } catch (error) {
    console.error('Erro ao importar abreviações:', error);
    alert('Erro ao importar abreviações. Verifique o formato do arquivo e tente novamente.');
  }
}


/**
 * Handle exporting abbreviations
 */
async function handleExport() { // Modificado para async para buscar dados atualizados
  try {
    // Busca os dados mais recentes, incluindo regras aninhadas
    const currentAbbreviationsWithRules = await window.TextExpanderDB.getAllAbbreviations();
    
    const exportData = JSON.stringify(currentAbbreviationsWithRules, null, 2);
    const blob = new Blob([exportData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sote-export-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Erro ao exportar abreviações:', error);
    alert('Erro ao exportar abreviações. Por favor, tente novamente.');
  }
}


/**
 * Show the settings modal
 */
function showSettingsModal() {
  settingsModal.classList.remove('hidden');
  loadSettings(); // Carrega as configurações atuais ao abrir o modal
}

/**
 * Hide the settings modal
 */
function hideSettingsModal() {
  settingsModal.classList.add('hidden');
}

/**
 * Load settings from storage
 */
function loadSettings() {
  chrome.storage.sync.get(['triggerSpace', 'triggerTab', 'triggerEnter', 'enableUndo'], (result) => {
    triggerSpace.checked = result.triggerSpace !== false; // Default true
    triggerTab.checked = result.triggerTab !== false;   // Default true
    triggerEnter.checked = result.triggerEnter !== false; // Default true
    settingUndo.checked = result.enableUndo !== false;   // Default true
  });
}

/**
 * Handle saving settings
 */
function handleSaveSettings() {
  const settingsToSave = {
    triggerSpace: triggerSpace.checked,
    triggerTab: triggerTab.checked,
    triggerEnter: triggerEnter.checked,
    enableUndo: settingUndo.checked
  };
  chrome.storage.sync.set(settingsToSave, () => {
    hideSettingsModal();
    alert('Configurações salvas com sucesso.');
    // Envia mensagem para content scripts atualizarem seus gatilhos, se necessário
    chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, { 
            type: 'SETTINGS_UPDATED', 
            settings: settingsToSave 
          }).catch(err => {});
        });
    });
  });
}


/**
 * Handle clearing all data (abbreviations and rules)
 */
async function handleClearData() {
  if (confirm('Tem certeza que deseja apagar TODAS as abreviações e TODAS as regras? Esta ação não pode ser desfeita.')) {
    try {
      // Limpa primeiro todas as regras
      const db = await window.TextExpanderDB.openDatabase(); // Reutiliza a função de abertura do db.js
      const transactionRules = db.transaction(RULES_STORE, 'readwrite'); // RULES_STORE de db.js
      const rulesStore = transactionRules.objectStore(RULES_STORE);
      const clearRulesRequest = rulesStore.clear();
      
      await new Promise((resolve, reject) => {
        clearRulesRequest.onsuccess = resolve;
        clearRulesRequest.onerror = reject;
      });
      
      // Depois limpa todas as abreviações
      await window.TextExpanderDB.clearAllAbbreviations(); // Esta função já existe e envia 'ABBREVIATIONS_UPDATED'
      
      // O listener de 'ABBREVIATIONS_UPDATED' vai recarregar e renderizar as listas vazias.
      hideSettingsModal();
      alert('Todos os dados foram apagados.');
    } catch (error) {
      console.error('Erro ao limpar dados:', error);
      alert('Erro ao limpar dados. Por favor, tente novamente.');
    }
  }
}


document.addEventListener('DOMContentLoaded', init);