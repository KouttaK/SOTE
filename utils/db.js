// SOTE-main/utils/db.js
(function (global) {
  "use strict";

  // Verifica se o Dexie foi carregado
  if (typeof global.Dexie === "undefined") {
    console.error(
      "Dexie.js não foi carregado. Verifique o manifest.json e a presença do arquivo dexie.js."
    );
    return;
  }

  const {
    DB_NAME,
    DB_VERSION,
    STORE_ABBREVIATIONS,
    STORE_RULES,
    STORE_CHOICES,
  } = global.SOTE_CONSTANTS;

  // 1. Define a instância do banco de dados Dexie
  const db = new global.Dexie(DB_NAME);

  // 2. Define o schema do banco de dados
  // A sintaxe é muito mais simples: "primaryKey,index1,index2,..."
  db.version(DB_VERSION).stores({
    [STORE_ABBREVIATIONS]: "abbreviation, category, lastUsed, usageCount", // "abbreviation" é a chave primária
    [STORE_RULES]: "++id, abbreviationId", // "++id" para auto-incremento
    [STORE_CHOICES]: "++id", // "++id" para auto-incremento
  });

  // Mapeia as classes de modelo para as tabelas para validação (opcional, mas boa prática)
  // Isso não é mais necessário, pois a validação será feita antes de chamar o Dexie.

  // 3. Exporta a instância do DB para ser usada em outros módulos
  global.TextExpanderDB = db;
  console.log(
    `[SOTE DB] Dexie.js inicializado para o banco '${DB_NAME}' versão ${DB_VERSION}.`
  );
})(self || window);
