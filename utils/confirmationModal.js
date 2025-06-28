// SOTE-main/utils/confirmationModal.js
(function (global) {
  "use strict";

  class ConfirmationModal {
    constructor() {
      this.modalElement = null;
      this.titleElement = null;
      this.messageElement = null;
      this.inputGroup = null;
      this.inputElement = null;
      this.inputLabel = null;
      this.confirmButton = null;
      this.cancelButton = null;
      this.config = {};

      this._init();
    }

    _init() {
      if (!document.getElementById("sote-confirmation-modal-styles")) {
        const link = document.createElement("link");
        link.id = "sote-confirmation-modal-styles";
        link.rel = "stylesheet";
        link.href = chrome.runtime.getURL("utils/confirmationModal.css");
        document.head.appendChild(link);
      }

      if (!document.getElementById("sote-confirmation-modal")) {
        const modalHtml = `
          <div class="sote-cm-modal-overlay">
            <div class="sote-cm-modal" role="dialog" aria-modal="true" aria-labelledby="sote-cm-title">
              <div class="sote-cm-header">
                <h2 id="sote-cm-title"></h2>
                <div class="sote-cm-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                </div>
              </div>
              <div class="sote-cm-body">
                <p id="sote-cm-message"></p>
                <div class="sote-cm-form-group">
                    <label for="sote-cm-input" id="sote-cm-input-label">Para confirmar, digite <strong>"Confirmo"</strong> abaixo:</label>
                    <input type="text" id="sote-cm-input" autocomplete="off">
                </div>
              </div>
              <div class="sote-cm-footer">
                <button id="sote-cm-cancel-btn" class="sote-cm-btn sote-cm-btn-secondary"></button>
                <button id="sote-cm-confirm-btn" class="sote-cm-btn sote-cm-btn-danger"></button>
              </div>
            </div>
          </div>
        `;
        const container = document.createElement("div");
        container.id = "sote-confirmation-modal";
        container.innerHTML = modalHtml;
        document.body.appendChild(container);
      }

      this.modalElement = document.getElementById("sote-confirmation-modal");
      this.titleElement = document.getElementById("sote-cm-title");
      this.messageElement = document.getElementById("sote-cm-message");
      this.inputGroup = this.modalElement.querySelector(".sote-cm-form-group");
      this.inputElement = document.getElementById("sote-cm-input");
      this.inputLabel = document.getElementById("sote-cm-input-label");
      this.confirmButton = document.getElementById("sote-cm-confirm-btn");
      this.cancelButton = document.getElementById("sote-cm-cancel-btn");

      this.cancelButton.addEventListener("click", () => this.hide());
      this.modalElement
        .querySelector(".sote-cm-modal-overlay")
        .addEventListener("click", e => {
          if (e.target === e.currentTarget) this.hide();
        });
      this.inputElement.addEventListener(
        "input",
        this._validateInput.bind(this)
      );
      this.confirmButton.addEventListener(
        "click",
        this._handleConfirm.bind(this)
      );
      document.addEventListener("keydown", e => {
        if (
          e.key === "Escape" &&
          !this.modalElement.classList.contains("hidden")
        ) {
          this.hide();
        }
      });
    }

    show(options) {
      const defaults = {
        title: "Confirmação",
        message: "Você tem certeza?",
        onConfirm: () => {},
        requireInput: false,
        confirmText: "Confirmar",
        cancelText: "Cancelar",
        confirmationText: "Confirmo",
      };
      this.config = { ...defaults, ...options };

      this.titleElement.textContent = this.config.title;
      this.messageElement.innerHTML = this.config.message;
      this.confirmButton.textContent = this.config.confirmText;
      this.cancelButton.textContent = this.config.cancelText;

      this.inputGroup.classList.toggle("hidden", !this.config.requireInput);

      if (this.config.requireInput) {
        this.inputLabel.innerHTML = `Para confirmar, digite <strong>"${this.config.confirmationText}"</strong> abaixo:`;
        this.inputElement.value = "";
        this.confirmButton.disabled = true;
      } else {
        this.confirmButton.disabled = false;
      }

      this.modalElement.classList.remove("hidden");
      document.body.style.overflow = "hidden";

      setTimeout(() => {
        this.modalElement.classList.add("visible");
        if (this.config.requireInput) {
          this.inputElement.focus();
        } else {
          this.confirmButton.focus();
        }
      }, 10);
    }

    hide() {
      this.modalElement.classList.remove("visible");
      setTimeout(() => {
        this.modalElement.classList.add("hidden");
        document.body.style.overflow = "";
        this.config = {};
      }, 300);
    }

    _validateInput() {
      if (this.config.requireInput) {
        this.confirmButton.disabled =
          this.inputElement.value !== this.config.confirmationText;
      }
    }

    _handleConfirm() {
      if (
        this.config.onConfirm &&
        typeof this.config.onConfirm === "function"
      ) {
        this.config.onConfirm();
      }
      this.hide();
    }
  }

  global.SoteConfirmationModal = new ConfirmationModal();

  if (!document.querySelector("style[data-sote-utils]")) {
    const style = document.createElement("style");
    style.setAttribute("data-sote-utils", "true");
    style.textContent = ".hidden { display: none !important; }";
    document.head.appendChild(style);
  }
})(self || window);
