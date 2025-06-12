// SOTE-main/utils/notifier.js
(function(global) {
  'use strict';

  class Notifier {
    constructor() {
      this.container = null;
      this.init();
    }

    init() {
      if (document.getElementById('sote-notifier-container')) {
        this.container = document.getElementById('sote-notifier-container');
        return;
      }

      this.container = document.createElement('div');
      this.container.id = 'sote-notifier-container';
      document.body.appendChild(this.container);

      // Load CSS if not already loaded
      if (!document.getElementById('sote-notifier-styles')) {
        const link = document.createElement('link');
        link.id = 'sote-notifier-styles';
        link.rel = 'stylesheet';
        link.href = chrome.runtime.getURL('utils/notifier.css');
        document.head.appendChild(link);
      }
    }

    show(message, type = 'info', duration = 3000) {
      if (!this.container) {
        console.error("Notifier container not initialized.");
        return;
      }

      const toast = document.createElement('div');
      toast.className = `sote-toast sote-toast-${type}`;
      toast.setAttribute('role', 'alert');
      toast.setAttribute('aria-live', 'assertive');

      const icon = this.getIcon(type);
      toast.innerHTML = `${icon}<span>${this.escapeHtml(message)}</span>`;

      this.container.appendChild(toast);

      // Animate in
      setTimeout(() => {
        toast.classList.add('show');
      }, 100);

      // Animate out and remove
      setTimeout(() => {
        toast.classList.remove('show');
        toast.addEventListener('transitionend', () => {
          if (toast.parentNode) {
            toast.parentNode.removeChild(toast);
          }
        });
      }, duration);
    }

    getIcon(type) {
      const icons = {
        success: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>',
        error: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>',
        info: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>',
        warning: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>'
      };
      return `<div class="sote-toast-icon">${icons[type] || icons.info}</div>`;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
  }

  // Expose a single instance to the global scope
  global.SoteNotifier = new Notifier();

})(self || window);