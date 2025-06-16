// SOTE-main/utils/constants.js
(function (global) {
  "use strict";

  global.SOTE_CONSTANTS = {
    DB_NAME: "textExpander",
    DB_VERSION: 4, // <<<<<<< INCREMENTADO
    STORE_ABBREVIATIONS: "abbreviations",
    STORE_RULES: "expansionRules",
    STORE_CHOICES: "choices", // <<<<<<< NOVO
    MESSAGE_TYPES: {
      GET_ABBREVIATIONS: "GET_ABBREVIATIONS",
      ABBREVIATIONS_UPDATED: "ABBREVIATIONS_UPDATED",
      INITIAL_SEED_COMPLETE: "INITIAL_SEED_COMPLETE",
      TOGGLE_ENABLED: "TOGGLE_ENABLED",
      SETTINGS_UPDATED: "SETTINGS_UPDATED",
      UPDATE_USAGE: "UPDATE_USAGE",
      GET_CHOICE_CONFIG: "GET_CHOICE_CONFIG", // <<<<<<< NOVO
    },
  };
})(self || window);
