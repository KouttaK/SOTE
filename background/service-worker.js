// SOTE-main/background/service-worker.js
// Initialize the database when the extension is installed
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const db = await openDatabase();
        const transaction = db.transaction(['abbreviations', 'expansionRules'], 'readwrite');
        const store = transaction.objectStore('abbreviations');

        const defaultAbbreviations = [
          { 
            abbreviation: 'btw', 
            expansion: 'by the way',
            caseSensitive: false,
            category: 'Comum',
            enabled: true,
            createdAt: new Date().toISOString(),
            lastUsed: null,
            usageCount: 0,
            rules: [] // Adicionado para consistência com a estrutura de dados esperada
          },
          { 
            abbreviation: 'afaik', 
            expansion: 'as far as I know',
            caseSensitive: false,
            category: 'Comum',
            enabled: true,
            createdAt: new Date().toISOString(),
            lastUsed: null,
            usageCount: 0,
            rules: [] // Adicionado
          },
          { 
            abbreviation: 'ty', 
            expansion: 'thank you',
            caseSensitive: false,
            category: 'Comum',
            enabled: true,
            createdAt: new Date().toISOString(),
            lastUsed: null,
            usageCount: 0,
            rules: [] // Adicionado
          }
        ];
        
        const addPromises = defaultAbbreviations.map(abbr => {
          return new Promise((resolve, reject) => {
            // Verifica se a abreviação já existe
            const getRequest = store.get(abbr.abbreviation);
            getRequest.onsuccess = () => {
              if (getRequest.result === undefined) {
                // A abreviação não existe, então adiciona
                const addRequest = store.add(abbr);
                addRequest.onsuccess = () => {
                  console.log(`Default abbreviation "${abbr.abbreviation}" added.`);
                  resolve();
                };
                addRequest.onerror = () => {
                  reject(new Error(`Falha ao adicionar ${abbr.abbreviation}: ${addRequest.error?.message}`));
                };
              } else {
                // A abreviação já existe, pula a adição
                console.log(`Default abbreviation "${abbr.abbreviation}" already exists. Skipping.`);
                resolve(); // Resolve para não bloquear Promise.all
              }
            };
            getRequest.onerror = () => {
              reject(new Error(`Falha ao verificar existência de ${abbr.abbreviation}: ${getRequest.error?.message}`));
            };
          });
        });
        
        await Promise.all(addPromises);

        console.log('Database initialization with default abbreviations checked/completed.');

        chrome.runtime.sendMessage({ type: 'INITIAL_SEED_COMPLETE' }).catch(e => console.warn("Could not send INITIAL_SEED_COMPLETE message:", e));

      } catch (error) {
        console.error('Error initializing default abbreviations during install event:', error);
        throw error; 
      }
    })()
  );
});

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_ABBREVIATIONS') {
    (async () => {
      try {
        const db = await openDatabase();
        const transaction = db.transaction(['abbreviations', 'expansionRules'], 'readonly');
        const abbreviationsObjectStore = transaction.objectStore('abbreviations');
        const rulesObjectStore = transaction.objectStore('expansionRules');
        
        console.log('[SOTE Service Worker DEBUG] Iniciando GET_ABBREVIATIONS');

        const [abbreviationsArray, rulesArray] = await Promise.all([
          new Promise((resolve, reject) => {
            const request = abbreviationsObjectStore.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = (e) => { 
              console.error('[SOTE Service Worker DEBUG] Erro ao buscar abreviações:', e.target.error);
              reject(request.error);
            }
          }),
          new Promise((resolve, reject) => {
            const request = rulesObjectStore.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = (e) => { 
              console.error('[SOTE Service Worker DEBUG] Erro ao buscar regras:', e.target.error);
              reject(request.error);
            }
          })
        ]);

        try {
            console.log('[SOTE Service Worker DEBUG] Abreviações do DB:', abbreviationsArray ? JSON.parse(JSON.stringify(abbreviationsArray)) : 'Nenhuma');
            console.log('[SOTE Service Worker DEBUG] Regras do DB:', rulesArray ? JSON.parse(JSON.stringify(rulesArray)) : 'Nenhuma');
        } catch (e) {
            console.warn('[SOTE Service Worker DEBUG] Erro ao fazer stringify dos dados do DB para log:', e);
            console.log('[SOTE Service Worker DEBUG] Abreviações do DB (raw):', abbreviationsArray);
            console.log('[SOTE Service Worker DEBUG] Regras do DB (raw):', rulesArray);
        }


        if (abbreviationsArray) {
          abbreviationsArray.forEach(abbr => {
            abbr.rules = rulesArray.filter(rule => rule.abbreviationId === abbr.abbreviation);
            
            console.log(`[SOTE Service Worker DEBUG] Para abbr '${abbr.abbreviation}':`, 
                        `abbr.rules atribuído como tipo: ${typeof abbr.rules},`, 
                        `é array? ${Array.isArray(abbr.rules)},`, 
                        `tamanho: ${Array.isArray(abbr.rules) ? abbr.rules.length : 'N/A'}`);
            if (abbr.abbreviation === 'btw') { 
                try {
                    console.log(`[SOTE Service Worker DEBUG] Detalhe de abbr.rules para 'btw':`, JSON.parse(JSON.stringify(abbr.rules)));
                } catch (e) {
                    console.warn('[SOTE Service Worker DEBUG] Erro ao fazer stringify de abbr.rules para btw:', e);
                    console.log(`[SOTE Service Worker DEBUG] Detalhe de abbr.rules para 'btw' (raw):`, abbr.rules);
                }
            }
          });
          try {
            console.log('[SOTE Service Worker DEBUG] abbreviationsArray FINAL para enviar:', JSON.parse(JSON.stringify(abbreviationsArray)));
          } catch (e) {
            console.warn('[SOTE Service Worker DEBUG] Erro ao fazer stringify do abbreviationsArray final:', e);
            console.log('[SOTE Service Worker DEBUG] abbreviationsArray FINAL para enviar (raw):', abbreviationsArray);
          }
          sendResponse({ abbreviations: abbreviationsArray });
        } else {
          console.log('[SOTE Service Worker DEBUG] Nenhuma abreviação encontrada no DB, enviando array vazio.');
          sendResponse({ abbreviations: [] });
        }
      } catch (error) {
        console.error('[SOTE Service Worker DEBUG] Erro em GET_ABBREVIATIONS:', error); 
        sendResponse({ error: 'Falha ao recuperar abreviações.' });
      }
    })();
    return true; 
  } else if (message.type === 'UPDATE_USAGE') { // Added handler for UPDATE_USAGE
    (async () => {
      const abbreviationKey = message.abbreviation;
      if (!abbreviationKey) {
        sendResponse({ error: 'Abbreviation key not provided for UPDATE_USAGE.' });
        return;
      }
      try {
        const db = await openDatabase(); // Uses service worker's openDatabase
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        
        const request = store.get(abbreviationKey);
        
        request.onerror = (event) => {
          console.error('Failed to get abbreviation for usage update:', event.target.error);
          sendResponse({ error: 'Failed to get abbreviation for update.' });
        };
        
        request.onsuccess = () => {
          const data = request.result;
          if (data) {
            data.usageCount = (data.usageCount || 0) + 1;
            data.lastUsed = new Date().toISOString();
            
            const updateRequest = store.put(data);
            updateRequest.onerror = (event) => {
              console.error('Failed to update abbreviation usage:', event.target.error);
              sendResponse({ error: 'Failed to update abbreviation usage.' });
            };
            updateRequest.onsuccess = () => {
              sendResponse({ success: true });
              // After successfully updating, broadcast that abbreviations data has changed
              // This is important for other parts like popup/dashboard to refresh
              chrome.runtime.sendMessage({ type: 'ABBREVIATIONS_UPDATED' })
                .catch(e => console.warn("SW: Could not send ABBREVIATIONS_UPDATED after usage update:", e));
            };
          } else {
            sendResponse({ error: 'Abbreviation not found for update.' });
          }
        };
      } catch (error) {
        console.error('Error updating usage stats:', error);
        sendResponse({ error: 'Error updating usage stats.' });
      }
    })();
    return true; // Indicate asynchronous response
  }
  // Not returning true for other message types if they are synchronous or don't send a response
}); 

// Broadcast changes to all tabs
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync' && changes.abbreviations) { // This listener might be for an older storage mechanism or a different feature.
                                                       // The current issue is with IndexedDB updates.
                                                       // For IndexedDB changes, the ABBREVIATIONS_UPDATED message is sent explicitly.
    chrome.tabs.query({}, tabs => {
      tabs.forEach(tab => {
        if (tab.id) { 
            chrome.tabs.sendMessage(tab.id, { 
            type: 'ABBREVIATIONS_UPDATED' 
            }).catch((error) => { 
            if (error.message && !error.message.toLowerCase().includes('receiving end does not exist')) {
                console.warn(`Erro ao enviar mensagem ABBREVIATIONS_UPDATED para tab ${tab.id}:`, error);
            }
            });
        }
      });
    });
  }
});

// Database utility functions
const DB_NAME = 'textExpander';
const DB_VERSION = 2;
const STORE_NAME = 'abbreviations';
const RULES_STORE = 'expansionRules';

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = (event) => { 
      console.error('Falha ao abrir banco de dados', event.target.error);
      reject(new Error('Falha ao abrir banco de dados'));
    };
    
    request.onsuccess = (event) => {
      resolve(event.target.result);
    };
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'abbreviation' });
        store.createIndex('category', 'category', { unique: false });
        store.createIndex('enabled', 'enabled', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
        store.createIndex('lastUsed', 'lastUsed', { unique: false });
        store.createIndex('usageCount', 'usageCount', { unique: false });
      }

      if (!db.objectStoreNames.contains(RULES_STORE)) {
        const rulesStore = db.createObjectStore(RULES_STORE, { keyPath: 'id', autoIncrement: true });
        rulesStore.createIndex('abbreviationId', 'abbreviationId', { unique: false });
        rulesStore.createIndex('type', 'type', { unique: false });
      }
    };
  });
}