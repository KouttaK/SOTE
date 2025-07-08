// SOTE-main/utils/StateManager.js
(function (global) {
  "use strict";

  /**
   * @class StateManager
   * @description A robust state management class implementing the Observer/Publisher-Subscriber pattern
   * with advanced features like selective subscriptions, middleware support, and performance optimizations.
   */
  class StateManager {
    /**
     * Creates an instance of StateManager.
     * @param {object} initialState - The initial state of the application.
     * @param {object} options - Configuration options.
     */
    constructor(initialState = {}, options = {}) {
      this.state = this._deepFreeze(this._deepClone(initialState));
      this.subscribers = new Set();
      this.pathSubscribers = new Map(); // For selective subscriptions
      this.middleware = [];
      this.options = {
        enableDevtools: options.enableDevtools ?? false,
        enableTimeTravel: options.enableTimeTravel ?? false,
        maxHistorySize: options.maxHistorySize ?? 50,
        enableLogging: options.enableLogging ?? false,
        ...options,
      };

      // History for time travel debugging
      if (this.options.enableTimeTravel) {
        this.history = [this._deepClone(initialState)];
        this.currentHistoryIndex = 0;
      }

      this._setupDevtools();
    }

    /**
     * Deep clone utility with better performance for complex objects
     * @private
     */
    _deepClone(obj) {
      if (obj === null || typeof obj !== "object") return obj;
      if (obj instanceof Date) return new Date(obj);
      if (obj instanceof Array) return obj.map(item => this._deepClone(item));
      if (obj instanceof Set)
        return new Set([...obj].map(item => this._deepClone(item)));
      if (obj instanceof Map)
        return new Map([...obj].map(([k, v]) => [k, this._deepClone(v)]));

      return Object.fromEntries(
        Object.entries(obj).map(([key, value]) => [key, this._deepClone(value)])
      );
    }

    /**
     * Deep freeze utility to prevent state mutations
     * @private
     */
    _deepFreeze(obj) {
      if (typeof obj !== "object" || obj === null) return obj;

      Object.getOwnPropertyNames(obj).forEach(prop => {
        const value = obj[prop];
        if (typeof value === "object" && value !== null) {
          this._deepFreeze(value);
        }
      });

      return Object.freeze(obj);
    }

    /**
     * Improved deep equality check with better performance
     * @private
     */
    _deepEqual(obj1, obj2, seen = new WeakMap()) {
      if (obj1 === obj2) return true;
      if (obj1 == null || obj2 == null) return obj1 === obj2;
      if (typeof obj1 !== typeof obj2) return false;
      if (typeof obj1 !== "object") return obj1 === obj2;

      // Handle circular references
      if (seen.has(obj1)) return seen.get(obj1) === obj2;
      seen.set(obj1, obj2);

      const keys1 = Object.keys(obj1);
      const keys2 = Object.keys(obj2);

      if (keys1.length !== keys2.length) return false;

      return keys1.every(
        key =>
          keys2.includes(key) && this._deepEqual(obj1[key], obj2[key], seen)
      );
    }

    /**
     * Get value at a specific path in the state
     * @private
     */
    _getPath(obj, path) {
      return path.split(".").reduce((current, key) => current?.[key], obj);
    }

    /**
     * Setup Redux DevTools integration
     * @private
     */
    _setupDevtools() {
      if (
        this.options.enableDevtools &&
        typeof window !== "undefined" &&
        window.__REDUX_DEVTOOLS_EXTENSION__
      ) {
        this.devtools = window.__REDUX_DEVTOOLS_EXTENSION__.connect({
          name: "StateManager",
          trace: true,
        });
        this.devtools.init(this.state);
      }
    }

    /**
     * Returns a deep copy of the current state or a specific path.
     * @param {string} [path] - Optional path to get specific part of state
     * @returns {any} The current state or value at path.
     */
    getState(path) {
      const state = this._deepClone(this.state);
      return path ? this._getPath(state, path) : state;
    }

    /**
     * Updates the state through middleware pipeline and notifies subscribers.
     * @param {object | function} updater - State updater
     * @param {string} [actionType] - Optional action type for debugging
     * @returns {Promise<void>}
     */
    async setState(updater, actionType = "STATE_UPDATE") {
      const oldState = this.state;

      try {
        // Apply middleware
        let newState = await this._applyMiddleware(
          updater,
          oldState,
          actionType
        );

        // Normalize newState
        if (typeof updater === "function") {
          newState = updater(this.getState());
        } else if (typeof updater === "object") {
          newState = { ...this.getState(), ...updater };
        }

        // Check for changes with improved comparison
        if (!this._deepEqual(oldState, newState)) {
          this.state = this._deepFreeze(newState);

          // Update history for time travel
          if (this.options.enableTimeTravel) {
            this._updateHistory(newState);
          }

          // Notify subscribers
          await this._notifySubscribers(oldState, newState);

          // DevTools integration
          if (this.devtools) {
            this.devtools.send(actionType, newState);
          }

          // Logging
          if (this.options.enableLogging) {
            console.group(`🔄 State Update: ${actionType}`);
            console.log("Previous State:", oldState);
            console.log("New State:", newState);
            console.groupEnd();
          }
        }
      } catch (error) {
        console.error("Error in setState:", error);
        throw error;
      }
    }

    /**
     * Apply middleware pipeline
     * @private
     */
    async _applyMiddleware(updater, oldState, actionType) {
      let context = {
        updater,
        oldState,
        actionType,
        getState: () => this.getState(),
      };

      for (const middleware of this.middleware) {
        try {
          const result = await middleware(context);
          if (result !== undefined) {
            context.updater = result;
          }
        } catch (error) {
          console.error("Middleware error:", error);
        }
      }

      return context.updater;
    }

    /**
     * Update history for time travel debugging
     * @private
     */
    _updateHistory(newState) {
      // Remove future states if we're not at the end
      if (this.currentHistoryIndex < this.history.length - 1) {
        this.history = this.history.slice(0, this.currentHistoryIndex + 1);
      }

      this.history.push(this._deepClone(newState));

      // Limit history size
      if (this.history.length > this.options.maxHistorySize) {
        this.history.shift();
      } else {
        this.currentHistoryIndex++;
      }
    }

    /**
     * Enhanced notification system with path-based subscriptions
     * @private
     */
    async _notifySubscribers(oldState, newState) {
      const notifications = [];

      // Global subscribers
      for (const subscriber of this.subscribers) {
        notifications.push(this._safeNotify(subscriber, newState, oldState));
      }

      // Path-based subscribers
      for (const [path, subscribers] of this.pathSubscribers) {
        const oldValue = this._getPath(oldState, path);
        const newValue = this._getPath(newState, path);

        if (!this._deepEqual(oldValue, newValue)) {
          for (const subscriber of subscribers) {
            notifications.push(
              this._safeNotify(subscriber, newValue, oldValue, path)
            );
          }
        }
      }

      // Wait for all notifications
      await Promise.all(notifications);
    }

    /**
     * Safe notification wrapper
     * @private
     */
    async _safeNotify(callback, newValue, oldValue, path) {
      try {
        await callback(newValue, oldValue, path);
      } catch (error) {
        console.error(
          `Error in subscriber callback${path ? ` for path '${path}'` : ""}:`,
          error
        );
      }
    }

    /**
     * Enhanced subscribe with path-based subscriptions
     * @param {function} callback - Callback function
     * @param {string} [path] - Optional path to subscribe to specific state changes
     * @returns {function} Unsubscribe function
     */
    subscribe(callback, path) {
      if (typeof callback !== "function") {
        console.error("Subscriber must be a function.");
        return () => {};
      }

      if (path) {
        // Path-based subscription
        if (!this.pathSubscribers.has(path)) {
          this.pathSubscribers.set(path, new Set());
        }
        this.pathSubscribers.get(path).add(callback);

        // Initial notification
        this._safeNotify(callback, this.getState(path), undefined, path);

        return () => {
          const subscribers = this.pathSubscribers.get(path);
          if (subscribers) {
            subscribers.delete(callback);
            if (subscribers.size === 0) {
              this.pathSubscribers.delete(path);
            }
          }
        };
      } else {
        // Global subscription
        this.subscribers.add(callback);
        this._safeNotify(callback, this.getState());

        return () => {
          this.subscribers.delete(callback);
        };
      }
    }

    /**
     * Add middleware to the processing pipeline
     * @param {function} middleware - Middleware function
     */
    addMiddleware(middleware) {
      if (typeof middleware === "function") {
        this.middleware.push(middleware);
      }
    }

    /**
     * Remove middleware from the pipeline
     * @param {function} middleware - Middleware function to remove
     */
    removeMiddleware(middleware) {
      const index = this.middleware.indexOf(middleware);
      if (index > -1) {
        this.middleware.splice(index, 1);
      }
    }

    /**
     * Time travel: go back in history
     */
    undo() {
      if (this.options.enableTimeTravel && this.currentHistoryIndex > 0) {
        this.currentHistoryIndex--;
        this.state = this._deepFreeze(
          this._deepClone(this.history[this.currentHistoryIndex])
        );
        this._notifySubscribers({}, this.state);

        if (this.devtools) {
          this.devtools.send("UNDO", this.state);
        }
      }
    }

    /**
     * Time travel: go forward in history
     */
    redo() {
      if (
        this.options.enableTimeTravel &&
        this.currentHistoryIndex < this.history.length - 1
      ) {
        this.currentHistoryIndex++;
        this.state = this._deepFreeze(
          this._deepClone(this.history[this.currentHistoryIndex])
        );
        this._notifySubscribers({}, this.state);

        if (this.devtools) {
          this.devtools.send("REDO", this.state);
        }
      }
    }

    /**
     * Reset state to initial or provided state
     * @param {object} [newState] - Optional new state to reset to
     */
    reset(newState) {
      const resetState = newState || this.history?.[0] || {};
      this.setState(resetState, "RESET");
    }

    /**
     * Batch multiple state updates
     * @param {function} batchFunction - Function containing multiple setState calls
     */
    async batch(batchFunction) {
      const originalNotify = this._notifySubscribers;
      const batchedNotifications = [];

      // Temporarily override notification system
      this._notifySubscribers = async (oldState, newState) => {
        batchedNotifications.push({ oldState, newState });
      };

      try {
        await batchFunction();

        // Send all batched notifications
        if (batchedNotifications.length > 0) {
          const finalOldState = batchedNotifications[0].oldState;
          const finalNewState =
            batchedNotifications[batchedNotifications.length - 1].newState;
          await originalNotify.call(this, finalOldState, finalNewState);
        }
      } finally {
        // Restore original notification system
        this._notifySubscribers = originalNotify;
      }
    }

    /**
     * Clean up resources
     */
    destroy() {
      this.subscribers.clear();
      this.pathSubscribers.clear();
      this.middleware = [];

      if (this.devtools) {
        this.devtools.disconnect();
      }
    }
  }

  // Expose the StateManager class to the global scope.
  global.StateManager = StateManager;
})(typeof self !== "undefined" ? self : window);
