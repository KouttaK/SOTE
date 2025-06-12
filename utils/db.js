// SOTE-main/utils/db.js
(function(global) { // Alterado de window para global
  'use strict';

  // Usa as constantes globais definidas em utils/constants.js
  const DB_NAME = global.SOTE_CONSTANTS.DB_NAME;
  const DB_VERSION = global.SOTE_CONSTANTS.DB_VERSION;
  const STORE_ABBREVIATIONS = global.SOTE_CONSTANTS.STORE_ABBREVIATIONS;
  const STORE_RULES = global.SOTE_CONSTANTS.STORE_RULES;

  // Objeto de migrações para gerenciar mudanças de schema
  const MIGRATIONS = {
    1: (db, oldVersion, newVersion) => {
      // Migração da versão 1 (criação inicial)
      if (!db.objectStoreNames.contains(STORE_ABBREVIATIONS)) {
        const store = db.createObjectStore(STORE_ABBREVIATIONS, { keyPath: 'abbreviation' });
        store.createIndex('category', 'category', { unique: false });
        store.createIndex('enabled', 'enabled', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
        store.createIndex('lastUsed', 'lastUsed', { unique: false });
        store.createIndex('usageCount', 'usageCount', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_RULES)) {
        const rulesStore = db.createObjectStore(STORE_RULES, { keyPath: 'id', autoIncrement: true });
        rulesStore.createIndex('abbreviationId', 'abbreviationId', { unique: false });
        rulesStore.createIndex('type', 'type', { unique: false });
      }
      console.log(`[IndexedDB Migrations] Migration from version ${oldVersion} to ${newVersion} completed.`);
    },
    2: (db, oldVersion, newVersion) => {
      console.log(`[IndexedDB Migrations] Migration from version ${oldVersion} to ${newVersion} completed. No schema changes.`);
    },
    3: (db, oldVersion, newVersion) => {
      console.log(`[IndexedDB Migrations] Running migration from version ${oldVersion} to ${newVersion}.`);
      if (!db.objectStoreNames.contains('statistics')) {
          const statsStore = db.createObjectStore('statistics', { keyPath: 'id', autoIncrement: true });
          statsStore.createIndex('abbreviationId', 'abbreviationId', { unique: true });
          console.log('[IndexedDB Migrations] Created "statistics" object store.');
      }
    }
  };

  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      
      request.onerror = () => {
        console.error('Failed to open database', request.error);
        reject(new Error('Failed to open database'));
      };
      
      request.onsuccess = (event) => {
        const db = event.target.result;
        console.log(`[IndexedDB] Database opened successfully. Version: ${db.version}`);
        resolve(db);
      };
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        const oldVersion = event.oldVersion;
        const newVersion = event.newVersion;
        console.log(`[IndexedDB] Upgrade needed from version ${oldVersion} to ${newVersion}`);

        for (let i = oldVersion + 1; i <= newVersion; i++) {
          if (MIGRATIONS[i]) {
            console.log(`[IndexedDB Migrations] Applying migration for version ${i}...`);
            MIGRATIONS[i](db, oldVersion, newVersion);
          } else {
            console.warn(`[IndexedDB Migrations] No migration script found for version ${i}.`);
          }
        }
      };
    });
  }

  // Validação de dados
  class Validator {
    static validate(data, schema) {
      if (typeof data !== 'object' || data === null) throw new Error('Data must be an object.');
      if (typeof schema !== 'object' || schema === null) throw new Error('Schema must be an object.');

      const validatedData = {};
      const errors = [];

      for (const key in schema) {
        const fieldSchema = schema[key];
        let value = data[key];

        if (fieldSchema.required && (value === undefined || value === null || (typeof value === 'string' && value.trim() === ''))) {
          errors.push(`Field '${key}' is required.`);
          continue;
        }

        if (value === undefined || value === null) {
          if (fieldSchema.default !== undefined) validatedData[key] = fieldSchema.default;
          else validatedData[key] = value;
          continue;
        }

        if (fieldSchema.type && typeof value !== fieldSchema.type) {
            if (fieldSchema.type === 'array' && !Array.isArray(value)) {
                errors.push(`Field '${key}' must be an array.`);
            } else if (fieldSchema.type !== 'array') {
                errors.push(`Field '${key}' must be of type '${fieldSchema.type}'.`);
            }
        }
        
        // Validações adicionais
        validatedData[key] = value;
      }

      if (errors.length > 0) throw new Error(`Validation Error: ${errors.join('; ')}`);
      return validatedData;
    }
  }

  class AbbreviationModel {
    static schema = {
      abbreviation: { required: true, type: 'string' },
      expansion: { required: true, type: 'string' },
      category: { type: 'string', default: 'Comum' },
      caseSensitive: { type: 'boolean', default: false },
      enabled: { type: 'boolean', default: true },
      createdAt: { type: 'string' },
      lastUsed: { type: 'string', default: null },
      usageCount: { type: 'number', default: 0 },
      rules: { type: 'array', default: [] }
    };

    static validate(data) {
      const validated = Validator.validate(data, AbbreviationModel.schema);
      delete validated.rules;
      return validated;
    }
  }

  class RuleModel {
    static schema = {
      id: { type: 'number', required: false },
      abbreviationId: { required: true, type: 'string' },
      type: { required: true, type: 'string' },
      expansion: { required: true, type: 'string' },
      priority: { type: 'number', default: 0 },
      days: { type: 'array', default: [] },
      startHour: { type: 'number' },
      startMinute: { type: 'number' },
      endHour: { type: 'number' },
      endMinute: { type: 'number' },
      domains: { type: 'array', default: [] },
      month: { type: 'number' },
      day: { type: 'number' },
      logicalOperator: { type: 'string' },
      subConditions: { type: 'array', default: [] }
    };

    static validate(data) {
      return Validator.validate(data, RuleModel.schema);
    }
  }

  let categoriesCache = null;
  let categoriesCacheTimestamp = 0;
  const CATEGORIES_CACHE_TTL = 5 * 60 * 1000;

  global.TextExpanderDB = {
    openDatabase,

    async getAllAbbreviations() {
      const db = await openDatabase();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_ABBREVIATIONS, STORE_RULES], 'readonly');
        const abbrStore = transaction.objectStore(STORE_ABBREVIATIONS);
        const rulesStore = transaction.objectStore(STORE_RULES);
        
        const abbrRequest = abbrStore.getAll();
        const rulesRequest = rulesStore.getAll();

        let abbreviations, rules;

        abbrRequest.onsuccess = () => {
            abbreviations = abbrRequest.result;
            if (rules) resolve(this._mapRulesToAbbreviations(abbreviations, rules));
        };
        rulesRequest.onsuccess = () => {
            rules = rulesRequest.result;
            if (abbreviations) resolve(this._mapRulesToAbbreviations(abbreviations, rules));
        };
        abbrRequest.onerror = () => reject(new Error('Failed to get abbreviations'));
        rulesRequest.onerror = () => reject(new Error('Failed to get rules'));
      });
    },

    _mapRulesToAbbreviations(abbreviations, rules) {
        const rulesMap = new Map();
        for (const rule of rules) {
            if (!rulesMap.has(rule.abbreviationId)) {
                rulesMap.set(rule.abbreviationId, []);
            }
            rulesMap.get(rule.abbreviationId).push(rule);
        }
        return abbreviations.map(abbr => ({
            ...abbr,
            rules: rulesMap.get(abbr.abbreviation) || []
        }));
    },

    async addAbbreviation(abbreviation) {
      const validatedAbbr = AbbreviationModel.validate({
          ...abbreviation,
          createdAt: abbreviation.createdAt || new Date().toISOString()
      });
      const db = await openDatabase();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_ABBREVIATIONS, 'readwrite');
        const store = transaction.objectStore(STORE_ABBREVIATIONS);
        const request = store.add(validatedAbbr);
        request.onsuccess = () => resolve();
        request.onerror = (e) => reject(e.target.error);
        transaction.oncomplete = () => {
          chrome.runtime.sendMessage({ type: SOTE_CONSTANTS.MESSAGE_TYPES.ABBREVIATIONS_UPDATED }).catch(()=>{});
          categoriesCache = null;
        };
      });
    },

    async updateAbbreviation(abbreviation) {
      const existing = await this.getAbbreviation(abbreviation.abbreviation);
      const validatedAbbr = AbbreviationModel.validate({ ...existing, ...abbreviation });
      const db = await openDatabase();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_ABBREVIATIONS, 'readwrite');
        const store = transaction.objectStore(STORE_ABBREVIATIONS);
        const request = store.put(validatedAbbr);
        request.onsuccess = () => resolve();
        request.onerror = (e) => reject(e.target.error);
        transaction.oncomplete = () => {
          chrome.runtime.sendMessage({ type: SOTE_CONSTANTS.MESSAGE_TYPES.ABBREVIATIONS_UPDATED }).catch(()=>{});
          categoriesCache = null;
        };
      });
    },

    async deleteAbbreviation(abbreviationKey) {
      const db = await openDatabase();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_ABBREVIATIONS, STORE_RULES], 'readwrite');
        const abbrStore = transaction.objectStore(STORE_ABBREVIATIONS);
        const rulesStore = transaction.objectStore(STORE_RULES);
        const rulesIndex = rulesStore.index('abbreviationId');

        const deleteAbbrRequest = abbrStore.delete(abbreviationKey);
        const getRulesRequest = rulesIndex.getAll(abbreviationKey);

        getRulesRequest.onsuccess = () => {
            const rulesToDelete = getRulesRequest.result;
            rulesToDelete.forEach(rule => rulesStore.delete(rule.id));
        };
        
        transaction.oncomplete = () => {
            chrome.runtime.sendMessage({ type: SOTE_CONSTANTS.MESSAGE_TYPES.ABBREVIATIONS_UPDATED }).catch(()=>{});
            categoriesCache = null;
            resolve();
        };
        transaction.onerror = (e) => reject(e.target.error);
      });
    },

    async addExpansionRule(rule) {
      const validatedRule = RuleModel.validate(rule);
      delete validatedRule.id; // Ensure ID is not set for auto-increment
      const db = await openDatabase();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_RULES, 'readwrite');
        const store = transaction.objectStore(STORE_RULES);
        const request = store.add(validatedRule);
        request.onsuccess = () => resolve(request.result);
        request.onerror = (e) => reject(e.target.error);
        transaction.oncomplete = () => chrome.runtime.sendMessage({ type: SOTE_CONSTANTS.MESSAGE_TYPES.ABBREVIATIONS_UPDATED }).catch(()=>{});
      });
    },

    async updateExpansionRule(rule) {
      const validatedRule = RuleModel.validate(rule);
      const db = await openDatabase();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_RULES, 'readwrite');
        const store = transaction.objectStore(STORE_RULES);
        const request = store.put(validatedRule);
        request.onsuccess = () => resolve();
        request.onerror = (e) => reject(e.target.error);
        transaction.oncomplete = () => chrome.runtime.sendMessage({ type: SOTE_CONSTANTS.MESSAGE_TYPES.ABBREVIATIONS_UPDATED }).catch(()=>{});
      });
    },

    async deleteExpansionRule(ruleId) {
      const db = await openDatabase();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_RULES, 'readwrite');
        const store = transaction.objectStore(STORE_RULES);
        const request = store.delete(ruleId);
        request.onsuccess = () => resolve();
        request.onerror = (e) => reject(e.target.error);
        transaction.oncomplete = () => chrome.runtime.sendMessage({ type: SOTE_CONSTANTS.MESSAGE_TYPES.ABBREVIATIONS_UPDATED }).catch(()=>{});
      });
    },

    async getAllCategories() {
      if (categoriesCache && (Date.now() - categoriesCacheTimestamp < CATEGORIES_CACHE_TTL)) {
        return Promise.resolve(categoriesCache);
      }
      const db = await openDatabase();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_ABBREVIATIONS, 'readonly');
        const store = transaction.objectStore(STORE_ABBREVIATIONS);
        const index = store.index('category');
        const categories = new Set();
        const request = index.openCursor(null, 'nextunique');
        request.onsuccess = (event) => {
          const cursor = event.target.result;
          if (cursor) {
            categories.add(cursor.key);
            cursor.continue();
          } else {
            const sorted = Array.from(categories).sort();
            categoriesCache = sorted;
            categoriesCacheTimestamp = Date.now();
            resolve(sorted);
          }
        };
        request.onerror = (e) => reject(e.target.error);
      });
    },

    async clearAllAbbreviations() {
      const db = await openDatabase();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_ABBREVIATIONS, STORE_RULES], 'readwrite');
        const abbrStore = transaction.objectStore(STORE_ABBREVIATIONS);
        const rulesStore = transaction.objectStore(STORE_RULES);
        abbrStore.clear();
        rulesStore.clear();
        transaction.oncomplete = () => {
            chrome.runtime.sendMessage({ type: SOTE_CONSTANTS.MESSAGE_TYPES.ABBREVIATIONS_UPDATED }).catch(()=>{});
            categoriesCache = null;
            resolve();
        };
        transaction.onerror = (e) => reject(e.target.error);
      });
    },

    async importAbbreviations(abbreviationsToImport) {
        const db = await openDatabase();
        const transaction = db.transaction([STORE_ABBREVIATIONS, STORE_RULES], 'readwrite');
        const abbrStore = transaction.objectStore(STORE_ABBREVIATIONS);
        const rulesStore = transaction.objectStore(STORE_RULES);
        let importedCount = 0;

        const promises = abbreviationsToImport.map(abbr => {
            return new Promise((resolve, reject) => {
                try {
                    const validatedAbbr = AbbreviationModel.validate({ ...abbr, createdAt: abbr.createdAt || new Date().toISOString() });
                    const request = abbrStore.put(validatedAbbr); // Use put to overwrite
                    
                    request.onsuccess = () => {
                        importedCount++;
                        if (abbr.rules && Array.isArray(abbr.rules)) {
                            const rulePromises = abbr.rules.map(rule => {
                                return new Promise((resolveRule, rejectRule) => {
                                    try {
                                        const ruleDataToValidate = { ...rule, abbreviationId: abbr.abbreviation };
                                        // *** INÍCIO DA CORREÇÃO ***
                                        const validatedRule = RuleModel.validate(ruleDataToValidate);
                                        // Garante que o ID seja removido APÓS a validação para evitar chaves inválidas (como null)
                                        delete validatedRule.id; 
                                        // *** FIM DA CORREÇÃO ***
                                        const ruleRequest = rulesStore.add(validatedRule);
                                        ruleRequest.onsuccess = () => resolveRule();
                                        ruleRequest.onerror = (e) => rejectRule(e.target.error);
                                    } catch (e) {
                                        console.warn(`Skipping invalid rule during import for ${abbr.abbreviation}:`, e.message);
                                        resolveRule(); // Resolve to not block other imports
                                    }
                                });
                            });
                            Promise.all(rulePromises).then(resolve).catch(reject);
                        } else {
                            resolve();
                        }
                    };
                    request.onerror = (e) => reject(e.target.error);
                } catch (e) {
                    console.warn(`Skipping invalid abbreviation during import: ${abbr.abbreviation}`, e.message);
                    resolve(); // Continue with other imports
                }
            });
        });

        await Promise.all(promises);

        return new Promise((resolve, reject) => {
            transaction.oncomplete = () => {
                chrome.runtime.sendMessage({ type: SOTE_CONSTANTS.MESSAGE_TYPES.ABBREVIATIONS_UPDATED }).catch(()=>{});
                categoriesCache = null;
                resolve(importedCount);
            };
            transaction.onerror = (e) => reject(e.target.error);
        });
    },

    async getAbbreviation(abbreviationKey) {
      const db = await openDatabase();
      return new Promise((resolve, reject) => {
        const store = db.transaction(STORE_ABBREVIATIONS, 'readonly').objectStore(STORE_ABBREVIATIONS);
        const request = store.get(abbreviationKey);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = (e) => reject(e.target.error);
      });
    }
  };
})(self || window);