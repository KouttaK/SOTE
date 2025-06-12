// SOTE-main/utils/constants.js
(function(global) {
  'use strict';

  global.SOTE_CONSTANTS = {
    DB_NAME: 'textExpander',
    DB_VERSION: 3,
    STORE_ABBREVIATIONS: 'abbreviations',
    STORE_RULES: 'expansionRules',
    MESSAGE_TYPES: {
      GET_ABBREVIATIONS: 'GET_ABBREVIATIONS',
      ABBREVIATIONS_UPDATED: 'ABBREVIATIONS_UPDATED',
      INITIAL_SEED_COMPLETE: 'INITIAL_SEED_COMPLETE',
      TOGGLE_ENABLED: 'TOGGLE_ENABLED',
      SETTINGS_UPDATED: 'SETTINGS_UPDATED',
      UPDATE_USAGE: 'UPDATE_USAGE'
    }
  };

})(self || window);
