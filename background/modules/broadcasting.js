// SOTE-main/background/modules/broadcasting.js
(function (global) {
  "use strict";

  const DEBUG_PREFIX = "[SOTE Broadcaster]";
  const BROADCAST_DEBOUNCE_DELAY = 100;

  function log(message, ...args) {
    console.log(`${DEBUG_PREFIX} ${message}`, ...args);
  }

  function logWarn(message, ...args) {
    console.warn(`${DEBUG_PREFIX} ${message}`, ...args);
  }

  function logError(message, error) {
    console.error(`${DEBUG_PREFIX} ${message}`, error);
  }

  function debounce(func, delay) {
    let timeoutId;
    return function (...args) {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => func.apply(this, args), delay);
    };
  }

  const SoteBroadcaster = {
    /**
     * Notifica todas as abas sobre a atualização das abreviações.
     */
    broadcastAbbreviationsUpdate: debounce(async () => {
      try {
        const tabs = await chrome.tabs.query({});
        const results = await Promise.allSettled(
          tabs
            .filter(
              tab => tab.id && tab.url && !tab.url.startsWith("chrome://")
            )
            .map(async tab => {
              try {
                await chrome.tabs.sendMessage(tab.id, {
                  type: global.SOTE_CONSTANTS.MESSAGE_TYPES
                    .ABBREVIATIONS_UPDATED,
                  timestamp: new Date().toISOString(),
                });
                return { success: true, tabId: tab.id };
              } catch (error) {
                // Ignora erros de "receiving end does not exist" silenciosamente
                if (
                  !error.message
                    ?.toLowerCase()
                    .includes("receiving end does not exist")
                ) {
                  logWarn(`Falha ao notificar aba ${tab.id}:`, error.message);
                }
                return { success: false, tabId: tab.id, error: error.message };
              }
            })
        );
        const successful = results.filter(r => r.value?.success).length;
        if (results.length > 0) {
          log(
            `Broadcast de atualização de abreviações concluído: ${successful}/${results.length} abas notificadas.`
          );
        }
      } catch (error) {
        logError(
          "Falha ao fazer broadcast da atualização de abreviações:",
          error
        );
      }
    }, BROADCAST_DEBOUNCE_DELAY),

    /**
     * Notifica todas as abas sobre a atualização das configurações.
     * @param {Object} changes - O objeto de mudanças do `chrome.storage.onChanged`.
     */
    async broadcastSettingsUpdate(changes) {
      const settings = {};
      Object.keys(changes).forEach(key => {
        if (changes[key].newValue !== undefined) {
          settings[key] = changes[key].newValue;
        }
      });
      if (Object.keys(settings).length === 0) return;

      try {
        const tabs = await chrome.tabs.query({});
        const results = await Promise.allSettled(
          tabs
            .filter(
              tab => tab.id && tab.url && !tab.url.startsWith("chrome://")
            )
            .map(async tab => {
              try {
                await chrome.tabs.sendMessage(tab.id, {
                  type: global.SOTE_CONSTANTS.MESSAGE_TYPES.SETTINGS_UPDATED,
                  settings: settings,
                  timestamp: new Date().toISOString(),
                });
                return { success: true, tabId: tab.id };
              } catch (error) {
                if (
                  !error.message
                    ?.toLowerCase()
                    .includes("receiving end does not exist")
                ) {
                  logWarn(
                    `Falha ao notificar aba ${tab.id} sobre configurações:`,
                    error.message
                  );
                }
                return { success: false, tabId: tab.id };
              }
            })
        );
        const successful = results.filter(r => r.value?.success).length;
        log(
          `Broadcast de atualização de configurações: ${successful}/${results.length} abas notificadas.`
        );
      } catch (error) {
        logError(
          "Falha ao fazer broadcast da atualização de configurações:",
          error
        );
      }
    },

    /**
     * Envia uma mensagem para notificar que a semente inicial de dados foi concluída.
     */
    async notifyInitializationComplete() {
      try {
        await chrome.runtime.sendMessage({
          type: global.SOTE_CONSTANTS.MESSAGE_TYPES.INITIAL_SEED_COMPLETE,
        });
        log("Enviada notificação INITIAL_SEED_COMPLETE.");
      } catch (error) {
        log(
          "Não foi possível enviar INITIAL_SEED_COMPLETE (nenhum receptor ativo)."
        );
      }
    },
  };

  global.SoteBroadcaster = SoteBroadcaster;
  console.log(`${DEBUG_PREFIX} Módulo carregado.`);
})(self);
