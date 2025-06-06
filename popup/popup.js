// SOTE-main/popup/popup.js
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
const newAbbreviationInput = document.getElementById('new-abbreviation');
const newExpansionTextarea = document.getElementById('new-expansion');
const newCategorySelect = document.getElementById('new-category');
const newCaseSensitiveCheckbox = document.getElementById('new-case-sensitive');
const customCategoryGroup = document.getElementById('custom-category-group');
const newCustomCategoryInput = document.getElementById('new-custom-category');
const insertActionButtons = document.querySelectorAll('#add-form .btn-insert-action');

// State
let abbreviations = [];
let filteredAbbreviations = [];
let currentEditId = null;
let isEnabled = true;

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


function insertTextAtCursor(textarea, textToInsert) {
  if (!textarea) return;
  const startPos = textarea.selectionStart;
  const endPos = textarea.selectionEnd;
  const scrollTop = textarea.scrollTop;
  textarea.value = textarea.value.substring(0, startPos) + textToInsert + textarea.value.substring(endPos, textarea.value.length);
  textarea.selectionStart = startPos + textToInsert.length;
  textarea.selectionEnd = startPos + textToInsert.length;
  textarea.scrollTop = scrollTop;
  textarea.focus();
}

async function performLocalRefreshPopup() {
  await loadAbbreviations();
  await loadCategories(); 
}

async function init() {
  // Verifica se a dependência TextExpanderDB está disponível
  if (typeof window.TextExpanderDB === 'undefined' || typeof window.TextExpanderDB.getAllAbbreviations !== 'function') { 
    console.error("TextExpanderDB não foi inicializado corretamente para popup.js. Verifique a ordem dos scripts no HTML."); 
    abbreviationsList.innerHTML = `<div class="empty-state"><p>Erro ao inicializar o banco de dados. Tente reabrir.</p></div>`; 
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

  if (newCategorySelect) {
    newCategorySelect.addEventListener('change', function() {
      if (this.value === 'Personalizada') {
        if (customCategoryGroup) customCategoryGroup.style.display = 'block';
        if (newCustomCategoryInput) newCustomCategoryInput.focus();
      } else {
        if (customCategoryGroup) customCategoryGroup.style.display = 'none';
      }
    });
  }

  insertActionButtons.forEach(button => {
    button.addEventListener('click', function() {
      const action = this.getAttribute('data-action');
      if (newExpansionTextarea && action) {
        insertTextAtCursor(newExpansionTextarea, action);
      }
    });
  });

  chrome.storage.sync.get('enabled', (result) => { 
    if (result.hasOwnProperty('enabled')) { 
      isEnabled = result.enabled; 
      enabledToggle.checked = isEnabled; 
      statusText.textContent = isEnabled ? 'Habilitado' : 'Desabilitado'; 
    } else { 
        isEnabled = true;
        enabledToggle.checked = true;
        statusText.textContent = 'Habilitado';
        chrome.storage.sync.set({ enabled: true });
    }
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'ABBREVIATIONS_UPDATED' || message.type === 'INITIAL_SEED_COMPLETE') {
      performLocalRefreshPopup();
    }
    return true;
  });
}

async function loadAbbreviations() {
  try {
    abbreviationsList.innerHTML = `<div class="loading">Carregando abreviações...</div>`;
    // Assumimos que window.TextExpanderDB está carregado
    const freshAbbreviations = await window.TextExpanderDB.getAllAbbreviations();
    if (Array.isArray(freshAbbreviations)) { // Sempre verificar o tipo
        abbreviations = freshAbbreviations;
        filterAbbreviations(); 
    } else {
        console.error('TextExpanderDB.getAllAbbreviations did not return an array in popup.');
        abbreviations = [];
        abbreviationsList.innerHTML = `<div class="empty-state"><p>Erro no formato dos dados. Recarregue.</p></div>`;
    }
  } catch (error) {
    console.error('Erro ao carregar abreviações:', error);
    abbreviationsList.innerHTML = `
      <div class="empty-state">
        <p>Erro ao carregar abreviações. Tente reabrir o popup.</p>
      </div>
    `;
  }
}

async function loadCategories() {
  try {
    const categories = await window.TextExpanderDB.getAllCategories(); 
    const standardValues = ['Comum', 'Pessoal', 'Trabalho', 'Personalizada'];
    const currentOptions = Array.from(newCategorySelect.options).map(opt => opt.value);
    
    currentOptions.forEach(val => {
        if (!standardValues.includes(val) && !categories.includes(val)) {
            const optToRemove = newCategorySelect.querySelector(`option[value="${val}"]`);
            if (optToRemove) newCategorySelect.removeChild(optToRemove);
        }
    });

    const personalizadaOption = newCategorySelect.querySelector('option[value="Personalizada"]');
    
    categories.forEach(category => { 
      if (!newCategorySelect.querySelector(`option[value="${category}"]`)) { 
        const option = document.createElement('option'); 
        option.value = category; 
        option.textContent = category; 
        if (personalizadaOption) {
            newCategorySelect.insertBefore(option, personalizadaOption);
        } else {
            newCategorySelect.appendChild(option); 
        }
      }
    });
  } catch (error) {
    console.error('Erro ao carregar categorias:', error); 
  }
}

function renderAbbreviations() {
  if (filteredAbbreviations.length === 0 && abbreviations.length > 0 && searchInput.value.trim() !== '') {
    abbreviationsList.innerHTML = `
      <div class="empty-state">
        <p>Nenhuma abreviação encontrada para "${searchInput.value}".</p>
      </div>
    `;
    return;
  }
  if (filteredAbbreviations.length === 0) {
    abbreviationsList.innerHTML = `
      <div class="empty-state">
        <p>Nenhuma abreviação cadastrada. Adicione algumas!</p>
      </div>
    `;
    return;
  }
  
  abbreviationsList.innerHTML = '';
  
  const sortedForDisplay = [...filteredAbbreviations].sort((a, b) => {
    const lastUsedA = a.lastUsed ? new Date(a.lastUsed).getTime() : 0;
    const lastUsedB = b.lastUsed ? new Date(b.lastUsed).getTime() : 0;
    if (lastUsedA !== lastUsedB) {
      return lastUsedB - lastUsedA; 
    }
    return a.abbreviation.localeCompare(b.abbreviation); 
  });
  
  sortedForDisplay.forEach(abbr => {
    const item = document.createElement('div');
    item.className = 'abbreviation-item';
    
    // Formata a expansão para exibição amigável
    const formattedExpansion = formatExpansionForDisplay(abbr.expansion);
    const expansionDisplay = formattedExpansion.length > 30 ? formattedExpansion.substring(0, 27) + '...' : formattedExpansion;

    item.innerHTML = `
      <div class="abbreviation-details">
        <span class="abbreviation-text">${abbr.abbreviation}</span>
        <span class="expansion-text" title="${formattedExpansion}">${expansionDisplay}</span>
        <span class="category-badge">${abbr.category || 'Sem Categoria'}</span>
      </div>
      <div class="item-actions">
        <button class="edit-btn" data-id="${abbr.abbreviation}" title="Editar">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 20h9"></path>
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
          </svg>
        </button>
        <button class="delete-btn" data-id="${abbr.abbreviation}" title="Excluir">
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

function filterAbbreviations() {
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

function handleSearch() { filterAbbreviations(); }

function handleToggleEnabled() {
  isEnabled = enabledToggle.checked;
  statusText.textContent = isEnabled ? 'Habilitado' : 'Desabilitado';
  chrome.storage.sync.set({ enabled: isEnabled });
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      if (tab.id) { 
        chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_ENABLED', enabled: isEnabled })
          .catch(err => {});
      }
    });
  });
}

function showAddForm() {
  addForm.classList.remove('hidden'); 
  if (!currentEditId) { 
    newAbbreviationInput.value = ''; 
    newAbbreviationInput.readOnly = false;
    newExpansionTextarea.value = ''; 
    newCategorySelect.value = 'Comum'; 
    newCaseSensitiveCheckbox.checked = false; 
    if (newCustomCategoryInput) newCustomCategoryInput.value = '';
  } else { 
    newAbbreviationInput.readOnly = true; 
  }
  if (newCategorySelect.value === 'Personalizada') {
    if (customCategoryGroup) customCategoryGroup.style.display = 'block';
  } else {
    if (customCategoryGroup) customCategoryGroup.style.display = 'none';
  }
  newAbbreviationInput.focus(); 
}

function hideAddForm() {
  addForm.classList.add('hidden'); 
  currentEditId = null; 
  if (customCategoryGroup) customCategoryGroup.style.display = 'none';
  if (newCustomCategoryInput) newCustomCategoryInput.value = '';
  newAbbreviationInput.readOnly = false; 
}

function openDashboard() {
  chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html') });
  window.close(); 
}

async function handleSaveAbbreviation() {
  const abbreviation = newAbbreviationInput.value.trim(); 
  const expansion = newExpansionTextarea.value.trim();
  let category = newCategorySelect.value; 
  const caseSensitive = newCaseSensitiveCheckbox.checked; 
  
  if (!abbreviation || !expansion) { 
    alert('Por favor, insira a abreviação e a expansão.'); 
    return; 
  }
  
  if (category === 'Personalizada') {
    const customName = newCustomCategoryInput ? newCustomCategoryInput.value.trim() : '';
    if (!customName) {
        alert('Por favor, insira o nome da categoria personalizada.');
        if (newCustomCategoryInput) newCustomCategoryInput.focus();
        return;
    }
    category = customName;
  }
  
  try {
    let abbrData = {
      abbreviation, expansion, category, caseSensitive, enabled: true, rules: [], 
    };
    if (currentEditId) { 
      // `updateAbbreviation` agora busca o item existente e mescla para preservar campos
      await window.TextExpanderDB.updateAbbreviation(abbrData); 
    } else {
      await window.TextExpanderDB.addAbbreviation(abbrData); 
    }
    await performLocalRefreshPopup();
    hideAddForm(); 
  } catch (error) {
    console.error('Erro ao salvar abreviação:', error); 
    if (error.message && error.message.toLowerCase().includes('key already exists')) {
        alert('Erro ao salvar: A abreviação já existe.');
    } else if (error.message && error.message.includes('Validation Error:')) {
        alert(`Erro de validação: ${error.message}`);
    } else {
        alert('Erro ao salvar abreviação. Por favor, tente novamente.'); 
    }
  }
}

function handleEditAbbreviation(abbr) { 
  currentEditId = abbr.abbreviation; 
  newAbbreviationInput.value = abbr.abbreviation; 
  newExpansionTextarea.value = abbr.expansion;
  newCaseSensitiveCheckbox.checked = abbr.caseSensitive || false; 

  const standardCategories = ['Comum', 'Pessoal', 'Trabalho', 'Personalizada'];
  if (abbr.category && !standardCategories.includes(abbr.category)) {
    let optionExists = false;
    for (let i = 0; i < newCategorySelect.options.length; i++) {
        if (newCategorySelect.options[i].value === abbr.category) {
            optionExists = true;
            break;
        }
    }
    if (optionExists) {
        newCategorySelect.value = abbr.category;
    } else {
        newCategorySelect.value = 'Personalizada';
        if (newCustomCategoryInput) newCustomCategoryInput.value = abbr.category;
    }
  } else {
    newCategorySelect.value = abbr.category || 'Comum'; 
  }
  
  if (newCategorySelect.value === 'Personalizada') {
      if (customCategoryGroup) customCategoryGroup.style.display = 'block';
      if (abbr.category && !standardCategories.includes(abbr.category)) {
          if (newCustomCategoryInput) newCustomCategoryInput.value = abbr.category;
      } else {
         if (newCustomCategoryInput) newCustomCategoryInput.value = ''; 
      }
  } else {
      if (customCategoryGroup) customCategoryGroup.style.display = 'none';
      if (newCustomCategoryInput) newCustomCategoryInput.value = '';
  }
  showAddForm(); 
}

async function handleDeleteAbbreviation(abbreviationKey) {
  if (confirm(`Tem certeza que deseja excluir "${abbreviationKey}"? (As regras associadas não serão excluídas pelo popup)`)) {
    try {
      await window.TextExpanderDB.deleteAbbreviation(abbreviationKey); // deleteAbbreviation agora também remove regras associadas
      await performLocalRefreshPopup();
    } catch (error) {
      console.error('Erro ao excluir abreviação:', error);
      alert('Erro ao excluir abreviação. Por favor, tente novamente.');
    }
  }
}

document.addEventListener('DOMContentLoaded', init);