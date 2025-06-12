// SOTE-main/utils/db.js
(function (global) {
  "use strict";

  const DB_NAME = global.SOTE_CONSTANTS.DB_NAME;
  const DB_VERSION = global.SOTE_CONSTANTS.DB_VERSION;
  const STORE_ABBREVIATIONS = global.SOTE_CONSTANTS.STORE_ABBREVIATIONS;
  const STORE_RULES = global.SOTE_CONSTANTS.STORE_RULES;

  const MIGRATIONS = {
    1: db => {
      if (!db.objectStoreNames.contains(STORE_ABBREVIATIONS)) {
        const store = db.createObjectStore(STORE_ABBREVIATIONS, {
          keyPath: "abbreviation",
        });
        store.createIndex("category", "category", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_RULES)) {
        const rulesStore = db.createObjectStore(STORE_RULES, {
          keyPath: "id",
          autoIncrement: true,
        });
        rulesStore.createIndex("abbreviationId", "abbreviationId", {
          unique: false,
        });
      }
    },
    2: (db, oldVersion) => {
      /* Sem mudanças de schema, apenas lógica */
    },
    3: db => {
      if (!db.objectStoreNames.contains("statistics")) {
        db.createObjectStore("statistics", {
          keyPath: "id",
          autoIncrement: true,
        }).createIndex("abbreviationId", "abbreviationId", { unique: true });
      }
    },
  };

  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => reject(new Error("Failed to open database"));
      request.onsuccess = event => resolve(event.target.result);
      request.onupgradeneeded = event => {
        const db = event.target.result;
        const oldVersion = event.oldVersion;
        for (let i = oldVersion + 1; i <= DB_VERSION; i++) {
          if (MIGRATIONS[i]) MIGRATIONS[i](db, oldVersion);
        }
      };
    });
  }

  class Validator {
    static validate(data, schema, strict = false) {
      if (typeof data !== "object" || data === null)
        throw new Error("Data must be an object.");

      const validatedData = {};
      const errors = [];

      if (strict) {
        const schemaKeys = new Set(Object.keys(schema));
        for (const key in data) {
          if (!schemaKeys.has(key)) {
            errors.push(`Field '${key}' is not allowed.`);
          }
        }
      }

      for (const key in schema) {
        const fieldSchema = schema[key];
        let value = data[key];

        if (
          fieldSchema.required &&
          (value === undefined ||
            value === null ||
            (typeof value === "string" && value.trim() === ""))
        ) {
          errors.push(`Field '${key}' is required.`);
          continue;
        }

        if (value === undefined || value === null) {
          if (fieldSchema.default !== undefined) {
            validatedData[key] = fieldSchema.default;
          }
          continue;
        }

        const type = Array.isArray(value) ? "array" : typeof value;
        if (fieldSchema.type && type !== fieldSchema.type) {
          errors.push(
            `Field '${key}' must be of type '${fieldSchema.type}', but received '${type}'.`
          );
          continue;
        }

        if (type === "string") {
          if (
            fieldSchema.minLength !== undefined &&
            value.length < fieldSchema.minLength
          )
            errors.push(
              `'${key}' must be at least ${fieldSchema.minLength} characters.`
            );
          if (fieldSchema.enum && !fieldSchema.enum.includes(value))
            errors.push(
              `'${key}' must be one of: ${fieldSchema.enum.join(", ")}.`
            );
        } else if (type === "number") {
          if (fieldSchema.min !== undefined && value < fieldSchema.min)
            errors.push(`'${key}' must be at least ${fieldSchema.min}.`);
          if (fieldSchema.max !== undefined && value > fieldSchema.max)
            errors.push(`'${key}' must be at most ${fieldSchema.max}.`);
        } else if (type === "array" && fieldSchema.items) {
          for (const item of value) {
            if (typeof item !== fieldSchema.items.type) {
              errors.push(
                `Items in '${key}' must be of type '${fieldSchema.items.type}'.`
              );
              break;
            }
          }
        }

        validatedData[key] = value;
      }

      if (errors.length > 0) throw new Error(errors.join(" "));
      return validatedData;
    }
  }

  class AbbreviationModel {
    static schema = {
      abbreviation: { required: true, type: "string", minLength: 1 },
      expansion: { required: true, type: "string" },
      category: { type: "string", default: "Comum" },
      caseSensitive: { type: "boolean", default: false },
      enabled: { type: "boolean", default: true },
      createdAt: { type: "string" },
      lastUsed: { type: "string", default: null },
      usageCount: { type: "number", default: 0, min: 0 },
      rules: { type: "array", default: [], items: { type: "object" } },
    };
    static validate(data, strict = false) {
      const validated = Validator.validate(data, this.schema, strict);
      if (data.rules) {
        validated.rules = data.rules.map(rule =>
          RuleModel.validate(rule, strict)
        );
      }
      return validated;
    }
  }

  class RuleModel {
    static schema = {
      id: { type: "number" },
      abbreviationId: { type: "string" },
      type: {
        required: true,
        type: "string",
        enum: ["dayOfWeek", "timeRange", "domain", "specialDate", "combined"],
      },
      expansion: { required: true, type: "string" },
      priority: { type: "number", default: 0, min: 0, max: 100 },
      days: { type: "array" },
      startHour: { type: "number" },
      startMinute: { type: "number" },
      endHour: { type: "number" },
      endMinute: { type: "number" },
      domains: { type: "array" },
      month: { type: "number" },
      day: { type: "number" },
      logicalOperator: { type: "string", enum: ["AND", "OR"] },
      subConditions: { type: "array" },
    };
    static validate(data, strict = false) {
      return Validator.validate(data, this.schema, strict);
    }
  }

  let categoriesCache = null;
  let categoriesCacheTimestamp = 0;
  const CATEGORIES_CACHE_TTL = 5 * 60 * 1000;

  global.TextExpanderDB = {
    openDatabase,
    AbbreviationModel, // Expose for validation in dashboard

    async getAllAbbreviations() {
      const db = await openDatabase();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(
          [STORE_ABBREVIATIONS, STORE_RULES],
          "readonly"
        );
        const abbrStore = transaction.objectStore(STORE_ABBREVIATIONS);
        const rulesStore = transaction.objectStore(STORE_RULES);
        const abbrRequest = abbrStore.getAll();
        const rulesRequest = rulesStore.getAll();
        let abbreviations, rules;
        abbrRequest.onsuccess = () => {
          abbreviations = abbrRequest.result;
          if (rules)
            resolve(this._mapRulesToAbbreviations(abbreviations, rules));
        };
        rulesRequest.onsuccess = () => {
          rules = rulesRequest.result;
          if (abbreviations)
            resolve(this._mapRulesToAbbreviations(abbreviations, rules));
        };
        abbrRequest.onerror = () =>
          reject(new Error("Failed to get abbreviations"));
        rulesRequest.onerror = () => reject(new Error("Failed to get rules"));
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
        rules: rulesMap.get(abbr.abbreviation) || [],
      }));
    },

    async addAbbreviation(abbreviation) {
      const validatedAbbr = AbbreviationModel.validate({
        ...abbreviation,
        createdAt: abbreviation.createdAt || new Date().toISOString(),
      });
      delete validatedAbbr.rules;
      const db = await openDatabase();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_ABBREVIATIONS, "readwrite");
        const store = transaction.objectStore(STORE_ABBREVIATIONS);
        const request = store.add(validatedAbbr);
        request.onsuccess = () => resolve();
        request.onerror = e => reject(e.target.error);
        transaction.oncomplete = () => {
          chrome.runtime
            .sendMessage({
              type: SOTE_CONSTANTS.MESSAGE_TYPES.ABBREVIATIONS_UPDATED,
            })
            .catch(() => {});
          categoriesCache = null;
        };
      });
    },

    async updateAbbreviation(abbreviation) {
      const existing = await this.getAbbreviation(abbreviation.abbreviation);
      const validatedAbbr = AbbreviationModel.validate({
        ...existing,
        ...abbreviation,
      });
      delete validatedAbbr.rules;
      const db = await openDatabase();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_ABBREVIATIONS, "readwrite");
        const store = transaction.objectStore(STORE_ABBREVIATIONS);
        const request = store.put(validatedAbbr);
        request.onsuccess = () => resolve();
        request.onerror = e => reject(e.target.error);
        transaction.oncomplete = () => {
          chrome.runtime
            .sendMessage({
              type: SOTE_CONSTANTS.MESSAGE_TYPES.ABBREVIATIONS_UPDATED,
            })
            .catch(() => {});
          categoriesCache = null;
        };
      });
    },

    async deleteAbbreviation(abbreviationKey) {
      const db = await openDatabase();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(
          [STORE_ABBREVIATIONS, STORE_RULES],
          "readwrite"
        );
        const rulesStore = transaction.objectStore(STORE_RULES);
        const rulesIndex = rulesStore.index("abbreviationId");
        transaction.objectStore(STORE_ABBREVIATIONS).delete(abbreviationKey);
        const getRulesRequest = rulesIndex.getAll(abbreviationKey);
        getRulesRequest.onsuccess = () => {
          getRulesRequest.result.forEach(rule => rulesStore.delete(rule.id));
        };
        transaction.oncomplete = () => {
          chrome.runtime
            .sendMessage({
              type: SOTE_CONSTANTS.MESSAGE_TYPES.ABBREVIATIONS_UPDATED,
            })
            .catch(() => {});
          categoriesCache = null;
          resolve();
        };
        transaction.onerror = e => reject(e.target.error);
      });
    },

    async addExpansionRule(rule) {
      const validatedRule = RuleModel.validate(rule);
      delete validatedRule.id;
      const db = await openDatabase();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_RULES, "readwrite");
        const store = transaction.objectStore(STORE_RULES);
        const request = store.add(validatedRule);
        request.onsuccess = () => resolve(request.result);
        request.onerror = e => reject(e.target.error);
        transaction.oncomplete = () =>
          chrome.runtime
            .sendMessage({
              type: SOTE_CONSTANTS.MESSAGE_TYPES.ABBREVIATIONS_UPDATED,
            })
            .catch(() => {});
      });
    },

    async updateExpansionRule(rule) {
      const validatedRule = RuleModel.validate(rule);
      const db = await openDatabase();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_RULES, "readwrite");
        const store = transaction.objectStore(STORE_RULES);
        const request = store.put(validatedRule);
        request.onsuccess = () => resolve();
        request.onerror = e => reject(e.target.error);
        transaction.oncomplete = () =>
          chrome.runtime
            .sendMessage({
              type: SOTE_CONSTANTS.MESSAGE_TYPES.ABBREVIATIONS_UPDATED,
            })
            .catch(() => {});
      });
    },

    async deleteExpansionRule(ruleId) {
      const db = await openDatabase();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_RULES, "readwrite");
        const store = transaction.objectStore(STORE_RULES);
        const request = store.delete(ruleId);
        request.onsuccess = () => resolve();
        request.onerror = e => reject(e.target.error);
        transaction.oncomplete = () =>
          chrome.runtime
            .sendMessage({
              type: SOTE_CONSTANTS.MESSAGE_TYPES.ABBREVIATIONS_UPDATED,
            })
            .catch(() => {});
      });
    },

    async getAllCategories() {
      if (
        categoriesCache &&
        Date.now() - categoriesCacheTimestamp < CATEGORIES_CACHE_TTL
      ) {
        return Promise.resolve(categoriesCache);
      }
      const db = await openDatabase();
      return new Promise((resolve, reject) => {
        const store = db
          .transaction(STORE_ABBREVIATIONS, "readonly")
          .objectStore(STORE_ABBREVIATIONS);
        const request = store.index("category").openCursor(null, "nextunique");
        const categories = new Set();
        request.onsuccess = event => {
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
        request.onerror = e => reject(e.target.error);
      });
    },

    async clearAllAbbreviations() {
      const db = await openDatabase();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(
          [STORE_ABBREVIATIONS, STORE_RULES],
          "readwrite"
        );
        transaction.objectStore(STORE_ABBREVIATIONS).clear();
        transaction.objectStore(STORE_RULES).clear();
        transaction.oncomplete = () => {
          chrome.runtime
            .sendMessage({
              type: SOTE_CONSTANTS.MESSAGE_TYPES.ABBREVIATIONS_UPDATED,
            })
            .catch(() => {});
          categoriesCache = null;
          resolve();
        };
        transaction.onerror = e => reject(e.target.error);
      });
    },

    async importAbbreviations(abbreviationsToImport, isMerge = true) {
      const db = await openDatabase();
      const transaction = db.transaction(
        [STORE_ABBREVIATIONS, STORE_RULES],
        "readwrite"
      );
      const abbrStore = transaction.objectStore(STORE_ABBREVIATIONS);
      const rulesStore = transaction.objectStore(STORE_RULES);
      let processedCount = 0;

      const importPromises = abbreviationsToImport.map(async abbr => {
        try {
          let validatedAbbr = AbbreviationModel.validate(abbr);

          if (isMerge) {
            const existing = await this.getAbbreviation(
              validatedAbbr.abbreviation
            );
            if (existing) {
              validatedAbbr.createdAt = existing.createdAt;
              validatedAbbr.usageCount = abbr.usageCount ?? existing.usageCount;
              validatedAbbr.lastUsed = abbr.lastUsed ?? existing.lastUsed;
            }
          }

          const rulesIndex = rulesStore.index("abbreviationId");
          const oldRulesReq = rulesIndex.getAll(validatedAbbr.abbreviation);

          await new Promise(resolve => {
            oldRulesReq.onsuccess = () => {
              oldRulesReq.result.forEach(rule => rulesStore.delete(rule.id));
              resolve();
            };
          });

          const rulesToSave = validatedAbbr.rules;
          delete validatedAbbr.rules;
          abbrStore.put(validatedAbbr);

          if (rulesToSave && rulesToSave.length > 0) {
            rulesToSave.forEach(rule => {
              const ruleData = {
                ...rule,
                abbreviationId: validatedAbbr.abbreviation,
              };
              delete ruleData.id;
              rulesStore.add(ruleData);
            });
          }
          processedCount++;
        } catch (e) {
          console.warn(
            `Ignorando item durante importação final: ${abbr.abbreviation}`,
            e.message
          );
        }
      });

      await Promise.all(importPromises);

      return new Promise((resolve, reject) => {
        transaction.oncomplete = () => {
          chrome.runtime
            .sendMessage({
              type: SOTE_CONSTANTS.MESSAGE_TYPES.ABBREVIATIONS_UPDATED,
            })
            .catch(() => {});
          categoriesCache = null;
          resolve(processedCount);
        };
        transaction.onerror = e => reject(e.target.error);
      });
    },

    async getAbbreviation(abbreviationKey) {
      const db = await openDatabase();
      return new Promise((resolve, reject) => {
        const request = db
          .transaction(STORE_ABBREVIATIONS, "readonly")
          .objectStore(STORE_ABBREVIATIONS)
          .get(abbreviationKey);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = e => reject(e.target.error);
      });
    },
  };
})(self || window);
