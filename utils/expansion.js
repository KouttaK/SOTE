// SOTE-main/utils/expansion.js
(function (window) {
  "use strict";
  console.log(
    "[SOTE DEBUG] utils/expansion.js SCRIPT CARREGADO em:",
    new Date().toLocaleTimeString()
  );

  // ===== FUNÇÕES DE VALIDAÇÃO DE DOMÍNIOS (Inalteradas) =====
  function validateDomain(ruleDomains, currentDomain, currentUrl) {
    if (
      !ruleDomains ||
      !Array.isArray(ruleDomains) ||
      ruleDomains.length === 0
    ) {
      return false;
    }

    if (!currentDomain || typeof currentDomain !== "string") {
      return false;
    }

    const normalizedCurrentDomain = normalizeDomain(currentDomain);

    for (const ruleDomain of ruleDomains) {
      if (!ruleDomain || typeof ruleDomain !== "string") {
        console.warn(
          "[SOTE DEBUG] validateDomain - Domínio da regra inválido:",
          ruleDomain
        );
        continue;
      }

      if (isDomainMatch(normalizedCurrentDomain, ruleDomain, currentUrl)) {
        return true;
      }
    }

    return false;
  }

  function normalizeDomain(domain) {
    if (!domain) return "";
    let normalized = domain.replace(/^https?:\/\//, "");
    normalized = normalized.replace(/^www\./, "");
    normalized = normalized.split(":")[0];
    normalized = normalized.split("/")[0];
    normalized = normalized.toLowerCase().trim();
    return normalized;
  }

  function isDomainMatch(currentDomain, ruleDomain, currentUrl) {
    if (!currentDomain || !ruleDomain) return false;

    if (ruleDomain.includes("/")) {
      let pattern = ruleDomain.replace(/\./g, "\\.").replace(/\*/g, ".*");
      if (pattern.endsWith("\\/.*")) {
        pattern = pattern.slice(0, -4) + "(\\/.*)?";
      }

      try {
        const regex = new RegExp(`^https?:\/\/(www\\.)?${pattern}`, "i");
        if (currentUrl && regex.test(currentUrl)) {
          return true;
        }
      } catch (e) {
        console.warn(`[SOTE] Padrão de exclusão inválido: ${ruleDomain}`, e);
        return false;
      }
    }

    const normalizedRuleDomain = normalizeDomain(ruleDomain);

    if (currentDomain === normalizedRuleDomain) {
      return true;
    }
    if (normalizedRuleDomain.startsWith(".")) {
      const baseDomain = normalizedRuleDomain.substring(1);
      if (
        currentDomain === baseDomain ||
        currentDomain.endsWith("." + baseDomain)
      ) {
        return true;
      }
    }
    if (currentDomain.endsWith("." + normalizedRuleDomain)) {
      return true;
    }
    if (normalizedRuleDomain.includes("*")) {
      if (isWildcardMatch(currentDomain, normalizedRuleDomain)) {
        return true;
      }
    }
    if (normalizedRuleDomain.startsWith("@")) {
      const baseDomain = normalizedRuleDomain.substring(1);
      if (
        currentDomain === baseDomain &&
        !currentDomain.includes(".", currentDomain.indexOf(baseDomain))
      ) {
        return true;
      }
    }
    return false;
  }

  function isWildcardMatch(domain, pattern) {
    const regexPattern = pattern.replace(/\./g, "\\.").replace(/\*/g, ".*");
    const regex = new RegExp("^" + regexPattern + "$", "i");
    return regex.test(domain);
  }

  function isValidDomainFormat(domain) {
    if (!domain || typeof domain !== "string") return false;
    const normalized = normalizeDomain(domain);
    const domainRegex =
      /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$/;
    return (
      domainRegex.test(normalized) &&
      normalized.length > 0 &&
      normalized.length <= 253
    );
  }

  function extractDomainFromUrl(url) {
    try {
      if (!url) return "";
      if (!url.match(/^https?:\/\//)) {
        url = "http://" + url;
      }
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch (e) {
      console.warn("[SOTE DEBUG] Erro ao extrair domínio da URL:", url, e);
      return normalizeDomain(url);
    }
  }

  // ===== FUNÇÃO PRINCIPAL DE AVALIAÇÃO DE REGRAS (Inalterada) =====
  function evaluateRule(rule, now = new Date()) {
    const currentDay = now.getDay();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentDate = now.getDate();
    const currentMonth = now.getMonth() + 1;
    let conditionMet = false;

    switch (rule.type) {
      case "dayOfWeek":
        conditionMet =
          rule.days &&
          Array.isArray(rule.days) &&
          rule.days.includes(currentDay);
        break;
      case "timeRange":
        if (
          rule.startHour !== undefined &&
          rule.startMinute !== undefined &&
          rule.endHour !== undefined &&
          rule.endMinute !== undefined
        ) {
          const ruleStartTotalMinutes =
            Number(rule.startHour) * 60 + Number(rule.startMinute);
          const ruleEndTotalMinutes =
            Number(rule.endHour) * 60 + Number(rule.endMinute);
          const currentTimeTotalMinutes = currentHour * 60 + currentMinute;
          if (ruleStartTotalMinutes <= ruleEndTotalMinutes) {
            conditionMet =
              currentTimeTotalMinutes >= ruleStartTotalMinutes &&
              currentTimeTotalMinutes <= ruleEndTotalMinutes;
          } else {
            conditionMet =
              currentTimeTotalMinutes >= ruleStartTotalMinutes ||
              currentTimeTotalMinutes <= ruleEndTotalMinutes;
          }
        } else {
          conditionMet = false;
        }
        break;
      case "domain":
        const currentDomain = window.location.hostname;
        const currentUrl = window.location.href;
        conditionMet = validateDomain(rule.domains, currentDomain, currentUrl);
        break;
      case "specialDate":
        if (rule.specialDates && Array.isArray(rule.specialDates)) {
          conditionMet = rule.specialDates.some(
            date =>
              date.month !== undefined &&
              date.day !== undefined &&
              currentMonth === parseInt(date.month, 10) &&
              currentDate === parseInt(date.day, 10)
          );
        } else {
          // Fallback for old rules for robustness
          conditionMet =
            rule.month !== undefined &&
            rule.day !== undefined &&
            currentMonth === parseInt(rule.month, 10) &&
            currentDate === parseInt(rule.day, 10);
        }
        break;
      case "combined":
        if (
          !rule.subConditions ||
          !Array.isArray(rule.subConditions) ||
          rule.subConditions.length === 0
        ) {
          conditionMet = true;
          break;
        }
        if (rule.logicalOperator === "AND") {
          conditionMet = rule.subConditions.every(subRule => {
            const subConditionResult = evaluateRule(
              { type: subRule.conditionType, ...subRule },
              now
            );
            return subRule.negated ? !subConditionResult : subConditionResult;
          });
        } else if (rule.logicalOperator === "OR") {
          conditionMet = rule.subConditions.some(subRule => {
            const subConditionResult = evaluateRule(
              { type: subRule.conditionType, ...subRule },
              now
            );
            return subRule.negated ? !subConditionResult : subConditionResult;
          });
        } else {
          conditionMet = true;
        }
        break;
      default:
        console.warn("[SOTE DEBUG] Tipo de regra desconhecido:", rule.type);
        conditionMet = true;
    }
    return conditionMet;
  }

  function getMatchingExpansion(abbreviationObject, rulesArgument) {
    if (
      !rulesArgument ||
      !Array.isArray(rulesArgument) ||
      rulesArgument.length === 0
    ) {
      return abbreviationObject.expansion;
    }
    const now = new Date();
    const sortedRules = [...rulesArgument].sort(
      (a, b) => (b.priority || 0) - (a.priority || 0)
    );
    const matchingRule = sortedRules.find(rule => {
      if (!rule || typeof rule !== "object") {
        return false;
      }
      return evaluateRule(rule, now);
    });
    if (matchingRule) {
      return matchingRule.expansion;
    } else {
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

  // ===== LÓGICA DE AÇÕES ESPECIAIS (MODIFICADA) =====
  async function processSpecialActions(expansionText, targetElement) {
    let processedText = expansionText;
    let cursorPosition = -1;

    // Etapa 1: Ação interativa $choice
    const choiceRegex = /\$choice\(id=(\d+)\)\$/;
    const choiceMatch = processedText.match(choiceRegex);

    if (choiceMatch) {
      const placeholder = choiceMatch[0];
      const choiceId = parseInt(choiceMatch[1], 10);
      let selectedMessage = "";

      try {
        const choiceConfig = await new Promise((resolve, reject) => {
          if (!chrome.runtime || !chrome.runtime.sendMessage) {
            return reject(
              new Error("O contexto do runtime não está disponível.")
            );
          }
          chrome.runtime.sendMessage(
            {
              type: SOTE_CONSTANTS.MESSAGE_TYPES.GET_CHOICE_CONFIG,
              id: choiceId,
            },
            response => {
              if (chrome.runtime.lastError) {
                return reject(new Error(chrome.runtime.lastError.message));
              }
              if (response && !response.error) {
                resolve(response.data);
              } else {
                reject(
                  new Error(
                    response?.error ||
                      "Falha ao buscar configuração da escolha."
                  )
                );
              }
            }
          );
        });

        if (
          !choiceConfig ||
          !choiceConfig.options ||
          choiceConfig.options.length === 0
        ) {
          throw new Error(
            `Configuração para Escolha ID ${choiceId} é inválida ou vazia.`
          );
        }

        selectedMessage = await SoteChoiceModal.show(
          choiceConfig.options,
          targetElement
        );
      } catch (error) {
        console.warn(
          `[SOTE] Ação de escolha falhou ou foi cancelada: ${error.message}`
        );
        selectedMessage = `[ESCOLHA CANCELADA]`;
      }

      processedText = processedText.replace(placeholder, selectedMessage);
      // Chama recursivamente para processar outras ações na mensagem escolhida
      return processSpecialActions(processedText, targetElement);
    }

    // Etapa 2: Ação $transferencia$
    if (processedText.includes("$transferencia$")) {
      try {
        const clipboardText = await navigator.clipboard.readText();
        processedText = processedText.replace(
          /\$transferencia\$/g,
          clipboardText
        );
      } catch (err) {
        console.error("Falha ao ler da área de transferência:", err);
        processedText = processedText.replace(
          /\$transferencia\$/g,
          "[ERRO_TRANSFERENCIA]"
        );
      }
    }

    // Etapa 3: Ação final $cursor$
    const cursorMarker = "$cursor$";
    const firstCursorIndex = processedText.indexOf(cursorMarker);
    if (firstCursorIndex !== -1) {
      cursorPosition = firstCursorIndex;
      processedText = processedText.replace(/\$cursor\$/g, "");
    }

    // Caso base da recursão: nenhuma ação restante
    return { text: processedText, cursorPosition };
  }

  // ===== FUNÇÕES DE EXPANSÃO (MODIFICADAS) =====
  async function expandAbbreviation(
    element,
    abbreviationText,
    defaultExpansionText,
    rulesArray
  ) {
    const value = element.value;
    const originalCursorPos = element.selectionStart;
    let wordStart = originalCursorPos;
    while (wordStart > 0 && !/\s/.test(value.charAt(wordStart - 1))) {
      wordStart--;
    }
    const word = value.substring(wordStart, originalCursorPos);

    if (matchAbbreviation(word, abbreviationText, false)) {
      const contextualExpansion = getMatchingExpansion(
        {
          abbreviation: abbreviationText,
          expansion: defaultExpansionText,
          rules: rulesArray,
        },
        rulesArray
      );

      // MODIFICADO: Passa o 'element' para processSpecialActions
      const { text: finalExpansionText, cursorPosition: finalCursorOffset } =
        await processSpecialActions(contextualExpansion, element);

      element._lastExpansion = {
        abbreviation: abbreviationText,
        expansion: finalExpansionText,
        originalRawExpansion: contextualExpansion,
        position: { start: wordStart, end: originalCursorPos },
      };

      const newValue =
        value.substring(0, wordStart) +
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
      element.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    }
    return false;
  }

  async function expandAbbreviationInContentEditable(
    abbreviationText,
    defaultExpansionText,
    rulesArray
  ) {
    const selection = window.getSelection();
    if (!selection.rangeCount) return false;
    const range = selection.getRangeAt(0).cloneRange();
    if (!range.startContainer.textContent) return false;

    let editableElementHost = range.startContainer;
    while (
      editableElementHost &&
      editableElementHost.nodeType !== Node.ELEMENT_NODE
    ) {
      editableElementHost = editableElementHost.parentNode;
    }
    if (!editableElementHost) editableElementHost = document.body;

    const text = range.startContainer.textContent;
    const originalCursorPosInNode = range.startOffset;
    let wordStartInNode = originalCursorPosInNode;
    while (
      wordStartInNode > 0 &&
      !/\s/.test(text.charAt(wordStartInNode - 1))
    ) {
      wordStartInNode--;
    }
    const word = text.substring(wordStartInNode, originalCursorPosInNode);

    if (matchAbbreviation(word, abbreviationText, false)) {
      const contextualExpansion = getMatchingExpansion(
        {
          abbreviation: abbreviationText,
          expansion: defaultExpansionText,
          rules: rulesArray,
        },
        rulesArray
      );

      // MODIFICADO: Passa 'editableElementHost' para processSpecialActions
      const { text: finalExpansionText, cursorPosition: finalCursorOffset } =
        await processSpecialActions(contextualExpansion, editableElementHost);

      const wordRange = document.createRange();
      try {
        wordRange.setStart(range.startContainer, wordStartInNode);
        wordRange.setEnd(range.startContainer, originalCursorPosInNode);
      } catch (e) {
        console.error("Erro ao definir wordRange:", e, {
          startContainer: range.startContainer,
          wordStartInNode,
          originalCursorPosInNode,
        });
        return false;
      }

      editableElementHost._lastExpansion = {
        abbreviation: abbreviationText,
        expansion: finalExpansionText,
        originalRawExpansion: contextualExpansion,
        savedRangePath: {
          startContainerPath: getNodePath(range.startContainer),
          startOffset: wordStartInNode,
          endContainerPath: getNodePath(range.startContainer),
          endOffset: originalCursorPosInNode,
        },
        rawRange: range,
      };

      wordRange.deleteContents();
      const textNode = document.createTextNode(finalExpansionText);
      wordRange.insertNode(textNode);
      selection.removeAllRanges();

      const newRange = document.createRange();
      if (finalCursorOffset !== -1) {
        const safeCursorOffset = Math.min(finalCursorOffset, textNode.length);
        newRange.setStart(textNode, safeCursorOffset);
      } else {
        newRange.setStartAfter(textNode);
      }

      newRange.collapse(true);
      selection.addRange(newRange);

      let editableElement = range.startContainer;
      while (editableElement && !editableElement.isContentEditable) {
        editableElement = editableElement.parentNode;
      }
      if (editableElement && editableElement.isContentEditable) {
        editableElement.dispatchEvent(
          new Event("input", { bubbles: true, composed: true })
        );
      }
      return true;
    }
    return false;
  }

  // ===== FUNÇÕES DE APOIO (Inalteradas) =====
  function getNodePath(node) {
    const path = [];
    while (node && node.parentNode) {
      let index = 0;
      let sibling = node.previousSibling;
      while (sibling) {
        if (
          sibling.nodeType === node.nodeType &&
          sibling.nodeName === node.nodeName
        ) {
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
    const newValue =
      element.value.substring(0, start) +
      abbreviation +
      element.value.substring(start + currentExpansionLength);
    element.value = newValue;
    const newCursorPos = start + abbreviation.length;
    element.setSelectionRange(newCursorPos, newCursorPos);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element._lastExpansion = null;
    return true;
  }

  function undoExpansionInContentEditable(element) {
    if (!element || !element._lastExpansion) return false;
    const { abbreviation, rawRange: savedRangeBeforeExpansion } =
      element._lastExpansion;
    const selection = window.getSelection();
    if (!selection || !savedRangeBeforeExpansion) {
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
      if (editableGrandParent && editableGrandParent.isContentEditable) {
        editableGrandParent.dispatchEvent(
          new Event("input", { bubbles: true, composed: true })
        );
      } else {
        let parent = savedRangeBeforeExpansion.commonAncestorContainer;
        while (parent && !parent.isContentEditable) {
          parent = parent.parentNode;
        }
        if (parent && parent.isContentEditable) {
          parent.dispatchEvent(
            new Event("input", { bubbles: true, composed: true })
          );
        }
      }
    } catch (e) {
      console.error(
        "[SOTE DEBUG] Erro durante undoExpansionInContentEditable:",
        e
      );
      element._lastExpansion = null;
      return false;
    }
    element._lastExpansion = null;
    return true;
  }

  function testDomainMatching(testCases) {
    console.log("[SOTE DEBUG] Iniciando testes de correspondência de domínios");
    testCases.forEach((testCase, index) => {
      const { currentDomain, ruleDomains, expected, description } = testCase;
      const result = validateDomain(ruleDomains, currentDomain);
      const passed = result === expected;
      console.log(`[SOTE DEBUG] Teste ${index + 1}: ${description}`);
      console.log(`  Domínio atual: ${currentDomain}`);
      console.log(`  Regra: ${JSON.stringify(ruleDomains)}`);
      console.log(`  Esperado: ${expected}, Obtido: ${result}`);
      console.log(`  Status: ${passed ? "PASSOU" : "FALHOU"}`);
      console.log("---");
    });
  }

  async function replaceTextAtCursorWithExpansion(
    element,
    wordStart,
    currentCursorPos,
    finalExpansionText,
    finalCursorOffset
  ) {
    if (!element) return false;
    let newCursorPos;
    if (element.isContentEditable) {
      const selection = window.getSelection();
      if (!selection.rangeCount) {
        return false;
      }
      const range = selection.getRangeAt(0);
      const wordRange = document.createRange();
      try {
        wordRange.setStart(range.startContainer, wordStart);
        wordRange.setEnd(range.startContainer, currentCursorPos);
      } catch (e) {
        return false;
      }
      wordRange.deleteContents();
      const textNode = document.createTextNode(finalExpansionText);
      wordRange.insertNode(textNode);
      selection.removeAllRanges();
      const newRange = document.createRange();
      if (finalCursorOffset !== -1) {
        const safeCursorOffset = Math.min(finalCursorOffset, textNode.length);
        newRange.setStart(textNode, safeCursorOffset);
      } else {
        newRange.setStartAfter(textNode);
      }
      newRange.collapse(true);
      selection.addRange(newRange);
      let editableElementHost = element;
      while (editableElementHost && !editableElementHost.isContentEditable) {
        editableElementHost = editableElementHost.parentNode;
      }
      if (editableElementHost && editableElementHost.isContentEditable) {
        editableElementHost.dispatchEvent(
          new Event("input", { bubbles: true, composed: true })
        );
      }
      return true;
    } else {
      const value = element.value;
      const newValue =
        value.substring(0, wordStart) +
        finalExpansionText +
        value.substring(currentCursorPos);
      element.value = newValue;
      if (finalCursorOffset !== -1) {
        newCursorPos = wordStart + finalCursorOffset;
      } else {
        newCursorPos = wordStart + finalExpansionText.length;
      }
      element.setSelectionRange(newCursorPos, newCursorPos);
      element.dispatchEvent(new Event("input", { bubbles: true }));
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
    replaceTextAtCursorWithExpansion,
  };

  window.DomainValidator = {
    validateDomain,
    normalizeDomain,
    isDomainMatch,
    isWildcardMatch,
    isValidDomainFormat,
    extractDomainFromUrl,
    testDomainMatching,
  };
})(window);
