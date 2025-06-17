// SOTE-main/dashboard/store.js
(function (global) {
  "use strict";

  // Validação para garantir que o createSoteStore foi carregado
  if (typeof global.createSoteStore !== "function") {
    console.error(
      "O script utils/store.js precisa ser carregado antes de dashboard/store.js"
    );
    return;
  }

  // O estado inicial da nossa aplicação do painel
  const initialState = {
    loading: true,
    abbreviations: [],
    categories: [],
    filteredAbbreviations: [],
    currentCategory: "all",
    currentSort: { column: "abbreviation", direction: "asc" },
    searchTerm: "",
    selectedAbbreviations: new Set(),
  };

  // Mutações são funções síncronas que alteram o estado.
  const mutations = {
    SET_LOADING(state, isLoading) {
      state.loading = isLoading;
    },
    SET_ABBREVIATIONS(state, abbreviations) {
      state.abbreviations = abbreviations;
    },
    SET_CATEGORIES(state, categories) {
      state.categories = categories;
    },
    SET_FILTERED_ABBREVIATIONS(state, filteredAbbreviations) {
      state.filteredAbbreviations = filteredAbbreviations;
    },
    SET_CURRENT_CATEGORY(state, category) {
      state.currentCategory = category;
    },
    SET_SORT(state, { column, direction }) {
      state.currentSort = { column, direction };
    },
    SET_SEARCH_TERM(state, term) {
      state.searchTerm = term;
    },
    SET_SELECTED_ABBREVIATIONS(state, selected) {
      state.selectedAbbreviations = new Set(selected);
    },
  };

  // Ações contêm lógica de negócio, podem ser assíncronas.
  const actions = {
    async loadInitialData(context) {
      context.commit("SET_LOADING", true);
      try {
        const [abbreviations, categories] = await Promise.all([
          global.SOTECache.getAllAbbreviations(),
          global.SOTECache.getAllCategories(),
        ]);
        context.commit(
          "SET_ABBREVIATIONS",
          Array.isArray(abbreviations) ? abbreviations : []
        );
        context.commit("SET_CATEGORIES", categories);
        await context.dispatch("filterAndSortAbbreviations");
      } catch (error) {
        console.error("Erro ao carregar dados iniciais:", error);
        SoteNotifier.show("Falha ao carregar dados do painel.", "error");
      } finally {
        context.commit("SET_LOADING", false);
      }
    },

    async refreshData(context) {
      // Usado para recarregar dados após uma ação (salvar, excluir)
      await context.dispatch("loadInitialData");
    },

    async filterAndSortAbbreviations(context) {
      const { abbreviations, currentCategory, searchTerm, currentSort } =
        context.state;

      // 1. Filtrar por categoria
      let filtered =
        currentCategory === "all"
          ? [...abbreviations]
          : abbreviations.filter(abbr => abbr.category === currentCategory);

      // 2. Filtrar por termo de busca
      if (searchTerm) {
        const lowerCaseSearchTerm = searchTerm.toLowerCase();
        filtered = filtered.filter(
          abbr =>
            abbr.abbreviation.toLowerCase().includes(lowerCaseSearchTerm) ||
            abbr.expansion.toLowerCase().includes(lowerCaseSearchTerm)
        );
      }

      // 3. Ordenar
      const { column, direction } = currentSort;
      filtered.sort((a, b) => {
        let valueA = a[column];
        let valueB = b[column];

        // Normalização para ordenação
        if (column === "lastUsed") {
          // Trata datas nulas como "infinito" para ordenação
          valueA = valueA
            ? new Date(valueA).getTime()
            : direction === "asc"
            ? Infinity
            : -Infinity;
          valueB = valueB
            ? new Date(valueB).getTime()
            : direction === "asc"
            ? Infinity
            : -Infinity;
        } else if (typeof valueA === "string") {
          valueA = valueA.toLowerCase();
          valueB = (b[column] || "").toLowerCase();
        }

        if (valueA < valueB) return -1;
        if (valueA > valueB) return 1;

        // Critério de desempate
        return a.abbreviation.localeCompare(b.abbreviation);
      });

      // Aplicar direção da ordenação
      if (direction === "desc") {
        filtered.reverse();
      }

      context.commit("SET_FILTERED_ABBREVIATIONS", filtered);
    },

    async saveAbbreviation(context, { data, isEditing }) {
      try {
        await (isEditing
          ? global.TextExpanderDB.updateAbbreviation(data)
          : global.TextExpanderDB.addAbbreviation(data));

        await global.SOTECache.invalidateAbbreviationsCache();
        SoteNotifier.show(
          isEditing ? "Abreviação atualizada!" : "Abreviação criada!",
          "success"
        );
        await context.dispatch("refreshData");
      } catch (error) {
        console.error("Erro ao salvar abreviação:", error);
        SoteNotifier.show(
          error.message.includes("Key already exists")
            ? `A abreviação "${data.abbreviation}" já existe.`
            : "Erro ao salvar.",
          "error"
        );
        throw error; // Re-lança para o chamador saber que falhou
      }
    },

    async deleteAbbreviation(context, abbreviationKey) {
      try {
        await global.TextExpanderDB.deleteAbbreviation(abbreviationKey);
        await global.SOTECache.invalidateAbbreviationsCache();
        SoteNotifier.show("Abreviação excluída.", "success");
        await context.dispatch("refreshData");
      } catch (error) {
        console.error("Erro ao excluir:", error);
        SoteNotifier.show("Erro ao excluir.", "error");
      }
    },

    // Novas ações para controlar a UI
    async setCategory(context, category) {
      context.commit("SET_CURRENT_CATEGORY", category);
      await context.dispatch("filterAndSortAbbreviations");
    },

    async setSearchTerm(context, term) {
      context.commit("SET_SEARCH_TERM", term);
      await context.dispatch("filterAndSortAbbreviations");
    },

    async setSort(context, { column, direction }) {
      context.commit("SET_SORT", { column, direction });
      await context.dispatch("filterAndSortAbbreviations");
    },
  };

  // Cria e exporta a instância do store
  global.dashboardStore = global.createSoteStore({
    state: initialState,
    mutations,
    actions,
  });
})(self || window);
