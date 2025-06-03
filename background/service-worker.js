// Initialize the database when the extension is installed
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const db = await openDatabase();
      
      // Add some example abbreviations
      const transaction = db.transaction('abbreviations', 'readwrite');
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
          usageCount: 0
        },
        { 
          abbreviation: 'afaik', 
          expansion: 'as far as I know',
          caseSensitive: false,
          category: 'Comum',
          enabled: true,
          createdAt: new Date().toISOString(),
          lastUsed: null,
          usageCount: 0
        },
        { 
          abbreviation: 'ty', 
          expansion: 'thank you',
          caseSensitive: false,
          category: 'Comum',
          enabled: true,
          createdAt: new Date().toISOString(),
          lastUsed: null,
          usageCount: 0
        }
      ];
      
      for (const abbr of defaultAbbreviations) {
        await store.add(abbr);
      }
      
      await transaction.complete;
      console.log('Banco de dados inicializado com abreviações padrão');
    })()
  );
});

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_ABBREVIATIONS') {
    (async () => {
      try {
        const db = await openDatabase(); // Definido em service-worker.js
        const transaction = db.transaction('abbreviations', 'readonly');
        const store = transaction.objectStore('abbreviations');
        const getAllRequest = store.getAll();

        getAllRequest.onsuccess = () => {
          if (getAllRequest.result) {
            sendResponse({ abbreviations: getAllRequest.result });
          } else {
            // Envia um array vazio se não houver resultados para evitar erros no content script
            sendResponse({ abbreviations: [] });
          }
        };
        getAllRequest.onerror = (event) => {
          console.error('Erro em getAllRequest:', event.target.error);
          sendResponse({ error: 'Falha ao recuperar abreviações.' });
        };
      } catch (error) {
        console.error('Erro ao buscar abreviações:', error);
        sendResponse({ error: error.message });
      }
    })();
    return true; // Indica que a resposta será enviada de forma assíncrona
  }

  if (message.type === 'UPDATE_USAGE') {
    const { abbreviation: abbreviationKey } = message; // Renomeia para evitar conflito

    (async () => {
      try {
        const db = await openDatabase();
        const transaction = db.transaction('abbreviations', 'readwrite');
        const store = transaction.objectStore('abbreviations');
        const getRequest = store.get(abbreviationKey);

        getRequest.onsuccess = () => {
          const abbr = getRequest.result;
          if (abbr) {
            abbr.usageCount = (abbr.usageCount || 0) + 1;
            abbr.lastUsed = new Date().toISOString();
            const putRequest = store.put(abbr);
            putRequest.onsuccess = () => {
              // Opcional: log de sucesso
              // console.log('Usage updated for:', abbreviationKey);
            };
            putRequest.onerror = (event) => {
              console.error('Erro ao colocar abreviação atualizada:', event.target.error);
            };
          }
        };
        getRequest.onerror = (event) => {
          console.error('Erro ao obter abr para atualização:', event.target.error);
        };
        
        transaction.onerror = (event) => {
            console.error('Erro de transação durante atualização de uso:', event.target.error);
        };

      } catch (error) {
        console.error('Error updating usage statistics:', error);
      }
    })();
    // Não é necessário enviar uma resposta, então `return false` ou nada é adequado.
    return false; 
  }
  
  // Outros manipuladores de mensagens podem vir aqui
});

// Broadcast changes to all tabs
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync' && changes.abbreviations) {
    chrome.tabs.query({}, tabs => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, { 
          type: 'ABBREVIATIONS_UPDATED' 
        }).catch(() => {
          // Ignore errors for tabs that can't receive messages
        });
      });
    });
  }
});

// Database utility functions
const DB_NAME = 'textExpander';
const DB_VERSION = 1;
const STORE_NAME = 'abbreviations';

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => {
      reject(new Error('Failed to open database'));
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
    };
  });
}
