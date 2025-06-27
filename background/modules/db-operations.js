// SOTE-main/background/modules/db-operations.js
(function (global) {
  "use strict";

  const DEBUG_PREFIX = "[SOTE DB Operations]";
  const MAX_RETRY_ATTEMPTS = 3;
  const RETRY_DELAY = 1000;

  function log(message, ...args) {
    console.log(`${DEBUG_PREFIX} ${message}`, ...args);
  }

  function logError(message, error) {
    console.error(`${DEBUG_PREFIX} ${message}`, error);
  }

  async function retryOperation(operation) {
    for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
      try {
        return await operation();
      } catch (error) {
        if (attempt === MAX_RETRY_ATTEMPTS) throw error;
        console.warn(
          `${DEBUG_PREFIX} Falha na operação (tentativa ${attempt}), tentando novamente...`,
          error.message
        );
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      }
    }
  }

  const SoteDBOperations = {
    /**
     * Busca todas as abreviações do banco de dados.
     * @returns {Promise<Array<Object>>}
     */
    async getAbbreviations() {
      try {
        global.SoteValidators.validateDatabase();
        const abbreviationsArray = await retryOperation(() =>
          global.TextExpanderDB.getAllAbbreviations()
        );
        log(`Recuperadas ${abbreviationsArray?.length || 0} abreviações.`);
        return abbreviationsArray || [];
      } catch (error) {
        logError("Falha ao buscar abreviações:", error);
        throw error;
      }
    },

    /**
     * Atualiza as estatísticas de uso de uma abreviação.
     * @param {string} abbreviationKey - A abreviação a ser atualizada.
     * @returns {Promise<Object>} - O objeto com os dados de uso atualizados.
     */
    async updateUsage(abbreviationKey) {
      if (!abbreviationKey)
        throw new Error("A chave da abreviação não foi fornecida.");

      try {
        global.SoteValidators.validateDatabase();
        const abbrData = await retryOperation(() =>
          global.TextExpanderDB.getAbbreviation(abbreviationKey)
        );
        if (!abbrData) throw new Error("Abreviação não encontrada.");

        const updatedData = {
          ...abbrData,
          usageCount: (abbrData.usageCount || 0) + 1,
          lastUsed: new Date().toISOString(),
        };

        await retryOperation(() =>
          global.TextExpanderDB.updateAbbreviation(updatedData)
        );
        log(
          `Uso atualizado para "${abbreviationKey}": contagem=${updatedData.usageCount}`
        );

        return { success: true, usageCount: updatedData.usageCount };
      } catch (error) {
        logError("Falha ao atualizar estatísticas de uso:", error);
        throw error;
      }
    },

    /**
     * Busca a configuração de uma escolha pelo seu ID.
     * @param {number} choiceId - O ID da escolha.
     * @returns {Promise<Object>} - Os dados da escolha.
     */
    async getChoiceConfig(choiceId) {
      if (!choiceId) throw new Error("O ID da escolha não foi fornecido.");

      try {
        global.SoteValidators.validateDatabase();
        const choiceData = await global.TextExpanderDB.getChoice(choiceId);
        if (!choiceData)
          throw new Error(
            `Configuração de escolha com ID ${choiceId} não encontrada.`
          );

        return choiceData;
      } catch (error) {
        logError("Falha ao buscar configuração de escolha:", error);
        throw error;
      }
    },
  };

  global.SoteDBOperations = SoteDBOperations;
  console.log(`${DEBUG_PREFIX} Módulo carregado.`);
})(self);
