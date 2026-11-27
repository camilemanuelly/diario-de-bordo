import {
  obterFilaPendente,
  marcarStatusFila,
  reagendarTentativaFila,
  removerDaFila,
  confirmarEscalaSincronizada,
  removerEscalaLocal,
  salvarPerfilLocal
} from './indexedDB.js';

import {
  salvarEscala,
  excluirEscalaPorId,
  atualizarPerfilUsuario
} from './supabaseClient.js';

let sincronizacaoEmAndamento = false;
let timerRetry = null;

/**
 * Identifica se a falha decorre estritamente de falta de conectividade.
 * Se o erro contiver `code` (SQLSTATE do PostgreSQL), a requisição alcançou
 * o servidor e foi rejeitada por regra de negócio — portanto, NÃO é erro de rede.
 */
function ehErroDeRede(erro) {
  if (!navigator.onLine) return true;
  if (erro?.code) return false;

  const msg = String(erro?.message || erro || '').toLowerCase();
  return (
    msg.includes('failed to fetch') ||
    msg.includes('network') ||
    msg.includes('timeout') ||
    msg.includes('load failed') ||
    msg.includes('connection refused')
  );
}

/**
 * Processa a fila de mutações pendentes em sequência cronológica estrita.
 */
export async function processarFilaSincronizacao() {
  if (sincronizacaoEmAndamento) return;
  if (!navigator.onLine) return;

  sincronizacaoEmAndamento = true;

  if (timerRetry) {
    clearTimeout(timerRetry);
    timerRetry = null;
  }

  try {
    const itensPendentes = await obterFilaPendente();
    if (!itensPendentes.length) {
      return;
    }

    for (const item of itensPendentes) {
      // Interrompe se a conexão cair no meio do processamento da fila
      if (!navigator.onLine) break;

      await marcarStatusFila(item.id, 'processando');

      try {
        await despacharMutacao(item);
        // Sucesso: remove o item processado da fila
        await removerDaFila(item.id);
      } catch (erro) {
        if (ehErroDeRede(erro)) {
          // Erro de infraestrutura: agenda retry exponencial e interrompe a fila
          const { proximaTentativaEm } = await reagendarTentativaFila(item.id, item.tentativas);
          const tempoEspera = Math.max(0, proximaTentativaEm - Date.now());

          timerRetry = setTimeout(() => {
            processarFilaSincronizacao();
          }, tempoEspera);

          console.warn(`[SyncEngine] Queda de rede. Nova tentativa em ${Math.round(tempoEspera / 1000)}s`);
          break;
        } else {
          // Erro de negócio (ex: violação de exclusão daterange/btree_gist):
          // Marca erro permanente na fila e dispara evento para alerta na UI
          await marcarStatusFila(item.id, 'erro_negocio', erro);

          if (typeof window !== 'undefined' && window.dispatchEvent) {
            window.dispatchEvent(
              new CustomEvent('sync:erro_negocio', {
                detail: { item, erro }
              })
            );
          }
          console.error('[SyncEngine] Falha de regra de negócio:', erro);
        }
      }
    }
  } catch (erroFila) {
    console.error('[SyncEngine] Exceção ao processar fila:', erroFila);
  } finally {
    sincronizacaoEmAndamento = false;
  }
}

/**
 * Alias público para disparar a sincronização imediatamente após mutações locais
 */
export function dispararSync() {
  return processarFilaSincronizacao();
}

/**
 * Encaminha cada mutação para o método correspondente do Supabase
 */
async function despacharMutacao(item) {
  const { tabela, operacao, payload } = item;

  if (tabela === 'escalas') {
    if (operacao === 'INSERT') {
      const tempId = payload.id;
      const registroServidor = await salvarEscala({
        editId: null,
        userId: payload.userId || payload.user_id,
        payload: {
          tipo: payload.tipo,
          data_inicio: payload.data_inicio,
          data_fim: payload.data_fim,
          dias_totais: payload.dias_totais,
          observacao: payload.observacao || null
        }
      });

      if (!registroServidor?.id) {
        throw new Error('Servidor não retornou o registro de escala inserido.');
      }

      // Substitui temp_ -> idReal e propaga em itens dependentes da fila
      await confirmarEscalaSincronizada(tempId, registroServidor);
      return;
    }

    if (operacao === 'UPDATE') {
      const idReal = payload.editId || payload.id;
      const registroServidor = await salvarEscala({
        editId: idReal,
        userId: payload.userId || payload.user_id,
        payload: {
          tipo: payload.tipo,
          data_inicio: payload.data_inicio,
          data_fim: payload.data_fim,
          dias_totais: payload.dias_totais,
          observacao: payload.observacao || null
        }
      });

      if (!registroServidor?.id) {
        throw new Error('Servidor não retornou o registro de escala atualizado.');
      }

      await confirmarEscalaSincronizada(idReal, registroServidor);
      return;
    }

    if (operacao === 'DELETE') {
      const id = payload.id;
      // Se era registro provisório que sequer subiu para a nuvem, apenas limpa localmente
      if (typeof id === 'string' && id.startsWith('temp_')) {
        await removerEscalaLocal(id);
        return;
      }

      await excluirEscalaPorId(id);
      await removerEscalaLocal(id);
      return;
    }
  }

  if (tabela === 'perfis' && operacao === 'UPDATE') {
    const atualizado = await atualizarPerfilUsuario(payload.userId, payload.dados);
    if (!atualizado) {
      throw new Error('Servidor não retornou o perfil atualizado.');
    }
    await salvarPerfilLocal(payload.userId, atualizado);
    return;
  }

  throw new Error(`Operação desconhecida na fila: ${tabela}.${operacao}`);
}

/**
 * Inicializa os gatilhos automáticos do SyncEngine
 */
export function inicializarSyncEngine() {
  if (typeof window === 'undefined') return;

  // Gatilho 1: Reconexão de rede
  window.addEventListener('online', () => {
    console.info('[SyncEngine] Conexão restabelecida. Disparando fila...');
    dispararSync();
  });

  // Gatilho 2: Checagem inicial no boot
  if (navigator.onLine) {
    dispararSync();
  }
}