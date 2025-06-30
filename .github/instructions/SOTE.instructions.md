---
applyTo: "**"
description: "Guia mestre de desenvolvimento para a extensão SOTE. Contém a filosofia, arquitetura, padrões de código e fluxo de trabalho obrigatório para o projeto."
---

# 1. REGRAS GERAIS E FILOSOFIA DO PROJETO

## 1.1. Linguagem e Comunicação

- **Português do Brasil é Mandatório:** Toda e qualquer comunicação, comentário no código ou resposta deve ser estritamente em português do Brasil.

## 1.2. Identidade do Projeto

- **Contexto:** Este projeto é uma extensão para Chrome chamada **SOTE (Expansor de Texto)**. A arquitetura é baseada em scripts de conteúdo (`content`), um service worker de fundo (`background`), um `popup` e um `dashboard` para gerenciamento.
- **Tecnologias:** O projeto utiliza **JavaScript puro (Vanilla JS)** com funcionalidades modernas (ES6+ Classes, async/await), HTML5 e CSS3. A interação com o navegador é feita através das **APIs de Extensão do Chrome**.
- **Importante:** O projeto **não utiliza frameworks como React, Vue ou Angular**. Toda a manipulação da interface do usuário (UI) é feita diretamente no DOM (`document.createElement`, `element.addEventListener`, etc.).

## 1.3. Estrutura e "Desmodularização"

- **Centralização por Feature:** Para facilitar o contexto da IA e evitar duplicação, a lógica de uma feature principal (ex: `dashboard`, `popup`, `autocomplete`) deve ser centralizada em seus respectivos arquivos JS.
- **Evite Micro-arquivos:** Não quebre a lógica de uma única feature (ex: `dashboard.js`) em múltiplos arquivos menores (como `dashboard-ui.js`, `dashboard-events.js`). Mantenha tudo coeso no arquivo principal da feature.
- **Utils Reutilizáveis:** Funções verdadeiramente genéricas e reutilizáveis por múltiplas features (como `db.js`, `notifier.js`) devem residir na pasta `/utils`.

## 1.4. Gerenciamento de Estado

- **Estado Global:** Configurações e estados simples são gerenciados via `chrome.storage.sync`.
- **Dados Persistentes:** O armazenamento principal de dados (abreviações, regras, escolhas) é feito com **IndexedDB**, através do wrapper em `utils/db.js`.
- **Estado da UI:** O estado visual dos componentes é controlado diretamente via JavaScript, manipulando o DOM e suas classes CSS. Não há uma biblioteca de gerenciamento de estado como Redux ou Zustand.

# 2. FLUXO DE DESENVOLVIMENTO OBRIGATÓRIO

Este fluxo é inegociável e deve ser seguido rigorosamente para garantir a integridade do código.

### **PRIMEIRO: FASE DE ANÁLISE**

- Antes de qualquer modificação, identifique e liste todos os arquivos que serão impactados.
- Para cada arquivo, detalhe quais trechos de código, estilos e funcionalidades existentes **devem permanecer imutáveis** para não quebrar a aplicação.

### **SEGUNDO: FASE DE PLANEJAMENTO**

- Após a análise, se a tarefa for complexa, quebre-a em um plano de ação com passos menores e lógicos.
- Apresente este plano de forma clara antes de iniciar a implementação.

### **TERCEIRO: FASE DE EXECUÇÃO SEQUENCIAL**

1.  **Peça Permissão:** Decida o primeiro e melhor passo do plano. Explicite qual será e peça permissão para executá-lo.
2.  **Aguarde o "OK":** Espere a confirmação explícita do usuário antes de prosseguir.
3.  **Execute o Passo:** Realize a modificação combinada.
4.  **Repita:** Para cada passo subsequente, retorne ao item 1: analise o que deve permanecer imutável, detalhe o próximo passo e peça permissão para continuar. Faça apenas uma ação por vez.

# 3. PADRÕES DE CÓDIGO E ARQUITETURA

## 3.1. JavaScript

- **Padrão:** Utilize o padrão IIFE `(function(global) { ... })(self || window);` para encapsular os scripts e evitar poluição do escopo global.
- **Nomenclatura:**
  - `PascalCase` para Classes (ex: `AutocompleteManager`).
  - `camelCase` para variáveis e funções (ex: `handleSaveAbbreviation`).
  - `UPPER_SNAKE_CASE` para constantes globais (ex: `DB_NAME` em `constants.js`).
- **Comunicação:** A comunicação entre os diferentes contextos da extensão (content script, service worker, popup) é feita via `chrome.runtime.sendMessage` e `chrome.runtime.onMessage`. O `service-worker.js` atua como o hub central.

## 3.2. CSS

- **DRY (Don't Repeat Yourself):** O arquivo `dashboard/dashboard.css` contém o Design System principal, com um sistema robusto de variáveis CSS (`:root`).
- **Reutilização:** Sempre utilize as variáveis CSS (`--primary-500`, `--space-4`, etc.) e classes de utilidade existentes antes de criar novos estilos. Isso mantém a consistência visual em toda a extensão.

## 3.3. HTML

- **Semântica e Acessibilidade:** Utilize tags HTML semânticas (`<header>`, `<main>`, `<aside>`, etc.) e atributos ARIA (`role`, `aria-label`, etc.) para garantir a acessibilidade, especialmente nos modais e elementos interativos.

## 3.4. Manifesto (`manifest.json`)

- **Ponto de Entrada:** É o arquivo central que define a estrutura da extensão.
- **Modificações:** Qualquer nova permissão, script de conteúdo, recurso acessível pela web (`web_accessible_resources`) ou alteração no service worker deve ser refletida aqui.

# 4. PONTOS DE ATENÇÃO E CONTEXTO DAS FEATURES

- **Banco de Dados (`utils/db.js`):** A persistência de dados é feita via IndexedDB. O arquivo gerencia as `stores` de `abbreviations`, `expansionRules` e `choices`. Note o sistema de migração por versão para futuras alterações de schema.
- **Lógica de Expansão (`utils/expansion.js`):** A expansão de texto é complexa. Ela não só substitui texto, mas também:
  - Avalia regras contextuais (domínio, dia, hora).
  - Processa ações especiais como `$cursor$`, `$transferencia$` e a ação interativa `$choice(id=...)$`, que exibe um modal para o usuário.
- **Autocomplete (`utils/autocomplete.js`):** Esta feature se anexa a campos de texto e `contenteditable` para sugerir abreviações. Ela utiliza um `debounce` para performance e ordena as sugestões baseada em estatísticas de uso.
- **Modais (`utils/*Modal.js`):** O projeto utiliza múltiplos modais customizados (`confirmationModal`, `choiceSelectionModal`). Eles são injetados dinamicamente na página e devem ser usados para qualquer interação que necessite de confirmação ou escolha do usuário.
- **Dashboard (`dashboard/`):** É a principal interface de gerenciamento. Permite CRUD completo sobre abreviações, configuração de regras, importação/exportação de dados e ajustes finos nas configurações da extensão.
- **Popup (`popup/`):** É a interface de acesso rápido. Focada em adicionar/editar e buscar abreviações de forma ágil.
