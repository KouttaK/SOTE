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
const newCategory = document.getElementById('new-category'); //
const newCaseSensitive = document.getElementById('new-case-sensitive');

// ADICIONAR ESTAS REFERÊNCIAS
const customCategoryGroup = document.getElementById('custom-category-group');
const newCustomCategoryInput = document.getElementById('new-custom-category');

// State
let abbreviations = [];
let filteredAbbreviations = [];
let currentEditId = null;
let isEnabled = true;
/**
 * Initialize the popup
 */
async function init() {
  if (!window.TextExpanderDB || typeof window.TextExpanderDB.getAllAbbreviations !== 'function') { //
    console.error("TextExpanderDB não foi inicializado corretamente.."); //
    abbreviationsList.innerHTML = `<div class="empty-state"><p>Erro ao inicializar. Verifique o console.</p></div>`; //
    return;
  }

  await loadAbbreviations(); //
  await loadCategories(); //

  searchInput.addEventListener('input', handleSearch); //
  enabledToggle.addEventListener('change', handleToggleEnabled); //
  addBtn.addEventListener('click', showAddForm); //
  dashboardBtn.addEventListener('click', openDashboard); //
  cancelBtn.addEventListener('click', hideAddForm); //
  saveBtn.addEventListener('click', handleSaveAbbreviation); //

  // ADICIONAR: Manipulador de eventos para o seletor de categoria
  if (newCategory) {
    newCategory.addEventListener('change', function() {
      if (this.value === 'Personalizada') {
        if (customCategoryGroup) customCategoryGroup.style.display = 'block';
        if (newCustomCategoryInput) newCustomCategoryInput.focus();
      } else {
        if (customCategoryGroup) customCategoryGroup.style.display = 'none';
      }
    });
  }

  chrome.storage.sync.get('enabled', (result) => { //
    if (result.hasOwnProperty('enabled')) { //
      isEnabled = result.enabled; //
      enabledToggle.checked = isEnabled; //
      statusText.textContent = isEnabled ? 'Habilitado' : 'Disabilitado'; // MODIFICADO para Português, como no restante do código
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
    const categories = await window.TextExpanderDB.getAllCategories(); //
    
    // Mantém as opções padrão e remove apenas as carregadas dinamicamente anteriormente
    const defaultOptionsCount = Array.from(newCategory.options).filter(opt => ['Comum', 'Pessoal', 'Trabalho', 'Personalizada'].includes(opt.value)).length;
    while (newCategory.options.length > defaultOptionsCount) { //
      // Encontra a primeira opção que não é uma das padrão para remover
      let removed = false;
      for (let i = 0; i < newCategory.options.length; i++) {
          if (!['Comum', 'Pessoal', 'Trabalho', 'Personalizada'].includes(newCategory.options[i].value)) {
              newCategory.remove(i);
              removed = true;
              break;
          }
      }
      if (!removed) break; // Caso só restem as padrões
    }
    
    const existingOptionValues = new Set(Array.from(newCategory.options).map(opt => opt.value));

    categories.forEach(category => { //
      if (!existingOptionValues.has(category)) { // // Evita duplicar opções já existentes
        const option = document.createElement('option'); //
        option.value = category; //
        option.textContent = category; //
        // Insere antes da opção "Personalizada" se ela existir, ou no final
        const personalizadaOption = Array.from(newCategory.options).find(opt => opt.value === 'Personalizada');
        if (personalizadaOption) {
            newCategory.insertBefore(option, personalizadaOption);
        } else {
            newCategory.appendChild(option); //
        }
        existingOptionValues.add(category); // Adiciona ao set para futuras checagens
      }
    });
  } catch (error) {
    console.error('Erro ao carregar categorias:', error); //
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
/**
 * Show the add form
 */
function showAddForm() {
  addForm.classList.remove('hidden'); //
  newAbbreviation.focus(); //
  
  if (!currentEditId) { // Adicionando nova abreviação
    newAbbreviation.value = ''; //
    newAbbreviation.readOnly = false;
    newExpansion.value = ''; //
    newCategory.value = 'Comum'; //
    newCaseSensitive.checked = false; //
    if (newCustomCategoryInput) newCustomCategoryInput.value = '';
  } else { // Editando abreviação existente
    newAbbreviation.readOnly = true; // Campo abreviação não deve ser editável
    // Valores são preenchidos por handleEditAbbreviation
  }

  // Garante que o campo de categoria personalizada seja exibido/oculto corretamente
  if (newCategory) {
    if (newCategory.value === 'Personalizada') {
      if (customCategoryGroup) customCategoryGroup.style.display = 'block';
    } else {
      if (customCategoryGroup) customCategoryGroup.style.display = 'none';
    }
  }
}

/**
 * Hide the add form
 */
function hideAddForm() {
  addForm.classList.add('hidden'); //
  currentEditId = null; //
  // ADICIONAR: Ocultar e limpar campo de categoria personalizada
  if (customCategoryGroup) customCategoryGroup.style.display = 'none';
  if (newCustomCategoryInput) newCustomCategoryInput.value = '';
  newAbbreviation.readOnly = false; // Reseta para caso de nova adição
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
  const abbreviation = newAbbreviation.value.trim(); //
  const expansion = newExpansion.value.trim(); //
  let category = newCategory.value; //
  const caseSensitive = newCaseSensitive.checked; //
  
  if (!abbreviation || !expansion) { //
    alert('Por favor, insira a abreviação e a expansão.'); //
    return; //
  }
  
  // ADICIONAR: Lógica para obter nome da categoria personalizada
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
      abbreviation,
      expansion,
      category, // Usa o valor da categoria (pode ser o nome personalizado)
      caseSensitive,
      enabled: true, //
      createdAt: new Date().toISOString(), //
      lastUsed: null, //
      usageCount: 0 //
    };
    
    if (currentEditId) { //
      const existingAbbr = abbreviations.find(a => a.abbreviation === currentEditId); //
      if (existingAbbr) { //
        // Mantém os dados existentes que não são editados no formulário da popup
        abbrData.createdAt = existingAbbr.createdAt; //
        abbrData.lastUsed = existingAbbr.lastUsed; //
        abbrData.usageCount = existingAbbr.usageCount; //
        abbrData.enabled = existingAbbr.enabled; // Assume que enabled não é alterado na popup quick-add
      }
      await window.TextExpanderDB.updateAbbreviation(abbrData); //
    } else {
      await window.TextExpanderDB.addAbbreviation(abbrData); //
    }
    
    await loadAbbreviations(); //
    await loadCategories(); // Recarrega categorias, pode haver uma nova
    hideAddForm(); //
  } catch (error) {
    console.error('Erro ao salvar abreviação:', error); //
    if (error.message && error.message.includes('Key already exists')) {
        alert('Erro ao salvar: A abreviação já existe.');
    } else {
        alert('Erro ao salvar abreviação. Por favor, tente novamente.'); //
    }
  }
}


/**
 * Handle editing an abbreviation
 * @param {Object} abbr The abbreviation to edit
 */
function handleEditAbbreviation(abbr) { //
  currentEditId = abbr.abbreviation; //
  newAbbreviation.value = abbr.abbreviation; //
  newExpansion.value = abbr.expansion; //
  newCaseSensitive.checked = abbr.caseSensitive || false; //

  const standardCategories = ['Comum', 'Pessoal', 'Trabalho', 'Personalizada'];
  if (abbr.category && !standardCategories.includes(abbr.category)) {
    // É uma categoria personalizada existente
    newCategory.value = 'Personalizada';
    if (customCategoryGroup) customCategoryGroup.style.display = 'block';
    if (newCustomCategoryInput) newCustomCategoryInput.value = abbr.category;
  } else {
    newCategory.value = abbr.category || 'Comum'; //
    if (customCategoryGroup) customCategoryGroup.style.display = 'none';
    if (newCustomCategoryInput) newCustomCategoryInput.value = '';
  }
  
  showAddForm(); //
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
