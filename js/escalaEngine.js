import { APP_CONFIG, PATENTES_BORDO } from './config.js';

const MS_POR_DIA = 1000 * 60 * 60 * 24;

export function parseISODateLocal(isoStr) {
  if (!isoStr || typeof isoStr !== 'string') return new Date();
  const partes = isoStr.split('-').map(Number);
  if (partes.length !== 3 || partes.some(Number.isNaN)) return new Date();
  return new Date(partes[0], partes[1] - 1, partes[2]);
}

export function formatISODateLocal(dateObj) {
  const ano = dateObj.getFullYear();
  const mes = String(dateObj.getMonth() + 1).padStart(2, '0');
  const dia = String(dateObj.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

export function obterHojeISO(dataRef = new Date()) {
  return formatISODateLocal(dataRef);
}

export function formatarDataBR(isoStr) {
  if (!isoStr || typeof isoStr !== 'string') return '—';
  const partes = isoStr.split('-');
  if (partes.length !== 3) return isoStr;
  return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

export function subtrairUmDiaISO(isoStr) {
  const d = parseISODateLocal(isoStr);
  d.setDate(d.getDate() - 1);
  return formatISODateLocal(d);
}

export function calcularDias(inicio, fim) {
  if (!inicio || !fim) return 0;
  const d1 = parseISODateLocal(inicio);
  const d2 = parseISODateLocal(fim);
  const diffDays = Math.round((d2 - d1) / MS_POR_DIA) + 1;
  return diffDays > 0 ? diffDays : 0;
}

export function diasEntreDatas(origemIso, destinoIso) {
  const d1 = parseISODateLocal(origemIso);
  const d2 = parseISODateLocal(destinoIso);
  return Math.round((d2 - d1) / MS_POR_DIA);
}

export function formatarContagemDias(dias) {
  if (dias === null || dias === undefined || Number.isNaN(dias)) return '';
  if (dias <= 0) return 'Hoje';
  if (dias === 1) return 'Falta 1 dia';
  return `Faltam ${dias} dias`;
}

export function normalizarRegraEscala(perfil = null) {
  const { diasTrabalho, diasFolga, minDias, maxDias } = APP_CONFIG.escalaPadrao;
  const brutoTrab = parseInt(perfil?.dias_trabalho, 10);
  const brutoFolg = parseInt(perfil?.dias_folga, 10);

  const diasTrab = Number.isFinite(brutoTrab)
    ? Math.min(maxDias, Math.max(minDias, brutoTrab))
    : diasTrabalho;

  const diasFolg = Number.isFinite(brutoFolg)
    ? Math.min(maxDias, Math.max(minDias, brutoFolg))
    : diasFolga;

  return {
    diasTrab,
    diasFolg,
    proporcao: diasFolg / diasTrab
  };
}

export function normalizarCodigoPosto(codigo) {
  if (codigo === 'MMA') return 'MAM';
  if (codigo === 'MAF') return 'MAC';
  return codigo || '';
}

export function obterPostoInfo(codigoPosto, patentes = PATENTES_BORDO) {
  const normalizado = normalizarCodigoPosto(codigoPosto);
  if (!normalizado) return null;
  return patentes[normalizado] || null;
}

export function calcularMetricasFolga(registros = [], regraEscala = normalizarRegraEscala()) {
  let diasTrabalhados = 0;
  let diasFolgaGozada = 0;

  for (const item of registros) {
    const duracao = Number.isFinite(Number(item.dias_totais)) && Number(item.dias_totais) > 0
      ? Number(item.dias_totais)
      : calcularDias(item.data_inicio, item.data_fim);

    if (item.tipo === 'Embarque' || item.tipo === 'Porto') {
      diasTrabalhados += duracao;
    } else if (item.tipo === 'Folga') {
      diasFolgaGozada += duracao;
    }
    // Atestado não entra nem em diasTrabalhados nem em diasFolgaGozada
  }

  const folgasGeradas = Math.floor(diasTrabalhados * regraEscala.proporcao);
  const saldo = folgasGeradas - diasFolgaGozada;

  return {
    diasTrabalhados,
    folgasGeradas,
    folgasGozadas: diasFolgaGozada,
    saldo
  };
}

function ehDiaApenasAtestado(mapaReal, isoDate) {
  const lista = mapaReal.get(isoDate);
  if (!lista || lista.length === 0) return false;
  return lista.every((item) => item.tipo === 'Atestado');
}

function pegarTipoOperacionalDoDia(mapaReal, isoDate) {
  const lista = mapaReal.get(isoDate);
  if (!lista || lista.length === 0) return null;
  const operacional = lista.find((item) => item.tipo !== 'Atestado');
  return operacional ? operacional.tipo : null;
}

export function gerarMapaCalendarioEPrevisao({
  registros = [],
  regraEscala = normalizarRegraEscala(),
  hojeIso = obterHojeISO(),
  avisoDispensadoData = null,
  continuaTrabalhandoHoje = null
} = {}) {
  const mapa = new Map();
  const mapaReal = new Map();
  const { diasTrab, diasFolg } = regraEscala;

  const ordenados = [...registros].sort((a, b) => {
    if (a.data_inicio !== b.data_inicio) return a.data_inicio.localeCompare(b.data_inicio);
    return (a.id || 0) - (b.id || 0);
  });

  let ultimaDataReal = null;

  for (const reg of ordenados) {
    const cur = parseISODateLocal(reg.data_inicio);
    const fim = parseISODateLocal(reg.data_fim);

    while (cur <= fim) {
      const iso = formatISODateLocal(cur);
      if (!mapaReal.has(iso)) mapaReal.set(iso, []);
      mapaReal.get(iso).push(reg);

      if (!mapa.has(iso) || reg.tipo !== 'Atestado') {
        mapa.set(iso, { tipo: reg.tipo, real: true, registro: reg });
      }

      if (!ultimaDataReal || iso > ultimaDataReal) {
        ultimaDataReal = iso;
      }
      cur.setDate(cur.getDate() + 1);
    }
  }

  let previsaoInicioFolga = null;
  let previsaoFimFolga = null;
  let retornoAoTrabalho = null;

  if (ultimaDataReal) {
    let tipoUltimo = pegarTipoOperacionalDoDia(mapaReal, ultimaDataReal);

    if (!tipoUltimo) {
      const cursorBusca = parseISODateLocal(ultimaDataReal);
      for (let i = 0; i < 365; i++) {
        cursorBusca.setDate(cursorBusca.getDate() - 1);
        const tipoBusca = pegarTipoOperacionalDoDia(mapaReal, formatISODateLocal(cursorBusca));
        if (tipoBusca) {
          tipoUltimo = tipoBusca;
          break;
        }
      }
    }

    if (tipoUltimo === 'Folga') {
      let diasFolgaJaCumpridos = 0;
      const cursor = parseISODateLocal(ultimaDataReal);

      while (true) {
        const iso = formatISODateLocal(cursor);
        if (ehDiaApenasAtestado(mapaReal, iso)) {
          cursor.setDate(cursor.getDate() - 1);
          continue;
        }
        if (pegarTipoOperacionalDoDia(mapaReal, iso) === 'Folga') {
          diasFolgaJaCumpridos++;
          cursor.setDate(cursor.getDate() - 1);
        } else {
          break;
        }
      }

      const proxCursor = parseISODateLocal(ultimaDataReal);
      proxCursor.setDate(proxCursor.getDate() + 1);

      const restanteFolga = Math.max(0, diasFolg - diasFolgaJaCumpridos);
      if (restanteFolga > 0) {
        previsaoInicioFolga = formatISODateLocal(proxCursor);
      }

      for (let i = 0; i < restanteFolga; i++) {
        const iso = formatISODateLocal(proxCursor);
        if (!mapa.has(iso)) mapa.set(iso, { tipo: 'PrevFolga', real: false });
        previsaoFimFolga = iso;
        proxCursor.setDate(proxCursor.getDate() + 1);
      }

      retornoAoTrabalho = formatISODateLocal(proxCursor);

      for (let j = 0; j < diasTrab; j++) {
        const iso = formatISODateLocal(proxCursor);
        if (!mapa.has(iso)) mapa.set(iso, { tipo: 'PrevTrabalho', real: false });
        proxCursor.setDate(proxCursor.getDate() + 1);
      }

      if (!previsaoInicioFolga) {
        previsaoInicioFolga = formatISODateLocal(proxCursor);
      }
      for (let k = 0; k < diasFolg; k++) {
        const iso = formatISODateLocal(proxCursor);
        if (!mapa.has(iso)) mapa.set(iso, { tipo: 'PrevFolga', real: false });
        if (!previsaoFimFolga || restanteFolga === 0) {
          previsaoFimFolga = iso;
        }
        proxCursor.setDate(proxCursor.getDate() + 1);
      }
    } else if (tipoUltimo) {
      let diasOperacaoJaCumpridos = 0;
      const cursor = parseISODateLocal(ultimaDataReal);

      while (true) {
        const iso = formatISODateLocal(cursor);
        if (ehDiaApenasAtestado(mapaReal, iso)) {
          cursor.setDate(cursor.getDate() - 1);
          continue;
        }
        const t = pegarTipoOperacionalDoDia(mapaReal, iso);
        if (t && t !== 'Folga') {
          diasOperacaoJaCumpridos++;
          cursor.setDate(cursor.getDate() - 1);
        } else {
          break;
        }
      }

      const ultimoRegistro = [...ordenados].reverse().find((r) => r.tipo === 'Embarque' || r.tipo === 'Porto');
      if (ultimoRegistro && ultimoRegistro.tipo === 'Embarque') {
        const inicioEmb = parseISODateLocal(ultimoRegistro.data_inicio);
        const fimOuUltima = parseISODateLocal(
          ultimoRegistro.data_fim > ultimaDataReal ? ultimoRegistro.data_fim : ultimaDataReal
        );
        let diasDesdeEmbarque = 0;
        const cEmb = new Date(inicioEmb);
        while (cEmb <= fimOuUltima) {
          const isoEmb = formatISODateLocal(cEmb);
          if (!ehDiaApenasAtestado(mapaReal, isoEmb)) {
            diasDesdeEmbarque++;
          }
          cEmb.setDate(cEmb.getDate() + 1);
        }
        if (diasDesdeEmbarque > 0) {
          diasOperacaoJaCumpridos = Math.min(diasOperacaoJaCumpridos, diasDesdeEmbarque);
        }
      }

      const diasBaseAteFolga = Math.max(diasTrab, diasOperacaoJaCumpridos);
      const proxCursor = parseISODateLocal(ultimaDataReal);
      proxCursor.setDate(proxCursor.getDate() + 1);

      const restanteTrabalho = Math.max(0, diasBaseAteFolga - diasOperacaoJaCumpridos);
      for (let i = 0; i < restanteTrabalho; i++) {
        const iso = formatISODateLocal(proxCursor);
        if (!mapa.has(iso)) mapa.set(iso, { tipo: 'PrevTrabalho', real: false });
        proxCursor.setDate(proxCursor.getDate() + 1);
      }

      while (formatISODateLocal(proxCursor) < hojeIso) {
        const iso = formatISODateLocal(proxCursor);
        if (!mapa.has(iso)) mapa.set(iso, { tipo: 'PrevTrabalho', real: false });
        proxCursor.setDate(proxCursor.getDate() + 1);
      }

      previsaoInicioFolga = formatISODateLocal(proxCursor);
      for (let j = 0; j < diasFolg; j++) {
        const iso = formatISODateLocal(proxCursor);
        if (!mapa.has(iso)) mapa.set(iso, { tipo: 'PrevFolga', real: false });
        previsaoFimFolga = iso;
        proxCursor.setDate(proxCursor.getDate() + 1);
      }

      retornoAoTrabalho = formatISODateLocal(proxCursor);
    }
  }

  const tipoOperacionalRef = ultimaDataReal
    ? (pegarTipoOperacionalDoDia(mapaReal, ultimaDataReal) || 'Embarque')
    : 'Embarque';

  const tipoHoje = pegarTipoOperacionalDoDia(mapaReal, hojeIso);
  const hojeTemTrabalhoReal = Boolean(tipoHoje && tipoHoje !== 'Folga');

  const assumindoTrabalhoAteHoje =
    (continuaTrabalhandoHoje === hojeIso || hojeTemTrabalhoReal) &&
    !registros.some((r) => r.tipo === 'Folga' && r.data_inicio <= hojeIso && r.data_fim >= hojeIso);

  if (assumindoTrabalhoAteHoje && tipoOperacionalRef !== 'Folga') {
    const cursorTrab = ultimaDataReal ? parseISODateLocal(ultimaDataReal) : parseISODateLocal(hojeIso);
    if (ultimaDataReal) cursorTrab.setDate(cursorTrab.getDate() + 1);
    const hojeDate = parseISODateLocal(hojeIso);

    while (cursorTrab <= hojeDate) {
      const isoT = formatISODateLocal(cursorTrab);
      const temFolgaNoDia = mapaReal.get(isoT)?.some((r) => r.tipo === 'Folga');
      if (!temFolgaNoDia) {
        const jaTemReal = mapa.has(isoT) && mapa.get(isoT).real;
        if (!jaTemReal) {
          mapa.set(isoT, { tipo: tipoOperacionalRef, real: true, registro: null });
        }
      }
      cursorTrab.setDate(cursorTrab.getDate() + 1);
    }

    const amanhaDate = parseISODateLocal(hojeIso);
    amanhaDate.setDate(amanhaDate.getDate() + 1);
    const amanhaIso = formatISODateLocal(amanhaDate);

    for (const [chave, val] of mapa.entries()) {
      if (!val.real && chave >= amanhaIso) {
        mapa.delete(chave);
      }
    }

    previsaoInicioFolga = amanhaIso;
    const folgaCursor = new Date(amanhaDate);
    for (let f = 0; f < diasFolg; f++) {
      const isoF = formatISODateLocal(folgaCursor);
      const temRegistroRealF = mapa.has(isoF) && mapa.get(isoF).real;
      if (!temRegistroRealF) {
        mapa.set(isoF, { tipo: 'PrevFolga', real: false });
      }
      previsaoFimFolga = isoF;
      folgaCursor.setDate(folgaCursor.getDate() + 1);
    }
    retornoAoTrabalho = formatISODateLocal(folgaCursor);
  }

  for (const [isoKey, listaRegs] of mapaReal.entries()) {
    const regAtestado = listaRegs.find((r) => r.tipo === 'Atestado');
    if (regAtestado) {
      const atual = mapa.get(isoKey);
      const obsAtestado = regAtestado.observacao || '';
      const outrosTipos = listaRegs.filter((r) => r.tipo !== 'Atestado').map((r) => r.tipo);

      if (outrosTipos.length === 0) {
        mapa.set(isoKey, {
          tipo: 'Atestado',
          real: true,
          registro: regAtestado,
          observacao: obsAtestado
        });
      } else {
        const baseObs = atual?.registro?.observacao || '';
        mapa.set(isoKey, {
          ...(atual || { tipo: outrosTipos[0], real: true, registro: regAtestado }),
          temAtestado: true,
          observacao: [baseObs, obsAtestado ? `Atestado: ${obsAtestado}` : 'Atestado']
            .filter(Boolean)
            .join(' · ')
        });
      }
    }
  }

  const mapaDias = {};
  for (const [isoKey, valor] of mapa.entries()) {
    mapaDias[isoKey] = {
      tipo: valor.tipo,
      observacao: valor.observacao !== undefined ? valor.observacao : (valor.registro?.observacao || ''),
      real: Boolean(valor.real),
      temAtestado: Boolean(valor.temAtestado || valor.tipo === 'Atestado'),
      registro: valor.registro || null
    };
  }

  const temFolgaHoje = registros.some(
    (r) => r.tipo === 'Folga' && r.data_inicio <= hojeIso && r.data_fim >= hojeIso
  );

  const chegouOuPassouPrevisao = Boolean(
    !temFolgaHoje &&
    previsaoInicioFolga &&
    previsaoInicioFolga <= hojeIso &&
    avisoDispensadoData !== hojeIso
  );

  const diasParaFolga = previsaoInicioFolga ? diasEntreDatas(hojeIso, previsaoInicioFolga) : null;
  const diasParaRetorno = retornoAoTrabalho ? diasEntreDatas(hojeIso, retornoAoTrabalho) : null;

  return {
    mapaDias,
    previsao: {
      temHistorico: Boolean(ultimaDataReal),
      inicioProximaFolga: previsaoInicioFolga,
      fimProximaFolga: previsaoFimFolga,
      retornoAoTrabalho,
      diasParaFolga,
      diasParaRetorno,
      temFolgaHoje,
      chegouOuPassouPrevisao
    }
  };
}
