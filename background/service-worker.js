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

        // Não é necessário transaction.done explicitamente aqui se as promessas acima cobrem os sucessos/erros
        // No entanto, para garantir que a transação finalize antes de prosseguir, podemos aguardá-la.
        // Para isso, a transação deve ser gerenciada de forma um pouco diferente ou podemos confiar no auto-commit.
        // Por simplicidade e dado que Promise.all aguarda as operações, o auto-commit geralmente funciona.
        // Se você encontrar problemas de transação inativa, envolva todo o loop de promessas
        // dentro de uma única promessa de transação.

        console.log('Database initialization with default abbreviations checked/completed.');

        chrome.runtime.sendMessage({ type: 'INITIAL_SEED_COMPLETE' }).catch(e => console.warn("Could not send INITIAL_SEED_COMPLETE message:", e));

      } catch (error) {
        console.error('Error initializing default abbreviations during install event:', error); // Esta é a linha 66 do seu erro original
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
        
        const [abbreviationsArray, rulesArray] = await Promise.all([
          new Promise((resolve, reject) => {
            const request = abbreviationsObjectStore.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          }),
          new Promise((resolve, reject) => {
            const request = rulesObjectStore.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          })
        ]);

        if (abbreviationsArray) {
          abbreviationsArray.forEach(abbr => {
            abbr.rules = rulesArray.filter(rule => rule.abbreviationId === abbr.abbreviation);
          });
          sendResponse({ abbreviations: abbreviationsArray });
        } else {
          sendResponse({ abbreviations: [] });
        }
      } catch (error) {
        console.error('Error fetching abbreviations:', error); 
        sendResponse({ error: 'Failed to retrieve abbreviations.' });
      }
    })();
    return true; 
  }
  // Adicione outros manipuladores de mensagem aqui se necessário
}); 

// Broadcast changes to all tabs
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync' && changes.abbreviations) { // Verifique se 'abbreviations' é o que realmente muda
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
const DB_VERSION = 2;
const STORE_NAME = 'abbreviations';
const RULES_STORE = 'expansionRules';

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

      if (!db.objectStoreNames.contains(RULES_STORE)) {
        const rulesStore = db.createObjectStore(RULES_STORE, { keyPath: 'id', autoIncrement: true });
        rulesStore.createIndex('abbreviationId', 'abbreviationId', { unique: false });
        rulesStore.createIndex('type', 'type', { unique: false });
      }
    };
  });
}