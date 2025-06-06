// SOTE-main/background/service-worker.js

// Importar o script de banco de dados para o contexto do Service Worker
importScripts('utils/db.js');

// Initialize the database when the extension is installed
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      try {
        // Usa TextExpanderDB diretamente do escopo global do Service Worker
        const db = await TextExpanderDB.openDatabase();
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
            rules: [] 
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
            rules: [] 
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
            rules: [] 
          }
        ];
        
        const addPromises = defaultAbbreviations.map(abbr => {
          return new Promise((resolve, reject) => {
            const getRequest = store.get(abbr.abbreviation);
            getRequest.onsuccess = () => {
              if (getRequest.result === undefined) {
                // Usa TextExpanderDB.addAbbreviation para garantir validação e notificação
                TextExpanderDB.addAbbreviation(abbr)
                  .then(() => {
                    console.log(`Default abbreviation "${abbr.abbreviation}" added.`);
                    resolve();
                  })
                  .catch(error => {
                    reject(new Error(`Falha ao adicionar ${abbr.abbreviation} via TextExpanderDB: ${error?.message}`));
                  });
              } else {
                console.log(`Default abbreviation "${abbr.abbreviation}" already exists. Skipping.`);
                resolve();
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
      }
    })()
  );
});

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_ABBREVIATIONS') {
    (async () => {
      try {
        const abbreviationsArray = await TextExpanderDB.getAllAbbreviations();
        
        console.log('[SOTE Service Worker DEBUG] Abreviações do DB:', abbreviationsArray);
        
        if (abbreviationsArray) {
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
  } else if (message.type === 'UPDATE_USAGE') {
    (async () => {
      const abbreviationKey = message.abbreviation;
      if (!abbreviationKey) {
        sendResponse({ error: 'Abbreviation key not provided for UPDATE_USAGE.' });
        return;
      }
      try {
        const abbrData = await TextExpanderDB.getAbbreviation(abbreviationKey);
        
        if (abbrData) {
          abbrData.usageCount = (abbrData.usageCount || 0) + 1;
          abbrData.lastUsed = new Date().toISOString();
          
          await TextExpanderDB.updateAbbreviation(abbrData);
          
          sendResponse({ success: true });
          chrome.runtime.sendMessage({ type: 'ABBREVIATIONS_UPDATED' })
            .catch(e => console.warn("SW: Could not send ABBREVIATIONS_UPDATED after usage update:", e));
        } else {
          sendResponse({ error: 'Abbreviation not found for update.' });
        }
      } catch (error) {
        console.error('Error updating usage stats:', error);
        sendResponse({ error: 'Error updating usage stats.' });
      }
    })();
    return true;
  }
}); 

// Broadcast changes to all tabs
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync' && changes.abbreviations) { 
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