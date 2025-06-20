// SOTE-main/background/service-worker.js

// ===== IMPORTS =====
try {
  importScripts("../utils/constants.js");
  importScripts("../utils/db.js");
  importScripts("../utils/cache.js");
} catch (error) {
  console.error("[SOTE Service Worker] Failed to import scripts:", error);
}

// ===== CONSTANTS =====
const DEBUG_PREFIX = "[SOTE Service Worker]";
const BROADCAST_DEBOUNCE_DELAY = 100;
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY = 1000;

// ===== UTILITY FUNCTIONS =====
function log(message, ...args) {
  console.log(`${DEBUG_PREFIX} ${message}`, ...args);
}

function logError(message, error) {
  console.error(`${DEBUG_PREFIX} ${message}`, error);
}

function logWarn(message, ...args) {
  console.warn(`${DEBUG_PREFIX} ${message}`, ...args);
}

// Debounce utility for performance
function debounce(func, delay) {
  let timeoutId;
  return function (...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(this, args), delay);
  };
}

// Retry utility for resilient operations
async function retryOperation(
  operation,
  maxAttempts = MAX_RETRY_ATTEMPTS,
  delay = RETRY_DELAY
) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === maxAttempts) {
        throw error;
      }
      logWarn(
        `Operation failed (attempt ${attempt}/${maxAttempts}), retrying in ${delay}ms:`,
        error.message
      );
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

// Validate constants availability
function validateConstants() {
  if (!self.SOTE_CONSTANTS) {
    throw new Error("SOTE_CONSTANTS not available");
  }

  const required = ["STORE_ABBREVIATIONS", "STORE_RULES", "MESSAGE_TYPES"];
  for (const prop of required) {
    if (!self.SOTE_CONSTANTS[prop]) {
      throw new Error(`SOTE_CONSTANTS.${prop} not available`);
    }
  }

  return true;
}

// Validate database availability
function validateDatabase() {
  if (typeof TextExpanderDB === "undefined") {
    throw new Error("TextExpanderDB not available");
  }
  return true;
}

// ===== DEFAULT DATA =====
function getDefaultAbbreviations() {
  const timestamp = new Date().toISOString();

  return [
    {
      abbreviation: "btw",
      expansion: "by the way",
      caseSensitive: false,
      category: "Comum",
      enabled: true,
      createdAt: timestamp,
      lastUsed: null,
      usageCount: 0,
      rules: [],
    },
    {
      abbreviation: "afaik",
      expansion: "as far as I know",
      caseSensitive: false,
      category: "Comum",
      enabled: true,
      createdAt: timestamp,
      lastUsed: null,
      usageCount: 0,
      rules: [],
    },
    {
      abbreviation: "ty",
      expansion: "thank you",
      caseSensitive: false,
      category: "Comum",
      enabled: true,
      createdAt: timestamp,
      lastUsed: null,
      usageCount: 0,
      rules: [],
    },
  ];
}

// ===== DATABASE OPERATIONS =====
async function initializeDatabase() {
  try {
    validateConstants();
    validateDatabase();

    log("Initializing database...");

    // As migrações, incluindo a criação do novo 'STORE_CHOICES', são tratadas aqui
    const db = await retryOperation(() => TextExpanderDB.openDatabase());

    // Verifica a estrutura do banco de dados
    const transaction = db.transaction(
      [
        self.SOTE_CONSTANTS.STORE_ABBREVIATIONS,
        self.SOTE_CONSTANTS.STORE_RULES,
      ],
      "readonly"
    );

    const store = transaction.objectStore(
      self.SOTE_CONSTANTS.STORE_ABBREVIATIONS
    );

    // Verifica se precisa popular com dados padrão
    const existingCount = await new Promise((resolve, reject) => {
      const countRequest = store.count();
      countRequest.onsuccess = () => resolve(countRequest.result);
      countRequest.onerror = () => reject(countRequest.error);
    });

    if (existingCount === 0) {
      await seedDefaultAbbreviations();
      await SOTECache.invalidateAbbreviationsCache(); // Invalida o cache após popular
    } else {
      log(`Database already contains ${existingCount} abbreviations`);
    }

    await notifyInitializationComplete();
    log("Database initialization completed successfully");
  } catch (error) {
    logError("Failed to initialize database:", error);
    throw error;
  }
}

async function seedDefaultAbbreviations() {
  const defaultAbbreviations = getDefaultAbbreviations();
  log(`Seeding ${defaultAbbreviations.length} default abbreviations...`);

  const results = await Promise.allSettled(
    defaultAbbreviations.map(async abbr => {
      try {
        const existing = await TextExpanderDB.getAbbreviation(
          abbr.abbreviation
        );

        if (!existing) {
          await TextExpanderDB.addAbbreviation(abbr);
          log(`Added default abbreviation: "${abbr.abbreviation}"`);
          return { success: true, abbreviation: abbr.abbreviation };
        } else {
          log(`Abbreviation "${abbr.abbreviation}" already exists, skipping`);
          return {
            success: true,
            abbreviation: abbr.abbreviation,
            skipped: true,
          };
        }
      } catch (error) {
        logError(`Failed to add abbreviation "${abbr.abbreviation}":`, error);
        return { success: false, abbreviation: abbr.abbreviation, error };
      }
    })
  );

  const successful = results.filter(r => r.value?.success).length;
  const failed = results.filter(r => !r.value?.success).length;

  log(`Seeding completed: ${successful} successful, ${failed} failed`);

  if (failed > 0) {
    const failures = results
      .filter(r => !r.value?.success)
      .map(r => r.value?.abbreviation || "unknown");
    logWarn("Failed to seed abbreviations:", failures);
  }
}

async function notifyInitializationComplete() {
  try {
    await chrome.runtime.sendMessage({
      type: self.SOTE_CONSTANTS.MESSAGE_TYPES.INITIAL_SEED_COMPLETE,
    });
    log("Sent INITIAL_SEED_COMPLETE notification");
  } catch (error) {
    log("Could not send INITIAL_SEED_COMPLETE (no receivers)");
  }
}

// ===== MESSAGE HANDLERS =====
async function handleGetAbbreviations(message, sender, sendResponse) {
  try {
    validateDatabase();

    // UTILIZA O CACHE PARA OBTER OS DADOS
    const abbreviationsArray = await retryOperation(() =>
      SOTECache.getAllAbbreviations()
    );

    log(
      `Retrieved ${abbreviationsArray?.length || 0} abbreviations from cache/db`
    );

    sendResponse({
      abbreviations: abbreviationsArray || [],
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logError("Failed to get abbreviations:", error);
    sendResponse({
      error: "Failed to retrieve abbreviations",
      details: error.message,
    });
  }
}

async function handleUpdateUsage(message, sender, sendResponse) {
  try {
    validateDatabase();

    const abbreviationKey = message.abbreviation;
    if (!abbreviationKey) {
      sendResponse({ error: "Abbreviation key not provided" });
      return;
    }

    const abbrData = await retryOperation(() =>
      TextExpanderDB.getAbbreviation(abbreviationKey)
    );

    if (!abbrData) {
      sendResponse({ error: "Abbreviation not found" });
      return;
    }

    const updatedData = {
      ...abbrData,
      usageCount: (abbrData.usageCount || 0) + 1,
      lastUsed: new Date().toISOString(),
    };

    await retryOperation(() => TextExpanderDB.updateAbbreviation(updatedData));
    await SOTECache.invalidateAbbreviationsCache(); // INVALIDA O CACHE APÓS A ATUALIZAÇÃO

    log(
      `Updated usage for "${abbreviationKey}": count=${updatedData.usageCount}`
    );

    sendResponse({
      success: true,
      usageCount: updatedData.usageCount,
    });

    broadcastAbbreviationsUpdate();
  } catch (error) {
    logError("Failed to update usage stats:", error);
    sendResponse({
      error: "Failed to update usage statistics",
      details: error.message,
    });
  }
}

// Handler para buscar a configuração de uma escolha, agora usando o cache
async function handleGetChoiceConfig(message, sender, sendResponse) {
  try {
    validateDatabase();
    const choiceId = message.id;
    if (!choiceId) {
      sendResponse({ error: "ID da escolha não fornecido" });
      return;
    }

    // UTILIZA O CACHE PARA OBTER A CONFIGURAÇÃO DA ESCOLHA
    const choiceData = await SOTECache.getChoiceConfig(choiceId);

    if (choiceData) {
      sendResponse({ data: choiceData });
    } else {
      sendResponse({
        error: `Configuração de escolha com ID ${choiceId} não encontrada.`,
      });
    }
  } catch (error) {
    logError("Falha ao buscar configuração de escolha:", error);
    sendResponse({
      error: "Falha ao buscar configuração de escolha",
      details: error.message,
    });
  }
}

// ===== BROADCASTING =====
const broadcastAbbreviationsUpdate = debounce(async () => {
  try {
    const tabs = await chrome.tabs.query({});
    const results = await Promise.allSettled(
      tabs
        .filter(tab => tab.id && tab.url && !tab.url.startsWith("chrome://"))
        .map(async tab => {
          try {
            await chrome.tabs.sendMessage(tab.id, {
              type: self.SOTE_CONSTANTS.MESSAGE_TYPES.ABBREVIATIONS_UPDATED,
              timestamp: new Date().toISOString(),
            });
            return { success: true, tabId: tab.id };
          } catch (error) {
            if (
              !error.message
                ?.toLowerCase()
                .includes("receiving end does not exist")
            ) {
              logWarn(`Failed to notify tab ${tab.id}:`, error.message);
            }
            return { success: false, tabId: tab.id, error: error.message };
          }
        })
    );

    const successful = results.filter(r => r.value?.success).length;
    const total = results.length;

    if (total > 0) {
      log(`Broadcast completed: ${successful}/${total} tabs notified`);
    }
  } catch (error) {
    logError("Failed to broadcast abbreviations update:", error);
  }
}, BROADCAST_DEBOUNCE_DELAY);

async function handleSettingsUpdate(changes) {
  try {
    const tabs = await chrome.tabs.query({});
    const settings = {};

    Object.keys(changes).forEach(key => {
      if (changes[key].newValue !== undefined) {
        settings[key] = changes[key].newValue;
      }
    });

    if (Object.keys(settings).length === 0) return;

    const results = await Promise.allSettled(
      tabs
        .filter(tab => tab.id && tab.url && !tab.url.startsWith("chrome://"))
        .map(async tab => {
          try {
            await chrome.tabs.sendMessage(tab.id, {
              type: self.SOTE_CONSTANTS.MESSAGE_TYPES.SETTINGS_UPDATED,
              settings: settings,
              timestamp: new Date().toISOString(),
            });
            return { success: true, tabId: tab.id };
          } catch (error) {
            if (
              !error.message
                ?.toLowerCase()
                .includes("receiving end does not exist")
            ) {
              logWarn(
                `Failed to notify tab ${tab.id} about settings:`,
                error.message
              );
            }
            return { success: false, tabId: tab.id };
          }
        })
    );

    const successful = results.filter(r => r.value?.success).length;
    log(
      `Settings update broadcast: ${successful}/${results.length} tabs notified`
    );
  } catch (error) {
    logError("Failed to broadcast settings update:", error);
  }
}

// ===== EVENT LISTENERS =====
self.addEventListener("install", event => {
  log("Service Worker installing...");

  event.waitUntil(
    initializeDatabase().catch(error => {
      logError("Installation failed:", error);
      throw error;
    })
  );
});

self.addEventListener("activate", event => {
  log("Service Worker activating...");

  event.waitUntil(
    (async () => {
      await self.clients.claim();
      log("Service Worker activated and claimed all clients");
    })()
  );
});

// Handle runtime messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message?.type) {
    sendResponse({ error: "Message type not specified" });
    return false;
  }

  try {
    validateConstants();

    const messageType = message.type;
    const messageTypes = self.SOTE_CONSTANTS.MESSAGE_TYPES;

    switch (messageType) {
      case messageTypes.GET_ABBREVIATIONS:
        handleGetAbbreviations(message, sender, sendResponse);
        return true; // Indica resposta assíncrona

      case messageTypes.UPDATE_USAGE:
        handleUpdateUsage(message, sender, sendResponse);
        return true; // Indica resposta assíncrona

      case messageTypes.GET_CHOICE_CONFIG:
        handleGetChoiceConfig(message, sender, sendResponse);
        return true; // Indica resposta assíncrona

      default:
        log(`Unknown message type: ${messageType}`);
        sendResponse({ error: "Unknown message type" });
        return false;
    }
  } catch (error) {
    logError("Error handling message:", error);
    sendResponse({
      error: "Internal error handling message",
      details: error.message,
    });
    return false;
  }
});

// Handle storage changes
chrome.storage.onChanged.addListener(async (changes, namespace) => {
  if (namespace !== "sync") return;

  log("Storage changes detected:", Object.keys(changes));

  const settingsChanges = Object.keys(changes).reduce((obj, key) => {
    obj[key] = changes[key];
    return obj;
  }, {});

  // Como as configurações podem afetar as regras, invalidamos o cache de abreviações
  // para garantir que as regras sejam reavaliadas com as novas configs.
  await SOTECache.invalidateAbbreviationsCache();
  log("Cache invalidated due to settings change.");

  if (Object.keys(settingsChanges).length > 0) {
    handleSettingsUpdate(settingsChanges);
  }
});

// Handle extension startup
chrome.runtime.onStartup.addListener(() => {
  log("Extension startup detected");

  setTimeout(async () => {
    try {
      validateConstants();
      validateDatabase();
      await notifyInitializationComplete();
    } catch (error) {
      logError("Startup validation failed:", error);
    }
  }, 1000);
});

// Handle installation/update
chrome.runtime.onInstalled.addListener(details => {
  log(`Extension installed/updated: ${details.reason}`);

  if (details.reason === "install") {
    log("First time installation detected");
  } else if (details.reason === "update") {
    log(`Updated from version ${details.previousVersion}`);
    // Força a invalidação do cache em caso de atualização da extensão
    SOTECache.clearAll().then(() => {
      log("All caches cleared due to extension update.");
    });
  }
});

// Global error handler
self.addEventListener("error", event => {
  logError("Unhandled error in service worker:", {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    error: event.error,
  });
});

self.addEventListener("unhandledrejection", event => {
  logError("Unhandled promise rejection in service worker:", event.reason);
  event.preventDefault();
});

log("Service Worker script loaded successfully");
