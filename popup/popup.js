// DOM Elements
const abbreviationsList = document.getElementById('abbreviations-list');
const searchInput = document.getElementById('search-input');
const enabledToggle = document.getElementById('enabled-toggle');
const statusText = document.getElementById('status-text');
const addBtn = document.getElementById('add-btn');
const dashboardBtn = document.getElementById('dashboard-btn');
const addForm = document.getElementById('add-form');
const cancelBtn = document.getElementById('cancel-btn');
const saveBtn = document.getElementById('save-btn');
const newAbbreviation = document.getElementById('new-abbreviation');
const newExpansion = document.getElementById('new-expansion');
const newCategory = document.getElementById('new-category');
const newCaseSensitive = document.getElementById('new-case-sensitive');

// State
let abbreviations = [];
let filteredAbbreviations = [];
let currentEditId = null;
let isEnabled = true;

/**
 * Initialize the popup
 */
async function init() {
  // Check if TextExpanderDB is available
  if (!window.TextExpanderDB || typeof window.TextExpanderDB.getAllAbbreviations !== 'function') {
    console.error("TextExpanderDB não foi inicializado corretamente..");
    abbreviationsList.innerHTML = `<div class="empty-state"><p>Erro ao inicializar. Verifique o console.</p></div>`;
    return;
  }

  await loadAbbreviations();
  await loadCategories();

  searchInput.addEventListener('input', handleSearch);
  enabledToggle.addEventListener('change', handleToggleEnabled);
  addBtn.addEventListener('click', showAddForm);
  dashboardBtn.addEventListener('click', openDashboard);
  cancelBtn.addEventListener('click', hideAddForm);
  saveBtn.addEventListener('click', handleSaveAbbreviation);

  chrome.storage.sync.get('enabled', (result) => {
    if (result.hasOwnProperty('enabled')) {
      isEnabled = result.enabled;
      enabledToggle.checked = isEnabled;
      statusText.textContent = isEnabled ? 'Enabled' : 'Disabled';
    }
  });
}

/**
 * Load abbreviations from the database
 */
async function loadAbbreviations() {
  try {
    abbreviations = await window.TextExpanderDB.getAllAbbreviations();
    filteredAbbreviations = [...abbreviations];
    renderAbbreviations();
  } catch (error) {
    console.error('Erro ao carregar abreviações:', error);
    abbreviationsList.innerHTML = `
      <div class="empty-state">
        <p>Erro ao carregar abreviações. Por favor, tente novamente.</p>
      </div>
    `;
  }
}

/**
 * Load categories from the database
 */
async function loadCategories() {
  try {
    const categories = await window.TextExpanderDB.getAllCategories();
    
    while (newCategory.options.length > 4) {
      newCategory.remove(4);
    }
    
    categories.forEach(category => {
      if (!['Common', 'Personal', 'Work', 'Custom'].includes(category)) {
        const option = document.createElement('option');
        option.value = category;
        option.textContent = category;
        newCategory.appendChild(option);
      }
    });
  } catch (error) {
    console.error('Erro ao carregar categorias:', error);
  }
}

/**
 * Render abbreviations in the list
 */
function renderAbbreviations() {
  if (filteredAbbreviations.length === 0) {
    abbreviationsList.innerHTML = `
      <div class="empty-state">
        <p>Nenhuma abreviação encontrada. Adicione algumas para começar!</p>
      </div>
    `;
    return;
  }
  
  abbreviationsList.innerHTML = '';
  
  filteredAbbreviations.sort((a, b) => {
    if (a.lastUsed && b.lastUsed) {
      return new Date(b.lastUsed) - new Date(a.lastUsed);
    } else if (a.lastUsed) {
      return -1;
    } else if (b.lastUsed) {
      return 1;
    } else {
      return a.abbreviation.localeCompare(b.abbreviation);
    }
  });
  
  filteredAbbreviations.forEach(abbr => {
    const item = document.createElement('div');
    item.className = 'abbreviation-item';
    
    item.innerHTML = `
      <div class="abbreviation-details">
        <span class="abbreviation-text">${abbr.abbreviation}</span>
        <span class="expansion-text">${abbr.expansion}</span>
        <span class="category-badge">${abbr.category || 'Uncategorized'}</span>
      </div>
      <div class="item-actions">
        <button class="edit-btn" data-id="${abbr.abbreviation}">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 20h9"></path>
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
          </svg>
        </button>
        <button class="delete-btn" data-id="${abbr.abbreviation}">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 6h18"></path>
            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
          </svg>
        </button>
      </div>
    `;
    
    const editBtn = item.querySelector('.edit-btn');
    const deleteBtn = item.querySelector('.delete-btn');
    
    editBtn.addEventListener('click', () => handleEditAbbreviation(abbr));
    deleteBtn.addEventListener('click', () => handleDeleteAbbreviation(abbr.abbreviation));
    
    abbreviationsList.appendChild(item);
  });
}

/**
 * Handle search input
 */
function handleSearch() {
  const searchTerm = searchInput.value.trim().toLowerCase();
  
  if (searchTerm === '') {
    filteredAbbreviations = [...abbreviations];
  } else {
    filteredAbbreviations = abbreviations.filter(abbr => {
      return abbr.abbreviation.toLowerCase().includes(searchTerm) || 
             abbr.expansion.toLowerCase().includes(searchTerm) || 
             (abbr.category && abbr.category.toLowerCase().includes(searchTerm));
    });
  }
  
  renderAbbreviations();
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
      }).catch(err => {
        // Ignore errors for tabs that can't receive messages
      });
    });
  });
}

/**
 * Show the add form
 */
function showAddForm() {
  addForm.classList.remove('hidden');
  newAbbreviation.focus();
  
  if (!currentEditId) {
    newAbbreviation.value = '';
    newExpansion.value = '';
    newCategory.value = 'Common';
    newCaseSensitive.checked = false;
  }
}

/**
 * Hide the add form
 */
function hideAddForm() {
  addForm.classList.add('hidden');
  currentEditId = null;
}

/**
 * Open the dashboard page
 */
function openDashboard() {
  chrome.tabs.create({
    url: chrome.runtime.getURL('dashboard/dashboard.html')
  });
}

/**
 * Handle saving a new abbreviation
 */
async function handleSaveAbbreviation() {
  const abbreviation = newAbbreviation.value.trim();
  const expansion = newExpansion.value.trim();
  const category = newCategory.value;
  const caseSensitive = newCaseSensitive.checked;
  
  if (!abbreviation || !expansion) {
    alert('Por favor, insira a abreviação e a expansão.');
    return;
  }
  
  try {
    let abbrData = {
      abbreviation,
      expansion,
      category,
      caseSensitive,
      enabled: true,
      // These will be set if new, or preserved if editing
      createdAt: new Date().toISOString(),
      lastUsed: null,
      usageCount: 0
    };
    
    if (currentEditId) {
      const existingAbbr = abbreviations.find(a => a.abbreviation === currentEditId);
      if (existingAbbr) {
        abbrData.createdAt = existingAbbr.createdAt;
        abbrData.lastUsed = existingAbbr.lastUsed;
        abbrData.usageCount = existingAbbr.usageCount;
      }
      await window.TextExpanderDB.updateAbbreviation(abbrData);
    } else {
      await window.TextExpanderDB.addAbbreviation(abbrData);
    }
    
    await loadAbbreviations();
    hideAddForm();
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
  currentEditId = abbr.abbreviation;
  newAbbreviation.value = abbr.abbreviation;
  newExpansion.value = abbr.expansion;
  newCategory.value = abbr.category || 'Common';
  newCaseSensitive.checked = abbr.caseSensitive || false;
  
  showAddForm();
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
    } catch (error) {
      console.error('Erro ao excluir abreviação:', error);
      alert('Erro ao excluir abreviação. Por favor, tente novamente.');
    }
  }
}

document.addEventListener('DOMContentLoaded', init);
