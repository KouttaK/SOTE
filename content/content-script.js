// SOTE-main/content/content-script.js
(function() {
  'use strict';
  console.log('[SOTE DEBUG] content/content-script.js SCRIPT CARREGADO em:', new Date().toLocaleTimeString());

  let abbreviationsCache = [];
  let isEnabled = true;

  const TRIGGER_KEYS = {
    Space: ' ',
    Tab: '\t',
    Enter: '\n'
  };

  function fetchAbbreviations() {
    if (!chrome.runtime || !chrome.runtime.sendMessage) {
      console.error("SOTE content-script: chrome.runtime.sendMessage não está disponível.");
      abbreviationsCache = []; // Garante que o cache seja limpo se a comunicação falhar
      return;
    }
    try {
      console.log('[SOTE DEBUG content-script] Solicitando abreviações ao service worker...');
      chrome.runtime.sendMessage({ type: 'GET_ABBREVIATIONS' }, response => {
        if (chrome.runtime.lastError) {
          console.error("[SOTE DEBUG content-script] Erro em fetchAbbreviations sendMessage:", chrome.runtime.lastError.message);
          abbreviationsCache = []; 
          return;
        }
        if (response && response.abbreviations) {
          // Log detalhado da resposta completa do service worker
          try {
            console.log('[SOTE DEBUG content-script] Abreviações recebidas do service worker (antes do filter):', JSON.parse(JSON.stringify(response.abbreviations)));
          } catch (e) {
            console.warn('[SOTE DEBUG content-script] Não foi possível fazer stringify da resposta de abreviações:', response.abbreviations, e);
          }
          
          abbreviationsCache = response.abbreviations.filter(abbr => abbr.enabled);
          console.log(`[SOTE DEBUG content-script] Carregadas ${abbreviationsCache.length} abreviações habilitadas no cache.`);

          // Log específico para 'btw' após popular o cache
          const btwFromCache = abbreviationsCache.find(a => a.abbreviation === 'btw');
          if (btwFromCache) {
            console.log('[SOTE DEBUG content-script] "btw" encontrado no cache:', 
                        'Possui rules?', btwFromCache.hasOwnProperty('rules'), 
                        'Tipo de btwFromCache.rules:', typeof btwFromCache.rules,
                        'É btwFromCache.rules um array?', Array.isArray(btwFromCache.rules));
            if (btwFromCache.rules !== undefined) {
                try {
                    console.log('[SOTE DEBUG content-script] Conteúdo de btwFromCache.rules:', JSON.parse(JSON.stringify(btwFromCache.rules)));
                } catch(e) {
                    console.warn('[SOTE DEBUG content-script] Não foi possível fazer stringify de btwFromCache.rules:', btwFromCache.rules, e);
                }
            }
          } else {
            console.log('[SOTE DEBUG content-script] "btw" NÃO encontrado no cache de abreviações habilitadas.');
          }

        } else if (response && response.error) {
            console.error("[SOTE DEBUG content-script] Falha ao buscar abreviações do service worker:", response.error);
            abbreviationsCache = [];
        } else {
          console.warn("[SOTE DEBUG content-script] Nenhuma resposta válida ou sem abreviações de GET_ABBREVIATIONS");
          abbreviationsCache = [];
        }
      });
    } catch (e) {
      console.error("[SOTE DEBUG content-script] Exceção durante sendMessage em fetchAbbreviations:", e);
      abbreviationsCache = [];
    }
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

    let wordStart = cursorPosition;
    while (wordStart > 0 && !/\s/.test(text.charAt(wordStart - 1))) {
      wordStart--;
    }
    const word = text.substring(wordStart, cursorPosition);

    if (!word) return; 

    // console.log('[SOTE DEBUG content-script] Palavra capturada para expansão:', word);

    for (const abbr of abbreviationsCache) {
      if (abbr.abbreviation === word) { // Log apenas para a abreviação que corresponde à palavra digitada
        console.log('[SOTE DEBUG content-script] Verificando abbr do cache que corresponde à palavra digitada:', 
                    abbr.abbreviation, 
                    '| Possui rules?', abbr.hasOwnProperty('rules'), 
                    '| Tipo de abbr.rules:', typeof abbr.rules,
                    '| É abbr.rules um array?', Array.isArray(abbr.rules));
        if (abbr.rules !== undefined) {
            try {
                console.log('[SOTE DEBUG content-script] Conteúdo de abbr.rules para', abbr.abbreviation, ':', JSON.parse(JSON.stringify(abbr.rules)));
            } catch(e) {
                 console.warn('[SOTE DEBUG content-script] Não foi possível fazer stringify de abbr.rules (handleKeyDown):', abbr.rules, e);
            }
        }
      }

      if (typeof TextExpander === 'undefined' || typeof TextExpander.matchAbbreviation !== 'function') {
        console.error('[SOTE DEBUG content-script] TextExpander ou TextExpander.matchAbbreviation não está definido! O script utils/expansion.js pode não ter carregado corretamente.');
        return; 
      }

      if (TextExpander.matchAbbreviation(word, abbr.abbreviation, abbr.caseSensitive)) {
        // console.log('[SOTE DEBUG content-script] Abreviação correspondente encontrada via TextExpander.matchAbbreviation:', abbr.abbreviation);
        event.preventDefault();
        let expanded = false;

        const rulesToPass = Array.isArray(abbr.rules) ? abbr.rules : []; 
        if (!Array.isArray(abbr.rules)) {
            console.warn('[SOTE DEBUG content-script] abbr.rules NÃO era um array para', abbr.abbreviation, `(era ${typeof abbr.rules}). Passando array vazio para TextExpander.`);
        }

        if (element.isContentEditable) {
          expanded = TextExpander.expandAbbreviationInContentEditable(abbr.abbreviation, abbr.expansion, rulesToPass);
        } else {
          expanded = TextExpander.expandAbbreviation(element, abbr.abbreviation, abbr.expansion, rulesToPass);
        }

        if (expanded) {
          // console.log('[SOTE DEBUG content-script] Expansão realizada para', abbr.abbreviation);
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

          if (chrome.runtime && chrome.runtime.sendMessage) {
            chrome.runtime.sendMessage({
              type: 'UPDATE_USAGE',
              abbreviation: abbr.abbreviation
            }, response => { // Adicionado callback para capturar erros
                if (chrome.runtime.lastError) {
                    console.warn("[SOTE DEBUG content-script] Erro ao enviar UPDATE_USAGE:", chrome.runtime.lastError.message);
                }
            });
          }
          break;
        }
      }
    }
  }

  function init() {
    fetchAbbreviations(); 
    document.addEventListener('keydown', handleKeyDown, true);
    
    chrome.runtime.onMessage.addListener((message) => { 
      // console.log('[SOTE DEBUG content-script] Mensagem recebida:', message);
      if (message.type === 'ABBREVIATIONS_UPDATED') {
        console.log('[SOTE DEBUG content-script] Recebido ABBREVIATIONS_UPDATED, buscando novamente...');
        fetchAbbreviations();
        // Não retorne true aqui se não for chamar sendResponse()
      }
      
      if (message.type === 'TOGGLE_ENABLED') {
        console.log('[SOTE DEBUG content-script] Recebido TOGGLE_ENABLED, novo estado:', message.enabled);
        isEnabled = message.enabled;
        // Não retorne true aqui se não for chamar sendResponse()
      }
      // Nenhum 'return true' explícito significa que a porta da mensagem fechará, o que é correto aqui.
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