// SOTE-main/background/modules/data-handler.js
(function (global) {
  "use strict";

  const DEBUG_PREFIX = "[SOTE Data Handler]";

  function log(message, ...args) {
    console.log(`${DEBUG_PREFIX} ${message}`, ...args);
  }

  function logError(message, error) {
    console.error(`${DEBUG_PREFIX} ${message}`, error);
  }

  const SoteDataHandler = {
    /**
     * Retorna a lista de abreviações padrão.
     * @returns {Array<Object>}
     */
    getDefaultAbbreviations() {
      const timestamp = new Date().toISOString();
      return [
        { abbreviation: "btw", expansion: "by the way", category: "Comum" },
        {
          abbreviation: "afaik",
          expansion: "as far as I know",
          category: "Comum",
        },
        { abbreviation: "ty", expansion: "thank you", category: "Comum" },
        { abbreviation: "omg", expansion: "oh my god", category: "Comum" },
        { abbreviation: "brb", expansion: "be right back", category: "Comum" },
      ].map(abbr => ({
        ...abbr,
        caseSensitive: false,
        enabled: true,
        createdAt: timestamp,
        lastUsed: null,
        usageCount: 0,
        rules: [],
      }));
    },

    /**
     * Popula o banco de dados com abreviações padrão se não existirem.
     */
    async seedInitialDataIfNeeded() {
      try {
        const db = await global.TextExpanderDB.openDatabase();
        const store = db
          .transaction(global.SOTE_CONSTANTS.STORE_ABBREVIATIONS, "readonly")
          .objectStore(global.SOTE_CONSTANTS.STORE_ABBREVIATIONS);

        const countRequest = store.count();
        const existingCount = await new Promise((resolve, reject) => {
          countRequest.onsuccess = () => resolve(countRequest.result);
          countRequest.onerror = () => reject(countRequest.error);
        });

        if (existingCount === 0) {
          log("O banco de dados está vazio. Populando com dados padrão...");
          const defaultAbbreviations = this.getDefaultAbbreviations();

          await Promise.all(
            defaultAbbreviations.map(abbr =>
              global.TextExpanderDB.addAbbreviation(abbr)
            )
          );

          log(
            `${defaultAbbreviations.length} abreviações padrão foram adicionadas.`
          );
        } else {
          log(`O banco de dados já contém ${existingCount} abreviações.`);
        }
      } catch (error) {
        logError("Falha ao popular dados iniciais:", error);
        throw error;
      }
    },
  };

  global.SoteDataHandler = SoteDataHandler;
  console.log(`${DEBUG_PREFIX} Módulo carregado.`);
})(self);
