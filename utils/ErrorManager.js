// SOTE-main/utils/ErrorManager.js
(function (global) {
  "use strict";

  // ===== CÓDIGOS DE ERRO E CATEGORIZAÇÃO =====
  const ERROR_CODES = {
    // Erros Temporários (1000-1999)
    TEMPORARY: {
      DATABASE_TIMEOUT: 1001,
      NETWORK_UNAVAILABLE: 1002,
      SERVICE_BUSY: 1003,
      STORAGE_QUOTA_EXCEEDED: 1004,
      INDEXEDDB_BLOCKED: 1005,
      CHROME_RUNTIME_DISCONNECTED: 1006,
      TRANSACTION_CONFLICT: 1007,
      RESOURCE_LOCKED: 1008,
    },
    
    // Erros Permanentes (2000-2999)
    PERMANENT: {
      INVALID_DATA_FORMAT: 2001,
      VALIDATION_FAILED: 2002,
      DUPLICATE_KEY: 2003,
      MISSING_REQUIRED_FIELD: 2004,
      SCHEMA_VIOLATION: 2005,
      PERMISSION_DENIED: 2006,
      UNSUPPORTED_OPERATION: 2007,
      CORRUPTED_DATA: 2008,
      INVALID_CONFIGURATION: 2009,
    },
    
    // Erros de Sistema (3000-3999)
    SYSTEM: {
      INITIALIZATION_FAILED: 3001,
      DEPENDENCY_MISSING: 3002,
      VERSION_MISMATCH: 3003,
      CRITICAL_COMPONENT_FAILURE: 3004,
      MEMORY_EXHAUSTED: 3005,
    }
  };

  // ===== UTILITY FUNCTIONS APRIMORADAS =====
  function safeStringify(obj, maxDepth = 8, currentDepth = 0, seen = new WeakSet()) {
    // Prevenir loops infinitos
    if (currentDepth >= maxDepth) {
      return '[Max Depth Reached]';
    }

    // Valores primitivos
    if (obj === null) return 'null';
    if (obj === undefined) return 'undefined';
    if (typeof obj === 'string') return obj;
    if (typeof obj === 'number' || typeof obj === 'boolean') return String(obj);
    if (typeof obj === 'function') return '[Function]';
    if (typeof obj === 'symbol') return obj.toString();

    // Verificar referências circulares
    if (typeof obj === 'object' && seen.has(obj)) {
      return '[Circular Reference]';
    }

    try {
      // Casos especiais de objetos
      if (obj instanceof Error) {
        return {
          name: obj.name,
          message: obj.message,
          stack: obj.stack ? obj.stack.substring(0, 500) + (obj.stack.length > 500 ? '...' : '') : undefined
        };
      }

      if (obj instanceof Date) {
        return obj.toISOString();
      }

      if (obj instanceof RegExp) {
        return obj.toString();
      }

      // Arrays
      if (Array.isArray(obj)) {
        if (obj.length === 0) return [];
        seen.add(obj);
        const result = obj.slice(0, 10).map(item => 
          safeStringify(item, maxDepth, currentDepth + 1, seen)
        );
        if (obj.length > 10) {
          result.push(`... and ${obj.length - 10} more items`);
        }
        seen.delete(obj);
        return result;
      }

      // Objetos
      if (typeof obj === 'object') {
        seen.add(obj);
        const result = {};
        const keys = Object.keys(obj).slice(0, 20); // Limitar a 20 propriedades
        
        for (const key of keys) {
          try {
            const value = obj[key];
            
            // Tratamento especial para propriedades específicas
            if (key === 'stack' && typeof value === 'string' && value.length > 500) {
              result[key] = value.substring(0, 500) + '... [truncated]';
            } else if (key === 'password' || key === 'token' || key === 'secret') {
              result[key] = '[REDACTED]';
            } else {
              result[key] = safeStringify(value, maxDepth, currentDepth + 1, seen);
            }
          } catch (error) {
            result[key] = `[Error accessing property: ${error.message}]`;
          }
        }
        
        if (Object.keys(obj).length > 20) {
          result['...'] = `and ${Object.keys(obj).length - 20} more properties`;
        }
        
        seen.delete(obj);
        return result;
      }

      // Fallback para outros tipos
      return String(obj);

    } catch (error) {
      return `[Stringify Error: ${error.message}]`;
    }
  }

  function formatLogMessage(level, message, context) {
    const timestamp = new Date().toISOString();
    const transactionId = (context && context.transactionId) ? context.transactionId : 'unknown';
    
    // Garantir que message é uma string
    const safeMessage = typeof message === 'string' ? message : String(message || 'No message');
    
    return `[SOTE ${level}] ${timestamp} [${transactionId}] ${safeMessage}`;
  }

  // ===== CLASSES DE ERRO CUSTOMIZADAS =====
  class SoteError extends Error {
    constructor(message, code, category, context = {}, originalError = null) {
      super(message);
      this.name = 'SoteError';
      this.code = code;
      this.category = category;
      this.context = context;
      this.originalError = originalError;
      this.timestamp = new Date().toISOString();
      this.transactionId = context.transactionId || this._generateTransactionId();
      
      if (Error.captureStackTrace) {
        Error.captureStackTrace(this, SoteError);
      }
    }

    _generateTransactionId() {
      return `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    toJSON() {
      return {
        name: this.name,
        message: this.message,
        code: this.code,
        category: this.category,
        context: safeStringify(this.context),
        timestamp: this.timestamp,
        transactionId: this.transactionId,
        stack: this.stack,
        originalError: this.originalError ? safeStringify(this.originalError) : null
      };
    }
  }

  class TemporaryError extends SoteError {
    constructor(message, code, context = {}, originalError = null) {
      super(message, code, 'TEMPORARY', context, originalError);
      this.name = 'TemporaryError';
    }
  }

  class PermanentError extends SoteError {
    constructor(message, code, context = {}, originalError = null) {
      super(message, code, 'PERMANENT', context, originalError);
      this.name = 'PermanentError';
    }
  }

  class SystemError extends SoteError {
    constructor(message, code, context = {}, originalError = null) {
      super(message, code, 'SYSTEM', context, originalError);
      this.name = 'SystemError';
    }
  }

  // ===== RETRY PATTERN COM EXPONENTIAL BACKOFF =====
  class RetryManager {
    constructor(options = {}) {
      this.initialInterval = options.initialInterval || 100;
      this.multiplier = options.multiplier || 2;
      this.maxAttempts = options.maxAttempts || 3;
      this.maxTimeout = options.maxTimeout || 30000;
      this.jitterRange = options.jitterRange || 100;
    }

    async execute(operation, context = {}) {
      const transactionId = context.transactionId || `retry_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      let lastError;
      
      for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
        const attemptContext = { ...context, attempt, transactionId };
        
        try {
          Logger.debug('Executando operação', attemptContext);
          
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => {
              reject(new TemporaryError(
                'Operação excedeu timeout máximo',
                ERROR_CODES.TEMPORARY.DATABASE_TIMEOUT,
                attemptContext
              ));
            }, this.maxTimeout);
          });

          const result = await Promise.race([
            operation(attemptContext),
            timeoutPromise
          ]);

          Logger.info('Operação executada com sucesso', { ...attemptContext, result: 'success' });
          return result;

        } catch (error) {
          lastError = error;
          
          // Se é um erro permanente, não tenta novamente
          if (error instanceof PermanentError || error.category === 'PERMANENT') {
            Logger.error('Erro permanente detectado, abortando retry', { 
              ...attemptContext, 
              error: error.toJSON ? error.toJSON() : safeStringify(error)
            });
            throw error;
          }

          Logger.warn(`Tentativa ${attempt} falhou`, { 
            ...attemptContext, 
            error: error.message,
            willRetry: attempt < this.maxAttempts 
          });

          // Se não é a última tentativa, aguarda antes de tentar novamente
          if (attempt < this.maxAttempts) {
            const delay = this._calculateDelay(attempt);
            Logger.debug(`Aguardando ${delay}ms antes da próxima tentativa`, attemptContext);
            await this._sleep(delay);
          }
        }
      }

      // Se chegou aqui, todas as tentativas falharam
      const finalError = new TemporaryError(
        `Operação falhou após ${this.maxAttempts} tentativas`,
        ERROR_CODES.TEMPORARY.SERVICE_BUSY,
        { ...context, transactionId, lastError: lastError.message },
        lastError
      );
      
      Logger.error('Todas as tentativas de retry falharam', { 
        transactionId, 
        attempts: this.maxAttempts, 
        finalError: finalError.toJSON() 
      });
      
      throw finalError;
    }

    _calculateDelay(attempt) {
      const baseDelay = this.initialInterval * Math.pow(this.multiplier, attempt - 1);
      const jitter = Math.random() * this.jitterRange;
      return Math.min(baseDelay + jitter, this.maxTimeout);
    }

    _sleep(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }
  }

  // ===== CIRCUIT BREAKER PATTERN =====
  class CircuitBreaker {
    constructor(options = {}) {
      this.failureThreshold = options.failureThreshold || 5;
      this.timeWindow = options.timeWindow || 60000; // 60 segundos
      this.halfOpenTimeout = options.halfOpenTimeout || 30000; // 30 segundos
      this.successThreshold = options.successThreshold || 3;
      
      this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
      this.failures = [];
      this.successes = 0;
      this.lastFailureTime = null;
      this.onStateChange = options.onStateChange || (() => {});
    }

    async execute(operation, context = {}) {
      const transactionId = context.transactionId || `cb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      if (this.state === 'OPEN') {
        if (Date.now() - this.lastFailureTime < this.halfOpenTimeout) {
          const error = new TemporaryError(
            'Circuit breaker está aberto',
            ERROR_CODES.TEMPORARY.SERVICE_BUSY,
            { ...context, transactionId, circuitState: this.state }
          );
          Logger.warn('Operação rejeitada - Circuit breaker aberto', { transactionId, state: this.state });
          throw error;
        } else {
          this._setState('HALF_OPEN');
        }
      }

      try {
        const result = await operation({ ...context, transactionId });
        this._onSuccess();
        return result;
      } catch (error) {
        this._onFailure();
        throw error;
      }
    }

    _onSuccess() {
      if (this.state === 'HALF_OPEN') {
        this.successes++;
        if (this.successes >= this.successThreshold) {
          this._setState('CLOSED');
          this.successes = 0;
        }
      } else if (this.state === 'CLOSED') {
        // Limpar falhas antigas em caso de sucesso
        this._cleanOldFailures();
      }
    }

    _onFailure() {
      const now = Date.now();
      this.failures.push(now);
      this.lastFailureTime = now;
      this.successes = 0;

      this._cleanOldFailures();

      if (this.failures.length >= this.failureThreshold) {
        this._setState('OPEN');
      }
    }

    _cleanOldFailures() {
      const cutoff = Date.now() - this.timeWindow;
      this.failures = this.failures.filter(time => time > cutoff);
    }

    _setState(newState) {
      const oldState = this.state;
      this.state = newState;
      
      Logger.info('Circuit breaker mudou de estado', {
        from: oldState,
        to: newState,
        failures: this.failures.length,
        successes: this.successes
      });

      this.onStateChange(newState, oldState);

      // Emitir alerta quando o circuito abrir
      if (newState === 'OPEN') {
        Logger.error('🚨 ALERTA: Circuit breaker aberto!', {
          failures: this.failures.length,
          timeWindow: this.timeWindow,
          threshold: this.failureThreshold
        });
      }
    }

    getState() {
      return {
        state: this.state,
        failures: this.failures.length,
        successes: this.successes,
        lastFailureTime: this.lastFailureTime
      };
    }
  }

  // ===== SISTEMA DE LOGGING ESTRUTURADO APRIMORADO =====
  class Logger {
    static logs = [];
    static maxLogs = 1000;
    static logLevel = 'INFO'; // DEBUG, INFO, WARN, ERROR

    static levels = {
      DEBUG: 0,
      INFO: 1,
      WARN: 2,
      ERROR: 3
    };

    static log(level, message, context = {}) {
      if (this.levels[level] < this.levels[this.logLevel]) {
        return;
      }

      try {
        // CORREÇÃO PRINCIPAL: Garantir que context é sempre um objeto válido
        const safeContext = context && typeof context === 'object' ? context : {};
        
        // Garantir que message é uma string
        const safeMessage = typeof message === 'string' ? message : String(message || 'No message provided');
        
        // Serializar contexto de forma segura
        const serializedContext = safeStringify(safeContext);
        
        const logEntry = {
          timestamp: new Date().toISOString(),
          level,
          message: safeMessage,
          context: serializedContext,
          transactionId: safeContext.transactionId || null,
          stackTrace: level === 'ERROR' ? new Error().stack : null
        };

        // Adicionar ao buffer de logs
        this.logs.push(logEntry);
        
        // Rotação de logs
        if (this.logs.length > this.maxLogs) {
          this.logs = this.logs.slice(-this.maxLogs);
        }

        // CORREÇÃO: Output para console com formatação completamente segura
        const formattedMessage = formatLogMessage(level, safeMessage, safeContext);
        const consoleMethod = level.toLowerCase();
        
        if (console[consoleMethod]) {
          // Verificar se há contexto válido para mostrar
          const hasValidContext = serializedContext && 
                                 typeof serializedContext === 'object' && 
                                 Object.keys(serializedContext).length > 0;
          
          if (hasValidContext) {
            // Usar apenas strings para evitar [object Object]
            console[consoleMethod](formattedMessage);
            console[consoleMethod]('Context:', JSON.stringify(serializedContext, null, 2));
          } else {
            console[consoleMethod](formattedMessage);
          }
        }

        // Persistir logs críticos
        if (level === 'ERROR') {
          this._persistCriticalLog(logEntry);
        }

      } catch (error) {
        // Fallback ultra-seguro para logging básico
        const fallbackMessage = `[SOTE ${level}] ${new Date().toISOString()} [fallback] ${String(message || 'Logging error occurred')}`;
        console.error(fallbackMessage);
        console.error('Original logging error:', error.message);
      }
    }

    static debug(message, context = {}) {
      this.log('DEBUG', message, context);
    }

    static info(message, context = {}) {
      this.log('INFO', message, context);
    }

    static warn(message, context = {}) {
      this.log('WARN', message, context);
    }

    static error(message, context = {}) {
      this.log('ERROR', message, context);
    }

    static getLogs(level = null, limit = 100) {
      let filteredLogs = this.logs;
      
      if (level) {
        filteredLogs = this.logs.filter(log => log.level === level);
      }
      
      return filteredLogs.slice(-limit);
    }

    static clearLogs() {
      this.logs = [];
    }

    static setLogLevel(level) {
      if (this.levels[level] !== undefined) {
        this.logLevel = level;
        this.info('Log level alterado', { newLevel: level });
      }
    }

    static async _persistCriticalLog(logEntry) {
      try {
        if (typeof chrome !== 'undefined' && chrome.storage) {
          const key = `critical_log_${Date.now()}`;
          await chrome.storage.local.set({ [key]: logEntry });
        }
      } catch (error) {
        console.error('Falha ao persistir log crítico:', error);
      }
    }

    static async exportLogs() {
      const exportData = {
        exportedAt: new Date().toISOString(),
        totalLogs: this.logs.length,
        logs: this.logs
      };
      
      return JSON.stringify(exportData, null, 2);
    }
  }

  // ===== GRACEFUL DEGRADATION MANAGER =====
  class GracefulDegradationManager {
    constructor() {
      this.criticalComponents = new Set([
        'database',
        'stateManager',
        'textExpansion'
      ]);
      
      this.componentStatus = new Map();
      this.fallbackData = new Map();
      this.operationTimeouts = new Map([
        ['database', 5000],
        ['stateManager', 3000],
        ['textExpansion', 1000],
        ['default', 10000]
      ]);
    }

    async executeWithFallback(component, operation, fallbackOperation = null, context = {}) {
      const transactionId = context.transactionId || `gd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const timeout = this.operationTimeouts.get(component) || this.operationTimeouts.get('default');
      
      try {
        // Verificar se o componente está funcionando
        if (!this._isComponentHealthy(component)) {
          throw new TemporaryError(
            `Componente ${component} não está saudável`,
            ERROR_CODES.TEMPORARY.SERVICE_BUSY,
            { component, transactionId }
          );
        }

        // Executar operação com timeout
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => {
            reject(new TemporaryError(
              `Operação em ${component} excedeu timeout de ${timeout}ms`,
              ERROR_CODES.TEMPORARY.DATABASE_TIMEOUT,
              { component, timeout, transactionId }
            ));
          }, timeout);
        });

        const result = await Promise.race([
          operation({ ...context, transactionId }),
          timeoutPromise
        ]);

        this._markComponentHealthy(component);
        return { success: true, data: result, source: 'primary' };

      } catch (error) {
        Logger.warn(`Falha na operação principal de ${component}`, { 
          component, 
          error: error.message, 
          transactionId 
        });

        this._markComponentUnhealthy(component);

        // Tentar fallback se disponível
        if (fallbackOperation) {
          try {
            Logger.info(`Executando fallback para ${component}`, { component, transactionId });
            const fallbackResult = await fallbackOperation({ ...context, transactionId });
            return { success: true, data: fallbackResult, source: 'fallback' };
          } catch (fallbackError) {
            Logger.error(`Fallback também falhou para ${component}`, { 
              component, 
              fallbackError: fallbackError.message, 
              transactionId 
            });
          }
        }

        // Tentar dados em cache como último recurso
        const cachedData = this.fallbackData.get(component);
        if (cachedData) {
          Logger.info(`Usando dados em cache para ${component}`, { component, transactionId });
          return { success: true, data: cachedData, source: 'cache', stale: true };
        }

        // Se é um componente crítico, propagar o erro
        if (this.criticalComponents.has(component)) {
          throw error;
        }

        // Para componentes não críticos, retornar resposta parcial
        Logger.warn(`Retornando resposta parcial para componente não crítico ${component}`, { 
          component, 
          transactionId 
        });
        
        return { 
          success: false, 
          error: error.message, 
          source: 'partial',
          data: null 
        };
      }
    }

    _isComponentHealthy(component) {
      const status = this.componentStatus.get(component);
      if (!status) return true; // Assume saudável se não há histórico
      
      const now = Date.now();
      const timeSinceLastFailure = now - (status.lastFailure || 0);
      
      // Componente é considerado saudável se não falhou recentemente
      return timeSinceLastFailure > 30000 || status.consecutiveFailures < 3;
    }

    _markComponentHealthy(component) {
      this.componentStatus.set(component, {
        healthy: true,
        lastSuccess: Date.now(),
        consecutiveFailures: 0
      });
    }

    _markComponentUnhealthy(component) {
      const current = this.componentStatus.get(component) || { consecutiveFailures: 0 };
      this.componentStatus.set(component, {
        healthy: false,
        lastFailure: Date.now(),
        consecutiveFailures: current.consecutiveFailures + 1
      });
    }

    setCachedData(component, data) {
      this.fallbackData.set(component, {
        data,
        timestamp: Date.now()
      });
    }

    getComponentStatus() {
      const status = {};
      for (const [component, data] of this.componentStatus) {
        status[component] = {
          ...data,
          isCritical: this.criticalComponents.has(component)
        };
      }
      return status;
    }
  }

  // ===== ERROR HANDLER FACTORY =====
  class ErrorHandlerFactory {
    static createDatabaseHandler() {
      const retryManager = new RetryManager({
        initialInterval: 100,
        multiplier: 2,
        maxAttempts: 3,
        maxTimeout: 30000
      });

      const circuitBreaker = new CircuitBreaker({
        failureThreshold: 5,
        timeWindow: 60000,
        halfOpenTimeout: 30000,
        onStateChange: (newState, oldState) => {
          Logger.info('Database circuit breaker state change', { from: oldState, to: newState });
        }
      });

      return {
        async execute(operation, context = {}) {
          return await circuitBreaker.execute(async (cbContext) => {
            return await retryManager.execute(operation, cbContext);
          }, context);
        }
      };
    }

    static createNetworkHandler() {
      const retryManager = new RetryManager({
        initialInterval: 200,
        multiplier: 2,
        maxAttempts: 2,
        maxTimeout: 10000
      });

      return {
        async execute(operation, context = {}) {
          return await retryManager.execute(operation, context);
        }
      };
    }
  }

  // ===== INSTÂNCIAS GLOBAIS =====
  const globalRetryManager = new RetryManager();
  const globalCircuitBreaker = new CircuitBreaker();
  const gracefulDegradationManager = new GracefulDegradationManager();

  // ===== EXPORT TO GLOBAL =====
  global.SoteErrorManager = {
    // Classes de erro
    SoteError,
    TemporaryError,
    PermanentError,
    SystemError,
    
    // Códigos de erro
    ERROR_CODES,
    
    // Managers
    RetryManager,
    CircuitBreaker,
    Logger,
    GracefulDegradationManager,
    ErrorHandlerFactory,
    
    // Instâncias globais
    globalRetryManager,
    globalCircuitBreaker,
    gracefulDegradationManager,
    
    // Utilitários
    createError: (message, code, category, context = {}, originalError = null) => {
      switch (category) {
        case 'TEMPORARY':
          return new TemporaryError(message, code, context, originalError);
        case 'PERMANENT':
          return new PermanentError(message, code, context, originalError);
        case 'SYSTEM':
          return new SystemError(message, code, context, originalError);
        default:
          return new SoteError(message, code, category, context, originalError);
      }
    },
    
    // Utilitários de serialização
    safeStringify
  };

  // Configurar nível de log baseado no ambiente
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getManifest) {
    try {
      const manifest = chrome.runtime.getManifest();
      if (manifest.version.includes('dev') || manifest.version.includes('beta')) {
        Logger.setLogLevel('DEBUG');
      }
    } catch (error) {
      // Ignorar erro se não conseguir acessar o manifesto
      console.warn('Não foi possível acessar manifesto para configurar log level');
    }
  }

  Logger.info('Sistema de tratamento de erros inicializado', {
    version: '1.0.2',
    logLevel: Logger.logLevel
  });

})(self || window);
