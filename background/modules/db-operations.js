// SOTE-main/background/modules/db-operations.js
(function (global) {
  "use strict";

  const DEBUG_PREFIX = "[SOTE DB Operations]";

  function log(message, ...args) {
    console.log(`${DEBUG_PREFIX} ${message}`, ...args);
  }

  function logError(message, error) {
    console.error(`${DEBUG_PREFIX} ${message}`, error);
  }

  const SoteDBOperations = {
    /**
     * Busca todas as abreviações e suas regras associadas.
     * @returns {Promise<Array<Object>>}
     */
    async getAbbreviations() {
      try {
        global.SoteValidators.validateDatabase();

        // Dexie torna transações complexas muito mais simples
        const abbreviations =
          await global.TextExpanderDB.abbreviations.toArray();
        const rules = await global.TextExpanderDB.expansionRules.toArray();
        const choices = await global.TextExpanderDB.choices.toArray();

        // Mapeia regras para abreviações
        const rulesMap = new Map();
        for (const rule of rules) {
          if (!rulesMap.has(rule.abbreviationId)) {
            rulesMap.set(rule.abbreviationId, []);
          }
          rulesMap.get(rule.abbreviationId).push(rule);
        }

        const result = abbreviations.map(abbr => ({
          ...abbr,
          rules: rulesMap.get(abbr.abbreviation) || [],
        }));

        log(`Recuperadas ${result.length || 0} abreviações.`);
        return result || [];
      } catch (error) {
        logError("Falha ao buscar abreviações:", error);
        throw new SoteErrorManager.DatabaseError(
          "Não foi possível buscar as abreviações.",
          error
        );
      }
    },

    /**
     * Adiciona ou atualiza uma abreviação.
     * @param {Object} abbreviationData - Os dados da abreviação.
     * @returns {Promise<string>} A chave da abreviação.
     */
    async addOrUpdateAbbreviation(abbreviationData) {
      const { rules, ...abbr } = abbreviationData;

      return global.TextExpanderDB.transaction(
        "rw",
        global.TextExpanderDB.abbreviations,
        global.TextExpanderDB.expansionRules,
        async () => {
          // Usa put() que insere ou substitui, simplificando a lógica
          await global.TextExpanderDB.abbreviations.put(abbr);

          // Apaga regras antigas e adiciona as novas para garantir consistência
          await global.TextExpanderDB.expansionRules
            .where("abbreviationId")
            .equals(abbr.abbreviation)
            .delete();
          if (rules && rules.length > 0) {
            const rulesToInsert = rules.map(rule => ({
              ...rule,
              abbreviationId: abbr.abbreviation,
            }));
            await global.TextExpanderDB.expansionRules.bulkAdd(rulesToInsert);
          }
        }
      );
    },

    /**
     * Remove uma abreviação e suas regras.
     * @param {string} abbreviationKey - A chave da abreviação.
     */
    async deleteAbbreviation(abbreviationKey) {
      return global.TextExpanderDB.transaction(
        "rw",
        global.TextExpanderDB.abbreviations,
        global.TextExpanderDB.expansionRules,
        async () => {
          await global.TextExpanderDB.abbreviations.delete(abbreviationKey);
          await global.TextExpanderDB.expansionRules
            .where("abbreviationId")
            .equals(abbreviationKey)
            .delete();
        }
      );
    },

    /**
     * Função mantida para compatibilidade - não atualiza mais estatísticas.
     * @param {string} abbreviationKey - A abreviação (parâmetro mantido para compatibilidade).
     * @returns {Promise<boolean>} Sempre retorna true para manter compatibilidade.
     */
    async updateUsage(abbreviationKey) {
      if (!abbreviationKey) {
        throw new SoteErrorManager.ValidationError(
          "A chave da abreviação não foi fornecida.",
          SoteErrorManager.ERROR_CODES.PERMANENT.MISSING_REQUIRED_FIELD
        );
      }

      log(
        `Função updateUsage chamada para '${abbreviationKey}' - estatísticas desabilitadas.`
      );

      // Notifica sobre atualização de estado sem modificar estatísticas
      try {
        const stateManager = await global.stateManagerSingleton.getInstance();
        const updatedState = await stateManager.getState();
        global.SoteBroadcaster.broadcastStateUpdate(updatedState);
      } catch (broadcastError) {
        logError(
          "Falha ao notificar sobre atualização de estado:",
          broadcastError
        );
      }

      return true;
    },

    /**
     * Atualiza uso em segundo plano sem bloquear outras operações.
     * Função mantida para compatibilidade - não faz mais nada.
     * @param {string} abbreviationKey - A abreviação (parâmetro mantido para compatibilidade).
     * @returns {Promise<void>} Promise que resolve imediatamente.
     */
    async updateUsageBackground(abbreviationKey) {
      log(
        `Função updateUsageBackground chamada para '${abbreviationKey}' - estatísticas desabilitadas.`
      );
      // Função mantida para compatibilidade - não faz mais nada
    },

    /**
     * Busca a configuração de uma escolha pelo seu ID.
     * @param {number} choiceId - O ID da escolha.
     */
    async getChoiceConfig(choiceId) {
      if (!choiceId) throw new Error("O ID da escolha não foi fornecido.");
      return global.TextExpanderDB.choices.get(choiceId);
    },

    /**
     * Limpa todos os dados de todas as tabelas.
     */
    async clearAllData() {
      return Promise.all([
        global.TextExpanderDB.abbreviations.clear(),
        global.TextExpanderDB.expansionRules.clear(),
        global.TextExpanderDB.choices.clear(),
      ]);
    },

    /**
     * Importa dados, substituindo ou mesclando.
     * @param {Object} importPayload - O payload com dados e flag de modo.
     */
    async importData({ data, choices, isMerge }) {
      const abbreviationsToImport = data;
      const choicesToImport = choices || [];

      return global.TextExpanderDB.transaction(
        "rw",
        global.TextExpanderDB.abbreviations,
        global.TextExpanderDB.expansionRules,
        global.TextExpanderDB.choices,
        async () => {
          if (!isMerge) {
            await SoteDBOperations.clearAllData();
          }

          // Importar Choices primeiro para mapear IDs antigos para novos
          const idMap = new Map();
          if (choicesToImport.length > 0) {
            for (const choice of choicesToImport) {
              const oldId = choice.id;
              delete choice.id;
              const newId = await global.TextExpanderDB.choices.add(choice);
              idMap.set(oldId, newId);
            }
          }

          // Atualizar expansões com os novos IDs de choice
          const updatedAbbreviations = abbreviationsToImport.map(abbr => {
            const replacer = (match, oldIdStr) => {
              const oldId = parseInt(oldIdStr, 10);
              return idMap.has(oldId)
                ? `$choice(id=${idMap.get(oldId)})$`
                : match;
            };

            abbr.expansion = abbr.expansion.replace(
              /\$choice\(id=(\d+)\)\$/g,
              replacer
            );
            if (abbr.rules) {
              abbr.rules.forEach(rule => {
                rule.expansion = rule.expansion.replace(
                  /\$choice\(id=(\d+)\)\$/g,
                  replacer
                );
              });
            }
            return abbr;
          });

          // Separar abreviações e regras para bulk operations
          const abbreviationsOnly = updatedAbbreviations.map(
            ({ rules, ...abbr }) => abbr
          );
          const allRules = updatedAbbreviations.flatMap(
            ({ abbreviation, rules }) =>
              (rules || []).map(rule => ({
                ...rule,
                abbreviationId: abbreviation,
              }))
          );

          // Usar bulkPut para performance
          await global.TextExpanderDB.abbreviations.bulkPut(abbreviationsOnly);
          if (allRules.length > 0) {
            await global.TextExpanderDB.expansionRules.bulkPut(allRules);
          }
        }
      );
    },
  };

  global.SoteDBOperations = SoteDBOperations;
  console.log(`${DEBUG_PREFIX} Módulo carregado com Dexie.js.`);
})(self);
