import { APP_CONFIG } from './config.js';

import {
  calcularDias,
  calcularMetricasFolga,
  gerarMapaCalendarioEPrevisao,
  normalizarRegraEscala,
  obterHojeISO,
  parseISODateLocal,
  subtrairUmDiaISO
} from './escalaEngine.js';

import {
  lerAvisoFolgaVistoHoje,
  lerCacheEscalas,
  lerContinuaTrabalhandoHoje,
  lerFlagStorage,
  marcarAvisoFolgaVistoHoje,
  salvarContinuaTrabalhandoHoje
} from './storageCache.js';

import {
  atualizarUsuarioAuth,
  buscarOuCriarPerfil,
  cadastrarComSenha,
  entrarComSenha,
  enviarResetSenha,
  escutarMudancaAuth,
  limparEscalasUsuario,
  listarEscalasUsuario,
  obterClienteSupabase,
  obterSessaoAtual,
  sairDaConta,
  traduzirErroSupabase,
  uploadAvatarUsuario
} from './supabaseClient.js';

import {
  abrirModalEdicaoRegistroUI,
  abrirModalNovoRegistroUI,
  alternarFormularioSecao,
  alternarVisaoAutenticada,
  atualizarBannerOffline,
  atualizarModoAuthUI,
  definirMensagemAuth,
  fecharFormulariosPerfilEConta,
  fecharModalRegistroUI,
  mostrarToast,
  renderizarAvisoFolgaPendenteUI,
  renderizarBannerPrevisaoUI,
  renderizarCalendarioUI,
  renderizarMetricasUI,
  renderizarPerfilUI,
  renderizarTabelaEscalasUI,
  selecionarTipoRegistroUI
} from './ui.js';

import {
  obterPerfilLocal,
  salvarPerfilLocal,
  obterEscalasLocais,
  salvarEscalasLocais,
  obterFilaPendente,
  removerEscalaLocal,
  resetarStatusProcessando,
  enfileirarMutacao
} from './indexedDB.js';

import { dispararSync, inicializarSyncEngine } from './syncEngine.js';

import { migrarLocalStorageParaIndexedDB } from './migracao.js';

const estado = {
  modoAuth: 'login',
  usuarioAtual: null,
  perfilAtual: null,
  registrosCache: [],
  mesReferencia: (() => {
    const d = new Date();
    d.setDate(1);
    return d;
  })(),
  avisoFolgaDispensadoData: lerFlagStorage(APP_CONFIG.storageKeys.avisoFolgaDispensado),
  continuaTrabalhandoConfirmadoHoje: lerFlagStorage(APP_CONFIG.storageKeys.continuaTrabalhandoHoje)
};

function obterRegraAtiva() {
  const inputTrab = document.getElementById('input-dias-trabalho');
  const inputFolg = document.getElementById('input-dias-folga');

  const base = {
    dias_trabalho: inputTrab?.value ?? estado.perfilAtual?.dias_trabalho,
    dias_folga: inputFolg?.value ?? estado.perfilAtual?.dias_folga
  };

  return normalizarRegraEscala(base);
}

function atualizarTelasDeEscala() {
  const userId = estado.usuarioAtual?.id || null;
  const regraEscala = obterRegraAtiva();
  const metricas = calcularMetricasFolga(estado.registrosCache, regraEscala);
  renderizarMetricasUI(metricas);
  renderizarTabelaEscalasUI(estado.registrosCache);

  const hojeIso = obterHojeISO();
  const avisoVistoHoje = lerAvisoFolgaVistoHoje(userId);
  const continuaTrabHoje = lerContinuaTrabalhandoHoje(userId);

  estado.avisoFolgaDispensadoData = avisoVistoHoje;
  estado.continuaTrabalhandoConfirmadoHoje = continuaTrabHoje;

  const { mapaDias, previsao } = gerarMapaCalendarioEPrevisao({
    registros: estado.registrosCache,
    regraEscala,
    hojeIso,
    avisoDispensadoData: avisoVistoHoje,
    continuaTrabalhandoHoje: continuaTrabHoje
  });

  const hojeTemRegistroReal = Boolean(mapaDias[hojeIso]?.real);

  renderizarBannerPrevisaoUI({ previsao, regraEscala, hojeTemRegistroReal });
  renderizarAvisoFolgaPendenteUI(previsao);
  renderizarCalendarioUI({
    mesReferencia: estado.mesReferencia,
    mapaDias,
    continuaTrabalhandoHoje: estado.continuaTrabalhandoConfirmadoHoje,
    onSelecionarDia: (iso) => {
      abrirModalNovoRegistroUI({
        dataInicialISO: iso,
        tipoInicial: 'Porto',
        embarcacaoPadrao: (estado.perfilAtual?.embarcacao || '').trim()
      });
    },
    onMarcarFolgaDia: (iso) => {
      abrirModalNovoRegistroUI({
        dataInicialISO: iso,
        tipoInicial: 'Folga',
        embarcacaoPadrao: (estado.perfilAtual?.embarcacao || '').trim()
      });
    }
  });
}

function reconciliarEscalas({ escalasServidor, escalasLocais, filaPendente }) {
  const idsEmMutacao = new Set();
  const idsDeletadosLocalmente = new Set();

  for (const item of filaPendente) {
    if (item.tabela !== 'escalas') continue;
    const idAlvo = String(item.payload?.editId ?? item.payload?.id ?? '');
    if (!idAlvo) continue;

    if (item.operacao === 'DELETE') {
      idsDeletadosLocalmente.add(idAlvo);
    } else {
      idsEmMutacao.add(idAlvo);
    }
  }

  const baseServidorLimpa = escalasServidor.filter((escala) => {
    const id = String(escala.id);
    if (idsDeletadosLocalmente.has(id)) return false;
    if (idsEmMutacao.has(id)) return false;
    return true;
  });

  const pendentesLocais = escalasLocais.filter((escala) => {
    const id = String(escala.id);
    const isTemp = typeof escala.id === 'string' && escala.id.startsWith('temp_');
    const isModificado = idsEmMutacao.has(id);
    return (isTemp || isModificado) && !idsDeletadosLocalmente.has(id);
  });

  const resultado = [...pendentesLocais, ...baseServidorLimpa];
  resultado.sort((a, b) => (b.data_inicio || '').localeCompare(a.data_inicio || ''));
  return resultado;
}

async function carregarPerfilApp() {
  if (!estado.usuarioAtual) return;
  const userId = estado.usuarioAtual.id;

  try {
    const perfilLocal = await obterPerfilLocal(userId);
    if (perfilLocal) {
      estado.perfilAtual = perfilLocal;
      renderizarPerfilUI({ perfil: estado.perfilAtual, usuario: estado.usuarioAtual });
    }
  } catch (erroIdb) {
    console.warn('[Perfil] Leitura local IDB falhou:', erroIdb);
  }

  if (!navigator.onLine) {
    atualizarBannerOffline({ ativo: true });
    return;
  }

  try {
    const fila = await obterFilaPendente();
    const temUpdatePendente = fila.some(
      (item) => item.tabela === 'perfis' && item.operacao === 'UPDATE'
    );
    if (temUpdatePendente) return;

    const perfilServidor = await buscarOuCriarPerfil(estado.usuarioAtual);
    if (perfilServidor) {
      estado.perfilAtual = perfilServidor;
      await salvarPerfilLocal(userId, perfilServidor);
      atualizarBannerOffline({ ativo: false });
      renderizarPerfilUI({ perfil: estado.perfilAtual, usuario: estado.usuarioAtual });
    }
  } catch (erro) {
    console.warn('[Perfil] Revalidação remota falhou:', erro);
    atualizarBannerOffline({ ativo: true });
  }
}

let carregandoEscalas = false;
let recarregarPendente = false;

async function carregarEscalasApp(opcoes = { renderLocalPrimeiro: true }) {
  if (carregandoEscalas) {
    recarregarPendente = true;
    return;
  }
  carregandoEscalas = true;

  try {
    if (!estado.usuarioAtual) return;
    const userId = estado.usuarioAtual.id;
    let escalasLocais = [];

    if (opcoes.renderLocalPrimeiro) {
      try {
        escalasLocais = (await obterEscalasLocais(userId)) || [];
        if (escalasLocais.length > 0) {
          estado.registrosCache = escalasLocais;
          atualizarTelasDeEscala();
        }
      } catch (erroIdb) {
        console.warn('[Escalas] Leitura local IDB falhou:', erroIdb);
      }
    }

    if (!navigator.onLine) {
      atualizarBannerOffline({ ativo: true });
      return;
    }

    try {
      if (escalasLocais.length === 0) {
        escalasLocais = (await obterEscalasLocais(userId)) || [];
      }

      const escalasServidor = await listarEscalasUsuario();
      const filaPendente = await obterFilaPendente();

      const escalasReconciliadas = reconciliarEscalas({
        escalasServidor,
        escalasLocais,
        filaPendente
      });

      estado.registrosCache = escalasReconciliadas;
      await salvarEscalasLocais(userId, escalasReconciliadas);

      atualizarBannerOffline({ ativo: false });
      atualizarTelasDeEscala();
    } catch (erro) {
      console.warn('[Escalas] Revalidação remota falhou:', erro);
      atualizarBannerOffline({ ativo: true });
    }
  } finally {
    carregandoEscalas = false;
    if (recarregarPendente) {
      recarregarPendente = false;
      await carregarEscalasApp({ renderLocalPrimeiro: false });
    }
  }
}

async function aplicarSessao(session) {
  estado.usuarioAtual = session?.user || null;

  if (estado.usuarioAtual) {
    const userId = estado.usuarioAtual.id;
    estado.avisoFolgaDispensadoData = lerAvisoFolgaVistoHoje(userId);
    estado.continuaTrabalhandoConfirmadoHoje = lerContinuaTrabalhandoHoje(userId);
    alternarVisaoAutenticada(true);
    fecharFormulariosPerfilEConta();

    try {
      await migrarLocalStorageParaIndexedDB(userId);
    } catch (errMig) {
      console.warn('[Migração] Falha na migração localStorage->IDB:', errMig);
    }

    try {
      const resetados = await resetarStatusProcessando();
      if (resetados > 0) {
        console.info(`[SyncEngine] ${resetados} item(ns) resetados para 'pendente' no boot.`);
      }
    } catch (errReset) {
      console.warn('[SyncEngine] Falha ao resetar status processando:', errReset);
    }

    await carregarPerfilApp();
    await carregarEscalasApp();
  } else {
    estado.perfilAtual = null;
    estado.registrosCache = [];
    estado.avisoFolgaDispensadoData = null;
    estado.continuaTrabalhandoConfirmadoHoje = null;
    atualizarBannerOffline({ ativo: false });
    alternarVisaoAutenticada(false);
  }
}

async function estenderUltimoTrabalhoSeNecessario(dataInicioFolga, userId) {
  if (!dataInicioFolga || !userId) return;
  const diaAntesFolga = subtrairUmDiaISO(dataInicioFolga);

  const ultimoTrabalho = [...estado.registrosCache]
    .filter((r) =>
      (r.tipo === 'Embarque' || r.tipo === 'Porto') &&
      r.data_inicio <= dataInicioFolga &&
      r.data_fim < diaAntesFolga
    )
    .sort((a, b) => {
      if (a.data_fim !== b.data_fim) return b.data_fim.localeCompare(a.data_fim);
      return String(b.id || '').localeCompare(String(a.id || ''));
    })[0];

  if (!ultimoTrabalho?.id) return;

  const novosDiasTotais = calcularDias(ultimoTrabalho.data_inicio, diaAntesFolga);
  const registroAtualizado = {
    ...ultimoTrabalho,
    userId,
    user_id: userId,
    data_fim: diaAntesFolga,
    dias_totais: novosDiasTotais,
    sincronizado: false
  };

  const idx = estado.registrosCache.findIndex((r) => String(r.id) === String(ultimoTrabalho.id));
  if (idx >= 0) {
    estado.registrosCache[idx] = registroAtualizado;
  }

  await salvarEscalasLocais(userId, [registroAtualizado], false);
  await enfileirarMutacao('escalas', 'UPDATE', {
    editId: ultimoTrabalho.id,
    id: ultimoTrabalho.id,
    userId,
    tipo: registroAtualizado.tipo,
    data_inicio: registroAtualizado.data_inicio,
    data_fim: registroAtualizado.data_fim,
    dias_totais: registroAtualizado.dias_totais,
    observacao: registroAtualizado.observacao || null
  });
}

async function confirmarTrabalhoAteHoje() {
  const userId = estado.usuarioAtual?.id;
  if (!userId) return;

  const hojeIso = obterHojeISO();
  const temFolgaHoje = estado.registrosCache.some(
    (r) => r.tipo === 'Folga' && r.data_inicio <= hojeIso && r.data_fim >= hojeIso
  );

  if (!temFolgaHoje) {
    const ultimoOperacional = [...estado.registrosCache]
      .filter((r) => r.tipo === 'Embarque' || r.tipo === 'Porto')
      .sort((a, b) => {
        if (a.data_fim !== b.data_fim) return b.data_fim.localeCompare(a.data_fim);
        return String(b.id || '').localeCompare(String(a.id || ''));
      })[0];

    if (ultimoOperacional?.id && ultimoOperacional.data_fim < hojeIso) {
      const novosDiasTotais = calcularDias(ultimoOperacional.data_inicio, hojeIso);
      const registroEstendido = {
        ...ultimoOperacional,
        userId,
        user_id: userId,
        data_fim: hojeIso,
        dias_totais: novosDiasTotais,
        sincronizado: false
      };

      const idx = estado.registrosCache.findIndex(
        (r) => String(r.id) === String(ultimoOperacional.id)
      );
      if (idx >= 0) {
        estado.registrosCache[idx] = registroEstendido;
      }

      await salvarEscalasLocais(userId, [registroEstendido], false);
      await enfileirarMutacao('escalas', 'UPDATE', {
        editId: ultimoOperacional.id,
        id: ultimoOperacional.id,
        userId,
        tipo: registroEstendido.tipo,
        data_inicio: registroEstendido.data_inicio,
        data_fim: registroEstendido.data_fim,
        dias_totais: registroEstendido.dias_totais,
        observacao: registroEstendido.observacao || null
      });
    } else if (!ultimoOperacional) {
      const observacaoPadrao = (estado.perfilAtual?.embarcacao || '').trim() || null;
      const tempId = `temp_${crypto.randomUUID()}`;
      const novoRegistro = {
        id: tempId,
        userId,
        user_id: userId,
        tipo: 'Embarque',
        data_inicio: hojeIso,
        data_fim: hojeIso,
        dias_totais: 1,
        observacao: observacaoPadrao,
        sincronizado: false
      };

      estado.registrosCache.push(novoRegistro);
      await salvarEscalasLocais(userId, [novoRegistro], false);
      await enfileirarMutacao('escalas', 'INSERT', {
        id: tempId,
        userId,
        tipo: 'Embarque',
        data_inicio: hojeIso,
        data_fim: hojeIso,
        dias_totais: 1,
        observacao: observacaoPadrao
      });
    }

    estado.registrosCache.sort((a, b) =>
      (b.data_inicio || '').localeCompare(a.data_inicio || '')
    );
  }

  estado.avisoFolgaDispensadoData = hojeIso;
  estado.continuaTrabalhandoConfirmadoHoje = hojeIso;
  marcarAvisoFolgaVistoHoje(userId, hojeIso);
  salvarContinuaTrabalhandoHoje(userId, hojeIso);

  atualizarTelasDeEscala();
  dispararSync();
}

function vincularEventos() {

document.getElementById('forecast-banner')?.addEventListener('click', async (event) => {
    const btn = event.target.closest('#btn-confirmar-trabalho-hoje');
    if (!btn || btn.disabled) return;

    const textoOriginal = btn.innerText;
    btn.disabled = true;
    btn.innerText = 'Salvando...';

    try {
      await confirmarTrabalhoAteHoje();
    } catch (erro) {
      mostrarToast({
        titulo: 'Falha ao confirmar trabalho',
        mensagem: traduzirErroSupabase(erro, 'Não foi possível registrar o trabalho de hoje.'),
        retryFn: confirmarTrabalhoAteHoje
      });
    } finally {
      if (btn.isConnected) {
        btn.disabled = false;
        btn.innerText = textoOriginal;
      }
    }
  });
  
  document.getElementById('tab-login')?.addEventListener('click', () => {
    estado.modoAuth = 'login';
    atualizarModoAuthUI('login');
  });

  document.getElementById('tab-signup')?.addEventListener('click', () => {
    estado.modoAuth = 'signup';
    atualizarModoAuthUI('signup');
  });

  document.getElementById('link-esqueci-senha')?.addEventListener('click', async (event) => {
    event.preventDefault();
    const email = document.getElementById('auth-email')?.value.trim() || '';
    if (!email) {
      definirMensagemAuth('Digite seu e-mail no campo acima e clique novamente.');
      return;
    }
    definirMensagemAuth('Enviando link...');
    try {
      await enviarResetSenha(email);
      definirMensagemAuth('Link de redefinição enviado para o seu e-mail.');
    } catch (erro) {
      definirMensagemAuth('Erro ao enviar: ' + traduzirErroSupabase(erro));
    }
  });

  document.getElementById('auth-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    definirMensagemAuth('Processando...');

    try {
      if (estado.modoAuth === 'login') {
        const data = await entrarComSenha(email, password);
        definirMensagemAuth('');
        if (data?.session) await aplicarSessao(data.session);
      } else {
        await cadastrarComSenha(email, password);
        definirMensagemAuth('Conta criada. Verifique seu e-mail se a confirmação estiver ativa.');
      }
    } catch (erro) {
      const prefixo = estado.modoAuth === 'login' ? 'Erro ao entrar: ' : 'Erro ao cadastrar: ';
      definirMensagemAuth(prefixo + traduzirErroSupabase(erro));
    }
  });

  document.getElementById('btn-sair')?.addEventListener('click', async () => {
    try {
      await sairDaConta();
    } catch (erro) {
      mostrarToast({
        titulo: 'Falha ao sair',
        mensagem: traduzirErroSupabase(erro, 'Não foi possível encerrar a sessão.')
      });
    }
  });

  document.getElementById('btn-toggle-perfil')?.addEventListener('click', () => {
    alternarFormularioSecao('perfil');
  });

  document.getElementById('btn-toggle-conta')?.addEventListener('click', () => {
    alternarFormularioSecao('conta');
  });

document.getElementById('perfil-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!estado.usuarioAtual) return;

    const btn = document.getElementById('btn-salvar-perfil');
    const textoOriginal = btn.innerText;
    btn.disabled = true;
    btn.innerText = 'Salvando...';

    try {
      const userId = estado.usuarioAtual.id;
      const nome_exibicao = document.getElementById('input-nome').value.trim();
      const posto = document.getElementById('select-posto').value || null;
      const embarcacao = document.getElementById('input-embarcacao').value.trim() || null;
      const empresa = document.getElementById('input-empresa').value.trim() || 'Atem';
      const data_admissao = document.getElementById('input-admissao').value || null;
      const regra = normalizarRegraEscala({
        dias_trabalho: document.getElementById('input-dias-trabalho').value,
        dias_folga: document.getElementById('input-dias-folga').value
      });
      const inputFoto = document.getElementById('input-foto');
      const arquivoFoto = inputFoto?.files?.[0] || null;

      let avatar_url = estado.perfilAtual?.avatar_url || null;
      let fotoIgnoradaOffline = false;

      if (arquivoFoto) {
        if (navigator.onLine) {
          avatar_url = await uploadAvatarUsuario(userId, arquivoFoto);
        } else {
          fotoIgnoradaOffline = true;
        }
      }

      const payload = {
        nome_exibicao,
        posto,
        embarcacao,
        empresa,
        data_admissao,
        dias_trabalho: regra.diasTrab,
        dias_folga: regra.diasFolg,
        avatar_url,
        updated_at: new Date().toISOString()
      };

      const perfilAtualizado = {
        ...(estado.perfilAtual || {}),
        ...payload,
        userId,
        id: userId
      };

      // 1. Atualiza estado em memória e IndexedDB imediatamente
      estado.perfilAtual = perfilAtualizado;
      await salvarPerfilLocal(userId, perfilAtualizado);

      // 2. Enfileira mutação no formato esperado pelo syncEngine ({ userId, dados })
      await enfileirarMutacao('perfis', 'UPDATE', {
        userId,
        dados: payload
      });

      // 3. Limpa input, fecha formulário e re-renderiza perfil e projeções na hora
      if (inputFoto) inputFoto.value = '';
      fecharFormulariosPerfilEConta();
      renderizarPerfilUI({ perfil: estado.perfilAtual, usuario: estado.usuarioAtual });
      atualizarTelasDeEscala();

      if (fotoIgnoradaOffline) {
        mostrarToast({
          titulo: 'Dados salvos offline',
          mensagem: 'Suas alterações foram gravadas no aparelho, mas o envio da foto exige internet.'
        });
      }

      // 4. Dispara drenagem da fila em background
      dispararSync();
    } catch (erro) {
      mostrarToast({
        titulo: 'Falha ao salvar perfil',
        mensagem: traduzirErroSupabase(erro, 'Não foi possível salvar os dados do perfil.')
      });
    } finally {
      btn.disabled = false;
      btn.innerText = textoOriginal;
    }
  });
  
  document.getElementById('conta-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const novoEmail = document.getElementById('input-novo-email').value.trim();
    const novaSenha = document.getElementById('input-nova-senha').value;
    const confirmaSenha = document.getElementById('input-confirma-senha').value;
    const msgEl = document.getElementById('conta-msg');

    if (!novoEmail && !novaSenha) {
      msgEl.innerText = 'Preencha e-mail ou senha para alterar.';
      return;
    }
    if (novaSenha && novaSenha.length < 6) {
      msgEl.innerText = 'A nova senha deve ter no mínimo 6 caracteres.';
      return;
    }
    if (novaSenha && novaSenha !== confirmaSenha) {
      msgEl.innerText = 'As senhas não coincidem.';
      return;
    }

    const updates = {};
    if (novoEmail) updates.email = novoEmail;
    if (novaSenha) updates.password = novaSenha;

    try {
      await atualizarUsuarioAuth(updates);
      msgEl.innerText = 'Dados da conta atualizados.';
    } catch (erro) {
      msgEl.innerText = 'Erro: ' + traduzirErroSupabase(erro);
    }
  });

  document.getElementById('btn-marcar-folga-hoje')?.addEventListener('click', () => {
    abrirModalNovoRegistroUI({
      dataInicialISO: obterHojeISO(),
      tipoInicial: 'Folga',
      embarcacaoPadrao: (estado.perfilAtual?.embarcacao || '').trim()
    });
  });
document.getElementById('btn-dispensar-aviso-folga')?.addEventListener('click', async (event) => {
    const btn = event.currentTarget;
    if (btn?.disabled) return;

    const textoOriginal = btn ? btn.innerText : '';
    if (btn) {
      btn.disabled = true;
      btn.innerText = 'Salvando...';
    }

    try {
      await confirmarTrabalhoAteHoje();
    } catch (erro) {
      mostrarToast({
        titulo: 'Falha ao confirmar trabalho',
        mensagem: traduzirErroSupabase(erro, 'Não foi possível registrar o trabalho de hoje.'),
        retryFn: confirmarTrabalhoAteHoje
      });
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerText = textoOriginal;
      }
    }
  });

  document.getElementById('btn-mes-anterior')?.addEventListener('click', () => {
    estado.mesReferencia = new Date(estado.mesReferencia.getFullYear(), estado.mesReferencia.getMonth() - 1, 1);
    atualizarTelasDeEscala();
  });

  document.getElementById('btn-mes-proximo')?.addEventListener('click', () => {
    estado.mesReferencia = new Date(estado.mesReferencia.getFullYear(), estado.mesReferencia.getMonth() + 1, 1);
    atualizarTelasDeEscala();
  });

  document.getElementById('btn-novo-registro')?.addEventListener('click', () => {
    abrirModalNovoRegistroUI({
      dataInicialISO: obterHojeISO(),
      tipoInicial: 'Porto',
      embarcacaoPadrao: (estado.perfilAtual?.embarcacao || '').trim()
    });
  });

  document.getElementById('btn-fechar-modal')?.addEventListener('click', () => {
    fecharModalRegistroUI((estado.perfilAtual?.embarcacao || '').trim());
  });

  document.getElementById('btn-cancelar-modal')?.addEventListener('click', () => {
    fecharModalRegistroUI((estado.perfilAtual?.embarcacao || '').trim());
  });

  document.getElementById('modal-registro')?.addEventListener('click', (event) => {
    if (event.target.id === 'modal-registro') {
      fecharModalRegistroUI((estado.perfilAtual?.embarcacao || '').trim());
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      const modal = document.getElementById('modal-registro');
      if (modal?.classList.contains('is-open')) {
        fecharModalRegistroUI((estado.perfilAtual?.embarcacao || '').trim());
      }
    }
  });

  document.querySelectorAll('#tipo-chips .tipo-chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      selecionarTipoRegistroUI(btn.dataset.tipo);
    });
  });

  document.getElementById('escala-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!estado.usuarioAtual) return;

    const btnSalvar = document.getElementById('btn-salvar');
    if (btnSalvar.disabled) return;

    const textoBtnOriginal = btnSalvar.innerText;
    const editId = document.getElementById('edit-id').value || null;
    const tipo = document.getElementById('tipo').value;
    const data_inicio = document.getElementById('data_inicio').value;
    const data_fim = document.getElementById('data_fim').value;
    let observacao = document.getElementById('observacao').value.trim();

    if (!observacao && (tipo === 'Embarque' || tipo === 'Porto') && estado.perfilAtual?.embarcacao) {
      observacao = estado.perfilAtual.embarcacao.trim();
    }

    const dias_totais = calcularDias(data_inicio, data_fim);
    if (dias_totais <= 0 || parseISODateLocal(data_fim) < parseISODateLocal(data_inicio)) {
      mostrarToast({
        titulo: 'Período inválido',
        mensagem: 'A data final deve ser igual ou posterior à data inicial.'
      });
      return;
    }

    btnSalvar.disabled = true;
    btnSalvar.innerText = editId ? 'Atualizando...' : 'Salvando...';

    try {
      const userId = estado.usuarioAtual.id;

      if (tipo === 'Folga') {
        await estenderUltimoTrabalhoSeNecessario(data_inicio, userId);
        estado.continuaTrabalhandoConfirmadoHoje = null;
        salvarContinuaTrabalhandoHoje(userId, null);
      }

      const existente = editId
        ? estado.registrosCache.find((r) => String(r.id) === String(editId))
        : null;

      const idRegistro = editId
        ? (existente?.id ?? (editId.startsWith('temp_') ? editId : Number(editId)))
        : `temp_${crypto.randomUUID()}`;

      const registroOtimista = {
        ...(existente || {}),
        id: idRegistro,
        userId,
        user_id: userId,
        tipo,
        data_inicio,
        data_fim,
        dias_totais,
        observacao: observacao || null,
        sincronizado: false,
        erroNegocio: false, // Limpa o status de conflito ao tentar nova submissão
        atualizadoEmLocal: new Date().toISOString()
      };

      // 1. Atualiza estado em memória imediatamente
      const idx = estado.registrosCache.findIndex((r) => String(r.id) === String(idRegistro));
      if (idx >= 0) {
        estado.registrosCache[idx] = registroOtimista;
      } else {
        estado.registrosCache.push(registroOtimista);
      }

      estado.registrosCache.sort((a, b) =>
        (b.data_inicio || '').localeCompare(a.data_inicio || '')
      );

      // 2. Persiste no IndexedDB local e enfileira a mutação FIFO
      await salvarEscalasLocais(userId, [registroOtimista], false);

      if (editId) {
        await enfileirarMutacao('escalas', 'UPDATE', {
          editId: idRegistro,
          id: idRegistro,
          userId,
          tipo,
          data_inicio,
          data_fim,
          dias_totais,
          observacao: observacao || null
        });
      } else {
        await enfileirarMutacao('escalas', 'INSERT', {
          id: idRegistro,
          userId,
          tipo,
          data_inicio,
          data_fim,
          dias_totais,
          observacao: observacao || null
        });
      }

      // 3. Fecha modal e re-renderiza métricas, tabela e calendário instantaneamente
      fecharModalRegistroUI((estado.perfilAtual?.embarcacao || '').trim());
      atualizarTelasDeEscala();

      // 4. Dispara drenagem da fila em background (não bloqueante)
      dispararSync();
    } catch (erro) {
      mostrarToast({
        titulo: editId ? 'Falha ao atualizar localmente' : 'Falha ao salvar localmente',
        mensagem: erro?.message || 'Não foi possível gravar o registro no dispositivo.'
      });
    } finally {
      btnSalvar.disabled = false;
      btnSalvar.innerText = textoBtnOriginal;
    }
  });

document.getElementById('lista-escalas')?.addEventListener('click', async (event) => {
    const botao = event.target.closest('button[data-action]');
    if (!botao || !estado.usuarioAtual) return;

    const acao = botao.dataset.action;
    const rawId = botao.dataset.id;
    if (!rawId) return;

    const isTemp = rawId.startsWith('temp_');
    const id = isTemp ? rawId : Number(rawId);
    if (!isTemp && !Number.isFinite(id)) return;

    if (acao === 'editar') {
      const item = estado.registrosCache.find((r) => String(r.id) === String(id));
      if (item) abrirModalEdicaoRegistroUI(item);
      return;
    }

    if (acao === 'excluir') {
      if (!confirm('Tem certeza que deseja apagar este registro?')) return;

      const userId = estado.usuarioAtual.id;

      try {
        // 1. Remove da memória imediatamente
        estado.registrosCache = estado.registrosCache.filter(
          (r) => String(r.id) !== String(id)
        );

        // 2. Remove do IndexedDB e enfileira na sync_queue
        await removerEscalaLocal(id);
        await enfileirarMutacao('escalas', 'DELETE', { id, userId });

        // 3. Atualiza métricas, tabela e calendário na hora
        atualizarTelasDeEscala();

        // 4. Tenta sincronizar em segundo plano (se offline, a fila segura)
        dispararSync();
      } catch (erro) {
        console.error('[Escalas] Erro ao excluir registro localmente:', erro);
        mostrarToast({
          titulo: 'Falha ao excluir localmente',
          mensagem: 'Não foi possível remover o registro do dispositivo.'
        });
      }
    }
  });

  document.getElementById('btn-limpar-tudo')?.addEventListener('click', async () => {
    if (!estado.usuarioAtual || estado.registrosCache.length === 0) return;
    if (!confirm('Apagar TODOS os seus registros permanentemente?')) return;

    const executarLimpeza = async () => {
      await limparEscalasUsuario(estado.usuarioAtual.id);
      fecharModalRegistroUI((estado.perfilAtual?.embarcacao || '').trim());
      await carregarEscalasApp({ renderLocalPrimeiro: false});
    };

    try {
      await executarLimpeza();
    } catch (erro) {
      mostrarToast({
        titulo: 'Falha ao limpar registros',
        mensagem: traduzirErroSupabase(erro, 'Não foi possível apagar todos os registros.'),
        retryFn: executarLimpeza
      });
    }
  });

  window.addEventListener('online', async () => {
    if (!estado.usuarioAtual) return;
    await carregarPerfilApp();
    await carregarEscalasApp({ renderLocalPrimeiro: false });
  });

  window.addEventListener('offline', () => {
    if (!estado.usuarioAtual) return;
    const cached = lerCacheEscalas(estado.usuarioAtual.id);
    atualizarBannerOffline({ ativo: true, salvoEm: cached?.salvoEm });
  });

// Aviso discreto em caso de falha na migração de localStorage -> IndexedDB
  window.addEventListener('migracao:falha', (evento) => {
    const mensagem = evento.detail?.mensagem || 'Sincronização do armazenamento local pendente.';
    mostrarToast({
      titulo: 'Aviso',
      mensagem
    });
  });

  // Aviso quando o servidor rejeita uma escala por conflito de datas (ex: erro 23P01)
window.addEventListener('sync:erro_negocio', async (evento) => {
    const { item, erro } = evento.detail || {};
    const mensagem = traduzirErroSupabase(
      erro,
      'Já existe um registro de Porto, Embarque ou Folga nessas datas. Ajuste o período ou edite o lançamento existente.'
    );

    mostrarToast({
      titulo: 'Conflito na sincronização',
      mensagem
    });

    if (item?.tabela === 'escalas' && estado.usuarioAtual) {
      const idAlvo = String(item.payload?.editId ?? item.payload?.id ?? '');
      const idx = estado.registrosCache.findIndex((r) => String(r.id) === idAlvo);

      if (idx >= 0) {
        const escalaComConflito = {
          ...estado.registrosCache[idx],
          sincronizado: false,
          erroNegocio: true
        };
        estado.registrosCache[idx] = escalaComConflito;

      await salvarEscalasLocais(estado.usuarioAtual.id, [escalaComConflito], false);
        atualizarTelasDeEscala();
      }
    }
  });

  window.addEventListener('sync:sucesso', (evento) => {
    const { tabela, tempId, registroServidor } = evento.detail || {};

    if (tabela === 'escalas' && registroServidor && estado.registrosCache) {
      const idBusca = String(tempId ?? registroServidor.id);
      const idx = estado.registrosCache.findIndex(
        (r) => String(r.id) === idBusca || String(r.id) === String(registroServidor.id)
      );

      const escalaAtualizada = {
        ...(idx >= 0 ? estado.registrosCache[idx] : {}),
        ...registroServidor,
        sincronizado: true,
        erroNegocio: false
      };

      if (idx >= 0) {
        estado.registrosCache[idx] = escalaAtualizada;
      } else {
        estado.registrosCache.push(escalaAtualizada);
      }

      // Mantém a ordenação decrescente por data_inicio
      estado.registrosCache.sort((a, b) =>
        (b.data_inicio || '').localeCompare(a.data_inicio || '')
      );

      atualizarTelasDeEscala();
    }
  });
}
 
async function iniciarApp() {
  vincularEventos();
  inicializarSyncEngine();

  try {
    obterClienteSupabase();
  } catch (erro) {
    definirMensagemAuth(erro.message || 'Não foi possível carregar o cliente do Supabase.');
    return;
  }

  // 1. Escuta mudanças subsequentes de autenticação (login/logout)
  escutarMudancaAuth(async (sessao) => {
    await aplicarSessao(sessao);
  });

// 2. Resolve a sessão inicial salva
  try {
    const sessaoInicial = await obterSessaoAtual();
    await aplicarSessao(sessaoInicial);
  } catch (erro) {
    definirMensagemAuth('Erro ao verificar sessão: ' + traduzirErroSupabase(erro));
  }
}

iniciarApp();