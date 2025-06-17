// SOTE-main/utils/cache.js
/**
 * Sistema de Cache Inteligente com TTL para a extensão SOTE
 * Otimiza o acesso às abreviações com cache em memória e persistente
 */
(function (global) {
  "use strict";

  class IntelligentCache {
    constructor(options = {}) {
      this.memoryCache = new Map();
      this.config = {
        // TTL padrão: 5 minutos para dados frequentes
        defaultTTL: options.defaultTTL || 5 * 60 * 1000,
        // TTL longo: 30 minutos para dados menos frequentes
        longTTL: options.longTTL || 30 * 60 * 1000,
        // Tamanho máximo do cache em memória
        maxMemorySize: options.maxMemorySize || 1000,
        // Intervalo de limpeza automática
        cleanupInterval: options.cleanupInterval || 60 * 1000,
        // Prefixo para chaves no storage
        storagePrefix: options.storagePrefix || "sote_cache_",
        // Habilitar cache persistente
        enablePersistentCache: options.enablePersistentCache !== false,
      };

      this.stats = {
        hits: 0,
        misses: 0,
        evictions: 0,
        writes: 0,
      };

      this.startCleanupTimer();
    }

    /**
     * Gera uma chave única para o cache baseada em parâmetros
     */
    generateKey(namespace, identifier, params = {}) {
      const paramString = Object.keys(params)
        .sort()
        .map(key => `${key}:${params[key]}`)
        .join("|");

      return `${namespace}:${identifier}${
        paramString ? ":" + paramString : ""
      }`;
    }

    /**
     * Calcula TTL baseado na frequência de uso e tipo de dados
     */
    calculateTTL(type, usageCount = 0) {
      const { defaultTTL, longTTL } = this.config;

      switch (type) {
        case "abbreviations_all":
          // Dados críticos mais frequentes - TTL menor
          return Math.max(defaultTTL, longTTL - usageCount * 1000);

        case "abbreviations_by_category":
          // Dados de categoria - TTL médio
          return defaultTTL + (usageCount > 10 ? 0 : 10 * 60 * 1000);

        case "expansion_rules":
          // Regras mudam menos - TTL maior
          return longTTL;

        case "choice_config":
          // Configurações de escolha - TTL longo
          return longTTL * 2;

        case "user_stats":
          // Estatísticas - podem ter TTL muito longo
          return longTTL * 4;

        default:
          return defaultTTL;
      }
    }

    /**
     * Armazena dados no cache com TTL inteligente
     */
    async set(key, data, options = {}) {
      const now = Date.now();
      const ttl =
        options.ttl || this.calculateTTL(options.type, options.usageCount);
      const expiresAt = now + ttl;

      const cacheEntry = {
        data,
        createdAt: now,
        expiresAt,
        accessCount: 0,
        lastAccessed: now,
        type: options.type || "unknown",
        size: this.calculateSize(data),
      };

      // Armazenar em memória
      this.memoryCache.set(key, cacheEntry);
      this.stats.writes++;

      // Armazenar persistentemente se habilitado
      if (this.config.enablePersistentCache && options.persistent !== false) {
        await this.setPersistent(key, cacheEntry);
      }

      // Verificar limite de memória
      this.enforceMemoryLimit();

      return true;
    }

    /**
     * Recupera dados do cache
     */
    async get(key, options = {}) {
      const now = Date.now();
      let cacheEntry = null;

      // Verificar cache em memória primeiro
      if (this.memoryCache.has(key)) {
        cacheEntry = this.memoryCache.get(key);
      }
      // Se não encontrar e cache persistente estiver habilitado, verificar storage
      else if (this.config.enablePersistentCache) {
        cacheEntry = await this.getPersistent(key);

        // Se encontrar no storage, carregar para memória
        if (cacheEntry) {
          this.memoryCache.set(key, cacheEntry);
        }
      }

      // Verificar se o cache expirou
      if (!cacheEntry || cacheEntry.expiresAt < now) {
        if (cacheEntry) {
          this.delete(key);
        }
        this.stats.misses++;
        return null;
      }

      // Atualizar estatísticas de acesso
      cacheEntry.accessCount++;
      cacheEntry.lastAccessed = now;
      this.stats.hits++;

      // Extender TTL se for um item muito acessado
      if (cacheEntry.accessCount > 10 && options.extendTTL !== false) {
        const extensionTime = Math.min(
          cacheEntry.accessCount * 1000,
          this.config.defaultTTL / 2
        );
        cacheEntry.expiresAt += extensionTime;
      }

      return cacheEntry.data;
    }

    /**
     * Cache com fallback - tenta buscar do cache, se não encontrar executa a função
     */
    async getOrSet(key, fetchFunction, options = {}) {
      let data = await this.get(key, options);

      if (data === null) {
        try {
          data = await fetchFunction();
          if (data !== null && data !== undefined) {
            await this.set(key, data, options);
          }
        } catch (error) {
          console.error("Cache fetchFunction error:", error);
          return null;
        }
      }

      return data;
    }

    /**
     * Remove item do cache
     */
    async delete(key) {
      const deleted = this.memoryCache.delete(key);

      if (this.config.enablePersistentCache) {
        await this.deletePersistent(key);
      }

      return deleted;
    }

    /**
     * Limpa todo o cache
     */
    async clear(pattern = null) {
      if (pattern) {
        const regex = new RegExp(pattern);
        const keysToDelete = [];

        for (const key of this.memoryCache.keys()) {
          if (regex.test(key)) {
            keysToDelete.push(key);
          }
        }

        for (const key of keysToDelete) {
          await this.delete(key);
        }
      } else {
        this.memoryCache.clear();
        if (this.config.enablePersistentCache) {
          await this.clearPersistent();
        }
      }

      this.resetStats();
    }

    /**
     * Invalida cache por namespace ou padrão
     */
    async invalidate(namespace) {
      await this.clear(`^${namespace}:`);
    }

    /**
     * Armazenamento persistente usando chrome.storage.local
     */
    async setPersistent(key, cacheEntry) {
      if (typeof chrome !== "undefined" && chrome.storage) {
        const storageKey = this.config.storagePrefix + key;
        const storageData = {};
        storageData[storageKey] = cacheEntry;

        try {
          await chrome.storage.local.set(storageData);
        } catch (error) {
          console.warn("Failed to set persistent cache:", error);
        }
      }
    }

    /**
     * Recuperação do armazenamento persistente
     */
    async getPersistent(key) {
      if (typeof chrome !== "undefined" && chrome.storage) {
        const storageKey = this.config.storagePrefix + key;

        try {
          const result = await chrome.storage.local.get(storageKey);
          return result[storageKey] || null;
        } catch (error) {
          console.warn("Failed to get persistent cache:", error);
          return null;
        }
      }
      return null;
    }

    /**
     * Remove do armazenamento persistente
     */
    async deletePersistent(key) {
      if (typeof chrome !== "undefined" && chrome.storage) {
        const storageKey = this.config.storagePrefix + key;

        try {
          await chrome.storage.local.remove(storageKey);
        } catch (error) {
          console.warn("Failed to delete persistent cache:", error);
        }
      }
    }

    /**
     * Limpa todo o armazenamento persistente
     */
    async clearPersistent() {
      if (typeof chrome !== "undefined" && chrome.storage) {
        try {
          const allItems = await chrome.storage.local.get();
          const keysToRemove = Object.keys(allItems).filter(key =>
            key.startsWith(this.config.storagePrefix)
          );

          if (keysToRemove.length > 0) {
            await chrome.storage.local.remove(keysToRemove);
          }
        } catch (error) {
          console.warn("Failed to clear persistent cache:", error);
        }
      }
    }

    /**
     * Calcula o tamanho aproximado dos dados
     */
    calculateSize(data) {
      try {
        return JSON.stringify(data).length;
      } catch {
        return 0;
      }
    }

    /**
     * Aplica limite de memória removendo itens menos acessados
     */
    enforceMemoryLimit() {
      if (this.memoryCache.size <= this.config.maxMemorySize) {
        return;
      }

      // Ordenar por frequência de acesso e tempo de último acesso
      const entries = Array.from(this.memoryCache.entries())
        .map(([key, entry]) => ({
          key,
          entry,
          score:
            entry.accessCount / ((Date.now() - entry.lastAccessed) / 1000 / 60), // acessos por minuto
        }))
        .sort((a, b) => a.score - b.score); // menor score primeiro (menos útil)

      // Remover 20% dos itens menos úteis
      const itemsToRemove = Math.floor(this.config.maxMemorySize * 0.2);

      for (let i = 0; i < itemsToRemove && i < entries.length; i++) {
        this.memoryCache.delete(entries[i].key);
        this.stats.evictions++;
      }
    }

    /**
     * Limpeza automática de itens expirados
     */
    cleanup() {
      const now = Date.now();
      const expiredKeys = [];

      for (const [key, entry] of this.memoryCache.entries()) {
        if (entry.expiresAt < now) {
          expiredKeys.push(key);
        }
      }

      for (const key of expiredKeys) {
        this.memoryCache.delete(key);
        this.stats.evictions++;
      }

      return expiredKeys.length;
    }

    /**
     * Inicia timer de limpeza automática
     */
    startCleanupTimer() {
      if (this.cleanupTimer) {
        clearInterval(this.cleanupTimer);
      }

      this.cleanupTimer = setInterval(() => {
        this.cleanup();
      }, this.config.cleanupInterval);
    }

    /**
     * Para timer de limpeza
     */
    stopCleanupTimer() {
      if (this.cleanupTimer) {
        clearInterval(this.cleanupTimer);
        this.cleanupTimer = null;
      }
    }

    /**
     * Obtém estatísticas do cache
     */
    getStats() {
      const hitRate =
        this.stats.hits + this.stats.misses > 0
          ? (
              (this.stats.hits / (this.stats.hits + this.stats.misses)) *
              100
            ).toFixed(2)
          : 0;

      return {
        ...this.stats,
        hitRate: `${hitRate}%`,
        memorySize: this.memoryCache.size,
        maxMemorySize: this.config.maxMemorySize,
      };
    }

    /**
     * Reseta estatísticas
     */
    resetStats() {
      this.stats = {
        hits: 0,
        misses: 0,
        evictions: 0,
        writes: 0,
      };
    }

    /**
     * Pré-aquece o cache com dados frequentes
     */
    async warmup(warmupData) {
      for (const { key, fetchFunction, options } of warmupData) {
        try {
          const data = await fetchFunction();
          if (data) {
            await this.set(key, data, { ...options, warmup: true });
          }
        } catch (error) {
          console.warn(`Warmup failed for key ${key}:`, error);
        }
      }
    }

    /**
     * Exporta configurações do cache
     */
    getConfig() {
      return { ...this.config };
    }

    /**
     * Atualiza configurações do cache
     */
    updateConfig(newConfig) {
      this.config = { ...this.config, ...newConfig };

      // Reiniciar timer se intervalo mudou
      if (newConfig.cleanupInterval) {
        this.startCleanupTimer();
      }
    }

    /**
     * Destrói o cache e limpa recursos
     */
    destroy() {
      this.stopCleanupTimer();
      this.memoryCache.clear();
      this.resetStats();
    }
  }

  // Instância singleton do cache
  let cacheInstance = null;

  /**
   * Factory function para obter instância do cache
   */
  function getCache(options = {}) {
    if (!cacheInstance) {
      cacheInstance = new IntelligentCache(options);
    }
    return cacheInstance;
  }

  /**
   * Utilitários específicos para a extensão SOTE
   */
  class SOTECache {
    constructor() {
      this.cache = getCache({
        defaultTTL: 5 * 60 * 1000, // 5 minutos
        longTTL: 30 * 60 * 1000, // 30 minutos
        maxMemorySize: 500, // Limite menor para extensão
        enablePersistentCache: true,
      });

      // Namespaces específicos da SOTE
      this.namespaces = {
        ABBREVIATIONS: "abbreviations",
        RULES: "rules",
        CHOICES: "choices",
        CATEGORIES: "categories",
        STATS: "stats",
      };
    }

    /**
     * Cache de todas as abreviações
     */
    async getAllAbbreviations() {
      const key = this.cache.generateKey(this.namespaces.ABBREVIATIONS, "all");

      return this.cache.getOrSet(
        key,
        async () => {
          // A função original está em window.TextExpanderDB
          return await global.TextExpanderDB.getAllAbbreviations();
        },
        {
          type: "abbreviations_all",
          persistent: true,
        }
      );
    }

    /**
     * Cache de abreviações por categoria
     */
    async getAbbreviationsByCategory(category) {
      const key = this.cache.generateKey(
        this.namespaces.ABBREVIATIONS,
        "by_category",
        { category }
      );

      return this.cache.getOrSet(
        key,
        async () => {
          return await global.TextExpanderDB.getAbbreviationsByCategory(
            category
          );
        },
        {
          type: "abbreviations_by_category",
          persistent: true,
        }
      );
    }

    /**
     * Cache de configuração de escolhas
     */
    async getChoiceConfig(choiceId) {
      const key = this.cache.generateKey(this.namespaces.CHOICES, choiceId);

      return this.cache.getOrSet(
        key,
        async () => {
          return await global.TextExpanderDB.getChoice(choiceId);
        },
        {
          type: "choice_config",
          persistent: true,
        }
      );
    }

    /**
     * Cache de categorias
     */
    async getAllCategories() {
      const key = this.cache.generateKey(this.namespaces.CATEGORIES, "all");

      return this.cache.getOrSet(
        key,
        async () => {
          return await global.TextExpanderDB.getAllCategories();
        },
        {
          type: "categories",
          persistent: true,
        }
      );
    }

    /**
     * Invalida cache quando dados são modificados
     */
    async invalidateAbbreviationsCache() {
      await this.cache.invalidate(this.namespaces.ABBREVIATIONS);
      await this.cache.invalidate(this.namespaces.CATEGORIES);
    }

    async invalidateChoicesCache(choiceId = null) {
      if (choiceId) {
        const key = this.cache.generateKey(this.namespaces.CHOICES, choiceId);
        await this.cache.delete(key);
      } else {
        await this.cache.invalidate(this.namespaces.CHOICES);
      }
    }

    async invalidateRulesCache() {
      await this.cache.invalidate(this.namespaces.RULES);
    }

    /**
     * Obtém estatísticas do cache
     */
    getStats() {
      return this.cache.getStats();
    }

    /**
     * Limpa todo o cache
     */
    async clearAll() {
      await this.cache.clear();
    }
  }

  // Expor para o escopo global
  global.SOTECache = new SOTECache();
  global.getSoteCacheInstance = () => global.SOTECache;
})(self || window);
