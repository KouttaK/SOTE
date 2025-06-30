// SOTE-main/background/service-worker.js

// ===== IMPORTS =====
try {
  importScripts("../utils/constants.js");
  importScripts("../utils/db.js");
  importScripts("../utils/StateManager.js");
  importScripts("../utils/ErrorManager.js");

  importScripts("modules/validations.js");
  importScripts("modules/data-handler.js");
  importScripts("modules/db-operations.js");
  importScripts("modules/broadcasting.js");
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
      // Aguarda a promessa de inicialização existente e extrai o dado do resultado
      const result = await this.initPromise;
      if (result && result.success) {
        return result.data;
      }
      // Se a inicialização original falhou, a promessa será rejeitada e o catch lidará com isso.
      // Retornar null ou lançar um erro são opções aqui.
      throw new Error(
        "A inicialização concorrente falhou em resolver uma instância válida."
      );
    }

    this.isInitializing = true;
    this.initPromise = this._initializeWithErrorHandling();

    try {
      const result = await this.initPromise; // result é o objeto wrapper { success, data, ... }

      if (!result || !result.success) {
        throw new SoteErrorManager.SystemError(
          "A inicialização do StateManager não retornou um resultado bem-sucedido.",
          SoteErrorManager.ERROR_CODES.SYSTEM.INITIALIZATION_FAILED,
          { result }
        );
      }

      this.instance = result.data; // Atribui a instância real do StateManager
      this.isInitializing = false;
      this._startHealthCheck();
      return this.instance;
    } catch (error) {
      this.isInitializing = false;
      this.initPromise = null;
      throw error; // Propaga o erro original
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
        // Fallback: inicializar com dados mínimos
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

      // Validações essenciais
      SoteValidators.validateAll();

      // Verificação de saúde do banco de dados
      await this._performDatabaseHealthCheck(context);

      // Inicialização do banco e dados
      await TextExpanderDB.openDatabase();
      await SoteDataHandler.seedInitialDataIfNeeded();

      // Carregamento do estado inicial
      const [abbreviations, settings] = await Promise.all([
        this._getCachedAbbreviations(context),
        this._getStorageSettings(context),
      ]);

      const initialState = {
        abbreviations: abbreviations || [],
        settings: settings || {},
        isEnabled: settings.enabled !== false,
      };

      // Criação do StateManager
      const stateManager = new self.StateManager(initialState, {
        enableLogging: true,
        enableTimeTravel: false,
        maxHistorySize: 10,
      });

      // Configuração do broadcaster
      stateManager.subscribe((newState, oldState) => {
        SoteBroadcaster.broadcastStateUpdate(newState);
        this._updateCache("state", newState);
      });

      // Marcar componentes como saudáveis
      this.degradationManager._markComponentHealthy("database");
      this.degradationManager._markComponentHealthy("stateManager");

      // Cachear dados para fallback
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

      SoteErrorManager.Logger.error("Falha na inicialização do StateManager", {
        ...context,
        error: soteError.toJSON(),
      });

      throw soteError;
    }
  }

  async _initializeMinimal(context) {
    try {
      SoteErrorManager.Logger.warn(
        "Inicializando StateManager em modo mínimo",
        context
      );

      // Estado mínimo para manter a extensão funcionando
      const minimalState = {
        abbreviations: [],
        settings: { enabled: true },
        isEnabled: true,
      };

      const stateManager = new self.StateManager(minimalState, {
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
        const db = await TextExpanderDB.openDatabase();

        // Verificar se as stores existem
        const requiredStores = [
          SOTE_CONSTANTS.STORE_ABBREVIATIONS,
          SOTE_CONSTANTS.STORE_RULES,
          SOTE_CONSTANTS.STORE_CHOICES,
        ];

        for (const storeName of requiredStores) {
          if (!db.objectStoreNames.contains(storeName)) {
            throw SoteErrorManager.createError(
              `Store obrigatória '${storeName}' não encontrada`,
              SoteErrorManager.ERROR_CODES.PERMANENT.SCHEMA_VIOLATION,
              "PERMANENT",
              dbContext
            );
          }
        }

        // Teste básico de leitura
        await new Promise((resolve, reject) => {
          const transaction = db.transaction(
            SOTE_CONSTANTS.STORE_ABBREVIATIONS,
            "readonly"
          );
          const store = transaction.objectStore(
            SOTE_CONSTANTS.STORE_ABBREVIATIONS
          );
          const request = store.count();

          request.onsuccess = () => resolve(request.result);
          request.onerror = () =>
            reject(
              SoteErrorManager.createError(
                "Falha no teste de leitura do banco",
                SoteErrorManager.ERROR_CODES.TEMPORARY.DATABASE_TIMEOUT,
                "TEMPORARY",
                dbContext
              )
            );
          transaction.onerror = () =>
            reject(
              SoteErrorManager.createError(
                "Falha na transação de teste",
                SoteErrorManager.ERROR_CODES.TEMPORARY.TRANSACTION_CONFLICT,
                "TEMPORARY",
                dbContext
              )
            );
        });

        SoteErrorManager.Logger.info(
          "Verificação de saúde do banco concluída",
          dbContext
        );
        return true;
      },
      null, // Sem fallback para health check
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
    // Verificação de saúde periódica a cada 5 minutos
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

        // Se a verificação falhar, invalidar a instância
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
    const key = this._getCacheKey(type);
    this._setCache(key, data);
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
      SoteErrorManager.Logger.debug("Abreviações carregadas do cache", context);
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
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
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

// ===== STATE MANAGEMENT =====
const DEBUG_PREFIX = "[SOTE Service Worker]";

// ===== UTILITY FUNCTIONS =====
function log(message, ...args) {
  SoteErrorManager.Logger.info(message, { args, component: "service-worker" });
}

function logWarn(message, ...args) {
  SoteErrorManager.Logger.warn(message, { args, component: "service-worker" });
}

function logError(message, error) {
  SoteErrorManager.Logger.error(message, {
    error: error.toJSON ? error.toJSON() : error.message,
    component: "service-worker",
  });
}

// ===== CORE LOGIC =====

/**
 * Função central para atualizar o estado com tratamento de erro robusto
 */
async function refreshStateFromDB() {
  const transactionId = `refresh_${Date.now()}_${Math.random()
    .toString(36)
    .substr(2, 9)}`;

  try {
    const stateManager = await stateManagerSingleton.getInstance();

    // Invalidar cache de abreviações
    stateManagerSingleton._invalidateCache("abbreviations");

    const abbreviationsResult =
      await stateManagerSingleton.degradationManager.executeWithFallback(
        "database",
        async context => {
          return await stateManagerSingleton._getCachedAbbreviations(context);
        },
        async context => {
          // Fallback: retornar dados em cache ou array vazio
          SoteErrorManager.Logger.warn(
            "Usando fallback para abreviações",
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

    logError("Falha ao recarregar o estado do DB", soteError);
  }
}

/**
 * Inicialização da aplicação com lazy loading e error handling
 */
async function initializeApp() {
  const transactionId = `app_init_${Date.now()}_${Math.random()
    .toString(36)
    .substr(2, 9)}`;

  try {
    SoteErrorManager.Logger.info("Inicializando aplicação", { transactionId });
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

    logError("Falha grave na inicialização", soteError);
    throw soteError;
  }
}

// ===== MESSAGE HANDLER COM ERROR HANDLING ROBUSTO =====

/**
 * Handler de mensagens com tratamento de erro abrangente
 */
function handleMessage(message, sender, sendResponse) {
  (async () => {
    const transactionId = `msg_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    try {
      // Validação básica da mensagem
      if (!message || typeof message !== "object") {
        throw SoteErrorManager.createError(
          "Mensagem inválida recebida",
          SoteErrorManager.ERROR_CODES.PERMANENT.INVALID_DATA_FORMAT,
          "PERMANENT",
          { transactionId, message }
        );
      }

      const { type, payload } = message;

      if (!type) {
        throw SoteErrorManager.createError(
          "Tipo de mensagem não especificado",
          SoteErrorManager.ERROR_CODES.PERMANENT.MISSING_REQUIRED_FIELD,
          "PERMANENT",
          { transactionId, message }
        );
      }

      SoteErrorManager.Logger.debug("Processando mensagem", {
        transactionId,
        type,
        hasPayload: !!payload,
      });

      // Garantir que o StateManager está inicializado
      const stateManager = await stateManagerSingleton.getInstance();
      const { MESSAGE_TYPES } = self.SOTE_CONSTANTS;

      switch (type) {
        // --- Leitura de Estado ---
        case MESSAGE_TYPES.GET_STATE:
          const state = stateManager.getState();
          sendResponse(state);
          break;

        // --- Operações de Abreviação ---
        case MESSAGE_TYPES.ADD_ABBREVIATION:
          if (!payload)
            throw SoteErrorManager.createError(
              "Payload obrigatório para ADD_ABBREVIATION",
              SoteErrorManager.ERROR_CODES.PERMANENT.MISSING_REQUIRED_FIELD,
              "PERMANENT",
              { transactionId, type }
            );

          await stateManagerSingleton.databaseHandler.execute(
            async context => {
              await TextExpanderDB.addAbbreviation(payload);
            },
            { transactionId, operation: "add_abbreviation" }
          );

          await refreshStateFromDB();
          sendResponse({ success: true });
          break;

        case MESSAGE_TYPES.UPDATE_ABBREVIATION:
          if (!payload)
            throw SoteErrorManager.createError(
              "Payload obrigatório para UPDATE_ABBREVIATION",
              SoteErrorManager.ERROR_CODES.PERMANENT.MISSING_REQUIRED_FIELD,
              "PERMANENT",
              { transactionId, type }
            );

          await stateManagerSingleton.databaseHandler.execute(
            async context => {
              await TextExpanderDB.updateAbbreviation(payload);
            },
            { transactionId, operation: "update_abbreviation" }
          );

          await refreshStateFromDB();
          sendResponse({ success: true });
          break;

        case MESSAGE_TYPES.DELETE_ABBREVIATION:
          if (!payload?.abbreviationKey) {
            throw SoteErrorManager.createError(
              "abbreviationKey obrigatório para DELETE_ABBREVIATION",
              SoteErrorManager.ERROR_CODES.PERMANENT.MISSING_REQUIRED_FIELD,
              "PERMANENT",
              { transactionId, type, payload }
            );
          }

          await stateManagerSingleton.databaseHandler.execute(
            async context => {
              await TextExpanderDB.deleteAbbreviation(payload.abbreviationKey);
            },
            { transactionId, operation: "delete_abbreviation" }
          );

          await refreshStateFromDB();
          sendResponse({ success: true });
          break;

        case MESSAGE_TYPES.IMPORT_DATA: // Alterado
          if (!payload?.data)
            throw SoteErrorManager.createError(
              "Dados obrigatórios para IMPORT_DATA",
              SoteErrorManager.ERROR_CODES.PERMANENT.MISSING_REQUIRED_FIELD,
              "PERMANENT",
              { transactionId, type }
            );

          await stateManagerSingleton.databaseHandler.execute(
            async context => {
              await TextExpanderDB.importData(payload); // Alterado
            },
            { transactionId, operation: "import_data" }
          );

          await refreshStateFromDB();
          sendResponse({ success: true });
          break;

        case MESSAGE_TYPES.CLEAR_ALL_DATA:
          await stateManagerSingleton.databaseHandler.execute(
            async context => {
              await TextExpanderDB.clearAllAbbreviations();
            },
            { transactionId, operation: "clear_all_data" }
          );

          await refreshStateFromDB();
          sendResponse({ success: true });
          break;

        // --- Operações de Regra ---
        case MESSAGE_TYPES.ADD_RULE:
          if (!payload)
            throw SoteErrorManager.createError(
              "Payload obrigatório para ADD_RULE",
              SoteErrorManager.ERROR_CODES.PERMANENT.MISSING_REQUIRED_FIELD,
              "PERMANENT",
              { transactionId, type }
            );

          await stateManagerSingleton.databaseHandler.execute(
            async context => {
              await TextExpanderDB.addExpansionRule(payload);
            },
            { transactionId, operation: "add_rule" }
          );

          await refreshStateFromDB();
          sendResponse({ success: true });
          break;

        case MESSAGE_TYPES.UPDATE_RULE:
          if (!payload)
            throw SoteErrorManager.createError(
              "Payload obrigatório para UPDATE_RULE",
              SoteErrorManager.ERROR_CODES.PERMANENT.MISSING_REQUIRED_FIELD,
              "PERMANENT",
              { transactionId, type }
            );

          await stateManagerSingleton.databaseHandler.execute(
            async context => {
              await TextExpanderDB.updateExpansionRule(payload);
            },
            { transactionId, operation: "update_rule" }
          );

          await refreshStateFromDB();
          sendResponse({ success: true });
          break;

        case MESSAGE_TYPES.DELETE_RULE:
          if (!payload?.ruleId)
            throw SoteErrorManager.createError(
              "ruleId obrigatório para DELETE_RULE",
              SoteErrorManager.ERROR_CODES.PERMANENT.MISSING_REQUIRED_FIELD,
              "PERMANENT",
              { transactionId, type }
            );

          await stateManagerSingleton.databaseHandler.execute(
            async context => {
              await TextExpanderDB.deleteExpansionRule(payload.ruleId);
            },
            { transactionId, operation: "delete_rule" }
          );

          await refreshStateFromDB();
          sendResponse({ success: true });
          break;

        // --- Operações de Escolha ---
        case MESSAGE_TYPES.ADD_CHOICE:
          if (!payload?.options)
            throw SoteErrorManager.createError(
              "options obrigatório para ADD_CHOICE",
              SoteErrorManager.ERROR_CODES.PERMANENT.MISSING_REQUIRED_FIELD,
              "PERMANENT",
              { transactionId, type }
            );

          const newChoiceId =
            await stateManagerSingleton.databaseHandler.execute(
              async context => {
                return await TextExpanderDB.addChoice(payload.options);
              },
              { transactionId, operation: "add_choice" }
            );

          await refreshStateFromDB();
          sendResponse({ success: true, newChoiceId });
          break;

        case MESSAGE_TYPES.UPDATE_CHOICE:
          if (!payload?.choiceId || !payload?.options) {
            throw SoteErrorManager.createError(
              "choiceId e options obrigatórios para UPDATE_CHOICE",
              SoteErrorManager.ERROR_CODES.PERMANENT.MISSING_REQUIRED_FIELD,
              "PERMANENT",
              { transactionId, type, payload }
            );
          }

          await stateManagerSingleton.databaseHandler.execute(
            async context => {
              await TextExpanderDB.updateChoice(
                payload.choiceId,
                payload.options
              );
            },
            { transactionId, operation: "update_choice" }
          );

          await refreshStateFromDB();
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

          const choiceData =
            await stateManagerSingleton.databaseHandler.execute(
              async context => {
                return await SoteDBOperations.getChoiceConfig(payload.id);
              },
              { transactionId, operation: "get_choice_config" }
            );

          sendResponse({ data: choiceData });
          break;

        case MESSAGE_TYPES.GET_ALL_CHOICES: // Novo
          const allChoices =
            await stateManagerSingleton.databaseHandler.execute(
              async context => {
                return await TextExpanderDB.getAllChoices();
              },
              { transactionId, operation: "get_all_choices" }
            );

          sendResponse({ success: true, data: allChoices });
          break;

        // --- Outras Ações ---
        case MESSAGE_TYPES.UPDATE_USAGE:
          // CORREÇÃO: Validação robusta do payload com múltiplos formatos suportados
          if (!payload) {
            throw SoteErrorManager.createError(
              "Payload obrigatório para UPDATE_USAGE",
              SoteErrorManager.ERROR_CODES.PERMANENT.MISSING_REQUIRED_FIELD,
              "PERMANENT",
              { transactionId, type, payload }
            );
          }

          // Suporte para diferentes formatos de payload
          let abbreviationKey;
          if (typeof payload === "string") {
            abbreviationKey = payload;
          } else if (typeof payload === "object") {
            if (payload.abbreviation) {
              abbreviationKey = payload.abbreviation;
            } else if (payload.abbreviationKey) {
              abbreviationKey = payload.abbreviationKey;
            } else {
              throw SoteErrorManager.createError(
                "Chave da abreviação não encontrada no payload para UPDATE_USAGE",
                SoteErrorManager.ERROR_CODES.PERMANENT.MISSING_REQUIRED_FIELD,
                "PERMANENT",
                { transactionId, type, payload }
              );
            }
          } else {
            throw SoteErrorManager.createError(
              "Formato de payload inválido para UPDATE_USAGE",
              SoteErrorManager.ERROR_CODES.PERMANENT.INVALID_DATA_FORMAT,
              "PERMANENT",
              { transactionId, type, payload }
            );
          }

          if (!abbreviationKey || typeof abbreviationKey !== "string") {
            throw SoteErrorManager.createError(
              "Chave da abreviação deve ser uma string válida",
              SoteErrorManager.ERROR_CODES.PERMANENT.INVALID_DATA_FORMAT,
              "PERMANENT",
              { transactionId, type, abbreviationKey }
            );
          }

          await stateManagerSingleton.databaseHandler.execute(
            async context => {
              await SoteDBOperations.updateUsage(abbreviationKey);
            },
            { transactionId, operation: "update_usage", abbreviationKey }
          );

          await refreshStateFromDB();
          sendResponse({ success: true });
          break;

        default:
          SoteErrorManager.Logger.warn(
            `Tipo de mensagem desconhecido recebido: ${type}`,
            {
              transactionId,
              type,
            }
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

      logError(
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
self.addEventListener("install", event => {
  SoteErrorManager.Logger.info("Service Worker instalando...");
  event.waitUntil(
    initializeApp().catch(err => {
      logError("Falha na inicialização durante a instalação.", err);
      // Não propagar o erro para não impedir a instalação
    })
  );
});

self.addEventListener("activate", event => {
  SoteErrorManager.Logger.info("Service Worker ativando...");
  event.waitUntil(clients.claim());
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
      if (key in oldSettings) {
        newSettings[key] = changes[key].newValue;
        settingsChanged = true;
      }
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

    logError("Erro ao processar mudanças do storage.sync", soteError);
  }
});

// Cleanup ao descarregar
self.addEventListener("beforeunload", () => {
  SoteErrorManager.Logger.info(
    "Service Worker sendo descarregado - limpando recursos"
  );
  stateManagerSingleton.destroy();
});

// Monitoramento de performance e saúde
setInterval(() => {
  if (!stateManagerSingleton.isInitializing && stateManagerSingleton.instance) {
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
}, 60000); // A cada minuto
