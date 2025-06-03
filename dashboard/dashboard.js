// DOM Elements
// Header
const enabledToggle = document.getElementById('enabled-toggle');
const statusText = document.getElementById('status-text');

// Sidebar
const categoryList = document.getElementById('category-list');

// Content
const searchInput = document.getElementById('search-input');
const abbreviationsList = document.getElementById('abbreviations-list');
const addBtn = document.getElementById('add-btn');

// Modal
const modalContainer = document.getElementById('modal-container');
const modalTitle = document.getElementById('modal-title');
const modalClose = document.getElementById('modal-close');
const modalCancel = document.getElementById('modal-cancel');
const modalSave = document.getElementById('modal-save');
// const abbreviationForm = document.getElementById('abbreviation-form'); // Already declared by getElementById
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

/**
 * State
 */
let abbreviations = [];
let filteredAbbreviations = [];
let currentCategory = 'All';
let currentSort = {
  column: 'abbreviation',
  direction: 'asc'
};
let currentEditId = null;
let isEnabled = true;

/**
 * Initialize the dashboard
 */
async function init() {
  // Ensure TextExpanderDB is loaded
  if (!window.TextExpanderDB || typeof window.TextExpanderDB.getAllAbbreviations !== 'function') {
    console.error("TextExpanderDB não foi inicializado corretamente para dashboard.js.");
    abbreviationsList.innerHTML = `<tr><td colspan="6" class="loading">Erro ao inicializar. Verifique o console.</td></tr>`;
    return;
  }

  await loadAbbreviations();
  await loadCategories(); // Popula categorias dinâmicas e seus listeners
  
  // ADICIONADO: Adiciona manipulador de eventos para o item de categoria estático "Todas"
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
  
  document.querySelectorAll('.sortable').forEach(header => {
    header.addEventListener('click', () => {
      const column = header.getAttribute('data-sort');
      handleSort(column);
    });
  });
  
  categorySelect.addEventListener('change', function() {
    if (this.value === 'Personalizada') {
      customCategoryInput.style.display = 'block';
    } else {
      customCategoryInput.style.display = 'none';
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
  
  chrome.storage.sync.get('enabled', (result) => {
    if (result.hasOwnProperty('enabled')) {
      isEnabled = result.enabled;
      enabledToggle.checked = isEnabled;
      statusText.textContent = isEnabled ? 'Habilitado' : 'Disabilitado';
    }
  });
  
  loadSettings();
}

/**
 * Load abbreviations from the database
 */
async function loadAbbreviations() {
  try {
    abbreviations = await window.TextExpanderDB.getAllAbbreviations();
    filterAbbreviations();
  } catch (error) {
    console.error('Erro ao carregar abreviações:', error);
    abbreviationsList.innerHTML = `
      <tr>
        <td colspan="6" class="loading">Erro ao carregar abreviações. Por favor, tente novamente.</td>
      </tr>
    `;
  }
}

/**
 * Load categories from the database and populate the sidebar
 */
async function loadCategories() {
  try {
    const categories = await window.TextExpanderDB.getAllCategories();
    
    while (categoryList.children.length > 1) {
      categoryList.removeChild(categoryList.lastChild);
    }
    
    categories.forEach(category => {
      const li = document.createElement('li');
      li.className = 'category-item';
      li.setAttribute('data-category', category);
      li.textContent = category;
      li.addEventListener('click', () => handleCategoryFilter(category));
      categoryList.appendChild(li);
    });
    
    while (categorySelect.options.length > 4) {
      categorySelect.remove(4);
    }
    
    categories.forEach(category => {
      if (!['Comum', 'Pessoal', 'Trbalho', 'Personalizada'].includes(category)) {
        const option = document.createElement('option');
        option.value = category;
        option.textContent = category;
        categorySelect.appendChild(option);
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
    // MODIFICADO: Usa 'all' como a palavra-chave para mostrar todas as categorias
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
      valueA = valueA ? new Date(valueA) : new Date(0);
      valueB = valueB ? new Date(valueB) : new Date(0);
    } else if (typeof valueA === 'string') {
      valueA = valueA.toLowerCase();
      valueB = valueB.toLowerCase();
    }
    
    if (valueA === valueB) {
      return 0;
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
        <td colspan="6" class="loading">Nenhuma abreviação encontrada. Adicione algumas para começar!</td>
      </tr>
    `;
    return;
  }
  
  abbreviationsList.innerHTML = '';
  
  filteredAbbreviations.forEach(abbr => {
    const row = document.createElement('tr');
    let lastUsedText = 'Sem uso';
    if (abbr.lastUsed) {
      const date = new Date(abbr.lastUsed);
      lastUsedText = date.toLocaleString();
    }
    
    row.innerHTML = `
      <td>${abbr.abbreviation}</td>
      <td>${abbr.expansion}</td>
      <td><span class="category-badge">${abbr.category || 'Sem categoria'}</span></td>
      <td>${abbr.usageCount || 0}</td>
      <td>${lastUsedText}</td>
      <td>
        <div class="table-actions">
          <button class="action-btn edit" data-id="${abbr.abbreviation}">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 20h9"></path>
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
            </svg>
          </button>
          <button class="action-btn delete" data-id="${abbr.abbreviation}">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 6h18"></path>
              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      </td>
    `;
    
    const editBtn = row.querySelector('.edit');
    const deleteBtn = row.querySelector('.delete');
    
    editBtn.addEventListener('click', () => handleEditAbbreviation(abbr));
    deleteBtn.addEventListener('click', () => handleDeleteAbbreviation(abbr.abbreviation));
    
    abbreviationsList.appendChild(row);
  });
  
  document.querySelectorAll('.sortable').forEach(header => {
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
    categorySelect.value = abbr.category || 'Comum';
    caseSensitiveCheckbox.checked = abbr.caseSensitive || false;
    enabledCheckbox.checked = abbr.enabled !== false;
    currentEditId = abbr.abbreviation;
    
    if (!['Comum', 'Pessoal', 'Trabalho', 'Personalizada'].includes(abbr.category) && 
        categorySelect.querySelector(`option[value="${abbr.category}"]`)) {
      categorySelect.value = abbr.category;
      customCategoryInput.style.display = 'none';
    } else if (!['Comum', 'Pessoal', 'Trabalho'].includes(abbr.category)) {
      categorySelect.value = 'Personalizada';
      customCategoryInput.value = abbr.category || '';
      customCategoryInput.style.display = 'block';
    } else {
      customCategoryInput.style.display = 'none';
    }
  } else {
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
 * Hide the modal
 */
function hideModal() {
  modalContainer.classList.add('hidden');
  currentEditId = null;
}

/**
 * Handle saving an abbreviation
 */
async function handleSaveAbbreviation() {
  const abbreviation = abbreviationInput.value.trim();
  const expansion = expansionInput.value.trim();
  let category = categorySelect.value;
  const caseSensitive = caseSensitiveCheckbox.checked;
  const enabled = enabledCheckbox.checked;
  
  if (!abbreviation || !expansion) {
    alert('Por favor, insira a abreviação e a expansão.');
    return;
  }
  
  if (category === 'Personalizada') {
    category = customCategoryInput.value.trim() || 'Personalizada';
  }
  
  try {
    const abbrData = {
      abbreviation,
      expansion,
      category,
      caseSensitive,
      enabled
    };
    
    if (currentEditId) { // Editing existing
      const existingAbbr = abbreviations.find(a => a.abbreviation === currentEditId);
      if (existingAbbr) {
        abbrData.createdAt = existingAbbr.createdAt;
        abbrData.lastUsed = existingAbbr.lastUsed;
        abbrData.usageCount = existingAbbr.usageCount;
      }
    } else { // Adding new
      abbrData.createdAt = new Date().toISOString();
      abbrData.lastUsed = null;
      abbrData.usageCount = 0;
    }
    
    await window.TextExpanderDB.updateAbbreviation(abbrData); // updateAbbreviation can handle add if not exists or use addAbbreviation for new
    
    await loadAbbreviations();
    await loadCategories();
    hideModal();
  } catch (error) {
    console.error('Erro ao salvar abreviação:', error);
    alert('Erro ao salvar abreviação. Por favor, tente novamente.');
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
 * @param {string} abbreviation The abbreviation to delete
 */
async function handleDeleteAbbreviation(abbreviation) {
  if (confirm(`Tem certeza que deseja excluir "${abbreviation}"?`)) {
    try {
      await window.TextExpanderDB.deleteAbbreviation(abbreviation);
      await loadAbbreviations();
      await loadCategories();
    } catch (error) {
      console.error('Erro ao excluir abreviação::', error);
      alert('Erro ao excluir abreviação. Por favor, tente novamente.');
    }
  }
}

/**
 * Show the import modal
 */
function showImportModal() {
  importModal.classList.remove('hidden');
  importFile.value = '';
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
    
    const validAbbreviations = importData.filter(abbr => 
      abbr && typeof abbr === 'object' && 
      typeof abbr.abbreviation === 'string' && 
      typeof abbr.expansion === 'string'
    );
    
    if (validAbbreviations.length === 0) {
      alert('Nenhuma abreviação válida encontrada no arquivo de importação.');
      return;
    }
    
    if (importReplace.checked) {
      await window.TextExpanderDB.clearAllAbbreviations();
    }
    
    // Assuming importAbbreviations exists on TextExpanderDB and is designed for this
    const importCount = await window.TextExpanderDB.importAbbreviations(validAbbreviations); 
    
    await loadAbbreviations();
    await loadCategories();
    hideImportModal();
    alert(`Importadas ${importCount} abreviações com sucesso.`);
  } catch (error) {
    console.error('Erro ao importar abreviações:', error);
    alert('Erro ao importar abreviações. Verifique o formato do arquivo e tente novamente.');
  }
}

/**
 * Handle exporting abbreviations
 */
function handleExport() {
  try {
    const exportData = JSON.stringify(abbreviations, null, 2);
    const blob = new Blob([exportData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `text-expander-abbreviations-${new Date().toISOString().slice(0, 10)}.json`;
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
    triggerSpace.checked = result.triggerSpace !== false;
    triggerTab.checked = result.triggerTab !== false;
    triggerEnter.checked = result.triggerEnter !== false;
    settingUndo.checked = result.enableUndo !== false;
  });
}

/**
 * Handle saving settings
 */
function handleSaveSettings() {
  const settings = {
    triggerSpace: triggerSpace.checked,
    triggerTab: triggerTab.checked,
    triggerEnter: triggerEnter.checked,
    enableUndo: settingUndo.checked
  };
  chrome.storage.sync.set(settings, () => {
    hideSettingsModal();
    alert('Configurações salvas com sucesso.');
  });
}

/**
 * Handle clearing all data
 */
async function handleClearData() {
  if (confirm('Tem certeza que deseja limpar todas as abreviações? Esta ação não pode ser desfeita.')) {
    try {
      await window.TextExpanderDB.clearAllAbbreviations();
      await loadAbbreviations();
      await loadCategories();
      hideSettingsModal();
      alert('Todas as abreviações foram limpas.');
    } catch (error) {
      console.error('Erro ao limpar abreviações:', error);
      alert('Erro ao limpar abreviações. Por favor, tente novamente.');
    }
  }
}

document.addEventListener('DOMContentLoaded', init);
