// js/migracao.js
import { lerCachePerfil, lerCacheEscalas, limparCacheUsuario } from './storageCache.js';
import { 
  salvarPerfilLocal, 
  salvarEscalasLocais, 
  obterPerfilLocal, 
  obterEscalasLocais 
} from './indexedDB.js';

const CHAVE_FLAG_MIGRADO = 'diario_bordo_migracao_idb_concluida_';

/**
 * Migra os dados legados do localStorage para o IndexedDB de forma segura,
 * atômica e idempotente, prevenindo perda de dados antes da limpeza de cache.
 * 
 * @param {string} userId Identificador único do usuário autenticado
 */
export async function migrarLocalStorageParaIndexedDB(userId) {
  if (!userId) return;

  // 1. Evita reexecuções desnecessárias caso a migração já tenha sido concluída
  const jaMigrado = window.localStorage.getItem(`${CHAVE_FLAG_MIGRADO}${userId}`);
  if (jaMigrado === 'true') {
    return;
  }

  try {
    const envelopePerfil = lerCachePerfil(userId);
    const envelopeEscalas = lerCacheEscalas(userId);

    const temPerfil = Boolean(envelopePerfil?.dados);
    const temEscalas = Array.isArray(envelopeEscalas?.dados) && envelopeEscalas.dados.length > 0;

    // Se o localStorage estiver vazio para este usuário, apenas registra a flag e encerra
    if (!temPerfil && !temEscalas) {
      window.localStorage.setItem(`${CHAVE_FLAG_MIGRADO}${userId}`, 'true');
      return;
    }

    // 2. Persiste o perfil no IndexedDB
    if (temPerfil) {
      await salvarPerfilLocal(userId, envelopePerfil.dados);
    }

    // 3. Persiste as escalas no IndexedDB (como já sincronizadas com o servidor)
    if (temEscalas) {
      await salvarEscalasLocais(userId, envelopeEscalas.dados, true);
    }

    // 4. Validação de integridade estrita item a item antes de qualquer deleção
    const perfilGravado = temPerfil ? await obterPerfilLocal(userId) : true;
    
    let escalasValidas = true;
    if (temEscalas) {
      const escalasGravadas = await obterEscalasLocais(userId);
      const idsNoIndexedDB = new Set(escalasGravadas.map((e) => e.id));
      escalasValidas = envelopeEscalas.dados.every((e) => idsNoIndexedDB.has(e.id));
    }

    // 5. Só apaga o localStorage e grava a flag após confirmar que os dados estão no IndexedDB
    if (perfilGravado && escalasValidas) {
      limparCacheUsuario(userId);
      window.localStorage.setItem(`${CHAVE_FLAG_MIGRADO}${userId}`, 'true');
    }
  } catch (erro) {
    console.error('Falha na migração segura para IndexedDB:', erro);

    // Emite evento para que a interface (ui.js / app.js) possa alertar o usuário sem travar o app
    if (typeof window !== 'undefined' && window.dispatchEvent) {
      window.dispatchEvent(new CustomEvent('migracao:falha', {
        detail: { mensagem: 'Sincronização do armazenamento local pendente.' }
      }));
    }
  }
}