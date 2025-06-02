// Content script for text expansion functionality
(function() {
  'use strict';

  let abbreviationsCache = [];
  let isEnabled = true;

  const TRIGGER_KEYS = {
    Space: ' ',
    Tab: '\t',
    Enter: '\n'
  };

  function fetchAbbreviations() {
    chrome.runtime.sendMessage({ type: 'GET_ABBREVIATIONS' }, response => {
      if (response && response.abbreviations) {
        abbreviationsCache = response.abbreviations.filter(abbr => abbr.enabled);
        console.log(`Loaded ${abbreviationsCache.length} abbreviations`);
      }
    });
  }

  function handleKeyDown(event) {
    if (!isEnabled || !event.target || (!event.target.isContentEditable && !event.target.value)) {
      return;
    }

    const triggerKey = Object.keys(TRIGGER_KEYS).find(key => event.key === key || event.code === key);
    if (!triggerKey) return;

    const element = event.target;
    let text = '';
    let cursorPosition = 0;

    if (element.isContentEditable) {
      const selection = window.getSelection();
      if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        text = range.startContainer.textContent || '';
        cursorPosition = range.startOffset;
      }
    } else {
      text = element.value;
      cursorPosition = element.selectionStart;
    }

    // Get the word before the cursor
    let wordStart = cursorPosition;
    while (wordStart > 0 && !/\s/.test(text.charAt(wordStart - 1))) {
      wordStart--;
    }
    const word = text.substring(wordStart, cursorPosition);

    // Check for matches
    for (const abbr of abbreviationsCache) {
      if (TextExpander.matchAbbreviation(word, abbr.abbreviation, abbr.caseSensitive)) {
        event.preventDefault();
        let expanded = false;

        if (element.isContentEditable) {
          expanded = TextExpander.expandAbbreviationInContentEditable(abbr.abbreviation, abbr.expansion);
        } else {
          expanded = TextExpander.expandAbbreviation(element, abbr.abbreviation, abbr.expansion);
        }

        if (expanded) {
          // Add the trigger key after expansion
          if (element.isContentEditable) {
            const selection = window.getSelection();
            if (selection.rangeCount > 0) {
              const range = selection.getRangeAt(0);
              const textNode = document.createTextNode(TRIGGER_KEYS[triggerKey]);
              range.insertNode(textNode);
              range.setStartAfter(textNode);
              range.setEndAfter(textNode);
              selection.removeAllRanges();
              selection.addRange(range);
            }
          } else {
            const cursorPos = element.selectionStart;
            const newValue = element.value.substring(0, cursorPos) +
                           TRIGGER_KEYS[triggerKey] +
                           element.value.substring(cursorPos);
            element.value = newValue;
            element.setSelectionRange(cursorPos + 1, cursorPos + 1);
            element.dispatchEvent(new Event('input', { bubbles: true }));
          }

          chrome.runtime.sendMessage({
            type: 'UPDATE_USAGE',
            abbreviation: abbr.abbreviation
          });
          break;
        }
      }
    }
  }

  function init() {
    fetchAbbreviations();
    document.addEventListener('keydown', handleKeyDown, true);
    
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'ABBREVIATIONS_UPDATED') {
        fetchAbbreviations();
        return true;
      }
      
      if (message.type === 'TOGGLE_ENABLED') {
        isEnabled = message.enabled;
        return true;
      }
    });
    
    observeShadowDom();
  }

  function observeShadowDom() {
    const observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          for (const node of mutation.addedNodes) {
            if (node instanceof Element) {
              if (node.shadowRoot) {
                attachShadowListeners(node.shadowRoot);
              }
              
              const shadowElements = node.querySelectorAll('*');
              for (const element of shadowElements) {
                if (element.shadowRoot) {
                  attachShadowListeners(element.shadowRoot);
                }
              }
            }
          }
        }
      }
    });
    
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
    
    const shadowElements = document.querySelectorAll('*');
    for (const element of shadowElements) {
      if (element.shadowRoot) {
        attachShadowListeners(element.shadowRoot);
      }
    }
  }

  function attachShadowListeners(shadowRoot) {
    shadowRoot.addEventListener('keydown', handleKeyDown, true);
    
    const observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          for (const node of mutation.addedNodes) {
            if (node instanceof Element) {
              if (node.shadowRoot) {
                attachShadowListeners(node.shadowRoot);
              }
              
              const shadowElements = node.querySelectorAll('*');
              for (const element of shadowElements) {
                if (element.shadowRoot) {
                  attachShadowListeners(element.shadowRoot);
                }
              }
            }
          }
        }
      }
    });
    
    observer.observe(shadowRoot, {
      childList: true,
      subtree: true
    });
  }

  init();
})();
