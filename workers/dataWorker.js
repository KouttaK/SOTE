/*
 * WEB WORKER (workers/dataWorker.js)
 * * FUNÇÃO:
 * Este script roda em uma thread separada do UI principal. Sua função é executar tarefas
 * computacionalmente intensivas sem bloquear a interface do usuário. Ele é responsável por:
 * 1.  Realizar buscas complexas e com pontuação de relevância em toda a base de abreviações.
 * 2.  Processar a importação de arquivos grandes, validando os dados em lotes (batches).
 * 3.  Construir índices de busca para otimizar futuras pesquisas.
 * 4.  Calcular estatísticas detalhadas sobre os dados do usuário.
 *
 * TÉCNICAS E ARQUITETURA:
 * - Thread Separada: Roda de forma independente, comunicando-se com a thread principal via 'postMessage'.
 * - Processamento em Lote: A função 'processImportData' divide grandes conjuntos de dados em lotes
 * menores para processamento, evitando o esgotamento de memória e permitindo que a thread do worker
 * permaneça responsiva a outras tarefas, se necessário.
 * - Statefulness: A instância da classe `DataWorker` é criada fora do listener de mensagem,
 * permitindo que o worker mantenha estado e caches internos (`abbreviationsCache`, `searchIndex`)
 * entre as chamadas, otimizando operações repetidas.
 * - Comunicação Assíncrona Baseada em Eventos: Recebe um objeto de evento com 'type' e 'data' e
 * retorna um resultado ou um erro, cada um com um 'id' para rastrear a chamada original.
 * 
 *  * * ALTERAÇÃO (Correção):
 * A função `calculateRelevanceScore` foi refatorada para corrigir a lógica de busca.
 *
 * * MOTIVO:
 * Anteriormente, pontos de bônus (por uso e recência) eram adicionados a todas as abreviações,
 * fazendo com que itens não relacionados à busca tivessem uma pontuação > 0 e não fossem
 * filtrados.
 *
 * * SOLUÇÃO:
 * A lógica agora primeiro calcula uma 'pontuação base' apenas com a correspondência do texto.
 * Se essa pontuação for 0, a função retorna 0 imediatamente. Somente se houver uma correspondência
 * de texto (pontuação base > 0), os bônus são aplicados. Isso garante que apenas os itens
 * relevantes sejam retornados pela busca.
 */

class DataWorker {
  constructor() {
    this.abbreviationsCache = new Map();
    this.searchIndex = new Map();
    this.lastCacheUpdate = 0;
    this.CACHE_TTL = 5 * 60 * 1000; // 5 minutos
  }

  // Processa operações pesadas de busca e filtragem
  async searchAbbreviations(query, abbreviations, options = {}) {
    const {
      caseSensitive = false,
      maxResults = 50,
      includeExpansions = true,
      sortBy = "relevance", // 'relevance', 'usage', 'alphabetical'
    } = options;

    const normalizedQuery = caseSensitive ? query : query.toLowerCase();
    const results = [];

    // Algoritmo de busca otimizado
    for (const abbr of abbreviations) {
      const score = this.calculateRelevanceScore(abbr, normalizedQuery, {
        caseSensitive,
        includeExpansions,
      });

      if (score > 0) {
        results.push({
          ...abbr,
          relevanceScore: score,
        });
      }
    }

    // Ordena os resultados
    this.sortResults(results, sortBy);

    return results.slice(0, maxResults);
  }

  calculateRelevanceScore(abbreviation, query, options) {
    let baseScore = 0;
    const { caseSensitive, includeExpansions } = options;

    const normalize = text =>
      caseSensitive || !text ? text : text.toLowerCase();
    const abbrText = normalize(abbreviation.abbreviation);
    const expansionText = normalize(abbreviation.expansion);

    // --- Etapa 1: Calcular Pontuação Base da Correspondência de Texto ---
    if (abbrText === query) {
      baseScore += 1000;
    } else if (abbrText.startsWith(query)) {
      baseScore += 800 - (abbrText.length - query.length) * 10;
    } else if (abbrText.includes(query)) {
      baseScore += 500 - abbrText.indexOf(query) * 5;
    }

    if (includeExpansions && expansionText && expansionText.includes(query)) {
      // Adiciona uma pontuação menor para correspondências na expansão para priorizar a abreviação,
      // mas garante que ainda seja considerada uma correspondência.
      // Se a pontuação base já for alta (match na abreviação), adicionamos menos.
      const expansionScore = 300 - expansionText.indexOf(query) * 2;
      baseScore = Math.max(baseScore, expansionScore);
    }

    // --- Etapa 2: Se não houver correspondência de texto, não é um resultado válido ---
    if (baseScore === 0) {
      return 0;
    }

    // --- Etapa 3: Aplicar bônus apenas se houver uma correspondência de texto ---
    let finalScore = baseScore;

    // Bônus por frequência de uso
    if (abbreviation.usageCount) {
      finalScore += Math.min(abbreviation.usageCount * 5, 200);
    }

    // Bônus por uso recente
    if (abbreviation.lastUsed) {
      const lastUsedDate = new Date(abbreviation.lastUsed).getTime();
      if (!isNaN(lastUsedDate)) {
        const daysSinceLastUse =
          (Date.now() - lastUsedDate) / (1000 * 60 * 60 * 24);
        if (daysSinceLastUse < 7) {
          finalScore += Math.max(0, 50 - Math.floor(daysSinceLastUse) * 7);
        }
      }
    }

    return finalScore;
  }

  sortResults(results, sortBy) {
    switch (sortBy) {
      case "usage":
        results.sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0));
        break;
      case "alphabetical":
      case "abbreviation": // Handle sorting by abbreviation name
        results.sort((a, b) => a.abbreviation.localeCompare(b.abbreviation));
        break;
      case "relevance":
      default:
        results.sort((a, b) => b.relevanceScore - a.relevanceScore);
        break;
    }
  }

  // Processa importação de dados em lote
  async processImportData(importData, existingData, options = {}) {
    const {
      batchSize = 100,
      validateData = true,
      mergeStrategy = "replace", // 'replace', 'merge', 'skip'
    } = options;

    const existingDataMap = new Map(
      existingData.map(item => [item.abbreviation, item])
    );

    const results = {
      processed: 0,
      added: 0,
      updated: 0,
      skipped: 0,
      errors: [],
      preview: [],
    };

    for (let i = 0; i < importData.length; i += batchSize) {
      const batch = importData.slice(i, i + batchSize);

      for (const item of batch) {
        results.processed++;
        let status = "added";
        let info = "Será adicionada.";

        try {
          if (validateData) {
            const validation = this.validateAbbreviation(item);
            if (!validation.valid) {
              throw new Error(validation.error);
            }
          }

          if (existingDataMap.has(item.abbreviation)) {
            if (mergeStrategy === "skip") {
              status = "skipped";
              info = "Já existe e será ignorada.";
              results.skipped++;
            } else {
              status = "updated";
              info = "Será sobrescrita.";
              results.updated++;
            }
          } else {
            results.added++;
          }

          results.preview.push({
            status,
            abbreviation: item.abbreviation,
            expansion: item.expansion,
            info,
          });
        } catch (error) {
          status = "skipped";
          info = `Erro: ${error.message}`;
          results.errors.push({
            item,
            error: error.message,
            index: results.processed - 1,
          });
          results.preview.push({
            status,
            abbreviation: item.abbreviation || "Inválido",
            expansion: item.expansion || "Inválido",
            info,
          });
        }
      }

      await this.sleep(1);
    }

    return results;
  }

  validateAbbreviation(abbr) {
    if (!abbr.abbreviation || typeof abbr.abbreviation !== "string") {
      return { valid: false, error: "Abreviação inválida ou ausente" };
    }
    if (abbr.abbreviation.length > 100) {
      return { valid: false, error: "Abreviação muito longa (máx 100)" };
    }
    if (!abbr.expansion || typeof abbr.expansion !== "string") {
      return { valid: false, error: "Expansão inválida ou ausente" };
    }
    if (abbr.expansion.length > 10000) {
      return { valid: false, error: "Expansão muito longa (máx 10000)" };
    }
    return { valid: true };
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

const dataWorker = new DataWorker();

self.addEventListener("message", async event => {
  const { type, data, id } = event.data;

  try {
    let result;

    switch (type) {
      case "SEARCH_ABBREVIATIONS":
        result = await dataWorker.searchAbbreviations(
          data.query,
          data.abbreviations,
          data.options
        );
        break;

      case "PROCESS_IMPORT":
        result = await dataWorker.processImportData(
          data.importData,
          data.existingData,
          data.options
        );
        break;

      default:
        throw new Error(`Tipo de operação não suportado: ${type}`);
    }

    self.postMessage({
      id,
      type: "SUCCESS",
      result,
    });
  } catch (error) {
    self.postMessage({
      id,
      type: "ERROR",
      error: error.message,
    });
  }
});
