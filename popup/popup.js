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
const formTitle = document.getElementById('form-title');

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

function showLoadingState() {
  abbreviationsList.innerHTML = `
    <div class="loading" role="status" aria-live="polite">
      <div class="loading-spinner" aria-hidden="true"></div>
      <p>Carregando abreviações...</p>
    </div>
  `;
}

function showErrorState(message) {
  abbreviationsList.innerHTML = `
    <div class="empty-state">
      <div class="empty-state-icon" aria-hidden="true">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="15" y1="9" x2="9" y2="15"></line>
          <line x1="9" y1="9" x2="15" y2="15"></line>
        </svg>
      </div>
      <h3>Erro ao carregar</h3>
      <p>${message}</p>
    </div>
  `;
}

async function init() {
  // Verifica se a dependência TextExpanderDB está disponível
  if (typeof window.TextExpanderDB === 'undefined' || typeof window.TextExpanderDB.getAllAbbreviations !== 'function') { 
    console.error("TextExpanderDB não foi inicializado corretamente para popup.js. Verifique a ordem dos scripts no HTML."); 
    showErrorState('Erro ao inicializar o banco de dados. Tente reabrir o popup.');
    return;
  }
  // Verifica se SOTE_CONSTANTS está disponível
  if (typeof window.SOTE_CONSTANTS === 'undefined' || typeof window.SOTE_CONSTANTS.MESSAGE_TYPES === 'undefined') {
    console.error("SOTE_CONSTANTS não foi inicializado corretamente para popup.js. Verifique a ordem dos scripts no HTML.");
    showErrorState('Erro ao carregar constantes. Tente reabrir o popup.');
    return;
  }

  await loadAbbreviations(); 
  await loadCategories(); 

  // Event Listeners
  searchInput.addEventListener('input', handleSearch); 
  enabledToggle.addEventListener('change', handleToggleEnabled); 
  addBtn.addEventListener('click', showAddForm); 
  dashboardBtn.addEventListener('click', openDashboard); 
  cancelBtn.addEventListener('click', hideAddForm); 
  saveBtn.addEventListener('click', handleSaveAbbreviation); 

  // Category select change handler
  if (newCategorySelect) {
    newCategorySelect.addEventListener('change', function() {
      const isCustom = this.value === 'Personalizada';
      customCategoryGroup.style.display = isCustom ? 'block' : 'none';
      if (isCustom && newCustomCategoryInput) {
        newCustomCategoryInput.focus();
      }
    });
  }

  // Insert action buttons
  insertActionButtons.forEach(button => {
    button.addEventListener('click', function() {
      const action = this.getAttribute('data-action');
      if (newExpansionTextarea && action) {
        insertTextAtCursor(newExpansionTextarea, action);
      }
    });
  });

  // Keyboard navigation
  document.addEventListener('keydown', handleKeyboardNavigation);

  // Load initial state
  chrome.storage.sync.get('enabled', (result) => { 
    if (result.hasOwnProperty('enabled')) { 
      isEnabled = result.enabled; 
      enabledToggle.checked = isEnabled; 
      updateStatusText();
    } else { 
        isEnabled = true;
        enabledToggle.checked = true;
        updateStatusText();
        chrome.storage.sync.set({ enabled: true });
    }
  });

  // Listen for updates
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === window.SOTE_CONSTANTS.MESSAGE_TYPES.ABBREVIATIONS_UPDATED || message.type === window.SOTE_CONSTANTS.MESSAGE_TYPES.INITIAL_SEED_COMPLETE) { // Usar constantes
      performLocalRefreshPopup();
    }
    return true;
  });
}

function updateStatusText() {
  statusText.textContent = isEnabled ? 'Habilitado' : 'Desabilitado';
  statusText.setAttribute('aria-label', `Expansor de texto ${isEnabled ? 'habilitado' : 'desabilitado'}`);
}

async function loadAbbreviations() {
  try {
    showLoadingState();
    const freshAbbreviations = await window.TextExpanderDB.getAllAbbreviations();
    if (Array.isArray(freshAbbreviations)) {
        abbreviations = freshAbbreviations;
        filterAbbreviations(); 
    } else {
        console.error('TextExpanderDB.getAllAbbreviations did not return an array in popup.');
        abbreviations = [];
        showErrorState('Erro no formato dos dados. Recarregue o popup.');
    }
  } catch (error) {
    console.error('Erro ao carregar abreviações:', error);
    showErrorState('Erro ao carregar abreviações. Tente reabrir o popup.');
  }
}

async function loadCategories() {
  try {
    const categories = await window.TextExpanderDB.getAllCategories(); 
    const standardValues = ['Comum', 'Pessoal', 'Trabalho', 'Personalizada'];
    const currentOptions = Array.from(newCategorySelect.options).map(opt => opt.value);
    
    // Remove categories that no longer exist
    currentOptions.forEach(val => {
        if (!standardValues.includes(val) && !categories.includes(val)) {
            const optToRemove = newCategorySelect.querySelector(`option[value="${val}"]`);
            if (optToRemove) newCategorySelect.removeChild(optToRemove);
        }
    });

    const personalizadaOption = newCategorySelect.querySelector('option[value="Personalizada"]');
    
    // Add new categories
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
        <div class="empty-state-icon" aria-hidden="true">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
        </div>
        <h3>Nenhum resultado</h3>
        <p>Nenhuma abreviação encontrada para "${searchInput.value}"</p>
      </div>
    `;
    return;
  }
  
  if (filteredAbbreviations.length === 0) {
    abbreviationsList.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon" aria-hidden="true">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
        </div>
        <h3>Nenhuma abreviação</h3>
        <p>Comece criando sua primeira abreviação para acelerar sua digitação</p>
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
  
  sortedForDisplay.forEach((abbr, index) => {
    const item = document.createElement('div');
    item.className = 'abbreviation-item';
    item.setAttribute('role', 'listitem');
    item.setAttribute('tabindex', '0');
    item.setAttribute('aria-label', `Abreviação ${abbr.abbreviation}, expande para ${abbr.expansion}`);
    
    // Format expansion for display
    const formattedExpansion = formatExpansionForDisplay(abbr.expansion);
    const expansionDisplay = formattedExpansion.length > 40 ? formattedExpansion.substring(0, 37) + '...' : formattedExpansion;

    item.innerHTML = `
      <div class="abbreviation-details">
        <div class="abbreviation-text">${escapeHtml(abbr.abbreviation)}</div>
        <div class="expansion-text" title="${escapeHtml(formattedExpansion)}">${escapeHtml(expansionDisplay)}</div>
        <div class="category-badge">${escapeHtml(abbr.category || 'Sem Categoria')}</div>
      </div>
      <div class="item-actions">
        <button class="action-btn edit-btn" data-id="${escapeHtml(abbr.abbreviation)}" title="Editar abreviação" aria-label="Editar ${abbr.abbreviation}">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 20h9"></path>
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
          </svg>
        </button>
        <button class="action-btn delete-btn" data-id="${escapeHtml(abbr.abbreviation)}" title="Excluir abreviação" aria-label="Excluir ${abbr.abbreviation}">
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
    
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleEditAbbreviation(abbr);
    });
    
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleDeleteAbbreviation(abbr.abbreviation);
    });

    // Add keyboard support for item
    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleEditAbbreviation(abbr);
      }
    });
    
    abbreviationsList.appendChild(item);
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
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

function handleSearch() { 
  filterAbbreviations(); 
}

function handleToggleEnabled() {
  isEnabled = enabledToggle.checked;
  updateStatusText();
  chrome.storage.sync.set({ enabled: isEnabled });
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      if (tab.id) { 
        chrome.tabs.sendMessage(tab.id, { type: window.SOTE_CONSTANTS.MESSAGE_TYPES.TOGGLE_ENABLED, enabled: isEnabled }) // Usar constante
          .catch(err => {});
      }
    });
  });
}

function showAddForm() {
  addForm.classList.remove('hidden');
  addForm.classList.add('show');
  
  if (!currentEditId) { 
    formTitle.textContent = 'Adicionar Nova Abreviação';
    newAbbreviationInput.value = ''; 
    newAbbreviationInput.readOnly = false;
    newExpansionTextarea.value = ''; 
    newCategorySelect.value = 'Comum'; 
    newCaseSensitiveCheckbox.checked = false; 
    if (newCustomCategoryInput) newCustomCategoryInput.value = '';
  } else { 
    formTitle.textContent = 'Editar Abreviação';
    newAbbreviationInput.readOnly = true; 
  }
  
  if (newCategorySelect.value === 'Personalizada') {
    if (customCategoryGroup) customCategoryGroup.style.display = 'block';
  } else {
    if (customCategoryGroup) customCategoryGroup.style.display = 'none';
  }
  
  // Focus management
  setTimeout(() => {
    newAbbreviationInput.focus();
  }, 300);
}

function hideAddForm() {
  addForm.classList.remove('show');
  setTimeout(() => {
    addForm.classList.add('hidden');
  }, 250);
  
  currentEditId = null; 
  if (customCategoryGroup) customCategoryGroup.style.display = 'none';
  if (newCustomCategoryInput) newCustomCategoryInput.value = '';
  newAbbreviationInput.readOnly = false;
  
  // Return focus to add button
  addBtn.focus();
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
    showNotification('Por favor, insira a abreviação e a expansão.', 'error');
    return; 
  }
  
  if (category === 'Personalizada') {
    const customName = newCustomCategoryInput ? newCustomCategoryInput.value.trim() : '';
    if (!customName) {
        showNotification('Por favor, insira o nome da categoria personalizada.', 'error');
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
      await window.TextExpanderDB.updateAbbreviation(abbrData); 
      showNotification('Abreviação atualizada com sucesso!', 'success');
    } else {
      await window.TextExpanderDB.addAbbreviation(abbrData); 
      showNotification('Abreviação criada com sucesso!', 'success');
    }
    
    await performLocalRefreshPopup();
    hideAddForm(); 
  } catch (error) {
    console.error('Erro ao salvar abreviação:', error); 
    if (error.message && error.message.toLowerCase().includes('key already exists')) {
        showNotification('Erro: A abreviação já existe.', 'error');
    } else if (error.message && error.message.includes('Validation Error:')) {
        showNotification(`Erro de validação: ${error.message}`, 'error');
    } else {
        showNotification('Erro ao salvar abreviação. Tente novamente.', 'error'); 
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
  if (confirm(`Tem certeza que deseja excluir "${abbreviationKey}"?`)) {
    try {
      await window.TextExpanderDB.deleteAbbreviation(abbreviationKey);
      showNotification('Abreviação excluída com sucesso!', 'success');
      await performLocalRefreshPopup();
    } catch (error) {
      console.error('Erro ao excluir abreviação:', error);
      showNotification('Erro ao excluir abreviação. Tente novamente.', 'error');
    }
  }
}

function handleKeyboardNavigation(e) {
  if (e.key === 'Escape') {
    if (!addForm.classList.contains('hidden')) {
      hideAddForm();
    }
  }
}

function showNotification(message, type = 'info') {
  // Create notification element
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 12px 16px;
    border-radius: 8px;
    color: white;
    font-weight: 500;
    font-size: 14px;
    z-index: 10000;
    transform: translateX(100%);
    transition: transform 0.3s ease;
    max-width: 300px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  `;
  
  // Set background color based on type
  switch (type) {
    case 'success':
      notification.style.background = 'linear-gradient(135deg, #10b981, #059669)';
      break;
    case 'error':
      notification.style.background = 'linear-gradient(135deg, #ef4444, #dc2626)';
      break;
    default:
      notification.style.background = 'linear-gradient(135deg, #3b82f6, #2563eb)';
  }
  
  notification.textContent = message;
  document.body.appendChild(notification);
  
  // Animate in
  setTimeout(() => {
    notification.style.transform = 'translateX(0)';
  }, 100);
  
  // Remove after delay
  setTimeout(() => {
    notification.style.transform = 'translateX(100%)';
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 300);
  }, 3000);
}

document.addEventListener('DOMContentLoaded', init);