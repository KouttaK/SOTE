// SOTE-main/popup/popup.js
// DOM Elements
const abbreviationsList = document.getElementById("abbreviations-list");
const searchInput = document.getElementById("search-input");
const enabledToggle = document.getElementById("enabled-toggle");
const statusText = document.getElementById("status-text");
const addBtn = document.getElementById("add-btn");
const dashboardBtn = document.getElementById("dashboard-btn");

// Modal Elements
const addEditModal = document.getElementById("add-edit-modal");
const modalTitle = document.getElementById("modal-title");
const modalCloseBtn = document.getElementById("modal-close-btn");
const cancelBtn = document.getElementById("cancel-btn");
const saveBtn = document.getElementById("save-btn");
const newAbbreviationInput = document.getElementById("new-abbreviation");
const newExpansionTextarea = document.getElementById("new-expansion");
const newCategorySelect = document.getElementById("new-category");
const newCaseSensitiveCheckbox = document.getElementById("new-case-sensitive");
const customCategoryGroup = document.getElementById("custom-category-group");
const newCustomCategoryInput = document.getElementById("new-custom-category");
const insertActionButtons = document.querySelectorAll(
  "#add-edit-modal .btn-insert-action"
);
const popupInsertChoiceBtn = document.getElementById("popup-insert-choice-btn");

// State
let abbreviations = [];
let filteredAbbreviations = [];
let currentEditId = null;
let isEnabled = true;

function escapeHtml(text) {
  if (typeof text !== "string") return "";
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function createExpansionPreview(expansion) {
  if (typeof expansion !== "string") return "";

  let previewHtml = escapeHtml(expansion);

  // Usar textos mais curtos para o popup
  const choiceBadge =
    '<span class="action-preview-badge choice-badge">❓ Escolha</span>';
  previewHtml = previewHtml.replace(/\$choice\(id=\d+\)\$/g, choiceBadge);

  const cursorBadge =
    '<span class="action-preview-badge cursor-badge">📍 Cursor</span>';
  previewHtml = previewHtml.replace(/\$cursor\$/g, cursorBadge);

  const clipboardBadge =
    '<span class="action-preview-badge clipboard-badge">📋 Transf.</span>';
  previewHtml = previewHtml.replace(/\$transferencia\$/g, clipboardBadge);

  return `<div>${previewHtml}</div>`;
}

/**
 * Inserts text at the current cursor position in a textarea.
 */
function insertTextAtCursor(textarea, textToInsert) {
  if (!textarea) return;
  const startPos = textarea.selectionStart;
  const endPos = textarea.selectionEnd;
  textarea.value =
    textarea.value.substring(0, startPos) +
    textToInsert +
    textarea.value.substring(endPos);
  const newCursorPos = startPos + textToInsert.length;
  textarea.selectionStart = newCursorPos;
  textarea.selectionEnd = newCursorPos;
  textarea.focus();
}

async function performLocalRefreshPopup() {
  await loadAbbreviations();
  await loadCategories();
}

function showLoadingState() {
  abbreviationsList.innerHTML = `<div class="loading"><div class="loading-spinner"></div><p>Carregando...</p></div>`;
}

function showErrorState(message) {
  abbreviationsList.innerHTML = `<div class="empty-state"><h3>Erro</h3><p>${message}</p></div>`;
}

async function init() {
  if (
    typeof window.TextExpanderDB === "undefined" ||
    typeof SoteNotifier === "undefined" ||
    typeof SoteConfirmationModal === "undefined"
  ) {
    console.error(
      "Dependências (DB, Notifier, ConfirmationModal) não carregadas."
    );
    showErrorState("Erro ao inicializar a extensão.");
    return;
  }

  await loadAbbreviations();
  await loadCategories();

  // Event Listeners
  searchInput.addEventListener("input", handleSearch);
  enabledToggle.addEventListener("change", handleToggleEnabled);
  addBtn.addEventListener("click", () => showModal());
  dashboardBtn.addEventListener("click", openDashboard);

  // Modal Listeners
  modalCloseBtn.addEventListener("click", hideModal);
  cancelBtn.addEventListener("click", hideModal);
  saveBtn.addEventListener("click", handleSaveAbbreviation);
  addEditModal.addEventListener("click", e => {
    if (e.target === addEditModal) hideModal();
  });

  newCategorySelect.addEventListener("change", function () {
    customCategoryGroup.style.display =
      this.value === "Personalizada" ? "block" : "none";
    if (this.value === "Personalizada") newCustomCategoryInput.focus();
  });

  insertActionButtons.forEach(button => {
    // Ignora o botão de escolha que tem um handler específico
    if (button.id === "popup-insert-choice-btn") return;

    button.addEventListener("click", function () {
      const action = this.getAttribute("data-action");
      if (newExpansionTextarea && action)
        insertTextAtCursor(newExpansionTextarea, action);
    });
  });

  popupInsertChoiceBtn.addEventListener("click", () => {
    chrome.tabs.create({
      url: chrome.runtime.getURL("dashboard/dashboard.html"),
    });
    window.close();
  });

  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && !addEditModal.classList.contains("hidden")) {
      hideModal();
    }
  });

  chrome.storage.sync.get("enabled", result => {
    isEnabled = result.enabled !== false;
    enabledToggle.checked = isEnabled;
    updateStatusText();
  });

  chrome.runtime.onMessage.addListener(message => {
    if (
      message.type === SOTE_CONSTANTS.MESSAGE_TYPES.ABBREVIATIONS_UPDATED ||
      message.type === SOTE_CONSTANTS.MESSAGE_TYPES.INITIAL_SEED_COMPLETE
    ) {
      performLocalRefreshPopup();
    }
    return true;
  });
}

function updateStatusText() {
  statusText.textContent = isEnabled ? "Habilitado" : "Desabilitado";
}

async function loadAbbreviations() {
  try {
    showLoadingState();
    const freshAbbreviations = await TextExpanderDB.getAllAbbreviations();
    abbreviations = Array.isArray(freshAbbreviations) ? freshAbbreviations : [];
    filterAbbreviations();
  } catch (error) {
    console.error("Erro ao carregar abreviações:", error);
    showErrorState("Não foi possível carregar as abreviações.");
  }
}

async function loadCategories() {
  try {
    const categories = await TextExpanderDB.getAllCategories();
    const standardValues = ["Comum", "Pessoal", "Trabalho", "Personalizada"];

    // Clear old custom categories
    Array.from(newCategorySelect.options).forEach(opt => {
      if (!standardValues.includes(opt.value))
        newCategorySelect.removeChild(opt);
    });

    const personalizadaOption = newCategorySelect.querySelector(
      'option[value="Personalizada"]'
    );
    categories.forEach(category => {
      if (!newCategorySelect.querySelector(`option[value="${category}"]`)) {
        const option = document.createElement("option");
        option.value = category;
        option.textContent = category;
        newCategorySelect.insertBefore(option, personalizadaOption);
      }
    });
  } catch (error) {
    console.error("Erro ao carregar categorias:", error);
  }
}

function renderAbbreviations() {
  if (filteredAbbreviations.length === 0) {
    abbreviationsList.innerHTML = `<div class="empty-state"><h3>Nenhuma abreviação</h3><p>Comece criando sua primeira abreviação.</p></div>`;
    return;
  }

  abbreviationsList.innerHTML = "";
  filteredAbbreviations.forEach(abbr => {
    const item = document.createElement("div");
    item.className = "abbreviation-item";

    const expansionPreviewHtml = createExpansionPreview(abbr.expansion);
    const fullExpansionTitle = escapeHtml(abbr.expansion);

    item.innerHTML = `
      <div class="abbreviation-details">
        <div class="abbreviation-text">${escapeHtml(abbr.abbreviation)}</div>
        <div class="expansion-text" title="${fullExpansionTitle}">${expansionPreviewHtml}</div>
        <div class="category-badge">${escapeHtml(
          abbr.category || "Comum"
        )}</div>
      </div>
      <div class="item-actions">
        <button class="action-btn edit-btn" title="Editar"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg></button>
        <button class="action-btn delete-btn" title="Excluir"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6z"></path><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
      </div>
    `;

    item
      .querySelector(".edit-btn")
      .addEventListener("click", () => handleEditAbbreviation(abbr));
    item
      .querySelector(".delete-btn")
      .addEventListener("click", () =>
        handleDeleteAbbreviation(abbr.abbreviation)
      );

    abbreviationsList.appendChild(item);
  });
}

function filterAbbreviations() {
  const searchTerm = searchInput.value.trim().toLowerCase();
  filteredAbbreviations =
    searchTerm === ""
      ? [...abbreviations]
      : abbreviations.filter(
          abbr =>
            abbr.abbreviation.toLowerCase().includes(searchTerm) ||
            abbr.expansion.toLowerCase().includes(searchTerm) ||
            (abbr.category && abbr.category.toLowerCase().includes(searchTerm))
        );
  renderAbbreviations();
}

function handleSearch() {
  filterAbbreviations();
}

function handleToggleEnabled() {
  isEnabled = enabledToggle.checked;
  updateStatusText();
  chrome.storage.sync.set({ enabled: isEnabled });
}

function showModal(abbr = null) {
  if (abbr) {
    currentEditId = abbr.abbreviation;
    modalTitle.textContent = "Editar Abreviação";
    newAbbreviationInput.value = abbr.abbreviation;
    newAbbreviationInput.readOnly = true;
    newExpansionTextarea.value = abbr.expansion;
    newCaseSensitiveCheckbox.checked = abbr.caseSensitive || false;

    const isStandardCategory = [
      "Comum",
      "Pessoal",
      "Trabalho",
      "Personalizada",
    ].includes(abbr.category);
    if (!isStandardCategory && abbr.category) {
      if (
        !newCategorySelect.querySelector(`option[value="${abbr.category}"]`)
      ) {
        const option = document.createElement("option");
        option.value = abbr.category;
        option.textContent = abbr.category;
        newCategorySelect.insertBefore(
          option,
          newCategorySelect.querySelector('option[value="Personalizada"]')
        );
      }
      newCategorySelect.value = abbr.category;
      customCategoryGroup.style.display = "none";
      newCustomCategoryInput.value = "";
    } else {
      newCategorySelect.value = abbr.category || "Comum";
      customCategoryGroup.style.display = "none";
      newCustomCategoryInput.value = "";
    }
  } else {
    currentEditId = null;
    modalTitle.textContent = "Adicionar Nova Abreviação";
    newAbbreviationInput.value = "";
    newAbbreviationInput.readOnly = false;
    newExpansionTextarea.value = "";
    newCaseSensitiveCheckbox.checked = false;
    newCategorySelect.value = "Comum";
    customCategoryGroup.style.display = "none";
    newCustomCategoryInput.value = "";
  }
  addEditModal.classList.remove("hidden");
  setTimeout(() => newAbbreviationInput.focus(), 50);
}

function hideModal() {
  addEditModal.classList.add("hidden");
}

function openDashboard() {
  chrome.tabs.create({
    url: chrome.runtime.getURL("dashboard/dashboard.html"),
  });
  window.close();
}

async function handleSaveAbbreviation() {
  const abbreviation = newAbbreviationInput.value.trim();
  const expansion = newExpansionTextarea.value.trim();
  let category = newCategorySelect.value;

  if (!abbreviation || !expansion) {
    SoteNotifier.show("Abreviação e expansão são obrigatórias.", "error");
    return;
  }

  if (category === "Personalizada") {
    category = newCustomCategoryInput.value.trim();
    if (!category) {
      SoteNotifier.show(
        "O nome da categoria personalizada é obrigatório.",
        "error"
      );
      return;
    }
  }

  const abbrData = {
    abbreviation,
    expansion,
    category,
    caseSensitive: newCaseSensitiveCheckbox.checked,
    enabled: true,
  };

  try {
    if (currentEditId) {
      await TextExpanderDB.updateAbbreviation(abbrData);
      SoteNotifier.show("Abreviação atualizada!", "success");
    } else {
      await TextExpanderDB.addAbbreviation(abbrData);
      SoteNotifier.show("Abreviação criada!", "success");
    }
    await performLocalRefreshPopup();
    hideModal();
  } catch (error) {
    console.error("Erro ao salvar:", error);
    SoteNotifier.show(
      error.message.includes("Key already exists")
        ? "Essa abreviação já existe."
        : "Erro ao salvar.",
      "error"
    );
  }
}

function handleEditAbbreviation(abbr) {
  showModal(abbr);
}

function handleDeleteAbbreviation(abbreviationKey) {
  SoteConfirmationModal.show({
    title: "Excluir Abreviação",
    message: `Você tem certeza que quer excluir a abreviação "<strong>${escapeHtml(
      abbreviationKey
    )}</strong>"? Esta ação não pode ser desfeita.`,
    onConfirm: async () => {
      try {
        await TextExpanderDB.deleteAbbreviation(abbreviationKey);
        SoteNotifier.show("Abreviação excluída.", "success");
        await performLocalRefreshPopup();
      } catch (error) {
        console.error("Erro ao excluir:", error);
        SoteNotifier.show("Erro ao excluir abreviação.", "error");
      }
    },
  });
}

document.addEventListener("DOMContentLoaded", init);
