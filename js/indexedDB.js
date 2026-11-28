const DB_NOME = 'diario_bordo_db';
const DB_VERSAO = 1;

let conexaoDb = null;

/**
 * Inicializa ou recupera a conexão com o IndexedDB
 */
export function abrirBanco() {
  if (conexaoDb) return Promise.resolve(conexaoDb);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NOME, DB_VERSAO);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // 1. Store de Perfis
      if (!db.objectStoreNames.contains('perfis')) {
        db.createObjectStore('perfis', { keyPath: 'userId' });
      }

      // 2. Store de Escalas
      if (!db.objectStoreNames.contains('escalas')) {
        const storeEscalas = db.createObjectStore('escalas', { keyPath: 'id' });
        storeEscalas.createIndex('idx_userId', 'userId', { unique: false });
        storeEscalas.createIndex('idx_data_inicio', 'data_inicio', { unique: false });
      }

      // 3. Store da Fila de Sincronização (Sync Queue)
      if (!db.objectStoreNames.contains('sync_queue')) {
        const storeQueue = db.createObjectStore('sync_queue', { keyPath: 'id', autoIncrement: true });
        storeQueue.createIndex('idx_timestamp', 'timestamp', { unique: false });
        storeQueue.createIndex('idx_status', 'status', { unique: false });
      }
    };

    request.onsuccess = (event) => {
      conexaoDb = event.target.result;
      resolve(conexaoDb);
    };

    request.onerror = (event) => {
      reject(new Error(`Erro ao abrir IndexedDB: ${event.target.error}`));
    };
  });
}

/**
 * Executa uma transação genérica no IndexedDB encapsulada em Promise
 */
async function executarTransacao(storeName, modo, operacao) {
  const db = await abrirBanco();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, modo);
    const store = tx.objectStore(storeName);

    const request = operacao(store);

    tx.oncomplete = () => resolve(request?.result);
    tx.onerror = (e) => reject(e.target.error);
    tx.onabort = (e) => reject(new Error(`Transação abortada: ${e.target.error}`));
  });
}

// ==========================================
// OPERAÇÕES: PERFIS
// ==========================================

export async function salvarPerfilLocal(userId, dadosPerfil) {
  if (!userId) return false;
  const registro = {
    userId,
    ...dadosPerfil,
    atualizadoEm: new Date().toISOString()
  };
  await executarTransacao('perfis', 'readwrite', (store) => store.put(registro));
  return true;
}

export async function obterPerfilLocal(userId) {
  if (!userId) return null;
  return executarTransacao('perfis', 'readonly', (store) => store.get(userId));
}

// ==========================================
// OPERAÇÕES: ESCALAS
// ==========================================

export async function salvarEscalasLocais(userId, listaEscalas, sincronizado = true) {
  if (!userId || !Array.isArray(listaEscalas)) return false;
  const db = await abrirBanco();

  return new Promise((resolve, reject) => {
    const tx = db.transaction('escalas', 'readwrite');
    const store = tx.objectStore('escalas');

  for (const escala of listaEscalas) {
    store.put({
      ...escala,
      userId,
      sincronizado: escala.sincronizado ?? sincronizado,
      atualizadoEmLocal: new Date().toISOString()
  });
}

    tx.oncomplete = () => resolve(true);
    tx.onerror = (e) => reject(e.target.error);
  });
}

export async function obterEscalasLocais(userId) {
  if (!userId) return [];
  const db = await abrirBanco();

  return new Promise((resolve, reject) => {
    const tx = db.transaction('escalas', 'readonly');
    const store = tx.objectStore('escalas');
    const index = store.index('idx_userId');
    const request = index.getAll(userId);

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = (e) => reject(e.target.error);
  });
}

export async function removerEscalaLocal(id) {
  await executarTransacao('escalas', 'readwrite', (store) => store.delete(id));
  return true;
}

// ==========================================
// OPERAÇÕES: SYNC QUEUE (FILA DE MUTAÇÃO)
// ==========================================

/**
 * Enfileira uma mutação para envio posterior ao Supabase
 * @param {'escalas' | 'perfis'} tabela
 * @param {'INSERT' | 'UPDATE' | 'DELETE'} operacao
 * @param {Object} payload Dados da entidade
 */
export async function enfileirarMutacao(tabela, operacao, payload) {
  const itemFila = {
    tabela,
    operacao,
    payload,
    timestamp: Date.now(),
    tentativas: 0,
    status: 'pendente'
  };

  return executarTransacao('sync_queue', 'readwrite', (store) => store.add(itemFila));
}

/**
 * Retorna os itens pendentes ordenados pelo timestamp
 */
export async function obterFilaPendente() {
  const db = await abrirBanco();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('sync_queue', 'readonly');
    const store = tx.objectStore('sync_queue');
    const index = store.index('idx_timestamp');
    const request = index.getAll();

    request.onsuccess = () => {
      const agora = Date.now();
      const itens = request.result || [];
      resolve(
        itens.filter(
          (item) => item.status === 'pendente' && (!item.proximaTentativaEm || item.proximaTentativaEm <= agora)
        )
      );
    };
    request.onerror = (e) => reject(e.target.error);
  });
}

export async function removerDaFila(id) {
  await executarTransacao('sync_queue', 'readwrite', (store) => store.delete(id));
  return true;
}

export async function incrementarTentativaFila(id, tentativasAtuais) {
  const db = await abrirBanco();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('sync_queue', 'readwrite');
    const store = tx.objectStore('sync_queue');
    const getReq = store.get(id);

    getReq.onsuccess = () => {
      const item = getReq.result;
      if (item) {
        item.tentativas = (tentativasAtuais || item.tentativas) + 1;
        store.put(item);
      }
      resolve(true);
    };
    tx.onerror = (e) => reject(e.target.error);
  });
}

// ==========================================
// OPERAÇÕES: SYNC ENGINE
// ==========================================

export async function marcarStatusFila(id, status, erroInfo = null) {
  const db = await abrirBanco();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('sync_queue', 'readwrite');
    const store = tx.objectStore('sync_queue');
    const getReq = store.get(id);

    getReq.onsuccess = () => {
      const item = getReq.result;
      if (!item) return resolve(false);
      item.status = status;
      if (erroInfo) {
        item.ultimoErro = String(erroInfo?.message || erroInfo);
      }
      store.put(item);
      resolve(true);
    };
    tx.onerror = (e) => reject(e.target.error);
  });
}

export async function reagendarTentativaFila(id, tentativasAtuais = null) {
  const db = await abrirBanco();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('sync_queue', 'readwrite');
    const store = tx.objectStore('sync_queue');
    const getReq = store.get(id);

    getReq.onsuccess = () => {
      const item = getReq.result;
      if (!item) return resolve(false);
      const tentativas = (tentativasAtuais ?? item.tentativas ?? 0) + 1;
      const delay = Math.min(Math.pow(2, tentativas) * 1000, 60_000);
      item.tentativas = tentativas;
      item.proximaTentativaEm = Date.now() + delay;
      item.status = 'pendente';
      store.put(item);
      resolve({ tentativas, proximaTentativaEm: item.proximaTentativaEm });
    };
    tx.onerror = (e) => reject(e.target.error);
  });
}

export async function confirmarEscalaSincronizada(tempId, escalaServidor) {
  if (!tempId || !escalaServidor?.id) return false;
  const idReal = escalaServidor.id;
  const db = await abrirBanco();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(['escalas', 'sync_queue'], 'readwrite');
    const escalasStore = tx.objectStore('escalas');
    const filaStore = tx.objectStore('sync_queue');

    if (tempId !== idReal) {
      escalasStore.delete(tempId);
    }

    escalasStore.put({
      ...escalaServidor,
      userId: escalaServidor.user_id || escalaServidor.userId,
      sincronizado: true,
      atualizadoEmLocal: new Date().toISOString()
    });

    if (tempId !== idReal) {
      const cursorReq = filaStore.openCursor();
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor) return;
        const item = cursor.value;
        let alterado = false;
        if (item.payload) {
          if (item.payload.id === tempId) { item.payload.id = idReal; alterado = true; }
          if (item.payload.editId === tempId) { item.payload.editId = idReal; alterado = true; }
        }
        if (alterado) cursor.update(item);
        cursor.continue();
      };
    }

    tx.oncomplete = () => resolve(true);
    tx.onerror = (e) => reject(e.target.error);
    tx.onabort = (e) => reject(new Error(`Transação abortada: ${e.target.error}`));
  });
}

/**
 * Crash recovery: itens que ficaram em 'processando' (aba fechada
 * no meio do envio) voltam para 'pendente' no próximo boot.
 * Idempotente: chamar múltiplas vezes é seguro.
 */
export async function resetarStatusProcessando() {
  const db = await abrirBanco();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('sync_queue', 'readwrite');
    const store = tx.objectStore('sync_queue');
    const index = store.index('idx_status');
    const request = index.getAll('processando');

    request.onsuccess = () => {
      const itens = request.result || [];
      for (const item of itens) {
        item.status = 'pendente';
        store.put(item);
      }
      resolve(itens.length);
    };
    tx.onerror = (e) => reject(e.target.error);
  });
}