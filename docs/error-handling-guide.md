# Guia Abrangente de Tratamento de Erros - SOTE

## 📋 Visão Geral

Este documento detalha a implementação do sistema abrangente de tratamento de erros da extensão SOTE, incluindo categorização de erros, retry patterns, circuit breaker, logging estruturado e graceful degradation.

## 🏗️ Arquitetura do Sistema

### 1. Categorização de Erros

#### Erros Temporários (1000-1999)
Erros que podem ser resolvidos com retry ou aguardando um tempo:

```javascript
ERROR_CODES.TEMPORARY = {
  DATABASE_TIMEOUT: 1001,        // Timeout em operações de banco
  NETWORK_UNAVAILABLE: 1002,     // Rede indisponível
  SERVICE_BUSY: 1003,            // Serviço ocupado
  STORAGE_QUOTA_EXCEEDED: 1004,  // Quota de armazenamento excedida
  INDEXEDDB_BLOCKED: 1005,       // IndexedDB bloqueado
  CHROME_RUNTIME_DISCONNECTED: 1006, // Runtime desconectado
  TRANSACTION_CONFLICT: 1007,    // Conflito de transação
  RESOURCE_LOCKED: 1008          // Recurso bloqueado
}
```

#### Erros Permanentes (2000-2999)
Erros que indicam problemas de dados ou lógica que não devem ser retentados:

```javascript
ERROR_CODES.PERMANENT = {
  INVALID_DATA_FORMAT: 2001,     // Formato de dados inválido
  VALIDATION_FAILED: 2002,       // Falha na validação
  DUPLICATE_KEY: 2003,           // Chave duplicada
  MISSING_REQUIRED_FIELD: 2004,  // Campo obrigatório ausente
  SCHEMA_VIOLATION: 2005,        // Violação de schema
  PERMISSION_DENIED: 2006,       // Permissão negada
  UNSUPPORTED_OPERATION: 2007,   // Operação não suportada
  CORRUPTED_DATA: 2008,          // Dados corrompidos
  INVALID_CONFIGURATION: 2009    // Configuração inválida
}
```

#### Erros de Sistema (3000-3999)
Erros críticos do sistema:

```javascript
ERROR_CODES.SYSTEM = {
  INITIALIZATION_FAILED: 3001,      // Falha na inicialização
  DEPENDENCY_MISSING: 3002,         // Dependência ausente
  VERSION_MISMATCH: 3003,           // Incompatibilidade de versão
  CRITICAL_COMPONENT_FAILURE: 3004, // Falha de componente crítico
  MEMORY_EXHAUSTED: 3005            // Memória esgotada
}
```

### 2. Classes de Erro Customizadas

#### SoteError (Base)
```javascript
class SoteError extends Error {
  constructor(message, code, category, context = {}, originalError = null) {
    super(message);
    this.code = code;
    this.category = category;
    this.context = context;
    this.originalError = originalError;
    this.timestamp = new Date().toISOString();
    this.transactionId = context.transactionId || this._generateTransactionId();
  }
}
```

#### Uso das Classes Especializadas
```javascript
// Erro temporário
throw new TemporaryError(
  'Timeout na conexão com banco',
  ERROR_CODES.TEMPORARY.DATABASE_TIMEOUT,
  { operation: 'getAbbreviations', timeout: 5000 }
);

// Erro permanente
throw new PermanentError(
  'Dados de abreviação inválidos',
  ERROR_CODES.PERMANENT.VALIDATION_FAILED,
  { field: 'abbreviation', value: null }
);
```

## 🔄 Retry Pattern com Exponential Backoff

### Configuração
```javascript
const retryManager = new RetryManager({
  initialInterval: 100,    // Intervalo inicial: 100ms
  multiplier: 2,          // Fator multiplicador: 2
  maxAttempts: 3,         // Máximo de 3 tentativas
  maxTimeout: 30000,      // Timeout máximo: 30 segundos
  jitterRange: 100        // Jitter: 0-100ms
});
```

### Uso
```javascript
const result = await retryManager.execute(async (context) => {
  // Operação que pode falhar
  return await TextExpanderDB.getAbbreviations();
}, { operation: 'getAbbreviations' });
```

### Cálculo do Delay
```javascript
// Tentativa 1: 100ms + jitter (0-100ms)
// Tentativa 2: 200ms + jitter (0-100ms)  
// Tentativa 3: 400ms + jitter (0-100ms)
delay = Math.min(initialInterval * Math.pow(multiplier, attempt - 1) + jitter, maxTimeout)
```

## ⚡ Circuit Breaker Pattern

### Configuração
```javascript
const circuitBreaker = new CircuitBreaker({
  failureThreshold: 5,      // Abrir após 5 falhas
  timeWindow: 60000,        // Em 60 segundos
  halfOpenTimeout: 30000,   // Half-open após 30 segundos
  successThreshold: 3       // Fechar após 3 sucessos consecutivos
});
```

### Estados do Circuit Breaker

#### CLOSED (Fechado)
- Estado normal de operação
- Todas as requisições passam
- Monitora falhas dentro da janela de tempo

#### OPEN (Aberto)
- Rejeita todas as requisições imediatamente
- Ativado após atingir o threshold de falhas
- Permanece aberto pelo tempo definido em `halfOpenTimeout`

#### HALF_OPEN (Meio-Aberto)
- Permite um número limitado de requisições de teste
- Se sucessos >= `successThreshold`: volta para CLOSED
- Se falha: volta para OPEN

### Uso
```javascript
const result = await circuitBreaker.execute(async (context) => {
  return await databaseOperation();
}, { operation: 'database_read' });
```

## 📊 Sistema de Logging Estruturado

### Níveis de Log
```javascript
Logger.levels = {
  DEBUG: 0,  // Informações detalhadas para debugging
  INFO: 1,   // Informações gerais
  WARN: 2,   // Avisos que não impedem funcionamento
  ERROR: 3   // Erros que requerem atenção
}
```

### Estrutura do Log
```javascript
{
  timestamp: "2024-01-15T10:30:45.123Z",
  level: "ERROR",
  message: "Falha ao conectar com banco de dados",
  context: {
    transactionId: "tx_1705312245123_abc123",
    operation: "getAbbreviations",
    attempt: 2,
    error: { code: 1001, category: "TEMPORARY" }
  },
  stackTrace: "Error: Database timeout\n    at ..."
}
```

### Uso do Logger
```javascript
// Debug
Logger.debug('Iniciando operação', { operation: 'getState', userId: 123 });

// Info
Logger.info('Operação concluída com sucesso', { duration: '150ms' });

// Warning
Logger.warn('Cache expirado, recarregando dados', { cacheAge: '6min' });

// Error
Logger.error('Falha crítica no sistema', { 
  error: error.toJSON(),
  component: 'stateManager' 
});
```

### Rotação e Retenção de Logs
- **Buffer em memória**: 1000 logs máximo
- **Rotação automática**: Remove logs mais antigos quando excede limite
- **Persistência**: Logs críticos (ERROR) são persistidos no chrome.storage.local
- **Exportação**: Função para exportar todos os logs em JSON

## 🛡️ Graceful Degradation

### Componentes Críticos vs Não-Críticos

#### Críticos
```javascript
criticalComponents = new Set([
  'database',      // Banco de dados IndexedDB
  'stateManager',  // Gerenciador de estado
  'textExpansion'  // Funcionalidade principal
]);
```

#### Timeouts por Operação
```javascript
operationTimeouts = new Map([
  ['database', 5000],      // 5 segundos
  ['stateManager', 3000],  // 3 segundos
  ['textExpansion', 1000], // 1 segundo
  ['default', 10000]       // 10 segundos
]);
```

### Estratégias de Fallback

#### 1. Cache Local
```javascript
// Usar dados em cache quando operação principal falha
const result = await gracefulDegradationManager.executeWithFallback(
  'database',
  async () => await TextExpanderDB.getAbbreviations(),
  async () => getCachedAbbreviations(), // Fallback
  { operation: 'getAbbreviations' }
);
```

#### 2. Dados Mínimos
```javascript
// Inicialização com estado mínimo quando falha completa
const minimalState = {
  abbreviations: [],
  settings: { enabled: true },
  isEnabled: true
};
```

#### 3. Respostas Parciais
```javascript
// Para componentes não-críticos, retornar resposta parcial
return { 
  success: false, 
  error: error.message, 
  source: 'partial',
  data: null 
};
```

## 🔧 Handlers Específicos por Componente

### Database Handler
```javascript
const databaseHandler = ErrorHandlerFactory.createDatabaseHandler();

// Configuração otimizada para operações de banco
// - Retry: 3 tentativas com backoff exponencial
// - Circuit breaker: 5 falhas em 60s
// - Timeout: 30 segundos
```

### Network Handler
```javascript
const networkHandler = ErrorHandlerFactory.createNetworkHandler();

// Configuração otimizada para operações de rede
// - Retry: 2 tentativas com backoff mais rápido
// - Timeout: 10 segundos
```

## 📈 Monitoramento e Métricas

### Métricas Coletadas
```javascript
// Status dos componentes
componentStatus = {
  database: {
    healthy: true,
    lastSuccess: 1705312245123,
    consecutiveFailures: 0,
    isCritical: true
  }
}

// Estado do circuit breaker
circuitBreakerState = {
  state: 'CLOSED',
  failures: 2,
  successes: 0,
  lastFailureTime: 1705312245123
}
```

### Alertas Automáticos
- **Circuit breaker aberto**: Log de erro com emoji 🚨
- **Componente crítico falhando**: Logs de warning
- **Degradação ativada**: Logs informativos sobre fallbacks

## 🚨 Troubleshooting Guide

### Problemas Comuns

#### 1. "Circuit breaker está aberto"
**Causa**: Muitas falhas consecutivas em pouco tempo
**Solução**: 
- Aguardar 30 segundos para half-open
- Verificar logs para identificar causa raiz
- Verificar conectividade e recursos

#### 2. "Database timeout"
**Causa**: Operações de banco demoram mais que 30s
**Solução**:
- Verificar se IndexedDB não está bloqueado
- Limpar dados corrompidos se necessário
- Reiniciar extensão

#### 3. "Initialization failed"
**Causa**: Falha na inicialização do StateManager
**Solução**:
- Verificar se todas as dependências estão carregadas
- Verificar permissões da extensão
- Verificar logs de erro detalhados

#### 4. "Validation failed"
**Causa**: Dados não atendem ao schema esperado
**Solução**:
- Verificar formato dos dados de entrada
- Validar campos obrigatórios
- Verificar tipos de dados

### Comandos de Debug

#### Verificar Status dos Componentes
```javascript
// No console do service worker
const status = stateManagerSingleton.degradationManager.getComponentStatus();
console.log('Component Status:', status);
```

#### Verificar Circuit Breaker
```javascript
const cbState = SoteErrorManager.globalCircuitBreaker.getState();
console.log('Circuit Breaker:', cbState);
```

#### Exportar Logs
```javascript
const logs = await SoteErrorManager.Logger.exportLogs();
console.log('Logs:', logs);
```

#### Verificar Cache
```javascript
console.log('Cache size:', stateManagerSingleton.cache.size);
console.log('Cache keys:', Array.from(stateManagerSingleton.cache.keys()));
```

### Recuperação de Erros

#### Reset Completo
```javascript
// Limpar cache e reinicializar
stateManagerSingleton.destroy();
await initializeApp();
```

#### Limpar Logs
```javascript
SoteErrorManager.Logger.clearLogs();
```

#### Reset Circuit Breaker
```javascript
SoteErrorManager.globalCircuitBreaker._setState('CLOSED');
```

## 📊 Métricas de Performance

### Indicadores Monitorados
- **Taxa de sucesso**: % de operações bem-sucedidas
- **Tempo médio de resposta**: Latência das operações
- **Taxa de cache hit**: % de dados servidos do cache
- **Frequência de fallbacks**: Quantas vezes fallbacks foram usados

### Logs de Performance
```javascript
// A cada minuto, log de status de saúde
setInterval(() => {
  Logger.debug('Status de saúde dos componentes', {
    components: componentStatus,
    circuitBreaker: circuitBreakerState,
    cacheSize: cache.size
  });
}, 60000);
```

## 🔒 Considerações de Segurança

### Sanitização de Logs
- **Dados sensíveis**: Nunca logar senhas ou tokens
- **PII**: Evitar informações pessoais identificáveis
- **Contexto limitado**: Incluir apenas dados necessários para debug

### Retenção de Dados
- **Logs em memória**: Limitados a 1000 entradas
- **Logs persistidos**: Apenas erros críticos
- **Limpeza automática**: Rotação automática de logs antigos

---

## 📝 Resumo da Implementação

✅ **Categorização de Erros**: 3 categorias com códigos únicos
✅ **Retry Pattern**: Exponential backoff com jitter
✅ **Circuit Breaker**: 3 estados com thresholds configuráveis  
✅ **Logging Estruturado**: 4 níveis com contexto rico
✅ **Graceful Degradation**: Fallbacks e cache para componentes críticos
✅ **Monitoramento**: Métricas e alertas automáticos
✅ **Troubleshooting**: Guia completo de resolução de problemas

O sistema está pronto para produção com tratamento robusto de erros e recuperação automática!