// SOTE-main/utils/constants.js
(function (global) {
  "use strict";

  global.SOTE_CONSTANTS = {
    DB_NAME: "textExpander",
    DB_VERSION: 4,
    STORE_ABBREVIATIONS: "abbreviations",
    STORE_RULES: "expansionRules",
    STORE_CHOICES: "choices",

    MESSAGE_TYPES: {
      // Mensagens para obter e transmitir o estado
      GET_STATE: "GET_STATE",
      STATE_UPDATED: "STATE_UPDATED",

      // Ações para modificar abreviações
      ADD_ABBREVIATION: "ADD_ABBREVIATION",
      UPDATE_ABBREVIATION: "UPDATE_ABBREVIATION",
      DELETE_ABBREVIATION: "DELETE_ABBREVIATION",
      IMPORT_DATA: "IMPORT_DATA", // Renomeado de IMPORT_ABBREVIATIONS
      CLEAR_ALL_DATA: "CLEAR_ALL_DATA",

      // Ações para modificar regras
      ADD_RULE: "ADD_RULE",
      UPDATE_RULE: "UPDATE_RULE",
      DELETE_RULE: "DELETE_RULE",

      // Ações para modificar escolhas
      ADD_CHOICE: "ADD_CHOICE",
      UPDATE_CHOICE: "UPDATE_CHOICE",
      GET_CHOICE_CONFIG: "GET_CHOICE_CONFIG",
      GET_ALL_CHOICES: "GET_ALL_CHOICES", // Novo

      // Outras ações
      UPDATE_USAGE: "UPDATE_USAGE",
      SETTINGS_UPDATED: "SETTINGS_UPDATED",
    },
  };
})(self || window);
