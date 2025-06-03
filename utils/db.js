// Database utility functions
(function(window) {
  'use strict';

  const DB_NAME = 'textExpander';
  const DB_VERSION = 2;
  const STORE_NAME = 'abbreviations';
  const RULES_STORE = 'expansionRules';

  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      
      request.onerror = () => {
        console.error('Failed to open database', request.error);
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

  // Export database functions to global scope
  window.TextExpanderDB = {
    openDatabase,

    async getAllAbbreviations() {
      const db = await openDatabase();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME, RULES_STORE], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const rulesStore = transaction.objectStore(RULES_STORE);
        
        Promise.all([
          new Promise((res, rej) => {
            const request = store.getAll();
            request.onsuccess = () => res(request.result);
            request.onerror = () => rej(new Error('Failed to get abbreviations'));
          }),
          new Promise((res, rej) => {
            const request = rulesStore.getAll();
            request.onsuccess = () => res(request.result);
            request.onerror = () => rej(new Error('Failed to get rules'));
          })
        ]).then(([abbreviations, rules]) => {
          // Attach rules to their corresponding abbreviations
          abbreviations.forEach(abbr => {
            abbr.rules = rules.filter(rule => rule.abbreviationId === abbr.abbreviation);
          });
          resolve(abbreviations);
        }).catch(reject);
      });
    },

    async addExpansionRule(rule) {
      const db = await openDatabase();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(RULES_STORE, 'readwrite');
        const store = transaction.objectStore(RULES_STORE);
        
        const request = store.add(rule);
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => {
          console.error('Failed to add rule', request.error);
          reject(new Error('Failed to add rule'));
        };
        
        transaction.oncomplete = () => {
          chrome.runtime.sendMessage({ type: 'ABBREVIATIONS_UPDATED' });
        };
      });
    },

    async updateExpansionRule(rule) {
      const db = await openDatabase();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(RULES_STORE, 'readwrite');
        const store = transaction.objectStore(RULES_STORE);
        
        const request = store.put(rule);
        
        request.onsuccess = () => resolve();
        request.onerror = () => {
          console.error('Failed to update rule', request.error);
          reject(new Error('Failed to update rule'));
        };
        
        transaction.oncomplete = () => {
          chrome.runtime.sendMessage({ type: 'ABBREVIATIONS_UPDATED' });
        };
      });
    },

    async deleteExpansionRule(ruleId) {
      const db = await openDatabase();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(RULES_STORE, 'readwrite');
        const store = transaction.objectStore(RULES_STORE);
        
        const request = store.delete(ruleId);
        
        request.onsuccess = () => resolve();
        request.onerror = () => {
          console.error('Failed to delete rule', request.error);
          reject(new Error('Failed to delete rule'));
        };
        
        transaction.oncomplete = () => {
          chrome.runtime.sendMessage({ type: 'ABBREVIATIONS_UPDATED' });
        };
      });
    },

    async addAbbreviation(abbreviation) {
      const db = await openDatabase();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        
        if (!abbreviation.createdAt) {
          abbreviation.createdAt = new Date().toISOString();
        }
        if (abbreviation.usageCount === undefined) {
          abbreviation.usageCount = 0;
        }
        if (abbreviation.lastUsed === undefined) {
          abbreviation.lastUsed = null;
        }
        if (abbreviation.enabled === undefined) {
            abbreviation.enabled = true;
        }
        
        const request = store.add(abbreviation);
        
        request.onsuccess = () => resolve();
        request.onerror = () => {
            console.error('Failed to add abbreviation', request.error);
            reject(new Error('Failed to add abbreviation'));
        };
        
        transaction.oncomplete = () => {
          chrome.runtime.sendMessage({ type: 'ABBREVIATIONS_UPDATED' });
        };
      });
    },

    async updateAbbreviation(abbreviation) {
      const db = await openDatabase();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);

        // Ensure essential fields have defaults or are preserved.
        // createdAt should ideally be set by the caller if updating an existing record,
        // or set here if it's missing (e.g. if 'update' is used as an upsert for a new item).
        if (!abbreviation.createdAt) {
          abbreviation.createdAt = new Date().toISOString();
        }
        if (abbreviation.usageCount === undefined) {
          abbreviation.usageCount = 0;
        }
        if (abbreviation.lastUsed === undefined) {
          // For updates, if lastUsed is explicitly passed as null, respect it.
          // If it's undefined, it implies it wasn't touched or is new, so null is fine.
          abbreviation.lastUsed = abbreviation.lastUsed === undefined ? null : abbreviation.lastUsed;
        }
        if (abbreviation.enabled === undefined) {
          abbreviation.enabled = true;
        }
        // category can be handled similarly if needed, but is usually provided.

        const request = store.put(abbreviation); // .put() will add or update.
        
        request.onsuccess = () => resolve();
        request.onerror = () => {
            console.error('Failed to update abbreviation', request.error);
            reject(new Error('Failed to update abbreviation'));
        };
        
        transaction.oncomplete = () => {
          chrome.runtime.sendMessage({ type: 'ABBREVIATIONS_UPDATED' });
        };
      });
    },

    async deleteAbbreviation(abbreviationKey) {
      const db = await openDatabase();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(abbreviationKey);
        
        request.onsuccess = () => resolve();
        request.onerror = () => {
            console.error('Failed to delete abbreviation', request.error);
            reject(new Error('Failed to delete abbreviation'));
        };
        
        transaction.oncomplete = () => {
          chrome.runtime.sendMessage({ type: 'ABBREVIATIONS_UPDATED' });
        };
      });
    },

    async getAllCategories() {
      try {
        const abbreviations = await this.getAllAbbreviations(); // 'this' is correct here
        const categories = new Set();
        
        abbreviations.forEach(abbr => {
          if (abbr.category && abbr.category.trim()) {
            categories.add(abbr.category.trim());
          }
        });
        
        return Array.from(categories).sort();
      } catch (error) {
        // The error "TypeError: Cannot read properties of undefined (reading 'getAllAbbreviations')"
        // would originate here if getAllCategories is called with the wrong 'this' context.
        console.error('Error getting categories:', error);
        return [];
      }
    },

    async clearAllAbbreviations() {
      const db = await openDatabase();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.clear();

        request.onsuccess = () => resolve();
        request.onerror = () => {
          console.error('Failed to clear abbreviations', request.error);
          reject(new Error('Failed to clear abbreviations'));
        };

        transaction.oncomplete = () => {
          chrome.runtime.sendMessage({ type: 'ABBREVIATIONS_UPDATED' });
        };
      });
    },

    async importAbbreviations(abbreviationsToImport) {
      const db = await openDatabase();
      let importCount = 0;
      
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);

        transaction.onerror = () => {
          console.error('Transaction error during import', transaction.error);
          reject(new Error('Failed to import abbreviations during transaction'));
        };
        
        transaction.oncomplete = () => {
          chrome.runtime.sendMessage({ type: 'ABBREVIATIONS_UPDATED' });
          resolve(importCount);
        };

        if (abbreviationsToImport.length === 0) {
          resolve(0); 
          return;
        }

        abbreviationsToImport.forEach((abbr) => {
          if (!abbr.createdAt) {
            abbr.createdAt = new Date().toISOString();
          }
          if (abbr.usageCount === undefined) {
            abbr.usageCount = 0;
          }
          if (abbr.lastUsed === undefined) {
            abbr.lastUsed = null;
          }
          if (abbr.enabled === undefined) {
            abbr.enabled = true;
          }
          if (!abbr.category) {
            abbr.category = 'Imported';
          }

          const request = store.put(abbr);
          request.onsuccess = () => {
            importCount++;
          };
          request.onerror = (event) => {
            console.error(`Failed to import abbreviation: ${abbr.abbreviation}`, event.target.error);
          };
        });
      });
    }
  };
})(window);