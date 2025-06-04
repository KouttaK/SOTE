// SOTE-main/utils/expansion.js
(function(window) {
  'use strict';
  console.log('[SOTE DEBUG] utils/expansion.js SCRIPT CARREGADO em:', new Date().toLocaleTimeString()); 

  function evaluateRule(rule, now = new Date()) { 
    // Log inicial da função evaluateRule
    console.log('[SOTE DEBUG] evaluateRule INICIADA para regra - ID:', rule.id || '(sem id)', 'Tipo:', rule.type, 'Prioridade:', rule.priority);
    
    const currentDay = now.getDay(); 
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes(); 
    const currentDate = now.getDate(); 
    const currentMonth = now.getMonth() + 1; 

    let conditionMet = false;

    // Log dos dados da regra e do tempo atual para avaliação
    // console.log('[SOTE DEBUG] Avaliando Regra (dados completos):', JSON.parse(JSON.stringify(rule)), 'Hora Atual:', now.toLocaleString(), 'Dia da Semana Atual (0=Dom):', currentDay);

    switch (rule.type) {
      case 'dayOfWeek':
        conditionMet = rule.days && Array.isArray(rule.days) && rule.days.includes(currentDay);
        console.log('[SOTE DEBUG] DayOfWeek - Condição Atendida:', conditionMet, '| Dias da Regra:', rule.days, '| Dia Atual:', currentDay);
        break;
        
      case 'timeRange':
        console.log('[SOTE DEBUG] TimeRange - Dados da Regra: StartH:', rule.startHour, 'StartM:', rule.startMinute, 'EndH:', rule.endHour, 'EndM:', rule.endMinute, '| Hora Atual:', currentHour + ':' + currentMinute);

        if (rule.startHour !== undefined && rule.startMinute !== undefined &&
            rule.endHour !== undefined && rule.endMinute !== undefined) {
          
          const ruleStartTotalMinutes = Number(rule.startHour) * 60 + Number(rule.startMinute);
          const ruleEndTotalMinutes = Number(rule.endHour) * 60 + Number(rule.endMinute);
          const currentTimeTotalMinutes = currentHour * 60 + currentMinute;

          console.log('[SOTE DEBUG] TimeRange - Cálculos: StartTotalM:', ruleStartTotalMinutes, 'EndTotalM:', ruleEndTotalMinutes, 'CurrentTotalM:', currentTimeTotalMinutes);

          if (ruleStartTotalMinutes <= ruleEndTotalMinutes) { // Não atravessa meia-noite
            conditionMet = currentTimeTotalMinutes >= ruleStartTotalMinutes && 
                           currentTimeTotalMinutes <= ruleEndTotalMinutes;
          } else { // Atravessa meia-noite (ex: 22:00 - 02:00)
            conditionMet = currentTimeTotalMinutes >= ruleStartTotalMinutes || 
                           currentTimeTotalMinutes <= ruleEndTotalMinutes;
          }
        } else {
          conditionMet = false; 
          console.warn('[SOTE DEBUG] TimeRange - Regra faltando propriedades de hora/minuto:', rule);
        }
        console.log('[SOTE DEBUG] TimeRange - Condição Atendida para regra ID ' + (rule.id || 'N/A') + ':', conditionMet);
        break;
        
      case 'domain':
        const currentDomain = window.location.hostname;
        conditionMet = rule.domains && Array.isArray(rule.domains) && rule.domains.some(domain => currentDomain.includes(domain));
        console.log('[SOTE DEBUG] Domain - Condição Atendida:', conditionMet, '| Domínios da Regra:', rule.domains, '| Domínio Atual:', currentDomain);
        break;

      case 'specialDate': 
        conditionMet = rule.month !== undefined && rule.day !== undefined &&
                       currentMonth === parseInt(rule.month, 10) && 
                       currentDate === parseInt(rule.day, 10);
        console.log('[SOTE DEBUG] SpecialDate - Condição Atendida:', conditionMet, '| Data da Regra (M/D):', rule.month + '/' + rule.day, '| Data Atual (M/D):', currentMonth + '/' + currentDate);
        break;
        
      case 'combined': 
        console.log('[SOTE DEBUG] Combined - Dados da Regra:', rule.logicalOperator, 'Subcondições:', rule.subConditions ? rule.subConditions.length : 0);
        if (!rule.subConditions || !Array.isArray(rule.subConditions) || rule.subConditions.length === 0) {
          conditionMet = true; // Ou false, dependendo do comportamento desejado para regra combinada vazia
          console.log('[SOTE DEBUG] Combined - Sem subcondições ou subcondições inválidas, resultado:', conditionMet);
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
          conditionMet = true; // Comportamento padrão se operador lógico for inválido
        }
        console.log('[SOTE DEBUG] Combined - Condição Atendida:', conditionMet);
        break;
        
      default:
        console.warn('[SOTE DEBUG] Tipo de regra desconhecido:', rule.type);
        conditionMet = true; // Ou false, se tipos desconhecidos não devem ativar expansão
    }
    console.log('[SOTE DEBUG] evaluateRule FINALIZADA para regra ID:', rule.id || '(sem id)', 'Tipo:', rule.type, 'Resultado:', conditionMet);
    return conditionMet;
  }

  function getMatchingExpansion(abbreviationObject, rulesArgument) {
    console.log('[SOTE DEBUG] getMatchingExpansion INICIADA para:', 
      abbreviationObject.abbreviation, 
      '| Expansão Padrão:', abbreviationObject.expansion, 
      '| Tipo de rulesArgument:', typeof rulesArgument, 
      '| É rulesArgument um array?', Array.isArray(rulesArgument));
    
    if (rulesArgument && Array.isArray(rulesArgument)) {
        // Usar JSON.stringify seguro para evitar erros com estruturas complexas ou circulares se houver
        try {
            console.log('[SOTE DEBUG] Conteúdo de rulesArgument:', JSON.stringify(rulesArgument));
        } catch (e) {
            console.warn('[SOTE DEBUG] Não foi possível fazer stringify de rulesArgument:', rulesArgument, e);
        }
    }

    if (!rulesArgument || !Array.isArray(rulesArgument) || rulesArgument.length === 0) { 
      console.log('[SOTE DEBUG] getMatchingExpansion: rulesArgument inválido ou vazio. Retornando expansão padrão.');
      return abbreviationObject.expansion; 
    }

    const now = new Date();
    const sortedRules = [...rulesArgument].sort((a, b) => (b.priority || 0) - (a.priority || 0));
    
    try {
        console.log('[SOTE DEBUG] getMatchingExpansion: Regras ordenadas para matching:', JSON.stringify(sortedRules));
    } catch (e) {
        console.warn('[SOTE DEBUG] Não foi possível fazer stringify de sortedRules:', sortedRules, e);
    }


    const matchingRule = sortedRules.find(rule => {
      if (!rule || typeof rule !== 'object') {
        console.warn('[SOTE DEBUG] getMatchingExpansion: Item inválido em sortedRules:', rule);
        return false;
      }
      console.log('[SOTE DEBUG] getMatchingExpansion: Avaliando regra ID:', rule.id || "ID Desconhecido", "Tipo:", rule.type, "Prioridade:", rule.priority);
      return evaluateRule(rule, now);
    });
    
    if (matchingRule) {
      console.log('[SOTE DEBUG] getMatchingExpansion: Regra correspondente ENCONTRADA. ID:', matchingRule.id, 'Expansão:', matchingRule.expansion);
      return matchingRule.expansion;
    } else {
      console.log('[SOTE DEBUG] getMatchingExpansion: Nenhuma regra correspondente encontrada. Retornando expansão padrão para', abbreviationObject.abbreviation);
      return abbreviationObject.expansion;
    }
  }

  function matchAbbreviation(text, abbreviation, caseSensitive) {
    // console.log('[SOTE DEBUG] matchAbbreviation:', text, abbreviation, caseSensitive);
    if (!text || !abbreviation) return false;
    
    if (caseSensitive) {
      return text === abbreviation;
    } else {
      return text.toLowerCase() === abbreviation.toLowerCase();
    }
  }

  function expandAbbreviation(element, abbreviationText, defaultExpansionText, rulesArray) {
    // console.log('[SOTE DEBUG] expandAbbreviation (input/textarea) para:', abbreviationText);
    const value = element.value;
    const cursorPos = element.selectionStart;
    
    let wordStart = cursorPos;
    while (wordStart > 0 && !/\s/.test(value.charAt(wordStart - 1))) {
      wordStart--;
    }
    
    const word = value.substring(wordStart, cursorPos);
    
    if (matchAbbreviation(word, abbreviationText, false)) { 
      const contextualExpansion = getMatchingExpansion({ abbreviation: abbreviationText, expansion: defaultExpansionText, rules: rulesArray }, rulesArray);
      
      element._lastExpansion = {
        abbreviation: abbreviationText,
        expansion: contextualExpansion,
        position: { start: wordStart, end: cursorPos }
      };
      
      const newValue = value.substring(0, wordStart) + 
                      contextualExpansion + 
                      value.substring(cursorPos);
      
      element.value = newValue;
      
      const newCursorPos = wordStart + contextualExpansion.length;
      element.setSelectionRange(newCursorPos, newCursorPos);
      
      element.dispatchEvent(new Event('input', { bubbles: true }));
      
      return true;
    }
    
    return false;
  }

  function expandAbbreviationInContentEditable(abbreviationText, defaultExpansionText, rulesArray) {
    // console.log('[SOTE DEBUG] expandAbbreviationInContentEditable para:', abbreviationText);
    const selection = window.getSelection();
    if (!selection.rangeCount) return false;
    
    const range = selection.getRangeAt(0);
    if (!range.startContainer.textContent) return false; 

    const text = range.startContainer.textContent;
    const cursorPos = range.startOffset;
    
    let wordStart = cursorPos;
    while (wordStart > 0 && !/\s/.test(text.charAt(wordStart - 1))) {
      wordStart--;
    }
    
    const word = text.substring(wordStart, cursorPos);
    
    if (matchAbbreviation(word, abbreviationText, false)) { 
        const contextualExpansion = getMatchingExpansion({ abbreviation: abbreviationText, expansion: defaultExpansionText, rules: rulesArray }, rulesArray); 
      
      const wordRange = document.createRange();
      wordRange.setStart(range.startContainer, wordStart);
      wordRange.setEnd(range.startContainer, cursorPos);
      
      let editableElementHost = range.startContainer;
      while(editableElementHost && editableElementHost.nodeType !== Node.ELEMENT_NODE) {
          editableElementHost = editableElementHost.parentNode;
      }
      if (!editableElementHost) editableElementHost = document.body; 

      editableElementHost._lastExpansion = { 
          abbreviation: abbreviationText,
          expansion: contextualExpansion,
          savedRangePath: { 
              startContainerPath: getNodePath(range.startContainer),
              startOffset: wordStart,
              endContainerPath: getNodePath(range.startContainer),
              endOffset: cursorPos
          },
          rawRange: range.cloneRange() 
      };
      
      wordRange.deleteContents();
      const textNode = document.createTextNode(contextualExpansion);
      wordRange.insertNode(textNode);
      
      selection.removeAllRanges();
      const newRange = document.createRange();
      newRange.setStartAfter(textNode);
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
    const expansionLength = element._lastExpansion.expansion.length;
    
    const newValue = element.value.substring(0, start) + 
                     abbreviation + 
                     element.value.substring(start + expansionLength);
    
    element.value = newValue;
    
    const newCursorPos = start + abbreviation.length;
    element.setSelectionRange(newCursorPos, newCursorPos);
    
    element.dispatchEvent(new Event('input', { bubbles: true }));
    
    element._lastExpansion = null;
    
    return true;
  }

  function undoExpansionInContentEditable(element) { 
    if (!element || !element._lastExpansion) return false;
    
    const { abbreviation, rawRange } = element._lastExpansion; 
    
    const selection = window.getSelection();
    if (!selection || !rawRange) return false;

    try {
        selection.removeAllRanges();
        selection.addRange(rawRange); 

        rawRange.deleteContents(); 
        const textNode = document.createTextNode(abbreviation);
        rawRange.insertNode(textNode);
        
        selection.removeAllRanges();
        const newRange = document.createRange();
        newRange.setStartAfter(textNode);
        newRange.collapse(true);
        selection.addRange(newRange);
        
        element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    } catch (e) {
        console.error("[SOTE DEBUG] Erro durante undoExpansionInContentEditable:", e);
        // Restaurar _lastExpansion se o undo falhar pode ser uma opção, ou limpá-lo de qualquer maneira.
        // Por simplicidade, vamos limpar.
        element._lastExpansion = null;
        return false;
    }
    
    element._lastExpansion = null;
    return true;
  }

  window.TextExpander = {
    matchAbbreviation,
    expandAbbreviation,
    expandAbbreviationInContentEditable,
    undoExpansion,
    undoExpansionInContentEditable,
    evaluateRule, 
    getMatchingExpansion
  };
})(window);