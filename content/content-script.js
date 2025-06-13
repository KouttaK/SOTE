// SOTE-main/content/content-script.js
(function () {
  "use strict";

  // ===== CONSTANTS =====
  const DEBUG_PREFIX = "[SOTE DEBUG]";
  const SELECTOR_ONLY_CHARS = /[#\[\] >]/;
  const WHITESPACE_REGEX = /\s/;

  const TRIGGER_KEYS_MAP = {
    Space: "triggerSpace",
    Tab: "triggerTab",
    Enter: "triggerEnter",
  };

  const DEFAULT_SETTINGS = {
    triggerSpace: true,
    triggerTab: true,
    triggerEnter: true,
    enableUndo: true,
    ignorePasswordFields: true,
    autocompleteEnabled: true,
    autocompleteMinChars: 2,
    autocompleteMaxSuggestions: 5,
    exclusionList: [],
  };

  // ===== STATE =====
  let abbreviationsCache = [];
  let isEnabled = true;
  let settings = { ...DEFAULT_SETTINGS };
  let debounceTimer = null;
  let shadowObservers = new WeakSet();

  // ===== UTILITY FUNCTIONS =====
  function log(message, ...args) {
    console.log(`${DEBUG_PREFIX} ${message}`, ...args);
  }

  function logError(message, error) {
    console.error(`${DEBUG_PREFIX} ${message}`, error);
  }

  function debounce(func, delay) {
    return function (...args) {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => func.apply(this, args), delay);
    };
  }

  function isEditableElement(element) {
    return (
      element.isContentEditable ||
      element.tagName === "INPUT" ||
      element.tagName === "TEXTAREA"
    );
  }

  function isRuntimeAvailable() {
    return chrome.runtime && chrome.runtime.sendMessage;
  }

  // ===== EXCLUSION LOGIC =====
  /**
   * Verifica se a expansão deve ser excluída baseada no elemento ou domínio atual.
   * Lógica otimizada para diferenciar seletores CSS de padrões de domínio.
   */
  function isExpansionExcluded(element) {
    if (!element) return true;

    // Verificação rápida para campos de senha
    if (settings.ignorePasswordFields && element.type === "password") {
      return true;
    }

    const exclusionItems = settings.exclusionList;
    if (!exclusionItems?.length) return false;

    const currentHostname = window.location.hostname;
    const currentUrl = window.location.href;

    // Cache para evitar recálculos
    if (!isExpansionExcluded._hostnameCache) {
      isExpansionExcluded._hostnameCache = new Map();
    }
    const cache = isExpansionExcluded._hostnameCache;

    for (const item of exclusionItems) {
      const cacheKey = `${item}:${currentHostname}`;

      if (cache.has(cacheKey)) {
        if (cache.get(cacheKey)) return true;
        continue;
      }

      const isCssSelector =
        SELECTOR_ONLY_CHARS.test(item) || item.startsWith(".");
      let isExcluded = false;

      if (isCssSelector) {
        try {
          isExcluded = element.matches(item);
        } catch (e) {
          logError(`Invalid CSS selector in exclusion list: ${item}`, e);
        }
      } else {
        // Verificação de domínio
        if (typeof DomainValidator !== "undefined") {
          isExcluded = DomainValidator.validateDomain(
            [item],
            currentHostname,
            currentUrl
          );
        }
      }

      cache.set(cacheKey, isExcluded);
      if (isExcluded) return true;
    }

    return false;
  }

  // ===== SETTINGS MANAGEMENT =====
  function loadSettings() {
    const settingsKeys = Object.keys(DEFAULT_SETTINGS);

    chrome.storage.sync.get(settingsKeys, result => {
      if (chrome.runtime.lastError) {
        logError("Failed to load settings:", chrome.runtime.lastError);
        return;
      }

      // Merge com valores padrão
      Object.keys(DEFAULT_SETTINGS).forEach(key => {
        settings[key] =
          result[key] !== undefined ? result[key] : DEFAULT_SETTINGS[key];
      });

      updateAutocompleteSettings();
    });
  }

  function updateAutocompleteSettings() {
    if (!window.SoteAutocomplete?.getInstance) return;

    const autocomplete = window.SoteAutocomplete.getInstance();
    if (!autocomplete) return;

    try {
      if (settings.autocompleteEnabled) {
        autocomplete.enable();
      } else {
        autocomplete.disable();
      }

      autocomplete.setMinChars(settings.autocompleteMinChars);
      autocomplete.setMaxSuggestions(settings.autocompleteMaxSuggestions);
    } catch (error) {
      logError("Error updating autocomplete settings:", error);
    }
  }

  // ===== ABBREVIATIONS MANAGEMENT =====
  function fetchAbbreviations() {
    if (!isRuntimeAvailable()) {
      logError("chrome.runtime.sendMessage is not available");
      abbreviationsCache = [];
      return;
    }

    try {
      chrome.runtime.sendMessage(
        { type: window.SOTE_CONSTANTS?.MESSAGE_TYPES?.GET_ABBREVIATIONS },
        response => {
          if (chrome.runtime.lastError) {
            logError(
              "Error in fetchAbbreviations:",
              chrome.runtime.lastError.message
            );
            abbreviationsCache = [];
            return;
          }

          if (response?.abbreviations) {
            abbreviationsCache = response.abbreviations.filter(
              abbr => abbr.enabled
            );
          } else if (response?.error) {
            logError("Failed to fetch abbreviations:", response.error);
            abbreviationsCache = [];
          } else {
            abbreviationsCache = [];
          }
        }
      );
    } catch (error) {
      logError("Exception during fetchAbbreviations:", error);
      abbreviationsCache = [];
    }
  }

  // ===== TEXT EXTRACTION =====
  function getTextAndCursorPosition(element) {
    if (element.isContentEditable) {
      const selection = window.getSelection();
      if (selection.rangeCount === 0) return null;

      const range = selection.getRangeAt(0);
      return {
        text: range.startContainer.textContent || "",
        cursorPosition: range.startOffset,
        range,
      };
    } else {
      return {
        text: element.value,
        cursorPosition: element.selectionStart,
      };
    }
  }

  function findWordAtCursor(text, cursorPosition) {
    if (!text || cursorPosition < 0) return null;

    // Encontrar início da palavra
    let wordStart = cursorPosition;
    let tempPos = cursorPosition - 1;

    // Pular espaços em branco antes do cursor
    while (tempPos >= 0 && WHITESPACE_REGEX.test(text.charAt(tempPos))) {
      tempPos--;
    }
    wordStart = tempPos + 1;

    // Encontrar o verdadeiro início da palavra
    while (
      wordStart > 0 &&
      !WHITESPACE_REGEX.test(text.charAt(wordStart - 1))
    ) {
      wordStart--;
    }

    const word = text.substring(wordStart, cursorPosition);
    return word ? { word, wordStart } : null;
  }

  // ===== EXPANSION LOGIC =====
  async function performExpansion(
    element,
    abbreviation,
    expansion,
    rules,
    event
  ) {
    try {
      let expanded = false;

      if (element.isContentEditable) {
        if (
          typeof TextExpander?.expandAbbreviationInContentEditable ===
          "function"
        ) {
          expanded = await TextExpander.expandAbbreviationInContentEditable(
            abbreviation.abbreviation,
            abbreviation.expansion,
            rules
          );
        }
      } else {
        if (typeof TextExpander?.expandAbbreviation === "function") {
          expanded = await TextExpander.expandAbbreviation(
            element,
            abbreviation.abbreviation,
            abbreviation.expansion,
            rules
          );
        }
      }

      if (expanded) {
        handleSpaceInsertion(element, event);
        updateUsageStats(abbreviation.abbreviation);
        return true;
      }
    } catch (error) {
      logError("Error during expansion:", error);
    }

    return false;
  }

  function handleSpaceInsertion(element, event) {
    if (event.key !== " " || !settings.triggerSpace) return;

    try {
      if (element.isContentEditable) {
        insertSpaceInContentEditable(element);
      } else {
        insertSpaceInInput(element);
      }
    } catch (error) {
      logError("Error inserting space:", error);
    }
  }

  function insertSpaceInContentEditable(element) {
    const selection = window.getSelection();
    if (selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    const spaceNode = document.createTextNode(" ");

    range.insertNode(spaceNode);
    range.setStartAfter(spaceNode);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);

    // Disparar evento de input
    let editableElement = element;
    while (editableElement && !editableElement.isContentEditable) {
      editableElement = editableElement.parentNode;
    }

    if (editableElement?.isContentEditable) {
      editableElement.dispatchEvent(
        new Event("input", { bubbles: true, composed: true })
      );
    }
  }

  function insertSpaceInInput(element) {
    const currentPos = element.selectionStart;
    const valueBeforeCursor = element.value.substring(0, currentPos);
    const valueAfterCursor = element.value.substring(currentPos);

    element.value = valueBeforeCursor + " " + valueAfterCursor;
    element.setSelectionRange(currentPos + 1, currentPos + 1);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function updateUsageStats(abbreviation) {
    if (!isRuntimeAvailable()) return;

    chrome.runtime.sendMessage(
      {
        type: window.SOTE_CONSTANTS?.MESSAGE_TYPES?.UPDATE_USAGE,
        abbreviation: abbreviation,
      },
      response => {
        if (chrome.runtime.lastError) {
          // Silent fail - não é crítico
        }
      }
    );
  }

  // ===== MAIN EVENT HANDLERS =====
  async function handleKeyDown(event) {
    if (!isEnabled || !event.target) return;

    const element = event.target;

    // Verificação de exclusão
    if (isExpansionExcluded(element)) return;

    // Verificação se é campo editável
    if (!isEditableElement(element)) return;

    // Handle backspace undo
    if (event.key === "Backspace" && settings.enableUndo) {
      if (element._lastExpansion) {
        handleBackspaceUndo(event);
      }
      return;
    }

    // Verificar se é uma tecla trigger
    const triggerName =
      TRIGGER_KEYS_MAP[event.key] || TRIGGER_KEYS_MAP[event.code];
    if (!triggerName || !settings[triggerName]) return;

    // Extrair texto e posição do cursor
    const textInfo = getTextAndCursorPosition(element);
    if (!textInfo) return;

    // Encontrar palavra no cursor
    const wordInfo = findWordAtCursor(textInfo.text, textInfo.cursorPosition);
    if (!wordInfo) return;

    // Verificar se há TextExpander disponível
    if (typeof TextExpander?.matchAbbreviation !== "function") {
      logError("TextExpander.matchAbbreviation is not defined!");
      return;
    }

    // Procurar por abreviações correspondentes
    for (const abbr of abbreviationsCache) {
      if (
        TextExpander.matchAbbreviation(
          wordInfo.word,
          abbr.abbreviation,
          abbr.caseSensitive
        )
      ) {
        event.preventDefault();

        const rules = Array.isArray(abbr.rules) ? abbr.rules : [];
        const expanded = await performExpansion(
          element,
          abbr,
          abbr.expansion,
          rules,
          event
        );

        if (expanded) break;
      }
    }
  }

  function handleBackspaceUndo(event) {
    const element = event.target;
    if (!element?._lastExpansion) return;

    event.preventDefault();

    try {
      if (element.isContentEditable) {
        if (
          typeof TextExpander?.undoExpansionInContentEditable === "function"
        ) {
          TextExpander.undoExpansionInContentEditable(element);
        }
      } else {
        if (typeof TextExpander?.undoExpansion === "function") {
          TextExpander.undoExpansion(element);
        }
      }
    } catch (error) {
      logError("Error during undo:", error);
    }
  }

  // ===== SHADOW DOM SUPPORT =====
  function observeShadowDom() {
    const observer = new MutationObserver(
      debounce(mutations => {
        for (const mutation of mutations) {
          if (mutation.type === "childList") {
            for (const node of mutation.addedNodes) {
              if (node instanceof Element) {
                processShadowElements(node);
              }
            }
          }
        }
      }, 100)
    );

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });

    // Processar elementos existentes
    processShadowElements(document.documentElement);
  }

  function processShadowElements(element) {
    if (element.shadowRoot && !shadowObservers.has(element.shadowRoot)) {
      attachShadowListeners(element.shadowRoot);
    }

    const shadowElements = element.querySelectorAll("*");
    for (const shadowElement of shadowElements) {
      if (
        shadowElement.shadowRoot &&
        !shadowObservers.has(shadowElement.shadowRoot)
      ) {
        attachShadowListeners(shadowElement.shadowRoot);
      }
    }
  }

  function attachShadowListeners(shadowRoot) {
    if (shadowObservers.has(shadowRoot)) return;

    shadowObservers.add(shadowRoot);
    shadowRoot.addEventListener("keydown", handleKeyDown, true);

    const observer = new MutationObserver(
      debounce(mutations => {
        for (const mutation of mutations) {
          if (mutation.type === "childList") {
            for (const node of mutation.addedNodes) {
              if (node instanceof Element) {
                processShadowElements(node);
              }
            }
          }
        }
      }, 100)
    );

    observer.observe(shadowRoot, {
      childList: true,
      subtree: true,
    });
  }

  // ===== MESSAGE HANDLING =====
  function setupMessageListeners() {
    if (!isRuntimeAvailable()) return;

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      const messageType = message.type;
      const constants = window.SOTE_CONSTANTS?.MESSAGE_TYPES;

      if (!constants) return false;

      switch (messageType) {
        case constants.ABBREVIATIONS_UPDATED:
        case constants.INITIAL_SEED_COMPLETE:
          fetchAbbreviations();
          break;

        case constants.TOGGLE_ENABLED:
          isEnabled = message.enabled;
          break;

        case constants.SETTINGS_UPDATED:
          settings = { ...settings, ...message.settings };
          updateAutocompleteSettings();
          break;
      }

      return false;
    });
  }

  // ===== INITIALIZATION =====
  function initializeAutocomplete() {
    setTimeout(() => {
      if (window.SoteAutocomplete) {
        try {
          window.SoteAutocomplete.init();
          updateAutocompleteSettings();
        } catch (error) {
          logError("Error initializing autocomplete:", error);
        }
      }
    }, 100);
  }

  function init() {
    log("content-script.js loaded at:", new Date().toLocaleTimeString());

    // Verificar dependências
    if (!window.SOTE_CONSTANTS) {
      logError("SOTE_CONSTANTS not available");
      return;
    }

    try {
      loadSettings();
      fetchAbbreviations();

      // Adicionar event listeners
      document.addEventListener("keydown", handleKeyDown, true);
      setupMessageListeners();

      // Inicializar funcionalidades adicionais
      initializeAutocomplete();
      observeShadowDom();

      log("Initialization complete");
    } catch (error) {
      logError("Error during initialization:", error);
    }
  }

  // ===== CLEANUP =====
  window.addEventListener("beforeunload", () => {
    clearTimeout(debounceTimer);
    if (isExpansionExcluded._hostnameCache) {
      isExpansionExcluded._hostnameCache.clear();
    }
  });

  // Start the extension
  init();
})();
