// SOTE-main/background/service-worker.js

(function (global) {
  "use strict";

  // ===== IMPORTS =====
  try {
    // A ordem é importante: Dexie primeiro, depois o resto.
    global.importScripts("../utils/dexie.js");
    global.importScripts("../utils/constants.js");
    global.importScripts("../utils/db.js");
    global.importScripts("../utils/StateManager.js");
    global.importScripts("../utils/ErrorManager.js");
    global.importScripts("modules/validations.js");
    global.importScripts("modules/data-handler.js");
    global.importScripts("modules/db-operations.js");
    global.importScripts("modules/broadcasting.js");
  } catch (error) {
    console.error("[SOTE Service Worker] Falha ao importar scripts:", error);
  }

  // ===== SINGLETON STATE MANAGER COM ERROR HANDLING =====
  class StateManagerSingleton {
    constructor() {
      this.instance = null;
      this.initPromise = null;
      this.isInitializing = false;
      this.cache = new Map();
      this.cacheTimestamps = new Map();
      this.CACHE_TTL = 5 * 60 * 1000; // 5 minutos
      this.healthCheckInterval = null;

      // Configurar error handlers
      this.databaseHandler =
        SoteErrorManager.ErrorHandlerFactory.createDatabaseHandler();
      this.networkHandler =
        SoteErrorManager.ErrorHandlerFactory.createNetworkHandler();

      // Configurar graceful degradation
      this.degradationManager = SoteErrorManager.gracefulDegradationManager;
    }

    async getInstance() {
      if (this.instance) {
        return this.instance;
      }

      if (this.isInitializing) {
        const result = await this.initPromise;
        if (result && result.success) {
          return result.data;
        }
        throw new Error(
          "A inicialização concorrente falhou em resolver uma instância válida."
        );
      }

      this.isInitializing = true;
      this.initPromise = this._initializeWithErrorHandling();

      try {
        const result = await this.initPromise;

        if (!result || !result.success) {
          throw new SoteErrorManager.SystemError(
            "A inicialização do StateManager não retornou um resultado bem-sucedido.",
            SoteErrorManager.ERROR_CODES.SYSTEM.INITIALIZATION_FAILED,
            { result }
          );
        }

        this.instance = result.data;
        this.isInitializing = false;
        this._startHealthCheck();
        return this.instance;
      } catch (error) {
        this.isInitializing = false;
        this.initPromise = null;
        throw error;
      }
    }

    async _initializeWithErrorHandling() {
      const transactionId = `init_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;

      return await this.degradationManager.executeWithFallback(
        "stateManager",
        async context => {
          return await this.databaseHandler.execute(async dbContext => {
            return await this._initialize(dbContext);
          }, context);
        },
        async context => {
          SoteErrorManager.Logger.warn(
            "Inicializando com fallback - dados mínimos",
            context
          );
          return this._initializeMinimal(context);
        },
        { transactionId, operation: "initialize" }
      );
    }

    async _initialize(context) {
      try {
        SoteErrorManager.Logger.info(
          "Iniciando inicialização completa do StateManager",
          context
        );

        SoteValidators.validateAll();
        await this._performDatabaseHealthCheck(context);
        await SoteDataHandler.seedInitialDataIfNeeded();

        const [abbreviations, settings] = await Promise.all([
          this._getCachedAbbreviations(context),
          this._getStorageSettings(context),
        ]);

        const initialState = {
          abbreviations: abbreviations || [],
          settings: settings || {},
          isEnabled: settings.enabled !== false,
        };

        const stateManager = new global.StateManager(initialState, {
          enableLogging: true,
          enableTimeTravel: false,
          maxHistorySize: 10,
        });

        stateManager.subscribe((newState, oldState) => {
          SoteBroadcaster.broadcastStateUpdate(newState);
          this._updateCache("state", newState);
        });

        this.degradationManager._markComponentHealthy("database");
        this.degradationManager._markComponentHealthy("stateManager");
        this.degradationManager.setCachedData("abbreviations", abbreviations);
        this.degradationManager.setCachedData("settings", settings);

        SoteErrorManager.Logger.info(
          "StateManager inicializado com sucesso",
          context
        );
        return stateManager;
      } catch (error) {
        const soteError = SoteErrorManager.createError(
          "Falha na inicialização completa do StateManager",
          SoteErrorManager.ERROR_CODES.SYSTEM.INITIALIZATION_FAILED,
          "SYSTEM",
          context,
          error
        );

        SoteErrorManager.Logger.error(
          "Falha na inicialização do StateManager",
          {
            ...context,
            error: soteError.toJSON(),
          }
        );

        throw soteError;
      }
    }

    async _initializeMinimal(context) {
      try {
        SoteErrorManager.Logger.warn(
          "Inicializando StateManager em modo mínimo",
          context
        );
        const minimalState = {
          abbreviations: [],
          settings: { enabled: true },
          isEnabled: true,
        };
        const stateManager = new global.StateManager(minimalState, {
          enableLogging: true,
          enableTimeTravel: false,
          maxHistorySize: 5,
        });
        SoteErrorManager.Logger.info(
          "StateManager inicializado em modo mínimo",
          context
        );
        return stateManager;
      } catch (error) {
        const soteError = SoteErrorManager.createError(
          "Falha na inicialização mínima do StateManager",
          SoteErrorManager.ERROR_CODES.SYSTEM.CRITICAL_COMPONENT_FAILURE,
          "SYSTEM",
          context,
          error
        );
        SoteErrorManager.Logger.error("Falha crítica na inicialização", {
          ...context,
          error: soteError.toJSON(),
        });
        throw soteError;
      }
    }

    async _performDatabaseHealthCheck(context) {
      return await this.degradationManager.executeWithFallback(
        "database",
        async dbContext => {
          await global.TextExpanderDB.open();
          await global.TextExpanderDB.abbreviations.count();
          SoteErrorManager.Logger.info(
            "Verificação de saúde do banco concluída com Dexie",
            dbContext
          );
          return true;
        },
        null,
        context
      );
    }

    async _getStorageSettings(context) {
      return await this.networkHandler.execute(async netContext => {
        if (typeof chrome === "undefined" || !chrome.storage) {
          throw SoteErrorManager.createError(
            "Chrome storage API não disponível",
            SoteErrorManager.ERROR_CODES.SYSTEM.DEPENDENCY_MISSING,
            "SYSTEM",
            netContext
          );
        }
        return await chrome.storage.sync.get();
      }, context);
    }

    _startHealthCheck() {
      this.healthCheckInterval = setInterval(async () => {
        const transactionId = `health_${Date.now()}_${Math.random()
          .toString(36)
          .substr(2, 9)}`;
        try {
          await this._performDatabaseHealthCheck({
            transactionId,
            operation: "health_check",
          });
          SoteErrorManager.Logger.debug(
            "Verificação de saúde periódica bem-sucedida",
            { transactionId }
          );
        } catch (error) {
          SoteErrorManager.Logger.error(
            "Falha na verificação de saúde periódica",
            {
              transactionId,
              error: error.toJSON ? error.toJSON() : error.message,
            }
          );
          this.instance = null;
          clearInterval(this.healthCheckInterval);
        }
      }, 5 * 60 * 1000);
    }

    // Sistema de cache em memória
    _getCacheKey(type, params = "") {
      return `${type}:${params}`;
    }
    _isCacheValid(key) {
      const timestamp = this.cacheTimestamps.get(key);
      return timestamp && Date.now() - timestamp < this.CACHE_TTL;
    }
    _setCache(key, data) {
      this.cache.set(key, data);
      this.cacheTimestamps.set(key, Date.now());
    }
    _getCache(key) {
      if (this._isCacheValid(key)) {
        return this.cache.get(key);
      }
      this.cache.delete(key);
      this.cacheTimestamps.delete(key);
      return null;
    }
    _updateCache(type, data) {
      this._setCache(this._getCacheKey(type), data);
    }
    _invalidateCache(pattern = null) {
      if (pattern) {
        for (const key of this.cache.keys()) {
          if (key.includes(pattern)) {
            this.cache.delete(key);
            this.cacheTimestamps.delete(key);
          }
        }
      } else {
        this.cache.clear();
        this.cacheTimestamps.clear();
      }
    }

    async _getCachedAbbreviations(context) {
      const cacheKey = this._getCacheKey("abbreviations");
      let cached = this._getCache(cacheKey);

      if (cached) {
        SoteErrorManager.Logger.debug(
          "Abreviações carregadas do cache",
          context
        );
        return cached;
      }

      const abbreviations = await SoteDBOperations.getAbbreviations();
      this._setCache(cacheKey, abbreviations);
      SoteErrorManager.Logger.debug(
        "Abreviações carregadas do banco e armazenadas no cache",
        context
      );
      return abbreviations;
    }

    destroy() {
      if (this.healthCheckInterval) clearInterval(this.healthCheckInterval);
      this.cache.clear();
      this.cacheTimestamps.clear();
      this.instance = null;
      this.initPromise = null;
      this.isInitializing = false;
      SoteErrorManager.Logger.info("StateManagerSingleton destruído");
    }
  }

  // ===== INSTÂNCIA SINGLETON =====
  const stateManagerSingleton = new StateManagerSingleton();

  // Disponibilizar no escopo global para os módulos
  global.stateManagerSingleton = stateManagerSingleton;

  // ===== CORE LOGIC =====
  async function refreshStateFromDB() {
    const transactionId = `refresh_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;
    try {
      const stateManager = await stateManagerSingleton.getInstance();
      stateManagerSingleton._invalidateCache("abbreviations");

      const abbreviationsResult =
        await stateManagerSingleton.degradationManager.executeWithFallback(
          "database",
          context => SoteDBOperations.getAbbreviations(),
          context => {
            SoteErrorManager.Logger.warn(
              "Usando fallback para abreviações no refresh",
              context
            );
            return stateManagerSingleton._getCache("abbreviations") || [];
          },
          { transactionId, operation: "refresh_state" }
        );

      await stateManager.setState(
        { abbreviations: abbreviationsResult.data || [] },
        "REFRESH_FROM_DB"
      );
    } catch (error) {
      const soteError = SoteErrorManager.createError(
        "Falha ao recarregar o estado do DB",
        SoteErrorManager.ERROR_CODES.TEMPORARY.DATABASE_TIMEOUT,
        "TEMPORARY",
        { transactionId, operation: "refresh_state" },
        error
      );
      SoteErrorManager.Logger.error(
        "Falha ao recarregar o estado do DB",
        soteError
      );
    }
  }

  async function initializeApp() {
    const transactionId = `app_init_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;
    try {
      SoteErrorManager.Logger.info("Inicializando aplicação", {
        transactionId,
      });
      await stateManagerSingleton.getInstance();
      SoteErrorManager.Logger.info("Aplicação inicializada com sucesso", {
        transactionId,
      });
    } catch (error) {
      const soteError = SoteErrorManager.createError(
        "Falha grave na inicialização da aplicação",
        SoteErrorManager.ERROR_CODES.SYSTEM.INITIALIZATION_FAILED,
        "SYSTEM",
        { transactionId },
        error
      );
      SoteErrorManager.Logger.error("Falha grave na inicialização", soteError);
      throw soteError;
    }
  }

  // ===== MESSAGE HANDLER =====
  function handleMessage(message, sender, sendResponse) {
    (async () => {
      const transactionId = `msg_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;
      try {
        if (!message || typeof message !== "object") {
          // Ignorar mensagens inválidas ou que não são objetos
          return;
        }

        const { type, payload } = message;

        // Correção: Se a mensagem não tiver um 'type', ela não é para este handler.
        // Apenas ignore em vez de lançar um erro.
        if (!type) {
          SoteErrorManager.Logger.debug(
            "Mensagem recebida sem tipo, ignorando.",
            {
              transactionId,
              message,
              sender: sender?.tab?.url || sender?.id,
            }
          );
          return;
        }

        SoteErrorManager.Logger.debug("Processando mensagem", {
          transactionId,
          type,
          hasPayload: !!payload,
        });

        await stateManagerSingleton.getInstance();
        const { MESSAGE_TYPES } = global.SOTE_CONSTANTS;

        switch (type) {
          case MESSAGE_TYPES.GET_STATE:
            const state = (
              await stateManagerSingleton.getInstance()
            ).getState();
            sendResponse(state);
            break;

          case MESSAGE_TYPES.ADD_ABBREVIATION:
          case MESSAGE_TYPES.UPDATE_ABBREVIATION:
            if (!payload)
              throw SoteErrorManager.createError(
                `Payload obrigatório para ${type}`,
                SoteErrorManager.ERROR_CODES.PERMANENT.MISSING_REQUIRED_FIELD,
                "PERMANENT",
                { transactionId, type }
              );
            await SoteDBOperations.addOrUpdateAbbreviation(payload);
            await refreshStateFromDB();
            sendResponse({ success: true });
            break;

          case MESSAGE_TYPES.DELETE_ABBREVIATION:
            if (!payload?.abbreviationKey)
              throw SoteErrorManager.createError(
                "abbreviationKey obrigatório para DELETE_ABBREVIATION",
                SoteErrorManager.ERROR_CODES.PERMANENT.MISSING_REQUIRED_FIELD,
                "PERMANENT",
                { transactionId, type, payload }
              );
            await SoteDBOperations.deleteAbbreviation(payload.abbreviationKey);
            await refreshStateFromDB();
            sendResponse({ success: true });
            break;

          case MESSAGE_TYPES.IMPORT_DATA:
            if (!payload?.data)
              throw SoteErrorManager.createError(
                "Dados obrigatórios para IMPORT_DATA",
                SoteErrorManager.ERROR_CODES.PERMANENT.MISSING_REQUIRED_FIELD,
                "PERMANENT",
                { transactionId, type }
              );
            await SoteDBOperations.importData(payload);
            await refreshStateFromDB();
            sendResponse({ success: true });
            break;

          case MESSAGE_TYPES.CLEAR_ALL_DATA:
            await SoteDBOperations.clearAllData();
            await refreshStateFromDB();
            sendResponse({ success: true });
            break;

          case MESSAGE_TYPES.ADD_CHOICE:
            if (!payload?.options)
              throw SoteErrorManager.createError(
                "options obrigatório para ADD_CHOICE",
                SoteErrorManager.ERROR_CODES.PERMANENT.MISSING_REQUIRED_FIELD,
                "PERMANENT",
                { transactionId, type }
              );
            const newChoiceId = await global.TextExpanderDB.choices.add({
              options: payload.options,
            });
            sendResponse({ success: true, newChoiceId });
            break;

          case MESSAGE_TYPES.UPDATE_CHOICE:
            if (!payload?.choiceId || !payload?.options)
              throw SoteErrorManager.createError(
                "choiceId e options obrigatórios para UPDATE_CHOICE",
                SoteErrorManager.ERROR_CODES.PERMANENT.MISSING_REQUIRED_FIELD,
                "PERMANENT",
                { transactionId, type, payload }
              );
            await global.TextExpanderDB.choices.update(payload.choiceId, {
              options: payload.options,
            });
            sendResponse({ success: true });
            break;

          case MESSAGE_TYPES.GET_CHOICE_CONFIG:
            if (!payload?.id)
              throw SoteErrorManager.createError(
                "id obrigatório para GET_CHOICE_CONFIG",
                SoteErrorManager.ERROR_CODES.PERMANENT.MISSING_REQUIRED_FIELD,
                "PERMANENT",
                { transactionId, type }
              );
            const choiceData = await SoteDBOperations.getChoiceConfig(
              payload.id
            );
            sendResponse({ data: choiceData });
            break;

          case MESSAGE_TYPES.GET_ALL_CHOICES:
            const allChoices = await global.TextExpanderDB.choices.toArray();
            sendResponse({ success: true, data: allChoices });
            break;

          default:
            SoteErrorManager.Logger.warn(
              `Tipo de mensagem desconhecido recebido: ${type}`,
              { transactionId, type }
            );
            sendResponse({ error: "Tipo de mensagem desconhecido." });
        }
        SoteErrorManager.Logger.debug("Mensagem processada com sucesso", {
          transactionId,
          type,
        });
      } catch (error) {
        const soteError =
          error instanceof SoteErrorManager.SoteError
            ? error
            : SoteErrorManager.createError(
                `Erro ao processar a mensagem ${message?.type || "UNKNOWN"}`,
                SoteErrorManager.ERROR_CODES.TEMPORARY.SERVICE_BUSY,
                "TEMPORARY",
                { transactionId, messageType: message?.type },
                error
              );
        SoteErrorManager.Logger.error(
          `Erro ao processar a mensagem ${message?.type || "UNKNOWN"}`,
          soteError
        );
        sendResponse({
          error: "Falha ao processar a requisição.",
          details: soteError.message,
          code: soteError.code,
          transactionId: soteError.transactionId,
        });
      }
    })();
    return true;
  }

  // ===== EVENT LISTENERS =====
  global.addEventListener("install", event => {
    SoteErrorManager.Logger.info("Service Worker instalando...");
    event.waitUntil(
      initializeApp().catch(err => {
        SoteErrorManager.Logger.error(
          "Falha na inicialização durante a instalação.",
          { error: err }
        );
      })
    );
  });

  global.addEventListener("activate", event => {
    SoteErrorManager.Logger.info("Service Worker ativando...");
    event.waitUntil(global.clients.claim());
  });

  chrome.runtime.onMessage.addListener(handleMessage);

  chrome.storage.onChanged.addListener(async (changes, namespace) => {
    if (namespace !== "sync") return;
    const transactionId = `storage_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;
    try {
      const stateManager = await stateManagerSingleton.getInstance();
      const oldSettings = stateManager.getState("settings");
      const newSettings = { ...oldSettings };
      let settingsChanged = false;

      Object.keys(changes).forEach(key => {
        newSettings[key] = changes[key].newValue;
        settingsChanged = true;
      });

      if (settingsChanged) {
        SoteErrorManager.Logger.info("Mudanças no storage.sync detectadas", {
          transactionId,
          changes: Object.keys(changes),
        });
        await stateManager.setState(
          { settings: newSettings },
          "SETTINGS_SYNC_UPDATE"
        );
      }
    } catch (error) {
      const soteError = SoteErrorManager.createError(
        "Erro ao processar mudanças do storage.sync",
        SoteErrorManager.ERROR_CODES.TEMPORARY.CHROME_RUNTIME_DISCONNECTED,
        "TEMPORARY",
        { transactionId, changes: Object.keys(changes) },
        error
      );
      SoteErrorManager.Logger.error(
        "Erro ao processar mudanças do storage.sync",
        soteError
      );
    }
  });

  global.addEventListener("beforeunload", () => {
    SoteErrorManager.Logger.info(
      "Service Worker sendo descarregado - limpando recursos"
    );
    stateManagerSingleton.destroy();
  });

  setInterval(() => {
    if (
      !stateManagerSingleton.isInitializing &&
      stateManagerSingleton.instance
    ) {
      const componentStatus =
        stateManagerSingleton.degradationManager.getComponentStatus();
      const circuitBreakerState =
        SoteErrorManager.globalCircuitBreaker.getState();

      SoteErrorManager.Logger.debug("Status de saúde dos componentes", {
        components: componentStatus,
        circuitBreaker: circuitBreakerState,
        cacheSize: stateManagerSingleton.cache.size,
      });
    }
  }, 60000);
})(self);
