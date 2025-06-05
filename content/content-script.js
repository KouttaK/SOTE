// SOTE-main/content/content-script.js
(function() {
  'use strict';
  console.log('[SOTE DEBUG] content/content-script.js SCRIPT CARREGADO em:', new Date().toLocaleTimeString());

  let abbreviationsCache = [];
  let isEnabled = true;
  let settings = { // Default settings
    triggerSpace: true,
    triggerTab: true,
    triggerEnter: true,
    enableUndo: true
  };


  const TRIGGER_KEYS_MAP = { // Mapeamento de códigos de tecla para nomes de gatilho
    Space: 'triggerSpace',
    Tab: 'triggerTab',
    Enter: 'triggerEnter'
  };

  // Character to insert for trigger keys is handled by the browser / OS default behavior or by $cursor$ action
  // const TRIGGER_CHARS = {
  //     triggerSpace: ' ',
  //     triggerTab: '\t',
  //     triggerEnter: '\n'
  // };


  function loadSettings() {
    chrome.storage.sync.get(['triggerSpace', 'triggerTab', 'triggerEnter', 'enableUndo'], (result) => {
      settings.triggerSpace = result.triggerSpace !== false;
      settings.triggerTab = result.triggerTab !== false; 
      settings.triggerEnter = result.triggerEnter !== false;
      settings.enableUndo = result.enableUndo !== false;
      // console.log('[SOTE DEBUG content-script] Configurações carregadas:', settings);
    });
  }


  function fetchAbbreviations() {
    if (!chrome.runtime || !chrome.runtime.sendMessage) {
      console.error("SOTE content-script: chrome.runtime.sendMessage não está disponível.");
      abbreviationsCache = [];
      return;
    }
    try {
      // console.log('[SOTE DEBUG content-script] Solicitando abreviações ao service worker...');
      chrome.runtime.sendMessage({ type: 'GET_ABBREVIATIONS' }, response => {
        if (chrome.runtime.lastError) {
          console.error("[SOTE DEBUG content-script] Erro em fetchAbbreviations sendMessage:", chrome.runtime.lastError.message);
          abbreviationsCache = [];
          return;
        }
        if (response && response.abbreviations) {
          try {
            // console.log('[SOTE DEBUG content-script] Abreviações recebidas do service worker (antes do filter):', JSON.parse(JSON.stringify(response.abbreviations)));
          } catch (e) {
            // console.warn('[SOTE DEBUG content-script] Não foi possível fazer stringify da resposta de abreviações:', response.abbreviations, e);
          }
          abbreviationsCache = response.abbreviations.filter(abbr => abbr.enabled);
          // console.log(`[SOTE DEBUG content-script] Carregadas ${abbreviationsCache.length} abreviações habilitadas no cache.`);
        } else if (response && response.error) {
            console.error("[SOTE DEBUG content-script] Falha ao buscar abreviações do service worker:", response.error);
            abbreviationsCache = [];
        } else {
          // console.warn("[SOTE DEBUG content-script] Nenhuma resposta válida ou sem abreviações de GET_ABBREVIATIONS");
          abbreviationsCache = [];
        }
      });
    } catch (e) {
      console.error("[SOTE DEBUG content-script] Exceção durante sendMessage em fetchAbbreviations:", e);
      abbreviationsCache = [];
    }
  }

  async function handleKeyDown(event) { 
    if (!isEnabled || !event.target) return;

    const element = event.target;
    const isEditableField = element.isContentEditable ||
                            element.tagName === 'INPUT' ||
                            element.tagName === 'TEXTAREA';

    if (!isEditableField) return;

    const triggerNameFromKey = TRIGGER_KEYS_MAP[event.key];
    const triggerNameFromCode = TRIGGER_KEYS_MAP[event.code]; // Fallback for some keys like Space
    const triggerName = triggerNameFromKey || triggerNameFromCode;


    if (event.key === 'Backspace' && settings.enableUndo) {
       // Potencialmente chamar handleBackspaceUndo apenas se _lastExpansion existir
       if (element._lastExpansion) {
           handleBackspaceUndo(event); // handleBackspaceUndo já previne o default
           return; // Backspace processado, não continua para expansão
       }
       // Se não há _lastExpansion, deixa o backspace funcionar normalmente
       return;
    }
    
    // Se não for um gatilho ativo, ou se a tecla não for um gatilho, não faz nada para expansão.
    if (!triggerName || !settings[triggerName]) {
        return;
    }


    let text = '';
    let cursorPosition = 0;

    if (element.isContentEditable) {
      const selection = window.getSelection();
      if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        text = range.startContainer.textContent || '';
        cursorPosition = range.startOffset;
      } else { return; } 
    } else { 
      text = element.value;
      cursorPosition = element.selectionStart;
    }

    let wordStart = cursorPosition;
    // Ajuste para encontrar o início da palavra corretamente mesmo se houver múltiplos espaços antes
    let tempPos = cursorPosition -1;
    while(tempPos >= 0 && /\s/.test(text.charAt(tempPos))) {
        tempPos--;
    }
    wordStart = tempPos + 1; // Início do não-espaço

    // Agora, a partir desse não-espaço, volte até encontrar um espaço ou o início da string
    while (wordStart > 0 && !/\s/.test(text.charAt(wordStart - 1))) {
      wordStart--;
    }
    const word = text.substring(wordStart, cursorPosition);

    if (!word) return;

    for (const abbr of abbreviationsCache) {
      if (typeof TextExpander === 'undefined' || typeof TextExpander.matchAbbreviation !== 'function') {
        console.error('[SOTE DEBUG content-script] TextExpander.matchAbbreviation não está definido!');
        return;
      }

      if (TextExpander.matchAbbreviation(word, abbr.abbreviation, abbr.caseSensitive)) {
        event.preventDefault(); 
        let expanded = false;
        const rulesToPass = Array.isArray(abbr.rules) ? abbr.rules : [];

        if (element.isContentEditable) {
          expanded = await TextExpander.expandAbbreviationInContentEditable(abbr.abbreviation, abbr.expansion, rulesToPass);
        } else {
          expanded = await TextExpander.expandAbbreviation(element, abbr.abbreviation, abbr.expansion, rulesToPass);
        }

        if (expanded) {
          if (chrome.runtime && chrome.runtime.sendMessage) {
            chrome.runtime.sendMessage({
              type: 'UPDATE_USAGE',
              abbreviation: abbr.abbreviation
            }, response => {
                if (chrome.runtime.lastError) {
                    // console.warn("[SOTE DEBUG content-script] Erro ao enviar UPDATE_USAGE:", chrome.runtime.lastError.message);
                }
            });
          }
          break; 
        }
      }
    }
  }

  function handleBackspaceUndo(event) {
    const element = event.target;
    // A verificação de element._lastExpansion já está no chamador (handleKeyDown)
    // mas uma dupla verificação não faz mal.
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
    document.addEventListener('keydown', handleKeyDown, true); 

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'ABBREVIATIONS_UPDATED' || message.type === 'INITIAL_SEED_COMPLETE') {
        // console.log('[SOTE DEBUG content-script] Recebido ABBREVIATIONS_UPDATED/INITIAL_SEED_COMPLETE, buscando novamente...');
        fetchAbbreviations();
      } else if (message.type === 'TOGGLE_ENABLED') {
        // console.log('[SOTE DEBUG content-script] Recebido TOGGLE_ENABLED, novo estado:', message.enabled);
        isEnabled = message.enabled;
      } else if (message.type === 'SETTINGS_UPDATED') {
        // console.log('[SOTE DEBUG content-script] Recebido SETTINGS_UPDATED, recarregando configurações...');
        settings = { ...settings, ...message.settings };
      }
      return false; // Não estamos usando sendResponse aqui.
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