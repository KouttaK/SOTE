// SOTE-main/utils/autocomplete.js
(function (global) {
  "use strict";

  class AutocompleteManager {
    constructor() {
      this.isEnabled = true;
      this.minCharsToTrigger = 2;
      this.maxSuggestions = 5;
      this.currentElement = null;
      this.currentSuggestions = [];
      this.selectedIndex = -1;
      this.popup = null;
      this.abbreviationsCache = [];
      this.usageStats = new Map();
      this.debounceTimer = null;
      this.debounceDelay = 150;
      this.lastInputTime = 0;

      this.init();
    }

    init() {
      this.createPopup();
      this.loadSettings();
      this.loadUsageStats();

      // Listen for settings changes
      if (
        typeof chrome !== "undefined" &&
        chrome.runtime &&
        chrome.runtime.onMessage
      ) {
        chrome.runtime.onMessage.addListener(message => {
          if (message.type === "SETTINGS_UPDATED") {
            this.loadSettings();
          } else if (message.type === "STATE_UPDATED") {
            this.updateAbbreviationsCache(message.payload);
          }
        });
      }

      this.updateAbbreviationsCache();
    }

    loadSettings() {
      if (typeof chrome !== "undefined" && chrome.storage) {
        chrome.storage.sync.get(
          [
            "autocompleteEnabled",
            "autocompleteMinChars",
            "autocompleteMaxSuggestions",
          ],
          result => {
            this.isEnabled = result.autocompleteEnabled !== false;
            this.minCharsToTrigger = result.autocompleteMinChars || 2;
            this.maxSuggestions = result.autocompleteMaxSuggestions || 5;
          }
        );
      }
    }

    loadUsageStats() {
      if (typeof chrome !== "undefined" && chrome.storage) {
        chrome.storage.local.get(["autocompleteUsageStats"], result => {
          if (result.autocompleteUsageStats) {
            this.usageStats = new Map(
              Object.entries(result.autocompleteUsageStats)
            );
          }
        });
      }
    }

    saveUsageStats() {
      if (typeof chrome !== "undefined" && chrome.storage) {
        const statsObj = Object.fromEntries(this.usageStats);
        chrome.storage.local.set({ autocompleteUsageStats: statsObj });
      }
    }

    updateAbbreviationsCache(statePayload = null) {
      if (statePayload && statePayload.abbreviations) {
        // Usar dados do cache do StateManager
        this.abbreviationsCache = statePayload.abbreviations.filter(
          abbr => abbr.enabled
        );
        console.log(
          "[Autocomplete] Cache atualizado via STATE_UPDATED:",
          this.abbreviationsCache.length,
          "abreviações"
        );
        return;
      }

      // Fallback para buscar diretamente
      if (
        typeof chrome !== "undefined" &&
        chrome.runtime &&
        chrome.runtime.sendMessage
      ) {
        chrome.runtime.sendMessage(
          {
            type: SOTE_CONSTANTS.MESSAGE_TYPES.GET_STATE,
          },
          response => {
            if (response && response.abbreviations) {
              this.abbreviationsCache = response.abbreviations.filter(
                abbr => abbr.enabled
              );
              console.log(
                "[Autocomplete] Cache atualizado via GET_STATE:",
                this.abbreviationsCache.length,
                "abreviações"
              );
            }
          }
        );
      }
    }

    createPopup() {
      // Remove existing popup if any
      const existingPopup = document.querySelector(".sote-autocomplete-popup");
      if (existingPopup) {
        existingPopup.remove();
      }

      this.popup = document.createElement("div");
      this.popup.className = "sote-autocomplete-popup";

      // Load CSS if not already loaded
      if (!document.querySelector("#sote-autocomplete-styles")) {
        const link = document.createElement("link");
        link.id = "sote-autocomplete-styles";
        link.rel = "stylesheet";
        link.href = chrome.runtime.getURL("utils/autocomplete.css");
        document.head.appendChild(link);
      }

      document.body.appendChild(this.popup);

      this.popup.addEventListener("mousedown", e => {
        e.preventDefault(); // Prevents input field from losing focus
      });
    }

    attachToElement(element) {
      if (!this.isEnabled) return;

      const isEditableField =
        element.isContentEditable ||
        element.tagName === "INPUT" ||
        element.tagName === "TEXTAREA";

      if (!isEditableField) return;

      // Avoid duplicate listeners
      if (element.hasAttribute("data-sote-autocomplete")) return;
      element.setAttribute("data-sote-autocomplete", "true");

      element.addEventListener("input", e => this.handleInput(e));
      element.addEventListener("keydown", e => this.handleKeyDown(e));
      element.addEventListener("blur", () => this.hidePopup());
      element.addEventListener("focus", () => (this.currentElement = element));
    }

    handleInput(event) {
      if (!this.isEnabled) return;

      this.currentElement = event.target;
      this.lastInputTime = Date.now();

      clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => {
        if (Date.now() - this.lastInputTime >= this.debounceDelay - 50) {
          this.checkForSuggestions();
        }
      }, this.debounceDelay);
    }

    handleKeyDown(event) {
      if (!this.popup || this.popup.style.display === "none") return;

      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          this.selectNext();
          break;
        case "ArrowUp":
          event.preventDefault();
          this.selectPrevious();
          break;
        case "Tab":
        case "Enter":
          if (this.selectedIndex >= 0) {
            event.preventDefault();
            this.acceptSuggestion(this.currentSuggestions[this.selectedIndex]);
          }
          break;
        case "Escape":
          this.hidePopup();
          break;
        default:
          // Hide popup if user continues typing something different
          setTimeout(() => this.checkForSuggestions(), 50);
      }
    }

    checkForSuggestions() {
      if (!this.currentElement || !this.isEnabled) return;

      const { text, cursorPosition } = this.getCurrentText();
      const currentWord = this.getCurrentWord(text, cursorPosition);

      if (currentWord.length < this.minCharsToTrigger) {
        this.hidePopup();
        return;
      }

      const suggestions = this.findSuggestions(currentWord);

      if (suggestions.length > 0) {
        this.showSuggestions(suggestions, currentWord);
      } else {
        this.hidePopup();
      }
    }

    getCurrentText() {
      if (this.currentElement.isContentEditable) {
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          return {
            text: range.startContainer.textContent || "",
            cursorPosition: range.startOffset,
          };
        }
        return { text: "", cursorPosition: 0 };
      } else {
        return {
          text: this.currentElement.value,
          cursorPosition: this.currentElement.selectionStart,
        };
      }
    }

    getCurrentWord(text, cursorPosition) {
      let wordStart = cursorPosition;
      while (wordStart > 0 && !/\s/.test(text.charAt(wordStart - 1))) {
        wordStart--;
      }
      return text.substring(wordStart, cursorPosition);
    }

    findSuggestions(currentWord) {
      const lowerCurrentWord = currentWord.toLowerCase();

      // Find matching abbreviations
      const matches = this.abbreviationsCache.filter(abbr => {
        const abbrLower = abbr.abbreviation.toLowerCase();
        return (
          abbrLower.startsWith(lowerCurrentWord) &&
          abbrLower !== lowerCurrentWord
        );
      });

      // Sort by relevance (usage stats, then alphabetically)
      matches.sort((a, b) => {
        const usageA = this.usageStats.get(a.abbreviation) || 0;
        const usageB = this.usageStats.get(b.abbreviation) || 0;

        if (usageA !== usageB) {
          return usageB - usageA; // Higher usage first
        }

        // If usage is equal, prefer exact prefix matches
        const aStartsExact = a.abbreviation
          .toLowerCase()
          .startsWith(lowerCurrentWord);
        const bStartsExact = b.abbreviation
          .toLowerCase()
          .startsWith(lowerCurrentWord);

        if (aStartsExact && !bStartsExact) return -1;
        if (!aStartsExact && bStartsExact) return 1;

        // Finally, sort alphabetically
        return a.abbreviation.localeCompare(b.abbreviation);
      });

      return matches.slice(0, this.maxSuggestions);
    }

    showSuggestions(suggestions, currentWord) {
      this.currentSuggestions = suggestions;
      this.selectedIndex = 0;

      const position = this.getCursorPosition();
      if (!position) return;

      this.popup.innerHTML = "";

      // Add header
      const header = document.createElement("div");
      header.className = "sote-autocomplete-header";
      header.textContent = `Sugestões para "${currentWord}"`;
      this.popup.appendChild(header);

      // Add suggestions
      suggestions.forEach((suggestion, index) => {
        const item = this.createSuggestionItem(suggestion, currentWord, index);
        this.popup.appendChild(item);
      });

      // Add footer with keyboard hint
      const footer = document.createElement("div");
      footer.className = "sote-autocomplete-footer";
      footer.innerHTML = `
        <span>↑↓ navegar</span>
        <span class="separator">•</span>
        <kbd>Tab</kbd> aceitar
        <span class="separator">•</span>
        <kbd>Esc</kbd> fechar
      `;
      this.popup.appendChild(footer);

      // Position and show popup
      this.popup.style.left = position.x + "px";
      this.popup.style.top = position.y + 20 + "px";
      this.popup.style.display = "block";

      // Ensure popup stays within viewport
      this.adjustPopupPosition();
      this.updateSelection();
    }

    createSuggestionItem(suggestion, currentWord, index) {
      const item = document.createElement("div");
      item.className = "sote-autocomplete-item";

      item.addEventListener("mouseenter", () => {
        this.selectedIndex = index;
        this.updateSelection();
      });

      item.addEventListener("click", () => {
        this.acceptSuggestion(suggestion);
      });

      // Highlight matching part
      const abbr = suggestion.abbreviation;
      const matchIndex = abbr.toLowerCase().indexOf(currentWord.toLowerCase());
      let highlightedAbbr = abbr;

      if (matchIndex === 0) {
        highlightedAbbr = `<span class="sote-autocomplete-highlight">${abbr.substring(
          0,
          currentWord.length
        )}</span>${abbr.substring(currentWord.length)}`;
      }

      // Format expansion for display
      const formattedExpansion = this.formatExpansionForDisplay(
        suggestion.expansion
      );
      const truncatedExpansion =
        formattedExpansion.length > 50
          ? formattedExpansion.substring(0, 47) + "..."
          : formattedExpansion;

      // Get usage count
      const usageCount = this.usageStats.get(suggestion.abbreviation) || 0;

      item.innerHTML = `
        <div class="sote-autocomplete-item-content">
          <div class="sote-autocomplete-item-main">
            <div class="sote-autocomplete-item-abbreviation">
              ${highlightedAbbr}
            </div>
            <div class="sote-autocomplete-item-expansion">
              ${this.escapeHtml(truncatedExpansion)}
            </div>
          </div>
          <div class="sote-autocomplete-item-meta">
            <div class="sote-autocomplete-item-category">
              ${this.escapeHtml(suggestion.category || "Geral")}
            </div>
            ${
              usageCount > 0
                ? `<div class="sote-autocomplete-item-usage">${usageCount}</div>`
                : ""
            }
          </div>
        </div>
      `;

      return item;
    }

    formatExpansionForDisplay(text) {
      if (typeof text !== "string") return "";
      return text
        .replace(/\$cursor\$/g, "[cursor]")
        .replace(/\$transferencia\$/g, "[clipboard]");
    }

    escapeHtml(text) {
      const div = document.createElement("div");
      div.textContent = text;
      return div.innerHTML;
    }

    getCursorPosition() {
      if (!this.currentElement) return null;

      if (this.currentElement.isContentEditable) {
        const selection = window.getSelection();
        if (selection.rangeCount === 0) return null;

        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();

        return {
          x: rect.left + window.scrollX,
          y: rect.bottom + window.scrollY,
        };
      } else {
        // For input/textarea elements
        const element = this.currentElement;
        const rect = element.getBoundingClientRect();

        // Create a temporary element to measure text position
        const temp = document.createElement("div");
        const computedStyle = window.getComputedStyle(element);
        temp.style.cssText = `
          position: absolute;
          visibility: hidden;
          white-space: pre-wrap;
          word-wrap: break-word;
          font-family: ${computedStyle.fontFamily};
          font-size: ${computedStyle.fontSize};
          line-height: ${computedStyle.lineHeight};
          padding: ${computedStyle.padding};
          border: ${computedStyle.border};
          width: ${element.offsetWidth}px;
          overflow: hidden;
        `;

        const textBeforeCursor = element.value.substring(
          0,
          element.selectionStart
        );
        temp.textContent = textBeforeCursor;

        document.body.appendChild(temp);
        const tempRect = temp.getBoundingClientRect();
        document.body.removeChild(temp);

        return {
          x: rect.left + tempRect.width + window.scrollX,
          y: rect.top + window.scrollY,
        };
      }
    }

    adjustPopupPosition() {
      const rect = this.popup.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      // Adjust horizontal position if popup goes off-screen
      if (rect.right > viewportWidth) {
        this.popup.style.left = viewportWidth - rect.width - 10 + "px";
      }

      // Adjust vertical position if popup goes off-screen
      if (rect.bottom > viewportHeight) {
        const position = this.getCursorPosition();
        if (position) {
          this.popup.style.top = position.y - rect.height - 5 + "px";
        }
      }
    }

    selectNext() {
      if (this.currentSuggestions.length === 0) return;

      this.selectedIndex =
        (this.selectedIndex + 1) % this.currentSuggestions.length;
      this.updateSelection();
    }

    selectPrevious() {
      if (this.currentSuggestions.length === 0) return;

      this.selectedIndex =
        this.selectedIndex <= 0
          ? this.currentSuggestions.length - 1
          : this.selectedIndex - 1;
      this.updateSelection();
    }

    updateSelection() {
      const items = this.popup.querySelectorAll(".sote-autocomplete-item");
      items.forEach((item, index) => {
        if (index === this.selectedIndex) {
          item.classList.add("selected");
          item.scrollIntoView({ block: "nearest" });
        } else {
          item.classList.remove("selected");
        }
      });
    }

    async acceptSuggestion(suggestion) {
      console.log(
        "[Autocomplete DEBUG] acceptSuggestion chamado com:",
        suggestion
      );

      if (!this.currentElement || !suggestion) {
        console.log(
          "[Autocomplete DEBUG] Retornando: currentElement ou suggestion é nulo/inválido."
        );
        return;
      }

      const { text: currentFullText, cursorPosition: currentCursorPos } =
        this.getCurrentText();
      console.log(
        "[Autocomplete DEBUG] Texto atual:",
        currentFullText,
        "Posição do cursor:",
        currentCursorPos
      );

      let wordStart = currentCursorPos;
      while (
        wordStart > 0 &&
        !/\s/.test(currentFullText.charAt(wordStart - 1))
      ) {
        wordStart--;
      }
      console.log(
        "[Autocomplete DEBUG] wordStart para substituição:",
        wordStart
      );

      // Update usage statistics
      const currentUsage = this.usageStats.get(suggestion.abbreviation) || 0;
      this.usageStats.set(suggestion.abbreviation, currentUsage + 1);
      this.saveUsageStats();

      try {
        const contextualExpansionText =
          await window.TextExpander.getMatchingExpansion(
            suggestion,
            suggestion.rules || []
          );
        console.log(
          "[Autocomplete DEBUG] Expansão contextualizada (após regras):",
          contextualExpansionText
        );

        const { text: finalExpansionText, cursorPosition: finalCursorOffset } =
          await window.TextExpander.processSpecialActions(
            contextualExpansionText
          );
        console.log(
          "[Autocomplete DEBUG] Expansão final (após ações especiais):",
          finalExpansionText,
          "Cursor offset:",
          finalCursorOffset
        );

        // Use the new unified replacement function
        await window.TextExpander.replaceTextAtCursorWithExpansion(
          this.currentElement,
          wordStart,
          currentCursorPos,
          finalExpansionText,
          finalCursorOffset
        );

        console.log(
          "[Autocomplete DEBUG] Expansão concluída. Escondendo popup."
        );
      } catch (error) {
        console.error("Error during autocomplete expansion:", error);
      }

      this.hidePopup();
    }

    hidePopup() {
      if (this.popup) {
        this.popup.style.display = "none";
      }
      this.currentSuggestions = [];
      this.selectedIndex = -1;
    }

    destroy() {
      if (this.popup && this.popup.parentNode) {
        this.popup.parentNode.removeChild(this.popup);
      }
      clearTimeout(this.debounceTimer);

      // Remove CSS
      const styles = document.querySelector("#sote-autocomplete-styles");
      if (styles) {
        styles.remove();
      }
    }

    // Public methods for external control
    enable() {
      this.isEnabled = true;
    }

    disable() {
      this.isEnabled = false;
      this.hidePopup();
    }

    setMinChars(chars) {
      this.minCharsToTrigger = Math.max(1, chars);
    }

    setMaxSuggestions(max) {
      this.maxSuggestions = Math.max(1, max);
    }
  }

  // Global instance
  let autocompleteManager = null;

  // Initialize autocomplete when DOM is ready
  function initAutocomplete() {
    if (autocompleteManager) return;

    autocompleteManager = new AutocompleteManager();

    // Attach to existing elements
    document
      .querySelectorAll(
        'input[type="text"], input[type="email"], input[type="search"], textarea, [contenteditable="true"]'
      )
      .forEach(element => {
        autocompleteManager.attachToElement(element);
      });

    // Observe for new elements
    const observer = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (
              node.matches &&
              node.matches(
                'input[type="text"], input[type="email"], input[type="search"], textarea, [contenteditable="true"]'
              )
            ) {
              autocompleteManager.attachToElement(node);
            }

            // Check child elements
            const editableElements =
              node.querySelectorAll &&
              node.querySelectorAll(
                'input[type="text"], input[type="email"], input[type="search"], textarea, [contenteditable="true"]'
              );
            if (editableElements) {
              editableElements.forEach(element => {
                autocompleteManager.attachToElement(element);
              });
            }
          }
        });
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  // Export to global scope
  global.SoteAutocomplete = {
    init: initAutocomplete,
    getInstance: () => autocompleteManager,
    AutocompleteManager,
  };

  // Auto-initialize when script loads
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAutocomplete);
  } else {
    initAutocomplete();
  }
})(self || window);
