// SOTE-main/content/content-script.js
(function () {
  "use strict";
  console.log(
    "[SOTE DEBUG] content/content-script.js SCRIPT CARREGADO em:",
    new Date().toLocaleTimeString()
  );

  let abbreviationsCache = [];
  let isEnabled = true;
  let settings = {
    // Default settings
    triggerSpace: true,
    triggerTab: true,
    triggerEnter: true,
    enableUndo: true,
    autocompleteEnabled: true,
    autocompleteMinChars: 2,
    autocompleteMaxSuggestions: 5,
    exclusionList: [], // Lista de exclusão
  };

  const TRIGGER_KEYS_MAP = {
    // Mapeamento de códigos de tecla para nomes de gatilho
    Space: "triggerSpace",
    Tab: "triggerTab",
    Enter: "triggerEnter",
  };

  /**
   * Verifica se a expansão deve ser pulada com base no elemento ou domínio atual.
   * @param {HTMLElement} element - O elemento de texto ativo.
   * @returns {boolean} - True se a expansão deve ser ignorada, false caso contrário.
   */
  function isExpansionExcluded(element) {
    if (!element) return true;

    // Regra fixa: sempre ignorar campos de senha.
    if (element.type === "password") {
      return true;
    }

    const exclusionItems = settings.exclusionList || [];
    if (exclusionItems.length === 0) {
      return false;
    }

    const currentHostname = window.location.hostname;
    const currentUrl = window.location.href;

    // Expressão regular corrigida para não classificar domínios como seletores.
    // Procura por caracteres que são quase exclusivos de seletores CSS.
    const selectorChars = /[#[:> ]/;

    for (const item of exclusionItems) {
      if (selectorChars.test(item)) {
        // Trata o item como um seletor CSS
        try {
          if (element.matches(item)) {
            // console.log(`[SOTE] Expansão EXCLUÍDA pelo seletor: ${item}`);
            return true;
          }
        } catch (e) {
          /* Ignora seletores inválidos */
        }
      } else {
        // Trata o item como um padrão de domínio/URL
        if (
          DomainValidator.validateDomain([item], currentHostname, currentUrl)
        ) {
          // console.log(`[SOTE] Expansão EXCLUÍDA pela regra de domínio/URL: ${item}`);
          return true;
        }
      }
    }

    return false; // Nenhuma regra de exclusão foi correspondida.
  }

  function loadSettings() {
    chrome.storage.sync.get(
      [
        "triggerSpace",
        "triggerTab",
        "triggerEnter",
        "enableUndo",
        "exclusionList",
        "autocompleteEnabled",
        "autocompleteMinChars",
        "autocompleteMaxSuggestions",
      ],
      result => {
        settings.triggerSpace = result.triggerSpace !== false;
        settings.triggerTab = result.triggerTab !== false;
        settings.triggerEnter = result.triggerEnter !== false;
        settings.enableUndo = result.enableUndo !== false;
        settings.exclusionList = result.exclusionList || [];
        settings.autocompleteEnabled = result.autocompleteEnabled !== false;
        settings.autocompleteMinChars = result.autocompleteMinChars || 2;
        settings.autocompleteMaxSuggestions =
          result.autocompleteMaxSuggestions || 5;

        updateAutocompleteSettings();
      }
    );
  }

  function updateAutocompleteSettings() {
    if (window.SoteAutocomplete && window.SoteAutocomplete.getInstance()) {
      const autocomplete = window.SoteAutocomplete.getInstance();
      if (settings.autocompleteEnabled) {
        autocomplete.enable();
      } else {
        autocomplete.disable();
      }
      autocomplete.setMinChars(settings.autocompleteMinChars);
      autocomplete.setMaxSuggestions(settings.autocompleteMaxSuggestions);
    }
  }

  function fetchAbbreviations() {
    if (!chrome.runtime || !chrome.runtime.sendMessage) {
      console.error(
        "SOTE content-script: chrome.runtime.sendMessage não está disponível."
      );
      abbreviationsCache = [];
      return;
    }
    try {
      chrome.runtime.sendMessage(
        { type: window.SOTE_CONSTANTS.MESSAGE_TYPES.GET_ABBREVIATIONS },
        response => {
          if (chrome.runtime.lastError) {
            console.error(
              "[SOTE DEBUG content-script] Erro em fetchAbbreviations sendMessage:",
              chrome.runtime.lastError.message
            );
            abbreviationsCache = [];
            return;
          }
          if (response && response.abbreviations) {
            abbreviationsCache = response.abbreviations.filter(
              abbr => abbr.enabled
            );
          } else if (response && response.error) {
            console.error(
              "[SOTE DEBUG content-script] Falha ao buscar abreviações do service worker:",
              response.error
            );
            abbreviationsCache = [];
          } else {
            abbreviationsCache = [];
          }
        }
      );
    } catch (e) {
      console.error(
        "[SOTE DEBUG content-script] Exceção durante sendMessage em fetchAbbreviations:",
        e
      );
      abbreviationsCache = [];
    }
  }

  async function handleKeyDown(event) {
    if (!isEnabled || !event.target) return;

    const element = event.target;

    // VERIFICAÇÃO DA LISTA DE EXCLUSÃO
    if (isExpansionExcluded(element)) {
      return; // Aborta se o elemento ou domínio estiver na lista de exclusão.
    }

    const isEditableField =
      element.isContentEditable ||
      element.tagName === "INPUT" ||
      element.tagName === "TEXTAREA";

    if (!isEditableField) return;

    const triggerNameFromKey = TRIGGER_KEYS_MAP[event.key];
    const triggerNameFromCode = TRIGGER_KEYS_MAP[event.code]; // Fallback for some keys like Space
    const triggerName = triggerNameFromKey || triggerNameFromCode;

    if (event.key === "Backspace" && settings.enableUndo) {
      if (element._lastExpansion) {
        handleBackspaceUndo(event);
        return;
      }
      return;
    }

    if (!triggerName || !settings[triggerName]) {
      return;
    }

    let text = "";
    let cursorPosition = 0;

    if (element.isContentEditable) {
      const selection = window.getSelection();
      if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        text = range.startContainer.textContent || "";
        cursorPosition = range.startOffset;
      } else {
        return;
      }
    } else {
      text = element.value;
      cursorPosition = element.selectionStart;
    }

    let wordStart = cursorPosition;
    let tempPos = cursorPosition - 1;
    while (tempPos >= 0 && /\s/.test(text.charAt(tempPos))) {
      tempPos--;
    }
    wordStart = tempPos + 1;

    while (wordStart > 0 && !/\s/.test(text.charAt(wordStart - 1))) {
      wordStart--;
    }
    const word = text.substring(wordStart, cursorPosition);

    if (!word) return;

    for (const abbr of abbreviationsCache) {
      if (
        typeof TextExpander === "undefined" ||
        typeof TextExpander.matchAbbreviation !== "function"
      ) {
        console.error(
          "[SOTE DEBUG content-script] TextExpander.matchAbbreviation não está definido!"
        );
        return;
      }

      if (
        TextExpander.matchAbbreviation(
          word,
          abbr.abbreviation,
          abbr.caseSensitive
        )
      ) {
        event.preventDefault();
        let expanded = false;
        const rulesToPass = Array.isArray(abbr.rules) ? abbr.rules : [];

        if (element.isContentEditable) {
          expanded = await TextExpander.expandAbbreviationInContentEditable(
            abbr.abbreviation,
            abbr.expansion,
            rulesToPass
          );
        } else {
          expanded = await TextExpander.expandAbbreviation(
            element,
            abbr.abbreviation,
            abbr.expansion,
            rulesToPass
          );
        }

        if (expanded) {
          if (event.key === " " && settings.triggerSpace) {
            if (element.isContentEditable) {
              const selection = window.getSelection();
              if (selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                const spaceNode = document.createTextNode(" ");
                range.insertNode(spaceNode);
                range.setStartAfter(spaceNode);
                range.collapse(true);
                selection.removeAllRanges();
                selection.addRange(range);
                let editableElement = element;
                while (editableElement && !editableElement.isContentEditable) {
                  editableElement = editableElement.parentNode;
                }
                if (editableElement && editableElement.isContentEditable) {
                  editableElement.dispatchEvent(
                    new Event("input", { bubbles: true, composed: true })
                  );
                }
              }
            } else {
              const currentPos = element.selectionStart;
              const valueBeforeCursor = element.value.substring(0, currentPos);
              const valueAfterCursor = element.value.substring(currentPos);
              element.value = valueBeforeCursor + " " + valueAfterCursor;
              element.setSelectionRange(currentPos + 1, currentPos + 1);
              element.dispatchEvent(new Event("input", { bubbles: true }));
            }
          }

          if (chrome.runtime && chrome.runtime.sendMessage) {
            chrome.runtime.sendMessage(
              {
                type: window.SOTE_CONSTANTS.MESSAGE_TYPES.UPDATE_USAGE,
                abbreviation: abbr.abbreviation,
              },
              response => {
                if (chrome.runtime.lastError) {
                }
              }
            );
          }
          break;
        }
      }
    }
  }

  function handleBackspaceUndo(event) {
    const element = event.target;
    if (!element || !element._lastExpansion) return;

    event.preventDefault();

    if (element.isContentEditable) {
      TextExpander.undoExpansionInContentEditable(element);
    } else {
      TextExpander.undoExpansion(element);
    }
  }

  function init() {
    loadSettings();
    fetchAbbreviations();
    document.addEventListener("keydown", handleKeyDown, true);

    setTimeout(() => {
      if (window.SoteAutocomplete) {
        window.SoteAutocomplete.init();
        updateAutocompleteSettings();
      }
    }, 100);

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (
        message.type ===
          window.SOTE_CONSTANTS.MESSAGE_TYPES.ABBREVIATIONS_UPDATED ||
        message.type ===
          window.SOTE_CONSTANTS.MESSAGE_TYPES.INITIAL_SEED_COMPLETE
      ) {
        fetchAbbreviations();
      } else if (
        message.type === window.SOTE_CONSTANTS.MESSAGE_TYPES.TOGGLE_ENABLED
      ) {
        isEnabled = message.enabled;
      } else if (
        message.type === window.SOTE_CONSTANTS.MESSAGE_TYPES.SETTINGS_UPDATED
      ) {
        settings = { ...settings, ...message.settings };
        updateAutocompleteSettings();
      }
      return false;
    });

    observeShadowDom();
  }

  function observeShadowDom() {
    const observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        if (mutation.type === "childList") {
          for (const node of mutation.addedNodes) {
            if (node instanceof Element) {
              if (node.shadowRoot) {
                attachShadowListeners(node.shadowRoot);
              }
              const shadowElements = node.querySelectorAll("*");
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
      subtree: true,
    });
    const shadowElements = document.querySelectorAll("*");
    for (const element of shadowElements) {
      if (element.shadowRoot) {
        attachShadowListeners(element.shadowRoot);
      }
    }
  }

  function attachShadowListeners(shadowRoot) {
    shadowRoot.addEventListener("keydown", handleKeyDown, true);
    const observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        if (mutation.type === "childList") {
          for (const node of mutation.addedNodes) {
            if (node instanceof Element) {
              if (node.shadowRoot) {
                attachShadowListeners(node.shadowRoot);
              }
              const shadowElements = node.querySelectorAll("*");
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
      subtree: true,
    });
  }

  init();
})();
