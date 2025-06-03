// Utility functions for text expansion
(function(window) {
  'use strict';
  
   function evaluateRule(rule, now = new Date()) { // Added 'now' parameter for testability
    // const now = new Date(); // Original placement
    const currentDay = now.getDay(); // Sunday = 0, Monday = 1, ...
    const currentHour = now.getHours();
    const currentDate = now.getDate(); // Day of the month (1-31)
    const currentMonth = now.getMonth() + 1; // Month (1-12)

    let conditionMet = false;
    switch (rule.type) {
      case 'dayOfWeek':
        conditionMet = rule.days && rule.days.includes(currentDay);
        break;
        
      case 'timeRange':
        conditionMet = rule.startHour !== undefined && rule.endHour !== undefined &&
                       currentHour >= rule.startHour && currentHour <= rule.endHour;
        break;
        
      case 'domain':
        const currentDomain = window.location.hostname;
        conditionMet = rule.domains && rule.domains.some(domain => currentDomain.includes(domain));
        break;

      case 'specialDate': // NOVA REGRA
        conditionMet = rule.month !== undefined && rule.day !== undefined &&
                       currentMonth === parseInt(rule.month, 10) && 
                       currentDate === parseInt(rule.day, 10);
        break;
        
      case 'combined': // LÓGICA ATUALIZADA PARA REGRAS COMBINADAS
        if (!rule.subConditions || rule.subConditions.length === 0) {
          conditionMet = true; // Or false, depending on desired behavior for empty combined rule
          break;
        }
        if (rule.logicalOperator === 'AND') {
          conditionMet = rule.subConditions.every(subRule => {
            // Recursively evaluate the sub-rule
            // Each subRule here is an object like: { conditionType: 'dayOfWeek', days: [1], negated: false, ...other props }
            // We need to transform it slightly to pass to evaluateRule or adapt evaluateRule
            const subConditionResult = evaluateRule({ type: subRule.conditionType, ...subRule }, now);
            return subRule.negated ? !subConditionResult : subConditionResult;
          });
        } else if (rule.logicalOperator === 'OR') {
          conditionMet = rule.subConditions.some(subRule => {
            const subConditionResult = evaluateRule({ type: subRule.conditionType, ...subRule }, now);
            return subRule.negated ? !subConditionResult : subConditionResult;
          });
        } else {
          conditionMet = true; // Default if no valid operator, or could be false
        }
        break;
        
      default:
        conditionMet = true; // If rule type is unknown or not condition-based
    }
    return conditionMet;
  }

  function getMatchingExpansion(abbreviation, rules) {
    if (!rules || rules.length === 0) {
      return abbreviation.expansion;
    }

    const now = new Date(); // Get current time once for all rule evaluations
    const sortedRules = [...rules].sort((a, b) => (b.priority || 0) - (a.priority || 0));

    const matchingRule = sortedRules.find(rule => evaluateRule(rule, now));
    
    return matchingRule ? matchingRule.expansion : abbreviation.expansion;
  }


  function matchAbbreviation(text, abbreviation, caseSensitive) {
    if (!text || !abbreviation) return false;
    
    if (caseSensitive) {
      return text === abbreviation;
    } else {
      return text.toLowerCase() === abbreviation.toLowerCase();
    }
  }

  function expandAbbreviation(element, abbreviation, expansion, rules) {
    const value = element.value;
    const cursorPos = element.selectionStart;
    
    let wordStart = cursorPos;
    while (wordStart > 0 && !/\s/.test(value.charAt(wordStart - 1))) {
      wordStart--;
    }
    
    const word = value.substring(wordStart, cursorPos);
    
    if (matchAbbreviation(word, abbreviation, false)) {
      const contextualExpansion = getMatchingExpansion({ abbreviation, expansion }, rules);
      
      element._lastExpansion = {
        abbreviation,
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

  function expandAbbreviationInContentEditable(abbreviation, expansion, rules) {
    const selection = window.getSelection();
    if (!selection.rangeCount) return false;
    
    const range = selection.getRangeAt(0);
    const text = range.startContainer.textContent;
    const cursorPos = range.startOffset;
    
    let wordStart = cursorPos;
    while (wordStart > 0 && !/\s/.test(text.charAt(wordStart - 1))) {
      wordStart--;
    }
    
    const word = text.substring(wordStart, cursorPos);
    
    if (matchAbbreviation(word, abbreviation, false)) {
      const contextualExpansion = getMatchingExpansion({ abbreviation, expansion }, rules);
      
      const wordRange = document.createRange();
      wordRange.setStart(range.startContainer, wordStart);
      wordRange.setEnd(range.startContainer, cursorPos);
      
      range.startContainer._lastExpansion = {
        abbreviation,
        expansion: contextualExpansion,
        range: wordRange.cloneRange()
      };
      
      wordRange.deleteContents();
      const textNode = document.createTextNode(contextualExpansion);
      wordRange.insertNode(textNode);
      
      const newRange = document.createRange();
      newRange.setStartAfter(textNode);
      newRange.setEndAfter(textNode);
      selection.removeAllRanges();
      selection.addRange(newRange);
      
      return true;
    }
    
    return false;
  }

  function undoExpansion(element) {
    if (!element._lastExpansion) return false;
    
    const { abbreviation, position } = element._lastExpansion;
    const { start } = position;
    const expansionLength = element._lastExpansion.expansion.length;
    
    // Replace the expansion with the original abbreviation
    const newValue = element.value.substring(0, start) + 
                     abbreviation + 
                     element.value.substring(start + expansionLength);
    
    element.value = newValue;
    
    // Move the cursor to the end of the abbreviation
    const newCursorPos = start + abbreviation.length;
    element.setSelectionRange(newCursorPos, newCursorPos);
    
    // Trigger input event
    element.dispatchEvent(new Event('input', { bubbles: true }));
    
    // Clear the last expansion
    element._lastExpansion = null;
    
    return true;
  }

  function undoExpansionInContentEditable(element) {
    if (!element._lastExpansion) return false;
    
    const { abbreviation, range } = element._lastExpansion;
    
    // Create a range from the original position
    const currentRange = range.cloneRange();
    
    // Replace the expansion with the original abbreviation
    currentRange.deleteContents();
    const textNode = document.createTextNode(abbreviation);
    currentRange.insertNode(textNode);
    
    // Move the cursor to the end of the abbreviation
    const selection = window.getSelection();
    const newRange = document.createRange();
    newRange.setStartAfter(textNode);
    newRange.collapse(true);
    selection.removeAllRanges();
    selection.addRange(newRange);
    
    // Clear the last expansion
    element._lastExpansion = null;
    
    return true;
  }

  // Export functions to global scope
  window.TextExpander = {
    matchAbbreviation,
    expandAbbreviation,
    expandAbbreviationInContentEditable,
    undoExpansion,
    undoExpansionInContentEditable,
    evaluateRule, // Make sure this is available if called directly elsewhere
    getMatchingExpansion
  };
})(window);