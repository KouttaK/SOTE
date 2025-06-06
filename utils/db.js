// SOTE-main/utils/db.js
(function(global) { // Alterado de window para global
  'use strict';

  const DB_NAME = 'textExpander';
  const DB_VERSION = 3; // Incrementamos a versão para habilitar as migrações
  const STORE_ABBREVIATIONS = 'abbreviations';
  const STORE_RULES = 'expansionRules';

  // Objeto de migrações para gerenciar mudanças de schema
  const MIGRATIONS = {
    1: (db, oldVersion, newVersion) => {
      // Migração da versão 1 (criação inicial)
      // Certifique-se de que este código corresponde ao seu schema original v1
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
      // Migração da versão 2 (se houver necessidade de adicionar novos campos ou stores, por exemplo)
      console.log(`[IndexedDB Migrations] Migration from version ${oldVersion} to ${newVersion} completed. No schema changes.`);
    },
    3: (db, oldVersion, newVersion) => {
      // Exemplo de migração da versão 3: Adicionar um novo store 'statistics'
      console.log(`[IndexedDB Migrations] Running migration from version ${oldVersion} to ${newVersion}.`);
      if (!db.objectStoreNames.contains('statistics')) {
          const statsStore = db.createObjectStore('statistics', { keyPath: 'id', autoIncrement: true });
          statsStore.createIndex('abbreviationId', 'abbreviationId', { unique: true }); // Exemplo de índice
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

        // Executa as migrações sequencialmente
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
    /**
     * Valida os dados contra um esquema definido.
     * @param {object} data Os dados a serem validados.
     * @param {object} schema O esquema de validação.
     * @returns {object} Os dados validados, com valores padrão aplicados.
     * @throws {Error} Se a validação falhar.
     */
    static validate(data, schema) {
      if (typeof data !== 'object' || data === null) {
        throw new Error('Data to validate must be an object.');
      }
      if (typeof schema !== 'object' || schema === null) {
        throw new Error('Schema must be an object.');
      }

      const validatedData = {};
      const errors = [];

      for (const key in schema) {
        const fieldSchema = schema[key];
        const value = data[key];

        // 1. Verificação de obrigatoriedade
        if (fieldSchema.required && (value === undefined || value === null || (typeof value === 'string' && value.trim() === ''))) {
          errors.push(`Field '${key}' is required.`);
          continue; // Pula para o próximo campo se for obrigatório e estiver faltando
        }

        // 2. Aplicação de valor padrão
        if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
            if (fieldSchema.default !== undefined) {
                validatedData[key] = fieldSchema.default;
            } else if (fieldSchema.required) {
                // Já tratado acima, mas para clareza
            } else {
                validatedData[key] = value; // Mantém undefined/null se não for obrigatório e não tiver default
            }
            continue; // Pula para o próximo campo após aplicar default ou se não for obrigatório
        }


        // 3. Verificação de tipo
        if (fieldSchema.type && typeof value !== fieldSchema.type) {
          if (fieldSchema.type === 'array' && !Array.isArray(value)) {
              errors.push(`Field '${key}' must be an array, but received ${typeof value}.`);
          } else if (fieldSchema.type !== 'array') { // Se não for array e o tipo básico não corresponder
              errors.push(`Field '${key}' must be of type '${fieldSchema.type}', but received '${typeof value}'.`);
          }
        }

        // 4. Validações específicas por tipo
        if (typeof value === 'string') {
          if (fieldSchema.minLength !== undefined && value.trim().length < fieldSchema.minLength) {
            errors.push(`Field '${key}' must have a minimum length of ${fieldSchema.minLength}.`);
          }
          if (fieldSchema.maxLength !== undefined && value.trim().length > fieldSchema.maxLength) {
            errors.push(`Field '${key}' must have a maximum length of ${fieldSchema.maxLength}.`);
          }
          if (fieldSchema.enum && !fieldSchema.enum.includes(value)) {
            errors.push(`Field '${key}' must be one of ${fieldSchema.enum.join(', ')}.`);
          }
        } else if (typeof value === 'number') {
          if (fieldSchema.min !== undefined && value < fieldSchema.min) {
            errors.push(`Field '${key}' must be at least ${fieldSchema.min}.`);
          }
          if (fieldSchema.max !== undefined && value > fieldSchema.max) {
            errors.push(`Field '${key}' must be at most ${fieldSchema.max}.`);
          }
        } else if (typeof value === 'boolean') {
            // Nenhuma validação adicional específica para boolean no momento
        } else if (Array.isArray(value)) {
            if (fieldSchema.items && value.length > 0) {
                const itemErrors = [];
                value.forEach((item, index) => {
                    if (fieldSchema.items.type && typeof item !== fieldSchema.items.type) {
                        itemErrors.push(`Item at index ${index} in field '${key}' must be of type '${fieldSchema.items.type}'.`);
                    }
                    if (fieldSchema.items.enum && !fieldSchema.items.enum.includes(item)) {
                        itemErrors.push(`Item at index ${index} in field '${key}' must be one of ${fieldSchema.items.enum.join(', ')}.`);
                    }
                });
                if (itemErrors.length > 0) {
                    errors.push(`Validation errors in array field '${key}': ${itemErrors.join('; ')}`);
                }
            }
        }

        validatedData[key] = value; // Adiciona o valor original se não houve erro
      }

      if (errors.length > 0) {
        throw new Error(`Validation Error: ${errors.join('\n')}`);
      }
      return validatedData;
    }
  }

  class AbbreviationModel {
    static schema = {
      abbreviation: { required: true, type: 'string', minLength: 1, maxLength: 100 },
      expansion: { required: true, type: 'string', minLength: 1 },
      category: { type: 'string', default: 'Comum', maxLength: 50 },
      caseSensitive: { type: 'boolean', default: false },
      enabled: { type: 'boolean', default: true },
      createdAt: { type: 'string', required: true }, // Espera ISOString
      lastUsed: { type: 'string', default: null }, // Pode ser null
      usageCount: { type: 'number', default: 0, min: 0 },
      rules: { type: 'array', default: [] } // Rules serão tratadas separadamente por RuleModel
    };

    static validate(data) {
      const validated = Validator.validate(data, AbbreviationModel.schema);
      // Remove rules property from validation if it's not expected for storage directly
      // Or ensure it's handled properly when saving/fetching
      delete validated.rules;
      return validated;
    }
  }

  class RuleModel {
    static schema = {
      id: { type: 'number', required: false }, // Auto-incremented, so not required for add
      abbreviationId: { required: true, type: 'string', minLength: 1, maxLength: 100 },
      type: { required: true, type: 'string', enum: ['dayOfWeek', 'timeRange', 'domain', 'specialDate', 'combined'] },
      expansion: { required: true, type: 'string', minLength: 1 },
      priority: { type: 'number', default: 0, min: 0, max: 100 },
      // Campos específicos para cada tipo de regra
      days: { type: 'array', items: { type: 'number', min: 0, max: 6 }, default: [] }, // for dayOfWeek
      startHour: { type: 'number', min: 0, max: 23 }, // for timeRange
      startMinute: { type: 'number', min: 0, max: 59 }, // for timeRange
      endHour: { type: 'number', min: 0, max: 23 }, // for timeRange
      endMinute: { type: 'number', min: 0, max: 59 }, // for timeRange
      domains: { type: 'array', items: { type: 'string', minLength: 1 }, default: [] }, // for domain
      month: { type: 'number', min: 1, max: 12 }, // for specialDate
      day: { type: 'number', min: 1, max: 31 }, // for specialDate
      logicalOperator: { type: 'string', enum: ['AND', 'OR'] }, // for combined
      subConditions: { type: 'array', default: [] } // for combined (recursive validation could be complex here, simple array check)
    };

    static validate(data) {
      const validated = Validator.validate(data, RuleModel.schema);

      // Validação adicional para campos específicos baseados no tipo de regra
      switch (validated.type) {
          case 'dayOfWeek':
              if (!Array.isArray(validated.days) || validated.days.length === 0) {
                  throw new Error('Validation Error: For dayOfWeek rule, "days" array must not be empty.');
              }
              break;
          case 'timeRange':
              if ([validated.startHour, validated.startMinute, validated.endHour, validated.endMinute].some(val => val === undefined || val === null)) {
                  throw new Error('Validation Error: For timeRange rule, start/end hours/minutes are required.');
              }
              break;
          case 'domain':
              if (!Array.isArray(validated.domains) || validated.domains.length === 0) {
                  throw new Error('Validation Error: For domain rule, "domains" array must not be empty.');
              }
              break;
          case 'specialDate':
              if (validated.month === undefined || validated.day === undefined) {
                  throw new Error('Validation Error: For specialDate rule, month and day are required.');
              }
              break;
          case 'combined':
              if (!Array.isArray(validated.subConditions) || validated.subConditions.length === 0) {
                  throw new Error('Validation Error: For combined rule, "subConditions" array must not be empty.');
              }
              if (!['AND', 'OR'].includes(validated.logicalOperator)) {
                  throw new Error('Validation Error: For combined rule, "logicalOperator" must be "AND" or "OR".');
              }
              // Recursive validation for subConditions could be added here if needed,
              // but it complicates the simple validate function.
              break;
      }
      return validated;
    }
  }

  // Cache para categorias, pois são lidas frequentemente e não mudam muito
  let categoriesCache = null;
  const CATEGORIES_CACHE_TTL = 5 * 60 * 1000; // 5 minutos
  let categoriesCacheTimestamp = 0;

  // Export database functions to global scope
  global.TextExpanderDB = {
    openDatabase,

    async getAllAbbreviations() {
      const db = await openDatabase();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_ABBREVIATIONS, STORE_RULES], 'readonly');
        const abbrStore = transaction.objectStore(STORE_ABBREVIATIONS);
        const rulesStore = transaction.objectStore(STORE_RULES);
        
        Promise.all([
          new Promise((res, rej) => {
            const request = abbrStore.getAll();
            request.onsuccess = () => res(request.result);
            request.onerror = () => rej(new Error('Failed to get abbreviations'));
          }),
          new Promise((res, rej) => {
            const request = rulesStore.getAll();
            request.onsuccess = () => res(request.result);
            request.onerror = () => rej(new Error('Failed to get rules'));
          })
        ]).then(([abbreviations, rules]) => {
          // Anexa as regras a suas abreviações correspondentes
          abbreviations.forEach(abbr => {
            // Filtrar e validar regras ao anexar
            abbr.rules = rules.filter(rule => rule.abbreviationId === abbr.abbreviation)
                              .map(rule => {
                                  try {
                                      // Retornamos a regra validada, ou a original se a validação falhar (com aviso)
                                      return RuleModel.validate(rule);
                                  } catch (e) {
                                      console.warn(`[IndexedDB] Rule validation failed for rule ID ${rule.id} (abbr: ${rule.abbreviationId}): ${e.message}. Skipping or using raw rule.`, rule);
                                      return rule; // Retorna a regra bruta se a validação falhar com aviso
                                  }
                              });
          });
          // Retorna apenas abreviações válidas (opcional, dependendo da necessidade de dados corrompidos)
          const validAbbreviations = abbreviations.map(abbr => {
              try {
                  // A validação aqui é mais para garantir a estrutura mínima.
                  // Campos que podem ser adicionados dinamicamente (como rules) devem ser tratados.
                  const validatedAbbr = { // Cria um novo objeto para não ter 'rules' do schema
                      abbreviation: abbr.abbreviation,
                      expansion: abbr.expansion,
                      category: abbr.category,
                      caseSensitive: abbr.caseSensitive,
                      enabled: abbr.enabled,
                      createdAt: abbr.createdAt,
                      lastUsed: abbr.lastUsed,
                      usageCount: abbr.usageCount
                  };
                  return AbbreviationModel.validate(validatedAbbr); // Valida apenas os campos do schema base
              } catch (e) {
                  console.warn(`[IndexedDB] Abbreviation validation failed for key ${abbr.abbreviation}: ${e.message}. Skipping or using raw abbreviation.`, abbr);
                  return null; // Marca como inválido
              }
          }).filter(Boolean); // Remove nulos

          resolve(validAbbreviations);
        }).catch(reject);
      });
    },

    async addAbbreviation(abbreviation) {
      let validatedAbbr;
      try {
        // Prepare data before sending to validation
        const dataToValidate = { ...abbreviation };
        if (!dataToValidate.createdAt) dataToValidate.createdAt = new Date().toISOString();
        if (dataToValidate.usageCount === undefined) dataToValidate.usageCount = 0;
        if (dataToValidate.lastUsed === undefined) dataToValidate.lastUsed = null;
        if (dataToValidate.enabled === undefined) dataToValidate.enabled = true;
        
        validatedAbbr = AbbreviationModel.validate(dataToValidate);
      } catch (error) {
        console.error('Abbreviation validation failed:', error);
        throw error; // Rejeita a promise com o erro de validação
      }

      const db = await openDatabase();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_ABBREVIATIONS, 'readwrite');
        const store = transaction.objectStore(STORE_ABBREVIATIONS);

        const request = store.add(validatedAbbr); // Adiciona dados validados
        
        request.onsuccess = () => resolve();
        request.onerror = () => {
            console.error('Failed to add abbreviation', request.error);
            reject(new Error(`Failed to add abbreviation: ${request.error?.message || 'Unknown error'}`));
        };
        
        transaction.oncomplete = () => {
          chrome.runtime.sendMessage({ type: 'ABBREVIATIONS_UPDATED' }).catch(e => console.warn("SW: Could not send ABBREVIATIONS_UPDATED:", e));
          categoriesCache = null; // Invalida o cache de categorias
        };
      });
    },

    async updateAbbreviation(abbreviation) {
      let validatedAbbr;
      try {
        // Ao atualizar, tentamos buscar o item existente para preservar campos como createdAt, usageCount, lastUsed
        const existingAbbr = await this.getAbbreviation(abbreviation.abbreviation);
        const dataToValidate = { ...existingAbbr, ...abbreviation }; // Mescla dados existentes com os novos
        
        // Garante que os campos que não devem ser alterados manualmente via update,
        // mas que são importantes para o modelo, sejam consistentemente preenchidos.
        if (!dataToValidate.createdAt) dataToValidate.createdAt = new Date().toISOString();
        if (dataToValidate.usageCount === undefined) dataToValidate.usageCount = 0;
        if (dataToValidate.lastUsed === undefined) dataToValidate.lastUsed = null;
        if (dataToValidate.enabled === undefined) dataToValidate.enabled = true;

        validatedAbbr = AbbreviationModel.validate(dataToValidate);
      } catch (error) {
        console.error('Abbreviation validation failed during update:', error);
        throw error;
      }

      const db = await openDatabase();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_ABBREVIATIONS, 'readwrite');
        const store = transaction.objectStore(STORE_ABBREVIATIONS);

        const request = store.put(validatedAbbr); // Atualiza com dados validados
        
        request.onsuccess = () => resolve();
        request.onerror = () => {
            console.error('Failed to update abbreviation', request.error);
            reject(new Error(`Failed to update abbreviation: ${request.error?.message || 'Unknown error'}`));
        };
        
        transaction.oncomplete = () => {
          chrome.runtime.sendMessage({ type: 'ABBREVIATIONS_UPDATED' }).catch(e => console.warn("SW: Could not send ABBREVIATIONS_UPDATED:", e));
          categoriesCache = null; // Invalida o cache de categorias
        };
      });
    },

    async deleteAbbreviation(abbreviationKey) {
      const db = await openDatabase();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_ABBREVIATIONS, STORE_RULES], 'readwrite');
        const store = transaction.objectStore(STORE_ABBREVIATIONS);
        const rulesStore = transaction.objectStore(STORE_RULES);

        // Deleta as regras associadas primeiro
        const rulesIndex = rulesStore.index('abbreviationId');
        const range = IDBKeyRange.only(abbreviationKey);
        const deleteRulesRequest = rulesIndex.openCursor(range);

        deleteRulesRequest.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                rulesStore.delete(cursor.primaryKey);
                cursor.continue();
            } else {
                // Todas as regras associadas foram deletadas, agora delete a abreviação
                const deleteAbbrRequest = store.delete(abbreviationKey);
                deleteAbbrRequest.onsuccess = () => resolve();
                deleteAbbrRequest.onerror = () => {
                    console.error('Failed to delete abbreviation', deleteAbbrRequest.error);
                    reject(new Error(`Failed to delete abbreviation: ${deleteAbbrRequest.error?.message || 'Unknown error'}`));
                };
            }
        };
        deleteRulesRequest.onerror = (event) => {
            console.error('Failed to delete associated rules', event.target.error);
            reject(new Error(`Failed to delete associated rules: ${event.target.error?.message || 'Unknown error'}`));
        };

        transaction.oncomplete = () => {
          chrome.runtime.sendMessage({ type: 'ABBREVIATIONS_UPDATED' }).catch(e => console.warn("SW: Could not send ABBREVIATIONS_UPDATED:", e));
          categoriesCache = null; // Invalida o cache de categorias
        };
      });
    },

    async addExpansionRule(rule) {
      let validatedRule;
      try {
        // Valide os dados da regra antes de adicionar
        validatedRule = RuleModel.validate(rule);
        // Remove 'id' se estiver presente, pois será auto-incrementado
        delete validatedRule.id;
      } catch (error) {
        console.error('Rule validation failed:', error);
        throw error;
      }

      const db = await openDatabase();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_RULES, 'readwrite');
        const store = transaction.objectStore(STORE_RULES);
        
        const request = store.add(validatedRule); // Adiciona dados validados
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => {
          console.error('Failed to add rule', request.error);
          reject(new Error(`Failed to add rule: ${request.error?.message || 'Unknown error'}`));
        };
        
        transaction.oncomplete = () => {
          chrome.runtime.sendMessage({ type: 'ABBREVIATIONS_UPDATED' }).catch(e => console.warn("SW: Could not send ABBREVIATIONS_UPDATED:", e));
        };
      });
    },

    async updateExpansionRule(rule) {
      let validatedRule;
      try {
        // Ao atualizar, o ID deve estar presente
        if (rule.id === undefined) {
            throw new Error('Rule ID is required for update operation.');
        }
        validatedRule = RuleModel.validate(rule);
      } catch (error) {
        console.error('Rule validation failed during update:', error);
        throw error;
      }

      const db = await openDatabase();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_RULES, 'readwrite');
        const store = transaction.objectStore(STORE_RULES);
        
        const request = store.put(validatedRule); // Atualiza com dados validados
        
        request.onsuccess = () => resolve();
        request.onerror = () => {
          console.error('Failed to update rule', request.error);
          reject(new Error(`Failed to update rule: ${request.error?.message || 'Unknown error'}`));
        };
        
        transaction.oncomplete = () => {
          chrome.runtime.sendMessage({ type: 'ABBREVIATIONS_UPDATED' }).catch(e => console.warn("SW: Could not send ABBREVIATIONS_UPDATED:", e));
        };
      });
    },

    async deleteExpansionRule(ruleId) {
      const db = await openDatabase();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_RULES, 'readwrite');
        const store = transaction.objectStore(STORE_RULES);
        
        const request = store.delete(ruleId);
        
        request.onsuccess = () => resolve();
        request.onerror = () => {
          console.error('Failed to delete rule', request.error);
          reject(new Error(`Failed to delete rule: ${request.error?.message || 'Unknown error'}`));
        };
        
        transaction.oncomplete = () => {
          chrome.runtime.sendMessage({ type: 'ABBREVIATIONS_UPDATED' }).catch(e => console.warn("SW: Could not send ABBREVIATIONS_UPDATED:", e));
        };
      });
    },

    async getAllCategories() {
      // Usando cache para categorias
      if (categoriesCache && Date.now() - categoriesCacheTimestamp < CATEGORIES_CACHE_TTL) {
        return categoriesCache;
      }

      try {
        const db = await openDatabase();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_ABBREVIATIONS, 'readonly');
            const store = transaction.objectStore(STORE_ABBREVIATIONS);
            const index = store.index('category');

            const categories = new Set();
            const request = index.openCursor();

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    if (cursor.key && typeof cursor.key === 'string' && cursor.key.trim()) {
                        categories.add(cursor.key.trim());
                    }
                    cursor.continue();
                } else {
                    const sortedCategories = Array.from(categories).sort();
                    categoriesCache = sortedCategories;
                    categoriesCacheTimestamp = Date.now();
                    resolve(sortedCategories);
                }
            };

            request.onerror = () => {
                console.error('Error getting categories from index:', request.error);
                reject(new Error('Failed to get categories'));
            };
        });
      } catch (error) {
        console.error('Error getting categories (from openDatabase):', error);
        return [];
      }
    },

    async clearAllAbbreviations() {
      const db = await openDatabase();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_ABBREVIATIONS, STORE_RULES], 'readwrite');
        const abbrStore = transaction.objectStore(STORE_ABBREVIATIONS);
        const rulesStore = transaction.objectStore(STORE_RULES);

        const clearAbbrRequest = abbrStore.clear();
        const clearRulesRequest = rulesStore.clear();

        Promise.allSettled([
            new Promise((res, rej) => { clearAbbrRequest.onsuccess = res; clearAbbrRequest.onerror = rej; }),
            new Promise((res, rej) => { clearRulesRequest.onsuccess = res; clearRulesRequest.onerror = rej; })
        ]).then(results => {
            const hasError = results.some(r => r.status === 'rejected');
            if (hasError) {
                reject(new Error('One or more stores failed to clear. Check console for details.'));
            } else {
                resolve();
            }
        }).catch(err => reject(err));

        transaction.oncomplete = () => {
          chrome.runtime.sendMessage({ type: 'ABBREVIATIONS_UPDATED' }).catch(e => console.warn("SW: Could not send ABBREVIATIONS_UPDATED:", e));
          categoriesCache = null; // Invalida o cache de categorias
        };
        transaction.onerror = (event) => {
            console.error('Transaction error during clearAllAbbreviations:', event.target.error);
            reject(new Error('Transaction failed during clear operation.'));
        };
      });
    },

    async importAbbreviations(abbreviationsToImport) {
      const db = await openDatabase();
      let importedCount = 0;
      
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_ABBREVIATIONS, STORE_RULES], 'readwrite');
        const abbrStore = transaction.objectStore(STORE_ABBREVIATIONS);
        const rulesStore = transaction.objectStore(STORE_RULES);

        transaction.onerror = (event) => {
          console.error('Transaction error during import', event.target.error);
          reject(new Error(`Failed to import abbreviations during transaction: ${event.target.error?.message || 'Unknown error'}`));
        };
        
        transaction.oncomplete = () => {
          chrome.runtime.sendMessage({ type: 'ABBREVIATIONS_UPDATED' }).catch(e => console.warn("SW: Could not send ABBREVIATIONS_UPDATED:", e));
          categoriesCache = null; // Invalida o cache de categorias
          resolve(importedCount);
        };

        if (abbreviationsToImport.length === 0) {
          resolve(0);
          return;
        }

        abbreviationsToImport.forEach(async (abbr) => {
          let validatedAbbr;
          try {
            const dataToValidate = { ...abbr };
            if (!dataToValidate.createdAt) dataToValidate.createdAt = new Date().toISOString();
            if (dataToValidate.usageCount === undefined) dataToValidate.usageCount = 0;
            if (dataToValidate.lastUsed === undefined) dataToValidate.lastUsed = null;
            if (dataToValidate.enabled === undefined) dataToValidate.enabled = true;
            if (!dataToValidate.category) dataToValidate.category = 'Imported';
            
            validatedAbbr = AbbreviationModel.validate(dataToValidate);
          } catch (error) {
            console.warn(`Skipping invalid abbreviation during import: ${abbr.abbreviation} - ${error.message}`, abbr);
            return; // Pula esta abreviação
          }

          const abbrRequest = abbrStore.put(validatedAbbr);
          abbrRequest.onsuccess = () => {
            importedCount++;
            // Importar regras associadas, se houver
            if (abbr.rules && Array.isArray(abbr.rules)) {
              abbr.rules.forEach(async (rule) => {
                let validatedRule;
                try {
                  const ruleDataToValidate = { ...rule, abbreviationId: abbr.abbreviation };
                  delete ruleDataToValidate.id; // Remove ID para auto-incremento
                  validatedRule = RuleModel.validate(ruleDataToValidate);
                } catch (ruleError) {
                  console.warn(`Failed to import rule for ${abbr.abbreviation}: ${ruleError.message}`, rule);
                  return;
                }
                const ruleRequest = rulesStore.add(validatedRule);
                ruleRequest.onerror = (event) => {
                  console.warn(`Failed to import rule for ${abbr.abbreviation}: ${event.target.error?.message || 'Unknown error'}`, rule);
                };
              });
            }
          };
          abbrRequest.onerror = (event) => {
            console.warn(`Failed to import abbreviation: ${abbr.abbreviation} - ${event.target.error?.message || 'Unknown error'}`, abbr);
          };
        });
      });
    },
    // Adicionar um método para obter uma abreviação específica
    async getAbbreviation(abbreviationKey) {
        const db = await openDatabase();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_ABBREVIATIONS, 'readonly');
            const store = transaction.objectStore(STORE_ABBREVIATIONS);
            const request = store.get(abbreviationKey);

            request.onsuccess = () => {
                const result = request.result;
                if (result) {
                    try {
                        const validatedResult = { // Cria um novo objeto para validar
                            abbreviation: result.abbreviation,
                            expansion: result.expansion,
                            category: result.category,
                            caseSensitive: result.caseSensitive,
                            enabled: result.enabled,
                            createdAt: result.createdAt,
                            lastUsed: result.lastUsed,
                            usageCount: result.usageCount
                        };
                        resolve(AbbreviationModel.validate(validatedResult));
                    } catch (e) {
                        console.warn(`[IndexedDB] Abbreviation validation failed for key ${abbreviationKey} during get: ${e.message}. Returning raw data.`, result);
                        resolve(result); // Retorna raw se validação falhar
                    }
                } else {
                    resolve(null); // Não encontrado
                }
            };
            request.onerror = () => {
                console.error(`Failed to get abbreviation ${abbreviationKey}`, request.error);
                reject(new Error(`Failed to get abbreviation: ${request.error?.message || 'Unknown error'}`));
            };
        });
    }
  };
})(self || window); // Passa 'self' para Service Worker, 'window' para outros contextos