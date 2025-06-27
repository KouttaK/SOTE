// SOTE-main/background/service-worker.js

// ===== IMPORTS =====
try {
  importScripts("../utils/constants.js");
  importScripts("../utils/db.js");
  importScripts("../utils/StateManager.js"); // <<< NOVO

  importScripts("modules/validations.js");
  importScripts("modules/data-handler.js");
  importScripts("modules/db-operations.js");
  importScripts("modules/broadcasting.js");
} catch (error) {
  console.error("[SOTE Service Worker] Falha ao importar scripts:", error);
}

// ===== STATE MANAGEMENT =====
let stateManager;
const DEBUG_PREFIX = "[SOTE Service Worker]";

// ===== UTILITY FUNCTIONS =====
function log(message, ...args) {
  console.log(`${DEBUG_PREFIX} ${message}`, ...args);
}

function logError(message, error) {
  console.error(`${DEBUG_PREFIX} ${message}`, error);
}

// ===== CORE LOGIC =====

/**
 * Função central para atualizar o estado. Busca os dados mais recentes do DB
 * e os atualiza no StateManager.
 */
async function refreshStateFromDB() {
  if (!stateManager) {
    logError("StateManager não inicializado. Abortando refresh.");
    return;
  }
  try {
    const abbreviations = await SoteDBOperations.getAbbreviations();
    await stateManager.setState({ abbreviations }, "REFRESH_FROM_DB");
  } catch (error) {
    logError("Falha ao recarregar o estado do DB:", error);
  }
}

/**
 * Inicializa o State Manager e o banco de dados.
 */
async function initializeApp() {
  try {
    SoteValidators.validateAll();
    log("Inicializando aplicação...");

    await TextExpanderDB.openDatabase();
    await SoteDataHandler.seedInitialDataIfNeeded();

    // Carrega o estado inicial do DB
    const [abbreviations, settings] = await Promise.all([
      SoteDBOperations.getAbbreviations(),
      chrome.storage.sync.get(),
    ]);

    const initialState = {
      abbreviations: abbreviations || [],
      settings: settings || {},
      isEnabled: settings.enabled !== false,
    };

    // Cria e configura o StateManager - CORRIGIDO
    stateManager = new self.StateManager(initialState, { enableLogging: true });

    // Inscreve o broadcaster para propagar as mudanças de estado
    stateManager.subscribe((newState, oldState) => {
      SoteBroadcaster.broadcastStateUpdate(newState);
    });

    log("Aplicação e StateManager inicializados com sucesso.");
  } catch (error) {
    logError("Falha grave na inicialização:", error);
    throw error;
  }
}

// ===== MESSAGE HANDLER =====
async function handleMessage(message, sender, sendResponse) {
  // Garante que o app está inicializado antes de processar mensagens
  if (!stateManager) {
    logWarn("StateManager ainda não pronto, aguardando inicialização...");
    await initializeApp();
  }

  const { type, payload } = message;
  // CORRIGIDO
  const { MESSAGE_TYPES } = self.SOTE_CONSTANTS;

  try {
    switch (type) {
      // --- Leitura de Estado ---
      case MESSAGE_TYPES.GET_STATE:
        sendResponse(stateManager.getState());
        break;

      // --- Operações de Abreviação ---
      case MESSAGE_TYPES.ADD_ABBREVIATION:
        await TextExpanderDB.addAbbreviation(payload);
        await refreshStateFromDB();
        sendResponse({ success: true });
        break;

      case MESSAGE_TYPES.UPDATE_ABBREVIATION:
        await TextExpanderDB.updateAbbreviation(payload);
        await refreshStateFromDB();
        sendResponse({ success: true });
        break;

      case MESSAGE_TYPES.DELETE_ABBREVIATION:
        await TextExpanderDB.deleteAbbreviation(payload.abbreviationKey);
        await refreshStateFromDB();
        sendResponse({ success: true });
        break;

      case MESSAGE_TYPES.IMPORT_ABBREVIATIONS:
        await TextExpanderDB.importAbbreviations(payload.data, payload.isMerge);
        await refreshStateFromDB();
        sendResponse({ success: true });
        break;

      case MESSAGE_TYPES.CLEAR_ALL_DATA:
        await TextExpanderDB.clearAllAbbreviations();
        await refreshStateFromDB();
        sendResponse({ success: true });
        break;

      // --- Operações de Regra ---
      case MESSAGE_TYPES.ADD_RULE:
        await TextExpanderDB.addExpansionRule(payload);
        await refreshStateFromDB();
        sendResponse({ success: true });
        break;

      case MESSAGE_TYPES.UPDATE_RULE:
        await TextExpanderDB.updateExpansionRule(payload);
        await refreshStateFromDB();
        sendResponse({ success: true });
        break;

      case MESSAGE_TYPES.DELETE_RULE:
        await TextExpanderDB.deleteExpansionRule(payload.ruleId);
        await refreshStateFromDB();
        sendResponse({ success: true });
        break;

      // --- Operações de Escolha ---
      case MESSAGE_TYPES.ADD_CHOICE:
        const newChoiceId = await TextExpanderDB.addChoice(payload.options);
        await refreshStateFromDB(); // Embora não afete abreviações, mantém consistência se necessário no futuro
        sendResponse({ success: true, newChoiceId });
        break;

      case MESSAGE_TYPES.UPDATE_CHOICE:
        await TextExpanderDB.updateChoice(payload.choiceId, payload.options);
        await refreshStateFromDB();
        sendResponse({ success: true });
        break;

      case MESSAGE_TYPES.GET_CHOICE_CONFIG:
        const choiceData = await SoteDBOperations.getChoiceConfig(message.id);
        sendResponse({ data: choiceData });
        break;

      // --- Outras Ações ---
      case MESSAGE_TYPES.UPDATE_USAGE:
        await SoteDBOperations.updateUsage(message.abbreviation);
        await refreshStateFromDB();
        sendResponse({ success: true });
        break;

      default:
        log(`Tipo de mensagem desconhecido recebido: ${type}`);
        sendResponse({ error: "Tipo de mensagem desconhecido." });
        return false; // Indica que a resposta não será assíncrona
    }
  } catch (error) {
    logError(`Erro ao processar a mensagem ${type}:`, error);
    sendResponse({
      error: "Falha ao processar a requisição.",
      details: error.message,
    });
  }

  return true; // Indica que a resposta é (ou pode ser) assíncrona
}

// ===== EVENT LISTENERS =====
self.addEventListener("install", event => {
  log("Service Worker instalando...");
  event.waitUntil(
    initializeApp().catch(err =>
      logError("Falha na inicialização durante a instalação.", err)
    )
  );
});

self.addEventListener("activate", event => {
  log("Service Worker ativando...");
  event.waitUntil(clients.claim());
});

chrome.runtime.onMessage.addListener(handleMessage);

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace !== "sync" || !stateManager) return;

  const oldSettings = stateManager.getState("settings");
  const newSettings = { ...oldSettings };
  let settingsChanged = false;

  Object.keys(changes).forEach(key => {
    if (key in oldSettings) {
      newSettings[key] = changes[key].newValue;
      settingsChanged = true;
    }
  });

  if (settingsChanged) {
    log("Mudanças no storage.sync detectadas, atualizando state manager...");
    stateManager.setState({ settings: newSettings }, "SETTINGS_SYNC_UPDATE");
    // O broadcast já é feito pelo subscribe do stateManager
  }
});
