// SOTE-main/background/service-worker.js

// ===== IMPORTS =====
try {
  importScripts("../utils/constants.js");
  importScripts("../utils/db.js");
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
    {
      abbreviation: "omg",
      expansion: "oh my god",
      caseSensitive: false,
      category: "Comum",
      enabled: true,
      createdAt: timestamp,
      lastUsed: null,
      usageCount: 0,
      rules: [],
    },
    {
      abbreviation: "brb",
      expansion: "be right back",
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

    const db = await retryOperation(() => TextExpanderDB.openDatabase());

    // Verify database structure
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

    // Check if we need to seed default data
    const existingCount = await new Promise((resolve, reject) => {
      const countRequest = store.count();
      countRequest.onsuccess = () => resolve(countRequest.result);
      countRequest.onerror = () => reject(countRequest.error);
    });

    if (existingCount === 0) {
      await seedDefaultAbbreviations();
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
        // Check if abbreviation already exists
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
    // This is expected if no content scripts are listening yet
    log("Could not send INITIAL_SEED_COMPLETE (no receivers)");
  }
}

// ===== MESSAGE HANDLERS =====
async function handleGetAbbreviations(message, sender, sendResponse) {
  try {
    validateDatabase();

    const abbreviationsArray = await retryOperation(() =>
      TextExpanderDB.getAllAbbreviations()
    );

    log(
      `Retrieved ${abbreviationsArray?.length || 0} abbreviations from database`
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

    // Update usage statistics
    const updatedData = {
      ...abbrData,
      usageCount: (abbrData.usageCount || 0) + 1,
      lastUsed: new Date().toISOString(),
    };

    await retryOperation(() => TextExpanderDB.updateAbbreviation(updatedData));

    log(
      `Updated usage for "${abbreviationKey}": count=${updatedData.usageCount}`
    );

    sendResponse({
      success: true,
      usageCount: updatedData.usageCount,
    });

    // Broadcast update to content scripts
    broadcastAbbreviationsUpdate();
  } catch (error) {
    logError("Failed to update usage stats:", error);
    sendResponse({
      error: "Failed to update usage statistics",
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
            // Ignore tabs that don't have content scripts
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

    // Extract relevant settings from changes
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
      // Clean up old caches if needed
      // Take control of all clients immediately
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
        return true; // Indicates async response

      case messageTypes.UPDATE_USAGE:
        handleUpdateUsage(message, sender, sendResponse);
        return true; // Indicates async response

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
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace !== "sync") return;

  log("Storage changes detected:", Object.keys(changes));

  // Handle abbreviations changes
  if (changes.abbreviations) {
    broadcastAbbreviationsUpdate();
  }

  // Handle settings changes (excluding abbreviations)
  const settingsChanges = Object.keys(changes)
    .filter(key => key !== "abbreviations")
    .reduce((obj, key) => {
      obj[key] = changes[key];
      return obj;
    }, {});

  if (Object.keys(settingsChanges).length > 0) {
    handleSettingsUpdate(settingsChanges);
  }
});

// Handle extension startup
chrome.runtime.onStartup.addListener(() => {
  log("Extension startup detected");

  // Verify database and constants are available
  setTimeout(async () => {
    try {
      validateConstants();
      validateDatabase();

      // Optionally refresh abbreviations cache
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
  event.preventDefault(); // Prevent the default handling
});

log("Service Worker script loaded successfully");
