// SOTE-main/utils/confirmationModal.js
(function (global) {
  "use strict";

  class ConfirmationModal {
    constructor() {
      this.modalElement = null;
      this.titleElement = null;
      this.messageElement = null;
      this.inputElement = null;
      this.confirmButton = null;
      this.cancelButton = null;
      this.onConfirmCallback = null;

      this.init();
    }

    init() {
      // Load CSS if not already loaded
      if (!document.getElementById("sote-confirmation-modal-styles")) {
        const link = document.createElement("link");
        link.id = "sote-confirmation-modal-styles";
        link.rel = "stylesheet";
        link.href = chrome.runtime.getURL("utils/confirmationModal.css");
        document.head.appendChild(link);
      }

      // Create modal structure if it doesn't exist
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
                    <label for="sote-cm-input">Para confirmar, digite <strong>"Confirmo"</strong> abaixo:</label>
                    <input type="text" id="sote-cm-input" autocomplete="off">
                </div>
              </div>
              <div class="sote-cm-footer">
                <button id="sote-cm-cancel-btn" class="sote-cm-btn sote-cm-btn-secondary">Cancelar</button>
                <button id="sote-cm-confirm-btn" class="sote-cm-btn sote-cm-btn-danger" disabled>Confirmar</button>
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
      this.inputElement = document.getElementById("sote-cm-input");
      this.confirmButton = document.getElementById("sote-cm-confirm-btn");
      this.cancelButton = document.getElementById("sote-cm-cancel-btn");

      this.cancelButton.addEventListener("click", () => this.hide());
      this.modalElement
        .querySelector(".sote-cm-modal-overlay")
        .addEventListener("click", e => {
          if (e.target === e.currentTarget) {
            this.hide();
          }
        });
      this.inputElement.addEventListener(
        "input",
        this.validateInput.bind(this)
      );
      this.confirmButton.addEventListener(
        "click",
        this.handleConfirm.bind(this)
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

    show({ title, message, onConfirm }) {
      this.titleElement.textContent = title;
      this.messageElement.innerHTML = message; // Use innerHTML to allow for <strong> tags
      this.onConfirmCallback = onConfirm;

      this.modalElement.classList.remove("hidden");
      document.body.style.overflow = "hidden"; // Prevent background scrolling

      // Reset state
      this.inputElement.value = "";
      this.confirmButton.disabled = true;

      setTimeout(() => {
        this.modalElement.classList.add("visible");
        this.inputElement.focus();
      }, 10);
    }

    hide() {
      this.modalElement.classList.remove("visible");
      setTimeout(() => {
        this.modalElement.classList.add("hidden");
        document.body.style.overflow = "";
        this.onConfirmCallback = null;
      }, 300);
    }

    validateInput() {
      if (this.inputElement.value === "Confirmo") {
        this.confirmButton.disabled = false;
      } else {
        this.confirmButton.disabled = true;
      }
    }

    handleConfirm() {
      if (
        this.onConfirmCallback &&
        typeof this.onConfirmCallback === "function"
      ) {
        this.onConfirmCallback();
      }
      this.hide();
    }
  }

  // Expose a single instance to the global scope
  global.SoteConfirmationModal = new ConfirmationModal();
  // Add a simple hidden class to the head for the modal
  const style = document.createElement("style");
  style.textContent = ".hidden { display: none !important; }";
  document.head.appendChild(style);
})(self || window);
