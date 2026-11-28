import {
  formatarContagemDias,
  formatarDataBR,
  normalizarCodigoPosto,
  normalizarRegraEscala,
  obterHojeISO,
  obterPostoInfo
} from './escalaEngine.js';

export function escaparHTML(valor) {
  const amp = String.fromCharCode(38, 97, 109, 112, 59);
  const lt = String.fromCharCode(38, 108, 116, 59);
  const gt = String.fromCharCode(38, 103, 116, 59);
  const quot = String.fromCharCode(38, 113, 117, 111, 116, 59);
  const apos = String.fromCharCode(38, 35, 51, 57, 59);

  return String(valor ?? '')
    .split('&').join(amp)
    .split('<').join(lt)
    .split('>').join(gt)
    .split('"').join(quot)
    .split("'").join(apos);
}

export function urlAvatarSegura(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' ? parsed.href : null;
  } catch {
    return null;
  }
}

export function mostrarToast({ titulo = 'Aviso', mensagem = '', tipo = 'erro', retryFn = null } = {}) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toastEl = document.createElement('div');
  toastEl.className = tipo === 'info' ? 'toast-item toast-info' : 'toast-item';
  toastEl.setAttribute('role', 'status');

  const acoesHtml = typeof retryFn === 'function'
    ? `<div class="toast-actions"><button type="button" class="toast-retry">Tentar novamente</button></div>`
    : '';

  toastEl.innerHTML = `
    <div class="toast-header">
      <div class="toast-title">${escaparHTML(titulo)}</div>
      <button type="button" class="toast-close" aria-label="Fechar aviso">✕</button>
    </div>
    <div class="toast-message">${escaparHTML(mensagem)}</div>
    ${acoesHtml}
  `;

  toastEl.querySelector('.toast-close')?.addEventListener('click', () => {
    toastEl.remove();
  });

  const retryBtn = toastEl.querySelector('.toast-retry');
  if (retryBtn && typeof retryFn === 'function') {
    retryBtn.addEventListener('click', async () => {
      retryBtn.disabled = true;
      const textoOriginal = retryBtn.innerText;
      retryBtn.innerText = 'Tentando...';
      try {
        await retryFn();
        toastEl.remove();
      } catch {
        retryBtn.disabled = false;
        retryBtn.innerText = textoOriginal;
      }
    });
  }

  container.appendChild(toastEl);
}

export function atualizarBannerOffline({ ativo, salvoEm = null } = {}) {
  const banner = document.getElementById('offline-banner');
  const texto = document.getElementById('offline-banner-texto');
  if (!banner || !texto) return;

  if (!ativo) {
    banner.style.display = 'none';
    return;
  }

  let detalheData = '';
  if (salvoEm) {
    try {
      const dt = new Date(salvoEm);
      detalheData = ` Última sincronização: ${dt.toLocaleDateString('pt-BR')} às ${dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.`;
    } catch {
      detalheData = '';
    }
  }

  texto.textContent = `Sem conexão com o servidor. Exibindo dados salvos localmente em modo de leitura.${detalheData}`;
  banner.style.display = 'flex';
}

export function alternarVisaoAutenticada(logado) {
  const authView = document.getElementById('auth-view');
  const appView = document.getElementById('app-view');
  if (authView) authView.style.display = logado ? 'none' : 'block';
  if (appView) appView.style.display = logado ? 'block' : 'none';
}

export function atualizarModoAuthUI(modoAuth) {
  const isLogin = modoAuth === 'login';
  const tabLogin = document.getElementById('tab-login');
  const tabSignup = document.getElementById('tab-signup');
  const submitBtn = document.getElementById('auth-submit');
  const msgEl = document.getElementById('auth-msg');

  if (tabLogin) tabLogin.className = isLogin ? 'btn-active-tab' : 'btn-secondary';
  if (tabSignup) tabSignup.className = !isLogin ? 'btn-active-tab' : 'btn-secondary';
  if (submitBtn) submitBtn.innerText = isLogin ? 'Entrar' : 'Criar conta';
  if (msgEl) msgEl.innerText = '';
}

export function definirMensagemAuth(texto) {
  const msgEl = document.getElementById('auth-msg');
  if (msgEl) msgEl.innerText = texto || '';
}

export function renderizarPerfilUI({ perfil, usuario }) {
  const { diasTrab, diasFolg } = normalizarRegraEscala(perfil);
  const nome = perfil?.nome_exibicao || 'Sem nome definido';
  const empresa = perfil?.empresa || '—';
  const embarcacao = (perfil?.embarcacao || '').trim();
  const admissao = perfil?.data_admissao ? formatarDataBR(perfil.data_admissao) : '—';
  const avatarUrl = urlAvatarSegura(perfil?.avatar_url);
  const postoInfo = obterPostoInfo(perfil?.posto);

  document.getElementById('perfil-nome-exibicao').innerText = nome;
  document.getElementById('perfil-empresa').innerText = `Empresa: ${empresa}`;
  document.getElementById('perfil-admissao').innerText = `Admissão: ${admissao}`;
  document.getElementById('perfil-escala-badge').innerText = `Escala ${diasTrab}x${diasFolg}`;
  document.getElementById('conta-email-atual').innerText = usuario?.email || '—';

  const embBadge = document.getElementById('perfil-embarcacao-badge');
  if (embarcacao) {
    embBadge.style.display = 'inline-flex';
    embBadge.innerText = `Bordo: ${embarcacao}`;
  } else {
    embBadge.style.display = 'none';
  }

  const badgeEl = document.getElementById('perfil-posto-badge');
  const detalheEl = document.getElementById('perfil-posto-detalhe');
  const avatarBox = document.getElementById('avatar-box');

  if (postoInfo) {
    badgeEl.style.display = 'inline-flex';
    badgeEl.className = postoInfo.comando ? 'posto-badge posto-comando' : 'posto-badge';
    badgeEl.innerHTML = `<span>${escaparHTML(postoInfo.sigla)}</span> · ${escaparHTML(postoInfo.titulo)}`;

    detalheEl.style.display = 'block';
    const notaTxt = postoInfo.nota ? ` · <em>${escaparHTML(postoInfo.nota)}</em>` : '';
    detalheEl.innerHTML = `${escaparHTML(postoInfo.secao)} (${escaparHTML(postoInfo.foco)})${notaTxt}`;

    avatarBox.className = postoInfo.comando ? 'avatar avatar-comando' : 'avatar';
  } else {
    badgeEl.style.display = 'none';
    detalheEl.style.display = 'none';
    avatarBox.className = 'avatar';
  }

  if (avatarUrl) {
    avatarBox.innerHTML = `<img src="${escaparHTML(avatarUrl)}" alt="Foto de perfil">`;
  } else {
    avatarBox.innerText = postoInfo
      ? postoInfo.sigla
      : (nome.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('') || 'DB');
  }

  document.getElementById('input-nome').value = perfil?.nome_exibicao || '';
  document.getElementById('select-posto').value = normalizarCodigoPosto(perfil?.posto);
  document.getElementById('input-embarcacao').value = perfil?.embarcacao || '';
  document.getElementById('input-empresa').value = perfil?.empresa || '';
  document.getElementById('input-admissao').value = perfil?.data_admissao || '';
  document.getElementById('input-dias-trabalho').value = diasTrab;
  document.getElementById('input-dias-folga').value = diasFolg;

  const obsInput = document.getElementById('observacao');
  if (obsInput && !document.getElementById('edit-id').value) {
    obsInput.placeholder = embarcacao ? `${embarcacao} · Barcarena, etc.` : 'Barcarena, comboio, etc.';
  }
}

export function alternarFormularioSecao(alvo) {
  const perfilForm = document.getElementById('perfil-form');
  const contaForm = document.getElementById('conta-form');
  if (!perfilForm || !contaForm) return;

  if (alvo === 'perfil') {
    const abrindo = perfilForm.style.display === 'none';
    perfilForm.style.display = abrindo ? 'grid' : 'none';
    if (abrindo) contaForm.style.display = 'none';
  } else if (alvo === 'conta') {
    const abrindo = contaForm.style.display === 'none';
    contaForm.style.display = abrindo ? 'grid' : 'none';
    if (abrindo) perfilForm.style.display = 'none';
  }
}

export function fecharFormulariosPerfilEConta() {
  const perfilForm = document.getElementById('perfil-form');
  const contaForm = document.getElementById('conta-form');
  if (perfilForm) perfilForm.style.display = 'none';
  if (contaForm) contaForm.style.display = 'none';
}

export function renderizarMetricasUI(metricas) {
  document.getElementById('total-trabalhado').innerText = `${metricas.diasTrabalhados}d`;
  document.getElementById('folgas-geradas').innerText = `${metricas.folgasGeradas}d`;
  document.getElementById('folgas-gozadas').innerText = `${metricas.folgasGozadas}d`;

  const saldoEl = document.getElementById('saldo-folga');
  saldoEl.innerText = `${metricas.saldo}d`;
  saldoEl.style.color = metricas.saldo < 0 ? 'var(--negative)' : 'var(--positive)';
}

export function renderizarTabelaEscalasUI(registros) {
  const tbody =
    document.getElementById('lista-escalas') ||
    document.getElementById('corpo-tabela-escalas');
  const semRegistros = document.getElementById('sem-registros');
  if (!tbody) return;

  tbody.innerHTML = '';
  if (!Array.isArray(registros) || registros.length === 0) {
    if (semRegistros) semRegistros.style.display = 'block';
    return;
  }
  if (semRegistros) semRegistros.style.display = 'none';

  for (const item of registros) {
    const tr = document.createElement('tr');

    let badgeStatus = '';
    if (item.erroNegocio) {
      badgeStatus = `<span class="tag" style="background: rgba(248, 113, 113, 0.2); border: 1px solid rgba(248, 113, 113, 0.45); color: #fca5a5; font-size: 0.72rem; padding: 2px 6px;" title="Conflito de datas com o servidor">Conflito</span>`;
    } else if (item.sincronizado === false) {
      badgeStatus = `<span class="tag" style="background: rgba(251, 191, 36, 0.16); border: 1px solid rgba(251, 191, 36, 0.4); color: #fde68a; font-size: 0.72rem; padding: 2px 6px;" title="Aguardando conexão para sincronizar">Pendente</span>`;
    }

    tr.innerHTML = `
      <td data-label="Tipo">
        <div style="display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap;">
          <span class="tag">${escaparHTML(item.tipo)}</span>
          ${badgeStatus}
        </div>
      </td>
      <td data-label="Início">${formatarDataBR(item.data_inicio)}</td>
      <td data-label="Fim">${formatarDataBR(item.data_fim)}</td>
      <td data-label="Dias"><strong>${Number(item.dias_totais) || 0}d</strong></td>
      <td data-label="Observação">${escaparHTML(item.observacao || '—')}</td>
      <td data-label="Ações">
        <div class="row-actions">
          <button type="button" class="btn-link" data-action="editar" data-id="${item.id}">Editar</button>
          <button type="button" class="btn-link danger" data-action="excluir" data-id="${item.id}">Excluir</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  }
}

export function renderizarBannerPrevisaoUI({ previsao, regraEscala, hojeTemRegistroReal = false }) {
  const bannerEl = document.getElementById('forecast-banner');
  if (!bannerEl) return;

  if (!previsao?.temHistorico || !previsao.inicioProximaFolga || !previsao.fimProximaFolga) {
    bannerEl.innerHTML = '<span>Clique em "+ Novo registro" ou em um dia do calendário para lançar um período e gerar sua previsão automática.</span>';
    return;
  }

  const badgeFolga = previsao.temFolgaHoje
    ? 'Em folga'
    : previsao.diasParaFolga < 0
      ? 'Prevista vencida'
      : formatarContagemDias(previsao.diasParaFolga);

  const badgeRetorno = previsao.diasParaRetorno === null
    ? '—'
    : (previsao.diasParaRetorno < 0 ? 'Em andamento' : formatarContagemDias(previsao.diasParaRetorno));

  bannerEl.innerHTML = `
    <div class="forecast-grid">
      <div class="forecast-box">
        <div>
          <div><strong>Desembarque / Folga</strong></div>
          <div>${formatarDataBR(previsao.inicioProximaFolga)} a ${formatarDataBR(previsao.fimProximaFolga)} (${regraEscala.diasFolg}d)</div>
        </div>
        <span class="countdown-pill">${escaparHTML(badgeFolga)}</span>
      </div>
      <div class="forecast-box">
        <div>
          <div><strong>Retorno ao trabalho</strong></div>
          <div>${previsao.retornoAoTrabalho ? formatarDataBR(previsao.retornoAoTrabalho) : '—'} · Escala ${regraEscala.diasTrab}x${regraEscala.diasFolg}</div>
        </div>
        <span class="countdown-pill retorno">${escaparHTML(badgeRetorno)}</span>
      </div>
    </div>
    ${!hojeTemRegistroReal ? `
      <div class="forecast-acoes">
        <button type="button" id="btn-confirmar-trabalho-hoje" class="btn-secondary forecast-btn-trabalho">
          Continuo trabalhando hoje
        </button>
      </div>
    ` : ''}
  `;
}

export function renderizarAvisoFolgaPendenteUI(previsao) {
  const avisoEl = document.getElementById('aviso-folga-pendente');
  const textoEl = document.getElementById('aviso-folga-texto');
  if (!avisoEl || !textoEl) return;

  if (!previsao?.chegouOuPassouPrevisao) {
    avisoEl.style.display = 'none';
    return;
  }

  textoEl.textContent = `A previsão de folga era ${formatarDataBR(previsao.inicioProximaFolga)}, mas ainda não há registro de Folga lançado. Se você já pegou folga, marque abaixo; senão, o ciclo segue atualizado.`;
  avisoEl.style.display = 'block';
}

export function renderizarCalendarioUI({
  mesReferencia,
  mapaDias,
  continuaTrabalhandoHoje,
  onSelecionarDia,
  onMarcarFolgaDia
}) {
  const grid = document.getElementById('cal-grid');
  const titulo = document.getElementById('cal-titulo');
  if (!grid || !titulo) return;

  grid.innerHTML = '';

  const ano = mesReferencia.getFullYear();
  const mes = mesReferencia.getMonth();
  const tituloBruto = mesReferencia.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  titulo.innerText = tituloBruto.charAt(0).toUpperCase() + tituloBruto.slice(1);

  ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].forEach((d) => {
    const el = document.createElement('div');
    el.className = 'cal-dow';
    el.innerText = d;
    grid.appendChild(el);
  });

  const primeiroDiaSemana = new Date(ano, mes, 1).getDay();
  const totalDiasMes = new Date(ano, mes + 1, 0).getDate();

  for (let i = 0; i < primeiroDiaSemana; i++) {
    const vazio = document.createElement('div');
    vazio.className = 'cal-day cal-day-empty';
    grid.appendChild(vazio);
  }

  const hojeIsoRef = obterHojeISO();
  const hojeJaTrabalhou =
    continuaTrabalhandoHoje === hojeIsoRef ||
    Boolean(
      mapaDias[hojeIsoRef] &&
      ['Porto', 'Embarque', 'PrevTrabalho'].includes(mapaDias[hojeIsoRef].tipo) &&
      mapaDias[hojeIsoRef].real
    );

  const mapaClasse = {
    Porto: 'is-porto',
    Embarque: 'is-embarque',
    Folga: 'is-folga',
    Atestado: 'is-atestado',
    PrevTrabalho: 'is-prev-trabalho',
    PrevFolga: 'is-prev-folga'
  };

for (let dia = 1; dia <= totalDiasMes; dia++) {
    const mStr = String(mes + 1).padStart(2, '0');
    const dStr = String(dia).padStart(2, '0');
    const iso = `${ano}-${mStr}-${dStr}`;

    const reg = mapaDias[iso];
    const celula = document.createElement('div');
    celula.className = 'cal-day';
    if (iso === hojeIsoRef) celula.classList.add('is-hoje');
    celula.style.cursor = 'pointer';
    celula.addEventListener('click', () => {
      if (typeof onSelecionarDia === 'function') onSelecionarDia(iso);
    });

    let subtexto = '';
    if (reg) {
      if (reg.tipo === 'Atestado' || reg.temAtestado) {
        celula.classList.add('is-atestado');
      } else if (mapaClasse[reg.tipo]) {
        celula.classList.add(mapaClasse[reg.tipo]);
      }

      const textoCompleto = reg.tipo === 'PrevTrabalho'
        ? 'Prev. Trabalho'
        : reg.tipo === 'PrevFolga'
          ? 'Prev. Folga'
          : (reg.observacao ? `${reg.tipo} · ${reg.observacao}` : reg.tipo);

      celula.title = textoCompleto;

      const ehTelaEstreita = window.innerWidth <= 760;
      if (ehTelaEstreita) {
        subtexto = reg.tipo === 'PrevTrabalho'
          ? 'Prev. Trab.'
          : reg.tipo === 'PrevFolga'
            ? 'Prev. Folga'
            : reg.temAtestado && reg.tipo !== 'Atestado'
              ? `${reg.tipo} + Atest.`
              : reg.tipo;
      } else {
        subtexto = textoCompleto;
      }
    }

    celula.innerHTML = `<span class="cal-day-num">${dia}</span><span class="cal-day-label">${escaparHTML(subtexto)}</span>`;

    const ehFolgaReal = Boolean(reg && reg.tipo === 'Folga' && reg.real === true);
    const dataMinimaFolga = hojeJaTrabalhou ? iso > hojeIsoRef : iso >= hojeIsoRef;

    if (dataMinimaFolga && !ehFolgaReal) {
      const btnFolgaDia = document.createElement('button');
      btnFolgaDia.type = 'button';
      btnFolgaDia.className = 'cal-btn-folga';
      btnFolgaDia.innerText = 'Marcar folga';
      btnFolgaDia.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (typeof onMarcarFolgaDia === 'function') onMarcarFolgaDia(iso);
      });
      celula.appendChild(btnFolgaDia);
    }

    grid.appendChild(celula);
  }
}

export function selecionarTipoRegistroUI(tipo) {
  const inputTipo = document.getElementById('tipo');
  if (inputTipo) inputTipo.value = tipo;
  document.querySelectorAll('#tipo-chips .tipo-chip').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tipo === tipo);
  });
}

export function abrirModalNovoRegistroUI({ dataInicialISO = obterHojeISO(), tipoInicial = 'Porto', embarcacaoPadrao = '' } = {}) {
  resetarModalRegistroUI(embarcacaoPadrao);
  selecionarTipoRegistroUI(tipoInicial);
  document.getElementById('data_inicio').value = dataInicialISO;
  document.getElementById('data_fim').value = dataInicialISO;
  document.getElementById('modal-registro').classList.add('is-open');
}

export function abrirModalEdicaoRegistroUI(item) {
  if (!item) return;
  document.getElementById('edit-id').value = item.id;
  selecionarTipoRegistroUI(item.tipo);
  document.getElementById('data_inicio').value = item.data_inicio;
  document.getElementById('data_fim').value = item.data_fim;
  document.getElementById('observacao').value = item.observacao || '';
  document.getElementById('form-titulo').innerText = 'Editar registro';
  document.getElementById('btn-salvar').innerText = 'Atualizar';
  document.getElementById('modal-registro').classList.add('is-open');
}

export function fecharModalRegistroUI(embarcacaoPadrao = '') {
  document.getElementById('modal-registro').classList.remove('is-open');
  resetarModalRegistroUI(embarcacaoPadrao);
}

export function resetarModalRegistroUI(embarcacaoPadrao = '') {
  const form = document.getElementById('escala-form');
  if (form) form.reset();
  document.getElementById('edit-id').value = '';
  selecionarTipoRegistroUI('Porto');
  document.getElementById('form-titulo').innerText = 'Novo registro';
  document.getElementById('btn-salvar').innerText = 'Salvar registro';
  const obsInput = document.getElementById('observacao');
  if (obsInput) {
    obsInput.placeholder = embarcacaoPadrao ? `${embarcacaoPadrao} · Barcarena, etc.` : 'Barcarena, comboio, etc.';
  }
}
