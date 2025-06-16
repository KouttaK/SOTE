// SOTE-main/utils/choiceSelectionModal.js
(function (global) {
  "use strict";

  class ChoiceSelectionModal {
    constructor() {
      this.modalElement = null;
      this.onSelectCallback = null;
      this.onCancelCallback = null;
      this._handleKeyDown = this._handleKeyDown.bind(this);
    }

    _createDOM() {
      if (document.getElementById("sote-choice-selection-container")) {
        this.modalElement = document.getElementById(
          "sote-choice-selection-container"
        );
        return;
      }

      if (!document.getElementById("sote-choice-modal-styles")) {
        const style = document.createElement("style");
        style.id = "sote-choice-modal-styles";
        style.textContent = `
          #sote-choice-selection-container {
            position: fixed;
            top: 0; left: 0;
            width: 100%; height: 100%;
            z-index: 2147483646;
            display: flex;
            justify-content: center;
            align-items: flex-start;
          }
          #sote-choice-selection-container.hidden {
            display: none !important;
          }
          #sote-choice-overlay {
            position: fixed;
            top: 0; left: 0;
            width: 100%; height: 100%;
            background: rgba(17, 24, 39, 0.4);
            backdrop-filter: blur(3px);
          }
          #sote-choice-modal {
            position: relative;
            margin-top: 15vh;
            background: white;
            border: 1px solid #d1d5db;
            box-shadow: 0 10px 25px -5px rgba(0,0,0,0.2);
            border-radius: 12px;
            padding: 8px;
            display: flex;
            flex-direction: column;
            gap: 5px;
            z-index: 2147483647;
            min-width: 280px;
            max-width: 400px;
          }
          .sote-choice-option-btn {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 10px 14px;
            border: 1px solid #e5e7eb;
            background: #ffffff;
            border-radius: 8px;
            cursor: pointer;
            text-align: left;
            width: 100%;
            font-family: inherit;
            font-size: 14px;
            transition: background-color 0.2s, border-color 0.2s;
          }
          .sote-choice-option-btn:hover {
            background: #f9fafb;
            border-color: #d1d5db;
          }
          .sote-choice-key {
            background: #e5e7eb;
            border-radius: 4px;
            font-weight: 700;
            padding: 3px 8px;
            font-size: 13px;
            color: #374151;
            border: 1px solid #d1d5db;
          }
          .sote-choice-title {
              color: #111827;
              font-weight: 500;
          }
        `;
        document.head.appendChild(style);
      }

      const container = document.createElement("div");
      container.id = "sote-choice-selection-container";
      container.className = "hidden";
      container.innerHTML = `<div id="sote-choice-overlay"></div><div id="sote-choice-modal"></div>`;
      document.body.appendChild(container);

      this.modalElement = container;

      this.modalElement
        .querySelector("#sote-choice-overlay")
        .addEventListener("click", () => this._handleCancel());
    }

    show(options, targetElement) {
      if (!this.modalElement) this._createDOM();

      return new Promise((resolve, reject) => {
        this.onSelectCallback = resolve;
        this.onCancelCallback = reject;

        const modalContent =
          this.modalElement.querySelector("#sote-choice-modal");
        modalContent.innerHTML = "";

        options.forEach((option, index) => {
          const button = document.createElement("button");
          button.className = "sote-choice-option-btn";
          button.innerHTML = `<span class="sote-choice-key">${
            index + 1
          }</span> <span class="sote-choice-title">${this._escapeHtml(
            option.title
          )}</span>`;
          button.addEventListener("click", e => {
            e.stopPropagation();
            this._handleSelection(option.message);
          });
          modalContent.appendChild(button);
        });

        this.modalElement.classList.remove("hidden");
        this.modalElement.style.display = "flex";

        document.addEventListener("keydown", this._handleKeyDown, true);
      });
    }

    _escapeHtml(text) {
      const div = document.createElement("div");
      div.textContent = text;
      return div.innerHTML;
    }

    _handleKeyDown(event) {
      if (!this.modalElement || this.modalElement.classList.contains("hidden"))
        return;

      const numberOfOptions = this.modalElement.querySelectorAll(
        ".sote-choice-option-btn"
      ).length;
      const choiceIndex = parseInt(event.key, 10) - 1;

      if (choiceIndex >= 0 && choiceIndex < numberOfOptions) {
        const button = this.modalElement.querySelectorAll(
          ".sote-choice-option-btn"
        )[choiceIndex];
        if (button) {
          event.preventDefault();
          event.stopPropagation();
          button.click();
        }
      } else if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        this._handleCancel();
      }
    }

    _handleSelection(message) {
      if (this.onSelectCallback) {
        this.onSelectCallback(message);
      }
      this._hide();
    }

    _handleCancel() {
      if (this.onCancelCallback) {
        this.onCancelCallback(new Error("Seleção cancelada pelo usuário."));
      }
      this._hide();
    }

    _hide() {
      if (this.modalElement) {
        this.modalElement.classList.add("hidden");
        this.modalElement.style.display = "none";
      }
      document.removeEventListener("keydown", this._handleKeyDown, true);

      this.onSelectCallback = null;
      this.onCancelCallback = null;
    }
  }

  global.SoteChoiceModal = new ChoiceSelectionModal();
})(self || window);
