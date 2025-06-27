// SOTE-main/background/modules/validations.js
(function (global) {
  "use strict";

  const DEBUG_PREFIX = "[SOTE Validation Module]";

  const SoteValidators = {
    /**
     * Valida se as constantes essenciais da SOTE estão disponíveis no escopo global.
     * @returns {boolean} - Retorna true se as constantes forem válidas.
     * @throws {Error} - Lança um erro se as constantes não estiverem disponíveis.
     */
    validateConstants() {
      if (!global.SOTE_CONSTANTS) {
        throw new Error("SOTE_CONSTANTS não está disponível");
      }

      const required = [
        "STORE_ABBREVIATIONS",
        "STORE_RULES",
        "STORE_CHOICES",
        "MESSAGE_TYPES",
      ];
      for (const prop of required) {
        if (!global.SOTE_CONSTANTS[prop]) {
          throw new Error(`SOTE_CONSTANTS.${prop} não está disponível`);
        }
      }
      return true;
    },

    /**
     * Valida se o objeto do banco de dados (TextExpanderDB) está disponível.
     * @returns {boolean} - Retorna true se o DB estiver disponível.
     * @throws {Error} - Lança um erro se o DB não estiver disponível.
     */
    validateDatabase() {
      if (typeof global.TextExpanderDB === "undefined") {
        throw new Error("TextExpanderDB não está disponível");
      }
      return true;
    },

    /**
     * Executa todas as validações essenciais.
     * @throws {Error} - Lança um erro se qualquer validação falhar.
     */
    validateAll() {
      try {
        this.validateConstants();
        this.validateDatabase();
        console.log(`${DEBUG_PREFIX} Todas as validações passaram.`);
      } catch (error) {
        console.error(`${DEBUG_PREFIX} Falha na validação:`, error);
        throw error;
      }
    },
  };

  global.SoteValidators = SoteValidators;
  console.log(`${DEBUG_PREFIX} Módulo carregado.`);
})(self);
