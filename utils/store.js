// SOTE-main/utils/store.js
/**
 * @module SoteStore
 * @description Um sistema de gerenciamento de estado simples, inspirado em Vuex/Redux.
 * Ele fornece um padrão centralizado para o estado da aplicação,
 * garantindo que as mudanças de estado sejam previsíveis e rastreáveis.
 */
(function (global) {
  "use strict";

  /**
   * Cria uma instância do Sote Store.
   * @param {object} options - As opções para criar a store.
   * @param {object} options.state - O estado inicial da aplicação.
   * @param {object} options.mutations - Um objeto de funções síncronas para modificar o estado.
   * @param {object} options.actions - Um objeto de funções que podem ser assíncronas e comitem mutações.
   * @param {boolean} [options.strict=false] - Ativa o modo estrito, que impede modificações de estado fora das mutações.
   * @returns {object} A instância da store com os métodos `state`, `commit`, `dispatch`, e `subscribe`.
   */
  function createSoteStore(options = {}) {
    if (!options.state || typeof options.state !== "object") {
      throw new Error("O estado (state) deve ser um objeto.");
    }
    if (!options.mutations || typeof options.mutations !== "object") {
      throw new Error("As mutações (mutations) devem ser um objeto.");
    }

    let isMutating = false;

    const store = {
      state: null,
      mutations: options.mutations || {},
      actions: options.actions || {},
      subscribers: [],
      strict: options.strict || false,
    };

    /**
     * Adiciona um ouvinte que será chamado a cada mudança de estado.
     * @param {function} callback - A função a ser chamada.
     * @returns {function} Uma função para cancelar a inscrição.
     */
    store.subscribe = function (callback) {
      if (typeof callback !== "function") {
        console.warn("O assinante (subscriber) deve ser uma função.");
        return () => {};
      }
      store.subscribers.push(callback);
      // Retorna uma função para remover o ouvinte
      return () => {
        store.subscribers = store.subscribers.filter(sub => sub !== callback);
      };
    };

    /**
     * Notifica todos os ouvintes sobre uma mudança de estado.
     */
    const notifySubscribers = () => {
      store.subscribers.forEach(callback => {
        try {
          callback(store.state);
        } catch (error) {
          console.error("Erro em um ouvinte da store:", error);
        }
      });
    };

    /**
     * O Proxy torna o estado "reativo" para propriedades de primeiro nível.
     * Ele intercepta as atribuições de propriedade e notifica os ouvintes.
     *
     * IMPORTANTE: A reatividade não é profunda. Modificar propriedades de objetos aninhados
     * ou usar métodos como .push() em arrays não acionará uma notificação.
     * Para garantir a reatividade, use padrões imutáveis dentro das mutações:
     * Exemplo para arrays: `state.items = [...state.items, novoItem];`
     * Exemplo para objetos: `state.usuario = { ...state.usuario, nome: 'Novo Nome' };`
     */
    store.state = new Proxy(options.state, {
      set(target, property, value) {
        // No modo estrito, só permite alterações dentro de uma mutação.
        if (store.strict && !isMutating) {
          console.error("Não modifique o estado da store fora de uma mutação.");
          return true; // Impede a alteração
        }

        // Evita notificações desnecessárias se o valor não mudou.
        if (target[property] === value) {
          return true;
        }

        target[property] = value;

        // Notifica os ouvintes de forma assíncrona para agrupar múltiplas
        // mutações síncronas em uma única atualização de UI.
        queueMicrotask(notifySubscribers);

        return true;
      },
    });

    /**
     * Executa uma mutação para alterar o estado de forma síncrona.
     * @param {string} type - O nome da mutação a ser executada.
     * @param {*} payload - Os dados a serem passados para a mutação.
     */
    store.commit = function (type, payload) {
      if (typeof store.mutations[type] !== "function") {
        console.error(`[SoteStore] Mutação desconhecida: ${type}`);
        return;
      }

      // Define a flag para permitir a mutação no modo estrito.
      isMutating = true;
      try {
        store.mutations[type](store.state, payload);
      } catch (error) {
        console.error(`[SoteStore] Erro na mutação ${type}:`, error);
      } finally {
        // Garante que a flag seja resetada mesmo se ocorrer um erro.
        isMutating = false;
      }
    };

    /**
     * Despacha uma ação, que pode conter lógica assíncrona.
     * @param {string} type - O nome da ação a ser despachada.
     * @param {*} payload - Os dados a serem passados para a ação.
     * @returns {Promise<any>} A promessa retornada pela ação.
     */
    store.dispatch = function (type, payload) {
      if (typeof store.actions[type] !== "function") {
        return Promise.reject(
          new Error(`[SoteStore] Ação desconhecida: ${type}`)
        );
      }
      try {
        // As ações recebem um objeto de contexto com acesso ao estado, commit e dispatch.
        const context = {
          state: store.state,
          commit: store.commit,
          dispatch: store.dispatch,
        };
        return Promise.resolve(store.actions[type](context, payload));
      } catch (error) {
        console.error(`[SoteStore] Erro na ação ${type}:`, error);
        return Promise.reject(error);
      }
    };

    return store;
  }

  // Exporta a factory para o escopo global
  global.createSoteStore = createSoteStore;
})(self || window);
