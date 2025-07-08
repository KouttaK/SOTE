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
        rules: [],
      }));
    },

    /**
     * Popula o banco de dados com abreviações padrão se estiver vazio.
     */
    async seedInitialDataIfNeeded() {
      try {
        // A sintaxe do Dexie para contar é muito mais limpa
        const existingCount = await global.TextExpanderDB.abbreviations.count();

        if (existingCount === 0) {
          log("O banco de dados está vazio. Populando com dados padrão...");
          const defaultAbbreviations = this.getDefaultAbbreviations();

          // bulkAdd é a forma mais performática de inserir múltiplos itens
          await global.TextExpanderDB.abbreviations.bulkAdd(
            defaultAbbreviations
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
