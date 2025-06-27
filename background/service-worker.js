// SOTE-main/background/service-worker.js

// ===== IMPORTS =====
try {
  // Scripts de Utilitários e DB
  importScripts("../utils/constants.js");
  importScripts("../utils/db.js");

  // Módulos refatorados
  importScripts("modules/validations.js");
  importScripts("modules/data-handler.js");
  importScripts("modules/db-operations.js");
  importScripts("modules/broadcasting.js");
} catch (error) {
  console.error("[SOTE Service Worker] Falha ao importar scripts:", error);
}

// ===== CONSTANTS =====
const DEBUG_PREFIX = "[SOTE Service Worker]";

// ===== UTILITY FUNCTIONS =====
function log(message, ...args) {
  console.log(`${DEBUG_PREFIX} ${message}`, ...args);
}

function logError(message, error) {
  console.error(`${DEBUG_PREFIX} ${message}`, error);
}

// ===== DATABASE INITIALIZATION =====
async function initializeDatabase() {
  try {
    SoteValidators.validateAll();
    log("Inicializando banco de dados...");

    // As migrações são tratadas dentro de TextExpanderDB.openDatabase
    await TextExpanderDB.openDatabase();

    // Popula com dados padrão se necessário
    await SoteDataHandler.seedInitialDataIfNeeded();

    await SoteBroadcaster.notifyInitializationComplete();
    log("Inicialização do banco de dados concluída com sucesso.");
  } catch (error) {
    logError("Falha ao inicializar o banco de dados:", error);
    throw error;
  }
}

// ===== MESSAGE HANDLERS =====
async function handleGetAbbreviations(sendResponse) {
  try {
    const abbreviations = await SoteDBOperations.getAbbreviations();
    sendResponse({
      abbreviations: abbreviations,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    sendResponse({
      error: "Falha ao recuperar abreviações.",
      details: error.message,
    });
  }
}

async function handleUpdateUsage(message, sendResponse) {
  try {
    const result = await SoteDBOperations.updateUsage(message.abbreviation);
    sendResponse(result);
    // Dispara o broadcast após a resposta ser enviada
    SoteBroadcaster.broadcastAbbreviationsUpdate();
  } catch (error) {
    sendResponse({
      error: "Falha ao atualizar estatísticas de uso.",
      details: error.message,
    });
  }
}

async function handleGetChoiceConfig(message, sendResponse) {
  try {
    const choiceData = await SoteDBOperations.getChoiceConfig(message.id);
    sendResponse({ data: choiceData });
  } catch (error) {
    sendResponse({
      error: "Falha ao buscar configuração de escolha.",
      details: error.message,
    });
  }
}

// ===== EVENT LISTENERS =====

// Instalação do Service Worker
self.addEventListener("install", event => {
  log("Service Worker instalando...");
  event.waitUntil(
    initializeDatabase().catch(error => {
      logError("Falha na instalação:", error);
      // Não relançar o erro para não impedir a instalação
    })
  );
});

// Ativação do Service Worker
self.addEventListener("activate", event => {
  log("Service Worker ativando...");
  event.waitUntil(
    self.clients.claim().then(() => {
      log("Service Worker ativado e controlando todos os clientes.");
    })
  );
});

// Listener principal de mensagens
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message?.type) {
    sendResponse({ error: "Tipo de mensagem não especificado." });
    return false;
  }

  try {
    SoteValidators.validateConstants();
    const { MESSAGE_TYPES } = self.SOTE_CONSTANTS;

    switch (message.type) {
      case MESSAGE_TYPES.GET_ABBREVIATIONS:
        handleGetAbbreviations(sendResponse);
        return true; // Resposta assíncrona

      case MESSAGE_TYPES.UPDATE_USAGE:
        handleUpdateUsage(message, sendResponse);
        return true; // Resposta assíncrona

      case MESSAGE_TYPES.GET_CHOICE_CONFIG:
        handleGetChoiceConfig(message, sendResponse);
        return true; // Resposta assíncrona

      default:
        log(`Tipo de mensagem desconhecido: ${message.type}`);
        sendResponse({ error: "Tipo de mensagem desconhecido." });
        return false;
    }
  } catch (error) {
    logError("Erro ao manipular mensagem:", error);
    sendResponse({
      error: "Erro interno ao manipular mensagem.",
      details: error.message,
    });
    return false;
  }
});

// Listener para mudanças no storage
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace !== "sync") return;
  log("Mudanças no storage detectadas:", Object.keys(changes));

  if (changes.abbreviations) {
    // Embora não usado diretamente, mantém a lógica
    SoteBroadcaster.broadcastAbbreviationsUpdate();
  }

  const settingsChanges = Object.keys(changes)
    .filter(key => key !== "abbreviations")
    .reduce((obj, key) => ({ ...obj, [key]: changes[key] }), {});

  if (Object.keys(settingsChanges).length > 0) {
    SoteBroadcaster.broadcastSettingsUpdate(settingsChanges);
  }
});

// Inicialização da extensão
chrome.runtime.onStartup.addListener(() => {
  log("Extensão iniciada.");
  // Uma pequena espera para garantir que outras partes estejam prontas
  setTimeout(() => SoteValidators.validateAll().catch(() => {}), 1000);
});

// Instalação/Atualização da extensão
chrome.runtime.onInstalled.addListener(details => {
  log(`Extensão instalada/atualizada: ${details.reason}`);
  if (details.reason === "install") {
    log("Detectada primeira instalação.");
  } else if (details.reason === "update") {
    log(`Atualizado da versão ${details.previousVersion}`);
  }
});

// Handlers de Erro Globais
self.addEventListener("error", event => {
  logError("Erro não tratado no service worker:", {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    error: event.error,
  });
});

self.addEventListener("unhandledrejection", event => {
  logError("Promise rejection não tratada no service worker:", event.reason);
  event.preventDefault();
});

log("Script do Service Worker carregado com sucesso.");
