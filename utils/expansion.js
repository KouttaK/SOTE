// SOTE-main/utils/expansion.js
(function(window) {
  'use strict';
  console.log('[SOTE DEBUG] utils/expansion.js SCRIPT CARREGADO em:', new Date().toLocaleTimeString());

  // ===== FUNÇÕES DE VALIDAÇÃO DE DOMÍNIOS =====
  function validateDomain(ruleDomains, currentDomain) {
    // console.log('[SOTE DEBUG] validateDomain - Iniciando validação:', {
    //   ruleDomains,
    //   currentDomain
    // });

    if (!ruleDomains || !Array.isArray(ruleDomains) || ruleDomains.length === 0) {
      // console.log('[SOTE DEBUG] validateDomain - Nenhum domínio configurado na regra');
      return false;
    }

    if (!currentDomain || typeof currentDomain !== 'string') {
      // console.log('[SOTE DEBUG] validateDomain - Domínio atual inválido');
      return false;
    }

    const normalizedCurrentDomain = normalizeDomain(currentDomain);
    // console.log('[SOTE DEBUG] validateDomain - Domínio normalizado:', normalizedCurrentDomain);

    for (const ruleDomain of ruleDomains) {
      if (!ruleDomain || typeof ruleDomain !== 'string') {
        console.warn('[SOTE DEBUG] validateDomain - Domínio da regra inválido:', ruleDomain);
        continue;
      }

      const normalizedRuleDomain = normalizeDomain(ruleDomain);
      // console.log('[SOTE DEBUG] validateDomain - Testando contra:', normalizedRuleDomain);

      if (isDomainMatch(normalizedCurrentDomain, normalizedRuleDomain)) {
        // console.log('[SOTE DEBUG] validateDomain - Correspondência encontrada!');
        return true;
      }
    }

    // console.log('[SOTE DEBUG] validateDomain - Nenhuma correspondência encontrada');
    return false;
  }

  function normalizeDomain(domain) {
    if (!domain) return '';
    let normalized = domain.replace(/^https?:\/\//, '');
    normalized = normalized.replace(/^www\./, '');
    normalized = normalized.split(':')[0];
    normalized = normalized.split('/')[0];
    normalized = normalized.toLowerCase().trim();
    return normalized;
  }

  function isDomainMatch(currentDomain, ruleDomain) {
    if (!currentDomain || !ruleDomain) return false;
    // console.log('[SOTE DEBUG] isDomainMatch - Comparando:', { currentDomain, ruleDomain });
    if (currentDomain === ruleDomain) {
      // console.log('[SOTE DEBUG] isDomainMatch - Correspondência exata');
      return true;
    }
    if (ruleDomain.startsWith('.')) {
      const baseDomain = ruleDomain.substring(1);
      if (currentDomain === baseDomain || currentDomain.endsWith('.' + baseDomain)) {
        // console.log('[SOTE DEBUG] isDomainMatch - Correspondência de subdomínio com prefixo ponto');
        return true;
      }
    }
    if (currentDomain.endsWith('.' + ruleDomain)) {
      // console.log('[SOTE DEBUG] isDomainMatch - Correspondência de domínio base');
      return true;
    }
    if (ruleDomain.includes('*')) {
      if (isWildcardMatch(currentDomain, ruleDomain)) {
        // console.log('[SOTE DEBUG] isDomainMatch - Correspondência com wildcard');
        return true;
      }
    }
    if (ruleDomain.startsWith('@')) {
      const baseDomain = ruleDomain.substring(1);
      if (currentDomain === baseDomain && !currentDomain.includes('.', currentDomain.indexOf(baseDomain))) {
        // console.log('[SOTE DEBUG] isDomainMatch - Correspondência de domínio raiz');
        return true;
      }
    }
    return false;
  }

  function isWildcardMatch(domain, pattern) {
    const regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*');
    const regex = new RegExp('^' + regexPattern + '$', 'i');
    return regex.test(domain);
  }

  function isValidDomainFormat(domain) {
    if (!domain || typeof domain !== 'string') return false;
    const normalized = normalizeDomain(domain);
    const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$/;
    return domainRegex.test(normalized) && normalized.length > 0 && normalized.length <= 253;
  }

  function extractDomainFromUrl(url) {
    try {
      if (!url) return '';
      if (!url.match(/^https?:\/\//)) {
        url = 'http://' + url;
      }
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch (e) {
      console.warn('[SOTE DEBUG] Erro ao extrair domínio da URL:', url, e);
      return normalizeDomain(url);
    }
  }

  // ===== FUNÇÃO PRINCIPAL DE AVALIAÇÃO DE REGRAS =====
  function evaluateRule(rule, now = new Date()) {
    // console.log('[SOTE DEBUG] evaluateRule INICIADA para regra - ID:', rule.id || '(sem id)', 'Tipo:', rule.type, 'Prioridade:', rule.priority);
    const currentDay = now.getDay();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentDate = now.getDate();
    const currentMonth = now.getMonth() + 1;
    let conditionMet = false;

    switch (rule.type) {
      case 'dayOfWeek':
        conditionMet = rule.days && Array.isArray(rule.days) && rule.days.includes(currentDay);
        // console.log('[SOTE DEBUG] DayOfWeek - Condição Atendida:', conditionMet, '| Dias da Regra:', rule.days, '| Dia Atual:', currentDay);
        break;
      case 'timeRange':
        // console.log('[SOTE DEBUG] TimeRange - Dados da Regra: StartH:', rule.startHour, 'StartM:', rule.startMinute, 'EndH:', rule.endHour, 'EndM:', rule.endMinute, '| Hora Atual:', currentHour + ':' + currentMinute);
        if (rule.startHour !== undefined && rule.startMinute !== undefined &&
            rule.endHour !== undefined && rule.endMinute !== undefined) {
          const ruleStartTotalMinutes = Number(rule.startHour) * 60 + Number(rule.startMinute);
          const ruleEndTotalMinutes = Number(rule.endHour) * 60 + Number(rule.endMinute);
          const currentTimeTotalMinutes = currentHour * 60 + currentMinute;
          // console.log('[SOTE DEBUG] TimeRange - Cálculos: StartTotalM:', ruleStartTotalMinutes, 'EndTotalM:', ruleEndTotalMinutes, 'CurrentTotalM:', currentTimeTotalMinutes);
          if (ruleStartTotalMinutes <= ruleEndTotalMinutes) {
            conditionMet = currentTimeTotalMinutes >= ruleStartTotalMinutes &&
                           currentTimeTotalMinutes <= ruleEndTotalMinutes;
          } else {
            conditionMet = currentTimeTotalMinutes >= ruleStartTotalMinutes ||
                           currentTimeTotalMinutes <= ruleEndTotalMinutes;
          }
        } else {
          conditionMet = false;
          console.warn('[SOTE DEBUG] TimeRange - Regra faltando propriedades de hora/minuto:', rule);
        }
        // console.log('[SOTE DEBUG] TimeRange - Condição Atendida para regra ID ' + (rule.id || 'N/A') + ':', conditionMet);
        break;
      case 'domain':
        const currentDomain = window.location.hostname;
        conditionMet = validateDomain(rule.domains, currentDomain);
        // console.log('[SOTE DEBUG] Domain - Condição Atendida:', conditionMet, '| Domínios da Regra:', rule.domains, '| Domínio Atual:', currentDomain);
        break;
      case 'specialDate':
        conditionMet = rule.month !== undefined && rule.day !== undefined &&
                       currentMonth === parseInt(rule.month, 10) &&
                       currentDate === parseInt(rule.day, 10);
        // console.log('[SOTE DEBUG] SpecialDate - Condição Atendida:', conditionMet, '| Data da Regra (M/D):', rule.month + '/' + rule.day, '| Data Atual (M/D):', currentMonth + '/' + currentDate);
        break;
      case 'combined':
        // console.log('[SOTE DEBUG] Combined - Dados da Regra:', rule.logicalOperator, 'Subcondições:', rule.subConditions ? rule.subConditions.length : 0);
        if (!rule.subConditions || !Array.isArray(rule.subConditions) || rule.subConditions.length === 0) {
          conditionMet = true;
          // console.log('[SOTE DEBUG] Combined - Sem subcondições ou subcondições inválidas, resultado:', conditionMet);
          break;
        }
        if (rule.logicalOperator === 'AND') {
          conditionMet = rule.subConditions.every(subRule => {
            const subConditionResult = evaluateRule({ type: subRule.conditionType, ...subRule }, now);
            return subRule.negated ? !subConditionResult : subConditionResult;
          });
        } else if (rule.logicalOperator === 'OR') {
          conditionMet = rule.subConditions.some(subRule => {
            const subConditionResult = evaluateRule({ type: subRule.conditionType, ...subRule }, now);
            return subRule.negated ? !subConditionResult : subConditionResult;
          });
        } else {
          conditionMet = true;
        }
        // console.log('[SOTE DEBUG] Combined - Condição Atendida:', conditionMet);
        break;
      default:
        console.warn('[SOTE DEBUG] Tipo de regra desconhecido:', rule.type);
        conditionMet = true;
    }
    // console.log('[SOTE DEBUG] evaluateRule FINALIZADA para regra ID:', rule.id || '(sem id)', 'Tipo:', rule.type, 'Resultado:', conditionMet);
    return conditionMet;
  }

  function getMatchingExpansion(abbreviationObject, rulesArgument) {
    // console.log('[SOTE DEBUG] getMatchingExpansion INICIADA para:',
    //   abbreviationObject.abbreviation,
    //   '| Expansão Padrão:', abbreviationObject.expansion,
    //   '| Tipo de rulesArgument:', typeof rulesArgument,
    //   '| É rulesArgument um array?', Array.isArray(rulesArgument));

    if (rulesArgument && Array.isArray(rulesArgument)) {
        try {
            // console.log('[SOTE DEBUG] Conteúdo de rulesArgument:', JSON.stringify(rulesArgument));
        } catch (e) {
            // console.warn('[SOTE DEBUG] Não foi possível fazer stringify de rulesArgument:', rulesArgument, e);
        }
    }

    if (!rulesArgument || !Array.isArray(rulesArgument) || rulesArgument.length === 0) {
      // console.log('[SOTE DEBUG] getMatchingExpansion: rulesArgument inválido ou vazio. Retornando expansão padrão.');
      return abbreviationObject.expansion;
    }

    const now = new Date();
    const sortedRules = [...rulesArgument].sort((a, b) => (b.priority || 0) - (a.priority || 0));

    try {
        // console.log('[SOTE DEBUG] getMatchingExpansion: Regras ordenadas para matching:', JSON.stringify(sortedRules));
    } catch (e) {
        // console.warn('[SOTE DEBUG] Não foi possível fazer stringify de sortedRules:', sortedRules, e);
    }

    const matchingRule = sortedRules.find(rule => {
      if (!rule || typeof rule !== 'object') {
        // console.warn('[SOTE DEBUG] getMatchingExpansion: Item inválido em sortedRules:', rule);
        return false;
      }
      // console.log('[SOTE DEBUG] getMatchingExpansion: Avaliando regra ID:', rule.id || "ID Desconhecido", "Tipo:", rule.type, "Prioridade:", rule.priority);
      return evaluateRule(rule, now);
    });

    if (matchingRule) {
      // console.log('[SOTE DEBUG] getMatchingExpansion: Regra correspondente ENCONTRADA. ID:', matchingRule.id, 'Expansão:', matchingRule.expansion);
      return matchingRule.expansion;
    } else {
      // console.log('[SOTE DEBUG] getMatchingExpansion: Nenhuma regra correspondente encontrada. Retornando expansão padrão para', abbreviationObject.abbreviation);
      return abbreviationObject.expansion;
    }
  }

  function matchAbbreviation(text, abbreviation, caseSensitive) {
    if (!text || !abbreviation) return false;
    if (caseSensitive) {
      return text === abbreviation;
    } else {
      return text.toLowerCase() === abbreviation.toLowerCase();
    }
  }

  async function processSpecialActions(expansionText) {
    let processedText = expansionText;
    let cursorPosition = -1;

    // Process $transferencia$
    if (processedText.includes('$transferencia$')) {
      try {
        const clipboardText = await navigator.clipboard.readText();
        processedText = processedText.replace(/\$transferencia\$/g, clipboardText);
      } catch (err) {
        console.error('Falha ao ler da área de transferência:', err);
        processedText = processedText.replace(/\$transferencia\$/g, '[ERRO_TRANSFERENCIA]');
      }
    }

    // Process $cursor$
    const cursorMarker = '$cursor$';
    const firstCursorIndex = processedText.indexOf(cursorMarker);
    if (firstCursorIndex !== -1) {
      cursorPosition = firstCursorIndex;
      // Remove all instances of $cursor$, but cursorPosition is based on the first
      processedText = processedText.replace(/\$cursor\$/g, '');
    }

    return { text: processedText, cursorPosition };
  }

  async function expandAbbreviation(element, abbreviationText, defaultExpansionText, rulesArray) { // Tornada async
    // console.log('[SOTE DEBUG] expandAbbreviation (input/textarea) para:', abbreviationText);
    const value = element.value;
    const originalCursorPos = element.selectionStart;

    let wordStart = originalCursorPos;
    while (wordStart > 0 && !/\s/.test(value.charAt(wordStart - 1))) {
      wordStart--;
    }

    const word = value.substring(wordStart, originalCursorPos);

    if (matchAbbreviation(word, abbreviationText, false)) { // Supondo que a caseSensitive da abreviação seja tratada por getMatchingExpansion ou similar
      const contextualExpansion = getMatchingExpansion({ abbreviation: abbreviationText, expansion: defaultExpansionText, rules: rulesArray }, rulesArray);
      const { text: finalExpansionText, cursorPosition: finalCursorOffset } = await processSpecialActions(contextualExpansion);

      element._lastExpansion = {
        abbreviation: abbreviationText,
        expansion: finalExpansionText, // Armazena o texto já processado
        originalRawExpansion: contextualExpansion,
        position: { start: wordStart, end: originalCursorPos }
      };

      const newValue = value.substring(0, wordStart) +
                      finalExpansionText +
                      value.substring(originalCursorPos);
      element.value = newValue;

      let newCursorPos;
      if (finalCursorOffset !== -1) {
        newCursorPos = wordStart + finalCursorOffset;
      } else {
        newCursorPos = wordStart + finalExpansionText.length;
      }
      element.setSelectionRange(newCursorPos, newCursorPos);
      element.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }
    return false;
  }

  async function expandAbbreviationInContentEditable(abbreviationText, defaultExpansionText, rulesArray) { // Tornada async
    // console.log('[SOTE DEBUG] expandAbbreviationInContentEditable para:', abbreviationText);
    const selection = window.getSelection();
    if (!selection.rangeCount) return false;

    const range = selection.getRangeAt(0).cloneRange(); // Clonar para evitar modificação inesperada
    if (!range.startContainer.textContent) return false;

    const text = range.startContainer.textContent;
    const originalCursorPosInNode = range.startOffset;

    let wordStartInNode = originalCursorPosInNode;
    while (wordStartInNode > 0 && !/\s/.test(text.charAt(wordStartInNode - 1))) {
      wordStartInNode--;
    }

    const word = text.substring(wordStartInNode, originalCursorPosInNode);

    if (matchAbbreviation(word, abbreviationText, false)) { // Similarmente, caseSensitive da abbr.
      const contextualExpansion = getMatchingExpansion({ abbreviation: abbreviationText, expansion: defaultExpansionText, rules: rulesArray }, rulesArray);
      const { text: finalExpansionText, cursorPosition: finalCursorOffset } = await processSpecialActions(contextualExpansion);

      const wordRange = document.createRange();
      try {
        wordRange.setStart(range.startContainer, wordStartInNode);
        wordRange.setEnd(range.startContainer, originalCursorPosInNode);
      } catch (e) {
        console.error("Erro ao definir wordRange:", e, {startContainer: range.startContainer, wordStartInNode, originalCursorPosInNode});
        return false;
      }


      let editableElementHost = range.startContainer;
      while(editableElementHost && editableElementHost.nodeType !== Node.ELEMENT_NODE) {
          editableElementHost = editableElementHost.parentNode;
      }
      if (!editableElementHost) editableElementHost = document.body;

      editableElementHost._lastExpansion = {
          abbreviation: abbreviationText,
          expansion: finalExpansionText,
          originalRawExpansion: contextualExpansion,
          // Salvar o range original antes da deleção é mais seguro para o undo
          savedRangePath: {
              startContainerPath: getNodePath(range.startContainer),
              startOffset: wordStartInNode,
              endContainerPath: getNodePath(range.startContainer),
              endOffset: originalCursorPosInNode
          },
          rawRange: range // Armazenar o range ANTES da modificação do DOM
      };

      wordRange.deleteContents();
      const textNode = document.createTextNode(finalExpansionText);
      wordRange.insertNode(textNode);

      selection.removeAllRanges();
      const newRange = document.createRange();

      if (finalCursorOffset !== -1) {
        // Tentar definir o cursor dentro do novo textNode
        // Certificar que finalCursorOffset não excede o comprimento do textNode
        const safeCursorOffset = Math.min(finalCursorOffset, textNode.length);
        newRange.setStart(textNode, safeCursorOffset);
      } else {
        newRange.setStartAfter(textNode);
      }
      newRange.collapse(true);
      selection.addRange(newRange);

      let editableElement = range.startContainer;
      while(editableElement && !editableElement.isContentEditable) {
          editableElement = editableElement.parentNode;
      }
      if(editableElement && editableElement.isContentEditable) {
          editableElement.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      }
      return true;
    }
    return false;
  }

  function getNodePath(node) {
      const path = [];
      while (node && node.parentNode) {
          let index = 0;
          let sibling = node.previousSibling;
          while (sibling) {
              if (sibling.nodeType === node.nodeType && sibling.nodeName === node.nodeName) {
                  index++;
              }
              sibling = sibling.previousSibling;
          }
          path.unshift({ name: node.nodeName, index });
          node = node.parentNode;
      }
      return path;
  }

  function undoExpansion(element) {
    if (!element._lastExpansion) return false;

    const { abbreviation, position } = element._lastExpansion;
    const { start } = position;
    const currentExpansionLength = element._lastExpansion.expansion.length; 

    const newValue = element.value.substring(0, start) +
                     abbreviation + 
                     element.value.substring(start + currentExpansionLength);
    element.value = newValue;

    const newCursorPos = start + abbreviation.length;
    element.setSelectionRange(newCursorPos, newCursorPos);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element._lastExpansion = null;
    return true;
  }

  function undoExpansionInContentEditable(element) {
    if (!element || !element._lastExpansion) return false;

    const { abbreviation, rawRange: savedRangeBeforeExpansion } = element._lastExpansion;
    const selection = window.getSelection();

    if (!selection || !savedRangeBeforeExpansion) {
      console.warn("[SOTE DEBUG] Undo: Seleção ou range salvo inválido.");
      element._lastExpansion = null; 
      return false;
    }

    try {
      selection.removeAllRanges();
      selection.addRange(savedRangeBeforeExpansion.cloneRange()); 
      savedRangeBeforeExpansion.deleteContents(); 
      const abbreviationNode = document.createTextNode(abbreviation);
      savedRangeBeforeExpansion.insertNode(abbreviationNode); 

      selection.removeAllRanges();
      const newCursorRange = document.createRange();
      newCursorRange.setStartAfter(abbreviationNode);
      newCursorRange.collapse(true);
      selection.addRange(newCursorRange);

      let editableGrandParent = element; 
      if(editableGrandParent && editableGrandParent.isContentEditable) {
          editableGrandParent.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      } else { 
          let parent = savedRangeBeforeExpansion.commonAncestorContainer;
          while(parent && !parent.isContentEditable) {
              parent = parent.parentNode;
          }
          if(parent && parent.isContentEditable) {
              parent.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
          }
      }

    } catch (e) {
        console.error("[SOTE DEBUG] Erro durante undoExpansionInContentEditable:", e);
        element._lastExpansion = null;
        return false;
    }

    element._lastExpansion = null;
    return true;
  }

  function testDomainMatching(testCases) {
    console.log('[SOTE DEBUG] Iniciando testes de correspondência de domínios');
    testCases.forEach((testCase, index) => {
      const { currentDomain, ruleDomains, expected, description } = testCase;
      const result = validateDomain(ruleDomains, currentDomain);
      const passed = result === expected;
      console.log(`[SOTE DEBUG] Teste ${index + 1}: ${description}`);
      console.log(`  Domínio atual: ${currentDomain}`);
      console.log(`  Regra: ${JSON.stringify(ruleDomains)}`);
      console.log(`  Esperado: ${expected}, Obtido: ${result}`);
      console.log(`  Status: ${passed ? 'PASSOU' : 'FALHOU'}`);
      console.log('---');
    });
  }

  async function replaceTextAtCursorWithExpansion(element, wordStart, currentCursorPos, finalExpansionText, finalCursorOffset) {
    if (!element) return false;

    let newCursorPos;

    if (element.isContentEditable) {
      const selection = window.getSelection();
      if (!selection.rangeCount) {
        console.warn('[Expansion DEBUG] ContentEditable: Sem range de seleção. Não foi possível expandir.');
        return false;
      }

      const range = selection.getRangeAt(0);
      console.log('[Expansion DEBUG] ContentEditable: range.startContainer:', range.startContainer, 'range.startOffset:', range.startOffset); // LOG DE DEBUG
      console.log('[Expansion DEBUG] ContentEditable: wordStart:', wordStart, 'currentCursorPos:', currentCursorPos); // LOG DE DEBUG

      const wordRange = document.createRange();

      try {
        // Usa os valores passados de wordStart e currentCursorPos para definir o range a ser substituído
        wordRange.setStart(range.startContainer, wordStart);
        wordRange.setEnd(range.startContainer, currentCursorPos);
      } catch (e) {
        console.error("Erro ao definir wordRange para substituição em contentEditable:", e, {startContainer: range.startContainer, wordStart, currentCursorPos});
        return false;
      }
      
      wordRange.deleteContents(); // Deleta o texto da abreviação parcial
      const textNode = document.createTextNode(finalExpansionText); // Cria um novo nó de texto com a expansão
      wordRange.insertNode(textNode); // Insere o nó de texto no lugar

      selection.removeAllRanges(); // Limpa seleções existentes
      const newRange = document.createRange(); // Cria um novo range para o cursor

      if (finalCursorOffset !== -1) {
        const safeCursorOffset = Math.min(finalCursorOffset, textNode.length);
        newRange.setStart(textNode, safeCursorOffset); // Posiciona o cursor dentro do novo texto
      } else {
        newRange.setStartAfter(textNode); // Posiciona o cursor após o novo texto
      }
      newRange.collapse(true); // Colapsa o range para um ponto de inserção
      selection.addRange(newRange); // Adiciona o novo range ao objeto de seleção

      // Dispara o evento 'input' no elemento contentEditable pai
      let editableElementHost = element;
      while(editableElementHost && !editableElementHost.isContentEditable) {
          editableElementHost = editableElementHost.parentNode;
      }
      if(editableElementHost && editableElementHost.isContentEditable) {
          editableElementHost.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      }
      return true;

    } else { // Para input/textarea (lógica que já estava funcionando)
      const value = element.value;
      const newValue = value.substring(0, wordStart) +
                       finalExpansionText +
                       value.substring(currentCursorPos);
      element.value = newValue;

      if (finalCursorOffset !== -1) {
        newCursorPos = wordStart + finalCursorOffset;
      } else {
        newCursorPos = wordStart + finalExpansionText.length;
      }
      element.setSelectionRange(newCursorPos, newCursorPos);
      element.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }
  }

  window.TextExpander = {
    matchAbbreviation,
    expandAbbreviation, 
    expandAbbreviationInContentEditable, 
    undoExpansion,
    undoExpansionInContentEditable,
    evaluateRule,
    getMatchingExpansion,
    processSpecialActions,
    replaceTextAtCursorWithExpansion 
  };

  window.DomainValidator = {
    validateDomain,
    normalizeDomain,
    isDomainMatch,
    isWildcardMatch,
    isValidDomainFormat,
    extractDomainFromUrl,
    testDomainMatching
  };

})(window);