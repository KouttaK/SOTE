// SOTE-main/background/modules/broadcasting.js
(function (global) {
  "use strict";

  const DEBUG_PREFIX = "[SOTE Broadcaster]";

  function log(message, ...args) {
    console.log(`${DEBUG_PREFIX} ${message}`, ...args);
  }

  function logWarn(message, ...args) {
    console.warn(`${DEBUG_PREFIX} ${message}`, ...args);
  }

  function logError(message, error) {
    console.error(`${DEBUG_PREFIX} ${message}`, error);
  }

  const SoteBroadcaster = {
    /**
     * Notifica todas as abas e UIs sobre uma mudança no estado global.
     * @param {Object} newState - O novo estado completo da aplicação.
     */
    async broadcastStateUpdate(newState) {
      try {
        const message = {
          type: global.SOTE_CONSTANTS.MESSAGE_TYPES.STATE_UPDATED,
          payload: newState,
          timestamp: new Date().toISOString(),
        };

        // Envia para todas as abas
        const tabs = await chrome.tabs.query({});
        const tabPromises = tabs
          .filter(tab => tab.id && tab.url && !tab.url.startsWith("chrome://"))
          .map(tab =>
            chrome.tabs.sendMessage(tab.id, message).catch(err => {
              if (
                !err.message
                  ?.toLowerCase()
                  .includes("receiving end does not exist")
              ) {
                logWarn(`Falha ao notificar aba ${tab.id}:`, err.message);
              }
            })
          );

        // Envia para a UI da extensão (popup, dashboard)
        const runtimePromise = chrome.runtime
          .sendMessage(message)
          .catch(err => {
            if (
              !err.message
                ?.toLowerCase()
                .includes("receiving end does not exist")
            ) {
              logWarn(`Falha ao notificar runtime:`, err.message);
            }
          });

        await Promise.all([...tabPromises, runtimePromise]);
        log(`Broadcast de STATE_UPDATED concluído.`);
      } catch (error) {
        logError("Falha ao fazer broadcast da atualização de estado:", error);
      }
    },

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
  };

  global.SoteBroadcaster = SoteBroadcaster;
  console.log(`${DEBUG_PREFIX} Módulo carregado.`);
})(self);
