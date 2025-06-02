// Utility functions for text expansion
(function(window) {
  'use strict';
  
  function matchAbbreviation(text, abbreviation, caseSensitive) {
    if (!text || !abbreviation) return false;
    
    if (caseSensitive) {
      return text === abbreviation;
    } else {
      return text.toLowerCase() === abbreviation.toLowerCase();
    }
  }

  function expandAbbreviation(element, abbreviation, expansion) {
    const value = element.value;
    const cursorPos = element.selectionStart;
    
    // Find the start of the current word
    let wordStart = cursorPos;
    while (wordStart > 0 && !/\s/.test(value.charAt(wordStart - 1))) {
      wordStart--;
    }
    
    const word = value.substring(wordStart, cursorPos);
    
    if (matchAbbreviation(word, abbreviation, false)) {
      // Store the original text for undo functionality
      element._lastExpansion = {
        abbreviation,
        expansion,
        position: { start: wordStart, end: cursorPos }
      };
      
      // Replace the abbreviation with the expansion
      const newValue = value.substring(0, wordStart) + 
                      expansion + 
                      value.substring(cursorPos);
      
      element.value = newValue;
      
      // Move the cursor to the end of the expansion
      const newCursorPos = wordStart + expansion.length;
      element.setSelectionRange(newCursorPos, newCursorPos);
      
      // Trigger input event
      element.dispatchEvent(new Event('input', { bubbles: true }));
      
      return true;
    }
    
    return false;
  }

  function expandAbbreviationInContentEditable(abbreviation, expansion) {
    const selection = window.getSelection();
    if (!selection.rangeCount) return false;
    
    const range = selection.getRangeAt(0);
    const text = range.startContainer.textContent;
    const cursorPos = range.startOffset;
    
    // Find the start of the current word
    let wordStart = cursorPos;
    while (wordStart > 0 && !/\s/.test(text.charAt(wordStart - 1))) {
      wordStart--;
    }
    
    const word = text.substring(wordStart, cursorPos);
    
    if (matchAbbreviation(word, abbreviation, false)) {
      // Create a range for the word to replace
      const wordRange = document.createRange();
      wordRange.setStart(range.startContainer, wordStart);
      wordRange.setEnd(range.startContainer, cursorPos);
      
      // Store for undo
      range.startContainer._lastExpansion = {
        abbreviation,
        expansion,
        range: wordRange.cloneRange()
      };
      
      // Replace content
      wordRange.deleteContents();
      const textNode = document.createTextNode(expansion);
      wordRange.insertNode(textNode);
      
      // Move cursor to end
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
    undoExpansionInContentEditable
  };
})(window);
