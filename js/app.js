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
  lerCachePerfil,
  lerContinuaTrabalhandoHoje,
  lerFlagStorage,
  marcarAvisoFolgaVistoHoje,
  salvarCacheEscalas,
  salvarCachePerfil,
  salvarContinuaTrabalhandoHoje,
  salvarFlagStorage
} from './storageCache.js';

import {
  atualizarPerfilUsuario,
  atualizarUsuarioAuth,
  buscarOuCriarPerfil,
  cadastrarComSenha,
  entrarComSenha,
  enviarResetSenha,
  escutarMudancaAuth,
  estenderEscalaTrabalho,
  excluirEscalaPorId,
  limparEscalasUsuario,
  listarEscalasUsuario,
  obterClienteSupabase,
  obterSessaoAtual,
  sairDaConta,
  salvarEscala,
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

async function carregarPerfilApp() {
  if (!estado.usuarioAtual) return;
  const userId = estado.usuarioAtual.id;

  try {
    const perfil = await buscarOuCriarPerfil(estado.usuarioAtual);
    estado.perfilAtual = perfil;
    salvarCachePerfil(userId, perfil);
    atualizarBannerOffline({ ativo: false });
  } catch (erro) {
    console.error(`[${new Date().toISOString()}] [carregar_perfil]`, erro);
    const cached = lerCachePerfil(userId);
    if (cached?.dados) {
      estado.perfilAtual = cached.dados;
      atualizarBannerOffline({ ativo: true, salvoEm: cached.salvoEm });
    } else {
      estado.perfilAtual = {
        id: userId,
        nome_exibicao: '',
        empresa: 'Atem',
        dias_trabalho: APP_CONFIG.escalaPadrao.diasTrabalho,
        dias_folga: APP_CONFIG.escalaPadrao.diasFolga
      };
    }
  }

  renderizarPerfilUI({ perfil: estado.perfilAtual, usuario: estado.usuarioAtual });
}

async function carregarEscalasApp() {
  if (!estado.usuarioAtual) return;
  const userId = estado.usuarioAtual.id;

  try {
    const escalas = await listarEscalasUsuario();
    estado.registrosCache = escalas;
    salvarCacheEscalas(userId, escalas);
    atualizarBannerOffline({ ativo: !navigator.onLine, salvoEm: lerCacheEscalas(userId)?.salvoEm });
    atualizarTelasDeEscala();
  } catch (erro) {
    console.error(`[${new Date().toISOString()}] [carregar_escalas]`, erro);
    const cached = lerCacheEscalas(userId);
    if (cached?.dados) {
      estado.registrosCache = cached.dados;
      atualizarBannerOffline({ ativo: true, salvoEm: cached.salvoEm });
      atualizarTelasDeEscala();
    }

    mostrarToast({
      titulo: 'Falha ao carregar escalas',
      mensagem: traduzirErroSupabase(erro, 'Não foi possível atualizar a lista de escalas.'),
      retryFn: carregarEscalasApp
    });
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

async function estenderUltimoTrabalhoSeNecessario(dataInicioFolga) {
  if (!dataInicioFolga) return;
  const diaAntesFolga = subtrairUmDiaISO(dataInicioFolga);

  const ultimoTrabalho = [...estado.registrosCache]
    .filter((r) =>
      (r.tipo === 'Embarque' || r.tipo === 'Porto') &&
      r.data_inicio <= dataInicioFolga &&
      r.data_fim < diaAntesFolga
    )
    .sort((a, b) => {
      if (a.data_fim !== b.data_fim) return b.data_fim.localeCompare(a.data_fim);
      return (b.id || 0) - (a.id || 0);
    })[0];

  if (!ultimoTrabalho?.id) return;

  await estenderEscalaTrabalho(ultimoTrabalho.id, diaAntesFolga);
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
        return (b.id || 0) - (a.id || 0);
      })[0];

if (ultimoOperacional?.id && ultimoOperacional.data_fim < hojeIso) {
      await estenderEscalaTrabalho(ultimoOperacional.id, hojeIso);
    } else if (!ultimoOperacional) {
      const observacaoPadrao = (estado.perfilAtual?.embarcacao || '').trim() || null;

      await salvarEscala({
        editId: null,
        userId,
        payload: {
          tipo: 'Embarque',
          data_inicio: hojeIso,
          data_fim: hojeIso,
          dias_totais: 1,
          observacao: observacaoPadrao
        }
      });
    }

  estado.avisoFolgaDispensadoData = hojeIso;
  estado.continuaTrabalhandoConfirmadoHoje = hojeIso;
  marcarAvisoFolgaVistoHoje(userId, hojeIso);
  salvarContinuaTrabalhandoHoje(userId, hojeIso);
  await carregarEscalasApp();
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
      const nome_exibicao = document.getElementById('input-nome').value.trim();
      const posto = document.getElementById('select-posto').value || null;
      const embarcacao = document.getElementById('input-embarcacao').value.trim() || null;
      const empresa = document.getElementById('input-empresa').value.trim() || 'Atem';
      const data_admissao = document.getElementById('input-admissao').value || null;
      const regra = normalizarRegraEscala({
        dias_trabalho: document.getElementById('input-dias-trabalho').value,
        dias_folga: document.getElementById('input-dias-folga').value
      });
      const arquivoFoto = document.getElementById('input-foto').files[0];

      let avatar_url = estado.perfilAtual?.avatar_url || null;
      if (arquivoFoto) {
        avatar_url = await uploadAvatarUsuario(estado.usuarioAtual.id, arquivoFoto);
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

      const atualizado = await atualizarPerfilUsuario(estado.usuarioAtual.id, payload);
      estado.perfilAtual = atualizado || { ...estado.perfilAtual, ...payload };
      salvarCachePerfil(estado.usuarioAtual.id, estado.perfilAtual);

      document.getElementById('input-foto').value = '';
      fecharFormulariosPerfilEConta();
      renderizarPerfilUI({ perfil: estado.perfilAtual, usuario: estado.usuarioAtual });
      atualizarTelasDeEscala();
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

    const executarMutacao = async () => {
    if (tipo === 'Folga') {
      await estenderUltimoTrabalhoSeNecessario(data_inicio);
        estado.continuaTrabalhandoConfirmadoHoje = null;
        salvarContinuaTrabalhandoHoje(estado.usuarioAtual.id, null);
      }

      await salvarEscala({
        editId,
        userId: estado.usuarioAtual.id,
        payload: { tipo, data_inicio, data_fim, dias_totais, observacao }
      });

      fecharModalRegistroUI((estado.perfilAtual?.embarcacao || '').trim());
      await carregarEscalasApp();
    };

    btnSalvar.disabled = true;
    btnSalvar.innerText = editId ? 'Atualizando...' : 'Salvando...';

    try {
      await executarMutacao();
    } catch (erro) {
      mostrarToast({
        titulo: editId ? 'Falha ao atualizar registro' : 'Falha ao salvar registro',
        mensagem: traduzirErroSupabase(erro, 'Não foi possível salvar o registro. Seus dados continuam no formulário.'),
        retryFn: executarMutacao
      });
    } finally {
      btnSalvar.disabled = false;
      btnSalvar.innerText = textoBtnOriginal;
    }
  });

  document.getElementById('lista-escalas')?.addEventListener('click', async (event) => {
    const botao = event.target.closest('button[data-action]');
    if (!botao) return;

    const acao = botao.dataset.action;
    const id = Number(botao.dataset.id);
    if (!Number.isFinite(id)) return;

    if (acao === 'editar') {
      const item = estado.registrosCache.find((r) => Number(r.id) === id);
      if (item) abrirModalEdicaoRegistroUI(item);
      return;
    }

    if (acao === 'excluir') {
      if (!confirm('Tem certeza que deseja apagar este registro?')) return;

      const executarExclusao = async () => {
        await excluirEscalaPorId(id);
        await carregarEscalasApp();
      };

      try {
        await executarExclusao();
      } catch (erro) {
        mostrarToast({
          titulo: 'Falha ao excluir registro',
          mensagem: traduzirErroSupabase(erro, 'Não foi possível excluir o registro.'),
          retryFn: executarExclusao
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
      await carregarEscalasApp();
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
    await carregarEscalasApp();
  });

  window.addEventListener('offline', () => {
    if (!estado.usuarioAtual) return;
    const cached = lerCacheEscalas(estado.usuarioAtual.id);
    atualizarBannerOffline({ ativo: true, salvoEm: cached?.salvoEm });
  });
}

async function iniciarApp() {
  vincularEventos();

  try {
    obterClienteSupabase();
  } catch (erro) {
    definirMensagemAuth(erro.message || 'Não foi possível carregar o cliente do Supabase.');
    return;
  }

  escutarMudancaAuth((session) => {
    aplicarSessao(session);
  });

  try {
    const sessaoInicial = await obterSessaoAtual();
    await aplicarSessao(sessaoInicial);
  } catch (erro) {
    definirMensagemAuth('Erro ao verificar sessão: ' + traduzirErroSupabase(erro));
  }
}

iniciarApp();
